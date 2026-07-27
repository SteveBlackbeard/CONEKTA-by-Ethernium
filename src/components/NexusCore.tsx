"use client";
import React, { useRef, useMemo, useState, useCallback, useEffect, useDeferredValue } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { buildStaticGraph, buildProjectNodes, GraphNode, GraphEdge, LinkedSystem, NodeCluster, GRAPH_CLUSTER_CONFIG, GraphNodeAssetOverride } from '@/lib/graphData';
import { getNodeAssetProfile, getSentinelAssetProfile, NodeAssetFamilyOverrides, NodeAssetStage } from '@/lib/nodeAssets';
import { Language, translations, translateActiveCommand, translateModeLabel, translateReason, tt } from '@/lib/i18n';
import { ChainEventSnapshot, ChainStatusSnapshot, deriveDashboardSignals, PhysicsSnapshot } from '@/lib/telemetry';
import { readHandleBackedFile, removeLinkedSystemHandle } from '@/lib/filesystemHandles';
import { getErrorMessage } from '@/lib/errors';
import { WaveMonitor } from './nexus/WaveMonitor';
import { SentinelDrone } from './nexus/SentinelDrone';
import { ConnectionBeam } from './nexus/beams';
import { SystemNode } from './nexus/SystemNode';
import { SceneErrorBoundary } from './nexus/errorBoundaries';
import { countQueryMatches, DecryptionHandshake, inferDocumentFormat, renderDocumentSurface } from './nexus/documentSurface';
import { AggregateClusterBadge, CanvasBackgroundSync, DotsBackdrop, SceneRig, ZoomTierTracker } from './nexus/sceneHelpers';
import {
  getNodeCapabilities,
  getNodeSystem,
  inferMotionProfile,
  inferAggregateCluster,
  mergeGraphNodeAssetOverride,
  NodeActivityState,
  resolveLinkedSystemId,
  shouldRenderNodeForZoomTier,
} from './nexus/nodeUtils';
import {
  AggregateBadge,
  AssetStageSlot,
  CameraMode,
  ChatMessage,
  EDIT_MODE_SECRET_CODES,
  EditModeSessionBaseline,
  NodeAssetEditState,
  OpenDocState,
  OrbitControlsRef,
  PendingAssetTarget,
  QualityTier,
  ZoomTier,
} from './nexus/types';

const { MOUSE } = THREE;

const NexusCore = ({
  linkedSystems,
  activeLinkedSystemId,
  language,
  setLinkedSystems,
  setActiveLinkedSystemId,
  physics: externalPhysics,
  drift: externalDrift,
  merkle: externalMerkle,
  chainEvents,
  chainStatus,
  activeCommand,
  stateLatencyMs = null,
  runtimeAvailable = false,
}: NexusCoreProps) => {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Sibling components (SovereignHUD) mount after this one, so their
    // listeners are not registered yet when this effect runs. Defer the
    // announcement one tick and persist a flag for late subscribers.
    const timer = setTimeout(() => {
      (window as Window & { __NEXUS_CORE_READY?: boolean }).__NEXUS_CORE_READY = true;
      window.dispatchEvent(new Event('NEXUS_CORE_READY'));
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<OpenDocState | null>(null);
  const [unlinkModal, setUnlinkModal] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<{ msg: string; detail?: string } | null>(null);
  const [qualityTier, setQualityTier] = useState<QualityTier>('ultra');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [audioArmed, setAudioArmed] = useState(false);
  const [cameraMode, setCameraMode] = useState<CameraMode>('overview');
  const [zoomTier, setZoomTier] = useState<ZoomTier>('cluster');
  const [cameraZoom, setCameraZoom] = useState(30);
  const [docQuery, setDocQuery] = useState('');
  const [isRightRailOpen, setIsRightRailOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { id: 'chat-system', role: 'system', content: 'SENESCHAL READY // "ayuda" PARA COMANDOS LOCALES // FRUGAL BRIDGE STANDBY' },
  ]);
  const [chatPrompt, setChatPrompt] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [nodeAssetOverrides, setNodeAssetOverrides] = useState<Record<string, GraphNodeAssetOverride>>({});
  const [nodeAssetDrafts, setNodeAssetDrafts] = useState<Record<string, GraphNodeAssetOverride>>({});
  const [familyAssetOverrides, setFamilyAssetOverrides] = useState<NodeAssetFamilyOverrides>({});
  const [canonicalChecked, setCanonicalChecked] = useState(false);
  const [editModeSessionBaseline, setEditModeSessionBaseline] = useState<EditModeSessionBaseline | null>(null);
  const [pendingAssetTarget, setPendingAssetTarget] = useState<PendingAssetTarget | null>(null);
  const [assetEditState, setAssetEditState] = useState<NodeAssetEditState>({ enabled: false });
  const [editModeAuthorized, setEditModeAuthorized] = useState(false);
  const [editModePromptOpen, setEditModePromptOpen] = useState(false);
  const [editModePassword, setEditModePassword] = useState('');
  const [selectedSentinelIndex, setSelectedSentinelIndex] = useState<number | null>(null);
  const [sentinelAssetDraft, setSentinelAssetDraft] = useState<Partial<NodeAssetStage> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const controlsRef = useRef<OrbitControlsRef | null>(null);
  const assetFileInputRef = useRef<HTMLInputElement>(null);
  const previousModeRef = useRef<string>('');
  const previousCommandRef = useRef<string | null>(null);
  const previousChainIntactRef = useRef<boolean | null>(null);
  
  // Authority: Use props from page.tsx
  const physics = useMemo(
    () => externalPhysics || { H: 0, H_max: 0, eta: 0, N: 0, W: 0, gini: 0 },
    [externalPhysics],
  );
  const drift = typeof externalDrift === 'number' ? externalDrift : 0;
  const merkle = externalMerkle || '00000000000000000000000000000000';
  const t = translations[language] || translations['EN'];
  const primaryLinkedSystem = linkedSystems.find((system) => system.id === activeLinkedSystemId) || linkedSystems[0] || null;
  const [logs, setLogs] = useState<{ id: number; msg: string }[]>([]);
  const [displayNode, setDisplayNode] = useState<GraphNode | null>(null);
  const deferredDocQuery = useDeferredValue(docQuery);
  const sessionStart = useMemo(() => Date.now(), []);
  const signals = useMemo(() => deriveDashboardSignals({
    state: {
      merkle_root: merkle,
      drift_kl: drift,
      physics,
      available: runtimeAvailable,
    },
    chainEvents,
    chainStatus,
    activeAction: activeCommand,
    linkedProject: primaryLinkedSystem?.name || null,
    linkedProjectCount: linkedSystems.length,
    liveLogs: logs,
  }), [activeCommand, chainEvents, chainStatus, drift, linkedSystems.length, logs, merkle, physics, primaryLinkedSystem?.name, runtimeAvailable]);
  const normalizedEta = Math.max(0, Math.min(1, physics.eta || 0));
  const modeLabelText = translateModeLabel(signals.modeLabel, t);
  const modeReasonText = translateReason(signals.modeReason, t);
  const activeVectorText = translateActiveCommand(activeCommand, t);
  const healthLabel = runtimeAvailable ? 'FRUGAL ONLINE' : 'FRUGAL UNAVAILABLE';
  const healthColor = runtimeAvailable && normalizedEta >= 0.75
    ? signals.palette.emphasis
    : runtimeAvailable && normalizedEta >= 0.50
    ? signals.palette.secondary
    : signals.palette.warning;
  const syncLevel = runtimeAvailable ? normalizedEta * 100 : 0;
  const fluxColor = !runtimeAvailable
    ? signals.palette.warning
    : drift > 0.1
    ? signals.palette.accent
    : drift > 0.03
    ? signals.palette.secondary
    : signals.palette.warning;
  const fluxBorder = signals.palette.border;
  const fluxBackground = signals.palette.panelSoft;

  const [viewportWidth, setViewportWidth] = useState(1440);
  const isTablet = viewportWidth < 1180;
  const isPhone = viewportWidth < 780;
  const isTiny = viewportWidth < 420;
  const railRight = isTiny ? 10 : isPhone ? 12 : isTablet ? 24 : 72;
  const titleTelemetryWidth = isTiny ? 'min(188px, calc(100vw - 24px))' : isPhone ? 'min(216px, calc(100vw - 26px))' : isTablet ? '238px' : '282px';
  const overlayGlowText = { color: signals.palette.emphasis, textShadow: `0 0 18px ${signals.palette.secondary}3a` } as const;
  const overlaySoftText = { color: 'rgba(255,255,255,0.76)', textShadow: `0 0 12px ${signals.palette.secondary}22` } as const;
  const overlayFaintText = { color: 'rgba(255,255,255,0.64)', textShadow: `0 0 10px ${signals.palette.secondary}1c` } as const;
  const qualityProfile = useMemo(() => {
    if (qualityTier === 'safe') {
      return { particleCount: 280, particleSize: 0.045, rainCount: 0, fxScale: 0.42, dpr: [1, 1.05] as [number, number], autoRotateSpeed: 0.18, droneCount: 2, structuralStreamCount: 3, hoverStreamCount: 5 };
    }
    if (qualityTier === 'balanced') {
      return { particleCount: 520, particleSize: 0.042, rainCount: 36, fxScale: 0.66, dpr: [1, 1.2] as [number, number], autoRotateSpeed: 0.24, droneCount: 3, structuralStreamCount: 5, hoverStreamCount: 8 };
    }
    return { particleCount: 860, particleSize: 0.038, rainCount: 72, fxScale: 0.82, dpr: [1, 1.35] as [number, number], autoRotateSpeed: 0.28, droneCount: 5, structuralStreamCount: 7, hoverStreamCount: 11 };
  }, [qualityTier]);
  useEffect(() => {
    setDocQuery('');
  }, [openDoc?.filePath]);

  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth);
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const assessQuality = () => {
      const nav = window.navigator as Navigator & { deviceMemory?: number };
      const memory = Number(nav.deviceMemory || 8);
      const cores = Number(nav.hardwareConcurrency || 8);
      const prefersReduced = media.matches;
      setReducedMotion(prefersReduced);

      if (prefersReduced || viewportWidth < 720 || memory <= 4 || cores <= 4) {
        setQualityTier('safe');
      } else if (viewportWidth < 1280 || memory <= 8 || cores <= 8) {
        setQualityTier('balanced');
      } else {
        setQualityTier('ultra');
      }
    };

    assessQuality();

    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', assessQuality);
      return () => media.removeEventListener('change', assessQuality);
    }

    media.addListener(assessQuality);
    return () => media.removeListener(assessQuality);
  }, [viewportWidth]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const detach = () => {
      window.removeEventListener('pointerdown', armAudio);
      window.removeEventListener('keydown', armAudio);
    };

    async function armAudio() {
      if (audioContextRef.current) {
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume().catch(() => {});
        }
        const running = audioContextRef.current.state === 'running';
        setAudioArmed(running);
        if (running) detach();
        return;
      }

      const AudioCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) {
        detach();
        return;
      }

      try {
        const ctx = new AudioCtor();
        audioContextRef.current = ctx;
        await ctx.resume().catch(() => {});
        const running = ctx.state === 'running';
        setAudioArmed(running);
        if (running) detach();
      } catch {
        setAudioArmed(false);
      }
    }

    window.addEventListener('pointerdown', armAudio);
    window.addEventListener('keydown', armAudio);

    return detach;
  }, []);

  useEffect(() => {
    return () => {
      audioContextRef.current?.close().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const ctx = audioContextRef.current;
    if (!audioArmed || !ctx || ctx.state !== 'running') return;

    const playCue = (frequencies: number[], duration = 0.12, type: OscillatorType = 'sine', gainLevel = 0.018) => {
      const now = ctx.currentTime;
      frequencies.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, now + index * 0.045);
        gain.gain.setValueAtTime(0.0001, now + index * 0.045);
        gain.gain.exponentialRampToValueAtTime(gainLevel, now + index * 0.045 + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.045 + duration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + index * 0.045);
        osc.stop(now + index * 0.045 + duration + 0.03);
      });
    };

    if (previousModeRef.current && previousModeRef.current !== signals.mode) {
      if (signals.mode === 'AUDIT') playCue([520, 660, 780], 0.11, 'triangle', 0.014);
      if (signals.mode === 'SEAL') playCue([392, 523, 784], 0.14, 'sine', 0.016);
      if (signals.mode === 'INCIDENT') playCue([196, 156, 116], 0.16, 'sawtooth', 0.02);
      if (signals.mode === 'STABLE') playCue([440, 660], 0.1, 'triangle', 0.012);
    }

    if (activeCommand && previousCommandRef.current !== activeCommand) {
      playCue([420, 540], 0.08, 'triangle', 0.012);
    }

    if (chainStatus && previousChainIntactRef.current !== chainStatus.intact) {
      if (chainStatus.intact) playCue([660, 880], 0.09, 'sine', 0.013);
      else playCue([170, 138, 110], 0.18, 'square', 0.02);
    }

    previousModeRef.current = signals.mode;
    previousCommandRef.current = activeCommand;
    previousChainIntactRef.current = chainStatus?.intact ?? null;
  }, [activeCommand, audioArmed, chainStatus, signals.mode]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/node-assets')
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        if (payload?.success && payload.overrides) {
          setNodeAssetOverrides(payload.overrides);
          setFamilyAssetOverrides(payload.familyProfiles || {});
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (canonicalChecked) return;
    setCanonicalChecked(true);
    void fetch('/api/node-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'process-canonical-assets' }),
    })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success) {
          if (payload.overrides) setNodeAssetOverrides(payload.overrides);
          if (payload.familyProfiles) setFamilyAssetOverrides(payload.familyProfiles);
        }
      })
      .catch(() => {});
  }, [canonicalChecked]);


  const { staticNodes, staticEdges, dynamicNodes, dynamicEdges } = useMemo(() => {
    const { nodes: sn, edges: se } = buildStaticGraph(language, linkedSystems.length);
    const dn: GraphNode[] = [];
    const de: GraphEdge[] = [];
    linkedSystems.forEach((system, index) => {
      const result = buildProjectNodes(system, language, index, linkedSystems.length);
      dn.push(...result.nodes);
      de.push(...result.edges);
    });
    return { staticNodes: sn, staticEdges: se, dynamicNodes: dn, dynamicEdges: de };
  }, [language, linkedSystems]);

  const allNodes = useMemo(
    () =>
      [...staticNodes, ...dynamicNodes].map((node) => {
        const systemId = node.systemId ?? resolveLinkedSystemId(node.id, linkedSystems);
        return {
          ...node,
          systemId,
          motionProfile: inferMotionProfile(node),
          assetOverride: mergeGraphNodeAssetOverride(nodeAssetOverrides[node.id], nodeAssetDrafts[node.id]),
        };
      }),
    [dynamicNodes, linkedSystems, nodeAssetDrafts, nodeAssetOverrides, staticNodes],
  );
  const allEdges = useMemo(() => [...staticEdges, ...dynamicEdges], [staticEdges, dynamicEdges]);
  const nodesById = useMemo(() => new Map(allNodes.map((node) => [node.id, node])), [allNodes]);
  const selectedNode = useMemo(() => allNodes.find((node) => node.id === selectedNodeId) || null, [allNodes, selectedNodeId]);
  const sentinelInspectorNode = useMemo<GraphNode | null>(() => {
    if (selectedSentinelIndex === null) return null;
    return {
      id: `sentinel-${selectedSentinelIndex}`,
      label: `SENTINEL-${selectedSentinelIndex + 1}`,
      position: [0, 0, 0],
      type: 'module',
      shape: 'tetrahedron',
      size: 0.32,
      parentId: null,
      tooltip: 'Autonomous sentinel patrol.',
      color: signals.palette.secondary,
      cluster: 'system',
      orbitLevel: 0,
      importance: 'secondary',
      systemId: null,
      motionProfile: 'sentinel-linked',
    };
  }, [selectedSentinelIndex, signals.palette.secondary]);
  const coreNode = useMemo(() => nodesById.get('core') || null, [nodesById]);
  const getNodeActivityState = useCallback((node: GraphNode): NodeActivityState => {
    if (!primaryLinkedSystem || linkedSystems.length <= 1) return 'neutral';
    const nodeSystemId = resolveLinkedSystemId(node.id, linkedSystems);
    if (!nodeSystemId) return 'neutral';
    return nodeSystemId === primaryLinkedSystem.id ? 'active' : 'muted';
  }, [linkedSystems, primaryLinkedSystem]);
  const highlightedNodeIds = useMemo(() => {
    const next = new Set<string>();
    if (hoveredNode?.id) next.add(hoveredNode.id);
    if (selectedNode?.id) next.add(selectedNode.id);
    return next;
  }, [hoveredNode?.id, selectedNode?.id]);
  const visibleNodes = useMemo(
    () => allNodes.filter((node) => shouldRenderNodeForZoomTier(node, zoomTier, highlightedNodeIds)),
    [allNodes, highlightedNodeIds, zoomTier],
  );
  const sceneBounds = useMemo(() => {
    if (!allNodes.length) {
      return { minX: -12, maxX: 12, minZ: -12, maxZ: 12 };
    }
    return allNodes.reduce((acc, node) => ({
      minX: Math.min(acc.minX, node.position[0]),
      maxX: Math.max(acc.maxX, node.position[0]),
      minZ: Math.min(acc.minZ, node.position[2]),
      maxZ: Math.max(acc.maxZ, node.position[2]),
    }), {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    });
  }, [allNodes]);

  const imperiumOrbit = useMemo(() => {
    const centerX = (sceneBounds.minX + sceneBounds.maxX) / 2;
    const centerZ = (sceneBounds.minZ + sceneBounds.maxZ) / 2;
    const extentX = Math.max(4, (sceneBounds.maxX - sceneBounds.minX) / 2);
    const extentZ = Math.max(4, (sceneBounds.maxZ - sceneBounds.minZ) / 2);
    const radius = Math.max(extentX, extentZ) + 6.5;
    return { center: [centerX, 0, centerZ] as [number, number, number], radius };
  }, [sceneBounds]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(
    () => allEdges.filter((edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to)),
    [allEdges, visibleNodeIds],
  );
  const selectedNodeAssetProfile = useMemo(
    () => (selectedNode ? getNodeAssetProfile(selectedNode, familyAssetOverrides) : null),
    [familyAssetOverrides, selectedNode],
  );
  const selectedAssetStage = useMemo(() => selectedNodeAssetProfile?.appearance || null, [selectedNodeAssetProfile]);
  const selectedAssetStageTransform = useMemo(() => ({
    offset: selectedAssetStage?.offset || [0, 0, 0] as [number, number, number],
    rotation: selectedAssetStage?.rotation || [0, 0, 0] as [number, number, number],
    scale: selectedAssetStage?.scale ?? 1,
  }), [selectedAssetStage]);
  const sentinelEditProfile = useMemo(() => getSentinelAssetProfile(familyAssetOverrides), [familyAssetOverrides]);
  const sentinelAppearanceStage = useMemo<NodeAssetStage>(
    () => ({
      ...sentinelEditProfile.appearance,
      ...(sentinelAssetDraft || {}),
      rotation: (sentinelAssetDraft?.rotation || sentinelEditProfile.appearance.rotation || [0, 0, 0]) as [number, number, number],
      offset: (sentinelAssetDraft?.offset || sentinelEditProfile.appearance.offset || [0, 0, 0]) as [number, number, number],
      scale: sentinelAssetDraft?.scale ?? sentinelEditProfile.appearance.scale ?? 1,
    }),
    [sentinelAssetDraft, sentinelEditProfile.appearance],
  );
  const effectiveNodeAssetOverrides = useMemo(
    () =>
      Object.fromEntries(
        Object.keys({ ...nodeAssetOverrides, ...nodeAssetDrafts }).map((nodeId) => [
          nodeId,
          mergeGraphNodeAssetOverride(nodeAssetOverrides[nodeId], nodeAssetDrafts[nodeId]),
        ]).filter((entry): entry is [string, GraphNodeAssetOverride] => Boolean(entry[1])),
      ),
    [nodeAssetDrafts, nodeAssetOverrides],
  );
  const effectiveFamilyAssetOverrides = useMemo<NodeAssetFamilyOverrides>(() => {
    if (!sentinelAssetDraft) return familyAssetOverrides;
    const baseAppearance = familyAssetOverrides.sentinel?.appearance;
    if (!baseAppearance?.src) return familyAssetOverrides;
    return {
      ...familyAssetOverrides,
      sentinel: {
        ...familyAssetOverrides.sentinel,
        appearance: {
          ...(baseAppearance || {}),
          ...sentinelAssetDraft,
          enabled: baseAppearance?.enabled ?? true,
          src: baseAppearance.src,
        },
      },
    };
  }, [familyAssetOverrides, sentinelAssetDraft]);
  const editSessionDirty = useMemo(() => {
    if (!assetEditState.enabled || !editModeSessionBaseline) return false;
    return JSON.stringify(effectiveNodeAssetOverrides) !== JSON.stringify(editModeSessionBaseline.overrides)
      || JSON.stringify(effectiveFamilyAssetOverrides) !== JSON.stringify(editModeSessionBaseline.familyProfiles);
  }, [assetEditState.enabled, editModeSessionBaseline, effectiveFamilyAssetOverrides, effectiveNodeAssetOverrides]);
  const aggregateBadges = useMemo<AggregateBadge[]>(() => {
    if (zoomTier === 'detail') return [];

    const groups = new Map<string, { parent: GraphNode; cluster: Exclude<NodeCluster, 'linked-root'>; count: number }>();

    const findVisibleAncestor = (node: GraphNode) => {
      let cursor = node.parentId;
      while (cursor) {
        if (visibleNodeIds.has(cursor)) {
          return nodesById.get(cursor) || null;
        }
        cursor = nodesById.get(cursor)?.parentId || null;
      }
      return null;
    };

    allNodes.forEach((node) => {
      if (visibleNodeIds.has(node.id)) return;
      if (node.type !== 'file' && node.type !== 'folder') return;

      const parent = findVisibleAncestor(node);
      if (!parent) return;

      const cluster = inferAggregateCluster(node);
      const key = `${parent.id}:${cluster}`;
      const existing = groups.get(key);
      if (existing) {
        existing.count += 1;
        return;
      }
      groups.set(key, { parent, cluster, count: 1 });
    });

    const parentBuckets = new Map<string, AggregateBadge[]>();
    groups.forEach(({ parent, cluster, count }, key) => {
      const siblings = parentBuckets.get(parent.id) || [];
      const parentSystemId = resolveLinkedSystemId(parent.id, linkedSystems);
      const active = !parentSystemId || !primaryLinkedSystem || parentSystemId === primaryLinkedSystem.id;
      siblings.push({
        id: `aggregate-${key}`,
        parentId: parent.id,
        label: GRAPH_CLUSTER_CONFIG[cluster].label,
        count,
        color: GRAPH_CLUSTER_CONFIG[cluster].color,
        cluster,
        position: [...parent.position] as [number, number, number],
        active,
      });
      parentBuckets.set(parent.id, siblings);
    });

    const badges: AggregateBadge[] = [];
    parentBuckets.forEach((siblings, parentId) => {
      const parent = nodesById.get(parentId);
      if (!parent) return;
      const radius = zoomTier === 'overview' ? 2.4 : 1.92;
      siblings.forEach((badge, index) => {
        const angle = (-Math.PI / 2) + (index / Math.max(siblings.length, 1)) * Math.PI * 2;
        badges.push({
          ...badge,
          position: [
            parent.position[0] + Math.cos(angle) * radius,
            parent.position[1] + 0.02,
            parent.position[2] + Math.sin(angle) * radius,
          ],
        });
      });
    });

    return badges;
  }, [allNodes, linkedSystems, nodesById, primaryLinkedSystem, visibleNodeIds, zoomTier]);

  useEffect(() => {
    if (hoveredNode) {
      setDisplayNode(hoveredNode);
      return;
    }
    if (selectedNode) {
      setDisplayNode(selectedNode);
    }
  }, [hoveredNode, selectedNode]);

  useEffect(() => {
    if (selectedNodeId && !allNodes.some((node) => node.id === selectedNodeId)) {
      setSelectedNodeId(null);
      setDisplayNode(null);
    }
  }, [allNodes, selectedNodeId]);

  useEffect(() => {
    const openLinkModal = () => setUnlinkModal('link');
    window.addEventListener('continuity:open-link-modal', openLinkModal);
    return () => window.removeEventListener('continuity:open-link-modal', openLinkModal);
  }, []);

  const getEdgeStreamProfile = useCallback((from: GraphNode, to: GraphNode) => {
    if (zoomTier === 'overview') {
      return { streamParticles: 0, chromaticParticles: false, emphasis: 0.3 };
    }
    const hovered = hoveredNode ? hoveredNode.id === from.id || hoveredNode.id === to.id : false;
    const nodeFamilies = [from.type, to.type];
    const structural = nodeFamilies.some((family) => family === 'core' || family === 'engine' || family === 'edition' || family === 'module');
    const linkedActivity = from.cluster === 'linked-root'
      || to.cluster === 'linked-root'
      || (((from.orbitLevel ?? 0) >= 2) && Boolean(from.cluster))
      || (((to.orbitLevel ?? 0) >= 2) && Boolean(to.cluster));

    if (hovered) {
      return { streamParticles: qualityProfile.hoverStreamCount, chromaticParticles: true, emphasis: 1.06 };
    }
    if (structural) {
      return { streamParticles: qualityProfile.structuralStreamCount, chromaticParticles: true, emphasis: from.type === 'core' || to.type === 'core' ? 0.92 : 0.78 };
    }
    if (linkedSystems.length > 0 && linkedActivity) {
      return { streamParticles: Math.max(3, qualityProfile.structuralStreamCount - 2), chromaticParticles: true, emphasis: 0.68 };
    }
    return { streamParticles: 0, chromaticParticles: false, emphasis: 0.58 };
  }, [hoveredNode, linkedSystems.length, qualityProfile.hoverStreamCount, qualityProfile.structuralStreamCount, zoomTier]);

  // Watch events still handled locally for now


  // Pulse Vivo: Live Forensic Watcher
  const runtimeWatchTargets = useMemo(
    () => linkedSystems
      .filter((system) => system.accessMode === 'runtime')
      .map((system) => ({ id: system.id, rootPath: system.rootPath, name: system.name })),
    [linkedSystems],
  );
  const runtimeWatchKey = useMemo(
    () => runtimeWatchTargets.map((system) => `${system.id}:${system.rootPath}`).join('|'),
    [runtimeWatchTargets],
  );
  const runtimeWatchTargetsRef = useRef(runtimeWatchTargets);
  runtimeWatchTargetsRef.current = runtimeWatchTargets;
  const dictionaryRef = useRef(t);
  dictionaryRef.current = t;

  React.useEffect(() => {
    const systemsToWatch = runtimeWatchTargetsRef.current;
    if (!systemsToWatch.length) return;

    const sources = systemsToWatch.map((system) => {
      const es = new EventSource(`/api/projects/watch?path=${encodeURIComponent(system.rootPath)}`);

      es.addEventListener('add', (e) => {
        try {
          const data = JSON.parse(e.data);
          setLinkedSystems((prev) => prev.map((entry) => {
            if (entry.id !== system.id) return entry;
            if (entry.entries.find((item) => item.name === data.name)) return entry;
            return { ...entry, entries: [...entry.entries, { name: data.name, type: data.type }] };
          }));
          setLogs(prev => [{ id: Date.now(), msg: `[${tt(dictionaryRef.current, 'watch.add', 'CREATED')}] ${system.name}/${data.name}` }, ...prev].slice(0, 5));
        } catch {}
      });

      es.addEventListener('unlink', (e) => {
        try {
          const data = JSON.parse(e.data);
          setLinkedSystems((prev) => prev.map((entry) => entry.id === system.id ? { ...entry, entries: entry.entries.filter((item) => item.name !== data.name) } : entry));
          setLogs(prev => [{ id: Date.now(), msg: `[${tt(dictionaryRef.current, 'watch.unlink', 'DELETED')}] ${system.name}/${data.name}` }, ...prev].slice(0, 5));
        } catch {}
      });

      return es;
    });

    return () => {
      sources.forEach((source) => source.close());
    };
  }, [runtimeWatchKey, setLinkedSystems]);


  const focusNode = useCallback((node: GraphNode | null) => {
    if (!node) return;
    setSelectedNodeId(node.id);
    setDisplayNode(node);
    const systemId = resolveLinkedSystemId(node.id, linkedSystems);
    if (systemId) {
      setActiveLinkedSystemId(systemId);
    }
    setCameraMode('focus');
  }, [linkedSystems, setActiveLinkedSystemId]);

  const resetView = useCallback(() => {
    setSelectedNodeId(null);
    setCameraMode('overview');
    const controls = controlsRef.current;
    const camera = controls?.object as THREE.OrthographicCamera | undefined;
    if (camera && 'zoom' in camera) {
      camera.zoom = signals.mode === 'INCIDENT' ? 26 : signals.mode === 'AUDIT' ? 28 : 30;
      camera.updateProjectionMatrix();
    }
    if (controls?.target) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [signals.mode]);

  useEffect(() => {
    const handleReset = () => resetView();
    const handleFocus = () => focusNode(coreNode);
    window.addEventListener('NEXUS_RESET_VIEW', handleReset);
    window.addEventListener('NEXUS_FOCUS_CORE', handleFocus);
    return () => {
      window.removeEventListener('NEXUS_RESET_VIEW', handleReset);
      window.removeEventListener('NEXUS_FOCUS_CORE', handleFocus);
    };
  }, [coreNode, focusNode, resetView]);

  const executeNodeAction = useCallback(async (node: GraphNode) => {
    if (!node.action) return;
    setToastMsg({ msg: tt(t, 'toast.executing', 'EXECUTING: {label}...', { label: node.label }) });
    try {
      const res = await fetch(node.action, { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.detail || payload?.error || `HTTP_${res.status}`);
      }
      setToastMsg({ msg: tt(t, 'toast.success', 'SUCCESS: {label} COMPLETED.', { label: node.label }) });
    } catch (error: unknown) {
      setToastMsg({
        msg: tt(t, 'toast.failure', 'FAILURE: {label} FAILED.', { label: node.label }),
        detail: getErrorMessage(error, 'ACTION_ERROR'),
      });
    }
    setTimeout(() => setToastMsg(null), 3000);
  }, [t]);

  const openNodeDocument = useCallback(async (node: GraphNode) => {
    if (!node.filePath) return;
    if (openDoc?.filePath === node.filePath) {
      setOpenDoc(null);
      return;
    }

    const linkedSystem = getNodeSystem(node, linkedSystems);
    if (linkedSystem?.accessMode === 'structural') {
      setToastMsg({
        msg: tt(t, 'toast.structural_only', 'STRUCTURAL_ONLY_LINK'),
        detail: tt(t, 'toast.structural_only.detail', 'DIRECT_FILESYSTEM_READ_REQUIRES_RUNTIME_OR_HANDLE_ACCESS'),
      });
      setTimeout(() => setToastMsg(null), 3200);
      return;
    }

    try {
      if (linkedSystem?.accessMode === 'handle') {
        const relativeName = node.filePath.split('/').pop() || node.label;
        const data = await readHandleBackedFile(linkedSystem.id, relativeName);
        setOpenDoc({ fileName: data.fileName || node.label, filePath: node.filePath, content: data.content, truncated: data.truncated });
        return;
      }

      const res = await fetch('/api/actions/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: node.filePath,
          systemRoot: linkedSystem?.accessMode === 'runtime' ? linkedSystem.rootPath : undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setOpenDoc({ fileName: data.fileName || node.label, filePath: node.filePath, content: data.content, truncated: data.truncated });
      } else {
        setToastMsg({ msg: tt(t, 'toast.failure', 'FAILURE: {label} FAILED.', { label: node.label }), detail: data.error || 'READ_ERROR' });
        setTimeout(() => setToastMsg(null), 3200);
      }
    } catch (error: unknown) {
      setToastMsg({
        msg: tt(t, 'toast.failure', 'FAILURE: {label} FAILED.', { label: node.label }),
        detail: getErrorMessage(error, 'READ_ERROR'),
      });
      setTimeout(() => setToastMsg(null), 3200);
    }
  }, [linkedSystems, openDoc?.filePath, t]);

  const openAssetPicker = useCallback((node: GraphNode, slot: AssetStageSlot) => {
    setSelectedNodeId(node.id);
    if (slot !== 'appearance') return;
    setPendingAssetTarget({ nodeId: node.id, slot });
    assetFileInputRef.current?.click();
  }, []);

  const openSentinelAssetPicker = useCallback(() => {
    setPendingAssetTarget({ family: 'sentinel', slot: 'appearance' });
    assetFileInputRef.current?.click();
  }, []);

  const patchNodeAssetSettings = useCallback((nodeId: string, slot: AssetStageSlot, settings: Partial<GraphNodeAssetOverride['appearance']>) => {
    setNodeAssetDrafts((prev) => {
      const next = { ...prev };
      delete next[nodeId];
      return next;
    });
    setNodeAssetOverrides((prev) => {
      const previous = prev[nodeId] || {};
      const previousStage = (previous[slot] || {}) as NonNullable<GraphNodeAssetOverride['appearance']>;
      return {
        ...prev,
        [nodeId]: {
          ...previous,
          [slot]: {
            ...previousStage,
            ...settings,
            enabled: previousStage?.enabled ?? true,
            src: previousStage?.src || '',
          },
        },
      };
    });

    void fetch('/api/node-assets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodeId, slot, settings }),
    })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success && payload.overrides) {
          setNodeAssetOverrides(payload.overrides);
          setFamilyAssetOverrides(payload.familyProfiles || {});
          return;
        }
        throw new Error(payload?.error || 'ASSET_NODE_PATCH_ERROR');
      })
      .catch((error: unknown) => {
        setToastMsg({ msg: 'ASSET_EDIT_FAILURE', detail: getErrorMessage(error, 'ASSET_NODE_PATCH_ERROR') });
        setTimeout(() => setToastMsg(null), 2600);
      });
  }, []);

  const draftNodeAssetOffset = useCallback((nodeId: string, offset: [number, number, number]) => {
    setNodeAssetDrafts((prev) => ({
      ...prev,
      [nodeId]: {
        ...(prev[nodeId] || {}),
        appearance: {
          ...((prev[nodeId]?.appearance || nodeAssetOverrides[nodeId]?.appearance || {}) as NonNullable<GraphNodeAssetOverride['appearance']>),
          offset,
        },
      },
    }));
  }, [nodeAssetOverrides]);

  const draftNodeAssetRotation = useCallback((nodeId: string, rotation: [number, number, number]) => {
    setNodeAssetDrafts((prev) => ({
      ...prev,
      [nodeId]: {
        ...(prev[nodeId] || {}),
        appearance: {
          ...((prev[nodeId]?.appearance || nodeAssetOverrides[nodeId]?.appearance || {}) as NonNullable<GraphNodeAssetOverride['appearance']>),
          rotation,
        },
      },
    }));
  }, [nodeAssetOverrides]);

  const draftNodeAssetScale = useCallback((nodeId: string, scale: number) => {
    setNodeAssetDrafts((prev) => ({
      ...prev,
      [nodeId]: {
        ...(prev[nodeId] || {}),
        appearance: {
          ...((prev[nodeId]?.appearance || nodeAssetOverrides[nodeId]?.appearance || {}) as NonNullable<GraphNodeAssetOverride['appearance']>),
          scale,
        },
      },
    }));
  }, [nodeAssetOverrides]);

  const commitNodeAssetOffset = useCallback((nodeId: string) => {
    const draft = nodeAssetDrafts[nodeId]?.appearance;
    if (!draft?.offset) return;
    patchNodeAssetSettings(nodeId, 'appearance', { offset: draft.offset });
  }, [nodeAssetDrafts, patchNodeAssetSettings]);

  const commitNodeAssetRotation = useCallback((nodeId: string) => {
    const draft = nodeAssetDrafts[nodeId]?.appearance;
    if (!draft?.rotation) return;
    patchNodeAssetSettings(nodeId, 'appearance', { rotation: draft.rotation });
  }, [nodeAssetDrafts, patchNodeAssetSettings]);

  const commitNodeAssetScale = useCallback((nodeId: string) => {
    const draft = nodeAssetDrafts[nodeId]?.appearance;
    if (typeof draft?.scale !== 'number') return;
    patchNodeAssetSettings(nodeId, 'appearance', { scale: draft.scale });
  }, [nodeAssetDrafts, patchNodeAssetSettings]);

  const nudgeSelectedAssetOffset = useCallback((axis: 'x' | 'z', delta: number) => {
    if (!selectedNode || !selectedNodeAssetProfile) return;
    const slot: AssetStageSlot = 'appearance';
    const currentStage = selectedNodeAssetProfile.appearance;
    if (!currentStage?.src) return;
    const currentOffset = currentStage.offset || [0, 0, 0];
    const nextOffset: [number, number, number] = [...currentOffset] as [number, number, number];
    const index = axis === 'x' ? 0 : 2;
    nextOffset[index] += delta;
    patchNodeAssetSettings(selectedNode.id, slot, { offset: nextOffset });
  }, [patchNodeAssetSettings, selectedNode, selectedNodeAssetProfile]);

  const rotateSelectedAssetY = useCallback((deltaDegrees: number) => {
    if (!selectedNode || !selectedNodeAssetProfile) return;
    const slot: AssetStageSlot = 'appearance';
    const currentStage = selectedNodeAssetProfile.appearance;
    if (!currentStage?.src) return;
    const currentRotation = currentStage.rotation || [0, 0, 0];
    const nextRotation: [number, number, number] = [...currentRotation] as [number, number, number];
    nextRotation[1] += THREE.MathUtils.degToRad(deltaDegrees);
    patchNodeAssetSettings(selectedNode.id, slot, { rotation: nextRotation });
  }, [patchNodeAssetSettings, selectedNode, selectedNodeAssetProfile]);

  const scaleSelectedAsset = useCallback((delta: number) => {
    if (!selectedNode || !selectedNodeAssetProfile) return;
    const slot: AssetStageSlot = 'appearance';
    const currentStage = selectedNodeAssetProfile.appearance;
    if (!currentStage?.src) return;
    const nextScale = THREE.MathUtils.clamp((currentStage.scale ?? 1) + delta, 0.1, 8);
    patchNodeAssetSettings(selectedNode.id, slot, { scale: nextScale });
  }, [patchNodeAssetSettings, selectedNode, selectedNodeAssetProfile]);

  const patchSentinelAssetSettings = useCallback((settings: Partial<GraphNodeAssetOverride['appearance']>) => {
    setSentinelAssetDraft(null);
    void fetch('/api/node-assets', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ family: 'sentinel', slot: 'appearance', settings }),
    })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success) {
          setNodeAssetOverrides(payload.overrides || {});
          setFamilyAssetOverrides(payload.familyProfiles || {});
          return;
        }
        throw new Error(payload?.error || 'SENTINEL_ASSET_PATCH_ERROR');
      })
      .catch((error: unknown) => {
        setToastMsg({ msg: 'SENTINEL_EDIT_FAILURE', detail: getErrorMessage(error, 'SENTINEL_ASSET_PATCH_ERROR') });
        setTimeout(() => setToastMsg(null), 2600);
      });
  }, []);

  const rotateSentinelAssetX = useCallback((deltaDegrees: number) => {
    const currentRotation = sentinelAppearanceStage.rotation || [0, 0, 0];
    const nextRotation: [number, number, number] = [...currentRotation] as [number, number, number];
    nextRotation[0] += THREE.MathUtils.degToRad(deltaDegrees);
    patchSentinelAssetSettings({ rotation: nextRotation });
  }, [patchSentinelAssetSettings, sentinelAppearanceStage.rotation]);

  const scaleSentinelAsset = useCallback((delta: number) => {
    const nextScale = THREE.MathUtils.clamp((sentinelAppearanceStage.scale ?? 1) + delta, 0.1, 8);
    patchSentinelAssetSettings({ scale: nextScale });
  }, [patchSentinelAssetSettings, sentinelAppearanceStage.scale]);
  const draftSentinelAssetRotation = useCallback((rotation: [number, number, number]) => {
    setSentinelAssetDraft((prev) => ({ ...(prev || {}), rotation }));
  }, []);
  const commitSentinelAssetRotation = useCallback(() => {
    const rotation = sentinelAssetDraft?.rotation;
    if (!rotation) return;
    patchSentinelAssetSettings({ rotation });
  }, [patchSentinelAssetSettings, sentinelAssetDraft?.rotation]);
  const draftSentinelAssetScale = useCallback((scale: number) => {
    setSentinelAssetDraft((prev) => ({ ...(prev || {}), scale }));
  }, []);
  const commitSentinelAssetScale = useCallback(() => {
    const scale = sentinelAssetDraft?.scale;
    if (typeof scale !== 'number') return;
    patchSentinelAssetSettings({ scale });
  }, [patchSentinelAssetSettings, sentinelAssetDraft?.scale]);

  const handleAssetInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const target = pendingAssetTarget;
    if (!file || !target) {
      event.target.value = '';
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    if ('nodeId' in target && target.nodeId) {
      formData.append('nodeId', target.nodeId);
    }
    if ('family' in target && target.family) {
      formData.append('family', target.family);
    }
    formData.append('slot', target.slot);
    formData.append('label', file.name);

    void fetch('/api/node-assets', {
      method: 'POST',
      body: formData,
    })
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success && payload.overrides) {
          setNodeAssetOverrides(payload.overrides);
          setFamilyAssetOverrides(payload.familyProfiles || {});
          const nodeLabel = 'nodeId' in target && target.nodeId
            ? (nodesById.get(target.nodeId)?.label || target.nodeId)
            : (target.family || 'SENTINEL').toUpperCase();
          setToastMsg({ msg: `${nodeLabel} // GLB ${target.slot.toUpperCase()} LINKED` });
          setTimeout(() => setToastMsg(null), 2600);
        } else {
          setToastMsg({ msg: 'GLB_LINK_FAILURE', detail: payload?.error || 'ASSET_UPLOAD_ERROR' });
          setTimeout(() => setToastMsg(null), 3200);
        }
      })
      .catch((error: unknown) => {
        setToastMsg({ msg: 'GLB_LINK_FAILURE', detail: getErrorMessage(error, 'ASSET_UPLOAD_ERROR') });
        setTimeout(() => setToastMsg(null), 3200);
      })
      .finally(() => {
        setPendingAssetTarget(null);
        event.target.value = '';
      });
  }, [nodesById, pendingAssetTarget]);

  const submitChatPrompt = useCallback(async (overridePrompt?: string) => {
    const prompt = (overridePrompt ?? chatPrompt).trim();
    if (!prompt || chatBusy) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: prompt,
    };
    setChatMessages((prev) => [...prev, userMessage]);
    setChatPrompt('');
    setChatBusy(true);

    try {
      const response = await fetch('/api/seneschal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!payload?.success) {
        throw new Error(payload?.error || 'SENESCHAL_FAILURE');
      }
      setChatMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: String(payload.reply || 'NO_RESPONSE'),
          source: payload.source === 'local' || payload.source === 'frugal' ? payload.source : undefined,
        },
      ]);
    } catch (error: unknown) {
      setChatMessages((prev) => [
        ...prev,
        {
          id: `assistant-error-${Date.now()}`,
          role: 'assistant',
          content: `LINK FAILURE // ${getErrorMessage(error) || 'SENESCHAL_FAILURE'}`,
        },
      ]);
    } finally {
      setChatBusy(false);
    }
  }, [chatBusy, chatPrompt]);

  const handleNodeClick = async (node: GraphNode) => {
    setSelectedSentinelIndex(null);
    const capabilities = getNodeCapabilities(node, linkedSystems, Boolean(node.assetOverride));
    if (capabilities.kind === 'access') {
      setUnlinkModal('link');
      return;
    }
    focusNode(node);
    if (capabilities.canExecute && node.action) {
      await executeNodeAction(node);
      return;
    }
    if (capabilities.canOpenDocument || capabilities.blockReason) {
      await openNodeDocument(node);
    }
  };

  const beginCameraControl = () => {
    setCameraMode('manual');
  };

  const endCameraControl = () => {};

  const docFormat = openDoc ? inferDocumentFormat(openDoc.fileName) : 'text';
  const docFormatLabel = docFormat === 'markdown'
    ? tt(t, 'viewer.format.markdown', 'MARKDOWN_SURFACE')
    : docFormat === 'json'
    ? tt(t, 'viewer.format.json', 'JSON_STATE')
    : docFormat === 'source'
    ? tt(t, 'viewer.format.source', 'SOURCE_STREAM')
    : tt(t, 'viewer.format.text', 'TEXT_STREAM');
  const docMatchCount = openDoc ? countQueryMatches(openDoc.content, deferredDocQuery) : 0;
  const resolvedEditModeSecret = useMemo(
    () => String.fromCharCode(...EDIT_MODE_SECRET_CODES),
    [],
  );
  const inspectorNode = selectedNode || sentinelInspectorNode || null;
  const dockBottom = isPhone ? 12 : isTablet ? 16 : 22;
  const dockReferenceNode = inspectorNode || displayNode;
  const dockAccent = dockReferenceNode?.color || signals.palette.accent;
  const dockTitle = dockReferenceNode?.label || primaryLinkedSystem?.name || tt(t, 'common.idle', 'IDLE');
  const dockTitleColor = dockReferenceNode?.color || signals.palette.emphasis;
  const handleEditModeToggle = useCallback(() => {
    if (assetEditState.enabled) {
      setNodeAssetDrafts({});
      setSentinelAssetDraft(null);
      setAssetEditState({ enabled: false });
      return;
    }
    if (editModeAuthorized) {
      setEditModeSessionBaseline({
        overrides: JSON.parse(JSON.stringify(nodeAssetOverrides)),
        familyProfiles: JSON.parse(JSON.stringify(familyAssetOverrides)),
      });
      setAssetEditState({ enabled: true });
      return;
    }
    setEditModePassword('');
    setEditModePromptOpen(true);
  }, [assetEditState.enabled, editModeAuthorized, familyAssetOverrides, nodeAssetOverrides]);
  const submitEditModePassword = useCallback(() => {
    if (editModePassword.trim() !== resolvedEditModeSecret) {
      setToastMsg({ msg: 'EDIT_MODE_LOCKED', detail: 'INVALID_ACCESS_KEY' });
      setTimeout(() => setToastMsg(null), 2200);
      return;
    }
    setEditModeAuthorized(true);
    setEditModeSessionBaseline({
      overrides: JSON.parse(JSON.stringify(nodeAssetOverrides)),
      familyProfiles: JSON.parse(JSON.stringify(familyAssetOverrides)),
    });
    setAssetEditState({ enabled: true });
    setEditModePromptOpen(false);
    setEditModePassword('');
  }, [editModePassword, familyAssetOverrides, nodeAssetOverrides, resolvedEditModeSecret]);
  const persistEditModeSession = useCallback(async (nextOverrides: Record<string, GraphNodeAssetOverride>, nextFamilyProfiles: NodeAssetFamilyOverrides) => {
    const response = await fetch('/api/node-assets', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        overrides: nextOverrides,
        familyProfiles: nextFamilyProfiles,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!payload?.success) {
      throw new Error(payload?.error || 'EDIT_MODE_SESSION_SYNC_ERROR');
    }
    setNodeAssetOverrides(payload.overrides || {});
    setFamilyAssetOverrides(payload.familyProfiles || {});
    setNodeAssetDrafts({});
    setSentinelAssetDraft(null);
    return payload;
  }, []);
  const saveEditModeSession = useCallback(async () => {
    try {
      const payload = await persistEditModeSession(effectiveNodeAssetOverrides, effectiveFamilyAssetOverrides);
      setEditModeSessionBaseline({
        overrides: JSON.parse(JSON.stringify(payload.overrides || {})),
        familyProfiles: JSON.parse(JSON.stringify(payload.familyProfiles || {})),
      });
      setToastMsg({ msg: 'EDIT_MODE_SESSION_SAVED', detail: 'LAYOUT_AND_ASSET_TRANSFORMS_COMMITTED' });
      setTimeout(() => setToastMsg(null), 2400);
    } catch (error: unknown) {
      setToastMsg({ msg: 'EDIT_MODE_SAVE_FAILURE', detail: getErrorMessage(error, 'EDIT_MODE_SESSION_SYNC_ERROR') });
      setTimeout(() => setToastMsg(null), 2800);
    }
  }, [effectiveFamilyAssetOverrides, effectiveNodeAssetOverrides, persistEditModeSession]);
  const revertEditModeSession = useCallback(async () => {
    if (!editModeSessionBaseline) return;
    try {
      const payload = await persistEditModeSession(editModeSessionBaseline.overrides, editModeSessionBaseline.familyProfiles);
      setEditModeSessionBaseline({
        overrides: JSON.parse(JSON.stringify(payload.overrides || {})),
        familyProfiles: JSON.parse(JSON.stringify(payload.familyProfiles || {})),
      });
      setToastMsg({ msg: 'EDIT_MODE_SESSION_REVERTED', detail: 'SESSION_ROLLED_BACK_TO_ENTRY_STATE' });
      setTimeout(() => setToastMsg(null), 2400);
    } catch (error: unknown) {
      setToastMsg({ msg: 'EDIT_MODE_REVERT_FAILURE', detail: getErrorMessage(error, 'EDIT_MODE_SESSION_SYNC_ERROR') });
      setTimeout(() => setToastMsg(null), 2800);
    }
  }, [editModeSessionBaseline, persistEditModeSession]);
  const sentinelAnchor = (primaryLinkedSystem && nodesById.get(`project-${primaryLinkedSystem.id}`)?.position) || nodesById.get('core')?.position || [0, 0, 0];
  const showRecoveryHint = cameraZoom < 3 || cameraZoom > 90;
  const canvasBackdropStyle: React.CSSProperties = {
    backgroundColor: '#020202',
    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.16) 0.9px, transparent 1.3px)',
    backgroundSize: '32px 32px',
    backgroundPosition: '0 0',
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, zIndex: 1, background: 'transparent', overflow: 'hidden' }}>
      <SceneErrorBoundary dictionary={t}>
      <Canvas
        style={{ position: 'absolute', inset: 0, zIndex: 0, background: 'transparent', ...canvasBackdropStyle }}
        orthographic
        dpr={qualityProfile.dpr}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ position: [0, 35, 0.001], zoom: 30, near: 0.1, far: 200 }}
      >
        <CanvasBackgroundSync background={signals.palette.sceneBg} fog={signals.palette.fog} />
        <DotsBackdrop color="#b3b3b3" />
        <SceneRig signals={signals} reducedMotion={reducedMotion} cameraMode={cameraMode} focusedNode={selectedNode} controlsRef={controlsRef} sceneBounds={sceneBounds} />
        <ZoomTierTracker onZoomTierChange={setZoomTier} onZoomChange={setCameraZoom} />
        <ambientLight intensity={0.7} color="#f8fafc" />
        <directionalLight intensity={0.38} color={signals.palette.emphasis} position={[12, 28, 6]} />
        <directionalLight intensity={0.24} color={signals.palette.secondary} position={[-10, 22, -8]} />

        {/* TARGET ACQUISITION RETICLE & DATA BRIDGE */}
        {hoveredNode && (
          <group position={hoveredNode.position}>
             <mesh rotation={[0, 0, Math.PI / 4]}>
                <ringGeometry args={[1.2, 1.25, 4]} />
                <meshBasicMaterial color={hoveredNode.color} transparent opacity={0.4} />
             </mesh>
             <mesh rotation={[0, 0, 0]}>
                <ringGeometry args={[1.4, 1.42, 32]} />
                <meshBasicMaterial color="#ffffff" transparent opacity={0.1} />
             </mesh>
             
             {/* Data Bridge Beam to HUD */}
              <ConnectionBeam 
                start={[0, 0, 0]} 
                end={[15, 10, -5]} // Fixed camera-relative pos for the telemetry wing
                color={hoveredNode.color || signals.palette.secondary}
                streamParticles={qualityProfile.hoverStreamCount}
                chromaticParticles
                emphasis={1.12}
              />
           </group>
        )}

        {[...Array(qualityProfile.droneCount)].map((_, i) => (
          <SentinelDrone
            key={i}
            index={i}
            drift={drift}
            anchor={sentinelAnchor as [number, number, number]}
            color={signals.palette.secondary}
            familyAssetOverrides={familyAssetOverrides}
            assetStage={sentinelAppearanceStage}
            editMode={assetEditState.enabled}
            isSelected={selectedSentinelIndex === i}
            onSelectForEdit={(index) => {
              setSelectedNodeId(null);
              setSelectedSentinelIndex(index);
            }}
            onOpenAssetPicker={openSentinelAssetPicker}
            onDraftAssetRotation={draftSentinelAssetRotation}
            onCommitAssetRotation={commitSentinelAssetRotation}
            onDraftAssetScale={draftSentinelAssetScale}
            onCommitAssetScale={commitSentinelAssetScale}
          />
        ))}

        {visibleEdges.map((edge, i) => {
          const from = nodesById.get(edge.from);
          const to = nodesById.get(edge.to);
          if (!from || !to) return null;
          const streamProfile = getEdgeStreamProfile(from, to);
          return (
            <ConnectionBeam
              key={`edge-${i}`}
              start={from.position}
              end={to.position}
              color={from.color || to.color || signals.palette.secondary}
              streamParticles={streamProfile.streamParticles}
              chromaticParticles={streamProfile.chromaticParticles}
              emphasis={streamProfile.emphasis}
            />
          );
        })}

        {visibleNodes.map((node) => (
            <SystemNode
              key={node.id}
              node={node}
              isSelected={selectedNodeId === node.id}
            drift={drift}
            signals={signals}
            zoomTier={zoomTier}
              reducedMotion={reducedMotion}
              familyAssetOverrides={familyAssetOverrides}
              activityState={getNodeActivityState(node)}
              editMode={assetEditState.enabled}
              onHover={setHoveredNode}
              onUnhover={() => setHoveredNode(null)}
              onClick={handleNodeClick}
              onOpenAssetPicker={openAssetPicker}
              onSelectForEdit={(target) => {
                setSelectedSentinelIndex(null);
                setSelectedNodeId(target.id);
              }}
              onDraftAssetOffset={draftNodeAssetOffset}
              onCommitAssetOffset={commitNodeAssetOffset}
              onDraftAssetRotation={draftNodeAssetRotation}
              onCommitAssetRotation={commitNodeAssetRotation}
              onDraftAssetScale={draftNodeAssetScale}
              onCommitAssetScale={commitNodeAssetScale}
              imperiumOrbit={imperiumOrbit}
            />
        ))}

        {zoomTier !== 'overview' && aggregateBadges.map((badge) => (
          <AggregateClusterBadge key={badge.id} badge={badge} dictionary={t} />
        ))}

        <OrbitControls 
          ref={controlsRef}
          makeDefault
          enableDamping 
          dampingFactor={0.12} 
          enableRotate={false}
          panSpeed={0.72}
          zoomSpeed={0.82}
          enablePan
          enableZoom
          screenSpacePanning
          autoRotate={false}
          minZoom={0.001}
          mouseButtons={{
            LEFT: MOUSE.PAN,
            MIDDLE: MOUSE.PAN,
            RIGHT: MOUSE.PAN,
          }}
          onStart={beginCameraControl}
          onEnd={endCameraControl}
        />

      </Canvas>
      </SceneErrorBoundary>

      <div
        style={{
          position: 'absolute',
          top: isPhone ? 10 : 14,
          right: isPhone ? 12 : 18,
          zIndex: 260,
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          pointerEvents: 'auto',
        }}
      >
        <button
          onClick={resetView}
          className="btn-nexus"
          style={{
            padding: '6px 10px',
            fontSize: '0.42rem',
            letterSpacing: '1.8px',
            borderColor: signals.palette.border,
            background: 'rgba(2,6,23,0.7)',
          }}
        >
          RESET_VIEW
        </button>
        <button
          onClick={() => focusNode(coreNode)}
          className="btn-nexus"
          style={{
            padding: '6px 10px',
            fontSize: '0.42rem',
            letterSpacing: '1.8px',
            borderColor: signals.palette.border,
            background: 'rgba(2,6,23,0.7)',
          }}
        >
          FOCUS_CORE
        </button>
        {showRecoveryHint && (
          <div
            style={{
              padding: '6px 8px',
              fontSize: '0.38rem',
              letterSpacing: '1.8px',
              color: signals.palette.warning,
              border: `1px solid ${signals.palette.border}`,
              background: 'rgba(2,6,23,0.68)',
              textAlign: 'center',
            }}
          >
            ZOOM_EXTREME // USE RESET
          </div>
        )}
      </div>

      <input
        ref={assetFileInputRef}
        type="file"
        accept=".glb,.gltf,model/gltf-binary,model/gltf+json"
        onChange={handleAssetInputChange}
        style={{ display: 'none' }}
      />

      <WaveMonitor
        drift={drift}
        eta={physics.eta}
        merkle={merkle}
        logs={logs}
        chainEvents={chainEvents}
        signals={signals}
        sessionStart={sessionStart}
        dictionary={t}
        physics={physics}
        linkedSystems={linkedSystems}
        primaryLinkedSystem={primaryLinkedSystem}
        activeVectorText={activeVectorText}
        qualityTier={qualityTier}
        audioArmed={audioArmed}
        reducedMotion={reducedMotion}
        stateLatencyMs={stateLatencyMs}
        open={isRightRailOpen}
        onToggle={() => setIsRightRailOpen((current) => !current)}
      />

      <div
        style={{
          position: 'absolute',
          top: isPhone ? 104 : isTablet ? 132 : 148,
          right: 0,
          bottom: isPhone ? 14 : 18,
          width: (isPhone ? 280 : isTablet ? 320 : 360) + (isPhone ? 34 : 38),
          zIndex: 510,
          pointerEvents: 'none',
        }}
      >
        <button
          onClick={() => setIsChatOpen((current) => !current)}
          className="btn-nexus"
          style={{
            position: 'absolute',
            right: (isPhone ? 280 : isTablet ? 320 : 360) - 1,
            top: 'calc(50% - 88px)',
            transform: 'translateY(-50%)',
            pointerEvents: 'auto',
            writingMode: 'vertical-lr',
            padding: isPhone ? '10px 7px' : '12px 8px',
            fontSize: '0.46rem',
            letterSpacing: '3px',
            minWidth: `${(isPhone ? 34 : 38) - 6}px`,
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            borderTopRightRadius: '10px',
            borderBottomRightRadius: '10px',
            borderColor: signals.palette.secondary,
            boxShadow: `0 12px 26px rgba(0,0,0,0.2), 0 0 16px ${signals.palette.secondary}12`,
          }}
        >
          {isChatOpen ? 'HIDE_CHAT' : 'CHAT'}
        </button>

        <div
          className="hide-scrollbar"
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: isPhone ? 280 : isTablet ? 320 : 360,
            transform: isChatOpen ? 'translateX(0)' : `translateX(${(isPhone ? 280 : isTablet ? 320 : 360) + 24}px)`,
            transition: 'transform 0.34s cubic-bezier(0.16, 1, 0.3, 1)',
            pointerEvents: isChatOpen ? 'auto' : 'none',
            display: 'grid',
            gridTemplateRows: 'auto 1fr auto',
            gap: '0',
            padding: isPhone ? '10px' : '12px',
            border: `1px solid ${signals.palette.border}`,
            background: signals.palette.panel,
            boxShadow: '0 18px 54px rgba(0,0,0,0.22)',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'grid', gap: '5px', paddingBottom: '10px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ ...overlayGlowText, fontSize: isPhone ? '0.56rem' : '0.62rem', fontWeight: 800, letterSpacing: '3px' }}>
              SENESCHAL
            </div>
            <div style={{ ...overlaySoftText, fontSize: '0.46rem', letterSpacing: '1.8px', lineHeight: 1.5 }}>
              ECOSYSTEM STEWARD // L1 LOCAL FIRST // FRUGAL BRIDGE
            </div>
          </div>

          <div style={{ overflowY: 'auto', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {chatMessages.map((message) => (
              <div
                key={message.id}
                style={{
                  alignSelf: message.role === 'user' ? 'flex-end' : 'stretch',
                  maxWidth: message.role === 'user' ? '88%' : '100%',
                  padding: '10px 12px',
                  border: `1px solid ${message.role === 'user' ? signals.palette.secondary : signals.palette.border}`,
                  background: message.role === 'user' ? 'rgba(8, 47, 73, 0.44)' : 'rgba(255,255,255,0.03)',
                  color: message.role === 'system' ? 'rgba(255,255,255,0.66)' : '#e8f7ff',
                  fontSize: '0.58rem',
                  letterSpacing: '1px',
                  lineHeight: 1.55,
                  whiteSpace: 'pre-wrap',
                }}
              >
                <div style={{ fontSize: '0.36rem', letterSpacing: '1.8px', opacity: 0.58, marginBottom: '5px' }}>
                  {message.role === 'user'
                    ? 'OPERATOR'
                    : message.role === 'assistant'
                    ? `SENESCHAL${message.source === 'local' ? ' // L1_LOCAL' : message.source === 'frugal' ? ' // FRUGAL' : ''}`
                    : 'SYSTEM'}
                </div>
                {message.content}
              </div>
            ))}
            {chatBusy && (
              <div style={{ color: signals.palette.secondary, fontSize: '0.48rem', letterSpacing: '2px' }}>
                SENESCHAL // RESOLVING...
              </div>
            )}
          </div>

          <div style={{ paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'grid', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {(['status', 'verify', 'eventos'] as const).map((command) => (
                <button
                  key={command}
                  onClick={() => { void submitChatPrompt(command); }}
                  disabled={chatBusy}
                  className="btn-nexus"
                  style={{
                    padding: '6px 10px',
                    fontSize: '0.4rem',
                    letterSpacing: '1.8px',
                    opacity: chatBusy ? 0.5 : 1,
                    borderColor: signals.palette.border,
                  }}
                >
                  {command.toUpperCase()}
                </button>
              ))}
            </div>
            <textarea
              value={chatPrompt}
              onChange={(event) => setChatPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void submitChatPrompt();
                }
              }}
              placeholder="ORDEN PARA SENESCHAL... ('ayuda' = comandos)"
              style={{
                width: '100%',
                minHeight: isPhone ? '72px' : '84px',
                resize: 'none',
                background: 'rgba(15,23,42,0.82)',
                border: `1px solid ${signals.palette.border}`,
                color: '#f8fafc',
                padding: '12px 14px',
                fontSize: '0.64rem',
                letterSpacing: '1px',
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <div style={{ color: 'rgba(255,255,255,0.46)', fontSize: '0.38rem', letterSpacing: '1.7px' }}>
                ENTER // SEND
              </div>
              <button
                onClick={() => { void submitChatPrompt(); }}
                disabled={chatBusy || !chatPrompt.trim()}
                className="btn-nexus"
                style={{
                  padding: '8px 12px',
                  fontSize: '0.44rem',
                  letterSpacing: '1.8px',
                  opacity: chatBusy || !chatPrompt.trim() ? 0.52 : 1,
                  borderColor: signals.palette.secondary,
                }}
              >
                SEND
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SOVEREIGN COMMAND HUD (Left Side) */}
      {/* Telemetry overlays now live in-scene for better spatial separation */}

      <div style={{ position: 'absolute', top: 30, left: '50%', transform: 'translateX(-50%)', textAlign: 'center', pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', zIndex: 180 }}>
        <h1 className="text-gradient" style={{ fontSize: isPhone ? '1rem' : isTablet ? '1.15rem' : '1.4rem', margin: 0, letterSpacing: isPhone ? '6px' : isTablet ? '9px' : '12px', fontWeight: 800, fontFamily: 'var(--font-sans)' }}>
          CONEKTA NEXUS
        </h1>

        <div style={{ color: '#ffffff', fontSize: isPhone ? '0.42rem' : '0.6rem', letterSpacing: isPhone ? '2px' : '6px', marginTop: '4px', fontWeight: 600, opacity: 0.74, textShadow: '0 0 14px rgba(255,255,255,0.18)', maxWidth: isPhone ? '180px' : 'none' }}>
          ETHERNIUM PERSONAL // FRUGAL AUTHORITY
        </div>

        <div style={{ width: titleTelemetryWidth, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: isPhone ? '6px' : '8px', marginTop: isPhone ? '2px' : '5px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '4px 10px', background: signals.palette.panelSoft, border: `1px solid ${signals.palette.border}`, backdropFilter: 'none' }}>
            <div className="pulse-dot" style={{ width: '7px', height: '7px', background: fluxColor, boxShadow: `0 0 14px ${fluxColor}` }} />
            <span style={{ ...overlayGlowText, fontSize: isPhone ? '0.56rem' : '0.62rem', fontWeight: 800, letterSpacing: isPhone ? '2px' : '3px', color: healthColor }}>{healthLabel}</span>
            <span style={{ ...overlaySoftText, fontSize: '0.46rem', letterSpacing: '2px' }}>{modeLabelText}</span>
          </div>

          <div style={{ width: '100%', padding: isPhone ? '8px 10px' : '10px 12px', border: `1px solid ${fluxBorder}`, background: fluxBackground, backdropFilter: 'none', boxShadow: '0 14px 44px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
            <div style={{ ...overlaySoftText, fontSize: isPhone ? '0.5rem' : '0.56rem', letterSpacing: isPhone ? '2px' : '4px' }}>MEASURED ROUTING</div>
            <div style={{ color: fluxColor, fontSize: isPhone ? '0.6rem' : '0.68rem', letterSpacing: isPhone ? '2px' : '3px', fontWeight: 800 }}>L1/L2 BYPASS</div>
            <div style={{ ...overlayGlowText, fontSize: isPhone ? '1rem' : '1.18rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{syncLevel.toFixed(1)}%</div>
            <div style={{ color: fluxColor, fontSize: isPhone ? '0.48rem' : '0.54rem', letterSpacing: '2px', fontWeight: 700 }}>{runtimeAvailable ? 'FRUGAL TELEMETRY' : 'NO TELEMETRY'}</div>
            <div style={{ ...overlaySoftText, fontSize: '0.42rem', letterSpacing: '2px' }}>{modeReasonText}</div>
          </div>
        </div>
      </div>

      <div style={{ position: 'absolute', top: isPhone ? 16 : 22, right: isPhone ? 16 : 24, zIndex: 620, pointerEvents: 'auto' }}>
        <button
          onClick={handleEditModeToggle}
          className="btn-nexus"
          style={{
            padding: isPhone ? '8px 10px' : '9px 12px',
            fontSize: isPhone ? '0.44rem' : '0.5rem',
            letterSpacing: '2px',
            background: assetEditState.enabled ? 'rgba(5, 46, 73, 0.96)' : 'rgba(2, 6, 23, 0.92)',
            borderColor: assetEditState.enabled ? signals.palette.secondary : signals.palette.border,
            boxShadow: assetEditState.enabled ? `0 0 18px ${signals.palette.secondary}26` : '0 10px 24px rgba(0,0,0,0.25)',
          }}
        >
          {assetEditState.enabled ? 'EDIT_MODE_ON' : 'EDIT_MODE'}
        </button>
        {assetEditState.enabled && (
          <div
            style={{
              marginTop: '8px',
              padding: isPhone ? '7px 9px' : '8px 10px',
              background: 'rgba(2, 6, 23, 0.92)',
              border: `1px solid ${signals.palette.secondary}`,
              boxShadow: `0 0 18px ${signals.palette.secondary}16`,
              color: '#e5f7ff',
              fontSize: isPhone ? '0.4rem' : '0.44rem',
              letterSpacing: '1.8px',
              lineHeight: 1.45,
              textAlign: 'right',
              maxWidth: isPhone ? '160px' : '190px',
            }}
          >
            EDIT ACTIVE
            <br />
            SELECT NODE // DRAG MOVE
          </div>
        )}
      </div>

      {editModePromptOpen && (
        <div
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setEditModePromptOpen(false);
              setEditModePassword('');
            }
          }}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 860,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.72)',
            backdropFilter: 'none',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              width: isPhone ? 'min(320px, calc(100vw - 24px))' : '360px',
              background: 'linear-gradient(180deg, rgba(2,6,23,0.985), rgba(4,10,24,0.96))',
              border: `1px solid ${signals.palette.border}`,
              borderTop: `2px solid ${signals.palette.secondary}`,
              borderRadius: '14px',
              boxShadow: `0 18px 48px rgba(0,0,0,0.36), 0 0 0 1px ${signals.palette.border}22 inset`,
              padding: isPhone ? '16px' : '18px',
              display: 'grid',
              gap: '12px',
            }}
          >
            <div style={{ display: 'grid', gap: '4px' }}>
              <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.36rem', letterSpacing: '2px' }}>
                SECURE ACCESS
              </div>
              <div style={{ color: '#e5f7ff', fontSize: isPhone ? '0.72rem' : '0.82rem', fontWeight: 800, letterSpacing: '1.5px' }}>
                UNLOCK_EDIT_MODE
              </div>
              <div style={{ color: 'rgba(255,255,255,0.62)', fontSize: '0.46rem', letterSpacing: '1.6px', lineHeight: 1.5 }}>
                AUTHORIZATION REQUIRED FOR ASSET POSITION, ROTATION AND SCALE EDITS.
              </div>
            </div>

            <input
              type="password"
              value={editModePassword}
              onChange={(event) => setEditModePassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  submitEditModePassword();
                }
                if (event.key === 'Escape') {
                  setEditModePromptOpen(false);
                  setEditModePassword('');
                }
              }}
              autoFocus
              placeholder="ACCESS KEY"
              style={{
                width: '100%',
                background: 'rgba(15,23,42,0.82)',
                border: `1px solid ${signals.palette.border}`,
                color: '#f8fafc',
                borderRadius: '10px',
                padding: '12px 14px',
                fontSize: '0.72rem',
                letterSpacing: '2px',
                outline: 'none',
                boxShadow: `0 0 18px ${signals.palette.secondary}12 inset`,
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => {
                  setEditModePromptOpen(false);
                  setEditModePassword('');
                }}
                className="btn-nexus"
                style={{ padding: '8px 12px', fontSize: '0.44rem', letterSpacing: '1.8px' }}
              >
                CANCEL
              </button>
              <button
                onClick={submitEditModePassword}
                className="btn-nexus"
                style={{
                  padding: '8px 12px',
                  fontSize: '0.44rem',
                  letterSpacing: '1.8px',
                  borderColor: signals.palette.secondary,
                  boxShadow: `0 0 16px ${signals.palette.secondary}18`,
                }}
              >
                UNLOCK
              </button>
            </div>
          </div>
        </div>
      )}

      {assetEditState.enabled && (
        <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: dockBottom, zIndex: 240, width: isPhone ? 'calc(100vw - 24px)' : 'min(620px, calc(100vw - 180px))', maxWidth: 'calc(100vw - 20px)', pointerEvents: 'auto' }}>
          <div style={{
            background: `linear-gradient(180deg, rgba(2, 6, 23, 0.985), rgba(4, 10, 24, 0.96))`,
            border: `1px solid ${signals.palette.border}`,
            borderTop: `2px solid ${dockAccent}`,
            borderRadius: isPhone ? '12px' : '14px',
            boxShadow: `0 14px 30px rgba(0,0,0,0.24), 0 0 0 1px ${signals.palette.border}16 inset`,
            overflow: 'hidden',
          }}>
            <div style={{ padding: isPhone ? '10px' : '11px 12px', display: 'grid', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.34rem', letterSpacing: '2px' }}>EDIT_MODE</div>
                  <div style={{ color: dockTitleColor, fontSize: isPhone ? '0.62rem' : '0.72rem', fontWeight: 800, letterSpacing: '1px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {dockTitle}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => { void saveEditModeSession(); }}
                    className="btn-nexus"
                    style={{
                      padding: '7px 10px',
                      fontSize: '0.44rem',
                      letterSpacing: '1.8px',
                      borderColor: editSessionDirty ? signals.palette.secondary : signals.palette.border,
                      color: editSessionDirty ? signals.palette.emphasis : 'rgba(255,255,255,0.62)',
                    }}
                  >
                    SAVE
                  </button>
                  <button
                    onClick={() => { void revertEditModeSession(); }}
                    className="btn-nexus"
                    style={{
                      padding: '7px 10px',
                      fontSize: '0.44rem',
                      letterSpacing: '1.8px',
                      borderColor: editSessionDirty ? signals.palette.warning : signals.palette.border,
                      color: editSessionDirty ? signals.palette.warning : 'rgba(255,255,255,0.62)',
                    }}
                  >
                    REVERT
                  </button>
                  <button onClick={handleEditModeToggle} className="btn-nexus" style={{ padding: '7px 10px', fontSize: '0.44rem', letterSpacing: '1.8px' }}>CLOSE_EDIT</button>
                  {inspectorNode && (
                    <button onClick={() => selectedSentinelIndex !== null ? openSentinelAssetPicker() : openAssetPicker(inspectorNode, 'appearance')} className="btn-nexus" style={{ padding: '7px 10px', fontSize: '0.44rem', letterSpacing: '1.8px' }}>
                      ASSIGN GLB
                    </button>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ color: editSessionDirty ? signals.palette.warning : 'rgba(255,255,255,0.48)', fontSize: '0.36rem', letterSpacing: '1.8px' }}>
                  {editSessionDirty ? 'SESSION DIRTY // SAVE OR REVERT' : 'SESSION SYNCED'}
                </div>
                <div style={{ color: 'rgba(255,255,255,0.42)', fontSize: '0.34rem', letterSpacing: '1.6px' }}>
                  ACCESS LOCKED // EDIT SURFACE
                </div>
              </div>
              {inspectorNode ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
                    <button onClick={() => selectedSentinelIndex !== null ? patchSentinelAssetSettings({ offset: [((sentinelAppearanceStage.offset?.[0] || 0) - 0.1), sentinelAppearanceStage.offset?.[1] || 0, sentinelAppearanceStage.offset?.[2] || 0] }) : nudgeSelectedAssetOffset('x', -0.1)} className="btn-nexus" style={{ padding: '7px 8px', fontSize: '0.44rem', letterSpacing: '1.6px' }}>MOVE_X-</button>
                    <button onClick={() => selectedSentinelIndex !== null ? patchSentinelAssetSettings({ offset: [((sentinelAppearanceStage.offset?.[0] || 0) + 0.1), sentinelAppearanceStage.offset?.[1] || 0, sentinelAppearanceStage.offset?.[2] || 0] }) : nudgeSelectedAssetOffset('x', 0.1)} className="btn-nexus" style={{ padding: '7px 8px', fontSize: '0.44rem', letterSpacing: '1.6px' }}>MOVE_X+</button>
                    <button onClick={() => selectedSentinelIndex !== null ? patchSentinelAssetSettings({ offset: [sentinelAppearanceStage.offset?.[0] || 0, sentinelAppearanceStage.offset?.[1] || 0, ((sentinelAppearanceStage.offset?.[2] || 0) - 0.1)] }) : nudgeSelectedAssetOffset('z', -0.1)} className="btn-nexus" style={{ padding: '7px 8px', fontSize: '0.44rem', letterSpacing: '1.6px' }}>MOVE_Z-</button>
                    <button onClick={() => selectedSentinelIndex !== null ? patchSentinelAssetSettings({ offset: [sentinelAppearanceStage.offset?.[0] || 0, sentinelAppearanceStage.offset?.[1] || 0, ((sentinelAppearanceStage.offset?.[2] || 0) + 0.1)] }) : nudgeSelectedAssetOffset('z', 0.1)} className="btn-nexus" style={{ padding: '7px 8px', fontSize: '0.44rem', letterSpacing: '1.6px' }}>MOVE_Z+</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
                    <button onClick={() => selectedSentinelIndex !== null ? rotateSentinelAssetX(-15) : rotateSelectedAssetY(-15)} className="btn-nexus" style={{ padding: '7px 8px', fontSize: '0.44rem', letterSpacing: '1.6px' }}>{selectedSentinelIndex !== null ? 'ROT_X-15' : 'ROT_Y-15'}</button>
                    <button onClick={() => selectedSentinelIndex !== null ? rotateSentinelAssetX(15) : rotateSelectedAssetY(15)} className="btn-nexus" style={{ padding: '7px 8px', fontSize: '0.44rem', letterSpacing: '1.6px' }}>{selectedSentinelIndex !== null ? 'ROT_X+15' : 'ROT_Y+15'}</button>
                    <button onClick={() => selectedSentinelIndex !== null ? scaleSentinelAsset(-0.08) : scaleSelectedAsset(-0.08)} className="btn-nexus" style={{ padding: '7px 8px', fontSize: '0.44rem', letterSpacing: '1.6px' }}>SCALE-</button>
                    <button onClick={() => selectedSentinelIndex !== null ? scaleSentinelAsset(0.08) : scaleSelectedAsset(0.08)} className="btn-nexus" style={{ padding: '7px 8px', fontSize: '0.44rem', letterSpacing: '1.6px' }}>SCALE+</button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: isPhone ? 'repeat(2, minmax(0, 1fr))' : selectedSentinelIndex !== null ? 'repeat(4, minmax(0, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                    <div style={{ background: signals.palette.panelSoft, padding: '7px 9px', border: `1px solid ${signals.palette.border}` }}>
                      <div style={{ ...overlayFaintText, fontSize: '0.36rem', letterSpacing: '1.8px' }}>OFFSET</div>
                      <div style={{ ...overlayGlowText, fontSize: '0.46rem', fontWeight: 700 }}>{selectedSentinelIndex !== null ? `${(sentinelAppearanceStage.offset?.[0] || 0).toFixed(2)} / ${(sentinelAppearanceStage.offset?.[2] || 0).toFixed(2)}` : `${selectedAssetStageTransform.offset[0].toFixed(2)} / ${selectedAssetStageTransform.offset[2].toFixed(2)}`}</div>
                    </div>
                    {selectedSentinelIndex !== null && (
                      <div style={{ background: signals.palette.panelSoft, padding: '7px 9px', border: `1px solid ${signals.palette.border}` }}>
                        <div style={{ ...overlayFaintText, fontSize: '0.36rem', letterSpacing: '1.8px' }}>ROT_X</div>
                        <div style={{ ...overlayGlowText, fontSize: '0.46rem', fontWeight: 700 }}>{THREE.MathUtils.radToDeg((sentinelAppearanceStage.rotation || [0, 0, 0])[0]).toFixed(1)}°</div>
                      </div>
                    )}
                    <div style={{ background: signals.palette.panelSoft, padding: '7px 9px', border: `1px solid ${signals.palette.border}` }}>
                      <div style={{ ...overlayFaintText, fontSize: '0.36rem', letterSpacing: '1.8px' }}>ROT_Y</div>
                      <div style={{ ...overlayGlowText, fontSize: '0.46rem', fontWeight: 700 }}>{selectedSentinelIndex !== null ? `${THREE.MathUtils.radToDeg((sentinelAppearanceStage.rotation || [0, 0, 0])[1]).toFixed(1)}°` : `${THREE.MathUtils.radToDeg(selectedAssetStageTransform.rotation[1]).toFixed(1)}°`}</div>
                    </div>
                    <div style={{ background: signals.palette.panelSoft, padding: '7px 9px', border: `1px solid ${signals.palette.border}` }}>
                      <div style={{ ...overlayFaintText, fontSize: '0.36rem', letterSpacing: '1.8px' }}>SCALE</div>
                      <div style={{ ...overlayGlowText, fontSize: '0.46rem', fontWeight: 700 }}>{selectedSentinelIndex !== null ? `${(sentinelAppearanceStage.scale ?? 1).toFixed(2)}` : `${selectedAssetStageTransform.scale.toFixed(2)}`}</div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ ...overlaySoftText, fontSize: '0.44rem', letterSpacing: '1.8px', textAlign: 'center' }}>
                  SELECT NODE OR SENTINEL TO EDIT
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FILE VIEWER (With Forensic Handshake) */}
      {openDoc && (
        <div
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpenDoc(null);
          }}
          style={{
          position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.56)', backdropFilter: 'none'
        }}>
          <div style={{
            width: isPhone ? '90%' : '70%', height: isPhone ? '88%' : '80%', background: `linear-gradient(180deg, ${signals.palette.panel}, rgba(0,0,0,0.96))`,
            border: `1px solid ${signals.palette.border}`, display: 'flex', flexDirection: 'column', color: '#e4e4e7',
            backdropFilter: 'none', borderRadius: '12px', overflow: 'hidden', textShadow: '0 0 14px rgba(255,255,255,0.18)', boxShadow: '0 24px 80px rgba(0,0,0,0.36)'
          }}>
          <div style={{ padding: '15px 25px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: signals.palette.panelSoft, gap: '16px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', minWidth: 0 }}>
              <span style={{ fontSize: '0.7rem', letterSpacing: '4px', fontWeight: 800, fontFamily: 'var(--font-mono)', opacity: 0.72 }}>{tt(t, 'viewer.decrypting_stream', 'DECRYPTING_STREAM')} {'//'} {openDoc.fileName}</span>
              <span style={{ ...overlaySoftText, fontSize: '0.46rem', letterSpacing: '2px' }}>{modeReasonText}</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '0.44rem', letterSpacing: '1.8px', color: 'rgba(255,255,255,0.66)' }}>
                <span>{tt(t, 'viewer.path', 'PATH')}: {openDoc.filePath}</span>
                <span>{tt(t, 'viewer.format', 'FORMAT')}: {docFormatLabel}</span>
                <span>{tt(t, 'viewer.readonly', 'READ_ONLY')}</span>
                {openDoc.truncated && <span style={{ color: signals.palette.warning }}>{tt(t, 'viewer.truncated', 'TRUNCATED')}</span>}
              </div>
            </div>
            <button onClick={() => setOpenDoc(null)} className="btn-nexus" style={{ padding: '8px 20px', fontSize: '0.6rem' }}>X {tt(t, 'viewer.terminate', 'TERMINATE')}</button>
          </div>
          <div style={{ padding: '12px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(2,6,23,0.7)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <input
              value={docQuery}
              onChange={(event) => setDocQuery(event.target.value)}
              placeholder={tt(t, 'viewer.search', 'SEARCH_STREAM')}
              style={{
                flex: '1 1 240px',
                minWidth: isPhone ? '100%' : '240px',
                background: 'rgba(15,23,42,0.82)',
                border: `1px solid ${signals.palette.border}`,
                color: '#f8fafc',
                borderRadius: '999px',
                padding: '10px 14px',
                fontSize: '0.72rem',
                letterSpacing: '2px',
                outline: 'none',
                boxShadow: `0 0 18px ${signals.palette.secondary}12 inset`,
              }}
            />
            <div style={{ color: 'rgba(255,255,255,0.68)', fontSize: '0.48rem', letterSpacing: '2px' }}>
              {tt(t, 'viewer.matches', 'MATCHES')}: {docMatchCount}
            </div>
          </div>
          <div style={{ flex: 1, padding: '30px', overflow: 'auto', background: 'linear-gradient(180deg, rgba(0,0,0,0.94), rgba(3,7,18,0.98))' }}>
            <DecryptionHandshake onComplete={() => {}} dictionary={t} />
            {renderDocumentSurface(openDoc, deferredDocQuery, t)}
          </div>
          </div>
        </div>
      )}

      {/* UNLINK / LINK MODAL */}
      {unlinkModal && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 2000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'none'
        }}>
          <div className="glass-panel" style={{ padding: isPhone ? '24px 20px' : '40px', width: isPhone ? 'min(340px, calc(100vw - 24px))' : '400px', textAlign: 'center', borderRadius: '14px' }}>
            <h2 style={{ letterSpacing: '4px', fontSize: '1.2rem', marginBottom: '20px' }}>
              {unlinkModal === 'link' ? tt(t, 'modal.initiate_link', 'INITIATE_LINK') : tt(t, 'modal.terminate_link', 'TERMINATE_LINK')}
            </h2>
            <p style={{ fontSize: '0.8rem', opacity: 0.7, marginBottom: '30px', lineHeight: '1.6' }}>
              {unlinkModal === 'link' 
                ? tt(t, 'modal.link.confirm', 'ESTABLISHING CORE CONNECTION WITH EXTERNAL PROJECT STREAM. PROCEED?')
                : tt(t, 'modal.unlink.confirm', 'DISCONNECTING FROM THE CURRENT PROJECT ARCHITECTURE. ALL DYNAMIC NODES WILL BE PURGED.')}
            </p>
            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
               <button 
                  onPointerDown={() => {
                     if (unlinkModal === 'link') {
                      window.dispatchEvent(new CustomEvent('continuity:confirm-link'));
                       setUnlinkModal(null);
                       return;
                     }
                     if (primaryLinkedSystem) {
                      removeLinkedSystemHandle(primaryLinkedSystem.id);
                       setLinkedSystems((prev) => {
                         const remaining = prev.filter((system) => system.id !== primaryLinkedSystem.id);
                         setActiveLinkedSystemId(remaining[0]?.id || null);
                         return remaining;
                      });
                    }
                    setUnlinkModal(null);
                  }}
                  className="btn-liquid-3d"
                  style={{ borderRadius: '50px' }}
                >
                  {tt(t, 'common.confirm', 'CONFIRM_ACTION')}
                </button>
                <button 
                  onClick={() => setUnlinkModal(null)}
                  className="btn-liquid-3d"
                  style={{ background: 'linear-gradient(135deg, #333, #000)', color: '#fff', borderRadius: '50px' }}
                >
                  {tt(t, 'common.abort', 'ABORT')}
                </button>
             </div>
          </div>
        </div>
      )}

      {/* TOAST NOTIFICATIONS */}
      {toastMsg && (
        <div className="btn-liquid-3d" style={{
          position: 'absolute', top: isPhone ? 'auto' : 180, bottom: isPhone ? 20 : 'auto', right: railRight, padding: isPhone ? '12px 18px' : '15px 30px', 
          borderLeft: '4px solid #000', zIndex: 1000, animation: 'slideIn 0.3s ease-out',
          flexDirection: 'column', alignItems: 'flex-start', minWidth: isPhone ? '160px' : '200px', maxWidth: isPhone ? '200px' : '280px', pointerEvents: 'none'
        }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 800 }}>{toastMsg.msg}</div>
          {toastMsg.detail && <div style={{ fontSize: '0.6rem', color: '#000', opacity: 0.6, marginTop: '4px' }}>{toastMsg.detail}</div>}
        </div>
      )}
    </div>
  );
};

interface NexusCoreProps {
  linkedSystems: LinkedSystem[];
  activeLinkedSystemId: string | null;
  language: Language;
  setLinkedSystems: React.Dispatch<React.SetStateAction<LinkedSystem[]>>;
  setActiveLinkedSystemId: React.Dispatch<React.SetStateAction<string | null>>;
  physics?: PhysicsSnapshot;
  drift?: number | null;
  merkle?: string;
  chainEvents: ChainEventSnapshot[];
  chainStatus: ChainStatusSnapshot | null;
  activeCommand: string | null;
  stateLatencyMs?: number | null;
  runtimeAvailable?: boolean;
}

export default NexusCore;

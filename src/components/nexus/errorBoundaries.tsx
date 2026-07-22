"use client";
import React from 'react';
import { tt } from '@/lib/i18n';

export class SceneErrorBoundary extends React.Component<
  { children: React.ReactNode; dictionary: Record<string, string> },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; dictionary: Record<string, string> }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[NEXUS_CORE] Scene runtime failure:', error);
    if (typeof window !== 'undefined') {
      const message = error instanceof Error ? error.message : String(error);
      window.dispatchEvent(new CustomEvent('NEXUS_SCENE_ERROR', { detail: message }));
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.82)',
            color: '#fff',
            zIndex: 40,
            pointerEvents: 'none',
            textAlign: 'center',
            padding: '24px',
            letterSpacing: '2px',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <div>
            <div style={{ fontSize: '0.72rem', opacity: 0.72, marginBottom: '10px' }}>
              {tt(this.props.dictionary, 'core.scene.guard', 'SCENE_GUARD_ACTIVE')}
            </div>
            <div style={{ fontSize: '0.92rem', fontWeight: 700 }}>
              {tt(this.props.dictionary, 'core.scene.guard.detail', 'RUNTIME_VISUAL_LAYER_FAILED_BUT_CONTROL_SURFACE_REMAINS_AVAILABLE')}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export class NodeAssetErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode; resetKey: string },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: React.ReactNode; resetKey: string }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('[NEXUS_CORE] Node asset fallback engaged:', error);
  }

  componentDidUpdate(prevProps: Readonly<{ resetKey: string }>) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}


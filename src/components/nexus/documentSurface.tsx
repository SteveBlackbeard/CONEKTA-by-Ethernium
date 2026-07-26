"use client";
import React, { useEffect, useState } from 'react';
import { tt } from '@/lib/i18n';
import { OpenDocState } from './types';

export function DecryptionHandshake({ onComplete, dictionary }: { onComplete: () => void; dictionary: Record<string, string> }) {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => {
      setProgress((value) => Math.min(100, value + 20));
    }, 60);
    const done = setTimeout(() => {
      clearInterval(iv);
      setProgress(100);
      onComplete();
    }, 360);
    return () => {
      clearInterval(iv);
      clearTimeout(done);
    };
  }, [onComplete]);

  return (
    <div style={{ color: '#ffffff22', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', paddingBottom: '20px', borderBottom: '1px solid #ffffff11', marginBottom: '20px' }}>
       <div style={{ color: '#ffffff', marginBottom: '10px', fontSize: '0.6rem', letterSpacing: '2px' }}>
         [ {tt(dictionary, 'viewer.handshake', 'DOCUMENT_RENDERING')}{' // '}{progress}% ]
       </div>
       <div style={{ height: '2px', background: 'rgba(255,255,255,0.08)' }}>
         <div style={{ width: `${progress}%`, height: '100%', background: '#67e8f9', transition: 'width 60ms linear' }} />
       </div>
    </div>
  );
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function countQueryMatches(content: string, query: string) {
  if (!query.trim()) return 0;
  const matches = content.match(new RegExp(escapeRegex(query.trim()), 'gi'));
  return matches ? matches.length : 0;
}

function highlightText(text: string, query: string, keyPrefix: string) {
  if (!query.trim()) return text;
  const normalizedQuery = query.trim().toLowerCase();
  const pattern = new RegExp(`(${escapeRegex(query.trim())})`, 'ig');
  return text.split(pattern).map((part, index) => (
    part.toLowerCase() === normalizedQuery ? (
      <mark key={`${keyPrefix}-${index}`} style={{ background: 'rgba(34, 211, 238, 0.22)', color: '#f8fafc', padding: '0 2px', borderRadius: '3px', boxShadow: '0 0 10px rgba(34, 211, 238, 0.18)' }}>{part}</mark>
    ) : (
      <React.Fragment key={`${keyPrefix}-${index}`}>{part}</React.Fragment>
    )
  ));
}

export function inferDocumentFormat(fileName: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.md')) return 'markdown';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.py') || lower.endsWith('.ts') || lower.endsWith('.tsx') || lower.endsWith('.js') || lower.endsWith('.jsx') || lower.endsWith('.sh')) return 'source';
  return 'text';
}

function syntaxSegments(line: string, format: 'json' | 'source' | 'text') {
  if (format === 'text') return [{ text: line, color: '#e2e8f0' }];
  const patterns = [
    { regex: /(#.*$)/g, color: '#94a3b8' },
    { regex: /(\/\/.*$)/g, color: '#94a3b8' },
    { regex: /("([^"\\]|\\.)*")/g, color: '#67e8f9' },
    { regex: /('([^'\\]|\\.)*')/g, color: '#67e8f9' },
    { regex: /\b(true|false|null|None)\b/g, color: '#fb7185' },
    { regex: /\b(def|class|return|if|elif|else|for|while|try|except|import|from|as|await|async|with|const|let|function|export|default|interface|type)\b/g, color: '#f59e0b' },
    { regex: /\b\d+(\.\d+)?\b/g, color: '#a78bfa' },
    { regex: /([{}\[\]():.,])/g, color: '#e2e8f0' },
  ];

  const matches: Array<{ start: number; end: number; color: string }> = [];
  patterns.forEach(({ regex, color }) => {
    const localRegex = new RegExp(regex.source, regex.flags);
    let match;
    while ((match = localRegex.exec(line)) !== null) {
      matches.push({ start: match.index, end: match.index + match[0].length, color });
      if (match[0].length === 0) break;
    }
  });

  matches.sort((a, b) => a.start - b.start || b.end - a.end);
  const filtered: typeof matches = [];
  let cursor = -1;
  matches.forEach((match) => {
    if (match.start >= cursor) {
      filtered.push(match);
      cursor = match.end;
    }
  });

  const segments: Array<{ text: string; color: string }> = [];
  let position = 0;
  filtered.forEach((match) => {
    if (match.start > position) {
      segments.push({ text: line.slice(position, match.start), color: '#e2e8f0' });
    }
    segments.push({ text: line.slice(match.start, match.end), color: match.color });
    position = match.end;
  });
  if (position < line.length) {
    segments.push({ text: line.slice(position), color: '#e2e8f0' });
  }
  return segments.length ? segments : [{ text: line, color: '#e2e8f0' }];
}

function renderCodeFrame(content: string, query: string, format: 'json' | 'source' | 'text') {
  return (
    <div style={{ display: 'grid', gap: '1px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', overflow: 'hidden' }}>
      {content.split('\n').map((line, index) => {
        const queryHit = query.trim() && line.toLowerCase().includes(query.trim().toLowerCase());
        const segments = syntaxSegments(line, format);
        return (
          <div key={`code-line-${index}`} style={{ display: 'grid', gridTemplateColumns: '56px 1fr', background: queryHit ? 'rgba(34, 211, 238, 0.08)' : 'rgba(2, 6, 23, 0.72)' }}>
            <div style={{ padding: '5px 10px', textAlign: 'right', color: queryHit ? '#67e8f9' : 'rgba(255,255,255,0.38)', borderRight: '1px solid rgba(255,255,255,0.06)', fontSize: '0.72rem', fontFamily: 'var(--font-mono)' }}>
              {index + 1}
            </div>
            <div style={{ padding: '5px 14px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.8rem', lineHeight: 1.7, fontFamily: 'var(--font-mono)' }}>
              {segments.map((segment, segmentIndex) => (
                <span key={`seg-${index}-${segmentIndex}`} style={{ color: segment.color }}>
                  {highlightText(segment.text, query, `code-${index}-${segmentIndex}`)}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function renderInlineMarkdown(text: string, query: string, keyPrefix: string): React.ReactNode[] {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g).filter(Boolean);
  return tokens.map((token, index) => {
    if (/^`[^`]+`$/.test(token)) {
      return <code key={`${keyPrefix}-${index}`} style={{ fontFamily: 'var(--font-mono)', padding: '2px 6px', borderRadius: '6px', background: 'rgba(15, 23, 42, 0.9)', color: '#67e8f9' }}>{highlightText(token.slice(1, -1), query, `${keyPrefix}-code-${index}`)}</code>;
    }
    if (/^\*\*[^*]+\*\*$/.test(token)) {
      return <strong key={`${keyPrefix}-${index}`} style={{ color: '#f8fafc' }}>{highlightText(token.slice(2, -2), query, `${keyPrefix}-strong-${index}`)}</strong>;
    }
    if (/^\*[^*]+\*$/.test(token)) {
      return <em key={`${keyPrefix}-${index}`} style={{ color: '#cbd5e1' }}>{highlightText(token.slice(1, -1), query, `${keyPrefix}-em-${index}`)}</em>;
    }
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return <a key={`${keyPrefix}-${index}`} href={linkMatch[2]} target="_blank" rel="noreferrer" style={{ color: '#67e8f9', textDecoration: 'underline' }}>{highlightText(linkMatch[1], query, `${keyPrefix}-link-${index}`)}</a>;
    }
    return <React.Fragment key={`${keyPrefix}-${index}`}>{highlightText(token, query, `${keyPrefix}-text-${index}`)}</React.Fragment>;
  });
}

function renderMarkdownSurface(content: string, query: string) {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let codeFenceLanguage = '';
  let codeFenceBuffer: string[] = [];

  const flushCodeFence = (key: string) => {
    if (!codeFenceBuffer.length) return;
    blocks.push(
      <div key={key} style={{ margin: '14px 0' }}>
        {renderCodeFrame(codeFenceBuffer.join('\n'), query, codeFenceLanguage === 'json' ? 'json' : 'source')}
      </div>
    );
    codeFenceBuffer = [];
    codeFenceLanguage = '';
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      if (codeFenceLanguage) {
        flushCodeFence(`code-fence-${index}`);
      } else {
        codeFenceLanguage = trimmed.slice(3).trim() || 'source';
      }
      return;
    }

    if (codeFenceLanguage) {
      codeFenceBuffer.push(line);
      return;
    }

    if (!trimmed) {
      blocks.push(<div key={`gap-${index}`} style={{ height: '10px' }} />);
      return;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      const sizes = ['1.5rem', '1.32rem', '1.16rem', '1rem', '0.92rem', '0.86rem'];
      blocks.push(
        <div key={`heading-${index}`} style={{ marginTop: index === 0 ? 0 : '18px', marginBottom: '8px', color: '#f8fafc', fontWeight: 800, letterSpacing: '0.04em', fontSize: sizes[level - 1], textShadow: '0 0 18px rgba(255,255,255,0.1)' }}>
          {renderInlineMarkdown(heading[2], query, `heading-${index}`)}
        </div>
      );
      return;
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      blocks.push(<div key={`hr-${index}`} style={{ height: '1px', margin: '14px 0', background: 'linear-gradient(90deg, transparent, rgba(103,232,249,0.4), transparent)' }} />);
      return;
    }

    const quote = line.match(/^\s*>\s+(.*)$/);
    if (quote) {
      blocks.push(
        <div key={`quote-${index}`} style={{ margin: '10px 0', padding: '10px 14px', borderLeft: '2px solid rgba(103,232,249,0.6)', background: 'rgba(15, 23, 42, 0.54)', color: '#cbd5e1', fontStyle: 'italic' }}>
          {renderInlineMarkdown(quote[1], query, `quote-${index}`)}
        </div>
      );
      return;
    }

    const unordered = line.match(/^\s*[-*]\s+(.*)$/);
    if (unordered) {
      blocks.push(
        <div key={`li-${index}`} style={{ display: 'grid', gridTemplateColumns: '18px 1fr', gap: '10px', color: '#e2e8f0', margin: '6px 0' }}>
          <span style={{ color: '#67e8f9' }}>+</span>
          <div>{renderInlineMarkdown(unordered[1], query, `li-${index}`)}</div>
        </div>
      );
      return;
    }

    const ordered = line.match(/^\s*(\d+)\.\s+(.*)$/);
    if (ordered) {
      blocks.push(
        <div key={`ol-${index}`} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: '10px', color: '#e2e8f0', margin: '6px 0' }}>
          <span style={{ color: '#67e8f9', textAlign: 'right' }}>{ordered[1]}.</span>
          <div>{renderInlineMarkdown(ordered[2], query, `ol-${index}`)}</div>
        </div>
      );
      return;
    }

    blocks.push(
      <div key={`p-${index}`} style={{ color: '#e2e8f0', lineHeight: 1.85, margin: '7px 0' }}>
        {renderInlineMarkdown(line, query, `p-${index}`)}
      </div>
    );
  });

  flushCodeFence('code-fence-final');
  return <div>{blocks}</div>;
}

export function renderDocumentSurface(doc: OpenDocState, query: string, dictionary: Record<string, string>) {
  const format = inferDocumentFormat(doc.fileName);
  const lowerFormat = format as 'markdown' | 'json' | 'source' | 'text';

  if (lowerFormat === 'markdown') {
    return renderMarkdownSurface(doc.content, query);
  }

  if (lowerFormat === 'json') {
    try {
      const normalized = JSON.stringify(JSON.parse(doc.content), null, 2);
      return renderCodeFrame(normalized, query, 'json');
    } catch {
      return renderCodeFrame(doc.content, query, 'json');
    }
  }

  if (lowerFormat === 'source') {
    return renderCodeFrame(doc.content, query, 'source');
  }

  if (!doc.content.trim()) {
    return (
      <div style={{ color: 'rgba(255,255,255,0.56)', fontStyle: 'italic', letterSpacing: '0.06em' }}>
        {tt(dictionary, 'core.wave.stream_idle', 'STREAM_IDLE')}
      </div>
    );
  }

  return renderCodeFrame(doc.content, query, 'text');
}

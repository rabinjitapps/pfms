'use client';

import { useState, useCallback, useEffect } from 'react';
import styles from './AIAnalysisPanel.module.css';

interface Insight {
  title: string;
  detail: string;
  severity: 'positive' | 'warning' | 'tip' | 'info';
}

interface FocusAnalysisResult {
  summary: string;
  insights: Insight[];
  generatedAt: string;
}

function severityLabel(s: Insight['severity']): string {
  switch (s) {
    case 'positive':
      return 'Going well';
    case 'warning':
      return 'Needs attention';
    case 'tip':
      return 'Tip';
    default:
      return 'Note';
  }
}

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface Props {
  area: 'funds' | 'stocks' | 'expenses';
  // Lazily computed by the parent page so we don't build a payload that's
  // out of date with whatever's currently on screen (selected fund, period,
  // direction, etc). Returning null means "nothing to analyze yet".
  buildPayload: () => Record<string, unknown> | null;
  // Bumping this (e.g. to a string built from the page's current filters)
  // clears any previous result, so switching funds/periods doesn't leave a
  // stale analysis on screen next to different data.
  resetKey?: string | number;
}

export default function AIAnalysisPanel({ area, buildPayload, resetKey }: Props) {
  const [result, setResult] = useState<FocusAnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Clear any previous analysis when the parent page's filters change
  // (different fund/period/direction) so we never show an AI read of one
  // dataset sitting next to a different one now on screen.
  useEffect(() => {
    setResult(null);
    setError('');
  }, [resetKey]);

  const runAnalysis = useCallback(async () => {
    const payload = buildPayload();
    if (!payload) {
      setError('There isn\u2019t enough data here yet to analyze.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area, data: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Could not generate analysis right now.');
        setResult(null);
        return;
      }
      setResult(data);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [area, buildPayload]);

  return (
    <section className={styles.panel}>
      <div className={styles.toolbar}>
        <button className={styles.analyzeBtn} onClick={runAnalysis} disabled={loading}>
          {loading ? 'Analyzing\u2026' : result ? 'Re-analyze' : 'Analyze with AI'}
        </button>
        {result && (
          <span className={styles.generatedAt}>Generated {formatGeneratedAt(result.generatedAt)}</span>
        )}
      </div>

      {error && <p className={styles.errorBanner}>{error}</p>}

      {loading && !result && <p className={styles.loadingText}>Reading through this data\u2026</p>}

      {result && (
        <>
          <div className={styles.summaryCard}>
            <p className={styles.summaryLabel}>The picture, in short</p>
            <p className={styles.summaryText}>{result.summary}</p>
          </div>

          <div className={styles.insightGrid}>
            {result.insights.map((ins, i) => (
              <div key={i} className={`${styles.insightCard} ${styles[`sev_${ins.severity}`]}`}>
                <span className={styles.insightTag}>{severityLabel(ins.severity)}</span>
                <p className={styles.insightTitle}>{ins.title}</p>
                <p className={styles.insightDetail}>{ins.detail}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

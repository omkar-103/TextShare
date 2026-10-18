import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { usePageMeta } from '../lib/usePageMeta';
import { safeFetchJson } from '../lib/api';
import {
  computeTextDiff,
  generatePatchString,
  DiffEngineResult,
} from '../lib/diffEngine';
import {
  ArrowLeftRight,
  FileDiff,
  Copy,
  Check,
  Download,
  Trash2,
  Sparkles,
  Columns,
  ListFilter,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FileText,
  Import,
} from 'lucide-react';

const COMPARE_SAMPLES = {
  refactor: {
    title: 'Code Refactor (Async/Await)',
    original: `function fetchUserData(userId, callback) {
  var url = "/api/users/" + userId;
  http.get(url, function(err, res) {
    if (err) {
      return callback(err);
    }
    try {
      var data = JSON.parse(res.body);
      callback(null, data);
    } catch(e) {
      callback(e);
    }
  });
}`,
    modified: `async function fetchUserData(userId: string): Promise<User> {
  const url = \`/api/users/\${encodeURIComponent(userId)}\`;
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(\`Failed to fetch user: \${response.statusText}\`);
  }

  return response.json();
}`,
  },
  config: {
    title: 'Server Configuration Drift',
    original: `environment: staging
cluster: us-east-1a
replicas: 3
resources:
  memory: 4Gi
  cpu: 2000m
rate_limit:
  enabled: false
  max_requests: 1000
log_level: debug`,
    modified: `environment: production
cluster: us-central-1b
replicas: 8
resources:
  memory: 16Gi
  cpu: 8000m
rate_limit:
  enabled: true
  max_requests: 50000
log_level: warn
monitoring:
  datadog: true
  prometheus: true`,
  },
};

export const Compare: React.FC = () => {
  const [, setLocation] = useLocation();

  usePageMeta({
    title: 'Compare Two Texts Online — Free Text Diff Checker | TextShare',
    description: 'Compare two pieces of text online and highlight what was added, removed, or changed. Free to use, no signup required. Side-by-side and unified diff views.',
    canonical: `${window.location.origin}/compare`,
  });

  // Input states
  const [originalText, setOriginalText] = useState('');
  const [modifiedText, setModifiedText] = useState('');

  // Diff Options
  const [viewMode, setViewMode] = useState<'side-by-side' | 'unified'>('side-by-side');
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [hideUnchanged, setHideUnchanged] = useState(false);

  // Result state
  const [diffResult, setDiffResult] = useState<DiffEngineResult | null>(null);
  const [copiedPatch, setCopiedPatch] = useState(false);

  // AI explanation state
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Load from share modal
  const [showLoadModal, setShowLoadModal] = useState<'original' | 'modified' | null>(null);
  const [loadShareCode, setLoadShareCode] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingShare, setIsLoadingShare] = useState(false);

  // Prefill check from session storage
  useEffect(() => {
    const preloaded = sessionStorage.getItem('compare_original_preload');
    if (preloaded) {
      setOriginalText(preloaded);
      sessionStorage.removeItem('compare_original_preload');
    } else if (!originalText && !modifiedText) {
      // Default to sample refactor
      setOriginalText(COMPARE_SAMPLES.refactor.original);
      setModifiedText(COMPARE_SAMPLES.refactor.modified);
    }
  }, []);

  // Compute diff reactively
  useEffect(() => {
    const res = computeTextDiff(originalText, modifiedText, {
      ignoreWhitespace,
      ignoreCase,
    });
    setDiffResult(res);
    setAiSummary(null); // reset AI summary on text change
  }, [originalText, modifiedText, ignoreWhitespace, ignoreCase]);

  // Swap texts
  const handleSwap = () => {
    const temp = originalText;
    setOriginalText(modifiedText);
    setModifiedText(temp);
  };

  // Clear both
  const handleClearBoth = () => {
    setOriginalText('');
    setModifiedText('');
  };

  // Copy patch
  const handleCopyPatch = async () => {
    if (!diffResult) return;
    const patch = generatePatchString('original.txt', 'modified.txt', diffResult.unifiedLines);
    try {
      await navigator.clipboard.writeText(patch);
      setCopiedPatch(true);
      setTimeout(() => setCopiedPatch(false), 2000);
    } catch {
      // fallback
    }
  };

  // Download patch
  const handleDownloadPatch = () => {
    if (!diffResult) return;
    const patch = generatePatchString('original.txt', 'modified.txt', diffResult.unifiedLines);
    const blob = new Blob([patch], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `changes-${Date.now()}.patch`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Request AI diff explanation
  const handleExplainWithAi = async () => {
    if (!diffResult) return;
    setIsAiLoading(true);
    setAiError(null);

    try {
      const data = await safeFetchJson<any>('/api/compare/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalText,
          modifiedText,
          stats: diffResult.stats,
        }),
      });

      setAiSummary(data.summary);
    } catch (err: any) {
      setAiError(err.message || 'Failed to generate explanation');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Load from shared document
  const handleLoadFromShare = async () => {
    if (!loadShareCode.trim() || !showLoadModal) return;
    setIsLoadingShare(true);
    setLoadError(null);

    try {
      const data = await safeFetchJson<any>(`/api/shares/${loadShareCode.trim()}`);

      if (showLoadModal === 'original') {
        setOriginalText(data.content);
      } else {
        setModifiedText(data.content);
      }

      setShowLoadModal(null);
      setLoadShareCode('');
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load shared document');
    } finally {
      setIsLoadingShare(false);
    }
  };

  const origLines = originalText.length > 0 ? originalText.split('\n').length : 0;
  const modLines = modifiedText.length > 0 ? modifiedText.split('\n').length : 0;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-5"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div>
          <h1
            className="text-2xl sm:text-3xl font-semibold tracking-tight flex items-center gap-2.5"
            style={{ color: 'var(--color-text-primary)' }}
          >
            <FileDiff className="h-7 w-7" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
            Compare two texts online — free diff checker
          </h1>
          <p className="mt-1.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Paste two pieces of text to find what was added, removed, or changed. Works locally in your browser — no files are uploaded to any server.
            {' '}
            <a href="/" style={{ color: 'var(--color-accent)' }} className="hover:underline">Share text instead →</a>
          </p>
        </div>

        {/* Global Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSwap}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            title="Swap Original and Modified text"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            <span>Swap</span>
          </button>

          <button
            type="button"
            onClick={handleClearBoth}
            disabled={!originalText && !modifiedText}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Clear Both</span>
          </button>

          <button
            type="button"
            onClick={handleCopyPatch}
            disabled={!diffResult || diffResult.isIdentical}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {copiedPatch ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedPatch ? 'Copied' : 'Copy Diff'}</span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPatch}
            disabled={!diffResult || diffResult.isIdentical}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export .patch</span>
          </button>

          <button
            type="button"
            onClick={handleExplainWithAi}
            disabled={isAiLoading || !diffResult || diffResult.isIdentical}
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            <span>{isAiLoading ? 'Analyzing...' : 'Explain with AI'}</span>
          </button>
        </div>
      </div>

      {/* Preset Samples */}
      <div className="my-4 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span>Load benchmark sample:</span>
        <button
          type="button"
          onClick={() => {
            setOriginalText(COMPARE_SAMPLES.refactor.original);
            setModifiedText(COMPARE_SAMPLES.refactor.modified);
          }}
          className="rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          {COMPARE_SAMPLES.refactor.title}
        </button>
        <button
          type="button"
          onClick={() => {
            setOriginalText(COMPARE_SAMPLES.config.original);
            setModifiedText(COMPARE_SAMPLES.config.modified);
          }}
          className="rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
        >
          {COMPARE_SAMPLES.config.title}
        </button>
      </div>

      {/* Two Input Editors */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Original Text Panel */}
        <div className="flex flex-col rounded-lg border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/70 px-4 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-900 dark:text-white uppercase tracking-wider">
                Original Text (Base)
              </span>
              <span className="text-zinc-400">({origLines} lines)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLoadModal('original')}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                <Import className="h-3 w-3" />
                Load from Share
              </button>
              <button
                type="button"
                onClick={() => setOriginalText('')}
                className="text-[11px] text-zinc-400 hover:text-red-500"
              >
                Clear
              </button>
            </div>
          </div>
          <textarea
            value={originalText}
            onChange={(e) => setOriginalText(e.target.value)}
            placeholder="Paste or type original version here..."
            spellCheck={false}
            className="min-h-[220px] w-full resize-y p-3 font-mono text-xs text-zinc-900 outline-none leading-5 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>

        {/* Modified Text Panel */}
        <div className="flex flex-col rounded-lg border border-zinc-200 bg-white shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50/70 px-4 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-950">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-zinc-900 dark:text-white uppercase tracking-wider">
                Modified Text (New)
              </span>
              <span className="text-zinc-400">({modLines} lines)</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLoadModal('modified')}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                <Import className="h-3 w-3" />
                Load from Share
              </button>
              <button
                type="button"
                onClick={() => setModifiedText('')}
                className="text-[11px] text-zinc-400 hover:text-red-500"
              >
                Clear
              </button>
            </div>
          </div>
          <textarea
            value={modifiedText}
            onChange={(e) => setModifiedText(e.target.value)}
            placeholder="Paste or type modified version here..."
            spellCheck={false}
            className="min-h-[220px] w-full resize-y p-3 font-mono text-xs text-zinc-900 outline-none leading-5 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
      </div>

      {/* Diff Controls & Statistics Bar */}
      <div className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          {/* View Toggles */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {/* Side-by-side vs Unified */}
            <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => setViewMode('side-by-side')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
                  viewMode === 'side-by-side'
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400'
                }`}
              >
                <Columns className="h-3.5 w-3.5" />
                Side-by-Side
              </button>
              <button
                type="button"
                onClick={() => setViewMode('unified')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors ${
                  viewMode === 'unified'
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400'
                }`}
              >
                <ListFilter className="h-3.5 w-3.5" />
                Unified Diff
              </button>
            </div>

            {/* Options */}
            <label className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={ignoreWhitespace}
                onChange={(e) => setIgnoreWhitespace(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700"
              />
              <span>Ignore Whitespace</span>
            </label>

            <label className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={ignoreCase}
                onChange={(e) => setIgnoreCase(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700"
              />
              <span>Ignore Case</span>
            </label>

            <label className="flex items-center gap-1.5 text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={hideUnchanged}
                onChange={(e) => setHideUnchanged(e.target.checked)}
                className="rounded border-zinc-300 dark:border-zinc-700"
              />
              <span>Hide Unchanged</span>
            </label>
          </div>

          {/* Diff Metrics */}
          {diffResult && (
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <span>+{diffResult.stats.addedLines}</span>
                <span className="font-normal text-zinc-500">additions</span>
              </span>
              <span className="flex items-center gap-1 font-semibold text-red-600 dark:text-red-400">
                <span>-{diffResult.stats.removedLines}</span>
                <span className="font-normal text-zinc-500">deletions</span>
              </span>
              <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                <span>~{diffResult.stats.modifiedLines}</span>
                <span className="font-normal text-zinc-500">modified</span>
              </span>
              <span className="text-zinc-400 dark:text-zinc-600">|</span>
              <span className="text-zinc-500">
                Chars: {diffResult.stats.charDiff > 0 ? `+${diffResult.stats.charDiff}` : diffResult.stats.charDiff}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* AI Explanation Banner */}
      {aiSummary && (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50/80 p-5 dark:border-amber-900/50 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 mb-2 text-amber-900 dark:text-amber-200 font-semibold text-sm">
            <Sparkles className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span>AI Difference Analysis (Gemini)</span>
            <span className="rounded bg-amber-200/80 px-2 py-0.5 text-[10px] font-mono text-amber-950 dark:bg-amber-900 dark:text-amber-200">
              AI-generated summary
            </span>
          </div>
          <div className="text-xs text-amber-950/90 dark:text-amber-200/90 leading-relaxed whitespace-pre-wrap font-sans">
            {aiSummary}
          </div>
        </div>
      )}

      {aiError && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {aiError}
        </div>
      )}

      {/* Identical Documents Notice */}
      {diffResult?.isIdentical && originalText.trim().length > 0 && (
        <div className="mt-6 flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 p-8 text-center text-sm font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          <span>No differences found. Both text documents are identical.</span>
        </div>
      )}

      {/* Missing-Content Analysis Diagnostic Box */}
      {diffResult && !diffResult.isIdentical && (
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* What is missing in modified text */}
          <div className="rounded-lg border border-red-200/70 bg-red-50/40 p-4 text-xs dark:border-red-950 dark:bg-red-950/20">
            <h4 className="font-semibold text-red-900 dark:text-red-300 flex items-center gap-1.5 mb-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-200 text-red-800 dark:bg-red-900 dark:text-red-200 font-mono text-[10px] font-bold">
                -
              </span>
              Missing from Modified ({diffResult.missingFromModified.length} items)
            </h4>
            {diffResult.missingFromModified.length > 0 ? (
              <ul className="space-y-1 font-mono text-[11px] text-red-800 dark:text-red-400 max-h-36 overflow-y-auto">
                {diffResult.missingFromModified.slice(0, 10).map((item, idx) => (
                  <li key={idx} className="truncate bg-red-100/60 px-1.5 py-0.5 rounded dark:bg-red-950/60">
                    {item.trim() || '<empty line>'}
                  </li>
                ))}
                {diffResult.missingFromModified.length > 10 && (
                  <li className="text-[10px] text-red-600 italic">
                    +{diffResult.missingFromModified.length - 10} more missing items...
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-zinc-500 italic">No content was removed.</p>
            )}
          </div>

          {/* What was added in modified text */}
          <div className="rounded-lg border border-emerald-200/70 bg-emerald-50/40 p-4 text-xs dark:border-emerald-950 dark:bg-emerald-950/20">
            <h4 className="font-semibold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5 mb-2">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-200 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 font-mono text-[10px] font-bold">
                +
              </span>
              Newly Added in Modified ({diffResult.addedToModified.length} items)
            </h4>
            {diffResult.addedToModified.length > 0 ? (
              <ul className="space-y-1 font-mono text-[11px] text-emerald-800 dark:text-emerald-400 max-h-36 overflow-y-auto">
                {diffResult.addedToModified.slice(0, 10).map((item, idx) => (
                  <li key={idx} className="truncate bg-emerald-100/60 px-1.5 py-0.5 rounded dark:bg-emerald-950/60">
                    {item.trim() || '<empty line>'}
                  </li>
                ))}
                {diffResult.addedToModified.length > 10 && (
                  <li className="text-[10px] text-emerald-600 italic">
                    +{diffResult.addedToModified.length - 10} more additions...
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-zinc-500 italic">No content was added.</p>
            )}
          </div>
        </div>
      )}

      {/* DIFF DISPLAY VIEWS */}
      {diffResult && !diffResult.isIdentical && (
        <div className="mt-6 rounded-lg border border-zinc-200 bg-white shadow-xs overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
          {viewMode === 'side-by-side' ? (
            /* Side-by-side View */
            <div className="overflow-x-auto">
              <table className="w-full border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-[11px] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
                    <th className="w-12 px-2 py-2 text-right">#</th>
                    <th className="w-1/2 border-r border-zinc-200 px-3 py-2 dark:border-zinc-800">
                      Original
                    </th>
                    <th className="w-12 px-2 py-2 text-right">#</th>
                    <th className="w-1/2 px-3 py-2">Modified</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {diffResult.sideBySidePairs
                    .filter((pair) => !hideUnchanged || pair.type !== 'unchanged')
                    .map((pair, index) => {
                      if (pair.type === 'removed') {
                        return (
                          <tr key={index} className="bg-red-50/70 dark:bg-red-950/30">
                            <td className="px-2 py-1 text-right text-red-500 select-none">
                              {pair.originalLineNumber}
                            </td>
                            <td className="border-r border-zinc-200 px-3 py-1 text-red-900 dark:border-zinc-800 dark:text-red-300 whitespace-pre-wrap break-all">
                              - {pair.originalText}
                            </td>
                            <td className="px-2 py-1 text-right text-zinc-300 select-none">-</td>
                            <td className="px-3 py-1 text-zinc-300 italic select-none"></td>
                          </tr>
                        );
                      }
                      if (pair.type === 'added') {
                        return (
                          <tr key={index} className="bg-emerald-50/70 dark:bg-emerald-950/30">
                            <td className="px-2 py-1 text-right text-zinc-300 select-none">-</td>
                            <td className="border-r border-zinc-200 px-3 py-1 text-zinc-300 dark:border-zinc-800 italic select-none"></td>
                            <td className="px-2 py-1 text-right text-emerald-500 select-none">
                              {pair.modifiedLineNumber}
                            </td>
                            <td className="px-3 py-1 text-emerald-900 dark:text-emerald-300 whitespace-pre-wrap break-all">
                              + {pair.modifiedText}
                            </td>
                          </tr>
                        );
                      }
                      if (pair.type === 'modified') {
                        return (
                          <tr key={index} className="bg-amber-50/60 dark:bg-amber-950/20">
                            <td className="px-2 py-1 text-right text-red-500 select-none">
                              {pair.originalLineNumber}
                            </td>
                            <td className="border-r border-zinc-200 px-3 py-1 text-red-900 dark:border-zinc-800 dark:text-red-300 bg-red-50/50 dark:bg-red-950/30 whitespace-pre-wrap break-all">
                              ~ {pair.originalText}
                            </td>
                            <td className="px-2 py-1 text-right text-emerald-500 select-none">
                              {pair.modifiedLineNumber}
                            </td>
                            <td className="px-3 py-1 text-emerald-900 dark:text-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/30 whitespace-pre-wrap break-all">
                              ~ {pair.modifiedText}
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={index} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                          <td className="px-2 py-1 text-right text-zinc-400 select-none">
                            {pair.originalLineNumber}
                          </td>
                          <td className="border-r border-zinc-200 px-3 py-1 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300 whitespace-pre-wrap break-all">
                            {pair.originalText}
                          </td>
                          <td className="px-2 py-1 text-right text-zinc-400 select-none">
                            {pair.modifiedLineNumber}
                          </td>
                          <td className="px-3 py-1 text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap break-all">
                            {pair.modifiedText}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Unified Diff View */
            <div className="p-3 font-mono text-xs overflow-x-auto">
              {diffResult.unifiedLines
                .filter((line) => !hideUnchanged || line.type !== 'context')
                .map((line, index) => {
                  let rowStyle = 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50';
                  let prefix = ' ';
                  if (line.type === 'addition') {
                    rowStyle = 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold';
                    prefix = '+';
                  } else if (line.type === 'deletion') {
                    rowStyle = 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-300 font-semibold';
                    prefix = '-';
                  }

                  return (
                    <div key={index} className={`flex py-0.5 px-2 rounded-xs ${rowStyle}`}>
                      <span className="w-10 select-none text-right text-zinc-400 pr-3 text-[10px]">
                        {line.newLineNumber || line.oldLineNumber || ''}
                      </span>
                      <span className="w-4 select-none text-center font-bold">{prefix}</span>
                      <span className="whitespace-pre-wrap break-all">{line.text}</span>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* Load from Share Code Modal */}
      {showLoadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-bold text-zinc-900 dark:text-white text-base">
              Load into {showLoadModal === 'original' ? 'Original' : 'Modified'}
            </h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Enter an authorized share code to import its content directly.
            </p>

            <div className="mt-4 space-y-3">
              <input
                type="text"
                value={loadShareCode}
                onChange={(e) => setLoadShareCode(e.target.value)}
                placeholder="e.g. a7K9mQ2xP8"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs font-mono text-zinc-900 outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />

              {loadError && <p className="text-xs text-red-600">{loadError}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLoadModal(null)}
                  className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleLoadFromShare}
                  disabled={isLoadingShare || !loadShareCode.trim()}
                  className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoadingShare ? 'Loading...' : 'Import Content'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SEO explanatory content ──────────────────────────────────────── */}
      <section
        className="mt-14 border-t pt-10"
        style={{ borderColor: 'var(--color-border)' }}
        aria-label="How text comparison works"
      >
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div>
            <h2 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
              How to compare two texts
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Paste the original text on the left and the modified text on the right. The diff checker
              instantly highlights additions (new text), deletions (removed text), and modifications.
              You can also load content directly from a TextShare link.
            </p>
          </div>
          <div>
            <h2 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
              Understanding diff results
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              <strong>Green highlights with a "+" prefix</strong> indicate text that was added.
              <strong> Red highlights with a "−" prefix</strong> indicate text that was removed.
              Modified lines show both the old and new version so you can see exactly what changed.
              Statistics summarize the total additions, deletions, and unchanged lines.
            </p>
          </div>
          <div>
            <h2 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
              Side-by-side or unified view
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              Switch between side-by-side view (two columns) and unified view (single column with
              additions and deletions interleaved). Use side-by-side for quick visual comparison.
              Use unified view for a patch-style diff you can copy or download.
            </p>
          </div>
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
            Common uses for text comparison
          </h2>
          <ul
            className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 list-disc list-inside"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <li>Compare two versions of source code or configuration</li>
            <li>Find what changed between document drafts</li>
            <li>Review edits before merging or publishing</li>
            <li>Verify that a config change matches expectations</li>
            <li>Check for accidental whitespace or formatting changes</li>
            <li>Compare server logs from different time periods</li>
          </ul>
        </div>

        <div
          className="mt-8 border-t pt-6"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            All text comparison happens locally in your browser. Your text is not uploaded to any server unless you
            use the optional AI summary feature. No sign-up is required.
            {' '}
            <a href="/" style={{ color: 'var(--color-accent)' }} className="underline">
              Need to share text instead? Create a free share link →
            </a>
          </p>
        </div>
      </section>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useRoute, Link, useLocation } from 'wouter';
import { getOwnerTokenForShare } from '../lib/storage';
import { usePageMeta } from '../lib/usePageMeta';
import { DocumentVersion } from '../types';
import { computeTextDiff } from '../lib/diffEngine';
import { safeFetchJson } from '../lib/api';
import {
  History,
  ArrowLeft,
  RotateCcw,
  Clock,
  User,
  Check,
  AlertCircle,
  FileDiff,
  FileText,
} from 'lucide-react';

export const VersionHistory: React.FC = () => {
  const [, params] = useRoute('/s/:shareCode/history');
  const [, setLocation] = useLocation();
  const shareCode = params?.shareCode || '';

  usePageMeta({
    title: 'Version History | TextShare',
    description: 'Browse version history for a shared document.',
    noindex: true,
  });

  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [currentContent, setCurrentContent] = useState<string>('');
  const [selectedVersion, setSelectedVersion] = useState<DocumentVersion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  const fetchVersions = async () => {
    try {
      setIsLoading(true);
      const ownerToken = getOwnerTokenForShare(shareCode);
      const headers: Record<string, string> = {};
      if (ownerToken) headers['x-owner-token'] = ownerToken;

      // 1. Fetch document metadata for current content
      const docData = await safeFetchJson<any>(`/api/shares/${shareCode}`, { headers });
      setCurrentContent(docData.content);

      // 2. Fetch versions
      const data = await safeFetchJson<any>(`/api/shares/${shareCode}/versions`, { headers });
      setVersions(data.versions || []);
      if (data.versions && data.versions.length > 0) {
        setSelectedVersion(data.versions[0]);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading version history');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (shareCode) {
      fetchVersions();
    }
  }, [shareCode]);

  const handleRestore = async (version: DocumentVersion) => {
    setIsRestoring(true);
    try {
      const ownerToken = getOwnerTokenForShare(shareCode);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (ownerToken) headers['x-owner-token'] = ownerToken;

      await safeFetchJson(`/api/shares/${shareCode}/versions/${version.id}/restore`, {
        method: 'POST',
        headers,
      });

      setRestoreSuccess(true);
      setTimeout(() => {
        setLocation(`/s/${shareCode}`);
      }, 1200);
    } catch (err: any) {
      alert(err.message || 'Failed to restore version');
      setIsRestoring(false);
    }
  };

  // Diff between selected version and current version
  const diff = selectedVersion
    ? computeTextDiff(selectedVersion.content, currentContent)
    : null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href={`/s/${shareCode}`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to Document
            </Link>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2">
            <History className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            Version History &amp; Restoration
          </h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Inspect historical snapshots of share <code className="font-mono text-blue-600">{shareCode}</code> and compare changes against the active revision.
          </p>
        </div>

        {selectedVersion && (
          <button
            type="button"
            onClick={() => handleRestore(selectedVersion)}
            disabled={isRestoring || restoreSuccess}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 disabled:opacity-50"
          >
            {restoreSuccess ? (
              <>
                <Check className="h-4 w-4" />
                <span>Restored! Redirecting...</span>
              </>
            ) : (
              <>
                <RotateCcw className={`h-4 w-4 ${isRestoring ? 'animate-spin' : ''}`} />
                <span>Restore Version #{selectedVersion.versionNumber}</span>
              </>
            )}
          </button>
        )}
      </div>

      {error ? (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-950 dark:bg-red-950/40">
          <AlertCircle className="mx-auto h-8 w-8 text-red-600" />
          <h3 className="mt-2 font-bold text-red-900 dark:text-red-300">Access Restricted</h3>
          <p className="mt-1 text-xs text-red-700 dark:text-red-400">{error}</p>
        </div>
      ) : isLoading ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="mt-3 text-xs text-zinc-500">Loading document revision history...</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Version List Sidebar */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-semibold text-xs uppercase tracking-wider text-zinc-500 mb-3">
              Revision Timeline ({versions.length})
            </h3>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {versions.map((ver) => (
                <button
                  key={ver.id}
                  type="button"
                  onClick={() => setSelectedVersion(ver)}
                  className={`w-full text-left rounded-lg p-3 transition-colors border ${
                    selectedVersion?.id === ver.id
                      ? 'border-blue-600 bg-blue-50/70 dark:border-blue-500 dark:bg-blue-950/40'
                      : 'border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-zinc-900 dark:text-white">
                      Version #{ver.versionNumber}
                    </span>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {new Date(ver.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300 line-clamp-1">
                    {ver.changeSummary || 'Collaborative edit'}
                  </p>
                  <div className="mt-2 flex items-center gap-2 text-[10px] text-zinc-400">
                    <User className="h-3 w-3" />
                    <span>{ver.actorName || 'Editor'}</span>
                    <span>•</span>
                    <Clock className="h-3 w-3" />
                    <span>{new Date(ver.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Version Content & Diff against active */}
          <div className="lg:col-span-2 space-y-6">
            {selectedVersion && diff && (
              <>
                {/* Diff Stats Banner */}
                <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-semibold text-zinc-900 dark:text-white">
                      Comparing Version #{selectedVersion.versionNumber} against Active Revision
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-600 font-semibold">+{diff.stats.addedLines} added</span>
                    <span className="text-red-600 font-semibold">-{diff.stats.removedLines} deleted</span>
                    <span className="text-amber-600 font-semibold">~{diff.stats.modifiedLines} modified</span>
                  </div>
                </div>

                {/* Diff View */}
                <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden dark:border-zinc-800 dark:bg-zinc-900 font-mono text-xs">
                  <div className="border-b border-zinc-200 bg-zinc-50/70 px-4 py-2 text-[11px] font-semibold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
                    Changes from Version #{selectedVersion.versionNumber} to Current
                  </div>
                  <div className="p-3 max-h-[480px] overflow-y-auto">
                    {diff.unifiedLines.map((line, idx) => {
                      let style = 'text-zinc-700 dark:text-zinc-300';
                      let prefix = ' ';
                      if (line.type === 'addition') {
                        style = 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 font-semibold';
                        prefix = '+';
                      } else if (line.type === 'deletion') {
                        style = 'bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-300 font-semibold';
                        prefix = '-';
                      }
                      return (
                        <div key={idx} className={`py-0.5 px-2 rounded-xs whitespace-pre-wrap break-all ${style}`}>
                          <span className="select-none font-bold mr-2">{prefix}</span>
                          <span>{line.text}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Snapshot Raw Text */}
                <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="border-b border-zinc-200 bg-zinc-50/70 px-4 py-2 text-[11px] font-semibold text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950">
                    Version #{selectedVersion.versionNumber} Snapshot Content ({selectedVersion.content.length.toLocaleString()} chars)
                  </div>
                  <pre className="p-4 font-mono text-xs text-zinc-800 dark:text-zinc-200 overflow-x-auto whitespace-pre-wrap max-h-72">
                    {selectedVersion.content}
                  </pre>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

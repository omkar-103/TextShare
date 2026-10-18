import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { usePageMeta } from '../lib/usePageMeta';
import {
  getStoredOwnerTokens,
  removeOwnerToken,
  exportTokensAsJson,
  importTokensFromJson,
} from '../lib/storage';
import {
  FolderLock,
  Search,
  Filter,
  ExternalLink,
  Copy,
  Check,
  Clock,
  Eye,
  Edit3,
  Shield,
  Trash2,
  AlertTriangle,
  History,
  Download,
  Upload,
  RefreshCw,
  Plus,
} from 'lucide-react';

interface ManagedShare {
  id: string;
  shareCode: string;
  title: string;
  contentPreview: string;
  permissionMode: 'view' | 'edit';
  language: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
  contentVersion: number;
  viewCount: number;
  status: 'active' | 'expired' | 'revoked';
  hasPassword: boolean;
}

export const MyShares: React.FC = () => {
  usePageMeta({
    title: 'My Shares | TextShare',
    description: 'Manage your shared text links. View, edit, extend, copy, and revoke your TextShare documents.',
    noindex: true,
  });

  const [shares, setShares] = useState<ManagedShare[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired' | 'revoked'>('all');
  const [sortBy, setSortBy] = useState<'created_desc' | 'updated_desc' | 'expires_asc'>('created_desc');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Dialog states
  const [actionShare, setActionShare] = useState<ManagedShare | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedShare | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<ManagedShare | null>(null);
  const [extendTarget, setExtendTarget] = useState<ManagedShare | null>(null);
  const [extendDuration, setExtendDuration] = useState('1d');

  // Backup modal
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [importText, setImportText] = useState('');
  const [importStatus, setImportStatus] = useState<string | null>(null);

  const fetchSharesFromBackend = async () => {
    setIsLoading(true);
    const localTokens = getStoredOwnerTokens();
    const tokenStrings = localTokens.map((t) => t.ownerToken);

    if (tokenStrings.length === 0) {
      setShares([]);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/my-shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerTokens: tokenStrings }),
      });

      const data = await res.json();
      if (res.ok && data.shares) {
        setShares(data.shares);
      }
    } catch (err) {
      console.error('Failed to load owned shares from database', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSharesFromBackend();
  }, []);

  const handleCopyLink = async (shareCode: string) => {
    const url = `${window.location.origin}/s/${shareCode}`;
    await navigator.clipboard.writeText(url);
    setCopiedCode(shareCode);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    const localToken = getStoredOwnerTokens().find((t) => t.shareCode === revokeTarget.shareCode);
    if (!localToken) return;

    try {
      const res = await fetch(`/api/shares/${revokeTarget.shareCode}/revoke`, {
        method: 'POST',
        headers: { 'x-owner-token': localToken.ownerToken },
      });

      if (res.ok) {
        setRevokeTarget(null);
        fetchSharesFromBackend();
      }
    } catch (err) {
      console.error('Revoke failed', err);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const localToken = getStoredOwnerTokens().find((t) => t.shareCode === deleteTarget.shareCode);
    if (!localToken) return;

    try {
      const res = await fetch(`/api/shares/${deleteTarget.shareCode}`, {
        method: 'DELETE',
        headers: { 'x-owner-token': localToken.ownerToken },
      });

      if (res.ok) {
        removeOwnerToken(deleteTarget.shareCode);
        setDeleteTarget(null);
        fetchSharesFromBackend();
      }
    } catch (err) {
      console.error('Delete failed', err);
    }
  };

  const handleTogglePermission = async (share: ManagedShare) => {
    const localToken = getStoredOwnerTokens().find((t) => t.shareCode === share.shareCode);
    if (!localToken) return;

    const newMode = share.permissionMode === 'edit' ? 'view' : 'edit';
    try {
      const res = await fetch(`/api/shares/${share.shareCode}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-owner-token': localToken.ownerToken,
        },
        body: JSON.stringify({ permissionMode: newMode }),
      });

      if (res.ok) {
        fetchSharesFromBackend();
      }
    } catch (err) {
      console.error('Failed to change permission', err);
    }
  };

  const handleExtendExpiration = async () => {
    if (!extendTarget) return;
    const localToken = getStoredOwnerTokens().find((t) => t.shareCode === extendTarget.shareCode);
    if (!localToken) return;

    try {
      const res = await fetch(`/api/shares/${extendTarget.shareCode}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-owner-token': localToken.ownerToken,
        },
        body: JSON.stringify({ duration: extendDuration }),
      });

      if (res.ok) {
        setExtendTarget(null);
        fetchSharesFromBackend();
      }
    } catch (err) {
      console.error('Failed to extend expiration', err);
    }
  };

  // Filter & Sort
  const filteredShares = shares
    .filter((s) => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          s.title.toLowerCase().includes(q) ||
          s.shareCode.toLowerCase().includes(q) ||
          s.contentPreview.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'created_desc') return b.createdAt - a.createdAt;
      if (sortBy === 'updated_desc') return b.updatedAt - a.updatedAt;
      if (sortBy === 'expires_asc') {
        if (!a.expiresAt) return 1;
        if (!b.expiresAt) return -1;
        return a.expiresAt - b.expiresAt;
      }
      return 0;
    });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 pb-5 dark:border-zinc-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white flex items-center gap-2.5">
            <FolderLock className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            My Shares Dashboard
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
            Authoritative database records of documents created by you. Manage expiration, permissions, and revocations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowBackupModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            title="Backup or restore ownership tokens"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Sync / Backup</span>
          </button>
          <button
            type="button"
            onClick={fetchSharesFromBackend}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white p-2 text-xs text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            title="Refresh dashboard"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New Share</span>
          </Link>
        </div>
      </div>

      {/* Search, Filter & Sort Controls */}
      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, code, or content..."
            className="w-full rounded-lg border border-zinc-200 bg-white pl-9 pr-3 py-2 text-xs text-zinc-900 shadow-xs outline-none focus:border-blue-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
          />
        </div>

        {/* Status Filter */}
        <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-800 dark:bg-zinc-900 text-xs">
          {(['all', 'active', 'expired', 'revoked'] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              onClick={() => setStatusFilter(filter)}
              className={`flex-1 rounded-md py-1.5 font-medium capitalize transition-colors ${
                statusFilter === filter
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400'
              }`}
            >
              {filter}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div>
          <select
            value={sortBy}
            onChange={(e: any) => setSortBy(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 shadow-xs outline-none dark:border-zinc-800 dark:bg-zinc-900 dark:text-white"
          >
            <option value="created_desc">Newest First</option>
            <option value="updated_desc">Recently Updated</option>
            <option value="expires_asc">Expiring Soonest</option>
          </select>
        </div>
      </div>

      {/* Share Cards / List */}
      {isLoading ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <p className="mt-3 text-xs text-zinc-500">Querying database for owned shares...</p>
        </div>
      ) : filteredShares.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-800">
          <FolderLock className="mx-auto h-10 w-10 text-zinc-400" />
          <h3 className="mt-3 text-sm font-semibold text-zinc-900 dark:text-white">
            {shares.length === 0 ? 'No shares created yet' : 'No matching shares found'}
          </h3>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {shares.length === 0
              ? 'Documents you create will automatically appear here with management capability.'
              : 'Try adjusting your search query or filter settings.'}
          </p>
          {shares.length === 0 && (
            <div className="mt-5">
              <Link
                href="/"
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Create First Share
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredShares.map((share) => (
            <div
              key={share.id}
              className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-xs transition-shadow hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div>
                {/* Status Header */}
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium capitalize ${
                      share.status === 'active'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : share.status === 'expired'
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        share.status === 'active'
                          ? 'bg-emerald-500'
                          : share.status === 'expired'
                          ? 'bg-amber-500'
                          : 'bg-red-500'
                      }`}
                    />
                    {share.status}
                  </span>

                  <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {share.shareCode}
                  </span>
                </div>

                {/* Title */}
                <h3 className="mt-3 font-semibold text-zinc-900 dark:text-white text-sm line-clamp-1">
                  {share.title}
                </h3>

                {/* Preview */}
                <p className="mt-1 font-mono text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 bg-zinc-50 p-2 rounded dark:bg-zinc-950/60">
                  {share.contentPreview || '<empty document>'}
                </p>

                {/* Metadata */}
                <div className="mt-4 space-y-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  <div className="flex justify-between">
                    <span>Permission:</span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200 capitalize">
                      {share.permissionMode === 'edit' ? 'Can Edit (Live)' : 'View Only'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Expires:</span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {share.expiresAt ? new Date(share.expiresAt).toLocaleDateString() : 'Never'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Views:</span>
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">
                      {share.viewCount} views • Rev #{share.contentVersion}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 border-t border-zinc-100 pt-3 dark:border-zinc-800/80">
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCopyLink(share.shareCode)}
                      className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800"
                      title="Copy Share Link"
                    >
                      {copiedCode === share.shareCode ? (
                        <Check className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleTogglePermission(share)}
                      className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800"
                      title={`Toggle to ${share.permissionMode === 'edit' ? 'View Only' : 'Can Edit'}`}
                    >
                      {share.permissionMode === 'edit' ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <Edit3 className="h-4 w-4" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => setExtendTarget(share)}
                      className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800"
                      title="Extend Expiration"
                    >
                      <Clock className="h-4 w-4" />
                    </button>

                    {share.status === 'active' && (
                      <button
                        type="button"
                        onClick={() => setRevokeTarget(share)}
                        className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                        title="Revoke Access"
                      >
                        <Shield className="h-4 w-4" />
                      </button>
                    )}

                    <Link
                      href={`/s/${share.shareCode}/history`}
                      className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800"
                      title="Version History"
                    >
                      <History className="h-4 w-4" />
                    </Link>

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(share)}
                      className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                      title="Delete Share"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>

                  <Link
                    href={`/s/${share.shareCode}`}
                    className="inline-flex items-center gap-1 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
                  >
                    <span>Open</span>
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Revoke Confirmation Dialog */}
      {revokeTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-bold text-zinc-900 dark:text-white text-base">
              Revoke Share: {revokeTarget.shareCode}?
            </h3>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              This will immediately cut off access to anyone holding the link and terminate live collaboration sessions.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRevokeTarget(null)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevoke}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                Revoke Access
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-bold text-zinc-900 dark:text-white text-base">
              Permanently Delete Share?
            </h3>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Document {deleteTarget.shareCode} will be deleted from the database along with all revision snapshots.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Expiration Modal */}
      {extendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-bold text-zinc-900 dark:text-white text-base">
              Extend Expiration: {extendTarget.shareCode}
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Select new duration from now:
            </p>
            <div className="mt-4">
              <select
                value={extendDuration}
                onChange={(e) => setExtendDuration(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option value="1h">+1 Hour</option>
                <option value="12h">+12 Hours</option>
                <option value="1d">+1 Day</option>
                <option value="3d">+3 Days</option>
                <option value="7d">+7 Days</option>
                <option value="30d">+30 Days</option>
                <option value="never">Never Expires</option>
              </select>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setExtendTarget(null)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExtendExpiration}
                className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
              >
                Update Expiration
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cross-Device Token Sync & Backup Modal */}
      {showBackupModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-bold text-zinc-900 dark:text-white text-base flex items-center gap-2">
              <Download className="h-5 w-5 text-blue-600" />
              Ownership Capability Sync
            </h3>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              Because TextShare uses capability security without requiring account registration, you can backup or import your ownership tokens to manage your documents across devices.
            </p>

            <div className="mt-4 space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const json = exportTokensAsJson();
                    const blob = new Blob([json], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `textshare-tokens-${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                >
                  Export Tokens to File
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(exportTokensAsJson());
                    setImportStatus('Tokens copied to clipboard!');
                    setTimeout(() => setImportStatus(null), 3000);
                  }}
                  className="flex-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                >
                  Copy Tokens JSON
                </button>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-zinc-500 mb-1">
                  Import Tokens from JSON:
                </label>
                <textarea
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  placeholder="Paste tokens JSON here to import on this device..."
                  rows={4}
                  className="w-full rounded-lg border border-zinc-300 p-2 font-mono text-xs outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>

              {importStatus && (
                <p className="text-xs text-emerald-600 font-medium">{importStatus}</p>
              )}

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setShowBackupModal(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-300"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (importTokensFromJson(importText)) {
                      setImportStatus('Successfully imported! Refreshing dashboard...');
                      setTimeout(() => {
                        setShowBackupModal(false);
                        fetchSharesFromBackend();
                      }, 1000);
                    } else {
                      setImportStatus('Invalid JSON format.');
                    }
                  }}
                  disabled={!importText.trim()}
                  className="rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  Import Tokens
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

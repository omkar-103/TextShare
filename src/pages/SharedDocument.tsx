import React, { useState, useEffect, useRef } from 'react';
import { useRoute, useLocation, Link } from 'wouter';
import { Editor } from '../components/Editor';
import { getOwnerTokenForShare, removeOwnerToken } from '../lib/storage';
import { usePageMeta } from '../lib/usePageMeta';
import { Participant, SharedDocument as SharedDocType } from '../types';
import {
  Users,
  Eye,
  Edit3,
  Clock,
  Shield,
  Copy,
  Check,
  FileDiff,
  History,
  AlertTriangle,
  Lock,
  Trash2,
  RefreshCw,
  Share2,
  ExternalLink,
} from 'lucide-react';

export const SharedDocument: React.FC = () => {
  const [, params] = useRoute('/s/:shareCode');
  const [, setLocation] = useLocation();
  const shareCode = params?.shareCode || '';

  // Noindex all shared text pages — user content should not appear in search results
  usePageMeta({
    title: 'Shared Document | TextShare',
    description: 'View shared text on TextShare.',
    noindex: true,
  });

  // Document states
  const [doc, setDoc] = useState<SharedDocType | null>(null);
  const [content, setContent] = useState('');
  const [version, setVersion] = useState(1);
  const [isOwner, setIsOwner] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [permissionMode, setPermissionMode] = useState<'view' | 'edit'>('view');
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  // Status & Connection
  const [isLoading, setIsLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<
    'connecting' | 'connected' | 'reconnecting' | 'disconnected'
  >('connecting');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [expiredError, setExpiredError] = useState<boolean>(false);
  const [revokedError, setRevokedError] = useState<boolean>(false);
  const [notFoundError, setNotFoundError] = useState<boolean>(false);
  const [passwordRequired, setPasswordRequired] = useState<boolean>(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Collaboration presence
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);

  // Owner Toolbar Modals
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const myClientIdRef = useRef<string>(`client_${Math.random().toString(36).slice(2, 9)}`);
  const reconnectTimeoutRef = useRef<any>(null);

  // Initial fetch from REST API
  const fetchDocMetadata = async (providedPassword?: string) => {
    try {
      setIsLoading(true);
      const ownerToken = getOwnerTokenForShare(shareCode);
      const headers: Record<string, string> = {};
      if (ownerToken) headers['x-owner-token'] = ownerToken;
      if (providedPassword) headers['x-share-password'] = providedPassword;

      const res = await fetch(`/api/shares/${shareCode}`, { headers });
      const data = await res.json();

      if (res.status === 404) {
        setNotFoundError(true);
        setIsLoading(false);
        return;
      }

      if (res.status === 410 || data.error === 'EXPIRED') {
        setExpiredError(true);
        setIsLoading(false);
        return;
      }

      if (res.status === 403 || data.error === 'REVOKED') {
        setRevokedError(true);
        setIsLoading(false);
        return;
      }

      if (res.status === 401 || data.error === 'PASSWORD_REQUIRED') {
        setPasswordRequired(true);
        setIsLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(data.message || 'Failed to load document');
      }

      setDoc(data);
      setContent(data.content);
      setVersion(data.contentVersion);
      setIsOwner(data.isOwner);
      setCanEdit(data.canEdit);
      setPermissionMode(data.permissionMode);
      setExpiresAt(data.expiresAt);
      setPasswordRequired(false);
      setIsLoading(false);

      // Connect to WebSocket collaboration room
      connectWebSocket(providedPassword);
    } catch (err: any) {
      console.error('Error fetching document:', err);
      setIsLoading(false);
    }
  };

  const connectWebSocket = (activePassword?: string) => {
    if (socketRef.current) {
      socketRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    setConnectionStatus('connecting');
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');
      const ownerToken = getOwnerTokenForShare(shareCode);
      ws.send(
        JSON.stringify({
          type: 'join',
          shareCode,
          ownerToken: ownerToken || undefined,
          password: activePassword || undefined,
          clientId: myClientIdRef.current,
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);

        switch (msg.type) {
          case 'init': {
            setContent(msg.content);
            setVersion(msg.version);
            setCanEdit(msg.canEdit);
            setIsOwner(msg.isOwner);
            setPermissionMode(msg.permissionMode);
            setExpiresAt(msg.expiresAt);
            setParticipants(msg.participants || []);
            break;
          }

          case 'sync': {
            // Apply remote update
            if (msg.senderId !== myClientIdRef.current) {
              setContent(msg.content);
              setVersion(msg.version);
              setSaveStatus('saved');
            }
            break;
          }

          case 'save_status': {
            setSaveStatus(msg.status);
            break;
          }

          case 'presence':
          case 'user_joined':
          case 'user_left': {
            if (msg.participants) {
              setParticipants(msg.participants);
            }
            break;
          }

          case 'permission_changed': {
            setPermissionMode(msg.permissionMode);
            setCanEdit(Boolean(msg.canEdit));
            break;
          }

          case 'revoked': {
            setRevokedError(true);
            setCanEdit(false);
            ws.close();
            break;
          }

          case 'expired': {
            setExpiredError(true);
            setCanEdit(false);
            ws.close();
            break;
          }

          case 'restored': {
            setContent(msg.content);
            setVersion(msg.version);
            break;
          }

          case 'error': {
            console.error('Server collaboration error:', msg.message);
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error('WebSocket message handling error', err);
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      // Retry connection after delay if document not permanently closed
      if (!expiredError && !revokedError && !notFoundError) {
        reconnectTimeoutRef.current = setTimeout(() => {
          setConnectionStatus('reconnecting');
          connectWebSocket(activePassword);
        }, 3000);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket connection error:', err);
    };
  };

  useEffect(() => {
    if (shareCode) {
      fetchDocMetadata();
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [shareCode]);

  // Handle local text edit
  const handleContentChange = (newText: string) => {
    if (!canEdit) return;

    setContent(newText);
    setSaveStatus('saving');

    // Broadcast over WebSocket
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'edit',
          content: newText,
          clientId: myClientIdRef.current,
        })
      );
    }
  };

  // Handle cursor movement
  const handleCursorChange = (cursor: { line: number; ch: number }) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'cursor',
          cursor,
        })
      );
    }
  };

  // Password verification
  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    fetchDocMetadata(passwordInput.trim());
  };

  // Copy share link
  const copyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // fallback
    }
  };

  // Owner Actions
  const handleTogglePermission = async () => {
    const ownerToken = getOwnerTokenForShare(shareCode);
    if (!ownerToken) return;

    const newMode = permissionMode === 'edit' ? 'view' : 'edit';
    try {
      const res = await fetch(`/api/shares/${shareCode}/settings`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-owner-token': ownerToken,
        },
        body: JSON.stringify({ permissionMode: newMode }),
      });

      if (res.ok) {
        setPermissionMode(newMode);
        setCanEdit(true); // Owner can always edit
      }
    } catch (err) {
      console.error('Failed to change permission mode', err);
    }
  };

  const handleRevokeShare = async () => {
    const ownerToken = getOwnerTokenForShare(shareCode);
    if (!ownerToken) return;

    try {
      const res = await fetch(`/api/shares/${shareCode}/revoke`, {
        method: 'POST',
        headers: { 'x-owner-token': ownerToken },
      });

      if (res.ok) {
        setRevokedError(true);
        setShowRevokeConfirm(false);
      }
    } catch (err) {
      console.error('Failed to revoke share', err);
    }
  };

  const handleDeleteShare = async () => {
    const ownerToken = getOwnerTokenForShare(shareCode);
    if (!ownerToken) return;

    try {
      const res = await fetch(`/api/shares/${shareCode}`, {
        method: 'DELETE',
        headers: { 'x-owner-token': ownerToken },
      });

      if (res.ok) {
        removeOwnerToken(shareCode);
        setLocation('/my-shares');
      }
    } catch (err) {
      console.error('Failed to delete share', err);
    }
  };

  // RENDER DEDICATED ERROR / STATE VIEWS

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-600 border-t-transparent" />
        <p className="mt-4 text-xs font-medium text-zinc-500">Loading shared document...</p>
      </div>
    );
  }

  if (notFoundError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-zinc-900 dark:text-white">Document Not Found</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          The share code <code className="font-mono font-semibold text-blue-600">{shareCode}</code> does not exist or may have been deleted.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Create a New Share
          </Link>
          <Link
            href="/my-shares"
            className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300"
          >
            View My Shares
          </Link>
        </div>
      </div>
    );
  }

  if (expiredError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
          <Clock className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-zinc-900 dark:text-white">Share Has Expired</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          This document reached its scheduled expiration timestamp and is no longer accessible according to the owner's policy.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/"
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Create New Document
          </Link>
          <Link
            href="/compare"
            className="rounded-lg border border-zinc-200 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300"
          >
            Compare Diff
          </Link>
        </div>
      </div>
    );
  }

  if (revokedError) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
          <Shield className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-zinc-900 dark:text-white">Access Revoked</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
          The owner of this share has manually revoked access. All collaboration connections and reads have been terminated.
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/"
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Return to Home
          </Link>
        </div>
      </div>
    );
  }

  if (passwordRequired) {
    return (
      <div className="mx-auto max-w-sm px-4 py-20">
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400 mb-4">
            <Lock className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Protected Document</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            This share requires a passcode to view and collaborate.
          </p>

          <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-3">
            <div>
              <input
                type="password"
                required
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter document passcode"
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
            </div>

            {passwordError && (
              <p className="text-xs text-red-600 dark:text-red-400">{passwordError}</p>
            )}

            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700"
            >
              Unlock Document
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 border-b border-zinc-200 pb-5 dark:border-zinc-800 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {doc?.title || 'Shared Document'}
            </h1>
            <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-mono font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {shareCode}
            </span>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            {/* Permission badge */}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-medium ${
                canEdit
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
              }`}
            >
              {canEdit ? <Edit3 className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {canEdit ? 'Can Edit (Live)' : 'View Only'}
            </span>

            {/* Connection badge */}
            <span className="inline-flex items-center gap-1.5">
              <span
                className={`h-2 w-2 rounded-full ${
                  connectionStatus === 'connected'
                    ? 'bg-emerald-500'
                    : connectionStatus === 'connecting' || connectionStatus === 'reconnecting'
                    ? 'bg-amber-500 animate-pulse'
                    : 'bg-red-500'
                }`}
              />
              <span className="capitalize">{connectionStatus}</span>
            </span>

            {/* Save Status badge */}
            <span className="inline-flex items-center gap-1 text-[11px]">
              {saveStatus === 'saved' ? (
                <>
                  <Check className="h-3 w-3 text-emerald-600" />
                  <span>Saved</span>
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3 animate-spin text-amber-500" />
                  <span>Saving...</span>
                </>
              )}
            </span>

            {/* Expiration timer */}
            {expiresAt && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-zinc-400" />
                <span>Expires {new Date(expiresAt).toLocaleDateString()} at {new Date(expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </span>
            )}

            {/* Version counter */}
            <span>Rev #{version}</span>
          </div>
        </div>

        {/* Right Top Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Active Collaborators Avatars */}
          <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-900">
            <Users className="h-4 w-4 text-zinc-500" />
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              {participants.length || 1} online
            </span>
            <div className="flex -space-x-1.5 ml-2">
              {participants.slice(0, 4).map((p) => (
                <div
                  key={p.clientId}
                  title={`${p.clientName} (${p.canEdit ? 'Editor' : 'Viewer'})`}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-xs"
                  style={{ backgroundColor: p.color }}
                >
                  {p.clientName.slice(0, 1).toUpperCase()}
                </div>
              ))}
            </div>
          </div>

          {/* Copy Share Link */}
          <button
            type="button"
            onClick={copyShareLink}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {copiedLink ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copiedLink ? 'Link Copied' : 'Copy Link'}</span>
          </button>

          {/* Compare this text */}
          <button
            type="button"
            onClick={() => {
              // Store current text into sessionStorage to prefill comparison
              sessionStorage.setItem('compare_original_preload', content);
              setLocation('/compare');
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            title="Open Diff tool with this text"
          >
            <FileDiff className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            <span>Compare Diff</span>
          </button>

          {/* Version History Button */}
          {(isOwner || canEdit) && (
            <Link
              href={`/s/${shareCode}/history`}
              className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            >
              <History className="h-3.5 w-3.5" />
              <span>History</span>
            </Link>
          )}
        </div>
      </div>

      {/* Owner Management Banner */}
      {isOwner && (
        <div className="my-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50/70 p-3.5 text-xs dark:border-blue-900/60 dark:bg-blue-950/40">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="font-semibold text-blue-950 dark:text-blue-200">
              You own this document.
            </span>
            <span className="text-blue-800 dark:text-blue-300">
              Manage live access permissions and link revocation below.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleTogglePermission}
              className="rounded-md border border-blue-300 bg-white px-2.5 py-1 text-xs font-medium text-blue-900 shadow-xs hover:bg-blue-50 dark:border-blue-800 dark:bg-zinc-900 dark:text-blue-200"
            >
              Switch to {permissionMode === 'edit' ? 'View Only' : 'Can Edit'}
            </button>

            <button
              type="button"
              onClick={() => setShowRevokeConfirm(true)}
              className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 shadow-xs hover:bg-red-50 dark:border-red-900 dark:bg-zinc-900 dark:text-red-300"
            >
              Revoke Share
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white shadow-xs hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Main Collaborative Editor */}
      <div className="mt-4">
        <Editor
          value={content}
          onChange={handleContentChange}
          readOnly={!canEdit}
          language={doc?.language || 'plaintext'}
          placeholder={canEdit ? 'Type here to collaborate live with other participants...' : 'This document is view-only.'}
          minHeight="550px"
          onCursorChange={handleCursorChange}
        />
      </div>

      {/* Revoke Confirmation Dialog */}
      {showRevokeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-bold text-zinc-900 dark:text-white text-base">Revoke Access Now?</h3>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              This will immediately disconnect all active viewers and editors. The share link will no longer be accessible to anyone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRevokeConfirm(false)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRevokeShare}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                Yes, Revoke Access
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="font-bold text-zinc-900 dark:text-white text-base">Permanently Delete Share?</h3>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
              This will permanently delete the shared document and its full version history. This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteShare}
                className="rounded-lg bg-red-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
              >
                Permanently Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

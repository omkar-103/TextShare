import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, Link } from 'wouter';
import { Editor } from '../components/Editor';
import { saveOwnerToken } from '../lib/storage';
import { saveDraft, loadDraft, clearDraft } from '../lib/draft';
import { usePageMeta } from '../lib/usePageMeta';
import { safeFetchJson } from '../lib/api';
import {
  Share2,
  Lock,
  Clock,
  Eye,
  Edit3,
  Copy,
  Check,
  ExternalLink,
  Shield,
  FileDiff,
  AlertCircle,
  FileCode,
  Sparkles,
  QrCode,
  Key,
  Info,
  LogIn,
} from 'lucide-react';

// ── Anonymous sharing config ─────────────────────────────────────────────────
const ANON_DURATIONS = [
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour (default)' },
  { value: '2h', label: '2 hours' },
];

const ALL_DURATIONS = [
  { value: '30m', label: '30 minutes' },
  { value: '1h', label: '1 hour' },
  { value: '2h', label: '2 hours' },
  { value: '3h', label: '3 hours' },
  { value: '12h', label: '12 hours' },
  { value: '1d', label: '1 day' },
  { value: '3d', label: '3 days' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'never', label: 'Never expires' },
];

const SAMPLE_TEXTS = {
  code: `// Express.js rate-limiting middleware example
import rateLimit from 'express-rate-limit';

export const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 429, error: 'Too many requests.' }
});`,
  json: `{
  "service": "authentication-gateway",
  "version": "2.4.1",
  "environment": "production",
  "features": {
    "mfaEnabled": true,
    "auditLogging": true,
    "rateLimiting": true
  }
}`,
  log: `[2026-10-09 13:14:02.102] INFO  [Worker-3] Batch transaction initialized: id=tx_99812
[2026-10-09 13:14:02.341] WARN  [DatabasePool] Connection latency spike: 42ms
[2026-10-09 13:14:02.408] INFO  [Worker-3] Transaction committed: 12 records affected`,
};

// ── Locked feature callout ───────────────────────────────────────────────────
function LockedFeature({ message }: { message: string }) {
  return (
    <div
      className="mt-1.5 flex items-center gap-1.5 rounded px-2 py-1.5 text-xs"
      style={{ backgroundColor: 'var(--color-accent-subtle)', color: 'var(--color-accent-text)' }}
      role="note"
    >
      <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export const Home: React.FC = () => {
  const [, setLocation] = useLocation();

  usePageMeta({
    title: 'Share Text Online Free — No Sign-Up | TextShare',
    description: 'Share text online instantly with a single link. No sign-up needed. Paste text, code, or notes and get a shareable URL in seconds. Shares expire automatically.',
    canonical: `${window.location.origin}/`,
  });

  // Simulated account: in this product, having an ownerToken in storage indicates
  // a returning user. "Authenticated" means the user has explicitly enabled
  // account mode. For now, we offer a light "sign-in" concept via a flag.
  // We treat the presence of the 'textshare_account_v1' flag as "signed in".
  const [isSignedIn, setIsSignedIn] = useState<boolean>(() => {
    try { return localStorage.getItem('textshare_account_v1') === '1'; } catch { return false; }
  });

  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  // Form states
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [permissionMode, setPermissionMode] = useState<'view' | 'edit'>('view');
  const [duration, setDuration] = useState('1h');
  const [language, setLanguage] = useState('plaintext');
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState('');

  // UI
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createdShare, setCreatedShare] = useState<{
    shareCode: string;
    shareUrl: string;
    expiresAt: number | null;
    permissionMode: string;
    title: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQr, setShowQr] = useState(false);

  // Restore draft on mount
  useEffect(() => {
    const draft = loadDraft();
    if (draft && draft.content.trim()) {
      setContent(draft.content);
      setTitle(draft.title || '');
      setLanguage(draft.language || 'plaintext');
    }
  }, []);

  // Save draft on content change (debounced)
  useEffect(() => {
    if (!content.trim()) return;
    const timer = setTimeout(() => {
      saveDraft({ title, content, language, savedAt: Date.now() });
    }, 800);
    return () => clearTimeout(timer);
  }, [title, content, language]);

  // Anonymous fallback: if user tries to set edit mode without sign-in, revert
  const handlePermissionClick = (mode: 'view' | 'edit') => {
    if (mode === 'edit' && !isSignedIn) {
      setShowSignInPrompt(true);
      return;
    }
    setPermissionMode(mode);
  };

  const handlePasswordToggle = (checked: boolean) => {
    if (checked && !isSignedIn) {
      setShowSignInPrompt(true);
      return;
    }
    setUsePassword(checked);
  };

  const getExpirationSummary = () => {
    const now = new Date();
    const msMap: Record<string, number> = {
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '2h': 2 * 60 * 60 * 1000,
      '3h': 3 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '3d': 3 * 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };
    if (duration === 'never') return 'This share will remain accessible until you revoke it.';
    const ms = msMap[duration];
    if (!ms) return '';
    const target = new Date(now.getTime() + ms);
    return `Expires ${target.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} at ${target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
  };

  const handleCreateShare = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!content.trim()) {
      setErrorMessage('Please enter or paste text to share.');
      return;
    }
    if (usePassword && !password.trim()) {
      setErrorMessage('Please enter a password or disable password protection.');
      return;
    }

    setIsSubmitting(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (isSignedIn) {
        // Use account token from storage to signal authenticated request
        const accountToken = localStorage.getItem('textshare_account_token_v1') || '';
        if (accountToken) headers['x-account-token'] = accountToken;
      }

      const data = await safeFetchJson<any>('/api/shares', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: title.trim() || 'Untitled Document',
          content,
          permissionMode: isSignedIn ? permissionMode : 'view',
          duration: isSignedIn ? duration : (ANON_DURATIONS.find(d => d.value === duration) ? duration : '1h'),
          language,
          password: isSignedIn && usePassword ? password.trim() : undefined,
        }),
      });

      // Clear draft on success
      clearDraft();

      saveOwnerToken({
        shareCode: data.shareCode,
        ownerToken: data.ownerToken,
        title: data.title,
        createdAt: data.createdAt,
      });

      const shareUrl = `${window.location.origin}/s/${data.shareCode}`;
      setCreatedShare({
        shareCode: data.shareCode,
        shareUrl,
        expiresAt: data.expiresAt,
        permissionMode: data.permissionMode,
        title: data.title,
      });
    } catch (err: any) {
      setErrorMessage(err.message || 'Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = async (text: string, type: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'link') { setCopiedLink(true); setTimeout(() => setCopiedLink(false), 2000); }
      else { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); }
    } catch { /* ignore */ }
  };

  const handleNativeShare = async () => {
    if (createdShare && navigator.share) {
      try {
        await navigator.share({ title: createdShare.title, url: createdShare.shareUrl });
      } catch { /* user cancelled */ }
    }
  };

  const durations = isSignedIn ? ALL_DURATIONS : ANON_DURATIONS;

  return (
    <div
      className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8"
      style={{ color: 'var(--color-text-primary)' }}
    >
      {/* ── SEO visible heading ──────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1
          className="text-2xl sm:text-3xl font-semibold tracking-tight"
          style={{ color: 'var(--color-text-primary)' }}
        >
          Share text online with a simple link
        </h1>
        <p className="mt-1.5 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Paste text, code, or notes — get a shareable link instantly. No sign-up required.
          {' '}
          <Link href="/compare" style={{ color: 'var(--color-accent)' }} className="hover:underline">
            Compare two texts →
          </Link>
        </p>
      </div>

      {/* ── Anonymous banner ─────────────────────────────────────────────────── */}
      {!isSignedIn && (
        <div
          className="mb-5 flex items-start gap-3 rounded-lg border px-4 py-3 text-sm"
          style={{
            backgroundColor: 'var(--color-accent-subtle)',
            borderColor: 'color-mix(in srgb, var(--color-accent) 20%, transparent)',
            color: 'var(--color-accent-text)',
          }}
          role="note"
          aria-label="Anonymous sharing mode"
        >
          <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="font-medium">You're sharing anonymously</p>
            <p className="mt-0.5 text-xs opacity-80">
              Anonymous shares are view-only with up to 2-hour expiry.{' '}
              <button
                type="button"
                className="underline font-medium"
                onClick={() => setShowSignInPrompt(true)}
              >
                Sign in for more options
              </button>
            </p>
          </div>
        </div>
      )}

      {errorMessage && (
        <div
          className="mb-5 flex items-center gap-3 rounded-lg border px-4 py-3 text-sm"
          style={{
            backgroundColor: 'var(--color-danger-subtle)',
            borderColor: 'color-mix(in srgb, var(--color-danger) 20%, transparent)',
            color: 'var(--color-danger)',
          }}
          role="alert"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <p>{errorMessage}</p>
        </div>
      )}

      <form onSubmit={handleCreateShare} noValidate>
        {/* ── Title + Language row ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-4">
          <div className="sm:col-span-2">
            <label
              htmlFor="doc-title"
              className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Title <span className="normal-case font-normal opacity-60">(optional)</span>
            </label>
            <input
              id="doc-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. API config, meeting notes, debug log"
              maxLength={150}
              className="input"
              style={{ fontSize: '0.875rem' }}
            />
          </div>
          <div>
            <label
              htmlFor="doc-lang"
              className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Syntax
            </label>
            <select
              id="doc-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="input"
              style={{ fontSize: '0.875rem', paddingRight: '2.25rem' }}
            >
              <option value="plaintext">Plain Text</option>
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="json">JSON</option>
              <option value="markdown">Markdown</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
              <option value="sql">SQL</option>
              <option value="shell">Shell / Bash</option>
              <option value="yaml">YAML</option>
              <option value="diff">Diff / Patch</option>
              <option value="log">Log</option>
            </select>
          </div>
        </div>

        {/* ── Quick samples ────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
          <span style={{ color: 'var(--color-text-muted)' }}>Load sample:</span>
          {[
            { label: 'Code snippet', key: 'code', lang: 'javascript', titleSuffix: 'Middleware Example' },
            { label: 'JSON config', key: 'json', lang: 'json', titleSuffix: 'Service Config' },
            { label: 'Server log', key: 'log', lang: 'log', titleSuffix: 'Worker Logs' },
          ].map(({ label, key, lang, titleSuffix }) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setContent(SAMPLE_TEXTS[key as keyof typeof SAMPLE_TEXTS]);
                setLanguage(lang);
                setTitle(titleSuffix);
              }}
              className="rounded px-2.5 py-1 transition-colors"
              style={{
                backgroundColor: 'var(--color-surface-raised)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border)',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── Editor ──────────────────────────────────────────────────────── */}
        <Editor
          value={content}
          onChange={setContent}
          language={language}
          placeholder="Paste or type text, code, notes, logs, or configuration here…"
          minHeight="360px"
        />

        {/* ── Settings card ────────────────────────────────────────────────── */}
        <div
          className="mt-4 rounded-lg border p-5"
          style={{
            backgroundColor: 'var(--color-surface-raised)',
            borderColor: 'var(--color-border)',
          }}
        >
          <h2
            className="text-sm font-semibold mb-4 flex items-center gap-2"
            style={{ color: 'var(--color-text-primary)' }}
          >
            <Shield className="h-4 w-4" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
            Access &amp; Expiration Settings
          </h2>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            {/* Permission */}
            <div>
              <div
                className="text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Recipient Permission
              </div>
              <div className="grid grid-cols-2 gap-2">
                {/* View button — always enabled */}
                <button
                  type="button"
                  onClick={() => setPermissionMode('view')}
                  className="flex items-center justify-center gap-2 rounded-md border p-2.5 text-xs font-medium transition-colors"
                  style={
                    permissionMode === 'view'
                      ? { borderColor: 'var(--color-accent)', backgroundColor: 'var(--color-accent-subtle)', color: 'var(--color-accent-text)' }
                      : { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }
                  }
                  aria-pressed={permissionMode === 'view'}
                >
                  <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                  View only
                </button>

                {/* Edit button — locked if anonymous */}
                <button
                  type="button"
                  onClick={() => handlePermissionClick('edit')}
                  className="flex items-center justify-center gap-2 rounded-md border p-2.5 text-xs font-medium transition-colors"
                  style={
                    permissionMode === 'edit' && isSignedIn
                      ? { borderColor: 'var(--color-accent)', backgroundColor: 'var(--color-accent-subtle)', color: 'var(--color-accent-text)' }
                      : !isSignedIn
                      ? { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-raised)', color: 'var(--color-text-muted)', cursor: 'pointer' }
                      : { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface)', color: 'var(--color-text-secondary)' }
                  }
                  aria-pressed={permissionMode === 'edit'}
                  aria-describedby={!isSignedIn ? 'edit-lock-note' : undefined}
                >
                  {!isSignedIn ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />}
                  Can edit
                </button>
              </div>
              {!isSignedIn && (
                <p id="edit-lock-note" className="mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  <button type="button" className="underline" style={{ color: 'var(--color-accent)' }} onClick={() => setShowSignInPrompt(true)}>Sign in</button>
                  {' '}to enable collaborative editing.
                </p>
              )}
            </div>

            {/* Expiry */}
            <div>
              <label
                htmlFor="duration-select"
                className="block text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Expiration
              </label>
              <select
                id="duration-select"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                className="input"
                style={{ fontSize: '0.875rem', paddingRight: '2.25rem' }}
              >
                {durations.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              {!isSignedIn && (
                <p className="mt-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  <button type="button" className="underline" style={{ color: 'var(--color-accent)' }} onClick={() => setShowSignInPrompt(true)}>Sign in</button>
                  {' '}for longer expiration options.
                </p>
              )}
            </div>

            {/* Password protection */}
            <div>
              <div
                className="flex items-center justify-between mb-2"
              >
                <span
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  Password
                </span>
                <input
                  type="checkbox"
                  id="enable-pwd"
                  checked={usePassword && isSignedIn}
                  onChange={(e) => handlePasswordToggle(e.target.checked)}
                  disabled={!isSignedIn}
                  className="h-4 w-4 rounded"
                  aria-label="Enable password protection"
                  aria-describedby={!isSignedIn ? 'pwd-lock-note' : undefined}
                />
              </div>
              {isSignedIn && usePassword ? (
                <div className="relative">
                  <Key className="absolute left-3 top-2.5 h-3.5 w-3.5" style={{ color: 'var(--color-text-muted)' }} aria-hidden="true" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password for recipients"
                    aria-label="Share password"
                    className="input pl-8"
                    style={{ fontSize: '0.8125rem' }}
                  />
                </div>
              ) : (
                <p id="pwd-lock-note" className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {isSignedIn
                    ? 'Anyone with the link can access without a password.'
                    : (
                      <>
                        <button type="button" className="underline" style={{ color: 'var(--color-accent)' }} onClick={() => setShowSignInPrompt(true)}>Sign in</button>
                        {' '}to unlock password protection.
                      </>
                    )
                  }
                </p>
              )}
            </div>
          </div>

          {/* Expiry summary */}
          <div
            className="mt-4 flex items-center gap-2 rounded px-3 py-2 text-xs border"
            style={{
              backgroundColor: 'var(--color-info-subtle)',
              borderColor: 'color-mix(in srgb, var(--color-info) 20%, transparent)',
              color: 'var(--color-info)',
            }}
          >
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>{getExpirationSummary()}</span>
          </div>
        </div>

        {/* ── Action row ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mt-5 gap-3 flex-wrap">
          <Link
            href="/compare"
            className="text-sm"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            <FileDiff className="inline h-4 w-4 mr-1" aria-hidden="true" />
            Compare two texts instead →
          </Link>

          <button
            type="submit"
            disabled={isSubmitting || !content.trim()}
            className="btn btn-primary"
            style={{
              backgroundColor: 'var(--color-accent)',
              borderColor: 'var(--color-accent)',
              color: '#fff',
              padding: '0.5625rem 1.5rem',
              fontSize: '0.9375rem',
            }}
          >
            {isSubmitting ? (
              <><span className="spinner" aria-hidden="true" /> Creating…</>
            ) : (
              <><Share2 className="h-4 w-4" aria-hidden="true" /> Create share link</>
            )}
          </button>
        </div>
      </form>

      {/* ── Informational copy for SEO/users ─────────────────────────────── */}
      <section
        className="mt-14 border-t pt-10 grid grid-cols-1 gap-8 sm:grid-cols-3"
        style={{ borderColor: 'var(--color-border)' }}
        aria-label="How TextShare works"
      >
        {[
          {
            title: 'Paste and share instantly',
            body: 'Type or paste any text — code, notes, logs, config files — and create a shareable link in one click. No account needed.',
          },
          {
            title: 'Links expire automatically',
            body: 'Anonymous shares last up to 2 hours. Sign in to choose up to 30 days, or a link that never expires.',
          },
          {
            title: 'Share between devices',
            body: 'Open your share link on any device or browser. Works perfectly for sharing text between phone and computer.',
          },
        ].map(({ title: t, body }) => (
          <div key={t}>
            <h2 className="text-sm font-semibold mb-1.5" style={{ color: 'var(--color-text-primary)' }}>
              {t}
            </h2>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              {body}
            </p>
          </div>
        ))}
      </section>

      <section
        className="mt-8 border-t pt-8"
        style={{ borderColor: 'var(--color-border)' }}
        aria-label="Use cases"
      >
        <h2 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-primary)' }}>
          Common uses for text sharing
        </h2>
        <ul
          className="text-sm grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 list-disc list-inside"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {[
            'Share code snippets with colleagues',
            'Send configuration files to support teams',
            'Share notes or meeting minutes quickly',
            'Send log output for debugging',
            'Share text between phone and computer',
            'Create temporary pastes that expire automatically',
          ].map((use) => <li key={use}>{use}</li>)}
        </ul>
        <p className="mt-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          Need to find differences between two versions?{' '}
          <Link href="/compare" style={{ color: 'var(--color-accent)' }} className="underline">
            Use the free text diff checker →
          </Link>
        </p>
      </section>

      {/* ── Sign-in prompt modal ─────────────────────────────────────────── */}
      {showSignInPrompt && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="signin-title">
          <div className="modal-panel">
            <div className="flex items-start gap-3 mb-4">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: 'var(--color-accent-subtle)' }}
              >
                <LogIn className="h-5 w-5" style={{ color: 'var(--color-accent)' }} aria-hidden="true" />
              </div>
              <div>
                <h3
                  id="signin-title"
                  className="font-semibold text-base"
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  Account features
                </h3>
                <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  Sign in to unlock collaborative editing, password protection, longer expiry, and custom share URLs.
                </p>
              </div>
            </div>
            <div
              className="rounded-lg border p-4 text-sm space-y-2 mb-5"
              style={{ backgroundColor: 'var(--color-surface-raised)', borderColor: 'var(--color-border)' }}
            >
              {[
                'Collaborative editing (recipients can edit)',
                'Password-protected shares',
                'Expiry from 3 hours to 30 days or never',
                'Custom share URL/slug',
                'My Shares dashboard to manage all links',
              ].map((f) => (
                <div key={f} className="flex items-center gap-2" style={{ color: 'var(--color-text-secondary)' }}>
                  <Check className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--color-success)' }} aria-hidden="true" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
            <div
              className="rounded-lg border p-3 text-xs mb-5"
              style={{
                backgroundColor: 'var(--color-surface-raised)',
                borderColor: 'var(--color-border)',
                color: 'var(--color-text-muted)',
              }}
            >
              <strong>Note:</strong> Your current draft is preserved in your browser session and will be restored after you sign in.
              This uses browser session storage — it is not sent to any server until you create a share.
            </div>
            <p
              className="text-sm text-center mb-4"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              This product does not currently have a sign-up page — authentication is managed per-device using secure owner tokens.
              Your anonymous shares are already tracked in{' '}
              <Link href="/my-shares" style={{ color: 'var(--color-accent)' }} onClick={() => setShowSignInPrompt(false)}>
                My Shares
              </Link>
              .
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowSignInPrompt(false)}
              >
                Continue anonymously
              </button>
              <Link
                href="/my-shares"
                className="btn btn-primary"
                style={{ backgroundColor: 'var(--color-accent)', color: '#fff' }}
                onClick={() => setShowSignInPrompt(false)}
              >
                Go to My Shares
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Success modal ────────────────────────────────────────────────── */}
      {createdShare && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="success-title">
          <div className="modal-panel">
            <div className="flex items-center gap-3 mb-5 pb-4 border-b" style={{ borderColor: 'var(--color-border)' }}>
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: 'var(--color-success-subtle)' }}
              >
                <Check className="h-5 w-5" style={{ color: 'var(--color-success)' }} aria-hidden="true" />
              </div>
              <div>
                <h3 id="success-title" className="font-semibold text-base" style={{ color: 'var(--color-text-primary)' }}>
                  Share ready
                </h3>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  Your share has been created and saved in the database.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Share URL */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  Share link
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={createdShare.shareUrl}
                    aria-label="Share URL"
                    className="input flex-1 font-mono text-xs"
                    style={{ backgroundColor: 'var(--color-surface-raised)' }}
                    onFocus={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(createdShare.shareUrl, 'link')}
                    className="btn btn-primary btn-sm shrink-0"
                    style={{ backgroundColor: 'var(--color-text-primary)', borderColor: 'var(--color-text-primary)' }}
                    aria-label="Copy share link"
                  >
                    {copiedLink ? <><Check className="h-3.5 w-3.5" aria-hidden="true" /> Copied</> : <><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy</>}
                  </button>
                </div>
              </div>

              {/* Share code */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                  Share code
                </label>
                <div className="flex items-center gap-2">
                  <code
                    className="flex-1 rounded-md border px-3 py-2 font-mono text-sm font-semibold tracking-wider"
                    style={{
                      backgroundColor: 'var(--color-surface-raised)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-accent)',
                    }}
                  >
                    {createdShare.shareCode}
                  </code>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(createdShare.shareCode, 'code')}
                    className="btn btn-secondary btn-sm shrink-0"
                    aria-label="Copy share code"
                  >
                    {copiedCode ? 'Copied' : 'Copy code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQr(!showQr)}
                    className="btn btn-secondary btn-sm"
                    aria-label="Show QR code"
                    aria-pressed={showQr}
                  >
                    <QrCode className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {/* QR */}
              {showQr && (
                <div
                  className="rounded-lg border p-4 text-center"
                  style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-surface-raised)' }}
                >
                  <div className="mx-auto flex h-36 w-36 items-center justify-center rounded bg-white p-2 shadow-sm">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(createdShare.shareUrl)}`}
                      alt={`QR code for share ${createdShare.shareCode}`}
                      className="h-32 w-32"
                    />
                  </div>
                  <p className="mt-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Scan to open on a mobile device
                  </p>
                </div>
              )}

              {/* Summary */}
              <div
                className="rounded-lg border p-3 text-xs space-y-1"
                style={{
                  backgroundColor: 'var(--color-surface-raised)',
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text-secondary)',
                }}
              >
                <div className="flex justify-between">
                  <span>Permission</span>
                  <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {createdShare.permissionMode === 'edit' ? 'Can edit (collaborative)' : 'View only'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Expires</span>
                  <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    {createdShare.expiresAt ? new Date(createdShare.expiresAt).toLocaleString() : 'Never'}
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div
              className="mt-5 flex items-center justify-between border-t pt-4"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <button
                type="button"
                onClick={() => { setCreatedShare(null); setContent(''); setTitle(''); }}
                className="text-sm"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                Create another
              </button>
              <div className="flex items-center gap-2">
                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="btn btn-secondary btn-sm"
                  >
                    Share
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setLocation(`/s/${createdShare.shareCode}`)}
                  className="btn btn-primary btn-sm"
                  style={{ backgroundColor: 'var(--color-accent)', borderColor: 'var(--color-accent)', color: '#fff' }}
                >
                  Open <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

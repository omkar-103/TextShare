import { Router, Request, Response } from 'express';
import {
  createSharedDocument,
  getDocumentByShareCode,
  getDocumentById,
  updateDocumentContent,
  updateDocumentSettings,
  revokeDocument,
  deleteDocument,
  getDocumentVersions,
  restoreDocumentVersion,
  getDocumentsByOwnerTokens,
  getAuditEvents,
  incrementViewCount,
  hashPassword,
  getDocumentBySlug,
  updateDocumentSlug,
} from './db.js';
import {
  notifyPermissionChanged,
  notifyDocumentRevoked,
  notifyDocumentVersionRestored,
} from './websocket.js';
import { GoogleGenAI } from '@google/genai';

export const apiRouter = Router();

// ─── Duration map ────────────────────────────────────────────────────────────
export const DURATION_MAP: Record<string, number | null> = {
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '3h': 3 * 60 * 60 * 1000,
  '12h': 12 * 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
  '3d': 3 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  'never': null,
};

// Anonymous users may only use these durations
const ANONYMOUS_ALLOWED_DURATIONS = new Set(['30m', '1h', '2h']);
const ANONYMOUS_DEFAULT_DURATION = '1h';

// Simple in-memory rate limiter for anonymous share creation (per IP)
const anonCreationCounts = new Map<string, { count: number; resetAt: number }>();
const ANON_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const ANON_RATE_LIMIT_MAX = 20; // 20 shares per IP per hour

function checkAnonRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = anonCreationCounts.get(ip);
  if (!entry || entry.resetAt <= now) {
    anonCreationCounts.set(ip, { count: 1, resetAt: now + ANON_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= ANON_RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}

// Reserved slugs that cannot be used as custom share URLs
const RESERVED_SLUGS = new Set([
  'compare', 'login', 'signup', 'register', 'settings', 'api', 'my-shares',
  'privacy', 'terms', 's', 'health', 'admin', 'dashboard', 'share', 'shares',
  'public', 'static', 'assets', 'img', 'images', 'css', 'js', 'favicon',
  'robots', 'sitemap', 'null', 'undefined', 'new', 'create', 'edit',
  'delete', 'revoke', 'restore', 'history', 'versions', 'version', 'audit',
]);

const SLUG_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,48}[a-zA-Z0-9])?$/;

function isValidSlug(slug: string): { valid: boolean; reason?: string } {
  if (!slug || slug.length < 3) return { valid: false, reason: 'Slug must be at least 3 characters.' };
  if (slug.length > 50) return { valid: false, reason: 'Slug must be 50 characters or fewer.' };
  if (!SLUG_REGEX.test(slug)) return { valid: false, reason: 'Slug may only contain letters, numbers, and hyphens. Must start and end with a letter or number.' };
  if (RESERVED_SLUGS.has(slug.toLowerCase())) return { valid: false, reason: 'This slug is reserved. Please choose another.' };
  if (/--/.test(slug)) return { valid: false, reason: 'Slug may not contain consecutive hyphens.' };
  return { valid: true };
}

// 1. POST /api/shares — Create a new shared document
apiRouter.post('/shares', async (req: Request, res: Response) => {
  try {
    const { title, content, permissionMode, duration, customMinutes, language, password, ownerToken } = req.body;

    if (content === undefined || content === null) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }
    if (typeof content !== 'string') {
      res.status(400).json({ error: 'Content must be text' });
      return;
    }
    if (content.length > 2 * 1024 * 1024) {
      res.status(413).json({ error: 'Content exceeds the maximum permitted size of 2MB' });
      return;
    }

    // Determine whether this is an "authenticated" request.
    // Authentication in this product = providing a valid ownerToken header.
    // We use a simple trusted-account flag: any non-empty ownerToken sent as
    // x-account-token header signals an authenticated request.
    const accountToken = req.headers['x-account-token'] as string | undefined;
    const isAuthenticated = Boolean(accountToken && accountToken.length > 10);

    // ── Anonymous restrictions ─────────────────────────────────────────────
    let safePermission: 'view' | 'edit';
    let safeDuration: string;
    let safeDurationMs: number | null;

    if (!isAuthenticated) {
      // Enforce view-only for anonymous users
      safePermission = 'view';

      // Enforce allowed durations
      const requestedDuration = typeof duration === 'string' ? duration : ANONYMOUS_DEFAULT_DURATION;
      if (ANONYMOUS_ALLOWED_DURATIONS.has(requestedDuration)) {
        safeDuration = requestedDuration;
      } else {
        safeDuration = ANONYMOUS_DEFAULT_DURATION;
      }
      safeDurationMs = DURATION_MAP[safeDuration] as number;

      // Block password protection
      if (password && typeof password === 'string' && password.trim()) {
        res.status(403).json({
          error: 'ANONYMOUS_RESTRICTION',
          message: 'Password protection requires an account. Sign in to enable this feature.',
        });
        return;
      }

      // Rate limit anonymous creation
      const ip = getClientIp(req);
      if (!checkAnonRateLimit(ip)) {
        res.status(429).json({
          error: 'RATE_LIMITED',
          message: 'Too many shares created recently. Please wait before creating more.',
        });
        return;
      }
    } else {
      // Authenticated: allow all options
      safePermission = permissionMode === 'edit' ? 'edit' : 'view';

      if (duration === 'custom' && typeof customMinutes === 'number') {
        safeDurationMs = Math.min(customMinutes, 43200) * 60 * 1000;
      } else if (duration && duration in DURATION_MAP) {
        safeDurationMs = DURATION_MAP[duration];
      } else {
        safeDurationMs = DURATION_MAP['1d'];
      }
    }

    const { document, ownerToken: newOwnerToken } = await createSharedDocument({
      title: typeof title === 'string' ? title : 'Untitled Document',
      content,
      permissionMode: safePermission,
      durationMs: safeDurationMs,
      language: typeof language === 'string' ? language : 'plaintext',
      password: isAuthenticated && typeof password === 'string' ? password : '',
    });

    res.status(201).json({
      success: true,
      shareCode: document.shareCode,
      ownerToken: newOwnerToken,
      title: document.title,
      permissionMode: document.permissionMode,
      language: document.language,
      createdAt: document.createdAt,
      expiresAt: document.expiresAt,
      isPasswordProtected: Boolean(document.passwordHash),
      isAnonymous: !isAuthenticated,
    });
  } catch (err: any) {
    console.error('Error creating share:', err);
    res.status(500).json({ error: 'Failed to create share', details: err?.message });
  }
});

// 2. GET /api/shares/:shareCode — Read a shared document
apiRouter.get('/shares/:shareCode', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const ownerToken = req.headers['x-owner-token'] as string | undefined;
    const password = req.headers['x-share-password'] as string | undefined;

    // Try by shareCode first, then by custom slug
    let doc = await getDocumentByShareCode(shareCode);
    if (!doc) {
      doc = await getDocumentBySlug(shareCode);
    }

    if (!doc) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Document does not exist or has been deleted.' });
      return;
    }

    if (doc.expiresAt && doc.expiresAt <= Date.now()) {
      res.status(410).json({
        error: 'EXPIRED',
        message: 'This document has expired.',
        title: doc.title,
        expiredAt: doc.expiresAt,
      });
      return;
    }

    if (doc.revokedAt) {
      res.status(403).json({
        error: 'REVOKED',
        message: 'Access to this document was revoked by the owner.',
        title: doc.title,
        revokedAt: doc.revokedAt,
      });
      return;
    }

    const isOwner = Boolean(ownerToken && ownerToken === doc.ownerToken);

    if (doc.passwordHash && !isOwner) {
      if (!password || hashPassword(password) !== doc.passwordHash) {
        res.status(401).json({
          error: 'PASSWORD_REQUIRED',
          requiresPassword: true,
          title: doc.title,
          language: doc.language,
        });
        return;
      }
    }

    await incrementViewCount(doc.id);

    res.json({
      id: doc.id,
      shareCode: doc.shareCode,
      customSlug: doc.customSlug ?? null,
      title: doc.title,
      content: doc.content,
      permissionMode: doc.permissionMode,
      language: doc.language,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      expiresAt: doc.expiresAt,
      contentVersion: doc.contentVersion,
      viewCount: doc.viewCount + 1,
      isOwner,
      canEdit: isOwner || doc.permissionMode === 'edit',
      isPasswordProtected: Boolean(doc.passwordHash),
    });
  } catch (err: any) {
    console.error('Error fetching share:', err);
    res.status(500).json({ error: 'Failed to retrieve document' });
  }
});

// 3. PATCH /api/shares/:shareCode — Update document content
apiRouter.patch('/shares/:shareCode', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const ownerToken = req.headers['x-owner-token'] as string | undefined;
    const { content, title, actorName } = req.body;

    const doc = await getDocumentByShareCode(shareCode);
    if (!doc) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
    if (doc.expiresAt && doc.expiresAt <= Date.now()) { res.status(410).json({ error: 'EXPIRED' }); return; }
    if (doc.revokedAt) { res.status(403).json({ error: 'REVOKED' }); return; }

    const isOwner = Boolean(ownerToken && ownerToken === doc.ownerToken);
    if (!isOwner && doc.permissionMode !== 'edit') {
      res.status(403).json({ error: 'READ_ONLY', message: 'You do not have permission to edit this document' });
      return;
    }
    if (typeof content !== 'string') { res.status(400).json({ error: 'Content must be text' }); return; }

    const result = await updateDocumentContent({
      id: doc.id,
      content,
      title,
      actorName: actorName || (isOwner ? 'Owner' : 'Editor'),
      createSnapshot: true,
    });

    res.json({ success: true, version: result.version, updatedAt: Date.now() });
  } catch (err: any) {
    console.error('Error updating share content:', err);
    res.status(500).json({ error: 'Failed to update content' });
  }
});

// 4. PATCH /api/shares/:shareCode/settings — Update settings (Owner only)
apiRouter.patch('/shares/:shareCode/settings', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const ownerToken = req.headers['x-owner-token'] as string | undefined;

    const doc = await getDocumentByShareCode(shareCode);
    if (!doc) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
    if (!ownerToken || ownerToken !== doc.ownerToken) {
      res.status(403).json({ error: 'UNAUTHORIZED', message: 'Only the owner can modify document settings.' });
      return;
    }

    const { permissionMode, title, duration, customMinutes, language, password } = req.body;

    let expiresAt: number | null | undefined = undefined;
    if (duration !== undefined) {
      if (duration === 'never') {
        expiresAt = null;
      } else if (duration === 'custom' && typeof customMinutes === 'number') {
        expiresAt = Date.now() + Math.min(customMinutes, 43200) * 60 * 1000;
      } else if (duration in DURATION_MAP) {
        const ms = DURATION_MAP[duration];
        expiresAt = ms ? Date.now() + ms : null;
      }
    }

    await updateDocumentSettings({
      id: doc.id,
      permissionMode: permissionMode === 'edit' || permissionMode === 'view' ? permissionMode : undefined,
      title,
      expiresAt,
      language,
      password: password !== undefined ? password : undefined,
    });

    if (permissionMode && (permissionMode === 'view' || permissionMode === 'edit')) {
      notifyPermissionChanged(shareCode, permissionMode);
    }

    const freshDoc = await getDocumentById(doc.id);
    res.json({ success: true, document: freshDoc });
  } catch (err: any) {
    console.error('Error updating settings:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// 4b. PATCH /api/shares/:shareCode/slug — Set custom slug (Owner only, authenticated)
apiRouter.patch('/shares/:shareCode/slug', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const ownerToken = req.headers['x-owner-token'] as string | undefined;
    const accountToken = req.headers['x-account-token'] as string | undefined;
    const { slug } = req.body;

    if (!accountToken || accountToken.length < 10) {
      res.status(403).json({ error: 'ACCOUNT_REQUIRED', message: 'Custom share URLs require a signed-in account.' });
      return;
    }

    const doc = await getDocumentByShareCode(shareCode);
    if (!doc) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
    if (!ownerToken || ownerToken !== doc.ownerToken) {
      res.status(403).json({ error: 'UNAUTHORIZED', message: 'Only the owner can set a custom slug.' });
      return;
    }

    if (!slug) {
      // Clear the slug
      await updateDocumentSlug({ id: doc.id, slug: null });
      res.json({ success: true, slug: null });
      return;
    }

    const validation = isValidSlug(slug);
    if (!validation.valid) {
      res.status(400).json({ error: 'INVALID_SLUG', message: validation.reason });
      return;
    }

    // Check uniqueness
    const existing = await getDocumentBySlug(slug);
    if (existing && existing.id !== doc.id) {
      res.status(409).json({ error: 'SLUG_TAKEN', message: 'This custom URL is already in use. Please choose another.' });
      return;
    }

    await updateDocumentSlug({ id: doc.id, slug });
    res.json({ success: true, slug, shareUrl: `${req.protocol}://${req.get('host')}/s/${slug}` });
  } catch (err: any) {
    console.error('Error setting slug:', err);
    res.status(500).json({ error: 'Failed to update slug' });
  }
});

// 4c. GET /api/slug-check/:slug — Check slug availability
apiRouter.get('/slug-check/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const validation = isValidSlug(slug);
    if (!validation.valid) {
      res.json({ available: false, reason: validation.reason });
      return;
    }
    const existing = await getDocumentBySlug(slug);
    res.json({ available: !existing, slug });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to check slug' });
  }
});

// 5. POST /api/shares/:shareCode/revoke — Revoke access (Owner only)
apiRouter.post('/shares/:shareCode/revoke', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const ownerToken = req.headers['x-owner-token'] as string | undefined;

    const doc = await getDocumentByShareCode(shareCode);
    if (!doc) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
    if (!ownerToken || ownerToken !== doc.ownerToken) {
      res.status(403).json({ error: 'UNAUTHORIZED', message: 'Only the owner can revoke this share.' });
      return;
    }

    await revokeDocument(doc.id);
    notifyDocumentRevoked(shareCode);
    res.json({ success: true, message: 'Share successfully revoked.' });
  } catch (err: any) {
    console.error('Error revoking share:', err);
    res.status(500).json({ error: 'Failed to revoke document' });
  }
});

// 6. DELETE /api/shares/:shareCode — Delete share permanently (Owner only)
apiRouter.delete('/shares/:shareCode', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const ownerToken = req.headers['x-owner-token'] as string | undefined;

    const doc = await getDocumentByShareCode(shareCode);
    if (!doc) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
    if (!ownerToken || ownerToken !== doc.ownerToken) {
      res.status(403).json({ error: 'UNAUTHORIZED' });
      return;
    }

    await deleteDocument(doc.id);
    notifyDocumentRevoked(shareCode);
    res.json({ success: true, message: 'Share deleted successfully.' });
  } catch (err: any) {
    console.error('Error deleting share:', err);
    res.status(500).json({ error: 'Failed to delete document' });
  }
});

// 7. GET /api/shares/:shareCode/versions — Version history
apiRouter.get('/shares/:shareCode/versions', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const ownerToken = req.headers['x-owner-token'] as string | undefined;

    const doc = await getDocumentByShareCode(shareCode);
    if (!doc) { res.status(404).json({ error: 'NOT_FOUND' }); return; }

    const isOwner = Boolean(ownerToken && ownerToken === doc.ownerToken);
    if (!isOwner && doc.permissionMode !== 'edit') {
      res.status(403).json({ error: 'UNAUTHORIZED', message: 'Version history is only accessible to authorized users.' });
      return;
    }

    const versions = await getDocumentVersions(doc.id);
    res.json({ success: true, versions, currentVersion: doc.contentVersion });
  } catch (err: any) {
    console.error('Error fetching versions:', err);
    res.status(500).json({ error: 'Failed to retrieve version history' });
  }
});

// 8. POST /api/shares/:shareCode/versions/:versionId/restore — Restore a version
apiRouter.post('/shares/:shareCode/versions/:versionId/restore', async (req: Request, res: Response) => {
  try {
    const { shareCode, versionId } = req.params;
    const ownerToken = req.headers['x-owner-token'] as string | undefined;

    const doc = await getDocumentByShareCode(shareCode);
    if (!doc) { res.status(404).json({ error: 'NOT_FOUND' }); return; }

    const isOwner = Boolean(ownerToken && ownerToken === doc.ownerToken);
    if (!isOwner && doc.permissionMode !== 'edit') {
      res.status(403).json({ error: 'UNAUTHORIZED', message: 'Only authorized users can restore versions.' });
      return;
    }

    const restored = await restoreDocumentVersion(doc.id, versionId, isOwner ? 'Owner' : 'Authorized Editor');
    if (!restored) { res.status(400).json({ error: 'Failed to restore version' }); return; }

    const freshDoc = await getDocumentById(doc.id);
    if (freshDoc) notifyDocumentVersionRestored(shareCode, freshDoc.content, freshDoc.contentVersion);

    res.json({ success: true, newVersionNumber: restored.versionNumber, content: freshDoc?.content });
  } catch (err: any) {
    console.error('Error restoring version:', err);
    res.status(500).json({ error: 'Failed to restore version' });
  }
});

// 9. GET /api/shares/:shareCode/audit — Audit trail
apiRouter.get('/shares/:shareCode/audit', async (req: Request, res: Response) => {
  try {
    const { shareCode } = req.params;
    const ownerToken = req.headers['x-owner-token'] as string | undefined;

    const doc = await getDocumentByShareCode(shareCode);
    if (!doc) { res.status(404).json({ error: 'NOT_FOUND' }); return; }
    if (!ownerToken || ownerToken !== doc.ownerToken) {
      res.status(403).json({ error: 'UNAUTHORIZED' });
      return;
    }

    const events = await getAuditEvents(doc.id);
    res.json({ success: true, events });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// 10. POST /api/my-shares — Fetch all shares owned by the user
apiRouter.post('/my-shares', async (req: Request, res: Response) => {
  try {
    const { ownerTokens } = req.body;
    if (!Array.isArray(ownerTokens)) { res.json({ shares: [] }); return; }

    const cleanTokens = ownerTokens.filter((t): t is string => typeof t === 'string' && t.length > 0);
    // Limit to 200 tokens to prevent abuse
    const limitedTokens = cleanTokens.slice(0, 200);
    const docs = await getDocumentsByOwnerTokens(limitedTokens);

    const now = Date.now();
    const result = docs.map((d) => {
      let status: 'active' | 'expired' | 'revoked' = 'active';
      if (d.revokedAt) status = 'revoked';
      else if (d.expiresAt && d.expiresAt <= now) status = 'expired';

      return {
        id: d.id,
        shareCode: d.shareCode,
        customSlug: d.customSlug ?? null,
        title: d.title,
        contentPreview: d.content.slice(0, 150),
        permissionMode: d.permissionMode,
        language: d.language,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
        expiresAt: d.expiresAt,
        revokedAt: d.revokedAt,
        contentVersion: d.contentVersion,
        viewCount: d.viewCount,
        status,
        hasPassword: Boolean(d.passwordHash),
      };
    });

    res.json({ shares: result });
  } catch (err: any) {
    console.error('Error fetching user shares:', err);
    res.status(500).json({ error: 'Failed to retrieve shares' });
  }
});

// 11. POST /api/compare/explain — AI diff explanation
apiRouter.post('/compare/explain', async (req: Request, res: Response) => {
  try {
    const { originalText, modifiedText, stats } = req.body;

    if (typeof originalText !== 'string' || typeof modifiedText !== 'string') {
      res.status(400).json({ error: 'originalText and modifiedText must be strings' });
      return;
    }

    const truncatedOriginal = originalText.slice(0, 15000);
    const truncatedModified = modifiedText.slice(0, 15000);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      res.json({
        success: true,
        isAiGenerated: false,
        summary: `Deterministic analysis: ${stats?.addedLines || 0} additions, ${stats?.removedLines || 0} deletions. Configure GEMINI_API_KEY for AI analysis.`,
      });
      return;
    }

    const ai = new GoogleGenAI();
    const prompt = `You are a professional code and text diff reviewer. Provide a concise, bulleted, objective summary explaining the key differences, additions, deletions, and structural alterations between the Original Text and Modified Text below. Do NOT execute or evaluate any code. Focus strictly on what changed, what is missing from the original, and what was newly introduced.

ORIGINAL TEXT:
"""
${truncatedOriginal}
"""

MODIFIED TEXT:
"""
${truncatedModified}
"""

Provide your review in 3-5 concise, formatted bullet points:`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    res.json({
      success: true,
      isAiGenerated: true,
      summary: response.text || 'No summary could be generated.',
    });
  } catch (err: any) {
    console.error('Error generating AI diff explanation:', err);
    res.status(500).json({
      error: 'AI explanation failed',
      details: err?.message || 'Check model configuration or API limits.',
    });
  }
});

// 12. GET /api/health — Health check
apiRouter.get('/health', async (_req: Request, res: Response) => {
  try {
    const { getDb } = await import('./db.js');
    await getDb();
    res.json({ status: 'healthy', database: 'mongodb_atlas', timestamp: Date.now() });
  } catch (err: any) {
    res.status(500).json({ status: 'unhealthy', error: err?.message });
  }
});

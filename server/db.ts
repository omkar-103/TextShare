import { MongoClient, Db, Collection } from 'mongodb';
import crypto from 'crypto';
import dotenv from 'dotenv';
import dns from 'dns';

dotenv.config();

// Ensure SRV records can be resolved on networks/ISPs whose default DNS rejects SRV queries
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (err) {
  console.warn('[DNS] Could not set custom DNS servers:', err);
}

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'textshare_platform';

let client: MongoClient | null = null;
let db: Db | null = null;
let isConnected = false;

export interface SharedDocumentRecord {
  id: string;
  shareCode: string;
  customSlug?: string | null;
  title: string;
  content: string;
  ownerToken: string;
  permissionMode: 'view' | 'edit';
  passwordHash: string | null;
  language: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number | null;
  revokedAt: number | null;
  deletedAt: number | null;
  contentVersion: number;
  viewCount: number;
  settings: string | null;
}

export interface DocumentVersionRecord {
  id: string;
  documentId: string;
  versionNumber: number;
  content: string;
  title: string;
  changeSummary: string | null;
  actorName: string | null;
  createdAt: number;
}

export interface AuditEventRecord {
  id: string;
  documentId: string;
  action: string;
  details: string | null;
  createdAt: number;
}

export async function getDb(): Promise<Db> {
  if (db && isConnected) return db;

  if (!client) {
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5000,
    });
  }

  try {
    await client.connect();
    isConnected = true;
    db = client.db(MONGODB_DB_NAME);
    console.log(`[MongoDB Atlas] Connected to dedicated database: ${MONGODB_DB_NAME}`);

    // Ensure collections and indexes exist
    const docsColl = db.collection<SharedDocumentRecord>('documents');
    const versColl = db.collection<DocumentVersionRecord>('versions');
    const auditColl = db.collection<AuditEventRecord>('audit_events');

    await Promise.all([
      docsColl.createIndex({ shareCode: 1 }, { unique: true }),
      // Sparse+unique so that docs without a slug don't conflict
      docsColl.createIndex({ customSlug: 1 }, { unique: true, sparse: true }),
      docsColl.createIndex({ ownerToken: 1 }),
      docsColl.createIndex({ expiresAt: 1 }),
      docsColl.createIndex({ createdAt: -1 }),
      versColl.createIndex({ documentId: 1, versionNumber: -1 }),
      auditColl.createIndex({ documentId: 1, createdAt: -1 }),
    ]);

    return db;
  } catch (err) {
    console.error('[MongoDB Atlas] Connection failed:', err);
    throw err;
  }
}

// Collections helpers
async function docsCollection(): Promise<Collection<SharedDocumentRecord>> {
  const database = await getDb();
  return database.collection<SharedDocumentRecord>('documents');
}

async function versionsCollection(): Promise<Collection<DocumentVersionRecord>> {
  const database = await getDb();
  return database.collection<DocumentVersionRecord>('versions');
}

async function auditCollection(): Promise<Collection<AuditEventRecord>> {
  const database = await getDb();
  return database.collection<AuditEventRecord>('audit_events');
}

// Generate unpredictable cryptographically secure base62 share code
export function generateShareCode(length = 10): string {
  const chars = '23456789abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

export function generateOwnerToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

export function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Data access operations
export async function createSharedDocument(params: {
  title?: string;
  content: string;
  permissionMode: 'view' | 'edit';
  language?: string;
  durationMs?: number | null; // null for never expires
  password?: string;
}): Promise<{
  document: SharedDocumentRecord;
  ownerToken: string;
}> {
  const coll = await docsCollection();
  const id = crypto.randomUUID();

  let shareCode = generateShareCode(10);
  while (await coll.findOne({ shareCode })) {
    shareCode = generateShareCode(10);
  }

  const ownerToken = generateOwnerToken();
  const now = Date.now();
  const expiresAt = params.durationMs ? now + params.durationMs : null;
  const passwordHash = params.password && params.password.trim() ? hashPassword(params.password.trim()) : null;
  const title = (params.title && params.title.trim()) ? params.title.trim().slice(0, 150) : 'Untitled Document';
  const language = params.language || 'plaintext';

  const docRecord: SharedDocumentRecord = {
    id,
    shareCode,
    title,
    content: params.content,
    ownerToken,
    permissionMode: params.permissionMode,
    passwordHash,
    language,
    createdAt: now,
    updatedAt: now,
    expiresAt,
    revokedAt: null,
    deletedAt: null,
    contentVersion: 1,
    viewCount: 0,
    settings: null,
  };

  await coll.insertOne(docRecord as any);

  // Initial version record
  const versColl = await versionsCollection();
  const versionRecord: DocumentVersionRecord = {
    id: crypto.randomUUID(),
    documentId: id,
    versionNumber: 1,
    content: params.content,
    title,
    changeSummary: 'Initial document created',
    actorName: 'Owner',
    createdAt: now,
  };
  await versColl.insertOne(versionRecord as any);

  // Initial audit event
  const audColl = await auditCollection();
  const auditRecord: AuditEventRecord = {
    id: crypto.randomUUID(),
    documentId: id,
    action: 'create',
    details: JSON.stringify({ permissionMode: params.permissionMode, expiresAt }),
    createdAt: now,
  };
  await audColl.insertOne(auditRecord as any);

  return { document: docRecord, ownerToken };
}

export async function getDocumentById(id: string): Promise<SharedDocumentRecord | null> {
  const coll = await docsCollection();
  return await coll.findOne({ id, deletedAt: null });
}

export async function getDocumentByShareCode(shareCode: string): Promise<SharedDocumentRecord | null> {
  const coll = await docsCollection();
  return await coll.findOne({ shareCode, deletedAt: null });
}

export async function getDocumentBySlug(slug: string): Promise<SharedDocumentRecord | null> {
  const coll = await docsCollection();
  return await coll.findOne({ customSlug: slug, deletedAt: null });
}

export async function updateDocumentSlug(params: { id: string; slug: string | null }): Promise<boolean> {
  const coll = await docsCollection();
  const now = Date.now();
  if (params.slug === null) {
    await coll.updateOne({ id: params.id }, { $unset: { customSlug: '' }, $set: { updatedAt: now } });
  } else {
    await coll.updateOne({ id: params.id }, { $set: { customSlug: params.slug, updatedAt: now } });
  }
  return true;
}

export async function incrementViewCount(id: string): Promise<void> {
  const coll = await docsCollection();
  await coll.updateOne({ id }, { $inc: { viewCount: 1 } });
}

export async function updateDocumentContent(params: {
  id: string;
  content: string;
  title?: string;
  actorName?: string;
  createSnapshot?: boolean;
}): Promise<{ success: boolean; version: number }> {
  const coll = await docsCollection();
  const current = await coll.findOne({ id: params.id, deletedAt: null });
  if (!current) return { success: false, version: 0 };

  const now = Date.now();
  const newVersion = current.contentVersion + 1;
  const newTitle = params.title !== undefined ? params.title.trim().slice(0, 150) : current.title;

  await coll.updateOne(
    { id: params.id },
    {
      $set: {
        content: params.content,
        title: newTitle,
        updatedAt: now,
        contentVersion: newVersion,
      },
    }
  );

  if (params.createSnapshot) {
    const versColl = await versionsCollection();
    await versColl.insertOne({
      id: crypto.randomUUID(),
      documentId: params.id,
      versionNumber: newVersion,
      content: params.content,
      title: newTitle,
      changeSummary: 'Collaborative update',
      actorName: params.actorName || 'Editor',
      createdAt: now,
    });
  }

  return { success: true, version: newVersion };
}

export async function updateDocumentSettings(params: {
  id: string;
  permissionMode?: 'view' | 'edit';
  title?: string;
  expiresAt?: number | null;
  language?: string;
  password?: string | null;
}): Promise<boolean> {
  const coll = await docsCollection();
  const current = await coll.findOne({ id: params.id, deletedAt: null });
  if (!current) return false;

  const now = Date.now();
  const permissionMode = params.permissionMode ?? current.permissionMode;
  const title = params.title !== undefined ? params.title.trim().slice(0, 150) : current.title;
  const expiresAt = params.expiresAt !== undefined ? params.expiresAt : current.expiresAt;
  const language = params.language !== undefined ? params.language : current.language;
  let passwordHash = current.passwordHash;
  if (params.password !== undefined) {
    passwordHash = params.password ? hashPassword(params.password) : null;
  }

  await coll.updateOne(
    { id: params.id },
    {
      $set: {
        permissionMode,
        title,
        expiresAt,
        language,
        passwordHash,
        updatedAt: now,
      },
    }
  );

  const audColl = await auditCollection();
  await audColl.insertOne({
    id: crypto.randomUUID(),
    documentId: params.id,
    action: 'permission_change',
    details: JSON.stringify({ permissionMode, expiresAt }),
    createdAt: now,
  });

  return true;
}

export async function revokeDocument(id: string): Promise<boolean> {
  const coll = await docsCollection();
  const now = Date.now();
  await coll.updateOne(
    { id },
    { $set: { revokedAt: now, updatedAt: now } }
  );

  const audColl = await auditCollection();
  await audColl.insertOne({
    id: crypto.randomUUID(),
    documentId: id,
    action: 'revoke',
    details: 'Document access revoked by owner',
    createdAt: now,
  });

  return true;
}

export async function deleteDocument(id: string): Promise<boolean> {
  const coll = await docsCollection();
  const now = Date.now();
  await coll.updateOne(
    { id },
    { $set: { deletedAt: now, updatedAt: now } }
  );
  return true;
}

export async function getDocumentVersions(documentId: string): Promise<DocumentVersionRecord[]> {
  const coll = await versionsCollection();
  return await coll.find({ documentId }).sort({ versionNumber: -1 }).toArray();
}

export async function getDocumentVersion(documentId: string, versionId: string): Promise<DocumentVersionRecord | null> {
  const coll = await versionsCollection();
  return await coll.findOne({ documentId, id: versionId });
}

export async function restoreDocumentVersion(
  documentId: string,
  versionId: string,
  actorName = 'Owner'
): Promise<{ success: boolean; versionNumber: number } | null> {
  const version = await getDocumentVersion(documentId, versionId);
  const doc = await getDocumentById(documentId);
  if (!version || !doc) return null;

  const now = Date.now();
  const newVersionNumber = doc.contentVersion + 1;

  const coll = await docsCollection();
  await coll.updateOne(
    { id: documentId },
    {
      $set: {
        content: version.content,
        title: version.title,
        updatedAt: now,
        contentVersion: newVersionNumber,
      },
    }
  );

  const versColl = await versionsCollection();
  await versColl.insertOne({
    id: crypto.randomUUID(),
    documentId,
    versionNumber: newVersionNumber,
    content: version.content,
    title: version.title,
    changeSummary: `Restored from Version ${version.versionNumber}`,
    actorName,
    createdAt: now,
  });

  const audColl = await auditCollection();
  await audColl.insertOne({
    id: crypto.randomUUID(),
    documentId,
    action: 'restore',
    details: JSON.stringify({ restoredFromVersion: version.versionNumber }),
    createdAt: now,
  });

  return { success: true, versionNumber: newVersionNumber };
}

export async function getDocumentsByOwnerTokens(tokens: string[]): Promise<SharedDocumentRecord[]> {
  if (!tokens || tokens.length === 0) return [];
  const coll = await docsCollection();
  return await coll
    .find({ ownerToken: { $in: tokens }, deletedAt: null })
    .sort({ createdAt: -1 })
    .toArray();
}

export async function getAuditEvents(documentId: string): Promise<AuditEventRecord[]> {
  const coll = await auditCollection();
  return await coll
    .find({ documentId })
    .sort({ createdAt: -1 })
    .limit(50)
    .toArray();
}

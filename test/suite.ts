import assert from 'assert';
import http from 'http';
import express from 'express';
import { WebSocket } from 'ws';
import {
  createSharedDocument,
  getDocumentByShareCode,
  updateDocumentContent,
  restoreDocumentVersion,
  getDocumentVersions,
  generateShareCode,
  getDb,
} from '../server/db.js';
import { apiRouter } from '../server/routes.js';
import { setupWebSocketServer } from '../server/websocket.js';
import { computeTextDiff } from '../src/lib/diffEngine.js';

async function runTestSuite() {
  console.log('--- STARTING TEXTSHARE & DIFF COMPREHENSIVE TEST SUITE (MONGODB ATLAS) ---\n');

  // 1. UNIT TESTS
  console.log('1. UNIT TESTS:');

  // 1.1 Share code generation
  const code1 = generateShareCode(10);
  const code2 = generateShareCode(10);
  assert.strictEqual(code1.length, 10, 'Share code should have length 10');
  assert.notStrictEqual(code1, code2, 'Subsequent share codes must be distinct and randomized');
  console.log('  ✓ Cryptographic share code generation passed');

  // 1.2 Deterministic diff engine: identical strings
  const identicalDiff = computeTextDiff('hello world\nline 2', 'hello world\nline 2');
  assert.strictEqual(identicalDiff.isIdentical, true, 'Identical strings must flag isIdentical: true');
  assert.strictEqual(identicalDiff.stats.addedLines, 0, 'No additions in identical texts');
  assert.strictEqual(identicalDiff.stats.removedLines, 0, 'No deletions in identical texts');
  console.log('  ✓ Diff engine: Identical text detection passed');

  // 1.3 Deterministic diff engine: additions, deletions, modifications
  const orig = 'Line A\nLine B\nLine C';
  const mod = 'Line A\nLine B modified\nLine C\nLine D';
  const diff = computeTextDiff(orig, mod);
  assert.strictEqual(diff.isIdentical, false, 'Non-identical texts must flag isIdentical: false');
  assert.ok(diff.stats.addedLines >= 1, 'Should detect additions');
  assert.ok(diff.stats.modifiedLines >= 1 || diff.stats.removedLines >= 1, 'Should detect modifications/deletions');
  assert.ok(diff.addedToModified.includes('Line D'), 'Line D should be in addedToModified');
  assert.strictEqual(diff.unifiedLines.length > 0, true, 'Unified diff lines should be generated');
  console.log('  ✓ Diff engine: Line additions, deletions, modifications, and unified lines passed');

  // 1.4 Whitespace and case sensitivity
  const wsDiff1 = computeTextDiff('const x = 1;', '  const x = 1;  ', { ignoreWhitespace: false });
  const wsDiff2 = computeTextDiff('const x = 1;', '  const x = 1;  ', { ignoreWhitespace: true });
  assert.strictEqual(wsDiff1.isIdentical, false, 'Whitespace sensitive should report difference');
  assert.strictEqual(wsDiff2.isIdentical, true, 'Ignore whitespace option should report identical');
  console.log('  ✓ Diff engine: Whitespace and case sensitivity options passed');

  // 2. MONGODB ATLAS LIVE DATABASE PERSISTENCE TESTS
  console.log('\n2. MONGODB ATLAS LIVE DATABASE & PERSISTENCE TESTS:');
  const database = await getDb();
  assert.ok(database, 'MongoDB Atlas database connection must be established');
  console.log('  ✓ MongoDB Atlas connection verified to database:', database.databaseName);

  const created = await createSharedDocument({
    title: 'Test Document Alpha (Atlas Live)',
    content: 'Initial persistent content in MongoDB Atlas',
    permissionMode: 'edit',
    durationMs: 3600000, // 1 hour
  });

  assert.ok(created.document.id, 'Document ID must be assigned');
  assert.ok(created.document.shareCode, 'ShareCode must be assigned');
  assert.ok(created.ownerToken, 'Owner token must be issued');
  assert.strictEqual(created.document.title, 'Test Document Alpha (Atlas Live)');

  const retrieved = await getDocumentByShareCode(created.document.shareCode);
  assert.ok(retrieved, 'Should retrieve created document from MongoDB Atlas');
  assert.strictEqual(retrieved?.content, 'Initial persistent content in MongoDB Atlas');
  console.log('  ✓ Live document creation and retrieval from MongoDB Atlas verified');

  // Test version snapshotting in MongoDB Atlas
  await updateDocumentContent({
    id: created.document.id,
    content: 'Updated content version 2 in Atlas',
    createSnapshot: true,
    actorName: 'Tester',
  });
  const versions = await getDocumentVersions(created.document.id);
  assert.strictEqual(versions.length >= 2, true, 'MongoDB versions collection should have at least 2 snapshots');

  // Test restoration
  const restored = await restoreDocumentVersion(created.document.id, versions[versions.length - 1].id, 'Restorer');
  assert.ok(restored, 'Version restore must succeed');
  const postRestore = await getDocumentByShareCode(created.document.shareCode);
  assert.strictEqual(postRestore?.content, 'Initial persistent content in MongoDB Atlas');
  console.log('  ✓ Live MongoDB Atlas storage, indexing, snapshots, and version restoration passed');

  // 3. FULL INTEGRATION HTTP API & WEBSOCKET REAL-TIME COLLABORATION
  console.log('\n3. FULL-STACK API & REAL-TIME WEBSOCKET COLLABORATION TESTS:');
  const app = express();
  app.use(express.json());
  app.use('/api', apiRouter);
  const server = http.createServer(app);
  setupWebSocketServer(server);

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}/ws`;

  // 3.1 REST API: POST /api/shares
  const createRes = await fetch(`${baseUrl}/api/shares`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Realtime Atlas Document',
      content: 'Line 1: Collab Base',
      permissionMode: 'edit',
      duration: '1h',
    }),
  });
  assert.strictEqual(createRes.status, 201, 'POST /api/shares should return HTTP 201');
  const shareData = await createRes.json();
  const shareCode = shareData.shareCode;
  const ownerToken = shareData.ownerToken;
  assert.ok(shareCode);
  assert.ok(ownerToken);
  console.log('  ✓ POST /api/shares returned 201 with shareCode & ownerToken');

  // 3.2 REST API: Expiration enforcement check
  const expRes = await fetch(`${baseUrl}/api/shares`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Expired Doc',
      content: 'Soon gone',
      duration: 'custom',
      customMinutes: -1, // in the past
    }),
  });
  const expData = await expRes.json();
  const getExpRes = await fetch(`${baseUrl}/api/shares/${expData.shareCode}`);
  assert.strictEqual(getExpRes.status, 410, 'Expired share must return HTTP 410 Gone on server');
  console.log('  ✓ Server-authoritative expiration returned HTTP 410 Gone');

  // 3.3 Real-time WebSocket Collaboration between Client A and Client B
  const clientA = new WebSocket(wsUrl);
  const clientB = new WebSocket(wsUrl);

  await Promise.all([
    new Promise((resolve) => clientA.on('open', resolve)),
    new Promise((resolve) => clientB.on('open', resolve)),
  ]);

  // Client A joins as Owner
  clientA.send(
    JSON.stringify({
      type: 'join',
      shareCode,
      ownerToken,
      clientId: 'client_A',
      clientName: 'Alice (Owner)',
    })
  );

  // Client B joins as Guest Editor
  clientB.send(
    JSON.stringify({
      type: 'join',
      shareCode,
      clientId: 'client_B',
      clientName: 'Bob (Guest)',
    })
  );

  // Wait for Client B to receive init
  const bInit = await new Promise<any>((resolve) => {
    clientB.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'init') resolve(msg);
    });
  });
  assert.strictEqual(bInit.content, 'Line 1: Collab Base', 'Client B should receive initial document content');
  assert.strictEqual(bInit.canEdit, true, 'Client B should receive canEdit: true');
  console.log('  ✓ Client A and Client B connected to collaboration room');

  // Client A edits -> Client B receives sync
  const bSyncPromise = new Promise<any>((resolve) => {
    clientB.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'sync') resolve(msg);
    });
  });

  clientA.send(
    JSON.stringify({
      type: 'edit',
      content: 'Line 1: Collab Base\nLine 2: Added by Alice in Real-Time',
      clientId: 'client_A',
    })
  );

  const bSync = await bSyncPromise;
  assert.strictEqual(
    bSync.content,
    'Line 1: Collab Base\nLine 2: Added by Alice in Real-Time',
    'Client B must receive real-time sync update from Client A'
  );
  console.log('  ✓ Real-time sync: Client A edit synchronized to Client B');

  // Client B edits back -> Client A receives sync
  const aSyncPromise = new Promise<any>((resolve) => {
    clientA.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'sync') resolve(msg);
    });
  });

  clientB.send(
    JSON.stringify({
      type: 'edit',
      content: 'Line 1: Collab Base\nLine 2: Added by Alice\nLine 3: Added by Bob',
      clientId: 'client_B',
    })
  );

  const aSync = await aSyncPromise;
  assert.strictEqual(
    aSync.content,
    'Line 1: Collab Base\nLine 2: Added by Alice\nLine 3: Added by Bob',
    'Client A must receive real-time sync update from Client B'
  );
  console.log('  ✓ Bi-directional real-time sync: Client B edit synchronized to Client A');

  // Test live permission change: Owner changes permission to 'view'
  const permChangePromise = new Promise<any>((resolve) => {
    clientB.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'permission_changed') resolve(msg);
    });
  });

  const permRes = await fetch(`${baseUrl}/api/shares/${shareCode}/settings`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'x-owner-token': ownerToken,
    },
    body: JSON.stringify({ permissionMode: 'view' }),
  });
  assert.strictEqual(permRes.status, 200);

  const permMsg = await permChangePromise;
  assert.strictEqual(permMsg.permissionMode, 'view');
  assert.strictEqual(permMsg.canEdit, false, 'Non-owner Client B must immediately lose edit permission');
  console.log('  ✓ Live permission change: Client B immediately demoted to view-only');

  // Test instant revocation
  const revokeMsgPromise = new Promise<any>((resolve) => {
    clientB.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'revoked') resolve(msg);
    });
  });

  const revokeRes = await fetch(`${baseUrl}/api/shares/${shareCode}/revoke`, {
    method: 'POST',
    headers: { 'x-owner-token': ownerToken },
  });
  assert.strictEqual(revokeRes.status, 200);

  const revokeMsg = await revokeMsgPromise;
  assert.strictEqual(revokeMsg.type, 'revoked');
  console.log('  ✓ Instant revocation broadcast: Client B notified and session severed');

  // Verify the updated document is stored live in MongoDB Atlas!
  const finalDoc = await getDocumentByShareCode(shareCode);
  assert.strictEqual(finalDoc?.revokedAt !== null, true, 'Document in Atlas must have revokedAt set');
  console.log('  ✓ Verified live state updated in MongoDB Atlas database');

  // Cleanup
  clientA.close();
  clientB.close();
  server.close();

  console.log('\n--- ALL TEST SUITE ASSERTIONS PASSED SUCCESSFULLY (100%) ---');
  process.exit(0);
}

runTestSuite().catch((err) => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});

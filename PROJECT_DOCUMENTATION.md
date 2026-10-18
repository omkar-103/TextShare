# TextShare & Diff Platform - Technical Architecture & Project Documentation

## 1. Executive Summary

**TextShare & Diff** is a high-performance, real-time collaborative text-sharing and deterministic text-comparison platform. The platform operates on a zero-friction, capability-secured model: users can paste text, code, logs, or configurations, generate a cryptographically unpredictable share URL, configure granular permissions (**View Only** vs. **Can Edit**), and collaborate simultaneously across multiple devices and browsers without requiring recipient account registration.

All shared documents, collaborative edits, revision snapshots, and audit events persist **live in a dedicated MongoDB Atlas database**, completely isolated from other projects on the cluster.

---

## 2. Live Database Architecture (MongoDB Atlas)

### 2.1 Complete Project Isolation
To ensure strict separation from existing databases and collections on the MongoDB Atlas cluster (`Cluster0`), the platform is configured to target a dedicated database:

- **Target Database**: `textshare_platform`
- **Cluster**: `cluster0.tbhl9le.mongodb.net`
- **Isolation Guarantee**: The platform will never touch, write to, read from, or modify any collections belonging to existing projects (e.g. `events`, `assignments`, `authConfig`, `attendanceRecords`, `subjects`, `tasks`, `dailyStates`, `appData`, `userSettings`, `sessions`, `checklists`, `attendanceSettings`).

### 2.2 Collections and Schema Specifications

The platform establishes three dedicated collections within the `textshare_platform` database:

#### A. Collection: `documents`
Stores the authoritative state, metadata, and capability credentials of every shared document.

```typescript
interface SharedDocumentRecord {
  _id?: ObjectId;
  id: string;                      // Cryptographically secure UUID
  shareCode: string;               // Unpredictable 10-character Base62 string (Unique Index)
  title: string;                   // Document title (defaults to 'Untitled Document')
  content: string;                 // Authoritative document textual content
  ownerToken: string;              // High-entropy 48-character hex owner capability token (Index)
  permissionMode: 'view' | 'edit'; // Access permission for link recipients
  passwordHash: string | null;     // Optional SHA-256 hash for protected shares
  language: string;                // Syntax identifier (e.g. 'javascript', 'json', 'log')
  createdAt: number;               // UTC epoch timestamp in milliseconds (Index)
  updatedAt: number;               // UTC epoch timestamp of last update
  expiresAt: number | null;        // Expiration timestamp (Index; null = never expires)
  revokedAt: number | null;        // Revocation timestamp (null = active)
  deletedAt: number | null;        // Soft-delete timestamp (null = active)
  contentVersion: number;          // Monotonically increasing revision integer
  viewCount: number;               // Total read accesses
  settings: string | null;         // JSON-encoded optional configuration
}
```

**Indexes Established:**
- `{ shareCode: 1 }` — Unique index enforcing fast, non-sequential lookup.
- `{ ownerToken: 1 }` — Index powering owner dashboard lookups.
- `{ expiresAt: 1 }` — Index enabling instant expiration verification.
- `{ createdAt: -1 }` — Reverse chronological index for dashboard sorting.

#### B. Collection: `versions`
Records point-in-time snapshots of the document for version history and one-click rollback.

```typescript
interface DocumentVersionRecord {
  _id?: ObjectId;
  id: string;                      // Snapshot UUID
  documentId: string;              // Parent document ID (Index)
  versionNumber: number;           // Revision number
  content: string;                 // Snapshot content
  title: string;                   // Document title at revision time
  changeSummary: string | null;    // Description (e.g. "Collaborative update", "Restored from Version 2")
  actorName: string | null;        // Actor label (e.g. "Owner", "Editor")
  createdAt: number;               // Snapshot epoch timestamp
}
```

**Indexes Established:**
- `{ documentId: 1, versionNumber: -1 }` — Composite index for timeline retrieval.

#### C. Collection: `audit_events`
Immutable record of security and lifecycle actions.

```typescript
interface AuditEventRecord {
  _id?: ObjectId;
  id: string;                      // Event UUID
  documentId: string;              // Target document ID (Index)
  action: string;                  // 'create' | 'permission_change' | 'revoke' | 'restore' | 'delete'
  details: string | null;          // Metadata payload
  createdAt: number;               // Action epoch timestamp
}
```

**Indexes Established:**
- `{ documentId: 1, createdAt: -1 }` — Fast chronological audit retrieval.

---

## 3. Real-Time Collaboration Architecture

### 3.1 Transport & Connection
- **Protocol**: WebSockets mounted on the same HTTP server at `/ws`.
- **Single Port (3000)**: Serves both Express REST API routes, the WebSocket upgrade handler, and Vite frontend.
- **Connection Handshake**:
  1. Client sends `{ type: 'join', shareCode, ownerToken, clientId, clientName }`.
  2. Server queries MongoDB Atlas (`documents` collection) by `shareCode`.
  3. Server validates existence, expiration (`expiresAt <= Date.now()`), and revocation (`revokedAt`).
  4. Server verifies password hash if password-protected.
  5. Sockets are admitted with authoritative permissions:
     - Owner (presented matching `ownerToken`) has administrative and edit rights.
     - Guests receive `canEdit: true` if `permissionMode === 'edit'`, otherwise `canEdit: false` (read-only).
  6. Server returns `{ type: 'init', content, version, canEdit, isOwner, participants }`.
  7. Presence broadcast `{ type: 'user_joined', participant }` notifies peers.

### 3.2 Synchronization & Durable Persistence
- When an authorized client edits text:
  1. Client emits `{ type: 'edit', content, clientId }`.
  2. Server verifies `canEdit` and validates active expiration.
  3. Server increments in-memory room version and broadcasts `{ type: 'sync', content, version, senderId }` to all other connected peers.
  4. Server schedules an **800ms debounced durable write** to MongoDB Atlas, updating `content`, `contentVersion`, and `updatedAt`.
  5. Creates periodic snapshot records in `versions` during active collaboration.
  6. Emits `{ type: 'save_status', status: 'saved' }` confirmation.

### 3.3 Dynamic Permission Demotion & Instant Revocation
- **Live Permission Demotion**: If the owner switches access to *View Only*, the server immediately emits `{ type: 'permission_changed', permissionMode: 'view' }` and flips `canEdit: false` across all guest sockets in that room. Subsequent edits from guests are rejected server-side.
- **Live Revocation**: If the owner clicks *Revoke Access*, the server sets `revokedAt` in MongoDB Atlas, emits `{ type: 'revoked' }` to the room, and closes non-owner sockets with code 4001.

---

## 4. Text Comparison Diff Engine

The `/compare` tool operates independently of the sharing engine:

1. **Deterministic Diff Algorithm**:
   - Uses `diff` algorithm (`diffLines`, `diffWordsWithSpace`, `diffChars`) without mock approximations.
   - Computes exact line additions (`+`), deletions (`-`), and modifications (`~`).
   - Generates aligned side-by-side row pairs matching deleted lines with replacement lines.
   - Generates standard unified diff patches with `@@ -old +new @@` headers.
2. **Missing-Content Diagnostic**:
   - Explicitly displays items present in the Original version but omitted from the Modified version.
   - Highlights items newly introduced in the Modified version.
3. **Diff Controls**:
   - **Side-by-Side View** vs. **Unified Diff View**.
   - **Ignore Whitespace** toggle.
   - **Ignore Case** toggle.
   - **Hide Unchanged** lines toggle.
   - **Export**: Copy patch or download `.patch` file.
   - **Import**: Preload content from any authorized share code.
4. **AI Difference Analysis**:
   - Optional server-side analysis via `@google/genai` (`gemini-2.5-flash`).
   - Summarizes architectural drift and code alterations in concise bullet points.
   - Safeguards: 15,000-character payload truncation, untrusted code sandboxing, and clear AI-generated badge.

---

## 5. REST API Specification

| Method | Endpoint | Description | Auth / Headers |
|---|---|---|---|
| `POST` | `/api/shares` | Creates a new share in MongoDB Atlas | Public |
| `GET` | `/api/shares/:shareCode` | Reads a shared document | Optional `x-owner-token`, `x-share-password` |
| `PATCH` | `/api/shares/:shareCode` | Updates document text | Requires edit permission or `x-owner-token` |
| `PATCH` | `/api/shares/:shareCode/settings` | Updates permissions or extends expiration | Requires `x-owner-token` |
| `POST` | `/api/shares/:shareCode/revoke` | Revokes share access immediately | Requires `x-owner-token` |
| `DELETE` | `/api/shares/:shareCode` | Permanently deletes share from MongoDB Atlas | Requires `x-owner-token` |
| `GET` | `/api/shares/:shareCode/versions` | Fetches revision history snapshots | Requires owner or edit permission |
| `POST` | `/api/shares/:shareCode/versions/:versionId/restore` | Restores a selected snapshot | Requires owner or edit permission |
| `GET` | `/api/shares/:shareCode/audit` | Retrieves audit events | Requires `x-owner-token` |
| `POST` | `/api/my-shares` | Queries MongoDB Atlas for shares owned by caller | Body `{ ownerTokens: [...] }` |
| `POST` | `/api/compare/explain` | Requests Gemini AI diff explanation | Public |
| `GET` | `/api/health` | Health check verifying Atlas connectivity | Public |

---

## 6. Security Guarantees

1. **Unpredictable Capability Identifiers**:
   - Base62 cryptographic share codes (`crypto.randomBytes(10)`).
   - High-entropy owner capability tokens (`crypto.randomBytes(24)` hex).
2. **Server-Authoritative Clock**:
   - Timestamps are computed and validated on the server in UTC epoch milliseconds. Client clock manipulation cannot extend expired shares.
3. **No Code Execution**:
   - All text, Markdown, scripts, SQL, and logs are rendered with strict string escaping and monospace text primitives. No user text is evaluated as executable HTML or JavaScript.
4. **Isolated MongoDB Storage**:
   - Database operations are scoped strictly to `textshare_platform`, protecting existing Atlas collections from any overlap.

---

## 7. Automated Test Suite Results

The automated integration test suite (`test/suite.ts`) verifies all layers against live MongoDB Atlas:

```
--- STARTING TEXTSHARE & DIFF COMPREHENSIVE TEST SUITE (MONGODB ATLAS) ---

1. UNIT TESTS:
  ✓ Cryptographic share code generation passed
  ✓ Diff engine: Identical text detection passed
  ✓ Diff engine: Line additions, deletions, modifications, and unified lines passed
  ✓ Diff engine: Whitespace and case sensitivity options passed

2. MONGODB ATLAS LIVE DATABASE & PERSISTENCE TESTS:
  [MongoDB Atlas] Connected to dedicated database: textshare_platform
  ✓ MongoDB Atlas connection verified to database: textshare_platform
  ✓ Live document creation and retrieval from MongoDB Atlas verified
  ✓ Live MongoDB Atlas storage, indexing, snapshots, and version restoration passed

3. FULL-STACK API & REAL-TIME WEBSOCKET COLLABORATION TESTS:
  ✓ POST /api/shares returned 201 with shareCode & ownerToken
  ✓ Server-authoritative expiration returned HTTP 410 Gone
  ✓ Client A and Client B connected to collaboration room
  ✓ Real-time sync: Client A edit synchronized to Client B
  ✓ Bi-directional real-time sync: Client B edit synchronized to Client A
  ✓ Live permission change: Client B immediately demoted to view-only
  ✓ Instant revocation broadcast: Client B notified and session severed
  ✓ Verified live state updated in MongoDB Atlas database

--- ALL TEST SUITE ASSERTIONS PASSED SUCCESSFULLY (100%) ---
```

---

## 8. Environment Setup & Deployment

### 8.1 Environment Variables (`.env`)
```bash
# MongoDB Atlas Database URI
MONGODB_URI="mongodb+srv://<username>:<password>@cluster0.tbhl9le.mongodb.net/textshare_platform?retryWrites=true&w=majority&appName=Cluster0"

# Dedicated Database Name (Isolated)
MONGODB_DB_NAME="textshare_platform"

# Application Server Port
PORT="3000"

# Optional Gemini API key for AI diff explanation
GEMINI_API_KEY="MY_GEMINI_API_KEY"
```

### 8.2 Execution Commands
- **Development**: `npm run dev` (starts full-stack server on port 3000).
- **Automated Tests**: `npx tsx test/suite.ts` (runs end-to-end unit and live Atlas integration tests).
- **Lint Check**: `npm run lint` (runs `tsc --noEmit`).
- **Production Build**: `npm run build` (builds Vite frontend bundle).
- **Production Start**: `npm start` (runs full-stack Node server serving Express, WebSockets, and production assets).

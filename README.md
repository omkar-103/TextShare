# TextShare & Diff Platform

A high-performance, real-time collaborative text-sharing and deterministic text-diff platform. Share text, code, logs, and configurations with cryptographic capability-based access control, real-time multi-user synchronization via WebSockets, granular permissions, expiration policies, version history, and side-by-side / inline diffing.

---

## ✨ Features

- **Instant Zero-Friction Sharing**: Share code snippets, notes, logs, and text without requiring recipient account creation.
- **Real-Time Collaboration**: Sub-10ms synchronization powered by WebSockets with live cursor tracking, participant presence, and active user indicators.
- **Dual Permission Modes**:
  - **View-Only**: Read-only distribution for safe sharing of sensitive logs, code, or documentation.
  - **Can Edit**: Bidirectional real-time editing with conflict resolution and version incrementing.
- **Deterministic Text & Code Diffing (`/compare`)**:
  - Side-by-side & unified split diff viewer.
  - Character-level and word-level change highlighting.
  - Whitespace tolerance toggle and case-sensitivity controls.
  - Export diff reports and swap inputs instantly.
- **Access Control & Security**:
  - Optional password protection (SHA-256).
  - Time-based expiration policies (10 mins, 1 hour, 24 hours, 7 days, or permanent).
  - High-entropy cryptographic capability owner tokens for non-registered document ownership.
  - Document revocation & one-click deletion.
- **Version History & Rollback**: Complete revision history for collaborative documents with instant preview and rollback.
- **Light & Dark Theme**: Built-in sleek dark and clean light mode design with zero layout shift.
- **SEO & Social Optimization**: Dynamic Open Graph / Twitter Card meta generation, sitemap, and crawl-friendly routes.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Lucide Icons, Wouter routing
- **Backend**: Node.js, Express, WebSocket (`ws`)
- **Database**: MongoDB Atlas (dedicated cluster isolation) with fallback SQLite support
- **Build Tool**: Vite

---

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or bun

### 1. Clone the repository

```bash
git clone https://github.com/omkar-103/TextShare.git
cd TextShare
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your MongoDB connection string and configuration:

```env
PORT=3000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.tbhl9le.mongodb.net/textshare_platform?retryWrites=true&w=majority
MONGODB_DB_NAME=textshare_platform
```

### 4. Run the development server

```bash
npm run dev
```

Visit `http://localhost:3000` in your browser.

---

## 📂 Project Structure

```text
├── public/                 # Static assets, robots.txt, sitemap.xml
├── server/                 # Express backend and WebSocket handler
│   ├── db.ts               # Database abstraction (MongoDB / SQLite)
│   ├── routes.ts           # REST API endpoints & capability verification
│   └── websocket.ts        # Real-time multi-peer sync engine
├── src/                    # React frontend application
│   ├── components/         # Reusable UI components (Editor, Navbar, Footer, etc.)
│   ├── context/            # React context providers (Theme, etc.)
│   ├── lib/                # Client utilities (theme, draft, storage, diff)
│   ├── pages/              # Application views (Home, Compare, SharedDocument, etc.)
│   ├── App.tsx             # Main client router
│   └── main.tsx            # Application entrypoint
├── server.ts               # Main HTTP & WebSocket server entrypoint
├── package.json
└── tsconfig.json
```

---

## 🔒 Security & Privacy

- **No Secret Leaks**: All credentials and sensitive connection strings are strictly managed via environment variables and excluded from source control.
- **Ephemeral and Managed Expiry**: Expired shares are automatically pruned and rendered inaccessible.
- **Capability Tokens**: Edit and owner management rights are granted via unguessable high-entropy tokens rather than exposed document IDs.

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.

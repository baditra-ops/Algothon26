# FIELDNOTE — Offline-First Field Operations Workspace

> **Problem Statement ALG-WEB-02 — Offline-First Application**  
> *"Work anywhere. Sync when connected."*

---

## 1. Problem Being Solved

Field personnel—such as utility inspectors, civil engineers, emergency responders, and environmental researchers—frequently operate in environments with intermittent, degraded, or non-existent cellular and Wi-Fi connectivity. 

Standard cloud-centric web applications fail critically in these scenarios: forms cannot be submitted, tasks cannot be reviewed, and field workers face data loss, frustrating timeouts, or halted workflows.

**FIELDNOTE** solves this by adopting a strict **Offline-First architecture**:
- Frontline personnel can open the workspace, navigate projects, log checklist tasks, and record observations regardless of current network state.
- All actions are committed immediately to the local device store with zero UI latency.
- When connectivity is restored, an orchestration engine transparently reconciles pending changes with the central backend while handling conflicts safely.

> **Current Status**: **Phase 1 — Project Foundation established.**  
> Foundational client application shell, routing structure, Express REST API, health monitoring, and modular scaffolding are configured. Storage engines (Dexie/IndexedDB), Service Worker caches, and sync queues will be introduced in subsequent prompts.

---

## 2. Architectural Pipeline & Roadmap

The final application will eventually realize the following end-to-end architectural flow:

```
[ User Interaction ]
         │
         ▼
[ React + Vite Client Shell ]
         │
         ▼
[ PWA / Service Worker ] ─────────► (Static Asset & Shell Caching)
         │
         ▼
[ IndexedDB via Dexie.js ] ───────► (Local-First Authoritative Store)
         │
         ▼
[ Offline Queue + Sync Engine ] ──► (Conflict Detection & Reconciliation)
         │
         ▼
   (Network Restored)
         │
         ▼
[ REST API / Node.js + Express ]
         │
         ▼
[ PostgreSQL via Supabase ]
```

### Phased Roadmap

| Stage | Milestone | Status |
|---|---|---|
| **Phase 1** | **Foundation**: React + Vite, Tailwind CSS, Express REST API, health endpoint, modular project structure | **Completed** |
| **Phase 2** | **Client Persistence**: Service Worker, PWA caching, Dexie.js IndexedDB schema, online/offline detection | Planned |
| **Phase 3** | **Offline Queue & Optimistic Mutations**: Change log, retry mechanisms, idempotency keys | Planned |
| **Phase 4** | **Sync Engine & Conflict Resolution**: Bi-directional sync, version vectors / timestamp resolution | Planned |
| **Phase 5** | **Cloud Integration & Security**: Supabase / PostgreSQL persistence, access control, audit trails | Planned |

---

## 3. Tech Stack

### Frontend
- **Framework**: React 19
- **Build Tool**: Vite 8
- **Language**: JavaScript (ES Modules)
- **Styling**: Tailwind CSS v4
- **Routing**: React Router v7
- **Iconography**: Lucide React

### Backend
- **Runtime**: Node.js (v20+)
- **Server Framework**: Express 4
- **Language**: JavaScript (ES Modules)
- **CORS Handling**: `cors` middleware with configurable origin
- **Environment Management**: `dotenv`
- **Development Tooling**: `nodemon`

### Cloud Database (Targeted for upcoming phase)
- PostgreSQL managed via Supabase (not implemented in Phase 1)

---

## 4. Folder Structure

```text
fieldnote/
├── frontend/
│   ├── public/
│   │   ├── favicon.svg
│   │   └── icons.svg
│   ├── src/
│   │   ├── components/
│   │   │   ├── Layout.jsx              # Responsive app shell & footer
│   │   │   ├── Navbar.jsx              # Navigation header & brand
│   │   │   ├── SectionPlaceholder.jsx  # Reusable placeholder for upcoming modules
│   │   │   └── StatusBadge.jsx         # Connectivity indicator badge (● Online)
│   │   ├── hooks/
│   │   │   └── useBackendStatus.js     # Health probe hook for /api/health
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx       # Landing & status dashboard
│   │   │   ├── NotFoundPage.jsx        # 404 handler
│   │   │   ├── ProjectsPage.jsx        # Projects section shell
│   │   │   ├── SyncCenterPage.jsx      # Sync center telemetry shell
│   │   │   └── TasksPage.jsx           # Field tasks & checklists shell
│   │   ├── services/
│   │   │   └── api.js                  # Centralized REST API client
│   │   ├── utils/
│   │   │   └── cn.js                   # Class merging utility
│   │   ├── App.jsx                     # Route definitions
│   │   ├── index.css                   # Tailwind v4 import & typography
│   │   └── main.jsx                    # React entrypoint
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   └── index.js                # Environment variable reader
│   │   ├── controllers/
│   │   │   └── health.controller.js    # /api/health controller
│   │   ├── middleware/
│   │   │   ├── errorHandler.js         # Centralized error handler
│   │   │   └── notFoundHandler.js      # 404 unknown route handler
│   │   ├── routes/
│   │   │   ├── health.routes.js        # Health route definitions
│   │   │   └── index.js                # Top-level API router (/api)
│   │   ├── services/
│   │   │   └── health.service.js       # Health logic & status payload
│   │   └── server.js                   # Express application setup & listener
│   ├── .env.example
│   └── package.json
│
├── .gitignore
└── README.md
```

---

## 5. Environment Variables

### Backend (`backend/.env`)
Copy `backend/.env.example` to `backend/.env`:
```env
PORT=5000
CLIENT_URL=http://localhost:5173
```

### Frontend (`frontend/.env`)
Copy `frontend/.env.example` to `frontend/.env`:
```env
VITE_API_URL=http://localhost:5000
```

---

## 6. How to Run the Project Locally

### Prerequisites
- **Node.js** (v18.0.0 or higher, v20+ recommended)
- **npm** (v9.0.0 or higher)

### 1. Start the Backend Server

```bash
cd backend
npm install
npm run dev
```

The Express API will boot at `http://localhost:5000`.  
Verify health check:
```bash
curl http://localhost:5000/api/health
```
Expected response:
```json
{
  "status": "ok",
  "service": "fieldnote-api",
  "timestamp": "2026-10-04T06:06:24.584Z"
}
```

### 2. Start the Frontend Client

Open a second terminal window:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server will start at `http://localhost:5173`.  
Open your browser to [http://localhost:5173](http://localhost:5173).

---

## 7. Package Scripts Summary

### Frontend Scripts
- `npm run dev` — Starts Vite dev server on port 5173
- `npm run build` — Bundles production assets into `dist/`
- `npm run preview` — Locally previews production build

### Backend Scripts
- `npm run dev` — Starts Express server with hot-reload via `nodemon`
- `npm start` — Starts Express server with standard Node runtime
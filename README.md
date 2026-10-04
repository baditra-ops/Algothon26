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

> **Current Status**: **Phase 3 — Progressive Web App (PWA) & Service-Worker Foundation Established.**  
> Web App Manifest, Service Worker precaching of the application shell, installability support, real-time online/offline event detection, and non-intrusive offline UI indicators are operational.  
> *Note: Local database persistence (IndexedDB / Dexie.js) will be introduced in Prompt 4, followed by the mutation queue and conflict engine.*

---

## 2. Architecture & Pipeline

```
React UI (Vite SPA)
       │
       ▼
PWA / Service Worker (App Shell Precaching & Offline SPA Routing)
       │
       ▼
    REST API (Client API Services)
       │
       ▼
Node.js + Express (CORS, Error Handling, Concurrency Guard)
       │
       ▼
Controllers & Services (Parameterized SQL)
       │
       ▼
PostgreSQL (Connection Pool / pg)
       │
       ▼
Supabase (Hosted Cloud DB)
```

### Full Target Architectural Flow
```
[ Frontline User Interaction ]
              │
              ▼
  [ React + Vite Client Shell ]
              │
              ▼
    [ PWA / Service Worker ]  ────────► (Static Asset Caching - Prompt 3: BUILT)
              │
              ▼
   [ IndexedDB via Dexie.js ] ────────► (Local-First Store - Prompt 4: NEXT)
              │
              ▼
 [ Offline Queue + Sync Engine ] ─────► (Conflict Resolution - Prompt 6/7)
              │
        (Network Online)
              │
              ▼
   [ REST API / Express ]     ────────► (Server-Side Concurrency - Prompt 2: BUILT)
              │
              ▼
 [ PostgreSQL via Supabase ]  ────────► (Central Authoritative Cloud Store)
```

### Phased Roadmap

| Stage | Milestone | Status |
|---|---|---|
| **Phase 1** | **Foundation**: React + Vite, Tailwind CSS, Express API shell, health endpoint | **Completed** |
| **Phase 2** | **Database & REST API**: PostgreSQL schema, Supabase pooling, Projects/Tasks API, versioning & HTTP 409 conflicts | **Completed** |
| **Phase 3** | **PWA & Caching Layer**: Service Worker registration, manifest, application shell cache, online/offline detection | **Completed** |
| **Phase 4** | **Client Persistence**: IndexedDB via Dexie.js, local schema, authoritative client store | Planned |
| **Phase 5** | **Offline Mutation Queue**: Change tracking, queue replay, idempotency keys | Planned |
| **Phase 6** | **Sync Engine & Reconciliation**: Bi-directional sync, conflict detection | Planned |
| **Phase 7** | **Conflict Resolution**: Client Wins / Server Wins / Manual 3-way merge | Planned |
| **Phase 8** | **Polish & Demo Hardening**: Field inspection workflow, simulation controls | Planned |

---

## 3. PWA / Offline Foundation (Prompt 3)

### Features Implemented:
1. **Web App Manifest (`dist/manifest.webmanifest`)**:
   - `name`: `FIELDNOTE — Field Operations Workspace`
   - `short_name`: `FIELDNOTE`
   - `description`: `Offline-first field operations workspace`
   - `display`: `standalone`
   - `orientation`: `portrait-primary`
   - `theme_color` & `background_color`: `#020617` (Dark Slate theme)
   - Icons: 192x192, 512x512, and 512x512 maskable PNGs located in `/public`.

2. **Service Worker (`sw.js` via Workbox)**:
   - Precaches the entire application shell (HTML, JavaScript bundles, CSS, icons, SVGs).
   - Serves cached `/index.html` for offline navigation across all client routes (`/`, `/projects`, `/tasks`, `/sync-center`).
   - Excludes dynamic API requests (`navigateFallbackDenylist: [/^\/api/]`) so API routes are never confused with application shell HTML.
   - Disabled during local development (`devOptions.enabled = false`) to prevent stale caching while writing code.

3. **Real-time Connectivity Indicator**:
   - [`frontend/src/hooks/useOnlineStatus.js`](file:///e:/Algothon26/frontend/src/hooks/useOnlineStatus.js): Subscribes to window `online` and `offline` events.
   - [`frontend/src/components/ConnectionStatus.jsx`](file:///e:/Algothon26/frontend/src/components/ConnectionStatus.jsx): Displays `● Online` with a pulsing emerald badge when connected, or `● Offline` with an amber warning badge when disconnected.
   - [`frontend/src/components/OfflineBanner.jsx`](file:///e:/Algothon26/frontend/src/components/OfflineBanner.jsx): Non-intrusive top banner notifying workers that the app is running in offline mode.

4. **Installability**:
   - [`frontend/src/components/InstallButton.jsx`](file:///e:/Algothon26/frontend/src/components/InstallButton.jsx): Captures browser `beforeinstallprompt` events and displays a clean "Install App" button in supported browsers.

> **Important Boundary**: The current Service Worker caches static assets and the application shell only. IndexedDB persistence (Dexie.js), offline mutation queuing, and background data synchronization will be introduced in subsequent prompts.

---

## 4. Testing Service Workers & PWA Capabilities

Service Workers and Web App Manifests are designed for production-like environments. To test PWA features:

### 1. Build and Preview the PWA
```bash
cd frontend
npm run build
npm run preview
```
The preview server starts on `http://localhost:4173`.

### 2. Verify in Browser DevTools:
1. Open Chrome/Edge/Firefox DevTools (F12) to `http://localhost:4173`.
2. Go to **Application** → **Manifest**:
   - Verify App name: `FIELDNOTE — Field Operations Workspace`
   - Verify Icons load cleanly (192px and 512px).
3. Go to **Application** → **Service Workers**:
   - Verify `sw.js` is registered and active (`#... activated and is running`).
4. Go to **Network** tab → Toggle throttling to **Offline**:
   - Refresh the page: the application shell immediately loads from the Service Worker cache!
   - Observe the top banner: `Offline Mode Active: Running from cached application shell`.
   - Observe the connectivity badge switches to `● Offline`.
5. Toggle Network back to **Online**:
   - Badge dynamically switches to `● Online` and the offline banner dismisses automatically.

---

## 5. Database Architecture & Schema

The PostgreSQL schema is located in [`backend/database/schema.sql`](file:///e:/Algothon26/backend/database/schema.sql).

### Entity-Relationship Model

```
┌─────────────────────────────────┐
│            PROJECTS             │
├─────────────────────────────────┤
│ id (UUID, PK)                   │
│ name (TEXT, NOT NULL)           │
│ description (TEXT)              │
│ created_at (TIMESTAMPTZ)        │
│ updated_at (TIMESTAMPTZ)        │
└──────────────┬──────────────────┘
               │ 1
               │
               │ has many (ON DELETE CASCADE)
               ▼ N
┌─────────────────────────────────┐
│             TASKS               │
├─────────────────────────────────┤
│ id (UUID, PK)                   │
│ project_id (UUID, FK -> projects)│
│ title (TEXT, NOT NULL)          │
│ description (TEXT)              │
│ status (TODO|IN_PROGRESS|DONE)  │
│ priority (LOW|MEDIUM|HIGH)      │
│ due_date (TIMESTAMPTZ, NULLABLE)│
│ created_at (TIMESTAMPTZ)        │
│ updated_at (TIMESTAMPTZ)        │
│ version (INT, >= 1)             │
└─────────────────────────────────┘
```

---

## 6. REST API Endpoints

Base URL: `http://localhost:5000/api`

| Resource | Method | Path | Description | Status Code |
|---|---|---|---|---|
| **Health** | `GET` | `/api/health` | Health & API status | `200 OK` |
| **Projects** | `GET` | `/api/projects` | Get all projects | `200 OK` |
| | `GET` | `/api/projects/:id` | Get project by UUID | `200 OK` / `404` |
| | `POST` | `/api/projects` | Create new project | `201 Created` |
| | `PUT` | `/api/projects/:id` | Update project | `200 OK` / `404` |
| | `DELETE` | `/api/projects/:id` | Delete project & cascade tasks | `204 No Content` |
| | `GET` | `/api/projects/:projectId/tasks` | Get tasks for project | `200 OK` |
| **Tasks** | `GET` | `/api/tasks` | Get all tasks | `200 OK` |
| | `GET` | `/api/tasks/:id` | Get task by UUID | `200 OK` / `404` |
| | `POST` | `/api/tasks` | Create task (`version = 1`) | `201 Created` |
| | `PUT` | `/api/tasks/:id` | Update task (`version = v + 1`) | `200 OK` / `409 Conflict` |
| | `DELETE` | `/api/tasks/:id` | Delete task | `204 No Content` |

---

## 7. How to Run Locally

### 1. Backend Server
```bash
cd backend
npm install
npm run dev
```
Runs at: `http://localhost:5000`  
Run tests: `npm run test` (41 assertions passing)

### 2. Frontend Application (Development)
```bash
cd frontend
npm install
npm run dev
```
Runs at: `http://localhost:5173`

### 3. Frontend Application (PWA Production Preview)
```bash
cd frontend
npm run build
npm run preview
```
Runs at: `http://localhost:4173`
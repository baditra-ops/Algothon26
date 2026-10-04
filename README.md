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

> **Current Status**: **Phase 4 — Client-Side Local Persistence Layer (IndexedDB / Dexie.js) Established.**  
> On-device IndexedDB database (`fieldnote_db`), project/task repository abstractions, client-side UUID generation, sync metadata lifecycle tracking, soft-deletion semantics for server records, and telemetry inspection are fully operational.  
> *Note: Offline synchronization and mutation queuing will be introduced in Prompt 5, followed by the conflict resolution engine in Prompt 6/7.*

---

## 2. Architecture & Pipeline

FIELDNOTE deliberately maintains two distinct, decoupled data access layers at this stage:

### 1. Client-Side Local Persistence (IndexedDB)
```
React UI
   │
   ▼
Local Repository (projectRepository / taskRepository)
   │
   ▼
Dexie.js (Schema v1)
   │
   ▼
IndexedDB (fieldnote_db)
```

### 2. Server-Side Authoritative Store (PostgreSQL / Supabase)
```
React / API Service (frontend/src/services/api.js)
   │
   ▼
REST API (/api/projects, /api/tasks)
   │
   ▼
Express (CORS, Validation, Concurrency Guard)
   │
   ▼
Controllers & Services (Parameterized SQL)
   │
   ▼
PostgreSQL Connection Pool (pg)
   │
   ▼
Supabase (Cloud PostgreSQL)
```

### 3. Target Future Pipeline (Prompts 5–7)
```
[ Local Repository / Dexie ] ◄───► [ Offline Queue & Sync Engine ] ◄───► [ REST API / Express ] ◄───► [ Supabase ]
```

### Phased Roadmap

| Stage | Milestone | Status |
|---|---|---|
| **Phase 1** | **Foundation**: React + Vite, Tailwind CSS, Express API shell, health endpoint | **Completed** |
| **Phase 2** | **Database & REST API**: PostgreSQL schema, Supabase pooling, Projects/Tasks API, versioning & HTTP 409 conflicts | **Completed** |
| **Phase 3** | **PWA & Caching Layer**: Service Worker registration, manifest, application shell cache, online/offline detection | **Completed** |
| **Phase 4** | **Client Persistence**: IndexedDB via Dexie.js, local repositories, sync metadata, offline CRUD | **Completed** |
| **Phase 5** | **Offline Mutation Queue**: Change tracking, queue replay buffer, idempotency keys | Planned |
| **Phase 6** | **Sync Engine & Reconciliation**: Bi-directional sync, conflict detection | Planned |
| **Phase 7** | **Conflict Resolution**: Client Wins / Server Wins / Manual 3-way merge | Planned |
| **Phase 8** | **Polish & Demo Hardening**: Field inspection workflow, simulation controls | Planned |

---

## 3. Local Persistence Layer (Prompt 4)

### Database Details
- **Engine**: IndexedDB via **Dexie.js** (`^4.4.6`).
- **Database Name**: `fieldnote_db`
- **Schema Version**: `1`
- **Stores**:
  - `projects`: `id, updated_at, sync_status`
  - `tasks`: `id, project_id, status, priority, updated_at, sync_status`

### Entity Schemas & Sync Metadata

#### Projects Table (`projects`)
- `id`: UUID string (generated on client using `crypto.randomUUID()`)
- `name`: Non-empty string
- `description`: Text notes
- `created_at`: ISO timestamp string
- `updated_at`: ISO timestamp string
- `sync_status`: `SYNCED` | `PENDING_CREATE` | `PENDING_UPDATE` | `PENDING_DELETE` | `CONFLICT`
- `last_synced_at`: ISO timestamp string (or `null`)

#### Tasks Table (`tasks`)
- `id`: UUID string (generated on client using `crypto.randomUUID()`)
- `project_id`: UUID reference to parent project
- `title`: Non-empty string
- `description`: Text checklist/details
- `status`: `'TODO'` | `'IN_PROGRESS'` | `'COMPLETED'`
- `priority`: `'LOW'` | `'MEDIUM'` | `'HIGH'`
- `due_date`: ISO timestamp string (or `null`)
- `created_at`: ISO timestamp string
- `updated_at`: ISO timestamp string
- `version`: **Important rule** — Locally created tasks start at `version = 0`. Server tasks maintain their server version (e.g. `1, 2, 3`). Local updates do **not** increment the server version locally; they set `sync_status = PENDING_UPDATE`.
- `sync_status`: Lifecycle status
- `last_synced_at`: ISO timestamp string (or `null`)

### Deletion Semantics (Local-Only vs. Server-Known)
- **Local-Only Records** (`sync_status === 'PENDING_CREATE'` or `version === 0`):
  Records that have never reached the server are **physically removed** from IndexedDB immediately (`db.projects.delete(id)` or `db.tasks.delete(id)`).
- **Server-Known Records** (`sync_status === 'SYNCED'` or `PENDING_UPDATE` or `version > 0`):
  Records that exist on the central server are **soft-deleted** by setting `sync_status = 'PENDING_DELETE'` and updating `updated_at`. This preserves the tombstone so the future sync engine (Prompt 5/6) can issue a `DELETE` request to the server. Standard repository queries exclude `PENDING_DELETE` items by default (`{ includeDeleted: false }`).

---

## 4. Repository Functions & Modules

All IndexedDB interactions are strictly encapsulated in repositories ([`frontend/src/db/repositories/`](file:///e:/Algothon26/frontend/src/db/repositories/)). Components never call Dexie directly.

### Project Repository ([`projectRepository.js`](file:///e:/Algothon26/frontend/src/db/repositories/projectRepository.js))
- `createProject(projectData)` — Validates and stores a new project (`sync_status = PENDING_CREATE`).
- `getProjectById(id, { includeDeleted = false })` — Retrieves a project by ID.
- `getAllProjects({ includeDeleted = false })` — Returns all active local projects sorted by `updated_at` descending.
- `updateProject(id, updates)` — Updates project fields and transitions status to `PENDING_UPDATE` (if previously `SYNCED`).
- `deleteProject(id)` — Handles physical deletion for local projects or soft-deletion for server-synced projects.
- `clearProjects()` — Empties the local projects table.
- `upsertSyncedProjects(projects)` — Caches downloaded server records with `sync_status = SYNCED`.

### Task Repository ([`taskRepository.js`](file:///e:/Algothon26/frontend/src/db/repositories/taskRepository.js))
- `createTask(taskData)` — Validates and stores a task with `version = 0` and `sync_status = PENDING_CREATE`.
- `getTaskById(id, { includeDeleted = false })` — Retrieves a single task.
- `getAllTasks({ includeDeleted = false })` — Returns all tasks sorted by `updated_at` descending.
- `getTasksByProjectId(projectId, { includeDeleted = false })` — Queries tasks for a specific project.
- `updateTask(id, updates)` — Updates task fields without artificially incrementing server version.
- `deleteTask(id)` — Physical deletion for local tasks or soft deletion for server tasks.
- `clearTasks()` — Empties the local tasks table.
- `upsertSyncedTasks(tasks)` — Caches downloaded server records with `sync_status = SYNCED`.

### Development Utilities ([`devTools.js`](file:///e:/Algothon26/frontend/src/db/devTools.js))
- `getLocalDatabaseStats()` — Returns summary metrics (counts by status, active vs deleted).
- `getPendingSyncRecords()` — Lists all local records awaiting upstream sync.
- `clearLocalDatabase()` — Clears both IndexedDB tables for clean slate testing.
- `seedDevelopmentData()` — Explicitly seeds sample field projects and checklist tasks on demand.

---

## 5. Testing & Verification

### 1. Run the Frontend IndexedDB Test Suite (35 Assertions)
```bash
cd frontend
npm run test:db
```
Verifies:
- Database creation (`fieldnote_db`)
- Project & task CRUD with client-side UUID generation
- Task filtering by `project_id`
- Version preservation (`version = 0` for local, preserved for server)
- Soft deletion for server records vs. physical deletion for local records
- Validation rules (rejecting empty names and invalid statuses)
- Telemetry reporting

### 2. Run the Backend REST API Test Suite (41 Assertions)
```bash
cd backend
npm run test
```
Verifies that all server-side Supabase PostgreSQL endpoints, task version increments (`1 -> 2 -> 3`), optimistic concurrency (`HTTP 409 Conflict`), and cascading deletes remain functional.

### 3. Production Build
```bash
cd frontend
npm run build
```
Compiles cleanly in under 1 second with PWA service worker and Dexie chunks.

---

## 6. How to Run Locally

### 1. Backend Server
```bash
cd backend
npm install
npm run dev
```
Runs at: `http://localhost:5000`

### 2. Frontend Application (Development)
```bash
cd frontend
npm install
npm run dev
```
Runs at: `http://localhost:5173`

### 3. Frontend Application (Production Preview with PWA & IndexedDB)
```bash
cd frontend
npm run build
npm run preview
```
Runs at: `http://localhost:4173`
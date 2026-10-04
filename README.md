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

> **Current Status**: **Phase 7 — Offline Conflict Resolution & Interactive UI Operational.**  
> User-driven conflict resolution engine and side-by-side comparison modal fully operational. Preserves local and server snapshots upon HTTP 409 `VERSION_CONFLICT` without silent data overwrites or automatic last-write-wins. Provides three explicit resolution strategies: **Keep Local**, **Keep Server**, and **Merge / Edit**, executed inside atomic Dexie transactions, removing stale mutations, and re-synchronizing with updated server version bases.

---

## 2. Architecture & Pipeline

FIELDNOTE implements a decoupled, offline-first data pipeline:

### 1. Synchronization Architecture
```
React UI (Tasks & Sync Center)
   │
   ▼
Conflict Resolution UI (Side-by-Side Comparison & Merge Editor)
   │
   ▼
Conflict Repository & Service (Atomic Transactions: tasks + outbox + conflicts)
   │
   ▼
Sync Manager
   │
   ▼
Sync Engine
├── Outbox Processor (Deterministic FIFO & Entity Dependency Order)
├── Pull Service (Reconciliation protecting uncommitted local state)
└── Conflict Detector (HTTP 409 Capture & Snapshot Preservation)
   │
   ▼
API Service (frontend/src/services/api.js)
   │
   ▼
REST API (/api/projects, /api/tasks)
   │
   ▼
Express Backend (CORS, Validation, Concurrency Guard)
   │
   ▼
Supabase PostgreSQL

And Client-Side Storage:
IndexedDB (fieldnote_db, Schema v3)
├── projects
├── tasks
├── outbox
└── conflicts
```

### Phased Roadmap

| Stage | Milestone | Status |
|---|---|---|
| **Phase 1** | **Foundation**: React + Vite, Tailwind CSS, Express API shell, health endpoint | **Completed** |
| **Phase 2** | **Database & REST API**: PostgreSQL schema, Supabase pooling, Projects/Tasks API, versioning & HTTP 409 conflicts | **Completed** |
| **Phase 3** | **PWA & Caching Layer**: Service Worker registration, manifest, application shell cache, online/offline detection | **Completed** |
| **Phase 4** | **Client Persistence**: IndexedDB via Dexie.js, local repositories, sync metadata, offline CRUD | **Completed** |
| **Phase 5** | **Offline Mutation Queue**: Outbox buffer, atomic writes, mutation coalescing, idempotency keys | **Completed** |
| **Phase 6** | **Sync Engine & Reconciliation**: Bi-directional sync, optimistic concurrency, conflict persistence, retries, single lock | **Completed** |
| **Phase 7** | **Conflict Resolution**: Keep Local / Keep Server / Custom Merge UI, side-by-side comparison, atomic transactions | **Completed** |
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
- `createTask(taskData)` — Validates and stores a task with `version = 0`, `sync_status = PENDING_CREATE`, and atomic outbox mutation.
- `getTaskById(id, { includeDeleted = false })` — Retrieves a single task.
- `getAllTasks({ includeDeleted = false })` — Returns all tasks sorted by `updated_at` descending.
- `getTasksByProjectId(projectId, { includeDeleted = false })` — Queries tasks for a specific project.
- `updateTask(id, updates)` — Updates task fields without artificially incrementing server version, coalescing pending outbox mutations.
- `deleteTask(id)` — Physical deletion for local tasks or soft deletion for server tasks with outbox cleanup.
- `clearTasks()` — Empties the local tasks table.
- `upsertSyncedTasks(tasks)` — Caches downloaded server records with `sync_status = SYNCED`.

### Outbox Repository ([`outboxRepository.js`](file:///e:/Algothon26/frontend/src/db/repositories/outboxRepository.js))
- `enqueueMutation(mutation)` — Validates and records a new mutation in the outbox.
- `getMutationById(id)` — Retrieves a mutation by UUID.
- `getPendingMutations()` — Retrieves all mutations in `PENDING` status ordered chronologically (FIFO).
- `getMutationsByEntity(entityType, entityId)` — Retrieves all mutations for a specific project or task.
- `getAllMutations()` — Retrieves all mutations in the queue ordered with most recent first.
- `updateMutationStatus(id, newStatus, options)` — Safely transitions mutation status with lifecycle guard checks.
- `markMutationProcessing(id)` — Transitions mutation to `PROCESSING`, increments `attempt_count`, and records timestamp.
- `markMutationFailed(id, error)` — Transitions mutation to `FAILED` and records safe error message.
- `markMutationCompleted(id)` — Transitions mutation to `COMPLETED`.
- `getOutboxStats()` — Returns aggregated counts by status, entity type, and operation.
- `clearCompletedMutations()` — Deletes only completed mutations from the outbox.

### Development Utilities ([`devTools.js`](file:///e:/Algothon26/frontend/src/db/devTools.js))
- `getLocalDatabaseStats()` — Returns summary metrics (counts by status, active vs deleted, and outbox queue stats).
- `getPendingSyncRecords()` — Lists all local records awaiting upstream sync.
- `getOutboxMutations()` — Retrieves all mutations in the outbox queue.
- `clearCompletedMutations()` — Safely removes completed mutations.
- `clearLocalDatabase()` — Clears all IndexedDB tables (`projects`, `tasks`, and `outbox`) for clean-slate testing.
- `seedDevelopmentData()` — Explicitly seeds sample field projects, tasks, and atomic outbox mutations on demand.

---

## 5. Local Mutation Queue / Outbox Buffer (Prompt 5)

### Why the Outbox Exists
When field engineers operate in disconnected environments, every state mutation (creating a project, updating checklist items, deleting assets) must be captured durably and deterministically. The outbox pattern decouples user actions from network communication:
1. Operations succeed with zero latency on-device.
2. Changes are recorded in IndexedDB as discrete, ordered mutations.
3. When network connectivity is restored (in Prompt 6), the synchronization engine replays these queued mutations against the central Express/Supabase REST API.

### Dexie Schema Migration (v1 → v2)
The IndexedDB database was migrated non-destructively from version 1 to 2:
- **Database**: `fieldnote_db`
- **Schema Version**: `2`
- **New Store**: `outbox: 'id, entity_type, entity_id, operation, status, created_at, idempotency_key, [entity_type+entity_id]'`
- **Migration Guarantee**: Existing version 1 users retain all existing project and task records without data loss or table truncation.

### Outbox Record Structure
Each mutation conforms to the following serializable contract:
```javascript
{
  id: "uuid-v4",               // Unique mutation UUID
  entity_type: "project" | "task",
  entity_id: "uuid-v4",        // ID of the target project or task
  operation: "CREATE" | "UPDATE" | "DELETE",
  payload: { ... },            // Plain serializable payload required for future HTTP API calls
  base_version: 2 | null,      // Last known server version for tasks; null for projects & local tasks
  idempotency_key: "uuid-v4",  // Stable unique key permanently attached to the mutation
  status: "PENDING",           // PENDING | PROCESSING | FAILED | COMPLETED
  created_at: "2026-10-04T...",// ISO timestamp
  updated_at: "2026-10-04T...",// ISO timestamp
  attempt_count: 0,            // Non-negative retry counter
  last_attempt_at: null,       // ISO timestamp of last processing attempt
  last_error: null             // Safe sanitized error message
}
```

### Mutation Status Lifecycle
```
PENDING ──► PROCESSING ──► COMPLETED
                 │
                 ▼
               FAILED ──► PENDING (Manual retry)
```
- **Lifecycle Guards**: Completed mutations cannot be transitioned back to `PENDING` or `PROCESSING` (preventing silent resurrections).
- **Processing Isolation**: Active `PROCESSING` mutations are shielded from accidental coalescing.

### Idempotency Keys
- Each mutation is assigned a stable idempotency key generated via client-side UUID.
- The key is **permanently preserved** across mutation payload updates and retry attempts.
- *Note*: While the backend does not yet enforce HTTP idempotency headers, client-side idempotency keys are prepared for safe at-least-once synchronization delivery in Prompt 6.

### Safe Mutation Coalescing
To prevent unbounded duplicate network traffic when users make rapid offline edits:
1. **Pending CREATE + Subsequent UPDATE**: Updates the payload of the pending `CREATE` mutation directly in-place. The entity remains in `PENDING_CREATE`. Mutation ID and idempotency key remain unchanged.
2. **Pending UPDATE + Subsequent UPDATE**: Merges the new fields into the existing pending `UPDATE` payload, preserving the original `base_version`, mutation ID, and idempotency key.
3. **No Coalescing for Active Mutations**: Mutations in `PROCESSING` or `COMPLETED` are never coalesced; a separate operation is enqueued if necessary.

### Local-Only vs. Server-Known Deletion
1. **Local-Only Deletion** (`sync_status = PENDING_CREATE`):
   - The entity was created offline and never sent to the server.
   - Deleting it physically removes the record from IndexedDB and purges all pending/failed outbox mutations. The server is never contacted.
2. **Server-Known Deletion** (`sync_status = SYNCED` or `PENDING_UPDATE`):
   - The entity already exists in Supabase.
   - Deleting it preserves the local record as a `PENDING_DELETE` tombstone, supersedes any pending `UPDATE` mutation, and enqueues a `DELETE` mutation with the known `base_version`.

### Project and Child Task Cascade Semantics
When a project is deleted locally:
- Local-only child tasks and their outbox mutations are purged completely.
- Server-known child tasks are transitioned to `PENDING_DELETE` tombstones with their own `DELETE` mutations queued with their known server versions.
- All writes execute inside a single atomic Dexie transaction: `db.transaction('rw', db.projects, db.tasks, db.outbox, async () => { ... })`.

### Atomic Repository Transactions
Every repository mutation guarantees atomic write safety. If an outbox insertion fails validation or an entity write fails, the entire transaction rolls back cleanly without leaving partial records or orphaned outbox entries.

### Mutation Payload Contract for Prompt 6

| Operation | Entity | Outbox Payload Contract | HTTP Endpoint (Prompt 6) |
|---|---|---|---|
| `CREATE` | `project` | `{ id, name, description }` | `POST /api/projects` |
| `UPDATE` | `project` | `{ id, name, description }` | `PUT /api/projects/:id` |
| `DELETE` | `project` | `{ id }` | `DELETE /api/projects/:id` |
| `CREATE` | `task` | `{ id, project_id, title, description, status, priority, due_date }` | `POST /api/tasks` |
| `UPDATE` | `task` | `{ id, project_id, title, description, status, priority, due_date }` | `PUT /api/tasks/:id` (with `base_version` concurrency check) |
| `DELETE` | `task` | `{ id }` | `DELETE /api/tasks/:id` |

*Note: Local-only metadata such as `sync_status` and `last_synced_at` are stripped from the payload and never sent to the server.*

---

## 6. Synchronization Engine (Prompt 6)

### Overview
The offline synchronization engine orchestrates bi-directional state synchronization between client-side IndexedDB (`fieldnote_db`) and the central Express + Supabase PostgreSQL backend. It connects the local outbox buffer with existing REST APIs while respecting network boundaries, concurrency locks, and optimistic versioning.

> **Important Boundary Confirmation**: Prompt 6 implements synchronization mechanics, optimistic concurrency detection, and snapshot persistence, but **conflict resolution is intentionally deferred to Prompt 7**. No automatic overwrites or conflict resolution UI are introduced in this phase.

### Core Components
- **`syncEngine.js`**: Main orchestrator. Executes queued mutation playback, coordinates dependency-based ordering, triggers authoritative pull reconciliation, and enforces transaction-safe state progression.
- **`syncManager.js`**: Lifecycle coordinator. Listens to `online` window events, triggers startup synchronization when online, debounces rapid local writes (50ms) before sync dispatch, and provides manual "Sync Now" triggers.
- **`syncLock.js`**: In-memory single-sync lock. Guarantees that only one synchronization process owns the queue at any time. Concurrent triggers safely join the in-flight Promise or yield cleanly.
- **`syncState.js`**: Dedicated synchronization state machine (`IDLE`, `SYNCING`, `OFFLINE`, `ERROR`, `CONFLICT`) providing non-intrusive reactive telemetry to the React UI without external state libraries.
- **`mutationProcessor.js`**: Single mutation executor. Encapsulates entity-specific API transmissions, captures HTTP 409 responses, handles response transformations, and manages transient retry schedules.
- **`pullService.js`**: Authoritative server pull reconciliation. Fetches projects and tasks, inserting newly discovered remote entities and updating existing records while strictly protecting uncommitted local changes.

### Mutation Processing Order
Outbox mutations are processed deterministically in chronological order with explicit entity dependency enforcement:
1. **Entity Dependencies**: A parent project `CREATE` is guaranteed to be sent to the server before any child task `CREATE` that belongs to that project, regardless of timestamp skew.
2. **Sequential FIFO**: All other operations follow strict `created_at` ordering.
3. **Coalescing**: As established in Prompt 5, multiple edits to the same pending entity are coalesced in-place, eliminating redundant API roundtrips.

### Bounded Retry Strategy
Network and server failures are classified into transient and non-transient categories:
- **Transient Failures (Retried)**: Network drop/timeout, HTTP 408, 429, 500, 502, 503, 504.
  - Bounded to `MAX_RETRIES = 3`.
  - Exponential backoff: $delay = baseDelay \times 2^{attempts} + jitter$.
  - Mutation remains `PENDING` with updated `attempt_count`, `last_attempt_at`, and `last_error`.
  - Upon exhausting 3 attempts, mutation transitions to `FAILED` and halts automated retries.
- **Non-Transient Failures (Halted Immediately)**:
  - HTTP 400 (Validation / Bad Request) -> Marked `FAILED`.
  - HTTP 404 (Not Found) -> If DELETE on already-absent resource, reconciled as completed; otherwise marked `FAILED`.
  - HTTP 409 (Version Conflict) -> Never retried; transitioned to `CONFLICT`.

### Task Version Handling & Optimistic Concurrency
1. **Creation**: Locally created tasks initialize with `version = 0`. Upon successful `POST /api/tasks`, the server returns authoritative `version = 1`. The local IndexedDB record is replaced with server-confirmed fields, `sync_status = SYNCED`, and `last_synced_at = now()`.
2. **Update**: Task edits capture the server-assigned version into `base_version` within the outbox mutation. When transmitting `PUT /api/tasks/:id`, the request payload includes `version: mutation.base_version`.
3. **Success**: Server increments version ($N \to N+1$), returns updated record; client persists new server version and resets `sync_status = SYNCED`.

### HTTP 409 Conflict Detection & Persistence
When a concurrent update occurs on the server, the backend rejects stale versions with `HTTP 409 Conflict` and payload `{ error: "VERSION_CONFLICT", message: "...", serverTask: { ... } }`.

When detected by the sync engine:
1. The local task is **preserved** and marked `sync_status = CONFLICT`.
2. The mutation is **not completed** and marked `status = CONFLICT`.
3. The conflict is persistently recorded in the Dexie `conflicts` table (Schema v3 migration):
   ```javascript
   {
     id: generateId(),
     entity_type: 'task',
     entity_id: mutation.entity_id,
     mutation_id: mutation.id,
     local_snapshot: localTask,
     server_snapshot: serverTask,
     base_version: mutation.base_version,
     server_version: serverTask.version,
     created_at: new Date().toISOString(),
     status: 'PENDING'
   }
   ```
4. Synchronization state updates to `CONFLICT`, providing full visibility in the Sync Center while allowing unrelated tasks to continue synchronizing.
5. Conflict resolution is **not performed**; data is safely preserved for Prompt 7.

### Server Pull & Local Record Protection
Authoritative server state is fetched via `GET /api/projects` followed by `GET /api/tasks`. To prevent server data from destroying in-flight user edits, the pull service enforces strict protection rules:
- **`SYNCED` local record**: Server data updates the local record.
- **`PENDING_CREATE` local record**: Local record protected; server record skipped.
- **`PENDING_UPDATE` local record**: Local uncommitted edits protected; server record skipped.
- **`PENDING_DELETE` local tombstone**: Tombstone protected; server record skipped.
- **`CONFLICT` local record**: Conflicted record protected; neither side automatically overwritten.
- **Non-existent local record**: Inserted cleanly as `SYNCED`.

### Idempotency Key Limitation Note
Every outbox mutation generates and preserves a stable client-side UUID `idempotency_key`. The client sends this key in headers/payloads where supported. Because the current Express backend does not yet enforce server-side idempotency tables, the client-side synchronization engine treats network interruptions conservatively and preserves keys across retries. True server-side idempotency deduplication remains documented as a future enhancement.

---

## 7. Offline Conflict Resolution (Prompt 7)

### Philosophy: No Silent Overwrites
FIELDNOTE enforces a strict operational rule for field inspection and maintenance workflows:
> **Never silently overwrite user data and never use automatic last-write-wins conflict resolution.**

When the central backend detects concurrent divergence on a task update, it rejects the stale request with `HTTP 409 VERSION_CONFLICT` and provides the current authoritative `serverTask`. Both the field operator's offline changes and the cloud version are preserved in the persistent `conflicts` Dexie table, and the operator is prompted to review the side-by-side differences.

### Conflict Lifecycle
```text
Offline Edit on Device A
         │
         ▼
IndexedDB (tasks + outbox PENDING_UPDATE)
         │
         ▼
Sync Engine Dispatches PUT with base_version = N
         │
         ▼
Server has version = N + 1 (Concurrent edit on Device B)
         │
         ▼
Server Responds with HTTP 409 { error: "VERSION_CONFLICT", serverTask }
         │
         ▼
Sync Engine Captures Divergence:
├── Task marked: sync_status = 'CONFLICT'
├── Outbox Mutation marked: status = 'CONFLICT'
└── Conflict Record Persisted: db.conflicts (status = 'PENDING')
         │
         ▼
Sync Center / Tasks UI:
Displays "⚠ Conflicts Requiring Attention"
         │
         ▼
User Opens Side-by-Side Comparison Modal
         │
         ├───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
    Option A:               Option B:               Option C:
  [Keep Local]            [Keep Server]          [Merge / Edit]
         │                       │                       │
         ▼                       ▼                       ▼
Adopts server version   Replaces task with     Combines field-by-field,
as new optimistic base, server snapshot,       adopts server version base,
queues new UPDATE,      marks SYNCED,          queues new UPDATE,
removes old mutation.   removes old mutation.  removes old mutation.
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                                 ▼
                     Atomic Dexie Transaction
               (db.tasks + db.outbox + db.conflicts)
                                 │
                                 ▼
                 Mark Conflict: status = 'RESOLVED'
                                 │
                                 ▼
                 Trigger Sync (if online) or
             Await Reconnection (works 100% offline!)
```

### Three Resolution Strategies
1. **Option A — Keep Local Changes**:
   - Meaning: *"I want to preserve my offline inspection edits."*
   - Takes `local_snapshot`.
   - Uses the latest `server_version` as the new optimistic concurrency base (`base_version = server_version`).
   - Atomically updates local task, queues a new `UPDATE` mutation in `db.outbox`, cleanly removes the old conflicting mutation, and marks the conflict `RESOLVED`.
   - On the next sync cycle, the server receives matching `version = server_version`, successfully applies the update, increments version, and returns 200 OK.
2. **Option B — Keep Server Version**:
   - Meaning: *"Discard my offline changes and accept the cloud's latest version."*
   - Prompts with a destructive confirmation dialog to prevent accidental data loss.
   - Replaces local task fields with `server_snapshot`, sets `version = server_version` and `sync_status = SYNCED`.
   - Atomically removes the old conflicting mutation from `db.outbox` and marks the conflict `RESOLVED`.
   - Does **not** queue a new update mutation because the server already holds this authoritative state.
3. **Option C — Custom Merge / Edit**:
   - Meaning: *"I want to combine specific fields from both versions."*
   - Interactive modal switches to a granular merge form displaying Title, Description, Status, Priority, and Due Date.
   - Field operators can click `[Use Local]` or `[Use Server]` for quick field adoption, or type custom notes.
   - Atomically saves the merged task in IndexedDB with `base_version = server_version`, enqueues a fresh `UPDATE` mutation, deletes the old conflicting mutation, and marks the conflict `RESOLVED`.

### Stale Mutation Prevention & Transaction Atomicity
To guarantee that an old conflicting mutation cannot resurrect and resend stale versions:
- Every resolution executes inside a single atomic Dexie transaction: `db.transaction('rw', db.tasks, db.outbox, db.conflicts, async () => { ... })`.
- The old conflicting mutation is permanently removed/superseded from `db.outbox`, preventing duplicate or stale transmissions.
- Race-condition guard: If resolution is triggered multiple times rapidly, `conflictRepository` detects `conflict.status === 'RESOLVED'` and safely ignores duplicate invocations.

### Full Offline Resolution Support
Conflict resolution operates **100% offline**:
- Field workers can review differences, select Keep Local, Keep Server, or Merge while completely disconnected.
- Local state and outbox replacement mutations are stored persistently in IndexedDB.
- When cellular or Wi-Fi connectivity returns, the `online` event or startup sync detects the pending mutation and reconciles with Supabase PostgreSQL without requiring user re-intervention.

### Manual Demo Scenario (Live Verification)
To reproduce and demonstrate offline conflict resolution live:
1. **Device / Browser A**: Open `http://localhost:5173/tasks`. Create or identify a task (e.g., *Task Alpha*, version = 1).
2. **Device / Browser A**: Open Chrome DevTools → Network tab → Toggle **Offline**.
3. **Device / Browser A**: Edit *Task Alpha* (e.g., change Title to *"Task Alpha — Offline Field Edit"* and Priority to *HIGH*). Task is saved locally in IndexedDB as `PENDING_UPDATE` with `base_version = 1`.
4. **Device / Browser B (or REST client)**: Send `PUT /api/tasks/:id` with `version = 1` updating the title to *"Task Alpha — Remote Cloud Edit"*. Server increments version to `2`.
5. **Device / Browser A**: In DevTools, toggle Network back to **Online**.
6. **Device / Browser A**: Navigate to **Sync Center** (`/sync`) and click **Sync Now**.
7. **Result**: The engine receives `HTTP 409 VERSION_CONFLICT`. The banner alerts `⚠ Conflicts Requiring Attention (1)`.
8. Click **Review & Resolve Conflict**: The side-by-side comparison displays local vs. server values with amber divergence highlights.
9. Choose **Keep Local**, **Keep Server**, or **Merge / Edit**: The conflict is atomically resolved, the old mutation removed, and the resolved task is synchronized with the backend.

---

## 8. Testing & Verification

### 1. Run Complete Frontend Test Suites (189 Assertions)
```bash
cd frontend
npm test
```
Executes all three frontend test suites in sequence:
- **`npm run test:db` (82 Assertions)**: Database Schema v2/v3, non-destructive migration, atomic entity + outbox writes, mutation coalescing, server tombstones, and lifecycle transitions.
- **`npm run test:sync` (46 Assertions)**: Bi-directional synchronization, task versioning (`0 -> 1`), optimistic concurrency verification, server pull protection, bounded retries on 503, single-sync lock, offline guards, and mutation dependency ordering.
- **`npm run test:conflict` (61 Assertions)**:
  - Field divergence calculation (differing vs. identical fields).
  - Conflict creation upon HTTP 409 response and persistent snapshot storage.
  - Option A: Keep Local resolution (preserves local snapshot, uses server version base, removes old mutation, queues new UPDATE).
  - Option B: Keep Server resolution (replaces local task, marks SYNCED, no new mutation, removes old mutation).
  - Option C: Custom Merge / Edit resolution (saves merged fields, uses server version base, queues replacement mutation).
  - Offline conflict resolution (resolves while offline, persists in IndexedDB, synchronizes cleanly when online returns).
  - Multiple conflicts isolation (resolving 1 conflict leaves remaining 2 intact).
  - Persistence across reload (conflicts survive browser reloads in IndexedDB).
  - Duplicate resolution protection (prevents redundant mutation creation).
  - Stale mutation resend prevention (verifies old mutation can never be resent).

### 2. Run Backend REST API Test Suite (41 Assertions)
```bash
cd backend
npm test
```
Verifies health check, project CRUD, task creation and versioning, optimistic concurrency with HTTP 409 responses, validation errors, and PostgreSQL cascading deletes.

### 3. Production Build
```bash
cd frontend
npm run build
```
Compiles Vite production bundle with PWA service worker precaching, Dexie schema v3, and interactive Conflict Resolution UI.

---

## 9. How to Run Locally

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

### 3. Frontend Application (Production Preview with PWA, IndexedDB & Outbox)
```bash
cd frontend
npm run build
npm run preview
```
Runs at: `http://localhost:4173`
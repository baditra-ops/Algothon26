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

> **Current Status**: **Phase 2 — Server-Side Database & REST API Layer Established.**  
> PostgreSQL / Supabase schema, connection pooling, parameterized query execution, Projects & Tasks REST endpoints, version-tracked optimistic concurrency, and conflict detection (HTTP 409) are implemented and verified.  
> *Note: IndexedDB, Dexie.js, Service Workers, and client offline synchronization will be added in upcoming prompts.*

---

## 2. Architecture & Pipeline

```
React (Vite Frontend)
       │
       ▼
    REST API
       │
       ▼
Node.js + Express
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
    [ PWA / Service Worker ]  ────────► (Static Asset Caching - Prompt 3)
              │
              ▼
   [ IndexedDB via Dexie.js ] ────────► (Local-First Store - Prompt 4)
              │
              ▼
 [ Offline Queue + Sync Engine ] ─────► (Conflict Resolution - Prompt 6/7)
              │
        (Network Online)
              │
              ▼
   [ REST API / Express ]     ────────► (Server-Side Concurrency - Prompt 2)
              │
              ▼
 [ PostgreSQL via Supabase ]  ────────► (Central Authoritative Cloud Store)
```

### Phased Roadmap

| Stage | Milestone | Status |
|---|---|---|
| **Phase 1** | **Foundation**: React + Vite, Tailwind CSS, Express API shell, health endpoint | **Completed** |
| **Phase 2** | **Database & REST API**: PostgreSQL schema, Supabase pooling, Projects/Tasks API, versioning & HTTP 409 conflicts | **Completed** |
| **Phase 3** | **PWA & Caching Layer**: Service Worker registration, manifest, application shell cache | Planned |
| **Phase 4** | **Client Persistence**: IndexedDB via Dexie.js, local schema, online/offline detection | Planned |
| **Phase 5** | **Offline Mutation Queue**: Change tracking, queue replay, idempotency keys | Planned |
| **Phase 6** | **Sync Engine & Reconciliation**: Bi-directional sync, conflict detection | Planned |
| **Phase 7** | **Conflict Resolution**: Client Wins / Server Wins / Manual 3-way merge | Planned |
| **Phase 8** | **Polish & Demo Hardening**: Field inspection workflow, simulation controls | Planned |

---

## 3. Database Architecture & Schema

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

### Database Constraints & Safeguards
- **Primary Keys**: UUIDs generated via PostgreSQL's `gen_random_uuid()` (or `pgcrypto`).
- **Foreign Key**: `tasks.project_id REFERENCES projects(id) ON DELETE CASCADE` ensures no orphaned tasks exist. Deleting a parent project cleans up all child tasks.
- **Data Integrity Constraints**:
  - `name` and `title` cannot be empty or whitespace (`char_length(trim(...)) > 0`).
  - `status` restricted to `'TODO'`, `'IN_PROGRESS'`, `'COMPLETED'`.
  - `priority` restricted to `'LOW'`, `'MEDIUM'`, `'HIGH'`.
  - `version` must be a positive integer (`version > 0`).
- **Indexes**: Added on `tasks.project_id`, `tasks.status`, `tasks.priority`, and `created_at` timestamps for fast queries and sync scans.
- **SQL Injection Prevention**: All queries strictly utilize parameterized placeholders (`$1, $2, ...`).

---

## 4. Supabase Setup Guide

To connect FIELDNOTE to your hosted Supabase PostgreSQL database:

1. **Create a Supabase Project**:
   - Go to [database.new](https://database.new) and sign in to Supabase.
   - Create a new project (e.g. `fieldnote-ops`) and set a strong database password.

2. **Run the Database Schema**:
   - In your Supabase dashboard, navigate to the **SQL Editor** tab.
   - Copy the entire contents of [`backend/database/schema.sql`](file:///e:/Algothon26/backend/database/schema.sql).
   - Paste into the SQL editor and click **Run**.
   - Verify that tables `projects` and `tasks` appear under **Table Editor**.

3. **Obtain PostgreSQL Connection String**:
   - In Supabase, go to **Project Settings** → **Database**.
   - Under **Connection string**, select **URI** (or **Session Pooler**).
   - Copy the URI, for example:  
     `postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres`

4. **Update `backend/.env`**:
   ```env
   PORT=5000
   CLIENT_URL=http://localhost:5173
   DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres
   ```

*(Note: When `DATABASE_URL` is omitted during local development, FIELDNOTE automatically initializes an in-memory PostgreSQL engine (`pg-mem`) running the exact same schema, enabling zero-config local testing).*

---

## 5. REST API Endpoints

Base URL: `http://localhost:5000/api`

### Health Endpoint
| Method | Endpoint | Description | Status Code |
|---|---|---|---|
| `GET` | `/api/health` | Health & service check | `200 OK` |

### Projects API
| Method | Endpoint | Description | Status Code | Request Body |
|---|---|---|---|---|
| `GET` | `/api/projects` | Get all projects | `200 OK` | — |
| `GET` | `/api/projects/:id` | Get project by UUID | `200 OK` / `404` | — |
| `POST` | `/api/projects` | Create new project | `201 Created` | `{ "name": "Wind Farm A", "description": "..." }` |
| `PUT` | `/api/projects/:id` | Update project | `200 OK` / `404` | `{ "name": "Updated Name", "description": "..." }` |
| `DELETE` | `/api/projects/:id` | Delete project & cascade tasks | `204 No Content` | — |
| `GET` | `/api/projects/:projectId/tasks` | Get all tasks for project | `200 OK` | — |

### Tasks API
| Method | Endpoint | Description | Status Code | Request Body |
|---|---|---|---|---|
| `GET` | `/api/tasks` | Get all tasks | `200 OK` | — |
| `GET` | `/api/tasks/:id` | Get task by UUID | `200 OK` / `404` | — |
| `POST` | `/api/tasks` | Create task (`version = 1`) | `201 Created` | `{ "project_id": "...", "title": "Inspect unit", "priority": "HIGH", "status": "TODO" }` |
| `PUT` | `/api/tasks/:id` | Update task (`version = v + 1`) | `200 OK` / `409 Conflict` | `{ "title": "...", "status": "IN_PROGRESS", "version": 1 }` |
| `DELETE` | `/api/tasks/:id` | Delete task | `204 No Content` | — |

---

## 6. Versioning & Optimistic Concurrency Strategy

Every task entity includes an integer `version` field:
- **Creation**: A newly created task always starts at `version = 1`.
- **Modification**: Every successful update increments the version: `version = version + 1`.
- **Concurrency Control**:
  Clients send their known version when updating a task:
  ```json
  {
    "title": "Substation maintenance complete",
    "status": "COMPLETED",
    "version": 2
  }
  ```
- **Conflict Handling (HTTP 409)**:
  If the client's supplied version does not match the server's current version (meaning another client or background sync altered the record in the meantime), the server **rejects the modification**:
  ```json
  {
    "error": "VERSION_CONFLICT",
    "message": "The task has been modified on the server.",
    "serverTask": {
      "id": "787bb7b9-8fa9-43c3-8f0a-f0270a6c7283",
      "project_id": "90ba95df-3151-4040-bfa5-c72fa823d70f",
      "title": "Server modified task",
      "status": "IN_PROGRESS",
      "version": 3,
      "updated_at": "2026-10-04T06:55:00.000Z"
    }
  }
  ```
  The server state remains untouched, enabling Prompt 7's offline conflict-resolution engine to perform 3-way reconciliation safely.

---

## 7. How to Test the API

A complete automated test suite is included in [`backend/src/scripts/testSuite.js`](file:///e:/Algothon26/backend/src/scripts/testSuite.js).

To execute the test suite:
```bash
cd backend
npm run test
```

### Test Coverage (41 Assertions):
1. **Health Verification**: Validates `GET /api/health` returns status `ok`.
2. **Project CRUD**: Creation (201), retrieval (200), update (200), and invalid UUID handling (400).
3. **Task CRUD**: Creation with `version = 1`, project association, task retrieval, and nested project filtering (`/api/projects/:id/tasks`).
4. **Version Increments**: Verifies version sequence `1 -> 2 -> 3` across sequential updates.
5. **Validation Edge Cases**:
   - Rejects invalid task status (e.g. `'NOT_VALID'` -> 400 `VALIDATION_ERROR`).
   - Rejects empty title strings -> 400 `VALIDATION_ERROR`.
   - Rejects non-existent resources -> 404 `NOT_FOUND`.
6. **Optimistic Concurrency & HTTP 409 Conflict**:
   - Stale update with version mismatch is rejected with HTTP 409 and `VERSION_CONFLICT`.
   - Returns the authoritative `serverTask`.
   - Verifies server data was not mutated.
7. **Cascading Delete**:
   - Deleting a project cascades and removes child tasks, ensuring zero orphaned rows.

---

## 8. How to Run Locally

### 1. Backend Server
```bash
cd backend
npm install
npm run dev
```
Runs at: `http://localhost:5000`

### 2. Frontend Application
```bash
cd frontend
npm install
npm run dev
```
Runs at: `http://localhost:5173`
import Dexie from 'dexie';
import { DB_NAME, STORES_V1, STORES_V2, STORES_V3 } from './schema.js';

/**
 * FieldnoteDatabase encapsulates IndexedDB access through Dexie.js.
 * Provides client-side offline storage for projects, tasks, outbox mutations, and conflict snapshots.
 */
export class FieldnoteDatabase extends Dexie {
  constructor() {
    super(DB_NAME);

    // Schema version 1: Initial tables
    this.version(1).stores(STORES_V1);

    // Schema version 2: Adds outbox mutation queue for offline sync buffer
    this.version(2).stores(STORES_V2);

    // Schema version 3: Adds conflicts table for persistent conflict resolution
    this.version(3).stores(STORES_V3);

    // Explicitly define typed table properties
    this.projects = this.table('projects');
    this.tasks = this.table('tasks');
    this.outbox = this.table('outbox');
    this.conflicts = this.table('conflicts');
  }
}

// Singleton database instance
export const db = new FieldnoteDatabase();

// Handle unexpected database errors cleanly
db.on('close', () => {
  console.warn('[FIELDNOTE DB] IndexedDB connection closed.');
});

export default db;

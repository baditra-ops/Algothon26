import Dexie from 'dexie';
import { DB_NAME, DB_VERSION, STORES_V1 } from './schema.js';

/**
 * FieldnoteDatabase encapsulates IndexedDB access through Dexie.js.
 * Provides client-side offline storage for projects and tasks.
 */
export class FieldnoteDatabase extends Dexie {
  constructor() {
    super(DB_NAME);

    // Schema version 1
    this.version(DB_VERSION).stores(STORES_V1);

    // Explicitly define typed table properties
    this.projects = this.table('projects');
    this.tasks = this.table('tasks');
  }
}

// Singleton database instance
export const db = new FieldnoteDatabase();

// Handle unexpected database errors cleanly
db.on('close', () => {
  console.warn('[FIELDNOTE DB] IndexedDB connection closed.');
});

export default db;

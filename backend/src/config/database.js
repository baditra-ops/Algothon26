import pkg from 'pg';
const { Pool } = pkg;
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { config } from './index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let pool = null;
let isInMemory = false;

// Initialize connection pool
if (config.databaseUrl && (config.databaseUrl.startsWith('postgres://') || config.databaseUrl.startsWith('postgresql://'))) {
  const isRemote = !config.databaseUrl.includes('localhost') && !config.databaseUrl.includes('127.0.0.1');

  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: isRemote ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });

  pool.on('error', (err) => {
    console.error('[FIELDNOTE DB] Unexpected error on idle PostgreSQL client:', err.message);
  });
} else {
  // Graceful fallback for local development / testing when DATABASE_URL is not yet populated
  isInMemory = true;
  console.log('[FIELDNOTE DB] No remote DATABASE_URL configured. Initializing local PostgreSQL adapter (pg-mem)...');

  try {
    const { newDb, DataType } = await import('pg-mem');
    const memDb = newDb();

    // Register necessary extensions and functions for PostgreSQL compatibility
    memDb.registerExtension('pgcrypto', () => {});
    memDb.public.registerFunction({
      name: 'gen_random_uuid',
      returns: DataType.uuid,
      implementation: () => crypto.randomUUID()
    });
    memDb.public.registerFunction({
      name: 'trim',
      args: [DataType.text],
      returns: DataType.text,
      implementation: (s) => (s ? s.trim() : '')
    });
    memDb.public.registerFunction({
      name: 'char_length',
      args: [DataType.text],
      returns: DataType.integer,
      implementation: (s) => (s ? s.length : 0)
    });
    memDb.public.registerFunction({
      name: 'current_database',
      returns: DataType.text,
      implementation: () => 'fieldnote_local'
    });

    const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      memDb.public.none(schemaSql);
      console.log('[FIELDNOTE DB] Local schema loaded into memory database successfully.');
    }

    const adapter = memDb.adapters.createPg();
    pool = new adapter.Pool();
  } catch (err) {
    console.error('[FIELDNOTE DB] Failed to initialize in-memory database:', err.message);
  }
}

/**
 * Execute parameterized query using the connection pool.
 * NEVER construct SQL queries by string concatenation.
 */
export const query = async (text, params) => {
  if (!pool) {
    const error = new Error('Database pool is not initialized. Please configure DATABASE_URL.');
    error.code = 'NO_DATABASE_CONFIGURED';
    throw error;
  }
  return pool.query(text, params);
};

/**
 * Test PostgreSQL database connectivity.
 */
export const testConnection = async () => {
  if (!pool) {
    return { connected: false, message: 'DATABASE_URL not configured' };
  }
  try {
    const start = Date.now();
    const result = await pool.query('SELECT NOW() as ts, current_database() as db_name');
    const duration = Date.now() - start;
    return {
      connected: true,
      database: result.rows[0].db_name,
      currentTime: result.rows[0].ts,
      durationMs: duration,
      mode: isInMemory ? 'in-memory (pg-mem)' : 'remote (Supabase / PostgreSQL)'
    };
  } catch (error) {
    console.error('[FIELDNOTE DB] Connection test failed:', error.message);
    return { connected: false, error: error.message };
  }
};

export default {
  query,
  testConnection,
  get pool() {
    return pool;
  }
};

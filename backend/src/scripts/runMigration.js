import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, testConnection } from '../config/database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  console.log('[FIELDNOTE Migration] Checking database connection...');
  const conn = await testConnection();
  if (!conn.connected) {
    console.error('[FIELDNOTE Migration] Cannot connect to database:', conn.error || conn.message);
    process.exit(1);
  }

  console.log(`[FIELDNOTE Migration] Connected to database: ${conn.database}`);
  const schemaPath = path.resolve(__dirname, '../../database/schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');

  console.log('[FIELDNOTE Migration] Applying schema from:', schemaPath);
  try {
    await query(sql);
    console.log('[FIELDNOTE Migration] Schema applied successfully! Tables `projects` and `tasks` are ready.');
    process.exit(0);
  } catch (error) {
    console.error('[FIELDNOTE Migration] Error applying schema:', error.message);
    process.exit(1);
  }
}

runMigration();

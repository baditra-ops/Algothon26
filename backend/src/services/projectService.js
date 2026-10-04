import { query } from '../config/database.js';

/**
 * Retrieve all projects ordered by creation date descending.
 */
export const getAllProjects = async () => {
  const result = await query(
    'SELECT id, name, description, created_at, updated_at FROM projects ORDER BY created_at DESC'
  );
  return result.rows;
};

/**
 * Retrieve a single project by its UUID.
 */
export const getProjectById = async (id) => {
  const result = await query(
    'SELECT id, name, description, created_at, updated_at FROM projects WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
};

/**
 * Create a new project.
 */
export const createProject = async ({ name, description = '' }) => {
  const result = await query(
    `INSERT INTO projects (name, description)
     VALUES ($1, $2)
     RETURNING id, name, description, created_at, updated_at`,
    [name.trim(), description ? description.trim() : '']
  );
  return result.rows[0];
};

/**
 * Update an existing project.
 */
export const updateProject = async (id, { name, description }) => {
  // First check if project exists
  const existing = await getProjectById(id);
  if (!existing) {
    return null;
  }

  const updatedName = name !== undefined ? name.trim() : existing.name;
  const updatedDesc = description !== undefined ? description.trim() : existing.description;

  const result = await query(
    `UPDATE projects
     SET name = $1, description = $2, updated_at = NOW()
     WHERE id = $3
     RETURNING id, name, description, created_at, updated_at`,
    [updatedName, updatedDesc, id]
  );
  return result.rows[0];
};

/**
 * Delete a project by its UUID.
 * Note: Tasks are automatically deleted due to ON DELETE CASCADE foreign key.
 */
export const deleteProject = async (id) => {
  const result = await query(
    'DELETE FROM projects WHERE id = $1 RETURNING id',
    [id]
  );
  return result.rows.length > 0;
};

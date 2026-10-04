const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_API_URL) || 'http://localhost:5000';

async function handleResponse(response) {
  if (response.status === 204) {
    return null;
  }
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.code = data.error;
    error.serverTask = data.serverTask;
    error.details = data.details;
    throw error;
  }
  return data;
}

/**
 * Health check
 */
export async function fetchHealthStatus() {
  const res = await fetch(`${API_BASE_URL}/api/health`, {
    headers: { 'Accept': 'application/json' }
  });
  return handleResponse(res);
}

/**
 * Project API Services
 */
export async function fetchProjects() {
  const res = await fetch(`${API_BASE_URL}/api/projects`, {
    headers: { 'Accept': 'application/json' }
  });
  return handleResponse(res);
}

export async function fetchProjectById(id) {
  const res = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
    headers: { 'Accept': 'application/json' }
  });
  return handleResponse(res);
}

export async function createProject({ name, description }) {
  const res = await fetch(`${API_BASE_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ name, description })
  });
  return handleResponse(res);
}

export async function updateProject(id, { name, description }) {
  const res = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ name, description })
  });
  return handleResponse(res);
}

export async function deleteProject(id) {
  const res = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
    method: 'DELETE'
  });
  return handleResponse(res);
}

/**
 * Task API Services
 */
export async function fetchTasks(projectId = null) {
  const url = projectId
    ? `${API_BASE_URL}/api/projects/${projectId}/tasks`
    : `${API_BASE_URL}/api/tasks`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json' }
  });
  return handleResponse(res);
}

export async function fetchTaskById(id) {
  const res = await fetch(`${API_BASE_URL}/api/tasks/${id}`, {
    headers: { 'Accept': 'application/json' }
  });
  return handleResponse(res);
}

export async function createTask(taskData) {
  const res = await fetch(`${API_BASE_URL}/api/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(taskData)
  });
  return handleResponse(res);
}

export async function updateTask(id, taskData) {
  const res = await fetch(`${API_BASE_URL}/api/tasks/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(taskData)
  });
  return handleResponse(res);
}

export async function deleteTask(id) {
  const res = await fetch(`${API_BASE_URL}/api/tasks/${id}`, {
    method: 'DELETE'
  });
  return handleResponse(res);
}

export { API_BASE_URL };

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Health check service to verify backend connectivity.
 */
export async function fetchHealthStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/health`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Server returned HTTP ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.warn('[FIELDNOTE API] Backend health check failed:', error.message);
    throw error;
  }
}

export { API_BASE_URL };

import { useState, useEffect, useCallback } from 'react';
import { fetchHealthStatus } from '../services/api.js';

export function useBackendStatus() {
  const [status, setStatus] = useState('checking'); // 'connected' | 'unreachable' | 'checking'
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const checkStatus = useCallback(async () => {
    setStatus('checking');
    try {
      const result = await fetchHealthStatus();
      setData(result);
      setStatus('connected');
      setError(null);
    } catch (err) {
      setError(err.message);
      setStatus('unreachable');
      setData(null);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  return { status, data, error, refresh: checkStatus };
}

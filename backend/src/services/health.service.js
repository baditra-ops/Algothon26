export const getHealthStatus = () => {
  return {
    status: 'ok',
    service: 'fieldnote-api',
    timestamp: new Date().toISOString()
  };
};

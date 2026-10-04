import React from 'react';
import { ConnectionStatus } from './ConnectionStatus';

/**
 * Re-export ConnectionStatus as StatusBadge for backwards compatibility.
 */
export function StatusBadge() {
  return <ConnectionStatus />;
}

export { ConnectionStatus };

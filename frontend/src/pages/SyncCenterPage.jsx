import React from 'react';
import { RefreshCw } from 'lucide-react';
import { SectionPlaceholder } from '../components/SectionPlaceholder';

export function SyncCenterPage() {
  return (
    <SectionPlaceholder
      title="Sync Center"
      description="Telemetry dashboard for monitoring offline mutation queues, sync schedules, and conflict resolutions."
      icon={RefreshCw}
      plannedFeatures={[
        'Visual offline pending mutation queue inspector',
        'Manual retry and force-reconciliation triggers',
        'Conflict resolution inspector (Client Wins / Server Wins / Manual Merge)',
        'Network telemetry and bandwidth usage statistics'
      ]}
    />
  );
}

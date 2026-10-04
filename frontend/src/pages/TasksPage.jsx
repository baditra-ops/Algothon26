import React from 'react';
import { CheckSquare } from 'lucide-react';
import { SectionPlaceholder } from '../components/SectionPlaceholder';

export function TasksPage() {
  return (
    <SectionPlaceholder
      title="Tasks & Checklists"
      description="Field operations task scheduler and checklist executor with optimistic offline updates."
      icon={CheckSquare}
      plannedFeatures={[
        'Optimistic local task creation & status toggling',
        'Offline mutation queue persistence in IndexedDB',
        'Automatic task synchronization on network reconnection',
        'Field checklist validation and signed completion logs'
      ]}
    />
  );
}

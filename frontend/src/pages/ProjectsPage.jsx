import React from 'react';
import { FolderKanban } from 'lucide-react';
import { SectionPlaceholder } from '../components/SectionPlaceholder';

export function ProjectsPage() {
  return (
    <SectionPlaceholder
      title="Projects"
      description="Central workspace for field inspection sites, equipment installations, and regional asset surveys."
      icon={FolderKanban}
      plannedFeatures={[
        'Full offline project directory caching',
        'Field document and photo attachment logs',
        'Per-project sync status tracking',
        'Conflict resolution for multi-agent edits'
      ]}
    />
  );
}

import React from 'react';
import { DirectorsTab } from '@/components/director';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';

export default function DirectorDirectorsSettingsPage() {
  return (
    <DirectorStandaloneScreen title="Directors">
      <DirectorsTab />
    </DirectorStandaloneScreen>
  );
}

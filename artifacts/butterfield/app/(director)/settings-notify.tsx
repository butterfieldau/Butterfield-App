import React from 'react';
import { NotifyTab } from '@/components/director';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';

export default function DirectorNotifySettingsPage() {
  return (
    <DirectorStandaloneScreen title="Notifications">
      <NotifyTab />
    </DirectorStandaloneScreen>
  );
}

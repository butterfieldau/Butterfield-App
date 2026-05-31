import React from 'react';
import { NotifyTab, SettingsStandaloneScreen } from './settings';

export default function DirectorNotifySettingsPage() {
  return (
    <SettingsStandaloneScreen title="Notifications">
      <NotifyTab />
    </SettingsStandaloneScreen>
  );
}

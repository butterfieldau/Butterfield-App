import React from 'react';
import { ManagersTab, SettingsStandaloneScreen } from './settings';

export default function DirectorManagersSettingsPage() {
  return (
    <SettingsStandaloneScreen title="Roles & Permissions">
      <ManagersTab />
    </SettingsStandaloneScreen>
  );
}

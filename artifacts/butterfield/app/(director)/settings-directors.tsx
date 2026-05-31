import React from 'react';
import { DirectorsTab, SettingsStandaloneScreen } from './settings';

export default function DirectorDirectorsSettingsPage() {
  return (
    <SettingsStandaloneScreen title="Directors">
      <DirectorsTab />
    </SettingsStandaloneScreen>
  );
}

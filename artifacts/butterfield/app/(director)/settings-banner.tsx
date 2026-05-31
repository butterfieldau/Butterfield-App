import React from 'react';
import { BannerTab, SettingsStandaloneScreen } from './settings';

export default function DirectorBannerSettingsPage() {
  return (
    <SettingsStandaloneScreen title="Banner">
      <BannerTab />
    </SettingsStandaloneScreen>
  );
}

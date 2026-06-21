import React from 'react';
import { BannerTab } from '@/components/director';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';

export default function DirectorBannerSettingsPage() {
  return (
    <DirectorStandaloneScreen title="Banner">
      <BannerTab />
    </DirectorStandaloneScreen>
  );
}

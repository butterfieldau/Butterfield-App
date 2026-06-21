import React from 'react';
import { RewardsTab } from '@/components/director';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';

export default function DirectorRewardsSettingsPage() {
  return (
    <DirectorStandaloneScreen title="Rewards">
      <RewardsTab />
    </DirectorStandaloneScreen>
  );
}

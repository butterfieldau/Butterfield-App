import { Stack } from 'expo-router';
import React from 'react';

export default function FeedbackLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, gestureEnabled: true }} />
  );
}

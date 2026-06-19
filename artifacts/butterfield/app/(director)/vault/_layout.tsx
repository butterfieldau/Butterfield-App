import { Stack } from 'expo-router';

export default function VaultLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        animation: 'slide_from_right',
      }}
    />
  );
}

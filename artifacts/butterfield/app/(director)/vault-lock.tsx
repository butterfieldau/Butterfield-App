import { router } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

export default function VaultLockRedirect() {
  useEffect(() => {
    router.replace('/(director)/vault' as any);
  }, []);
  return <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} />;
}

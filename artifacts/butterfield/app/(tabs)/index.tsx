import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { getHomeRouteForRole } from '@/lib/roleRoutes';

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6FA' }}>
        <ActivityIndicator color="#1493FF" size="large" />
      </View>
    );
  }

  return <Redirect href={getHomeRouteForRole(user?.role)} />;
}

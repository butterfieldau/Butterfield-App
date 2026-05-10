import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F5F6FA' }}>
        <ActivityIndicator color="#4B72C4" size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/welcome" />;
  if (user.role === 'customer') return <Redirect href="/(customer)" />;
  if (user.role === 'staff') return <Redirect href="/(staff)" />;
  if (user.role === 'wholesale') return <Redirect href="/(wholesale)" />;
  if (user.role === 'director') return <Redirect href="/(director)" />;
  if (user.role === 'master')   return <Redirect href="/(director)" />;
  if (user.role === 'manager')  return <Redirect href="/(manager)" />;

  return <Redirect href="/welcome" />;
}

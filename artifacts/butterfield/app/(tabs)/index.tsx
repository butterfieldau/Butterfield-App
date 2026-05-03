import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';

export default function Index() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FBF7F2' }}>
        <ActivityIndicator color="#C8833A" size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/(auth)/login" />;
  if (user.role === 'customer') return <Redirect href="/(customer)/" />;
  if (user.role === 'staff') return <Redirect href="/(staff)/" />;
  if (user.role === 'wholesale') return <Redirect href="/(wholesale)/" />;

  return <Redirect href="/(auth)/login" />;
}

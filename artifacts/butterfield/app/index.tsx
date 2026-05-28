import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { getHomeRouteForRole } from '@/lib/roleRoutes';

const GUEST_STARTED_KEY = '@butterfield_guest_started';

export default function Index() {
  const { user, isLoading } = useAuth();
  const [guestStarted, setGuestStarted] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    AsyncStorage.getItem(GUEST_STARTED_KEY)
      .then((value) => setGuestStarted(value === '1'))
      .catch(() => setGuestStarted(false));
  }, []);

  if (isLoading || guestStarted === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EFF6FF' }}>
        <ActivityIndicator color="#1493FF" size="large" />
      </View>
    );
  }

  if (!user && !guestStarted) return <Redirect href="/welcome" />;
  return <Redirect href={getHomeRouteForRole(user?.role)} />;
}

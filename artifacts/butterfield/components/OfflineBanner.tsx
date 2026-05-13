import { Feather } from '@expo/vector-icons';
import { onlineManager } from '@tanstack/react-query';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [isOnline, setIsOnline]           = useState(() => onlineManager.isOnline());
  const [justReconnected, setJustReconnected] = useState(false);
  const slideY = useRef(new Animated.Value(onlineManager.isOnline() ? -48 : 0)).current;
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsub = onlineManager.subscribe((online) => {
      setIsOnline(online);
      if (online) {
        setJustReconnected(true);
        if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
        reconnectTimer.current = setTimeout(() => setJustReconnected(false), 2800);
      }
    });
    return () => {
      unsub();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, []);

  const visible = !isOnline || justReconnected;

  useEffect(() => {
    Animated.timing(slideY, {
      toValue: visible ? 0 : -48,
      duration: 280,
      useNativeDriver: true,
    }).start();
  }, [visible, slideY]);

  return (
    <Animated.View
      style={[s.wrap, { top: insets.top, transform: [{ translateY: slideY }] }]}
      pointerEvents="none"
    >
      <View style={[s.banner, { backgroundColor: isOnline ? '#16A34A' : '#1C1C1E' }]}>
        <Feather name={isOnline ? 'wifi' : 'wifi-off'} size={12} color="#fff" />
        <Text style={[s.text, { fontFamily: 'Inter_500Medium' }]}>
          {isOnline ? 'Back online · Syncing your data…' : 'No internet · Showing saved data'}
        </Text>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap:   { position: 'absolute', left: 0, right: 0, zIndex: 999 },
  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 16 },
  text:   { color: '#fff', fontSize: 12 },
});

import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentProps } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TabKey = 'home' | 'orders' | 'people' | 'products' | 'more';
type FeatherIconName = ComponentProps<typeof Feather>['name'];

const BLUE = '#1493FF';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';
const WHITE = '#FFFFFF';

const TABS: { key: TabKey; label: string; icon: FeatherIconName; route: string }[] = [
  { key: 'home', label: 'Home', icon: 'home', route: '/(director)/index' },
  { key: 'orders', label: 'Orders', icon: 'shopping-bag', route: '/(director)/orders' },
  { key: 'people', label: 'People', icon: 'users', route: '/(director)/users' },
  { key: 'products', label: 'Products', icon: 'package', route: '/(director)/products' },
  { key: 'more', label: 'More', icon: 'grid', route: '/(director)/more' },
];

export function DirectorStandaloneTabBar({ active }: { active: TabKey }) {
  const insets = useSafeAreaInsets();

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}> 
        {TABS.map((tab) => {
          const focused = tab.key === active;
          return (
            <Pressable
              key={tab.key}
              onPress={() => router.replace(tab.route as any)}
              style={styles.tab}
            >
              <Feather name={tab.icon} size={22} color={focused ? BLUE : MUTED} />
              <Text style={[styles.label, { color: focused ? BLUE : MUTED }]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bar: {
    backgroundColor: WHITE,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 10,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 64,
  },
  label: {
    fontSize: 11,
    fontWeight: '500',
  },
});

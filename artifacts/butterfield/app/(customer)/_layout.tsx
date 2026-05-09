import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Tabs } from 'expo-router';
import { Icon, Label, NativeTabs } from 'expo-router/unstable-native-tabs';
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '@/context/CartContext';

// ─── Floating custom tab bar ───────────────────────────────────────────────────
function FloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { totalItems } = useCart();
  const current = state.routes[state.index]?.name ?? '';

  const go = (name: string) => {
    const route = state.routes.find(r => r.name === name);
    if (!route) return;
    Haptics.selectionAsync();
    navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (state.routes[state.index].name !== name) navigation.navigate(name as never);
  };

  const showLocation = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Butterfield Cookies',
      'Merrylands Court Shopping Centre\nMerrylands NSW 2160\n\nMon–Sun  10am – 10pm',
      [{ text: 'Got it' }],
    );
  };

  return (
    <View style={[ftStyles.container, { paddingBottom: Math.max(insets.bottom + 4, 16) }]}>
      <View style={ftStyles.bar}>

        {/* Home */}
        <Pressable style={ftStyles.iconBtn} onPress={() => go('index')} accessibilityLabel="Home">
          <Feather name="home" size={22} color={current === 'index' ? '#1C1C1E' : '#AEAEB2'} />
        </Pressable>

        {/* Location */}
        <Pressable style={ftStyles.iconBtn} onPress={showLocation} accessibilityLabel="Store location">
          <Feather name="map-pin" size={22} color="#AEAEB2" />
        </Pressable>

        {/* Order Now pill */}
        <Pressable
          style={ftStyles.pill}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); go('menu'); }}
          accessibilityLabel="Order Now"
        >
          <Feather name="search" size={17} color="#8E8E93" />
          <Text style={ftStyles.pillText}>Order Now</Text>
        </Pressable>

        {/* Cart */}
        <Pressable style={ftStyles.iconBtn} onPress={() => go('cart')} accessibilityLabel="Cart">
          <View>
            <Feather name="shopping-cart" size={22} color={current === 'cart' ? '#1C1C1E' : '#AEAEB2'} />
            {totalItems > 0 && (
              <View style={ftStyles.badge}>
                <Text style={ftStyles.badgeNum}>{totalItems > 9 ? '9+' : totalItems}</Text>
              </View>
            )}
          </View>
        </Pressable>

        {/* Account */}
        <Pressable style={ftStyles.iconBtn} onPress={() => go('profile')} accessibilityLabel="Account">
          <Feather name="user" size={22} color={current === 'profile' ? '#1C1C1E' : '#AEAEB2'} />
        </Pressable>

      </View>
    </View>
  );
}

const ftStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 50,
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 24,
    elevation: 12,
  },
  iconBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F2F2F7',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  pillText: {
    fontSize: 15,
    color: '#8E8E93',
    fontFamily: 'Inter_500Medium',
  },
  badge: {
    position: 'absolute',
    top: -6,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 2,
    borderColor: '#fff',
  },
  badgeNum: {
    color: '#fff',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    lineHeight: 12,
  },
});

// ─── Native (iOS 26+ liquid glass) customer tabs ──────────────────────────────
function NativeCustomerTabs() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: 'house', selected: 'house.fill' }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="menu">
        <Icon sf={{ default: 'menucard', selected: 'menucard.fill' }} />
        <Label>Menu</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="loyalty">
        <Icon sf={{ default: 'cup.and.saucer', selected: 'cup.and.saucer.fill' }} />
        <Label>Rewards</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cart">
        <Icon sf={{ default: 'bag', selected: 'bag.fill' }} />
        <Label>Order</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: 'person', selected: 'person.fill' }} />
        <Label>Account</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

// ─── Classic (web / older iOS) customer tabs ──────────────────────────────────
function ClassicCustomerTabs() {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <FloatingTabBar {...props} />}
    >
      <Tabs.Screen name="index"         options={{ title: 'Home' }} />
      <Tabs.Screen name="menu"          options={{ title: 'Menu' }} />
      <Tabs.Screen name="loyalty"       options={{ title: 'Rewards' }} />
      <Tabs.Screen name="cart"          options={{ title: 'Order' }} />
      <Tabs.Screen name="profile"       options={{ title: 'Account' }} />
      <Tabs.Screen name="orders"        options={{ href: null, title: 'My Orders' }} />
      <Tabs.Screen name="favourites"    options={{ href: null, title: 'Favourites' }} />
      <Tabs.Screen name="addresses"     options={{ href: null, title: 'Saved Addresses' }} />
      <Tabs.Screen name="notifications" options={{ href: null, title: 'Notifications' }} />
      <Tabs.Screen name="track/[id]"   options={{ href: null, title: 'Track Order' }} />
    </Tabs>
  );
}

export default function CustomerTabLayout() {
  if (isLiquidGlassAvailable()) return <NativeCustomerTabs />;
  return <ClassicCustomerTabs />;
}

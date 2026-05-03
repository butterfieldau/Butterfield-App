import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NewOrderInfo } from '@/hooks/useOrderNotifications';

const BLUE      = '#40C0F2';
const BLUE_DARK = '#2AA8DC';
const AUTO_DISMISS_MS = 8000;

interface Props {
  orders: NewOrderInfo[];
  onDismiss: () => void;
  onView: () => void;
}

export function NewOrderBanner({ orders, onDismiss, onView }: Props) {
  const insets = useSafeAreaInsets();
  const slideY    = useRef(new Animated.Value(-200)).current;
  const opacity   = useRef(new Animated.Value(0)).current;
  const progress  = useRef(new Animated.Value(1)).current;
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(slideY,  { toValue: -200, duration: 280, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Animated.parallel([
      Animated.spring(slideY,  { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    Animated.timing(progress, {
      toValue: 0,
      duration: AUTO_DISMISS_MS,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    timerRef.current = setTimeout(() => dismiss(), AUTO_DISMISS_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const handleView = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(slideY,  { toValue: -200, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => onView());
  };

  const totalValue = orders.reduce((s, o) => s + o.totalCents, 0);
  const allItems   = orders.flatMap((o) => o.items);
  const isMultiple = orders.length > 1;
  const firstOrder = orders[0];
  const previewItems = firstOrder?.items.slice(0, 2) ?? [];

  const topOffset = insets.top + 8;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          top: topOffset,
          opacity,
          transform: [{ translateY: slideY }],
        },
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.card}>
        {/* Header row */}
        <View style={styles.headerRow}>
          <View style={styles.iconWrap}>
            <Feather name="bell" size={18} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.titleText}>
              {isMultiple ? `${orders.length} new orders` : 'New order received!'}
            </Text>
            <Text style={styles.subtitleText}>
              {isMultiple
                ? `Total: $${(totalValue / 100).toFixed(2)} · ${allItems.length} items`
                : `#${firstOrder.id.slice(0, 8).toUpperCase()} · $${(firstOrder.totalCents / 100).toFixed(2)}`}
            </Text>
          </View>
          <Pressable onPress={dismiss} hitSlop={12} style={styles.closeBtn}>
            <Feather name="x" size={18} color="rgba(255,255,255,0.7)" />
          </Pressable>
        </View>

        {/* Item preview */}
        {!isMultiple && previewItems.length > 0 && (
          <View style={styles.itemsRow}>
            {previewItems.map((item, i) => (
              <View key={i} style={styles.itemChip}>
                <Text style={styles.itemChipText}>
                  {item.quantity}× {item.productName}
                </Text>
              </View>
            ))}
            {firstOrder.items.length > 2 && (
              <View style={styles.itemChip}>
                <Text style={styles.itemChipText}>+{firstOrder.items.length - 2} more</Text>
              </View>
            )}
          </View>
        )}

        {/* Action buttons */}
        <View style={styles.actionsRow}>
          <Pressable onPress={dismiss} style={styles.dismissBtn}>
            <Text style={styles.dismissBtnText}>Dismiss</Text>
          </Pressable>
          <Pressable onPress={handleView} style={styles.viewBtn}>
            <Feather name="arrow-right" size={14} color="#fff" />
            <Text style={styles.viewBtnText}>View Orders</Text>
          </Pressable>
        </View>

        {/* Auto-dismiss progress bar */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
            ]}
          />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 20,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(64,192,242,0.35)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#40C0F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 15,
    lineHeight: 20,
  },
  subtitleText: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
  itemsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  itemChip: {
    backgroundColor: 'rgba(64,192,242,0.18)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(64,192,242,0.3)',
  },
  itemChipText: {
    color: '#40C0F2',
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  dismissBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  dismissBtnText: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
  },
  viewBtn: {
    flex: 2,
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#40C0F2',
  },
  viewBtnText: {
    color: '#fff',
    fontFamily: 'Inter_700Bold',
    fontSize: 13,
  },
  progressTrack: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#40C0F2',
  },
});

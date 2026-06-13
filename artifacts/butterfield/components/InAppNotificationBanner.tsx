import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AUTO_DISMISS_MS = 6000;
const BRAND_BLUE = '#40C0F2';
const BRAND_BLUE_DARK = '#1493FF';

export interface InAppNotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface Props {
  notification: InAppNotificationPayload;
  onDismiss: () => void;
  onPress?: () => void;
}

export function InAppNotificationBanner({ notification, onDismiss, onPress }: Props) {
  const insets = useSafeAreaInsets();
  const slideY   = useRef(new Animated.Value(-160)).current;
  const opacity  = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(slideY,  { toValue: -160, duration: 260, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => onDismiss());
  };

  const handlePress = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    Animated.parallel([
      Animated.timing(slideY,  { toValue: -160, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      onDismiss();
      onPress?.();
    });
  };

  useEffect(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    Animated.parallel([
      Animated.spring(slideY,  { toValue: 0, tension: 85, friction: 11, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
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

  const hasAction = !!onPress;
  const topOffset = insets.top + 8;

  return (
    <Animated.View
      style={[
        styles.container,
        { top: topOffset, opacity, transform: [{ translateY: slideY }] },
      ]}
      pointerEvents="box-none"
    >
      <Pressable onPress={hasAction ? handlePress : dismiss} style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.iconWrap}>
            <Feather name="bell" size={16} color="#fff" />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.titleText} numberOfLines={1}>{notification.title}</Text>
            <Text style={styles.bodyText} numberOfLines={2}>{notification.body}</Text>
          </View>
          <Pressable onPress={dismiss} hitSlop={12} style={styles.closeBtn}>
            <Feather name="x" size={16} color="rgba(255,255,255,0.55)" />
          </Pressable>
        </View>

        {hasAction && (
          <View style={styles.actionRow}>
            <View style={styles.viewBtn}>
              <Feather name="arrow-right" size={12} color="#fff" />
              <Text style={styles.viewBtnText}>View Order</Text>
            </View>
          </View>
        )}

        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progress.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
      </Pressable>
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
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 20,
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(64,192,242,0.3)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 11,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: BRAND_BLUE_DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: {
    flex: 1,
  },
  titleText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 19,
  },
  bodyText: {
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1,
  },
  closeBtn: {
    padding: 4,
  },
  actionRow: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    alignItems: 'flex-end',
  },
  viewBtn: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
    backgroundColor: BRAND_BLUE_DARK,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 9,
  },
  viewBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: BRAND_BLUE,
  },
});

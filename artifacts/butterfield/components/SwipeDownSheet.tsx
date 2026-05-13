import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const SPRING = { damping: 34, stiffness: 300, overshootClamping: true } as const;

type ScrollGestureRef = React.RefObject<any>;

interface SwipeDownSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  backdropOpacity?: number;
  backdropColor?: string;
  sheetHeight?: number;
  sheetStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  scrollGestureRef?: ScrollGestureRef;
  showHandle?: boolean;
  allowBackdropPress?: boolean;
}

export function SwipeDownSheet({
  visible,
  onClose,
  children,
  backdropOpacity = 0.45,
  backdropColor = '#000',
  sheetHeight,
  sheetStyle,
  contentStyle,
  scrollGestureRef,
  showHandle = true,
  allowBackdropPress = true,
}: SwipeDownSheetProps) {
  const { height: SCREEN_H } = useWindowDimensions();
  const [mounted, setMounted] = useState(false);
  const closingRef = useRef(false);
  const translateY = useSharedValue(SCREEN_H);
  const backdropO = useSharedValue(0);

  const finishClose = useCallback((shouldNotifyParent: boolean) => {
    closingRef.current = false;
    setMounted(false);
    if (shouldNotifyParent) onClose();
  }, [onClose]);

  const animateOut = useCallback((shouldNotifyParent: boolean) => {
    if (closingRef.current) return;
    closingRef.current = true;
    backdropO.value = withTiming(0, { duration: 180 });
    translateY.value = withTiming(SCREEN_H, { duration: 250 }, (done) => {
      if (done) {
        runOnJS(finishClose)(shouldNotifyParent);
      }
    });
  }, [SCREEN_H, backdropO, finishClose, translateY]);

  useEffect(() => {
    if (visible) {
      closingRef.current = false;
      translateY.value = SCREEN_H;
      backdropO.value = 0;
      setMounted(true);

      requestAnimationFrame(() => {
        translateY.value = withSpring(0, SPRING);
        backdropO.value = withTiming(backdropOpacity, { duration: 240 });
      });
      return;
    }

    if (mounted) {
      animateOut(false);
    }
  }, [animateOut, backdropOpacity, mounted, translateY, backdropO, visible, SCREEN_H]);

  const panGesture = useMemo(() => {
    const gesture = Gesture.Pan()
      .activeOffsetY([-10, 10])
      .simultaneousWithExternalGesture(scrollGestureRef as any)
      .onUpdate((e) => {
        if (e.translationY > 0) {
          translateY.value = e.translationY;
          backdropO.value = interpolate(
            e.translationY,
            [0, 320],
            [backdropOpacity, 0],
            { extrapolateRight: 'clamp' },
          );
        }
      })
      .onEnd((e) => {
        const distance = translateY.value;
        const shouldDismiss = distance > 115 || (e.velocityY > 750 && distance > 24);

        if (shouldDismiss) {
          animateOut(true);
          return;
        }

        translateY.value = withSpring(0, SPRING);
        backdropO.value = withTiming(backdropOpacity, { duration: 180 });
      });

    return gesture;
  }, [animateOut, backdropOpacity, scrollGestureRef, backdropO, translateY]);

  const sheetAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropAnimStyle = useAnimatedStyle(() => ({
    opacity: backdropO.value,
  }));

  if (!mounted) return null;

  const resolvedHeight = sheetHeight ?? Math.round(SCREEN_H * 0.82);

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={() => animateOut(true)}
      statusBarTranslucent
    >
      <View style={StyleSheet.absoluteFill}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: backdropColor },
            backdropAnimStyle,
          ]}
        >
          {allowBackdropPress && (
            <Pressable style={StyleSheet.absoluteFill} onPress={() => animateOut(true)} />
          )}
        </Animated.View>

        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              styles.sheet,
              { height: resolvedHeight },
              sheetAnimStyle,
              sheetStyle,
            ]}
          >
            {showHandle && <View style={styles.handle} />}
            <View style={[styles.content, contentStyle]}>{children}</View>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  content: {
    flex: 1,
  },
});

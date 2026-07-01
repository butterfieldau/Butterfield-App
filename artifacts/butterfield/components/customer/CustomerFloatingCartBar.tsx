import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { memo, useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '@/context/CartContext';

const BLUE = '#1493FF';

export const FLOAT_BAR_EXTRA_PAD = 80;

const AnimatedView = Reanimated.createAnimatedComponent(View);

function CustomerFloatingCartBar() {
  const { totalItems, totalPriceCents } = useCart();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const TAB_BAR_H = insets.bottom + 80;

  const translateY = useSharedValue(100);

  useEffect(() => {
    if (totalItems > 0) {
      translateY.value = withSpring(0, { damping: 28, stiffness: 220 });
    } else {
      translateY.value = withSpring(100, { damping: 28, stiffness: 220 });
    }
  }, [totalItems]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const animatedProps = useAnimatedProps(() => ({
    pointerEvents: translateY.value > 50 ? ('none' as const) : ('box-none' as const),
  }));

  const priceStr = `$${(totalPriceCents / 100).toFixed(2)}`;
  const itemLabel = totalItems === 1 ? '1 item in cart' : `${totalItems} items in cart`;

  const handleViewCart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/customer-cart' as any);
  };

  return (
    <AnimatedView
      animatedProps={animatedProps}
      style={[
        styles.floatBar,
        { bottom: TAB_BAR_H + 16 },
        animatedStyle,
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.floatTitle}>{itemLabel}</Text>
        <Text style={styles.floatSub}>{priceStr} AUD</Text>
      </View>
      <Pressable onPress={handleViewCart} style={styles.floatBtn}>
        <Feather name="shopping-cart" size={16} color="#fff" />
        <Text style={styles.floatBtnText}>View Cart</Text>
      </Pressable>
    </AnimatedView>
  );
}

export default memo(CustomerFloatingCartBar);

const styles = StyleSheet.create({
  floatBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    height: 64,
    borderRadius: 18,
    backgroundColor: '#0A3D8F',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 10,
    zIndex: 50,
  },
  floatTitle: { fontSize: 14, fontWeight: '700', color: '#fff' },
  floatSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '500' },
  floatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: BLUE,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  floatBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

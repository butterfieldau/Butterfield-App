import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import React, { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { LoginRequiredModal } from '@/components/LoginRequiredModal';

const AnimatedView = Reanimated.createAnimatedComponent(View);

function CustomerFloatingCartBar() {
  const { totalItems, totalPriceCents } = useCart();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [showLoginModal, setShowLoginModal] = useState(false);

  const onCartScreen = pathname === '/customer-cart';

  // Tab bar = 46px pill + Math.max(insets.bottom, 12) padding — same formula as FloatingCustomerTabBar
  const TAB_BAR_H = 46 + Math.max(insets.bottom, 12);

  // Start fully off-screen (200px) so it is never visible when cart is empty
  const translateY = useSharedValue(200);

  useEffect(() => {
    if (totalItems > 0 && !onCartScreen) {
      translateY.value = withSpring(0, { damping: 28, stiffness: 220, mass: 0.8 });
    } else {
      translateY.value = withTiming(200, { duration: 260 });
    }
  }, [totalItems, onCartScreen]);

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
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    router.push('/customer-cart' as any);
  };

  return (
    <>
      <LoginRequiredModal
        visible={showLoginModal}
        redirectTo="/(customer)/index"
        onCancel={() => setShowLoginModal(false)}
      />
      <AnimatedView
        animatedProps={animatedProps}
        style={[
          styles.floatBar,
          { bottom: TAB_BAR_H + 25 },
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
    </>
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
    backgroundColor: '#1493FF',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  floatBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});

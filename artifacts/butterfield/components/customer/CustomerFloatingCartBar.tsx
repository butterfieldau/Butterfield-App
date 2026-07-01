import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import React, { memo, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Reanimated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { LoginRequiredModal } from '@/components/LoginRequiredModal';

const AnimatedView = Reanimated.createAnimatedComponent(View);

const CIRCLE = 46;
const INNER  = 34;

function CustomerFloatingCartBar() {
  const { totalItems } = useCart();
  const { user }       = useAuth();
  const router         = useRouter();
  const pathname       = usePathname();
  const [showLoginModal, setShowLoginModal] = useState(false);

  const onCartScreen = pathname === '/customer-cart';
  const visible = totalItems > 0 && !onCartScreen;

  const scale      = useSharedValue(0);
  const translateY = useSharedValue(30);

  useEffect(() => {
    if (visible) {
      scale.value      = withSpring(1,  { damping: 28, stiffness: 220, mass: 0.8 });
      translateY.value = withSpring(0,  { damping: 28, stiffness: 220, mass: 0.8 });
    } else {
      scale.value      = withTiming(0,  { duration: 260 });
      translateY.value = withTiming(30, { duration: 260 });
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
    pointerEvents: scale.value < 0.05 ? 'none' : 'box-none',
  }));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!user) { setShowLoginModal(true); return; }
    router.push('/customer-cart' as any);
  };

  return (
    <>
      <LoginRequiredModal
        visible={showLoginModal}
        redirectTo="/(customer)/index"
        onCancel={() => setShowLoginModal(false)}
      />
      <AnimatedView style={[styles.outer, animStyle]}>
        <Pressable onPress={handlePress} style={styles.pressable}>
          <View style={styles.inner}>
            <Feather name="shopping-cart" size={20} color="#fff" />
          </View>
          {totalItems >= 2 && <View style={styles.badge} />}
        </Pressable>
      </AnimatedView>
    </>
  );
}

export default memo(CustomerFloatingCartBar);

const styles = StyleSheet.create({
  outer: {
    width:           CIRCLE,
    height:          CIRCLE,
    borderRadius:    CIRCLE / 2,
    backgroundColor: '#0A3D8F',
    justifyContent:  'center',
    alignItems:      'center',
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 4 },
    shadowOpacity:   0.22,
    shadowRadius:    10,
    elevation:       10,
  },
  pressable: {
    width:          '100%',
    height:         '100%',
    borderRadius:   CIRCLE / 2,
    justifyContent: 'center',
    alignItems:     'center',
  },
  inner: {
    width:           INNER,
    height:          INNER,
    borderRadius:    INNER / 2,
    backgroundColor: '#1493FF',
    justifyContent:  'center',
    alignItems:      'center',
  },
  badge: {
    position:        'absolute',
    top:             3,
    right:           3,
    width:           10,
    height:          10,
    borderRadius:    5,
    backgroundColor: '#D20001',
    borderWidth:     1.5,
    borderColor:     '#0A3D8F',
  },
});

import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import BuildABoxModal from './BuildABoxModal';

const AnimatedPressable = Reanimated.createAnimatedComponent(Pressable);

export default function BuildABoxBanner() {
  const [modalVisible, setModalVisible] = useState(false);
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn  = () => { scale.value = withSpring(0.97, { damping: 15, stiffness: 300 }); };
  const handlePressOut = () => { scale.value = withSpring(1,    { damping: 15, stiffness: 300 }); };
  const handlePress    = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setModalVisible(true); };

  return (
    <>
      <Reanimated.View style={[s.wrap, animStyle]}>
        <AnimatedPressable
          onPress={handlePress}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          style={s.pressable}
        >
          <LinearGradient
            colors={['#FF4444', '#CC1111']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.gradient}
          >
            <View style={s.row}>
              <View style={s.textBlock}>
                <Text style={s.title}>Build Your Box</Text>
                <Text style={s.sub}>Mix & match to order</Text>
              </View>
              <View style={s.arrowBtn}>
                <Feather name="arrow-right" size={16} color="#fff" />
              </View>
            </View>
          </LinearGradient>
        </AnimatedPressable>
      </Reanimated.View>

      <BuildABoxModal visible={modalVisible} onClose={() => setModalVisible(false)} />
    </>
  );
}

const s = StyleSheet.create({
  wrap:      {
    marginBottom: 16,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#FF4444',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  pressable: { borderRadius: 14, overflow: 'hidden' },
  gradient:  { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16 },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textBlock: { flex: 1 },
  title:     { color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: -0.2, marginBottom: 2 },
  sub:       { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '500' },
  arrowBtn:  {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
});

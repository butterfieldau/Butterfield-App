import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { HomeBannerConfig } from '@/lib/api';

const BLUE_TOP = '#1493FF';
const BLUE_BTM = '#3CBBEE';
const CHERRY   = '#D0312D';

export function HeroBanner({ banner, onPress }: { banner: HomeBannerConfig | null; onPress: () => void }) {
  const hasImage = !!banner?.imageUrl;
  const label    = banner?.headlineAccent?.trim() || 'New';
  const title    = banner?.headline?.trim()       || 'Cookies & Soft Serve';
  const subtext  = banner?.subtext?.trim()        || 'Available Friday – Sunday only!';
  const btnText  = banner?.buttonText?.trim()     || 'Order now';

  return (
    <Pressable style={s.banner} onPress={onPress} android_ripple={{ color: 'rgba(255,255,255,0.1)' }}>
      <View style={s.imageWrap}>
        {hasImage ? (
          <Image source={{ uri: banner?.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
        ) : (
          <LinearGradient colors={['#F4F8FC', '#E8EFF6']} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        )}
      </View>
      <LinearGradient colors={[BLUE_TOP, BLUE_BTM]} style={s.footer} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={s.copy}>
          <Text style={[s.label, { fontWeight: '600' }]} numberOfLines={1}>{label}</Text>
          <Text style={[s.headline, { fontWeight: '800' }]} numberOfLines={2}>{title}</Text>
          <Text style={[s.subtext, { fontWeight: '500' }]} numberOfLines={2}>{subtext}</Text>
        </View>
        <Pressable style={s.btn} onPress={onPress}>
          <Text style={[s.btnText, { fontWeight: '700' }]}>{btnText}</Text>
        </Pressable>
      </LinearGradient>
    </Pressable>
  );
}

const s = StyleSheet.create({
  banner:    { borderRadius: 24, overflow: 'hidden', backgroundColor: '#fff', shadowColor: '#0F172A', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4 },
  imageWrap: { width: '100%', aspectRatio: 4 / 5, backgroundColor: '#EDF5FB' },
  footer:    { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 18, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  copy:      { flex: 1, gap: 3 },
  label:     { color: 'rgba(255,255,255,0.94)', fontSize: 16, letterSpacing: 0.2 },
  headline:  { color: '#fff', fontSize: 26, lineHeight: 30, letterSpacing: -0.5 },
  subtext:   { color: 'rgba(255,255,255,0.92)', fontSize: 13, lineHeight: 18 },
  btn:       { backgroundColor: CHERRY, paddingHorizontal: 22, paddingVertical: 13, borderRadius: 22, alignSelf: 'flex-end', minWidth: 126, alignItems: 'center' },
  btnText:   { color: '#fff', fontSize: 14 },
});

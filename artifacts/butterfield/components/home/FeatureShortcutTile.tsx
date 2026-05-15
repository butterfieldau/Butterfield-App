import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  title: string;
  titleColor: string;
  colors: [string, string, ...string[]];
  imageSource: any;
  onPress: () => void;
  imageStyle?: any;
  titleStyle?: any;
  showArrow?: boolean;
};

export function FeatureShortcutTile({
  title,
  titleColor,
  colors,
  imageSource,
  onPress,
  imageStyle,
  titleStyle,
  showArrow = false,
}: Props) {
  return (
    <Pressable
      style={s.tile}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
    >
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={s.bg}>
        <View style={s.imageWrap}>
          <Image source={imageSource} style={[s.image, imageStyle]} contentFit="contain" />
        </View>
        <View style={[s.footer, showArrow && s.footerSplit]}>
          <Text
            style={[s.title, { color: titleColor, fontWeight: '700' }, showArrow && s.titleSplit, titleStyle]}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {title}
          </Text>
          {showArrow && (
            <View style={s.arrowWrap}>
              <Feather name="arrow-right" size={20} color="#1C1C1E" />
            </View>
          )}
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const s = StyleSheet.create({
  tile:        { flex: 1, aspectRatio: 1, borderRadius: 22, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 4 },
  bg:          { flex: 1, paddingHorizontal: 8, paddingTop: 10, paddingBottom: 10, overflow: 'hidden', justifyContent: 'space-between', alignItems: 'center' },
  imageWrap:   { width: '100%', flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 2 },
  image:       { width: '100%', height: '100%' },
  footer:      { width: '100%', alignItems: 'center', justifyContent: 'flex-end', gap: 4, minHeight: 38, paddingHorizontal: 4, paddingBottom: 2 },
  footerSplit: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 },
  title:       { fontSize: 14, lineHeight: 17, letterSpacing: -0.2, textAlign: 'center' },
  titleSplit:  { flex: 1, textAlign: 'left' },
  arrowWrap:   { width: 22, alignItems: 'flex-end', justifyContent: 'flex-end', paddingBottom: 1 },
});

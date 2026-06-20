import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { HomeBannerSlide } from '@/lib/api';

const CHERRY = '#D20001';
const BLUE   = '#40C0F2';

const CARD_WIDTH  = Dimensions.get('window').width - 32 - 12;
const CARD_HEIGHT = 190;

function parseRoute(buttonRoute: string | undefined): () => void {
  if (!buttonRoute) return () => router.push('/(customer)/menu' as any);
  if (buttonRoute === 'menu')    return () => router.push('/(customer)/menu' as any);
  if (buttonRoute === 'loyalty') return () => router.push('/(customer)/loyalty' as any);
  if (buttonRoute === 'cart')    return () => router.push('/(customer)/cart' as any);
  if (buttonRoute === 'profile') return () => router.push('/(customer)/profile' as any);
  if (buttonRoute === 'stores')  return () => router.push('/(customer)/menu' as any);
  if (buttonRoute.startsWith('category:')) {
    const slug = buttonRoute.replace('category:', '').trim();
    return () => router.push({ pathname: '/(customer)/menu', params: { category: slug } } as any);
  }
  if (buttonRoute.startsWith('product:')) {
    const id = buttonRoute.replace('product:', '').trim();
    return () => router.push({ pathname: '/product', params: { id } } as any);
  }
  return () => router.push('/(customer)/menu' as any);
}

function SlideCard({ slide, cardWidth }: { slide: HomeBannerSlide; cardWidth: number }) {
  const navigate = parseRoute(slide.buttonRoute);

  const headlineWords = slide.headline?.split(' ') ?? [];
  const accent = slide.headlineAccent?.trim().toLowerCase();

  return (
    <Pressable
      style={[s.card, { width: cardWidth }]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); navigate(); }}
      android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
    >
      {slide.imageUrl ? (
        <Image
          source={{ uri: slide.imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
        />
      ) : (
        <LinearGradient
          colors={['#0C1428', '#1B3A5C']}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      )}

      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.72)']}
        style={[StyleSheet.absoluteFill, { top: '35%' }]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />

      <View style={s.cardContent}>
        {slide.headline ? (
          <Text style={s.headline} numberOfLines={2}>
            {headlineWords.map((word, i) => {
              const isAccent = accent && word.toLowerCase().replace(/[^a-z]/g, '') === accent.replace(/[^a-z]/g, '');
              return (
                <Text key={i} style={isAccent ? s.headlineAccent : undefined}>
                  {word}{i < headlineWords.length - 1 ? ' ' : ''}
                </Text>
              );
            })}
          </Text>
        ) : null}

        {slide.subtext ? (
          <Text style={s.subtext} numberOfLines={1}>{slide.subtext}</Text>
        ) : null}

        <Pressable
          style={s.ctaBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); navigate(); }}
          hitSlop={4}
        >
          <Text style={s.ctaText}>{slide.buttonText || 'Order Now'}</Text>
          <Feather name="arrow-right" size={13} color="#fff" />
        </Pressable>
      </View>
    </Pressable>
  );
}

interface BannerPicksCarouselProps {
  slides: HomeBannerSlide[];
  hPad?: number;
}

export default function BannerPicksCarousel({ slides, hPad = 16 }: BannerPicksCarouselProps) {
  const flatRef = useRef<FlatList>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const touchActive = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cardWidth = Dimensions.get('window').width - hPad * 2 - 12;

  const scrollTo = useCallback((index: number) => {
    flatRef.current?.scrollToIndex({ index, animated: true });
    setActiveIndex(index);
  }, []);

  useEffect(() => {
    if (slides.length <= 1) return;

    timerRef.current = setInterval(() => {
      if (touchActive.current) return;
      setActiveIndex(prev => {
        const next = (prev + 1) % slides.length;
        flatRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 4000);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [slides.length]);

  if (slides.length === 0) return null;

  return (
    <View style={{ gap: 10 }}>
      <FlatList
        ref={flatRef}
        data={slides}
        horizontal
        pagingEnabled={slides.length > 1}
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + 12}
        decelerationRate="fast"
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: hPad, gap: 12 }}
        onTouchStart={() => { touchActive.current = true; }}
        onTouchEnd={() => {
          touchActive.current = false;
        }}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / (cardWidth + 12));
          setActiveIndex(Math.max(0, Math.min(index, slides.length - 1)));
        }}
        renderItem={({ item }) => (
          <SlideCard slide={item} cardWidth={cardWidth} />
        )}
        getItemLayout={(_data, index) => ({
          length: cardWidth + 12,
          offset: (cardWidth + 12) * index,
          index,
        })}
      />

      {slides.length > 1 && (
        <View style={s.dotRow}>
          {slides.map((_, i) => (
            <Pressable
              key={i}
              hitSlop={6}
              onPress={() => { scrollTo(i); Haptics.selectionAsync(); }}
              style={[s.dot, { backgroundColor: i === activeIndex ? BLUE : 'rgba(64,192,242,0.28)' }]}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    height: CARD_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: '#0C1428',
  },
  cardContent: {
    padding: 16,
    gap: 6,
  },
  headline: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 26,
  },
  headlineAccent: {
    color: CHERRY,
  },
  subtext: {
    color: 'rgba(255,255,255,0.70)',
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
  },
  ctaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: CHERRY,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 2,
  },
  ctaText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  dotRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});

import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { HomeBannerSlide } from '@/lib/api';

const CHERRY   = '#D0312D';
const BLUE_TOP = '#1493FF';
const BLUE_BTM = '#3CBBEE';
const AUTO_ADVANCE_MS = 5000;

interface HeroBannerProps {
  slides: HomeBannerSlide[];
  onSlidePress: (slide: HomeBannerSlide) => void;
}

export function HeroBanner({ slides, onSlidePress }: HeroBannerProps) {
  const [containerWidth, setContainerWidth] = useState(0);
  const [activeIndex, setActiveIndex]       = useState(0);
  const scrollRef     = useRef<ScrollView>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPressedRef  = useRef(false);
  const activeRef     = useRef(0);
  const dotWidths     = useRef<Animated.Value[]>([]);

  // Keep ref in sync so the interval closure always sees fresh index
  useEffect(() => { activeRef.current = activeIndex; }, [activeIndex]);

  // Initialise dot animated values
  if (dotWidths.current.length !== slides.length) {
    dotWidths.current = slides.map((_, i) => new Animated.Value(i === 0 ? 20 : 7));
  }

  const animateDots = useCallback((nextIdx: number) => {
    dotWidths.current.forEach((anim, i) => {
      Animated.spring(anim, {
        toValue: i === nextIdx ? 20 : 7,
        useNativeDriver: false,
        speed: 20,
        bounciness: 4,
      }).start();
    });
  }, []);

  const goToSlide = useCallback((idx: number) => {
    if (containerWidth === 0) return;
    scrollRef.current?.scrollTo({ x: idx * containerWidth, animated: true });
    setActiveIndex(idx);
    animateDots(idx);
  }, [containerWidth, animateDots]);

  const startTimer = useCallback(() => {
    if (slides.length <= 1) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (!isPressedRef.current) {
        const next = (activeRef.current + 1) % slides.length;
        goToSlide(next);
      }
    }, AUTO_ADVANCE_MS);
  }, [slides.length, goToSlide]);

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startTimer]);

  if (slides.length === 0) return null;

  const handleScrollEnd = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    if (containerWidth === 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
    const clamped = Math.max(0, Math.min(idx, slides.length - 1));
    setActiveIndex(clamped);
    animateDots(clamped);
    startTimer();
  };

  return (
    // Outer wrapper — measures width, no overflow restriction
    <View onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}>
      {/* Card */}
      <View style={s.outer}>
        {containerWidth > 0 && (
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            scrollEnabled={slides.length > 1}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={handleScrollEnd}
            decelerationRate="fast"
            bounces={false}
            style={{ borderRadius: 24 }}
            contentContainerStyle={{ borderRadius: 24, overflow: 'hidden' }}
          >
            {slides.map((slide, i) => (
              <SlideItem
                key={slide.id ?? i}
                slide={slide}
                width={containerWidth}
                onPress={() => onSlidePress(slide)}
                onPressIn={() => { isPressedRef.current = true; }}
                onPressOut={() => { isPressedRef.current = false; }}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {/* Dot indicators — outside the card, below it in normal flow.
          8 pt gap above the dots, 6 pt gap below. */}
      {slides.length > 1 && (
        <View style={s.dotsRow}>
          {slides.map((_, i) => (
            <Pressable key={i} onPress={() => goToSlide(i)} hitSlop={8}>
              <Animated.View
                style={[
                  s.dot,
                  {
                    width: dotWidths.current[i] ?? 7,
                    backgroundColor: i === activeIndex ? BLUE_TOP : '#BFD4E8',
                  },
                ]}
              />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Single slide ──────────────────────────────────────────────────────────────

interface SlideItemProps {
  slide: HomeBannerSlide;
  width: number;
  onPress: () => void;
  onPressIn: () => void;
  onPressOut: () => void;
}

function SlideItem({ slide, width, onPress, onPressIn, onPressOut }: SlideItemProps) {
  const hasImage = !!slide.imageUrl;
  const label    = slide.headlineAccent?.trim() || '';
  const title    = slide.headline?.trim()       || 'Cookies & Soft Serve';
  const subtext  = slide.subtext?.trim()        || '';
  const btnText  = slide.buttonText?.trim()     || 'Order now';

  return (
    <Pressable
      style={[s.slide, { width }]}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
    >
      {/* Background */}
      {hasImage ? (
        <Image
          source={{ uri: slide.imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
        />
      ) : (
        <LinearGradient
          colors={[BLUE_TOP, BLUE_BTM]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      )}

      {/* Dark scrim so glass card pops */}
      {hasImage && (
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.35)']}
          style={[StyleSheet.absoluteFill, { top: '40%' }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      )}

      {/* Frosted glass card */}
      <View style={s.glassAnchor}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={55} tint="light" style={s.glassPill}>
            <View style={s.glassTint} />
            <GlassContent label={label} title={title} subtext={subtext} btnText={btnText} onPress={onPress} />
          </BlurView>
        ) : (
          <View style={[s.glassPill, s.glassFallback]}>
            <GlassContent label={label} title={title} subtext={subtext} btnText={btnText} onPress={onPress} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ── Glass card content ────────────────────────────────────────────────────────

function GlassContent({
  label, title, subtext, btnText, onPress,
}: { label: string; title: string; subtext: string; btnText: string; onPress: () => void }) {
  return (
    <View style={s.glassContent}>
      <View style={{ flex: 1, gap: 4 }}>
        {label ? (
          <Text style={s.glassLabel} numberOfLines={1}>{label}</Text>
        ) : null}
        <Text style={s.glassTitle} numberOfLines={2}>{title}</Text>
        {subtext ? (
          <Text style={s.glassSub} numberOfLines={2}>{subtext}</Text>
        ) : null}
      </View>
      <Pressable style={s.glassBtn} onPress={onPress} hitSlop={6}>
        <Text style={s.glassBtnText}>{btnText}</Text>
      </Pressable>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  outer: {
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: '#EDF5FB',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 5,
  },
  slide: {
    aspectRatio: 4 / 5,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  // ── Glass overlay ───────────────────────────────────────────────────────────
  glassAnchor: {
    marginHorizontal: 14,
    marginBottom: 14,
    marginTop: 14,
  },
  glassPill: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
  },
  glassTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  glassFallback: {
    backgroundColor: 'rgba(255,255,255,0.78)',
  },
  glassContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  glassLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: 'rgba(20,50,80,0.7)',
    textTransform: 'uppercase',
  },
  glassTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0D1B2A',
    lineHeight: 22,
    letterSpacing: -0.3,
  },
  glassSub: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(20,40,70,0.75)',
    lineHeight: 16,
  },
  glassBtn: {
    backgroundColor: CHERRY,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
    alignSelf: 'center',
    flexShrink: 0,
    minWidth: 90,
    alignItems: 'center',
  },
  glassBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  // ── Dot indicators — below the card, in normal flow ─────────────────────────
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    paddingTop: 8,
    paddingBottom: 6,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },
});

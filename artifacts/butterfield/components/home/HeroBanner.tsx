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
  useWindowDimensions,
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

/** Compute a slide height that stays proportional but is capped on small screens.
 *  - SE / narrow (≤ 320px): cap at 320px (≈ 1:1)
 *  - Medium phones (321–374px): cap at 390px
 *  - Standard phones (375px+): 4:5 ratio capped at 480px
 */
function computeSlideHeight(screenWidth: number, containerW: number): number {
  if (containerW === 0) return 0;
  const natural = containerW * (5 / 4);
  if (screenWidth <= 320) return Math.min(natural, 320);
  if (screenWidth < 375)  return Math.min(natural, 390);
  return Math.min(natural, 480);
}

const GLASS_MARGIN_BOTTOM = 14;
const DOTS_GAP_ABOVE_GLASS = 10;

export function HeroBanner({ slides, onSlidePress }: HeroBannerProps) {
  const { width: screenWidth }              = useWindowDimensions();
  const [containerWidth, setContainerWidth] = useState(0);
  const [activeIndex, setActiveIndex]       = useState(0);
  const [glassHeights, setGlassHeights]     = useState<number[]>([]);
  const scrollRef     = useRef<ScrollView>(null);
  const timerRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPressedRef  = useRef(false);
  const activeRef     = useRef(0);
  const dotWidths     = useRef<Animated.Value[]>([]);

  useEffect(() => { activeRef.current = activeIndex; }, [activeIndex]);

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

  const handleGlassLayout = useCallback((slideIdx: number, height: number) => {
    setGlassHeights(prev => {
      const next = [...prev];
      next[slideIdx] = height;
      return next;
    });
  }, []);

  if (slides.length === 0) return null;

  const slideHeight = computeSlideHeight(screenWidth, containerWidth);

  // Use the active slide's measured glass height; fall back to the tallest
  // measured height so far (avoids a flash at bottom:0 before all slides render).
  const activeGlassHeight =
    glassHeights[activeIndex] ??
    (glassHeights.length > 0 ? Math.max(...glassHeights.filter(Boolean)) : 0);

  const handleScrollEnd = (e: { nativeEvent: { contentOffset: { x: number } } }) => {
    if (containerWidth === 0) return;
    const idx = Math.round(e.nativeEvent.contentOffset.x / containerWidth);
    const clamped = Math.max(0, Math.min(idx, slides.length - 1));
    setActiveIndex(clamped);
    animateDots(clamped);
    startTimer();
  };

  return (
    <View
      style={s.outer}
      onLayout={e => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {/* Slides */}
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
        >
          {slides.map((slide, i) => (
            <SlideItem
              key={slide.id ?? i}
              slide={slide}
              width={containerWidth}
              height={slideHeight}
              onPress={() => onSlidePress(slide)}
              onPressIn={() => { isPressedRef.current = true; }}
              onPressOut={() => { isPressedRef.current = false; }}
              onGlassLayout={h => handleGlassLayout(i, h)}
            />
          ))}
        </ScrollView>
      )}

      {/* Dot indicators — absolutely positioned inside the card, above the glass overlay.
          Bottom offset is measured per-slide from the glass anchor height + its bottom
          margin + gap, so the dots shift up automatically when the overlay grows taller. */}
      {slides.length > 1 && activeGlassHeight > 0 && (
        <View
          style={[
            s.dotsRow,
            { bottom: activeGlassHeight + GLASS_MARGIN_BOTTOM + DOTS_GAP_ABOVE_GLASS },
          ]}
        >
          {slides.map((_, i) => (
            <Pressable key={i} onPress={() => goToSlide(i)} hitSlop={10}>
              <Animated.View
                style={[
                  s.dot,
                  {
                    width: dotWidths.current[i] ?? 7,
                    backgroundColor: i === activeIndex ? '#fff' : 'rgba(255,255,255,0.45)',
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
  height: number;
  onPress: () => void;
  onPressIn: () => void;
  onPressOut: () => void;
  onGlassLayout?: (height: number) => void;
}

function SlideItem({ slide, width, height, onPress, onPressIn, onPressOut, onGlassLayout }: SlideItemProps) {
  const hasImage = !!slide.imageUrl;
  const label    = slide.headlineAccent?.trim() || '';
  const title    = slide.headline?.trim()       || 'Cookies & Soft Serve';
  const subtext  = slide.subtext?.trim()        || '';
  const btnText  = slide.buttonText?.trim()     || 'Order now';

  return (
    <Pressable
      style={[s.slide, { width, height }]}
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
    >
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

      {hasImage && (
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.35)']}
          style={[StyleSheet.absoluteFill, { top: '40%' }]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
      )}

      {/* Frosted glass card */}
      <View
        style={s.glassAnchor}
        onLayout={onGlassLayout ? e => onGlassLayout(e.nativeEvent.layout.height) : undefined}
      >
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
        {label ? <Text style={s.glassLabel} numberOfLines={1}>{label}</Text> : null}
        <Text style={s.glassTitle} numberOfLines={2}>{title}</Text>
        {subtext ? <Text style={s.glassSub} numberOfLines={2}>{subtext}</Text> : null}
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
  // ── Dot indicators — absolutely positioned inside the card, above the glass overlay ──
  dotsRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    height: 7,
    borderRadius: 4,
  },
});

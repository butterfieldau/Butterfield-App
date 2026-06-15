import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

const BLUE  = '#1493FF';
const WHITE = '#FFFFFF';

function fmtCents(c: number) {
  return `$${(c / 100).toFixed(2)}`;
}

export function PosIdleScreen({
  products,
  dailySpecial,
  onDismiss,
}: {
  products: any[];
  dailySpecial?: string | null;
  onDismiss: () => void;
}) {
  const [now, setNow]             = useState(new Date());
  const [carouselIdx, setCarousel] = useState(0);

  const featured = useMemo(
    () => products.filter((p: any) => p.isFeatured || p.featured).slice(0, 8),
    [products],
  );

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (featured.length < 2) return;
    const t = setInterval(() => setCarousel(i => (i + 1) % featured.length), 4_000);
    return () => clearInterval(t);
  }, [featured.length]);

  const timeStr = now.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false });
  const dateStr = now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
  const current = featured[carouselIdx] ?? null;

  return (
    <Pressable style={styles.idleOverlay} onPress={onDismiss}>
      <View style={styles.idleClock}>
        <Text style={styles.idleTime}>{timeStr}</Text>
        <Text style={styles.idleDate}>{dateStr}</Text>
      </View>

      {!!dailySpecial && (
        <View style={styles.idleSpecial}>
          <Feather name="star" size={13} color="#F59E0B" />
          <Text style={styles.idleSpecialText} numberOfLines={2}>{dailySpecial}</Text>
        </View>
      )}

      {current && (
        <View style={styles.idleCard}>
          {(current.images?.[0] ?? current.imageUrl) ? (
            <Image
              source={{ uri: current.images?.[0] ?? current.imageUrl }}
              style={styles.idleCardImg}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.idleCardImg, styles.idleCardImgFallback]}>
              <Feather name="coffee" size={40} color="rgba(255,255,255,0.3)" />
            </View>
          )}
          <View style={styles.idleCardBody}>
            <Text style={styles.idleCardBadge}>FEATURED</Text>
            <Text style={styles.idleCardName}>{current.name}</Text>
            <Text style={styles.idleCardPrice}>
              {fmtCents(current.salePriceCents ?? current.priceCents ?? 0)}
            </Text>
          </View>
        </View>
      )}

      {featured.length > 1 && (
        <View style={styles.idleDots}>
          {featured.map((_: any, i: number) => (
            <View key={i} style={[styles.idleDot, i === carouselIdx && styles.idleDotActive]} />
          ))}
        </View>
      )}

      <View style={styles.idleTap}>
        <Feather name="mouse-pointer" size={13} color="rgba(255,255,255,0.35)" />
        <Text style={styles.idleTapText}>Tap anywhere to continue</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  idleOverlay:        { ...StyleSheet.absoluteFillObject, zIndex: 1000, backgroundColor: '#0D1B2A', justifyContent: 'center', alignItems: 'center', gap: 20 },
  idleClock:          { alignItems: 'center', gap: 6 },
  idleTime:           { fontSize: 84, fontWeight: '800', color: WHITE, letterSpacing: -2 },
  idleDate:           { fontSize: 18, fontWeight: '500', color: 'rgba(255,255,255,0.55)' },
  idleSpecial:        { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(245,158,11,0.15)', borderRadius: 20, paddingHorizontal: 18, paddingVertical: 9, maxWidth: 420, borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)' },
  idleSpecialText:    { fontSize: 14, fontWeight: '600', color: '#F59E0B', flex: 1, textAlign: 'center' },
  idleCard:           { width: 260, backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  idleCardImg:        { width: '100%', height: 190 },
  idleCardImgFallback: { justifyContent: 'center', alignItems: 'center' },
  idleCardBody:       { padding: 16, gap: 4 },
  idleCardBadge:      { fontSize: 10, fontWeight: '800', color: BLUE, letterSpacing: 1.2, textTransform: 'uppercase' },
  idleCardName:       { fontSize: 18, fontWeight: '700', color: WHITE },
  idleCardPrice:      { fontSize: 20, fontWeight: '800', color: BLUE },
  idleDots:           { flexDirection: 'row', gap: 6 },
  idleDot:            { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.2)' },
  idleDotActive:      { backgroundColor: BLUE, width: 20 },
  idleTap:            { position: 'absolute', bottom: 36, flexDirection: 'row', alignItems: 'center', gap: 6 },
  idleTapText:        { fontSize: 13, color: 'rgba(255,255,255,0.3)', fontWeight: '500' },
});

import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type DirectorFeedback } from '@/lib/api';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import { BG, CARD, TEXT, MUTED, BORD, BLUE, AMBER as GOLD, GREEN, RED } from '@/constants/directorColors';

type StarFilter = 'all' | 'unread' | '1' | '2' | '3' | '4' | '5';

function StarRow({ rating, size = 14 }: { rating: number | null | undefined; size?: number }) {
  if (!rating) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(i => (
        <Feather
          key={i}
          name="star"
          size={size}
          color={i <= rating ? GOLD : BORD}
        />
      ))}
    </View>
  );
}

function RatingBadge({ rating }: { rating: number | null | undefined }) {
  if (!rating) return null;
  const color = rating >= 4 ? GREEN : rating >= 3 ? GOLD : RED;
  return (
    <View style={[s.ratingBadge, { backgroundColor: color + '18', borderColor: color + '40' }]}>
      <Feather name="star" size={11} color={color} />
      <Text style={[s.ratingBadgeText, { color }]}>{rating}/5</Text>
    </View>
  );
}

function FeedbackCard({
  item,
  onToggleRead,
}: {
  item: DirectorFeedback;
  onToggleRead: (id: string, isRead: boolean) => void;
}) {
  const date = new Date(item.createdAt);
  const dateStr = date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Australia/Sydney' });
  const timeStr = date.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', timeZone: 'Australia/Sydney' });

  return (
    <View style={[s.card, !item.isRead && s.cardUnread]}>
      {!item.isRead && <View style={s.unreadDot} />}

      <View style={s.cardHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={s.userName}>
              {item.userName ?? 'Anonymous'}
            </Text>
            <RatingBadge rating={item.rating} />
            <View style={[s.categoryBadge]}>
              <Text style={s.categoryText}>{item.category}</Text>
            </View>
          </View>
          <StarRow rating={item.rating} size={13} />
        </View>
        <Text style={s.dateText}>{dateStr}{'\n'}{timeStr}</Text>
      </View>

      <Text style={s.messageText}>{item.message}</Text>

      {(item.orderId || item.userEmail) && (
        <View style={s.metaRow}>
          {item.orderId && (
            <View style={s.metaChip}>
              <Feather name="shopping-bag" size={11} color={MUTED} />
              <Text style={s.metaChipText}>Order #{item.orderId.slice(-8).toUpperCase()}</Text>
            </View>
          )}
          {item.userEmail && (
            <View style={s.metaChip}>
              <Feather name="mail" size={11} color={MUTED} />
              <Text style={s.metaChipText}>{item.userEmail}</Text>
            </View>
          )}
        </View>
      )}

      <Pressable
        onPress={() => { Haptics.selectionAsync(); onToggleRead(item.id, item.isRead); }}
        style={({ pressed }) => [s.resolveBtn, item.isRead && s.resolveBtnResolved, { opacity: pressed ? 0.7 : 1 }]}
      >
        <Feather
          name={item.isRead ? 'rotate-ccw' : 'check-circle'}
          size={13}
          color={item.isRead ? MUTED : GREEN}
        />
        <Text style={[s.resolveBtnText, item.isRead && s.resolveBtnTextResolved]}>
          {item.isRead ? 'Mark unresolved' : 'Mark resolved'}
        </Text>
      </Pressable>
    </View>
  );
}

const FILTER_CHIPS: { key: StarFilter; label: string }[] = [
  { key: 'all',    label: 'All' },
  { key: 'unread', label: 'Unresolved' },
  { key: '5',      label: '5★' },
  { key: '4',      label: '4★' },
  { key: '3',      label: '3★' },
  { key: '2',      label: '2★' },
  { key: '1',      label: '1★' },
];

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<StarFilter>('unread');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-feedback'],
    queryFn: () => api.director.allFeedback(),
    staleTime: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: ({ id, isRead }: { id: string; isRead: boolean }) =>
      isRead ? api.director.markFeedbackUnread(id) : api.director.markFeedbackRead(id),
    onMutate: async ({ id, isRead }) => {
      await queryClient.cancelQueries({ queryKey: ['director-feedback'] });
      const prev = queryClient.getQueryData<{ data: DirectorFeedback[] }>(['director-feedback']);
      queryClient.setQueryData<{ data: DirectorFeedback[] }>(['director-feedback'], old =>
        old ? { data: old.data.map(f => f.id === id ? { ...f, isRead: !isRead } : f) } : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['director-feedback'], ctx.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['director-feedback'] }),
  });

  const allItems: DirectorFeedback[] = data?.data ?? [];

  const filtered = useMemo(() => {
    if (activeFilter === 'unread') return allItems.filter(f => !f.isRead);
    if (activeFilter !== 'all') {
      const star = parseInt(activeFilter, 10);
      return allItems.filter(f => f.rating === star);
    }
    return allItems;
  }, [allItems, activeFilter]);

  const unreadCount = allItems.filter(f => !f.isRead).length;

  const avgRating = useMemo(() => {
    const rated = allItems.filter(f => f.rating != null);
    if (!rated.length) return null;
    const sum = rated.reduce((acc, f) => acc + (f.rating ?? 0), 0);
    return (sum / rated.length).toFixed(1);
  }, [allItems]);

  const ratingCounts = useMemo(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const f of allItems) if (f.rating) counts[f.rating] = (counts[f.rating] ?? 0) + 1;
    return counts;
  }, [allItems]);

  const listHeader = allItems.length > 0 ? (
    <>
      <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 2 }}>
        <View style={s.summaryRow}>
          <View style={s.summaryChip}>
            <Feather name="inbox" size={13} color={unreadCount > 0 ? RED : MUTED} />
            <Text style={[s.summaryChipText, unreadCount > 0 && { color: RED }]}>
              {unreadCount} unresolved
            </Text>
          </View>
          {avgRating && (
            <View style={s.summaryChip}>
              <Feather name="star" size={13} color={GOLD} />
              <Text style={s.summaryChipText}>{avgRating} avg rating</Text>
            </View>
          )}
          <View style={s.summaryChip}>
            <Feather name="message-square" size={13} color={BLUE} />
            <Text style={s.summaryChipText}>{allItems.length} total</Text>
          </View>
        </View>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterBar}
      >
        {FILTER_CHIPS.map(chip => {
          const isActive = activeFilter === chip.key;
          let count: number | null = null;
          if (chip.key === 'unread') count = unreadCount;
          else if (chip.key !== 'all') count = ratingCounts[parseInt(chip.key)] ?? 0;
          return (
            <Pressable
              key={chip.key}
              onPress={() => { Haptics.selectionAsync(); setActiveFilter(chip.key); }}
              style={[s.filterChip, isActive && s.filterChipActive]}
            >
              <Text style={[s.filterChipText, isActive && s.filterChipTextActive]}>
                {chip.label}
                {count != null ? ` (${count})` : ''}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  ) : null;

  return (
    <DirectorStandaloneScreen title="Customer Feedback" subtitle="Ratings, comments & order reviews">
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 16, gap: 10 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={listHeader}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />
          }
          ListEmptyComponent={
            <View style={s.emptyWrap}>
              <Feather name="message-square" size={40} color={BORD} />
              <Text style={s.emptyTitle}>
                {activeFilter === 'unread' ? 'All caught up!' : 'No feedback yet'}
              </Text>
              <Text style={s.emptySub}>
                {activeFilter === 'unread'
                  ? 'No unresolved feedback at the moment.'
                  : 'Customer feedback will appear here once submitted.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <FeedbackCard
              item={item}
              onToggleRead={(id, isRead) => markReadMutation.mutate({ id, isRead })}
            />
          )}
        />
      )}
    </DirectorStandaloneScreen>
  );
}

const s = StyleSheet.create({
  title:    { fontSize: 28, fontWeight: '700', color: TEXT },
  subtitle: { fontSize: 13, color: MUTED, marginTop: 2 },

  summaryRow: { flexDirection: 'row', gap: 8, marginTop: 4, flexWrap: 'wrap' },
  summaryChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: CARD, paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: BORD,
  },
  summaryChipText: { fontSize: 12, fontWeight: '600', color: MUTED },

  filterBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 6, gap: 8 },
  filterChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: CARD, borderWidth: StyleSheet.hairlineWidth, borderColor: BORD,
  },
  filterChipActive: { backgroundColor: BLUE, borderColor: BLUE },
  filterChipText:   { fontSize: 13, fontWeight: '500', color: MUTED },
  filterChipTextActive: { color: '#FFFFFF', fontWeight: '600' },

  card: {
    backgroundColor: CARD, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: BORD,
    padding: 16, gap: 10,
  },
  cardUnread: { borderColor: BLUE + '50', borderWidth: 1 },
  unreadDot: {
    position: 'absolute', top: 14, right: 14,
    width: 8, height: 8, borderRadius: 4, backgroundColor: BLUE,
  },

  cardHeader:  { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  userName:    { fontSize: 15, fontWeight: '700', color: TEXT },
  dateText:    { fontSize: 11, color: MUTED, textAlign: 'right', lineHeight: 16, paddingRight: 14 },

  ratingBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12,
    borderWidth: 1,
  },
  ratingBadgeText: { fontSize: 11, fontWeight: '700' },

  categoryBadge: {
    backgroundColor: BLUE + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
  },
  categoryText: { fontSize: 11, fontWeight: '600', color: BLUE, textTransform: 'capitalize' },

  messageText: { fontSize: 14, color: TEXT, lineHeight: 20 },

  metaRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: BG, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: BORD,
  },
  metaChipText: { fontSize: 11, color: MUTED, fontWeight: '500' },

  resolveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 12, backgroundColor: GREEN + '12', borderWidth: 1, borderColor: GREEN + '35',
  },
  resolveBtnResolved: {
    backgroundColor: BG, borderColor: BORD,
  },
  resolveBtnText: { fontSize: 12, fontWeight: '600', color: GREEN },
  resolveBtnTextResolved: { color: MUTED },

  emptyWrap: { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: TEXT },
  emptySub:   { fontSize: 14, color: MUTED, textAlign: 'center', paddingHorizontal: 32 },
});

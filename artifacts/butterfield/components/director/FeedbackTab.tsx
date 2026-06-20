import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { api } from '@/lib/api';
import type { DirectorFeedback } from '@/lib/api';
import { s } from './reportStyles';
import { BLUE, MUTED, BORDER, BG, AMBER } from './directorColors';
import { fmtDate } from './reportHelpers';

const CATS: Record<string, { color: string; bg: string }> = {
  general:  { color: '#0369A1', bg: '#EBF8FF' },
  product:  { color: '#5B21B6', bg: '#EDE9FE' },
  service:  { color: '#166534', bg: '#DCFCE7' },
  app:      { color: '#854D0E', bg: '#FEF9C3' },
  complaint:{ color: '#991B1B', bg: '#FEF2F2' },
};

export default function FeedbackTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-feedback'],
    queryFn: () => api.director.allFeedback(),
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const feedback = data?.data ?? [];

  const markRead = useMutation({
    mutationFn: (id: string) => api.director.markFeedbackRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['director-feedback'] }),
  });

  if (isLoading) return <View style={s.center}><ActivityIndicator color={BLUE} /></View>;

  return (
    <FlatList
      data={feedback}
      keyExtractor={f => f.id}
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
      ListEmptyComponent={
        <View style={s.center}>
          <Feather name="message-square" size={32} color={MUTED} />
          <Text style={s.emptyText}>No feedback yet</Text>
        </View>
      }
      renderItem={({ item: f }: { item: DirectorFeedback }) => {
        const cat = CATS[f.category] ?? { color: MUTED, bg: BG };
        return (
          <Pressable
            style={[s.card, { backgroundColor: f.isRead ? 'rgba(255,255,255,0.6)' : '#F0F9FF', borderColor: f.isRead ? BORDER : BLUE + '40', padding: 14 }]}
            onPress={() => { if (!f.isRead) { Haptics.selectionAsync(); markRead.mutate(f.id); } }}
          >
            <View style={s.fbHeader}>
              <View style={[s.pill, { backgroundColor: cat.bg }]}>
                <Text style={[s.pillText, { color: cat.color }]}>{f.category.toUpperCase()}</Text>
              </View>
              {f.rating != null && (
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {[1,2,3,4,5].map(n => (
                    <Feather key={n} name="star" size={11} color={n <= f.rating! ? AMBER : BORDER} />
                  ))}
                </View>
              )}
              <Text style={s.fbDate}>{fmtDate(f.createdAt)}</Text>
              {!f.isRead && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: BLUE }} />}
            </View>
            <Text style={s.fbMessage}>{f.message}</Text>
          </Pressable>
        );
      }}
    />
  );
}

import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { api, type CrmSegment } from '@/lib/api';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import { BG, CARD, BLUE, NAVY, TEXT, MUTED, BORDER, GREEN, AMBER, RED, PURPLE, PINK, TEAL, ROSE, GOLD, GLASS_BG, GLASS_BORDER } from '@/components/director/directorColors';

function SegmentNotifyModal({ segment, onClose }: { segment: CrmSegment; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [body, setBody]   = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!title.trim() || !body.trim()) {
      Alert.alert('Missing fields', 'Please enter a title and message.');
      return;
    }
    setSending(true);
    try {
      const res = await api.director.customers.segmentNotify(segment.key, title.trim(), body.trim());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Sent!', `Notification sent to ${res.sent} customer${res.sent !== 1 ? 's' : ''} in ${segment.label}.`);
      onClose();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BG }}>
        <View style={[s.modalHeader, { paddingTop: insets.top > 0 ? insets.top + 4 : 20 }]}>
          <Pressable onPress={onClose} style={s.headerBtn} hitSlop={10}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <Text style={s.modalTitle}>Notify Segment</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 16 }}>
          <View style={[s.card, { backgroundColor: segment.color + '12', borderColor: segment.color + '30', padding: 14 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: segment.color + '33', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: segment.color + '55' }}>
                <Feather name={segment.icon as any} size={16} color={segment.color} />
              </View>
              <View>
                <Text style={{ fontSize: 14, fontWeight: '700', color: TEXT }}>{segment.label}</Text>
                <Text style={{ fontSize: 12, color: MUTED }}>{segment.count} customer{segment.count !== 1 ? 's' : ''}</Text>
              </View>
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={s.fieldLabel}>Notification title</Text>
            <TextInput
              style={s.input}
              placeholder="e.g. Special offer for VIP members"
              placeholderTextColor={MUTED}
              value={title}
              onChangeText={setTitle}
              maxLength={80}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={s.fieldLabel}>Message</Text>
            <TextInput
              style={[s.input, { minHeight: 100, textAlignVertical: 'top', paddingTop: 12 }]}
              placeholder="Write your message here…"
              placeholderTextColor={MUTED}
              value={body}
              onChangeText={setBody}
              multiline
              maxLength={300}
            />
            <Text style={{ fontSize: 11, color: MUTED, textAlign: 'right' }}>{body.length}/300</Text>
          </View>

          <Pressable
            onPress={send}
            disabled={sending || !title.trim() || !body.trim()}
            style={[s.sendBtn, { opacity: sending || !title.trim() || !body.trim() ? 0.5 : 1 }]}
          >
            {sending ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <Feather name="send" size={16} color="#fff" />
                <Text style={s.sendBtnText}>Send to {segment.count} customer{segment.count !== 1 ? 's' : ''}</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function CustomerSegmentsScreen() {
  const [notifyTarget, setNotifyTarget] = useState<CrmSegment | null>(null);
  const [refreshing, setRefreshing]     = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['crm-segments'],
    queryFn:  () => api.director.customers.segments(),
    staleTime: 60_000,
  });

  const segments: CrmSegment[] = data?.data ?? [];
  const onRefresh = async () => { setRefreshing(true); await refetch(); setRefreshing(false); };

  return (
    <DirectorStandaloneScreen title="Customer Segments">
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : (
        <FlatList
          data={segments}
          keyExtractor={seg => seg.key}
          contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
          ListHeaderComponent={
            <View style={{ marginBottom: 12 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                Customer Segments
              </Text>
              <Text style={{ fontSize: 12, color: MUTED, marginTop: 4 }}>
                Target groups of customers with push notifications
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60, gap: 12 }}>
              <Feather name="layers" size={40} color={MUTED} />
              <Text style={{ color: MUTED, fontSize: 15 }}>No segments available</Text>
            </View>
          }
          renderItem={({ item: seg }) => (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setNotifyTarget(seg); }}
              style={s.segCard}
            >
              <View style={[s.segIcon, { backgroundColor: seg.color + '33', borderColor: seg.color + '55' }]}>
                <Feather name={seg.icon as any} size={20} color={seg.color} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={s.segLabel}>{seg.label}</Text>
                  <View style={[s.segCountBadge, { backgroundColor: seg.color + '18' }]}>
                    <Text style={[s.segCountText, { color: seg.color }]}>{seg.count}</Text>
                  </View>
                </View>
                <Text style={s.segDesc}>{seg.description}</Text>
              </View>
              <View style={[s.segAction, { backgroundColor: seg.color + '15', borderColor: seg.color + '40' }]}>
                <Feather name="bell" size={14} color={seg.color} />
              </View>
            </Pressable>
          )}
        />
      )}
      {notifyTarget && (
        <SegmentNotifyModal segment={notifyTarget} onClose={() => setNotifyTarget(null)} />
      )}
    </DirectorStandaloneScreen>
  );
}

const s = StyleSheet.create({
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER,
    backgroundColor: CARD,
  },
  headerBtn:   { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' },
  modalTitle:  { fontSize: 16, fontWeight: '700', color: TEXT },
  fieldLabel:  { fontSize: 12, fontWeight: '600', color: MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: TEXT,
  },
  sendBtn: {
    backgroundColor: BLUE, borderRadius: 12, height: 50,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  card: { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },
  segCard: {
    backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
  },
  segIcon:       { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  segLabel:      { fontSize: 15, fontWeight: '700', color: TEXT },
  segDesc:       { fontSize: 12, color: MUTED },
  segCountBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  segCountText:  { fontSize: 12, fontWeight: '700' },
  segAction: {
    width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
});

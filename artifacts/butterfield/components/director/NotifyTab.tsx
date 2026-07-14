import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Text, View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { DirectorAnnouncement } from '@/lib/api';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import AnnouncementModal from './AnnouncementModal';
import { styles } from './settingsStyles';

const BLUE   = '#1493FF';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';
const GLASS_BORDER = 'rgba(255,255,255,0.6)';

export function NotifyTab() {
  const qc = useQueryClient();
  const [modal, setModal]     = useState(false);
  const [editing, setEditing] = useState<DirectorAnnouncement | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-announcements'],
    queryFn: () => api.director.allAnnouncements(),
  });
  const { refreshing, onRefresh } = useRefreshControl(refetch);
  const announcements = data?.data ?? [];

  const deleteAnn = useMutation({
    mutationFn: (id: string) => api.director.deleteAnnouncement(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['director-announcements'] }),
  });

  const confirmDelete = (a: DirectorAnnouncement) => {
    Alert.alert('Delete Announcement', `"${a.title}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        deleteAnn.mutate(a.id);
      }},
    ]);
  };

  const openEdit = (a: DirectorAnnouncement) => { setEditing(a); setModal(true); };
  const openNew  = ()                          => { setEditing(null); setModal(true); };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  }

  return (
    <>
      <FlatList
        data={announcements}
        keyExtractor={a => a.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
        ListHeaderComponent={
          <>
            <View style={[styles.infoBanner, { backgroundColor: '#EBF8FF', borderColor: BLUE + '40', marginBottom: 10 }]}>
              <Feather name="bell" size={13} color={BLUE} />
              <Text style={[styles.infoBannerText, { color: BLUE }]}>
                Announcements appear in the home feed for the selected audience. Pinned items appear at the top.
              </Text>
            </View>
            <Pressable style={[styles.addBtn, { backgroundColor: BLUE }]} onPress={openNew}>
              <Feather name="plus" size={16} color="#fff" />
              <Text style={styles.addBtnText}>New Announcement</Text>
            </Pressable>
          </>
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Feather name="bell-off" size={32} color={MUTED} />
            <Text style={styles.emptyText}>No announcements yet</Text>
          </View>
        }
        renderItem={({ item: a }: { item: DirectorAnnouncement }) => (
          <View style={[styles.card, { borderColor: a.isActive ? BORDER : '#FEE2E2' }]}>
            <View style={styles.annHeader}>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {a.isPinned && <Feather name="bookmark" size={12} color={AMBER} />}
                  <Text style={styles.annTitle}>{a.title}</Text>
                </View>
                <Text style={styles.annBody} numberOfLines={2}>{a.body}</Text>
              </View>
              <View style={[styles.chip, { backgroundColor: a.isActive ? '#DCFCE7' : '#FEE2E2', borderColor: 'transparent', marginLeft: 8 }]}>
                <Text style={[styles.chipText, { color: a.isActive ? '#166534' : '#991B1B', fontSize: 10 }]}>
                  {a.isActive ? 'LIVE' : 'OFF'}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
              {a.targetRoles.map(r => (
                <View key={r} style={[styles.chip, { backgroundColor: '#F3F4F6', borderColor: BORDER, paddingVertical: 2 }]}>
                  <Text style={[styles.chipText, { color: MUTED, fontSize: 10 }]}>{r}</Text>
                </View>
              ))}
              <Text style={styles.annDate}>{new Date(a.createdAt).toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: 'numeric', month: 'short', year: 'numeric' })}</Text>
            </View>
            <View style={styles.rewardActions}>
              <Pressable onPress={() => openEdit(a)} style={[styles.actionBtn, { borderColor: BLUE + '40', backgroundColor: '#EBF8FF' }]}>
                <Feather name="edit-2" size={13} color={BLUE} />
                <Text style={[styles.actionBtnText, { color: BLUE }]}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => confirmDelete(a)} style={[styles.actionBtn, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}>
                <Feather name="trash-2" size={13} color={RED} />
                <Text style={[styles.actionBtnText, { color: RED }]}>Delete</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
      <AnnouncementModal
        visible={modal}
        announcement={editing}
        onClose={() => setModal(false)}
        onSuccess={() => { setModal(false); qc.invalidateQueries({ queryKey: ['director-announcements'] }); }}
      />
    </>
  );
}

import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, RefreshControl, ScrollView, StyleSheet,
  Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { api, type DirectorReward, type DirectorAnnouncement } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#EF4444';
const AMBER  = '#F59E0B';

const TABS = ['Store', 'Rewards', 'Notify', 'Managers'] as const;
type TabKey = typeof TABS[number];

const REWARD_CATEGORIES = ['food', 'drink', 'discount', 'experience', 'merchandise'];
const TARGET_ROLES      = ['customer', 'staff', 'wholesale'];

// ─── Store Settings ──────────────────────────────────────────────────────────
function StoreTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['director-settings'],
    queryFn: () => api.director.settings(),
  });
  const settings = data?.data ?? {};
  const [geoRadius,    setGeoRadius]    = useState('');
  const [storeOpen,    setStoreOpen]    = useState(true);
  const [dailySpecial, setDailySpecial] = useState('');
  const [shopLat,      setShopLat]      = useState('');
  const [shopLng,      setShopLng]      = useState('');
  const [saving,       setSaving]       = useState(false);

  useEffect(() => {
    if (settings) {
      setGeoRadius(settings.geo_radius_meters ?? '20');
      setStoreOpen(settings.store_open !== 'false');
      setDailySpecial(settings.daily_special ?? '');
      setShopLat(settings.shop_lat ?? '-33.8349');
      setShopLng(settings.shop_lng ?? '150.9942');
    }
  }, [data]);

  const save = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.updateSettings({
        geo_radius_meters: geoRadius,
        store_open:        String(storeOpen),
        daily_special:     dailySpecial,
        shop_lat:          shopLat,
        shop_lng:          shopLng,
      });
      await qc.invalidateQueries({ queryKey: ['director-settings'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Settings updated successfully.');
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSaving(false); }
  };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <Text style={styles.section}>STORE</Text>
      <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowTitle}>Store open</Text>
            <Text style={styles.rowSub}>Controls the "Open now" status shown to customers</Text>
          </View>
          <Switch value={storeOpen} onValueChange={v => { setStoreOpen(v); Haptics.selectionAsync(); }}
            trackColor={{ false: '#D1D5DB', true: GREEN }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
        </View>
        <View style={[styles.divider, { backgroundColor: BORDER }]} />
        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Daily special</Text>
          <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={dailySpecial}
            onChangeText={setDailySpecial} placeholder="e.g. Cookie & Cream Sandwich" placeholderTextColor={MUTED} />
        </View>
      </View>

      <Text style={styles.section}>STAFF GEO-FENCE</Text>
      <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
        <View style={[styles.infoBanner, { backgroundColor: '#EBF8FF', borderColor: BLUE + '40' }]}>
          <Feather name="map-pin" size={13} color={BLUE} />
          <Text style={[styles.infoBannerText, { color: BLUE }]}>
            Staff must be within this radius of the store coordinates to clock in.
          </Text>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Check-in radius (metres)</Text>
          <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={geoRadius}
            onChangeText={setGeoRadius} keyboardType="number-pad" placeholder="20" placeholderTextColor={MUTED} />
        </View>
        <View style={[styles.divider, { backgroundColor: BORDER }]} />
        <View style={styles.coordRow}>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.fieldLabel}>Shop latitude</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={shopLat}
              onChangeText={setShopLat} keyboardType="decimal-pad" placeholder="-33.8349" placeholderTextColor={MUTED} />
          </View>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={styles.fieldLabel}>Shop longitude</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={shopLng}
              onChangeText={setShopLng} keyboardType="decimal-pad" placeholder="150.9942" placeholderTextColor={MUTED} />
          </View>
        </View>
        <Text style={[styles.hint, { color: MUTED }]}>Butterfield Merrylands: –33.8349, 150.9942</Text>
      </View>

      <Text style={styles.section}>DEMO ACCOUNTS</Text>
      <View style={[styles.card, { backgroundColor: CARD, borderColor: BORDER, gap: 10 }]}>
        {[
          { role: 'Customer',  email: 'customer@demo.com',  color: '#0369A1', bg: '#EBF8FF' },
          { role: 'Staff',     email: 'staff@demo.com',     color: '#5B21B6', bg: '#EDE9FE' },
          { role: 'Wholesale', email: 'wholesale@demo.com', color: '#166534', bg: '#DCFCE7' },
          { role: 'Director',  email: 'director@demo.com',  color: '#854D0E', bg: '#FEF9C3' },
        ].map(d => (
          <View key={d.role} style={[styles.demoRow, { borderColor: BORDER }]}>
            <View style={[styles.demoPill, { backgroundColor: d.bg }]}>
              <Text style={[styles.demoPillText, { color: d.color }]}>{d.role}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.demoEmail}>{d.email}</Text>
              <Text style={[styles.demoPw, { color: MUTED }]}>Demo1234!</Text>
            </View>
          </View>
        ))}
      </View>

      <Pressable onPress={save} disabled={saving}
        style={[styles.saveBtn, { backgroundColor: BLUE, opacity: saving ? 0.8 : 1 }]}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Settings</Text>}
      </Pressable>
    </ScrollView>
  );
}

// ─── Reward Form Modal ────────────────────────────────────────────────────────
function RewardModal({ visible, reward, onClose, onSuccess }: {
  visible: boolean; reward: DirectorReward | null; onClose: () => void; onSuccess: () => void;
}) {
  const [name,       setName]       = useState('');
  const [desc,       setDesc]       = useState('');
  const [pts,        setPts]        = useState('');
  const [category,   setCategory]   = useState('food');
  const [stock,      setStock]      = useState('');
  const [isAppOnly,  setIsAppOnly]  = useState(false);
  const [isActive,   setIsActive]   = useState(true);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    if (reward) {
      setName(reward.name); setDesc(reward.description); setPts(String(reward.pointsCost));
      setCategory(reward.category); setStock(reward.stock != null ? String(reward.stock) : '');
      setIsAppOnly(reward.isAppOnly); setIsActive(reward.isActive);
    } else {
      setName(''); setDesc(''); setPts(''); setCategory('food'); setStock('');
      setIsAppOnly(false); setIsActive(true);
    }
    setError('');
  }, [reward, visible]);

  const submit = async () => {
    setError('');
    if (!name.trim()) { setError('Name is required.'); return; }
    const pointsCost = parseInt(pts, 10);
    if (isNaN(pointsCost) || pointsCost < 1) { setError('Points cost must be a positive number.'); return; }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const payload = {
        name: name.trim(), description: desc.trim(), pointsCost, category,
        stock: stock ? parseInt(stock, 10) : null, isAppOnly, isActive,
      };
      if (reward?.id) await api.director.updateReward(reward.id, payload);
      else            await api.director.createReward(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.modalHeader, { borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose}><Text style={[styles.modalCancel, { color: MUTED }]}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>{reward ? 'Edit Reward' : 'New Reward'}</Text>
          <Pressable onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color={BLUE} /> : <Text style={[styles.modalSave, { color: BLUE }]}>Save</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          {error ? <Text style={[styles.errorText, { color: RED }]}>{error}</Text> : null}

          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Name *</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={name}
              onChangeText={setName} placeholder="e.g. Free Flat White" placeholderTextColor={MUTED} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Description</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT, minHeight: 72 }]}
              value={desc} onChangeText={setDesc} multiline placeholder="What does the customer get?"
              placeholderTextColor={MUTED} textAlignVertical="top" />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Points cost *</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={pts}
              onChangeText={setPts} keyboardType="number-pad" placeholder="e.g. 500" placeholderTextColor={MUTED} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {REWARD_CATEGORIES.map(c => (
                <Pressable key={c} onPress={() => setCategory(c)}
                  style={[styles.chip, { backgroundColor: category === c ? BLUE : '#F3F4F6', borderColor: category === c ? BLUE : BORDER }]}>
                  <Text style={[styles.chipText, { color: category === c ? '#fff' : TEXT }]}>{c}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Stock limit (leave blank for unlimited)</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={stock}
              onChangeText={setStock} keyboardType="number-pad" placeholder="Unlimited" placeholderTextColor={MUTED} />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>App-only reward</Text>
            <Switch value={isAppOnly} onValueChange={v => { setIsAppOnly(v); Haptics.selectionAsync(); }}
              trackColor={{ false: '#D1D5DB', true: BLUE }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Active</Text>
            <Switch value={isActive} onValueChange={v => { setIsActive(v); Haptics.selectionAsync(); }}
              trackColor={{ false: '#D1D5DB', true: GREEN }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Rewards Tab ──────────────────────────────────────────────────────────────
function RewardsTab() {
  const qc = useQueryClient();
  const [modal, setModal]   = useState(false);
  const [editing, setEditing] = useState<DirectorReward | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-rewards'],
    queryFn: () => api.director.rewards(),
  });
  const rewards = data?.data ?? [];

  const deleteReward = useMutation({
    mutationFn: (id: string) => api.director.deleteReward(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['director-rewards'] }),
  });

  const confirmDelete = (r: DirectorReward) => {
    Alert.alert('Deactivate Reward', `"${r.name}" will be hidden from customers.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Deactivate', style: 'destructive', onPress: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        deleteReward.mutate(r.id);
      }},
    ]);
  };

  const openEdit = (r: DirectorReward) => { setEditing(r); setModal(true); };
  const openNew  = ()                   => { setEditing(null); setModal(true); };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  }

  return (
    <>
      <FlatList
        data={rewards}
        keyExtractor={r => r.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
        ListHeaderComponent={
          <Pressable style={[styles.addBtn, { backgroundColor: BLUE }]} onPress={openNew}>
            <Feather name="plus" size={16} color="#fff" />
            <Text style={styles.addBtnText}>New Reward</Text>
          </Pressable>
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Feather name="star" size={32} color={MUTED} />
            <Text style={styles.emptyText}>No rewards yet</Text>
          </View>
        }
        renderItem={({ item: r }: { item: DirectorReward }) => (
          <View style={[styles.card, { backgroundColor: CARD, borderColor: r.isActive ? BORDER : '#FEE2E2' }]}>
            <View style={styles.rewardHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rewardName}>{r.name}</Text>
                <Text style={styles.rewardDesc} numberOfLines={1}>{r.description}</Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 4 }}>
                <Text style={[styles.rewardPts, { color: BLUE }]}>{r.pointsCost.toLocaleString()} pts</Text>
                <View style={[styles.chip, { backgroundColor: r.isActive ? '#DCFCE7' : '#FEE2E2', borderColor: 'transparent' }]}>
                  <Text style={[styles.chipText, { color: r.isActive ? '#166534' : '#991B1B', fontSize: 10 }]}>
                    {r.isActive ? 'ACTIVE' : 'INACTIVE'}
                  </Text>
                </View>
              </View>
            </View>
            <View style={styles.rewardMeta}>
              <Text style={styles.rewardMetaText}>#{r.category}</Text>
              {r.isAppOnly    && <Text style={styles.rewardMetaText}>· App only</Text>}
              {r.stock != null && <Text style={styles.rewardMetaText}>· Stock: {r.stock}</Text>}
            </View>
            <View style={styles.rewardActions}>
              <Pressable onPress={() => openEdit(r)} style={[styles.actionBtn, { borderColor: BLUE + '40', backgroundColor: '#EBF8FF' }]}>
                <Feather name="edit-2" size={13} color={BLUE} />
                <Text style={[styles.actionBtnText, { color: BLUE }]}>Edit</Text>
              </Pressable>
              <Pressable onPress={() => confirmDelete(r)} style={[styles.actionBtn, { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' }]}>
                <Feather name="eye-off" size={13} color={RED} />
                <Text style={[styles.actionBtnText, { color: RED }]}>Deactivate</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
      <RewardModal
        visible={modal} reward={editing}
        onClose={() => setModal(false)}
        onSuccess={() => { setModal(false); qc.invalidateQueries({ queryKey: ['director-rewards'] }); }}
      />
    </>
  );
}

// ─── Notification Form Modal ──────────────────────────────────────────────────
function AnnouncementModal({ visible, announcement, onClose, onSuccess }: {
  visible: boolean; announcement: DirectorAnnouncement | null; onClose: () => void; onSuccess: () => void;
}) {
  const [title,       setTitle]       = useState('');
  const [body,        setBody]        = useState('');
  const [isPinned,    setIsPinned]    = useState(false);
  const [isActive,    setIsActive]    = useState(true);
  const [targetRoles, setTargetRoles] = useState<string[]>(['customer']);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');

  useEffect(() => {
    if (announcement) {
      setTitle(announcement.title); setBody(announcement.body);
      setIsPinned(announcement.isPinned); setIsActive(announcement.isActive);
      setTargetRoles(announcement.targetRoles);
    } else {
      setTitle(''); setBody(''); setIsPinned(false); setIsActive(true); setTargetRoles(['customer']);
    }
    setError('');
  }, [announcement, visible]);

  const toggleRole = (role: string) => {
    setTargetRoles(prev => prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]);
    Haptics.selectionAsync();
  };

  const submit = async () => {
    setError('');
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!body.trim())  { setError('Body is required.'); return; }
    if (targetRoles.length === 0) { setError('Select at least one audience.'); return; }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const payload = { title: title.trim(), body: body.trim(), isPinned, isActive, targetRoles };
      if (announcement?.id) await api.director.updateAnnouncement(announcement.id, payload);
      else                   await api.director.createAnnouncement(payload);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess();
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.modalHeader, { borderBottomColor: BORDER }]}>
          <Pressable onPress={onClose}><Text style={[styles.modalCancel, { color: MUTED }]}>Cancel</Text></Pressable>
          <Text style={styles.modalTitle}>{announcement ? 'Edit Announcement' : 'New Announcement'}</Text>
          <Pressable onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color={BLUE} /> : <Text style={[styles.modalSave, { color: BLUE }]}>Publish</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          {error ? <Text style={[styles.errorText, { color: RED }]}>{error}</Text> : null}
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Title *</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT }]} value={title}
              onChangeText={setTitle} placeholder="e.g. New Summer Menu!" placeholderTextColor={MUTED} />
          </View>
          <View style={{ gap: 6 }}>
            <Text style={styles.fieldLabel}>Message *</Text>
            <TextInput style={[styles.input, { borderColor: BORDER, color: TEXT, minHeight: 100 }]}
              value={body} onChangeText={setBody} multiline
              placeholder="What do you want to tell your customers?"
              placeholderTextColor={MUTED} textAlignVertical="top" />
          </View>
          <View style={{ gap: 8 }}>
            <Text style={styles.fieldLabel}>Audience</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {TARGET_ROLES.map(role => (
                <Pressable key={role} onPress={() => toggleRole(role)}
                  style={[styles.chip, { backgroundColor: targetRoles.includes(role) ? BLUE : '#F3F4F6', borderColor: targetRoles.includes(role) ? BLUE : BORDER }]}>
                  <Text style={[styles.chipText, { color: targetRoles.includes(role) ? '#fff' : TEXT }]}>
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Pin to top of feed</Text>
            <Switch value={isPinned} onValueChange={v => { setIsPinned(v); Haptics.selectionAsync(); }}
              trackColor={{ false: '#D1D5DB', true: AMBER }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
          </View>
          <View style={styles.switchRow}>
            <Text style={styles.fieldLabel}>Active (visible to users)</Text>
            <Switch value={isActive} onValueChange={v => { setIsActive(v); Haptics.selectionAsync(); }}
              trackColor={{ false: '#D1D5DB', true: GREEN }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Notifications Tab ────────────────────────────────────────────────────────
function NotifyTab() {
  const qc = useQueryClient();
  const [modal, setModal]     = useState(false);
  const [editing, setEditing] = useState<DirectorAnnouncement | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-announcements'],
    queryFn: () => api.director.allAnnouncements(),
  });
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
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={BLUE} />}
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
          <View style={[styles.card, { backgroundColor: CARD, borderColor: a.isActive ? BORDER : '#FEE2E2' }]}>
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
              <Text style={styles.annDate}>{new Date(a.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</Text>
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
        visible={modal} announcement={editing}
        onClose={() => setModal(false)}
        onSuccess={() => { setModal(false); qc.invalidateQueries({ queryKey: ['director-announcements'] }); }}
      />
    </>
  );
}

// ─── Managers Tab ─────────────────────────────────────────────────────────────
const ALL_PERMISSIONS = [
  { key: 'dashboard',     label: 'Dashboard',     icon: 'grid'        },
  { key: 'orders',        label: 'Orders',        icon: 'shopping-bag'},
  { key: 'users',         label: 'Users',         icon: 'users'       },
  { key: 'products',      label: 'Products',      icon: 'package'     },
  { key: 'reports',       label: 'Reports',       icon: 'bar-chart-2' },
  { key: 'rewards',       label: 'Rewards',       icon: 'gift'        },
  { key: 'announcements', label: 'Announcements', icon: 'bell'        },
  { key: 'settings',      label: 'Settings',      icon: 'settings'    },
  { key: 'pricing',       label: 'Pricing',       icon: 'dollar-sign' },
] as const;

const INDIGO = '#3730A3';

interface ManagerFormData { name: string; email: string; password: string; notes: string }

function ManagersTab() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-managers'],
    queryFn: () => api.director.managers.list(),
  });

  const managers = data?.data ?? [];

  const [createModal, setCreateModal] = useState(false);
  const [form, setForm] = useState<ManagerFormData>({ name: '', email: '', password: '', notes: '' });
  const [creating, setCreating] = useState(false);
  const [formPerms, setFormPerms] = useState<string[]>([]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPerms, setEditPerms] = useState<string[]>([]);
  const [savingPerms, setSavingPerms] = useState(false);

  function togglePerm(set: string[], key: string, setter: (v: string[]) => void) {
    Haptics.selectionAsync();
    setter(set.includes(key) ? set.filter(p => p !== key) : [...set, key]);
  }

  const handleCreate = async () => {
    if (!form.name || !form.email || !form.password) {
      Alert.alert('Missing fields', 'Name, email and password are required.'); return;
    }
    setCreating(true);
    try {
      await api.director.managers.create({ ...form, permissions: formPerms });
      await qc.invalidateQueries({ queryKey: ['director-managers'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreateModal(false);
      setForm({ name: '', email: '', password: '', notes: '' });
      setFormPerms([]);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setCreating(false); }
  };

  const handleSavePerms = async (id: string) => {
    setSavingPerms(true);
    try {
      await api.director.managers.updatePermissions(id, { permissions: editPerms });
      await qc.invalidateQueries({ queryKey: ['director-managers'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setEditingId(null);
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally { setSavingPerms(false); }
  };

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Remove Manager', `Remove ${name}'s manager access? Their account will become a staff account.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          await api.director.managers.delete(id);
          await qc.invalidateQueries({ queryKey: ['director-managers'] });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch (e: any) { Alert.alert('Error', e.message); }
      }},
    ]);
  };

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;

  return (
    <>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
        <Pressable onPress={() => { Haptics.selectionAsync(); setCreateModal(true); }}
          style={[styles.addBtn, { backgroundColor: INDIGO }]}>
          <Feather name="user-plus" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Add Manager</Text>
        </Pressable>

        {managers.length === 0 ? (
          <View style={styles.center}>
            <Feather name="users" size={40} color={BORDER} />
            <Text style={styles.emptyText}>No managers yet. Add one above.</Text>
          </View>
        ) : (
          managers.map((m: any) => (
            <View key={m.id} style={[styles.card, { backgroundColor: CARD, borderColor: BORDER }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: 'Inter_700Bold', color: TEXT }}>{m.name}</Text>
                  <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED, marginTop: 2 }}>{m.email}</Text>
                </View>
                <Pressable onPress={() => handleDelete(m.id, m.name)} style={{ padding: 6 }}>
                  <Feather name="trash-2" size={18} color={RED} />
                </Pressable>
              </View>

              {m.notes ? <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: MUTED }}>{m.notes}</Text> : null}

              <View style={{ height: 1, backgroundColor: BORDER }} />

              {/* Permission toggles */}
              {editingId === m.id ? (
                <>
                  {ALL_PERMISSIONS.map(p => (
                    <View key={p.key} style={styles.switchRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Feather name={p.icon as any} size={14} color={INDIGO} />
                        <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: TEXT }}>{p.label}</Text>
                      </View>
                      <Switch
                        value={editPerms.includes(p.key)}
                        onValueChange={() => togglePerm(editPerms, p.key, setEditPerms)}
                        trackColor={{ false: BORDER, true: INDIGO }}
                        thumbColor="#fff"
                        ios_backgroundColor={BORDER}
                      />
                    </View>
                  ))}
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable onPress={() => setEditingId(null)}
                      style={[styles.actionBtn, { flex: 1, borderColor: BORDER, justifyContent: 'center' }]}>
                      <Text style={[styles.actionBtnText, { color: MUTED }]}>Cancel</Text>
                    </Pressable>
                    <Pressable onPress={() => handleSavePerms(m.id)} disabled={savingPerms}
                      style={[styles.actionBtn, { flex: 1, backgroundColor: INDIGO, borderColor: INDIGO, justifyContent: 'center' }]}>
                      {savingPerms ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.actionBtnText, { color: '#fff' }]}>Save permissions</Text>}
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {(m.permissions as string[]).length === 0 ? (
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_400Regular', color: AMBER }}>No permissions — manager cannot see any tabs</Text>
                    ) : (m.permissions as string[]).map((p: string) => (
                      <View key={p} style={[styles.chip, { backgroundColor: INDIGO + '18', borderColor: INDIGO + '40' }]}>
                        <Text style={[styles.chipText, { color: INDIGO }]}>{p}</Text>
                      </View>
                    ))}
                  </View>
                  <Pressable onPress={() => { setEditingId(m.id); setEditPerms([...(m.permissions as string[])]); }}
                    style={[styles.actionBtn, { borderColor: INDIGO, alignSelf: 'flex-start' }]}>
                    <Feather name="edit-2" size={12} color={INDIGO} />
                    <Text style={[styles.actionBtnText, { color: INDIGO }]}>Edit permissions</Text>
                  </Pressable>
                </>
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Create Manager Modal */}
      <Modal visible={createModal} animationType="slide" presentationStyle="formSheet" onRequestClose={() => setCreateModal(false)}>
        <View style={{ flex: 1, backgroundColor: BG }}>
          <View style={[styles.modalHeader, { borderBottomColor: BORDER }]}>
            <Pressable onPress={() => setCreateModal(false)}>
              <Text style={[styles.modalCancel, { color: MUTED }]}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>New Manager</Text>
            <Pressable onPress={handleCreate} disabled={creating}>
              {creating ? <ActivityIndicator color={BLUE} size="small" /> :
                <Text style={[styles.modalSave, { color: BLUE }]}>Create</Text>}
            </Pressable>
          </View>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}>
              {[
                { label: 'Full Name', key: 'name', placeholder: 'Jane Smith' },
                { label: 'Email', key: 'email', placeholder: 'jane@butterfield.com.au' },
                { label: 'Password', key: 'password', placeholder: 'Min 8 characters' },
                { label: 'Notes (optional)', key: 'notes', placeholder: 'e.g. Sydney store manager' },
              ].map(field => (
                <View key={field.key} style={{ gap: 6 }}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <TextInput
                    value={(form as any)[field.key]}
                    onChangeText={v => setForm(p => ({ ...p, [field.key]: v }))}
                    placeholder={field.placeholder}
                    placeholderTextColor={MUTED}
                    secureTextEntry={field.key === 'password'}
                    style={[styles.input, { color: TEXT, borderColor: BORDER }]}
                  />
                </View>
              ))}

              <Text style={[styles.section, { marginTop: 8 }]}>INITIAL PERMISSIONS</Text>
              {ALL_PERMISSIONS.map(p => (
                <View key={p.key} style={styles.switchRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Feather name={p.icon as any} size={14} color={INDIGO} />
                    <Text style={{ fontSize: 14, fontFamily: 'Inter_500Medium', color: TEXT }}>{p.label}</Text>
                  </View>
                  <Switch
                    value={formPerms.includes(p.key)}
                    onValueChange={() => togglePerm(formPerms, p.key, setFormPerms)}
                    trackColor={{ false: BORDER, true: INDIGO }}
                    thumbColor="#fff"
                    ios_backgroundColor={BORDER}
                  />
                </View>
              ))}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function DirectorSettingsScreen() {
  const [tab, setTab] = useState<TabKey>('Store');

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[styles.tabBar, { borderBottomColor: BORDER }]}>
        {TABS.map(t => (
          <Pressable key={t} style={[styles.tabBtn, tab === t && { borderBottomColor: BLUE, borderBottomWidth: 2 }]}
            onPress={() => { setTab(t); Haptics.selectionAsync(); }}>
            <Text style={[styles.tabText, { color: tab === t ? BLUE : MUTED }]}>{t}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'Store'    && <StoreTab />}
      {tab === 'Rewards'  && <RewardsTab />}
      {tab === 'Notify'   && <NotifyTab />}
      {tab === 'Managers' && <ManagersTab />}
    </View>
  );
}

const styles = StyleSheet.create({
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 60 },
  emptyText:     { fontSize: 14, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  tabBar:        { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1 },
  tabBtn:        { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText:       { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  section:       { fontSize: 11, fontFamily: 'Inter_700Bold', color: '#8E8E93', letterSpacing: 1.5, marginTop: 4 },
  card:          { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  row:           { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowTitle:      { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' },
  rowSub:        { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93', marginTop: 2, lineHeight: 17 },
  divider:       { height: 1 },
  fieldLabel:    { fontSize: 13, fontFamily: 'Inter_500Medium', color: '#1C1C1E' },
  input:         { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: 'Inter_400Regular', backgroundColor: '#FAFAFA' },
  coordRow:      { flexDirection: 'row', gap: 10 },
  hint:          { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: -6 },
  infoBanner:    { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  infoBannerText:{ flex: 1, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 17 },
  demoRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 10, borderBottomWidth: 1 },
  demoPill:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  demoPillText:  { fontSize: 11, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  demoEmail:     { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' },
  demoPw:        { fontSize: 12, fontFamily: 'Inter_400Regular' },
  saveBtn:       { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:   { color: '#fff', fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  addBtn:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, marginBottom: 4 },
  addBtnText:    { color: '#fff', fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  chip:          { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  chipText:      { fontSize: 12, fontFamily: 'Inter_500Medium' },
  switchRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
  modalTitle:    { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  modalCancel:   { fontSize: 15, fontFamily: 'Inter_400Regular' },
  modalSave:     { fontSize: 15, fontFamily: 'Inter_700Bold' },
  errorText:     { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  rewardHeader:  { flexDirection: 'row', alignItems: 'flex-start' },
  rewardName:    { fontSize: 15, fontFamily: 'Inter_600SemiBold', color: '#1C1C1E' },
  rewardDesc:    { fontSize: 12, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  rewardPts:     { fontSize: 14, fontFamily: 'Inter_700Bold' },
  rewardMeta:    { flexDirection: 'row', gap: 6 },
  rewardMetaText:{ fontSize: 11, fontFamily: 'Inter_400Regular', color: '#8E8E93' },
  rewardActions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  actionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1 },
  actionBtnText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  annHeader:     { flexDirection: 'row', alignItems: 'flex-start' },
  annTitle:      { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#1C1C1E' },
  annBody:       { fontSize: 13, fontFamily: 'Inter_400Regular', color: '#6B7280', lineHeight: 18 },
  annDate:       { fontSize: 11, fontFamily: 'Inter_400Regular', color: '#8E8E93', marginLeft: 'auto' },
});

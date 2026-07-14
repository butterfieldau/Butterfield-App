import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  api,
  type ScheduledNotificationAudienceType,
  type ScheduledNotificationFilters,
  type ScheduledNotificationRecord,
  type ScheduledNotificationStatus,
} from '@/lib/api';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import { useRefreshControl } from '@/hooks/useRefreshControl';
import { BG, CARD, BLUE, NAVY, TEXT, MUTED, BORDER, GREEN, AMBER, RED, PURPLE, PINK, TEAL, ROSE, GOLD, GLASS_BG, GLASS_BORDER } from '@/components/director/directorColors';

type SupportedAudienceType = 'all_customers' | 'loyalty_tier' | 'active_rewards' | 'inactive_customers';

const LIVE_AUDIENCES: {
  type: ScheduledNotificationAudienceType;
  label: string;
  description: string;
  enabled: boolean;
}[] = [
  { type: 'all_customers', label: 'All customers', description: 'Everyone with the customer app', enabled: true },
  { type: 'loyalty_tier', label: 'Loyalty tier', description: 'Blue, Silver, Gold or Black', enabled: true },
  { type: 'active_rewards', label: 'Customers with active rewards', description: 'Customers holding active rewards', enabled: true },
  { type: 'inactive_customers', label: 'Inactive customers', description: 'No recent orders in the last 90 days', enabled: true },
  { type: 'customer_segment', label: 'Customer segment', description: 'Custom behavioural groups', enabled: false },
  { type: 'custom_selected_customers', label: 'Custom selected customers', description: 'Pick exact customers manually', enabled: false },
];

const TIER_OPTIONS = [
  { key: 'blue', label: 'Blue' },
  { key: 'silver', label: 'Silver' },
  { key: 'gold', label: 'Gold' },
  { key: 'black', label: 'Black' },
] as const;

const STATUS_META: Record<ScheduledNotificationStatus, { label: string; bg: string; fg: string }> = {
  draft: { label: 'Draft', bg: '#E5E7EB', fg: '#4B5563' },
  scheduled: { label: 'Scheduled', bg: '#DBEAFE', fg: '#1D4ED8' },
  sent: { label: 'Sent', bg: '#DCFCE7', fg: '#166534' },
  cancelled: { label: 'Cancelled', bg: '#F3F4F6', fg: '#6B7280' },
  failed: { label: 'Failed', bg: '#FEE2E2', fg: '#B91C1C' },
};

type FormState = {
  title: string;
  message: string;
  sendDate: string;
  sendTime: string;
  audienceType: ScheduledNotificationAudienceType;
  loyaltyTier: 'blue' | 'silver' | 'gold' | 'black';
  imageUrl: string;
  imageObjectPath: string;
  actionValue: string;
};

function toDateInput(date: Date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function toTimeInput(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toAudienceLabel(record: ScheduledNotificationRecord) {
  if (record.audienceType === 'all_customers') return 'All customers';
  if (record.audienceType === 'active_rewards') return 'Customers with active rewards';
  if (record.audienceType === 'inactive_customers') return 'Inactive customers';
  if (record.audienceType === 'loyalty_tier') {
    let parsed: ScheduledNotificationFilters = {};
    if (typeof record.audienceFilters === 'string') {
      try {
        parsed = JSON.parse(record.audienceFilters) as ScheduledNotificationFilters;
      } catch {
        parsed = {};
      }
    } else {
      parsed = (record.audienceFilters ?? {}) as ScheduledNotificationFilters;
    }
    const tier = parsed.loyaltyTier ?? 'blue';
    return `Loyalty tier · ${tier.charAt(0).toUpperCase()}${tier.slice(1)}`;
  }
  return 'Coming soon audience';
}

function formatSchedule(dateString: string) {
  const date = new Date(dateString);
  return {
    date: date.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
  };
}

function parseDateInput(value: string) {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }
  return parsed;
}

function buildScheduledAt(sendDate: string, sendTime: string) {
  const date = parseDateInput(sendDate);
  if (!date) return null;
  const timeMatch = sendTime.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!timeMatch) return null;
  const [, hourText, minuteText] = timeMatch;
  const value = new Date(date);
  value.setHours(Number(hourText), Number(minuteText), 0, 0);
  return Number.isNaN(value.getTime()) ? null : value;
}

function getErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'object' && error && 'message' in error && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message;
  }
  return fallback;
}

function emptyFormState(): FormState {
  const defaultDate = new Date(Date.now() + 60 * 60 * 1000);
  return {
    title: '',
    message: '',
    sendDate: toDateInput(defaultDate),
    sendTime: toTimeInput(defaultDate),
    audienceType: 'all_customers',
    loyaltyTier: 'blue',
    imageUrl: '',
    imageObjectPath: '',
    actionValue: '',
  };
}

function ScheduledNotificationCard({
  item,
  onEdit,
  onCancel,
}: {
  item: ScheduledNotificationRecord;
  onEdit: (item: ScheduledNotificationRecord) => void;
  onCancel: (item: ScheduledNotificationRecord) => void;
}) {
  const meta = STATUS_META[item.status];
  const scheduled = formatSchedule(item.scheduledAt);
  const canEdit = item.status === 'draft' || item.status === 'scheduled' || item.status === 'failed';
  const canCancel = item.status === 'draft' || item.status === 'scheduled';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.cardPreview} numberOfLines={2}>{item.message}</Text>
        </View>
        <View style={[styles.statusChip, { backgroundColor: meta.bg }]}>
          <Text style={[styles.statusText, { color: meta.fg }]}>{meta.label}</Text>
        </View>
      </View>

      <View style={styles.metaGrid}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Date</Text>
          <Text style={styles.metaValue}>{scheduled.date}</Text>
        </View>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>Time</Text>
          <Text style={styles.metaValue}>{scheduled.time}</Text>
        </View>
        <View style={[styles.metaItem, { flex: 1.4 }]}>
          <Text style={styles.metaLabel}>Audience</Text>
          <Text style={styles.metaValue}>{toAudienceLabel(item)}</Text>
        </View>
      </View>

      {item.lastError ? (
        <View style={styles.errorBanner}>
          <Feather name="alert-circle" size={14} color={RED} />
          <Text style={styles.errorText} numberOfLines={2}>{item.lastError}</Text>
        </View>
      ) : null}

      {(canEdit || canCancel) ? (
        <View style={styles.actionRow}>
          {canEdit ? (
            <Pressable style={[styles.actionBtn, styles.editBtn]} onPress={() => onEdit(item)}>
              <Feather name="edit-2" size={14} color={BLUE} />
              <Text style={[styles.actionText, { color: BLUE }]}>Edit</Text>
            </Pressable>
          ) : null}
          {canCancel ? (
            <Pressable style={[styles.actionBtn, styles.cancelBtn]} onPress={() => onCancel(item)}>
              <Feather name="slash" size={14} color={RED} />
              <Text style={[styles.actionText, { color: RED }]}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function ScheduleNotificationModal({
  visible,
  editing,
  onClose,
  onSave,
}: {
  visible: boolean;
  editing: ScheduledNotificationRecord | null;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    message: string;
    imageUrl?: string | null;
    imageObjectPath?: string | null;
    actionType?: string | null;
    actionValue?: string | null;
    audienceType: ScheduledNotificationAudienceType;
    audienceFilters?: ScheduledNotificationFilters | null;
    scheduledAt: string;
    status: 'draft' | 'scheduled';
  }, existingId?: string) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(emptyFormState());
  const [savingStatus, setSavingStatus] = useState<'draft' | 'scheduled' | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  React.useEffect(() => {
    if (!visible) return;
    if (!editing) {
      setForm(emptyFormState());
      return;
    }
    const parsedDate = new Date(editing.scheduledAt);
    let filters: ScheduledNotificationFilters = {};
    if (typeof editing.audienceFilters === 'string') {
      try {
        filters = JSON.parse(editing.audienceFilters) as ScheduledNotificationFilters;
      } catch {
        filters = {};
      }
    } else {
      filters = (editing.audienceFilters ?? {}) as ScheduledNotificationFilters;
    }
    setForm({
      title: editing.title,
      message: editing.message,
      sendDate: toDateInput(parsedDate),
      sendTime: toTimeInput(parsedDate),
      audienceType: editing.audienceType,
      loyaltyTier: filters.loyaltyTier ?? 'blue',
      imageUrl: editing.imageUrl ?? '',
      imageObjectPath: editing.imageObjectPath ?? '',
      actionValue: editing.actionValue ?? '',
    });
  }, [editing, visible]);

  const pickImage = async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Photos needed', 'Please allow photo access to upload a notification image.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.85,
        allowsEditing: true,
        aspect: [16, 9],
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const mimeType = asset.mimeType || 'image/jpeg';
      const ext = mimeType.split('/')[1] || 'jpg';
      const filename = `scheduled-notification-${Date.now()}.${ext}`;

      setUploadingImage(true);
      const uploaded = await api.storage.uploadFile(asset.uri, filename, mimeType);
      setForm((current) => ({
        ...current,
        imageUrl: uploaded.servingUrl,
        imageObjectPath: uploaded.objectPath,
      }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      Alert.alert('Upload failed', getErrorMessage(error, 'Could not upload this image.'));
    } finally {
      setUploadingImage(false);
    }
  };

  const submit = async (status: 'draft' | 'scheduled') => {
    const scheduledAt = buildScheduledAt(form.sendDate, form.sendTime);
    if (!form.title.trim()) return Alert.alert('Title needed', 'Please add a notification title.');
    if (!form.message.trim()) return Alert.alert('Message needed', 'Please add the notification message.');
    if (!scheduledAt) return Alert.alert('Invalid date', 'Please use a valid send date and time.');
    if (!LIVE_AUDIENCES.find((item) => item.type === form.audienceType && item.enabled)) {
      return Alert.alert('Audience unavailable', 'That audience is still marked as coming soon.');
    }

    setSavingStatus(status);
    try {
      await onSave({
        title: form.title.trim(),
        message: form.message.trim(),
        imageUrl: form.imageUrl.trim() || null,
        imageObjectPath: form.imageObjectPath.trim() || null,
        actionType: form.actionValue.trim() ? 'link' : null,
        actionValue: form.actionValue.trim() || null,
        audienceType: form.audienceType,
        audienceFilters: form.audienceType === 'loyalty_tier'
          ? { loyaltyTier: form.loyaltyTier }
          : form.audienceType === 'inactive_customers'
            ? { inactiveDays: 90 }
            : null,
        scheduledAt: scheduledAt.toISOString(),
        status,
      }, editing?.id);
      onClose();
    } catch (error) {
      Alert.alert('Could not save', getErrorMessage(error));
    } finally {
      setSavingStatus(null);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalWrap}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editing ? 'Edit Scheduled Notification' : 'Schedule Notification'}</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={18} color={MUTED} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ gap: 14, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Notification title</Text>
              <TextInput
                value={form.title}
                onChangeText={(title) => setForm((current) => ({ ...current, title }))}
                placeholder="New loyalty reward available"
                placeholderTextColor={MUTED}
                style={styles.input}
              />
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Notification message</Text>
              <TextInput
                value={form.message}
                onChangeText={(message) => setForm((current) => ({ ...current, message }))}
                placeholder="Let customers know what’s happening."
                placeholderTextColor={MUTED}
                multiline
                style={[styles.input, styles.textarea]}
              />
            </View>

            <View style={styles.rowFields}>
              <View style={[styles.fieldWrap, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>Send date</Text>
                <TextInput
                  value={form.sendDate}
                  onChangeText={(sendDate) => setForm((current) => ({ ...current, sendDate }))}
                  placeholder="DD/MM/YYYY"
                  placeholderTextColor={MUTED}
                  style={styles.input}
                />
              </View>
              <View style={[styles.fieldWrap, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>Send time</Text>
                <TextInput
                  value={form.sendTime}
                  onChangeText={(sendTime) => setForm((current) => ({ ...current, sendTime }))}
                  placeholder="HH:MM"
                  placeholderTextColor={MUTED}
                  style={styles.input}
                />
              </View>
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Audience</Text>
              <View style={styles.audienceList}>
                {LIVE_AUDIENCES.map((item) => {
                  const active = form.audienceType === item.type;
                  return (
                    <Pressable
                      key={item.type}
                      onPress={() => item.enabled && setForm((current) => ({ ...current, audienceType: item.type }))}
                      style={[
                        styles.audienceCard,
                        active && item.enabled ? styles.audienceCardActive : null,
                        !item.enabled ? styles.audienceCardDisabled : null,
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={styles.audienceTitleRow}>
                          <Text style={[styles.audienceTitle, active && item.enabled ? { color: BLUE } : null]}>
                            {item.label}
                          </Text>
                          {!item.enabled ? (
                            <View style={styles.comingSoonChip}>
                              <Text style={styles.comingSoonText}>Coming soon</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.audienceDescription}>{item.description}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {form.audienceType === 'loyalty_tier' ? (
              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>Tier</Text>
                <View style={styles.tierRow}>
                  {TIER_OPTIONS.map((tier) => {
                    const active = form.loyaltyTier === tier.key;
                    return (
                      <Pressable
                        key={tier.key}
                        onPress={() => setForm((current) => ({ ...current, loyaltyTier: tier.key }))}
                        style={[styles.tierChip, active ? styles.tierChipActive : null]}
                      >
                        <Text style={[styles.tierChipText, active ? { color: '#fff' } : null]}>{tier.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Image (optional)</Text>
              <Pressable style={styles.uploadBtn} onPress={pickImage} disabled={uploadingImage}>
                {uploadingImage ? <ActivityIndicator color={BLUE} /> : <Feather name="upload" size={16} color={BLUE} />}
                <Text style={styles.uploadBtnText}>
                  {form.imageUrl ? 'Replace image' : 'Upload image'}
                </Text>
              </Pressable>
              {form.imageUrl ? (
                <View style={styles.imagePreviewCard}>
                  <Image source={{ uri: form.imageUrl }} style={styles.imagePreview} resizeMode="cover" />
                  <Pressable
                    onPress={() => setForm((current) => ({ ...current, imageUrl: '', imageObjectPath: '' }))}
                    style={styles.removeImageBtn}
                  >
                    <Feather name="trash-2" size={14} color={RED} />
                    <Text style={styles.removeImageText}>Remove image</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Action link (optional)</Text>
              <TextInput
                value={form.actionValue}
                onChangeText={(actionValue) => setForm((current) => ({ ...current, actionValue }))}
                placeholder="https://... or app link"
                placeholderTextColor={MUTED}
                autoCapitalize="none"
                style={styles.input}
              />
            </View>
          </ScrollView>

          <View style={styles.modalFooter}>
            <Pressable style={[styles.footerBtn, styles.draftBtn]} onPress={() => submit('draft')} disabled={savingStatus !== null}>
              {savingStatus === 'draft' ? <ActivityIndicator color={MUTED} /> : <Text style={[styles.footerBtnText, { color: TEXT }]}>Save Draft</Text>}
            </Pressable>
            <Pressable style={[styles.footerBtn, styles.scheduleBtn]} onPress={() => submit('scheduled')} disabled={savingStatus !== null}>
              {savingStatus === 'scheduled' ? <ActivityIndicator color="#fff" /> : <Text style={[styles.footerBtnText, { color: '#fff' }]}>Schedule</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SectionBlock({
  title,
  items,
  empty,
  onEdit,
  onCancel,
}: {
  title: string;
  items: ScheduledNotificationRecord[];
  empty: string;
  onEdit: (item: ScheduledNotificationRecord) => void;
  onCancel: (item: ScheduledNotificationRecord) => void;
}) {
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.countChip}>
          <Text style={styles.countChipText}>{items.length}</Text>
        </View>
      </View>
      {items.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>{empty}</Text>
        </View>
      ) : (
        items.map((item) => (
          <ScheduledNotificationCard key={item.id} item={item} onEdit={onEdit} onCancel={onCancel} />
        ))
      )}
    </View>
  );
}

export default function ScheduledNotificationsSettingsPage() {
  const qc = useQueryClient();
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<ScheduledNotificationRecord | null>(null);

  const query = useQuery({
    queryKey: ['scheduled-notifications'],
    queryFn: () => api.notifications.scheduled(),
  });
  const { refreshing, onRefresh } = useRefreshControl(query.refetch);

  const saveMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id?: string;
      payload: {
        title: string;
        message: string;
        imageUrl?: string | null;
        imageObjectPath?: string | null;
        actionType?: string | null;
        actionValue?: string | null;
        audienceType: ScheduledNotificationAudienceType;
        audienceFilters?: ScheduledNotificationFilters | null;
        scheduledAt: string;
        status: 'draft' | 'scheduled';
      };
    }) => {
      if (id) return api.notifications.updateScheduled(id, payload);
      return api.notifications.createScheduled(payload);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['scheduled-notifications'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.notifications.cancelScheduled(id),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['scheduled-notifications'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    },
  });

  const notifications: ScheduledNotificationRecord[] = query.data?.data ?? [];
  const sections = useMemo(() => {
    const scheduled = notifications.filter((item) => item.status === 'scheduled')
      .sort((a: ScheduledNotificationRecord, b: ScheduledNotificationRecord) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
    return {
      upcoming: scheduled,
      draft: notifications.filter((item) => item.status === 'draft').sort((a: ScheduledNotificationRecord, b: ScheduledNotificationRecord) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
      sent: notifications.filter((item) => item.status === 'sent').sort((a: ScheduledNotificationRecord, b: ScheduledNotificationRecord) => new Date(b.sentAt ?? b.updatedAt).getTime() - new Date(a.sentAt ?? a.updatedAt).getTime()),
      cancelled: notifications.filter((item) => item.status === 'cancelled').sort((a: ScheduledNotificationRecord, b: ScheduledNotificationRecord) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
      failed: notifications.filter((item) => item.status === 'failed').sort((a: ScheduledNotificationRecord, b: ScheduledNotificationRecord) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    };
  }, [notifications]);

  const openNew = () => {
    setEditing(null);
    setModalVisible(true);
  };

  const openEdit = (item: ScheduledNotificationRecord) => {
    setEditing(item);
    setModalVisible(true);
  };

  const confirmCancel = (item: ScheduledNotificationRecord) => {
    Alert.alert(
      'Cancel scheduled notification',
      `"${item.title}" will stay in history as cancelled and won’t send.`,
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel notification',
          style: 'destructive',
          onPress: () => cancelMutation.mutate(item.id),
        },
      ],
    );
  };

  return (
    <DirectorStandaloneScreen
      title="Scheduled Notifications"
      subtitle="Plan customer pushes ahead without touching your live send screen."
      headerRight={
        <Pressable style={styles.scheduleFabInline} onPress={openNew}>
          <Feather name="plus" size={16} color="#fff" />
          <Text style={styles.scheduleFabInlineText}>Schedule</Text>
        </Pressable>
      }
    >
      {query.isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={BLUE} />
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, backgroundColor: BG }}
          contentContainerStyle={styles.container}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BLUE} />}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.infoCard}>
            <Feather name="clock" size={16} color={BLUE} />
            <Text style={styles.infoText}>
              Scheduled notifications wait quietly until their selected send time. Immediate Push Notifications still work separately.
            </Text>
          </View>

          <SectionBlock
            title="Upcoming scheduled notifications"
            items={sections.upcoming}
            empty="Nothing queued yet."
            onEdit={openEdit}
            onCancel={confirmCancel}
          />
          <SectionBlock
            title="Draft scheduled notifications"
            items={sections.draft}
            empty="No drafts saved."
            onEdit={openEdit}
            onCancel={confirmCancel}
          />
          <SectionBlock
            title="Sent scheduled notifications"
            items={sections.sent}
            empty="Nothing sent from this screen yet."
            onEdit={openEdit}
            onCancel={confirmCancel}
          />
          <SectionBlock
            title="Cancelled notifications"
            items={sections.cancelled}
            empty="No cancelled notifications."
            onEdit={openEdit}
            onCancel={confirmCancel}
          />
          <SectionBlock
            title="Failed notifications"
            items={sections.failed}
            empty="No failed notifications."
            onEdit={openEdit}
            onCancel={confirmCancel}
          />
        </ScrollView>
      )}

      <ScheduleNotificationModal
        visible={modalVisible}
        editing={editing}
        onClose={() => setModalVisible(false)}
        onSave={async (payload, existingId) => {
          await saveMutation.mutateAsync({ id: existingId, payload });
        }}
      />
    </DirectorStandaloneScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
    paddingBottom: 120,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
  },
  infoCard: {
    flexDirection: 'row',
    gap: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#EBF8FF',
    borderWidth: 1,
    borderColor: `${BLUE}40`,
    alignItems: 'flex-start',
  },
  infoText: {
    flex: 1,
    color: BLUE,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 2,
    color: MUTED,
    textTransform: 'uppercase',
  },
  countChip: {
    minWidth: 28,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
  },
  countChipText: {
    color: TEXT,
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  cardHeader: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  cardTitle: {
    color: TEXT,
    fontSize: 18,
    fontWeight: '700',
  },
  cardPreview: {
    color: MUTED,
    fontSize: 14,
    lineHeight: 20,
  },
  statusChip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metaGrid: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  metaItem: {
    minWidth: 88,
    gap: 3,
  },
  metaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  metaValue: {
    fontSize: 14,
    color: TEXT,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  editBtn: {
    backgroundColor: '#EBF8FF',
    borderColor: `${BLUE}40`,
  },
  cancelBtn: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.85)',
    padding: 18,
  },
  emptyText: {
    color: MUTED,
    fontSize: 14,
  },
  modalWrap: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.38)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: CARD,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 24,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    color: TEXT,
    fontSize: 22,
    fontWeight: '700',
    flex: 1,
    marginRight: 12,
  },
  closeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldWrap: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: TEXT,
    fontSize: 15,
  },
  textarea: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  uploadBtn: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: `${BLUE}30`,
    backgroundColor: '#EBF8FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },
  uploadBtnText: {
    color: BLUE,
    fontSize: 14,
    fontWeight: '700',
  },
  imagePreviewCard: {
    gap: 10,
    marginTop: 4,
  },
  imagePreview: {
    width: '100%',
    height: 140,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  removeImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  removeImageText: {
    color: RED,
    fontSize: 13,
    fontWeight: '700',
  },
  rowFields: {
    flexDirection: 'row',
    gap: 10,
  },
  audienceList: {
    gap: 10,
  },
  audienceCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    backgroundColor: '#F9FAFB',
  },
  audienceCardActive: {
    borderColor: `${BLUE}55`,
    backgroundColor: '#EBF8FF',
  },
  audienceCardDisabled: {
    opacity: 0.72,
  },
  audienceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    justifyContent: 'space-between',
  },
  audienceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: TEXT,
    flex: 1,
  },
  audienceDescription: {
    marginTop: 3,
    color: MUTED,
    fontSize: 13,
    lineHeight: 18,
  },
  comingSoonChip: {
    borderRadius: 999,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  comingSoonText: {
    color: MUTED,
    fontSize: 11,
    fontWeight: '700',
  },
  tierRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  tierChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F9FAFB',
  },
  tierChipActive: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  tierChipText: {
    color: TEXT,
    fontSize: 13,
    fontWeight: '700',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  footerBtn: {
    flex: 1,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  draftBtn: {
    backgroundColor: '#E0E7FF',
  },
  scheduleBtn: {
    backgroundColor: BLUE,
  },
  footerBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  scheduleFabInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BLUE,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  scheduleFabInlineText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  errorBanner: {
    borderRadius: 14,
    padding: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  errorText: {
    color: RED,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
});

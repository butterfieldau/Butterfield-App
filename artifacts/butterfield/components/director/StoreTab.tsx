import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Pressable, ScrollView, Text, TextInput, View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

function getErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}
import { styles } from './settingsStyles';

const BLUE   = '#1493FF';
const BORDER = '#E5E7EB';
const MUTED  = '#8E8E93';
const TEXT   = '#1C1C1E';
const RED    = '#EF4444';

export function StoreTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['director-settings'],
    queryFn: () => api.director.settings(),
  });
  const settings = data?.data ?? {};
  const [saving,           setSaving]           = useState(false);
  const [welcomeBg,        setWelcomeBg]        = useState('');
  const [uploadingWelcome, setUploadingWelcome] = useState(false);

  useEffect(() => {
    if (settings) {
      setWelcomeBg(settings.welcome_background ?? '');
    }
  }, [data]);

  const pickWelcomeBg = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('Permission needed', 'Allow photo library access to upload a welcome background.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
      aspect: [9, 16],
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const filename = `welcome-bg-${Date.now()}.jpg`;
    setUploadingWelcome(true);
    try {
      const upload = await api.storage.uploadFile(asset.uri, filename, asset.mimeType ?? 'image/jpeg');
      const url = upload.servingUrl;
      setWelcomeBg(url);
      await api.director.updateSettings({ welcome_background: url });
      await qc.invalidateQueries({ queryKey: ['director-settings', 'welcome-config'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Uploaded', 'Welcome screen background updated.');
    } catch (e) {
      Alert.alert('Upload failed', getErrorMessage(e));
    } finally { setUploadingWelcome(false); }
  };

  const save = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await api.director.updateSettings({ welcome_background: welcomeBg.trim() });
      await qc.invalidateQueries({ queryKey: ['director-settings'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Settings updated successfully.');
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally { setSaving(false); }
  };

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
      <Text style={styles.section}>STORE</Text>
      <View style={styles.card}>
        <View style={[styles.infoBanner, { backgroundColor: '#F8FAFC', borderColor: BORDER }]}>
          <Feather name="map-pin" size={13} color={BLUE} />
          <Text style={[styles.infoBannerText, { color: TEXT }]}>
            Store printers, opening hours, pickup settings, geofence, notes, and contact details now live inside each individual store editor.
          </Text>
        </View>
      </View>

      <Text style={styles.section}>WELCOME SCREEN</Text>
      <View style={styles.card}>
        <View style={[styles.infoBanner, { backgroundColor: '#F0F4FF', borderColor: BLUE + '30' }]}>
          <Feather name="smartphone" size={13} color={BLUE} />
          <Text style={[styles.infoBannerText, { color: BLUE }]}>
            The background image shown on the welcome/launch screen before customers log in.
          </Text>
        </View>
        {welcomeBg ? (
          <Image source={{ uri: welcomeBg }} style={{ width: '100%', height: 160, borderRadius: 10 }} resizeMode="cover" />
        ) : null}
        <Pressable
          onPress={pickWelcomeBg}
          disabled={uploadingWelcome}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: BLUE, backgroundColor: BLUE + '08' }}
        >
          {uploadingWelcome
            ? <ActivityIndicator size="small" color={BLUE} />
            : <Feather name="upload" size={15} color={BLUE} />
          }
          <Text style={{ fontWeight: '600', fontSize: 14, color: BLUE }}>
            {uploadingWelcome ? 'Uploading…' : welcomeBg ? 'Replace Background' : 'Upload Background Photo'}
          </Text>
        </Pressable>
        {welcomeBg ? (
          <Pressable
            onPress={() => { setWelcomeBg(''); api.director.updateSettings({ welcome_background: '' }).catch(() => {}); }}
            style={{ alignItems: 'center', paddingVertical: 6 }}
          >
            <Text style={{ fontWeight: '400', fontSize: 13, color: RED }}>Remove background image</Text>
          </Pressable>
        ) : null}
        <View style={{ gap: 4 }}>
          <Text style={styles.fieldLabel}>Or paste an image URL</Text>
          <TextInput
            style={[styles.input, { borderColor: BORDER, color: TEXT }]}
            value={welcomeBg}
            onChangeText={setWelcomeBg}
            placeholder="https://... (optional — leave blank for gradient)"
            placeholderTextColor={MUTED}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </View>
      </View>

      <Pressable onPress={save} disabled={saving}
        style={[styles.saveBtn, { backgroundColor: BLUE, opacity: saving ? 0.8 : 1 }]}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Settings</Text>}
      </Pressable>
    </ScrollView>
  );
}

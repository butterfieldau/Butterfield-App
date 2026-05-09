import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface AvatarPickerProps {
  initial: string;
  size?: number;
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
}

export function AvatarPicker({
  initial,
  size = 60,
  bgColor = 'rgba(255,255,255,0.22)',
  textColor = '#fff',
  borderColor,
}: AvatarPickerProps) {
  const [uploading, setUploading] = useState(false);
  const qc = useQueryClient();

  const { data: meData } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.auth.me(),
    retry: 1,
  });

  const photoUrl = (meData?.user as any)?.profileImage as string | null | undefined;
  const radius = size / 2;
  const fontSize = Math.round(size * 0.38);

  const doUpload = async (fromCamera: boolean) => {
    try {
      const permResult = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permResult.status !== 'granted') {
        Alert.alert(
          'Permission required',
          `Please allow ${fromCamera ? 'camera' : 'photo library'} access in Settings.`,
        );
        return;
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const filename = asset.fileName ?? asset.uri.split('/').pop() ?? 'avatar.jpg';
      const contentType = asset.mimeType ?? 'image/jpeg';

      setUploading(true);
      const { servingUrl } = await api.storage.uploadFile(asset.uri, filename, contentType);
      await api.auth.updateMe({ profileImage: servingUrl });
      qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Could not upload photo');
    } finally {
      setUploading(false);
    }
  };

  const doRemove = async () => {
    try {
      setUploading(true);
      await api.auth.updateMe({ profileImage: null });
      qc.invalidateQueries({ queryKey: ['me'] });
    } catch (e: any) {
      Alert.alert('Error', e.message);
    } finally {
      setUploading(false);
    }
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const options: any[] = [
      { text: 'Take Photo', onPress: () => doUpload(true) },
      { text: 'Choose from Library', onPress: () => doUpload(false) },
    ];
    if (photoUrl) {
      options.push({ text: 'Remove Photo', style: 'destructive', onPress: doRemove });
    }
    options.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert('Profile Photo', 'Choose an option', options);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={uploading}
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: bgColor,
          borderWidth: borderColor ? 2 : 0,
          borderColor: borderColor ?? 'transparent',
        },
      ]}
    >
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.initial, { fontSize, color: textColor }]}>{initial}</Text>
      )}

      {uploading ? (
        <View style={[StyleSheet.absoluteFill, styles.loadingOverlay, { borderRadius: radius }]}>
          <ActivityIndicator color="#fff" size="small" />
        </View>
      ) : (
        <View style={[styles.badge, { bottom: size * 0.03, right: size * 0.03 }]}>
          <Feather name="camera" size={Math.max(8, Math.round(size * 0.22))} color="#fff" />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container:    { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initial:      { fontFamily: 'Inter_700Bold' },
  loadingOverlay: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  badge: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
  },
});

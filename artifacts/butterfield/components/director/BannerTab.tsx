import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

function getErrorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}
import type { DirectorProduct, HomeBannerCarouselConfig, HomeBannerSlide } from '@/lib/api';
import { styles } from './settingsStyles';
import SlideEditor from './SlideEditor';

const BLUE = '#1493FF';
const MAX_SLIDES = 8;

function makeBlankSlide(idx: number): HomeBannerSlide {
  return {
    id: `slide-${Date.now()}-${idx}`,
    isActive: true,
    sortOrder: idx,
    headline: '',
    headlineAccent: '',
    subtext: '',
    buttonText: 'Order Now',
    buttonRoute: 'menu',
    buttonUrl: '',
    imageUrl: '',
    activeFrom: undefined,
    activeUntil: undefined,
  };
}

export function BannerTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['director-home-banner'],
    queryFn:  () => api.director.homeBanner(),
  });

  const [slides, setSlides] = useState<HomeBannerSlide[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingSlideId, setUploadingSlideId] = useState<string | null>(null);
  const [productFetchEnabled, setProductFetchEnabled] = useState(false);

  const { data: productsData, isLoading: loadingProducts } = useQuery({
    queryKey: ['director-all-products-banner'],
    queryFn:  () => api.director.products(),
    enabled:  productFetchEnabled,
    staleTime: 60_000,
  });
  const allProducts: DirectorProduct[] = productsData?.data ?? [];

  useEffect(() => {
    const serverSlides = data?.data?.slides;
    if (serverSlides) {
      setSlides(serverSlides.length > 0 ? serverSlides : [makeBlankSlide(0)]);
    }
  }, [data]);

  const updateSlide = (id: string, updated: HomeBannerSlide) => {
    setSlides(prev => prev.map(s => s.id === id ? updated : s));
  };

  const moveSlide = (idx: number, dir: 'up' | 'down') => {
    setSlides(prev => {
      const next = [...prev];
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= next.length) return prev;
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next.map((s, i) => ({ ...s, sortOrder: i }));
    });
    Haptics.selectionAsync();
  };

  const removeSlide = (id: string) => {
    setSlides(prev => {
      const filtered = prev.filter(s => s.id !== id);
      return filtered.length > 0 ? filtered.map((s, i) => ({ ...s, sortOrder: i })) : [makeBlankSlide(0)];
    });
  };

  const addSlide = () => {
    setSlides(prev => {
      if (prev.length >= MAX_SLIDES) return prev;
      return [...prev, makeBlankSlide(prev.length)];
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const uploadImageForSlide = async (slideId: string) => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo access to upload a banner image.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      aspect: [4, 5],
      quality: 0.85,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const ext  = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    const name = `banner-${Date.now()}.${ext}`;
    setUploadingSlideId(slideId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const { servingUrl } = await api.storage.uploadFile(asset.uri, name, mime);
      setSlides(prev => prev.map(s => s.id === slideId ? { ...s, imageUrl: servingUrl } : s));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Upload failed', getErrorMessage(e, 'Could not upload image.'));
    } finally { setUploadingSlideId(null); }
  };

  const save = async () => {
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const payload: HomeBannerCarouselConfig = {
        slides: slides.map((s, i) => ({
          ...s,
          sortOrder: i,
          imageUrl:       s.imageUrl?.trim()       || undefined,
          headline:       s.headline?.trim()        || undefined,
          headlineAccent: s.headlineAccent?.trim()  || undefined,
          subtext:        s.subtext?.trim()         || undefined,
          buttonText:     s.buttonText?.trim()      || 'Order Now',
          buttonRoute:    (s.buttonRoute === '__product__' || !s.buttonRoute) ? 'menu' : s.buttonRoute,
          buttonUrl:      s.buttonUrl?.trim()       || undefined,
        })),
      };
      await api.director.updateHomeBanner(payload);
      await qc.invalidateQueries({ queryKey: ['director-home-banner'] });
      await qc.invalidateQueries({ queryKey: ['home-banner'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const activeCount = slides.filter(s => s.isActive).length;
      Alert.alert('Saved', `Banner updated. ${activeCount} slide${activeCount !== 1 ? 's' : ''} now showing to customers.`);
    } catch (e) {
      Alert.alert('Error', getErrorMessage(e));
    } finally { setSaving(false); }
  };

  if (isLoading) return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 100 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: '#EBF8FF', borderColor: BLUE + '40' }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Feather name="layers" size={14} color={BLUE} />
            <Text style={{ flex: 1, fontSize: 13, fontWeight: '400', color: BLUE, lineHeight: 18 }}>
              The hero banner is a full-screen carousel at the top of the customer home screen. Add up to {MAX_SLIDES} slides — each with its own image, headline, and call-to-action. Slides auto-advance every 5 seconds.
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 }}>
          <Text style={[styles.section, { marginBottom: 0 }]}>SLIDES ({slides.length}/{MAX_SLIDES})</Text>
          {slides.length < MAX_SLIDES && (
            <Pressable onPress={addSlide}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BLUE, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 }}>
              <Feather name="plus" size={14} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>Add Slide</Text>
            </Pressable>
          )}
        </View>

        {slides.map((slide, index) => (
          <SlideEditor
            key={slide.id}
            slide={slide}
            index={index}
            total={slides.length}
            allProducts={allProducts}
            loadingProducts={loadingProducts}
            uploading={uploadingSlideId === slide.id}
            onChange={updated => updateSlide(slide.id, updated)}
            onMoveUp={() => moveSlide(index, 'up')}
            onMoveDown={() => moveSlide(index, 'down')}
            onRemove={() => removeSlide(slide.id)}
            onUploadImage={id => uploadImageForSlide(id)}
            onProductPickerOpen={() => setProductFetchEnabled(true)}
          />
        ))}

        <Pressable onPress={save} disabled={saving}
          style={[styles.saveBtn, { backgroundColor: BLUE, opacity: saving ? 0.8 : 1 }]}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save Banner</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

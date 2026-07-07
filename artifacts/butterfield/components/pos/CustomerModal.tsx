import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { api } from '@/lib/api';
import type { PosCustomerResult } from '@/lib/api';
import { useOffline } from '@/context/OfflineContext';
import { searchCustomerCache, upsertCustomerCache } from '@/lib/posCache';
import type { CachedPosCustomer } from '@/lib/posCache';
import styles from './posStyles';
import { BLUE, DARK, MUTED, MID, STAMP_GOAL, WHITE } from './types';
import type { AttachedCustomer, AttachedCustomerClaimedReward } from './types';

export default function CustomerModal({
  currentCustomer, onSelect, onRemove, onClose, onApplyClaimedReward, initialMode = 'search', recentBalances = {},
}: {
  currentCustomer: AttachedCustomer | null;
  onSelect: (c: AttachedCustomer) => void;
  onRemove: () => void;
  onClose: () => void;
  onApplyClaimedReward?: (cr: AttachedCustomerClaimedReward) => void;
  initialMode?: 'search' | 'scan';
  recentBalances?: Record<string, { loyaltyPoints: number; stampCount: number; freeCoffeeRewards: number }>;
}) {
  const { isOnline } = useOffline();
  const [mode, setMode]       = useState<'search' | 'scan'>(initialMode);
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState<PosCustomerResult[]>([]);
  const [cachedResults, setCachedResults] = useState<CachedPosCustomer[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingCustomerId, setLoadingCustomerId] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const lastScanAt = useRef<number>(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    searchCustomerCache('').then(setCachedResults).catch(() => {});
  }, []);

  // Auto-request camera permission whenever we're in scan mode and don't have it yet
  useEffect(() => {
    if (mode === 'scan' && permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [mode, permission, requestPermission]);

  useEffect(() => {
    if (!isOnline) {
      searchCustomerCache(query).then(setCachedResults).catch(() => {});
      return;
    }
    if (query.trim().length < 2) { setResults([]); return; }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.pos.customerSearch({ q: query.trim() });
        setResults(res.data);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, isOnline]);

  const handleQrScan = useCallback(async ({ data }: { data: string }) => {
    if (!data.startsWith('BUTTERFIELD:')) return;
    const now = Date.now();
    if (now - lastScanAt.current < 2000) return;
    lastScanAt.current = now;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const res = await api.pos.customerSearch({ qrPayload: data });
      if (res.data.length > 0) {
        const c = res.data[0]!;
        const customer: AttachedCustomer = {
          userId: c.userId, name: c.name, email: c.email,
          loyaltyPoints: c.loyaltyPoints, stampCount: c.stampCount,
          stampGoal: c.stampGoal ?? STAMP_GOAL,
          loyaltyTier: c.loyaltyTier, freeCoffeeRewards: c.freeCoffeeRewards ?? 0,
          birthday: c.birthday ?? null,
          availableClaimedRewards: c.availableClaimedRewards ?? [],
        };
        onSelect(customer);
        Alert.alert(`✓ ${c.name} attached`, `${c.loyaltyPoints} pts · ${c.stampCount}/${c.stampGoal ?? STAMP_GOAL} stamps`);
      } else {
        Alert.alert('Not Found', 'Customer not found for this QR code.');
      }
    } catch {
      Alert.alert('Error', 'Could not look up customer.');
    }
  }, [onSelect]);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.customiseRoot}>
        <View style={styles.sheetHeader}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={DARK} />
          </Pressable>
          <Text style={styles.sheetTitle}>Attach Customer</Text>
          <View style={{ width: 22 }} />
        </View>

        {currentCustomer && (
          <View style={styles.currentCustomerCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.customerName}>{currentCustomer.name}</Text>
              <Text style={styles.customerSub}>
                {currentCustomer.loyaltyPoints} pts · {currentCustomer.stampCount}/{currentCustomer.stampGoal ?? STAMP_GOAL} stamps
              </Text>
              {(currentCustomer.availableClaimedRewards?.length ?? 0) > 0 && (
                <View style={{ marginTop: 8, gap: 6 }}>
                  <Text style={[styles.customerSub, { fontWeight: '600', color: BLUE }]}>
                    Rewards wallet ({currentCustomer.availableClaimedRewards.length})
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {currentCustomer.availableClaimedRewards.map(cr => (
                      <Pressable
                        key={cr.id}
                        onPress={() => { onApplyClaimedReward?.(cr); onClose(); }}
                        style={{
                          backgroundColor: '#1A3A5C',
                          borderRadius: 8,
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Text style={{ fontSize: 13, color: WHITE }}>
                          {cr.voucherValueCents
                            ? `🎁 $${(cr.voucherValueCents / 100).toFixed(0)} voucher`
                            : `🎁 ${cr.rewardName}`}
                        </Text>
                        <Text style={{ fontSize: 11, color: MUTED }}>tap to apply</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              )}
            </View>
            <Pressable onPress={onRemove} style={[styles.removeCustomerBtn, { alignSelf: 'flex-start' }]}>
              <Text style={styles.removeCustomerText}>Remove</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.modeRow}>
          <Pressable onPress={() => setMode('search')} style={[styles.modeBtn, mode === 'search' && styles.modeBtnActive]}>
            <Feather name="search" size={16} color={mode === 'search' ? BLUE : MID} />
            <Text style={[styles.modeBtnText, mode === 'search' && { color: BLUE }]}>Search</Text>
          </Pressable>
          <Pressable
            onPress={async () => {
              if (!permission?.granted) await requestPermission();
              setMode('scan');
            }}
            style={[styles.modeBtn, mode === 'scan' && styles.modeBtnActive]}
          >
            <Feather name="maximize" size={16} color={mode === 'scan' ? BLUE : MID} />
            <Text style={[styles.modeBtnText, mode === 'scan' && { color: BLUE }]}>Scan QR</Text>
          </Pressable>
        </View>

        {mode === 'search' && (
          <View style={{ flex: 1 }}>
            {!isOnline && (
              <View style={styles.offlineCacheNotice}>
                <Feather name="wifi-off" size={13} color="#92400E" />
                <Text style={styles.offlineCacheNoticeText}>Offline — showing recently seen customers</Text>
              </View>
            )}
            <View style={[styles.searchInputWrap, { margin: 12 }]}>
              <Feather name="search" size={16} color={MUTED} style={{ marginRight: 6 }} />
              <TextInput
                style={styles.searchInput}
                placeholder={isOnline ? "Name, email, phone or referral code…" : "Search cached customers…"}
                placeholderTextColor={MUTED}
                value={query}
                onChangeText={setQuery}
                autoFocus
              />
              {searching && <ActivityIndicator size="small" color={BLUE} />}
            </View>
            {isOnline ? (
              <FlatList
                data={results}
                keyExtractor={item => item.userId}
                renderItem={({ item }) => {
                  const isLoadingThis = loadingCustomerId === item.userId;
                  return (
                    <TouchableOpacity
                      onPress={async () => {
                        if (loadingCustomerId) return;
                        setLoadingCustomerId(item.userId);
                        try {
                          const res = await api.pos.customerSearch({ userId: item.userId });
                          const live = res.data[0];
                          if (live) {
                            upsertCustomerCache(live).catch(() => {});
                            onSelect({
                              userId: live.userId, name: live.name, email: live.email,
                              loyaltyPoints: live.loyaltyPoints, stampCount: live.stampCount,
                              stampGoal: live.stampGoal ?? STAMP_GOAL,
                              loyaltyTier: live.loyaltyTier,
                              freeCoffeeRewards: live.freeCoffeeRewards ?? 0,
                              birthday: live.birthday ?? null,
                              availableClaimedRewards: live.availableClaimedRewards ?? [],
                            });
                          } else {
                            throw new Error('No data returned');
                          }
                        } catch {
                          const recent = recentBalances[item.userId];
                          onSelect({
                            userId: item.userId, name: item.name, email: item.email,
                            loyaltyPoints: recent?.loyaltyPoints ?? item.loyaltyPoints,
                            stampCount: recent?.stampCount ?? item.stampCount,
                            stampGoal: item.stampGoal ?? STAMP_GOAL,
                            loyaltyTier: item.loyaltyTier,
                            freeCoffeeRewards: recent?.freeCoffeeRewards ?? item.freeCoffeeRewards ?? 0,
                            birthday: item.birthday ?? null,
                            availableClaimedRewards: item.availableClaimedRewards ?? [],
                          });
                          Alert.alert('Balance may not be current', 'Could not refresh loyalty balance — showing last known value. Verify with the customer.');
                        } finally {
                          setLoadingCustomerId(null);
                        }
                      }}
                      style={styles.customerResultRow}
                      activeOpacity={0.7}
                      disabled={!!loadingCustomerId}
                    >
                      <View style={styles.customerAvatar}>
                        <Text style={styles.customerAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.customerName}>{item.name}</Text>
                        <Text style={styles.customerSub}>{item.email} · {item.loyaltyPoints} pts</Text>
                      </View>
                      {isLoadingThis
                        ? <ActivityIndicator size="small" color={BLUE} />
                        : <Feather name="chevron-right" size={16} color={MUTED} />}
                    </TouchableOpacity>
                  );
                }}
                ListEmptyComponent={
                  query.length >= 2 && !searching
                    ? <Text style={{ textAlign: 'center', color: MUTED, padding: 24 }}>No customers found</Text>
                    : null
                }
              />
            ) : (
              <FlatList
                data={cachedResults}
                keyExtractor={item => item.userId}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => onSelect({
                      userId: item.userId, name: item.name, email: item.email,
                      loyaltyPoints: item.loyaltyPoints, stampCount: item.stampCount,
                      stampGoal: item.stampGoal ?? STAMP_GOAL,
                      loyaltyTier: item.loyaltyTier, freeCoffeeRewards: item.freeCoffeeRewards ?? 0,
                      birthday: item.birthday ?? null,
                      availableClaimedRewards: item.availableClaimedRewards ?? [],
                    })}
                    style={styles.customerResultRow}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.customerAvatar, { backgroundColor: '#D97706' }]}>
                      <Text style={styles.customerAvatarText}>{item.name.charAt(0).toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.customerName}>{item.name}</Text>
                      <Text style={styles.customerSub}>{item.email} · {item.loyaltyPoints} pts (offline — points may differ)</Text>
                    </View>
                    <Feather name="chevron-right" size={16} color={MUTED} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={{ textAlign: 'center', color: MUTED, padding: 24 }}>No cached customers</Text>
                }
              />
            )}
          </View>
        )}

        {mode === 'scan' && (
          <View style={{ flex: 1 }}>
            {permission?.granted ? (
              <CameraView
                style={{ flex: 1, margin: 12, borderRadius: 12, overflow: 'hidden' }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                onBarcodeScanned={handleQrScan}
              />
            ) : (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
                <Feather name="camera-off" size={48} color={MUTED} />
                <Text style={{ color: MID, textAlign: 'center' }}>Camera access required to scan QR codes</Text>
                <Pressable onPress={requestPermission} style={styles.presetBtn}>
                  <Text style={styles.presetBtnText}>Grant Permission</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}
      </View>
    </Modal>
  );
}


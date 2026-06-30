import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import styles from './posStyles';
import { BLUE, CHERRY, MID, MUTED, WHITE } from './types';
import { useSidebarCollapsed } from '@/context/SidebarCollapsedContext';

export default function PosHeader({
  isOnline,
  pendingCount,
  printStatusMap,
  heldCount,
  showSearch,
  syncingAll,
  cashEnabled,
  onOpenHistory,
  onOpenFailedPrints,
  onOpenHold,
  onToggleSearch,
  onSync,
  onOpenPrinter,
  onOpenRegister,
}: {
  isOnline: boolean;
  pendingCount: number;
  printStatusMap: Record<string, 'pending' | 'printed' | 'failed'>;
  heldCount: number;
  showSearch: boolean;
  syncingAll: boolean;
  cashEnabled: boolean;
  onOpenHistory: () => void;
  onOpenFailedPrints: () => void;
  onOpenHold: () => void;
  onToggleSearch: () => void;
  onSync: () => void;
  onOpenPrinter: () => void;
  onOpenRegister: () => void;
}) {
  const sidebarCollapsed = useSidebarCollapsed();
  const failedPrintCount = Object.values(printStatusMap).filter(s => s === 'failed').length;

  return (
    <View style={styles.header}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {sidebarCollapsed ? (
          <Image
            source={require('@/assets/images/logo-blue.png')}
            style={{ width: 110, height: 28 }}
            resizeMode="contain"
          />
        ) : (
          <Feather name="monitor" size={20} color={BLUE} />
        )}
        <Text style={styles.headerTitle}>Point of Sale</Text>
        {!isOnline && (
          <View style={styles.offlineBadge}>
            <Feather name="wifi-off" size={11} color={WHITE} />
            <Text style={styles.offlineBadgeText}>Offline{pendingCount > 0 ? ` · ${pendingCount} queued` : ''}</Text>
          </View>
        )}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
        {failedPrintCount > 0 && (
          <Pressable onPress={onOpenFailedPrints} style={[styles.headerBtn, { backgroundColor: `${CHERRY}18`, borderWidth: 1, borderColor: `${CHERRY}40` }]}>
            <Feather name="printer" size={16} color={CHERRY} />
            <Text style={[styles.headerBtnText, { color: CHERRY, fontWeight: '700' }]}>{failedPrintCount} print failed</Text>
          </Pressable>
        )}
        <Pressable onPress={onOpenHistory} style={styles.headerBtn}><Feather name="clock" size={16} color={MID} /><Text style={styles.headerBtnText}>History</Text></Pressable>
        <Pressable onPress={onOpenHold} style={styles.headerBtn}>
          <Feather name="layers" size={16} color={heldCount > 0 ? BLUE : MID} />
          <Text style={[styles.headerBtnText, heldCount > 0 && { color: BLUE }]}>Hold{heldCount > 0 ? ` (${heldCount})` : ''}</Text>
        </Pressable>
        <Pressable onPress={onToggleSearch} style={[styles.headerBtn, showSearch && { backgroundColor: `${BLUE}20` }]}>
          <Feather name="search" size={16} color={showSearch ? BLUE : MID} />
        </Pressable>
        <Pressable onPress={onSync} disabled={syncingAll} style={[styles.headerBtn, syncingAll && { opacity: 0.5 }]}>
          <Feather name="refresh-cw" size={16} color={syncingAll ? MUTED : MID} />
        </Pressable>
        <Pressable onPress={onOpenPrinter} style={styles.headerBtn}><Feather name="printer" size={16} color={MID} /><Text style={styles.headerBtnText}>Printer</Text></Pressable>
        <Pressable onPress={onOpenRegister} style={styles.headerBtn}>
          <Feather name="archive" size={16} color={cashEnabled ? MID : CHERRY} />
          <Text style={[styles.headerBtnText, !cashEnabled && { color: CHERRY }]}>Register</Text>
        </Pressable>
      </View>
    </View>
  );
}

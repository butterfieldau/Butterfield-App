import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PosRegisterCurrentResponse, PosSurcharge, RegisterSessionReport } from '@/lib/api';
import { ZReportContent } from '@/components/ZReportModal';
import ZReportModal from '@/components/ZReportModal';
import { saveSurchargesCache } from '@/lib/posCache';
import styles from './posStyles';
import { BLUE, CHERRY, DARK, MID, MUTED, WHITE, BORDER, fmtCents } from './types';

const AUD_DENOMS = [
  { label: '$100', cents: 10000, note: true },
  { label: '$50',  cents: 5000,  note: true },
  { label: '$20',  cents: 2000,  note: true },
  { label: '$10',  cents: 1000,  note: true },
  { label: '$5',   cents: 500,   note: true },
  { label: '$2',   cents: 200,   note: false },
  { label: '$1',   cents: 100,   note: false },
  { label: '50¢',  cents: 50,    note: false },
  { label: '20¢',  cents: 20,    note: false },
  { label: '10¢',  cents: 10,    note: false },
  { label: '5¢',   cents: 5,     note: false },
];

type PosRegisterCashMovement = {
  id: string;
  movementType: 'add' | 'remove';
  amountCents: number;
  reason?: string | null;
  createdByName?: string | null;
};

export default function RegisterModal({
  visible, onClose, data, loading, onSaveFloat, onCashMovement, onCloseRegister, onToggleAutoClose,
  discountPresets, onChangePresets, onPrintSummary, onOpenDrawer, busy,
}: {
  visible: boolean;
  onClose: () => void;
  data: PosRegisterCurrentResponse | null;
  loading: boolean;
  onSaveFloat: (amountCents: number) => void;
  onCashMovement: (payload: { movementType: 'add' | 'remove'; amountCents: number; reason?: string }) => void;
  onCloseRegister: (payload: { actualCountedCashCents: number; closeNote?: string; varianceNote?: string }) => void;
  onToggleAutoClose: (enabled: boolean) => void;
  discountPresets: number[];
  onChangePresets: (presets: number[]) => void;
  onPrintSummary: () => Promise<void>;
  onOpenDrawer: () => Promise<void>;
  busy: boolean;
}) {
  const queryClient = useQueryClient();
  const session = data?.session ?? null;
  const summary = session?.summary;

  const [activeTab, setActiveTab] = useState<'session' | 'cash' | 'close' | 'settings'>('session');
  const [showPastSessions, setShowPastSessions] = useState(false);
  const [pastZReportId, setPastZReportId] = useState<string | null>(null);

  const [floatInput, setFloatInput] = useState('');
  const [drawerBusy, setDrawerBusy] = useState(false);
  const [movementType, setMovementType] = useState<'add' | 'remove'>('add');
  const [movementAmount, setMovementAmount] = useState('');
  const [movementReason, setMovementReason] = useState('');
  const [denomCounts, setDenomCounts] = useState<Record<number, string>>({});
  const [closeNote, setCloseNote] = useState('');
  const [varianceNote, setVarianceNote] = useState('');
  const [openSection, setOpenSection] = useState<'float' | 'drawer' | 'presets' | 'surcharges' | null>(null);
  const toggleSection = (key: typeof openSection) => setOpenSection(prev => (prev === key ? null : key));

  const [localPresets, setLocalPresets] = useState<number[]>(discountPresets);
  const [newPct, setNewPct] = useState('');
  const [presetError, setPresetError] = useState<string | null>(null);
  useEffect(() => { setLocalPresets(discountPresets); }, [visible]);

  const addPreset = () => {
    const val = parseInt(newPct, 10);
    if (!val || val < 1 || val > 99) { setPresetError('Enter 1–99'); return; }
    if (localPresets.includes(val)) { setPresetError(`${val}% already exists`); return; }
    setLocalPresets(prev => [...prev, val].sort((a, b) => a - b));
    setNewPct('');
    setPresetError(null);
  };
  const removePreset = (pct: number) => setLocalPresets(prev => prev.filter(p => p !== pct));
  const savePresets = () => { onChangePresets(localPresets); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); };

  const [surchargeTab, setSurchargeTab] = useState<'list' | 'add'>('list');
  const [newSurchargeName, setNewSurchargeName] = useState('');
  const [newSurchargeTriggerType, setNewSurchargeTriggerType] = useState<'payment_method' | 'day_of_week'>('payment_method');
  const [newSurchargeTriggerValue, setNewSurchargeTriggerValue] = useState('eftpos');
  const [newSurchargeAmountType, setNewSurchargeAmountType] = useState<'pct_basis_points' | 'fixed_cents'>('pct_basis_points');
  const [newSurchargeAmount, setNewSurchargeAmount] = useState('');
  const [surchargeError, setSurchargeError] = useState<string | null>(null);

  const { data: surchargesData, refetch: refetchSurcharges } = useQuery({
    queryKey: ['pos-surcharges'],
    queryFn: async () => {
      const res = await api.pos.surcharges();
      const rows = (res as any)?.data ?? [];
      saveSurchargesCache(rows);
      return res;
    },
    staleTime: Infinity,
  });
  const surcharges: PosSurcharge[] = (surchargesData as any)?.data ?? [];

  const createSurchargeMutation = useMutation({
    mutationFn: () => api.pos.createSurcharge({
      name: newSurchargeName.trim(), triggerType: newSurchargeTriggerType, triggerValue: newSurchargeTriggerValue,
      amountType: newSurchargeAmountType, amountValue: Math.round(parseFloat(newSurchargeAmount || '0') * 100),
    }),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['pos-surcharges'] });
      refetchSurcharges();
      setSurchargeTab('list');
      setNewSurchargeName('');
      setNewSurchargeAmount('');
      setSurchargeError(null);
    },
    onError: (err: any) => setSurchargeError(err?.message ?? 'Failed to create surcharge'),
  });

  const deleteSurchargeMutation = useMutation({
    mutationFn: (id: string) => api.pos.deleteSurcharge(id),
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['pos-surcharges'] });
      refetchSurcharges();
    },
  });

  const toggleSurchargeMutation = useMutation({
    mutationFn: (vars: { id: string; isActive: boolean }) => api.pos.updateSurcharge(vars.id, { isActive: vars.isActive }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pos-surcharges'] }); refetchSurcharges(); },
  });

  const handleAddSurcharge = () => {
    if (!newSurchargeName.trim()) { setSurchargeError('Enter a name'); return; }
    if (!newSurchargeAmount || parseFloat(newSurchargeAmount) <= 0) { setSurchargeError('Enter a valid amount'); return; }
    setSurchargeError(null);
    createSurchargeMutation.mutate();
  };

  const fmtSurchargeValue = (s: PosSurcharge) =>
    s.amountType === 'pct_basis_points' ? `${(s.amountValue / 100).toFixed(2)}%` : fmtCents(s.amountValue);

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['pos-register-sessions'],
    queryFn: () => api.pos.registerSessions(),
    enabled: visible && showPastSessions,
    staleTime: 30_000,
  });
  const pastSessions: RegisterSessionReport[] = (historyData as any)?.data ?? [];

  const { data: pastReportData, isLoading: pastReportLoading } = useQuery({
    queryKey: ['pos-register-session', pastZReportId],
    queryFn: () => api.pos.registerSessionById(pastZReportId!),
    enabled: !!pastZReportId,
    staleTime: 60_000,
  });
  const pastReport: RegisterSessionReport | null = (pastReportData as any)?.data ?? null;

  useEffect(() => {
    if (!visible || !session) return;
    if (summary?.startingFloatCents != null) setFloatInput((summary.startingFloatCents / 100).toFixed(2));
    setDenomCounts({});
    setCloseNote(session.closeNote ?? '');
    setVarianceNote(session.varianceNote ?? '');
  }, [session, visible]);

  const countedCents = AUD_DENOMS.reduce((sum, d) => {
    const qty = parseInt(denomCounts[d.cents] ?? '0', 10);
    return sum + (isNaN(qty) || qty < 0 ? 0 : qty * d.cents);
  }, 0);
  const variancePreview = summary ? countedCents - summary.expectedCashCents : 0;

  const allChannels = (() => {
    const posTotal       = summary?.totalSalesCents ?? 0;
    const inAppTotal     = data?.inAppOrders?.revenueCents ?? 0;
    const wholesaleTotal = data?.wholesaleOrders?.revenueCents ?? 0;
    const grandTotal     = posTotal + inAppTotal + wholesaleTotal;
    const inAppCount     = data?.inAppOrders?.count ?? 0;
    const wsCount        = data?.wholesaleOrders?.count ?? 0;
    return { posTotal, inAppTotal, wholesaleTotal, grandTotal, inAppCount, wsCount };
  })();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.customiseRoot}>
        <View style={[styles.sheetHeader, { paddingHorizontal: 12 }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.regHeaderSideBtn}>
            <Feather name="x" size={22} color={DARK} />
          </Pressable>
          <Text style={styles.sheetTitle}>Register</Text>
          <Pressable
            onPress={async () => { setDrawerBusy(true); try { await onOpenDrawer(); } catch {} finally { setDrawerBusy(false); } }}
            disabled={drawerBusy}
            style={styles.regHeaderDrawerBtn}
            hitSlop={8}
          >
            <Feather name="unlock" size={16} color={drawerBusy ? MUTED : '#D97706'} />
          </Pressable>
        </View>

        <View style={styles.regTabBar}>
          {(['session', 'cash', 'close', 'settings'] as const).map(tab => (
            <Pressable key={tab} onPress={() => { setActiveTab(tab); Haptics.selectionAsync(); }} style={[styles.regTab, activeTab === tab && styles.regTabActive]}>
              <Text style={[styles.regTabText, activeTab === tab && styles.regTabTextActive]}>
                {tab === 'session' ? 'Session' : tab === 'cash' ? 'Cash' : tab === 'close' ? 'Close' : 'Settings'}
              </Text>
            </Pressable>
          ))}
        </View>

        {loading || !summary ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={BLUE} />
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">

            {activeTab === 'session' && (<>
              <View style={styles.registerHero}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.registerHeroTitle}>{session?.registerName ?? 'Register'}</Text>
                  <Text style={styles.registerHeroSub}>{session?.registerLocation ?? 'Butterfield Cookies'}</Text>
                  <Text style={styles.registerHeroMeta}>Trading day {session?.tradingDate}</Text>
                </View>
                <View style={[styles.registerStatusPill, data?.cashEnabled ? styles.registerStatusOpen : styles.registerStatusNeedsFloat]}>
                  <Text style={[styles.registerStatusText, !data?.cashEnabled && { color: CHERRY }]}>{data?.cashEnabled ? 'Cash Ready' : 'Float Required'}</Text>
                </View>
              </View>

              <View style={styles.registerGrid}>
                {[
                  { label: 'Opening Float', value: fmtCents(summary.startingFloatCents ?? 0) },
                  { label: 'Expected Cash',  value: fmtCents(summary.expectedCashCents) },
                  { label: 'Cash Sales',     value: fmtCents(summary.cashSalesCents) },
                  { label: 'Card Sales',     value: fmtCents(summary.cardSalesCents) },
                ].map(m => (
                  <View key={m.label} style={styles.registerCard}>
                    <Text style={styles.registerMetricLabel}>{m.label}</Text>
                    <Text style={styles.registerMetricValue}>{m.value}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.registerSection}>
                <Text style={styles.sectionTitle}>Today&apos;s Totals</Text>
                {([
                  ['Cash Refunds',  fmtCents(summary.cashRefundsCents)],
                  ['Card Refunds',  fmtCents(summary.cardRefundsCents)],
                  ['Discounts',     fmtCents(summary.discountsCents)],
                  ['Surcharges',    fmtCents(summary.surchargesCents)],
                  ['Cash Added',    fmtCents(summary.cashAddedCents)],
                  ['Cash Removed',  fmtCents(summary.cashRemovedCents)],
                  ['Total Sales',   fmtCents(summary.totalSalesCents)],
                ] as [string, string][]).map(([label, value]) => (
                  <View key={label} style={styles.registerLine}>
                    <Text style={styles.registerLineLabel}>{label}</Text>
                    <Text style={styles.registerLineValue}>{value}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.registerSection}>
                <Text style={styles.sectionTitle}>All Channels Today</Text>
                <View style={styles.registerLine}>
                  <View style={{ flex: 1 }}><Text style={styles.registerLineLabel}>POS</Text></View>
                  <Text style={styles.registerLineValue}>{fmtCents(allChannels.posTotal)}</Text>
                </View>
                <View style={styles.registerLine}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.registerLineLabel}>Customer App</Text>
                    <Text style={[styles.registerLineLabel, { fontSize: 11, marginTop: 1 }]}>{allChannels.inAppCount} order{allChannels.inAppCount !== 1 ? 's' : ''}</Text>
                  </View>
                  <Text style={styles.registerLineValue}>{fmtCents(allChannels.inAppTotal)}</Text>
                </View>
                <View style={styles.registerLine}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.registerLineLabel}>Wholesale</Text>
                    <Text style={[styles.registerLineLabel, { fontSize: 11, marginTop: 1 }]}>{allChannels.wsCount} order{allChannels.wsCount !== 1 ? 's' : ''}</Text>
                  </View>
                  <Text style={styles.registerLineValue}>{fmtCents(allChannels.wholesaleTotal)}</Text>
                </View>
                <View style={[styles.registerLine, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#334155', marginTop: 6, paddingTop: 10 }]}>
                  <Text style={[styles.registerLineLabel, { fontWeight: '700', color: DARK }]}>Grand Total</Text>
                  <Text style={[styles.registerLineValue, { fontWeight: '800', color: BLUE, fontSize: 18 }]}>{fmtCents(allChannels.grandTotal)}</Text>
                </View>
              </View>

              <Pressable onPress={() => { setShowPastSessions(true); Haptics.selectionAsync(); }} style={({ pressed }) => [styles.regPastSessionsBtn, pressed && { opacity: 0.7 }]}>
                <Feather name="clock" size={15} color={MID} />
                <Text style={styles.regPastSessionsBtnText}>Past Sessions</Text>
                <Feather name="chevron-right" size={15} color={MUTED} />
              </Pressable>
            </>)}

            {activeTab === 'cash' && (<>
              <Pressable
                style={({ pressed }) => [styles.regDrawerAction, (pressed || drawerBusy) && { opacity: 0.6 }]}
                disabled={drawerBusy}
                onPress={async () => { setDrawerBusy(true); try { await onOpenDrawer(); } catch {} finally { setDrawerBusy(false); } }}
              >
                <View style={[styles.regAccordionIcon, { backgroundColor: '#FFF7ED' }]}>
                  <Feather name="unlock" size={20} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.regDrawerActionTitle}>{drawerBusy ? 'Opening Drawer…' : 'Open Cash Drawer'}</Text>
                  <Text style={styles.regAccordionSub}>Send pulse to open via receipt printer</Text>
                </View>
              </Pressable>

              <View style={styles.regAccordionGroup}>
                <Pressable style={styles.regAccordionRow} onPress={() => toggleSection('float')}>
                  <View style={[styles.regAccordionIcon, { backgroundColor: '#EFF6FF' }]}>
                    <Feather name="dollar-sign" size={16} color={BLUE} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.regAccordionTitle}>Cash Float</Text>
                    <Text style={styles.regAccordionSub}>{data?.cashEnabled ? fmtCents(summary.startingFloatCents ?? 0) : 'Not set — required to accept cash'}</Text>
                  </View>
                  <Feather name={openSection === 'float' ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
                </Pressable>
                {openSection === 'float' && (
                  <View style={styles.regAccordionBody}>
                    <TextInput style={styles.registerInput} placeholder="0.00" placeholderTextColor={MUTED} keyboardType="decimal-pad" value={floatInput} onChangeText={setFloatInput} />
                    <TouchableOpacity onPress={() => { onSaveFloat(Math.round(parseFloat(floatInput || '0') * 100)); toggleSection('float'); }} style={[styles.addToOrderBtn, busy && { opacity: 0.6 }]} disabled={busy} activeOpacity={0.85}>
                      <Text style={styles.addToOrderBtnText}>{data?.cashEnabled ? 'Update Float' : 'Start Cash Float'}</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.regAccordionDivider} />

                <Pressable style={styles.regAccordionRow} onPress={() => toggleSection('drawer')}>
                  <View style={[styles.regAccordionIcon, { backgroundColor: '#F0FDF4' }]}>
                    <Feather name="refresh-cw" size={16} color="#16A34A" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.regAccordionTitle}>Cash In Drawer</Text>
                    <Text style={styles.regAccordionSub}>Add or remove cash · {data?.cashMovements?.length ?? 0} movement{data?.cashMovements?.length === 1 ? '' : 's'} today</Text>
                  </View>
                  <Feather name={openSection === 'drawer' ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
                </Pressable>
                {openSection === 'drawer' && (
                  <View style={styles.regAccordionBody}>
                    <View style={styles.registerToggleRow}>
                      <Pressable onPress={() => setMovementType('add')} style={[styles.registerToggleBtn, movementType === 'add' && styles.registerToggleBtnActive]}>
                        <Text style={[styles.registerToggleText, movementType === 'add' && styles.registerToggleTextActive]}>Add Cash</Text>
                      </Pressable>
                      <Pressable onPress={() => setMovementType('remove')} style={[styles.registerToggleBtn, movementType === 'remove' && styles.registerToggleBtnActive]}>
                        <Text style={[styles.registerToggleText, movementType === 'remove' && styles.registerToggleTextActive]}>Remove Cash</Text>
                      </Pressable>
                    </View>
                    <TextInput style={styles.registerInput} placeholder="Amount" placeholderTextColor={MUTED} keyboardType="decimal-pad" value={movementAmount} onChangeText={setMovementAmount} />
                    <TextInput style={[styles.registerInput, styles.registerTextarea]} placeholder="Reason / note" placeholderTextColor={MUTED} multiline value={movementReason} onChangeText={setMovementReason} />
                    <TouchableOpacity
                      onPress={() => { onCashMovement({ movementType, amountCents: Math.round(parseFloat(movementAmount || '0') * 100), reason: movementReason }); setMovementAmount(''); setMovementReason(''); }}
                      style={[styles.addToOrderBtn, busy && { opacity: 0.6 }]} disabled={busy} activeOpacity={0.85}
                    >
                      <Text style={styles.addToOrderBtnText}>{movementType === 'add' ? 'Add Cash to Drawer' : 'Remove Cash from Drawer'}</Text>
                    </TouchableOpacity>
                    {data?.cashMovements?.length ? (
                      <View style={{ marginTop: 12, gap: 8 }}>
                        {data.cashMovements.slice(0, 5).map((movement: PosRegisterCashMovement) => (
                          <View key={movement.id} style={styles.registerMovementRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.registerMovementTitle}>{movement.movementType === 'add' ? 'Cash Added' : 'Cash Removed'} · {fmtCents(movement.amountCents)}</Text>
                              <Text style={styles.registerMovementMeta}>{movement.reason || 'No note'}{movement.createdByName ? ` · ${movement.createdByName}` : ''}</Text>
                            </View>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                )}
              </View>
            </>)}

            {activeTab === 'close' && (<>
              {session?.closedAt ? (
                <>
                  <ZReportContent report={session} />
                  <TouchableOpacity onPress={() => void onPrintSummary()} style={[styles.addToOrderBtn, { gap: 8, marginTop: 4 }]} activeOpacity={0.85}>
                    <Feather name="printer" size={16} color={WHITE} />
                    <Text style={styles.addToOrderBtnText}>Print Z-Report</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <View style={styles.denomGrid}>
                    <View style={styles.denomColumn}>
                      <Text style={styles.denomColHeader}>Notes</Text>
                      {AUD_DENOMS.filter(d => d.note).map(d => (
                        <View key={d.cents} style={styles.denomCell}>
                          <Text style={styles.denomCellLabel}>{d.label}</Text>
                          <Pressable onPress={() => setDenomCounts(p => ({ ...p, [d.cents]: String(Math.max(0, (parseInt(p[d.cents] ?? '0', 10) || 0) - 1)) }))} style={styles.denomCellBtn} hitSlop={8}><Feather name="minus" size={14} color={MID} /></Pressable>
                          <TextInput style={styles.denomCellInput} keyboardType="number-pad" value={denomCounts[d.cents] ?? ''} placeholder="0" placeholderTextColor={MUTED} onChangeText={v => setDenomCounts(p => ({ ...p, [d.cents]: v.replace(/[^0-9]/g, '') }))} selectTextOnFocus />
                          <Pressable onPress={() => setDenomCounts(p => ({ ...p, [d.cents]: String((parseInt(p[d.cents] ?? '0', 10) || 0) + 1) }))} style={styles.denomCellBtn} hitSlop={8}><Feather name="plus" size={14} color={MID} /></Pressable>
                        </View>
                      ))}
                    </View>
                    <View style={styles.denomColumn}>
                      <Text style={styles.denomColHeader}>Coins</Text>
                      {AUD_DENOMS.filter(d => !d.note).map(d => (
                        <View key={d.cents} style={styles.denomCell}>
                          <Text style={styles.denomCellLabel}>{d.label}</Text>
                          <Pressable onPress={() => setDenomCounts(p => ({ ...p, [d.cents]: String(Math.max(0, (parseInt(p[d.cents] ?? '0', 10) || 0) - 1)) }))} style={styles.denomCellBtn} hitSlop={8}><Feather name="minus" size={14} color={MID} /></Pressable>
                          <TextInput style={styles.denomCellInput} keyboardType="number-pad" value={denomCounts[d.cents] ?? ''} placeholder="0" placeholderTextColor={MUTED} onChangeText={v => setDenomCounts(p => ({ ...p, [d.cents]: v.replace(/[^0-9]/g, '') }))} selectTextOnFocus />
                          <Pressable onPress={() => setDenomCounts(p => ({ ...p, [d.cents]: String((parseInt(p[d.cents] ?? '0', 10) || 0) + 1) }))} style={styles.denomCellBtn} hitSlop={8}><Feather name="plus" size={14} color={MID} /></Pressable>
                        </View>
                      ))}
                    </View>
                  </View>

                  <View style={styles.denomSummaryRow}>
                    <View style={styles.denomSummaryItem}><Text style={styles.denomSummaryKey}>Counted</Text><Text style={styles.denomSummaryVal}>{fmtCents(countedCents)}</Text></View>
                    <View style={styles.denomSummarySep} />
                    <View style={styles.denomSummaryItem}><Text style={styles.denomSummaryKey}>Expected</Text><Text style={styles.denomSummaryVal}>{fmtCents(summary?.expectedCashCents ?? 0)}</Text></View>
                    <View style={styles.denomSummarySep} />
                    <View style={styles.denomSummaryItem}>
                      <Text style={styles.denomSummaryKey}>Variance</Text>
                      <Text style={[styles.denomSummaryVal, { color: variancePreview === 0 ? '#15803D' : variancePreview > 0 ? '#15803D' : CHERRY }]}>
                        {variancePreview > 0 ? '+' : ''}{fmtCents(variancePreview)}
                      </Text>
                    </View>
                  </View>

                  <TextInput style={styles.registerInput} placeholder="Close note (optional)" placeholderTextColor={MUTED} value={closeNote} onChangeText={setCloseNote} />
                  {variancePreview !== 0 && <TextInput style={styles.registerInput} placeholder="Reason for cash variance" placeholderTextColor={MUTED} value={varianceNote} onChangeText={setVarianceNote} />}
                  <TouchableOpacity onPress={() => onCloseRegister({ actualCountedCashCents: countedCents, closeNote, varianceNote: variancePreview !== 0 ? varianceNote : undefined })} style={[styles.addToOrderBtn, busy && { opacity: 0.6 }]} disabled={busy} activeOpacity={0.85}>
                    <Text style={styles.addToOrderBtnText}>Close Register</Text>
                  </TouchableOpacity>
                </>
              )}
            </>)}

            {activeTab === 'settings' && (<>
              <View style={styles.regAccordionGroup}>
                <Pressable style={styles.regAccordionRow} onPress={() => data?.canEditAutoClose && onToggleAutoClose(!data.autoCloseEnabled)} disabled={!data?.canEditAutoClose}>
                  <View style={[styles.regAccordionIcon, { backgroundColor: '#F5F3FF' }]}><Feather name="clock" size={16} color="#7C3AED" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.regAccordionTitle, !data?.canEditAutoClose && { opacity: 0.5 }]}>Auto Close at 11:59pm</Text>
                    <Text style={styles.regAccordionSub}>{data?.canEditAutoClose ? 'Tap to toggle' : 'Manager or director only'}</Text>
                  </View>
                  <Pressable onPress={() => data?.canEditAutoClose && onToggleAutoClose(!data.autoCloseEnabled)} style={[styles.registerSwitch, data?.autoCloseEnabled && styles.registerSwitchOn, !data?.canEditAutoClose && { opacity: 0.35 }]} hitSlop={8}>
                    <View style={[styles.registerSwitchKnob, data?.autoCloseEnabled && styles.registerSwitchKnobOn]} />
                  </Pressable>
                </Pressable>

                <View style={styles.regAccordionDivider} />

                <Pressable style={styles.regAccordionRow} onPress={() => toggleSection('presets')}>
                  <View style={[styles.regAccordionIcon, { backgroundColor: '#FFF1F2' }]}><Feather name="percent" size={16} color={CHERRY} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.regAccordionTitle}>Quick Discount Presets</Text>
                    <Text style={styles.regAccordionSub}>{localPresets.length > 0 ? localPresets.map(p => `${p}%`).join(' · ') : 'No presets set'}</Text>
                  </View>
                  <Feather name={openSection === 'presets' ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
                </Pressable>
                {openSection === 'presets' && (
                  <View style={styles.regAccordionBody}>
                    <Text style={styles.sectionSubtitle}>Percentage buttons shown on every ticket for fast discounting.</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 12 }}>
                      {localPresets.map(pct => (
                        <View key={pct} style={styles.settingsPresetChip}>
                          <Text style={styles.settingsPresetText}>{pct}%</Text>
                          <Pressable onPress={() => removePreset(pct)} hitSlop={6} style={{ marginLeft: 6 }}><Feather name="x" size={12} color={MID} /></Pressable>
                        </View>
                      ))}
                      {localPresets.length === 0 && <Text style={{ fontSize: 13, color: MUTED, fontStyle: 'italic' }}>No presets — add one below</Text>}
                    </View>
                    <View style={styles.settingsAddRow}>
                      <TextInput style={styles.settingsAddInput} placeholder="e.g. 15" placeholderTextColor={MUTED} value={newPct} onChangeText={v => { setNewPct(v.replace(/[^0-9]/g, '')); setPresetError(null); }} keyboardType="number-pad" returnKeyType="done" onSubmitEditing={addPreset} maxLength={2} />
                      <Text style={{ fontSize: 15, fontWeight: '600', color: MID, marginLeft: 4 }}>%</Text>
                      <Pressable onPress={addPreset} style={styles.settingsAddBtn}><Text style={styles.settingsAddBtnText}>Add</Text></Pressable>
                    </View>
                    {presetError ? <Text style={{ fontSize: 12, color: CHERRY, marginTop: 6 }}>{presetError}</Text> : null}
                    <TouchableOpacity onPress={savePresets} style={[styles.addToOrderBtn, { marginTop: 12 }]} activeOpacity={0.85}>
                      <Text style={styles.addToOrderBtnText}>Save Presets</Text>
                    </TouchableOpacity>
                  </View>
                )}

                <View style={styles.regAccordionDivider} />

                <Pressable style={styles.regAccordionRow} onPress={() => toggleSection('surcharges')}>
                  <View style={[styles.regAccordionIcon, { backgroundColor: '#F0FDF4' }]}><Feather name="credit-card" size={16} color="#16A34A" /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.regAccordionTitle}>Payment Surcharges</Text>
                    <Text style={styles.regAccordionSub}>{surcharges.length === 0 ? 'None configured' : `${surcharges.filter(s => s.isActive).length} active · ${surcharges.length} total`}</Text>
                  </View>
                  <Feather name={openSection === 'surcharges' ? 'chevron-up' : 'chevron-down'} size={16} color={MUTED} />
                </Pressable>
                {openSection === 'surcharges' && (
                  <View style={styles.regAccordionBody}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <Text style={styles.sectionSubtitle}>Auto-applied by payment method or day of week.</Text>
                      <Pressable onPress={() => setSurchargeTab(surchargeTab === 'list' ? 'add' : 'list')} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Feather name={surchargeTab === 'list' ? 'plus' : 'list'} size={15} color={BLUE} />
                        <Text style={{ fontSize: 13, color: BLUE, fontWeight: '600' }}>{surchargeTab === 'list' ? 'Add' : 'List'}</Text>
                      </Pressable>
                    </View>
                    {surchargeTab === 'list' && (
                      <View style={{ gap: 8 }}>
                        {surcharges.length === 0 && <Text style={{ fontSize: 13, color: MUTED, fontStyle: 'italic' }}>No surcharges configured.</Text>}
                        {surcharges.map(s => (
                          <View key={s.id} style={styles.surchargeRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.surchargeRowName}>{s.name}</Text>
                              <Text style={styles.surchargeRowMeta}>{s.triggerType === 'payment_method' ? s.triggerValue.toUpperCase() : s.triggerValue.charAt(0).toUpperCase() + s.triggerValue.slice(1)}{' · '}+{fmtSurchargeValue(s)} {' · '}{s.isActive ? '✓ Active' : 'Disabled'}</Text>
                            </View>
                            <Pressable onPress={() => toggleSurchargeMutation.mutate({ id: s.id, isActive: !s.isActive })} style={[styles.surchargeToggle, s.isActive && styles.surchargeToggleActive]} hitSlop={8}>
                              <Text style={[styles.surchargeToggleText, s.isActive && styles.surchargeToggleTextActive]}>{s.isActive ? 'On' : 'Off'}</Text>
                            </Pressable>
                            <Pressable onPress={() => Alert.alert('Delete Surcharge', `Remove "${s.name}"?`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteSurchargeMutation.mutate(s.id) }])} hitSlop={8} style={{ padding: 6, marginLeft: 4 }}>
                              <Feather name="trash-2" size={15} color={CHERRY} />
                            </Pressable>
                          </View>
                        ))}
                      </View>
                    )}
                    {surchargeTab === 'add' && (
                      <View style={{ gap: 12 }}>
                        <TextInput style={styles.surchargeNameInput} placeholder="Name (e.g. EFTPOS Surcharge)" placeholderTextColor={MUTED} value={newSurchargeName} onChangeText={setNewSurchargeName} returnKeyType="next" />
                        <View>
                          <Text style={[styles.sectionSubtitle, { marginBottom: 6 }]}>Trigger</Text>
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <Pressable onPress={() => { setNewSurchargeTriggerType('payment_method'); setNewSurchargeTriggerValue('eftpos'); }} style={[styles.surchargeChip, newSurchargeTriggerType === 'payment_method' && styles.surchargeChipActive]}>
                              <Text style={[styles.surchargeChipText, newSurchargeTriggerType === 'payment_method' && { color: WHITE }]}>By Payment</Text>
                            </Pressable>
                            <Pressable onPress={() => { setNewSurchargeTriggerType('day_of_week'); setNewSurchargeTriggerValue('sunday'); }} style={[styles.surchargeChip, newSurchargeTriggerType === 'day_of_week' && styles.surchargeChipActive]}>
                              <Text style={[styles.surchargeChipText, newSurchargeTriggerType === 'day_of_week' && { color: WHITE }]}>By Day</Text>
                            </Pressable>
                          </View>
                          {newSurchargeTriggerType === 'payment_method' && (
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                              {['eftpos', 'cash'].map(v => (
                                <Pressable key={v} onPress={() => setNewSurchargeTriggerValue(v)} style={[styles.surchargeChip, newSurchargeTriggerValue === v && styles.surchargeChipActive]}>
                                  <Text style={[styles.surchargeChipText, newSurchargeTriggerValue === v && { color: WHITE }]}>{v.toUpperCase()}</Text>
                                </Pressable>
                              ))}
                            </View>
                          )}
                          {newSurchargeTriggerType === 'day_of_week' && (
                            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                              {['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].map(v => (
                                <Pressable key={v} onPress={() => setNewSurchargeTriggerValue(v)} style={[styles.surchargeChip, newSurchargeTriggerValue === v && styles.surchargeChipActive]}>
                                  <Text style={[styles.surchargeChipText, newSurchargeTriggerValue === v && { color: WHITE }]}>{v.charAt(0).toUpperCase() + v.slice(1, 3)}</Text>
                                </Pressable>
                              ))}
                            </View>
                          )}
                        </View>
                        <View>
                          <Text style={[styles.sectionSubtitle, { marginBottom: 6 }]}>Amount</Text>
                          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                            <Pressable onPress={() => setNewSurchargeAmountType('pct_basis_points')} style={[styles.surchargeChip, newSurchargeAmountType === 'pct_basis_points' && styles.surchargeChipActive]}>
                              <Text style={[styles.surchargeChipText, newSurchargeAmountType === 'pct_basis_points' && { color: WHITE }]}>% of total</Text>
                            </Pressable>
                            <Pressable onPress={() => setNewSurchargeAmountType('fixed_cents')} style={[styles.surchargeChip, newSurchargeAmountType === 'fixed_cents' && styles.surchargeChipActive]}>
                              <Text style={[styles.surchargeChipText, newSurchargeAmountType === 'fixed_cents' && { color: WHITE }]}>Fixed $</Text>
                            </Pressable>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <TextInput style={[styles.surchargeNameInput, { flex: 1 }]} placeholder={newSurchargeAmountType === 'pct_basis_points' ? 'e.g. 1.50 for 1.5%' : 'e.g. 0.30 for 30¢'} placeholderTextColor={MUTED} value={newSurchargeAmount} onChangeText={setNewSurchargeAmount} keyboardType="decimal-pad" />
                            <Text style={{ fontSize: 14, color: MID, fontWeight: '600' }}>{newSurchargeAmountType === 'pct_basis_points' ? '%' : 'AUD'}</Text>
                          </View>
                        </View>
                        {surchargeError ? <Text style={{ fontSize: 12, color: CHERRY }}>{surchargeError}</Text> : null}
                        <TouchableOpacity onPress={handleAddSurcharge} style={[styles.addToOrderBtn, createSurchargeMutation.isPending && { opacity: 0.6 }]} disabled={createSurchargeMutation.isPending} activeOpacity={0.85}>
                          {createSurchargeMutation.isPending ? <ActivityIndicator color={WHITE} /> : <Text style={styles.addToOrderBtnText}>Add Surcharge</Text>}
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </>)}

          </ScrollView>
        )}

        <Modal visible={showPastSessions} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPastSessions(false)}>
          <View style={styles.customiseRoot}>
            <View style={styles.sheetHeader}>
              <Pressable onPress={() => setShowPastSessions(false)} hitSlop={12}><Feather name="x" size={22} color={DARK} /></Pressable>
              <Text style={styles.sheetTitle}>Past Sessions</Text>
              <View style={{ width: 22 }} />
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 10 }}>
              {historyLoading ? (
                <View style={{ paddingVertical: 40, alignItems: 'center' }}><ActivityIndicator color={BLUE} /></View>
              ) : pastSessions.length === 0 ? (
                <View style={{ paddingVertical: 40, alignItems: 'center', gap: 8 }}>
                  <Feather name="archive" size={32} color={MUTED} />
                  <Text style={{ fontSize: 14, color: MUTED, textAlign: 'center' }}>No past sessions on record for this register</Text>
                </View>
              ) : (
                pastSessions.map(ps => (
                  <Pressable key={ps.id} onPress={() => { setPastZReportId(ps.id); Haptics.selectionAsync(); }} style={({ pressed }) => [styles.regHistoryRow, pressed && { opacity: 0.7 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.regHistoryDate}>{ps.tradingDate}</Text>
                      <Text style={styles.regHistoryMeta}>{ps.autoClosed ? 'Auto close' : `Closed by ${ps.closedByName ?? 'unknown'}`}{ps.summary.varianceCents !== null && ps.summary.varianceCents !== 0 ? ` · Variance ${ps.summary.varianceCents > 0 ? '+' : ''}${fmtCents(ps.summary.varianceCents)}` : ''}</Text>
                    </View>
                    <Text style={styles.regHistoryAmt}>{fmtCents(ps.summary.totalSalesCents)}</Text>
                    <Feather name="chevron-right" size={15} color={MUTED} />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </Modal>

        {!!pastZReportId && (
          <ZReportModal visible={!!pastZReportId} report={pastReport} loading={pastReportLoading} onDone={() => setPastZReportId(null)} />
        )}

      </View>
    </Modal>
  );
}

void BORDER;

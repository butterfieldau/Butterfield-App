import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { PosSurcharge } from '@/lib/api';
import { saveSurchargesCache } from '@/lib/posCache';
import styles from './posStyles';
import { BLUE, CHERRY, DARK, MID, MUTED, WHITE, BORDER, fmtCents } from './types';
import { LINKLY_ACTIVE_SESSION_KEY, LINKLY_POLL_CONFIG, startLinklyStream } from './linklyStream';
import type { LinklyStreamControl } from './linklyStream';
import type { AppliedDiscount } from './types';

export type PaymentConfirmParams = {
  method: 'cash' | 'eftpos' | 'split';
  amountTenderedCents?: number;
  surchargeCents: number;
  splitPayments?: { method: string; amountCents: number; linklySessionId?: string | null }[];
  linklySessionId?: string;
};

export default function PaymentModal({
  totalCents, subtotalCents, discount, cashEnabled, onClose, onConfirm, onPrintReceipt, loading, isOnline,
}: {
  totalCents: number;
  subtotalCents: number;
  discount: AppliedDiscount | null;
  cashEnabled: boolean;
  onClose: () => void;
  onConfirm: (params: PaymentConfirmParams) => void;
  onPrintReceipt?: (sessionId: string, receiptText: string) => void;
  loading: boolean;
  isOnline: boolean;
}) {
  const [method, setMethod] = useState<'cash' | 'eftpos' | 'split'>(!isOnline && cashEnabled ? 'cash' : 'eftpos');
  const [tendered, setTendered] = useState('');
  const [splitParts, setSplitParts] = useState<{ amountCents: number; method: 'cash' | 'eftpos'; linklySessionId?: string | null }[]>([]);
  const [splitInput, setSplitInput] = useState('');

  const [linklyStep, setLinklyStep] = useState<'idle' | 'initiating' | 'waiting' | 'approved' | 'declined'>('idle');
  const [linklySessionId, setLinklySessionId] = useState<string | null>(null);
  const [linklyText, setLinklyText] = useState('');
  const [linklyConsecErrors, setLinklyConsecErrors] = useState(0);
  const linklyPollRef = useRef<LinklyStreamControl | null>(null);
  const receiptPrintedRef = useRef<Set<string>>(new Set());

  const [splitCardStep, setSplitCardStep] = useState<'idle' | 'initiating' | 'waiting' | 'declined'>('idle');
  const [splitCardSessionId, setSplitCardSessionId] = useState<string | null>(null);
  const [splitCardText, setSplitCardText] = useState('');
  const [splitCardConsecErrors, setSplitCardConsecErrors] = useState(0);
  const splitCardPollRef = useRef<LinklyStreamControl | null>(null);

  const [terminalStatus, setTerminalStatus] = useState<'checking' | 'ok' | 'warn' | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkTerminalStatus = useCallback(async () => {
    setTerminalStatus('checking');
    try {
      const res = await api.pos.linklyTerminalStatus() as any;
      setTerminalStatus(res?.data?.reachable ? 'ok' : 'warn');
    } catch {
      setTerminalStatus('warn');
    }
  }, []);

  const linklyStepRef = useRef(linklyStep);
  useEffect(() => { linklyStepRef.current = linklyStep; }, [linklyStep]);
  const splitCardStepRef = useRef(splitCardStep);
  useEffect(() => { splitCardStepRef.current = splitCardStep; }, [splitCardStep]);

  useEffect(() => {
    if (method !== 'eftpos') return;
    checkTerminalStatus().catch(() => {});
    heartbeatRef.current = setInterval(() => {
      if (linklyStepRef.current === 'idle' && splitCardStepRef.current === 'idle') {
        checkTerminalStatus().catch(() => {});
      }
    }, LINKLY_POLL_CONFIG.IDLE_HEARTBEAT_MS);
    return () => {
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    };
  }, [method, checkTerminalStatus]);

  const { data: surchargesData } = useQuery({
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

  const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
  const dayOfWeek = DAY_NAMES[new Date().getDay()]!;
  const applicableSurcharges = useMemo(() => surcharges.filter(s => {
    if (!s.isActive) return false;
    const effectiveMethod = method === 'split' ? 'cash' : method;
    if (s.triggerType === 'payment_method') return s.triggerValue === effectiveMethod;
    if (s.triggerType === 'day_of_week') return s.triggerValue === dayOfWeek;
    return false;
  }), [surcharges, method, dayOfWeek]);

  const computedSurchargeCents = useMemo(() =>
    applicableSurcharges.reduce((sum, s) => {
      if (s.amountType === 'pct_basis_points') return sum + Math.round(totalCents * s.amountValue / 10000);
      return sum + s.amountValue;
    }, 0),
  [applicableSurcharges, totalCents]);

  const chargeTotalCents = totalCents + computedSurchargeCents;
  const splitCommittedCents = splitParts.reduce((s, p) => s + p.amountCents, 0);
  const splitCurrentCents = Math.round(parseFloat(splitInput || '0') * 100);
  const splitRemainingCents = Math.max(0, chargeTotalCents - splitCommittedCents);
  const tenderedCents = Math.round(parseFloat(tendered || '0') * 100);
  const cashChangeCents = Math.max(0, tenderedCents - chargeTotalCents);
  const cashOk = method !== 'cash' || (cashEnabled && tenderedCents >= chargeTotalCents);
  const splitOk = method !== 'split' || splitCommittedCents >= chargeTotalCents;
  const roundUpPresets = [5, 10, 20, 50, 100].filter(d => d * 100 >= chargeTotalCents).slice(0, 3);

  useEffect(() => () => {
    linklyPollRef.current?.cancel();
    splitCardPollRef.current?.cancel();
  }, []);

  useEffect(() => {
    if (!cashEnabled && method === 'cash') setMethod('eftpos');
  }, [cashEnabled, method]);

  const handleKeypad = (val: string, setter: (s: string) => void, current: string) => {
    if (val === 'backspace') setter(current.slice(0, -1));
    else if (val === '.') { if (!current.includes('.')) setter(current + '.'); }
    else { const next = current + val; if (!isNaN(parseFloat(next)) || next === '.') setter(next); }
  };

  const handleLinklyInitiate = async () => {
    setLinklyStep('initiating');
    setLinklyText('Connecting to terminal…');
    setLinklyConsecErrors(0);
    try {
      const res = await api.pos.linklyInitiate(chargeTotalCents) as any;
      const sessionId = res?.data?.sessionId;
      if (!sessionId) throw new Error('No session ID returned');
      setLinklySessionId(sessionId);
      setLinklyStep('waiting');
      setLinklyText('Waiting for card…');
      AsyncStorage.setItem(
        LINKLY_ACTIVE_SESSION_KEY,
        JSON.stringify({ sessionId, amountCents: chargeTotalCents, startedAt: Date.now() }),
      ).catch(() => {});
      let completeFired = false;
      linklyPollRef.current = startLinklyStream(
        sessionId,
        (text) => setLinklyText(text),
        (pd) => {
          if (completeFired) return;
          completeFired = true;
          linklyPollRef.current = null;
          setLinklyConsecErrors(0);
          AsyncStorage.removeItem(LINKLY_ACTIVE_SESSION_KEY).catch(() => {});
          if (pd.approved) {
            setLinklyStep('approved');
            const terminalSurchargeCents = Math.max(0, Math.floor(Number(pd.amountSurchargeCents ?? 0)));
            const totalSurchargeCents = computedSurchargeCents + terminalSurchargeCents;
            onPrintReceipt?.(sessionId, pd.receiptText ?? '');
            onConfirm({ method: 'eftpos', surchargeCents: totalSurchargeCents, linklySessionId: sessionId });
          } else {
            setLinklyStep('declined');
          }
        },
        (count) => setLinklyConsecErrors(count),
        () => {
          linklyPollRef.current = null;
          AsyncStorage.removeItem(LINKLY_ACTIVE_SESSION_KEY).catch(() => {});
          setLinklyStep('declined');
          setLinklyText('Payment timed out — please retry or use an alternative payment method.');
        },
      );
    } catch (err: any) {
      setLinklyStep('idle');
      setLinklyText('');
      Alert.alert('EFTPOS Error', err?.message ?? 'Could not connect to the Linkly terminal.');
    }
  };

  const handleLinklyCancel = async () => {
    if (linklyPollRef.current) { linklyPollRef.current.cancel(); linklyPollRef.current = null; }
    if (linklySessionId) { try { await api.pos.linklyCancel(linklySessionId); } catch {} }
    AsyncStorage.removeItem(LINKLY_ACTIVE_SESSION_KEY).catch(() => {});
    setLinklyStep('idle');
    setLinklySessionId(null);
    setLinklyText('');
    setLinklyConsecErrors(0);
  };

  const handleSplitCardPayment = async () => {
    const amountCents = Math.min(splitCurrentCents, splitRemainingCents);
    if (amountCents <= 0) return;
    setSplitCardStep('initiating');
    setSplitCardText('Connecting to terminal…');
    setSplitCardConsecErrors(0);
    try {
      const res = await api.pos.linklyInitiate(amountCents) as any;
      const sessionId = res?.data?.sessionId;
      if (!sessionId) throw new Error('No session ID returned');
      setSplitCardSessionId(sessionId);
      setSplitCardStep('waiting');
      setSplitCardText('Waiting for card…');
      splitCardPollRef.current = startLinklyStream(
        sessionId,
        (text) => setSplitCardText(text),
        (pd) => {
          splitCardPollRef.current = null;
          setSplitCardConsecErrors(0);
          if (pd.approved) {
            if (!receiptPrintedRef.current.has(sessionId)) {
              receiptPrintedRef.current.add(sessionId);
              setSplitParts(ps => [...ps, { amountCents, method: 'eftpos', linklySessionId: sessionId }]);
              setSplitInput('');
              setSplitCardStep('idle');
              setSplitCardText('');
              setSplitCardSessionId(null);
            }
          } else {
            setSplitCardStep('declined');
          }
        },
        (count) => setSplitCardConsecErrors(count),
        () => {
          splitCardPollRef.current = null;
          setSplitCardStep('declined');
          setSplitCardText('Payment timed out — please retry.');
        },
      );
    } catch (err: any) {
      setSplitCardStep('idle');
      setSplitCardText('');
      Alert.alert('EFTPOS Error', err?.message ?? 'Could not connect to terminal.');
    }
  };

  const handleSplitCardCancel = async () => {
    if (splitCardPollRef.current) { splitCardPollRef.current.cancel(); splitCardPollRef.current = null; }
    if (splitCardSessionId) { try { await api.pos.linklyCancel(splitCardSessionId); } catch {} }
    setSplitCardStep('idle');
    setSplitCardSessionId(null);
    setSplitCardText('');
    setSplitCardConsecErrors(0);
  };

  const handleConfirm = () => {
    if (method === 'cash') {
      onConfirm({ method: 'cash', amountTenderedCents: tenderedCents, surchargeCents: computedSurchargeCents });
    } else if (method === 'eftpos') {
      handleLinklyInitiate().catch(() => {});
    } else if (method === 'split') {
      onConfirm({
        method: 'split',
        amountTenderedCents: splitCommittedCents,
        surchargeCents: computedSurchargeCents,
        splitPayments: splitParts.map(p => ({ method: p.method, amountCents: p.amountCents, linklySessionId: p.linklySessionId ?? null })),
      });
    }
  };

  const isSplitCardBusy = splitCardStep === 'initiating' || splitCardStep === 'waiting';
  const isLinklyBusy = linklyStep === 'initiating' || linklyStep === 'waiting';
  const canClose = !loading && linklyStep === 'idle' && !isSplitCardBusy;

  void subtotalCents;
  void splitCardConsecErrors;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={canClose ? onClose : undefined}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.customiseRoot}>
          <View style={styles.sheetHeader}>
            <Pressable
              onPress={isLinklyBusy ? handleLinklyCancel : onClose}
              hitSlop={12}
              disabled={loading && !isLinklyBusy}
            >
              <Feather name={isLinklyBusy ? 'arrow-left' : 'x'} size={22} color={DARK} />
            </Pressable>
            <Text style={styles.sheetTitle}>Payment</Text>
            {method === 'eftpos' && linklyStep === 'idle' && terminalStatus !== null ? (
              <TouchableOpacity
                onPress={() => checkTerminalStatus().catch(() => {})}
                disabled={terminalStatus === 'checking'}
                hitSlop={8}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 5,
                  backgroundColor: terminalStatus === 'ok' ? '#F0FDF4' : terminalStatus === 'checking' ? '#F8FAFC' : '#FFFBEB',
                  borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5,
                  borderWidth: 1,
                  borderColor: terminalStatus === 'ok' ? '#BBF7D0' : terminalStatus === 'checking' ? BORDER : '#FDE68A',
                }}
              >
                {terminalStatus === 'checking' ? (
                  <ActivityIndicator size="small" color={MUTED} style={{ width: 8, height: 8 }} />
                ) : (
                  <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: terminalStatus === 'ok' ? '#16A34A' : '#F59E0B' }} />
                )}
                <Text style={{ fontSize: 11, fontWeight: '600', color: terminalStatus === 'ok' ? '#15803D' : terminalStatus === 'checking' ? MUTED : '#92400E' }}>
                  {terminalStatus === 'checking' ? 'Checking…' : terminalStatus === 'ok' ? 'Ready' : 'Not verified'}
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 22 }} />
            )}
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">

            {/* Totals strip */}
            <View style={{ backgroundColor: DARK, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 10 }}>
              {discount && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Feather name="tag" size={12} color="#4ADE80" />
                    <Text style={{ fontSize: 12, color: '#4ADE80', fontWeight: '600' }}>{discount.label}</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#4ADE80', fontWeight: '600' }}>–{fmtCents(discount.amountCents)}</Text>
                </View>
              )}
              {applicableSurcharges.map(s => {
                const amt = s.amountType === 'pct_basis_points' ? Math.round(totalCents * s.amountValue / 10000) : s.amountValue;
                return (
                  <View key={s.id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text style={{ fontSize: 12, color: '#FCA5A5' }}>{s.name}</Text>
                    <Text style={{ fontSize: 12, color: '#FCA5A5' }}>+{fmtCents(amt)}</Text>
                  </View>
                );
              })}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', borderTopWidth: applicableSurcharges.length > 0 || discount ? 1 : 0, borderTopColor: '#FFFFFF22', paddingTop: applicableSurcharges.length > 0 || discount ? 8 : 0, marginTop: applicableSurcharges.length > 0 || discount ? 4 : 0 }}>
                <Text style={{ fontSize: 13, color: '#FFFFFFAA', fontWeight: '500' }}>TOTAL DUE</Text>
                <Text style={{ fontSize: 26, color: WHITE, fontWeight: '800', letterSpacing: -0.5 }}>{fmtCents(chargeTotalCents)}</Text>
              </View>
            </View>

            {/* Offline notice */}
            {!isOnline && (
              <View style={styles.offlinePayNotice}>
                <Feather name="wifi-off" size={14} color="#92400E" />
                <Text style={styles.offlinePayNoticeText}>
                  No connection — EFTPOS unavailable. Cash only. Order will be queued when back online.
                </Text>
              </View>
            )}
            {!cashEnabled && (
              <View style={[styles.offlinePayNotice, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                <Feather name="alert-circle" size={14} color={CHERRY} />
                <Text style={[styles.offlinePayNoticeText, { color: '#991B1B' }]}>
                  Enter the opening cash float in Register before taking cash payments.
                </Text>
              </View>
            )}

            {/* Method selector */}
            <View style={styles.methodRow}>
              <Pressable
                onPress={() => !isOnline ? undefined : setMethod('eftpos')}
                style={[styles.methodBtn, method === 'eftpos' && styles.methodBtnActive, !isOnline && styles.methodBtnDisabled]}
              >
                <Feather name="credit-card" size={18} color={method === 'eftpos' ? WHITE : !isOnline ? MUTED : MID} />
                <Text style={[styles.methodBtnText, method === 'eftpos' && { color: WHITE }, !isOnline && { color: MUTED }]}>EFTPOS</Text>
              </Pressable>
              <Pressable
                onPress={() => { if (!cashEnabled) return; setMethod('cash'); setTendered(''); }}
                style={[styles.methodBtn, method === 'cash' && styles.methodBtnActive, !cashEnabled && styles.methodBtnDisabled]}
              >
                <Feather name="dollar-sign" size={18} color={method === 'cash' ? WHITE : !cashEnabled ? MUTED : MID} />
                <Text style={[styles.methodBtnText, method === 'cash' && { color: WHITE }, !cashEnabled && { color: MUTED }]}>Cash</Text>
              </Pressable>
              <Pressable
                onPress={() => { if (!isOnline) return; setMethod('split'); setSplitParts([]); setSplitInput(''); }}
                style={[styles.methodBtn, method === 'split' && styles.methodBtnActive, !isOnline && styles.methodBtnDisabled]}
              >
                <Feather name="git-branch" size={16} color={method === 'split' ? WHITE : !isOnline ? MUTED : MID} />
                <Text style={[styles.methodBtnText, method === 'split' && { color: WHITE }, !isOnline && { color: MUTED }]}>Split</Text>
              </Pressable>
            </View>

            {/* Cash layout */}
            {method === 'cash' && (
              <View style={{ marginTop: 8, flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ backgroundColor: DARK, borderRadius: 14, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16, flex: 1, marginBottom: 10 }}>
                    <Text style={{ fontSize: 10, color: MUTED, fontWeight: '700', letterSpacing: 1.4, marginBottom: 6 }}>TENDERED</Text>
                    <Text style={{ fontSize: 34, color: WHITE, fontWeight: '800', letterSpacing: -1 }} numberOfLines={1} adjustsFontSizeToFit>
                      {tendered ? `$${tendered}` : '$–'}
                    </Text>
                    {tenderedCents > 0 && tenderedCents >= chargeTotalCents && (
                      <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: '#1E293B', paddingTop: 12 }}>
                        <Text style={{ fontSize: 10, color: '#4ADE80', fontWeight: '700', letterSpacing: 1, marginBottom: 4 }}>CHANGE DUE</Text>
                        <Text style={{ fontSize: 26, color: '#4ADE80', fontWeight: '800', letterSpacing: -0.5 }}>{fmtCents(cashChangeCents)}</Text>
                      </View>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    <Pressable onPress={() => setTendered((chargeTotalCents / 100).toFixed(2))} style={{ paddingVertical: 9, paddingHorizontal: 12, backgroundColor: '#EFF6FF', borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE' }}>
                      <Text style={{ fontSize: 13, color: BLUE, fontWeight: '700' }}>Exact</Text>
                    </Pressable>
                    {roundUpPresets.map(d => (
                      <Pressable key={d} onPress={() => setTendered(String(d))} style={{ paddingVertical: 9, paddingHorizontal: 12, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: BORDER }}>
                        <Text style={{ fontSize: 13, color: DARK, fontWeight: '700' }}>${d}</Text>
                      </Pressable>
                    ))}
                    {tendered !== '' && (
                      <Pressable onPress={() => setTendered('')} style={{ paddingVertical: 9, paddingHorizontal: 12, backgroundColor: '#FFF1F2', borderRadius: 10, borderWidth: 1, borderColor: '#FECACA' }}>
                        <Text style={{ fontSize: 13, color: CHERRY, fontWeight: '600' }}>Clear</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
                {/* Numpad */}
                <View style={{ width: 216, gap: 7 }}>
                  {[['7','8','9'],['4','5','6'],['1','2','3'],['.','0','backspace']].map((row, ri) => (
                    <View key={ri} style={{ flexDirection: 'row', gap: 7 }}>
                      {row.map(k => (
                        <Pressable
                          key={k}
                          onPress={() => handleKeypad(k, setTendered, tendered)}
                          style={({ pressed }) => ({
                            flex: 1, height: 62,
                            backgroundColor: pressed ? '#CBD5E1' : k === 'backspace' ? '#FFF1F2' : '#F1F5F9',
                            borderRadius: 12, borderWidth: 1,
                            borderColor: k === 'backspace' ? '#FECACA' : '#E2E8F0',
                            justifyContent: 'center', alignItems: 'center',
                          })}
                        >
                          {k === 'backspace'
                            ? <Feather name="delete" size={20} color={CHERRY} />
                            : <Text style={{ fontSize: 24, fontWeight: '600', color: DARK }}>{k}</Text>
                          }
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Split layout */}
            {method === 'split' && (
              <View style={{ marginTop: 8, flexDirection: 'row', gap: 10, alignItems: 'stretch' }}>
                <View style={{ flex: 1 }}>
                  <View style={{ backgroundColor: DARK, borderRadius: 14, paddingHorizontal: 14, paddingTop: 14, paddingBottom: 14, flex: 1, marginBottom: 10 }}>
                    <Text style={{ fontSize: 10, color: MUTED, fontWeight: '700', letterSpacing: 1.4, marginBottom: 10 }}>SPLIT PAYMENTS</Text>
                    {splitParts.map((part, i) => (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: part.method === 'eftpos' ? BLUE : '#4ADE80', alignItems: 'center', justifyContent: 'center' }}>
                            <Feather name={part.method === 'eftpos' ? 'credit-card' : 'check'} size={9} color="#0F172A" />
                          </View>
                          <Text style={{ fontSize: 13, color: '#94A3B8', fontWeight: '500' }}>
                            Person {i + 1}{'  '}<Text style={{ fontSize: 11, color: part.method === 'eftpos' ? BLUE : '#4ADE80' }}>{part.method === 'eftpos' ? 'Card' : 'Cash'}</Text>
                          </Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={{ fontSize: 15, color: WHITE, fontWeight: '700' }}>{fmtCents(part.amountCents)}</Text>
                          <Pressable onPress={() => setSplitParts(ps => ps.filter((_, j) => j !== i))} hitSlop={8}>
                            <Feather name="x" size={14} color="#475569" />
                          </Pressable>
                        </View>
                      </View>
                    ))}
                    {splitRemainingCents > 0 && !isSplitCardBusy && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: splitParts.length > 0 ? 8 : 0, borderTopWidth: splitParts.length > 0 ? 1 : 0, borderTopColor: '#1E293B' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                          <View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#475569' }} />
                          <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '500' }}>Person {splitParts.length + 1}</Text>
                        </View>
                        <Text style={{ fontSize: 15, color: splitCurrentCents > 0 ? WHITE : '#475569', fontWeight: '700' }}>
                          {splitCurrentCents > 0 ? fmtCents(splitCurrentCents) : '—'}
                        </Text>
                      </View>
                    )}
                    {isSplitCardBusy && (
                      <View style={{ paddingTop: splitParts.length > 0 ? 8 : 0, borderTopWidth: splitParts.length > 0 ? 1 : 0, borderTopColor: '#1E293B', alignItems: 'center', gap: 8 }}>
                        <ActivityIndicator size="small" color={BLUE} />
                        <Text style={{ fontSize: 12, color: WHITE, fontWeight: '600', textAlign: 'center' }}>{splitCardText || 'Connecting…'}</Text>
                        <Text style={{ fontSize: 11, color: MUTED, textAlign: 'center' }}>Present card to terminal</Text>
                        <Pressable onPress={handleSplitCardCancel} style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FFF1F2' }}>
                          <Text style={{ fontSize: 12, color: CHERRY, fontWeight: '600' }}>Cancel</Text>
                        </Pressable>
                      </View>
                    )}
                    {splitCardStep === 'declined' && (
                      <View style={{ paddingTop: 8, borderTopWidth: 1, borderTopColor: '#1E293B', alignItems: 'center', gap: 8 }}>
                        <Feather name="x-circle" size={22} color={CHERRY} />
                        <Text style={{ fontSize: 12, color: CHERRY, fontWeight: '600' }}>Card Declined</Text>
                        {!!splitCardText && <Text style={{ fontSize: 11, color: MUTED, textAlign: 'center' }}>{splitCardText}</Text>}
                        <Pressable onPress={() => { setSplitCardStep('idle'); setSplitCardText(''); }} style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: '#F8FAFC' }}>
                          <Text style={{ fontSize: 12, color: DARK, fontWeight: '600' }}>Try Again</Text>
                        </Pressable>
                      </View>
                    )}
                    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: '#1E293B', paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: splitRemainingCents === 0 ? '#4ADE80' : MUTED, fontWeight: '700', letterSpacing: 0.5 }}>
                        {splitRemainingCents === 0 ? '✓ FULLY COLLECTED' : 'REMAINING'}
                      </Text>
                      {splitRemainingCents > 0 && (
                        <Text style={{ fontSize: 18, color: WHITE, fontWeight: '800' }}>{fmtCents(splitRemainingCents)}</Text>
                      )}
                    </View>
                  </View>
                  {!isSplitCardBusy && splitRemainingCents > 0 && (
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                      {[2, 3, 4, 5].map(n => (
                        <Pressable key={n} onPress={() => setSplitInput((splitRemainingCents / n / 100).toFixed(2))} style={{ paddingVertical: 8, paddingHorizontal: 11, backgroundColor: '#F8FAFC', borderRadius: 10, borderWidth: 1, borderColor: BORDER }}>
                          <Text style={{ fontSize: 12, color: MID, fontWeight: '700' }}>÷{n}</Text>
                        </Pressable>
                      ))}
                      <Pressable onPress={() => setSplitInput((splitRemainingCents / 100).toFixed(2))} style={{ paddingVertical: 8, paddingHorizontal: 11, backgroundColor: '#EFF6FF', borderRadius: 10, borderWidth: 1, borderColor: '#BFDBFE' }}>
                        <Text style={{ fontSize: 12, color: BLUE, fontWeight: '700' }}>All</Text>
                      </Pressable>
                    </View>
                  )}
                  {splitCurrentCents > 0 && splitRemainingCents > 0 && !isSplitCardBusy && splitCardStep !== 'declined' && (
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Pressable
                        onPress={() => {
                          if (!cashEnabled) return;
                          const adding = Math.min(splitCurrentCents, splitRemainingCents);
                          setSplitParts(ps => [...ps, { amountCents: adding, method: 'cash' }]);
                          setSplitInput('');
                        }}
                        style={{ flex: 1, backgroundColor: cashEnabled ? '#ECFDF5' : '#E2E8F0', borderRadius: 10, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: cashEnabled ? '#BBF7D0' : BORDER }}
                      >
                        <Feather name="dollar-sign" size={14} color={cashEnabled ? '#16A34A' : MUTED} />
                        <Text style={{ fontSize: 13, color: cashEnabled ? '#16A34A' : MUTED, fontWeight: '700' }}>Cash</Text>
                      </Pressable>
                      <Pressable
                        onPress={handleSplitCardPayment}
                        style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 10, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#BFDBFE' }}
                      >
                        <Feather name="credit-card" size={14} color={BLUE} />
                        <Text style={{ fontSize: 13, color: BLUE, fontWeight: '700' }}>Card</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
                {/* Numpad */}
                <View style={{ width: 216, gap: 7 }}>
                  {[['7','8','9'],['4','5','6'],['1','2','3'],['.','0','backspace']].map((row, ri) => (
                    <View key={ri} style={{ flexDirection: 'row', gap: 7 }}>
                      {row.map(k => (
                        <Pressable
                          key={k}
                          onPress={() => handleKeypad(k, setSplitInput, splitInput)}
                          style={({ pressed }) => ({
                            flex: 1, height: 62,
                            backgroundColor: pressed ? '#CBD5E1' : k === 'backspace' ? '#FFF1F2' : '#F1F5F9',
                            borderRadius: 12, borderWidth: 1,
                            borderColor: k === 'backspace' ? '#FECACA' : '#E2E8F0',
                            justifyContent: 'center', alignItems: 'center',
                          })}
                        >
                          {k === 'backspace'
                            ? <Feather name="delete" size={20} color={CHERRY} />
                            : <Text style={{ fontSize: 24, fontWeight: '600', color: DARK }}>{k}</Text>
                          }
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* EFTPOS status */}
            {method === 'eftpos' && linklyStep !== 'idle' && (
              <View style={[styles.eftposInstructions, { marginTop: 12 }]}>
                {(linklyStep === 'initiating' || linklyStep === 'waiting') && (
                  <>
                    <ActivityIndicator size="large" color={BLUE} />
                    <Text style={styles.eftposText}>{linklyText || 'Connecting…'}</Text>
                    <Text style={styles.eftposSubText}>Present card or device to the terminal</Text>
                    {linklyConsecErrors >= LINKLY_POLL_CONFIG.BACKOFF_MAX_CONSECUTIVE && (
                      <View style={{ width: '100%', backgroundColor: '#FEF3C7', borderRadius: 10, borderWidth: 1, borderColor: '#FCD34D', padding: 12, marginTop: 10, gap: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Feather name="alert-triangle" size={16} color="#92400E" />
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#92400E', flex: 1 }}>Terminal not responding — check connection</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => { linklyPollRef.current?.resetAndRetry(); }}
                          style={{ backgroundColor: '#92400E', borderRadius: 8, paddingVertical: 8, alignItems: 'center' }}
                          activeOpacity={0.8}
                        >
                          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>Retry Now</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    <TouchableOpacity onPress={handleLinklyCancel} style={[styles.presetBtn, { borderColor: '#FECACA', backgroundColor: '#FFF1F2', marginTop: 8 }]} activeOpacity={0.75}>
                      <Text style={[styles.presetBtnText, { color: CHERRY }]}>Cancel Transaction</Text>
                    </TouchableOpacity>
                  </>
                )}
                {linklyStep === 'approved' && (
                  <>
                    <Feather name="check-circle" size={40} color="#16A34A" />
                    <Text style={[styles.eftposText, { color: '#16A34A' }]}>Payment Approved</Text>
                  </>
                )}
                {linklyStep === 'declined' && (
                  <>
                    <Feather name="x-circle" size={40} color={CHERRY} />
                    <Text style={[styles.eftposText, { color: CHERRY }]}>Payment Declined</Text>
                    {!!linklyText && <Text style={styles.eftposSubText}>{linklyText}</Text>}
                    <TouchableOpacity onPress={() => { setLinklyStep('idle'); setLinklyText(''); setLinklyConsecErrors(0); }} style={styles.presetBtn} activeOpacity={0.75}>
                      <Text style={styles.presetBtnText}>Try Again</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

          </ScrollView>

          {/* Footer */}
          <View style={styles.sheetFooter}>
            {loading || isLinklyBusy ? (
              <View style={[styles.addToOrderBtn, { justifyContent: 'center' }]}>
                <ActivityIndicator color={WHITE} />
              </View>
            ) : method === 'eftpos' && linklyStep === 'idle' ? (
              <TouchableOpacity onPress={handleConfirm} style={styles.addToOrderBtn} activeOpacity={0.85}>
                <Feather name="credit-card" size={17} color={WHITE} />
                <Text style={styles.addToOrderBtnText}>Confirm EFTPOS · {fmtCents(chargeTotalCents)}</Text>
              </TouchableOpacity>
            ) : method === 'cash' ? (
              <TouchableOpacity onPress={handleConfirm} style={[styles.addToOrderBtn, !cashOk && { opacity: 0.5 }]} disabled={!cashOk || loading} activeOpacity={0.85}>
                <Feather name="dollar-sign" size={17} color={WHITE} />
                <Text style={styles.addToOrderBtnText}>Confirm Cash · {fmtCents(chargeTotalCents)}</Text>
              </TouchableOpacity>
            ) : method === 'split' ? (
              <TouchableOpacity onPress={handleConfirm} style={[styles.addToOrderBtn, !splitOk && { opacity: 0.5 }]} disabled={!splitOk || loading} activeOpacity={0.85}>
                <Feather name="git-branch" size={17} color={WHITE} />
                <Text style={styles.addToOrderBtnText}>Confirm Split · {fmtCents(chargeTotalCents)}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

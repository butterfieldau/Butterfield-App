import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type LinklyConfig } from '@/lib/api';
import { sendLinklyReceiptPrint } from '@/lib/printer';

const CARD = '#FFFFFF';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE = '#1493FF';
const INDIGO = '#4F46E5';
const GREEN = '#16A34A';
const RED = '#EF4444';

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} ${diffHr === 1 ? 'hour' : 'hours'} ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
}

type Props = {
  title?: string;
  subtitle?: string;
  onLock?: () => void;
  printerContext?: 'director' | 'shop_display';
};

export default function LinklyCloudSettingsCard({
  title = 'Linkly Cloud',
  subtitle = 'Cloud terminal connection for EFTPOS payments',
  onLock,
  printerContext = 'director',
}: Props) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<{ data: LinklyConfig }>({
    queryKey: ['linkly-config'],
    queryFn: () => api.pos.getLinklyConfig(),
    staleTime: 30_000,
  });
  const { data: directorSettingsData } = useQuery({
    queryKey: ['director-settings-linkly-printer'],
    queryFn: () => api.director.settings(),
    enabled: printerContext === 'director',
    staleTime: 60_000,
  });
  const { data: shopDisplayPrinterData } = useQuery({
    queryKey: ['shop-display-linkly-printer'],
    queryFn: () => api.shopDisplay.getPrinterConfig(),
    enabled: printerContext === 'shop_display',
    staleTime: 60_000,
  });

  const cfg = data?.data;
  const [enabled, setEnabled] = useState(false);
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pairingCode, setPairingCode] = useState('');
  const [posName, setPosName] = useState('');
  const [posVersion, setPosVersion] = useState('');
  const [posId, setPosId] = useState('');
  const [posVendorId, setPosVendorId] = useState('');
  const [terminalId, setTerminalId] = useState('');
  const [saving, setSaving] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [refreshingToken, setRefreshingToken] = useState(false);
  const [runningSettlement, setRunningSettlement] = useState<'S' | 'P' | null>(null);
  const [runningReprint, setRunningReprint] = useState<'pos' | 'pinpad' | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!cfg) return;
    setEnabled(cfg.linklyEnabled ?? false);
    setEnvironment(cfg.environment ?? 'sandbox');
    setUsername(cfg.linklyUsername ?? '');
    setPairingCode(cfg.linklyPairingCode ?? '');
    setPosName(cfg.linklyPosName ?? 'Butterfield POS');
    setPosVersion(cfg.linklyPosVersion ?? '1.3.1');
    setPosId(cfg.linklyPosId ?? '');
    setPosVendorId(cfg.linklyPosVendorId ?? '');
    setTerminalId(cfg.linklyTerminalId ?? '');
  }, [cfg]);

  const invalidate = async () => {
    await qc.invalidateQueries({ queryKey: ['linkly-config'] });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.pos.saveLinklyConfig({
        linklyEnabled: enabled,
        environment,
        linklyUsername: username.trim() || undefined,
        linklyPassword: password.trim() || undefined,
        linklyPairingCode: pairingCode.trim() || undefined,
        linklyPosName: posName.trim() || undefined,
        linklyPosVersion: posVersion.trim() || undefined,
        linklyPosId: posId.trim() || undefined,
        linklyPosVendorId: posVendorId.trim() || undefined,
      });
      setPassword('');
      await invalidate();
      Alert.alert('Saved', 'Linkly settings were updated.');
    } catch (error: any) {
      Alert.alert('Could Not Save', error?.message ?? 'Something went wrong while saving Linkly.');
    } finally {
      setSaving(false);
    }
  };

  const pairPinPad = async () => {
    setPairing(true);
    try {
      const result = await api.pos.pairLinkly();
      if (result.terminalId) setTerminalId(result.terminalId);
      await invalidate();
      Alert.alert('Paired', result.terminalId ? `Terminal ${result.terminalId} is paired.` : 'PIN pad pairing completed.');
    } catch (error: any) {
      Alert.alert('Pairing Failed', error?.message ?? 'The PIN pad could not be paired.');
    } finally {
      setPairing(false);
    }
  };

  const refreshToken = async () => {
    setRefreshingToken(true);
    try {
      const result = await api.pos.refreshLinklyToken();
      await invalidate();
      Alert.alert(
        'Token Ready',
        result.tokenExpiresAt
          ? `The Linkly token is ready until ${new Date(result.tokenExpiresAt).toLocaleString()}.`
          : 'The Linkly token was refreshed.',
      );
    } catch (error: any) {
      Alert.alert('Token Failed', error?.message ?? 'The Linkly token could not be refreshed.');
    } finally {
      setRefreshingToken(false);
    }
  };

  const runSettlement = async (settlementType: 'S' | 'P') => {
    setRunningSettlement(settlementType);
    try {
      const result = await api.pos.runLinklySettlement(settlementType);
      Alert.alert(
        result.data.success ? 'Settlement Complete' : 'Settlement Response',
        [
          settlementType === 'S' ? 'Run Settlement' : 'Pre-Settlement Totals',
          result.data.responseCode ? `Code: ${result.data.responseCode}` : null,
          result.data.responseText || null,
        ].filter(Boolean).join('\n'),
      );
    } catch (error: any) {
      Alert.alert('Settlement Failed', error?.message ?? 'Linkly settlement could not be completed.');
    } finally {
      setRunningSettlement(null);
    }
  };

  const runReprint = async (mode: 'pos' | 'pinpad') => {
    setRunningReprint(mode);
    try {
      const result = await api.pos.runLinklyReprint(mode);
      let finalTitle = mode === 'pinpad' ? 'PIN Pad Reprint Sent' : 'Last Receipt Retrieved';
      if (mode === 'pos' && result.data.receiptText?.length) {
        const printerIp = printerContext === 'shop_display'
          ? shopDisplayPrinterData?.data?.printerIp?.trim() ?? ''
          : (directorSettingsData?.data?.printer_ip ?? '').trim();
        const printerPort = printerContext === 'shop_display'
          ? shopDisplayPrinterData?.data?.printerPort ?? 9100
          : parseInt(directorSettingsData?.data?.printer_port ?? '9100', 10);
        const printerBrand = printerContext === 'shop_display'
          ? (shopDisplayPrinterData?.data?.printerBrand ?? 'epson')
          : ((directorSettingsData?.data?.printer_brand as 'epson' | 'star' | undefined) ?? 'epson');

        if (!printerIp) {
          finalTitle = 'Last Receipt Retrieved';
          const receiptText = result.data.receiptText.join('\n');
          Alert.alert(
            'Receipt Retrieved',
            `The Linkly receipt came back, but no printer is configured for this device.\n\n${receiptText}`.slice(0, 1800),
          );
          setRunningReprint(null);
          return;
        } else {
          await sendLinklyReceiptPrint(
            {
              title: 'Linkly Receipt',
              lines: result.data.receiptText,
              printerBrand,
            },
            printerIp,
            Number.isFinite(printerPort) ? printerPort : 9100,
            printerContext === 'shop_display' ? api.shopDisplay.printerBytes : api.director.printerBytes,
          );
          finalTitle = 'Last Receipt Printed';
        }
      }
      const receiptText = result.data.receiptText?.length
        ? `\n\n${result.data.receiptText.join('\n')}`
        : '';
      Alert.alert(
        finalTitle,
        `${result.data.responseText || 'Done.'}${receiptText}`.slice(0, 1800),
      );
    } catch (error: any) {
      Alert.alert('Receipt Reprint Failed', error?.message ?? 'The last receipt could not be retrieved.');
    } finally {
      setRunningReprint(null);
    }
  };

  if (isLoading) {
    return (
      <View style={[s.card, { alignItems: 'center', paddingVertical: 28 }]}>
        <ActivityIndicator color={INDIGO} />
      </View>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.headerRow}>
        <View style={s.headerIcon}>
          <Feather name="credit-card" size={18} color={INDIGO} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{title}</Text>
          <Text style={s.subtitle}>{subtitle}</Text>
        </View>
        {onLock ? (
          <Pressable onPress={onLock} style={s.lockBtn} hitSlop={10}>
            <Feather name="lock" size={15} color={MUTED} />
          </Pressable>
        ) : null}
      </View>

      <View style={s.divider} />

      <View style={s.switchRow}>
        <Text style={s.fieldLabel}>Enable Linkly on this device</Text>
        <Switch value={enabled} onValueChange={setEnabled} trackColor={{ true: BLUE }} thumbColor="#fff" />
      </View>

      <Text style={s.sectionLabel}>Environment</Text>
      <View style={s.segmentRow}>
        {(['sandbox', 'production'] as const).map(mode => {
          const active = environment === mode;
          return (
            <Pressable
              key={mode}
              onPress={() => setEnvironment(mode)}
              style={[s.segmentBtn, active && s.segmentBtnActive]}
            >
              <Text style={[s.segmentText, active && s.segmentTextActive]}>
                {mode === 'sandbox' ? 'Sandbox' : 'Production'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={s.sectionLabel}>Credentials</Text>
      <Field label="Username" value={username} onChangeText={setUsername} placeholder="Linkly username" />
      <Text style={s.inputLabel}>Password {cfg?.hasPassword && !password ? '(saved)' : ''}</Text>
      <View style={s.passwordRow}>
        <TextInput
          style={[s.input, { flex: 1 }]}
          value={password}
          onChangeText={setPassword}
          placeholder={cfg?.hasPassword ? '••••••••' : 'Linkly password'}
          placeholderTextColor={MUTED}
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable onPress={() => setShowPassword(v => !v)} style={s.eyeBtn} hitSlop={8}>
          <Feather name={showPassword ? 'eye-off' : 'eye'} size={16} color={MUTED} />
        </Pressable>
      </View>
      <Field label="Pair Code" value={pairingCode} onChangeText={setPairingCode} placeholder="PIN pad pair code" />

      <Text style={s.sectionLabel}>POS Identity</Text>
      <Field label="POS Name" value={posName} onChangeText={setPosName} placeholder="Butterfield POS" />
      <Field label="POS Version" value={posVersion} onChangeText={setPosVersion} placeholder="1.3.1" />
      <Field label="POS ID" value={posId} onChangeText={setPosId} placeholder="Per-device UUID" />
      <Field label="POS Vendor ID" value={posVendorId} onChangeText={setPosVendorId} placeholder="Vendor UUID" />

      <View style={s.statusCard}>
        <StatusRow label="Configured" ok={cfg?.linklyConfigComplete ?? false} text={cfg?.linklyConfigComplete ? 'Ready' : 'Missing details'} />
        <StatusRow
          label="Paired"
          ok={cfg?.isPaired ?? false}
          text={
            cfg?.isPaired && cfg?.lastPairedAt
              ? `Paired ${relativeTime(cfg.lastPairedAt)}`
              : cfg?.isPaired
              ? 'PIN pad paired'
              : cfg?.lastPairedAt
              ? `Not paired · last paired ${relativeTime(cfg.lastPairedAt)}`
              : 'Not yet paired'
          }
        />
        <StatusRow
          label="Token"
          ok={!!cfg?.tokenExpiresAt}
          text={cfg?.tokenExpiresAt ? `Valid until ${new Date(cfg.tokenExpiresAt).toLocaleString()}` : 'No active token'}
        />
        {!!terminalId && <StatusRow label="Terminal" ok text={terminalId} />}
      </View>

      <View style={s.actionGrid}>
        <ActionButton
          label={pairing ? 'Pairing…' : 'Pair PIN Pad'}
          icon="link"
          busy={pairing}
          onPress={pairPinPad}
        />
        <ActionButton
          label={refreshingToken ? 'Refreshing…' : 'Refresh Token'}
          icon="refresh-cw"
          busy={refreshingToken}
          onPress={refreshToken}
        />
        <ActionButton
          label={runningSettlement === 'S' ? 'Running…' : 'Run Settlement'}
          icon="archive"
          onPress={() => runSettlement('S')}
          busy={runningSettlement === 'S'}
        />
        <ActionButton
          label={runningSettlement === 'P' ? 'Running…' : 'Pre-Settlement Totals'}
          icon="bar-chart-2"
          onPress={() => runSettlement('P')}
          busy={runningSettlement === 'P'}
          tone="muted"
        />
        <ActionButton
          label={runningReprint === 'pos' ? 'Loading…' : 'Reprint Last Receipt'}
          icon="printer"
          onPress={() => runReprint('pos')}
          busy={runningReprint === 'pos'}
        />
        <ActionButton
          label={runningReprint === 'pinpad' ? 'Sending…' : 'Print from PIN Pad'}
          icon="credit-card"
          onPress={() => runReprint('pinpad')}
          busy={runningReprint === 'pinpad'}
          tone="muted"
        />
      </View>

      <View style={s.footerRow}>
        <Pressable
          onPress={save}
          disabled={saving || pairing || refreshingToken}
          style={[s.saveBtn, (saving || pairing || refreshingToken) && s.disabledBtn]}
        >
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Feather name="save" size={15} color="#fff" />}
          <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save Linkly'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <>
      <Text style={s.inputLabel}>{label}</Text>
      <TextInput
        style={s.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={MUTED}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </>
  );
}

function StatusRow({ label, ok, text }: { label: string; ok: boolean; text: string }) {
  return (
    <View style={s.statusRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Feather name={ok ? 'check-circle' : 'alert-circle'} size={14} color={ok ? GREEN : RED} />
        <Text style={s.statusLabel}>{label}</Text>
      </View>
      <Text style={s.statusText}>{text}</Text>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  busy,
  tone = 'primary',
}: {
  label: string;
  icon: keyof typeof Feather.glyphMap;
  onPress: () => void;
  busy?: boolean;
  tone?: 'primary' | 'muted';
}) {
  const muted = tone === 'muted';
  return (
    <Pressable onPress={onPress} style={[s.actionBtn, muted && s.actionBtnMuted]}>
      {busy ? <ActivityIndicator color={muted ? TEXT : INDIGO} size="small" /> : <Feather name={icon} size={15} color={muted ? TEXT : INDIGO} />}
      <Text style={[s.actionBtnText, muted && s.actionBtnTextMuted]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: CARD,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '700', color: TEXT },
  subtitle: { fontSize: 12, color: MUTED, marginTop: 2 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: BORDER },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldLabel: { fontSize: 14, fontWeight: '600', color: TEXT },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: MUTED, marginTop: 6 },
  segmentRow: { flexDirection: 'row', gap: 8 },
  segmentBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#F8FAFC',
    paddingVertical: 11,
    alignItems: 'center',
  },
  segmentBtnActive: {
    borderColor: BLUE,
    backgroundColor: '#EFF6FF',
  },
  segmentText: { fontSize: 13, fontWeight: '600', color: MUTED },
  segmentTextActive: { color: BLUE },
  inputLabel: { fontSize: 12, fontWeight: '600', color: TEXT, marginTop: 2 },
  input: {
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FBFDFF',
    paddingHorizontal: 14,
    color: TEXT,
  },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FBFDFF',
  },
  statusCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#F8FAFC',
    padding: 12,
    gap: 10,
    marginTop: 4,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  statusLabel: { fontSize: 13, fontWeight: '600', color: TEXT },
  statusText: { flex: 1, textAlign: 'right', fontSize: 12, color: MUTED },
  actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 2 },
  actionBtn: {
    minWidth: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#EEF2FF',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  actionBtnMuted: {
    borderColor: BORDER,
    backgroundColor: '#F8FAFC',
  },
  actionBtnText: { fontSize: 13, fontWeight: '700', color: INDIGO },
  actionBtnTextMuted: { color: TEXT },
  footerRow: { marginTop: 6 },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: BLUE,
    paddingVertical: 14,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  disabledBtn: { opacity: 0.6 },
});

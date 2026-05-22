import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

const BG = '#F5F6FA';
const CARD = '#FFFFFF';
const BLUE = '#1493FF';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN = '#22C55E';
const RED = '#EF4444';
const AMBER = '#F59E0B';

const AUTO_CREATE_OPTIONS = [
  { value: 'manual', label: 'Manual' },
  { value: 'approved', label: 'On approval' },
  { value: 'completed', label: 'On completion' },
];

const EMAIL_MODE_OPTIONS = [
  { value: 'manual', label: 'Manual send' },
  { value: 'xero_email', label: 'Send via Xero' },
];

function FieldLabel({ children }: { children: string }) {
  return <Text style={{ fontSize: 12, fontWeight: '700', color: MUTED, letterSpacing: 0.8 }}>{children}</Text>;
}

function StatusBadge({ status }: { status?: string | null }) {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    disconnected: { bg: '#FEE2E2', color: '#991B1B', label: 'Disconnected' },
    connected: { bg: '#DCFCE7', color: '#166534', label: 'Connected' },
    sync_failed: { bg: '#FEE2E2', color: '#991B1B', label: 'Sync Failed' },
  };
  const cfg = map[String(status || '').toLowerCase()] ?? { bg: '#DBEAFE', color: '#1E40AF', label: status || 'Unknown' };
  return (
    <View style={{ backgroundColor: cfg.bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color: cfg.color, fontSize: 12, fontWeight: '700' }}>{cfg.label}</Text>
    </View>
  );
}

function MappingRow({ product, xeroItems }: { product: any; xeroItems: any[] }) {
  const qc = useQueryClient();
  const [itemCode, setItemCode] = useState(product.xeroItemCode ?? product.sku ?? '');
  const [taxType, setTaxType] = useState(product.xeroTaxType ?? '');
  const suggestion = useMemo(() => {
    const byCode = xeroItems.find((item) => item.Code && itemCode && item.Code === itemCode);
    if (byCode) return byCode;
    if (product.name) {
      return xeroItems.find((item) => String(item.Name || '').trim().toLowerCase() === String(product.name).trim().toLowerCase());
    }
    return null;
  }, [itemCode, product.name, xeroItems]);

  const saveMut = useMutation({
    mutationFn: () => api.director.xero.updateProductMapping(product.id, {
      xeroItemId: suggestion?.ItemID ?? product.xeroItemId ?? null,
      xeroItemCode: itemCode.trim() || null,
      xeroTaxType: taxType.trim() || null,
    }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['xero-product-mappings'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert('Could not save mapping', e.message),
  });

  return (
    <View style={styles.card}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: TEXT, fontSize: 14, fontWeight: '700' }}>{product.name}</Text>
          <Text style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>
            SKU: {product.sku || 'None'}{suggestion?.Name ? ` · Xero match: ${suggestion.Name}` : ''}
          </Text>
        </View>
        <Pressable
          onPress={() => saveMut.mutate()}
          style={[styles.smallBtn, { backgroundColor: BLUE, opacity: saveMut.isPending ? 0.75 : 1 }]}
        >
          {saveMut.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.smallBtnText}>Save</Text>}
        </Pressable>
      </View>
      <View style={{ gap: 8 }}>
        <FieldLabel>Xero item code</FieldLabel>
        <TextInput style={styles.input} value={itemCode} onChangeText={setItemCode} placeholder="Use Xero item code or Butterfield SKU" placeholderTextColor={MUTED} />
      </View>
      <View style={{ gap: 8 }}>
        <FieldLabel>Xero tax type</FieldLabel>
        <TextInput style={styles.input} value={taxType} onChangeText={setTaxType} placeholder="e.g. OUTPUT" placeholderTextColor={MUTED} />
      </View>
    </View>
  );
}

export default function XeroSettingsTab() {
  const qc = useQueryClient();
  const { data: connectionData, isLoading, refetch } = useQuery({
    queryKey: ['xero-connection'],
    queryFn: () => api.director.xero.connection(),
  });
  const { data: mappingsData } = useQuery({
    queryKey: ['xero-product-mappings'],
    queryFn: () => api.director.xero.productMappings(),
    enabled: !!connectionData,
  });
  const { data: tenantsData, refetch: refetchTenants, isFetching: loadingTenants } = useQuery({
    queryKey: ['xero-tenants'],
    queryFn: () => api.director.xero.tenants(),
    enabled: false,
  });
  const { data: itemsData, refetch: refetchItems, isFetching: loadingItems } = useQuery({
    queryKey: ['xero-items'],
    queryFn: () => api.director.xero.items(),
    enabled: false,
  });
  const { data: syncLogsData, refetch: refetchSyncLogs } = useQuery({
    queryKey: ['xero-sync-logs'],
    queryFn: () => api.director.xero.syncLogs(),
    enabled: !!connectionData,
  });

  const connection = connectionData?.data;
  const mappings = mappingsData?.data ?? [];
  const xeroItems = itemsData?.data ?? [];
  const syncLogs = syncLogsData?.data ?? [];

  const [salesAccount, setSalesAccount] = useState('');
  const [taxType, setTaxType] = useState('OUTPUT');
  const [paymentTerms, setPaymentTerms] = useState('30 days');
  const [emailMode, setEmailMode] = useState('manual');
  const [autoCreate, setAutoCreate] = useState('manual');
  const [autoSend, setAutoSend] = useState(false);

  useEffect(() => {
    if (!connection) return;
    setSalesAccount(connection.defaultSalesAccountCode ?? '');
    setTaxType(connection.defaultTaxType ?? 'OUTPUT');
    setPaymentTerms(connection.defaultPaymentTerms ?? '30 days');
    setEmailMode(connection.invoiceEmailMode ?? 'manual');
    setAutoCreate(connection.autoCreateOnStatus ?? 'manual');
    setAutoSend(connection.autoSendOnAuthorise === true);
  }, [connection]);

  const connectMut = useMutation({
    mutationFn: () => api.director.xero.connectUrl(),
    onSuccess: async ({ data }) => {
      await Linking.openURL(data.url);
    },
    onError: (e: any) => Alert.alert('Could not connect Xero', e.message),
  });

  const disconnectMut = useMutation({
    mutationFn: () => api.director.xero.disconnect(),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['xero-connection'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert('Could not disconnect Xero', e.message),
  });

  const saveSettingsMut = useMutation({
    mutationFn: () => api.director.xero.updateSettings({
      defaultSalesAccountCode: salesAccount,
      defaultTaxType: taxType,
      defaultPaymentTerms: paymentTerms,
      invoiceEmailMode: emailMode,
      autoCreateOnStatus: autoCreate,
      autoSendOnAuthorise: autoSend,
    }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['xero-connection'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert('Could not save Xero settings', e.message),
  });

  const selectTenantMut = useMutation({
    mutationFn: (tenant: any) => api.director.xero.selectTenant({
      tenantId: tenant.tenantId,
      tenantName: tenant.tenantName,
      tenantType: tenant.tenantType,
    }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['xero-connection'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: any) => Alert.alert('Could not select organisation', e.message),
  });

  const testMut = useMutation({
    mutationFn: () => api.director.xero.test(),
    onSuccess: ({ data }) => {
      Alert.alert('Xero connected', data?.Name ? `Connected to ${data.Name}.` : 'Xero connection is working.');
    },
    onError: (e: any) => Alert.alert('Xero test failed', e.message),
  });

  if (isLoading) {
    return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  }

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <View style={[styles.card, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
        <Text style={{ color: BLUE, fontSize: 13, lineHeight: 18 }}>
          Xero is used only for wholesale invoicing. Retail customer orders stay on Butterfield’s normal receipt and order confirmation flow.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Connection</Text>
            <Text style={styles.sub}>Connect Butterfield to the correct Xero organisation from the backend only.</Text>
          </View>
          <StatusBadge status={connection?.status} />
        </View>
        <View style={{ gap: 8 }}>
          <Text style={styles.metaRow}>Organisation: {connection?.tenantName || 'Not selected yet'}</Text>
          <Text style={styles.metaRow}>Tenant ID: {connection?.tenantId || 'Not connected yet'}</Text>
          <Text style={styles.metaRow}>Last refreshed: {connection?.lastRefreshedAt ? new Date(connection.lastRefreshedAt).toLocaleString() : 'Never'}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
          <Pressable onPress={() => connectMut.mutate()} style={[styles.actionBtn, { backgroundColor: BLUE }]}>
            {connectMut.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.actionText}>Connect Xero</Text>}
          </Pressable>
          <Pressable onPress={() => disconnectMut.mutate()} style={[styles.actionBtn, { backgroundColor: RED }]}>
            <Text style={styles.actionText}>Disconnect</Text>
          </Pressable>
          <Pressable onPress={() => testMut.mutate()} style={[styles.actionBtn, { backgroundColor: GREEN }]}>
            <Text style={styles.actionText}>Test connection</Text>
          </Pressable>
          <Pressable onPress={() => { refetchTenants(); }} style={[styles.actionBtn, { backgroundColor: AMBER }]}>
            {loadingTenants ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.actionText}>Load organisations</Text>}
          </Pressable>
        </View>
      </View>

      {tenantsData?.data?.length ? (
        <View style={styles.card}>
          <Text style={styles.title}>Select Xero organisation</Text>
          <Text style={styles.sub}>Choose the exact Xero tenant Butterfield should sync wholesale invoices into.</Text>
          <View style={{ gap: 10 }}>
            {tenantsData.data.map((tenant: any) => {
              const active = connection?.tenantId === tenant.tenantId;
              return (
                <Pressable
                  key={tenant.id || tenant.tenantId}
                  onPress={() => selectTenantMut.mutate(tenant)}
                  style={[styles.tenantCard, active && { borderColor: BLUE, backgroundColor: '#EFF6FF' }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: TEXT, fontWeight: '700', fontSize: 14 }}>{tenant.tenantName}</Text>
                    <Text style={{ color: MUTED, fontSize: 12, marginTop: 3 }}>{tenant.tenantType} · {tenant.tenantId}</Text>
                  </View>
                  {active && <Feather name="check-circle" size={18} color={BLUE} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.title}>Invoice settings</Text>
        <Text style={styles.sub}>Set the default account, tax and sending behaviour for wholesale Xero invoices.</Text>
        <View style={{ gap: 12 }}>
          <View style={{ gap: 6 }}>
            <FieldLabel>Default sales account</FieldLabel>
            <TextInput style={styles.input} value={salesAccount} onChangeText={setSalesAccount} placeholder="e.g. 200" placeholderTextColor={MUTED} />
          </View>
          <View style={{ gap: 6 }}>
            <FieldLabel>Default GST / tax type</FieldLabel>
            <TextInput style={styles.input} value={taxType} onChangeText={setTaxType} placeholder="e.g. OUTPUT" placeholderTextColor={MUTED} />
          </View>
          <View style={{ gap: 6 }}>
            <FieldLabel>Default payment terms</FieldLabel>
            <TextInput style={styles.input} value={paymentTerms} onChangeText={setPaymentTerms} placeholder="e.g. 30 days" placeholderTextColor={MUTED} />
          </View>
          <View style={{ gap: 8 }}>
            <FieldLabel>Invoice sending</FieldLabel>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {EMAIL_MODE_OPTIONS.map((option) => {
                const active = emailMode === option.value;
                return (
                  <Pressable key={option.value} onPress={() => setEmailMode(option.value)} style={[styles.chip, active && styles.activeChip]}>
                    <Text style={[styles.chipText, active && styles.activeChipText]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={{ gap: 8 }}>
            <FieldLabel>Automatic invoice creation</FieldLabel>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {AUTO_CREATE_OPTIONS.map((option) => {
                const active = autoCreate === option.value;
                return (
                  <Pressable key={option.value} onPress={() => setAutoCreate(option.value)} style={[styles.chip, active && styles.activeChip]}>
                    <Text style={[styles.chipText, active && styles.activeChipText]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: TEXT, fontWeight: '700', fontSize: 14 }}>Auto send after authorise</Text>
              <Text style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>If enabled, Butterfield will attempt to email the invoice through Xero as soon as it becomes authorised.</Text>
            </View>
            <Switch value={autoSend} onValueChange={setAutoSend} trackColor={{ false: '#D1D5DB', true: BLUE }} thumbColor="#fff" />
          </View>
          <Pressable onPress={() => saveSettingsMut.mutate()} style={[styles.actionBtn, { backgroundColor: BLUE }]}>
            {saveSettingsMut.isPending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.actionText}>Save Xero settings</Text>}
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={styles.title}>Product mappings</Text>
            <Text style={styles.sub}>Butterfield wholesale products should map to a Xero item code where possible. If not, the default sales account is used.</Text>
          </View>
          <Pressable onPress={() => refetchItems()} style={[styles.smallBtn, { backgroundColor: BLUE }]}>
            {loadingItems ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.smallBtnText}>Load Xero items</Text>}
          </Pressable>
        </View>
        <View style={{ gap: 10 }}>
          {mappings.map((product: any) => (
            <MappingRow key={product.id} product={product} xeroItems={xeroItems} />
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Wholesale invoice report</Text>
        <View style={{ gap: 6 }}>
          <Text style={styles.metaRow}>Unsynced orders: {connection?.reports?.unsyncedOrders ?? 0}</Text>
          <Text style={styles.metaRow}>Synced invoices: {connection?.reports?.syncedInvoices ?? 0}</Text>
          <Text style={styles.metaRow}>Sent invoices: {connection?.reports?.sentInvoices ?? 0}</Text>
          <Text style={styles.metaRow}>Paid invoices: {connection?.reports?.paidInvoices ?? 0}</Text>
          <Text style={styles.metaRow}>Overdue invoices: {connection?.reports?.overdueInvoices ?? 0}</Text>
          <Text style={styles.metaRow}>Failed syncs: {connection?.reports?.failedSyncs ?? 0}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Sync logs</Text>
            <Text style={styles.sub}>Recent Xero connection, invoice, send and sync events for wholesale only.</Text>
          </View>
          <Pressable onPress={() => refetchSyncLogs()} style={[styles.smallBtn, { backgroundColor: BLUE }]}>
            <Text style={styles.smallBtnText}>Refresh</Text>
          </Pressable>
        </View>
        <View style={{ gap: 10 }}>
          {syncLogs.length === 0 ? (
            <Text style={styles.metaRow}>No Xero sync activity yet.</Text>
          ) : syncLogs.slice(0, 12).map((log: any) => (
            <View key={log.id} style={styles.logRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.logTitle}>{log.action.replace(/_/g, ' ')}</Text>
                <Text style={styles.logMeta}>{log.message || 'No message recorded.'}</Text>
                <Text style={styles.logMeta}>{new Date(log.createdAt).toLocaleString()}</Text>
              </View>
              <StatusBadge status={log.status} />
            </View>
          ))}
        </View>
      </View>

      <Pressable onPress={() => refetch()} style={[styles.card, { backgroundColor: BG }]}>
        <Text style={{ color: BLUE, fontWeight: '700', textAlign: 'center' }}>Refresh Xero status</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 16, gap: 12 },
  title: { fontSize: 16, fontWeight: '700', color: TEXT },
  sub: { fontSize: 12, color: MUTED, marginTop: 2, lineHeight: 18 },
  metaRow: { fontSize: 13, color: TEXT },
  actionBtn: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  actionText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  smallBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  input: { borderWidth: 1, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: TEXT, backgroundColor: '#FAFAFA' },
  chip: { borderWidth: 1, borderColor: BORDER, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: CARD },
  activeChip: { backgroundColor: BLUE, borderColor: BLUE },
  chipText: { color: MUTED, fontSize: 12, fontWeight: '700' },
  activeChipText: { color: '#fff' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 12, borderRadius: 14, backgroundColor: BG },
  tenantCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 14 },
  logRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 12, backgroundColor: '#FAFAFA' },
  logTitle: { color: TEXT, fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  logMeta: { color: MUTED, fontSize: 12, marginTop: 2, lineHeight: 17 },
});

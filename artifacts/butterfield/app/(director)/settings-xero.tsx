import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DirectorStandaloneScreen } from '@/components/DirectorStandaloneScreen';
import { api, type XeroIntegrationStatus } from '@/lib/api';

WebBrowser.maybeCompleteAuthSession();

const BG = '#EFF6FF';
const CARD = '#FFFFFF';
const TEXT = '#1C1C1E';
const MUTED = '#8E8E93';
const BORDER = '#E5E7EB';
const BLUE = '#1493FF';
const GREEN = '#22C55E';
const RED = '#EF4444';
const AMBER = '#F59E0B';
const NAVY = '#1A2B4A';

function formatAustralianDateTime(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function getErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  return error instanceof Error ? error.message : fallback;
}

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      <View style={{ gap: 12, marginTop: 12 }}>{children}</View>
    </View>
  );
}

export default function XeroSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['director-xero-status'],
    queryFn: () => api.director.xero.status(),
  });

  const integration = data?.data;
  const [accountCode, setAccountCode] = useState('');
  const [taxType, setTaxType] = useState('');
  const [invoiceStatus, setInvoiceStatus] = useState('AUTHORISED');
  const [brandingThemeId, setBrandingThemeId] = useState<string | null>(null);
  const [brandingThemeName, setBrandingThemeName] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!integration) return;
    setAccountCode(integration.defaultAccountCode ?? '');
    setTaxType(integration.defaultTaxType ?? 'OUTPUT');
    setInvoiceStatus(integration.defaultInvoiceStatus ?? 'AUTHORISED');
    setBrandingThemeId(integration.brandingThemeId ?? null);
    setBrandingThemeName(integration.brandingThemeName ?? null);
  }, [integration]);

  const connectionTone = useMemo(() => {
    if (!integration?.available) return { label: 'Not configured', bg: '#FEE2E2', color: RED };
    if (integration.connected) return { label: 'Connected', bg: '#DCFCE7', color: GREEN };
    if (integration.status === 'error') return { label: 'Needs attention', bg: '#FEF3C7', color: AMBER };
    return { label: 'Disconnected', bg: '#E5E7EB', color: NAVY };
  }, [integration]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const returnUrl = Linking.createURL('xero-auth');
      const connect = await api.director.xero.connectUrl(returnUrl);
      const result = await WebBrowser.openAuthSessionAsync(connect.data.authUrl, returnUrl);
      if (result.type === 'success' && result.url) {
        const parsed = Linking.parse(result.url);
        const status = typeof parsed.queryParams?.status === 'string' ? parsed.queryParams.status : '';
        const message = typeof parsed.queryParams?.message === 'string' ? decodeURIComponent(parsed.queryParams.message) : '';
        if (status === 'success') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await queryClient.invalidateQueries({ queryKey: ['director-xero-status'] });
          Alert.alert('Xero connected', 'The app is now connected to your Xero organisation.');
        } else if (message) {
          Alert.alert('Xero connection failed', message);
        }
      }
    } catch (error) {
      Alert.alert('Xero connection failed', getErrorMessage(error));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    Alert.alert('Disconnect Xero', 'This will stop new wholesale invoices from syncing until you reconnect.', [
      { text: 'Keep connected', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: async () => {
          setDisconnecting(true);
          try {
            await api.director.xero.disconnect();
            await queryClient.invalidateQueries({ queryKey: ['director-xero-status'] });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          } catch (error) {
            Alert.alert('Disconnect failed', getErrorMessage(error));
          } finally {
            setDisconnecting(false);
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.director.xero.updateSettings({
        defaultAccountCode: accountCode.trim() || null,
        defaultTaxType: taxType.trim() || null,
        defaultInvoiceStatus: invoiceStatus,
        brandingThemeId,
        brandingThemeName,
      });
      await queryClient.invalidateQueries({ queryKey: ['director-xero-status'] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved', 'Your Xero invoice settings have been updated.');
    } catch (error) {
      Alert.alert('Could not save settings', getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const result = await api.director.xero.test();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Connection working',
        result.data.tenantName
          ? `Connected to ${result.data.tenantName}.`
          : 'The app reached Xero successfully.',
      );
      await queryClient.invalidateQueries({ queryKey: ['director-xero-status'] });
    } catch (error) {
      Alert.alert('Test failed', getErrorMessage(error));
    } finally {
      setTesting(false);
    }
  };

  const statusPill = (
    <View style={[styles.statusPill, { backgroundColor: connectionTone.bg }]}>
      <Text style={[styles.statusPillText, { color: connectionTone.color }]}>{connectionTone.label}</Text>
    </View>
  );

  return (
    <DirectorStandaloneScreen
      title="Xero"
      subtitle="Accounting sync for wholesale invoices"
      headerRight={statusPill}
    >
      {isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={BLUE} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <SectionCard
            title="Connection"
            subtitle="Use your Xero organisation login to connect Butterfield through the official OAuth flow."
          >
            {!integration?.available ? (
              <View style={styles.messageBoxError}>
                <Text style={styles.messageTitle}>Xero credentials are missing</Text>
                <Text style={styles.messageText}>Add your XERO_CLIENT_ID and XERO_CLIENT_SECRET on the server first, then come back here to connect.</Text>
              </View>
            ) : null}

            <InfoRow label="Organisation" value={integration?.tenantName || 'Not connected'} />
            <InfoRow label="Last sync" value={formatAustralianDateTime(integration?.lastSyncAt)} />
            <InfoRow label="Last error" value={integration?.lastError || 'None'} last />

            <View style={styles.buttonRow}>
              <Pressable
                onPress={handleConnect}
                disabled={!integration?.available || connecting}
                style={[styles.primaryButton, (!integration?.available || connecting) && styles.buttonDisabled]}
              >
                {connecting ? <ActivityIndicator color="#fff" /> : <>
                  <Feather name="link-2" size={16} color="#fff" />
                  <Text style={styles.primaryButtonText}>{integration?.connected ? 'Reconnect Xero' : 'Connect to Xero'}</Text>
                </>}
              </Pressable>
              <Pressable
                onPress={handleDisconnect}
                disabled={!integration?.connected || disconnecting}
                style={[styles.secondaryButton, (!integration?.connected || disconnecting) && styles.buttonDisabled]}
              >
                <Text style={styles.secondaryButtonText}>Disconnect</Text>
              </Pressable>
            </View>
          </SectionCard>

          <SectionCard
            title="Default invoice settings"
            subtitle="These defaults are used when a wholesale order is turned into a Xero invoice."
          >
            <Field label="Default account code" value={accountCode} onChangeText={setAccountCode} placeholder="200" />
            <Field label="GST / tax type" value={taxType} onChangeText={setTaxType} placeholder="OUTPUT" autoCapitalize="characters" />

            <View>
              <Text style={styles.fieldLabel}>Invoice status</Text>
              <View style={styles.pillWrap}>
                {['DRAFT', 'AUTHORISED'].map((value) => (
                  <Pill key={value} label={value === 'DRAFT' ? 'Draft' : 'Approved'} active={invoiceStatus === value} onPress={() => setInvoiceStatus(value)} />
                ))}
              </View>
            </View>

            <View>
              <Text style={styles.fieldLabel}>Branding template</Text>
              <View style={styles.pillWrap}>
                <Pill
                  label="Default"
                  active={!brandingThemeId}
                  onPress={() => {
                    setBrandingThemeId(null);
                    setBrandingThemeName(null);
                  }}
                />
                {(integration?.brandingThemes ?? []).map((theme) => (
                  <Pill
                    key={theme.BrandingThemeID}
                    label={theme.Name || 'Unnamed theme'}
                    active={brandingThemeId === theme.BrandingThemeID}
                    onPress={() => {
                      setBrandingThemeId(theme.BrandingThemeID);
                      setBrandingThemeName(theme.Name ?? null);
                    }}
                  />
                ))}
              </View>
            </View>

            <View style={styles.buttonRow}>
              <Pressable onPress={handleSave} disabled={saving} style={[styles.primaryButton, saving && styles.buttonDisabled]}>
                {saving ? <ActivityIndicator color="#fff" /> : <>
                  <Feather name="save" size={16} color="#fff" />
                  <Text style={styles.primaryButtonText}>Save settings</Text>
                </>}
              </Pressable>
              <Pressable onPress={handleTest} disabled={!integration?.connected || testing} style={[styles.secondaryButton, (!integration?.connected || testing) && styles.buttonDisabled]}>
                {testing ? <ActivityIndicator color={NAVY} /> : <Text style={styles.secondaryButtonText}>Sync / test</Text>}
              </Pressable>
            </View>
          </SectionCard>

          <SectionCard
            title="What happens next"
            subtitle="Once Xero is connected, every new wholesale order can create a Xero invoice without duplicating invoices for the same order."
          >
            <InfoRow label="Invoice timing" value="Created after the wholesale order is placed" />
            <InfoRow label="Due dates" value="Follow each customer’s NET 7 / 14 / 30 terms" />
            <InfoRow label="Customer access" value="Customers can open the invoice from their wholesale order history" />
            <InfoRow label="Admin access" value="Directors and managers can open the same invoice from the order view" last />
          </SectionCard>

          <Pressable onPress={() => refetch()} style={styles.refreshLink}>
            {isRefetching ? <ActivityIndicator color={BLUE} size="small" /> : <Feather name="refresh-cw" size={14} color={BLUE} />}
            <Text style={styles.refreshText}>Refresh status</Text>
          </Pressable>
        </ScrollView>
      )}
    </DirectorStandaloneScreen>
  );
}

function InfoRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoRowBorder]}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  const { label, ...inputProps } = props;
  return (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        {...inputProps}
        placeholderTextColor={MUTED}
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BG,
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 48,
  },
  card: {
    backgroundColor: CARD,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT,
  },
  cardSubtitle: {
    color: MUTED,
    fontSize: 13,
    marginTop: 4,
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  messageBoxError: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    padding: 14,
    gap: 4,
  },
  messageTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: RED,
  },
  messageText: {
    fontSize: 13,
    color: '#991B1B',
    lineHeight: 19,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: NAVY,
    borderRadius: 16,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryButton: {
    minWidth: 122,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    minHeight: 48,
  },
  secondaryButtonText: {
    color: NAVY,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 10,
  },
  infoRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  infoLabel: {
    fontSize: 13,
    color: MUTED,
    flex: 1,
  },
  infoValue: {
    fontSize: 13,
    color: TEXT,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  fieldLabel: {
    color: MUTED,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    fontSize: 16,
    color: TEXT,
  },
  pillWrap: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pillActive: {
    borderColor: '#BFDBFE',
    backgroundColor: '#E0F2FE',
  },
  pillText: {
    color: NAVY,
    fontSize: 13,
    fontWeight: '600',
  },
  pillTextActive: {
    color: BLUE,
  },
  refreshLink: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  refreshText: {
    color: BLUE,
    fontSize: 14,
    fontWeight: '700',
  },
});

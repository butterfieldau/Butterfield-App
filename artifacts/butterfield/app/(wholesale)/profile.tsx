import { Feather } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AvatarPicker } from '@/components/AvatarPicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { StripeProvider } from '@stripe/stripe-react-native';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { PaymentMethods } from '@/components/wholesale/PaymentMethods';
import { WS_DELIVERY_SCHEDULE, WS_LEAD_TIME_LABEL } from '@/constants/wholesaleConfig';
import type { WholesaleDeliverySlot } from '@/lib/api';
import { WHOLESALE_BILLING } from '@/constants/wholesaleBilling';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#DC2626';
const GLASS_BG     = 'rgba(255,255,255,0.72)';
const GLASS_BORDER = 'rgba(255,255,255,0.9)';
const GLASS_SHADOW = {
  shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06, shadowRadius: 14, elevation: 3,
} as const;

const PAY_TO = {
  name: WHOLESALE_BILLING.companyName,
  bsb: WHOLESALE_BILLING.bsb,
  account: WHOLESALE_BILLING.accountNumber,
  abn: WHOLESALE_BILLING.abn,
};

function SectionLabel({ children }: { children: string }) {
  return <Text style={s.sectionLabel}>{children.toUpperCase()}</Text>;
}

function Row({
  icon, iconBg, label, value, onPress, last, danger, chevron = true, rightSlot,
}: {
  icon?: any; iconBg?: string; label: string; value?: string; onPress?: () => void;
  last?: boolean; danger?: boolean; chevron?: boolean; rightSlot?: React.ReactNode;
}) {
  const Wrap: any = onPress ? Pressable : View;
  return (
    <Wrap onPress={onPress} style={[s.row, !last && s.rowBorder]}>
      {icon && (
        <View style={[s.rowIcon, { backgroundColor: iconBg ?? '#E0F5FE' }]}>
          <Feather name={icon} size={14} color={danger ? RED : BLUE} />
        </View>
      )}
      <Text style={[s.rowLabel, danger && { color: RED }]} numberOfLines={1}>{label}</Text>
      {value !== undefined && (
        <Text style={s.rowValue} numberOfLines={1}>{value}</Text>
      )}
      {rightSlot}
      {onPress && chevron && <Feather name="chevron-right" size={15} color={MUTED} />}
    </Wrap>
  );
}

function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      {title && <SectionLabel>{title}</SectionLabel>}
      <View style={s.group}>{children}</View>
    </View>
  );
}

function Detail({ label, value, valueColor, last }: { label: string; value: string; valueColor?: string; last?: boolean }) {
  return (
    <View style={[s.detail, !last && s.detailBorder]}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={[s.detailValue, valueColor && { color: valueColor }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

export default function WholesaleAccount() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const qc = useQueryClient();

  const { data: accountData, refetch: refetchAccount } = useQuery({ queryKey: ['wholesale-account'], queryFn: () => api.wholesale.account(), retry: 1 });
  const { data: ordersData }  = useQuery({ queryKey: ['wholesale-orders'],  queryFn: () => api.wholesale.orders(),  retry: 1 });
  const { data: stripeConfigData } = useQuery({
    queryKey: ['stripe-config'],
    queryFn: () => api.payment.config(),
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
  const { data: deliveryScheduleData } = useQuery({
    queryKey: ['wholesale-delivery-schedule'],
    queryFn: () => api.wholesale.deliverySchedule(),
    staleTime: 10 * 60 * 1000,
    retry: 1,
  });
  const deliverySlots: WholesaleDeliverySlot[] =
    (deliveryScheduleData?.data?.slots as WholesaleDeliverySlot[] | undefined) ??
    (WS_DELIVERY_SCHEDULE as unknown as WholesaleDeliverySlot[]);

  const account       = accountData?.data;
  const orders        = ordersData?.data ?? [];
  const completed     = orders.filter((o: any) => o.status === 'delivered').length;
  const totalSpent    = orders.reduce((s: number, o: any) => s + (o.totalCents ?? 0), 0);
  const creditUsed    = account?.currentBalanceCents ?? 0;
  const creditLimit   = account?.creditLimitCents ?? 0;
  const creditEnabled = account?.creditEnabled ?? false;
  const tierName      = account?.tier?.name ?? account?.pricingTier ?? 'Standard';

  // Payment terms display
  const rawTerms = account?.paymentTerms;
  const paymentTerms = !rawTerms || rawTerms === 'pay_on_order'
    ? 'Pay on order'
    : typeof rawTerms === 'number'
      ? `${rawTerms} days`
      : rawTerms.replace(/^net\s*/i, 'Net ');

  // Account manager
  const accountMgr      = account?.accountManager;
  const accountMgrPhone = account?.accountManagerPhone;
  const accountMgrEmail = account?.accountManagerEmail;

  // Accounts team email (editable)
  const [editingAcctEmail, setEditingAcctEmail] = useState(false);
  const [acctEmailDraft, setAcctEmailDraft]     = useState('');

  const updateEmailMutation = useMutation({
    mutationFn: (email: string | null) => api.wholesale.updateAccountsEmail(email),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['wholesale-account'] }); setEditingAcctEmail(false); },
    onError: (e: any) => Alert.alert('Error', e.message),
  });

  const minOrderCents = account?.minimumOrderCents || account?.minOrderCents || 0;
  const minOrderDisplay = minOrderCents > 0 ? `$${(minOrderCents / 100).toFixed(2)} AUD` : '—';
  const fullAddress   = [account?.deliveryAddress, [account?.suburb, account?.state, account?.postcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  const [showBusiness, setShowBusiness] = useState(false);
  const [showBilling,  setShowBilling]  = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => {
          await logout(); qc.clear(); router.replace('/(auth)/login');
      }},
    ]);
  };

  const openPhone = (phone: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(`tel:${phone.replace(/\s/g, '')}`).catch(() =>
      Alert.alert('Phone', phone)
    );
  };
  const openEmail = (email: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(`mailto:${email}?subject=Wholesale Account Enquiry`).catch(() =>
      Alert.alert('Email', email)
    );
  };
  const openFaqs = () => {
    const scheduleLines = deliverySlots
      .map(s => {
        const cutoffHour = s.cutoffHour ?? 17;
        const h12 = cutoffHour > 12 ? cutoffHour - 12 : cutoffHour;
        const ampm = cutoffHour >= 12 ? 'pm' : 'am';
        return `  ${s.deliveryLabel} delivery\n  Order by ${s.cutoffDayLabel} at ${h12}:00${ampm} AEST\n  Window: ${s.windowOpen ?? '8:00am'} – ${s.windowClose ?? '5:00pm'}`;
      })
      .join('\n\n');
    Alert.alert(
      'Wholesale FAQs',
      `Delivery schedule:\n\n${scheduleLines}\n\nMinimum order: ${minOrderDisplay}\nLead time: ${WS_LEAD_TIME_LABEL}\nPayment terms: ${paymentTerms}`
    );
  };

  const initial = account?.companyName?.charAt(0) ?? user?.name?.charAt(0) ?? 'W';
  const statusColor = account?.status === 'approved' ? GREEN : account?.status === 'rejected' ? RED : '#F59E0B';
  const statusLabel = account?.status === 'approved' ? 'Approved' : account?.status === 'pending' ? 'Pending' : account?.status ?? '—';

  const acctEmail = account?.accountsEmail ?? '';
  const stripePublishableKey = stripeConfigData?.data?.publishableKey ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── PAGE HEADER ─────────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <AvatarPicker
          initial={initial}
          size={58}
          bgColor={BLUE + '20'}
          textColor={BLUE}
          borderColor={BLUE + '30'}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 22, fontWeight: '700', color: TEXT }} numberOfLines={1}>{account?.companyName ?? user?.name}</Text>
          <Text style={{ color: MUTED, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{user?.email}</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 7 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 8, paddingVertical: 3 }}>
              <Feather name="award" size={10} color={BLUE} />
              <Text style={{ color: BLUE, fontWeight: '700', fontSize: 10, letterSpacing: 0.5 }}>{tierName.toUpperCase()}</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: account?.status === 'approved' ? '#F0FDF4' : '#FEF3C7', borderRadius: 8, borderWidth: 1, borderColor: account?.status === 'approved' ? '#BBF7D0' : '#FDE68A', paddingHorizontal: 8, paddingVertical: 3 }}>
              <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: statusColor }} />
              <Text style={{ color: statusColor, fontWeight: '700', fontSize: 10, letterSpacing: 0.5 }}>{statusLabel.toUpperCase()}</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: 16, gap: 18, paddingTop: 14 }}>

        {/* ── STATS STRIP ─────────────────────────────────────────────────── */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { label: 'Orders',    value: String(orders.length) },
            { label: 'Delivered', value: String(completed) },
            { label: 'Spent',     value: `$${(totalSpent / 100).toFixed(0)}` },
          ].map((stat) => (
            <View key={stat.label} style={s.stat}>
              <Text style={s.statValue}>{stat.value}</Text>
              <Text style={s.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* ── CREDIT ACCOUNT (only shown when credit is enabled) ───────────── */}
        {creditEnabled && creditLimit > 0 && (
          <View style={s.creditCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={s.creditLabel}>Credit available</Text>
                <Text style={s.creditAvail}>${((creditLimit - creditUsed) / 100).toFixed(0)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.creditLabel}>Used / Limit</Text>
                <Text style={s.creditUsed}>${(creditUsed / 100).toFixed(0)} / ${(creditLimit / 100).toFixed(0)}</Text>
              </View>
            </View>
            <View style={s.barTrack}>
              <View style={[s.barFill, {
                width: `${Math.min(100, (creditUsed / creditLimit) * 100)}%`,
                backgroundColor: creditUsed / creditLimit > 0.8 ? '#EF4444' : BLUE,
              }]} />
            </View>
          </View>
        )}

        {/* ── ACCOUNT MANAGER ─────────────────────────────────────────────── */}
        {accountMgr ? (
          <Group title="Your Account Manager">
            <View style={s.mgrCard}>
              <View style={s.mgrAvatar}>
                <Text style={s.mgrAvatarText}>{accountMgr.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.mgrName}>{accountMgr}</Text>
                {accountMgrPhone ? (
                  <Pressable onPress={() => openPhone(accountMgrPhone)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 }}>
                    <Feather name="phone" size={12} color={BLUE} />
                    <Text style={s.mgrContact}>{accountMgrPhone}</Text>
                  </Pressable>
                ) : null}
                {accountMgrEmail ? (
                  <Pressable onPress={() => openEmail(accountMgrEmail)} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                    <Feather name="mail" size={12} color={BLUE} />
                    <Text style={s.mgrContact}>{accountMgrEmail}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </Group>
        ) : null}

        {/* ── PAYMENT METHODS ─────────────────────────────────────────────── */}
        <View style={{ gap: 6 }}>
          <SectionLabel>Payment Methods</SectionLabel>
          {stripePublishableKey ? (
            <StripeProvider publishableKey={stripePublishableKey}>
              <PaymentMethods />
            </StripeProvider>
          ) : (
            <Group>
              <Text style={{ color: MUTED, fontSize: 13, padding: 14 }}>
                Payment methods are temporarily unavailable.
              </Text>
            </Group>
          )}
        </View>

        {/* ── PAY TO (bank details) ────────────────────────────────────────── */}
        <Group title="Pay To">
          <View style={s.payToCard}>
            <Text style={s.payToName}>{PAY_TO.name}</Text>
            <View style={s.payToRow}>
              <Text style={s.payToLabel}>BSB</Text>
              <Text style={s.payToValue}>{PAY_TO.bsb}</Text>
            </View>
            <View style={s.payToRow}>
              <Text style={s.payToLabel}>Account</Text>
              <Text style={s.payToValue}>{PAY_TO.account}</Text>
            </View>
            <View style={[s.payToRow, { borderBottomWidth: 0 }]}>
              <Text style={s.payToLabel}>ABN</Text>
              <Text style={s.payToValue}>{PAY_TO.abn}</Text>
            </View>
          </View>
        </Group>

        {/* ── ACCOUNTS EMAIL (editable) ────────────────────────────────────── */}
        <Group title="Invoice Delivery">
          {editingAcctEmail ? (
            <View style={s.acctEmailEdit}>
              <Text style={s.acctEmailHint}>Invoices are sent to this address. Leave blank to receive invoices to your login email.</Text>
              <TextInput
                style={s.acctEmailInput}
                placeholder="accounts@yourcompany.com.au"
                placeholderTextColor={MUTED}
                value={acctEmailDraft}
                onChangeText={setAcctEmailDraft}
                keyboardType="email-address"
                autoCapitalize="none"
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <Pressable
                  style={[s.acctEmailBtn, { backgroundColor: BLUE }]}
                  onPress={() => updateEmailMutation.mutate(acctEmailDraft.trim() || null)}
                  disabled={updateEmailMutation.isPending}
                >
                  <Text style={[s.acctEmailBtnText, { color: '#fff' }]}>
                    {updateEmailMutation.isPending ? 'Saving…' : 'Save'}
                  </Text>
                </Pressable>
                <Pressable
                  style={[s.acctEmailBtn, { backgroundColor: '#F3F4F6' }]}
                  onPress={() => setEditingAcctEmail(false)}
                >
                  <Text style={[s.acctEmailBtnText, { color: TEXT }]}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Row
              icon="mail"
              iconBg="#DCFCE7"
              label={acctEmail ? 'Accounts email' : 'Add accounts email'}
              value={acctEmail || 'Not set'}
              onPress={() => {
                Haptics.selectionAsync();
                setAcctEmailDraft(acctEmail);
                setEditingAcctEmail(true);
              }}
              last
            />
          )}
        </Group>

        {/* ── BUSINESS DETAILS (collapsible) ──────────────────────────────── */}
        <Group title="Business">
          <Row
            icon="briefcase"
            label="Business Details"
            onPress={() => { Haptics.selectionAsync(); setShowBusiness(v => !v); }}
            rightSlot={<Feather name={showBusiness ? 'chevron-up' : 'chevron-down'} size={15} color={MUTED} />}
            chevron={false}
            last={!showBusiness}
          />
          {showBusiness && (
            <View style={s.expand}>
              <Detail label="Company"        value={account?.companyName ?? '—'} />
              <Detail label="ABN"            value={account?.abn ?? '—'} />
              <Detail label="Contact"        value={account?.contactName ?? user?.name ?? '—'} />
              <Detail label="Phone"          value={account?.phone ?? '—'} />
              {account?.howDidYouHear ? <Detail label="Referred via" value={account.howDidYouHear} /> : null}
              <Detail label="Account Status" value={statusLabel} valueColor={statusColor} last />
            </View>
          )}
          <Row
            icon="dollar-sign"
            iconBg="#DCFCE7"
            label="Billing & Delivery"
            onPress={() => { Haptics.selectionAsync(); setShowBilling(v => !v); }}
            rightSlot={<Feather name={showBilling ? 'chevron-up' : 'chevron-down'} size={15} color={MUTED} />}
            chevron={false}
            last={!showBilling}
          />
          {showBilling && (
            <View style={s.expand}>
              <Detail label="Pricing Tier"     value={tierName} />
              <Detail label="Payment Terms"    value={paymentTerms} />
              {creditEnabled && creditLimit > 0 && (
                <Detail label="Credit Limit" value={`$${(creditLimit / 100).toFixed(0)}`} />
              )}
              <Detail label="Delivery Address" value={fullAddress || '—'} last />
            </View>
          )}
          <Row
            icon="calendar"
            iconBg="#FEF3C7"
            label="Order Schedule"
            onPress={() => { Haptics.selectionAsync(); setShowSchedule(v => !v); }}
            rightSlot={<Feather name={showSchedule ? 'chevron-up' : 'chevron-down'} size={15} color={MUTED} />}
            chevron={false}
            last
          />
          {showSchedule && (
            <View style={s.expand}>
              {deliverySlots.map((slot) => {
                const cutoffHour = slot.cutoffHour ?? 17;
                const h12 = cutoffHour > 12 ? cutoffHour - 12 : cutoffHour;
                const ampm = cutoffHour >= 12 ? 'pm' : 'am';
                return (
                  <React.Fragment key={slot.deliveryLabel}>
                    <Detail
                      label={`${slot.deliveryLabel} delivery`}
                      value={`Order by ${slot.cutoffDayLabel} ${h12}:00${ampm} AEST`}
                    />
                    <Detail
                      label={`${slot.deliveryLabel} window`}
                      value={`${slot.windowOpen ?? '8:00am'} – ${slot.windowClose ?? '5:00pm'}`}
                    />
                  </React.Fragment>
                );
              })}
              <Detail label="Minimum order" value={minOrderDisplay} />
              <Detail label="Lead time"     value={WS_LEAD_TIME_LABEL} last />
            </View>
          )}
        </Group>

        {/* ── QUICK LINKS ─────────────────────────────────────────────────── */}
        <Group title="Quick Links">
          <Row
            icon="file-text"
            label="Orders & Invoices"
            onPress={() => { Haptics.selectionAsync(); router.push('/(wholesale)/orders' as any); }}
            last
          />
        </Group>

        {/* ── ACCOUNT ─────────────────────────────────────────────────────── */}
        <Group title="Account">
          <Row
            icon="bell"
            iconBg="#EDE9FE"
            label="Notification Settings"
            onPress={() => { Haptics.selectionAsync(); router.push('/notification-prefs' as any); }}
          />
          {!accountMgr ? (
            <Row
              icon="help-circle"
              iconBg="#FEF3C7"
              label="Support"
              value="accounts@butterfieldcookies.com.au"
              onPress={() => openEmail('accounts@butterfieldcookies.com.au')}
              last
            />
          ) : (
            <Row
              icon="help-circle"
              iconBg="#FEF3C7"
              label="Wholesale FAQs"
              onPress={openFaqs}
              last
            />
          )}
        </Group>

        {/* ── SIGN OUT ─────────────────────────────────────────────────────── */}
        <Pressable onPress={handleLogout} style={s.signOut}>
          <Feather name="log-out" size={15} color={RED} />
          <Text style={s.signOutText}>Sign Out</Text>
        </Pressable>

        <Text style={s.versionText}>Butterfield Wholesale · v1.0</Text>
      </View>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  hero:            { paddingHorizontal: 20, paddingBottom: 22, alignItems: 'center', gap: 4 },
  heroName:        { color: '#fff', fontSize: 20, fontWeight: '700' },
  heroSub:         { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '400' },
  heroPill:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  heroPillText:    { color: '#fff', fontWeight: '700', fontSize: 9, letterSpacing: 0.5 },

  stat:            { flex: 1, backgroundColor: GLASS_BG, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', borderWidth: 1, borderColor: GLASS_BORDER, gap: 2, ...GLASS_SHADOW },
  statValue:       { color: TEXT, fontWeight: '700', fontSize: 18 },
  statLabel:       { color: MUTED, fontWeight: '500', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  creditCard:      { backgroundColor: GLASS_BG, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: GLASS_BORDER, gap: 10, ...GLASS_SHADOW },
  creditLabel:     { color: MUTED, fontWeight: '500', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  creditAvail:     { color: BLUE, fontWeight: '700', fontSize: 22, marginTop: 2 },
  creditUsed:      { color: TEXT, fontWeight: '600', fontSize: 13, marginTop: 2 },
  barTrack:        { height: 6, borderRadius: 3, backgroundColor: BG, overflow: 'hidden' },
  barFill:         { height: '100%', borderRadius: 3 },

  mgrCard:         { flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingHorizontal: 14, paddingVertical: 14 },
  mgrAvatar:       { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1A2B4A', alignItems: 'center', justifyContent: 'center' },
  mgrAvatarText:   { color: '#fff', fontSize: 18, fontWeight: '700' },
  mgrName:         { color: TEXT, fontWeight: '700', fontSize: 15 },
  mgrContact:      { color: BLUE, fontWeight: '500', fontSize: 13 },

  payToCard:       { paddingHorizontal: 14, paddingVertical: 12 },
  payToName:       { color: TEXT, fontWeight: '700', fontSize: 14, marginBottom: 10 },
  payToRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  payToLabel:      { color: MUTED, fontWeight: '400', fontSize: 13 },
  payToValue:      { color: TEXT, fontWeight: '600', fontSize: 13 },

  acctEmailEdit:   { padding: 14 },
  acctEmailHint:   { color: MUTED, fontWeight: '400', fontSize: 12, marginBottom: 10 },
  acctEmailInput:  { backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: TEXT, borderWidth: 1, borderColor: BORDER },
  acctEmailBtn:    { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  acctEmailBtnText:{ fontWeight: '600', fontSize: 14 },

  sectionLabel:    { color: MUTED, fontWeight: '600', fontSize: 11, letterSpacing: 0.7, marginLeft: 4 },
  group:           { backgroundColor: GLASS_BG, borderRadius: 16, borderWidth: 1, borderColor: GLASS_BORDER, overflow: 'hidden', ...GLASS_SHADOW },

  row:             { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 50 },
  rowBorder:       { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  rowIcon:         { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  rowLabel:        { flex: 1, color: TEXT, fontWeight: '500', fontSize: 14 },
  rowValue:        { color: MUTED, fontWeight: '400', fontSize: 13, maxWidth: 140 },

  expand:          { backgroundColor: '#FAFBFC', paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: BORDER },
  detail:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 8, gap: 12 },
  detailBorder:    { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: BORDER },
  detailLabel:     { color: MUTED, fontWeight: '400', fontSize: 12, flex: 1 },
  detailValue:     { color: TEXT, fontWeight: '500', fontSize: 12, maxWidth: '60%', textAlign: 'right' },

  signOut:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: '#FECACA' },
  signOutText:     { color: RED, fontWeight: '600', fontSize: 14 },
  versionText:     { textAlign: 'center', color: MUTED, fontWeight: '400', fontSize: 11, marginTop: 4 },
});

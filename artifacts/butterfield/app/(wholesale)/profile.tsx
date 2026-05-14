import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AvatarPicker } from '@/components/AvatarPicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { PaymentMethods } from '@/components/wholesale/PaymentMethods';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';
const RED    = '#DC2626';

// Apple-style grouped section header
function SectionLabel({ children }: { children: string }) {
  return <Text style={s.sectionLabel}>{children.toUpperCase()}</Text>;
}

// Disclosure row in a grouped list
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

// Expandable section card
function Group({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      {title && <SectionLabel>{title}</SectionLabel>}
      <View style={s.group}>{children}</View>
    </View>
  );
}

export default function WholesaleAccount() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const qc = useQueryClient();

  const { data: accountData } = useQuery({ queryKey: ['wholesale-account'], queryFn: () => api.wholesale.account(), retry: 1 });
  const { data: ordersData }  = useQuery({ queryKey: ['wholesale-orders'],  queryFn: () => api.wholesale.orders(),  retry: 1 });

  const account       = accountData?.data;
  const orders        = ordersData?.data ?? [];
  const completed     = orders.filter((o: any) => o.status === 'delivered').length;
  const totalSpent    = orders.reduce((s: number, o: any) => s + (o.totalCents ?? 0), 0);
  const creditUsed    = account?.currentBalanceCents ?? 0;
  const creditLimit   = account?.creditLimitCents ?? 0;
  const tierName      = account?.tier?.name ?? account?.pricingTier ?? 'Standard';
  const paymentTermsRaw = account?.tier?.paymentTermsDays ?? account?.paymentTerms;
  const paymentTerms  = typeof paymentTermsRaw === 'number'
    ? `${paymentTermsRaw} days`
    : (paymentTermsRaw ?? 'Net 14').toString().replace(/^net/i, 'Net ');
  const discount      = account?.tier?.defaultDiscountPct ?? account?.tier?.discountPercent;
  const accountMgr    = account?.accountManager;
  const accountMgrEmail = account?.accountManagerEmail;
  // Effective minimum order: account-level override takes priority over tier default
  const minOrderCents = account?.minOrderCents || account?.tier?.minOrderCents || 0;
  const minOrderDisplay = minOrderCents > 0
    ? `$${(minOrderCents / 100).toFixed(2)} AUD`
    : '—';
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

  const openPhone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL('tel:0480769995').catch(() =>
      Alert.alert('Sales Representative', 'Phone: 0480 769 995\nEmail: accounts@butterfieldcookies.com.au\n\nMon–Fri, 8am – 4pm AEST')
    );
  };
  const openEmail = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const addr = accountMgrEmail ?? 'accounts@butterfieldcookies.com.au';
    Linking.openURL(`mailto:${addr}?subject=Wholesale Account Enquiry`).catch(() =>
      Alert.alert('Email', addr)
    );
  };
  const openFaqs = () => {
    Alert.alert(
      'Wholesale FAQs',
      `Cut-off times:\n  Monday delivery → Friday 12pm AEST\n  Thursday delivery → Tuesday 12pm AEST\n\nMinimum order: ${minOrderDisplay}\nLead time: 2 business days\nPayment terms: ${paymentTerms} from invoice`
    );
  };

  const initial = account?.companyName?.charAt(0) ?? user?.name?.charAt(0) ?? 'W';
  const statusColor = account?.status === 'approved' ? GREEN : account?.status === 'rejected' ? RED : '#F59E0B';
  const statusLabel = account?.status === 'approved' ? 'Approved' : account?.status === 'pending' ? 'Pending' : account?.status ?? '—';

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      {/* ── HERO (frozen/sticky — outside ScrollView) ────────────────────── */}
      <LinearGradient colors={['#40C0F2', '#2AA8DC']} style={[s.hero, { paddingTop: insets.top + 18 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <AvatarPicker
          initial={initial}
          size={68}
          bgColor="rgba(255,255,255,0.22)"
          textColor="#fff"
          borderColor="rgba(255,255,255,0.4)"
        />
        <Text style={s.heroName} numberOfLines={1}>{account?.companyName ?? user?.name}</Text>
        <Text style={s.heroSub} numberOfLines={1}>{user?.email}</Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
          <View style={s.heroPill}>
            <Feather name="award" size={10} color="#fff" />
            <Text style={s.heroPillText}>{tierName.toUpperCase()}{discount != null ? ` · −${discount}%` : ''}</Text>
          </View>
          <View style={[s.heroPill, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: account?.status === 'approved' ? '#86efac' : '#fde68a' }} />
            <Text style={s.heroPillText}>{statusLabel.toUpperCase()}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <View style={{ paddingHorizontal: 16, gap: 18, paddingTop: 14 }}>

        {/* ── STATS STRIP ────────────────────────────────────────────────── */}
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

        {/* ── CREDIT (only if a credit limit exists) ─────────────────────── */}
        {creditLimit > 0 && (
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

        {/* ── PAYMENT METHODS (cards live here now) ──────────────────────── */}
        <View style={{ gap: 6 }}>
          <SectionLabel>Payment Methods</SectionLabel>
          <PaymentMethods />
        </View>

        {/* ── BUSINESS DETAILS (collapsible) ─────────────────────────────── */}
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
              {discount != null && <Detail label="Discount" value={`${discount}% off all products`} />}
              <Detail label="Payment Terms"   value={paymentTerms} />
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
              <Detail label="Monday delivery"   value="Order by Fri 12pm" />
              <Detail label="Thursday delivery" value="Order by Tue 12pm" />
              <Detail label="Minimum order"     value={minOrderDisplay} />
              <Detail label="Lead time"         value="2 business days" last />
            </View>
          )}
        </Group>

        {/* ── ACCESS LINKS ───────────────────────────────────────────────── */}
        <Group title="Quick Links">
          <Row
            icon="file-text"
            label="Invoices"
            onPress={() => { Haptics.selectionAsync(); router.push('/(wholesale)/invoices' as any); }}
          />
          <Row
            icon="package"
            iconBg="#FEF3C7"
            label="Order History"
            onPress={() => { Haptics.selectionAsync(); router.push('/(wholesale)/orders' as any); }}
            last
          />
        </Group>

        {/* ── SUPPORT ────────────────────────────────────────────────────── */}
        <Group title="Support">
          <Row icon="phone" label={accountMgr ? `Call ${accountMgr}` : 'Call Sales Rep'} value="0480 769 995" onPress={openPhone} />
          <Row icon="mail"  label="Email Support" value={accountMgrEmail ? accountMgrEmail.split('@')[0] + '@…' : 'accounts@…'} onPress={openEmail} />
          <Row icon="help-circle" iconBg="#FEF3C7" label="Wholesale FAQs" onPress={openFaqs} last />
        </Group>

        {/* ── SIGN OUT ───────────────────────────────────────────────────── */}
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

function Detail({ label, value, valueColor, last }: { label: string; value: string; valueColor?: string; last?: boolean }) {
  return (
    <View style={[s.detail, !last && s.detailBorder]}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={[s.detailValue, valueColor && { color: valueColor }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  hero:            { paddingHorizontal: 20, paddingBottom: 22, alignItems: 'center', gap: 4 },
  avatar:          { width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', marginBottom: 6 },
  avatarText:      { color: '#fff', fontSize: 26, fontWeight: '700' },
  heroName:        { color: '#fff', fontSize: 20, fontWeight: '700' },
  heroSub:         { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '400' },
  heroPill:        { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  heroPillText:    { color: '#fff', fontWeight: '700', fontSize: 9, letterSpacing: 0.5 },

  stat:            { flex: 1, backgroundColor: CARD, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center', borderWidth: 1, borderColor: BORDER, gap: 2 },
  statValue:       { color: TEXT, fontWeight: '700', fontSize: 18 },
  statLabel:       { color: MUTED, fontWeight: '500', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

  creditCard:      { backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORDER, gap: 10 },
  creditLabel:     { color: MUTED, fontWeight: '500', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  creditAvail:     { color: BLUE, fontWeight: '700', fontSize: 22, marginTop: 2 },
  creditUsed:      { color: TEXT, fontWeight: '600', fontSize: 13, marginTop: 2 },
  barTrack:        { height: 6, borderRadius: 3, backgroundColor: BG, overflow: 'hidden' },
  barFill:         { height: '100%', borderRadius: 3 },

  sectionLabel:    { color: MUTED, fontWeight: '600', fontSize: 11, letterSpacing: 0.7, marginLeft: 4 },

  group:           { backgroundColor: CARD, borderRadius: 14, borderWidth: 1, borderColor: BORDER, overflow: 'hidden' },

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

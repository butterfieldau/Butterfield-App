import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER }}>
      <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13, flex: 1 }}>{label}</Text>
      <Text style={{ color: TEXT, fontFamily: 'Inter_500Medium', fontSize: 13, maxWidth: '60%', textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

export default function WholesaleProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const qc = useQueryClient();

  const { data: accountData } = useQuery({ queryKey: ['wholesale-account'], queryFn: () => api.wholesale.account(), retry: 1 });
  const { data: ordersData } = useQuery({ queryKey: ['wholesale-orders'], queryFn: () => api.wholesale.orders(), retry: 1 });

  const account = accountData?.data;
  const orders = ordersData?.data ?? [];
  const creditUsed = account?.creditUsedCents ?? 0;
  const creditLimit = account?.creditLimitCents ?? 0;
  const tierName = account?.tier?.name ?? account?.pricingTier ?? 'Standard';

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive', onPress: async () => {
          await logout(); qc.clear(); router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const openPhone = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL('tel:0290001234').catch(() =>
      Alert.alert('Sales Representative', 'Phone: (02) 9000 1234\nEmail: wholesale@butterfield.com.au\n\nAvailable Mon–Fri, 8:00am – 4:00pm AEST')
    );
  };

  const openEmail = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL('mailto:wholesale@butterfield.com.au?subject=Wholesale Account Enquiry').catch(() =>
      Alert.alert('Email', 'wholesale@butterfield.com.au')
    );
  };

  const totalSpent = orders.reduce((s: number, o: any) => s + (o.totalCents ?? 0), 0);
  const completedOrders = orders.filter((o: any) => o.status === 'delivered').length;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#40C0F2', '#2AA8DC']} style={[styles.header, { paddingTop: insets.top + 16 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={[styles.avatar, { backgroundColor: 'rgba(255,255,255,0.25)', borderColor: 'rgba(255,255,255,0.5)', borderWidth: 2 }]}>
          <Text style={{ color: '#fff', fontSize: 28, fontFamily: 'Inter_700Bold' }}>
            {account?.companyName?.charAt(0) ?? user?.name?.charAt(0) ?? 'W'}
          </Text>
        </View>
        <Text style={{ color: '#fff', fontSize: 22, fontFamily: 'Inter_700Bold' }}>{account?.companyName ?? user?.name}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontFamily: 'Inter_500Medium' }}>
          {tierName.toUpperCase()} Account
        </Text>
        {account?.status && (
          <View style={{ backgroundColor: account.status === 'approved' ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 3, marginTop: 4 }}>
            <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>
              {account.status === 'approved' ? '✓ Approved' : account.status === 'pending' ? 'Pending Approval' : account.status}
            </Text>
          </View>
        )}
      </LinearGradient>

      <View style={{ paddingHorizontal: 20, gap: 16, paddingTop: 20 }}>

        {/* Quick stats */}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { label: 'Total Orders',   value: String(orders.length) },
            { label: 'Delivered',      value: String(completedOrders) },
            { label: 'Total Spent',    value: `$${(totalSpent / 100).toFixed(0)}` },
          ].map((s) => (
            <View key={s.label} style={{ flex: 1, backgroundColor: CARD, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: BORDER }}>
              <Text style={{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 18 }}>{s.value}</Text>
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2, textAlign: 'center' }}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Business details */}
        {account && (
          <View style={styles.card}>
            <Text style={{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 15, marginBottom: 4 }}>Business Details</Text>
            <InfoRow label="Company" value={account.companyName ?? '—'} />
            <InfoRow label="ABN" value={account.abn ?? '—'} />
            <InfoRow label="Account Number" value={account.accountNumber ?? '—'} />
            <InfoRow label="Status" value={account.status ? account.status.charAt(0).toUpperCase() + account.status.slice(1) : '—'} />
          </View>
        )}

        {/* Contact details */}
        {account && (
          <View style={styles.card}>
            <Text style={{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 15, marginBottom: 4 }}>Contact Details</Text>
            <InfoRow label="Name" value={user?.name ?? '—'} />
            <InfoRow label="Email" value={user?.email ?? '—'} />
            <InfoRow label="Phone" value={user?.phone ?? account.phone ?? '—'} />
          </View>
        )}

        {/* Billing & delivery */}
        {account && (
          <View style={styles.card}>
            <Text style={{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 15, marginBottom: 4 }}>Billing & Delivery</Text>
            <InfoRow label="Delivery Address" value={account.deliveryAddress ?? '—'} />
            <InfoRow label="Payment Terms" value={account.tier?.paymentTermsDays != null ? `${account.tier.paymentTermsDays} days` : (account.paymentTerms ?? '30 days')} />
            <InfoRow label="Pricing Tier" value={tierName} />
            {account.tier?.discountPercent != null && (
              <InfoRow label="Discount" value={`${account.tier.discountPercent}% off all products`} />
            )}
          </View>
        )}

        {/* Credit utilisation */}
        {account && creditLimit > 0 && (
          <View style={styles.card}>
            <Text style={{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 15, marginBottom: 10 }}>Credit Utilisation</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13 }}>${(creditUsed / 100).toFixed(2)} used</Text>
              <Text style={{ color: BLUE, fontFamily: 'Inter_700Bold', fontSize: 13 }}>${(creditLimit / 100).toFixed(2)} limit</Text>
            </View>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: BG, overflow: 'hidden' }}>
              <View style={{
                height: '100%', borderRadius: 4,
                backgroundColor: creditUsed / creditLimit > 0.8 ? '#EF4444' : BLUE,
                width: `${Math.min(100, (creditUsed / creditLimit) * 100)}%`,
              }} />
            </View>
          </View>
        )}

        {/* Order cut-off schedule */}
        <View style={styles.card}>
          <Text style={{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 15, marginBottom: 8 }}>Order Cut-Off Schedule</Text>
          {[
            { delivery: 'Monday', cutOff: 'Friday 12pm AEST' },
            { delivery: 'Thursday', cutOff: 'Tuesday 12pm AEST' },
          ].map((row) => (
            <View key={row.delivery} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER }}>
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 13 }}>{row.delivery} delivery</Text>
              <Text style={{ color: BLUE, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>{row.cutOff}</Text>
            </View>
          ))}
          <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 8 }}>
            Minimum order $50 · Lead time 2 business days
          </Text>
        </View>

        {/* Support actions */}
        <View style={[{ backgroundColor: CARD, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: BORDER }]}>
          {[
            { icon: 'phone' as const,      label: 'Call Sales Rep',         sub: '(02) 9000 1234',                  onPress: openPhone },
            { icon: 'mail' as const,       label: 'Email Support',          sub: 'wholesale@butterfield.com.au',    onPress: openEmail },
            { icon: 'file-text' as const,  label: 'View Invoices',          sub: 'Download your invoice history',   onPress: () => router.push('/(wholesale)/invoices' as any) },
            { icon: 'help-circle' as const,label: 'Wholesale FAQs',         sub: 'Cut-offs, payment & delivery',    onPress: () => Alert.alert('Wholesale FAQs', 'Cut-off times:\nMonday delivery → Friday 12pm AEST\nThursday delivery → Tuesday 12pm AEST\n\nMinimum order: $50\nLead time: 2 business days\nPayment terms: 30 days') },
          ].map((item, i, arr) => (
            <Pressable
              key={item.label}
              onPress={item.onPress}
              style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: BORDER }]}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E0F5FE' }}>
                <Feather name={item.icon} size={16} color={BLUE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: TEXT, fontFamily: 'Inter_500Medium', fontSize: 14 }}>{item.label}</Text>
                <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 1 }}>{item.sub}</Text>
              </View>
              <Feather name="chevron-right" size={16} color={MUTED} />
            </Pressable>
          ))}
        </View>

        {/* Sign out */}
        <Pressable
          onPress={handleLogout}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, backgroundColor: CARD, borderRadius: 16, borderColor: '#DC2626', borderWidth: 1 }}
        >
          <Feather name="log-out" size={16} color="#DC2626" />
          <Text style={{ color: '#DC2626', fontFamily: 'Inter_600SemiBold', fontSize: 15 }}>Sign Out</Text>
        </Pressable>

      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 28, gap: 8, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  card:   { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E5E7EB', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
});

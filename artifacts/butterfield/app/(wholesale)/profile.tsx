import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

const BG = '#0A1A0A';
const CARD = '#122012';
const ACCENT = '#3A8A3A';

export default function WholesaleProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const qc = useQueryClient();

  const { data: accountData } = useQuery({ queryKey: ['wholesale-account'], queryFn: () => api.wholesale.account(), retry: 1 });
  const { data: ordersData } = useQuery({ queryKey: ['wholesale-orders'], queryFn: () => api.wholesale.orders(), retry: 1 });

  const account = accountData?.data;
  const orders = ordersData?.data ?? [];
  const creditUsed = account?.creditUsedCents ?? 0;
  const creditLimit = account?.creditLimitCents ?? 1;

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: async () => { await logout(); qc.clear(); router.replace('/(auth)/login'); } },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: BG }} contentContainerStyle={{ paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <LinearGradient colors={['#1A3A1A', BG]} style={[styles.header, { paddingTop: insets.top + 16 }]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
        <View style={[styles.avatar, { backgroundColor: 'rgba(58,138,58,0.2)', borderColor: ACCENT, borderWidth: 2 }]}>
          <Text style={[{ color: '#fff', fontSize: 28, fontFamily: 'Inter_700Bold' }]}>{account?.companyName?.charAt(0) ?? user?.name?.charAt(0) ?? 'W'}</Text>
        </View>
        <Text style={[{ color: '#fff', fontSize: 22, fontFamily: 'Inter_700Bold' }]}>{account?.companyName ?? user?.name}</Text>
        <Text style={[{ color: ACCENT, fontSize: 13, fontFamily: 'Inter_500Medium' }]}>
          {account?.tier?.toUpperCase() ?? 'STANDARD'} Account · {account?.accountNumber ?? '—'}
        </Text>
      </LinearGradient>

      <View style={{ paddingHorizontal: 20, gap: 16, paddingTop: 20 }}>
        {account && (
          <View style={[{ backgroundColor: CARD, borderRadius: 16, padding: 16, gap: 12 }]}>
            <Text style={[{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }]}>Account Details</Text>
            {[
              { label: 'Company', value: account.companyName ?? '—' },
              { label: 'ABN', value: account.abn ?? '—' },
              { label: 'Contact', value: user?.email ?? '—' },
              { label: 'Delivery Address', value: account.deliveryAddress ?? '—' },
              { label: 'Payment Terms', value: account.paymentTerms ?? '30 days' },
            ].map((row) => (
              <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 13 }]}>{row.label}</Text>
                <Text style={[{ color: '#fff', fontFamily: 'Inter_500Medium', fontSize: 13, maxWidth: '60%', textAlign: 'right' }]}>{row.value}</Text>
              </View>
            ))}
          </View>
        )}

        {account && (
          <View style={[{ backgroundColor: CARD, borderRadius: 16, padding: 16, gap: 10 }]}>
            <Text style={[{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15 }]}>Credit Utilisation</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[{ color: 'rgba(255,255,255,0.5)', fontFamily: 'Inter_400Regular', fontSize: 13 }]}>${(creditUsed / 100).toFixed(2)} used</Text>
              <Text style={[{ color: ACCENT, fontFamily: 'Inter_700Bold', fontSize: 13 }]}>${(creditLimit / 100).toFixed(2)} limit</Text>
            </View>
            <View style={[{ height: 8, borderRadius: 4, backgroundColor: BG, overflow: 'hidden' }]}>
              <View style={[{ height: '100%', borderRadius: 4, backgroundColor: creditUsed / creditLimit > 0.8 ? '#EF4444' : ACCENT, width: `${Math.min(100, (creditUsed / creditLimit) * 100)}%` }]} />
            </View>
          </View>
        )}

        <View style={[{ backgroundColor: CARD, borderRadius: 16, padding: 16, gap: 8 }]}>
          <Text style={[{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 15, marginBottom: 4 }]}>Order Cut-Off Schedule</Text>
          {[
            { delivery: 'Monday', cutOff: 'Friday 12pm AEST' },
            { delivery: 'Thursday', cutOff: 'Tuesday 12pm AEST' },
          ].map((row) => (
            <View key={row.delivery} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
              <Text style={[{ color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_400Regular', fontSize: 13 }]}>{row.delivery} delivery</Text>
              <Text style={[{ color: ACCENT, fontFamily: 'Inter_600SemiBold', fontSize: 13 }]}>{row.cutOff}</Text>
            </View>
          ))}
        </View>

        <View style={[{ backgroundColor: CARD, borderRadius: 16, overflow: 'hidden' }]}>
          {[
            { icon: 'phone', label: 'Contact Sales Rep', onPress: () => Alert.alert('Sales Representative', 'Phone: (02) 9000 1234\nEmail: wholesale@butterfield.com.au\n\nAvailable Mon–Fri, 8:00am – 4:00pm AEST') },
            { icon: 'file-text', label: 'Download Invoices', onPress: () => router.push('/(wholesale)/invoices') },
            { icon: 'help-circle', label: 'Wholesale FAQs', onPress: () => Alert.alert('Wholesale FAQs', 'When is order cut-off?\nMonday delivery: Friday 12pm\nThursday delivery: Tuesday 12pm\n\nPayment terms?\n30 days from invoice date\n\nMinimum order?\n$150 per delivery\n\nPricing?\nBased on your account tier') },
          ].map((item, i, arr) => (
            <Pressable key={item.label} onPress={item.onPress}
              style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }]}>
              <View style={[{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: `${ACCENT}20` }]}>
                <Feather name={item.icon as any} size={16} color={ACCENT} />
              </View>
              <Text style={[{ flex: 1, color: '#fff', fontFamily: 'Inter_500Medium', fontSize: 15 }]}>{item.label}</Text>
              <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.3)" />
            </Pressable>
          ))}
        </View>

        <Pressable onPress={handleLogout} style={[{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, backgroundColor: CARD, borderRadius: 16, borderColor: '#DC2626', borderWidth: 1 }]}>
          <Feather name="log-out" size={16} color="#DC2626" />
          <Text style={[{ color: '#DC2626', fontFamily: 'Inter_600SemiBold', fontSize: 15 }]}>Sign Out</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 28, gap: 8, alignItems: 'center' },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});

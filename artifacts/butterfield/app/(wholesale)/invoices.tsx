import { Feather } from '@expo/vector-icons';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal,
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { InvoiceStatusBadge } from '@/components/OrderStatusBadge';
import { MOCK_INVOICES } from '@/data/mockData';
import { generateInvoiceHtml, type InvoiceLine, type InvoicePdfData } from '@/lib/invoicePdf';
import type { Invoice } from '@/types';

const BG     = '#F5F6FA';
const CARD   = '#FFFFFF';
const BLUE   = '#40C0F2';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER = '#E5E7EB';
const GREEN  = '#22C55E';

const INVOICE_LINES: Record<string, InvoiceLine[]> = {
  inv1: [
    { description: 'Classic Choc Chip Cookie',   qty: 192, unitPrice: 2.31 },
    { description: 'Double Chocolate Cookie',     qty: 96,  unitPrice: 2.97 },
    { description: 'Brown Butter Oat Cookie',     qty: 96,  unitPrice: 2.42 },
    { description: 'Cookie Dozen Bundle',         qty: 15,  unitPrice: 26.40 },
    { description: 'Gift Box – Premium Assorted', qty: 10,  unitPrice: 39.60 },
    { description: 'NY Cheesecake Slice',         qty: 24,  unitPrice: 6.60 },
  ],
  inv2: [
    { description: 'Classic Choc Chip Cookie',   qty: 288, unitPrice: 2.31 },
    { description: 'Lemon Zest Cookie',           qty: 96,  unitPrice: 2.31 },
    { description: 'Cookie Dozen Bundle',         qty: 20,  unitPrice: 26.40 },
    { description: 'Cinnamon Roll',               qty: 24,  unitPrice: 3.96 },
    { description: 'NY Cheesecake Slice',         qty: 36,  unitPrice: 6.60 },
    { description: 'Tiramisu Cup',                qty: 12,  unitPrice: 5.50 },
  ],
  inv3: [
    { description: 'Classic Choc Chip Cookie',   qty: 48,  unitPrice: 2.31 },
    { description: 'Double Chocolate Cookie',     qty: 48,  unitPrice: 2.97 },
    { description: 'Snickerdoodle Cookie',        qty: 48,  unitPrice: 2.09 },
    { description: 'Cinnamon Roll',               qty: 12,  unitPrice: 3.96 },
  ],
  inv4: [
    { description: 'Classic Choc Chip Cookie',   qty: 144, unitPrice: 2.31 },
    { description: 'Brown Butter Oat Cookie',     qty: 96,  unitPrice: 2.42 },
    { description: 'Cookie Dozen Bundle',         qty: 12,  unitPrice: 26.40 },
    { description: 'Gift Box – Premium Assorted', qty: 8,   unitPrice: 39.60 },
    { description: 'NY Cheesecake Slice',         qty: 12,  unitPrice: 6.60 },
  ],
  inv5: [
    { description: 'Classic Choc Chip Cookie',   qty: 48,  unitPrice: 2.31 },
    { description: 'Double Chocolate Cookie',     qty: 24,  unitPrice: 2.97 },
    { description: 'Cookie Dozen Bundle',         qty: 10,  unitPrice: 24.20 },
  ],
};

function buildInvoiceData(invoice: Invoice): InvoicePdfData {
  return {
    number: invoice.number,
    date: invoice.date,
    dueDate: invoice.dueDate,
    status: invoice.status,
    companyName: 'Fresh Bite Café Group',
    abn: '98 765 432 100',
    contactEmail: 'accounts@freshbite.com.au',
    deliveryAddress: '12 Market Street\nParramatta NSW 2150',
    accountNumber: 'WH-2891',
    lines: INVOICE_LINES[invoice.id] ?? [{ description: 'Wholesale Cookie Order', qty: 1, unitPrice: invoice.amount }],
  };
}

async function getPdfUri(invoice: Invoice): Promise<string> {
  const html = generateInvoiceHtml(buildInvoiceData(invoice));
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  return uri;
}

const CARD_BRANDS = ['Visa', 'Mastercard', 'Amex'];
const BRAND_COLORS: Record<string, string> = {
  Visa: '#1A1F71', Mastercard: '#EB001B', Amex: '#007BC1',
};

interface SavedCard {
  nameOnCard: string;
  last4: string;
  expiry: string;
  brand: string;
}

// ── Card on File Modal ──────────────────────────────────────────────────────
function CardModal({ visible, card, onClose, onSave }: {
  visible: boolean; card: SavedCard | null; onClose: () => void; onSave: (c: SavedCard) => void;
}) {
  const [nameOnCard, setNameOnCard] = useState(card?.nameOnCard ?? '');
  const [last4, setLast4]           = useState(card?.last4 ?? '');
  const [expiry, setExpiry]         = useState(card?.expiry ?? '');
  const [brand, setBrand]           = useState(card?.brand ?? 'Visa');

  const reset = () => {
    setNameOnCard(card?.nameOnCard ?? '');
    setLast4(card?.last4 ?? '');
    setExpiry(card?.expiry ?? '');
    setBrand(card?.brand ?? 'Visa');
  };

  const handleSave = () => {
    if (!nameOnCard.trim()) { Alert.alert('Required', 'Please enter the name on the card.'); return; }
    if (last4.length !== 4 || !/^\d+$/.test(last4)) { Alert.alert('Invalid', 'Please enter the last 4 digits of your card.'); return; }
    if (!/^\d{2}\/\d{2}$/.test(expiry)) { Alert.alert('Invalid', 'Enter expiry as MM/YY (e.g. 09/27).'); return; }
    onSave({ nameOnCard: nameOnCard.trim(), last4, expiry, brand });
    onClose();
  };

  const formatExpiry = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 4);
    if (digits.length > 2) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
    return digits;
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={() => { reset(); onClose(); }}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: BG }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, paddingTop: 24, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }}>
          <Pressable onPress={() => { reset(); onClose(); }} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F0F0F0', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 16, fontFamily: 'Inter_700Bold', color: TEXT }}>{card ? 'Update Card' : 'Add Card on File'}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Feather name="lock" size={12} color={GREEN} />
            <Text style={{ color: GREEN, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>Secure</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">

          {/* Security notice */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#BBF7D0' }}>
            <Feather name="shield" size={15} color={GREEN} style={{ marginTop: 1 }} />
            <Text style={{ color: '#166534', fontFamily: 'Inter_400Regular', fontSize: 12, flex: 1, lineHeight: 17 }}>
              Card details are stored securely and used only for invoice payments. We never store your full card number.
            </Text>
          </View>

          {/* Brand selector */}
          <View>
            <Text style={cml.label}>Card Brand</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {CARD_BRANDS.map((b) => (
                <Pressable
                  key={b}
                  onPress={() => setBrand(b)}
                  style={[cml.brandBtn, { borderColor: brand === b ? BRAND_COLORS[b] : BORDER, backgroundColor: brand === b ? `${BRAND_COLORS[b]}12` : CARD }]}
                >
                  <Text style={[cml.brandBtnText, { color: brand === b ? BRAND_COLORS[b] : MUTED }]}>{b}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Name on card */}
          <View>
            <Text style={cml.label}>Name on Card</Text>
            <View style={[cml.inputRow, { borderColor: BORDER }]}>
              <Feather name="user" size={15} color={MUTED} />
              <TextInput
                style={[cml.input, { color: TEXT }]}
                placeholder="As it appears on the card"
                placeholderTextColor={MUTED}
                value={nameOnCard}
                onChangeText={setNameOnCard}
                autoCapitalize="words"
              />
            </View>
          </View>

          {/* Last 4 digits */}
          <View>
            <Text style={cml.label}>Last 4 Digits</Text>
            <View style={[cml.inputRow, { borderColor: BORDER }]}>
              <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 14 }}>•••• •••• ••••</Text>
              <TextInput
                style={[cml.input, { color: TEXT, maxWidth: 60, textAlign: 'center', letterSpacing: 4, fontFamily: 'Inter_700Bold' }]}
                placeholder="4321"
                placeholderTextColor={MUTED}
                value={last4}
                onChangeText={(t) => setLast4(t.replace(/\D/g, '').slice(0, 4))}
                keyboardType="number-pad"
                maxLength={4}
              />
            </View>
          </View>

          {/* Expiry */}
          <View>
            <Text style={cml.label}>Expiry Date</Text>
            <View style={[cml.inputRow, { borderColor: BORDER }]}>
              <Feather name="calendar" size={15} color={MUTED} />
              <TextInput
                style={[cml.input, { color: TEXT }]}
                placeholder="MM/YY"
                placeholderTextColor={MUTED}
                value={expiry}
                onChangeText={(t) => setExpiry(formatExpiry(t))}
                keyboardType="number-pad"
                maxLength={5}
              />
            </View>
          </View>

          <Pressable
            onPress={handleSave}
            style={{ height: 54, backgroundColor: BLUE, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}
          >
            <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 15 }}>{card ? 'Update Card' : 'Save Card'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Card on File Display ────────────────────────────────────────────────────
function CardOnFile({ card, onEdit, onRemove }: { card: SavedCard | null; onEdit: () => void; onRemove: () => void }) {
  if (!card) {
    return (
      <Pressable
        onPress={onEdit}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER, borderStyle: 'dashed' }}
      >
        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#E0F5FE', alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="credit-card" size={18} color={BLUE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Add Card on File</Text>
          <Text style={{ color: MUTED, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 2 }}>Securely save a card for invoice payments</Text>
        </View>
        <Feather name="plus" size={16} color={BLUE} />
      </Pressable>
    );
  }

  const brandColor = BRAND_COLORS[card.brand] ?? '#6B7280';

  return (
    <View style={{ backgroundColor: CARD, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: BORDER }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: TEXT, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Payment Method</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0FDF4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
          <Feather name="lock" size={11} color={GREEN} />
          <Text style={{ color: GREEN, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>PCI Secure</Text>
        </View>
      </View>

      {/* Card visual */}
      <View style={{
        borderRadius: 12, padding: 16,
        backgroundColor: brandColor,
        marginBottom: 12,
      }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontFamily: 'Inter_700Bold', fontSize: 15 }}>{card.brand}</Text>
          <Feather name="credit-card" size={20} color="rgba(255,255,255,0.6)" />
        </View>
        <Text style={{ color: '#fff', fontFamily: 'Inter_700Bold', fontSize: 17, letterSpacing: 3 }}>
          •••• •••• •••• {card.last4}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
          <View>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_400Regular', fontSize: 10, letterSpacing: 0.5 }}>CARDHOLDER</Text>
            <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 2 }}>{card.nameOnCard}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter_400Regular', fontSize: 10, letterSpacing: 0.5 }}>EXPIRES</Text>
            <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 13, marginTop: 2 }}>{card.expiry}</Text>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          onPress={onEdit}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: '#E0F5FE', borderRadius: 10 }}
        >
          <Feather name="edit-2" size={13} color={BLUE} />
          <Text style={{ color: BLUE, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Update Card</Text>
        </Pressable>
        <Pressable
          onPress={onRemove}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, backgroundColor: '#FEF2F2', borderRadius: 10 }}
        >
          <Feather name="trash-2" size={13} color="#EF4444" />
          <Text style={{ color: '#EF4444', fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Remove</Text>
        </Pressable>
      </View>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────────
export default function WholesaleInvoices() {
  const insets = useSafeAreaInsets();
  const [loadingId, setLoadingId]   = useState<string | null>(null);
  const [actionId, setActionId]     = useState<string | null>(null);
  const [showCardModal, setShowCardModal] = useState(false);
  const [savedCard, setSavedCard]   = useState<SavedCard | null>({
    nameOnCard: 'Fresh Bite Café Group',
    last4: '4321',
    expiry: '09/27',
    brand: 'Visa',
  });

  const totalPending = MOCK_INVOICES.filter((i) => i.status !== 'paid').reduce((s, i) => s + i.amount, 0);
  const overdueCount = MOCK_INVOICES.filter((i) => i.status === 'overdue').length;

  const handleRemoveCard = () => {
    Alert.alert('Remove Card', 'Remove the saved card on file?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setSavedCard(null) },
    ]);
  };

  const handleView = async (invoice: Invoice) => {
    setActionId(invoice.id);
    try {
      if (Platform.OS === 'web') {
        const html = generateInvoiceHtml(buildInvoiceData(invoice));
        const win = window.open('', '_blank');
        if (win) { win.document.write(html); win.document.close(); win.focus(); }
        return;
      }
      const html = generateInvoiceHtml(buildInvoiceData(invoice));
      await Print.printAsync({ html });
    } catch (e: any) {
      Alert.alert('View Error', e?.message ?? 'Could not open invoice.');
    } finally {
      setActionId(null);
    }
  };

  const handleDownload = async (invoice: Invoice) => {
    setLoadingId(invoice.id);
    try {
      if (Platform.OS === 'web') {
        const html = generateInvoiceHtml(buildInvoiceData(invoice));
        const win = window.open('', '_blank');
        if (win) { win.document.write(html); win.document.close(); win.focus(); setTimeout(() => win.print(), 500); }
        return;
      }
      const uri = await getPdfUri(invoice);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `Invoice ${invoice.number}`, UTI: 'com.adobe.pdf' });
      } else {
        await Print.printAsync({ uri });
      }
    } catch (e: any) {
      Alert.alert('PDF Error', e?.message ?? 'Could not generate PDF. Please try again.');
    } finally {
      setLoadingId(null);
    }
  };

  const handlePay = (invoice: Invoice) => {
    if (!savedCard) {
      Alert.alert('No Card on File', 'Please add a card on file to pay invoices directly.', [
        { text: 'Add Card', onPress: () => setShowCardModal(true) },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }
    Alert.alert(
      `Pay ${invoice.number}`,
      `Charge $${invoice.amount.toFixed(2)} to ${savedCard.brand} •••• ${savedCard.last4}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Pay Now', onPress: () => Alert.alert('Payment Submitted', 'Your payment has been submitted for processing.') },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: BG }}>
      <View style={[styles.header, { paddingTop: insets.top + 16, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER }]}>
        <Text style={[styles.title, { color: TEXT, fontFamily: 'Inter_700Bold' }]}>Invoices</Text>
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: '#E0F5FE', borderColor: BLUE }]}>
            <Text style={[styles.summaryLabel, { color: BLUE }]}>OUTSTANDING</Text>
            <Text style={[styles.summaryValue, { color: TEXT, fontFamily: 'Inter_700Bold' }]}>
              ${totalPending.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
            </Text>
          </View>
          {overdueCount > 0 && (
            <View style={[styles.summaryCard, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' }]}>
              <Text style={[styles.summaryLabel, { color: '#991B1B' }]}>OVERDUE</Text>
              <Text style={[styles.summaryValue, { color: '#991B1B', fontFamily: 'Inter_700Bold' }]}>
                {overdueCount} invoice{overdueCount > 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>
      </View>

      <FlatList
        data={MOCK_INVOICES}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={{ marginBottom: 4 }}>
            <CardOnFile
              card={savedCard}
              onEdit={() => setShowCardModal(true)}
              onRemove={handleRemoveCard}
            />
          </View>
        }
        renderItem={({ item: invoice }) => {
          const isViewing = actionId === invoice.id;
          const isPdfLoading = loadingId === invoice.id;

          return (
            <View style={[styles.invoiceCard, {
              backgroundColor: CARD,
              borderLeftColor: invoice.status === 'overdue' ? '#EF4444' : BLUE,
              borderLeftWidth: 3, borderWidth: 1, borderColor: BORDER,
            }]}>
              <View style={styles.invoiceTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.invoiceNum, { color: TEXT, fontFamily: 'Inter_600SemiBold' }]}>{invoice.number}</Text>
                  <Text style={[styles.invoiceDate, { color: MUTED }]}>Issued: {invoice.date}</Text>
                  <Text style={[styles.invoiceDue, { color: invoice.status === 'overdue' ? '#EF4444' : MUTED }]}>Due: {invoice.dueDate}</Text>
                  <Text style={[styles.invoiceLines, { color: MUTED }]}>
                    {(INVOICE_LINES[invoice.id]?.length ?? 1)} line item{(INVOICE_LINES[invoice.id]?.length ?? 1) !== 1 ? 's' : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <InvoiceStatusBadge status={invoice.status} />
                  <Text style={[styles.invoiceAmount, { color: TEXT, fontFamily: 'Inter_700Bold' }]}>
                    ${invoice.amount.toLocaleString('en-AU', { minimumFractionDigits: 2 })}
                  </Text>
                </View>
              </View>

              <View style={[styles.invoiceDivider, { backgroundColor: BORDER }]} />

              <View style={styles.invoiceActions}>
                <Pressable
                  onPress={() => handleView(invoice)}
                  disabled={isViewing || isPdfLoading}
                  style={[styles.invoiceBtn, { backgroundColor: '#F0F9FF', borderRadius: 10, flex: 1, borderWidth: 1, borderColor: `${BLUE}30`, opacity: isViewing ? 0.7 : 1 }]}
                >
                  {isViewing ? <ActivityIndicator size="small" color={BLUE} /> : <Feather name="file-text" size={14} color={BLUE} />}
                  <Text style={[styles.invoiceBtnText, { color: BLUE, fontFamily: 'Inter_600SemiBold' }]}>
                    {isViewing ? 'Opening…' : 'View PDF'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => handleDownload(invoice)}
                  disabled={isPdfLoading || isViewing}
                  style={[styles.invoiceBtn, { backgroundColor: isPdfLoading ? `${BLUE}20` : '#E0F5FE', borderRadius: 10, flex: 1, opacity: isPdfLoading ? 0.7 : 1 }]}
                >
                  {isPdfLoading ? <ActivityIndicator size="small" color={BLUE} /> : <Feather name="download" size={14} color={BLUE} />}
                  <Text style={[styles.invoiceBtnText, { color: BLUE, fontFamily: 'Inter_600SemiBold' }]}>
                    {isPdfLoading ? 'Generating…' : 'Download'}
                  </Text>
                </Pressable>

                {invoice.status !== 'paid' && (
                  <Pressable
                    onPress={() => handlePay(invoice)}
                    style={[styles.invoiceBtn, { backgroundColor: BLUE, borderRadius: 10, flex: 1 }]}
                  >
                    <Feather name="credit-card" size={14} color="#fff" />
                    <Text style={[styles.invoiceBtnText, { color: '#fff', fontFamily: 'Inter_700Bold' }]}>
                      {savedCard ? `Pay •${savedCard.last4}` : 'Pay Now'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />

      <CardModal
        visible={showCardModal}
        card={savedCard}
        onClose={() => setShowCardModal(false)}
        onSave={(c) => setSavedCard(c)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  title: { fontSize: 26 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, gap: 3 },
  summaryLabel: { fontSize: 11, letterSpacing: 0.5, fontFamily: 'Inter_600SemiBold' },
  summaryValue: { fontSize: 18 },
  invoiceCard: {
    borderRadius: 14, padding: 16, gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 6, elevation: 2,
  },
  invoiceTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  invoiceNum: { fontSize: 14, marginBottom: 3 },
  invoiceDate: { fontSize: 12, marginBottom: 1, fontFamily: 'Inter_400Regular' },
  invoiceDue: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  invoiceLines: { fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 },
  invoiceAmount: { fontSize: 17, marginTop: 4 },
  invoiceDivider: { height: 1 },
  invoiceActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  invoiceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 11 },
  invoiceBtnText: { fontSize: 13 },
});

const cml = StyleSheet.create({
  label:    { fontSize: 12, fontFamily: 'Inter_600SemiBold', color: '#8E8E93', marginBottom: 6 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 52, borderWidth: 1, borderRadius: 12, backgroundColor: '#FFFFFF' },
  input:    { flex: 1, fontSize: 15, fontFamily: 'Inter_400Regular' },
  brandBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1 },
  brandBtnText: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
});

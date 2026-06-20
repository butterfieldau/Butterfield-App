import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AddressSearchInput } from '@/components/AddressSearchInput';
import InlineCalendarPicker from '@/components/InlineCalendarPicker';
import PickupTimeWheelPicker from '@/components/PickupTimeWheelPicker';
import { isSameDay } from '@/lib/dateUtils';
import { getStoreAsapUnavailableReason } from '@/lib/storeSchedule';
import type { SavedAddress } from '@/lib/api';

const BLUE       = '#1493FF';
const CARD       = '#FFFFFF';
const TEXT       = '#1C1C1E';
const MUTED      = '#8E8E93';
const BORDER     = '#E5E7EB';
const LIGHT_BLUE = '#E6F0FF';
const BG         = '#EFF6FF';

interface DeliverySlot {
  date: Date;
  available: boolean;
  window?: string;
}

interface DeliveryConfigSlot {
  deliveryLabel: string;
  windowOpen: string;
  windowClose: string;
}

interface CheckoutDeliveryStepProps {
  orderType: 'pickup' | 'delivery';
  setOrderType: (v: 'pickup' | 'delivery') => void;
  pickupMode: 'asap' | 'scheduled';
  setPickupMode: (v: 'asap' | 'scheduled') => void;
  selectedDate: Date | null;
  setSelectedDate: (d: Date | null) => void;
  selectedTimeMins: number | null;
  setSelectedTimeMins: (m: number | null) => void;
  street: string;
  setStreet: (v: string) => void;
  suburb: string;
  setSuburb: (v: string) => void;
  postcode: string;
  setPostcode: (v: string) => void;
  addrState: string;
  apt: string;
  setApt: (v: string) => void;
  selectedAddressId: string | null;
  setSelectedAddressId: (v: string | null) => void;
  contactName: string;
  setContactName: (v: string) => void;
  contactPhone: string;
  setContactPhone: (v: string) => void;
  contactEmail: string;
  setContactEmail: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  subtotalCents: number;
  stripeFeeCents: number;
  totalCents: number;
  deliveryFeeCents: number;
  deliveryEnabled: boolean;
  showMixedDeliveryMessage: boolean;
  deliveryConfig: {
    slots?: DeliveryConfigSlot[];
    blackoutDates?: string[];
    feeCents?: number;
  } | undefined;
  selectedStore: any;
  storeOpen: boolean;
  sydNow: Date;
  deliveryDates: DeliverySlot[];
  pickupDates: Date[];
  validSlots: number[];
  savedAddresses: SavedAddress[];
  fillFromAddress: (addr: SavedAddress) => void;
}

function SectionLabel({ title }: { title: string }) {
  return <Text style={s.sectionLabel}>{title}</Text>;
}

export function CheckoutDeliveryStep({
  orderType, setOrderType,
  pickupMode, setPickupMode,
  selectedDate, setSelectedDate,
  selectedTimeMins, setSelectedTimeMins,
  street, setStreet,
  suburb, setSuburb,
  postcode, setPostcode,
  addrState,
  apt, setApt,
  selectedAddressId, setSelectedAddressId,
  contactName, setContactName,
  contactPhone, setContactPhone,
  contactEmail, setContactEmail,
  notes, setNotes,
  subtotalCents,
  stripeFeeCents,
  totalCents,
  deliveryFeeCents,
  deliveryEnabled,
  showMixedDeliveryMessage,
  deliveryConfig,
  selectedStore,
  storeOpen,
  sydNow,
  deliveryDates,
  pickupDates,
  validSlots,
  savedAddresses,
  fillFromAddress,
}: CheckoutDeliveryStepProps) {
  return (
    <View style={s.stepWrap}>
      <SectionLabel title="HOW WOULD YOU LIKE TO RECEIVE YOUR ORDER?" />

      <View style={s.orderTypeRow}>
        {[
          { id: 'pickup',   label: 'Pickup',   sub: 'In-store, free',                              icon: 'shopping-bag' as const },
          { id: 'delivery', label: 'Delivery', sub: `AUD ${(deliveryFeeCents / 100).toFixed(2)} flat`, icon: 'truck' as const },
        ].map((t) => {
          const active   = orderType === t.id;
          const disabled = t.id === 'delivery' && !deliveryEnabled;
          return (
            <Pressable
              key={t.id}
              disabled={disabled}
              onPress={() => {
                if (disabled) return;
                setOrderType(t.id as any);
                setSelectedDate(null);
                setSelectedTimeMins(null);
                if (t.id === 'pickup') setPickupMode(storeOpen ? 'asap' : 'scheduled');
                Haptics.selectionAsync();
              }}
              style={[s.orderTypeCard, {
                backgroundColor: active ? LIGHT_BLUE : CARD,
                borderColor:     active ? BLUE : BORDER,
                borderWidth:     active ? 2 : 1,
                opacity:         disabled ? 0.45 : 1,
              }]}
            >
              <View style={[s.orderTypeIcon, { backgroundColor: active ? BLUE : BG }]}>
                <Feather name={t.icon} size={18} color={active ? '#fff' : MUTED} />
              </View>
              <View>
                <Text style={[s.orderTypeLabel, { color: TEXT }]}>{t.label}</Text>
                <Text style={[s.orderTypeSub, { color: active ? BLUE : MUTED }]}>{t.sub}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {!deliveryEnabled && (
        <Text style={s.deliveryEligibilityNote}>
          {showMixedDeliveryMessage
            ? 'Some of the items in your cart are not available for delivery.'
            : 'Delivery is only available for cookies, boxes, and merch.'}
        </Text>
      )}

      {orderType === 'delivery' && (
        <View style={[s.deliveryInfoCard, { backgroundColor: '#EBF8FF', borderColor: '#BEE3F8' }]}>
          <View style={[s.deliveryInfoIcon, { backgroundColor: BLUE }]}>
            <Feather name="truck" size={16} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.deliveryInfoTag, { color: BLUE }]}>SYDNEY DELIVERY</Text>
            <Text style={s.deliveryInfoTitle}>Flat AU${(deliveryFeeCents / 100).toFixed(2)}, NSW only</Text>
            <Text style={s.deliveryInfoSub}>
              {deliveryConfig?.slots && deliveryConfig.slots.length > 0
                ? deliveryConfig.slots.map((sl) => sl.deliveryLabel).join(' & ') +
                  ', ' + deliveryConfig.slots[0].windowOpen + ' – ' + deliveryConfig.slots[0].windowClose
                : '24 hours notice required'}
            </Text>
          </View>
        </View>
      )}

      {orderType === 'pickup' && selectedStore && (
        <View style={[s.deliveryInfoCard, { backgroundColor: '#EBF8FF', borderColor: '#BEE3F8' }]}>
          <View style={[s.deliveryInfoIcon, { backgroundColor: BLUE }]}>
            <Feather name="map-pin" size={16} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.deliveryInfoTag, { color: BLUE }]}>PICKUP STORE</Text>
            <Text style={s.deliveryInfoTitle}>{selectedStore.name}</Text>
            <Text style={s.deliveryInfoSub}>
              {selectedStore.openLabel ?? 'Check store hours'}
              {selectedStore.todayHours?.openTime && selectedStore.todayHours?.closeTime
                ? ` · ${selectedStore.todayHours.openTime}–${selectedStore.todayHours.closeTime}`
                : ''}
            </Text>
          </View>
        </View>
      )}

      {orderType === 'pickup' && (
        <View style={{ gap: 10 }}>
          <Pressable
            onPress={() => {
              if (!storeOpen) return;
              setPickupMode('asap');
              setSelectedDate(null);
              setSelectedTimeMins(null);
              Haptics.selectionAsync();
            }}
            disabled={!storeOpen}
            style={[s.pickupModeCard, {
              backgroundColor: pickupMode === 'asap' && storeOpen ? LIGHT_BLUE : CARD,
              borderColor:     pickupMode === 'asap' && storeOpen ? BLUE : BORDER,
              borderWidth:     pickupMode === 'asap' && storeOpen ? 2 : 1,
              opacity:         storeOpen ? 1 : 0.6,
            }]}
          >
            <View style={[s.pickupModeIcon, { backgroundColor: pickupMode === 'asap' && storeOpen ? BLUE : BG }]}>
              <Feather name="zap" size={18} color={pickupMode === 'asap' && storeOpen ? '#fff' : MUTED} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.pickupModeLabel, { color: pickupMode === 'asap' && storeOpen ? BLUE : TEXT }]}>ASAP</Text>
              <Text style={[s.pickupModeSub, { color: pickupMode === 'asap' && storeOpen ? BLUE : MUTED }]}>
                {storeOpen ? 'Ready from your selected store' : getStoreAsapUnavailableReason(selectedStore, sydNow)}
              </Text>
            </View>
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', borderColor: pickupMode === 'asap' && storeOpen ? BLUE : BORDER }}>
              {pickupMode === 'asap' && storeOpen && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: BLUE }} />}
            </View>
          </Pressable>

          <Pressable
            onPress={() => { setPickupMode('scheduled'); Haptics.selectionAsync(); }}
            style={[s.pickupModeCard, {
              backgroundColor: pickupMode === 'scheduled' ? LIGHT_BLUE : CARD,
              borderColor:     pickupMode === 'scheduled' ? BLUE : BORDER,
              borderWidth:     pickupMode === 'scheduled' ? 2 : 1,
            }]}
          >
            <View style={[s.pickupModeIcon, { backgroundColor: pickupMode === 'scheduled' ? BLUE : BG }]}>
              <Feather name="calendar" size={18} color={pickupMode === 'scheduled' ? '#fff' : MUTED} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.pickupModeLabel, { color: pickupMode === 'scheduled' ? BLUE : TEXT }]}>Schedule for later</Text>
              <Text style={[s.pickupModeSub, { color: pickupMode === 'scheduled' ? BLUE : MUTED }]}>Choose a date & time</Text>
            </View>
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', borderColor: pickupMode === 'scheduled' ? BLUE : BORDER }}>
              {pickupMode === 'scheduled' && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: BLUE }} />}
            </View>
          </Pressable>
        </View>
      )}

      {(orderType === 'delivery' || pickupMode === 'scheduled') && (
        <View style={s.chooseDateHeader}>
          <Feather name="calendar" size={18} color={TEXT} />
          <Text style={s.chooseDateTitle}>
            {orderType === 'delivery' ? 'Choose a delivery date' : 'Choose a pickup date'}
          </Text>
        </View>
      )}

      {orderType === 'delivery' ? (
        <>
          {(() => {
            const pairs: (typeof deliveryDates[0] | null)[][] = [];
            for (let i = 0; i < deliveryDates.length; i += 2)
              pairs.push([deliveryDates[i], deliveryDates[i + 1] ?? null]);
            return pairs.map((pair, ri) => (
              <View key={ri} style={{ flexDirection: 'row', gap: 10 }}>
                {pair.map((slot, ci) => {
                  if (!slot) return <View key={ci} style={{ flex: 1 }} />;
                  const isSel   = selectedDate != null && isSameDay(selectedDate, slot.date);
                  const dayName = slot.date.toLocaleDateString('en-AU', { weekday: 'long' }).toUpperCase();
                  const dayDate = slot.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
                  return (
                    <Pressable
                      key={ci}
                      disabled={!slot.available}
                      onPress={() => { setSelectedDate(slot.date); Haptics.selectionAsync(); }}
                      style={[s.deliveryDateCard, {
                        backgroundColor: isSel ? LIGHT_BLUE : '#fff',
                        borderColor:     isSel ? BLUE : BORDER,
                        borderWidth:     isSel ? 2 : 1,
                        opacity:         slot.available ? 1 : 0.4,
                      }]}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: BLUE }}>{dayName}</Text>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: TEXT }}>{dayDate}</Text>
                      <Text style={{ fontSize: 12, fontWeight: '400', color: MUTED }}>{slot.window ?? '8am – 5pm'}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ));
          })()}
        </>
      ) : pickupMode === 'scheduled' ? (
        <>
          <View style={s.calendarCard}>
            <InlineCalendarPicker
              selectedDate={selectedDate}
              onSelectDate={(d) => { setSelectedDate(d); setSelectedTimeMins(null); Haptics.selectionAsync(); }}
              accentColor={BLUE}
              availableDates={pickupDates}
              minDate={new Date()}
              maxDate={pickupDates.length > 0 ? pickupDates[pickupDates.length - 1] : undefined}
            />
          </View>
          {selectedDate && (
            <View style={s.pickerCard}>
              <PickupTimeWheelPicker
                validSlots={validSlots}
                selectedSlotMins={selectedTimeMins}
                onSelectSlot={(mins) => { setSelectedTimeMins(mins); Haptics.selectionAsync(); }}
                accentColor={BLUE}
              />
            </View>
          )}
        </>
      ) : null}

      {orderType === 'delivery' && (
        <>
          <SectionLabel title="DELIVERY ADDRESS" />

          <AddressSearchInput
            currentValue={street ? `${street}${suburb ? `, ${suburb}` : ''}` : undefined}
            placeholder="Search delivery address…"
            onSelect={(r) => {
              if (r.street) setStreet(r.street);
              if (r.suburb) setSuburb(r.suburb);
              if (r.postcode) setPostcode(r.postcode);
              setSelectedAddressId(null);
            }}
          />

          {savedAddresses.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ marginBottom: 12 }}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}
            >
              {savedAddresses.map((addr) => {
                const isSelected = selectedAddressId === addr.id;
                return (
                  <Pressable
                    key={addr.id}
                    onPress={() => { fillFromAddress(addr); Haptics.selectionAsync(); }}
                    style={[s.savedAddrChip, {
                      backgroundColor: isSelected ? LIGHT_BLUE : CARD,
                      borderColor:     isSelected ? BLUE : BORDER,
                      borderWidth:     isSelected ? 1.5 : 1,
                    }]}
                  >
                    <Feather
                      name={addr.label.toLowerCase() === 'home' ? 'home' : addr.label.toLowerCase() === 'work' ? 'briefcase' : 'map-pin'}
                      size={12}
                      color={isSelected ? BLUE : MUTED}
                    />
                    <Text style={[s.savedAddrChipText, { color: isSelected ? BLUE : TEXT }]}>{addr.label}</Text>
                    {addr.isDefault && <View style={[s.savedAddrDot, { backgroundColor: BLUE }]} />}
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => router.push('/addresses')}
                style={[s.savedAddrChip, { backgroundColor: CARD, borderColor: BORDER }]}
              >
                <Feather name="plus" size={12} color={MUTED} />
                <Text style={[s.savedAddrChipText, { color: MUTED }]}>Manage</Text>
              </Pressable>
            </ScrollView>
          )}

          <View style={[s.formCard, { backgroundColor: CARD, borderColor: BORDER }]}>
            <Text style={s.formFieldLabel}>Street address</Text>
            <TextInput
              style={[s.formInput, { color: TEXT, borderColor: BORDER }]}
              placeholder="Street address"
              placeholderTextColor={MUTED}
              value={street}
              onChangeText={(v) => { setStreet(v); setSelectedAddressId(null); }}
              autoCapitalize="words"
            />
            <Text style={s.formFieldLabel}>Apt / unit (optional)</Text>
            <TextInput
              style={[s.formInput, { color: TEXT, borderColor: BORDER }]}
              placeholder="Unit 4"
              placeholderTextColor={MUTED}
              value={apt}
              onChangeText={(v) => { setApt(v); setSelectedAddressId(null); }}
              autoCapitalize="words"
            />
            <View style={s.formRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.formFieldLabel}>Suburb</Text>
                <TextInput
                  style={[s.formInput, { color: TEXT, borderColor: BORDER }]}
                  placeholder="Suburb"
                  placeholderTextColor={MUTED}
                  value={suburb}
                  onChangeText={(v) => { setSuburb(v); setSelectedAddressId(null); }}
                  autoCapitalize="words"
                />
              </View>
              <View style={{ width: 110 }}>
                <Text style={s.formFieldLabel}>Postcode</Text>
                <TextInput
                  style={[s.formInput, { color: TEXT, borderColor: BORDER }]}
                  placeholder="Postcode"
                  placeholderTextColor={MUTED}
                  value={postcode}
                  onChangeText={(v) => { setPostcode(v); setSelectedAddressId(null); }}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
            </View>
            <Text style={s.formFieldLabel}>State</Text>
            <View style={[s.statePill, { backgroundColor: LIGHT_BLUE, borderColor: BLUE, paddingHorizontal: 16, paddingVertical: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
              <Feather name="map-pin" size={12} color={BLUE} />
              <Text style={[s.statePillText, { color: BLUE }]}>NSW — Sydney deliveries only</Text>
            </View>
          </View>
        </>
      )}

      <SectionLabel title="YOUR DETAILS" />
      <View style={[s.formCard, { backgroundColor: CARD, borderColor: BORDER }]}>
        {[
          { label: 'Full name',     value: contactName,  setter: setContactName,  placeholder: 'Omar Ismail',  keyboard: 'default' as const,       autoCapitalize: 'words' as const  },
          { label: 'Mobile number', value: contactPhone, setter: setContactPhone, placeholder: '04XX XXX XXX', keyboard: 'phone-pad' as const,      autoCapitalize: 'none' as const   },
          { label: 'Email',         value: contactEmail, setter: setContactEmail, placeholder: 'you@email.com', keyboard: 'email-address' as const, autoCapitalize: 'none' as const   },
        ].map((f) => (
          <View key={f.label} style={s.formFieldWrap}>
            <Text style={s.formFieldLabel}>{f.label}</Text>
            <TextInput
              style={[s.formInput, { color: TEXT, borderColor: BORDER }]}
              placeholder={f.placeholder}
              placeholderTextColor={MUTED}
              value={f.value}
              onChangeText={f.setter}
              keyboardType={f.keyboard}
              autoCapitalize={f.autoCapitalize}
            />
          </View>
        ))}
        <Text style={s.formFieldLabel}>Notes (optional)</Text>
        <TextInput
          style={[s.formInput, s.notesInput, { color: TEXT, borderColor: BORDER }]}
          placeholder="Allergies, gate code, gift wrap, etc."
          placeholderTextColor={MUTED}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />
      </View>

      <View style={[s.summaryCard, { backgroundColor: CARD, borderColor: BORDER }]}>
        <View style={s.summaryRow}>
          <Text style={s.summaryRowLabel}>Subtotal</Text>
          <Text style={s.summaryRowValue}>AUD {(subtotalCents / 100).toFixed(2)}</Text>
        </View>
        {orderType === 'delivery' && (
          <>
            <View style={[s.summaryDivider, { backgroundColor: BORDER }]} />
            <View style={s.summaryRow}>
              <Text style={s.summaryRowLabel}>Delivery (Sydney NSW)</Text>
              <Text style={s.summaryRowValue}>AUD {(deliveryFeeCents / 100).toFixed(2)}</Text>
            </View>
          </>
        )}
        <View style={[s.summaryDivider, { backgroundColor: BORDER }]} />
        <View style={s.summaryRow}>
          <Text style={s.summaryRowLabel}>Estimated card fee</Text>
          <Text style={s.summaryRowValue}>AUD {(stripeFeeCents / 100).toFixed(2)}</Text>
        </View>
        <View style={[s.summaryDivider, { backgroundColor: BORDER }]} />
        <View style={s.summaryRow}>
          <Text style={[s.summaryRowLabel, s.summaryTotalLabel]}>Total</Text>
          <Text style={[s.summaryRowValue, s.summaryTotalValue]}>AUD {(totalCents / 100).toFixed(2)}</Text>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  stepWrap:  { padding: 16, gap: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '600', color: '#8E8E93', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  orderTypeRow: { flexDirection: 'row', gap: 10 },
  orderTypeCard:{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  orderTypeIcon:{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  orderTypeLabel: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  orderTypeSub:   { fontSize: 12, fontWeight: '400', marginTop: 2 },
  deliveryEligibilityNote: { fontSize: 12, fontWeight: '500', color: '#8E8E93', marginTop: -2, paddingHorizontal: 2 },
  deliveryInfoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  deliveryInfoIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  deliveryInfoTag:  { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  deliveryInfoTitle:{ fontSize: 15, fontWeight: '700', color: '#1C1C1E', marginTop: 2 },
  deliveryInfoSub:  { fontSize: 12, fontWeight: '400', color: '#8E8E93', marginTop: 2 },
  pickupModeCard:  { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14 },
  pickupModeIcon:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  pickupModeLabel: { fontSize: 15, fontWeight: '700', color: '#1C1C1E' },
  pickupModeSub:   { fontSize: 12, fontWeight: '400', marginTop: 2 },
  chooseDateHeader:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  chooseDateTitle: { fontSize: 16, fontWeight: '700', color: '#1C1C1E' },
  calendarCard: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  pickerCard: {
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#E5E7EB', padding: 12,
    marginTop: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  deliveryDateCard: { flex: 1, borderRadius: 14, padding: 14, gap: 3 },
  savedAddrChip:    { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20 },
  savedAddrChipText:{ fontSize: 13, fontWeight: '500' },
  savedAddrDot:     { width: 6, height: 6, borderRadius: 3 },
  formCard:       { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  formFieldWrap:  { gap: 4 },
  formFieldLabel: { fontSize: 13, fontWeight: '500', color: '#8E8E93' },
  formInput:      { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: '400', backgroundColor: '#EFF6FF' },
  formRow:        { flexDirection: 'row', gap: 10 },
  notesInput:     { height: 80, textAlignVertical: 'top', paddingTop: 12 },
  statePill:      { borderRadius: 20, borderWidth: 1 },
  statePillText:  { fontSize: 13, fontWeight: '500' },
  summaryCard:      { backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  summaryRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryRowLabel:  { fontSize: 13, fontWeight: '400', color: '#8E8E93' },
  summaryRowValue:  { fontSize: 13, fontWeight: '500', color: '#1C1C1E' },
  summaryTotalLabel:{ fontWeight: '700', fontSize: 15, color: '#1C1C1E' },
  summaryTotalValue:{ fontWeight: '700', fontSize: 16, color: '#1C1C1E' },
  summaryDivider:   { height: 1 },
});

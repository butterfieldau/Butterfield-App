import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { AddressSearchInput } from '@/components/AddressSearchInput';
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal,
  Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { modal } from '@/components/director/usersStyles';

const BG     = '#EFF6FF';
const CARD   = '#FFFFFF';
const BLUE   = '#1493FF';
const NAVY   = '#1A2B4A';
const TEXT   = '#1C1C1E';
const MUTED  = '#8E8E93';
const BORDER      = '#E5E7EB';
const GLASS_BG    = 'rgba(255,255,255,0.6)';
const GLASS_BORDER= 'rgba(255,255,255,0.85)';
const GREEN  = '#22C55E';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';

function getErrorMessage(error: unknown, fallback = 'Something went wrong.') {
  return error instanceof Error ? error.message : fallback;
}

type CreateType = 'staff' | 'wholesale' | 'shop_display';
function CreateUserModal({ visible, type, onClose, onSuccess }: {
  visible: boolean; type: CreateType; onClose: () => void; onSuccess: () => void;
}) {
  const [name, setName]                     = useState('');
  const [email, setEmail]                   = useState('');
  const [password, setPassword]             = useState('');
  const [showPw, setShowPw]                 = useState(false);
  const [companyName, setCompanyName]       = useState('');
  const [abn, setAbn]                       = useState('');
  const [phone, setPhone]                   = useState('');
  const [position, setPosition]             = useState('Crew');
  const [department, setDepartment]         = useState('floor');
  const [employmentStatus, setEmploymentStatus] = useState('casual');
  const [hourlyRate, setHourlyRate]         = useState('');
  const [address, setAddress]               = useState('');
  const [tfn, setTfn]                       = useState('');
  const [isManager, setIsManager]           = useState(false);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');
  const reset = () => {
    setName(''); setEmail(''); setPassword(''); setCompanyName('');
    setAbn(''); setPhone(''); setPosition('Crew'); setDepartment('floor');
    setEmploymentStatus('casual'); setHourlyRate(''); setAddress(''); setTfn('');
    setIsManager(false); setError(''); setLoading(false);
  };
  const handleClose = () => { reset(); onClose(); };
  const handleSubmit = async () => {
    setError('');
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Name, email and password are required.'); return;
    }
    if (type === 'wholesale' && !companyName.trim()) {
      setError('Company name is required.'); return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.'); return;
    }
    setLoading(true);
    try {
      if (type === 'staff') {
        const rateVal = hourlyRate.trim() ? Math.round(parseFloat(hourlyRate) * 100) : undefined;
        await api.director.createStaff({
          name: name.trim(), email: email.trim(), password,
          position: position.trim(), department: department.trim(),
          isManager, hourlyRateCents: rateVal,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          taxFileNumber: tfn.trim() || undefined,
          employmentStatus,
        });
      } else if (type === 'wholesale') {
        await api.director.createWholesale({ name: name.trim(), email: email.trim(), password, companyName: companyName.trim(), abn: abn.trim() || undefined, phone: phone.trim() || undefined });
      } else {
        await api.director.createShopDisplay({ name: name.trim(), email: email.trim(), password, phone: phone.trim() || undefined });
      }
      reset();
      onSuccess();
    } catch (error) {
      setError(getErrorMessage(error, 'Failed to create account.'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally { setLoading(false); }
  };
  const isStaff = type === 'staff';
  const isShopDisplay = type === 'shop_display';
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: CARD }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[modal.header, { borderBottomColor: BORDER }]}>
          <Pressable onPress={handleClose} style={modal.closeBtn}>
            <Feather name="x" size={18} color={TEXT} />
          </Pressable>
          <Text style={[modal.title, { color: TEXT }]}>Add {isStaff ? 'Staff Member' : isShopDisplay ? 'POS Screen Login' : 'Wholesale Customer'}</Text>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 14 }} keyboardShouldPersistTaps="handled">
          {/* Role badge */}
          <View style={[modal.roleBanner, { backgroundColor: isStaff ? '#EDE9FE' : isShopDisplay ? '#DBEAFE' : '#DCFCE7' }]}>
            <Feather name={isStaff ? 'users' : isShopDisplay ? 'monitor' : 'package'} size={15} color={isStaff ? '#5B21B6' : isShopDisplay ? '#1D4ED8' : '#166534'} />
            <Text style={[modal.roleBannerText, { color: isStaff ? '#5B21B6' : isShopDisplay ? '#1D4ED8' : '#166534' }]}>
              {isStaff ? 'New staff account will be pre-approved' : isShopDisplay ? 'Limited counter iPad access only' : 'Wholesale account will be marked approved'}
            </Text>
          </View>
          {/* Common fields */}
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="user" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT }]} placeholder="Full name" placeholderTextColor={MUTED} value={name} onChangeText={setName} autoCapitalize="words" />
          </View>
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="mail" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT }]} placeholder="Email address" placeholderTextColor={MUTED} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          </View>
          <View style={[modal.inputRow, { borderColor: BORDER }]}>
            <Feather name="lock" size={15} color={MUTED} />
            <TextInput style={[modal.input, { color: TEXT, flex: 1 }]} placeholder="Temporary password (min. 8 chars)" placeholderTextColor={MUTED} value={password} onChangeText={setPassword} secureTextEntry={!showPw} autoComplete="new-password" />
            <Pressable onPress={() => setShowPw(p => !p)}>
              <Feather name={showPw ? 'eye-off' : 'eye'} size={15} color={MUTED} />
            </Pressable>
          </View>
          {/* Staff-specific */}
          {isStaff && (
            <>
              <Text style={[modal.sectionLabel, { color: MUTED }]}>CONTACT</Text>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="phone" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Phone number (optional)" placeholderTextColor={MUTED} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              </View>
              <AddressSearchInput
                currentValue={address || undefined}
                placeholder="Search home address…"
                onSelect={(r) => {
                  const parts = [r.street, r.suburb, r.state, r.postcode].filter(Boolean);
                  setAddress(parts.join(', '));
                }}
              />
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="map-pin" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Home address (optional)" placeholderTextColor={MUTED} value={address} onChangeText={setAddress} autoCapitalize="words" />
              </View>
              <Text style={[modal.sectionLabel, { color: MUTED }]}>EMPLOYMENT</Text>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="briefcase" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Position (e.g. Barista, Crew)" placeholderTextColor={MUTED} value={position} onChangeText={setPosition} autoCapitalize="words" />
              </View>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="layers" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Department (e.g. floor, kitchen)" placeholderTextColor={MUTED} value={department} onChangeText={setDepartment} autoCapitalize="none" />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={[modal.sectionLabel, { color: MUTED, marginBottom: 4 }]}>EMPLOYMENT STATUS</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {['casual', 'part-time', 'full-time'].map(s => (
                    <Pressable key={s} onPress={() => { setEmploymentStatus(s); Haptics.selectionAsync(); }}
                      style={[modal.chip, { backgroundColor: employmentStatus === s ? BLUE : BG, borderColor: employmentStatus === s ? BLUE : BORDER }]}>
                      <Text style={[modal.chipText, { color: employmentStatus === s ? '#fff' : TEXT }]}>
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="dollar-sign" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Hourly rate (e.g. 24.50)" placeholderTextColor={MUTED} value={hourlyRate} onChangeText={setHourlyRate} keyboardType="decimal-pad" />
              </View>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <Feather name="hash" size={15} color={MUTED} />
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Tax File Number (optional)" placeholderTextColor={MUTED} value={tfn} onChangeText={setTfn} keyboardType="numeric" secureTextEntry />
              </View>
              <View style={[modal.toggleRow, { borderColor: BORDER }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[modal.toggleLabel, { color: TEXT }]}>Manager permissions</Text>
                  <Text style={[modal.toggleSub, { color: MUTED }]}>Can view staff timesheets and update geo radius</Text>
                </View>
                <Switch value={isManager} onValueChange={setIsManager} trackColor={{ false: '#D1D5DB', true: BLUE }} thumbColor="#fff" ios_backgroundColor="#D1D5DB" />
              </View>
            </>
          )}
          {/* Wholesale-specific */}
          {!isStaff && !isShopDisplay && (
            <>
              <Text style={[modal.sectionLabel, { color: MUTED }]}>COMPANY DETAILS</Text>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Company name *" placeholderTextColor={MUTED} value={companyName} onChangeText={setCompanyName} autoCapitalize="words" />
              </View>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="ABN (optional)" placeholderTextColor={MUTED} value={abn} onChangeText={setAbn} keyboardType="numeric" />
              </View>
              <View style={[modal.inputRow, { borderColor: BORDER }]}>
                <TextInput style={[modal.input, { color: TEXT }]} placeholder="Phone (optional)" placeholderTextColor={MUTED} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
              </View>
            </>
          )}
          {error ? (
            <View style={modal.errorBox}>
              <Feather name="alert-circle" size={14} color={RED} />
              <Text style={[modal.errorText, { color: RED }]}>{error}</Text>
            </View>
          ) : null}
          <Pressable onPress={handleSubmit} disabled={loading} style={[modal.submitBtn, { backgroundColor: isStaff ? BLUE : isShopDisplay ? BLUE : GREEN, opacity: loading ? 0.8 : 1 }]}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : (
              <Text style={modal.submitBtnText}>Create {isStaff ? 'Staff Account' : isShopDisplay ? 'POS Screen Login' : 'Wholesale Account'}</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export { CreateUserModal };

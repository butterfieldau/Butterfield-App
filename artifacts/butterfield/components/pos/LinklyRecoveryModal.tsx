import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { BLUE, BORDER, CHERRY, DARK, MID, WHITE, fmtCents } from './types';
import { LINKLY_ACTIVE_SESSION_KEY } from './linklyStream';

export default function LinklyRecoveryModal({
  recoverySession,
  recoveryDone,
  recoveryText,
  onCancel,
  onDone,
}: {
  recoverySession: { sessionId: string; amountCents: number } | null;
  recoveryDone: { approved: boolean; text: string } | null;
  recoveryText: string;
  onCancel: () => void;
  onDone: () => void;
}) {
  if (!recoverySession) return null;

  const handleDismiss = () => {
    AsyncStorage.removeItem(LINKLY_ACTIVE_SESSION_KEY).catch(() => {});
    onCancel();
  };

  return (
    <Modal visible animationType="fade" transparent onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.72)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 400, backgroundColor: WHITE, borderRadius: 22, padding: 24, gap: 16, borderWidth: 1, borderColor: BORDER, shadowColor: DARK, shadowOpacity: 0.18, shadowRadius: 28, shadowOffset: { width: 0, height: 14 }, elevation: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: recoveryDone ? (recoveryDone.approved ? '#DCFCE7' : '#FEE2E2') : '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
              {recoveryDone
                ? <Feather name={recoveryDone.approved ? 'check-circle' : 'x-circle'} size={22} color={recoveryDone.approved ? '#16A34A' : CHERRY} />
                : <ActivityIndicator color={BLUE} size="small" />
              }
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: DARK }}>
                {recoveryDone ? (recoveryDone.approved ? 'Payment Approved' : 'Payment Declined') : 'Resuming Payment'}
              </Text>
              <Text style={{ fontSize: 12, color: MID, marginTop: 2 }}>
                {recoveryDone
                  ? fmtCents(recoverySession.amountCents)
                  : `${fmtCents(recoverySession.amountCents)} — recovered from previous session`}
              </Text>
            </View>
          </View>

          <View style={{ backgroundColor: '#F8FAFF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER }}>
            <Text style={{ fontSize: 14, color: MID, fontWeight: '600', textAlign: 'center' }}>
              {recoveryDone ? recoveryDone.text : (recoveryText || 'Waiting for terminal…')}
            </Text>
          </View>

          {recoveryDone ? (
            <Pressable
              onPress={onDone}
              style={({ pressed }) => [{ backgroundColor: BLUE, borderRadius: 12, paddingVertical: 13, alignItems: 'center' }, pressed && { opacity: 0.8 }]}
            >
              <Text style={{ color: WHITE, fontSize: 15, fontWeight: '800' }}>Done</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleDismiss}
              style={({ pressed }) => [{ borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: BORDER }, pressed && { opacity: 0.8 }]}
            >
              <Text style={{ color: MID, fontSize: 15, fontWeight: '700' }}>Dismiss</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

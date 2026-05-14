import { Feather } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { CenteredGlassModal } from '@/components/CenteredGlassModal';

const QR_GRADIENT = ['#0e1a88', '#7092ff'];

type CustomerQrModalProps = {
  visible: boolean;
  onClose: () => void;
  qrValue: string | null;
  customerName: string;
  helperText: string;
  statusText: string;
  isLoading?: boolean;
  onRetry?: () => void;
};

export function CustomerQrModal({
  visible,
  onClose,
  qrValue,
  customerName,
  helperText,
  statusText,
  isLoading = false,
  onRetry,
}: CustomerQrModalProps) {
  const showRetry = !qrValue && !isLoading && !!onRetry;

  return (
    <CenteredGlassModal
      visible={visible}
      onClose={onClose}
      contentStyle={styles.content}
      cardStyle={styles.card}
    >
      <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
        <Feather name="x" size={22} color="#0F172A" />
      </Pressable>

      <View style={styles.qrFrame}>
        {qrValue ? (
          <QRCode
            value={qrValue}
            size={210}
            backgroundColor="#FFFFFF"
            color="#0e1a88"
            enableLinearGradient
            linearGradient={QR_GRADIENT}
            gradientDirection={['0%', '0%', '100%', '100%']}
          />
        ) : (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color="#335BFF" />
            <Text style={styles.loadingText}>
              {isLoading ? 'Preparing your QR code' : 'Your loyalty card is almost ready'}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.name}>{customerName}</Text>
      <Text style={styles.subLabel}>Membership Card</Text>
      <Text style={styles.helperText}>{helperText}</Text>
      <Text style={styles.statusText}>{statusText}</Text>

      {showRetry ? (
        <Pressable onPress={onRetry} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Refresh loyalty card</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onClose} style={styles.primaryBtn}>
          <Text style={styles.primaryBtnText}>Done</Text>
        </Pressable>
      )}
    </CenteredGlassModal>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 22,
    paddingVertical: 22,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 0,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 22,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 16,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 2,
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrFrame: {
    width: 248,
    height: 248,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    marginBottom: 18,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 18,
  },
  loadingText: {
    fontWeight: '500',
    fontSize: 15,
    lineHeight: 20,
    color: '#475569',
    textAlign: 'center',
  },
  name: {
    fontWeight: '700',
    fontSize: 26,
    lineHeight: 30,
    color: '#111827',
    textAlign: 'center',
  },
  subLabel: {
    marginTop: 6,
    fontWeight: '500',
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
  },
  helperText: {
    marginTop: 14,
    fontWeight: '400',
    fontSize: 14,
    lineHeight: 20,
    color: '#475569',
    textAlign: 'center',
  },
  statusText: {
    marginTop: 8,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 20,
    color: '#0F172A',
    textAlign: 'center',
  },
  primaryBtn: {
    marginTop: 18,
    minWidth: 180,
    borderRadius: 18,
    backgroundColor: '#0F172A',
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontWeight: '600',
    fontSize: 15,
    color: '#FFFFFF',
  },
});

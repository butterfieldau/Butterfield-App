/**
 * TableQrModal — full-screen QR code viewer for a single dining table.
 * Tapped from the Tables tab of the Store Editor. Shows the canonical table
 * URL encoded as a QR code. The Share button captures the QR as a PNG and
 * invokes the native share sheet so directors can AirDrop / email it to print.
 */

import React, { useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Pressable, Share, StyleSheet, Text, View,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

import { BG, BLUE, NAVY, TEXT, MUTED, BORDER, CARD, GREEN } from '@/components/director/directorColors';

interface Props {
  visible: boolean;
  onClose: () => void;
  tableLabel: string;     // display name, e.g. "Table 4" or "Bar 1"
  qrUrl: string;          // canonical URL to encode
}

export function TableQrModal({ visible, onClose, tableLabel, qrUrl }: Props) {
  const svgRef = useRef<any>(null);
  const [sharing, setSharing] = useState(false);

  const handleShare = async () => {
    if (!svgRef.current) {
      // Fallback: share the URL as text
      await Share.share({ message: `${tableLabel} QR code link:\n${qrUrl}` });
      return;
    }
    setSharing(true);
    try {
      svgRef.current.toDataURL(async (base64Data: string) => {
        try {
          const fileUri = FileSystem.cacheDirectory + `table-qr-${Date.now()}.png`;
          // base64Data from react-native-qrcode-svg is the raw base64 (no data: prefix)
          await FileSystem.writeAsStringAsync(fileUri, base64Data, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'image/png',
              dialogTitle: `${tableLabel} QR Code`,
            });
          } else {
            // Fallback on platforms where file sharing isn't available
            await Share.share({ message: `${tableLabel} QR code link:\n${qrUrl}` });
          }
        } catch (err: any) {
          Alert.alert('Share failed', err?.message ?? 'Could not share the QR code.');
        } finally {
          setSharing(false);
        }
      });
    } catch {
      setSharing(false);
      await Share.share({ message: `${tableLabel} QR code link:\n${qrUrl}` });
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={st.root}>
        {/* Header */}
        <View style={st.header}>
          <Pressable onPress={onClose} hitSlop={12} style={st.closeBtn}>
            <Feather name="x" size={20} color={TEXT} />
          </Pressable>
          <Text style={st.headerTitle}>Table QR Code</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Content */}
        <View style={st.body}>
          {/* QR card */}
          <View style={st.qrCard}>
            <QRCode
              value={qrUrl || ' '}
              size={220}
              color={NAVY}
              backgroundColor="#FFFFFF"
              getRef={(ref: any) => { svgRef.current = ref; }}
              ecl="M"
            />
          </View>

          {/* Label */}
          <Text style={st.tableLabel}>{tableLabel}</Text>
          <Text style={st.urlText} numberOfLines={2}>{qrUrl}</Text>

          {/* Instructions */}
          <View style={st.infoBox}>
            <Feather name="info" size={14} color={BLUE} />
            <Text style={st.infoText}>
              Customers scan this QR code to order from their table. Tap Share to save or send the image for printing.
            </Text>
          </View>

          {/* Share button */}
          <Pressable
            onPress={handleShare}
            disabled={sharing}
            style={({ pressed }) => [st.shareBtn, (pressed || sharing) && { opacity: 0.7 }]}
          >
            {sharing
              ? <ActivityIndicator size="small" color="#fff" />
              : <Feather name="share-2" size={17} color="#fff" />
            }
            <Text style={st.shareBtnText}>{sharing ? 'Preparing…' : 'Share QR Code'}</Text>
          </Pressable>

          {/* Copy URL button */}
          <Pressable
            onPress={() => Share.share({ message: qrUrl, title: `${tableLabel} table ordering link` })}
            style={({ pressed }) => [st.copyBtn, pressed && { opacity: 0.7 }]}
          >
            <Feather name="link" size={15} color={BLUE} />
            <Text style={st.copyBtnText}>Copy Link</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  root:       { flex: 1, backgroundColor: BG },
  header:     {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14,
    backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  closeBtn:   { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle:{ fontWeight: '700', fontSize: 18, color: TEXT },
  body:       { flex: 1, alignItems: 'center', paddingHorizontal: 24, paddingTop: 40, gap: 16 },
  qrCard:     {
    backgroundColor: '#FFFFFF', borderRadius: 24, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10, shadowRadius: 16, elevation: 4,
  },
  tableLabel: { fontSize: 24, fontWeight: '800', color: TEXT, textAlign: 'center', marginTop: 8 },
  urlText:    { fontSize: 11, color: MUTED, textAlign: 'center', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', maxWidth: '100%' },
  infoBox:    {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#EFF6FF', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#BFDBFE', width: '100%',
  },
  infoText:   { flex: 1, fontSize: 13, color: '#1D4ED8', lineHeight: 19 },
  shareBtn:   {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: BLUE, borderRadius: 14, paddingVertical: 15, paddingHorizontal: 32,
    width: '100%', marginTop: 8,
  },
  shareBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  copyBtn:    {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, paddingVertical: 13, paddingHorizontal: 24,
    borderWidth: 1.5, borderColor: BLUE, backgroundColor: '#EFF6FF', width: '100%',
  },
  copyBtnText:{ fontSize: 15, fontWeight: '600', color: BLUE },
});

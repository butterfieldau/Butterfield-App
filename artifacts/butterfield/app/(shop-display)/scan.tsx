import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, TextInput } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { StampScanScreen } from '@/components/StampScanScreen';

export default function ShopDisplayScanScreen() {
  const isFocused = useIsFocused();
  const hidInputRef = useRef<TextInput>(null);
  const hidBuffer = useRef('');
  const [externalScanData, setExternalScanData] = useState<string | null>(null);

  // Keep the hidden TextInput focused to capture Bluetooth HID scanner input.
  // BT scanners act as keyboards: they type barcode chars then send Return/Enter.
  const refocusHid = useCallback(() => {
    setTimeout(() => hidInputRef.current?.focus(), 200);
  }, []);

  useEffect(() => {
    if (isFocused) refocusHid();
  }, [isFocused, refocusHid]);

  // Once we pass the scan data in, clear it so StampScanScreen can reset
  const handleScanHandled = useCallback(() => {
    setExternalScanData(null);
    hidBuffer.current = '';
    refocusHid();
  }, [refocusHid]);

  // Unmount the camera entirely when this tab is not visible.
  // This releases the camera hardware and stops the preview on other tabs.
  if (!isFocused) return <View style={{ flex: 1 }} />;

  return (
    <>
      <StampScanScreen
        externalScanData={externalScanData}
        onExternalScanHandled={handleScanHandled}
      />

      {/* Hidden TextInput that captures Bluetooth HID scanner keystrokes.
          showSoftInputOnFocus={false} suppresses the iOS software keyboard
          while still allowing Bluetooth HID (hardware) keyboard input. */}
      <TextInput
        ref={hidInputRef}
        style={{ position: 'absolute', opacity: 0, height: 0, width: 0, pointerEvents: 'none' }}
        autoFocus
        showSoftInputOnFocus={false}
        blurOnSubmit={false}
        caretHidden
        onChangeText={(t) => { hidBuffer.current = t; }}
        onSubmitEditing={() => {
          const val = hidBuffer.current.trim();
          if (val.length > 0) setExternalScanData(val);
          hidBuffer.current = '';
          setTimeout(() => hidInputRef.current?.focus(), 600);
        }}
        onBlur={refocusHid}
      />
    </>
  );
}

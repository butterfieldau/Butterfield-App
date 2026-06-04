import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';
import { StampScanScreen } from '@/components/StampScanScreen';

export default function ShopDisplayScanScreen() {
  const hidInputRef = useRef<TextInput>(null);
  const hidBuffer = useRef('');
  const [externalScanData, setExternalScanData] = useState<string | null>(null);

  // Keep the hidden TextInput focused to capture Bluetooth HID scanner input.
  // BT scanners act as keyboards: they type barcode chars then send Return/Enter.
  const refocusHid = useCallback(() => {
    setTimeout(() => hidInputRef.current?.focus(), 200);
  }, []);

  useEffect(() => {
    refocusHid();
  }, [refocusHid]);

  // Once we pass the scan data in, clear it so StampScanScreen can reset
  const handleScanHandled = useCallback(() => {
    setExternalScanData(null);
    hidBuffer.current = '';
    refocusHid();
  }, [refocusHid]);

  return (
    <>
      <StampScanScreen
        externalScanData={externalScanData}
        onExternalScanHandled={handleScanHandled}
      />

      {/* Hidden TextInput that captures Bluetooth HID scanner keystrokes */}
      <TextInput
        ref={hidInputRef}
        style={{ position: 'absolute', opacity: 0, height: 0, width: 0, pointerEvents: 'none' }}
        autoFocus
        blurOnSubmit={false}
        caretHidden
        onChangeText={(t) => { hidBuffer.current = t; }}
        onSubmitEditing={() => {
          const val = hidBuffer.current.trim();
          if (val.length > 0) setExternalScanData(val);
          hidBuffer.current = '';
          // Re-focus after the stamp screen has a moment to handle it
          setTimeout(() => hidInputRef.current?.focus(), 600);
        }}
        onBlur={refocusHid}
      />
    </>
  );
}

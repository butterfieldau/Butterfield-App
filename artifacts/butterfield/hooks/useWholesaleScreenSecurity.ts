import { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import * as ScreenCapture from 'expo-screen-capture';
import Constants from 'expo-constants';
import { api } from '@/lib/api';
import { WHOLESALE_TERMS_VERSION } from '@/constants/wholesaleTerms';

interface Options {
  screenName: string;
  enabled?: boolean;
}

export function useWholesaleScreenSecurity({ screenName, enabled = true }: Options) {
  const loggedViewRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    let screenshotSub: ScreenCapture.Subscription | null = null;

    const platform  = Platform.OS;
    const appVersion = Constants.expoConfig?.version ?? null;

    async function setup() {
      if (loggedViewRef.current) return;
      loggedViewRef.current = true;

      if (Platform.OS === 'android') {
        try {
          await ScreenCapture.preventScreenCaptureAsync();
        } catch {}
      }

      if (Platform.OS === 'ios') {
        try {
          screenshotSub = ScreenCapture.addScreenshotListener(() => {
            api.wholesale.logSecurityEvent({
              eventType:      'screenshot_detected',
              screenName,
              termsVersion:   WHOLESALE_TERMS_VERSION,
              devicePlatform: platform,
              appVersion:     appVersion ?? undefined,
              metadata:       { platform, screenName },
            }).catch(() => {});

            Alert.alert(
              'Screenshot Detected',
              'Wholesale pricing is confidential and must not be copied, shared or distributed.',
              [{ text: 'OK' }],
            );
          });
        } catch {}
      }
    }

    setup();

    return () => {
      screenshotSub?.remove();
      if (Platform.OS === 'android') {
        ScreenCapture.allowScreenCaptureAsync().catch(() => {});
      }
      loggedViewRef.current = false;
    };
  }, [screenName, enabled]);
}

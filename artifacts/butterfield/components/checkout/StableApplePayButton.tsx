import React, { memo, useCallback, useRef } from 'react';
import { PlatformPay, PlatformPayButton, usePlatformPay } from '@stripe/stripe-react-native';

export type StableApplePayButtonProps = {
  clientSecret: string;
  totalAmount: number;
  merchantCountryCode?: string;
  currencyCode?: string;
  onSuccess?: () => void;
  onError?: (message: string) => void;
  onFinished?: () => void;
};

function StableApplePayButtonBase({
  clientSecret,
  totalAmount,
  merchantCountryCode = 'AU',
  currencyCode = 'AUD',
  onSuccess,
  onError,
  onFinished,
}: StableApplePayButtonProps) {
  const { confirmPlatformPayPayment } = usePlatformPay();
  const processingRef = useRef(false);

  console.log('Apple Pay button rendered');

  const handlePress = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      const { error } = await confirmPlatformPayPayment(clientSecret, {
        applePay: {
          merchantCountryCode,
          currencyCode,
          cartItems: [
            {
              label: 'Butterfield',
              amount: totalAmount.toFixed(2),
              paymentType: PlatformPay.PaymentType.Immediate,
            },
          ],
        },
      } as any);

      if (error) {
        onError?.(error.message ?? 'Apple Pay payment failed.');
        return;
      }

      onSuccess?.();
    } catch {
      onError?.('Something went wrong with Apple Pay.');
    } finally {
      processingRef.current = false;
      onFinished?.();
    }
  }, [
    clientSecret,
    totalAmount,
    merchantCountryCode,
    currencyCode,
    confirmPlatformPayPayment,
    onSuccess,
    onError,
    onFinished,
  ]);

  return (
    <PlatformPayButton
      type={PlatformPay.ButtonType.Pay}
      appearance={PlatformPay.ButtonStyle.Black}
      borderRadius={12}
      onPress={handlePress}
      style={{ width: '100%', height: 52 }}
    />
  );
}

export const StableApplePayButton = memo(StableApplePayButtonBase);

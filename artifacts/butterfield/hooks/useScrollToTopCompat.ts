import { RefObject } from 'react';

// Expo Router already handles the main tab navigation flow for this app.
// We keep this lightweight local hook so screens don't depend directly on
// @react-navigation/native just to opt into scroll-to-top behavior.
export function useScrollToTopCompat(_ref: RefObject<unknown> | { current: unknown } | null | undefined): void {
  // Intentionally left as a no-op compatibility shim.
}

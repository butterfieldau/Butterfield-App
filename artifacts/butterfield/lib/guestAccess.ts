import { router, type Href } from 'expo-router';

export type AccountFeatureTarget =
  | '/(customer)/loyalty'
  | '/(customer)/cart'
  | '/orders'
  | '/addresses'
  | '/edit-details'
  | '/notifications'
  | '/notification-prefs'
  | '/help-support';

export function openExistingLogin(redirectTo?: string, mode?: 'login' | 'register') {
  router.push({
    pathname: '/(auth)/login',
    params: {
      ...(redirectTo ? { redirectTo } : {}),
      ...(mode === 'register' ? { mode: 'register' } : {}),
    },
  } as Href);
}


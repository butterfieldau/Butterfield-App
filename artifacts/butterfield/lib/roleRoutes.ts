import type { Href } from 'expo-router';
import type { UserRole } from '@/types';

export function getHomeRouteForRole(role?: UserRole | null): Href {
  if (role === 'customer') return '/(customer)';
  if (role === 'wholesale') return '/(wholesale)';
  if (role === 'shop_display') return '/(shop-display)';
  if (role === 'staff' || role === 'manager' || role === 'director' || role === 'master') {
    return '/(director)';
  }
  return '/(customer)';
}

export function isInternalRole(role?: UserRole | null): boolean {
  return role === 'staff' || role === 'manager' || role === 'director' || role === 'master' || role === 'shop_display';
}

import type { ApiOrder } from './api';

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  received:         { bg: '#FEF9C3', text: '#854D0E' },
  being_prepared:   { bg: '#EDE9FE', text: '#5B21B6' },
  ready_for_pickup: { bg: '#DCFCE7', text: '#166534' },
  out_for_delivery: { bg: '#DBEAFE', text: '#1E40AF' },
  completed:        { bg: '#F3F4F6', text: '#6B7280' },
  cancelled:        { bg: '#FEE2E2', text: '#991B1B' },
  refunded:         { bg: '#F3E8FF', text: '#6B21A8' },
  pending:          { bg: '#DBEAFE', text: '#1E40AF' },
  processing:       { bg: '#FEF3C7', text: '#92400E' },
  dispatched:       { bg: '#EDE9FE', text: '#5B21B6' },
  delivered:        { bg: '#DCFCE7', text: '#166534' },
  scheduled:        { bg: '#FEF3C7', text: '#92400E' },
  accepted:         { bg: '#DCFCE7', text: '#166534' },
};

export const STATUS_LABEL: Record<string, string> = {
  received:         'Pending',
  being_prepared:   'Preparing',
  ready_for_pickup: 'Ready',
  out_for_delivery: 'Out for Delivery',
  completed:        'Completed',
  cancelled:        'Cancelled',
  refunded:         'Refunded',
  pending:          'Pending',
  processing:       'Processing',
  dispatched:       'Dispatched',
  delivered:        'Delivered',
  scheduled:        'Scheduled',
  accepted:         'Confirmed',
};

export const ACTION_LABEL: Record<string, string> = {
  accepted:         'Accept Order',
  being_prepared:   'Start Preparing',
  ready_for_pickup: 'Mark Ready for Pickup',
  out_for_delivery: 'Mark Out for Delivery',
  completed:        'Mark Complete',
  cancelled:        'Cancel Order',
  refunded:         'Process Refund',
  received:         'Move Back to Pending',
  processing:       'Start Processing',
  dispatched:       'Mark Dispatched',
  delivered:        'Mark Delivered',
  pending:          'Move Back to Pending',
};

export const WHOLESALE_NEXT: Record<string, string[]> = {
  pending:    ['processing', 'cancelled', 'refunded'],
  processing: ['pending', 'dispatched', 'cancelled', 'refunded'],
  dispatched: ['processing', 'delivered', 'cancelled', 'refunded'],
  delivered: [], cancelled: [], refunded: [],
};

export function getCustomerNextStatuses(order: ApiOrder): string[] {
  const isDelivery = order.type === 'delivery' || order.deliveryType === 'delivery';
  const isQuickPickup = !isDelivery && !order.scheduledFor;

  const transitions: Record<string, string[]> = isQuickPickup
    ? {
        received:       ['being_prepared', 'cancelled', 'refunded'],
        being_prepared: ['completed', 'cancelled', 'refunded'],
      }
    : isDelivery
    ? {
        scheduled:        ['accepted', 'cancelled', 'refunded'],
        accepted:         ['being_prepared', 'cancelled', 'refunded'],
        being_prepared:   ['out_for_delivery', 'cancelled', 'refunded'],
        out_for_delivery: ['completed', 'cancelled', 'refunded'],
      }
    : {
        scheduled:        ['accepted', 'cancelled', 'refunded'],
        accepted:         ['being_prepared', 'cancelled', 'refunded'],
        being_prepared:   ['ready_for_pickup', 'cancelled', 'refunded'],
        ready_for_pickup: ['completed', 'cancelled', 'refunded'],
      };

  return transitions[order.status] ?? [];
}

export const ORDER_STATUS_SECTIONS = [
  {
    key:          'active',
    label:        'Active',
    accentColor:  '#F59E0B',
    statuses:     new Set(['received', 'being_prepared', 'processing', 'dispatched']),
    isWholesale:  false,
  },
  {
    key:          'scheduled',
    label:        'Scheduled',
    accentColor:  '#8B5CF6',
    statuses:     new Set(['scheduled', 'accepted']),
    isWholesale:  false,
  },
  {
    key:          'ready',
    label:        'Ready',
    accentColor:  '#16A34A',
    statuses:     new Set(['ready_for_pickup', 'out_for_delivery']),
    isWholesale:  false,
  },
  {
    key:          'wholesale',
    label:        'Wholesale',
    accentColor:  '#16A34A',
    statuses:     new Set<string>(),
    isWholesale:  true,
  },
  {
    key:          'completed',
    label:        'Completed',
    accentColor:  '#6B7280',
    statuses:     new Set(['completed', 'delivered']),
    isWholesale:  false,
  },
  {
    key:          'cancelled',
    label:        'Cancelled / Refunded',
    accentColor:  '#DC2626',
    statuses:     new Set(['cancelled', 'refunded']),
    isWholesale:  false,
  },
] as const;

export type OrderSectionKey = (typeof ORDER_STATUS_SECTIONS)[number]['key'];

export function getOrderSectionKey(order: ApiOrder): OrderSectionKey {
  if (order.orderSource === 'wholesale') return 'wholesale';
  if (['received', 'being_prepared', 'processing', 'dispatched'].includes(order.status)) return 'active';
  if (['scheduled', 'accepted'].includes(order.status)) return 'scheduled';
  if (['ready_for_pickup', 'out_for_delivery'].includes(order.status)) return 'ready';
  if (['completed', 'delivered'].includes(order.status)) return 'completed';
  if (['cancelled', 'refunded'].includes(order.status)) return 'cancelled';
  return 'active';
}

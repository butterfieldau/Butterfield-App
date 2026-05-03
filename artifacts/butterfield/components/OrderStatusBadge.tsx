import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { OrderStatus } from '@/types';

const STATUS_CONFIG: Record<OrderStatus, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: '#FEF3C7', text: '#92400E' },
  'in-progress': { label: 'In Progress', bg: '#DBEAFE', text: '#1E40AF' },
  ready: { label: 'Ready', bg: '#D1FAE5', text: '#065F46' },
  completed: { label: 'Completed', bg: '#F3F4F6', text: '#6B7280' },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const config = STATUS_CONFIG[status];
  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.text, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

export function WholesaleStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    processing: { label: 'Processing', bg: '#FEF3C7', text: '#92400E' },
    confirmed: { label: 'Confirmed', bg: '#DBEAFE', text: '#1E40AF' },
    dispatched: { label: 'Dispatched', bg: '#EDE9FE', text: '#5B21B6' },
    delivered: { label: 'Delivered', bg: '#D1FAE5', text: '#065F46' },
  };
  const c = config[status] ?? { label: status, bg: '#F3F4F6', text: '#6B7280' };
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.text }]}>{c.label}</Text>
    </View>
  );
}

export function InvoiceStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    paid: { label: 'Paid', bg: '#D1FAE5', text: '#065F46' },
    pending: { label: 'Pending', bg: '#FEF3C7', text: '#92400E' },
    overdue: { label: 'Overdue', bg: '#FEE2E2', text: '#991B1B' },
  };
  const c = config[status] ?? { label: status, bg: '#F3F4F6', text: '#6B7280' };
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.text }]}>{c.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});

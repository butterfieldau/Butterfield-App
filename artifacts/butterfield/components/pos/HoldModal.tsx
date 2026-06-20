import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import styles from './posStyles';
import { BLUE, CHERRY, DARK, MUTED, fmtCents, ticketTotal } from './types';
import type { Ticket } from './types';

export default function HoldModal({ tickets, activeIdx, onResume, onDelete, onClose }: {
  tickets: Ticket[];
  activeIdx: number;
  onResume: (idx: number) => void;
  onDelete: (idx: number) => void;
  onClose: () => void;
}) {
  const held = tickets
    .map((t, i) => ({ ticket: t, idx: i }))
    .filter(({ idx, ticket }) => idx !== activeIdx && ticket.items.length > 0);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.customiseRoot}>
        <View style={styles.sheetHeader}>
          <Pressable onPress={onClose} hitSlop={12}>
            <Feather name="x" size={22} color={DARK} />
          </Pressable>
          <Text style={styles.sheetTitle}>
            {held.length > 0 ? `${held.length} Order${held.length > 1 ? 's' : ''} on Hold` : 'Held Orders'}
          </Text>
          <View style={{ width: 22 }} />
        </View>

        {held.length === 0 ? (
          <View style={styles.holdEmptyState}>
            <Feather name="inbox" size={40} color={MUTED} />
            <Text style={styles.holdEmptyTitle}>No held orders</Text>
            <Text style={styles.holdEmptyText}>Use the Hold button on a ticket to park it here.</Text>
          </View>
        ) : (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 10 }}>
            {held.map(({ ticket, idx }) => {
              const total = ticketTotal(ticket);
              const itemCount = ticket.items.reduce((s, i) => s + i.quantity, 0);
              const summary = ticket.items.map(i =>
                `${i.productName}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`
              ).join(', ');
              return (
                <TouchableOpacity
                  key={ticket.id}
                  style={styles.holdRow}
                  onPress={() => onResume(idx)}
                  activeOpacity={0.75}
                >
                  <View style={styles.holdRowIcon}>
                    <Feather name="shopping-bag" size={18} color={BLUE} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      {ticket.customer && (
                        <Text style={styles.holdRowCustomer}>{ticket.customer.name}</Text>
                      )}
                      <Text style={styles.holdRowMeta}>
                        {itemCount} item{itemCount !== 1 ? 's' : ''} · {ticket.orderType === 'dine_in' ? 'Dine In' : ticket.orderType === 'takeaway' ? 'Takeaway' : 'Counter'}
                      </Text>
                    </View>
                    <Text style={styles.holdRowItems} numberOfLines={2}>{summary}</Text>
                    {ticket.notes ? (
                      <Text style={styles.holdRowNote} numberOfLines={1}>📝 {ticket.notes}</Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={styles.holdRowTotal}>{fmtCents(total)}</Text>
                    <Pressable
                      onPress={() => onDelete(idx)}
                      hitSlop={8}
                      style={styles.holdRowDelete}
                    >
                      <Feather name="trash-2" size={14} color={CHERRY} />
                    </Pressable>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

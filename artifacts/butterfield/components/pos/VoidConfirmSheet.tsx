import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';
import SupervisorPinCapture from './SupervisorPinCapture';
import styles from './posStyles';
import { fmtCents, ticketTotal, WHITE, CHERRY } from './types';
import type { Ticket } from './types';

export default function VoidConfirmSheet({
  ticket, lastOrderId, voidThresholdCents, onClose, onVoidTicket, onVoidLastOrder,
}: {
  ticket: Ticket;
  lastOrderId: string | null;
  voidThresholdCents: number;
  onClose: () => void;
  onVoidTicket: (supervisorPin?: string) => void;
  onVoidLastOrder: (supervisorPin: string) => void;
}) {
  const total = ticketTotal(ticket);
  const hasItems = ticket.items.length > 0;
  const requiresPin = hasItems && total >= voidThresholdCents;
  const [showPin, setShowPin]       = useState(false);
  const [pinTarget, setPinTarget]   = useState<'ticket' | 'order'>('ticket');

  const handleVoidTicket = () => {
    if (requiresPin) {
      setPinTarget('ticket');
      setShowPin(true);
    } else {
      onVoidTicket();
    }
  };

  const handleVoidLastOrder = () => {
    setPinTarget('order');
    setShowPin(true);
  };

  return (
    <>
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={styles.voidOverlay} onPress={onClose}>
          <Pressable style={styles.voidSheet} onPress={() => {}}>
            <View style={styles.voidHandle} />

            <View style={styles.voidHeader}>
              <View style={styles.voidIconBg}>
                <Feather name="slash" size={20} color={CHERRY} />
              </View>
              <Text style={styles.voidTitle}>Void Sale</Text>
            </View>

            {hasItems && (
              <View style={styles.voidSection}>
                <Text style={styles.voidSectionLabel}>CURRENT TICKET</Text>
                <View style={styles.voidItemsList}>
                  {ticket.items.map(item => (
                    <View key={item.localId} style={styles.voidItemRow}>
                      <Text style={styles.voidItemQty}>{item.quantity}×</Text>
                      <Text style={styles.voidItemName} numberOfLines={1}>{item.productName}</Text>
                      <Text style={styles.voidItemPrice}>
                        {fmtCents((item.priceOverrideCents ?? item.unitPriceCents) * item.quantity)}
                      </Text>
                    </View>
                  ))}
                </View>
                <View style={styles.voidTotalRow}>
                  <Text style={styles.voidTotalLabel}>Total to void</Text>
                  <Text style={styles.voidTotalValue}>{fmtCents(total)}</Text>
                </View>
                {requiresPin && (
                  <View style={styles.voidPinNote}>
                    <Feather name="shield" size={12} color="#F59E0B" />
                    <Text style={styles.voidPinNoteText}>
                      Supervisor PIN required for voids over {fmtCents(voidThresholdCents)}
                    </Text>
                  </View>
                )}
                <TouchableOpacity onPress={handleVoidTicket} style={styles.voidConfirmBtn} activeOpacity={0.8}>
                  <Feather name="x-circle" size={16} color={WHITE} />
                  <Text style={styles.voidConfirmBtnText}>Void This Ticket</Text>
                </TouchableOpacity>
              </View>
            )}

            {lastOrderId && (
              <View style={styles.voidSection}>
                <Text style={styles.voidSectionLabel}>LAST TRANSACTION</Text>
                <Text style={styles.voidLastNote}>
                  Supervisor PIN required to void a completed payment.
                </Text>
                <TouchableOpacity onPress={handleVoidLastOrder} style={styles.voidLastBtn} activeOpacity={0.8}>
                  <Feather name="rotate-ccw" size={15} color={CHERRY} />
                  <Text style={styles.voidLastBtnText}>Void Last Transaction</Text>
                </TouchableOpacity>
              </View>
            )}

            {!hasItems && !lastOrderId && (
              <View style={styles.voidEmpty}>
                <Feather name="check-circle" size={36} color={styles.voidEmptyText.color as string} />
                <Text style={styles.voidEmptyText}>No active sale or recent transaction to void</Text>
              </View>
            )}

            <Pressable onPress={onClose} style={styles.voidCancelBtn}>
              <Text style={styles.voidCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {showPin && (
        <SupervisorPinCapture
          title="Void Authorisation"
          subtitle={
            pinTarget === 'ticket'
              ? 'Enter supervisor PIN to void this sale'
              : 'Enter supervisor PIN to void the last transaction'
          }
          onClose={() => setShowPin(false)}
          onSuccess={(pin) => {
            setShowPin(false);
            if (pinTarget === 'ticket') {
              onVoidTicket(pin);
            } else {
              onVoidLastOrder(pin);
            }
          }}
        />
      )}
    </>
  );
}

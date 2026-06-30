/**
 * POS Build Your Box modal.
 * All UI lives in BuildABoxFlow — this just wraps it in a Modal
 * and wires onConfirm → addItemToTicket (POS ticket system).
 */
import React from 'react';
import { Modal } from 'react-native';
import BuildABoxFlow, { type BuildABoxResult } from './BuildABoxFlow';
import { uuid, type TicketItem } from '@/components/pos/types';

interface Props {
  visible:          boolean;
  onClose:          () => void;
  onAdd:            (item: TicketItem) => void;
}

export default function BuildABoxPosModal({ visible, onClose, onAdd }: Props) {
  const handleConfirm = ({ selectedBox, selections, surchargeTotal }: BuildABoxResult) => {
    // Bake surcharges into unitPriceCents so ticketSubtotal is correct.
    // selectedOptions are for display on the ticket / receipt only.
    const selectedOptions = Array.from(selections.entries())
      .filter(([, v]) => v.quantity > 0)
      .map(([productId, v]) => ({
        groupId:              'box-contents',
        groupName:            'Box Contents',
        optionId:             productId,
        optionName:           v.surchargeCents > 0
          ? `${v.quantity}× ${v.name} (+$${(v.surchargeCents / 100).toFixed(2)})`
          : `${v.quantity}× ${v.name}`,
        priceAdjustmentCents: 0, // already baked into unitPriceCents
      }));

    const item: TicketItem = {
      localId:        uuid(),
      productId:      `build-a-box-${selectedBox.size}`,
      productName:    `Cookie Box ${selectedBox.label}`,
      category:       'boxes',
      variantId:      null,
      variantName:    null,
      selectedOptions,
      quantity:       1,
      unitPriceCents: selectedBox.priceCents + surchargeTotal,
      notes:          '',
    };

    onAdd(item);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <BuildABoxFlow onClose={onClose} onConfirm={handleConfirm} numColumns={4} />
    </Modal>
  );
}

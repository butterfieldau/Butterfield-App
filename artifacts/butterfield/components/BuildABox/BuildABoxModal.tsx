/**
 * Customer-facing Build Your Box modal.
 * All UI lives in BuildABoxFlow — this just wraps it in a Modal
 * and wires onConfirm → CartContext.addItemToCart.
 */
import React from 'react';
import { Modal } from 'react-native';
import { useCart } from '@/context/CartContext';
import BuildABoxFlow, { type BuildABoxResult } from './BuildABoxFlow';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function BuildABoxModal({ visible, onClose }: Props) {
  const { addItemToCart } = useCart();

  const handleConfirm = ({ selectedBox, selections, surchargeTotal }: BuildABoxResult) => {
    const selectedOptions = Array.from(selections.entries())
      .filter(([, v]) => v.quantity > 0)
      .map(([productId, v]) => ({
        groupId:              'box-contents',
        groupName:            'Box Contents',
        optionId:             productId,
        optionName:           v.surchargeCents > 0
          ? `${v.quantity}× ${v.name} +$${(v.surchargeCents / 100).toFixed(2)}`
          : `${v.quantity}× ${v.name}`,
        priceAdjustmentCents: v.quantity * v.surchargeCents,
      }));

    addItemToCart({
      productId:      `build-a-box-${selectedBox.size}`,
      productName:    `Cookie Box ${selectedBox.label}`,
      variantId:      undefined,
      variantName:    undefined,
      basePriceCents: selectedBox.priceCents + surchargeTotal,
      selectedOptions,
      quantity:       1,
      imageUrl:       undefined,
      category:       'boxes',
    });

    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <BuildABoxFlow onClose={onClose} onConfirm={handleConfirm} />
    </Modal>
  );
}

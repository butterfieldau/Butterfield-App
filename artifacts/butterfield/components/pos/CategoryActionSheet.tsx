import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import styles from './posStyles';
import { BLUE, MID } from './types';

export default function CategoryActionSheet({
  catSlug,
  onClose,
  onChangeColor,
  onReorder,
}: {
  catSlug: string | null;
  onClose: () => void;
  onChangeColor: () => void;
  onReorder: () => void;
}) {
  const catName = catSlug ? catSlug.charAt(0).toUpperCase() + catSlug.slice(1) : '';

  return (
    <Modal visible={catSlug !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.cpOverlay} onPress={onClose}>
        <Pressable style={styles.catActionSheet} onPress={e => e.stopPropagation()}>
          <Text style={styles.catActionTitle}>{catName}</Text>
          <Pressable style={styles.catActionBtn} onPress={() => { onClose(); setTimeout(onChangeColor, 50); }}>
            <Feather name="droplet" size={18} color={BLUE} />
            <Text style={[styles.catActionBtnText, { color: BLUE }]}>Change colour</Text>
          </Pressable>
          <View style={styles.catActionDivider} />
          <Pressable style={styles.catActionBtn} onPress={() => { onClose(); setTimeout(onReorder, 50); }}>
            <Feather name="move" size={18} color={MID} />
            <Text style={[styles.catActionBtnText, { color: MID }]}>Reorder categories</Text>
          </Pressable>
          <Pressable style={styles.catActionCancel} onPress={onClose}>
            <Text style={styles.catActionCancelText}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

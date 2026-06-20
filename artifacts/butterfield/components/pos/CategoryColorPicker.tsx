import React from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import styles from './posStyles';
import { PRESET_COLORS } from './types';

export default function CategoryColorPicker({
  catSlug,
  activeColor,
  onSave,
  onClose,
}: {
  catSlug: string | null;
  activeColor: string | null | undefined;
  onSave: (color: string | null) => void;
  onClose: () => void;
}) {
  const catName = catSlug ? catSlug.charAt(0).toUpperCase() + catSlug.slice(1) : '';

  return (
    <Modal visible={catSlug !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.cpOverlay} onPress={onClose}>
        <Pressable style={styles.cpSheet} onPress={e => e.stopPropagation()}>
          <Text style={styles.cpTitle}>
            Choose colour for <Text style={{ fontWeight: '700' }}>{catName}</Text>
          </Text>
          <View style={styles.cpGrid}>
            {PRESET_COLORS.map(c => (
              <Pressable
                key={c}
                onPress={() => onSave(c)}
                style={[styles.cpSwatch, { backgroundColor: c }, activeColor === c && styles.cpSwatchActive]}
              />
            ))}
          </View>
          <Pressable onPress={() => onSave(null)} style={styles.cpReset}>
            <Text style={styles.cpResetText}>Reset to default</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

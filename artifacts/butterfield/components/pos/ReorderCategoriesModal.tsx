import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Animated, Modal, PanResponder, Pressable, Text, View } from 'react-native';
import styles from './posStyles';
import { MUTED, getDefaultCatColor } from './types';

const REORDER_ITEM_H = 58;

export default function ReorderCategoriesModal({
  visible,
  items,
  onSave,
  onClose,
}: {
  visible: boolean;
  items: { slug: string; name: string; color?: string | null }[];
  onSave: (slugs: string[]) => void;
  onClose: () => void;
}) {
  const [list, setList] = React.useState<{ slug: string; name: string; color?: string | null }[]>([]);
  const [dragging, setDragging] = React.useState<number | null>(null);
  const dragYAnim = React.useRef(new Animated.Value(0)).current;
  const fromIdxRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (visible) setList([...items]);
  }, [visible, items]);

  const panResponders = React.useMemo(
    () =>
      list.map((_, idx) =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          onPanResponderGrant: () => {
            fromIdxRef.current = idx;
            dragYAnim.setValue(0);
            setDragging(idx);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          },
          onPanResponderMove: Animated.event([null, { dy: dragYAnim }], {
            useNativeDriver: false,
          }),
          onPanResponderRelease: (_, gs) => {
            const from = fromIdxRef.current ?? idx;
            const to = Math.max(
              0,
              Math.min(list.length - 1, Math.round(from + gs.dy / REORDER_ITEM_H)),
            );
            if (to !== from) {
              setList(prev => {
                const next = [...prev];
                const [item] = next.splice(from, 1);
                next.splice(to, 0, item!);
                return next;
              });
            }
            dragYAnim.setValue(0);
            setDragging(null);
            fromIdxRef.current = null;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          },
        }),
      ),
    [list], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.reorderOverlay}>
        <View style={styles.reorderSheet}>
          <View style={styles.reorderHeader}>
            <Text style={styles.reorderTitle}>Reorder Categories</Text>
            <Text style={styles.reorderSub}>Hold and drag the handle to move</Text>
          </View>

          <View style={{ overflow: 'hidden' }}>
            {list.map((cat, idx) => {
              const isDraggingThis = dragging === idx;
              const color = getDefaultCatColor(cat.slug, cat.color);
              return (
                <Animated.View
                  key={cat.slug}
                  style={[
                    styles.reorderItem,
                    isDraggingThis && styles.reorderItemDragging,
                    isDraggingThis && { transform: [{ translateY: dragYAnim }], zIndex: 10 },
                  ]}
                >
                  <View
                    style={[styles.reorderColorDot, { backgroundColor: color }]}
                  />
                  <Text style={styles.reorderItemText}>{cat.name}</Text>
                  <View
                    style={styles.reorderHandle}
                    {...(panResponders[idx]?.panHandlers ?? {})}
                  >
                    <Feather name="menu" size={20} color={MUTED} />
                  </View>
                </Animated.View>
              );
            })}
          </View>

          <View style={styles.reorderFooter}>
            <Pressable style={styles.reorderCancelBtn} onPress={onClose}>
              <Text style={styles.reorderCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.reorderSaveBtn}
              onPress={() => {
                onSave(list.map(c => c.slug));
                onClose();
              }}
            >
              <Text style={styles.reorderSaveText}>Save Order</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

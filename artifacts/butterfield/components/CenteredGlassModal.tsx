import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

interface CenteredGlassModalProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  cardStyle?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  dismissOnBackdropPress?: boolean;
}

export function CenteredGlassModal({
  visible,
  onClose,
  children,
  cardStyle,
  contentStyle,
  dismissOnBackdropPress = true,
}: CenteredGlassModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismissOnBackdropPress ? onClose : undefined}
        />
        <View style={[styles.content, contentStyle]}>
          <View style={[styles.card, cardStyle]}>
            {children}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(7, 16, 24, 0.48)',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.38)',
    padding: 28,
    overflow: 'hidden',
    shadowColor: '#0E4C6B',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 12,
  },
});

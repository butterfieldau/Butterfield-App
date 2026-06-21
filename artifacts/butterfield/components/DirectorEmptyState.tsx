import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

const TEXT  = '#1C1C1E';
const MUTED = '#8E8E93';
const BLUE  = '#1493FF';
const BORD  = '#D1D5DB';

interface Action {
  label: string;
  onPress: () => void;
}

interface Props {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  description?: string;
  action?: Action;
  style?: object;
}

export function DirectorEmptyState({ icon, title, description, action, style }: Props) {
  return (
    <View style={[s.container, style]}>
      <Feather name={icon} size={40} color={BORD} />
      <Text style={s.title}>{title}</Text>
      {description ? <Text style={s.desc}>{description}</Text> : null}
      {action && (
        <Pressable
          onPress={() => { Haptics.selectionAsync(); action.onPress(); }}
          style={({ pressed }) => [s.btn, { opacity: pressed ? 0.8 : 1 }]}
        >
          <Text style={s.btnText}>{action.label}</Text>
        </Pressable>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 32,
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT,
    textAlign: 'center',
    marginTop: 8,
  },
  desc: {
    fontSize: 13,
    fontWeight: '400',
    color: MUTED,
    textAlign: 'center',
    lineHeight: 19,
  },
  btn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: BLUE,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});

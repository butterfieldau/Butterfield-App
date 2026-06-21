import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

const MUTED  = '#8E8E93';
const TEXT   = '#1C1C1E';
const BORDER = '#E5E7EB';
const CARD   = '#FFFFFF';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onClear?: () => void;
  autoFocus?: boolean;
}

export function DirectorSearchBar({
  value,
  onChangeText,
  placeholder = 'Search…',
  onClear,
  autoFocus = false,
}: Props) {
  return (
    <View style={s.container}>
      <View style={s.bar}>
        <Feather name="search" size={16} color={MUTED} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={MUTED}
          style={s.input}
          autoFocus={autoFocus}
          returnKeyType="search"
          clearButtonMode="never"
        />
        {value.length > 0 && (
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              onChangeText('');
              onClear?.();
            }}
            hitSlop={8}
            style={s.clearBtn}
          >
            <Feather name="x-circle" size={16} color={MUTED} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: CARD,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 22,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: '400',
    color: TEXT,
    padding: 0,
    margin: 0,
  },
  clearBtn: {
    padding: 2,
  },
});

import React, { useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  type ScrollViewProps,
  findNodeHandle,
} from 'react-native';

type Props = ScrollViewProps & {
  extraScrollHeight?: number;
};

export function KeyboardAwareScrollViewCompat({
  children,
  style,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
  extraScrollHeight = 32,
  ...props
}: Props) {
  const scrollRef = useRef<ScrollView>(null);

  const handleFocus = (e: any) => {
    const node = findNodeHandle(e.target as any);
    if (!node || !scrollRef.current) return;
    setTimeout(() => {
      (scrollRef.current as any)?.scrollResponderScrollNativeHandleToKeyboard?.(
        node,
        extraScrollHeight,
        true,
      );
    }, 150);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
    >
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        showsVerticalScrollIndicator={false}
        style={style}
        contentContainerStyle={contentContainerStyle}
        onFocus={handleFocus}
        {...props}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

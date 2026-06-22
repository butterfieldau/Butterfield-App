import { useCallback, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

type BarStyle = 'light-content' | 'dark-content';

/**
 * Scroll-based StatusBar: starts with `initial` style (used when the dark
 * header is visible at the top), then flips to the opposite style once the
 * user has scrolled past the header into lighter content.
 *
 * Usage:
 *   const { barStyle, handleScroll, onHeaderLayout } = useScrollStatusBar('light-content');
 *   <StatusBar barStyle={barStyle} translucent backgroundColor="transparent" />
 *   <ScrollView onScroll={handleScroll} scrollEventThrottle={16}>
 *     <View onLayout={onHeaderLayout}> {your dark header} </View>
 *     ...
 *   </ScrollView>
 */
export function useScrollStatusBar(initial: BarStyle = 'light-content') {
  const insets = useSafeAreaInsets();
  const [barStyle, setBarStyle] = useState<BarStyle>(initial);
  const lastStyle = useRef<BarStyle>(initial);
  const [headerHeight, setHeaderHeight] = useState(220);

  useFocusEffect(
    useCallback(() => {
      lastStyle.current = initial;
      setBarStyle(initial);
    }, [initial]),
  );

  const onHeaderLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      setHeaderHeight(e.nativeEvent.layout.height);
    },
    [],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y;
      const threshold = headerHeight - insets.top;
      const next: BarStyle = y > threshold ? (initial === 'light-content' ? 'dark-content' : 'light-content') : initial;
      if (next !== lastStyle.current) {
        lastStyle.current = next;
        setBarStyle(next);
      }
    },
    [headerHeight, insets.top, initial],
  );

  return { barStyle, handleScroll, onHeaderLayout };
}

/**
 * Fires StatusBar.setBarStyle via useFocusEffect so it reliably resets the
 * style every time this screen gains focus — regardless of what another
 * mounted tab previously set.
 *
 * Usage:
 *   useFocusStatusBar('light-content');
 *   // Still render <StatusBar> in JSX for translucent / backgroundColor props
 */
export function useFocusStatusBar(style: BarStyle): void {
  useFocusEffect(
    useCallback(() => {
      StatusBar.setBarStyle(style, true);
    }, [style]),
  );
}

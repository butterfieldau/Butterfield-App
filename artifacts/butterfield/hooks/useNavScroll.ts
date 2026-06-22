import { makeMutable, runOnJS, useAnimatedScrollHandler, withSpring } from 'react-native-reanimated';
import { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

export const SPRING_CFG = { damping: 20, stiffness: 180, mass: 0.8 };

// Module-level singletons — created once, stable across all renders.
// Only one portal is visible at a time so sharing one value is safe.
export const navScale = makeMutable(1);
const lastScrollY     = makeMutable(0);

function applyNavScale(y: number, delta: number) {
  'worklet';
  if (y > 80 && delta > 8) {
    navScale.value = withSpring(0.8, SPRING_CFG);
  } else if (delta < -8 || y < 80) {
    navScale.value = withSpring(1, SPRING_CFG);
  }
}

/**
 * Returns a Reanimated scroll handler for `Reanimated.ScrollView` /
 * `Reanimated.FlatList` via `onScroll={handler} scrollEventThrottle={16}`.
 *
 * Shrinks navScale → 0.8 when scrolling down past 80 px (8 px dead-band).
 * Restores to 1 when scrolling back up or near the top.
 */
export function useNavScrollHandler() {
  return useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const y     = event.contentOffset.y;
      const delta = y - lastScrollY.value;
      lastScrollY.value = y;
      applyNavScale(y, delta);
    },
  });
}

/**
 * Variant that also calls a JS-thread scroll handler (e.g. from
 * `useScrollStatusBar`) alongside the UI-thread nav animation.
 * The JS handler receives a synthetic `{ nativeEvent: { contentOffset: { y } } }`
 * object matching `NativeSyntheticEvent<NativeScrollEvent>`.
 */
export function useNavScrollHandlerWithJS(
  jsHandler: (e: NativeSyntheticEvent<NativeScrollEvent>) => void,
) {
  return useAnimatedScrollHandler({
    onScroll: (event) => {
      'worklet';
      const y     = event.contentOffset.y;
      const delta = y - lastScrollY.value;
      lastScrollY.value = y;
      applyNavScale(y, delta);
      // Bridge to JS thread — reconstruct the nativeEvent shape the JS handler expects
      runOnJS(jsHandler)({ nativeEvent: { contentOffset: { y } } } as NativeSyntheticEvent<NativeScrollEvent>);
    },
  });
}

/** Call from a tab-press / cart-press handler (UI thread) to snap the bar back. */
export function snapNavScaleFull() {
  'worklet';
  navScale.value = withSpring(1, SPRING_CFG);
}

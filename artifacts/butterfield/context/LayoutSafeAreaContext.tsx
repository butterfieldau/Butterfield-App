import { createContext, useContext } from 'react';

/**
 * True when the enclosing layout wrapper has already consumed the top safe-area
 * inset (e.g. the staff/manager Tab layout adds its own spacer). Screens and
 * shared components read this to avoid adding a second spacer.
 */
export const LayoutSafeAreaContext = createContext(false);
export const useLayoutHandledSafeArea = () => useContext(LayoutSafeAreaContext);

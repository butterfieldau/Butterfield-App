import React, { createContext, useContext } from 'react';

interface PosModalContextValue {
  isPosModalOpen: boolean;
  setIsPosModalOpen: (open: boolean) => void;
}

export const PosModalContext = createContext<PosModalContextValue>({
  isPosModalOpen: false,
  setIsPosModalOpen: () => {},
});

export function usePosModal() {
  return useContext(PosModalContext);
}

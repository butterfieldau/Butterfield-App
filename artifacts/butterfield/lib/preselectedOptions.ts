import type { SelectedCartOption } from '@/types';

interface PreselectedState {
  selectedOptions: SelectedCartOption[];
  quantity: number;
}

let _state: PreselectedState | null = null;

export function setPreselectedOptions(state: PreselectedState | null): void {
  _state = state;
}

export function getPreselectedOptions(): PreselectedState | null {
  return _state;
}

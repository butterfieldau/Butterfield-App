import type { ApiProduct } from './api';

let _selected: ApiProduct | null = null;

export function setSelectedProduct(p: ApiProduct | null) {
  _selected = p;
}

export function getSelectedProduct(): ApiProduct | null {
  return _selected;
}

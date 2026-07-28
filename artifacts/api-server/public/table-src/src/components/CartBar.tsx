import { useApp } from "../context";
import { formatCents } from "../utils";

interface Props {
  onOpen: () => void;
}

export function CartBar({ onOpen }: Props) {
  const { cartCount, cartTotal } = useApp();

  if (cartCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4 mb-safe pointer-events-none">
      <button
        onClick={onOpen}
        className="w-full max-w-lg mx-auto flex items-center justify-between
                   bg-[#1A1A1A] text-white px-5 py-4 rounded-2xl
                   active:scale-[0.97] transition-transform pointer-events-auto"
        style={{ boxShadow: "0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.14)" }}
        data-testid="cart-bar"
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-[#C17A3A] flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold leading-none">{cartCount}</span>
          </div>
          <span className="font-semibold text-[15px] tracking-tight">View order</span>
        </div>
        <span className="font-bold text-[15px] tracking-tight">{formatCents(cartTotal)}</span>
      </button>
    </div>
  );
}

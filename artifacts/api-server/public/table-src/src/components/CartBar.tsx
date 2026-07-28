import { ShoppingCart } from "lucide-react";
import { useApp } from "../context";
import { formatCents } from "../utils";

interface Props {
  onOpen: () => void;
}

export function CartBar({ onOpen }: Props) {
  const { cartCount, cartTotal } = useApp();

  if (cartCount === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 px-4 pb-4 safe-bottom">
      <button
        onClick={onOpen}
        className="w-full max-w-md mx-auto flex items-center justify-between
                   bg-[#0b70f8] text-white px-4 py-3.5 rounded-2xl shadow-lg
                   active:scale-[0.98] transition-transform"
        style={{
          boxShadow: "0 4px 20px rgba(11,112,248,0.40)",
          display: "flex",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="relative">
            <ShoppingCart size={20} />
            <span className="absolute -top-2 -right-2 bg-white text-[#0b70f8] text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
              {cartCount}
            </span>
          </div>
          <span className="font-semibold">View order</span>
        </div>
        <span className="font-bold text-base">{formatCents(cartTotal)}</span>
      </button>
    </div>
  );
}

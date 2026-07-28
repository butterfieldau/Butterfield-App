import { X, Plus, Minus, Trash2 } from "lucide-react";
import { useApp } from "../context";
import { formatCents } from "../utils";

interface Props {
  onClose: () => void;
}

export function CartSheet({ onClose }: Props) {
  const { cart, cartTotal, updateQty, removeFromCart, goTo } = useApp();

  function handleCheckout() {
    onClose();
    goTo("checkout");
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div className="flex-1 bg-black/50 animate-fade-in" onClick={onClose} />

      {/* Sheet */}
      <div
        className="bg-[#FDFCFA] rounded-t-3xl max-h-[88dvh] flex flex-col animate-sheet-up"
        style={{ boxShadow: "0 -8px 40px rgba(0,0,0,0.18)" }}
        data-testid="cart-sheet"
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-0 shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#D8D3CC]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-4 pb-3 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-[#1A1A1A] tracking-tight">Your order</h2>
            {cart.length > 0 && (
              <p className="text-sm text-[#8A8580] mt-0.5">
                {cart.reduce((s, i) => s + i.quantity, 0)} item{cart.reduce((s, i) => s + i.quantity, 0) !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#F0EDE8] flex items-center justify-center text-[#5A5550]"
          >
            <X size={15} />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-[#EDE8E1] mx-6 shrink-0" />

        {/* Item list */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-6 py-4 space-y-3 no-scrollbar">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#F0EDE8] flex items-center justify-center mb-4">
                <span className="text-2xl">🛍️</span>
              </div>
              <p className="font-semibold text-[#1A1A1A] text-base">Nothing here yet</p>
              <p className="text-[#8A8580] text-sm mt-1">Pick something from the menu</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="flex gap-3 bg-white rounded-2xl p-3.5"
                style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
                {item.productImage && (
                  <img
                    src={item.productImage}
                    alt={item.productName}
                    className="w-14 h-14 rounded-xl object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#1A1A1A] text-sm leading-tight">{item.productName}</p>
                  {item.variantName && (
                    <p className="text-xs text-[#8A8580] mt-0.5">{item.variantName}</p>
                  )}
                  {item.selectedOptions.length > 0 && (
                    <p className="text-xs text-[#8A8580] mt-0.5">
                      {item.selectedOptions.map((o) => o.optionName).join(", ")}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-xs text-[#C17A3A] mt-0.5 italic">"{item.notes}"</p>
                  )}
                  <div className="flex items-center justify-between mt-2.5">
                    <p className="text-sm font-bold text-[#1A1A1A]">
                      {formatCents(item.unitCents * item.quantity)}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="p-1 text-[#C0BAB3] active:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="flex items-center gap-0 bg-[#F0EDE8] rounded-xl overflow-hidden">
                        <button
                          onClick={() => updateQty(item.id, -1)}
                          className="px-2.5 py-1.5 text-[#5A5550] active:bg-[#E0DBD4] transition-colors text-sm font-bold"
                        >
                          −
                        </button>
                        <span className="font-bold text-sm text-[#1A1A1A] w-6 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQty(item.id, 1)}
                          className="px-2.5 py-1.5 text-[#5A5550] active:bg-[#E0DBD4] transition-colors text-sm font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {cart.length > 0 && (
          <div className="px-6 pt-3 shrink-0" style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 20px)" }}>
            <div className="h-px bg-[#EDE8E1] mb-4" />
            <div className="flex items-center justify-between mb-4">
              <span className="text-[#8A8580] font-medium">Subtotal</span>
              <span className="font-bold text-[#1A1A1A] text-xl tracking-tight">{formatCents(cartTotal)}</span>
            </div>
            <button
              onClick={handleCheckout}
              className="w-full py-4 bg-[#1A1A1A] text-white font-bold rounded-2xl text-base
                         active:scale-[0.97] transition-transform tracking-tight"
              data-testid="checkout-btn"
            >
              Go to checkout · {formatCents(cartTotal)}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

import { X, Plus, Minus, Trash2, ShoppingBag } from "lucide-react";
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
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div
        className="bg-white rounded-t-2xl max-h-[85dvh] flex flex-col"
        style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
      >
        {/* Handle + Header */}
        <div className="flex justify-center pt-3">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Your order</h2>
          <button onClick={onClose} className="p-1.5 rounded-full bg-gray-100 text-gray-500">
            <X size={16} />
          </button>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-3 space-y-3">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShoppingBag size={40} className="text-gray-300 mb-3" />
              <p className="text-gray-500 font-medium">Your cart is empty</p>
              <p className="text-gray-400 text-sm mt-1">Add items from the menu to get started</p>
            </div>
          ) : (
            cart.map((item) => (
              <div key={item.id} className="flex gap-3 p-3 bg-gray-50 rounded-xl">
                {item.productImage && (
                  <img
                    src={item.productImage}
                    alt={item.productName}
                    className="w-14 h-14 rounded-lg object-cover shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 text-sm leading-tight">{item.productName}</p>
                  {item.variantName && (
                    <p className="text-xs text-gray-500 mt-0.5">{item.variantName}</p>
                  )}
                  {item.selectedOptions.length > 0 && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      {item.selectedOptions.map((o) => o.optionName).join(", ")}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-xs text-[#0b70f8] mt-0.5 italic">"{item.notes}"</p>
                  )}
                  <div className="flex items-center justify-between mt-2">
                    <p className="text-sm font-bold text-gray-900">
                      {formatCents(item.unitCents * item.quantity)}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="p-1 text-gray-400 active:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg px-2 py-1">
                        <button
                          onClick={() => updateQty(item.id, -1)}
                          className="text-gray-500 active:scale-90 transition-transform"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="font-bold text-sm text-gray-900 w-4 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQty(item.id, 1)}
                          className="text-gray-500 active:scale-90 transition-transform"
                        >
                          <Plus size={13} />
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
          <div className="px-5 py-4 border-t border-gray-100 safe-bottom">
            <div className="flex items-center justify-between mb-3">
              <span className="text-gray-500 font-medium">Subtotal</span>
              <span className="font-bold text-gray-900 text-lg">{formatCents(cartTotal)}</span>
            </div>
            <button
              onClick={handleCheckout}
              className="w-full py-3.5 bg-[#0b70f8] text-white font-bold rounded-xl text-base active:scale-[0.98] transition-transform"
            >
              Checkout
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

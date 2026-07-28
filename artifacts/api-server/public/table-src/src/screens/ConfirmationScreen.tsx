import { CheckCircle, Smartphone } from "lucide-react";
import { useApp } from "../context";
import { formatCents } from "../utils";

export function ConfirmationScreen() {
  const { confirmation, goTo } = useApp();

  if (!confirmation) {
    goTo("menu");
    return null;
  }

  return (
    <div className="min-h-dvh bg-[#fdf8f3] flex flex-col items-center px-4 pt-10 pb-10 safe-top safe-bottom">
      {/* Success icon */}
      <div className="relative mb-6">
        <div className="w-24 h-24 rounded-full bg-green-50 flex items-center justify-center">
          <CheckCircle size={52} className="text-green-500" strokeWidth={1.5} />
        </div>
        <span className="absolute -top-1 -right-1 text-3xl">🍪</span>
      </div>

      <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Order placed!</h1>
      <p className="text-gray-500 text-center text-sm leading-relaxed mb-1">
        We'll bring your order to
      </p>
      <div className="flex items-center gap-2 bg-blue-50 text-[#0b70f8] px-4 py-2 rounded-xl mb-6">
        <span className="font-bold text-lg">Table {confirmation.tableNumber}</span>
        <span className="text-blue-300">·</span>
        <span className="text-sm font-medium">Shortly</span>
      </div>

      {/* Order number */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
        <div className="bg-gradient-to-r from-[#0b70f8] to-[#00adee] px-5 py-3">
          <p className="text-xs text-blue-100 uppercase tracking-wider font-medium">Order number</p>
          <p className="text-2xl font-bold text-white">{confirmation.orderNumber}</p>
        </div>

        {/* Items */}
        <div className="px-5 py-4 space-y-2">
          {confirmation.items.map((item) => (
            <div key={item.id} className="flex justify-between items-start text-sm">
              <div className="flex-1">
                <span className="text-gray-700 font-medium">
                  {item.quantity} × {item.productName}
                </span>
                {item.variantName && (
                  <span className="text-gray-400"> · {item.variantName}</span>
                )}
                {item.selectedOptions.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {item.selectedOptions.map((o) => o.optionName).join(", ")}
                  </p>
                )}
              </div>
              <span className="shrink-0 ml-3 text-gray-700 font-semibold">
                {formatCents(item.unitCents * item.quantity)}
              </span>
            </div>
          ))}

          <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-gray-900">
            <span>Total</span>
            <span>{formatCents(confirmation.totalCents)}</span>
          </div>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={() => goTo("menu")}
        className="w-full max-w-sm py-3.5 bg-[#0b70f8] text-white font-bold rounded-xl text-base active:scale-[0.98] transition-transform mb-6"
      >
        Order more
      </button>

      {/* App promo footer */}
      <div className="w-full max-w-sm bg-white rounded-2xl p-4 flex items-start gap-3 border border-gray-100">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0b70f8] to-[#00adee] flex items-center justify-center shrink-0">
          <Smartphone size={20} className="text-white" />
        </div>
        <div>
          <p className="font-semibold text-gray-900 text-sm">Download Butterfield Cookies</p>
          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
            Earn loyalty points, track orders, and enjoy exclusive offers with our app.
          </p>
        </div>
      </div>
    </div>
  );
}

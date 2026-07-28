import { useApp } from "../context";
import { formatCents } from "../utils";

export function ConfirmationScreen() {
  const { confirmation, goTo } = useApp();

  if (!confirmation) {
    goTo("menu");
    return null;
  }

  const hasEmail = Boolean(confirmation.email);

  return (
    <div className="min-h-dvh bg-[#FDFCFA] flex flex-col safe-top safe-bottom overflow-y-auto no-scrollbar">
      <div className="flex-1 flex flex-col items-center px-5 pt-12 pb-10 max-w-lg mx-auto w-full">

        {/* Success mark */}
        <div className="relative mb-8 animate-pop-in">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #C17A3A 0%, #E8A85A 100%)" }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <path d="M6 16L13 23L26 9" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <h1 className="text-[28px] font-bold text-[#1A1A1A] tracking-tight text-center mb-1">
          Order placed
        </h1>
        <p className="text-[#8A8580] text-center text-[15px] leading-relaxed mb-6">
          We'll bring everything to table&nbsp;
          <span className="font-semibold text-[#1A1A1A]">{confirmation.tableNumber}</span>.
        </p>

        {/* Order card */}
        <div className="w-full bg-white rounded-3xl overflow-hidden mb-4"
          style={{ boxShadow: "0 2px 16px rgba(0,0,0,0.08)" }}>

          {/* Order number header */}
          <div className="px-6 py-4 bg-[#1A1A1A]">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#8A8580] mb-0.5">
              Order
            </p>
            <p className="text-2xl font-bold text-white tracking-tight">
              #{confirmation.orderNumber}
            </p>
          </div>

          {/* Items */}
          <div className="px-6 py-4 space-y-2.5">
            {confirmation.items.map((item) => (
              <div key={item.id} className="flex justify-between items-start">
                <div className="flex-1 pr-3">
                  <span className="text-[#1A1A1A] font-medium text-sm">
                    {item.quantity} × {item.productName}
                  </span>
                  {item.variantName && (
                    <span className="text-[#8A8580] text-sm"> · {item.variantName}</span>
                  )}
                  {item.selectedOptions.length > 0 && (
                    <p className="text-xs text-[#A0998F] mt-0.5">
                      {item.selectedOptions.map((o) => o.optionName).join(", ")}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-sm font-semibold text-[#1A1A1A]">
                  {formatCents(item.unitCents * item.quantity)}
                </span>
              </div>
            ))}

            <div className="pt-3 mt-1 border-t border-[#F0EDE8] flex justify-between">
              <span className="font-bold text-[#1A1A1A]">Total</span>
              <span className="font-bold text-[#1A1A1A] text-lg tracking-tight">
                {formatCents(confirmation.totalCents)}
              </span>
            </div>
          </div>
        </div>

        {/* Rewards card — shown when email was provided */}
        {hasEmail && (
          <div className="w-full rounded-3xl overflow-hidden mb-4 animate-fade-in"
            style={{
              background: "linear-gradient(135deg, #1C0F07 0%, #3A1F0A 100%)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.16)",
            }}
          >
            <div className="px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-2xl bg-[#C17A3A] flex items-center justify-center shrink-0">
                  <span className="text-lg">🍪</span>
                </div>
                <div>
                  <p className="font-bold text-white text-[15px] leading-tight">
                    You're earning rewards
                  </p>
                  <p className="text-[#C9A07A] text-[13px] mt-1 leading-relaxed">
                    This order counts toward your stamps. Download the Butterfield app to track and redeem.
                  </p>
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <a
                  href="https://apps.apple.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 bg-white/10 rounded-xl text-center text-white text-xs font-semibold
                             border border-white/20 active:bg-white/20 transition-colors"
                >
                  App Store
                </a>
                <a
                  href="https://play.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 bg-white/10 rounded-xl text-center text-white text-xs font-semibold
                             border border-white/20 active:bg-white/20 transition-colors"
                >
                  Google Play
                </a>
              </div>
            </div>
          </div>
        )}

        {/* App promo — shown when no email */}
        {!hasEmail && (
          <div className="w-full bg-white rounded-3xl p-5 mb-4 flex items-center gap-4"
            style={{ boxShadow: "0 1px 8px rgba(0,0,0,0.06)" }}>
            <div className="w-12 h-12 rounded-2xl bg-[#F7EDD6] flex items-center justify-center shrink-0">
              <span className="text-2xl">🍪</span>
            </div>
            <div className="flex-1">
              <p className="font-semibold text-[#1A1A1A] text-sm leading-tight">
                Butterfield Cookies app
              </p>
              <p className="text-xs text-[#8A8580] mt-0.5 leading-relaxed">
                Earn stamps, track orders, and get exclusive offers.
              </p>
            </div>
          </div>
        )}

        {/* Order more */}
        <button
          onClick={() => goTo("menu")}
          className="w-full py-4 border-2 border-[#EDE8E1] text-[#1A1A1A] font-semibold rounded-2xl
                     text-[15px] active:bg-[#F0EDE8] transition-colors tracking-tight"
        >
          Order more
        </button>
      </div>
    </div>
  );
}

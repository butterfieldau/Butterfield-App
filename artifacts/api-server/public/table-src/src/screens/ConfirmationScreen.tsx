import { useApp } from "../context";
import { formatCents } from "../utils";

export function ConfirmationScreen() {
  const { confirmation, goTo } = useApp();

  if (!confirmation) {
    goTo("menu");
    return null;
  }

  const hasRewards = Boolean(
    confirmation.rewards && confirmation.rewards.stampsEarned > 0
  );

  return (
    <div className="min-h-dvh bg-[#FDFCFA] flex flex-col safe-top safe-bottom overflow-y-auto no-scrollbar">
      <div className="flex-1 flex flex-col items-center px-5 pt-12 pb-10 max-w-lg mx-auto w-full">

        {/* Success mark */}
        <div className="relative mb-6 animate-pop-in">
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
        <div className="w-full bg-white rounded-3xl overflow-hidden mb-5"
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

        {/* ── App download card — always shown ────────────────────────────────── */}
        <div
          className="w-full rounded-3xl overflow-hidden mb-5 animate-fade-in"
          style={{
            background: "linear-gradient(135deg, #1C0F07 0%, #3A1F0A 100%)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.20)",
          }}
        >
          <div className="px-6 pt-5 pb-5">

            {/* Stamps earned — shown when email was provided and rewards were credited */}
            {hasRewards && (
              <div className="flex items-center gap-3 mb-5 pb-4 border-b border-white/10">
                <div className="w-11 h-11 rounded-2xl bg-[#C17A3A] flex items-center justify-center shrink-0">
                  <span className="text-xl">🍪</span>
                </div>
                <div>
                  <p className="font-bold text-white text-[15px] leading-tight">
                    {confirmation.rewards!.stampsEarned} stamp{confirmation.rewards!.stampsEarned !== 1 ? "s" : ""} earned
                  </p>
                  <p className="text-[#C9A07A] text-[13px] mt-0.5 leading-snug">
                    {confirmation.rewards!.isNewAccount
                      ? `Welcome! You're on ${confirmation.rewards!.totalStamps} stamp${confirmation.rewards!.totalStamps !== 1 ? "s" : ""} toward your next reward.`
                      : `${confirmation.rewards!.totalStamps} stamp${confirmation.rewards!.totalStamps !== 1 ? "s" : ""} in your account.`
                    }
                  </p>
                </div>
              </div>
            )}

            {/* Download headline */}
            <div className="mb-5">
              <p className="text-white font-bold text-[18px] leading-tight mb-1">
                Earn stamps every visit
              </p>
              <p className="text-[#C9A07A] text-[13px] leading-relaxed">
                Download the Butterfield app to track your rewards, reorder your favourites, and unlock exclusive offers.
              </p>
            </div>

            {/* Store buttons */}
            <div className="flex gap-3">
              <a
                href="https://apps.apple.com/app/butterfield-cookies/id6744892949"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-3 rounded-2xl text-center font-bold text-[14px] transition-colors
                           active:opacity-80"
                style={{ background: "rgba(255,255,255,0.12)", border: "1.5px solid rgba(255,255,255,0.18)", color: "#fff" }}
              >
                🍎 App Store
              </a>
              <a
                href="https://play.google.com/store/apps/details?id=com.butterfield.cookies"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-3 rounded-2xl text-center font-bold text-[14px] transition-colors
                           active:opacity-80"
                style={{ background: "rgba(255,255,255,0.12)", border: "1.5px solid rgba(255,255,255,0.18)", color: "#fff" }}
              >
                ▶ Google Play
              </a>
            </div>
          </div>
        </div>

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

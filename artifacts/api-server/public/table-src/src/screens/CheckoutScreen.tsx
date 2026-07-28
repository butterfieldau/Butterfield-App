import { useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useApp } from "../context";
import { apiUrl, formatCents } from "../utils";

let stripePromise: Promise<Stripe | null> | null = null;

function getStripePromise(key: string): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(key);
  }
  return stripePromise;
}

export function CheckoutScreen() {
  const { config, goTo, cart, cartTotal } = useApp();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState<number>(cartTotal);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const stripeKey = config.stripePublishableKey ?? "";
  const locked = fetching || !!clientSecret;

  async function createIntent() {
    if (!name.trim()) return;
    setFetching(true);
    setFetchError(null);
    try {
      const items = cart.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        quantity: i.quantity,
        selectedOptions: i.selectedOptions,
        unitCents: i.unitCents,
      }));
      const res = await fetch(apiUrl("/table/payment-intent"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, tableNumber: config.tableNumber, storeId: config.storeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Payment setup failed");
      setClientSecret(data.clientSecret);
      setPaymentIntentId(data.paymentIntentId);
      setAmountCents(data.amountCents ?? cartTotal);
    } catch (err: any) {
      setFetchError(err.message ?? "Could not set up payment. Please try again.");
    } finally {
      setFetching(false);
    }
  }

  if (!stripeKey) {
    return (
      <ErrorPage
        title="Payment unavailable"
        message="Online payments are not configured for this store. Please ask a staff member for assistance."
        onBack={() => goTo("menu")}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-[#FDFCFA] flex flex-col">
      {/* Header */}
      <header className="bg-[#FDFCFA] px-5 pt-4 pb-3 safe-top shrink-0 flex items-center gap-3">
        <button
          onClick={() => goTo("menu")}
          className="w-9 h-9 rounded-full bg-[#F0EDE8] flex items-center justify-center text-[#5A5550] shrink-0"
        >
          <ArrowLeft size={17} strokeWidth={2.5} />
        </button>
        <div className="flex-1 flex items-center justify-between min-w-0">
          <h1 className="font-bold text-[#1A1A1A] text-lg tracking-tight">Checkout</h1>
          {/* Compact table badge inline in header */}
          <div className="flex items-center gap-1.5 bg-[#F0EDE8] rounded-full px-3 py-1.5 shrink-0">
            <span className="text-xs font-bold text-[#1A1A1A] leading-none">
              Table {config.tableNumber}
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pb-10 no-scrollbar">

        {/* Order summary */}
        <div className="mt-5 bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div className="px-4 py-3 border-b border-[#F0EDE8]">
            <p className="text-xs font-semibold uppercase tracking-widest text-[#8A8580]">Your order</p>
          </div>
          <div className="px-4 py-3 space-y-3">
            {cart.map((item) => (
              <div key={item.id} className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1A1A1A] leading-snug">
                    {item.quantity} × {item.productName}
                    {item.variantName && (
                      <span className="font-normal text-[#8A8580]"> · {item.variantName}</span>
                    )}
                  </p>
                  {item.selectedOptions.length > 0 && (
                    <p className="text-xs text-[#A0998F] mt-0.5">
                      {item.selectedOptions.map((o) => o.optionName).join(" · ")}
                    </p>
                  )}
                  {item.notes && (
                    <p className="text-xs text-[#C17A3A] mt-0.5 italic">"{item.notes}"</p>
                  )}
                </div>
                <p className="text-sm font-semibold text-[#1A1A1A] shrink-0">
                  {formatCents(item.unitCents * item.quantity)}
                </p>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 border-t border-[#F0EDE8] flex justify-between">
            <span className="text-sm font-semibold text-[#8A8580]">Total</span>
            <span className="text-sm font-bold text-[#1A1A1A]">{formatCents(cartTotal)}</span>
          </div>
        </div>

        {/* Bare form — no card wrappers, maximum momentum */}
        <div className="mt-5">
          {/* Name */}
          <div className="border-b border-[#EDE8E1] py-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="given-name"
              disabled={locked}
              className="w-full text-[18px] font-medium text-[#1A1A1A] placeholder-[#C8C3BC]
                         focus:outline-none bg-transparent disabled:opacity-40"
            />
          </div>

          {/* Phone */}
          <div className="border-b border-[#EDE8E1] py-4">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone (optional)"
              type="tel"
              autoComplete="tel"
              disabled={locked}
              className="w-full text-[18px] font-medium text-[#1A1A1A] placeholder-[#C8C3BC]
                         focus:outline-none bg-transparent disabled:opacity-40"
            />
          </div>

          {/* Email — expandable, secondary */}
          {!showEmail ? (
            <div className="py-3.5">
              <button
                onClick={() => setShowEmail(true)}
                disabled={locked}
                data-testid="show-email-btn"
                className="flex items-center gap-1.5 text-[#C17A3A] text-sm font-semibold
                           active:opacity-60 transition-opacity disabled:opacity-30"
              >
                <span className="text-[15px]">🍪</span>
                Add email to earn stamps →
              </button>
            </div>
          ) : (
            <div className="border-b border-[#EDE8E1] py-4 animate-fade-in">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email for rewards"
                type="email"
                autoComplete="email"
                disabled={locked}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="w-full text-[18px] font-medium text-[#1A1A1A] placeholder-[#C8C3BC]
                           focus:outline-none bg-transparent disabled:opacity-40"
                data-testid="email-input"
              />
            </div>
          )}
        </div>

        {/* Error */}
        {fetchError && (
          <div className="mt-4 px-4 py-3.5 bg-[#FFF0EC] border border-[#FCCAB4] text-[#C04030] rounded-2xl text-sm">
            {fetchError}
          </div>
        )}

        {/* Payment */}
        <div className="mt-6">
          {!clientSecret ? (
            <button
              onClick={createIntent}
              disabled={!name.trim() || fetching}
              data-testid="continue-to-payment-btn"
              className={`w-full py-4 rounded-2xl font-bold text-[16px] transition-all ${
                !name.trim() || fetching
                  ? "bg-[#EDE8E1] text-[#C0BAB3] cursor-not-allowed"
                  : "bg-[#1A1A1A] text-white active:scale-[0.97]"
              }`}
            >
              {fetching ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 size={18} className="animate-spin" />
                  Setting up…
                </span>
              ) : (
                `Pay · ${formatCents(amountCents)}`
              )}
            </button>
          ) : (
            <Elements
              stripe={getStripePromise(stripeKey)}
              options={{
                clientSecret,
                appearance: {
                  theme: "stripe",
                  variables: {
                    colorPrimary: "#1A1A1A",
                    colorBackground: "#FFFFFF",
                    colorText: "#1A1A1A",
                    borderRadius: "16px",
                    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
                    fontSizeBase: "15px",
                  },
                  rules: {
                    ".Input": {
                      border: "1.5px solid #EDE8E1",
                      boxShadow: "none",
                      padding: "12px 14px",
                    },
                    ".Input:focus": {
                      border: "1.5px solid #1A1A1A",
                      boxShadow: "none",
                    },
                    ".Label": {
                      fontSize: "11px",
                      fontWeight: "600",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "#8A8580",
                    },
                  },
                },
              }}
            >
              <PaymentForm
                clientSecret={clientSecret}
                paymentIntentId={paymentIntentId!}
                name={name}
                phone={phone}
                email={email}
                amountCents={amountCents}
              />
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Inner payment form ────────────────────────────────────────────────────────

interface PaymentFormProps {
  clientSecret: string;
  paymentIntentId: string;
  name: string;
  phone: string;
  email: string;
  amountCents: number;
}

function PaymentForm({ paymentIntentId, name, phone, email, amountCents }: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { config, cart, goTo, clearCart, setConfirmation } = useApp();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    try {
      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });

      if (stripeError) {
        setError(stripeError.message ?? "Payment failed. Please try again.");
        setSubmitting(false);
        return;
      }

      const items = cart.map((i) => ({
        productId: i.productId,
        productName: i.productName,
        variantId: i.variantId,
        variantName: i.variantName,
        quantity: i.quantity,
        selectedOptions: i.selectedOptions,
        unitCents: i.unitCents,
        lineCents: i.unitCents * i.quantity,
        notes: i.notes,
      }));

      const res = await fetch(apiUrl("/table/orders"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stripePaymentIntentId: paymentIntentId,
          items,
          tableNumber: config.tableNumber,
          storeId: config.storeId,
          contactName: name,
          contactPhone: phone || undefined,
          contactEmail: email || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Order could not be placed.");

      setConfirmation({
        orderNumber: data.data.orderNumber,
        tableNumber: config.tableNumber,
        items: cart,
        totalCents: amountCents,
        email: email || undefined,
        rewards: data.data.rewards ?? null,
      });
      clearCart();
      goTo("confirmation");
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please ask a staff member for help.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-white rounded-2xl p-4 mb-5" style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
        <PaymentElement
          options={{
            layout: "tabs",
            wallets: { applePay: "auto", googlePay: "auto" },
          }}
          data-testid="payment-element"
        />
      </div>

      {error && (
        <div className="mb-5 px-4 py-3.5 bg-[#FFF0EC] border border-[#FCCAB4] text-[#C04030] rounded-2xl text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !stripe}
        data-testid="pay-btn"
        className={`w-full py-4 rounded-2xl font-bold text-[16px] transition-all ${
          submitting || !stripe
            ? "bg-[#EDE8E1] text-[#C0BAB3] cursor-not-allowed"
            : "bg-[#1A1A1A] text-white active:scale-[0.97]"
        }`}
        style={{ marginBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
      >
        {submitting ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 size={18} className="animate-spin" />
            Placing order…
          </span>
        ) : (
          `Pay ${formatCents(amountCents)}`
        )}
      </button>
    </form>
  );
}

function ErrorPage({ title, message, onBack }: { title: string; message: string; onBack: () => void }) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center bg-[#FDFCFA]">
      <p className="text-4xl mb-4">😕</p>
      <h2 className="font-bold text-xl text-[#1A1A1A] mb-2 tracking-tight">{title}</h2>
      <p className="text-[#8A8580] text-sm leading-relaxed mb-6">{message}</p>
      <button onClick={onBack} className="px-6 py-3 bg-[#1A1A1A] text-white rounded-xl font-semibold">
        Back to menu
      </button>
    </div>
  );
}

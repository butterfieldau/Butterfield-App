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
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState<number>(cartTotal);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const stripeKey = config.stripePublishableKey ?? "";

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
      <header className="bg-[#FDFCFA] px-5 py-4 flex items-center gap-3 safe-top shrink-0">
        <button
          onClick={() => goTo("menu")}
          className="w-9 h-9 rounded-full bg-[#F0EDE8] flex items-center justify-center text-[#5A5550]"
        >
          <ArrowLeft size={17} strokeWidth={2.5} />
        </button>
        <h1 className="font-bold text-[#1A1A1A] text-lg tracking-tight">Checkout</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-5 pt-2 pb-36 no-scrollbar">

        {/* Table badge */}
        <div className="flex items-center gap-2.5 bg-[#F0EDE8] rounded-2xl px-4 py-3 mb-6">
          <div className="w-7 h-7 rounded-xl bg-[#1A1A1A] flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold leading-none">{config.tableNumber}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#1A1A1A] leading-tight">Table {config.tableNumber}</p>
            <p className="text-xs text-[#8A8580]">Dine in · delivered to your table</p>
          </div>
        </div>

        {/* Order summary */}
        <section className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#8A8580] mb-3">
            Order summary
          </p>
          <div className="bg-white rounded-2xl overflow-hidden"
            style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
            <div className="px-5 py-4 space-y-3">
              {cart.map((item) => (
                <div key={item.id} className="flex justify-between items-start">
                  <div className="flex-1 pr-3">
                    <span className="font-medium text-[#1A1A1A] text-sm">
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
                  <span className="font-semibold text-[#1A1A1A] text-sm shrink-0">
                    {formatCents(item.unitCents * item.quantity)}
                  </span>
                </div>
              ))}
            </div>
            <div className="px-5 py-3.5 border-t border-[#F0EDE8] flex justify-between">
              <span className="font-bold text-[#1A1A1A]">Total</span>
              <span className="font-bold text-[#1A1A1A] text-lg tracking-tight">{formatCents(amountCents)}</span>
            </div>
          </div>
        </section>

        {/* Your details */}
        <section className="mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[#8A8580] mb-3">
            Your details
          </p>
          <div className="bg-white rounded-2xl overflow-hidden"
            style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
            <div className="divide-y divide-[#F0EDE8]">
              {/* Name */}
              <div className="px-5 py-4">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#8A8580]">
                  First name <span className="text-[#E05030]">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Alex"
                  autoComplete="given-name"
                  className="w-full mt-1.5 text-sm text-[#1A1A1A] placeholder-[#C0BAB3]
                             focus:outline-none bg-transparent"
                />
              </div>

              {/* Phone */}
              <div className="px-5 py-4">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#8A8580]">
                  Phone
                  <span className="ml-1.5 text-[10px] font-medium normal-case tracking-normal text-[#C0BAB3]">
                    optional
                  </span>
                </label>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 0400 000 000"
                  type="tel"
                  autoComplete="tel"
                  className="w-full mt-1.5 text-sm text-[#1A1A1A] placeholder-[#C0BAB3]
                             focus:outline-none bg-transparent"
                />
              </div>

              {/* Email */}
              <div className="px-5 py-4">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-[#8A8580]">
                  Email
                  <span className="ml-1.5 text-[10px] font-medium normal-case tracking-normal text-[#C0BAB3]">
                    optional
                  </span>
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. alex@email.com"
                  type="email"
                  autoComplete="email"
                  className="w-full mt-1.5 text-sm text-[#1A1A1A] placeholder-[#C0BAB3]
                             focus:outline-none bg-transparent"
                  data-testid="email-input"
                />
                {/* Rewards nudge */}
                <div className="flex items-start gap-2 mt-3 pt-3 border-t border-[#F0EDE8]">
                  <span className="text-base leading-none shrink-0 mt-0.5">🍪</span>
                  <p className="text-xs text-[#8A8580] leading-relaxed">
                    Add your email to earn stamps on this order and track rewards in the Butterfield app.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Payment section */}
        {fetchError && (
          <div className="mb-5 px-4 py-3.5 bg-[#FFF0EC] border border-[#FCCAB4] text-[#C04030] rounded-2xl text-sm">
            {fetchError}
          </div>
        )}

        {!clientSecret ? (
          <button
            onClick={createIntent}
            disabled={!name.trim() || fetching}
            data-testid="continue-to-payment-btn"
            className={`w-full py-4 rounded-2xl font-bold text-[15px] transition-all ${
              !name.trim() || fetching
                ? "bg-[#EDE8E1] text-[#C0BAB3] cursor-not-allowed"
                : "bg-[#1A1A1A] text-white active:scale-[0.97]"
            }`}
          >
            {fetching ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={18} className="animate-spin" />
                Setting up payment…
              </span>
            ) : (
              `Continue to payment · ${formatCents(amountCents)}`
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
      <section className="mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-[#8A8580] mb-3">
          Payment
        </p>
        <div className="bg-white rounded-2xl p-4" style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
          <PaymentElement
            options={{
              layout: "tabs",
              wallets: { applePay: "auto", googlePay: "auto" },
            }}
            data-testid="payment-element"
          />
        </div>
      </section>

      {error && (
        <div className="mb-5 px-4 py-3.5 bg-[#FFF0EC] border border-[#FCCAB4] text-[#C04030] rounded-2xl text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !stripe}
        data-testid="pay-btn"
        className={`w-full py-4 rounded-2xl font-bold text-[15px] transition-all safe-bottom ${
          submitting || !stripe
            ? "bg-[#EDE8E1] text-[#C0BAB3] cursor-not-allowed"
            : "bg-[#1A1A1A] text-white active:scale-[0.97]"
        }`}
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

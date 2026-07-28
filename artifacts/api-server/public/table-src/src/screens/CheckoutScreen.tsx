import { useState, useEffect } from "react";
import { ArrowLeft, MapPin, Loader2 } from "lucide-react";
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
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null);
  const [amountCents, setAmountCents] = useState<number>(cartTotal);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);

  const stripeKey = config.stripePublishableKey ?? "";

  // Build the payment intent when name is confirmed
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
        body: JSON.stringify({
          items,
          tableNumber: config.tableNumber,
          storeId: config.storeId,
        }),
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
    <div className="min-h-dvh bg-[#fdf8f3] flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 safe-top">
        <button
          onClick={() => goTo("menu")}
          className="p-1.5 rounded-full bg-gray-100 text-gray-600"
        >
          <ArrowLeft size={18} />
        </button>
        <h1 className="font-bold text-gray-900 text-lg">Checkout</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-32">
        {/* Table badge */}
        <div className="flex items-center gap-2 bg-blue-50 text-[#0b70f8] rounded-xl px-4 py-2.5 mb-5">
          <MapPin size={16} />
          <span className="font-semibold text-sm">Table {config.tableNumber}</span>
          <span className="text-blue-400 text-xs ml-auto">Dine in · Delivered to your table</span>
        </div>

        {/* Order summary */}
        <section className="mb-5">
          <h2 className="font-bold text-gray-900 mb-3">Order summary</h2>
          <div className="bg-white rounded-2xl p-4 space-y-2">
            {cart.map((item) => (
              <div key={item.id} className="flex justify-between items-start text-sm">
                <div className="flex-1">
                  <span className="font-medium text-gray-900">
                    {item.quantity} × {item.productName}
                  </span>
                  {item.variantName && (
                    <span className="text-gray-500"> · {item.variantName}</span>
                  )}
                  {item.selectedOptions.length > 0 && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {item.selectedOptions.map((o) => o.optionName).join(", ")}
                    </p>
                  )}
                </div>
                <span className="font-semibold text-gray-900 shrink-0 ml-3">
                  {formatCents(item.unitCents * item.quantity)}
                </span>
              </div>
            ))}
            <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-gray-900">
              <span>Total</span>
              <span>{formatCents(amountCents)}</span>
            </div>
          </div>
        </section>

        {/* Contact details */}
        <section className="mb-5">
          <h2 className="font-bold text-gray-900 mb-3">Your details</h2>
          <div className="bg-white rounded-2xl p-4 space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                First name <span className="text-red-500">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Alex"
                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-[#0b70f8]"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                Phone (optional)
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 0400 000 000"
                type="tel"
                className="w-full mt-1 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-800 focus:outline-none focus:border-[#0b70f8]"
              />
            </div>
          </div>
        </section>

        {/* Payment section */}
        {fetchError && (
          <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
            {fetchError}
          </div>
        )}

        {!clientSecret ? (
          <button
            onClick={createIntent}
            disabled={!name.trim() || fetching}
            className={`w-full py-4 rounded-xl font-bold text-base transition-all ${
              !name.trim() || fetching
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-[#0b70f8] text-white active:scale-[0.98]"
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
                  colorPrimary: "#0b70f8",
                  borderRadius: "12px",
                  fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
                },
              },
            }}
          >
            <PaymentForm
              clientSecret={clientSecret}
              paymentIntentId={paymentIntentId!}
              name={name}
              phone={phone}
              amountCents={amountCents}
            />
          </Elements>
        )}
      </div>
    </div>
  );
}

// ── Inner payment form (needs Stripe Elements context) ───────────────────────

interface PaymentFormProps {
  clientSecret: string;
  paymentIntentId: string;
  name: string;
  phone: string;
  amountCents: number;
}

function PaymentForm({ paymentIntentId, name, phone, amountCents }: PaymentFormProps) {
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
      // Confirm payment
      const { error: stripeError } = await stripe.confirmPayment({
        elements,
        redirect: "if_required",
      });

      if (stripeError) {
        setError(stripeError.message ?? "Payment failed. Please try again.");
        setSubmitting(false);
        return;
      }

      // Record order
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
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Order could not be placed.");

      setConfirmation({
        orderNumber: data.data.orderNumber,
        tableNumber: config.tableNumber,
        items: cart,
        totalCents: amountCents,
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
        <h2 className="font-bold text-gray-900 mb-3">Payment</h2>
        <div className="bg-white rounded-2xl p-4">
          <PaymentElement
            options={{
              layout: "tabs",
              wallets: { applePay: "auto", googlePay: "auto" },
            }}
          />
        </div>
      </section>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !stripe}
        className={`w-full py-4 rounded-xl font-bold text-base transition-all safe-bottom ${
          submitting || !stripe
            ? "bg-gray-200 text-gray-400 cursor-not-allowed"
            : "bg-[#0b70f8] text-white active:scale-[0.98]"
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

function ErrorPage({
  title,
  message,
  onBack,
}: {
  title: string;
  message: string;
  onBack: () => void;
}) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center bg-[#fdf8f3]">
      <p className="text-4xl mb-4">😕</p>
      <h2 className="font-bold text-xl text-gray-900 mb-2">{title}</h2>
      <p className="text-gray-500 text-sm leading-relaxed mb-6">{message}</p>
      <button
        onClick={onBack}
        className="px-6 py-3 bg-[#0b70f8] text-white rounded-xl font-semibold"
      >
        Back to menu
      </button>
    </div>
  );
}

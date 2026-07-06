import { useState } from "react";
import {
  ChevronLeft, MapPin, Clock, CreditCard, Store, Tag, Coffee,
  Star, Check, ChevronDown, ChevronRight
} from "lucide-react";

const BLUE = "#40C0F2";
const BG = "#0D0D0D";
const CARD = "#1A1A1A";
const BORDER = "#2C2C2E";
const TEXT = "#FFFFFF";
const MUTED = "#8E8E93";
const GREEN = "#30D158";

type PayMethod = "apple" | "card" | "counter";
type Fulfillment = "pickup" | "delivery";

function StatusBar() {
  return (
    <div style={{ background: BG, paddingTop: 14, paddingBottom: 4 }}>
      <div className="flex justify-between items-center px-6">
        <span style={{ color: TEXT, fontSize: 15, fontWeight: 600 }}>9:41</span>
        <div className="flex items-center gap-2">
          <div className="flex items-end gap-0.5">
            {[3, 5, 7, 9].map((h, i) => (
              <div key={i} style={{ width: 3, height: h, background: i < 3 ? TEXT : MUTED, borderRadius: 1 }} />
            ))}
          </div>
          <svg width="15" height="11" viewBox="0 0 15 11" fill="none">
            <path d="M7.5 2.5C9.2 2.5 10.7 3.2 11.8 4.3L13.2 2.9C11.7 1.5 9.7 0.5 7.5 0.5C5.3 0.5 3.3 1.5 1.8 2.9L3.2 4.3C4.3 3.2 5.8 2.5 7.5 2.5Z" fill={TEXT}/>
            <path d="M7.5 5.5C8.6 5.5 9.6 5.9 10.4 6.6L11.8 5.2C10.7 4.2 9.2 3.5 7.5 3.5C5.8 3.5 4.3 4.2 3.2 5.2L4.6 6.6C5.4 5.9 6.4 5.5 7.5 5.5Z" fill={TEXT}/>
            <circle cx="7.5" cy="9.5" r="1.5" fill={TEXT}/>
          </svg>
          <div style={{ width: 22, height: 11, border: `1.5px solid ${TEXT}`, borderRadius: 3, padding: "1.5px 2px", display: "flex", alignItems: "center" }}>
            <div style={{ width: 15, height: "100%", background: TEXT, borderRadius: 1.5 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Div() {
  return <div style={{ height: 1, background: BORDER, marginLeft: 20 }} />;
}

function SecLabel({ label }: { label: string }) {
  return (
    <div style={{ padding: "16px 20px 8px", color: MUTED, fontSize: 11, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase" as const }}>
      {label}
    </div>
  );
}

export function Express() {
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [timing, setTiming] = useState<"asap" | "schedule">("asap");
  const [payMethod, setPayMethod] = useState<PayMethod>("apple");
  const [usePoints, setUsePoints] = useState(false);
  const [useFreeCoffee, setUseFreeCoffee] = useState(false);

  const subtotal = 26.50;
  const deliveryFee = fulfillment === "delivery" ? 5.00 : 0;
  const discount = usePoints ? 2.40 : 0;
  const coffeeDiscount = useFreeCoffee ? 5.50 : 0;
  const total = (subtotal + deliveryFee - discount - coffeeDiscount).toFixed(2);

  const items = [
    { name: "Double Choc Cookie", qty: 2, price: 17.00 },
    { name: "Flat White", qty: 1, price: 5.50 },
    { name: "Salted Caramel Cookie", qty: 1, price: 4.00 },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#111", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 0" }}>
      <div style={{
        width: 390, height: 844, background: BG, borderRadius: 48,
        overflow: "hidden",
        boxShadow: "0 40px 80px rgba(0,0,0,0.8), inset 0 0 0 1px rgba(255,255,255,0.08)",
        display: "flex", flexDirection: "column",
        fontFamily: "-apple-system, 'SF Pro Text', sans-serif"
      }}>
        <StatusBar />

        {/* Header */}
        <div style={{ background: BG, paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: BLUE }}>
              <ChevronLeft size={22} />
              <span style={{ fontSize: 17 }}>Cart</span>
            </div>
            <span style={{ color: TEXT, fontSize: 20, fontWeight: 700 }}>Checkout</span>
            <div style={{ width: 60 }} />
          </div>
          <div style={{ display: "flex", gap: 6, padding: "10px 20px 0" }}>
            {[true, true, false].map((active, i) => (
              <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: active ? BLUE : BORDER }} />
            ))}
          </div>
        </div>

        {/* Scrollable */}
        <div style={{ flex: 1, overflowY: "auto" }}>

          {/* ORDER */}
          <SecLabel label="Your Order" />
          <div style={{ background: CARD, margin: "0 16px", borderRadius: 14 }}>
            {items.map((item, i) => (
              <div key={i}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: BORDER, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>{item.qty}×</span>
                    </div>
                    <span style={{ color: TEXT, fontSize: 15 }}>{item.name}</span>
                  </div>
                  <span style={{ color: TEXT, fontSize: 15, fontWeight: 500 }}>AUD {item.price.toFixed(2)}</span>
                </div>
                {i < items.length - 1 && <Div />}
              </div>
            ))}
          </div>

          {/* DELIVERY */}
          <SecLabel label="Delivery" />
          <div style={{ margin: "0 16px", borderRadius: 14, overflow: "hidden" }}>
            {/* Toggle */}
            <div style={{ display: "flex", padding: 6, gap: 4, background: "#2C2C2E", borderRadius: 14, marginBottom: 8 }}>
              {(["pickup", "delivery"] as const).map((type) => (
                <button key={type} onClick={() => setFulfillment(type)} style={{
                  flex: 1, padding: "9px 0", borderRadius: 10, border: "none",
                  background: fulfillment === type ? BLUE : "transparent",
                  color: fulfillment === type ? "#fff" : MUTED,
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                }}>
                  {type === "pickup" ? <Store size={14} /> : <MapPin size={14} />}
                  {type === "pickup" ? "Pickup · Free" : "Delivery · $5.00"}
                </button>
              ))}
            </div>

            <div style={{ background: CARD, borderRadius: 14 }}>
              {fulfillment === "pickup" ? (
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: BORDER, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <MapPin size={17} color={BLUE} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ color: TEXT, fontSize: 15, fontWeight: 600, margin: 0 }}>Cookie Corner</p>
                      <p style={{ color: MUTED, fontSize: 13, margin: "2px 0 0" }}>420 Crown St, Surry Hills NSW</p>
                      <span style={{ display: "inline-block", marginTop: 6, padding: "3px 9px", borderRadius: 6, background: "#1C3A25", color: GREEN, fontSize: 11, fontWeight: 600 }}>Open · Closes 5pm</span>
                    </div>
                    <ChevronRight size={16} color={MUTED} />
                  </div>
                </div>
              ) : (
                <div style={{ padding: "14px 16px" }}>
                  <div style={{ padding: "10px 14px", background: BORDER, borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
                    <MapPin size={16} color={BLUE} />
                    <span style={{ color: TEXT, fontSize: 14 }}>12 George St, Sydney NSW 2000</span>
                    <ChevronRight size={14} color={MUTED} style={{ marginLeft: "auto" }} />
                  </div>
                </div>
              )}

              <Div />

              {/* Timing */}
              <div style={{ padding: "12px 16px" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["asap", "schedule"] as const).map((t) => (
                    <button key={t} onClick={() => setTiming(t)} style={{
                      flex: 1, padding: "9px 0", borderRadius: 10, border: `1.5px solid ${timing === t ? BLUE : BORDER}`,
                      background: timing === t ? "rgba(64,192,242,0.12)" : "transparent",
                      color: timing === t ? BLUE : MUTED, fontSize: 14, fontWeight: 500, cursor: "pointer"
                    }}>
                      {t === "asap" ? "⚡ ASAP" : "📅 Schedule"}
                    </button>
                  ))}
                </div>
                {timing === "schedule" && (
                  <div style={{ marginTop: 10, padding: "10px 14px", background: BORDER, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Clock size={15} color={BLUE} />
                      <span style={{ color: TEXT, fontSize: 14 }}>Mon 14 Jul · 9:30 am</span>
                    </div>
                    <ChevronDown size={15} color={MUTED} />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* USE REWARDS */}
          <SecLabel label="Use Rewards" />
          <div style={{ background: CARD, margin: "0 16px", borderRadius: 14 }}>
            {/* Points */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: usePoints ? "rgba(64,192,242,0.15)" : BORDER, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Star size={16} color={usePoints ? BLUE : MUTED} fill={usePoints ? BLUE : "none"} />
                </div>
                <div>
                  <p style={{ color: TEXT, fontSize: 15, fontWeight: 500, margin: 0 }}>240 points</p>
                  <p style={{ color: MUTED, fontSize: 12, margin: "2px 0 0" }}>Worth AUD 2.40</p>
                </div>
              </div>
              <button onClick={() => setUsePoints(!usePoints)} style={{
                padding: "6px 16px", borderRadius: 20, border: "none",
                background: usePoints ? BLUE : BORDER,
                color: usePoints ? "#fff" : MUTED, fontSize: 13, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5
              }}>
                {usePoints ? <><Check size={12} /> Applied</> : "Use"}
              </button>
            </div>
            <Div />

            {/* Free coffee */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: useFreeCoffee ? "rgba(64,192,242,0.15)" : BORDER, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Coffee size={16} color={useFreeCoffee ? BLUE : MUTED} />
                </div>
                <div>
                  <p style={{ color: TEXT, fontSize: 15, fontWeight: 500, margin: 0 }}>Free coffee</p>
                  <p style={{ color: MUTED, fontSize: 12, margin: "2px 0 0" }}>1 available · Flat White AUD 5.50</p>
                </div>
              </div>
              <button onClick={() => setUseFreeCoffee(!useFreeCoffee)} style={{
                padding: "6px 16px", borderRadius: 20, border: "none",
                background: useFreeCoffee ? BLUE : BORDER,
                color: useFreeCoffee ? "#fff" : MUTED, fontSize: 13, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5
              }}>
                {useFreeCoffee ? <><Check size={12} /> Applied</> : "Use"}
              </button>
            </div>
            <Div />

            {/* Discount */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
              <Tag size={16} color={MUTED} />
              <input placeholder="Discount code" style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: TEXT, fontSize: 15, caretColor: BLUE
              }} />
              <span style={{ color: BLUE, fontSize: 14, fontWeight: 600 }}>Apply</span>
            </div>
          </div>

          {/* PAYMENT */}
          <SecLabel label="Payment" />
          <div style={{ background: CARD, margin: "0 16px", borderRadius: 14 }}>
            {([
              { id: "apple" as PayMethod, icon: "🍎", label: "Apple Pay", sub: "Face ID · instant" },
              { id: "card" as PayMethod, icon: "💳", label: "•••• 4242", sub: "Visa · expires 09/27" },
              { id: "counter" as PayMethod, icon: "🏪", label: "Pay at counter", sub: "When you arrive" },
            ]).map((m, i, arr) => (
              <div key={m.id}>
                <button onClick={() => setPayMethod(m.id)} style={{
                  width: "100%", display: "flex", alignItems: "center", padding: "14px 16px",
                  background: "transparent", border: "none", cursor: "pointer", gap: 14
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center",
                    background: payMethod === m.id ? "rgba(64,192,242,0.15)" : BORDER, fontSize: 20, flexShrink: 0
                  }}>
                    {m.icon}
                  </div>
                  <div style={{ flex: 1, textAlign: "left" as const }}>
                    <p style={{ color: TEXT, fontSize: 15, fontWeight: 500, margin: 0 }}>{m.label}</p>
                    <p style={{ color: MUTED, fontSize: 12, margin: "2px 0 0" }}>{m.sub}</p>
                  </div>
                  <div style={{
                    width: 22, height: 22, borderRadius: 11,
                    border: `2px solid ${payMethod === m.id ? BLUE : BORDER}`,
                    background: payMethod === m.id ? BLUE : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    {payMethod === m.id && <Check size={12} color="#fff" strokeWidth={3} />}
                  </div>
                </button>
                {i < arr.length - 1 && <Div />}
              </div>
            ))}
          </div>

          {/* TOTAL */}
          <div style={{ margin: "16px 16px 0", padding: "16px", background: CARD, borderRadius: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ color: MUTED, fontSize: 14 }}>Subtotal</span>
              <span style={{ color: TEXT, fontSize: 14 }}>AUD {subtotal.toFixed(2)}</span>
            </div>
            {deliveryFee > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: MUTED, fontSize: 14 }}>Delivery</span>
                <span style={{ color: TEXT, fontSize: 14 }}>AUD {deliveryFee.toFixed(2)}</span>
              </div>
            )}
            {(discount + coffeeDiscount) > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: GREEN, fontSize: 14 }}>Rewards</span>
                <span style={{ color: GREEN, fontSize: 14 }}>−AUD {(discount + coffeeDiscount).toFixed(2)}</span>
              </div>
            )}
            <div style={{ height: 1, background: BORDER, margin: "10px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: TEXT, fontSize: 18, fontWeight: 700 }}>Total</span>
              <span style={{ color: TEXT, fontSize: 18, fontWeight: 700 }}>AUD {total}</span>
            </div>
          </div>

          {/* PLACE ORDER */}
          <div style={{ padding: "16px 16px 36px" }}>
            <button style={{
              width: "100%", padding: "18px 0", borderRadius: 16, border: "none",
              background: payMethod === "apple" ? "#000" : BLUE,
              color: "#fff", fontSize: 17, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              boxShadow: payMethod === "apple" ? "0 4px 20px rgba(0,0,0,0.6)" : `0 6px 24px rgba(64,192,242,0.4)`
            }}>
              {payMethod === "apple" ? "🍎  Pay AUD " + total : "Place Order · AUD " + total}
            </button>
            <p style={{ color: MUTED, fontSize: 11, textAlign: "center" as const, marginTop: 10 }}>
              Secure checkout · Terms apply
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

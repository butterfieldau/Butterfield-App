import { useState } from "react";
import {
  ChevronLeft, MapPin, Clock, CreditCard, Store, Tag, Coffee,
  Star, Check, ChevronDown, Pencil, Plus
} from "lucide-react";

const CHERRY = "#D20001";
const BLUE = "#40C0F2";
const TEXT = "#111111";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const BG = "#F5F6FA";
const GREEN = "#16A34A";

type PayMethod = "apple" | "card" | "counter";
type Fulfillment = "pickup" | "delivery";

function StatusBar() {
  return (
    <div style={{ background: "#fff", paddingTop: 14, paddingBottom: 4 }}>
      <div className="flex justify-between items-center px-6">
        <span style={{ color: TEXT, fontSize: 15, fontWeight: 600 }}>9:41</span>
        <div className="flex items-center gap-2">
          <div className="flex items-end gap-0.5">
            {[3, 5, 7, 9].map((h, i) => (
              <div key={i} style={{ width: 3, height: h, background: i < 3 ? TEXT : BORDER, borderRadius: 1 }} />
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

function SectionDivider() {
  return <div style={{ height: 1, background: BORDER }} />;
}

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ background: "#fff", margin: "10px 16px 0", borderRadius: 18, border: `1px solid ${BORDER}`, overflow: "hidden", ...style }}>
      {children}
    </div>
  );
}

function CardTitle({ label }: { label: string }) {
  return (
    <div style={{ padding: "14px 16px 10px", borderBottom: `1px solid ${BORDER}` }}>
      <span style={{ color: TEXT, fontSize: 12, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" as const }}>
        {label}
      </span>
    </div>
  );
}

export function Direct() {
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [timing, setTiming] = useState<"asap" | "schedule">("asap");
  const [payMethod, setPayMethod] = useState<PayMethod>("apple");
  const [usePoints, setUsePoints] = useState(false);
  const [useFreeCoffee, setUseFreeCoffee] = useState(false);
  const [discountCode, setDiscountCode] = useState("");

  const subtotal = 26.50;
  const deliveryFee = fulfillment === "delivery" ? 5.00 : 0;
  const discount = usePoints ? 2.40 : 0;
  const coffeeDiscount = useFreeCoffee ? 5.50 : 0;
  const total = (subtotal + deliveryFee - discount - coffeeDiscount).toFixed(2);

  const items = [
    { name: "Double Choc Cookie", qty: 2, price: 17.00, emoji: "🍪" },
    { name: "Flat White", qty: 1, price: 5.50, emoji: "☕" },
    { name: "Salted Caramel Cookie", qty: 1, price: 4.00, emoji: "🍪" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#d4d4d4", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 0" }}>
      <div style={{
        width: 390, height: 844, background: "#fff", borderRadius: 48,
        overflow: "hidden",
        boxShadow: "0 40px 80px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(0,0,0,0.06)",
        display: "flex", flexDirection: "column",
        fontFamily: "-apple-system, 'SF Pro Text', sans-serif"
      }}>
        <StatusBar />

        {/* Header */}
        <div style={{ background: "#fff", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", alignItems: "center", padding: "6px 20px 0" }}>
            <button style={{ display: "flex", alignItems: "center", gap: 4, color: CHERRY, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
              <ChevronLeft size={22} />
              <span style={{ fontSize: 17 }}>Cart</span>
            </button>
          </div>
          <div style={{ padding: "8px 20px 14px" }}>
            <h1 style={{ fontSize: 30, fontWeight: 800, color: TEXT, margin: 0, letterSpacing: -0.5 }}>Checkout</h1>
            <p style={{ color: MUTED, fontSize: 14, margin: "2px 0 0" }}>3 items · AUD {subtotal.toFixed(2)}</p>
          </div>

          {/* Step progress */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "0 20px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 24, height: 24, borderRadius: 12, background: CHERRY, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Check size={13} color="#fff" strokeWidth={3} />
              </div>
              <span style={{ fontSize: 13, color: CHERRY, fontWeight: 600 }}>Cart</span>
            </div>
            <div style={{ flex: 1, height: 2, background: CHERRY, margin: "0 8px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 24, height: 24, borderRadius: 12, background: TEXT, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 12, color: "#fff", fontWeight: 700 }}>2</span>
              </div>
              <span style={{ fontSize: 13, color: TEXT, fontWeight: 700 }}>Pay</span>
            </div>
            <div style={{ flex: 1, height: 2, background: BORDER, margin: "0 8px" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 24, height: 24, borderRadius: 12, border: `2px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>3</span>
              </div>
              <span style={{ fontSize: 13, color: MUTED }}>Done</span>
            </div>
          </div>
        </div>

        {/* Scrollable */}
        <div style={{ flex: 1, overflowY: "auto", background: BG }}>

          {/* PICKUP / DELIVERY */}
          <Card style={{ marginTop: 12 }}>
            <CardTitle label="How would you like it?" />

            <div style={{ display: "flex", gap: 8, padding: 12 }}>
              {(["pickup", "delivery"] as const).map((type) => (
                <button key={type} onClick={() => setFulfillment(type)} style={{
                  flex: 1, padding: "13px 0", borderRadius: 14,
                  border: `2.5px solid ${fulfillment === type ? TEXT : BORDER}`,
                  background: fulfillment === type ? TEXT : "#fff",
                  color: fulfillment === type ? "#fff" : MUTED,
                  fontSize: 15, fontWeight: 700, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7
                }}>
                  {type === "pickup" ? <Store size={16} /> : <MapPin size={16} />}
                  {type === "pickup" ? "Pickup" : "Delivery"}
                </button>
              ))}
            </div>

            <SectionDivider />

            {fulfillment === "pickup" ? (
              <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: BG, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <MapPin size={18} color={TEXT} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: TEXT, fontSize: 15, fontWeight: 700, margin: 0 }}>Cookie Corner · Surry Hills</p>
                  <p style={{ color: MUTED, fontSize: 13, margin: "2px 0 0" }}>Open · Closes 5 pm</p>
                </div>
                <button style={{ padding: "6px 12px", borderRadius: 20, background: BG, border: `1px solid ${BORDER}`, color: TEXT, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
                  Change
                </button>
              </div>
            ) : (
              <div style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", padding: "12px 14px", background: BG, borderRadius: 12, border: `1px solid ${BORDER}`, gap: 10 }}>
                  <MapPin size={16} color={TEXT} />
                  <span style={{ color: TEXT, fontSize: 14, flex: 1 }}>12 George St, Sydney NSW 2000</span>
                  <Pencil size={14} color={MUTED} />
                </div>
                <p style={{ color: MUTED, fontSize: 12, margin: "6px 0 0", paddingLeft: 4 }}>Flat fee AUD 5.00 · NSW only</p>
              </div>
            )}

            <SectionDivider />

            <div style={{ padding: "12px 12px 12px" }}>
              <div style={{ display: "flex", gap: 8 }}>
                {(["asap", "schedule"] as const).map((t) => (
                  <button key={t} onClick={() => setTiming(t)} style={{
                    flex: 1, padding: "11px 0", borderRadius: 12,
                    border: `2px solid ${timing === t ? TEXT : BORDER}`,
                    background: timing === t ? TEXT : "#fff",
                    color: timing === t ? "#fff" : MUTED,
                    fontSize: 14, fontWeight: 600, cursor: "pointer"
                  }}>
                    {t === "asap" ? "⚡ ASAP" : "📅 Schedule"}
                  </button>
                ))}
              </div>
              {timing === "schedule" && (
                <div style={{ marginTop: 10, padding: "12px 14px", background: BG, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${BORDER}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Clock size={15} color={TEXT} />
                    <span style={{ color: TEXT, fontSize: 14, fontWeight: 500 }}>Mon 14 Jul · 9:30 am</span>
                  </div>
                  <ChevronDown size={15} color={MUTED} />
                </div>
              )}
            </div>
          </Card>

          {/* REWARDS */}
          <Card>
            <CardTitle label="Use Rewards" />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: usePoints ? "#EFF9FF" : BG, border: `1.5px solid ${usePoints ? BLUE : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Star size={18} color={usePoints ? BLUE : MUTED} fill={usePoints ? BLUE : "none"} />
                </div>
                <div>
                  <p style={{ color: TEXT, fontSize: 15, fontWeight: 600, margin: 0 }}>240 points</p>
                  <p style={{ color: MUTED, fontSize: 12, margin: 0 }}>= AUD 2.40 off</p>
                </div>
              </div>
              <button onClick={() => setUsePoints(!usePoints)} style={{
                padding: "8px 18px", borderRadius: 20, border: "none",
                background: usePoints ? BLUE : BG,
                color: usePoints ? "#fff" : TEXT,
                fontSize: 14, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5
              }}>
                {usePoints ? <><Check size={13} /> On</> : "Use"}
              </button>
            </div>

            <SectionDivider />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: 12, background: useFreeCoffee ? "#EFF9FF" : BG, border: `1.5px solid ${useFreeCoffee ? BLUE : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Coffee size={18} color={useFreeCoffee ? BLUE : MUTED} />
                </div>
                <div>
                  <p style={{ color: TEXT, fontSize: 15, fontWeight: 600, margin: 0 }}>Free coffee</p>
                  <p style={{ color: MUTED, fontSize: 12, margin: 0 }}>Flat White · AUD 5.50</p>
                </div>
              </div>
              <button onClick={() => setUseFreeCoffee(!useFreeCoffee)} style={{
                padding: "8px 18px", borderRadius: 20, border: "none",
                background: useFreeCoffee ? BLUE : BG,
                color: useFreeCoffee ? "#fff" : TEXT,
                fontSize: 14, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5
              }}>
                {useFreeCoffee ? <><Check size={13} /> On</> : "Use"}
              </button>
            </div>

            <SectionDivider />

            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
              <Tag size={16} color={MUTED} />
              <input
                value={discountCode}
                onChange={(e) => setDiscountCode(e.target.value)}
                placeholder="Promo code"
                style={{ flex: 1, border: "none", outline: "none", color: TEXT, fontSize: 15, background: "transparent" }}
              />
              {discountCode && <span style={{ color: CHERRY, fontSize: 14, fontWeight: 700 }}>Apply</span>}
            </div>
          </Card>

          {/* PAYMENT */}
          <Card>
            <CardTitle label="Pay With" />

            {/* Apple Pay */}
            <div style={{ padding: "12px 16px 10px" }}>
              <button onClick={() => setPayMethod("apple")} style={{
                width: "100%", padding: "15px 0", borderRadius: 14,
                border: `2.5px solid ${payMethod === "apple" ? TEXT : BORDER}`,
                background: payMethod === "apple" ? TEXT : "#fff",
                color: payMethod === "apple" ? "#fff" : TEXT,
                fontSize: 16, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 9
              }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
                </svg>
                Apple Pay
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 16px 10px" }}>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
              <span style={{ color: MUTED, fontSize: 12, fontWeight: 500 }}>or pay with card</span>
              <div style={{ flex: 1, height: 1, background: BORDER }} />
            </div>

            <SectionDivider />

            {/* Saved card */}
            <button onClick={() => setPayMethod("card")} style={{
              width: "100%", display: "flex", alignItems: "center", padding: "14px 16px",
              background: "transparent", border: "none", cursor: "pointer"
            }}>
              <div style={{ width: 48, height: 32, borderRadius: 8, background: BG, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", marginRight: 14, flexShrink: 0 }}>
                <CreditCard size={18} color={TEXT} />
              </div>
              <div style={{ flex: 1, textAlign: "left" as const }}>
                <p style={{ color: TEXT, fontSize: 15, fontWeight: 600, margin: 0 }}>•••• 4242</p>
                <p style={{ color: MUTED, fontSize: 12, margin: 0 }}>Visa · 09/27</p>
              </div>
              <div style={{
                width: 24, height: 24, borderRadius: 12,
                border: `2.5px solid ${payMethod === "card" ? TEXT : BORDER}`,
                background: payMethod === "card" ? TEXT : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                {payMethod === "card" && <Check size={13} color="#fff" strokeWidth={3} />}
              </div>
            </button>

            <SectionDivider />

            {/* Add card */}
            <button style={{
              width: "100%", display: "flex", alignItems: "center", padding: "13px 16px",
              background: "transparent", border: "none", cursor: "pointer", gap: 14
            }}>
              <div style={{ width: 48, height: 32, borderRadius: 8, background: BG, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Plus size={16} color={MUTED} />
              </div>
              <span style={{ color: MUTED, fontSize: 14 }}>Add card</span>
            </button>

            <SectionDivider />

            {/* Pay at counter */}
            <button onClick={() => setPayMethod("counter")} style={{
              width: "100%", display: "flex", alignItems: "center", padding: "14px 16px",
              background: "transparent", border: "none", cursor: "pointer"
            }}>
              <div style={{ width: 48, height: 32, borderRadius: 8, background: BG, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", marginRight: 14, flexShrink: 0 }}>
                <Store size={17} color={TEXT} />
              </div>
              <div style={{ flex: 1, textAlign: "left" as const }}>
                <p style={{ color: TEXT, fontSize: 15, fontWeight: 600, margin: 0 }}>Pay at counter</p>
                <p style={{ color: MUTED, fontSize: 12, margin: 0 }}>Pay when you arrive</p>
              </div>
              <div style={{
                width: 24, height: 24, borderRadius: 12,
                border: `2.5px solid ${payMethod === "counter" ? TEXT : BORDER}`,
                background: payMethod === "counter" ? TEXT : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center"
              }}>
                {payMethod === "counter" && <Check size={13} color="#fff" strokeWidth={3} />}
              </div>
            </button>
          </Card>

          {/* ORDER TOTAL */}
          <Card>
            <div style={{ padding: "14px 16px" }}>
              {items.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: MUTED, fontSize: 13 }}>{item.emoji} {item.name} ×{item.qty}</span>
                  <span style={{ color: TEXT, fontSize: 13 }}>AUD {item.price.toFixed(2)}</span>
                </div>
              ))}
              {deliveryFee > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: MUTED, fontSize: 13 }}>🚚 Delivery</span>
                  <span style={{ color: TEXT, fontSize: 13 }}>AUD {deliveryFee.toFixed(2)}</span>
                </div>
              )}
              {(discount + coffeeDiscount) > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ color: GREEN, fontSize: 13 }}>🎁 Rewards saved</span>
                  <span style={{ color: GREEN, fontSize: 13 }}>−AUD {(discount + coffeeDiscount).toFixed(2)}</span>
                </div>
              )}
              <div style={{ height: 1, background: BORDER, margin: "10px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: TEXT, fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Total</span>
                <span style={{ color: TEXT, fontSize: 22, fontWeight: 800 }}>AUD {total}</span>
              </div>
            </div>
          </Card>

          {/* CTA */}
          <div style={{ padding: "14px 16px 36px" }}>
            <button style={{
              width: "100%", padding: "19px 0", borderRadius: 18, border: "none",
              background: payMethod === "apple" ? TEXT : CHERRY,
              color: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer",
              letterSpacing: -0.3,
              boxShadow: payMethod === "apple" ? "0 4px 20px rgba(0,0,0,0.25)" : `0 6px 24px rgba(210,0,1,0.35)`
            }}>
              {payMethod === "apple" ? "🍎  Pay AUD " + total : "Confirm & Pay  AUD " + total}
            </button>
            <p style={{ color: MUTED, fontSize: 11, textAlign: "center" as const, marginTop: 10, lineHeight: 1.4 }}>
              Secure checkout · Terms apply
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState, useRef } from "react";
import {
  ChevronLeft, MapPin, CreditCard, Store, Tag, Coffee,
  Star, Check, ChevronRight, Zap, Calendar,
  Apple, Package
} from "lucide-react";

const BLUE = "#40C0F2";
const CHERRY = "#D20001";
const BG = "#F5F6FA";
const CARD = "#FFFFFF";
const BORDER = "#E5E7EB";
const TEXT = "#111111";
const MUTED = "#6B7280";
const GREEN = "#16A34A";
const GREEN_BG = "#F0FDF4";

type PayMethod = "apple" | "card" | "counter";
type Fulfillment = "pickup" | "delivery";
type Timing = "now" | "schedule";

const ALL_SLOTS = [
  "9:00am","10:00am","11:00am","12:00pm",
  "1:00pm","2:00pm",
  "5:00pm","6:00pm","7:00pm","8:00pm",
];

const DATES = [
  { label: "Today",  sub: "6 Jul",  slots: ["11:00am","12:00pm","1:00pm","2:00pm","5:00pm","6:00pm","7:00pm","8:00pm"] },
  { label: "Mon",    sub: "7 Jul",  slots: ALL_SLOTS },
  { label: "Tue",    sub: "8 Jul",  slots: ALL_SLOTS },
  { label: "Wed",    sub: "9 Jul",  slots: ALL_SLOTS },
  { label: "Thu",    sub: "10 Jul", slots: ALL_SLOTS },
  { label: "Fri",    sub: "11 Jul", slots: ALL_SLOTS },
  { label: "Sat",    sub: "12 Jul", slots: ALL_SLOTS },
];

const DELIVERY_DATES = [
  { label: "Mon", sub: "7 Jul", slots: ["9:00–11:00", "11:00–13:00", "13:00–15:00", "15:00–17:00"] },
  { label: "Tue", sub: "8 Jul", slots: ["9:00–11:00", "11:00–13:00", "13:00–15:00"] },
  { label: "Wed", sub: "9 Jul", slots: ["9:00–11:00", "11:00–13:00", "13:00–15:00", "15:00–17:00"] },
  { label: "Thu", sub: "10 Jul", slots: ["9:00–11:00", "11:00–13:00"] },
  { label: "Fri", sub: "11 Jul", slots: ["9:00–11:00", "11:00–13:00", "13:00–15:00"] },
];

function StatusBar() {
  return (
    <div style={{ background: CARD, paddingTop: 14, paddingBottom: 4 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 24px" }}>
        <span style={{ color: TEXT, fontSize: 15, fontWeight: 600 }}>9:41</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 2 }}>
            {[3, 5, 7, 9].map((h, i) => (
              <div key={i} style={{ width: 3, height: h, background: i < 3 ? TEXT : BORDER, borderRadius: 1 }} />
            ))}
          </div>
          <svg width="15" height="11" viewBox="0 0 15 11" fill="none">
            <path d="M7.5 2.5C9.2 2.5 10.7 3.2 11.8 4.3L13.2 2.9C11.7 1.5 9.7 0.5 7.5 0.5C5.3 0.5 3.3 1.5 1.8 2.9L3.2 4.3C4.3 3.2 5.8 2.5 7.5 2.5Z" fill={TEXT} />
            <path d="M7.5 5.5C8.6 5.5 9.6 5.9 10.4 6.6L11.8 5.2C10.7 4.2 9.2 3.5 7.5 3.5C5.8 3.5 4.3 4.2 3.2 5.2L4.6 6.6C5.4 5.9 6.4 5.5 7.5 5.5Z" fill={TEXT} />
            <circle cx="7.5" cy="9.5" r="1.5" fill={TEXT} />
          </svg>
          <div style={{ width: 22, height: 11, border: `1.5px solid ${TEXT}`, borderRadius: 3, padding: "1.5px 2px", display: "flex", alignItems: "center" }}>
            <div style={{ width: 15, height: "100%", background: TEXT, borderRadius: 1.5 }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function RowDiv() {
  return <div style={{ height: 1, background: BORDER, marginLeft: 20 }} />;
}

function SecLabel({ label }: { label: string }) {
  return (
    <div style={{ padding: "16px 20px 8px", color: MUTED, fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: "uppercase" as const }}>
      {label}
    </div>
  );
}

function DateTimePicker({
  dates, selectedDate, selectedSlot, onDate, onSlot, slotLabel
}: {
  dates: typeof DATES;
  selectedDate: number;
  selectedSlot: string;
  onDate: (i: number) => void;
  onSlot: (s: string) => void;
  slotLabel?: string;
}) {
  return (
    <div style={{ paddingBottom: 4 }}>
      {/* Date chips — horizontal scroll */}
      <div style={{
        display: "flex", gap: 8, padding: "0 16px 12px",
        overflowX: "auto" as const, scrollbarWidth: "none" as const
      }}>
        {dates.map((d, i) => (
          <button key={i} onClick={() => { onDate(i); onSlot(""); }} style={{
            flexShrink: 0, padding: "9px 14px", borderRadius: 12, border: "none",
            background: selectedDate === i ? TEXT : BG,
            color: selectedDate === i ? "#fff" : TEXT,
            cursor: "pointer", textAlign: "center" as const,
            boxShadow: selectedDate === i ? "0 2px 8px rgba(0,0,0,0.15)" : "none"
          }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{d.label}</div>
            <div style={{ fontSize: 11, color: selectedDate === i ? "rgba(255,255,255,0.7)" : MUTED, marginTop: 2 }}>{d.sub}</div>
          </button>
        ))}
      </div>

      {/* Time slot label */}
      <div style={{ padding: "0 16px 8px" }}>
        <span style={{ color: MUTED, fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase" as const }}>
          {slotLabel ?? "Pick a time"}
        </span>
      </div>

      {/* Time slots — 3-column wrap */}
      <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8, padding: "0 16px 12px" }}>
        {dates[selectedDate].slots.map((slot) => (
          <button key={slot} onClick={() => onSlot(slot)} style={{
            padding: "9px 0", borderRadius: 10, border: "none",
            width: "calc(33.33% - 6px)",
            background: selectedSlot === slot ? BLUE : BG,
            color: selectedSlot === slot ? "#fff" : TEXT,
            fontSize: 13, fontWeight: 600, cursor: "pointer",
            boxShadow: selectedSlot === slot ? `0 2px 8px rgba(64,192,242,0.3)` : "none"
          }}>
            {slot}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Express() {
  const [fulfillment, setFulfillment] = useState<Fulfillment>("pickup");
  const [timing, setTiming] = useState<Timing>("now");
  const [payMethod, setPayMethod] = useState<PayMethod>("apple");
  const [usePoints, setUsePoints] = useState(false);
  const [pointsToUse, setPointsToUse] = useState(240);
  const [pointsInput, setPointsInput] = useState("240");
  const [editingPoints, setEditingPoints] = useState(false);
  const [useFreeCoffee, setUseFreeCoffee] = useState(false);
  const pointsInputRef = useRef<HTMLInputElement>(null);

  const TOTAL_POINTS = 240;
  const POINT_VALUE = 0.01;
  const POINTS_STEP = 1;

  function commitPointsInput(raw: string) {
    const n = parseInt(raw, 10);
    const clamped = isNaN(n) ? 1 : Math.min(TOTAL_POINTS, Math.max(1, n));
    setPointsToUse(clamped);
    setPointsInput(String(clamped));
    setEditingPoints(false);
  }

  // Pickup schedule state
  const [pickupDateIdx, setPickupDateIdx] = useState(0);
  const [pickupSlot, setPickupSlot] = useState("");

  // Delivery date state
  const [delivDateIdx, setDelivDateIdx] = useState(0);
  const [delivSlot, setDelivSlot] = useState("");

  const subtotal = 26.50;
  const deliveryFee = fulfillment === "delivery" ? 5.00 : 0;
  const discount = usePoints ? pointsToUse * POINT_VALUE : 0;
  const coffeeDiscount = useFreeCoffee ? 5.50 : 0;
  const total = (subtotal + deliveryFee - discount - coffeeDiscount).toFixed(2);

  const items = [
    { name: "Double Choc Cookie", qty: 2, price: 17.00 },
    { name: "Flat White", qty: 1, price: 5.50 },
    { name: "Salted Caramel Cookie", qty: 1, price: 4.00 },
  ];

  // Summary line for chosen schedule
  const pickupSummary = pickupSlot
    ? `${DATES[pickupDateIdx].label} ${DATES[pickupDateIdx].sub} · ${pickupSlot}`
    : null;
  const delivSummary = delivSlot
    ? `${DELIVERY_DATES[delivDateIdx].label} ${DELIVERY_DATES[delivDateIdx].sub} · ${delivSlot}`
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "#d4d4d4", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 0" }}>
      <div style={{
        width: 390, height: 844, background: BG, borderRadius: 48,
        overflow: "hidden",
        boxShadow: "0 40px 80px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(0,0,0,0.06)",
        display: "flex", flexDirection: "column",
        fontFamily: "-apple-system, 'SF Pro Text', sans-serif"
      }}>
        <StatusBar />

        {/* Header */}
        <div style={{ background: CARD, paddingBottom: 12, borderBottom: `1px solid ${BORDER}` }}>
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
        <div style={{ flex: 1, overflowY: "auto", background: BG }}>

          {/* ORDER */}
          <SecLabel label="Your Order" />
          <div style={{ background: CARD, margin: "0 16px", borderRadius: 14, border: `1px solid ${BORDER}` }}>
            {items.map((item, i) => (
              <div key={i}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: BG, border: `1px solid ${BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 12, color: MUTED, fontWeight: 700 }}>{item.qty}×</span>
                    </div>
                    <span style={{ color: TEXT, fontSize: 15 }}>{item.name}</span>
                  </div>
                  <span style={{ color: TEXT, fontSize: 15, fontWeight: 500 }}>AUD {item.price.toFixed(2)}</span>
                </div>
                {i < items.length - 1 && <RowDiv />}
              </div>
            ))}
          </div>

          {/* DELIVERY */}
          <SecLabel label="Delivery" />
          <div style={{ margin: "0 16px" }}>
            {/* Toggle */}
            <div style={{ display: "flex", padding: 5, gap: 4, background: BORDER, borderRadius: 14, marginBottom: 8 }}>
              {(["pickup", "delivery"] as const).map((type) => (
                <button key={type} onClick={() => setFulfillment(type)} style={{
                  flex: 1, padding: "9px 0", borderRadius: 10, border: "none",
                  background: fulfillment === type ? CARD : "transparent",
                  color: fulfillment === type ? TEXT : MUTED,
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                  boxShadow: fulfillment === type ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  transition: "all 0.15s"
                }}>
                  {type === "pickup" ? <Store size={14} /> : <MapPin size={14} />}
                  {type === "pickup" ? "Pickup · Free" : "Delivery · $5.00"}
                </button>
              ))}
            </div>

            <div style={{ background: CARD, borderRadius: 14, border: `1px solid ${BORDER}`, overflow: "hidden" }}>

              {/* PICKUP */}
              {fulfillment === "pickup" && (
                <>
                  <div style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 10, background: "#EFF9FF", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <MapPin size={17} color={BLUE} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ color: TEXT, fontSize: 15, fontWeight: 700, margin: 0 }}>Cookie Corner</p>
                        <p style={{ color: MUTED, fontSize: 13, margin: "2px 0 0" }}>420 Crown St, Surry Hills NSW</p>
                        <span style={{ display: "inline-flex", alignItems: "center", marginTop: 6, padding: "3px 9px", borderRadius: 6, background: GREEN_BG, color: GREEN, fontSize: 11, fontWeight: 700 }}>Open · Closes 5pm</span>
                      </div>
                      <ChevronRight size={16} color={MUTED} />
                    </div>
                  </div>

                  <RowDiv />

                  {/* Now / Schedule */}
                  <div style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 8 }}>
                      {(["now", "schedule"] as const).map((t) => (
                        <button key={t} onClick={() => setTiming(t)} style={{
                          flex: 1, padding: "9px 0", borderRadius: 10,
                          border: `1.5px solid ${timing === t ? BLUE : BORDER}`,
                          background: timing === t ? "#EFF9FF" : "transparent",
                          color: timing === t ? BLUE : MUTED,
                          fontSize: 14, fontWeight: 600, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center", gap: 6
                        }}>
                          {t === "now" ? <Zap size={14} /> : <Calendar size={14} />}
                          {t === "now" ? "Now" : "Schedule"}
                        </button>
                      ))}
                    </div>

                    {timing === "now" && (
                      <p style={{ color: MUTED, fontSize: 12, margin: "8px 0 0", textAlign: "center" as const }}>
                        Ready in approx 5–10 minutes
                      </p>
                    )}
                  </div>

                  {/* Date/time picker — expands when Schedule selected */}
                  {timing === "schedule" && (
                    <>
                      <div style={{ height: 1, background: BORDER }} />
                      {/* Chosen summary pill */}
                      {pickupSummary && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "#EFF9FF", borderBottom: `1px solid ${BORDER}` }}>
                          <Calendar size={14} color={BLUE} />
                          <span style={{ color: BLUE, fontSize: 14, fontWeight: 600 }}>{pickupSummary}</span>
                          <button onClick={() => { setPickupSlot(""); }} style={{ marginLeft: "auto", color: MUTED, background: "none", border: "none", fontSize: 12, cursor: "pointer" }}>
                            Change
                          </button>
                        </div>
                      )}
                      <div style={{ paddingTop: 12 }}>
                        <DateTimePicker
                          dates={DATES}
                          selectedDate={pickupDateIdx}
                          selectedSlot={pickupSlot}
                          onDate={setPickupDateIdx}
                          onSlot={setPickupSlot}
                          slotLabel="Pick a time"
                        />
                      </div>
                    </>
                  )}
                </>
              )}

              {/* DELIVERY */}
              {fulfillment === "delivery" && (
                <>
                  <div style={{ padding: "14px 16px 10px" }}>
                    <div style={{ display: "flex", alignItems: "center", padding: "11px 14px", background: BG, borderRadius: 10, border: `1px solid ${BORDER}`, gap: 10 }}>
                      <MapPin size={16} color={BLUE} />
                      <span style={{ color: TEXT, fontSize: 14, flex: 1 }}>12 George St, Sydney NSW 2000</span>
                      <ChevronRight size={14} color={MUTED} />
                    </div>
                  </div>

                  <div style={{ height: 1, background: BORDER }} />

                  <div style={{ padding: "12px 16px 4px" }}>
                    <p style={{ color: TEXT, fontSize: 14, fontWeight: 600, margin: "0 0 10px" }}>Choose a delivery date</p>
                  </div>

                  {/* Chosen date summary */}
                  {delivSlot && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "#EFF9FF", borderBottom: `1px solid ${BORDER}` }}>
                      <Calendar size={14} color={BLUE} />
                      <span style={{ color: BLUE, fontSize: 14, fontWeight: 600 }}>
                        {DELIVERY_DATES[delivDateIdx].label} {DELIVERY_DATES[delivDateIdx].sub}
                      </span>
                      <button onClick={() => setDelivSlot("")} style={{ marginLeft: "auto", color: MUTED, background: "none", border: "none", fontSize: 12, cursor: "pointer" }}>
                        Change
                      </button>
                    </div>
                  )}

                  {/* Date chips only — no time slots */}
                  <div style={{ display: "flex", gap: 8, padding: "12px 16px 4px", overflowX: "auto" as const, scrollbarWidth: "none" as const }}>
                    {DELIVERY_DATES.map((d, i) => (
                      <button key={i} onClick={() => { setDelivDateIdx(i); setDelivSlot(d.sub); }} style={{
                        flexShrink: 0, padding: "9px 14px", borderRadius: 12, border: "none",
                        background: delivDateIdx === i && delivSlot ? TEXT : BG,
                        color: delivDateIdx === i && delivSlot ? "#fff" : TEXT,
                        cursor: "pointer", textAlign: "center" as const,
                        boxShadow: delivDateIdx === i && delivSlot ? "0 2px 8px rgba(0,0,0,0.15)" : "none"
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{d.label}</div>
                        <div style={{ fontSize: 11, color: delivDateIdx === i && delivSlot ? "rgba(255,255,255,0.7)" : MUTED, marginTop: 2 }}>{d.sub}</div>
                      </button>
                    ))}
                  </div>

                  <p style={{ color: MUTED, fontSize: 12, padding: "6px 16px 14px", margin: 0 }}>
                    Delivered between 8am and 5pm · AUD 5.00 flat fee
                  </p>
                </>
              )}
            </div>
          </div>

          {/* USE REWARDS */}
          <SecLabel label="Use Rewards" />
          <div style={{ background: CARD, margin: "0 16px", borderRadius: 14, border: `1px solid ${BORDER}`, overflow: "hidden" }}>
            {/* Points row */}
            <div style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: usePoints ? "#EFF9FF" : BG, border: `1.5px solid ${usePoints ? BLUE : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <Star size={17} color={usePoints ? BLUE : MUTED} fill={usePoints ? BLUE : "none"} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ color: TEXT, fontSize: 15, fontWeight: 600, margin: 0 }}>
                    {TOTAL_POINTS} points available
                  </p>
                  <p style={{ color: MUTED, fontSize: 12, margin: "2px 0 0" }}>
                    Worth AUD {(TOTAL_POINTS * POINT_VALUE).toFixed(2)} · 1 pt = AUD 0.01
                  </p>
                </div>
                {!usePoints && (
                  <button onClick={() => { setUsePoints(true); setPointsToUse(TOTAL_POINTS); }} style={{
                    padding: "7px 16px", borderRadius: 20, border: "none",
                    background: BG, color: TEXT, fontSize: 13, fontWeight: 700, cursor: "pointer",
                    flexShrink: 0
                  }}>
                    Use
                  </button>
                )}
              </div>

              {/* Stepper — expands after tapping Use */}
              {usePoints && (
                <div style={{ marginTop: 12 }}>
                  {/* Stepper control */}
                  <div style={{ display: "flex", alignItems: "center", gap: 0, background: BG, borderRadius: 14, border: `1.5px solid ${BLUE}`, overflow: "hidden" }}>
                    <button
                      onClick={() => setPointsToUse(Math.max(POINTS_STEP, pointsToUse - POINTS_STEP))}
                      style={{ width: 52, height: 52, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                    >
                      <span style={{ fontSize: 26, color: pointsToUse <= POINTS_STEP ? BORDER : BLUE, fontWeight: 300, lineHeight: 1 }}>−</span>
                    </button>

                    {/* Tappable centre — tap to type */}
                    <div
                      onClick={() => {
                        setEditingPoints(true);
                        setPointsInput(String(pointsToUse));
                        setTimeout(() => pointsInputRef.current?.select(), 30);
                      }}
                      style={{ flex: 1, textAlign: "center" as const, padding: "6px 0", cursor: "text" }}
                    >
                      {editingPoints ? (
                        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 2 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                            <input
                              ref={pointsInputRef}
                              autoFocus
                              inputMode="numeric"
                              value={pointsInput}
                              onChange={e => setPointsInput(e.target.value.replace(/\D/g, ""))}
                              onBlur={() => commitPointsInput(pointsInput)}
                              onKeyDown={e => { if (e.key === "Enter") commitPointsInput(pointsInput); if (e.key === "Escape") { setEditingPoints(false); setPointsInput(String(pointsToUse)); } }}
                              style={{
                                width: 72, textAlign: "center" as const, fontSize: 17, fontWeight: 700,
                                color: TEXT, border: "none", outline: "none", background: "transparent",
                                caretColor: BLUE, borderBottom: `2px solid ${BLUE}`, padding: "2px 0"
                              }}
                            />
                            <span style={{ fontSize: 14, color: MUTED, fontWeight: 500 }}>pts</span>
                          </div>
                          <p style={{ color: GREEN, fontSize: 12, fontWeight: 600, margin: 0 }}>
                            −AUD {((parseInt(pointsInput || "0", 10) || 0) * POINT_VALUE).toFixed(2)} off
                          </p>
                        </div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                            <span style={{ color: TEXT, fontSize: 17, fontWeight: 700 }}>{pointsToUse}</span>
                            <span style={{ fontSize: 12, color: MUTED, fontWeight: 500 }}>pts</span>
                          </div>
                          <p style={{ color: GREEN, fontSize: 12, fontWeight: 600, margin: "1px 0 0" }}>
                            −AUD {(pointsToUse * POINT_VALUE).toFixed(2)} off
                          </p>
                          <p style={{ color: MUTED, fontSize: 10, margin: "2px 0 0", letterSpacing: 0.2 }}>tap to edit</p>
                        </div>
                      )}
                    </div>

                    <button
                      onClick={() => setPointsToUse(Math.min(TOTAL_POINTS, pointsToUse + POINTS_STEP))}
                      style={{ width: 52, height: 52, background: "transparent", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                    >
                      <span style={{ fontSize: 26, color: pointsToUse >= TOTAL_POINTS ? BORDER : BLUE, fontWeight: 300, lineHeight: 1 }}>+</span>
                    </button>
                  </div>

                  {/* Progress track */}
                  <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: BORDER, overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, background: BLUE, width: `${(pointsToUse / TOTAL_POINTS) * 100}%`, transition: "width 0.15s" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
                    <span style={{ color: MUTED, fontSize: 11 }}>1 min</span>
                    <span style={{ color: MUTED, fontSize: 11 }}>{TOTAL_POINTS} max</span>
                  </div>

                  {/* Remove button — prominent, below stepper */}
                  <button
                    onClick={() => { setUsePoints(false); setPointsToUse(TOTAL_POINTS); }}
                    style={{
                      marginTop: 10, width: "100%", padding: "9px 0", borderRadius: 10,
                      background: "transparent", border: `1.5px solid ${BORDER}`,
                      color: MUTED, fontSize: 13, fontWeight: 600, cursor: "pointer"
                    }}
                  >
                    Remove points
                  </button>
                </div>
              )}
            </div>
            <RowDiv />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, background: useFreeCoffee ? "#EFF9FF" : BG, border: `1.5px solid ${useFreeCoffee ? BLUE : BORDER}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Coffee size={17} color={useFreeCoffee ? BLUE : MUTED} />
                </div>
                <div>
                  <p style={{ color: TEXT, fontSize: 15, fontWeight: 600, margin: 0 }}>Free coffee</p>
                  <p style={{ color: MUTED, fontSize: 12, margin: "2px 0 0" }}>1 available · Flat White AUD 5.50</p>
                </div>
              </div>
              <button onClick={() => setUseFreeCoffee(!useFreeCoffee)} style={{
                padding: "7px 16px", borderRadius: 20, border: "none",
                background: useFreeCoffee ? BLUE : BG, color: useFreeCoffee ? "#fff" : TEXT,
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 5
              }}>
                {useFreeCoffee ? <><Check size={12} /> Applied</> : "Use"}
              </button>
            </div>
            <RowDiv />
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px" }}>
              <Tag size={16} color={MUTED} />
              <input placeholder="Discount code" style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                color: TEXT, fontSize: 15, caretColor: BLUE
              }} />
              <span style={{ color: BLUE, fontSize: 14, fontWeight: 700 }}>Apply</span>
            </div>
          </div>

          {/* PAYMENT */}
          <SecLabel label="Payment" />
          <div style={{ background: CARD, margin: "0 16px", borderRadius: 14, border: `1px solid ${BORDER}`, overflow: "hidden" }}>
            {([
              { id: "apple" as PayMethod, icon: <Apple size={19} />, label: "Apple Pay", sub: "Face ID · instant" },
              { id: "card" as PayMethod, icon: <CreditCard size={18} />, label: "•••• 4242", sub: "Visa · expires 09/27" },
              { id: "counter" as PayMethod, icon: <Package size={17} />, label: "Pay at counter", sub: "When you arrive" },
            ]).map((m, i, arr) => (
              <div key={m.id}>
                <button onClick={() => setPayMethod(m.id)} style={{
                  width: "100%", display: "flex", alignItems: "center", padding: "14px 16px",
                  background: "transparent", border: "none", cursor: "pointer", gap: 14
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 11,
                    background: payMethod === m.id ? "#EFF9FF" : BG,
                    border: `1.5px solid ${payMethod === m.id ? BLUE : BORDER}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, color: payMethod === m.id ? BLUE : MUTED
                  }}>
                    {m.icon}
                  </div>
                  <div style={{ flex: 1, textAlign: "left" as const }}>
                    <p style={{ color: TEXT, fontSize: 15, fontWeight: 600, margin: 0 }}>{m.label}</p>
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
                {i < arr.length - 1 && <RowDiv />}
              </div>
            ))}
          </div>

          {/* TOTAL */}
          <div style={{ margin: "16px 16px 0", padding: "16px", background: CARD, borderRadius: 14, border: `1px solid ${BORDER}` }}>
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
                <span style={{ color: GREEN, fontSize: 14 }}>Rewards saved</span>
                <span style={{ color: GREEN, fontSize: 14 }}>−AUD {(discount + coffeeDiscount).toFixed(2)}</span>
              </div>
            )}
            <div style={{ height: 1, background: BORDER, margin: "10px 0" }} />
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: TEXT, fontSize: 19, fontWeight: 800, letterSpacing: -0.3 }}>Total</span>
              <span style={{ color: TEXT, fontSize: 19, fontWeight: 800 }}>AUD {total}</span>
            </div>
          </div>

          {/* CTA */}
          <div style={{ padding: "16px 16px 36px" }}>
            <button style={{
              width: "100%", padding: "18px 0", borderRadius: 16, border: "none",
              background: payMethod === "apple" ? TEXT : CHERRY,
              color: "#fff", fontSize: 17, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              boxShadow: payMethod === "apple" ? "0 4px 20px rgba(0,0,0,0.25)" : `0 6px 24px rgba(210,0,1,0.3)`
            }}>
              {payMethod === "apple" ? (
                <><Apple size={19} fill="#fff" strokeWidth={0} /> Pay AUD {total}</>
              ) : (
                "Place Order · AUD " + total
              )}
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

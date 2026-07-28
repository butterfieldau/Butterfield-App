import { useState, useEffect } from "react";
import { X, Plus, Minus } from "lucide-react";
import type { Product, CartItem, OptionGroupOption } from "../types";
import { useProductDetail } from "../hooks/useMenu";
import { useApp } from "../context";
import { formatCents, randomId } from "../utils";

interface Props {
  productId: string;
  onClose: () => void;
}

export function ProductSheet({ productId, onClose }: Props) {
  const { addToCart } = useApp();
  const { product, loading } = useProductDetail(productId);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>();
  const [selectedOptions, setSelectedOptions] = useState<Record<string, Set<string>>>({});
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (product?.variants?.length) {
      setSelectedVariantId(product.variants[0].id);
    }
  }, [product]);

  if (loading || !product) {
    return (
      <SheetBase onClose={onClose}>
        <div className="flex items-center justify-center py-24">
          <div className="w-8 h-8 rounded-full border-2 border-[#EDE8E1] border-t-[#D20001] animate-spin" />
        </div>
      </SheetBase>
    );
  }

  const basePrice =
    selectedVariantId && product.variants?.length
      ? (product.variants.find((v) => v.id === selectedVariantId)?.priceCents ??
          product.salePriceCents ??
          product.priceCents ??
          0)
      : (product.salePriceCents ?? product.priceCents ?? 0);

  const optionExtra = Object.entries(selectedOptions).reduce((sum, [groupId, ids]) => {
    const group = product.optionGroups?.find((g) => g.id === groupId);
    let s = 0;
    for (const optionId of ids) {
      s += group?.options.find((o) => o.id === optionId)?.priceCents ?? 0;
    }
    return sum + s;
  }, 0);

  const unitCents = basePrice + optionExtra;

  const canAdd = (() => {
    for (const group of product.optionGroups ?? []) {
      const count = selectedOptions[group.id]?.size ?? 0;
      const min = group.minSelections ?? (group.required ? 1 : 0);
      if (count < min) return false;
    }
    return true;
  })();

  function toggleOption(groupId: string, optionId: string, maxSelections: number) {
    setSelectedOptions((prev) => {
      const current = new Set(prev[groupId] ?? []);
      if (current.has(optionId)) {
        current.delete(optionId);
      } else {
        const effectiveMax = maxSelections <= 0 ? Infinity : maxSelections;
        if (effectiveMax === 1) {
          current.clear();
        } else if (current.size >= effectiveMax) {
          const [first] = current;
          current.delete(first!);
        }
        current.add(optionId);
      }
      return { ...prev, [groupId]: current };
    });
  }

  function handleAdd() {
    if (!canAdd) return;
    const variant = product!.variants?.find((v) => v.id === selectedVariantId);
    const builtOptions = Object.entries(selectedOptions).flatMap(([groupId, ids]) => {
      const group = product!.optionGroups?.find((g) => g.id === groupId)!;
      return [...ids].map((optionId) => {
        const option = group?.options.find((o) => o.id === optionId)!;
        return {
          groupId,
          groupName: group?.name ?? "",
          optionId,
          optionName: option?.name ?? "",
          priceCents: option?.priceCents ?? 0,
        };
      });
    });

    const item: Omit<CartItem, "id"> = {
      productId: product!.id,
      productName: product!.name,
      productImage: product!.images[0] ?? null,
      variantId: selectedVariantId,
      variantName: variant?.name,
      selectedOptions: builtOptions,
      unitCents,
      quantity,
      notes: notes.trim() || undefined,
    };
    addToCart(item);
    onClose();
  }

  const isOnSale =
    product.salePriceCents != null && product.salePriceCents < (product.priceCents ?? Infinity);

  const cta = (
    <div className="flex items-center gap-3">
      {/* Quantity stepper */}
      <div className="flex items-center bg-[#F0EDE8] rounded-xl overflow-hidden shrink-0">
        <button
          onClick={() => setQuantity(Math.max(1, quantity - 1))}
          className="px-3 py-3 text-[#5A5550] active:bg-[#E0DBD4] transition-colors font-bold"
        >
          <Minus size={15} />
        </button>
        <span className="font-bold text-[#1A1A1A] w-7 text-center text-sm">{quantity}</span>
        <button
          onClick={() => setQuantity(quantity + 1)}
          className="px-3 py-3 text-[#5A5550] active:bg-[#E0DBD4] transition-colors font-bold"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Add button */}
      <button
        onClick={handleAdd}
        disabled={!canAdd}
        className={`flex-1 py-3.5 rounded-xl font-bold text-[15px] transition-all ${
          canAdd
            ? "bg-[#D20001] text-white active:scale-[0.98]"
            : "bg-[#EDE8E1] text-[#C0BAB3] cursor-not-allowed"
        }`}
        data-testid="add-to-cart-btn"
      >
        {canAdd
          ? `Add to order · ${formatCents(unitCents * quantity)}`
          : "Select required options"}
      </button>
    </div>
  );

  return (
    <SheetBase onClose={onClose} cta={cta}>
      <div className="px-6 pt-5 pb-4">
        {/* Name & price */}
        <div className="flex items-start justify-between gap-4 mb-2">
          <h2 className="text-[22px] font-bold text-[#1A1A1A] tracking-tight flex-1 leading-tight">
            {product.name}
          </h2>
          <div className="text-right shrink-0 pt-0.5">
            {isOnSale ? (
              <>
                <p className="text-lg font-bold text-[#D20001]">{formatCents(product.salePriceCents!)}</p>
                <p className="text-xs line-through text-[#C0BAB3]">{formatCents(product.priceCents!)}</p>
              </>
            ) : (
              <p className="text-lg font-bold text-[#1A1A1A]">
                {unitCents ? formatCents(unitCents) : "—"}
              </p>
            )}
          </div>
        </div>

        {/* Description */}
        {product.description && (
          <p className="text-[#5A5550] text-sm leading-relaxed mb-5">{product.description}</p>
        )}

        {/* Variants */}
        {(product.variants?.length ?? 0) > 0 && (
          <Section title="Size">
            <div className="flex flex-wrap gap-2">
              {product.variants!.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariantId(v.id)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    selectedVariantId === v.id
                      ? "bg-[#D20001] text-white"
                      : "bg-[#F0EDE8] text-[#5A5550]"
                  }`}
                >
                  {v.name}
                  {v.priceCents ? ` · ${formatCents(v.priceCents)}` : ""}
                </button>
              ))}
            </div>
          </Section>
        )}

        {/* Option groups */}
        {product.optionGroups?.map((group) => {
          const min = group.minSelections ?? (group.required ? 1 : 0);
          const max = group.maxSelections ?? 1;
          const isMulti = max !== 1;
          const selected = selectedOptions[group.id] ?? new Set<string>();
          const count = selected.size;

          let badge = "Optional";
          if (min > 0 && max > 1) badge = `Choose ${min}–${max}`;
          else if (min > 0) badge = "Required";
          else if (max > 1) badge = `Up to ${max}`;

          return (
            <Section key={group.id} title={group.name} badge={badge} required={min > 0}>
              <div className="flex flex-col gap-2">
                {group.options.map((option: OptionGroupOption) => {
                  const isSelected = selected.has(option.id);
                  const atMax = !isSelected && max > 0 && count >= max && !isMulti;
                  return (
                    <button
                      key={option.id}
                      onClick={() => toggleOption(group.id, option.id, max)}
                      disabled={atMax}
                      className={`flex items-center justify-between px-4 py-3.5 rounded-xl text-sm transition-all ${
                        isSelected
                          ? "bg-[#1A1A1A] text-white"
                          : atMax
                          ? "bg-[#F8F5F2] text-[#C0BAB3] cursor-not-allowed"
                          : "bg-[#F0EDE8] text-[#1A1A1A] active:bg-[#E5E0D8]"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-4 h-4 flex items-center justify-center shrink-0 ${
                            isMulti ? "rounded" : "rounded-full"
                          } border-2 ${
                            isSelected ? "border-white bg-white" : "border-[#C0BAB3]"
                          }`}
                        >
                          {isSelected && (
                            <div
                              className={`${isMulti ? "w-2 h-2 rounded-sm" : "w-2 h-2 rounded-full"} bg-[#1A1A1A]`}
                            />
                          )}
                        </div>
                        <span className="font-medium">{option.name}</span>
                      </div>
                      {option.priceCents > 0 && (
                        <span className={`text-xs ${isSelected ? "text-white/70" : "text-[#8A8580]"}`}>
                          +{formatCents(option.priceCents)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Section>
          );
        })}

        {/* Special instructions */}
        <Section title="Special instructions">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Allergies, preferences, or requests…"
            rows={2}
            className="w-full px-4 py-3 border border-[#EDE8E1] rounded-xl text-sm text-[#1A1A1A]
                       placeholder-[#C0BAB3] resize-none focus:outline-none focus:border-[#D20001]
                       bg-white leading-relaxed"
          />
        </Section>
      </div>
    </SheetBase>
  );
}

// ── SheetBase ─────────────────────────────────────────────────────────────────
//
// Locks body scroll on mount so the underlying page stops scrolling while the
// sheet is open. The CTA bar is rendered OUTSIDE the scroll area so it is
// always pinned to the bottom regardless of content length.

function SheetBase({
  children,
  cta,
  onClose,
}: {
  children: React.ReactNode;
  cta?: React.ReactNode;
  onClose: () => void;
}) {
  // Lock body scroll while sheet is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div className="flex-1 bg-black/50 animate-fade-in" onClick={onClose} />

      {/* Sheet panel — flex-col with max height so CTA is never scrolled away */}
      <div
        className="relative bg-white rounded-t-3xl flex flex-col animate-sheet-up"
        style={{
          maxHeight: "92dvh",
          boxShadow: "0 -8px 40px rgba(0,0,0,0.18)",
          // Ensure the panel itself doesn't overflow — inner scroll handles content
          overflow: "hidden",
        }}
        data-testid="product-sheet"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#D8D3CC]" />
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-4 w-8 h-8 rounded-full bg-[#F0EDE8] flex items-center justify-center text-[#5A5550]"
        >
          <X size={15} />
        </button>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overscroll-contain no-scrollbar min-h-0">
          {children}
        </div>

        {/* CTA — always visible, never scrolled */}
        {cta && (
          <div
            className="shrink-0 bg-white border-t border-[#EDE8E1] px-5 py-4"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom, 0px), 16px)" }}
          >
            {cta}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  badge,
  required,
  children,
}: {
  title: string;
  badge?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2.5">
        <h3 className="font-semibold text-[#1A1A1A] text-sm tracking-tight">{title}</h3>
        {badge && (
          <span
            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
              required ? "bg-[#FFF0EC] text-[#E05030]" : "bg-[#F0EDE8] text-[#8A8580]"
            }`}
          >
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

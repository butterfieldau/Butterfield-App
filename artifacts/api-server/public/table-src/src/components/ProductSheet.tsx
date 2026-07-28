import { useState, useEffect } from "react";
import { X, Plus, Minus, ChevronDown, ChevronUp } from "lucide-react";
import type { Product, CartItem, OptionGroupOption } from "../types";
import { useProductDetail } from "../hooks/useMenu";
import { useApp } from "../context";
import { formatCents, dietaryLabel, randomId } from "../utils";

interface Props {
  productId: string;
  onClose: () => void;
}

export function ProductSheet({ productId, onClose }: Props) {
  const { addToCart } = useApp();
  const { product, loading } = useProductDetail(productId);
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>();
  // Multi-select capable: maps groupId → Set of selected optionIds
  const [selectedOptions, setSelectedOptions] = useState<Record<string, Set<string>>>({});
  const [notes, setNotes] = useState("");
  const [showMore, setShowMore] = useState(false);

  // Pre-select first variant when product loads
  useEffect(() => {
    if (product?.variants?.length) {
      setSelectedVariantId(product.variants[0].id);
    }
  }, [product]);

  if (loading || !product) {
    return (
      <SheetBase onClose={onClose}>
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 rounded-full border-2 border-[#e8ddd5] border-t-[#0b70f8] animate-spin" />
        </div>
      </SheetBase>
    );
  }

  const basePrice =
    selectedVariantId && product.variants?.length
      ? (product.variants.find((v) => v.id === selectedVariantId)?.priceCents ?? product.salePriceCents ?? product.priceCents ?? 0)
      : (product.salePriceCents ?? product.priceCents ?? 0);

  const optionExtra = Object.entries(selectedOptions).reduce((sum, [groupId, ids]) => {
    const group = product.optionGroups?.find((g) => g.id === groupId);
    let groupSum = 0;
    for (const optionId of ids) {
      const option = group?.options.find((o) => o.id === optionId);
      groupSum += option?.priceCents ?? 0;
    }
    return sum + groupSum;
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
        // Enforce maxSelections: if single-select (max=1) replace; otherwise respect cap
        const effectiveMax = maxSelections <= 0 ? Infinity : maxSelections;
        if (effectiveMax === 1) {
          current.clear();
        } else if (current.size >= effectiveMax) {
          // Remove oldest (first) entry to make room
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

  const image = product.images[0];
  const isOnSale = product.salePriceCents != null && product.salePriceCents < (product.priceCents ?? Infinity);

  return (
    <SheetBase onClose={onClose}>
      {/* Product image */}
      {image && (
        <div className="relative h-52 -mx-0 overflow-hidden rounded-t-2xl">
          <img src={image} alt={product.name} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="px-5 pt-4 pb-32">
        {/* Name & price */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <h2 className="text-xl font-bold text-gray-900 flex-1">{product.name}</h2>
          <div className="text-right shrink-0">
            {isOnSale ? (
              <>
                <p className="text-lg font-bold text-[#0b70f8]">{formatCents(product.salePriceCents!)}</p>
                <p className="text-sm line-through text-gray-400">{formatCents(product.priceCents!)}</p>
              </>
            ) : (
              <p className="text-lg font-bold text-gray-900">{unitCents ? formatCents(unitCents) : "—"}</p>
            )}
          </div>
        </div>

        {/* Dietary tags */}
        {product.dietaryTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {product.dietaryTags.map((tag) => {
              const { label, color } = dietaryLabel(tag);
              return (
                <span key={tag} className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
                  {label}
                </span>
              );
            })}
          </div>
        )}

        {/* Description */}
        {product.description && (
          <div className="mb-4">
            <p className="text-gray-600 text-sm leading-relaxed">
              {showMore || product.description.length <= 120
                ? product.description
                : product.description.slice(0, 120) + "…"}
            </p>
            {product.description.length > 120 && (
              <button
                onClick={() => setShowMore(!showMore)}
                className="text-xs text-[#0b70f8] font-medium mt-1 flex items-center gap-1"
              >
                {showMore ? <><ChevronUp size={12} /> Less</> : <><ChevronDown size={12} /> More</>}
              </button>
            )}
          </div>
        )}

        {/* Variants */}
        {(product.variants?.length ?? 0) > 0 && (
          <Section title="Size">
            <div className="flex flex-wrap gap-2">
              {product.variants!.map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVariantId(v.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                    selectedVariantId === v.id
                      ? "border-[#0b70f8] bg-[#f0f6ff] text-[#0b70f8]"
                      : "border-gray-200 text-gray-700"
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
            <Section
              key={group.id}
              title={group.name}
              badge={badge}
            >
              <div className="flex flex-col gap-2">
                {group.options.map((option: OptionGroupOption) => {
                  const isSelected = selected.has(option.id);
                  const atMax = !isSelected && max > 0 && count >= max && !isMulti;
                  return (
                    <button
                      key={option.id}
                      onClick={() => toggleOption(group.id, option.id, max)}
                      disabled={atMax}
                      className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 text-sm transition-all ${
                        isSelected
                          ? "border-[#0b70f8] bg-[#f0f6ff]"
                          : atMax
                          ? "border-gray-100 opacity-50"
                          : "border-gray-200"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {/* Checkbox indicator for multi-select, radio for single */}
                        <div className={`w-4 h-4 rounded-${isMulti ? "sm" : "full"} border-2 flex items-center justify-center shrink-0 ${
                          isSelected ? "border-[#0b70f8] bg-[#0b70f8]" : "border-gray-300"
                        }`}>
                          {isSelected && <div className="w-2 h-2 rounded-sm bg-white" />}
                        </div>
                        <span className={`font-medium ${isSelected ? "text-[#0b70f8]" : "text-gray-700"}`}>
                          {option.name}
                        </span>
                      </div>
                      {option.priceCents > 0 && (
                        <span className="text-gray-500">+{formatCents(option.priceCents)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Section>
          );
        })}

        {/* Special notes */}
        <Section title="Special instructions">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Allergies, preferences, or requests…"
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 placeholder-gray-400 resize-none focus:outline-none focus:border-[#0b70f8]"
          />
        </Section>
      </div>

      {/* Fixed bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 py-4 safe-bottom">
        <div className="flex items-center gap-3">
          {/* Quantity */}
          <div className="flex items-center gap-3 bg-gray-100 rounded-xl px-3 py-2">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="text-gray-600 active:scale-90 transition-transform"
            >
              <Minus size={18} />
            </button>
            <span className="font-bold text-gray-900 w-5 text-center">{quantity}</span>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="text-gray-600 active:scale-90 transition-transform"
            >
              <Plus size={18} />
            </button>
          </div>

          {/* Add button */}
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className={`flex-1 py-3 rounded-xl font-bold text-base transition-all ${
              canAdd
                ? "bg-[#0b70f8] text-white active:scale-[0.98]"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {canAdd
              ? `Add to cart · ${formatCents(unitCents * quantity)}`
              : "Select required options"}
          </button>
        </div>
      </div>
    </SheetBase>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SheetBase({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40" onClick={onClose} />
      {/* Sheet */}
      <div
        className="relative bg-white rounded-t-2xl max-h-[92dvh] overflow-y-auto overscroll-contain"
        style={{ boxShadow: "0 -4px 24px rgba(0,0,0,0.12)" }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-4 p-1.5 rounded-full bg-gray-100 text-gray-500"
        >
          <X size={16} />
        </button>
        {children}
      </div>
    </div>
  );
}

function Section({
  title,
  badge,
  children,
}: {
  title: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-2">
        <h3 className="font-semibold text-gray-900 text-sm">{title}</h3>
        {badge && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              badge === "Required"
                ? "bg-red-50 text-red-600"
                : "bg-gray-100 text-gray-500"
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

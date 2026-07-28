import { useState } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { useCategories, useProducts } from "../hooks/useMenu";
import { useApp } from "../context";
import { ProductSheet } from "../components/ProductSheet";
import { CartSheet } from "../components/CartSheet";
import { CartBar } from "../components/CartBar";
import { formatCents, dietaryLabel } from "../utils";
import type { Category, Product } from "../types";

// ── Category visual map ────────────────────────────────────────────────────────

interface CategoryVisual {
  bg: string;
  text: string;
  subtext: string;
  accent: string;
  emoji: string;
}

const FALLBACK_VISUALS: CategoryVisual[] = [
  { bg: "#F7EDD6", text: "#3D1F0A", subtext: "#A07040", accent: "#C17A3A", emoji: "✨" },
  { bg: "#E4EDD8", text: "#1E4020", subtext: "#5A8055", accent: "#5B8C52", emoji: "🌿" },
  { bg: "#EEE0D8", text: "#4A2818", subtext: "#9A6050", accent: "#B07050", emoji: "☕" },
  { bg: "#DDE8F0", text: "#0E3A5A", subtext: "#4A7A9A", accent: "#3A8AC0", emoji: "💧" },
  { bg: "#EDE4F0", text: "#2A1040", subtext: "#7A5090", accent: "#8A60A0", emoji: "🫖" },
];

function getCategoryVisual(slug: string, name: string, index: number): CategoryVisual {
  const key = (slug + " " + name).toLowerCase();

  if (key.includes("cookie") || key.includes("bake") || key.includes("pastry") || key.includes("snack"))
    return { bg: "#F7EDD6", text: "#3D1F0A", subtext: "#A07040", accent: "#C17A3A", emoji: "🍪" };

  if (key.includes("coffee") || key.includes("espresso") || key.includes("latte") || key.includes("flat white") || key.includes("cap"))
    return { bg: "#1C0F07", text: "#F5E6D0", subtext: "#C9A07A", accent: "#E8C87A", emoji: "☕" };

  if (key.includes("matcha"))
    return { bg: "#E4EDD8", text: "#1E4020", subtext: "#5A8055", accent: "#5B8C52", emoji: "🍵" };

  if (key.includes("tea") || key.includes("chai") || key.includes("herbal"))
    return { bg: "#EEE0D8", text: "#4A2818", subtext: "#9A6050", accent: "#B07050", emoji: "🫖" };

  if (key.includes("iced") || key.includes("cold") || key.includes("frappe") || key.includes("smoothie") || key.includes("shake") || key.includes("juice"))
    return { bg: "#DDE8F0", text: "#0E3A5A", subtext: "#4A7A9A", accent: "#3A8AC0", emoji: "🧊" };

  if (key.includes("food") || key.includes("sandwich") || key.includes("toastie") || key.includes("wrap"))
    return { bg: "#F0EDE8", text: "#2A1A0A", subtext: "#8A6A50", accent: "#A07040", emoji: "🥪" };

  // Cycle through fallbacks for unknown categories
  return FALLBACK_VISUALS[index % FALLBACK_VISUALS.length]!;
}

// ── Main screen ────────────────────────────────────────────────────────────────

export function MenuScreen() {
  const { config } = useApp();
  const { categories, loading: catsLoading } = useCategories();
  const { products, loading: prodsLoading, error } = useProducts();
  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const loading = catsLoading || prodsLoading;

  // Products for selected category
  const activeCategory = categories.find((c) => c.id === activeCatId) ?? null;
  const categoryProducts = activeCatId
    ? products.filter(
        (p) => (p.active || p.isSoldOut) && (p.categoryId === activeCatId || p.category === activeCategory?.slug)
      )
    : [];

  if (activeCatId && activeCategory) {
    return (
      <ProductListScreen
        category={activeCategory}
        categoryIndex={categories.findIndex((c) => c.id === activeCatId)}
        products={categoryProducts}
        onBack={() => setActiveCatId(null)}
        onSelectProduct={setSelectedProductId}
        onOpenCart={() => setCartOpen(true)}
        selectedProductId={selectedProductId}
        onCloseProduct={() => setSelectedProductId(null)}
        cartOpen={cartOpen}
        onCloseCart={() => setCartOpen(false)}
      />
    );
  }

  return (
    <div className="min-h-dvh bg-[#FDFCFA] flex flex-col">
      {/* Header */}
      <header className="bg-[#FDFCFA] px-5 pt-4 pb-3 safe-top shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img
              src="/api/static/butterfield-logo.svg"
              alt="Butterfield Cookies"
              className="h-6"
              onError={(e) => {
                const el = e.target as HTMLImageElement;
                el.style.display = "none";
                const parent = el.parentElement;
                if (parent) {
                  const text = document.createElement("span");
                  text.className = "text-base font-bold text-[#1A1A1A] tracking-tight";
                  text.textContent = "Butterfield";
                  parent.appendChild(text);
                }
              }}
            />
          </div>
          <div className="flex items-center gap-2 bg-[#F0EDE8] rounded-full px-3.5 py-1.5">
            <span className="text-xs font-medium text-[#8A8580] uppercase tracking-wide">Table</span>
            <span className="text-sm font-bold text-[#1A1A1A]">{config.tableNumber}</span>
          </div>
        </div>
      </header>

      {/* Hero text */}
      <div className="px-5 pt-2 pb-5 shrink-0">
        <h1 className="text-[32px] font-bold text-[#1A1A1A] tracking-tight leading-tight">
          What would you<br />like today?
        </h1>
      </div>

      {/* Category grid */}
      <main className="flex-1 overflow-y-auto no-scrollbar px-5 pb-8">
        {loading && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className={`rounded-3xl animate-pulse bg-[#EDE8E1] ${i < 2 ? "h-48" : "h-36"}`}
              />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-4xl mb-4">😔</div>
            <p className="font-semibold text-[#1A1A1A]">Couldn't load the menu</p>
            <p className="text-sm text-[#8A8580] mt-1">Ask a staff member for assistance</p>
          </div>
        )}

        {!loading && !error && categories.length > 0 && (
          <CategoryGrid
            categories={categories}
            products={products}
            onSelect={(catId) => setActiveCatId(catId)}
          />
        )}

        {!loading && !error && categories.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-4xl mb-4">🍪</div>
            <p className="font-semibold text-[#1A1A1A]">Menu coming soon</p>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Category grid ─────────────────────────────────────────────────────────────

function CategoryGrid({
  categories,
  products,
  onSelect,
}: {
  categories: Category[];
  products: Product[];
  onSelect: (catId: string) => void;
}) {
  const countFor = (cat: Category) =>
    products.filter(
      (p) => (p.active || p.isSoldOut) && (p.categoryId === cat.id || p.category === cat.slug)
    ).length;

  // Split: first 2 in top row (tall), rest in subsequent rows of 2
  const topTwo = categories.slice(0, 2);
  const rest = categories.slice(2);

  return (
    <div className="flex flex-col gap-3">
      {/* Top row — two tall cards */}
      {topTwo.length > 0 && (
        <div className={`grid gap-3 ${topTwo.length === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
          {topTwo.map((cat, i) => {
            const visual = getCategoryVisual(cat.slug, cat.name, i);
            const count = countFor(cat);
            return (
              <CategoryCard
                key={cat.id}
                cat={cat}
                visual={visual}
                count={count}
                tall
                onSelect={onSelect}
              />
            );
          })}
        </div>
      )}

      {/* Remaining rows — 2 per row */}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {rest.map((cat, i) => {
            const visual = getCategoryVisual(cat.slug, cat.name, i + 2);
            const count = countFor(cat);
            return (
              <CategoryCard
                key={cat.id}
                cat={cat}
                visual={visual}
                count={count}
                tall={false}
                onSelect={onSelect}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function CategoryCard({
  cat,
  visual,
  count,
  tall,
  onSelect,
}: {
  cat: Category;
  visual: CategoryVisual;
  count: number;
  tall: boolean;
  onSelect: (catId: string) => void;
}) {
  const isDark = visual.bg.startsWith("#1") || visual.bg.startsWith("#0") || visual.bg.startsWith("#2");

  return (
    <button
      onClick={() => onSelect(cat.id)}
      className={`relative rounded-3xl overflow-hidden text-left active:scale-[0.96] transition-transform ${
        tall ? "h-52" : "h-40"
      }`}
      style={{ background: visual.bg }}
      data-testid={`category-card-${cat.slug}`}
      aria-label={cat.name}
    >
      {/* Background image if available */}
      {cat.imageUrl && (
        <img
          src={cat.imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover opacity-25"
        />
      )}

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-between p-4">
        {/* Emoji */}
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center"
          style={{ background: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)" }}
        >
          <span className="text-xl leading-none">{visual.emoji}</span>
        </div>

        {/* Name + count */}
        <div>
          {count > 0 && (
            <p
              className="text-[11px] font-semibold uppercase tracking-widest mb-1"
              style={{ color: visual.subtext }}
            >
              {count} item{count !== 1 ? "s" : ""}
            </p>
          )}
          <h2
            className="font-bold tracking-tight leading-none"
            style={{
              color: visual.text,
              fontSize: tall ? "22px" : "18px",
            }}
          >
            {cat.name.toUpperCase()}
          </h2>
        </div>
      </div>
    </button>
  );
}

// ── Product list screen (shown when a category is selected) ───────────────────

interface ProductListProps {
  category: Category;
  categoryIndex: number;
  products: Product[];
  onBack: () => void;
  onSelectProduct: (id: string) => void;
  onOpenCart: () => void;
  selectedProductId: string | null;
  onCloseProduct: () => void;
  cartOpen: boolean;
  onCloseCart: () => void;
}

function ProductListScreen({
  category,
  categoryIndex,
  products,
  onBack,
  onSelectProduct,
  onOpenCart,
  selectedProductId,
  onCloseProduct,
  cartOpen,
  onCloseCart,
}: ProductListProps) {
  const [search, setSearch] = useState("");
  const visual = getCategoryVisual(category.slug, category.name, categoryIndex);
  const isDark = visual.bg.startsWith("#1") || visual.bg.startsWith("#0") || visual.bg.startsWith("#2");

  const filtered = products.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q);
  });

  return (
    <div className="min-h-dvh bg-[#FDFCFA] flex flex-col animate-slide-in-right">
      {/* Category header */}
      <header
        className="shrink-0 safe-top"
        style={{ background: visual.bg }}
      >
        <div className="px-5 pt-4 pb-5">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 mb-5"
            style={{ color: isDark ? "rgba(255,255,255,0.6)" : visual.subtext }}
          >
            <ArrowLeft size={17} strokeWidth={2.5} />
            <span className="text-sm font-medium">Menu</span>
          </button>
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
              style={{ background: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)" }}
            >
              {visual.emoji}
            </div>
            <h1
              className="text-[26px] font-bold tracking-tight"
              style={{ color: visual.text }}
            >
              {category.name}
            </h1>
          </div>

          {/* Search */}
          <div className="relative mt-4">
            <Search
              size={14}
              className="absolute left-3.5 top-1/2 -translate-y-1/2"
              style={{ color: isDark ? "rgba(255,255,255,0.4)" : visual.subtext }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${category.name.toLowerCase()}…`}
              className="w-full pl-9 pr-9 py-2.5 rounded-xl text-sm focus:outline-none"
              style={{
                background: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)",
                color: visual.text,
              }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
                style={{ color: visual.subtext }}
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Product list */}
      <main className="flex-1 overflow-y-auto no-scrollbar px-5 py-5 pb-28">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-3xl mb-3">{search ? "🔍" : "🍪"}</p>
            <p className="font-semibold text-[#1A1A1A]">
              {search ? "Nothing found" : "No items here yet"}
            </p>
            {search && (
              <p className="text-sm text-[#8A8580] mt-1">Try a different search term</p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {filtered.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onSelect={() => onSelectProduct(product.id)}
            />
          ))}
        </div>
      </main>

      {/* Modals */}
      {selectedProductId && (
        <ProductSheet productId={selectedProductId} onClose={onCloseProduct} />
      )}
      {cartOpen && <CartSheet onClose={onCloseCart} />}

      <CartBar onOpen={onOpenCart} />
    </div>
  );
}

// ── Product card ───────────────────────────────────────────────────────────────

function ProductCard({ product, onSelect }: { product: Product; onSelect: () => void }) {
  const image = product.images[0];
  const price = product.salePriceCents ?? product.priceCents;
  const isOnSale = product.salePriceCents != null && product.salePriceCents < (product.priceCents ?? Infinity);
  const soldOut = product.isSoldOut || !product.active;

  return (
    <button
      onClick={onSelect}
      disabled={soldOut}
      className={`flex items-center gap-4 bg-white rounded-2xl p-3.5 text-left transition-all active:scale-[0.98] ${
        soldOut ? "opacity-50" : ""
      }`}
      style={{ boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}
      data-testid={`product-card-${product.id}`}
    >
      {/* Image */}
      {image ? (
        <div className="relative shrink-0">
          <img
            src={image}
            alt={product.name}
            className="w-[72px] h-[72px] rounded-xl object-cover"
          />
          {soldOut && (
            <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center">
              <span className="text-[10px] font-bold text-[#8A8580] uppercase tracking-wide">Sold out</span>
            </div>
          )}
        </div>
      ) : (
        <div className="w-[72px] h-[72px] rounded-xl bg-[#F0EDE8] flex items-center justify-center shrink-0">
          <span className="text-2xl">🍪</span>
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[#1A1A1A] text-[15px] leading-tight">{product.name}</p>
        {product.description && (
          <p className="text-xs text-[#8A8580] mt-1 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        )}

        {/* Dietary tags */}
        {product.dietaryTags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {product.dietaryTags.slice(0, 3).map((tag) => {
              const { label } = dietaryLabel(tag);
              return (
                <span
                  key={tag}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[#F0EDE8] text-[#8A6050]"
                >
                  {label}
                </span>
              );
            })}
          </div>
        )}

        {/* Price */}
        <div className="flex items-center gap-2 mt-1.5">
          {price != null && (
            isOnSale ? (
              <>
                <span className="font-bold text-[#C17A3A] text-sm">{formatCents(product.salePriceCents!)}</span>
                <span className="text-xs line-through text-[#C0BAB3]">{formatCents(product.priceCents!)}</span>
              </>
            ) : (
              <span className="font-bold text-[#1A1A1A] text-sm">{formatCents(price)}</span>
            )
          )}
        </div>
      </div>

      {/* Add indicator */}
      {!soldOut && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-[#1A1A1A] flex items-center justify-center">
          <span className="text-white text-lg font-light leading-none">+</span>
        </div>
      )}
    </button>
  );
}

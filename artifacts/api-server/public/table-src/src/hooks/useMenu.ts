import { useState, useEffect } from "react";
import type { Category, Product } from "../types";
import { apiUrl } from "../utils";

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(apiUrl("/products/categories"))
      .then((r) => r.json())
      .then((data) => setCategories(data.data ?? []))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  }, []);

  return { categories, loading };
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(apiUrl("/products"))
      .then((r) => r.json())
      .then((data) => setProducts(data.data ?? []))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return { products, loading, error };
}

export function useProductDetail(productId: string | null) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) {
      setProduct(null);
      return;
    }
    setLoading(true);
    fetch(apiUrl(`/products/${productId}`))
      .then((r) => r.json())
      .then((data) => setProduct(data.data ?? null))
      .catch(() => setProduct(null))
      .finally(() => setLoading(false));
  }, [productId]);

  return { product, loading };
}

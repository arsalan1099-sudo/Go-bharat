import AsyncStorage from "@react-native-async-storage/async-storage";
import { products as staticProducts } from "@/lib/data";
import { Product } from "@/lib/types";
import { getApiUrl } from "@/lib/query-client";

// Shared product-loading helper for the vendor store screen and the Explore map
// card. Both read/write the same AsyncStorage cache so products appear instantly
// while the network request revalidates in the background.

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400";

export const vendorProductsCacheKey = (vendorId: string) =>
  `gobharat_products_${vendorId}`;

// Returns the cached server products for a vendor, or null when absent/empty.
export async function readCachedVendorProducts(
  vendorId: string,
): Promise<Product[] | null> {
  try {
    const cached = await AsyncStorage.getItem(vendorProductsCacheKey(vendorId));
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return null;
}

// Fetches a vendor's server products (excluding hardcoded/static ones),
// normalizes image URLs, and persists the result to the shared cache.
export async function fetchVendorProducts(
  vendorId: string,
  opts?: { signal?: AbortSignal },
): Promise<Product[]> {
  const res = await fetch(
    new URL(`/api/vendor/products/${vendorId}`, getApiUrl()).toString(),
    opts?.signal ? { signal: opts.signal } : undefined,
  );
  const serverProducts: Product[] = res.ok ? await res.json() : [];
  const hardcodedIds = new Set(
    staticProducts.filter((p) => p.vendorId === vendorId).map((p) => p.id),
  );
  const safeProducts = (Array.isArray(serverProducts) ? serverProducts : [])
    .filter((p) => !hardcodedIds.has(p.id))
    .map((p) => ({
      ...p,
      image:
        p.image && !p.image.startsWith("blob:") ? p.image : FALLBACK_IMAGE,
    }));
  if (safeProducts.length > 0) {
    AsyncStorage.setItem(
      vendorProductsCacheKey(vendorId),
      JSON.stringify(safeProducts),
    ).catch(() => {});
  }
  return safeProducts;
}

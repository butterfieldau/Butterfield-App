/**
 * Universal Link / deep-link path rewrite.
 *
 * When iOS opens a Universal Link it hands Expo Router the full URL as-is.
 * The AASA file advertises /api/table/:storeId/:tableNumber (the QR code URL
 * format), but the in-app route lives at /table/[storeId]/[tableNumber].
 *
 * This module rewrites that prefix so the correct screen opens without any
 * change to the QR code URLs or the AASA configuration.
 */
export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}): string {
  // Expo Router may pass either a full URL or a bare path.
  // Extract just the pathname before matching.
  let pathname = path;
  try {
    const url = new URL(path);
    pathname = url.pathname + url.search + url.hash;
  } catch {
    // Not a valid absolute URL — treat the value as a bare path already.
  }

  // Rewrite /api/table/:storeId/:tableNumber → /table/:storeId/:tableNumber
  const tableMatch = pathname.match(/^\/api\/table\/([^/?#]+)\/([^/?#]+)((?:[/?#].*)?)$/);
  if (tableMatch) {
    const [, storeId, tableNumber, rest = ''] = tableMatch;
    return `/table/${storeId}/${tableNumber}${rest}`;
  }

  return path;
}

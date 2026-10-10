/**
 * Hand-off for a receipt shared into Bari from JazzCash (Android share sheet).
 * The service worker parks it in Cache Storage; /share reads it once and passes it on.
 */
const CACHE = "bari-share";

let pending: { file: Blob | null; text: string | null } | null = null;

export async function readSharedFromCache(): Promise<{ file: Blob | null; text: string | null }> {
  try {
    const cache = await caches.open(CACHE);
    const fileRes = await cache.match("/__shared/receipt");
    const textRes = await cache.match("/__shared/text");
    const file = fileRes ? await fileRes.blob() : null;
    const text = textRes ? await textRes.text() : null;
    await cache.delete("/__shared/receipt");
    await cache.delete("/__shared/text");
    return { file: file && file.size > 0 ? file : null, text };
  } catch {
    return { file: null, text: null };
  }
}

export function stashShared(v: { file: Blob | null; text: string | null }) { pending = v; }

/** Take the stashed receipt (once). */
export function takeShared(): { file: Blob | null; text: string | null } | null {
  const v = pending;
  pending = null;
  return v;
}

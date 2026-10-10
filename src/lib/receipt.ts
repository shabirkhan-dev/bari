import { parseJazzCashReceipt, type ParsedReceipt } from "../domain/receipt";

export const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export const MAX_BYTES = 5 * 1024 * 1024;

export interface PreparedReceipt {
  /** What gets uploaded: images are shrunk to save storage; PDFs go as-is. */
  blob: Blob;
  mime: (typeof ACCEPTED)[number];
  ext: "jpg" | "png" | "webp" | "pdf";
  /** SHA-256 of the ORIGINAL file, so the same receipt can't back two claims. */
  sha256: string;
  previewUrl: string | null;
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/** Downscale a photo/screenshot to at most 1600px tall/wide, as JPEG. */
async function shrink(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return await new Promise<Blob>((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error("Could not read image"))), "image/jpeg", 0.85));
}

export class ReceiptError extends Error {}

export async function prepareReceipt(file: File | Blob): Promise<PreparedReceipt> {
  const type = file.type || "";
  if (!ACCEPTED.includes(type as (typeof ACCEPTED)[number])) throw new ReceiptError("type");
  if (file.size > 25 * 1024 * 1024) throw new ReceiptError("size");
  const sha256 = await sha256Hex(await file.arrayBuffer());
  if (type === "application/pdf") {
    if (file.size > MAX_BYTES) throw new ReceiptError("size");
    return { blob: file, mime: "application/pdf", ext: "pdf", sha256, previewUrl: null };
  }
  const blob = await shrink(file);
  if (blob.size > MAX_BYTES) throw new ReceiptError("size");
  return { blob, mime: "image/jpeg", ext: "jpg", sha256, previewUrl: URL.createObjectURL(blob) };
}

/**
 * Reads amount, transaction ID and time from a receipt image, on the phone.
 * The OCR engine is self-hosted under /ocr and only downloads when first used.
 */
export async function readReceipt(image: Blob): Promise<ParsedReceipt> {
  const { createWorker } = await import("tesseract.js");
  const origin = location.origin;
  const worker = await createWorker("eng", 1, {
    workerPath: `${origin}/ocr/worker.min.js`,
    corePath: `${origin}/ocr/core`,
    langPath: `${origin}/ocr/lang`,
    workerBlobURL: true
  });
  try {
    const { data } = await worker.recognize(image);
    return parseJazzCashReceipt(data.text);
  } finally {
    await worker.terminate();
  }
}

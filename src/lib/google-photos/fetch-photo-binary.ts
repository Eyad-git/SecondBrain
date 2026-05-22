import { googlePhotoDownloadCandidates } from "@/lib/google-photos/token";

const GEMINI_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

function normalizeMime(mime: string | null | undefined): string {
  const raw = (mime ?? "").trim().toLowerCase();
  if (!raw) return "";
  if (raw === "image/jpg") return "image/jpeg";
  return raw;
}

function mimeForGemini(mime: string): string | null {
  const normalized = normalizeMime(mime);
  if (GEMINI_IMAGE_MIMES.has(normalized)) return normalized;
  return null;
}

export async function fetchGooglePhotoBinary(
  mediaUrl: string,
  accessToken: string,
  mimeHint: string | null
): Promise<{ bytes: Uint8Array; mimeType: string } | null> {
  const candidates = googlePhotoDownloadCandidates(mediaUrl);

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      if (!res.ok) continue;

      const contentType = res.headers.get("content-type");
      const fromHeader = normalizeMime(contentType?.split(";")[0] ?? "");
      const fromHint = normalizeMime(mimeHint);
      const resolvedMime = mimeForGemini(fromHeader || fromHint);
      if (!resolvedMime) continue;

      const raw = await res.arrayBuffer();
      if (raw.byteLength === 0 || raw.byteLength > 8 * 1024 * 1024) continue;

      return { bytes: new Uint8Array(raw), mimeType: resolvedMime };
    } catch {
      // try next candidate
    }
  }

  return null;
}

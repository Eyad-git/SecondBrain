export const GOOGLE_PHOTOS_TOKEN_COOKIE = "sb_gp_token";
export const GOOGLE_PHOTOS_TOKEN_STORAGE_KEY = "sb.google-photos.access-token";
export const GOOGLE_PHOTOS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

type StoredGooglePhotosToken = {
  token: string;
  expiresAt: number;
};

export function readStoredGooglePhotosToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(GOOGLE_PHOTOS_TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredGooglePhotosToken>;
    if (typeof parsed.token !== "string" || parsed.token.length === 0) return null;
    const expiresAt =
      typeof parsed.expiresAt === "number" ? parsed.expiresAt : 0;
    if (expiresAt > 0 && Date.now() > expiresAt) {
      window.localStorage.removeItem(GOOGLE_PHOTOS_TOKEN_STORAGE_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

export function writeStoredGooglePhotosToken(token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      GOOGLE_PHOTOS_TOKEN_STORAGE_KEY,
      JSON.stringify({
        token,
        expiresAt: Date.now() + GOOGLE_PHOTOS_TOKEN_TTL_MS,
      } satisfies StoredGooglePhotosToken)
    );
  } catch {
    // ignore quota / private mode
  }
}

export function clearStoredGooglePhotosToken(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(GOOGLE_PHOTOS_TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export async function persistGooglePhotosSession(accessToken: string): Promise<void> {
  const res = await fetch("/api/google-photos/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessToken }),
    credentials: "include",
  });
  if (!res.ok) {
    const json: unknown = await res.json().catch(() => ({}));
    const msg =
      json &&
      typeof json === "object" &&
      "error" in json &&
      typeof (json as { error: unknown }).error === "string"
        ? (json as { error: string }).error
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }
}

export async function fetchGooglePhotosSessionStatus(): Promise<{
  connected: boolean;
}> {
  const res = await fetch("/api/google-photos/session", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) return { connected: false };
  const json: unknown = await res.json().catch(() => ({}));
  return {
    connected: Boolean(
      json &&
        typeof json === "object" &&
        "connected" in json &&
        (json as { connected?: unknown }).connected === true
    ),
  };
}

/** Build download URLs that favor JPEG bytes for multimodal models. */
export function googlePhotoDownloadCandidates(mediaUrl: string): string[] {
  const base = mediaUrl.trim();
  if (!base) return [];
  const withoutParams = base.split("=")[0] ?? base;
  return [
    `${withoutParams}=w1280-h1280`,
    `${withoutParams}=w1280-h1280-jpg`,
    `${withoutParams}=w2048-h2048`,
    base,
  ];
}

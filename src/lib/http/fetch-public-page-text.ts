/** Max downloaded body length (bytes); prevents huge documents in the model/tool path. */
const MAX_BYTES = 600_000;
const FETCH_TIMEOUT_MS = 14_000;
const OUTPUT_TEXT_MAX = 14_000;

function isProbablyPrivateIpv4(host: string): boolean {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false;
  const [aStr, bStr] = host.split(".");
  const a = Number(aStr);
  const b = Number(bStr);
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/** Basic SSRF guard for server-side fetching (not a substitute for a full egress firewall). */
export function assertFetchablePublicUrl(raw: string): URL {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    throw new Error("Invalid URL.");
  }

  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Only HTTP/HTTPS URLs are allowed.");
  }

  const hostname = u.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "0.0.0.0"
  ) {
    throw new Error("Local addresses are blocked.");
  }
  if (isProbablyPrivateIpv4(hostname)) {
    throw new Error("Private IPv4 addresses are blocked.");
  }
  if (hostname === "[::1]" || hostname === "::1") {
    throw new Error("IPv6 loopback is blocked.");
  }
  return u;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** GET a public page and extract a plaintext excerpt suitable for summarization / RAG. */
export async function fetchPublicPageText(rawUrl: string): Promise<{
  url: string;
  fetchedUrl: string;
  contentType?: string;
  bytesRead: number;
  title?: string;
  textExcerpt: string;
  warning?: string;
}> {
  const urlObj = assertFetchablePublicUrl(rawUrl);

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(urlObj.href, {
      redirect: "follow",
      signal: ac.signal,
      headers: {
        "User-Agent": "SecondBrainBot/1.0 (+research; contact app owner)",
        Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.1",
      },
    });

    const fetchedUrl = response.url;
    const contentType = response.headers.get("content-type") ?? undefined;

    if (!response.ok) {
      return {
        url: rawUrl.trim(),
        fetchedUrl,
        contentType,
        bytesRead: 0,
        textExcerpt: "",
        warning: `HTTP ${response.status} ${response.statusText}`,
      };
    }

    const reader = response.body?.getReader();
    if (!reader) {
      return {
        url: rawUrl.trim(),
        fetchedUrl,
        contentType,
        bytesRead: 0,
        textExcerpt: "",
        warning: "No response body stream.",
      };
    }

    const chunks: Uint8Array[] = [];
    let received = 0;
    while (received < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.byteLength === 0) continue;
      const take = Math.min(value.byteLength, MAX_BYTES - received);
      chunks.push(value.subarray(0, take));
      received += take;
      if (take < value.byteLength) break;
    }
    reader.cancel().catch(() => {});

    const raw = Buffer.concat(chunks.map((c) => Buffer.from(c))).toString("utf8");

    let text = raw;

    let title: string | undefined;

    const ctLower = contentType?.toLowerCase() ?? "";

    if (ctLower.includes("application/json")) {
      try {
        const parsed = JSON.parse(raw);
        text = typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2);
      } catch {
        text = raw;
      }
    } else if (
      ctLower.includes("text/html") ||
      fetchedUrl.endsWith(".html") ||
      fetchedUrl.endsWith(".htm")
    ) {
      const tMatch = raw.match(/<title[^>]*>([^<]*)<\/title>/i);
      title = tMatch?.[1]?.replace(/\s+/g, " ")?.trim();
      text = stripHtmlToText(raw);
    }

    text = text.replace(/\u0000/g, "").trim();

    const truncated = text.length > OUTPUT_TEXT_MAX;
    const excerpt = truncated ? `${text.slice(0, OUTPUT_TEXT_MAX)}…` : text;

    return {
      url: rawUrl.trim(),
      fetchedUrl,
      contentType,
      bytesRead: received,
      title,
      textExcerpt: excerpt,
      warning: truncated
        ? "Excerpt truncated to fit model/tool limits."
        : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

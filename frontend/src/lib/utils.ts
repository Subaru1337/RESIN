import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Validates that a URL is safe to be used in an href attribute (prevents javascript: / data: / vbscript: XSS).
 * Only http:, https:, and root-relative URLs are considered safe.
 */
export function sanitizeUrl(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  // Root-relative URLs (e.g. /papers) are safe, but protocol-relative (//evil.com) are not
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return trimmed;
    }
  } catch {
    // Malformed URL
  }
  return undefined;
}

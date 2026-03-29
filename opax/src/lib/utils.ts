import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** API base URL — production goes through nginx (same origin), dev hits port 8000 directly */
export const API_BASE =
  typeof window !== "undefined"
    ? window.location.hostname === "opax.com.au" || window.location.hostname === "www.opax.com.au"
      ? ""  // production: API proxied through nginx at same origin
      : `http://${window.location.hostname}:8000`  // dev/Tailscale: direct to API port
    : "http://localhost:8000";

/** Get the URL for an MP's headshot photo (served from our API, not OpenAustralia). */
export function getPhotoUrl(personId: string | number): string {
  return `${API_BASE}/api/photos/${personId}`;
}

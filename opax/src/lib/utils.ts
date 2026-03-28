import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** API base URL — uses current hostname so it works via Tailscale, localhost, or production */
export const API_BASE =
  typeof window !== "undefined"
    ? `http://${window.location.hostname}:8000`
    : "http://localhost:8000";

/** Get the URL for an MP's headshot photo (served from our API, not OpenAustralia). */
export function getPhotoUrl(personId: string | number): string {
  return `${API_BASE}/api/photos/${personId}`;
}

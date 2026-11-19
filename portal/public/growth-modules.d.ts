// Only what the Worker draws with: the ask block a member's first paint shares with app.js.
export const HELD_QUESTION_HTML: string;
export function askBlockHTML(options?: { name?: string; bill?: { title?: string; short_title?: string; key?: string } | null; questions?: readonly (string | { question: string; label?: string })[]; pageType?: string; seed?: string; held?: number }): string;

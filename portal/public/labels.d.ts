export function tagHTML(label: string, href?: string): string;
export function statusLabelHTML(word: string, tone?: string): string;
export function partyLabelHTML(party: string, options?: { full?: boolean }): string;
export function machineLabelHTML(options?: { note?: string; inline?: boolean; pill?: boolean; className?: string }): string;
export function sourceLineHTML(options?: { updated?: string; dateLabel?: string; source?: string; state?: string; originals?: { href: string; label?: string }[]; asAt?: string; facts?: string[][]; notes?: string[]; licence?: string }): string;
export function moreMenuHTML(items: { href?: string; label: string; detail?: string; action?: string }[], label?: string, options?: { id?: string }): string;

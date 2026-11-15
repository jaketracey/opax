// Copied verbatim from origin/main:portal/wrangler.jsonc, lines 77 and 78.
// Never reword these values.
export const AUTHORISATION_LINE =
  'Authorised by Jake Tracey, Noice Pty Ltd, Level 6, 608/343 Little Collins Street, Melbourne VIC 3000.';
/**
 * The line is Victorian election material: it belongs on Victorian pages
 * only. PageFoot's authorised variant checks this itself.
 */
export function isVictorian(jurisdiction: string | null | undefined): boolean {
  return (jurisdiction ?? '').toLowerCase() === 'vic';
}
export const CORRECTION_CONTACT = 'mailto:corrections@opax.com.au';

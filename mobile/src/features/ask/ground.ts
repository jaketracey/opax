import { designFlags } from '../../design/flags';

/**
 * Ask's ground (journeys/ask.md 4, "Ground for the whole Ask screen"): the
 * grouped `sunken` ground, as `Screen grouped` computes it, so Try asking,
 * Conversations, Records cited and People sit on it as `raised` groups.
 */
export function askGround(): 'sunken' | 'paper' {
  return designFlags.groupedSurfaces ? 'sunken' : 'paper';
}

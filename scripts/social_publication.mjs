// Apply the shared publication boundary before any social catalog reaches disk.
// Grant recipients keep the grants' policy and references; donor metadata and
// program narratives use the same rules as their corresponding public assets.
import {sanitiseDonorAsset, sanitiseGrantDonors} from './withhold_donor_assets.mjs';

export function sanitiseSocialCatalog(file, value, context) {
  if (!['social/grants.json', 'social/programs.json', 'social/grants-largest.json'].includes(file)) {
    throw new Error('Unknown social publication file');
  }
  return (file === 'social/grants-largest.json' ? sanitiseGrantDonors : sanitiseDonorAsset)(value, context);
}

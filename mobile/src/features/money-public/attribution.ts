import type { Dataset } from '../sources/datasets';
import { canonicalUrl } from '../../navigation/external';

// Attribution from the pinned static exports, kept on Sources and licences.
export const publicMoneyDatasets: Dataset[] = [
  {
    id: 'community-funding',
    name: 'Community funding, election margins and verified venues',
    publisher:
      'Department of Infrastructure; Australian Electoral Commission; Centre for Public Integrity; councils and venue operators',
    terms: [
      'OPAX combines the departmental invitation list, GrantConnect awards, the AEC 2025 election seat status fact sheet and the Centre for Public Integrity’s published comparison. Original documents retain their publisher’s copyright and reuse terms; the combined export does not publish one verified licence.',
      'Some venue geometry © OpenStreetMap contributors, ODbL. https://www.openstreetmap.org/copyright',
      'Project locations come from council and venue-operator evidence linked to each checked record. Earlier grants are a selected, sourced sample, not a national total.',
    ],
    links: [
      {
        label: 'Departmental invitation list',
        url: 'https://www.aph.gov.au/-/media/Estimates/rrat/supp2526/Infrastructure_-_December/1_DITRDCSA_response_to_Senator_Canavan_Request.pdf',
      },
      {
        label: 'AEC seat status, 2025 election',
        url: 'https://www.aec.gov.au/media/files/Seat-status-fact-sheet-2025-federal-election.pdf',
      },
      {
        label: 'Centre for Public Integrity',
        url: 'https://publicintegrity.org.au/wp-content/uploads/2026/09/Public-money-political-advantage.pdf',
      },
      {
        label: 'OpenStreetMap copyright',
        url: 'https://www.openstreetmap.org/copyright',
      },
    ],
  },
  {
    id: 'programs-places',
    name: 'Programs and places source connections',
    publisher: 'OPAX; Parliament of Australia; Queensland Government',
    terms: [
      'Connections are derived from the collected Hansard, press release and Queensland grant corpus. Original records retain their own copyright and licence: parliamentary copyright and CC BY-NC-ND terms for Hansard; CC BY 4.0 for Queensland Government Investment Portal expenditure. Press releases retain their publisher’s terms.',
      'Exact unambiguous recorded names and structured source locations. Exact full-name identity decisions retain ABN provenance; unresolved candidates are unpublished.',
    ],
    links: [
      { label: 'Programs and places', url: canonicalUrl('/connections') },
    ],
  },
];

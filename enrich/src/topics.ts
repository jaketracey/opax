// The OPAX topic taxonomy. A straight port of TOPICS in scripts/arag_enrich.py
// (slug, description); the examples are only used by the platform labeler and
// are not part of the prompt the Codex label runner sent. Keep the two lists in
// step: the site filters on /classification.labels/topic/<slug>.

export const TOPICS: ReadonlyArray<readonly [slug: string, description: string]> = [
  ['gambling', 'Gambling, poker machines, casinos, wagering, betting advertising and gambling harm.'],
  ['financial-services', 'Banks, insurance, superannuation, financial regulation and consumer credit.'],
  ['mining-energy', 'Mining, coal, gas, oil, resources projects and energy markets.'],
  ['climate-environment', 'Climate change, emissions targets, renewables, conservation, water and environmental protection.'],
  ['property-construction', 'Property development, construction industry, planning and building regulation.'],
  ['housing', 'Housing affordability, home ownership, rents, social and public housing.'],
  ['health', 'Hospitals, Medicare, aged care, mental health, pharmaceuticals and private health insurance.'],
  ['media-communications', 'Media ownership, broadcasting, journalism, telecommunications and digital platforms.'],
  ['hospitality-alcohol', 'Hotels, clubs, alcohol, liquor licensing and tourism.'],
  ['defence-security', 'Defence, national security, veterans, intelligence and policing.'],
  ['agriculture', 'Farming, live exports, drought, biosecurity and regional industries.'],
  ['unions-workplace', 'Industrial relations, unions, wages, workplace safety and employment conditions.'],
  ['immigration', 'Immigration, asylum seekers, detention, citizenship and multicultural affairs.'],
  ['indigenous-affairs', 'First Nations peoples, reconciliation, native title, Closing the Gap and the Voice.'],
  ['tax-budget', 'Taxation, the budget, GST, deficits and fiscal policy.'],
  ['education', 'Schools, universities, TAFE, childcare and research funding.'],
  ['welfare-social', 'Social security, pensions, disability support, NDIS and community services.'],
  ['integrity-democracy', 'Political integrity, corruption, donations, lobbying, elections and accountability.'],
  ['infrastructure-transport', 'Roads, rail, ports, public transport and infrastructure investment.'],
  ['justice-law', 'Courts, criminal law, civil liberties, consumer law and legal system.'],
  ['foreign-affairs', 'Foreign policy, trade agreements, aid, defence alliances and international relations.'],
]

export const TOPIC_SLUGS: readonly string[] = TOPICS.map((t) => t[0])

/** label_workers.MAX_LABELS: the most topic labels one speech may carry. */
export const MAX_TOPIC_LABELS = 4

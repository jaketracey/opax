/**
 * The page slugs of the 88 districts and 8 regions contested on 28 November 2026.
 * A fixed list with no imports, so IndexNow can refuse any other path without reading
 * an asset. The tests compare it with the VEC source config and the built hub.
 */
export const VIC_ELECTION_SEAT_SLUGS: readonly string[] = [
  // Districts
  'albert-park', 'ashwood', 'bass', 'bayswater', 'bellarine', 'benambra', 'bendigo-east', 'bendigo-west', 'bentleigh',
  'berwick', 'box-hill', 'brighton', 'broadmeadows', 'brunswick', 'bulleen', 'bundoora', 'carrum', 'caulfield',
  'clarinda', 'cranbourne', 'croydon', 'dandenong', 'eildon', 'eltham', 'essendon', 'eureka', 'euroa', 'evelyn',
  'footscray', 'frankston', 'geelong', 'gippsland-east', 'gippsland-south', 'glen-waverley', 'greenvale', 'hastings',
  'hawthorn', 'ivanhoe', 'kalkallo', 'kew', 'kororoit', 'lara', 'laverton', 'lowan', 'macedon', 'malvern',
  'melbourne', 'melton', 'mildura', 'mill-park', 'monbulk', 'mordialloc', 'mornington', 'morwell', 'mulgrave',
  'murray-plains', 'narracan', 'narre-warren-north', 'narre-warren-south', 'nepean', 'niddrie', 'northcote',
  'oakleigh', 'ovens-valley', 'pakenham', 'pascoe-vale', 'point-cook', 'polwarth', 'prahran', 'preston', 'richmond',
  'ringwood', 'ripon', 'rowville', 'sandringham', 'shepparton', 'south-barwon', 'south-west-coast', 'st-albans',
  'sunbury', 'sydenham', 'tarneit', 'thomastown', 'warrandyte', 'wendouree', 'werribee', 'williamstown', 'yan-yean',
  // Regions
  'eastern-victoria', 'north-eastern-metropolitan', 'northern-metropolitan', 'northern-victoria',
  'south-eastern-metropolitan', 'southern-metropolitan', 'western-metropolitan', 'western-victoria',
];

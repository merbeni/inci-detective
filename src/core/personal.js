// Personal relevance: cross the user's skin profile (type + concerns picked in
// onboarding) with the dataset's per-ingredient `concern` flags, so a generic
// risk level becomes "this matters for YOUR skin". 100% local, no AI involved.
//
// Dataset flag vocabulary (from data/cosing-source.json): acne (comedogenic),
// sensitivity (irritant/allergen), dryness (drying), aging.

// Which dataset flags each user concern cares about.
const CONCERN_TO_FLAGS = {
  acne: ['acne'],
  oiliness: ['acne'], // comedogenic ingredients matter for oily skin
  pores: ['acne'],
  sensitivity: ['sensitivity'],
  redness: ['sensitivity'], // irritants drive redness
  dryness: ['dryness'],
  aging: ['aging'],
  'dark-spots': [], // no matching flag in the dataset (yet)
}

// Skin types that imply a concern even if the user didn't tick it.
const SKIN_TO_FLAGS = {
  sensitive: ['sensitivity'],
  dry: ['dryness'],
  oily: ['acne'],
}

// The set of dataset flags relevant to this user. Empty set = no personalization.
export function personalFlagSet(profile) {
  const flags = new Set()
  for (const c of profile?.concerns || []) {
    for (const f of CONCERN_TO_FLAGS[c] || []) flags.add(f)
  }
  for (const f of SKIN_TO_FLAGS[profile?.skinType] || []) flags.add(f)
  return flags
}

// Does this classified item carry any flag the user cares about?
export function isPersonallyRelevant(item, flagSet) {
  if (!flagSet?.size || !item?.concern?.length) return false
  return item.concern.some((f) => flagSet.has(f))
}

export function countPersonalHits(items, flagSet) {
  if (!flagSet?.size) return 0
  let n = 0
  for (const item of items) if (isPersonallyRelevant(item, flagSet)) n++
  return n
}

// INCI lists are ordered by concentration: the first ~5 entries dominate the
// formula, so a flagged ingredient there matters more than one at the tail.
export const TOP_CONCENTRATION_POSITIONS = 5

export function isHighConcentration(item) {
  return item.position > 0 && item.position <= TOP_CONCENTRATION_POSITIONS
}

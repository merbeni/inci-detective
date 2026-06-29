// Iterative Levenshtein edit distance with a two-row buffer (O(min(m,n)) space).
// Small enough to keep in-tree rather than pulling a dependency.
export function levenshtein(a, b) {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // Keep the shorter string as the inner loop for less memory.
  if (a.length > b.length) {
    const tmp = a
    a = b
    b = tmp
  }

  let prev = new Array(a.length + 1)
  let curr = new Array(a.length + 1)
  for (let i = 0; i <= a.length; i++) prev[i] = i

  for (let j = 1; j <= b.length; j++) {
    curr[0] = j
    const bc = b.charCodeAt(j - 1)
    for (let i = 1; i <= a.length; i++) {
      const cost = a.charCodeAt(i - 1) === bc ? 0 : 1
      curr[i] = Math.min(
        prev[i] + 1, // deletion
        curr[i - 1] + 1, // insertion
        prev[i - 1] + cost, // substitution
      )
    }
    const tmp = prev
    prev = curr
    curr = tmp
  }
  return prev[a.length]
}

// Similarity ratio in [0,1] based on edit distance.
export function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1
  return 1 - levenshtein(a, b) / maxLen
}

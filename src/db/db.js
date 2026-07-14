// Local persistence via Dexie.js over IndexedDB — the offline data layer
// from the architecture (sections 1.2 DER / 1.3 stack).
//
// The DER's N:M SCAN_RESULT <-> INGREDIENT relationship (resolved by
// SCAN_INGREDIENT with matched_inci_name, confidence_score and position) is
// stored denormalized as the `items` array inside each scan record.
//
// IndexedDB stays the source of truth on-device (offline-first). When the user
// is signed in, mutations also fire a best-effort push to Supabase via
// src/lib/sync.js — loaded with a dynamic import to avoid a circular dependency
// and so the app works unchanged when no backend is configured.

import Dexie from 'dexie'

export const db = new Dexie('inci-detective')

db.version(1).stores({
  // single row, id = 1
  profile: 'id',
  // SCAN_RESULT — id is a client-generated UUID shared with the cloud row
  scans: 'id, createdAt, overall, synced',
  // WATCHLIST_ITEM
  watchlist: '++id, &norm, addedAt, synced',
  // AI_QUERY
  aiQueries: '++id, scanId, createdAt',
  // cache for the remote-updatable CosIng dataset
  datasetCache: 'key',
})

// v2: on-device product memory — barcode -> ingredient list, filled the first
// time the user enters/OCRs a product's ingredients. Re-scanning that barcode
// later resolves instantly, offline, signed-in or not.
db.version(2).stores({
  products: 'barcode',
})

// Fire-and-forget cloud mirror. No-op when sync/cloud isn't available.
function cloud(method, ...args) {
  import('../lib/sync.js')
    .then((m) => m[method]?.(...args))
    .catch(() => {})
}

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ||
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })

const DEFAULT_PROFILE = {
  id: 1,
  name: '',
  skinType: '',
  concerns: [],
  darkMode: false,
  aiEnabled: false,
  language: '', // '' = auto-detect from the device; 'es' | 'en' when set
  geminiKey: '', // stays local only, never synced to the cloud
  avatar: '', // small JPEG data URL; local only (pushProfile whitelists fields)
  onboarded: false,
  createdAt: null,
}

export async function getProfile() {
  const p = await db.profile.get(1)
  if (p) return p
  const fresh = { ...DEFAULT_PROFILE, createdAt: new Date().toISOString() }
  await db.profile.put(fresh)
  return fresh
}

export async function updateProfile(patch) {
  const current = await getProfile()
  const next = { ...current, ...patch, id: 1 }
  await db.profile.put(next)
  cloud('pushProfile', next)
  return next
}

// Apply a profile coming from the cloud without re-triggering a push.
export async function applyRemoteProfile(patch) {
  const current = await getProfile()
  const next = { ...current, ...patch, id: 1 }
  await db.profile.put(next)
  return next
}

// --- Scans ---------------------------------------------------------------

export async function saveScan(scan) {
  const record = {
    id: scan.id || uuid(),
    barcode: scan.barcode || null,
    productName: scan.productName || 'Unknown product',
    brand: scan.brand || '',
    imageUrl: scan.imageUrl || '',
    source: scan.source || 'barcode', // barcode | ocr | manual | community
    overall: scan.overall,
    summary: scan.summary,
    items: scan.items,
    // 1-100 product score; older records lack it and the UI recomputes from items.
    score: scan.score ?? null,
    rawText: scan.rawText || '', // kept for re-analysis + community contribution
    shareId: scan.shareId || null,
    synced: 0,
    createdAt: scan.createdAt || new Date().toISOString(),
  }
  await db.scans.put(record)
  cloud('pushScan', record)
  // Remember newly entered ingredient lists (typed or via OCR): locally so THIS
  // device resolves the barcode instantly next time, and in the shared community
  // catalogue (best-effort, needs sign-in) so everyone else gets them too.
  if (
    record.barcode &&
    record.rawText &&
    (record.source === 'ocr' || record.source === 'manual')
  ) {
    await db.products.put({
      barcode: record.barcode,
      productName: record.productName,
      brand: record.brand,
      ingredientsText: record.rawText,
      source: record.source,
      updatedAt: record.createdAt,
    })
    cloud('pushProduct', {
      barcode: record.barcode,
      productName: record.productName,
      brand: record.brand,
      ingredientsText: record.rawText,
      source: record.source,
    })
  }
  return record
}

// On-device product memory lookup (see db.version(2)).
export async function getLocalProduct(barcode) {
  if (!barcode) return null
  return db.products.get(barcode)
}

// Insert/update a scan that originated from the cloud (already synced).
// Merged over the existing local record: the cloud row doesn't carry local-only
// fields (rawText), and a plain put() would silently erase them on every sync.
export async function upsertRemoteScan(record) {
  const existing = await db.scans.get(record.id)
  await db.scans.put({ ...existing, ...record, synced: 1 })
}

export async function markScanSynced(id) {
  await db.scans.update(id, { synced: 1 })
}

export async function setScanShare(id, shareId) {
  await db.scans.update(id, { shareId })
}

export async function getScan(id) {
  return db.scans.get(id)
}

export async function listScans() {
  return db.scans.orderBy('createdAt').reverse().toArray()
}

export async function listUnsyncedScans() {
  return db.scans.where('synced').equals(0).toArray()
}

export async function deleteScan(id) {
  await db.scans.delete(id)
  cloud('pushScanDelete', id)
}

// --- Watchlist -----------------------------------------------------------

export async function listWatchlist() {
  return db.watchlist.orderBy('addedAt').reverse().toArray()
}

export async function addWatchlistItem(norm, display) {
  try {
    await db.watchlist.add({
      norm,
      display,
      addedAt: new Date().toISOString(),
      synced: 0,
    })
    cloud('pushWatchlistAdd', { norm, display })
  } catch {
    // unique index violation -> already present, ignore
  }
}

export async function upsertRemoteWatchlistItem(item) {
  try {
    await db.watchlist.add({ ...item, synced: 1 })
  } catch {
    // already present locally, ignore
  }
}

export async function removeWatchlistItem(id) {
  const item = await db.watchlist.get(id)
  await db.watchlist.delete(id)
  if (item) cloud('pushWatchlistRemove', item.norm)
}

export async function watchlistNormSet() {
  const items = await db.watchlist.toArray()
  return new Set(items.map((i) => i.norm))
}

// --- AI queries ----------------------------------------------------------

export async function saveAiQuery(record) {
  return db.aiQueries.add({ ...record, createdAt: new Date().toISOString() })
}

// --- Dataset cache (remote updatable CosIng) -----------------------------

export async function getCachedDataset() {
  return db.datasetCache.get('ingredients')
}

export async function setCachedDataset(meta, ingredients) {
  await db.datasetCache.put({ key: 'ingredients', meta, ingredients })
}

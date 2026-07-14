// Cloud sync layer over Supabase.
//
// Local IndexedDB stays the source of truth (offline-first). These functions
// mirror local state to the cloud and reconcile on login. Every export is a
// safe no-op when cloud isn't configured or the user isn't signed in, so the
// db.js fire-and-forget hooks never need to know about auth state.

import { supabase, isCloudEnabled } from './supabase.js'
import {
  upsertRemoteScan,
  listUnsyncedScans,
  markScanSynced,
  setScanShare,
  upsertRemoteWatchlistItem,
  listWatchlist,
  applyRemoteProfile,
  getProfile,
  getCachedDataset,
  setCachedDataset,
} from '../db/db.js'
import { setDataset, datasetMeta } from '../core/classifier.js'

// ----------------------------------------------------------------- auth
export async function currentUserId() {
  if (!isCloudEnabled) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.user?.id || null
}

export async function getCurrentUser() {
  if (!isCloudEnabled) return null
  const { data } = await supabase.auth.getUser()
  return data.user || null
}

export function onAuthChange(cb) {
  if (!isCloudEnabled) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) =>
    cb(session?.user || null),
  )
  return () => data.subscription.unsubscribe()
}

export async function signUp(email, password) {
  if (!isCloudEnabled) throw new Error('cloud-disabled')
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // The confirmation email must land back on THIS deployment, not the
    // project's default Site URL (which Supabase ships as localhost:3000).
    // The origin must also be allow-listed in Supabase Auth → URL Configuration.
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
  return data.user
}

export async function signIn(email, password) {
  if (!isCloudEnabled) throw new Error('cloud-disabled')
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}

export async function signInWithGoogle() {
  if (!isCloudEnabled) throw new Error('cloud-disabled')
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin, skipBrowserRedirect: true },
  })
  if (error) throw error
  // Probe before leaving the SPA: if the provider isn't enabled on the
  // project, the authorize URL answers a raw 400 JSON page and a straight
  // redirect would strand the user on it. Fail open on network/CORS issues.
  const probe = await fetch(data.url, { redirect: 'manual' }).catch(() => null)
  if (probe && probe.status >= 400) {
    const body = await probe.json().catch(() => ({}))
    throw new Error(body.msg || 'provider is not enabled')
  }
  window.location.assign(data.url)
}

export async function resetPassword(email) {
  if (!isCloudEnabled) throw new Error('cloud-disabled')
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset`,
  })
  if (error) throw error
}

// Requires the recovery session created by the email link (see /auth/reset).
export async function updatePassword(password) {
  if (!isCloudEnabled) throw new Error('cloud-disabled')
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw error
}

export async function signOut() {
  if (!isCloudEnabled) return
  await supabase.auth.signOut()
}

// ------------------------------------------------------------- mappers
const toCloudScan = (r, userId) => ({
  id: r.id,
  user_id: userId,
  barcode: r.barcode,
  product_name: r.productName,
  brand: r.brand,
  image_url: r.imageUrl,
  source: r.source,
  overall: r.overall,
  summary: r.summary,
  items: r.items,
  share_id: r.shareId || null,
  is_public: Boolean(r.shareId),
  created_at: r.createdAt,
})

export const fromCloudScan = (row) => ({
  id: row.id,
  barcode: row.barcode,
  productName: row.product_name,
  brand: row.brand,
  imageUrl: row.image_url,
  source: row.source,
  overall: row.overall,
  summary: row.summary,
  items: row.items,
  shareId: row.share_id,
  createdAt: row.created_at,
})

// ------------------------------------------------------ push hooks (db.js)
export async function pushScan(record) {
  const userId = await currentUserId()
  if (!userId) return
  const { error } = await supabase.from('scans').upsert(toCloudScan(record, userId))
  if (!error) await markScanSynced(record.id)
}

export async function pushScanDelete(id) {
  const userId = await currentUserId()
  if (!userId) return
  await supabase.from('scans').delete().eq('id', id)
}

export async function pushWatchlistAdd({ norm, display }) {
  const userId = await currentUserId()
  if (!userId) return
  await supabase.from('watchlist').upsert({ user_id: userId, norm, display })
}

export async function pushWatchlistRemove(norm) {
  const userId = await currentUserId()
  if (!userId) return
  await supabase.from('watchlist').delete().eq('user_id', userId).eq('norm', norm)
}

export async function pushProfile(profile) {
  const userId = await currentUserId()
  if (!userId) return
  await supabase.from('profiles').upsert({
    id: userId,
    name: profile.name,
    skin_type: profile.skinType,
    concerns: profile.concerns,
    dark_mode: profile.darkMode,
    ai_enabled: profile.aiEnabled,
    updated_at: new Date().toISOString(),
  })
}

// ------------------------------------------------------------- full sync
export async function fullSync() {
  const userId = await currentUserId()
  if (!userId) return { ok: false }

  // 1. Profile — pull cloud, fall back to pushing local on first login.
  const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (prof) {
    await applyRemoteProfile({
      name: prof.name || '',
      skinType: prof.skin_type || '',
      concerns: prof.concerns || [],
      darkMode: prof.dark_mode || false,
      aiEnabled: prof.ai_enabled || false,
    })
  } else {
    await pushProfile(await getProfile())
  }

  // 2. Scans — pull cloud into local, then push local unsynced.
  const { data: cloudScans } = await supabase.from('scans').select('*').eq('user_id', userId)
  for (const row of cloudScans || []) {
    await upsertRemoteScan(fromCloudScan(row))
  }
  const pending = await listUnsyncedScans()
  if (pending.length) {
    const { error } = await supabase
      .from('scans')
      .upsert(pending.map((r) => toCloudScan(r, userId)))
    if (!error) for (const r of pending) await markScanSynced(r.id)
  }

  // 3. Watchlist — union both directions.
  const { data: cloudWatch } = await supabase.from('watchlist').select('*').eq('user_id', userId)
  for (const row of cloudWatch || []) {
    await upsertRemoteWatchlistItem({
      norm: row.norm,
      display: row.display,
      addedAt: row.added_at,
    })
  }
  const localWatch = await listWatchlist()
  const cloudNorms = new Set((cloudWatch || []).map((w) => w.norm))
  const toPush = localWatch.filter((w) => !cloudNorms.has(w.norm))
  if (toPush.length) {
    await supabase
      .from('watchlist')
      .upsert(toPush.map((w) => ({ user_id: userId, norm: w.norm, display: w.display })))
  }

  return { ok: true }
}

// ----------------------------------------- community product catalogue
// A crowd-sourced barcode -> ingredient list, filled in by users when a product
// isn't in Open Beauty Facts. Public read (works signed-out); writes need auth.

const fromCloudProduct = (row) => ({
  barcode: row.barcode,
  productName: row.product_name || '',
  brand: row.brand || '',
  ingredientsText: row.ingredients_text || '',
  source: row.source || 'ocr',
})

// Look up a barcode in our shared catalogue. Returns null (no-op) when cloud is
// off, offline, or the product hasn't been contributed yet.
export async function lookupCommunityProduct(barcode) {
  if (!isCloudEnabled || !barcode) return null
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle()
  if (error || !data || !data.ingredients_text) return null
  return fromCloudProduct(data)
}

// Loose text equality for ingredient lists: OCR/typing noise (case, spacing,
// trailing dots) must not stop two matching scans from counting as agreement.
const normText = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

// Contribute a barcode -> ingredient list to the shared catalogue. Best-effort:
// silently no-ops unless a user is signed in (RLS) and we have real data.
// Anti-clobber (SEC-10): an existing row is never overwritten by a different
// list — a matching scan counts as a confirmation vote instead, and a
// differing one only goes through when this user is the original contributor
// (enforced by RLS; the row's history is archived server-side).
export async function pushProduct({ barcode, productName, brand, ingredientsText, source }) {
  const userId = await currentUserId()
  if (!userId || !barcode || !ingredientsText) return

  const row = {
    barcode,
    product_name: productName || '',
    brand: brand || '',
    ingredients_text: ingredientsText,
    source: source || 'ocr',
    contributed_by: userId,
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await supabase
    .from('products')
    .select('ingredients_text')
    .eq('barcode', barcode)
    .maybeSingle()

  if (!existing) {
    await supabase.from('products').insert(row)
    return
  }
  if (normText(existing.ingredients_text) === normText(ingredientsText)) {
    // Same list — vote for it. No-op if the RPC isn't installed yet.
    await supabase.rpc('confirm_product', { p_barcode: barcode })
    return
  }
  // Different list: attempt the update; RLS rejects it unless this user
  // contributed the row (best-effort, failure is fine).
  const { contributed_by: _own, ...patch } = row
  await supabase.from('products').update(patch).eq('barcode', barcode)
}

// ------------------------------------------------------------- sharing
export async function createShareLink(scanId) {
  const userId = await currentUserId()
  if (!userId) throw new Error('sign-in-required')
  // 12 hex chars (~48 bits). Fallback uses getRandomValues, never Math.random —
  // share ids are capability URLs, so they must not be guessable.
  const shareId = globalThis.crypto?.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : [...crypto.getRandomValues(new Uint8Array(6))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
  const { error } = await supabase
    .from('scans')
    .update({ share_id: shareId, is_public: true })
    .eq('id', scanId)
    .eq('user_id', userId)
  if (error) throw error
  await setScanShare(scanId, shareId)
  return `${window.location.origin}/share/${shareId}`
}

export async function fetchSharedScan(shareId) {
  if (!isCloudEnabled) return null
  // Explicit column list: the "public shared scans" RLS policy exposes the
  // whole row, so select('*') would also leak the sharer's user_id to anyone
  // holding the link.
  const { data, error } = await supabase
    .from('scans')
    .select('id,barcode,product_name,brand,image_url,source,overall,summary,items,share_id,created_at')
    .eq('share_id', shareId)
    .eq('is_public', true)
    .maybeSingle()
  if (error || !data) return null
  return fromCloudScan(data)
}

// -------------------------------------------------- remote updatable dataset
// On startup, load the IndexedDB dataset copy when it's at least as new as the
// shipped one (>=: the static catalogue itself is cached there after its first
// fetch, so this also makes the classifier ready offline without a network hit).
export async function loadCachedDataset() {
  const cached = await getCachedDataset()
  if (cached?.ingredients?.length && cached.meta?.cosing_version >= datasetMeta.version) {
    setDataset(cached.ingredients, cached.meta)
    return cached.meta.cosing_version
  }
  return null
}

// Check the cloud for a newer dataset version and download it if present.
export async function syncDataset() {
  if (!isCloudEnabled) return null
  const { data: meta } = await supabase
    .from('dataset_meta')
    .select('*')
    .eq('id', 1)
    .single()
  if (!meta || !(meta.cosing_version > datasetMeta.version)) return null

  const { data: rows, error } = await supabase.from('ingredients').select('*')
  if (error || !rows?.length) return null

  const ingredients = rows.map((r) => ({
    id: r.id,
    inci: r.inci,
    norm: r.norm,
    common: r.common,
    function: r.function,
    annex: r.annex,
    annexLabel: r.annex_label,
    safety: r.safety,
    concern: r.concern || [],
    note: r.note || '',
  }))
  const newMeta = {
    cosing_version: meta.cosing_version,
    generatedAt: meta.generated_at,
    count: meta.count,
  }
  await setCachedDataset(newMeta, ingredients)
  setDataset(ingredients, newMeta)
  return meta.cosing_version
}

// src/lib/currency.js
// D&D 5e multi-denomination currency system
// cp (copper) → sp (silver) → gp (gold) → pp (platinum)
// 10 cp = 1 sp | 10 sp = 1 gp | 10 gp = 1 pp

export const COIN_LABELS = { cp: 'Copper', sp: 'Silver', gp: 'Gold', pp: 'Platinum' }
export const COIN_ICONS  = { cp: '🟤', sp: '⚪', gp: '🟡', pp: '⬜' }
export const COIN_TO_CP  = { cp: 1, sp: 10, gp: 100, pp: 1000 }

// Migrate a plain gold number to a currency object
export function migrateToCurrency(gold) {
  if (typeof gold === 'object' && gold !== null && 'gp' in gold) return gold
  const g = Number(gold) || 0
  return { cp: 0, sp: 0, gp: g, pp: 0 }
}

// Total value in copper pieces
export function totalInCP(currency) {
  const c = migrateToCurrency(currency)
  return (c.cp || 0) + (c.sp || 0) * 10 + (c.gp || 0) * 100 + (c.pp || 0) * 1000
}

// Add or subtract an amount (in gp, supporting fractions like 0.5)
// Handles automatic denomination math
export function addGold(currency, gpDelta) {
  const c = migrateToCurrency(currency)
  const cpDelta = Math.round(gpDelta * 100) // convert gp to cp
  let total = totalInCP(c) + cpDelta
  if (total < 0) total = 0
  return fromCP(total)
}

// Convert copper pieces back to a neat currency object (greedy: pp → gp → sp → cp)
export function fromCP(totalCP) {
  let remaining = Math.max(0, Math.round(totalCP))
  const pp = Math.floor(remaining / 1000); remaining -= pp * 1000
  const gp = Math.floor(remaining / 100);  remaining -= gp * 100
  const sp = Math.floor(remaining / 10);   remaining -= sp * 10
  const cp = remaining
  return { cp, sp, gp, pp }
}

// Format for display: "15 gp, 3 sp" — skips zeroes
export function formatCurrency(currency) {
  const c = migrateToCurrency(currency)
  const parts = []
  if (c.pp) parts.push(`${c.pp} pp`)
  if (c.gp) parts.push(`${c.gp} gp`)
  if (c.sp) parts.push(`${c.sp} sp`)
  if (c.cp) parts.push(`${c.cp} cp`)
  return parts.length ? parts.join(', ') : '0 gp'
}

// Short compact format for the topbar: "15 gp" (just the most significant)
export function formatCurrencyShort(currency) {
  const c = migrateToCurrency(currency)
  if (c.pp) return `${c.pp} pp ${c.gp ? c.gp + ' gp' : ''}`.trim()
  if (c.gp) return `${c.gp} gp`
  if (c.sp) return `${c.sp} sp`
  return `${c.cp || 0} cp`
}

// Parse a price string like "50 gp" / "5 sp" / "10 cp" → gold equivalent
export function parsePriceToGP(priceStr) {
  if (!priceStr) return 0
  const m = String(priceStr).match(/([\d.]+)\s*(cp|sp|gp|pp)?/i)
  if (!m) return 0
  const amount = parseFloat(m[1])
  const unit   = (m[2] || 'gp').toLowerCase()
  return amount * COIN_TO_CP[unit] / 100  // back to gp
}

// src/combat/spellResolver.js
// Fetches spell data live from Open5e API and interprets it for combat.
// No hardcoded spell dictionary — everything comes from the SRD.

const OPEN5E = 'https://api.open5e.com'

// Simple in-memory cache so repeated casts don't re-fetch
const spellCache = {}

// ── Fetch a spell by name from Open5e ────────────────────────
export async function fetchSpell(spellName) {
  const key = spellName.toLowerCase().trim()
  if (spellCache[key]) return spellCache[key]

  try {
    // Try exact slug first (e.g. "magic-missile")
    const slug = key.replace(/[''']/g, '').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const exactRes = await fetch(`${OPEN5E}/spells/${slug}/?format=json`)
    if (exactRes.ok) {
      const data = await exactRes.json()
      const parsed = parseOpen5eSpell(data)
      spellCache[key] = parsed
      return parsed
    }

    // Fall back to search
    const searchRes = await fetch(`${OPEN5E}/spells/?search=${encodeURIComponent(spellName)}&format=json&limit=5`)
    if (!searchRes.ok) return null
    const searchData = await searchRes.json()
    if (!searchData.results?.length) return null

    // Pick best match (case-insensitive exact name match preferred)
    const results = searchData.results
    const exact = results.find(r => r.name.toLowerCase() === key)
    const best  = exact || results[0]
    const parsed = parseOpen5eSpell(best)
    spellCache[key] = parsed
    return parsed
  } catch (err) {
    console.warn(`[SpellResolver] Could not fetch "${spellName}":`, err.message)
    return null
  }
}

// ── Parse Open5e spell into a combat-ready object ─────────────
// Open5e spell fields: name, level_int, school, casting_time, range,
// components, duration, concentration, ritual, desc, higher_level,
// damage (object), dc (object), area_of_effect, heal_at_slot_level,
// damage_at_character_level, damage_at_slot_level
export function parseOpen5eSpell(raw) {
  if (!raw) return null

  const desc        = raw.desc || ''
  const higherLevel = raw.higher_level || ''
  const level       = raw.level_int ?? 0
  const school      = raw.school?.toLowerCase() || ''
  const castTime    = (raw.casting_time || '').toLowerCase()
  const duration    = (raw.duration || '').toLowerCase()
  const rangeStr    = (raw.range || '').toLowerCase()
  const concentration = raw.concentration === 'yes' || raw.concentration === true
  const ritual        = raw.ritual === 'yes' || raw.ritual === true

  // ── Determine cast timing ─────────────────────────────────
  // bonus action, reaction, or action
  const castAs = castTime.includes('bonus') ? 'bonus'
               : castTime.includes('reaction') ? 'reaction'
               : 'action'

  // ── Determine targeting ───────────────────────────────────
  // AoE: area_of_effect present, or range says "self (X-foot cone/sphere/line)"
  const hasAoE = !!raw.area_of_effect ||
    /cone|sphere|line|cube|cylinder|radius/i.test(rangeStr + ' ' + desc.slice(0, 200))
  // Self-only
  const isSelfRange = rangeStr === 'self' && !hasAoE
  // Touch
  const isTouch = rangeStr.includes('touch')

  // ── Determine damage ─────────────────────────────────────
  // damage_at_slot_level: { "1": "1d6", "2": "2d6", ... }
  // damage_at_character_level: { "1": "1d6", ... }
  // damage.damage_dice: "1d6"
  // damage.damage_type.name: "fire"
  let damageDice = null
  let damageType = null
  let damageAtSlot = {}   // { "1": "1d6", ... }
  let damageAtLevel = {}  // for cantrips

  if (raw.damage) {
    damageDice = raw.damage.damage_dice || null
    damageType = raw.damage.damage_type?.name?.toLowerCase() || null
  }
  if (raw.damage_at_slot_level && Object.keys(raw.damage_at_slot_level).length > 0) {
    damageAtSlot = raw.damage_at_slot_level
  }
  if (raw.damage_at_character_level && Object.keys(raw.damage_at_character_level).length > 0) {
    damageAtLevel = raw.damage_at_character_level
  }

  // ── Determine saving throw ────────────────────────────────
  // dc: { dc_type: { name: "DEX" }, dc_success: "half" }
  let saveStat    = null
  let saveOnHalf  = false
  if (raw.dc) {
    saveStat   = raw.dc.dc_type?.name?.toUpperCase() || null
    saveOnHalf = raw.dc.dc_success?.toLowerCase() === 'half'
  }

  // ── Determine attack roll ─────────────────────────────────
  // Open5e doesn't explicitly say "spell attack" but we can infer:
  // no DC + has damage + not self = likely attack roll
  const isAttackRoll = !saveStat && !!damageDice && !isSelfRange &&
    /ranged spell attack|melee spell attack|make a ranged|make a melee/i.test(desc)

  // ── Healing spells ────────────────────────────────────────
  // heal_at_slot_level: { "1": "1d8", "2": "2d8", ... }
  let healAtSlot = {}
  let isHeal = false
  if (raw.heal_at_slot_level && Object.keys(raw.heal_at_slot_level).length > 0) {
    healAtSlot = raw.heal_at_slot_level
    isHeal = true
  }
  // Also detect healing from description keywords
  if (!isHeal && /regain|restore|heal|hit point/i.test(desc.slice(0, 300)) && !damageDice) {
    isHeal = true
    // Parse dice from description if not in heal_at_slot_level
    const healMatch = desc.match(/(\d*d\d+(?:[+-]\d+)?)\s+hit point/i) ||
                      desc.match(/heals?\s+(?:for\s+)?(\d*d\d+(?:[+-]\d+)?)/i)
    if (healMatch) healAtSlot = { [String(level || 1)]: healMatch[1] }
  }

  // ── Buff / utility spells ─────────────────────────────────
  // Determine type
  let spellType = 'unknown'
  if (isHeal) spellType = 'heal'
  else if (saveStat) spellType = 'save'
  else if (isAttackRoll) spellType = 'attack'
  else if (!damageDice && isSelfRange) spellType = 'buff'
  else if (!damageDice && !saveStat) spellType = 'buff'
  else if (damageDice) spellType = 'save' // has damage but no explicit attack = save

  // Special: Magic Missile — auto-hit darts
  const isMagicMissile = raw.name.toLowerCase() === 'magic missile'
  if (isMagicMissile) spellType = 'dart'

  // Scorching Ray — multi-ray attack
  const isScorchingRay = raw.name.toLowerCase() === 'scorching ray'
  if (isScorchingRay) spellType = 'dart'

  // ── Detect casting stat from class list ───────────────────
  // Open5e has dnd_class field: "Wizard, Sorcerer"
  const classList = (raw.dnd_class || '').toLowerCase()
  let castingStat = 'int' // default
  if (/cleric|druid|ranger/.test(classList)) castingStat = 'wis'
  else if (/bard|paladin|sorcerer|warlock/.test(classList)) castingStat = 'cha'
  else if (/wizard/.test(classList)) castingStat = 'int'

  // ── Status effect inference from damage type + description ─
  const statusEffect = inferStatusEffect(damageType, desc, school)

  // ── Duration in turns ─────────────────────────────────────
  const durationTurns = parseDurationTurns(duration, concentration)

  // ── Range type ────────────────────────────────────────────
  let rangeType = 'single'
  if (hasAoE) rangeType = 'aoe'
  else if (isSelfRange && !isHeal) rangeType = 'self'
  else if (isMagicMissile || isScorchingRay) rangeType = 'dart'

  // ── Dart count ────────────────────────────────────────────
  let dartCount = null
  if (isMagicMissile) {
    // "creates three glowing darts" + 1 per slot above 1st
    dartCount = (slotLevel) => (slotLevel || 1) + 2
  }
  if (isScorchingRay) {
    dartCount = () => 3
  }

  return {
    // Identity
    name:         raw.name,
    slug:         raw.slug,
    level,
    school,
    castAs,
    castingStat,
    concentration,
    ritual,

    // Targeting
    spellType,    // heal | save | attack | buff | dart | unknown
    rangeType,    // single | aoe | self | dart
    isSelfRange,
    isTouch,
    hasAoE,
    targetType: isSelfRange ? 'self' : isHeal ? 'self_or_ally' : hasAoE ? 'all_enemies' : 'enemy',

    // Damage
    damageDice,
    damageType,
    damageAtSlot,
    damageAtLevel,
    saveOnHalf,

    // Save
    saveStat,

    // Attack
    isAttackRoll,

    // Heal
    isHeal,
    healAtSlot,

    // Dart / Ray
    isDart: isMagicMissile || isScorchingRay,
    dartCount,

    // Effects
    statusEffect,       // { effectId, duration } | null
    durationTurns,

    // Display
    description: desc.slice(0, 300).replace(/\n/g, ' ') + (desc.length > 300 ? '…' : ''),
    higherLevel,
    icon: spellIcon(damageType, school, spellType, isHeal),
  }
}

// ── Infer status effect from damage type + description ────────
function inferStatusEffect(damageType, desc, school) {
  const d = (desc || '').toLowerCase()
  const s = school || ''

  // Explicit condition mentions in desc
  if (/\bpoisoned\b/i.test(d))    return { effectId: 'poisoned',   duration: 2 }
  if (/\bparalyz/i.test(d))       return { effectId: 'stunned',    duration: 2 }
  if (/\bstunned?\b/i.test(d))    return { effectId: 'stunned',    duration: 1 }
  if (/\bfrightened?\b/i.test(d)) return { effectId: 'frightened', duration: 2 }
  if (/\bprone\b/i.test(d))       return { effectId: 'prone',      duration: 1 }
  if (/speed.*?0|can't move|restrained/i.test(d)) return { effectId: 'frozen', duration: 1 }
  if (/\bblind/i.test(d))         return { effectId: 'weakened',   duration: 2 }
  if (/\bcharmed?\b/i.test(d))    return { effectId: 'weakened',   duration: 3 }

  // Infer from damage type
  if (damageType === 'poison')     return { effectId: 'poisonDot',  duration: 2 }
  if (damageType === 'fire')       return { effectId: 'burning',    duration: 1 }
  if (damageType === 'cold')       return { effectId: 'frozen',     duration: 1 }
  if (damageType === 'necrotic')   return { effectId: 'bleeding',   duration: 1 }
  if (damageType === 'psychic')    return { effectId: 'weakened',   duration: 1 }
  if (damageType === 'thunder')    return { effectId: 'prone',      duration: 1 }
  if (damageType === 'lightning')  return { effectId: 'stunned',    duration: 1 }

  // Buff school
  if (s === 'abjuration' || s === 'transmutation') return { effectId: 'shielded', duration: 3 }
  if (s === 'enchantment') return { effectId: 'blessed', duration: 2 }

  return null
}

// ── Parse duration string to turn count ───────────────────────
function parseDurationTurns(duration, concentration) {
  if (!duration) return 1
  const d = duration.toLowerCase()
  if (d.includes('instantaneous')) return 0
  if (d.includes('1 round'))       return 1
  if (d.includes('6 round'))       return 6
  if (d.includes('1 minute'))      return concentration ? 10 : 10
  if (d.includes('10 minute'))     return concentration ? 10 : 100
  if (d.includes('1 hour'))        return concentration ? 10 : 600
  if (d.includes('8 hour'))        return 600
  if (d.includes('24 hour'))       return 600
  if (d.includes('until dispelled')) return 999
  return 3
}

// ── Spell icon based on type/school ──────────────────────────
function spellIcon(damageType, school, spellType, isHeal) {
  if (isHeal) return '💚'
  const icons = {
    fire: '🔥', cold: '❄️', lightning: '⚡', thunder: '💥',
    poison: '☠️', acid: '🧪', psychic: '🔮', necrotic: '💀',
    radiant: '✨', force: '✦', bludgeoning: '💫',
  }
  if (damageType && icons[damageType]) return icons[damageType]
  const schoolIcons = {
    evocation: '⚡', abjuration: '🛡️', conjuration: '✨',
    enchantment: '🌀', illusion: '👻', necromancy: '💀',
    transmutation: '🔄', divination: '🔮',
  }
  return schoolIcons[school] || '✨'
}

// ── Get damage dice for a specific slot level ─────────────────
// Uses damageAtSlot table if available, otherwise scales base dice
export function getDamageDiceForSlot(spellData, slotLevel, character) {
  const lvl = String(slotLevel || spellData.level || 1)

  // 1. Use explicit slot-level table
  if (spellData.damageAtSlot && Object.keys(spellData.damageAtSlot).length > 0) {
    // Find the highest slot that's <= requested level
    const available = Object.keys(spellData.damageAtSlot)
      .map(Number).filter(k => k <= (slotLevel || spellData.level || 1))
      .sort((a, b) => b - a)
    if (available.length > 0) return spellData.damageAtSlot[String(available[0])]
  }

  // 2. Use character-level table (cantrips)
  if (spellData.damageAtLevel && Object.keys(spellData.damageAtLevel).length > 0) {
    const charLevel = character?.level || 1
    const available = Object.keys(spellData.damageAtLevel)
      .map(Number).filter(k => k <= charLevel)
      .sort((a, b) => b - a)
    if (available.length > 0) return spellData.damageAtLevel[String(available[0])]
  }

  // 3. Fall back to base dice
  return spellData.damageDice || '1d6'
}

// ── Get heal dice for a specific slot level ───────────────────
export function getHealDiceForSlot(spellData, slotLevel) {
  const lvl = slotLevel || spellData.level || 1

  if (spellData.healAtSlot && Object.keys(spellData.healAtSlot).length > 0) {
    const available = Object.keys(spellData.healAtSlot)
      .map(Number).filter(k => k <= lvl)
      .sort((a, b) => b - a)
    if (available.length > 0) return spellData.healAtSlot[String(available[0])]

    // If upcast beyond table, scale: add one die per slot above max
    const maxKey = Math.max(...Object.keys(spellData.healAtSlot).map(Number))
    const base = spellData.healAtSlot[String(maxKey)]
    const extraLevels = lvl - maxKey
    if (extraLevels > 0 && base) {
      // Add extraLevels dice of the base die type
      const m = base.match(/(\d+)(d\d+)(.*)/)
      if (m) return `${parseInt(m[1]) + extraLevels}${m[2]}${m[3]}`
    }
    return base || '1d8'
  }

  // Fallback
  return '1d8+2'
}

// ── Classify whether spell needs enemy target ─────────────────
export function spellNeedsEnemyTarget(spellData) {
  if (!spellData) return false
  return spellData.targetType === 'enemy' &&
    spellData.rangeType === 'single' &&
    spellData.spellType !== 'buff' &&
    !spellData.isHeal
}

// ── Is this a buff/self spell that auto-targets player ─────────
export function spellIsSelfCast(spellData) {
  if (!spellData) return false
  return spellData.isSelfRange || spellData.spellType === 'buff' || spellData.isHeal
}

// src/lib/spellSlots.js
// D&D 5e spell slot tables per class and level

// Full casters (Wizard, Sorcerer, Cleric, Druid, Bard)
const FULL_CASTER = {
  1:  { 1: 2 },
  2:  { 1: 3 },
  3:  { 1: 4, 2: 2 },
  4:  { 1: 4, 2: 3 },
  5:  { 1: 4, 2: 3, 3: 2 },
  6:  { 1: 4, 2: 3, 3: 3 },
  7:  { 1: 4, 2: 3, 3: 3, 4: 1 },
  8:  { 1: 4, 2: 3, 3: 3, 4: 2 },
  9:  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  11: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  12: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
  13: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  14: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
  15: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  16: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
  17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
  18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
  19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
  20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 },
}

// Half casters (Paladin, Ranger) — use level/2 rounded down
const HALF_CASTER = {
  2:  { 1: 2 },
  3:  { 1: 3 },
  4:  { 1: 3 },
  5:  { 1: 4, 2: 2 },
  6:  { 1: 4, 2: 2 },
  7:  { 1: 4, 2: 3 },
  8:  { 1: 4, 2: 3 },
  9:  { 1: 4, 2: 3, 3: 2 },
  10: { 1: 4, 2: 3, 3: 2 },
  11: { 1: 4, 2: 3, 3: 3 },
  12: { 1: 4, 2: 3, 3: 3 },
  13: { 1: 4, 2: 3, 3: 3, 4: 1 },
  14: { 1: 4, 2: 3, 3: 3, 4: 1 },
  15: { 1: 4, 2: 3, 3: 3, 4: 2 },
  16: { 1: 4, 2: 3, 3: 3, 4: 2 },
  17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
  19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
  20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
}

// Warlock pact slots — all slots same level, recover on short rest
const WARLOCK_SLOTS = {
  1:  { 1: 1 },
  2:  { 1: 2 },
  3:  { 2: 2 },
  4:  { 2: 2 },
  5:  { 3: 2 },
  6:  { 3: 2 },
  7:  { 4: 2 },
  8:  { 4: 2 },
  9:  { 5: 2 },
  10: { 5: 2 },
  11: { 5: 3 },
  12: { 5: 3 },
  13: { 5: 3 },
  14: { 5: 3 },
  15: { 5: 3 },
  16: { 5: 3 },
  17: { 5: 4 },
  18: { 5: 4 },
  19: { 5: 4 },
  20: { 5: 4 },
}

const FULL_CASTERS  = ['Wizard', 'Sorcerer', 'Cleric', 'Druid', 'Bard']
const HALF_CASTERS  = ['Paladin', 'Ranger']
const NO_SLOTS      = ['Barbarian', 'Fighter', 'Rogue', 'Monk']

export function isCaster(className) {
  return !NO_SLOTS.includes(className)
}

export function isWarlock(className) {
  return className === 'Warlock'
}

export function isHalfCaster(className) {
  return HALF_CASTERS.includes(className)
}

// Get max spell slots for a class at a given level
export function getMaxSlots(className, level) {
  if (NO_SLOTS.includes(className)) return {}
  if (className === 'Warlock') {
    return WARLOCK_SLOTS[level] || {}
  }
  if (HALF_CASTERS.includes(className)) {
    return HALF_CASTER[level] || {}
  }
  return FULL_CASTER[level] || {}
}

// Build initial spell_slots object for a new character
export function buildInitialSlots(className, level) {
  const maxSlots = getMaxSlots(className, level)
  const slots = {}
  for (const [lvl, max] of Object.entries(maxSlots)) {
    slots[lvl] = { max, used: 0 }
  }
  return slots
}

// Get available (remaining) slots
export function availableSlots(spellSlots) {
  const available = {}
  for (const [lvl, data] of Object.entries(spellSlots || {})) {
    const remaining = data.max - data.used
    if (remaining > 0) available[lvl] = remaining
  }
  return available
}

// Use a spell slot of given level, returns updated slots or null if unavailable
export function useSlot(spellSlots, level) {
  const key = String(level)
  if (!spellSlots[key] || spellSlots[key].used >= spellSlots[key].max) return null
  return {
    ...spellSlots,
    [key]: { ...spellSlots[key], used: spellSlots[key].used + 1 }
  }
}

// Restore all spell slots (long rest)
export function restoreAllSlots(spellSlots) {
  const restored = {}
  for (const [lvl, data] of Object.entries(spellSlots || {})) {
    restored[lvl] = { ...data, used: 0 }
  }
  return restored
}

// Restore warlock slots (short rest)
export function restoreWarlockSlots(spellSlots) {
  return restoreAllSlots(spellSlots)
}

// Hit dice per class
export const HIT_DICE = {
  Barbarian: 12, Fighter: 10, Paladin: 10, Ranger: 10,
  Monk: 8, Rogue: 8, Cleric: 8, Druid: 8, Bard: 8, Warlock: 8,
  Wizard: 6, Sorcerer: 6,
}

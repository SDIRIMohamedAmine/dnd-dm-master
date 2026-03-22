// src/lib/contentValidator.js
// ══════════════════════════════════════════════════════════════
// CONTENT VALIDATOR — Prevents overpowered or broken content.
//
// Every piece of custom content must pass these checks before
// being registered. The validator clamps values to safe ranges
// and returns the sanitized data alongside any warnings.
// ══════════════════════════════════════════════════════════════

// ── Balance limits ─────────────────────────────────────────────

const LIMITS = {
  item: {
    // Max damage dice per rarity tier
    maxDamageDice: { common: '1d4', uncommon: '1d8', rare: '2d6', very_rare: '3d8', legendary: '4d10' },
    maxAcBonus:    { common: 0, uncommon: 1, rare: 2, very_rare: 3, legendary: 3 },
    maxSaveBonus:  { common: 0, uncommon: 1, rare: 2, very_rare: 3, legendary: 3 },
    maxStatSet:    20,  // setCon/setStr etc can't exceed 20
    minStatSet:    17,  // stat-setting items must set to at least 17 (otherwise just use ASI)
    maxHpBonus:    (level) => level * 5,  // Tough feat territory
  },
  spell: {
    // Max base damage dice per level
    maxDamagePerLevel: {
      0: '1d12',   // cantrip
      1: '4d6',    // Burning Hands territory
      2: '5d8',    // Shatter territory
      3: '8d6',    // Fireball territory
      4: '10d6',   // Ice Storm territory
      5: '12d6',   // Cone of Cold territory
      6: '16d6',   // Disintegrate territory
      7: '20d6',   // Delayed Blast territory
      8: '24d6',
      9: '40d6',
    },
  },
  creature: {
    // CR → expected HP and AC ranges (approximate SRD values)
    crStats: {
      '0':   { hpMax: 10,  hpMin: 1,   acMax: 13, atkMax: 3  },
      '1/8': { hpMax: 25,  hpMin: 3,   acMax: 13, atkMax: 4  },
      '1/4': { hpMax: 50,  hpMin: 13,  acMax: 13, atkMax: 5  },
      '1/2': { hpMax: 70,  hpMin: 22,  acMax: 13, atkMax: 6  },
      '1':   { hpMax: 85,  hpMin: 36,  acMax: 14, atkMax: 6  },
      '2':   { hpMax: 100, hpMin: 49,  acMax: 15, atkMax: 7  },
      '3':   { hpMax: 115, hpMin: 70,  acMax: 15, atkMax: 8  },
      '4':   { hpMax: 130, hpMin: 85,  acMax: 16, atkMax: 9  },
      '5':   { hpMax: 178, hpMin: 100, acMax: 17, atkMax: 9  },
      '6':   { hpMax: 200, hpMin: 114, acMax: 17, atkMax: 10 },
      '7':   { hpMax: 230, hpMin: 130, acMax: 18, atkMax: 11 },
      '8':   { hpMax: 260, hpMin: 136, acMax: 18, atkMax: 11 },
    },
    maxAttacks: 3,         // max attacks per turn at any CR
    maxDamagePer: '3d10',  // max damage per attack expression
  },
}

// ── Dice parsing helpers ──────────────────────────────────────

function parseDiceTotal(expr) {
  if (!expr) return 0
  const m = String(expr).match(/(\d+)d(\d+)([+-]\d+)?/)
  if (!m) return parseInt(expr) || 0
  return parseInt(m[1]) * parseInt(m[2]) + parseInt(m[3] || '0')
}

function diceAverage(expr) {
  if (!expr) return 0
  const m = String(expr).match(/(\d+)d(\d+)([+-]\d+)?/)
  if (!m) return parseInt(expr) || 0
  const count = parseInt(m[1]), sides = parseInt(m[2]), bonus = parseInt(m[3] || '0')
  return count * ((sides + 1) / 2) + bonus
}

function clampDice(expr, maxExpr) {
  const val = diceAverage(expr)
  const max = diceAverage(maxExpr)
  return val > max ? maxExpr : expr
}

// ── ITEM VALIDATOR ────────────────────────────────────────────

function validateItem(raw) {
  const errors = []
  const data   = { ...raw }
  const rarity = data.rarity || 'common'

  // Name required
  if (!data.name?.trim()) errors.push('Item must have a name.')

  // Damage cap
  if (data.damage) {
    const maxDmg = LIMITS.item.maxDamageDice[rarity] || LIMITS.item.maxDamageDice.legendary
    const clamped = clampDice(data.damage, maxDmg)
    if (clamped !== data.damage) {
      data.damage = clamped
      errors.push(`Damage clamped to ${clamped} for ${rarity} rarity.`)
    }
  }

  // AC bonus cap
  if (data.acBonus != null) {
    const maxAC = LIMITS.item.maxAcBonus[rarity] ?? 3
    if (data.acBonus > maxAC) {
      data.acBonus = maxAC
      errors.push(`AC bonus clamped to +${maxAC} for ${rarity} rarity.`)
    }
  }

  // Save bonus cap
  if (data.saveBonus != null) {
    const maxSave = LIMITS.item.maxSaveBonus[rarity] ?? 3
    if (data.saveBonus > maxSave) {
      data.saveBonus = maxSave
      errors.push(`Save bonus clamped to +${maxSave} for ${rarity} rarity.`)
    }
  }

  // Stat setter range
  for (const key of ['setCon','setStr','setDex','setInt','setWis','setCha']) {
    if (data[key] != null) {
      if (data[key] > LIMITS.item.maxStatSet) {
        data[key] = LIMITS.item.maxStatSet
        errors.push(`${key} clamped to ${LIMITS.item.maxStatSet}.`)
      }
      if (data[key] < LIMITS.item.minStatSet) {
        data[key] = LIMITS.item.minStatSet
        errors.push(`${key} raised to minimum ${LIMITS.item.minStatSet} (use ASI for lower stat goals).`)
      }
      // Stat setters require attunement
      data.attunement = true
    }
  }

  // On-hit damage cap
  if (data.onHit?.damage) {
    const clamped = clampDice(data.onHit.damage, '2d6')
    if (clamped !== data.onHit.damage) {
      data.onHit = { ...data.onHit, damage: clamped }
      errors.push(`On-hit proc damage clamped to 2d6.`)
    }
  }

  // Rarity must match power
  const powerScore = [data.damage, data.onHit, data.onCrit, data.setCon, data.setStr, data.acBonus, data.saveBonus, data.hpBonus].filter(Boolean).length
  const minRarity  = powerScore === 0 ? 'common' : powerScore === 1 ? 'uncommon' : powerScore <= 2 ? 'rare' : 'very_rare'
  const rarityOrder = ['common','uncommon','rare','very_rare','legendary']
  if (rarityOrder.indexOf(data.rarity) < rarityOrder.indexOf(minRarity)) {
    data.rarity = minRarity
    errors.push(`Rarity upgraded to ${minRarity} to match power level.`)
  }

  return { ok: true, data, warnings: errors }  // warnings, not hard failures
}

// ── SPELL VALIDATOR ───────────────────────────────────────────

function validateSpell(raw) {
  const errors = []
  const data   = { ...raw }
  const level  = typeof data.level === 'number' ? data.level : 0

  if (!data.name?.trim()) errors.push('Spell must have a name.')

  // Damage cap by level
  if (data.damageDice) {
    const maxDmg = LIMITS.spell.maxDamagePerLevel[Math.min(level, 9)]
    const clamped = clampDice(data.damageDice, maxDmg)
    if (clamped !== data.damageDice) {
      data.damageDice = clamped
      errors.push(`Damage clamped to ${clamped} for level ${level} spell.`)
    }
  }

  // Concentration required for long-duration buffs
  if (!data.concentration && data.statusEffect?.duration > 5) {
    data.concentration = true
    errors.push('Long-duration effect (>5 turns) requires concentration.')
  }

  // Healing cap (Heal is 70 HP at 9th level — scale proportionally)
  if (data.healDice) {
    const maxHeal = `${level + 2}d8+${level * 2}`
    const clamped = diceAverage(data.healDice) > diceAverage(maxHeal)
      ? maxHeal : data.healDice
    if (clamped !== data.healDice) {
      data.healDice = clamped
      errors.push(`Heal dice clamped to ${clamped}.`)
    }
  }

  // Validate status effect ID
  const validEffects = ['poisoned','stunned','frightened','prone','frozen','burning','bleeding','weakened','blessed','shielded','regenerating','poisonDot']
  if (data.statusEffect?.effectId && !validEffects.includes(data.statusEffect.effectId)) {
    errors.push(`Unknown status effect "${data.statusEffect.effectId}" — removed.`)
    data.statusEffect = null
  }

  return { ok: true, data, warnings: errors }
}

// ── CREATURE VALIDATOR ────────────────────────────────────────

function validateCreature(raw) {
  const errors = []
  const data   = { ...raw }
  const cr     = String(data.cr || '1')
  const limits = LIMITS.creature.crStats[cr] || LIMITS.creature.crStats['5']

  if (!data.name?.trim()) errors.push('Creature must have a name.')

  // HP bounds
  if (data.hp > limits.hpMax * 1.5) {
    data.hp = limits.hpMax
    data.maxHp = limits.hpMax
    errors.push(`HP clamped to ${limits.hpMax} for CR ${cr}.`)
  }

  // AC bounds
  if (data.ac > limits.acMax + 2) {
    data.ac = limits.acMax + 2
    errors.push(`AC clamped to ${data.ac} for CR ${cr}.`)
  }

  // Attack count
  if (data.attacks?.length > LIMITS.creature.maxAttacks) {
    data.attacks = data.attacks.slice(0, LIMITS.creature.maxAttacks)
    errors.push(`Attack count capped at ${LIMITS.creature.maxAttacks}.`)
  }

  // Per-attack damage
  if (data.attacks?.length) {
    data.attacks = data.attacks.map(atk => {
      const clamped = clampDice(atk.damage, LIMITS.creature.maxDamagePer)
      if (clamped !== atk.damage) {
        errors.push(`"${atk.name}" damage clamped to ${clamped}.`)
        return { ...atk, damage: clamped }
      }
      return atk
    })
  }

  // XP should match CR
  const crXP = {
    '0':50, '1/8':25, '1/4':50, '1/2':100, '1':200, '2':450, '3':700,
    '4':1100, '5':1800, '6':2300, '7':2900, '8':3900,
  }
  if (!data.xp) data.xp = crXP[cr] || 500

  return { ok: true, data, warnings: errors }
}

// ── EXPORTED VALIDATOR OBJECT ─────────────────────────────────

export const contentValidator = {
  validateItem,
  validateSpell,
  validateCreature,
  LIMITS,
  diceAverage,
  parseDiceTotal,
}

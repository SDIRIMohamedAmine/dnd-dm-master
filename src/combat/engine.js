// src/combat/engine.js
// ══════════════════════════════════════════════════════════
// Pure combat engine — handles all D&D 5e combat math
// No LLM involved in resolution. LLM only called at the
// end to generate a narrative summary of what happened.
// ══════════════════════════════════════════════════════════

// ── Dice ────────────────────────────────────────────────────
export function roll(sides) { return Math.floor(Math.random() * sides) + 1 }
export function rollMultiple(count, sides) {
  return Array.from({ length: count }, () => roll(sides))
}
export function rollDice(expr) {
  // Parse "2d6+3" or "1d8" or "d20"
  const m = expr.match(/(\d*)d(\d+)([+-]\d+)?/)
  if (!m) return { rolls: [], total: parseInt(expr) || 0, expr }
  const count  = parseInt(m[1] || '1')
  const sides  = parseInt(m[2])
  const bonus  = parseInt(m[3] || '0')
  const rolls  = rollMultiple(count, sides)
  const total  = rolls.reduce((s, r) => s + r, 0) + bonus
  return { rolls, total, expr, bonus }
}

export function abilityMod(score) { return Math.floor((score - 10) / 2) }
export function modStr(score) {
  const m = abilityMod(score)
  return m >= 0 ? `+${m}` : `${m}`
}

// ── Monster stat blocks ──────────────────────────────────────
export const MONSTER_STATS = {
  'Wolf': {
    name: 'Wolf', hp: 11, maxHp: 11, ac: 13, cr: '1/4', xp: 50,
    str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6,
    speed: 40,
    attacks: [
      { name: 'Bite', bonus: 4, damage: '2d4+2', type: 'piercing',
        special: { dc: 11, stat: 'STR', effect: 'Prone', desc: 'knocked Prone' } }
    ],
    tactics: 'Uses Pack Tactics when ally is adjacent. Goes for the throat.',
    flavor: ['snaps its jaws', 'circles low', 'lunges for the ankles', 'snarls and feints'],
  },
  'Dire Wolf': {
    name: 'Dire Wolf', hp: 37, maxHp: 37, ac: 14, cr: '1', xp: 200,
    str: 17, dex: 15, con: 15, int: 3, wis: 12, cha: 7,
    speed: 50,
    attacks: [
      { name: 'Bite', bonus: 5, damage: '2d6+3', type: 'piercing',
        special: { dc: 13, stat: 'STR', effect: 'Prone', desc: 'knocked Prone' } }
    ],
    tactics: 'Pack Tactics. Targets downed or prone creatures first.',
    flavor: ['surges forward with terrifying speed', 'lets out a bone-chilling howl', 'slams its massive frame into you'],
  },
  'Goblin': {
    name: 'Goblin', hp: 7, maxHp: 7, ac: 15, cr: '1/4', xp: 50,
    str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
    speed: 30,
    attacks: [
      { name: 'Scimitar', bonus: 4, damage: '1d6+2', type: 'slashing' },
      { name: 'Shortbow', bonus: 4, damage: '1d6+2', type: 'piercing', range: true },
    ],
    bonusAction: 'Nimble Escape: Disengage or Hide',
    tactics: 'Hides after attacking. Targets isolated enemies.',
    flavor: ['cackles', 'darts sideways', 'jabs then retreats', 'throws a rock as a distraction'],
  },
  'Skeleton': {
    name: 'Skeleton', hp: 13, maxHp: 13, ac: 13, cr: '1/4', xp: 50,
    str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5,
    speed: 30,
    immunities: ['poison', 'exhaustion'],
    attacks: [
      { name: 'Shortsword', bonus: 4, damage: '1d6+2', type: 'piercing' },
      { name: 'Shortbow', bonus: 4, damage: '1d6+2', type: 'piercing', range: true },
    ],
    tactics: 'No morale. Fights mechanically until destroyed.',
    flavor: ['advances with hollow eye sockets', 'jaw clatters in a silent scream', 'bones click rhythmically'],
  },
  'Zombie': {
    name: 'Zombie', hp: 22, maxHp: 22, ac: 8, cr: '1/4', xp: 50,
    str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5,
    speed: 20,
    special: 'Undead Fortitude: When reduced to 0 HP, DC 5+damage taken CON save to drop to 1 HP instead',
    attacks: [
      { name: 'Slam', bonus: 3, damage: '1d6+1', type: 'bludgeoning' },
    ],
    tactics: 'Relentless. Never retreats.',
    flavor: ['lurches forward', 'groans and grasps', 'drags its feet toward you'],
  },
  'Bandit': {
    name: 'Bandit', hp: 11, maxHp: 11, ac: 12, cr: '1/8', xp: 25,
    str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10,
    speed: 30,
    attacks: [
      { name: 'Scimitar', bonus: 3, damage: '1d6+1', type: 'slashing' },
      { name: 'Light Crossbow', bonus: 3, damage: '1d8+1', type: 'piercing', range: true },
    ],
    morale: 10,
    tactics: 'Retreats if below 50% HP and outnumbered.',
    flavor: ['snarls a threat', 'spits on the ground', 'eyes you for weaknesses'],
  },
  'Orc': {
    name: 'Orc', hp: 15, maxHp: 15, ac: 13, cr: '1/2', xp: 100,
    str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10,
    speed: 30,
    attacks: [
      { name: 'Greataxe', bonus: 5, damage: '1d12+3', type: 'slashing' },
      { name: 'Javelin', bonus: 5, damage: '1d6+3', type: 'piercing', range: true },
    ],
    bonusAction: 'Aggressive: Move up to speed toward enemy',
    tactics: 'Charges directly. Uses Aggressive to close distance.',
    flavor: ['roars a battle cry', 'charges with reckless fury', 'raises its axe overhead'],
  },
  'Giant Rat': {
    name: 'Giant Rat', hp: 7, maxHp: 7, ac: 12, cr: '1/8', xp: 25,
    str: 7, dex: 15, con: 11, int: 2, wis: 10, cha: 4,
    speed: 30,
    attacks: [
      { name: 'Bite', bonus: 4, damage: '1d4+2', type: 'piercing',
        special: { dc: 10, stat: 'CON', effect: 'Diseased', desc: 'potentially diseased' } }
    ],
    tactics: 'Pack animal. Swarms injured targets.',
    flavor: ['squeals and lunges', 'scurries along the wall', 'bares yellow teeth'],
  },
  'Cultist': {
    name: 'Cultist', hp: 9, maxHp: 9, ac: 12, cr: '1/8', xp: 25,
    str: 11, dex: 12, con: 10, int: 10, wis: 11, cha: 10,
    speed: 30,
    attacks: [
      { name: 'Scimitar', bonus: 3, damage: '1d6+1', type: 'slashing' },
    ],
    tactics: 'Fanatical. Does not retreat. May call on dark powers.',
    flavor: ['chants in a dark tongue', 'eyes glazed with fervor', 'raises a ritual dagger'],
  },
}

// Build a custom monster from a name + CR hint
export function buildCustomMonster(name, crHint, level) {
  // Find closest real monster by CR
  const crToHP = { '0': 4, '1/8': 7, '1/4': 11, '1/2': 18, '1': 30, '2': 50, '3': 70 }
  const cr = crHint || (level <= 2 ? '1/4' : level <= 4 ? '1/2' : '1')
  const hp = crToHP[cr] || 11
  return {
    name, hp, maxHp: hp,
    ac: 12 + Math.floor(level / 3),
    cr, xp: { '0':10,'1/8':25,'1/4':50,'1/2':100,'1':200,'2':450,'3':700 }[cr] || 50,
    str: 12, dex: 12, con: 12, int: 6, wis: 10, cha: 6,
    speed: 30,
    attacks: [
      { name: 'Attack', bonus: 3, damage: '1d6+2', type: 'slashing' }
    ],
    isCustom: true,
    flavor: ['moves aggressively', 'strikes with unexpected speed', 'growls menacingly'],
  }
}

// Get a monster stat block by name (fuzzy match)
export function getMonsterStats(name) {
  const key = Object.keys(MONSTER_STATS).find(k =>
    k.toLowerCase() === name.toLowerCase() ||
    name.toLowerCase().includes(k.toLowerCase()) ||
    k.toLowerCase().includes(name.toLowerCase().split(' ')[0])
  )
  return key ? { ...MONSTER_STATS[key] } : null
}

// ── Attack resolution ────────────────────────────────────────
export function resolveAttack({ attacker, target, attackBonus, damageDice, advantage, disadvantage }) {
  const d1   = roll(20)
  const d2   = roll(20)
  let dieRoll = d1
  if (advantage && !disadvantage)    dieRoll = Math.max(d1, d2)
  if (disadvantage && !advantage)    dieRoll = Math.min(d1, d2)

  const total   = dieRoll + attackBonus
  const isCrit  = dieRoll === 20
  const isFumble = dieRoll === 1
  const hits    = isCrit || (!isFumble && total >= (target.ac || 10))

  let damage = 0
  let damageRolls = []
  if (hits) {
    const dmg = rollDice(damageDice)
    damageRolls = dmg.rolls
    damage = dmg.total
    if (isCrit) {
      // Crit: roll damage dice twice
      const extra = rollMultiple(damageRolls.length, parseInt(damageDice.split('d')[1]) || 6)
      damageRolls = [...damageRolls, ...extra]
      damage += extra.reduce((s, r) => s + r, 0)
    }
  }

  return {
    dieRoll, d1, d2, total, hits, isCrit, isFumble,
    damage, damageRolls, attackBonus,
    rolls: advantage || disadvantage ? [d1, d2] : [d1],
  }
}

// ── Saving throw ─────────────────────────────────────────────
export function resolveSave({ creature, stat, dc }) {
  const statMap = { STR:'str', DEX:'dex', CON:'con', INT:'int', WIS:'wis', CHA:'cha' }
  const score   = creature[statMap[stat] || 'str'] || 10
  const mod     = abilityMod(score)
  const dieRoll = roll(20)
  const total   = dieRoll + mod
  return { dieRoll, mod, total, dc, success: total >= dc, stat }
}

// ── Combat log entry builder ─────────────────────────────────
export function buildLogEntry(type, data) {
  return { id: Date.now() + Math.random(), type, ...data, ts: Date.now() }
}


// ── LOOT TABLES ─────────────────────────────────────────────
const LOOT_TABLES = {
  'Wolf':        { gold: [0,2],   items: ['Wolf Pelt', 'Wolf Fang', null, null] },
  'Dire Wolf':   { gold: [0,5],   items: ['Dire Wolf Pelt', 'Dire Wolf Fang', 'Dire Wolf Fang'] },
  'Goblin':      { gold: [1,8],   items: ['Rusty Dagger', 'Crude Shortsword', 'Goblin Sack (5 gp)', null, null, null] },
  'Skeleton':    { gold: [0,3],   items: ['Bone Fragment', 'Cracked Shield', null, null, null] },
  'Zombie':      { gold: [0,2],   items: ['Torn Clothing', null, null, null, null] },
  'Bandit':      { gold: [2,15],  items: ['Bandit\'s Shortsword', 'Leather Vest', 'Pouch of Coins (8 gp)', 'Crude Map', null] },
  'Orc':         { gold: [3,12],  items: ['Orcish Greataxe', 'Crude Armor', 'Pouch of Coins (6 gp)', null] },
  'Giant Rat':   { gold: [0,1],   items: ['Rat Fur', null, null, null, null] },
  'Cultist':     { gold: [1,6],   items: ['Cultist Dagger', 'Dark Symbol', 'Scroll Fragment', null] },
  'Gnoll':       { gold: [2,10],  items: ['Gnoll Spear', 'Gnoll Hide', null, null] },
  'Guard':       { gold: [2,8],   items: ['Guard\'s Spear', 'Chain Shirt', 'City Badge', null] },
}

const DEFAULT_LOOT = { gold: [1, 6], items: [null, null, null] }

export function rollLoot(enemyName, cr) {
  const key = Object.keys(LOOT_TABLES).find(k =>
    enemyName.toLowerCase().includes(k.toLowerCase())
  )
  const table = LOOT_TABLES[key] || DEFAULT_LOOT

  // CR scales gold
  const crMult = { '0':0.5,'1/8':0.75,'1/4':1,'1/2':1.5,'1':2,'2':3,'3':4 }[cr] || 1

  const [minGold, maxGold] = table.gold
  const goldRoll  = Math.floor((minGold + Math.random() * (maxGold - minGold + 1)) * crMult)
  const goldDrop  = Math.max(0, goldRoll)

  // Random item drop (30% chance)
  const nonNull   = table.items.filter(i => i !== null)
  const itemDrop  = Math.random() < 0.4 && nonNull.length > 0
    ? nonNull[Math.floor(Math.random() * nonNull.length)]
    : null

  return { gold: goldDrop, item: itemDrop }
}
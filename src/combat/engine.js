// src/combat/engine.js — Enhanced Combat Engine v2
// Full D&D 5e combat: status effects, AoE, multi-target, enemy spells, self-targeting

// ── Dice ────────────────────────────────────────────────────
export function roll(sides) { return Math.floor(Math.random() * sides) + 1 }
export function rollMultiple(count, sides) {
  return Array.from({ length: count }, () => roll(sides))
}
export function rollDice(expr) {
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

// ── STATUS EFFECTS ───────────────────────────────────────────
// Each effect: { id, name, icon, color, duration (turns), tickDamage?, tickDice?, saveStat?, saveDC?, endOnSave? }
export const STATUS_EFFECTS = {
  poisoned: {
    id: 'poisoned', name: 'Poisoned', icon: '☠️', color: '#4a9e4a',
    description: 'Disadvantage on attack rolls and ability checks.',
    attackDisadvantage: true,
    checkDisadvantage: true,
  },
  burning: {
    id: 'burning', name: 'Burning', icon: '🔥', color: '#e06020',
    description: 'Takes 1d4 fire damage at start of each turn.',
    tickDice: '1d4', tickType: 'fire',
    saveStat: 'DEX', saveDC: 10, endOnSave: true,
  },
  poisonDot: {
    id: 'poisonDot', name: 'Poison', icon: '💀', color: '#2a7a2a',
    description: 'Takes 1d6 poison damage at start of each turn.',
    tickDice: '1d6', tickType: 'poison',
    saveStat: 'CON', saveDC: 12, endOnSave: true,
  },
  bleeding: {
    id: 'bleeding', name: 'Bleeding', icon: '🩸', color: '#cc2020',
    description: 'Takes 1d4 necrotic damage at start of each turn.',
    tickDice: '1d4', tickType: 'necrotic',
  },
  stunned: {
    id: 'stunned', name: 'Stunned', icon: '💫', color: '#a0a000',
    description: 'Cannot take actions. Attackers have advantage.',
    skipTurn: true,
    giveAdvantageToAttackers: true,
  },
  frozen: {
    id: 'frozen', name: 'Frozen', icon: '❄️', color: '#60c0e0',
    description: 'Speed 0. Attacks against have advantage.',
    speedZero: true,
    giveAdvantageToAttackers: true,
  },
  blessed: {
    id: 'blessed', name: 'Blessed', icon: '✨', color: '#e0c020',
    description: '+1d4 to attack rolls and saving throws.',
    attackBonus: '1d4', saveBonus: '1d4',
  },
  shielded: {
    id: 'shielded', name: 'Shielded', icon: '🛡️', color: '#60a0ff',
    description: '+5 AC until start of next turn.',
    acBonus: 5,
  },
  regenerating: {
    id: 'regenerating', name: 'Regenerating', icon: '💚', color: '#20c060',
    description: 'Regains 1d6 HP at start of each turn.',
    tickHeal: '1d6',
  },
  weakened: {
    id: 'weakened', name: 'Weakened', icon: '⬇️', color: '#808080',
    description: 'Deals half damage on all attacks.',
    halfDamage: true,
  },
  frightened: {
    id: 'frightened', name: 'Frightened', icon: '😱', color: '#c080ff',
    description: 'Disadvantage on attacks. Cannot move closer to source.',
    attackDisadvantage: true,
  },
  prone: {
    id: 'prone', name: 'Prone', icon: '⬇️', color: '#a06020',
    description: 'Melee attacks have advantage. Ranged attacks have disadvantage.',
    giveAdvantageToMelee: true,
  },
}

// Apply status tick at start of turn — returns { damage, heal, log, removeEffect }
export function applyStatusTick(creature, effectId) {
  const eff = STATUS_EFFECTS[effectId]
  if (!eff) return null
  const result = { damage: 0, heal: 0, logs: [], removeEffect: false, effectId }

  if (eff.tickDice) {
    const dmg = rollDice(eff.tickDice)
    result.damage = dmg.total
    result.logs.push({ type: 'status_tick', creature: creature.name, effect: eff.name, icon: eff.icon, damage: dmg.total, dmgType: eff.tickType, rolls: dmg.rolls })

    if (eff.saveStat && eff.saveDC) {
      const statMap = { STR:'str', DEX:'dex', CON:'con', INT:'int', WIS:'wis', CHA:'cha' }
      const statVal = creature[statMap[eff.saveStat]] || 10
      const mod = abilityMod(statVal)
      const saveRoll = roll(20) + mod
      result.logs.push({ type: 'status_save', creature: creature.name, stat: eff.saveStat, dc: eff.saveDC, roll: saveRoll, success: saveRoll >= eff.saveDC })
      if (saveRoll >= eff.saveDC && eff.endOnSave) result.removeEffect = true
    }
  }

  if (eff.tickHeal) {
    const heal = rollDice(eff.tickHeal)
    result.heal = heal.total
    result.logs.push({ type: 'status_heal', creature: creature.name, effect: eff.name, icon: eff.icon, heal: heal.total })
  }

  return result
}

// ── ENEMY SPELLS ──────────────────────────────────────────────
export const ENEMY_SPELLS = {
  // Offensive
  poison_spray: {
    name: 'Poison Spray', icon: '💀', type: 'save',
    saveStat: 'CON', dc: 13, damage: '1d12', dmgType: 'poison',
    applyEffect: 'poisoned', effectDuration: 2,
    range: 'single', description: 'Target makes CON save DC 13 or takes 1d12 poison damage.',
    castTime: 'action',
  },
  chill_touch: {
    name: 'Chill Touch', icon: '💀', type: 'attack',
    attackBonus: 4, damage: '1d8', dmgType: 'necrotic',
    applyEffect: 'weakened', effectDuration: 1,
    range: 'single', description: 'Ranged spell attack. Hit: 1d8 necrotic. Target weakened until next turn.',
    castTime: 'action',
  },
  burning_hands: {
    name: 'Burning Hands', icon: '🔥', type: 'save',
    saveStat: 'DEX', dc: 13, damage: '3d6', dmgType: 'fire',
    applyEffect: 'burning', effectDuration: 2,
    range: 'aoe', description: 'All targets make DEX save DC 13 or take 3d6 fire + burning.',
    castTime: 'action',
  },
  ray_of_frost: {
    name: 'Ray of Frost', icon: '❄️', type: 'attack',
    attackBonus: 4, damage: '1d8', dmgType: 'cold',
    applyEffect: 'frozen', effectDuration: 1,
    range: 'single', description: 'Ranged spell attack. Hit: 1d8 cold + frozen 1 turn.',
    castTime: 'action',
  },
  cause_fear: {
    name: 'Cause Fear', icon: '😱', type: 'save',
    saveStat: 'WIS', dc: 13, damage: '0', dmgType: 'psychic',
    applyEffect: 'frightened', effectDuration: 3,
    range: 'single', description: 'Target makes WIS save DC 13 or becomes Frightened for 3 turns.',
    castTime: 'action',
  },
  // Defensive/healing
  healing_word: {
    name: 'Healing Word', icon: '💚', type: 'heal',
    healDice: '1d4+2', range: 'self',
    description: 'Heals self for 1d4+2 HP.',
    castTime: 'bonus',
  },
  mage_armor: {
    name: 'Mage Armor', icon: '🛡️', type: 'buff',
    applyEffect: 'shielded', effectDuration: 2,
    range: 'self', description: 'Gains +5 AC for 2 turns.',
    castTime: 'action',
  },
}

// Determine what spells an enemy can cast based on their type
export function getEnemySpellList(enemy) {
  const name = (enemy.name || '').toLowerCase()
  if (name.includes('zombie') || name.includes('undead') || name.includes('skeleton'))
    return ['chill_touch']
  if (name.includes('mage') || name.includes('wizard') || name.includes('sorcerer'))
    return ['ray_of_frost', 'burning_hands', 'mage_armor']
  if (name.includes('cultist') || name.includes('priest') || name.includes('cleric'))
    return ['poison_spray', 'cause_fear', 'healing_word']
  if (name.includes('troll') || name.includes('ogre'))
    return ['cause_fear']
  if (name.includes('dragon') || name.includes('wyvern'))
    return ['burning_hands', 'cause_fear']
  if (name.includes('vampire') || name.includes('lich') || name.includes('necromancer'))
    return ['chill_touch', 'cause_fear', 'healing_word']
  return []
}

// ── MONSTER STAT BLOCKS ───────────────────────────────────────
export const MONSTER_STATS = {
  'Wolf': {
    name: 'Wolf', hp: 11, maxHp: 11, ac: 13, cr: '1/4', xp: 50,
    str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6,
    speed: 40,
    attacks: [
      { name: 'Bite', bonus: 4, damage: '2d4+2', type: 'piercing',
        special: { dc: 11, stat: 'STR', effect: 'prone', desc: 'knocked Prone', effectId: 'prone', duration: 1 } }
    ],
    spells: [],
    tactics: 'Uses Pack Tactics when ally is adjacent.',
    flavor: ['snaps its jaws', 'circles low', 'lunges for the ankles'],
  },
  'Goblin': {
    name: 'Goblin', hp: 7, maxHp: 7, ac: 15, cr: '1/4', xp: 50,
    str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8,
    speed: 30,
    attacks: [
      { name: 'Scimitar', bonus: 4, damage: '1d6+2', type: 'slashing' },
    ],
    spells: [],
    tactics: 'Hides after attacking.',
    flavor: ['cackles', 'darts sideways', 'jabs then retreats'],
  },
  'Skeleton': {
    name: 'Skeleton', hp: 13, maxHp: 13, ac: 13, cr: '1/4', xp: 50,
    str: 10, dex: 14, con: 15, int: 6, wis: 8, cha: 5,
    speed: 30,
    immunities: ['poison', 'exhaustion'],
    attacks: [
      { name: 'Shortsword', bonus: 4, damage: '1d6+2', type: 'piercing' },
    ],
    spells: ['chill_touch'],
    tactics: 'No morale. Fights mechanically.',
    flavor: ['advances with hollow eye sockets', 'jaw clatters'],
  },
  'Zombie': {
    name: 'Zombie', hp: 22, maxHp: 22, ac: 8, cr: '1/4', xp: 50,
    str: 13, dex: 6, con: 16, int: 3, wis: 6, cha: 5,
    speed: 20,
    attacks: [
      { name: 'Slam', bonus: 3, damage: '1d6+1', type: 'bludgeoning',
        special: { dc: 12, stat: 'CON', effect: 'poisoned', effectId: 'poisonDot', duration: 2, desc: 'infected' } }
    ],
    spells: ['chill_touch'],
    tactics: 'Relentless. Never retreats.',
    flavor: ['lurches forward', 'groans and grasps'],
  },
  'Bandit': {
    name: 'Bandit', hp: 11, maxHp: 11, ac: 12, cr: '1/8', xp: 25,
    str: 11, dex: 12, con: 12, int: 10, wis: 10, cha: 10,
    speed: 30,
    attacks: [
      { name: 'Scimitar', bonus: 3, damage: '1d6+1', type: 'slashing' },
    ],
    spells: [],
    tactics: 'Retreats if below 50% HP.',
    flavor: ['snarls a threat', 'spits on the ground'],
  },
  'Orc': {
    name: 'Orc', hp: 15, maxHp: 15, ac: 13, cr: '1/2', xp: 100,
    str: 16, dex: 12, con: 16, int: 7, wis: 11, cha: 10,
    speed: 30,
    attacks: [
      { name: 'Greataxe', bonus: 5, damage: '1d12+3', type: 'slashing' },
    ],
    spells: ['cause_fear'],
    tactics: 'Charges directly.',
    flavor: ['roars a battle cry', 'charges with reckless fury'],
  },
  'Giant Rat': {
    name: 'Giant Rat', hp: 7, maxHp: 7, ac: 12, cr: '1/8', xp: 25,
    str: 7, dex: 15, con: 11, int: 2, wis: 10, cha: 4,
    speed: 30,
    attacks: [
      { name: 'Bite', bonus: 4, damage: '1d4+2', type: 'piercing',
        special: { dc: 10, stat: 'CON', effect: 'diseased', effectId: 'poisonDot', duration: 3, desc: 'diseased' } }
    ],
    spells: [],
    tactics: 'Pack animal.',
    flavor: ['squeals and lunges', 'bares yellow teeth'],
  },
  'Cultist': {
    name: 'Cultist', hp: 9, maxHp: 9, ac: 12, cr: '1/8', xp: 25,
    str: 11, dex: 12, con: 10, int: 10, wis: 11, cha: 10,
    speed: 30,
    attacks: [
      { name: 'Scimitar', bonus: 3, damage: '1d6+1', type: 'slashing' },
    ],
    spells: ['poison_spray', 'cause_fear'],
    tactics: 'Fanatical. Uses spells when possible.',
    flavor: ['chants in a dark tongue', 'raises a ritual dagger'],
  },
  'Mage': {
    name: 'Mage', hp: 40, maxHp: 40, ac: 12, cr: '6', xp: 2300,
    str: 9, dex: 14, con: 11, int: 17, wis: 12, cha: 11,
    speed: 30,
    attacks: [
      { name: 'Dagger', bonus: 4, damage: '1d4', type: 'piercing' },
    ],
    spells: ['ray_of_frost', 'burning_hands', 'mage_armor', 'poison_spray'],
    tactics: 'Casts spells preferentially. Uses mage_armor if below 50% HP.',
    flavor: ['gestures arcane symbols', 'incants in a dead language'],
  },
  'Vampire Spawn': {
    name: 'Vampire Spawn', hp: 82, maxHp: 82, ac: 15, cr: '5', xp: 1800,
    str: 16, dex: 18, con: 18, int: 11, wis: 10, cha: 12,
    speed: 30,
    attacks: [
      { name: 'Claws', bonus: 6, damage: '2d4+4', type: 'slashing',
        special: { dc: 13, stat: 'STR', effect: 'grappled', effectId: 'frozen', duration: 1, desc: 'grappled' } },
      { name: 'Bite', bonus: 6, damage: '1d6+4', type: 'piercing' },
    ],
    spells: ['chill_touch', 'cause_fear', 'healing_word'],
    tactics: 'Alternates bite and claws. Heals with healing_word when below 40% HP.',
    flavor: ['hisses revealing fangs', 'moves with unnatural grace'],
  },
}

export function buildCustomMonster(name, crHint, level) {
  const crToHP = { '0': 4, '1/8': 7, '1/4': 11, '1/2': 18, '1': 30, '2': 50, '3': 70 }
  const cr = crHint || (level <= 2 ? '1/4' : level <= 4 ? '1/2' : '1')
  const hp = crToHP[cr] || 11
  return {
    name, hp, maxHp: hp,
    ac: 12 + Math.floor(level / 3),
    cr, xp: { '0':10,'1/8':25,'1/4':50,'1/2':100,'1':200,'2':450,'3':700 }[cr] || 50,
    str: 12, dex: 12, con: 12, int: 6, wis: 10, cha: 6,
    speed: 30,
    attacks: [{ name: 'Attack', bonus: 3, damage: '1d6+2', type: 'slashing' }],
    spells: [],
    isCustom: true,
    flavor: ['moves aggressively', 'strikes with unexpected speed'],
  }
}

export function getMonsterStats(name) {
  const key = Object.keys(MONSTER_STATS).find(k =>
    k.toLowerCase() === name.toLowerCase() ||
    name.toLowerCase().includes(k.toLowerCase()) ||
    k.toLowerCase().includes(name.toLowerCase().split(' ')[0])
  )
  return key ? { ...MONSTER_STATS[key] } : null
}

// ── PLAYER SPELL DATABASE ─────────────────────────────────────
// Full definitions: targeting, effects, dice
export const PLAYER_SPELLS = {
  // === CANTRIPS ===
  'Fire Bolt': {
    level: 0, school: 'evocation', icon: '🔥',
    type: 'attack', atkStat: 'int',
    damage: '1d10', dmgType: 'fire',
    applyEffect: 'burning', effectDuration: 1, effectChance: 0.5,
    range: 'single', targetType: 'enemy',
    description: 'Ranged spell attack. 1d10 fire damage. 50% chance to set burning.',
  },
  'Ray of Frost': {
    level: 0, school: 'evocation', icon: '❄️',
    type: 'attack', atkStat: 'int',
    damage: '1d8', dmgType: 'cold',
    applyEffect: 'frozen', effectDuration: 1,
    range: 'single', targetType: 'enemy',
    description: 'Ranged spell attack. 1d8 cold + frozen 1 turn (speed 0).',
  },
  'Shocking Grasp': {
    level: 0, school: 'evocation', icon: '⚡',
    type: 'attack', atkStat: 'int',
    damage: '1d8', dmgType: 'lightning',
    applyEffect: 'stunned', effectDuration: 1,
    range: 'single', targetType: 'enemy',
    description: 'Melee spell attack. 1d8 lightning + stunned 1 turn.',
  },
  'Sacred Flame': {
    level: 0, school: 'evocation', icon: '✨',
    type: 'save', saveStat: 'DEX',
    damage: '1d8', dmgType: 'radiant',
    range: 'single', targetType: 'enemy',
    description: 'DEX save or take 1d8 radiant. No cover bonus.',
  },
  'Toll the Dead': {
    level: 0, school: 'necromancy', icon: '💀',
    type: 'save', saveStat: 'WIS',
    damage: (target) => target && target.hp < target.maxHp ? '1d12' : '1d8',
    dmgType: 'necrotic',
    range: 'single', targetType: 'enemy',
    description: 'WIS save. 1d8 necrotic (1d12 if target is wounded).',
  },
  'Vicious Mockery': {
    level: 0, school: 'enchantment', icon: '😂',
    type: 'save', saveStat: 'WIS',
    damage: '1d4', dmgType: 'psychic',
    applyEffect: 'weakened', effectDuration: 1,
    range: 'single', targetType: 'enemy',
    description: 'WIS save. 1d4 psychic + weakened 1 turn on fail.',
  },
  'Poison Spray': {
    level: 0, school: 'conjuration', icon: '☠️',
    type: 'save', saveStat: 'CON',
    damage: '1d12', dmgType: 'poison',
    applyEffect: 'poisoned', effectDuration: 2,
    range: 'single', targetType: 'enemy',
    description: 'CON save. 1d12 poison + poisoned 2 turns on fail.',
  },
  'Chill Touch': {
    level: 0, school: 'necromancy', icon: '💀',
    type: 'attack', atkStat: 'cha',
    damage: '1d8', dmgType: 'necrotic',
    applyEffect: 'weakened', effectDuration: 2,
    range: 'single', targetType: 'enemy',
    description: 'Ranged spell attack. 1d8 necrotic. Undead have disadvantage to attack you.',
  },

  // === LEVEL 1 ===
  'Magic Missile': {
    level: 1, school: 'evocation', icon: '✦',
    type: 'auto', // auto-hit, no attack roll
    darts: (slotLevel) => (slotLevel || 1) + 2, // 3 darts at level 1, +1 per slot
    damagePer: '1d4+1', dmgType: 'force',
    range: 'multi', targetType: 'enemy',
    canAssignTargets: true, // manual dart assignment
    description: 'Fires 3+slot darts (auto-hit). 1d4+1 force each. Assign to any targets.',
  },
  'Healing Word': {
    level: 1, school: 'evocation', icon: '💚',
    type: 'heal',
    healDice: (slotLevel) => `${slotLevel || 1}d4+${Math.floor((slotLevel || 1) / 2) + 2}`,
    range: 'single', targetType: 'self_or_ally',
    castAs: 'bonus',
    description: 'Bonus action. Heal yourself or an ally for 1d4+mod HP.',
  },
  'Cure Wounds': {
    level: 1, school: 'evocation', icon: '💉',
    type: 'heal',
    healDice: (slotLevel) => `${slotLevel || 1}d8+${Math.floor((slotLevel || 1) / 2) + 2}`,
    range: 'single', targetType: 'self_or_ally',
    description: 'Heal yourself or an ally for 1d8+mod HP per slot level.',
  },
  'Inflict Wounds': {
    level: 1, school: 'necromancy', icon: '🩸',
    type: 'attack', atkStat: 'wis',
    damage: (slotLevel) => `${(slotLevel || 1) * 2 + 1}d10`,
    dmgType: 'necrotic',
    applyEffect: 'bleeding', effectDuration: 2,
    range: 'single', targetType: 'enemy',
    description: 'Melee spell attack. 3d10 necrotic + bleeding 2 turns.',
  },
  'Guiding Bolt': {
    level: 1, school: 'evocation', icon: '⚡',
    type: 'attack', atkStat: 'wis',
    damage: '4d6', dmgType: 'radiant',
    applyEffect: 'shielded', effectDuration: 1, // gives next attacker advantage
    range: 'single', targetType: 'enemy',
    description: 'Ranged spell attack. 4d6 radiant. Next attack vs target has advantage.',
  },
  'Bless': {
    level: 1, school: 'enchantment', icon: '✨',
    type: 'buff',
    applyEffect: 'blessed', effectDuration: 3,
    range: 'self', targetType: 'self',
    description: 'Concentration. You gain +1d4 to attack rolls and saving throws for 3 turns.',
  },
  'Shield of Faith': {
    level: 1, school: 'abjuration', icon: '🛡️',
    type: 'buff',
    applyEffect: 'shielded', effectDuration: 3,
    range: 'self', targetType: 'self',
    castAs: 'bonus',
    description: 'Bonus action. +2 AC for 3 turns (concentration).',
  },
  'Shield': {
    level: 1, school: 'abjuration', icon: '🛡️',
    type: 'buff',
    applyEffect: 'shielded', effectDuration: 1,
    range: 'self', targetType: 'self',
    castAs: 'reaction',
    description: 'Reaction. +5 AC until start of your next turn.',
  },
  'Mage Armor': {
    level: 1, school: 'abjuration', icon: '🧥',
    type: 'buff',
    applyEffect: 'shielded', effectDuration: 10,
    range: 'self', targetType: 'self',
    description: 'Your AC becomes 13 + DEX for 8 hours (10 combat rounds).',
  },
  'Armor of Agathys': {
    level: 1, school: 'abjuration', icon: '❄️',
    type: 'buff',
    applyEffect: 'shielded', effectDuration: 5,
    healDice: (slotLevel) => `${(slotLevel||1)*5}`,
    range: 'self', targetType: 'self',
    description: 'Gain temp HP equal to 5×slot level. Attackers take cold damage.',
  },
  'Hellish Rebuke': {
    level: 1, school: 'evocation', icon: '🔥',
    type: 'save', saveStat: 'DEX',
    damage: (slotLevel) => `${(slotLevel||1)+1}d10`,
    dmgType: 'fire',
    range: 'single', targetType: 'enemy',
    castAs: 'reaction',
    description: 'Reaction when hit. Target DEX save or take 2d10 fire.',
  },
  'Sanctuary': {
    level: 1, school: 'abjuration', icon: '✨',
    type: 'buff',
    applyEffect: 'blessed', effectDuration: 3,
    range: 'self', targetType: 'self',
    castAs: 'bonus',
    description: 'Bonus action. Enemies must make WIS save to attack you for 3 turns.',
  },
  'Command': {
    level: 1, school: 'enchantment', icon: '📢',
    type: 'save', saveStat: 'WIS',
    damage: '0', dmgType: 'psychic',
    applyEffect: 'stunned', effectDuration: 1,
    range: 'single', targetType: 'enemy',
    description: 'WIS save or target is stunned for 1 turn (obeys your command).',
  },
  'Faerie Fire': {
    level: 1, school: 'evocation', icon: '✨',
    type: 'save', saveStat: 'DEX',
    damage: '0', dmgType: 'radiant',
    applyEffect: 'weakened', effectDuration: 3,
    range: 'aoe', targetType: 'all_enemies',
    description: 'All enemies DEX save or outlined — attacks against them have advantage.',
  },
  'Sleep': {
    level: 1, school: 'enchantment', icon: '💤',
    type: 'save', saveStat: 'WIS',
    damage: '0', dmgType: 'psychic',
    applyEffect: 'stunned', effectDuration: 2,
    range: 'single', targetType: 'enemy',
    description: 'Target WIS save or falls asleep (stunned) for 2 turns.',
  },
  'Burning Hands': {
    level: 1, school: 'evocation', icon: '🔥',
    type: 'save', saveStat: 'DEX',
    damage: (slotLevel) => `${(slotLevel || 1) * 2 + 1}d6`,
    dmgType: 'fire',
    applyEffect: 'burning', effectDuration: 2,
    range: 'aoe', targetType: 'all_enemies',
    description: 'All enemies make DEX save. 3d6 fire + burning 2 turns on fail.',
  },
  'Thunderwave': {
    level: 1, school: 'evocation', icon: '💨',
    type: 'save', saveStat: 'CON',
    damage: '2d8', dmgType: 'thunder',
    applyEffect: 'prone', effectDuration: 1,
    range: 'aoe', targetType: 'all_enemies',
    description: 'All nearby enemies CON save. 2d8 thunder + knocked prone on fail.',
  },
  'Hex': {
    level: 1, school: 'enchantment', icon: '🔮',
    type: 'debuff',
    applyEffect: 'weakened', effectDuration: 10, // concentration, until dispelled
    range: 'single', targetType: 'enemy',
    castAs: 'bonus',
    description: 'Bonus action. Target deals half damage and takes +1d6 necrotic on hits.',
  },
  'Hunter\'s Mark': {
    level: 1, school: 'divination', icon: '🎯',
    type: 'debuff',
    applyEffect: 'weakened', effectDuration: 10,
    range: 'single', targetType: 'enemy',
    castAs: 'bonus',
    description: 'Bonus action. Deal +1d6 damage to marked target.',
  },
  'Witch Bolt': {
    level: 1, school: 'evocation', icon: '⚡',
    type: 'attack', atkStat: 'int',
    damage: (slotLevel) => `${slotLevel || 1}d12`,
    dmgType: 'lightning',
    applyEffect: 'burning', effectDuration: 3,
    range: 'single', targetType: 'enemy',
    description: 'Ranged spell attack. 1d12 lightning per slot level + burning.',
  },
  'Chromatic Orb': {
    level: 1, school: 'evocation', icon: '🔮',
    type: 'attack', atkStat: 'int',
    damage: (slotLevel) => `${slotLevel || 1}d8`,
    dmgType: 'varies',
    range: 'single', targetType: 'enemy',
    description: 'Ranged spell attack. 1d8 damage per slot level (choose element).',
  },

  // === LEVEL 2 ===
  'Scorching Ray': {
    level: 2, school: 'evocation', icon: '🔥',
    type: 'multi_attack', atkStat: 'int',
    rays: 3, damagePerRay: '2d6', dmgType: 'fire',
    applyEffect: 'burning', effectDuration: 1,
    range: 'multi', targetType: 'enemy',
    canAssignTargets: true,
    description: 'Creates 3 rays. Assign each ray to any target. Each ray: 2d6 fire.',
  },
  'Shatter': {
    level: 2, school: 'evocation', icon: '💥',
    type: 'save', saveStat: 'CON',
    damage: '3d8', dmgType: 'thunder',
    applyEffect: 'stunned', effectDuration: 1,
    range: 'aoe', targetType: 'all_enemies',
    description: 'All enemies CON save. 3d8 thunder + stunned 1 turn on fail.',
  },
  'Hold Person': {
    level: 2, school: 'enchantment', icon: '🔒',
    type: 'save', saveStat: 'WIS',
    damage: '0', dmgType: 'psychic',
    applyEffect: 'stunned', effectDuration: 3,
    range: 'single', targetType: 'enemy',
    description: 'WIS save or target is paralyzed (stunned) for 3 turns.',
  },
  'Prayer of Healing': {
    level: 2, school: 'evocation', icon: '💚',
    type: 'heal',
    healDice: (slotLevel) => `${slotLevel || 2}d8+4`,
    range: 'self', targetType: 'self',
    description: 'Heal yourself for 2d8+4 HP (takes 10 minutes — use out of combat).',
  },

  // === LEVEL 3 ===
  'Fireball': {
    level: 3, school: 'evocation', icon: '💣',
    type: 'save', saveStat: 'DEX',
    damage: (slotLevel) => `${(slotLevel || 3) + 5}d6`,
    dmgType: 'fire',
    applyEffect: 'burning', effectDuration: 2,
    range: 'aoe', targetType: 'all_enemies',
    description: 'All enemies DEX save. 8d6 fire (half on save) + burning 2 turns.',
    halfOnSave: true,
  },
  'Lightning Bolt': {
    level: 3, school: 'evocation', icon: '⚡',
    type: 'save', saveStat: 'DEX',
    damage: (slotLevel) => `${(slotLevel || 3) + 5}d6`,
    dmgType: 'lightning',
    range: 'aoe', targetType: 'all_enemies',
    description: 'All enemies DEX save. 8d6 lightning (half on save).',
    halfOnSave: true,
  },
  'Vampiric Touch': {
    level: 3, school: 'necromancy', icon: '🩸',
    type: 'attack', atkStat: 'wis',
    damage: '3d6', dmgType: 'necrotic',
    selfHeal: true, selfHealFraction: 0.5,
    range: 'single', targetType: 'enemy',
    description: 'Melee spell attack. 3d6 necrotic. Heal yourself for half damage dealt.',
  },
  'Spirit Guardians': {
    level: 3, school: 'conjuration', icon: '👻',
    type: 'buff',
    applyEffect: 'regenerating', effectDuration: 5,
    range: 'self', targetType: 'self',
    description: 'Spirits surround you. Enemies entering your space take 3d8 radiant/necrotic.',
  },
  'Animate Dead': {
    level: 3, school: 'necromancy', icon: '💀',
    type: 'buff',
    range: 'self', targetType: 'self',
    description: 'Raise skeleton/zombie to fight for you (narrative, handled by DM).',
  },
  'Mass Healing Word': {
    level: 3, school: 'evocation', icon: '💚',
    type: 'heal',
    healDice: '1d4+2',
    range: 'self', targetType: 'self',
    castAs: 'bonus',
    description: 'Bonus action. You heal for 1d4+2 HP.',
  },
  'Dispel Magic': {
    level: 3, school: 'abjuration', icon: '✨',
    type: 'dispel',
    range: 'single', targetType: 'any',
    description: 'Remove all status effects from target (enemy or self).',
  },
}

// Get a spell definition (normalize name)
export function getSpellDef(spellName) {
  const clean = spellName.replace(/\s*\(cantrip\)/i, '').trim()
  return PLAYER_SPELLS[clean] || null
}

// ── ATTACK RESOLUTION ────────────────────────────────────────
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
      const extra = rollMultiple(damageRolls.length, parseInt(damageDice.split('d')[1]) || 6)
      damageRolls = [...damageRolls, ...extra]
      damage += extra.reduce((s, r) => s + r, 0)
    }
  }

  return { dieRoll, d1, d2, total, hits, isCrit, isFumble, damage, damageRolls, attackBonus, rolls: advantage || disadvantage ? [d1, d2] : [d1] }
}

// ── SAVING THROW ─────────────────────────────────────────────
export function resolveSave({ creature, stat, dc }) {
  const statMap = { STR:'str', DEX:'dex', CON:'con', INT:'int', WIS:'wis', CHA:'cha' }
  const score   = creature[statMap[stat] || 'str'] || 10
  const mod     = abilityMod(score)
  const dieRoll = roll(20)
  const total   = dieRoll + mod
  return { dieRoll, mod, total, dc, success: total >= dc, stat }
}

// ── COMBAT LOG ENTRY ─────────────────────────────────────────
export function buildLogEntry(type, data) {
  return { id: Date.now() + Math.random(), type, ...data, ts: Date.now() }
}

// ── LOOT TABLES ──────────────────────────────────────────────
const LOOT_TABLES = {
  'Wolf':      { gold: [0,2],  items: ['Wolf Pelt', 'Wolf Fang', null, null] },
  'Goblin':    { gold: [1,8],  items: ['Rusty Dagger', 'Goblin Sack (5 gp)', null, null] },
  'Skeleton':  { gold: [0,3],  items: ['Bone Fragment', 'Cracked Shield', null, null] },
  'Zombie':    { gold: [0,2],  items: ['Torn Clothing', null, null] },
  'Bandit':    { gold: [2,15], items: ['Leather Vest', 'Pouch of Coins (8 gp)', null] },
  'Orc':       { gold: [3,12], items: ['Orcish Greataxe', 'Pouch of Coins (6 gp)', null] },
  'Giant Rat': { gold: [0,1],  items: ['Rat Fur', null, null] },
  'Cultist':   { gold: [1,6],  items: ['Cultist Dagger', 'Dark Symbol', null] },
  'Mage':      { gold: [5,20], items: ['Spellbook Fragment', 'Arcane Focus', 'Scroll of Magic Missile'] },
}

export function rollLoot(enemyName, cr) {
  const key = Object.keys(LOOT_TABLES).find(k => enemyName.toLowerCase().includes(k.toLowerCase()))
  const table = LOOT_TABLES[key] || { gold: [1, 6], items: [null] }
  const crMult = { '0':0.5,'1/8':0.75,'1/4':1,'1/2':1.5,'1':2,'2':3,'3':4 }[cr] || 1
  const [minG, maxG] = table.gold
  const goldDrop = Math.max(0, Math.floor((minG + Math.random() * (maxG - minG + 1)) * crMult))
  const nonNull  = table.items.filter(i => i !== null)
  const itemDrop = Math.random() < 0.4 && nonNull.length ? nonNull[Math.floor(Math.random() * nonNull.length)] : null
  return { gold: goldDrop, item: itemDrop }
}

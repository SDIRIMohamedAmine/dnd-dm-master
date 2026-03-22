// src/combat/engine.js — Enhanced Combat Engine v2
import ALL_SPELLS from './spellData'
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
    abilities: [
      {
        id: 'wolf_bite', name: 'Bite', icon: '🐺',
        trigger: 'active', condition: {},
        effect: { type: 'damage', dice: '2d4+2', damageType: 'piercing' },
        resolution: { type: 'attack_roll', bonus: 4 },
        targeting: { type: 'single_enemy', range: 'melee' },
        cost: { type: 'none' }, castAs: 'action', cooldown: 0,
        onHitEffect: { effect: { type: 'saving_throw', stat: 'STR', dc: 11,
          onFail: { type: 'apply_status', statusId: 'prone', duration: 1 } } },
      },
      {
        id: 'wolf_pack_tactics', name: 'Pack Tactics', icon: '🐺',
        trigger: 'passive', condition: { allyNearby: true },
        effect: { type: 'modify_stat', stat: 'attack_advantage', value: true },
        targeting: { type: 'self' }, cost: { type: 'none' }, castAs: 'free',
        description: 'Advantage on attacks when an ally is adjacent to target.',
      },
    ],
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
    abilities: [
      {
        id: 'goblin_scimitar', name: 'Scimitar', icon: '⚔️',
        trigger: 'active', condition: {},
        effect: { type: 'damage', dice: '1d6+2', damageType: 'slashing' },
        resolution: { type: 'attack_roll', bonus: 4 },
        targeting: { type: 'single_enemy', range: 'melee' },
        cost: { type: 'none' }, castAs: 'action', cooldown: 0,
      },
      {
        id: 'goblin_nimble_escape', name: 'Nimble Escape', icon: '💨',
        trigger: 'on_turn_end', condition: {},
        effect: { type: 'apply_status', statusId: 'shielded', duration: 1 },
        targeting: { type: 'self' }, cost: { type: 'none' }, castAs: 'bonus',
        description: 'Goblin hides after attacking.',
      },
    ],
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
    abilities: [
      {
        id: 'skeleton_shortsword', name: 'Shortsword', icon: '⚔️',
        trigger: 'active', condition: {},
        effect: { type: 'damage', dice: '1d6+2', damageType: 'piercing' },
        resolution: { type: 'attack_roll', bonus: 4 },
        targeting: { type: 'single_enemy', range: 'melee' },
        cost: { type: 'none' }, castAs: 'action', cooldown: 0,
      },
      {
        id: 'skeleton_chill_touch', name: 'Chill Touch', icon: '💀',
        trigger: 'active', condition: {},
        effect: { type: 'damage', dice: '1d8', damageType: 'necrotic' },
        resolution: { type: 'attack_roll', bonus: 4 },
        targeting: { type: 'single_enemy', range: 'ranged' },
        cost: { type: 'charge', amount: 1 }, castAs: 'action', cooldown: 2,
        onHitEffect: { effect: { type: 'apply_status', statusId: 'weakened', duration: 1 } },
      },
    ],
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
    abilities: [
      {
        id: 'zombie_slam', name: 'Slam', icon: '👊',
        trigger: 'active', condition: {},
        effect: { type: 'damage', dice: '1d6+1', damageType: 'bludgeoning' },
        resolution: { type: 'attack_roll', bonus: 3 },
        targeting: { type: 'single_enemy', range: 'melee' },
        cost: { type: 'none' }, castAs: 'action', cooldown: 0,
        onHitEffect: { effect: { type: 'saving_throw', stat: 'CON', dc: 12,
          onFail: { type: 'apply_status', statusId: 'poisonDot', duration: 2 } } },
      },
    ],
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
    abilities: [
      {
        id: 'bandit_scimitar', name: 'Scimitar', icon: '⚔️',
        trigger: 'active', condition: {},
        effect: { type: 'damage', dice: '1d6+1', damageType: 'slashing' },
        resolution: { type: 'attack_roll', bonus: 3 },
        targeting: { type: 'single_enemy', range: 'melee' },
        cost: { type: 'none' }, castAs: 'action', cooldown: 0,
      },
      {
        id: 'bandit_retreat', name: 'Tactical Retreat', icon: '🏃',
        trigger: 'active', condition: { hpBelow: 0.5 },
        effect: { type: 'apply_status', statusId: 'shielded', duration: 1 },
        targeting: { type: 'self' }, cost: { type: 'none' }, castAs: 'bonus',
        description: 'Disengage when below half HP.',
      },
    ],
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
    abilities: [
      {
        id: 'orc_greataxe', name: 'Greataxe', icon: '🪓',
        trigger: 'active', condition: {},
        effect: { type: 'damage', dice: '1d12+3', damageType: 'slashing' },
        resolution: { type: 'attack_roll', bonus: 5 },
        targeting: { type: 'single_enemy', range: 'melee' },
        cost: { type: 'none' }, castAs: 'action', cooldown: 0,
      },
      {
        id: 'orc_cause_fear', name: 'Aggressive Roar', icon: '😱',
        trigger: 'active', condition: {},
        effect: { type: 'apply_status', statusId: 'frightened', duration: 2 },
        resolution: { type: 'saving_throw', stat: 'WIS', dc: 12 },
        targeting: { type: 'single_enemy', range: 'ranged' },
        cost: { type: 'charge', amount: 1 }, castAs: 'action', cooldown: 3,
      },
    ],
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
    abilities: [
      {
        id: 'rat_bite', name: 'Bite', icon: '🐀',
        trigger: 'active', condition: {},
        effect: { type: 'damage', dice: '1d4+2', damageType: 'piercing' },
        resolution: { type: 'attack_roll', bonus: 4 },
        targeting: { type: 'single_enemy', range: 'melee' },
        cost: { type: 'none' }, castAs: 'action', cooldown: 0,
        onHitEffect: { effect: { type: 'saving_throw', stat: 'CON', dc: 10,
          onFail: { type: 'apply_status', statusId: 'poisonDot', duration: 3 } } },
      },
      {
        id: 'rat_pack_tactics', name: 'Pack Tactics', icon: '🐀',
        trigger: 'passive', condition: { allyNearby: true },
        effect: { type: 'modify_stat', stat: 'attack_advantage', value: true },
        targeting: { type: 'self' }, cost: { type: 'none' }, castAs: 'free',
      },
    ],
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
    abilities: [
      {
        id: 'cultist_scimitar', name: 'Scimitar', icon: '⚔️',
        trigger: 'active', condition: {},
        effect: { type: 'damage', dice: '1d6+1', damageType: 'slashing' },
        resolution: { type: 'attack_roll', bonus: 3 },
        targeting: { type: 'single_enemy', range: 'melee' },
        cost: { type: 'none' }, castAs: 'action', cooldown: 0,
      },
      {
        id: 'cultist_poison_spray', name: 'Poison Spray', icon: '☠️',
        trigger: 'active', condition: {},
        effect: { type: 'damage', dice: '1d12', damageType: 'poison' },
        resolution: { type: 'saving_throw', stat: 'CON', dc: 13 },
        targeting: { type: 'single_enemy', range: 'ranged' },
        cost: { type: 'charge', amount: 1 }, castAs: 'action', cooldown: 2,
        onHitEffect: { effect: { type: 'apply_status', statusId: 'poisoned', duration: 2 } },
      },
      {
        id: 'cultist_cause_fear', name: 'Cause Fear', icon: '😱',
        trigger: 'active', condition: { hpBelow: 0.6 },
        effect: { type: 'apply_status', statusId: 'frightened', duration: 3 },
        resolution: { type: 'saving_throw', stat: 'WIS', dc: 13 },
        targeting: { type: 'single_enemy', range: 'ranged' },
        cost: { type: 'charge', amount: 1 }, castAs: 'action', cooldown: 3,
      },
    ],
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
    abilities: [
      {
        id: 'mage_ray_of_frost', name: 'Ray of Frost', icon: '❄️',
        trigger: 'active', condition: {},
        effect: { type: 'damage', dice: '1d8', damageType: 'cold' },
        resolution: { type: 'attack_roll', bonus: 6 },
        targeting: { type: 'single_enemy', range: 'ranged' },
        cost: { type: 'none' }, castAs: 'action', cooldown: 0,
        onHitEffect: { effect: { type: 'apply_status', statusId: 'frozen', duration: 1 } },
      },
      {
        id: 'mage_burning_hands', name: 'Burning Hands', icon: '🔥',
        trigger: 'active', condition: {},
        effect: { type: 'damage', dice: '3d6', damageType: 'fire' },
        resolution: { type: 'saving_throw', stat: 'DEX', dc: 14, halfOnSave: true },
        targeting: { type: 'all_enemies', range: 'aoe' },
        cost: { type: 'charge', amount: 1 }, castAs: 'action', cooldown: 2,
      },
      {
        id: 'mage_self_armor', name: 'Mage Armor', icon: '🛡️',
        trigger: 'active', condition: { hpBelow: 0.5 },
        effect: { type: 'apply_status', statusId: 'shielded', duration: 3 },
        targeting: { type: 'self' },
        cost: { type: 'charge', amount: 1 }, castAs: 'action', cooldown: 3,
      },
      {
        id: 'mage_dagger', name: 'Dagger', icon: '🗡️',
        trigger: 'active', condition: {},
        effect: { type: 'damage', dice: '1d4', damageType: 'piercing' },
        resolution: { type: 'attack_roll', bonus: 4 },
        targeting: { type: 'single_enemy', range: 'melee' },
        cost: { type: 'none' }, castAs: 'action', cooldown: 0,
      },
    ],
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
    abilities: [
      {
        id: 'vampire_claws', name: 'Claws', icon: '🧛',
        trigger: 'active', condition: {},
        effect: { type: 'damage', dice: '2d4+4', damageType: 'slashing' },
        resolution: { type: 'attack_roll', bonus: 6 },
        targeting: { type: 'single_enemy', range: 'melee' },
        cost: { type: 'none' }, castAs: 'action', cooldown: 0,
        onHitEffect: { effect: { type: 'saving_throw', stat: 'STR', dc: 13,
          onFail: { type: 'apply_status', statusId: 'frozen', duration: 1 } } },
      },
      {
        id: 'vampire_bite', name: 'Bite', icon: '🦷',
        trigger: 'active', condition: { hasStatus: 'frozen' }, // bites grappled targets
        effect: { type: 'damage', dice: '1d6+4', damageType: 'piercing' },
        resolution: { type: 'attack_roll', bonus: 6 },
        targeting: { type: 'single_enemy', range: 'melee' },
        cost: { type: 'none' }, castAs: 'action', cooldown: 0,
      },
      {
        id: 'vampire_heal', name: 'Healing Word', icon: '💚',
        trigger: 'active', condition: { hpBelow: 0.4 },
        effect: { type: 'heal', healDice: '1d4+2' },
        targeting: { type: 'self' },
        cost: { type: 'charge', amount: 1 }, castAs: 'bonus', cooldown: 2,
      },
    ],
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
// Merge: ALL_SPELLS is the full database; overrides below take precedence for tuned entries
const LEGACY_SPELLS = {
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

// Merged spell dictionary — ALL_SPELLS (full SRD) + LEGACY_SPELLS overrides
export const PLAYER_SPELLS = { ...ALL_SPELLS, ...LEGACY_SPELLS }

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
// creature may have saving_throw_proficiencies array and profBonus
export function resolveSave({ creature, stat, dc }) {
  const statMap = { STR:'str', DEX:'dex', CON:'con', INT:'int', WIS:'wis', CHA:'cha' }
  const statFull = { STR:'strength', DEX:'dexterity', CON:'constitution', INT:'intelligence', WIS:'wisdom', CHA:'charisma' }
  const score   = creature[statMap[stat] || 'str'] || 10
  let   mod     = abilityMod(score)
  // Add proficiency bonus if the creature/character is proficient in this save
  const saveProfs = creature.saving_throw_proficiencies || creature.savingThrows || []
  const statLong  = statFull[stat] || ''
  const proficient = saveProfs.some(s => s.toLowerCase() === statLong.toLowerCase() || s.toLowerCase() === stat.toLowerCase())
  const profBonus  = creature.profBonus || creature.proficiency_bonus || 0
  if (proficient && profBonus) mod += profBonus
  const dieRoll = roll(20)
  const total   = dieRoll + mod
  return { dieRoll, mod, total, dc, success: total >= dc, stat, proficient }
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


// ── WEAPON PROPERTIES ────────────────────────────────────────
// finesse: use STR or DEX (whichever is higher)
// versatile: 1d8 one-hand, 1d10 two-hand (two-hand assumed if no shield equipped)
// thrown: can make ranged attack
// heavy: small/tiny creatures have disadvantage
// light: can dual-wield with another light weapon
export const WEAPON_DATA = {
  'Greatsword':   { damage:'2d6',  type:'slashing', heavy:true,  twoHanded:true  },
  'Longsword':    { damage:'1d8',  type:'slashing', versatile:'1d10'             },
  'Rapier':       { damage:'1d8',  type:'piercing', finesse:true                 },
  'Shortsword':   { damage:'1d6',  type:'piercing', finesse:true, light:true     },
  'Dagger':       { damage:'1d4',  type:'piercing', finesse:true, light:true, thrown:{normal:20,long:60} },
  'Handaxe':      { damage:'1d6',  type:'slashing', light:true, thrown:{normal:20,long:60} },
  'Battleaxe':    { damage:'1d8',  type:'slashing', versatile:'1d10'             },
  'Greataxe':     { damage:'1d12', type:'slashing', heavy:true,  twoHanded:true  },
  'Warhammer':    { damage:'1d8',  type:'bludgeoning', versatile:'1d10'          },
  'Mace':         { damage:'1d6',  type:'bludgeoning'                            },
  'Quarterstaff': { damage:'1d6',  type:'bludgeoning', versatile:'1d8'           },
  'Flail':        { damage:'1d8',  type:'bludgeoning'                            },
  'Maul':         { damage:'2d6',  type:'bludgeoning', heavy:true, twoHanded:true },
  'Javelin':      { damage:'1d6',  type:'piercing', thrown:{normal:30,long:120}  },
  'Spear':        { damage:'1d6',  type:'piercing', versatile:'1d8', thrown:{normal:20,long:60} },
  'Shortbow':     { damage:'1d6',  type:'piercing', ranged:{normal:80,long:320}, twoHanded:true },
  'Longbow':      { damage:'1d8',  type:'piercing', ranged:{normal:150,long:600}, heavy:true, twoHanded:true },
  'Crossbow, light':{ damage:'1d8',  type:'piercing', ranged:{normal:80,long:320}, twoHanded:true },
  'Hand Crossbow':  { damage:'1d6',  type:'piercing', ranged:{normal:30,long:120}, light:true  },
  'Whip':         { damage:'1d4',  type:'slashing', finesse:true, reach:true     },
  'Club':         { damage:'1d4',  type:'bludgeoning', light:true                },
  'Greatclub':    { damage:'1d8',  type:'bludgeoning', twoHanded:true            },
  'Sickle':       { damage:'1d4',  type:'slashing', light:true                  },
  'Unarmed':      { damage:'1',    type:'bludgeoning'                            },
}

// Given equipment array and stats, return the best weapon info
export function getEquippedWeapon(equipment, str, dex) {
  const equip = (equipment || []).join(' ').toLowerCase()
  // Find best matching weapon (longest match wins)
  let best = null, bestLen = 0
  for (const [name, data] of Object.entries(WEAPON_DATA)) {
    if (name === 'Unarmed') continue
    if (equip.includes(name.toLowerCase()) && name.length > bestLen) {
      best = { name, ...data }
      bestLen = name.length
    }
  }
  if (!best) best = { name: 'Unarmed', ...WEAPON_DATA['Unarmed'] }

  const strMod = abilityMod(str || 10)
  const dexMod = abilityMod(dex || 10)

  // Finesse: pick higher of STR or DEX
  let statMod = strMod
  let statUsed = 'STR'
  if (best.finesse && dexMod > strMod) { statMod = dexMod; statUsed = 'DEX' }

  // Ranged weapons always use DEX
  if (best.ranged) { statMod = dexMod; statUsed = 'DEX' }

  // Versatile: use bigger die if no shield in equipment
  const hasShield = equip.includes('shield')
  let damageDice = best.damage
  if (best.versatile && !hasShield) damageDice = best.versatile

  return { ...best, damageDice, statMod, statUsed }
}


// ── CLASS COMBAT FEATURES (mechanical) ──────────────────────
export const CLASS_COMBAT_FEATURES = {
  Barbarian: {
    rage: {
      id: 'rage', name: 'Rage', icon: '😡', charges: (level) => level >= 17 ? 6 : level >= 15 ? 5 : level >= 12 ? 4 : level >= 6 ? 3 : 2,
      bonusDamage: 2,               // +2 to melee damage rolls while raging
      resistance: ['bludgeoning','piercing','slashing'],  // resist physical while raging
      advantageOn: ['strength'],    // advantage on STR checks and saves
      description: '+2 damage, resistance to physical, advantage on STR. Lasts 10 rounds.',
      duration: 10,
      effectId: 'raging',
    },
    recklessAttack: {
      id: 'recklessAttack', name: 'Reckless Attack', icon: '⚡', noCharge: true,
      giveAdvantage: true,         // advantage on attack rolls this turn
      giveEnemyAdvantage: true,    // enemies have advantage against you until next turn
      description: 'Advantage on attacks this turn. Enemies have advantage against you.',
    },
  },
  Fighter: {
    secondWind: {
      id: 'secondWind', name: 'Second Wind', icon: '💪', charges: 1, recharge: 'short',
      healDice: (level) => `1d10+${level}`,
      description: 'Heal 1d10 + Fighter level HP as a bonus action.',
    },
    actionSurge: {
      id: 'actionSurge', name: 'Action Surge', icon: '⚡', charges: 1, recharge: 'short',
      grantExtraAction: true,
      description: 'Take one additional action this turn.',
    },
  },
  Rogue: {
    sneakAttack: {
      id: 'sneakAttack', name: 'Sneak Attack', icon: '🗡️', noCharge: true, oncePer: 'turn',
      extraDice: (level) => `${Math.ceil(level/2)}d6`,
      condition: 'advantage or ally adjacent',   // checked programmatically
      description: (level) => `+${Math.ceil(level/2)}d6 damage when you have advantage or an ally is adjacent to target.`,
    },
  },
  Paladin: {
    divineSmite: {
      id: 'divineSmite', name: 'Divine Smite', icon: '✨', noCharge: true,
      onHit: true,   // triggers after a hit is confirmed
      damagePerSlot: (slot) => `${slot + 1}d8`,  // 2d8 at slot 1, 3d8 at slot 2, etc.
      damageType: 'radiant',
      extraVsUndead: '1d8',
      description: 'After hitting: burn a spell slot. Deal (slot+1)d8 radiant (extra d8 vs undead/fiends).',
    },
    layOnHands: {
      id: 'layOnHands', name: 'Lay on Hands', icon: '🤲',
      pool: (level) => level * 5,   // total HP pool
      description: (level) => `Heal up to ${level * 5} HP total, divided however you choose. Restore from HP pool.`,
    },
  },
  Monk: {
    martialArts: {
      id: 'martialArts', name: 'Martial Arts', icon: '🥋', noCharge: true,
      unarmedDice: (level) => level >= 17 ? '1d10' : level >= 11 ? '1d8' : level >= 5 ? '1d6' : '1d4',
      finesseUnarmed: true,  // use DEX for unarmed
      bonusUnarmed: true,    // bonus action unarmed strike after Attack action
    },
    stunningStrike: {
      id: 'stunningStrike', name: 'Stunning Strike', icon: '💫', kiCost: 1,
      onHit: true,
      saveStat: 'CON', saveDC: (wis, prof) => 8 + prof + abilityMod(wis),
      applyEffect: 'stunned', duration: 1,
      description: 'After hitting: spend 1 Ki. Target CON save or stunned until end of your next turn.',
    },
  },
  Ranger: {
    huntersMark: {
      id: 'huntersMark', name: "Hunter's Mark", icon: '🎯', noCharge: true,
      extraDamage: '1d6', damageType: 'piercing',
      concentration: true,
      description: '+1d6 damage to marked target. Concentration.',
    },
  },
  Bard: {
    bardicInspiration: {
      id: 'bardicInspiration', name: 'Bardic Inspiration', icon: '🎵',
      charges: (cha) => Math.max(1, abilityMod(cha)),
      die: (level) => level >= 15 ? '1d12' : level >= 10 ? '1d10' : level >= 5 ? '1d8' : '1d6',
      description: (level) => `Give a d${level >= 15 ? 12 : level >= 10 ? 10 : level >= 5 ? 8 : 6} to an ally to add to one roll.`,
    },
  },
  Cleric: {
    channelDivinity: {
      id: 'channelDivinity', name: 'Channel Divinity', icon: '⛪', charges: 1, recharge: 'short',
      options: ['Turn Undead', 'Sacred Flame (boosted)'],
      description: 'Turn Undead: undead WIS save or flee for 1 minute.',
    },
  },
  Druid: {
    wildShape: {
      id: 'wildShape', name: 'Wild Shape', icon: '🐺', charges: 2, recharge: 'short',
      description: 'Transform into a beast. HP becomes beast HP. Lasts until 0 HP or dismissed.',
    },
  },
  Warlock: {
    eldritchBlast: { id: 'eldritchBlast', name: 'Eldritch Blast', icon: '🔮', noCharge: true },
  },
  Wizard: {
    arcaneRecovery: {
      id: 'arcaneRecovery', name: 'Arcane Recovery', icon: '📚', charges: 1, recharge: 'long',
      description: 'On short rest, recover spell slots with total level ≤ half Wizard level.',
    },
  },
  Sorcerer: {
    metamagic: { id: 'metamagic', name: 'Metamagic', icon: '✨', noCharge: true },
  },
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

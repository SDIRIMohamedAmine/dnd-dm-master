// src/lib/classData.js
// ══════════════════════════════════════════════════════════
// Complete class progression data for level-up system
// and BG3-style combat action menus
// ══════════════════════════════════════════════════════════

// ── SPELLS BY CLASS AND LEVEL ────────────────────────────────
// Only levels 1-3 for starting spells (cantrips + level 1)
export const CLASS_SPELLS_BY_LEVEL = {
  Wizard: {
    cantrip: ['Fire Bolt','Ray of Frost','Mage Hand','Prestidigitation','Light','Shocking Grasp','Poison Spray','Acid Splash','True Strike','Friends'],
    1: ['Magic Missile','Sleep','Charm Person','Detect Magic','Shield','Thunderwave','Burning Hands','Mage Armor','Feather Fall','Identify','Comprehend Languages','Find Familiar','Grease','Tasha\'s Hideous Laughter','Witch Bolt'],
    2: ['Misty Step','Web','Scorching Ray','Hold Person','Invisibility','Mirror Image','Shatter','Blur','Darkness','Enlarge/Reduce'],
    3: ['Fireball','Lightning Bolt','Counterspell','Dispel Magic','Fly','Hypnotic Pattern','Slow','Vampiric Touch','Animate Dead'],
  },
  Sorcerer: {
    cantrip: ['Fire Bolt','Ray of Frost','Minor Illusion','Prestidigitation','Chill Touch','Mending','True Strike'],
    1: ['Burning Hands','Magic Missile','Charm Person','Sleep','Thunderwave','Mage Armor','Shield','Chromatic Orb','Expeditious Retreat'],
    2: ['Scorching Ray','Web','Hold Person','Blur','Shatter','Misty Step','Darkness','Levitate'],
    3: ['Fireball','Lightning Bolt','Haste','Fly','Counterspell','Dispel Magic'],
  },
  Warlock: {
    cantrip: ['Eldritch Blast','Chill Touch','Minor Illusion','Prestidigitation','Mage Hand','True Strike'],
    1: ['Hex','Armor of Agathys','Hellish Rebuke','Charm Person','Comprehend Languages','Protection from Evil and Good','Unseen Servant','Witch Bolt'],
    2: ['Darkness','Misty Step','Hold Person','Shatter','Spider Climb','Crown of Madness'],
    3: ['Hunger of Hadar','Hypnotic Pattern','Fear','Fly','Vampiric Touch'],
  },
  Bard: {
    cantrip: ['Vicious Mockery','Minor Illusion','Mage Hand','Light','Dancing Lights','Friends','True Strike'],
    1: ['Healing Word','Cure Wounds','Charm Person','Sleep','Thunderwave','Faerie Fire','Tasha\'s Hideous Laughter','Dissonant Whispers','Heroism','Longstrider'],
    2: ['Heat Metal','Invisibility','Hold Person','Suggestion','Shatter','Enthrall','Crown of Madness'],
    3: ['Hypnotic Pattern','Fear','Bestow Curse','Dispel Magic','Plant Growth'],
  },
  Cleric: {
    cantrip: ['Sacred Flame','Spare the Dying','Guidance','Light','Resistance','Thaumaturgy','Toll the Dead'],
    1: ['Cure Wounds','Bless','Healing Word','Inflict Wounds','Shield of Faith','Command','Detect Magic','Guiding Bolt','Sanctuary','Protection from Evil and Good'],
    2: ['Hold Person','Spiritual Weapon','Aid','Lesser Restoration','Silence','Prayer of Healing','Blindness/Deafness'],
    3: ['Revivify','Daylight','Dispel Magic','Mass Healing Word','Spirit Guardians','Animate Dead'],
  },
  Druid: {
    cantrip: ['Shillelagh','Guidance','Produce Flame','Druidcraft','Poison Spray','Resistance','Thorn Whip'],
    1: ['Entangle','Thunderwave','Healing Word','Cure Wounds','Speak with Animals','Goodberry','Fog Cloud','Absorb Elements','Faerie Fire'],
    2: ['Moonbeam','Hold Person','Spike Growth','Flaming Sphere','Lesser Restoration','Pass without Trace','Barkskin'],
    3: ['Call Lightning','Conjure Animals','Plant Growth','Sleet Storm','Dispel Magic','Meld into Stone'],
  },
  Paladin: {
    cantrip: [],
    1: ['Bless','Cure Wounds','Divine Favor','Heroism','Shield of Faith','Detect Magic','Protection from Evil and Good','Wrathful Smite','Thunderous Smite'],
    2: ['Aid','Branding Smite','Find Steed','Lesser Restoration','Zone of Truth','Magic Weapon'],
    3: ['Aura of Vitality','Blinding Smite','Create Food and Water','Crusader\'s Mantle','Daylight'],
  },
  Ranger: {
    cantrip: [],
    1: ['Hunter\'s Mark','Cure Wounds','Entangle','Speak with Animals','Goodberry','Fog Cloud','Absorb Elements','Alarm'],
    2: ['Silence','Pass without Trace','Spike Growth','Barkskin','Locate Animals or Plants','Protection from Poison'],
    3: ['Conjure Barrage','Daylight','Lightning Arrow','Nondetection','Plant Growth','Water Breathing'],
  },
}

// ── CLASS FEATURES PER LEVEL ─────────────────────────────────
export const CLASS_FEATURES = {
  Barbarian: {
    2:  ['Reckless Attack', 'Danger Sense'],
    3:  ['Primal Path chosen', 'Path feature'],
    4:  ['Ability Score Improvement'],
    5:  ['Extra Attack', 'Fast Movement'],
    6:  ['Path feature'],
    7:  ['Feral Instinct'],
    8:  ['Ability Score Improvement'],
    9:  ['Brutal Critical (1 die)'],
    10: ['Path feature'],
  },
  Fighter: {
    2:  ['Action Surge (1 use)'],
    3:  ['Martial Archetype chosen', 'Archetype feature'],
    4:  ['Ability Score Improvement'],
    5:  ['Extra Attack'],
    6:  ['Ability Score Improvement'],
    7:  ['Archetype feature'],
    8:  ['Ability Score Improvement'],
    9:  ['Indomitable (1 use)'],
    10: ['Archetype feature'],
  },
  Rogue: {
    2:  ['Cunning Action'],
    3:  ['Roguish Archetype', 'Uncanny Dodge... wait til 5'],
    4:  ['Ability Score Improvement'],
    5:  ['Uncanny Dodge', 'Sneak Attack increases to 3d6'],
    6:  ['Expertise (2 more skills)'],
    7:  ['Evasion'],
    8:  ['Ability Score Improvement'],
    9:  ['Archetype feature', 'Sneak Attack 5d6'],
    10: ['Ability Score Improvement', 'Sneak Attack 5d6'],
  },
  Wizard: {
    2:  ['Arcane Tradition chosen', 'Arcane Recovery'],
    3:  ['Tradition feature'],
    4:  ['Ability Score Improvement', 'New cantrip'],
    5:  ['3rd-level spells unlocked'],
    6:  ['Tradition feature'],
    7:  ['4th-level spells unlocked'],
    8:  ['Ability Score Improvement'],
    9:  ['5th-level spells unlocked'],
    10: ['Tradition feature'],
  },
  Cleric: {
    2:  ['Channel Divinity (1/rest)', 'Divine Domain feature'],
    3:  ['2nd-level spells unlocked'],
    4:  ['Ability Score Improvement', 'New cantrip'],
    5:  ['Destroy Undead (CR 1/2)', '3rd-level spells unlocked'],
    6:  ['Channel Divinity (2/rest)', 'Domain feature'],
    7:  ['4th-level spells unlocked'],
    8:  ['Ability Score Improvement', 'Destroy Undead (CR 1)', 'Domain feature'],
    9:  ['5th-level spells unlocked'],
    10: ['Divine Intervention', 'New cantrip'],
  },
  Paladin: {
    2:  ['Fighting Style', 'Spellcasting', 'Divine Smite'],
    3:  ['Divine Health', 'Sacred Oath chosen', 'Channel Divinity'],
    4:  ['Ability Score Improvement'],
    5:  ['Extra Attack', '2nd-level spells unlocked'],
    6:  ['Aura of Protection'],
    7:  ['Sacred Oath feature'],
    8:  ['Ability Score Improvement'],
    9:  ['3rd-level spells unlocked'],
    10: ['Aura of Courage'],
  },
  Sorcerer: {
    2:  ['Font of Magic', 'Sorcery Points (2)'],
    3:  ['Metamagic (choose 2)', '2nd-level spells'],
    4:  ['Ability Score Improvement', 'New cantrip'],
    5:  ['Sorcery Points 5', '3rd-level spells'],
    6:  ['Sorcerous Origin feature'],
    7:  ['4th-level spells'],
    8:  ['Ability Score Improvement'],
    9:  ['Sorcery Points 9', '5th-level spells'],
    10: ['Metamagic option', 'New cantrip'],
  },
  Warlock: {
    2:  ['Eldritch Invocations (2)', 'New spell slot level'],
    3:  ['Pact Boon', 'New Invocation'],
    4:  ['Ability Score Improvement', 'New cantrip'],
    5:  ['3rd-level pact spells', 'New Invocation'],
    6:  ['Otherworldly Patron feature'],
    7:  ['4th-level pact spells', 'New Invocation'],
    8:  ['Ability Score Improvement'],
    9:  ['5th-level pact spells', 'New Invocation'],
    10: ['Patron feature', 'New cantrip'],
  },
  Druid: {
    2:  ['Wild Shape', 'Druid Circle chosen', 'Circle feature'],
    3:  ['2nd-level spells unlocked'],
    4:  ['Wild Shape improvement', 'Ability Score Improvement', 'New cantrip'],
    5:  ['3rd-level spells unlocked'],
    6:  ['Circle feature'],
    7:  ['4th-level spells unlocked'],
    8:  ['Wild Shape (CR 1)', 'Ability Score Improvement'],
    9:  ['5th-level spells unlocked'],
    10: ['Circle feature', 'New cantrip'],
  },
  Bard: {
    2:  ['Jack of All Trades', 'Song of Rest (d6)'],
    3:  ['Bard College', 'Expertise (2 skills)', '2nd-level spells'],
    4:  ['Ability Score Improvement', 'New cantrip'],
    5:  ['Bardic Inspiration (d8)', '3rd-level spells', 'Font of Inspiration'],
    6:  ['Countercharm', 'Bard College feature'],
    7:  ['4th-level spells'],
    8:  ['Ability Score Improvement'],
    9:  ['Song of Rest (d8)', '5th-level spells'],
    10: ['Bardic Inspiration (d10)', 'Expertise (2 more)', 'Magical Secrets', 'New cantrip'],
  },
  Ranger: {
    2:  ['Fighting Style', 'Spellcasting'],
    3:  ['Primeval Awareness', 'Ranger Archetype', '2nd-level spells'],
    4:  ['Ability Score Improvement'],
    5:  ['Extra Attack'],
    6:  ['Favored Enemy improvement', 'Natural Explorer improvement'],
    7:  ['Archetype feature'],
    8:  ['Ability Score Improvement', 'Land\'s Stride'],
    9:  ['3rd-level spells'],
    10: ['Natural Explorer (3rd terrain)', 'Hide in Plain Sight'],
  },
  Monk: {
    2:  ['Ki (2 points)', 'Unarmored Movement +10ft', 'Flurry of Blows', 'Patient Defense', 'Step of the Wind'],
    3:  ['Monastic Tradition', 'Deflect Missiles', 'Ki (3 points)'],
    4:  ['Ability Score Improvement', 'Slow Fall', 'Ki (4 points)'],
    5:  ['Extra Attack', 'Stunning Strike', 'Ki (5 points)'],
    6:  ['Ki-Empowered Strikes', 'Tradition feature', 'Ki (6 points)'],
    7:  ['Evasion', 'Stillness of Mind', 'Ki (7 points)'],
    8:  ['Ability Score Improvement', 'Ki (8 points)'],
    9:  ['Unarmored Movement +15ft', 'Ki (9 points)'],
    10: ['Purity of Body', 'Ki (10 points)'],
  },
}

// ── STANDARD ACTIONS (always available in combat) ────────────
export const STANDARD_ACTIONS = [
  { id: 'attack',    name: 'Attack',         icon: '⚔️',  type: 'action',       desc: 'Make one weapon attack against a target.' },
  { id: 'dash',      name: 'Dash',           icon: '💨',  type: 'action',       desc: 'Double your movement speed this turn.' },
  { id: 'disengage', name: 'Disengage',      icon: '🏃',  type: 'action',       desc: 'Movement doesn\'t provoke opportunity attacks.' },
  { id: 'dodge',     name: 'Dodge',          icon: '🛡️',  type: 'action',       desc: 'Attackers have disadvantage, you have advantage on DEX saves.' },
  { id: 'help',      name: 'Help',           icon: '🤝',  type: 'action',       desc: 'Give an ally advantage on their next check or attack.' },
  { id: 'hide',      name: 'Hide',           icon: '👻',  type: 'action',       desc: 'Attempt to become hidden (DEX/Stealth check).' },
  { id: 'ready',     name: 'Ready',          icon: '⏱️',  type: 'action',       desc: 'Prepare an action to trigger on a condition.' },
  { id: 'search',    name: 'Search',         icon: '🔍',  type: 'action',       desc: 'Devote attention to finding something (Perception/Investigation).' },
  { id: 'shove',     name: 'Shove',          icon: '💪',  type: 'action',       desc: 'Push a creature 5ft away or knock it prone (Athletics contest).' },
  { id: 'grapple',   name: 'Grapple',        icon: '🤼',  type: 'action',       desc: 'Grab a creature (Athletics vs Athletics/Acrobatics).' },
  { id: 'bonus_attack', name: 'Offhand Attack', icon: '🗡️', type: 'bonus',     desc: 'Attack with your offhand weapon (no ability modifier to damage).' },
  { id: 'end_turn',  name: 'End Turn',       icon: '⏭️',  type: 'special',      desc: 'End your turn and pass to the next combatant.' },
]

// Class-specific bonus actions
export const CLASS_BONUS_ACTIONS = {
  Rogue:     [{ id: 'cunning_action_dash', name: 'Cunning: Dash', icon: '💨', type: 'bonus', desc: 'Dash as a bonus action.' },
              { id: 'cunning_action_disengage', name: 'Cunning: Disengage', icon: '🏃', type: 'bonus', desc: 'Disengage as a bonus action.' },
              { id: 'cunning_action_hide', name: 'Cunning: Hide', icon: '👻', type: 'bonus', desc: 'Hide as a bonus action.' }],
  Barbarian: [{ id: 'rage', name: 'Rage', icon: '😡', type: 'bonus', desc: '+2 damage, resistance to physical damage, advantage on STR checks. Lasts 1 minute.' }],
  Monk:      [{ id: 'flurry', name: 'Flurry of Blows', icon: '👊', type: 'bonus', desc: 'Spend 1 Ki: make 2 unarmed strikes.' },
              { id: 'patient_defense', name: 'Patient Defense', icon: '🛡️', type: 'bonus', desc: 'Spend 1 Ki: Dodge as a bonus action.' },
              { id: 'step_of_wind', name: 'Step of the Wind', icon: '💨', type: 'bonus', desc: 'Spend 1 Ki: Disengage or Dash, jump distance doubled.' }],
  Paladin:   [{ id: 'divine_smite', name: 'Divine Smite', icon: '✨', type: 'bonus', desc: 'After hitting: expend a spell slot to deal 2d8 radiant damage (+1d8 per slot level above 1st).' }],
  Bard:      [{ id: 'bardic_inspiration', name: 'Bardic Inspiration', icon: '🎵', type: 'bonus', desc: 'Give an ally a d6 inspiration die to add to one roll.' }],
}

// ── NEW SPELLS AVAILABLE PER LEVEL ───────────────────────────
// Returns spells a caster can learn upon leveling up
export function getSpellsForLevel(className, newLevel) {
  const spellData = CLASS_SPELLS_BY_LEVEL[className]
  if (!spellData) return { cantrips: [], spells: [] }

  const cantrips = []
  const spells   = []

  // Classes that get new cantrips at specific levels
  const cantripLevels = { Wizard:[1,4,10], Cleric:[1,4,10], Druid:[1,4,10], Sorcerer:[1,4,10], Warlock:[1,4,10], Bard:[1,4,10] }
  if (cantripLevels[className]?.includes(newLevel)) {
    cantrips.push(...(spellData.cantrip || []))
  }

  // Which spell level unlocks at this character level?
  const spellLevelUnlock = {
    1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 5,
    11: 6, 13: 7, 15: 8, 17: 9
  }

  for (let charLvl = 1; charLvl <= newLevel; charLvl++) {
    const unlock = spellLevelUnlock[charLvl]
    if (unlock && spellData[unlock]) {
      spells.push(...spellData[unlock].map(s => ({ spell: s, level: unlock })))
    }
  }

  // Deduplicate
  const uniqueSpells = spells.filter((s, i, arr) => arr.findIndex(x => x.spell === s.spell) === i)

  return { cantrips, spells: uniqueSpells }
}

// Number of new spells to pick per level per class
export function getSpellsToLearnCount(className, newLevel) {
  const fullCasters  = ['Wizard','Sorcerer','Bard']
  const halfCasters  = ['Paladin','Ranger']
  const divineCasters = ['Cleric','Druid']  // Know all spells of their level

  if (divineCasters.includes(className)) return 0  // They auto-know all
  if (fullCasters.includes(className))  return 2   // 2 new spells per level
  if (halfCasters.includes(className))  return 1   // 1 new spell per level
  if (className === 'Warlock')          return 1   // 1 new spell per level
  return 0
}

// HP rolled per level (average + CON modifier)
export function hpGainForLevel(className, constitutionMod) {
  const hitDice = { Barbarian:12,Fighter:10,Paladin:10,Ranger:10,Monk:8,Rogue:8,Cleric:8,Druid:8,Bard:8,Warlock:8,Wizard:6,Sorcerer:6 }
  const die     = hitDice[className] || 8
  const average = Math.floor(die / 2) + 1
  return Math.max(1, average + constitutionMod)
}

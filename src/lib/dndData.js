// src/lib/dndData.js
// ══════════════════════════════════════════════════════════
// Complete D&D 5e mechanical data — replaces all hardcoded
// character creation values. Every choice has real effects.
// Pulled from SRD. Used by CharacterCreation + LevelUpModal.
// ══════════════════════════════════════════════════════════

// ── RACES — full ASI + traits ──────────────────────────────
export const RACES = [
  {
    name: 'Human', icon: '👨',
    desc: 'Versatile and ambitious. Most common race in Faerûn.',
    asi: { strength:1, dexterity:1, constitution:1, intelligence:1, wisdom:1, charisma:1 },
    traits: [
      { name: 'Extra Language', desc: 'You speak one additional language.' },
      { name: 'Extra Skill',    desc: 'Proficiency in one additional skill of your choice.' },
    ],
    speed: 30, size: 'Medium',
    languages: ['Common', 'one extra'],
  },
  {
    name: 'Elf', icon: '🧝',
    desc: 'Graceful, perceptive, and long-lived.',
    asi: { dexterity: 2 },
    traits: [
      { name: 'Darkvision',           desc: '60 ft. See in darkness as dim light.' },
      { name: 'Keen Senses',          desc: 'Proficiency in Perception.' },
      { name: 'Fey Ancestry',         desc: 'Advantage on saves vs. charm. Can\'t be magically put to sleep.' },
      { name: 'Trance',               desc: 'Meditate 4 hours instead of sleeping 8.' },
    ],
    subrace: [
      { name: 'High Elf',   asi: { intelligence: 1 }, traits: ['Cantrip (Wizard list)', 'Extra language'] },
      { name: 'Wood Elf',   asi: { wisdom: 1 },       traits: ['Fleet of Foot (35 ft speed)', 'Mask of the Wild'] },
      { name: 'Dark Elf (Drow)', asi: { charisma: 1 }, traits: ['Superior Darkvision 120ft', 'Sunlight Sensitivity', 'Drow Magic'] },
    ],
    speed: 30, size: 'Medium',
    proficiencies: ['Perception'],
  },
  {
    name: 'Dwarf', icon: '⛏️',
    desc: 'Hardy mountain folk. Resistant to poison and renowned smiths.',
    asi: { constitution: 2 },
    traits: [
      { name: 'Darkvision',          desc: '60 ft.' },
      { name: 'Dwarven Resilience',  desc: 'Advantage on saves vs. poison. Resistance to poison damage.' },
      { name: 'Dwarven Combat Training', desc: 'Proficiency in battleaxe, handaxe, throwing hammer, warhammer.' },
      { name: 'Stonecunning',        desc: 'Double proficiency on History checks about stonework.' },
      { name: 'Tool Proficiency',    desc: 'Proficiency with smith\'s, brewer\'s, or mason\'s tools.' },
    ],
    subrace: [
      { name: 'Hill Dwarf',     asi: { wisdom: 1 },    traits: ['Dwarven Toughness: +1 HP per level'] },
      { name: 'Mountain Dwarf', asi: { strength: 2 },  traits: ['Dwarven Armor Training: light and medium armor'] },
    ],
    speed: 25, size: 'Medium',
    languages: ['Common', 'Dwarvish'],
  },
  {
    name: 'Halfling', icon: '🌿',
    desc: 'Small and lucky. Brave despite their size.',
    asi: { dexterity: 2 },
    traits: [
      { name: 'Lucky',          desc: 'When you roll a 1 on a d20, reroll and use the new result.' },
      { name: 'Brave',          desc: 'Advantage on saves against being frightened.' },
      { name: 'Halfling Nimbleness', desc: 'Can move through the space of any larger creature.' },
    ],
    subrace: [
      { name: 'Lightfoot',  asi: { charisma: 1 }, traits: ['Naturally Stealthy: can hide behind creatures one size larger'] },
      { name: 'Stout',      asi: { constitution: 1 }, traits: ['Stout Resilience: advantage vs poison, poison resistance'] },
    ],
    speed: 25, size: 'Small',
    languages: ['Common', 'Halfling'],
  },
  {
    name: 'Gnome', icon: '🔮',
    desc: 'Curious and inventive, with natural magic resistance.',
    asi: { intelligence: 2 },
    traits: [
      { name: 'Darkvision',     desc: '60 ft.' },
      { name: 'Gnome Cunning',  desc: 'Advantage on INT/WIS/CHA saves against magic.' },
    ],
    subrace: [
      { name: 'Forest Gnome', asi: { dexterity: 1 }, traits: ['Minor Illusion cantrip', 'Speak With Small Beasts'] },
      { name: 'Rock Gnome',   asi: { constitution: 1 }, traits: ['Artificer\'s Lore', 'Tinker: construct tiny clockwork devices'] },
    ],
    speed: 25, size: 'Small',
    languages: ['Common', 'Gnomish'],
  },
  {
    name: 'Half-Elf', icon: '🌙',
    desc: 'Human adaptability with elven grace. Charismatic natural leaders.',
    asi: { charisma: 2, _choose2: 1 },  // +1 to any two other stats
    traits: [
      { name: 'Darkvision',    desc: '60 ft.' },
      { name: 'Fey Ancestry',  desc: 'Advantage on saves vs. charm. Can\'t be magically slept.' },
      { name: 'Skill Versatility', desc: 'Proficiency in two additional skills of your choice.' },
    ],
    speed: 30, size: 'Medium',
    languages: ['Common', 'Elvish', 'one extra'],
    chooseTwoStats: true,
  },
  {
    name: 'Half-Orc', icon: '💪',
    desc: 'Fierce and enduring. Built for combat survival.',
    asi: { strength: 2, constitution: 1 },
    traits: [
      { name: 'Darkvision',            desc: '60 ft.' },
      { name: 'Menacing',              desc: 'Proficiency in Intimidation.' },
      { name: 'Relentless Endurance',  desc: 'Once per long rest, drop to 1 HP instead of 0.' },
      { name: 'Savage Attacks',        desc: 'On melee critical hit, roll one weapon die extra.' },
    ],
    speed: 30, size: 'Medium',
    proficiencies: ['Intimidation'],
    languages: ['Common', 'Orc'],
  },
  {
    name: 'Tiefling', icon: '😈',
    desc: 'Infernal heritage gives dark power and fire resistance.',
    asi: { charisma: 2, intelligence: 1 },
    traits: [
      { name: 'Darkvision',       desc: '60 ft.' },
      { name: 'Hellish Resistance', desc: 'Resistance to fire damage.' },
      { name: 'Infernal Legacy',  desc: 'Thaumaturgy cantrip. Hellish Rebuke 1/day at level 3. Darkness 1/day at level 5.' },
    ],
    speed: 30, size: 'Medium',
    languages: ['Common', 'Infernal'],
    spells: ['Thaumaturgy (cantrip)'],
  },
  {
    name: 'Dragonborn', icon: '🐲',
    desc: 'Draconic lineage gives breath weapon and elemental resistance.',
    asi: { strength: 2, charisma: 1 },
    traits: [
      { name: 'Draconic Ancestry', desc: 'Choose a dragon type (fire, cold, acid, lightning, poison, etc.).' },
      { name: 'Breath Weapon',    desc: '2d6 damage in 15-ft cone or 5×30-ft line. DEX save DC = 8 + CON mod + prof. Recharge on short/long rest.' },
      { name: 'Damage Resistance', desc: 'Resistance to your draconic ancestry damage type.' },
    ],
    speed: 30, size: 'Medium',
    languages: ['Common', 'Draconic'],
  },
  {
    name: 'Aasimar', icon: '😇',
    desc: 'Celestial origin. Blessed with healing and radiant power.',
    asi: { charisma: 2 },
    traits: [
      { name: 'Darkvision',     desc: '60 ft.' },
      { name: 'Celestial Resistance', desc: 'Resistance to necrotic and radiant damage.' },
      { name: 'Healing Hands', desc: 'Touch a creature and heal it for HP equal to your level (1/long rest).' },
      { name: 'Light Bearer',   desc: 'Light cantrip, always prepared.' },
    ],
    subrace: [
      { name: 'Protector Aasimar', asi: { wisdom: 1 }, traits: ['Radiant Soul: grow wings, fly 30ft, deal extra radiant damage'] },
      { name: 'Scourge Aasimar',   asi: { constitution: 1 }, traits: ['Radiant Consumption: deal radiant damage to nearby enemies'] },
      { name: 'Fallen Aasimar',    asi: { strength: 1 }, traits: ['Necrotic Shroud: frighten nearby enemies, deal extra necrotic damage'] },
    ],
    speed: 30, size: 'Medium',
    languages: ['Common', 'Celestial'],
  },
]

// ── CLASSES — full mechanical data ────────────────────────
export const CLASSES = [
  {
    name: 'Barbarian', icon: '🪓', spellcaster: false,
    desc: 'Primal warrior fueled by rage. Highest HP. Best sustained melee damage.',
    hitDie: 12,
    primaryStat: 'strength',
    savingThrows: ['strength', 'constitution'],
    armorProf: ['Light armor', 'Medium armor', 'Shields'],
    weaponProf: ['Simple weapons', 'Martial weapons'],
    skillChoices: { count: 2, from: ['Animal Handling','Athletics','Intimidation','Nature','Perception','Survival'] },
    startingEquipment: [
      { choice: [['Greataxe'], ['Martial melee weapon']] },
      { choice: [['Handaxe', 'Handaxe'], ['Simple melee weapon']] },
      { fixed: ['Explorer\'s Pack', 'Javelin', 'Javelin', 'Javelin', 'Javelin'] },
    ],
    startingGold: 0,  // Barbarians use equipment, not gold start
    features: {
      1: [
        { name: 'Rage', desc: 'Bonus action. Advantage on STR checks/saves. +2 damage on STR melee attacks. Resistance to bludgeoning, piercing, slashing damage. Lasts 1 minute. Uses: 2/long rest (more at higher levels).' },
        { name: 'Unarmored Defense', desc: 'AC = 10 + DEX mod + CON mod when not wearing armor.' },
      ],
      2: [
        { name: 'Reckless Attack', desc: 'First attack each turn: advantage on all STR attack rolls this turn. Enemies also have advantage against you until your next turn.' },
        { name: 'Danger Sense', desc: 'Advantage on DEX saves against effects you can see (traps, spells). Not blinded/deafened/incapacitated.' },
      ],
      3: [{ name: 'Primal Path', desc: 'Choose your subclass archetype.' }],
      4: [{ name: 'Ability Score Improvement', desc: '+2 to one stat or +1 to two stats (max 20).' }],
      5: [
        { name: 'Extra Attack', desc: 'Attack twice when you take the Attack action.' },
        { name: 'Fast Movement', desc: '+10 ft movement speed when not wearing heavy armor.' },
      ],
    },
    subclasses: ['Path of the Berserker', 'Path of the Totem Warrior', 'Path of the Ancestral Guardian', 'Path of the Storm Herald', 'Path of the Zealot'],
    spellSlots: null,
  },
  {
    name: 'Fighter', icon: '⚔️', spellcaster: false,
    desc: 'Master of weapons and tactics. Extra Attack, Action Surge, Second Wind.',
    hitDie: 10,
    primaryStat: 'strength',
    savingThrows: ['strength', 'constitution'],
    armorProf: ['All armor', 'Shields'],
    weaponProf: ['Simple weapons', 'Martial weapons'],
    skillChoices: { count: 2, from: ['Acrobatics','Animal Handling','Athletics','History','Insight','Intimidation','Perception','Survival'] },
    startingEquipment: [
      { choice: [['Chain Mail'], ['Leather Armor', 'Longbow', 'Arrow (×20)']] },
      { choice: [['Martial weapon', 'Shield'], ['Martial weapon', 'Martial weapon']] },
      { choice: [['Light Crossbow', 'Bolt (×20)'], ['Handaxe', 'Handaxe']] },
      { choice: [["Dungeoneer's Pack"], ["Explorer's Pack"]] },
    ],
    startingGold: 0,
    features: {
      1: [
        { name: 'Fighting Style', desc: 'Choose one: Archery (+2 ranged attacks), Defense (+1 AC in armor), Dueling (+2 damage 1-hand weapon), Great Weapon Fighting (reroll 1-2 on damage), Protection (impose disadvantage on attacker), Two-Weapon Fighting (add stat mod to off-hand).' },
        { name: 'Second Wind', desc: 'Bonus action: regain 1d10 + Fighter level HP. 1/short rest.' },
      ],
      2: [{ name: 'Action Surge', desc: 'Take one additional action on your turn. 1/short rest (2/short rest at level 17).' }],
      3: [{ name: 'Martial Archetype', desc: 'Choose your subclass.' }],
      4: [{ name: 'Ability Score Improvement', desc: '+2 to one stat or +1 to two stats.' }],
      5: [{ name: 'Extra Attack', desc: 'Attack twice when you take the Attack action (3× at level 11, 4× at level 20).' }],
    },
    subclasses: ['Champion', 'Battle Master', 'Eldritch Knight', 'Arcane Archer', 'Cavalier', 'Samurai', 'Psi Warrior'],
    spellSlots: null,
  },
  {
    name: 'Rogue', icon: '🗡️', spellcaster: false,
    desc: 'Sneak Attack, Cunning Action, expertise in skills. Most skills of any class.',
    hitDie: 8,
    primaryStat: 'dexterity',
    savingThrows: ['dexterity', 'intelligence'],
    armorProf: ['Light armor'],
    weaponProf: ['Simple weapons', 'Hand crossbows', 'Longswords', 'Rapiers', 'Shortswords'],
    skillChoices: { count: 4, from: ['Acrobatics','Athletics','Deception','Insight','Intimidation','Investigation','Perception','Performance','Persuasion','Sleight of Hand','Stealth'] },
    startingEquipment: [
      { choice: [['Rapier'], ['Shortsword']] },
      { choice: [['Shortbow', 'Arrow (×20)', 'Quiver'], ['Shortsword']] },
      { choice: [["Burglar's Pack"], ["Dungeoneer's Pack"], ["Explorer's Pack"]] },
      { fixed: ['Leather Armor', 'Dagger', 'Dagger', "Thieves' Tools"] },
    ],
    startingGold: 0,
    features: {
      1: [
        { name: 'Sneak Attack', desc: '1d6 extra damage when you have advantage, or an ally is adjacent to your target. Must use finesse or ranged weapon. Scales with level (1d6 at L1, 2d6 at L3...).' },
        { name: 'Thieves\' Cant', desc: 'Secret language used by rogues. Hidden messages in conversation.' },
        { name: 'Expertise', desc: 'Double proficiency bonus on two chosen skills (or Thieves\' Tools).' },
      ],
      2: [{ name: 'Cunning Action', desc: 'Bonus action to Dash, Disengage, or Hide each turn.' }],
      3: [
        { name: 'Roguish Archetype', desc: 'Choose your subclass.' },
        { name: 'Expertise (2nd)', desc: 'Double proficiency on two more skills.' },
      ],
      4: [{ name: 'Ability Score Improvement', desc: '+2 to one stat or +1 to two stats.' }],
      5: [{ name: 'Uncanny Dodge', desc: 'When attacked, use your reaction to halve the damage.' }],
    },
    subclasses: ['Thief', 'Assassin', 'Arcane Trickster', 'Inquisitive', 'Mastermind', 'Scout', 'Swashbuckler', 'Phantom'],
    spellSlots: null,
  },
  {
    name: 'Monk', icon: '👊', spellcaster: false,
    desc: 'Martial arts master. Ki powers. Fast. Stunning Strike.',
    hitDie: 8,
    primaryStat: 'dexterity',
    savingThrows: ['strength', 'dexterity'],
    armorProf: [],
    weaponProf: ['Simple weapons', 'Shortswords'],
    skillChoices: { count: 2, from: ['Acrobatics','Athletics','History','Insight','Religion','Stealth'] },
    startingEquipment: [
      { choice: [['Shortsword'], ['Simple weapon']] },
      { choice: [["Dungeoneer's Pack"], ["Explorer's Pack"]] },
      { fixed: ['Dart (×10)'] },
    ],
    startingGold: 0,
    features: {
      1: [
        { name: 'Unarmored Defense', desc: 'AC = 10 + DEX mod + WIS mod when not wearing armor or shield.' },
        { name: 'Martial Arts', desc: 'Use DEX for unarmed/monk weapon attacks. Unarmed = 1d4 (scales up). Bonus action unarmed attack after Attack action.' },
      ],
      2: [
        { name: 'Ki', desc: '2 Ki points (= level). Regain on short rest. Powers: Flurry of Blows (2 unarmed bonus action attacks), Patient Defense (Dodge as bonus), Step of the Wind (Dash/Disengage as bonus).' },
        { name: 'Unarmored Movement', desc: '+10 ft speed (scales up). At level 9: run on walls/water.' },
      ],
      3: [
        { name: 'Monastic Tradition', desc: 'Choose your subclass.' },
        { name: 'Deflect Missiles', desc: 'Reaction: reduce ranged weapon damage by 1d10 + DEX + Monk level. If reduced to 0, catch and throw back (1 Ki).' },
      ],
      4: [
        { name: 'Ability Score Improvement', desc: '+2 to one stat or +1 to two stats.' },
        { name: 'Slow Fall', desc: 'Reaction: reduce fall damage by 5 × Monk level.' },
      ],
      5: [
        { name: 'Extra Attack', desc: 'Attack twice when you take the Attack action.' },
        { name: 'Stunning Strike', desc: 'After hitting, spend 1 Ki: target CON save or Stunned until end of your next turn.' },
      ],
    },
    subclasses: ['Way of the Open Hand', 'Way of Shadow', 'Way of the Four Elements', 'Way of the Drunken Master', 'Way of the Kensei', 'Way of the Sun Soul'],
    spellSlots: null,
  },
  {
    name: 'Paladin', icon: '⚜️', spellcaster: true,
    desc: 'Holy warrior. Divine Smite explodes on crits. Auras protect the party.',
    hitDie: 10,
    primaryStat: 'strength',
    castingStat: 'charisma',
    savingThrows: ['wisdom', 'charisma'],
    armorProf: ['All armor', 'Shields'],
    weaponProf: ['Simple weapons', 'Martial weapons'],
    skillChoices: { count: 2, from: ['Athletics','Insight','Intimidation','Medicine','Persuasion','Religion'] },
    startingEquipment: [
      { choice: [['Martial weapon', 'Shield'], ['Martial weapon', 'Martial weapon']] },
      { choice: [['Javelin', 'Javelin', 'Javelin', 'Javelin', 'Javelin'], ['Simple melee weapon']] },
      { choice: [["Priest's Pack"], ["Explorer's Pack"]] },
      { fixed: ['Chain Mail', 'Holy Symbol'] },
    ],
    startingGold: 0,
    features: {
      1: [
        { name: 'Divine Sense', desc: 'Know location of celestials, fiends, undead within 60 ft. 1 + CHA mod uses per long rest.' },
        { name: 'Lay on Hands', desc: 'Pool of HP = 5 × Paladin level. Touch to restore HP or cure disease/poison (5 HP from pool).' },
      ],
      2: [
        { name: 'Fighting Style', desc: 'Choose: Defense, Dueling, Great Weapon, or Protection.' },
        { name: 'Spellcasting', desc: 'CHA-based. Prepared spells = CHA mod + half Paladin level. Spell slots per spell slot table.' },
        { name: 'Divine Smite', desc: 'Expend spell slot on hit: 2d8 + 1d8 per slot level above 1st radiant damage (doubled vs undead/fiends). Crits double smite dice too.' },
      ],
      3: [
        { name: 'Divine Health', desc: 'Immune to disease.' },
        { name: 'Sacred Oath', desc: 'Choose your subclass. Gain Oath Spells (always prepared) and Channel Divinity.' },
      ],
      4: [{ name: 'Ability Score Improvement', desc: '+2 to one or +1 to two stats.' }],
      5: [{ name: 'Extra Attack', desc: 'Attack twice when you take the Attack action.' }],
    },
    subclasses: ['Oath of Devotion', 'Oath of the Ancients', 'Oath of Vengeance', 'Oathbreaker', 'Oath of Glory', 'Oath of Conquest'],
    spellSlots: { 1:2, 2:2, 3:3, 4:3, 5:4 },
  },
  {
    name: 'Ranger', icon: '🏹', spellcaster: true,
    desc: 'Wilderness hunter. Favored Enemy. Natural Explorer. Versatile fighter.',
    hitDie: 10,
    primaryStat: 'dexterity',
    castingStat: 'wisdom',
    savingThrows: ['strength', 'dexterity'],
    armorProf: ['Light armor', 'Medium armor', 'Shields'],
    weaponProf: ['Simple weapons', 'Martial weapons'],
    skillChoices: { count: 3, from: ['Animal Handling','Athletics','Insight','Investigation','Nature','Perception','Stealth','Survival'] },
    startingEquipment: [
      { choice: [['Scale Mail'], ['Leather Armor']] },
      { choice: [['Shortsword', 'Shortsword'], ['Simple melee weapon', 'Simple melee weapon']] },
      { choice: [["Dungeoneer's Pack"], ["Explorer's Pack"]] },
      { fixed: ['Longbow', 'Arrow (×20)'] },
    ],
    startingGold: 0,
    features: {
      1: [
        { name: 'Favored Enemy', desc: 'Choose 1 creature type. Advantage on Survival to track, advantage on INT checks about it. One additional at levels 6 and 14.' },
        { name: 'Natural Explorer', desc: 'Choose 1 terrain type. Double proficiency on INT/WIS checks there. Difficult terrain doesn\'t slow group. Always alert vs surprise.' },
      ],
      2: [
        { name: 'Fighting Style', desc: 'Choose: Archery, Defense, Dueling, or Two-Weapon.' },
        { name: 'Spellcasting', desc: 'WIS-based. Spells known (not prepared). Half-caster slot progression.' },
      ],
      3: [
        { name: 'Ranger Archetype', desc: 'Choose your subclass.' },
        { name: 'Primeval Awareness', desc: 'Spend spell slot to sense creature types within 1 mile (6 miles in favored terrain) for 1 min/slot level.' },
      ],
      4: [{ name: 'Ability Score Improvement', desc: '+2 to one or +1 to two stats.' }],
      5: [{ name: 'Extra Attack', desc: 'Attack twice when you take the Attack action.' }],
    },
    subclasses: ['Hunter', 'Beast Master', 'Gloom Stalker', 'Horizon Walker', 'Monster Slayer', 'Fey Wanderer'],
    spellSlots: { 1:2, 2:2, 3:3, 4:3, 5:4 },
  },
  {
    name: 'Cleric', icon: '🙏', spellcaster: true,
    desc: 'Divine caster. Channel Divinity. Best healer. Domain gives unique powers.',
    hitDie: 8,
    primaryStat: 'wisdom',
    castingStat: 'wisdom',
    savingThrows: ['wisdom', 'charisma'],
    armorProf: ['Light armor', 'Medium armor', 'Shields'],
    weaponProf: ['Simple weapons'],
    skillChoices: { count: 2, from: ['History','Insight','Medicine','Persuasion','Religion'] },
    startingEquipment: [
      { choice: [['Mace'], ['Warhammer (if proficient)']] },
      { choice: [['Scale Mail'], ['Leather Armor'], ['Chain Mail (if proficient)']] },
      { choice: [['Light Crossbow', 'Bolt (×20)'], ['Simple weapon']] },
      { choice: [["Priest's Pack"], ["Explorer's Pack"]] },
      { fixed: ['Shield', 'Holy Symbol'] },
    ],
    startingGold: 0,
    features: {
      1: [
        { name: 'Spellcasting', desc: 'WIS-based. Prepare spells = WIS mod + Cleric level. All Cleric spells available to prepare.' },
        { name: 'Divine Domain', desc: 'Choose subclass at level 1. Domain spells always prepared. Channel Divinity option.' },
      ],
      2: [
        { name: 'Channel Divinity (1/rest)', desc: 'Turn Undead: undead within 30 ft must flee (WIS save). Domain-specific power.' },
        { name: 'Domain Feature', desc: 'Subclass grants a unique feature at level 2.' },
      ],
      3: [{ name: 'Domain Spells', desc: 'Two more domain spells added to always-prepared list.' }],
      4: [{ name: 'Ability Score Improvement', desc: '+2 to one or +1 to two stats.' }],
      5: [
        { name: 'Destroy Undead (CR 1/2)', desc: 'Turn Undead instantly destroys undead of CR 1/2 or lower.' },
        { name: '3rd-Level Domain Spells', desc: 'Two more domain spells added.' },
      ],
    },
    subclasses: ['Life Domain', 'Light Domain', 'Trickery Domain', 'War Domain', 'Knowledge Domain', 'Nature Domain', 'Tempest Domain', 'Death Domain (Evil)', 'Forge Domain', 'Grave Domain'],
    spellSlots: { 1:2, 2:3, 3:4, 4:4, 5:4 },
  },
  {
    name: 'Druid', icon: '🌿', spellcaster: true,
    desc: 'Nature mage. Wild Shape into beasts. Controls the battlefield.',
    hitDie: 8,
    primaryStat: 'wisdom',
    castingStat: 'wisdom',
    savingThrows: ['intelligence', 'wisdom'],
    armorProf: ['Light armor (non-metal)', 'Medium armor (non-metal)', 'Shields (non-metal)'],
    weaponProf: ['Clubs', 'Daggers', 'Darts', 'Javelins', 'Maces', 'Quarterstaffs', 'Scimitars', 'Sickles', 'Slings', 'Spears'],
    skillChoices: { count: 2, from: ['Arcana','Animal Handling','Insight','Medicine','Nature','Perception','Religion','Survival'] },
    startingEquipment: [
      { choice: [['Wooden Shield'], ['Simple weapon']] },
      { choice: [['Scimitar'], ['Simple melee weapon']] },
      { fixed: ['Leather Armor', 'Explorer\'s Pack', 'Druidic Focus'] },
    ],
    startingGold: 0,
    features: {
      1: [
        { name: 'Spellcasting', desc: 'WIS-based. Prepare WIS mod + Druid level spells per day. Entire Druid list available.' },
        { name: 'Druidic', desc: 'Secret language only druids know. Can leave hidden messages.' },
      ],
      2: [
        { name: 'Wild Shape (2/rest)', desc: 'Bonus action: transform into beast you\'ve seen. CR 1/4 (no fly/swim) at level 2, CR 1/2 at level 4, CR 1 at level 8. Gain beast\'s HP, STR, DEX, CON. Keep INT, WIS, CHA, skills, saves.' },
        { name: 'Druid Circle', desc: 'Choose subclass.' },
      ],
      4: [{ name: 'Wild Shape Improvement', desc: 'Can now use CR 1/2 beasts. Can swim.' }, { name: 'Ability Score Improvement', desc: '+2 to one or +1 to two stats.' }],
      5: [{ name: '3rd-Level Spells', desc: 'Unlock 3rd-level spell slots.' }],
    },
    subclasses: ['Circle of the Land', 'Circle of the Moon', 'Circle of Dreams', 'Circle of the Shepherd', 'Circle of Spores', 'Circle of Stars', 'Circle of Wildfire'],
    spellSlots: { 1:2, 2:3, 3:4, 4:4, 5:4 },
  },
  {
    name: 'Bard', icon: '🎸', spellcaster: true,
    desc: 'Charismatic performer. Bardic Inspiration. Knows spells from ANY class list.',
    hitDie: 8,
    primaryStat: 'charisma',
    castingStat: 'charisma',
    savingThrows: ['dexterity', 'charisma'],
    armorProf: ['Light armor'],
    weaponProf: ['Simple weapons', 'Hand crossbows', 'Longswords', 'Rapiers', 'Shortswords'],
    skillChoices: { count: 3, from: 'any' },
    startingEquipment: [
      { choice: [['Rapier'], ['Longsword'], ['Simple weapon']] },
      { choice: [["Diplomat's Pack"], ["Entertainer's Pack"]] },
      { choice: [['Lute'], ['Musical instrument']] },
      { fixed: ['Leather Armor', 'Dagger'] },
    ],
    startingGold: 0,
    features: {
      1: [
        { name: 'Spellcasting', desc: 'CHA-based. Spells known (not prepared) from Bard list + any class via Magical Secrets.' },
        { name: 'Bardic Inspiration (d6)', desc: 'Bonus action: give 1 creature a d6 to add to one ability check, attack roll, or save in next 10 min. CHA mod uses/long rest (or short rest at level 5).' },
      ],
      2: [
        { name: 'Jack of All Trades', desc: 'Add half proficiency to any skill you\'re not proficient in.' },
        { name: 'Song of Rest', desc: 'During short rest, you and friendly creatures regain extra 1d6 HP when spending Hit Dice.' },
      ],
      3: [
        { name: 'Bard College', desc: 'Choose subclass.' },
        { name: 'Expertise', desc: 'Double proficiency on two chosen skills.' },
        { name: 'Bardic Inspiration (d6 → stays d6 until 5)', desc: '' },
      ],
      4: [{ name: 'Ability Score Improvement', desc: '+2 to one or +1 to two stats.' }],
      5: [
        { name: 'Bardic Inspiration (d8)', desc: 'Die improves to d8.' },
        { name: 'Font of Inspiration', desc: 'Regain Bardic Inspiration on short or long rest.' },
      ],
    },
    subclasses: ['College of Lore', 'College of Valor', 'College of Glamour', 'College of Swords', 'College of Whispers', 'College of Eloquence', 'College of Creation'],
    spellSlots: { 1:2, 2:3, 3:4, 4:4, 5:4 },
  },
  {
    name: 'Wizard', icon: '📚', spellcaster: true,
    desc: 'Most spells in the game. Spellbook. Arcane Recovery. Most powerful at high levels.',
    hitDie: 6,
    primaryStat: 'intelligence',
    castingStat: 'intelligence',
    savingThrows: ['intelligence', 'wisdom'],
    armorProf: [],
    weaponProf: ['Daggers', 'Darts', 'Slings', 'Quarterstaffs', 'Light crossbows'],
    skillChoices: { count: 2, from: ['Arcana','History','Insight','Investigation','Medicine','Religion'] },
    startingEquipment: [
      { choice: [['Quarterstaff'], ['Dagger']] },
      { choice: [["Scholar's Pack"], ["Explorer's Pack"]] },
      { fixed: ['Spellbook', 'Arcane Focus'] },
    ],
    startingGold: 0,
    features: {
      1: [
        { name: 'Spellcasting', desc: 'INT-based. Spellbook contains 6 spells at level 1. Prepare INT mod + level spells per day. Learn 2 more spells per level.' },
        { name: 'Arcane Recovery (1/day)', desc: 'During short rest, recover spell slots with total level ≤ half Wizard level (round up). Max slot level 5.' },
      ],
      2: [{ name: 'Arcane Tradition', desc: 'Choose subclass school of magic.' }],
      4: [{ name: 'Ability Score Improvement', desc: '+2 to one or +1 to two stats.' }],
      5: [{ name: '3rd-Level Spells', desc: 'Unlock 3rd-level spell slots.' }],
    },
    subclasses: ['School of Evocation', 'School of Abjuration', 'School of Conjuration', 'School of Divination', 'School of Enchantment', 'School of Illusion', 'School of Necromancy', 'School of Transmutation', 'Bladesinging', 'Chronurgy', 'Graviturgy', 'Order of Scribes'],
    spellSlots: { 1:2, 2:3, 3:4, 4:4, 5:4 },
  },
  {
    name: 'Sorcerer', icon: '✨', spellcaster: true,
    desc: 'Innate magic. Metamagic twists spells. Sorcery Points for flexibility.',
    hitDie: 6,
    primaryStat: 'charisma',
    castingStat: 'charisma',
    savingThrows: ['constitution', 'charisma'],
    armorProf: [],
    weaponProf: ['Daggers', 'Darts', 'Slings', 'Quarterstaffs', 'Light crossbows'],
    skillChoices: { count: 2, from: ['Arcana','Deception','Insight','Intimidation','Persuasion','Religion'] },
    startingEquipment: [
      { choice: [['Light Crossbow', 'Bolt (×20)'], ['Simple weapon']] },
      { choice: [["Dungeoneer's Pack"], ["Explorer's Pack"]] },
      { choice: [['Arcane Focus'], ['Two Daggers']] },
    ],
    startingGold: 0,
    features: {
      1: [
        { name: 'Spellcasting', desc: 'CHA-based. Spells known (not prepared). Fewer spells than Wizard but flexible.' },
        { name: 'Sorcerous Origin', desc: 'Choose subclass at level 1.' },
      ],
      2: [
        { name: 'Font of Magic', desc: '2 Sorcery Points (= level, max 20). Convert to spell slots or use for Metamagic. 1 SP → 1st slot needs 2 SP, 2nd→3, 3rd→5, 4th→6, 5th→7. Or convert slots to SP.' },
        { name: 'Metamagic (2 options)', desc: 'Careful Spell, Distant Spell, Empowered Spell, Extended Spell, Heightened Spell, Quickened Spell, Subtle Spell, Twinned Spell. Choose 2.' },
      ],
      3: [{ name: 'Metamagic Known', desc: 'Know 2 options at level 3, gain another at 10 and 17.' }],
      4: [{ name: 'Ability Score Improvement', desc: '+2 to one or +1 to two stats.' }],
    },
    subclasses: ['Draconic Bloodline', 'Wild Magic', 'Divine Soul', 'Shadow Magic', 'Storm Sorcery', 'Aberrant Mind', 'Clockwork Soul'],
    spellSlots: { 1:2, 2:3, 3:4, 4:4, 5:4 },
  },
  {
    name: 'Warlock', icon: '🌑', spellcaster: true,
    desc: 'Pact magic recharges on short rest. Eldritch Blast. Invocations customize your build.',
    hitDie: 8,
    primaryStat: 'charisma',
    castingStat: 'charisma',
    savingThrows: ['wisdom', 'charisma'],
    armorProf: ['Light armor'],
    weaponProf: ['Simple weapons'],
    skillChoices: { count: 2, from: ['Arcana','Deception','History','Intimidation','Investigation','Nature','Religion'] },
    startingEquipment: [
      { choice: [['Light Crossbow', 'Bolt (×20)'], ['Simple weapon']] },
      { choice: [["Scholar's Pack"], ["Dungeoneer's Pack"]] },
      { choice: [['Arcane Focus'], ['Simple weapon']] },
      { fixed: ['Leather Armor', 'Dagger', 'Dagger'] },
    ],
    startingGold: 0,
    features: {
      1: [
        { name: 'Otherworldly Patron', desc: 'Choose subclass.' },
        { name: 'Pact Magic', desc: 'CHA-based. 1 spell slot at level 1, 2 at level 2. ALWAYS 5th-level by level 9. Regain ALL slots on short or long rest.' },
        { name: 'Expanded Spell List', desc: 'Patron grants bonus spells always known.' },
      ],
      2: [
        { name: 'Eldritch Invocations (2)', desc: 'Choose 2 permanent enhancements: Agonizing Blast (+CHA to EB damage), Armor of Shadows (Mage Armor at will), Devil\'s Sight (120ft in magical darkness), Repelling Blast (push 10ft), Thirsting Blade (extra attack with pact weapon), and more.' },
      ],
      3: [
        { name: 'Pact Boon', desc: 'Pact of the Blade (summon magic weapon), Pact of the Chain (familiar with unique form), or Pact of the Tome (3 cantrips from any class list).' },
        { name: 'Eldritch Invocations (3rd)', desc: 'Learn one more invocation.' },
      ],
      4: [{ name: 'Ability Score Improvement', desc: '+2 to one or +1 to two stats.' }],
      5: [{ name: '3rd-Level Spells', desc: 'Can now choose 3rd-level spells. Still only 2 slots but they\'re always 3rd level now.' }],
    },
    subclasses: ['The Fiend', 'The Great Old One', 'The Archfey', 'The Undying', 'The Celestial', 'The Hexblade', 'The Genie'],
    spellSlots: { 1:1, 2:2, 3:2, 4:2, 5:2 }, // warlock slots are special
  },
]

// ── BACKGROUNDS — full mechanical data ────────────────────
export const BACKGROUNDS = [
  {
    name: 'Acolyte', icon: '⛪',
    desc: 'You have spent your life in service to a temple. You command respect among those who share your faith.',
    skills: ['Insight', 'Religion'],
    tools: [],
    languages: 2,
    equipment: ['Holy Symbol', 'Prayer Book', 'Incense (×5)', 'Vestments', "Explorer's Pack", '15 gp'],
    feature: { name: 'Shelter of the Faithful', desc: 'Your temple provides room and board. You can call on your faith for help.' },
    traits: ['I quote scripture in almost every situation.', 'I am tolerant of other faiths and respect their devotion.'],
  },
  {
    name: 'Criminal', icon: '🗡️',
    desc: 'You have a history of breaking the law and have contacts in the underworld.',
    skills: ['Deception', 'Stealth'],
    tools: ["Thieves' Tools", 'Gaming set'],
    languages: 0,
    equipment: ["Crowbar", "Dark Common Clothes with Hood", "Belt Pouch", "15 gp"],
    feature: { name: 'Criminal Contact', desc: 'You know a reliable contact who can smuggle goods, gather rumors, or find black market wares.' },
    traits: ['I always have a plan for when things go wrong.', 'I am always calm, even in the face of disaster.'],
  },
  {
    name: 'Folk Hero', icon: '🏡',
    desc: 'You were an ordinary person who did something extraordinary, making you a champion of the common folk.',
    skills: ['Animal Handling', 'Survival'],
    tools: ["Artisan's Tools", 'Vehicles (land)'],
    languages: 0,
    equipment: ["Artisan's Tools", "Shovel", "Iron Pot", "Common Clothes", "Belt Pouch", "10 gp"],
    feature: { name: 'Rustic Hospitality', desc: 'Common folk will hide you and help you. They won\'t risk their lives but will keep your presence secret.' },
    traits: ['I judge people by their actions, not their words.', 'If someone is in trouble I\'m always willing to help.'],
  },
  {
    name: 'Noble', icon: '👑',
    desc: 'You were born into wealth and privilege. You are comfortable among the upper class.',
    skills: ['History', 'Persuasion'],
    tools: ['Gaming set'],
    languages: 1,
    equipment: ["Fine Clothes", "Signet Ring", "Scroll of Pedigree", "Purse of 25 gp"],
    feature: { name: 'Position of Privilege', desc: 'You can gain an audience with nobility. Common folk treat you with deference.' },
    traits: ['My eloquent flattery makes everyone I talk to feel like the most important person.', 'I take great pains to always look my best.'],
  },
  {
    name: 'Sage', icon: '📚',
    desc: 'You spent years studying the lore of the multiverse, consulting texts and teachers.',
    skills: ['Arcana', 'History'],
    tools: [],
    languages: 2,
    equipment: ["Bottle of Black Ink", "Quill", "Small Knife", "Letter from Dead Colleague", "Common Clothes", "Belt Pouch", "10 gp"],
    feature: { name: 'Researcher', desc: 'If you don\'t know a piece of information, you often know where to find it. Takes time but you rarely hit dead ends.' },
    traits: ['I use polysyllabic words to convey intelligence.', 'I\'ve read every book in the great libraries.'],
  },
  {
    name: 'Soldier', icon: '⚔️',
    desc: 'You were trained as a warrior and have seen battle. You know how war works.',
    skills: ['Athletics', 'Intimidation'],
    tools: ['Gaming set', 'Vehicles (land)'],
    languages: 0,
    equipment: ["Insignia of Rank", "Trophy from Fallen Enemy", "Deck of Cards or Dice Set", "Common Clothes", "Belt Pouch", "10 gp"],
    feature: { name: 'Military Rank', desc: 'Soldiers loyal to your former military will defer to you. You can access military camps and fortifications.' },
    traits: ['I face problems head on. A simple, direct solution is the best path.', 'I can stare down a hell hound without flinching.'],
  },
  {
    name: 'Outlander', icon: '🌲',
    desc: 'You grew up in the wilderness, far from civilization and its comforts.',
    skills: ['Athletics', 'Survival'],
    tools: ['Musical instrument'],
    languages: 1,
    equipment: ["Staff", "Hunting Trap", "Trophy from Animal Kill", "Traveler's Clothes", "Belt Pouch", "10 gp"],
    feature: { name: 'Wanderer', desc: 'Excellent memory for maps and geography. Can find food and fresh water daily for you and 5 others.' },
    traits: ['I\'m driven by wanderlust that led me away from home.', 'I watch over my friends as if they were a litter of newborn pups.'],
  },
  {
    name: 'Entertainer', icon: '🎭',
    desc: 'You thrive in front of an audience. You know how to entrance, entertain, and inspire.',
    skills: ['Acrobatics', 'Performance'],
    tools: ['Disguise Kit', 'Musical instrument'],
    languages: 0,
    equipment: ["Musical Instrument", "Costume", "Belt Pouch", "15 gp"],
    feature: { name: 'By Popular Demand', desc: 'You can always find a place to perform. In exchange, you receive free lodging and food of modest quality.' },
    traits: ['I know a story relevant to almost every situation.', 'I love a good insult, even one directed at me.'],
  },
  {
    name: 'Hermit', icon: '🏔️',
    desc: 'You lived in seclusion, communing with nature or meditating on great truths.',
    skills: ['Medicine', 'Religion'],
    tools: ["Herbalism Kit"],
    languages: 1,
    equipment: ["Scroll Case Stuffed with Notes", "Winter Blanket", "Common Clothes", "Herbalism Kit", "5 gp"],
    feature: { name: 'Discovery', desc: 'Your seclusion gave you access to a unique discovery — a truth about the cosmos, a forgotten deity, or a secret of the world.' },
    traits: ['I\'ve been isolated for so long I rarely talk, preferring gestures.', 'I connect everything that happens to a grand cosmic plan.'],
  },
  {
    name: 'Sailor', icon: '⚓',
    desc: 'You sailed on a seagoing vessel for years, weathering storms and navigating treacherous waters.',
    skills: ['Athletics', 'Perception'],
    tools: ["Navigator's Tools", 'Vehicles (water)'],
    languages: 0,
    equipment: ["Belaying Pin (Club)", "Silk Rope (50 ft)", "Lucky Charm", "Common Clothes", "Belt Pouch", "10 gp"],
    feature: { name: 'Ship\'s Passage', desc: 'You can secure free passage on a sailing ship for you and companions (not first class). You may need to help with the ship\'s work.' },
    traits: ['My friends know they can rely on me no matter what.', 'I work hard so I can play hard.'],
  },
  {
    name: 'Guild Artisan', icon: '🔨',
    desc: 'You were a member of an artisan\'s guild, skilled in a trade and valued for your contributions.',
    skills: ['Insight', 'Persuasion'],
    tools: ["Artisan's Tools"],
    languages: 1,
    equipment: ["Artisan's Tools", "Letter of Introduction from Guild", "Traveler's Clothes", "Belt Pouch", "15 gp"],
    feature: { name: 'Guild Membership', desc: 'Your guild provides a network of contacts. Members will give you lodging and food at cost. They can also help find work.' },
    traits: ['I believe if you work hard, you will be rewarded.', 'I\'m a snob who looks down on those who can\'t appreciate fine craftsmanship.'],
  },
  {
    name: 'Charlatan', icon: '🃏',
    desc: 'You always had a way with people. You know what makes them tick and how to exploit it.',
    skills: ['Deception', 'Sleight of Hand'],
    tools: ['Disguise Kit', 'Forgery Kit'],
    languages: 0,
    equipment: ["Fine Clothes", "Disguise Kit", "Con Tools (10 stoppered bottles, weighted dice, etc.)", "Belt Pouch", "15 gp"],
    feature: { name: 'False Identity', desc: 'You have a second identity: forged documents, established persona, contacts to back it up.' },
    traits: ['I fall in and out of love easily and am always pursuing someone.', 'I pocket anything I see that might have some value.'],
  },
]

// ── ALIGNMENTS ────────────────────────────────────────────
export const ALIGNMENTS = [
  { name:'Lawful Good',    short:'LG', icon:'⚖️',  desc:'The Crusader. Honor, justice, protecting the innocent.' },
  { name:'Neutral Good',   short:'NG', icon:'💛',  desc:'The Benefactor. Kindness without rigid rules.' },
  { name:'Chaotic Good',   short:'CG', icon:'🗽',  desc:'The Rebel. Freedom and doing what feels right.' },
  { name:'Lawful Neutral', short:'LN', icon:'📋',  desc:'The Judge. Order and law above all else.' },
  { name:'True Neutral',   short:'TN', icon:'☯️',  desc:'The Undecided. Balance in all things.' },
  { name:'Chaotic Neutral',short:'CN', icon:'🎲',  desc:'The Free Spirit. Personal freedom, unpredictable.' },
  { name:'Lawful Evil',    short:'LE', icon:'👑',  desc:'The Dominator. Power through discipline and order.' },
  { name:'Neutral Evil',   short:'NE', icon:'🐍',  desc:'The Malefactor. Pure self-interest, no loyalty.' },
  { name:'Chaotic Evil',   short:'CE', icon:'💀',  desc:'The Destroyer. Chaos and cruelty without reason.' },
]

// ── STATS ─────────────────────────────────────────────────
export const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8]
export const STAT_NAMES     = ['strength','dexterity','constitution','intelligence','wisdom','charisma']
export const STAT_LABELS    = { strength:'STR', dexterity:'DEX', constitution:'CON', intelligence:'INT', wisdom:'WIS', charisma:'CHA' }
export const STAT_DESC      = {
  strength:     'Melee attacks, Athletics, carrying',
  dexterity:    'AC, ranged attacks, Stealth, Acrobatics',
  constitution: 'Hit points, concentration saves',
  intelligence: 'Arcana, History, Investigation, Wizard spells',
  wisdom:       'Perception, Insight, Cleric/Druid spells',
  charisma:     'Persuasion, Deception, Bard/Sorcerer/Warlock spells',
}

// Apply racial ASI to a base stat block
export function applyRacialASI(stats, race) {
  const result = { ...stats }
  const raceData = RACES.find(r => r.name === race)
  if (!raceData?.asi) return result
  for (const [stat, bonus] of Object.entries(raceData.asi)) {
    if (stat === '_choose2') continue
    if (result[stat] !== undefined) result[stat] = Math.min(20, result[stat] + bonus)
  }
  return result
}

// Get racial traits as string array
export function getRaceTraits(raceName) {
  const race = RACES.find(r => r.name === raceName)
  return race?.traits?.map(t => `${t.name}: ${t.desc}`) || []
}

// Get class features at a given level
export function getClassFeatures(className, level) {
  const cls = CLASSES.find(c => c.name === className)
  if (!cls) return []
  const features = []
  for (let l = 1; l <= level; l++) {
    if (cls.features[l]) features.push(...cls.features[l])
  }
  return features
}

// Build starting equipment list from class data (real item names for inventory)
export function buildStartingEquipment(className, backgroundName) {
  const cls = CLASSES.find(c => c.name === className)
  const bg  = BACKGROUNDS.find(b => b.name === backgroundName)
  const items = []

  // Class equipment — pick first option from each choice
  if (cls?.startingEquipment) {
    for (const entry of cls.startingEquipment) {
      if (entry.fixed)  items.push(...entry.fixed)
      if (entry.choice) items.push(...entry.choice[0])  // always pick first option at character creation
    }
  }

  // Background equipment
  if (bg?.equipment) items.push(...bg.equipment)

  // Normalize: expand "×" notation
  const normalized = []
  for (const item of items) {
    const m = item.match(/^(.+?)\s*[×x\*]\s*(\d+)$/)
    if (m) {
      for (let i = 0; i < parseInt(m[2]); i++) normalized.push(m[1].trim())
    } else {
      normalized.push(item.trim())
    }
  }

  return normalized
}

// Extract gold from background equipment string like "15 gp"
export function getStartingGold(backgroundName) {
  const bg = BACKGROUNDS.find(b => b.name === backgroundName)
  if (!bg) return 10
  for (const item of bg.equipment || []) {
    const m = item.match(/(\d+)\s*gp/)
    if (m) return parseInt(m[1])
  }
  return 10
}

// Calculate HP at level 1 based on class and CON
export function calcMaxHP(className, constitution, level = 1) {
  const cls = CLASSES.find(c => c.name === className)
  const hit = cls?.hitDie || 8
  const con = Math.floor((constitution - 10) / 2)
  // Level 1: max hit die + CON
  // Higher levels: average (hitDie/2 + 1) + CON per level
  const base   = hit + con
  const higher = (level - 1) * (Math.floor(hit / 2) + 1 + con)
  return Math.max(1, base + higher)
}

// Calculate AC from equipped armor or class feature
export function calcBaseAC(className, dexterity, constitution) {
  const dexMod = Math.floor((dexterity - 10) / 2)
  const conMod = Math.floor((constitution - 10) / 2)
  // Unarmored defaults per class
  if (className === 'Barbarian') return 10 + dexMod + conMod   // Unarmored Defense
  if (className === 'Monk')      return 10 + dexMod + Math.floor(/* wis placeholder */ 0)
  return 10 + dexMod  // Everyone else: base unarmored (armor will override)
}

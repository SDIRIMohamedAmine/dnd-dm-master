// src/lib/subclasses.js
// All subclasses per class for character creation step

export const SUBCLASSES = {
  Barbarian: [
    { name: 'Path of the Berserker',    desc: 'Pure rage. Frenzied attacks, bonus strikes, intimidating presence.' },
    { name: 'Path of the Totem Warrior',desc: 'Spirit animal powers. Bear for toughness, wolf for pack tactics, eagle for speed.' },
    { name: 'Path of the Ancestral Guardian', desc: 'Summon ancestors in battle to protect allies and hinder enemies.' },
    { name: 'Path of the Storm Herald', desc: 'Elemental aura of storm, desert, or tundra energy around you.' },
    { name: 'Path of the Zealot',       desc: 'Divine fury. Your rage channels a god\'s power. Hard to kill.' },
  ],
  Fighter: [
    { name: 'Champion',         desc: 'Simple but deadly. Crits on 19-20. Extra athletics and fighting style.' },
    { name: 'Battle Master',    desc: 'Tactical superiority dice for special maneuvers. Most versatile Fighter.' },
    { name: 'Eldritch Knight',  desc: 'Fighter who learns wizard spells. Best of both worlds.' },
    { name: 'Arcane Archer',    desc: 'Magical arrows with special effects — seeking, exploding, charming.' },
    { name: 'Cavalier',         desc: 'Mounted combatant. Protects allies, controls the battlefield.' },
    { name: 'Samurai',          desc: 'Fighting Spirit for bonus attacks and temp HP. Elegant and resilient.' },
  ],
  Rogue: [
    { name: 'Thief',             desc: 'Classic burglar. Fast Hands, roof climbing, using magic items without training.' },
    { name: 'Assassin',          desc: 'Disguise master. Devastating surprise attacks. Infiltration expertise.' },
    { name: 'Arcane Trickster',  desc: 'Rogue with illusion and enchantment spells. Mage Hand pickpocket.' },
    { name: 'Inquisitive',       desc: 'Detective. Insight expert. Expose enemy weaknesses for Sneak Attacks.' },
    { name: 'Mastermind',        desc: 'Manipulator. Help allies from range. Master of disguise and deception.' },
    { name: 'Scout',             desc: 'Wilderness rogue. First strike, terrain expert, skirmisher.' },
    { name: 'Swashbuckler',      desc: 'Duelist. Sneak Attack without an ally nearby. Panache charm ability.' },
  ],
  Monk: [
    { name: 'Way of the Open Hand',  desc: 'Pure martial arts. Flurry trips, pushes, and heals. Classic monk.' },
    { name: 'Way of Shadow',         desc: 'Ninja. Teleport between shadows. Invisibility and silence spells.' },
    { name: 'Way of the Four Elements', desc: 'Bend fire, water, earth, and air. Spend ki for elemental spells.' },
    { name: 'Way of the Drunken Master', desc: 'Unpredictable combat style. Redirect attacks, disengage freely.' },
    { name: 'Way of the Kensei',     desc: 'Weaponmaster monk. Chosen weapons count as monk weapons.' },
    { name: 'Way of the Sun Soul',   desc: 'Radiant ki blasts. Ranged attacks and burning aura.' },
  ],
  Paladin: [
    { name: 'Oath of Devotion',     desc: 'The classic holy knight. Sacred Weapon, Aura of Devotion, Holy Nimbus.' },
    { name: 'Oath of the Ancients', desc: 'Nature paladin. Resistant to spell damage. Aura of Warding.' },
    { name: 'Oath of Vengeance',    desc: 'Hunter of evil. Vow of Enmity gives advantage. Misty Step and Hold Person.' },
    { name: 'Oath of Conquest',     desc: 'Tyrant paladin. Fear and domination. Aura of Conquest paralyzes enemies.' },
    { name: 'Oath of Redemption',   desc: 'Pacifist protector. Takes damage for allies. Tries to convert foes.' },
    { name: 'Oathbreaker',          desc: 'Fallen paladin. Commands undead. Aura of hate boosts necrotic damage.' },
  ],
  Ranger: [
    { name: 'Hunter',               desc: 'Classic ranger. Colossus Slayer, multi-attack options, damage bonuses.' },
    { name: 'Beast Master',         desc: 'Animal companion fights alongside you. Shared bond.' },
    { name: 'Gloom Stalker',        desc: 'Darkness specialist. Invisible to darkvision. Extra attacks in first round.' },
    { name: 'Horizon Walker',       desc: 'Planar ranger. Teleport and deal extra force damage.' },
    { name: 'Monster Slayer',       desc: 'Specialized hunter. Detect weaknesses, counter spells, resist magic.' },
  ],
  Cleric: [
    { name: 'Life Domain',      desc: 'The best healer. Heavy armor. Healing spells boosted significantly.' },
    { name: 'Light Domain',     desc: 'Radiance and fire spells. Warding Flare blocks attacks against you.' },
    { name: 'Trickery Domain',  desc: 'Illusions and deception. Duplicate yourself. Blessings of the Trickster.' },
    { name: 'War Domain',       desc: 'Warrior priest. Heavy armor. Extra attacks. War Priest bonus attacks.' },
    { name: 'Knowledge Domain', desc: 'Lore master. Gain temporary proficiency in any skill.' },
    { name: 'Nature Domain',    desc: 'Nature cleric. Druid spells. Charm beasts and plants.' },
    { name: 'Tempest Domain',   desc: 'Storm and lightning. Thunderwave push, maximize thunder damage.' },
    { name: 'Death Domain',     desc: 'Necrotic mastery. Reaper cantrip hits multiple targets. Undead command.' },
  ],
  Druid: [
    { name: 'Circle of the Land',  desc: 'Terrain magic. Extra spells based on biome. Rests recover spell slots.' },
    { name: 'Circle of the Moon',  desc: 'Powerful Wild Shape. Transform into CR 1 beasts at level 2. Combat forms.' },
    { name: 'Circle of Dreams',    desc: 'Fey magic. Teleport to Feywild. Heal allies with Balm of the Summer Court.' },
    { name: 'Circle of the Shepherd', desc: 'Summon spirits of nature. Buff summoned creatures significantly.' },
    { name: 'Circle of Spores',    desc: 'Fungal magic. Symbiotic Entity boosts Wild Shape into fighting form.' },
  ],
  Bard: [
    { name: 'College of Lore',     desc: 'Knowledge and secrets. Extra skills, Cutting Words, Magical Secrets early.' },
    { name: 'College of Valor',    desc: 'Combat bard. Medium armor, shields, martial weapons, extra attack.' },
    { name: 'College of Glamour',  desc: 'Fey charm. Mantle of Inspiration, mass charm, fear aura.' },
    { name: 'College of Swords',   desc: 'Blade dancer. Blade Flourish maneuvers. Dueling or two-weapon style.' },
    { name: 'College of Whispers', desc: 'Dark bard. Psychic blades, steal personality, shadow lore.' },
  ],
  Wizard: [
    { name: 'School of Evocation',    desc: 'Pure blaster. Sculpt Spells spare allies. Empowered Evocation boosts damage.' },
    { name: 'School of Abjuration',   desc: 'Protective ward. Arcane Ward absorbs damage for you.' },
    { name: 'School of Divination',   desc: 'Fate manipulation. Portent dice to replace any roll. See futures.' },
    { name: 'School of Conjuration',  desc: 'Summon creatures and teleport. Benign Transposition swaps positions.' },
    { name: 'School of Illusion',     desc: 'Master of deception. Malleable Illusions. Illusory Reality makes it real.' },
    { name: 'School of Necromancy',   desc: 'Raise undead. Command armies of skeletons and zombies.' },
    { name: 'School of Transmutation',desc: 'Transform matter and people. Polymorph master. Shapechanger.' },
    { name: 'School of Enchantment',  desc: 'Mind control specialist. Hypnotic Gaze, Split Enchantment.' },
  ],
  Sorcerer: [
    { name: 'Draconic Bloodline', desc: 'Dragon ancestor. Natural armor (13+DEX). Elemental affinity damage boost.' },
    { name: 'Wild Magic',         desc: 'Chaotic surges. Random magical effects. Tides of Chaos reroll misses.' },
    { name: 'Divine Soul',        desc: 'Celestial gift. Access to Cleric spell list. Wings at high levels.' },
    { name: 'Shadow Magic',       desc: 'Born in the Shadowfell. Hound of Ill Omen. Darkness immunity.' },
    { name: 'Storm Sorcery',      desc: 'Tempest power. Fly after casting. Ride the wind.' },
  ],
  Warlock: [
    { name: 'The Archfey',       desc: 'Fey patron. Beguiling Defenses, Misty Escape teleport, Charm and Fear.' },
    { name: 'The Fiend',         desc: 'Devil\'s deal. Temp HP on kills. Dark One\'s Blessing. Great spell list.' },
    { name: 'The Great Old One', desc: 'Eldritch mystery. Telepathy, mind manipulation, Awakened Mind.' },
    { name: 'The Celestial',     desc: 'Angelic patron. Healing light, access to Cleric healing spells.' },
    { name: 'The Hexblade',      desc: 'Weapon bond. CHA to attack and damage. Hexblade\'s Curse marks enemies.' },
  ],
}

// XP thresholds per level (D&D 5e standard)
export const XP_THRESHOLDS = [
  0,      // Level 1
  300,    // Level 2
  900,    // Level 3
  2700,   // Level 4
  6500,   // Level 5
  14000,  // Level 6
  23000,  // Level 7
  34000,  // Level 8
  48000,  // Level 9
  64000,  // Level 10
  85000,  // Level 11
  100000, // Level 12
  120000, // Level 13
  140000, // Level 14
  165000, // Level 15
  195000, // Level 16
  225000, // Level 17
  265000, // Level 18
  305000, // Level 19
  355000, // Level 20
]

export function xpToNextLevel(currentLevel) {
  return XP_THRESHOLDS[currentLevel] || 355000
}

export function levelFromXP(xp) {
  let level = 1
  for (let i = 1; i < XP_THRESHOLDS.length; i++) {
    if (xp >= XP_THRESHOLDS[i]) level = i + 1
    else break
  }
  return Math.min(level, 20)
}

export function proficiencyBonus(level) {
  return Math.ceil(level / 4) + 1
}

// Starting gold per class
export const STARTING_GOLD = {
  Barbarian:5*4, Fighter:5*4, Rogue:4*4, Monk:5, Paladin:5*4,
  Ranger:5*4, Cleric:5*4, Druid:2*4, Bard:5*4, Wizard:4*4,
  Sorcerer:3*4, Warlock:4*4,
}

// Starting tools kit per class
export const STARTING_TOOLS = {
  Barbarian: ['Handaxe (×2)', 'Explorer\'s Pack', '4 Javelins'],
  Fighter:   ['Chain Mail', 'Shield', 'Martial Weapon of your choice', 'Explorer\'s Pack'],
  Rogue:     ['Thieves\' Tools', 'Dungeon Delver\'s Pack', 'Dagger (×2)'],
  Monk:      ['Shortsword', 'Dungeoneer\'s Pack', '10 Darts'],
  Paladin:   ['Chain Mail', 'Shield', 'Martial Weapon', 'Holy Symbol', 'Priest\'s Pack'],
  Ranger:    ['Scale Mail', 'Longbow + 20 Arrows', 'Shortsword (×2)', 'Explorer\'s Pack'],
  Cleric:    ['Chain Mail', 'Holy Symbol', 'Shield', 'Mace', 'Priest\'s Pack'],
  Druid:     ['Leather Armor', 'Wooden Shield', 'Druidic Focus', 'Explorer\'s Pack'],
  Bard:      ['Rapier', 'Entertainer\'s Pack', 'Lute', 'Leather Armor', 'Dagger'],
  Wizard:    ['Spellbook', 'Arcane Focus', 'Scholar\'s Pack', 'Dagger (×2)'],
  Sorcerer:  ['Light Crossbow + 20 Bolts', 'Arcane Focus', 'Dungeoneer\'s Pack', 'Dagger (×2)'],
  Warlock:   ['Light Crossbow + 20 Bolts', 'Arcane Focus', 'Scholar\'s Pack', 'Dagger (×2)'],
}

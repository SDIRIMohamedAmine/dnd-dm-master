// src/lib/lootTables.js
// ══════════════════════════════════════════════════════════
// Creature loot tables — logically matched to creature type
// Every creature drops things that make narrative sense
// ══════════════════════════════════════════════════════════

// Each item: { name, qty, chance (0-1), value (gp), desc, icon }
const LOOT_POOLS = {

  // ── ANIMALS / BEASTS ──────────────────────────────────────
  wolf: [
    { name: 'Wolf Pelt',        qty:[1,1], chance:.85, value:2,  desc:'Thick grey fur, still warm.', icon:'🐺' },
    { name: 'Wolf Fang',        qty:[1,3], chance:.70, value:1,  desc:'Sharp curved tooth.', icon:'🦷' },
    { name: 'Wolf Claws',       qty:[2,4], chance:.50, value:1,  desc:'Hard black claws.', icon:'🦶' },
    { name: 'Raw Meat',         qty:[1,3], chance:.60, value:1,  desc:'Edible if cooked.', icon:'🥩' },
  ],
  'giant rat': [
    { name: 'Rat Fur',          qty:[1,1], chance:.70, value:1,  desc:'Mangy but salvageable.', icon:'🐀' },
    { name: 'Rat Tail',         qty:[1,1], chance:.40, value:1,  desc:'Some alchemists pay for these.', icon:'〰️' },
    { name: 'Rodent Teeth',     qty:[1,4], chance:.50, value:1,  desc:'Used in potions.', icon:'🦷' },
  ],
  bear: [
    { name: 'Bear Pelt',        qty:[1,1], chance:.90, value:10, desc:'Thick and luxurious.', icon:'🐻' },
    { name: 'Bear Claw',        qty:[2,4], chance:.75, value:3,  desc:'Thick curved claw.', icon:'🦶' },
    { name: 'Bear Fat',         qty:[1,2], chance:.60, value:2,  desc:'Used for lamp oil and salves.', icon:'🫙' },
    { name: 'Raw Meat',         qty:[3,8], chance:.80, value:1,  desc:'Enough to feed a village.', icon:'🥩' },
  ],

  // ── HUMANOIDS ──────────────────────────────────────────────
  goblin: [
    { name: 'Copper Pieces',    qty:[1,8], chance:.90, value:0.1,desc:'Tarnished coins.', icon:'🪙' },
    { name: 'Crude Dagger',     qty:[1,1], chance:.60, value:2,  desc:'Chipped but functional.', icon:'🗡️' },
    { name: 'Goblin Trinket',   qty:[1,1], chance:.40, value:1,  desc:'A shiny button or worthless bauble.', icon:'✨' },
    { name: 'Bone Whistle',     qty:[1,1], chance:.20, value:2,  desc:'Makes a horrific screech.', icon:'🦴' },
    { name: 'Stolen Food',      qty:[1,2], chance:.50, value:1,  desc:'Rations pilfered from travelers.', icon:'🍖' },
    { name: 'Rough Map Fragment', qty:[1,1], chance:.15, value:5, desc:'Part of a map. Could lead somewhere.', icon:'🗺️' },
  ],
  bandit: [
    { name: 'Gold Pieces',      qty:[2,15], chance:.95, value:1, desc:'Hard-earned by robbery.', icon:'⚙' },
    { name: 'Shortsword',       qty:[1,1], chance:.50, value:10, desc:'Well-used, still sharp.', icon:'⚔️' },
    { name: 'Leather Armor',    qty:[1,1], chance:.35, value:10, desc:'Worn but protective.', icon:'🧥' },
    { name: 'Pouch of Coins',   qty:[1,1], chance:.60, value:8,  desc:'Mixed copper and silver.', icon:'👝' },
    { name: 'Wanted Poster',    qty:[1,1], chance:.25, value:0,  desc:'Someone with a bounty. Information.', icon:'📜' },
    { name: 'Flask of Spirits', qty:[1,1], chance:.40, value:2,  desc:'Cheap but warming.', icon:'🍶' },
    { name: 'Lock Picks',       qty:[1,1], chance:.20, value:15, desc:'A basic set. Somewhat bent.', icon:'🔧' },
  ],
  guard: [
    { name: 'Silver Pieces',    qty:[1,6], chance:.90, value:0.1,desc:'City guard pay.', icon:'🪙' },
    { name: 'Spear',            qty:[1,1], chance:.65, value:1,  desc:'Standard issue.', icon:'⚔️' },
    { name: 'Chain Shirt',      qty:[1,1], chance:.50, value:50, desc:'Standard guard armor.', icon:'🛡️' },
    { name: 'Guard Badge',      qty:[1,1], chance:.80, value:0,  desc:'Could be used as disguise. Risky.', icon:'🎖️' },
    { name: 'Rations (1 day)',  qty:[1,2], chance:.60, value:5,  desc:'Standard field rations.', icon:'🍖' },
    { name: 'Handcuffs',        qty:[1,1], chance:.30, value:2,  desc:'Iron restraints.', icon:'⛓️' },
  ],
  cultist: [
    { name: 'Dark Symbol',      qty:[1,1], chance:.85, value:2,  desc:'Unholy emblem of their dark god.', icon:'🔯' },
    { name: 'Black Candle',     qty:[1,3], chance:.60, value:1,  desc:'Burns with an eerie purple flame.', icon:'🕯️' },
    { name: 'Ritual Dagger',    qty:[1,1], chance:.45, value:5,  desc:'Ceremonially inscribed. Still sharp.', icon:'🗡️' },
    { name: 'Scroll Fragment',  qty:[1,1], chance:.35, value:5,  desc:'A partial ritual text.', icon:'📜' },
    { name: 'Vial of Dark Ichor', qty:[1,1], chance:.25, value:10, desc:'Unpleasant. Alchemically useful.', icon:'🧪' },
    { name: 'Silver Pieces',    qty:[1,6], chance:.70, value:0.1,desc:'Tithe collected for their deity.', icon:'🪙' },
  ],
  orc: [
    { name: 'Gold Pieces',      qty:[3,12], chance:.85, value:1, desc:'Plunder from raids.', icon:'⚙' },
    { name: 'Greataxe',         qty:[1,1], chance:.60, value:30, desc:'Heavy orcish steel, crudely made.', icon:'🪓' },
    { name: 'Bone Necklace',    qty:[1,1], chance:.45, value:3,  desc:'Trophies of past kills.', icon:'🦴' },
    { name: 'Crude Armor',      qty:[1,1], chance:.40, value:15, desc:'Patchwork hide and scrap metal.', icon:'🛡️' },
    { name: 'War Paint Vial',   qty:[1,2], chance:.55, value:1,  desc:'Ritual pigments. Intimidating.', icon:'🎨' },
    { name: 'Jerked Meat',      qty:[2,5], chance:.65, value:1,  desc:'Tough but filling.', icon:'🥩' },
  ],

  // ── UNDEAD ─────────────────────────────────────────────────
  skeleton: [
    { name: 'Bone Fragments',   qty:[2,6], chance:.70, value:1,  desc:'Useful for certain rituals.', icon:'🦴' },
    { name: 'Rusted Shortsword', qty:[1,1], chance:.55, value:2,  desc:'Corroded but identifiable.', icon:'⚔️' },
    { name: 'Cracked Shield',   qty:[1,1], chance:.40, value:3,  desc:'Still blocks hits. Barely.', icon:'🛡️' },
    { name: 'Ancient Coin',     qty:[1,3], chance:.35, value:5,  desc:'Old currency. Collectors want these.', icon:'🪙' },
    { name: 'Tattered Cloth',   qty:[1,2], chance:.50, value:0,  desc:'Worthless scraps.', icon:'🧶' },
  ],
  zombie: [
    { name: 'Rotted Clothing',  qty:[1,1], chance:.60, value:0,  desc:'Worthless and foul.', icon:'🧶' },
    { name: 'Infected Blood',   qty:[1,1], chance:.40, value:3,  desc:'Dangerous. Some mages want it.', icon:'🩸' },
    { name: 'Personal Effects', qty:[1,1], chance:.30, value:2,  desc:'Whoever this was had a life once.', icon:'💍' },
  ],
  vampire: [
    { name: 'Gold Pieces',      qty:[20,80], chance:.95, value:1, desc:'Centuries of accumulated wealth.', icon:'⚙' },
    { name: 'Ring of Protection', qty:[1,1], chance:.25, value:3500, desc:'Wondrous. +1 AC, +1 saves.', icon:'💍' },
    { name: 'Fine Clothing',    qty:[1,1], chance:.80, value:25, desc:'Exquisite centuries-old garments.', icon:'👘' },
    { name: 'Vampire Fang',     qty:[1,2], chance:.70, value:50, desc:'Valuable to slayers and alchemists.', icon:'🦷' },
    { name: 'Tome of Lore',     qty:[1,1], chance:.35, value:100, desc:'Ancient knowledge from their long life.', icon:'📖' },
    { name: 'Jeweled Chalice',  qty:[1,1], chance:.45, value:75, desc:'Dark stains inside. Gold and ruby.', icon:'🏆' },
  ],

  // ── MAGICAL CREATURES ──────────────────────────────────────
  dragon: [
    { name: 'Dragon Scale',     qty:[2,8], chance:.95, value:50, desc:'Harder than steel. Iridescent.', icon:'🐉' },
    { name: 'Dragon Claw',      qty:[1,3], chance:.80, value:30, desc:'Razor sharp, magical.', icon:'🦶' },
    { name: 'Dragon Tooth',     qty:[1,4], chance:.75, value:40, desc:'Perfect for weapons or magic.', icon:'🦷' },
    { name: 'Gold Pieces',      qty:[100,500], chance:.90, value:1, desc:'Dragon hoard remnants.', icon:'⚙' },
    { name: 'Magic Item',       qty:[1,1], chance:.40, value:500, desc:'Something from the hoard.', icon:'✨' },
    { name: 'Dragon Blood Vial', qty:[1,2], chance:.60, value:100, desc:'Immensely valuable to alchemists.', icon:'🧪' },
  ],
  troll: [
    { name: 'Troll Hide Scraps', qty:[1,3], chance:.75, value:5, desc:'Regenerates slowly. Strange.', icon:'🧶' },
    { name: 'Troll Finger',     qty:[1,2], chance:.50, value:8,  desc:'It twitched. Still twitches.', icon:'👆' },
    { name: 'Crude Club',       qty:[1,1], chance:.60, value:1,  desc:'Enormous. Basically a tree.', icon:'🪵' },
    { name: 'Stolen Goods',     qty:[1,3], chance:.45, value:10, desc:'Whatever the troll found shiny.', icon:'📦' },
  ],
  gnoll: [
    { name: 'Gold Pieces',      qty:[2,10], chance:.80, value:1, desc:'Plunder from raids.', icon:'⚙' },
    { name: 'Gnoll Hide',       qty:[1,1], chance:.65, value:5,  desc:'Hyena-like patterned fur.', icon:'🧶' },
    { name: 'Spear',            qty:[1,1], chance:.55, value:1,  desc:'Barbed and bloody.', icon:'⚔️' },
    { name: 'Trophy Skull',     qty:[1,1], chance:.40, value:3,  desc:'From a previous victim.', icon:'💀' },
    { name: 'Meat Hook',        qty:[1,1], chance:.30, value:2,  desc:'Functional. Disturbing.', icon:'🪝' },
  ],

  // ── MERCHANTS / CIVILIANS (pickpocket) ─────────────────────
  merchant: [
    { name: 'Gold Pieces',      qty:[5,25], chance:.95, value:1, desc:'Travelling coin.', icon:'⚙' },
    { name: 'Silver Pieces',    qty:[10,50], chance:.80, value:.1, desc:'Change for transactions.', icon:'🪙' },
    { name: 'Merchant Ledger',  qty:[1,1], chance:.60, value:5,  desc:'Records of debts owed to them.', icon:'📒' },
    { name: 'Pocket Watch',     qty:[1,1], chance:.35, value:25, desc:'Fine craftsmanship.', icon:'⌚' },
    { name: 'Vial of Perfume',  qty:[1,1], chance:.40, value:5,  desc:'Expensive. Could be sold.', icon:'🧪' },
    { name: 'Personal Letter',  qty:[1,1], chance:.50, value:0,  desc:'Private correspondence. Could be leverage.', icon:'📜' },
  ],
  noble: [
    { name: 'Gold Pieces',      qty:[15,60], chance:.95, value:1, desc:'Pocket money for a noble.', icon:'⚙' },
    { name: 'Signet Ring',      qty:[1,1], chance:.70, value:50, desc:'Family crest. Could forge documents.', icon:'💍' },
    { name: 'Fine Jewelry',     qty:[1,2], chance:.55, value:75, desc:'Rubies and sapphires.', icon:'💎' },
    { name: 'Letter of Credit', qty:[1,1], chance:.35, value:100, desc:'Redeemable at any major bank.', icon:'📜' },
    { name: 'Vial of Poison',   qty:[1,1], chance:.15, value:50, desc:'Why did they have this?', icon:'🧪' },
    { name: 'Personal Diary',   qty:[1,1], chance:.45, value:0,  desc:'Scandalous secrets.', icon:'📔' },
  ],

  // ── DEFAULT (unknown creature) ─────────────────────────────
  default: [
    { name: 'Gold Pieces',      qty:[1,6],  chance:.70, value:1, desc:'Some coins.', icon:'⚙' },
    { name: 'Miscellaneous Item', qty:[1,1], chance:.40, value:3, desc:'Something of minor value.', icon:'📦' },
  ],
}

// Resolve creature type from name
function resolveCreatureType(name) {
  const lower = name.toLowerCase()
  const keys   = Object.keys(LOOT_POOLS)
  // Exact or partial match
  const match  = keys.find(k => lower.includes(k) || k.includes(lower.split(' ')[0]))
  return match || 'default'
}

// Roll loot for a creature — returns array of { name, qty, value, desc, icon }
export function rollCreatureLoot(creatureName, isPickpocket = false) {
  const type  = resolveCreatureType(creatureName)
  const pool  = LOOT_POOLS[type] || LOOT_POOLS.default

  // For pickpocketing, only roll a subset (can't carry as much unseen)
  const eligible = isPickpocket
    ? pool.filter(item => item.value < 20 && !item.name.includes('Armor') && !item.name.includes('Sword'))
    : pool

  const results = []
  for (const item of eligible) {
    if (Math.random() > item.chance) continue
    const [min, max] = item.qty
    const qty = min + Math.floor(Math.random() * (max - min + 1))
    results.push({ name: item.name, qty, value: item.value, desc: item.desc, icon: item.icon })
  }

  // Always guarantee at least 1 item
  if (!results.length && eligible.length) {
    const base = eligible[0]
    results.push({ name: base.name, qty: 1, value: base.value, desc: base.desc, icon: base.icon })
  }

  return results
}

// Merchant inventory — what they sell
export const MERCHANT_TYPES = {
  general: {
    name: 'General Store',
    flavor: 'A cluttered shop with goods from across the realm.',
    stock: [
      { name: 'Torch',             qty: 10, value: 1,   desc: 'Burns 1 hour. Bright light 20ft.', icon: '🔥' },
      { name: 'Rations (1 day)',   qty: 20, value: 5,   desc: 'Dry food for one day of travel.', icon: '🍖' },
      { name: 'Rope (50ft)',       qty: 5,  value: 1,   desc: 'Hempen rope. Holds 900 lbs.', icon: '🪢' },
      { name: 'Healing Potion',    qty: 3,  value: 50,  desc: 'Restores 2d4+2 HP when drunk.', icon: '🧪' },
      { name: 'Antitoxin',        qty: 2,  value: 50,  desc: 'Advantage vs poison saves 1 hour.', icon: '🧪' },
      { name: 'Tinderbox',        qty: 5,  value: 5,   desc: 'Start fires. Essential for survival.', icon: '🔥' },
      { name: 'Bedroll',          qty: 4,  value: 1,   desc: 'Sleep comfortably on the road.', icon: '🛏️' },
      { name: 'Waterskin',        qty: 6,  value: 2,   desc: 'Holds 4 pints of liquid.', icon: '🫗' },
      { name: 'Lantern',          qty: 3,  value: 5,   desc: 'Bright light 30ft for 6 hours (per oil).', icon: '🪔' },
      { name: 'Oil Flask',        qty: 10, value: 1,   desc: 'Fuel for lanterns. Burns 1 hour.', icon: '🫙' },
    ]
  },
  blacksmith: {
    name: 'Blacksmith',
    flavor: 'The ring of hammer on steel. Weapons and armor of solid craft.',
    stock: [
      { name: 'Dagger',           qty: 5,  value: 2,   desc: '1d4 piercing. Finesse, light, thrown.', icon: '🗡️' },
      { name: 'Shortsword',       qty: 3,  value: 10,  desc: '1d6 piercing. Finesse, light.', icon: '⚔️' },
      { name: 'Longsword',        qty: 2,  value: 15,  desc: '1d8 slashing. Versatile (1d10).', icon: '⚔️' },
      { name: 'Handaxe',         qty: 4,  value: 5,   desc: '1d6 slashing. Light, thrown.', icon: '🪓' },
      { name: 'Spear',            qty: 4,  value: 1,   desc: '1d6 piercing. Thrown, versatile.', icon: '⚔️' },
      { name: 'Shield',           qty: 3,  value: 10,  desc: '+2 AC. Requires one free hand.', icon: '🛡️' },
      { name: 'Leather Armor',    qty: 3,  value: 10,  desc: 'AC 11 + DEX. Light armor.', icon: '🧥' },
      { name: 'Scale Mail',       qty: 2,  value: 50,  desc: 'AC 14 + DEX (max 2). Medium.', icon: '🛡️' },
      { name: 'Chain Mail',       qty: 1,  value: 75,  desc: 'AC 16. Heavy. Needs STR 13.', icon: '🛡️' },
      { name: 'Arrows (20)',      qty: 5,  value: 1,   desc: 'Standard arrows for bows.', icon: '🏹' },
    ]
  },
  apothecary: {
    name: 'Apothecary',
    flavor: 'Herbs and vials line every shelf. The smell of dried plants and strange tinctures.',
    stock: [
      { name: 'Healing Potion',        qty: 5,  value: 50,  desc: 'Restores 2d4+2 HP.', icon: '🧪' },
      { name: 'Potion of Greater Healing', qty: 2, value: 150, desc: 'Restores 4d4+4 HP.', icon: '🧪' },
      { name: 'Antitoxin',             qty: 3,  value: 50,  desc: 'Advantage vs poison 1 hour.', icon: '🧪' },
      { name: 'Healer\'s Kit',         qty: 3,  value: 5,   desc: 'Stabilize dying creatures. 10 uses.', icon: '💊' },
      { name: 'Vial of Acid',          qty: 2,  value: 25,  desc: 'Thrown. 2d6 acid on hit.', icon: '🧪' },
      { name: 'Holy Water',            qty: 3,  value: 25,  desc: '2d6 radiant vs undead/fiends.', icon: '💧' },
      { name: 'Alchemist\'s Fire',     qty: 2,  value: 50,  desc: '1d4 fire per turn until doused.', icon: '🔥' },
      { name: 'Potion of Heroism',     qty: 1,  value: 180, desc: '10 temp HP + Blessed for 1 hour.', icon: '🧪' },
      { name: 'Perfume',               qty: 3,  value: 5,   desc: 'Social advantage in some situations.', icon: '🌸' },
      { name: 'Potion of Climbing',    qty: 1,  value: 180, desc: 'Climb speed = walk speed for 1 hour.', icon: '🧪' },
    ]
  },
  magicShop: {
    name: 'Arcane Curios',
    flavor: 'Soft blue light. The hum of enchantment. Everything here costs more than it looks.',
    stock: [
      { name: 'Arcane Focus',          qty: 3,  value: 10,  desc: 'Spellcasting focus for arcane magic.', icon: '🔮' },
      { name: 'Spellbook (Blank)',     qty: 2,  value: 50,  desc: 'Prepared for wizard spell copying.', icon: '📖' },
      { name: 'Scroll of Identify',    qty: 3,  value: 100, desc: 'Instantly identify one magic item.', icon: '📜' },
      { name: 'Scroll of Detect Magic', qty: 3, value: 75,  desc: 'Sense magic within 30ft for 10 min.', icon: '📜' },
      { name: 'Scroll of Mage Armor',  qty: 2,  value: 150, desc: 'AC 13+DEX until long rest.', icon: '📜' },
      { name: 'Potion of Heroism',     qty: 1,  value: 180, desc: '10 temp HP + Blessed for 1 hour.', icon: '🧪' },
      { name: 'Bag of Holding',        qty: 1,  value: 4000, desc: 'Holds 500 lbs in an extradimensional space.', icon: '👝' },
      { name: 'Cloak of Protection',   qty: 1,  value: 3500, desc: '+1 AC and +1 to all saving throws.', icon: '🧣' },
      { name: 'Sending Stone',         qty: 1,  value: 800, desc: 'Send 25 words to the paired stone\'s owner.', icon: '💎' },
      { name: 'Rope of Climbing',      qty: 1,  value: 2000, desc: 'Animated 60ft silk rope.', icon: '🪢' },
    ]
  },
  fence: {
    name: 'Shady Dealer',
    flavor: 'A back-alley meeting. Speaks quietly. Buys things without asking where they came from.',
    stock: [
      { name: 'Thieves\' Tools',       qty: 2,  value: 25,  desc: 'Pick locks and disarm traps.', icon: '🔧' },
      { name: 'Disguise Kit',          qty: 1,  value: 25,  desc: 'Change your appearance convincingly.', icon: '🎭' },
      { name: 'Forgery Kit',           qty: 1,  value: 15,  desc: 'Create false documents.', icon: '✒️' },
      { name: 'Poison, Basic',         qty: 2,  value: 100, desc: '1d4 poison damage on coated weapon hit.', icon: '☠️' },
      { name: 'Smoke Bomb',            qty: 3,  value: 20,  desc: 'Creates 20ft sphere of smoke for 1 min.', icon: '💨' },
      { name: 'Crowbar',               qty: 2,  value: 2,   desc: '+2 STR for forcing things open.', icon: '🔨' },
      { name: 'Vial of Acid',          qty: 2,  value: 25,  desc: '2d6 acid damage. Destroys locks.', icon: '🧪' },
      { name: 'Midnight Cloak',        qty: 1,  value: 150, desc: 'Advantage on Stealth in dim light.', icon: '🧣' },
    ]
  },
}

export function getMerchantInventory(type = 'general') {
  return MERCHANT_TYPES[type] || MERCHANT_TYPES.general
}

// Calculate sell price (players sell at 50% merchant value)
export function getSellPrice(itemValue) {
  return Math.max(1, Math.floor(itemValue * 0.5))
}

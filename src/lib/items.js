// src/lib/items.js
// ══════════════════════════════════════════════════════════
// Item system — uses dnd5eapi data when available,
// falls back to SRD hardcoded values.
// Equipment slots match BG3: head, chest, hands, legs,
// feet, amulet, ring1, ring2, mainhand, offhand, ranged
// ══════════════════════════════════════════════════════════
import { supabase } from './supabase'

export const EQUIPMENT_SLOTS = {
  mainhand: { label: 'Main Hand',  icon: '⚔️',  accepts: ['weapon','melee'] },
  offhand:  { label: 'Off Hand',   icon: '🛡️',  accepts: ['weapon','shield','offhand'] },
  ranged:   { label: 'Ranged',     icon: '🏹',  accepts: ['weapon','ranged'] },
  head:     { label: 'Head',       icon: '🪖',  accepts: ['armor','helmet','headgear'] },
  chest:    { label: 'Chest',      icon: '🧥',  accepts: ['armor','chest','body'] },
  hands:    { label: 'Gloves',     icon: '🧤',  accepts: ['armor','gloves','hands'] },
  legs:     { label: 'Legs',       icon: '👖',  accepts: ['armor','legs','pants'] },
  feet:     { label: 'Feet',       icon: '👢',  accepts: ['armor','boots','feet'] },
  amulet:   { label: 'Amulet',     icon: '📿',  accepts: ['jewelry','amulet','necklace'] },
  ring1:    { label: 'Ring (Left)',  icon: '💍', accepts: ['jewelry','ring'] },
  ring2:    { label: 'Ring (Right)', icon: '💍', accepts: ['jewelry','ring'] },
  cloak:    { label: 'Cloak/Back',  icon: '🧣', accepts: ['armor','cloak','back'] },
}

// ── STATIC ITEM DATA (SRD fallback) ───────────────────────
// Used when DB lookup fails or no network
// ITEM_CATEGORIES — kept for backward compatibility with InventoryModal and CombatScreen
export const ITEM_CATEGORIES = {
  WEAPON:     'weapon',
  ARMOR:      'armor',
  CONSUMABLE: 'consumable',
  TOOL:       'tool',
  MISC:       'misc',
  AMMO:       'ammo',
  JEWELRY:    'jewelry',
}

export const ITEM_DB = {
  // ── WEAPONS ──────────────────────────────────────────────
  'Dagger':        { cat:'weapon', slot:'mainhand', damage:'1d4', dmgType:'piercing',  cost:2,   weight:1,  props:['Finesse','Light','Thrown (20/60)'],  icon:'🗡️' },
  'Shortsword':    { cat:'weapon', slot:'mainhand', damage:'1d6', dmgType:'piercing',  cost:10,  weight:2,  props:['Finesse','Light'],                   icon:'⚔️' },
  'Longsword':     { cat:'weapon', slot:'mainhand', damage:'1d8', dmgType:'slashing',  cost:15,  weight:3,  props:['Versatile (1d10)'],                  icon:'⚔️' },
  'Rapier':        { cat:'weapon', slot:'mainhand', damage:'1d8', dmgType:'piercing',  cost:25,  weight:2,  props:['Finesse'],                           icon:'⚔️' },
  'Greatsword':    { cat:'weapon', slot:'mainhand', damage:'2d6', dmgType:'slashing',  cost:50,  weight:6,  props:['Heavy','Two-handed'],                icon:'⚔️' },
  'Greataxe':      { cat:'weapon', slot:'mainhand', damage:'1d12',dmgType:'slashing',  cost:30,  weight:7,  props:['Heavy','Two-handed'],                icon:'🪓' },
  'Handaxe':       { cat:'weapon', slot:'mainhand', damage:'1d6', dmgType:'slashing',  cost:5,   weight:2,  props:['Light','Thrown (20/60)'],            icon:'🪓' },
  'Quarterstaff':  { cat:'weapon', slot:'mainhand', damage:'1d6', dmgType:'bludgeoning',cost:2,  weight:4,  props:['Versatile (1d8)'],                   icon:'🏑' },
  'Mace':          { cat:'weapon', slot:'mainhand', damage:'1d6', dmgType:'bludgeoning',cost:5,  weight:4,  props:[],                                    icon:'🔨' },
  'Warhammer':     { cat:'weapon', slot:'mainhand', damage:'1d8', dmgType:'bludgeoning',cost:15, weight:2,  props:['Versatile (1d10)'],                  icon:'🔨' },
  'Spear':         { cat:'weapon', slot:'mainhand', damage:'1d6', dmgType:'piercing',  cost:1,   weight:3,  props:['Thrown (20/60)','Versatile (1d8)'],  icon:'⚔️' },
  'Shortbow':      { cat:'weapon', slot:'ranged',   damage:'1d6', dmgType:'piercing',  cost:25,  weight:2,  props:['Range (80/320)','Two-handed'],        icon:'🏹' },
  'Longbow':       { cat:'weapon', slot:'ranged',   damage:'1d8', dmgType:'piercing',  cost:50,  weight:2,  props:['Range (150/600)','Heavy','Two-handed'],icon:'🏹'},
  'Light Crossbow':{ cat:'weapon', slot:'ranged',   damage:'1d8', dmgType:'piercing',  cost:25,  weight:5,  props:['Range (80/320)','Loading'],          icon:'🏹' },
  'Hand Crossbow': { cat:'weapon', slot:'ranged',   damage:'1d6', dmgType:'piercing',  cost:75,  weight:3,  props:['Range (30/120)','Light','Loading'],  icon:'🏹' },
  'Scimitar':      { cat:'weapon', slot:'mainhand', damage:'1d6', dmgType:'slashing',  cost:25,  weight:3,  props:['Finesse','Light'],                   icon:'⚔️' },
  'Battleaxe':     { cat:'weapon', slot:'mainhand', damage:'1d8', dmgType:'slashing',  cost:10,  weight:4,  props:['Versatile (1d10)'],                  icon:'🪓' },
  // ── SHIELDS ──────────────────────────────────────────────
  'Shield':        { cat:'armor',  slot:'offhand',  acBonus:2,    cost:10,  weight:6, desc:'Requires one free hand. +2 AC.',                              icon:'🛡️' },
  // ── BODY ARMOR ───────────────────────────────────────────
  'Leather Armor': { cat:'armor',  slot:'chest', baseAC:11, addDex:true,  maxDex:null, cost:10,  weight:10, heavy:false, stealthDis:false, icon:'🧥' },
  'Studded Leather':{ cat:'armor', slot:'chest', baseAC:12, addDex:true,  maxDex:null, cost:45,  weight:13, heavy:false, stealthDis:false, icon:'🧥' },
  'Studded Leather Armor':{ cat:'armor',slot:'chest',baseAC:12,addDex:true,maxDex:null,cost:45,weight:13,heavy:false,stealthDis:false,icon:'🧥'},
  'Hide Armor':    { cat:'armor',  slot:'chest', baseAC:12, addDex:true,  maxDex:2,    cost:10,  weight:12, heavy:false, stealthDis:false, icon:'🧥' },
  'Chain Shirt':   { cat:'armor',  slot:'chest', baseAC:13, addDex:true,  maxDex:2,    cost:50,  weight:20, heavy:false, stealthDis:false, icon:'🛡️' },
  'Scale Mail':    { cat:'armor',  slot:'chest', baseAC:14, addDex:true,  maxDex:2,    cost:50,  weight:45, heavy:false, stealthDis:true,  icon:'🛡️' },
  'Breastplate':   { cat:'armor',  slot:'chest', baseAC:14, addDex:true,  maxDex:2,    cost:400, weight:20, heavy:false, stealthDis:false, icon:'🛡️' },
  'Half Plate':    { cat:'armor',  slot:'chest', baseAC:15, addDex:true,  maxDex:2,    cost:750, weight:40, heavy:false, stealthDis:true,  icon:'🛡️' },
  'Ring Mail':     { cat:'armor',  slot:'chest', baseAC:14, addDex:false, maxDex:0,    cost:30,  weight:40, heavy:true,  stealthDis:true,  icon:'🛡️' },
  'Chain Mail':    { cat:'armor',  slot:'chest', baseAC:16, addDex:false, maxDex:0,    cost:75,  weight:55, heavy:true,  stealthDis:true,  strReq:13, icon:'🛡️' },
  'Splint':        { cat:'armor',  slot:'chest', baseAC:17, addDex:false, maxDex:0,    cost:200, weight:60, heavy:true,  stealthDis:true,  strReq:15, icon:'🛡️' },
  'Plate':         { cat:'armor',  slot:'chest', baseAC:18, addDex:false, maxDex:0,    cost:1500,weight:65, heavy:true,  stealthDis:true,  strReq:15, icon:'🛡️' },
  // ── MAGIC ITEMS ──────────────────────────────────────────
  'Cloak of Protection':  { cat:'armor',   slot:'cloak',  acBonus:1, saveBonus:1,  cost:3500, attunement:true,  passive:'+1 AC and +1 to all saving throws',     icon:'🧣' },
  'Ring of Protection':   { cat:'jewelry', slot:'ring1',  acBonus:1, saveBonus:1,  cost:3500, attunement:true,  passive:'+1 AC and +1 to all saving throws',     icon:'💍' },
  'Gauntlets of Ogre Power':{ cat:'armor', slot:'hands',  setStr:19,                cost:8000, attunement:true,  passive:'STR becomes 19 (if lower)',             icon:'🧤' },
  'Boots of Speed':       { cat:'armor',   slot:'feet',   passive:'Double speed, disengage as bonus action for 10 rounds/day', cost:4000, attunement:true,        icon:'👢' },
  'Amulet of Health':     { cat:'jewelry', slot:'amulet', setCon:19,                cost:8000, attunement:true,  passive:'CON becomes 19 (if lower)',             icon:'📿' },
  'Headband of Intellect':{ cat:'jewelry', slot:'head',   setInt:19,                cost:8000, attunement:true,  passive:'INT becomes 19 (if lower)',             icon:'🪖' },
  // ── CONSUMABLES ──────────────────────────────────────────
  'Healing Potion':       { cat:'consumable', heal:'2d4+2', cost:50,  weight:0.5, icon:'🧪', desc:'Drink to regain 2d4+2 HP.' },
  'Potion of Greater Healing':{ cat:'consumable', heal:'4d4+4', cost:150, weight:0.5, icon:'🧪', desc:'Drink to regain 4d4+4 HP.' },
  'Potion of Superior Healing':{ cat:'consumable', heal:'8d4+8', cost:450, weight:0.5, icon:'🧪', desc:'Drink to regain 8d4+8 HP.' },
  'Antitoxin':     { cat:'consumable', cost:50,  weight:0, icon:'🧪', desc:'Advantage on CON saves vs poison for 1 hour.' },
  'Holy Water':    { cat:'consumable', cost:25,  weight:1, icon:'💧', desc:'2d6 radiant damage to undead/fiends on hit.' },
  "Alchemist's Fire": { cat:'consumable', cost:50, weight:1, icon:'🔥', desc:'1d4 fire damage per turn until doused (DC 10 DEX).' },
  // ── TOOLS & MISC ─────────────────────────────────────────
  "Thieves' Tools":{ cat:'tool', cost:25, weight:1, icon:'🔧', desc:'Pick locks and disarm traps. Requires proficiency.' },
  'Rope (50ft)':   { cat:'misc', cost:1,  weight:10,icon:'🪢', desc:'Holds 900 lbs.' },
  'Torch':         { cat:'misc', cost:1,  weight:1, icon:'🔥', desc:'Bright light 20ft for 1 hour.' },
  "Healer's Kit":  { cat:'consumable', cost:5, weight:3, icon:'💊', desc:'Stabilize dying creature without Medicine check. 10 uses.' },
  'Arcane Focus':  { cat:'tool', cost:10, weight:1, icon:'🔮', desc:'Spellcasting focus for arcane spells.' },
  'Holy Symbol':   { cat:'tool', cost:5,  weight:1, icon:'✝️', desc:'Spellcasting focus for divine spells.' },
  'Spellbook':     { cat:'tool', cost:50, weight:3, icon:'📖', desc:'Required for Wizard spell preparation.' },
}

export function getItem(name) {
  if (!name) return { cat:'misc', category:'misc', cost:1, weight:0, icon:'📦', desc:'', name }
  let data = null

  // 1. Check runtime cache for custom items enriched from [ITEM:] tags
  const cache = (typeof window !== 'undefined' && window.__customItemCache) || {}
  if (cache[name]) data = { ...cache[name] }

  // 2. Exact match in static DB
  if (!data && ITEM_DB[name]) {
    data = { ...ITEM_DB[name], name }
  }

  // 3. Case-insensitive match
  if (!data) {
    const key = Object.keys(ITEM_DB).find(k => k.toLowerCase() === name.toLowerCase())
    if (key) data = { ...ITEM_DB[key], name: key }
  }

  // 4. Keyword/partial match — "Amulet of Health" → find "Amulet of Health" in DB
  if (!data) {
    const partial = Object.keys(ITEM_DB).find(k =>
      name.toLowerCase().includes(k.toLowerCase()) ||
      k.toLowerCase().includes(name.toLowerCase().split(' ')[0])
    )
    if (partial) data = { ...ITEM_DB[partial], name: partial }
  }

  // 5. Generic fallback — keeps category hints from name patterns
  if (!data) {
    const n = name.toLowerCase()
    let cat = 'misc', icon = '📦', slot = null
    if (/sword|blade|axe|dagger|mace|staff|bow|spear|hammer|scimitar/.test(n)) { cat='weapon'; icon='⚔️'; slot='mainhand' }
    else if (/armor|mail|plate|leather|breastplate|hide/.test(n))               { cat='armor';  icon='🛡️'; slot='chest' }
    else if (/amulet|necklace|pendant/.test(n))                                 { cat='jewelry';icon='📿'; slot='amulet' }
    else if (/ring/.test(n))                                                    { cat='jewelry';icon='💍'; slot='ring1' }
    else if (/cloak|cape/.test(n))                                              { cat='armor';  icon='🧣'; slot='cloak' }
    else if (/potion|elixir|vial/.test(n))                                      { cat='consumable';icon='🧪' }
    else if (/scroll/.test(n))                                                  { cat='consumable';icon='📜' }
    data = { cat, cost: cat === 'weapon' ? 15 : cat === 'jewelry' ? 500 : 5, weight: 1, icon, desc: 'An item from your adventures.', name, ...(slot ? {slot} : {}) }
  }

  if (!data.category) data = { ...data, category: data.cat || 'misc' }
  return data
}

// ── ATTUNEMENT SYSTEM ─────────────────────────────────────
export const MAX_ATTUNED_ITEMS = 3

export function getAttunedItems(equipped) {
  if (!equipped) return []
  const attuned = []
  for (const [slot, itemName] of Object.entries(equipped)) {
    if (!itemName) continue
    const data = getItem(itemName)
    if (data?.attunement && equipped[`${slot}_attuned`]) attuned.push(itemName)
  }
  return attuned
}

export function canAttune(equipped, newItemName) {
  const attuned = getAttunedItems(equipped)
  if (attuned.includes(newItemName)) return true
  return attuned.length < MAX_ATTUNED_ITEMS
}

// ── SLOT DETECTION ────────────────────────────────────────
export function detectItemSlot(itemName) {
  const data = getItem(itemName)
  if (data.slot) return data.slot
  const n = itemName.toLowerCase()
  if (/helm|hat|cap|hood|crown|tiara|circlet/.test(n)) return 'head'
  if (/cloak|cape|mantle/.test(n)) return 'cloak'
  if (/ring/.test(n)) return 'ring1'
  if (/amulet|necklace|pendant|talisman/.test(n)) return 'amulet'
  if (/glove|gauntlet/.test(n)) return 'hands'
  if (/boot|shoe|sandal/.test(n)) return 'feet'
  if (/leg|greave|trouser/.test(n)) return 'legs'
  if (/bow|crossbow/.test(n)) return 'ranged'
  if (/shield/.test(n)) return 'offhand'
  if (/sword|axe|mace|hammer|staff|dagger|rapier|spear|scimitar|club|pike|halberd|lance|whip|flail|morningstar/.test(n)) return 'mainhand'
  if (/armor|mail|plate|leather|hide|splint|breastplate/.test(n)) return 'chest'
  return null
}

// ── AC CALCULATION ────────────────────────────────────────
export function calculateAC(equipped, stats) {
  const dexMod = Math.floor(((stats?.dexterity || 10) - 10) / 2)
  const conMod = Math.floor(((stats?.constitution || 10) - 10) / 2)
  const wisMod = Math.floor(((stats?.wisdom || 10) - 10) / 2)
  const cls    = stats?.class || ''

  // Unarmored base
  let baseAC = 10 + dexMod
  if (cls === 'Barbarian') baseAC = 10 + dexMod + conMod
  if (cls === 'Monk')      baseAC = 10 + dexMod + wisMod

  const chest = equipped?.chest ? getItem(equipped.chest) : null
  if (chest?.baseAC !== undefined) {
    if (chest.addDex) {
      const cappedDex = chest.maxDex !== null && chest.maxDex !== undefined ? Math.min(dexMod, chest.maxDex) : dexMod
      baseAC = chest.baseAC + cappedDex
    } else {
      baseAC = chest.baseAC
    }
  }

  let bonus = 0
  for (const slot of Object.keys(EQUIPMENT_SLOTS)) {
    if (!equipped?.[slot]) continue
    const item = getItem(equipped[slot])
    if (item.acBonus) bonus += item.acBonus
  }
  return baseAC + bonus
}

// ── PASSIVE EFFECTS ───────────────────────────────────────
export function getEquippedPassives(equipped, stats) {
  const passives = []
  if (!equipped) return passives
  for (const [slot, itemName] of Object.entries(equipped)) {
    if (!itemName) continue
    const item = getItem(itemName)
    if (item.passive)       passives.push({ slot, item: itemName, text: item.passive })
    if (item.stealthDis)    passives.push({ slot, item: itemName, text: 'Disadvantage on Stealth checks' })
    if (item.strReq && (stats?.strength||10) < item.strReq)
                            passives.push({ slot, item: itemName, text: `⚠ Requires STR ${item.strReq} — speed reduced by 10` })
    if (item.acBonus)       passives.push({ slot, item: itemName, text: `+${item.acBonus} AC` })
    if (item.saveBonus)     passives.push({ slot, item: itemName, text: `+${item.saveBonus} to all saving throws` })
  }
  return passives
}

// ── ITEM USE (consumables) ────────────────────────────────
export function rollHealDice(expr) {
  if (!expr) return 2
  const m = expr.match(/(\d*)d(\d+)([+-]\d+)?/)
  if (!m) return parseInt(expr)||2
  let total = 0
  const count = parseInt(m[1]||'1'), sides = parseInt(m[2]), bonus = parseInt(m[3]||'0')
  for (let i=0;i<count;i++) total += Math.floor(Math.random()*sides)+1
  return Math.max(1, total+bonus)
}

export function applyItemEffect(itemName, character) {
  const item = getItem(itemName)
  if (item.heal) {
    const healed = rollHealDice(item.heal)
    const newHP  = Math.min(character.max_hp, (character.current_hp||0) + healed)
    return { message:`You drink the ${itemName} and recover ${newHP-character.current_hp} HP.`, updates:{ current_hp:newHP }, consume:true, hpChange:newHP-character.current_hp }
  }
  return { message:`You use the ${itemName}.`, updates:{}, consume: item.cat==='consumable' }
}

// ── ASYNC LOOKUP from RAG database ──────────────────────
export async function lookupItemFromDB(name) {
  if (!name) return null
  try {
    const types = ['magic-item', 'weapon', 'armor']

    // 1. Exact / partial name match
    for (const type of types) {
      const { data } = await supabase.from('knowledge_chunks')
        .select('content, name, type')
        .eq('type', type)
        .ilike('name', `%${name}%`)
        .limit(3)
      if (data?.length) {
        const best = data.sort((a, b) =>
          Math.abs(a.name.length - name.length) - Math.abs(b.name.length - name.length)
        )[0]
        return parseItemChunk(best)
      }
    }

    // 2. Keyword fallback for custom/flavored names
    // "Blade of Blood" → look for words like blade, sword, dagger in weapon DB
    const keywords = extractItemKeywords(name)
    for (const kw of keywords) {
      for (const type of types) {
        const { data } = await supabase.from('knowledge_chunks')
          .select('content, name, type')
          .eq('type', type)
          .ilike('name', `%${kw}%`)
          .limit(2)
        if (data?.length) {
          const parsed = parseItemChunk(data[0])
          if (parsed) {
            // Keep the original custom name but use the base item's stats
            return { ...parsed, name, customName: name, basedOn: data[0].name }
          }
        }
      }
    }

    return null
  } catch { return null }
}

// Extract meaningful D&D item keywords from a custom name like "Blade of Blood"
function extractItemKeywords(name) {
  const n = name.toLowerCase()
  const keywords = []
  // Weapon type keywords
  if (/blade|sword|saber/.test(n))        keywords.push('longsword', 'shortsword')
  if (/dagger|knife|dirk|stiletto/.test(n)) keywords.push('dagger')
  if (/axe|hatchet/.test(n))             keywords.push('handaxe', 'battleaxe')
  if (/mace|club|maul|hammer/.test(n))   keywords.push('mace', 'warhammer')
  if (/staff|rod|scepter/.test(n))       keywords.push('quarterstaff')
  if (/bow|arrow/.test(n))               keywords.push('longbow', 'shortbow')
  if (/spear|lance|pike|halberd/.test(n))keywords.push('spear')
  if (/wand|want/.test(n))               keywords.push('wand')
  // Armor keywords
  if (/shield/.test(n))                  keywords.push('shield')
  if (/helm|crown|circlet/.test(n))      keywords.push('helm')
  if (/plate|mail|armor/.test(n))        keywords.push('plate', 'chain mail')
  // Magic item keywords
  if (/amulet|necklace|pendant/.test(n)) keywords.push('amulet')
  if (/ring/.test(n))                    keywords.push('ring')
  if (/cloak|mantle|cape/.test(n))       keywords.push('cloak')
  if (/boot|shoe/.test(n))               keywords.push('boots')
  if (/gauntlet|glove/.test(n))          keywords.push('gauntlets')
  if (/belt|girdle/.test(n))             keywords.push('belt')
  if (/potion/.test(n))                  keywords.push('potion')
  if (/scroll/.test(n))                  keywords.push('scroll')
  return keywords
}

// Parse a knowledge_chunk row into a normalized item object
function parseItemChunk(row) {
  if (!row) return null
  const text = row.content
  const type = row.type

  const getN = (rx, fallback = null) => { const m = text.match(rx); return m ? parseFloat(m[1]) : fallback }
  const getS = (rx, fallback = '')   => { const m = text.match(rx); return m ? m[1].trim() : fallback }

  // Parse cost — handles "50 gp", "5 sp", "10 cp"
  const costMatch = text.match(/Cost:\s*([\d,]+)\s*(cp|sp|ep|gp|pp)/i)
  let cost = 0
  if (costMatch) {
    const amt  = parseFloat(costMatch[1].replace(',', ''))
    const unit = costMatch[2].toLowerCase()
    const toGP = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 }
    cost = amt * (toGP[unit] || 1)
  }

  if (type === 'weapon') {
    const dmgMatch  = text.match(/Damage:\s*([\d]+d[\d]+(?:[+-][\d]+)?)/)
    const dmgType   = getS(/Damage:\s*[^\n]*\s+(\w+)\s*damage/i) || getS(/(slashing|piercing|bludgeoning)/i)
    const propsText = getS(/Properties:\s*([^\n]+)/)
    const props     = propsText ? propsText.split(',').map(p => p.trim()).filter(Boolean) : []
    const finesse   = props.some(p => /finesse/i.test(p))
    const versatile = props.find(p => /versatile/i.test(p))
    const rangeM    = text.match(/Range:\s*([\d/]+)/)
    return {
      name:    row.name, cat: 'weapon', slot: 'mainhand',
      damage:  dmgMatch?.[1] || '1d6',
      dmgType: dmgType || 'slashing',
      cost, weight: getN(/Weight:\s*([\d.]+)/) || 1,
      props,
      finesse, versatile: versatile ? versatile.match(/([\d]+d[\d]+)/)?.[1] : null,
      ranged:  rangeM ? true : false,
      icon: /bow|crossbow/i.test(row.name) ? '🏹' : '⚔️',
      desc: text.slice(0, 200),
      fromDB: true,
    }
  }

  if (type === 'armor') {
    const acStr    = getS(/AC:\s*([^\n]+)/)
    const baseAC   = getN(/AC:\s*(\d+)/) || 10
    const addDex   = /\+\s*Dex/i.test(acStr)
    const maxDexM  = acStr.match(/max\s*\+?(\d+)/i)
    const strReq   = getN(/Strength required:\s*(\d+)/)
    const stealth  = /Stealth disadvantage/i.test(text)
    return {
      name: row.name, cat: 'armor', slot: 'chest',
      baseAC, addDex, maxDex: maxDexM ? parseInt(maxDexM[1]) : (addDex ? null : 0),
      strReq: strReq || null, stealthDis: stealth,
      cost, weight: getN(/Weight:\s*([\d.]+)/) || 10,
      icon: '🛡️', desc: text.slice(0, 200), fromDB: true,
    }
  }

  if (type === 'magic-item') {
    const rarity     = getS(/Rarity:\s*(\w+)/)
    const attunement = /Attunement: Required/i.test(text)
    const desc       = text.replace(/^MAGIC ITEM:.*\n/, '').replace(/Type:.*\n/, '').replace(/Rarity:.*\n/, '').replace(/Attunement:.*\n/, '').trim()

    // Parse mechanical effects from description text
    const item = {
      name: row.name, cat: 'jewelry', slot: detectSlotFromName(row.name),
      cost: rarity === 'common' ? 100 : rarity === 'uncommon' ? 500 : rarity === 'rare' ? 5000 : rarity === 'very rare' ? 50000 : 1000,
      weight: 0, attunement, rarity, desc, icon: '✨', fromDB: true,
    }

    // Detect stat-setting effects (Gauntlets of Ogre Power, Amulet of Health, etc.)
    const setConM = desc.match(/Constitution score (?:is|becomes|to) (\d+)/i) || desc.match(/sets? (?:your )?(?:CON|Constitution) to (\d+)/i)
    const setStrM = desc.match(/Strength score (?:is|becomes|to) (\d+)/i)     || desc.match(/sets? (?:your )?(?:STR|Strength) to (\d+)/i)
    const setIntM = desc.match(/Intelligence score (?:is|becomes|to) (\d+)/i) || desc.match(/sets? (?:your )?(?:INT|Intelligence) to (\d+)/i)
    const setWisM = desc.match(/Wisdom score (?:is|becomes|to) (\d+)/i)       || desc.match(/sets? (?:your )?(?:WIS|Wisdom) to (\d+)/i)
    const setChaM = desc.match(/Charisma score (?:is|becomes|to) (\d+)/i)     || desc.match(/sets? (?:your )?(?:CHA|Charisma) to (\d+)/i)
    const setDexM = desc.match(/Dexterity score (?:is|becomes|to) (\d+)/i)    || desc.match(/sets? (?:your )?(?:DEX|Dexterity) to (\d+)/i)

    if (setConM) { item.setCon = parseInt(setConM[1]); item.passive = `CON becomes ${setConM[1]} (if lower)`; item.cat = 'jewelry'; item.slot = 'amulet' }
    if (setStrM) { item.setStr = parseInt(setStrM[1]); item.passive = `STR becomes ${setStrM[1]} (if lower)`; item.cat = 'armor';   item.slot = 'hands'  }
    if (setIntM) { item.setInt = parseInt(setIntM[1]); item.passive = `INT becomes ${setIntM[1]} (if lower)`; item.cat = 'jewelry'; item.slot = 'head'   }
    if (setWisM) { item.setWis = parseInt(setWisM[1]); item.passive = `WIS becomes ${setWisM[1]} (if lower)` }
    if (setChaM) { item.setCha = parseInt(setChaM[1]); item.passive = `CHA becomes ${setChaM[1]} (if lower)` }
    if (setDexM) { item.setDex = parseInt(setDexM[1]); item.passive = `DEX becomes ${setDexM[1]} (if lower)` }

    // AC bonus (+1, +2, +3 items)
    const acBonusM = desc.match(/\+([123])\s+bonus to AC/i) || desc.match(/AC (?:by |is increased by )?\+([123])/i)
    if (acBonusM) item.acBonus = parseInt(acBonusM[1])

    // Save bonus
    const saveBonusM = desc.match(/\+([123])\s+(?:bonus to )?(?:all )?saving throws/i)
    if (saveBonusM) item.saveBonus = parseInt(saveBonusM[1])

    // HP max bonus
    const hpBonusM = desc.match(/hit point maximum (?:increases|increase) by (\d+)/i)
    if (hpBonusM) item.hpBonus = parseInt(hpBonusM[1])

    if (!item.passive) item.passive = desc.slice(0, 120)
    return item
  }

  return { name: row.name, cat: 'misc', cost, icon: '📦', desc: text.slice(0,200), fromDB: true }
}

function detectSlotFromName(name) {
  const n = name.toLowerCase()
  if (/amulet|necklace|pendant|talisman|collar/.test(n)) return 'amulet'
  if (/ring/.test(n))                                      return 'ring1'
  if (/gauntlet|glove/.test(n))                            return 'hands'
  if (/boot|shoe/.test(n))                                 return 'feet'
  if (/helm|hat|cap|hood|crown|headband|circlet/.test(n))  return 'head'
  if (/cloak|cape|mantle/.test(n))                         return 'cloak'
  if (/belt/.test(n))                                      return 'cloak'
  if (/sword|axe|mace|hammer|staff|dagger|blade|bow/.test(n)) return 'mainhand'
  if (/armor|mail|plate/.test(n))                          return 'chest'
  return 'amulet'
}

// Async version of getItem — tries ITEM_DB first, then RAG
export async function resolveItem(name) {
  const local = getItem(name)
  // If we got a real match (not the generic fallback), use it
  if (local && local.cat !== 'misc' && !local.desc?.includes('An item from your adventures')) return local
  // Otherwise try the database
  const fromDB = await lookupItemFromDB(name)
  return fromDB || local
}

// ── EQUIP / UNEQUIP STAT EFFECTS ─────────────────────────
// Returns the stat updates to apply when equipping an item
export function getEquipStatUpdates(itemData, character) {
  if (!itemData) return {}
  const updates = {}
  // Stat-setting items (Amulet of Health, Gauntlets of Ogre Power, etc.)
  if (itemData.setCon !== undefined && (character.constitution || 10) < itemData.setCon)
    updates.constitution = itemData.setCon
  if (itemData.setStr !== undefined && (character.strength || 10) < itemData.setStr)
    updates.strength = itemData.setStr
  if (itemData.setInt !== undefined && (character.intelligence || 10) < itemData.setInt)
    updates.intelligence = itemData.setInt
  if (itemData.setWis !== undefined && (character.wisdom || 10) < itemData.setWis)
    updates.wisdom = itemData.setWis
  if (itemData.setCha !== undefined && (character.charisma || 10) < itemData.setCha)
    updates.charisma = itemData.setCha
  if (itemData.setDex !== undefined && (character.dexterity || 10) < itemData.setDex)
    updates.dexterity = itemData.setDex
  // HP max bonus (e.g. Ioun Stone of Fortitude)
  if (itemData.hpBonus) {
    updates.max_hp      = (character.max_hp || 10) + itemData.hpBonus
    updates.current_hp  = (character.current_hp || 10) + itemData.hpBonus
  }
  return updates
}

// Returns the stat updates to RESTORE when unequipping an item
// (reverses any stat changes the item applied)
export function getUnequipStatUpdates(itemData, character, originalStats) {
  if (!itemData) return {}
  const updates = {}
  // Restore stats that were set by this item, but only if the character's current
  // value matches what the item would have set (prevents overwriting natural growth)
  if (itemData.setCon !== undefined && character.constitution === itemData.setCon)
    updates.constitution = originalStats?.constitution || Math.min(itemData.setCon - 1, character.constitution)
  if (itemData.setStr !== undefined && character.strength === itemData.setStr)
    updates.strength = originalStats?.strength || Math.min(itemData.setStr - 1, character.strength)
  if (itemData.setInt !== undefined && character.intelligence === itemData.setInt)
    updates.intelligence = originalStats?.intelligence || Math.min(itemData.setInt - 1, character.intelligence)
  if (itemData.setWis !== undefined && character.wisdom === itemData.setWis)
    updates.wisdom = originalStats?.wisdom || Math.min(itemData.setWis - 1, character.wisdom)
  if (itemData.setCha !== undefined && character.charisma === itemData.setCha)
    updates.charisma = originalStats?.charisma || Math.min(itemData.setCha - 1, character.charisma)
  if (itemData.hpBonus) {
    updates.max_hp     = Math.max(1, (character.max_hp || 10) - itemData.hpBonus)
    updates.current_hp = Math.max(1, (character.current_hp || 10) - itemData.hpBonus)
  }
  return updates
}

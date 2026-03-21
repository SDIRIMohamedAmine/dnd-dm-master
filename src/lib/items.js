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
  if (ITEM_DB[name]) {
    data = { ...ITEM_DB[name], name }
  } else {
    const key = Object.keys(ITEM_DB).find(k => k.toLowerCase() === name.toLowerCase())
    if (key) { data = { ...ITEM_DB[key], name: key } }
  }
  if (!data) {
    const partial = Object.keys(ITEM_DB).find(k =>
      name.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(name.toLowerCase().split(' ')[0])
    )
    if (partial) data = { ...ITEM_DB[partial], name: partial }
  }
  if (!data) data = { cat:'misc', cost:1, weight:0, icon:'📦', desc:'An item from your adventures.', name }
  // Always expose both 'cat' and 'category' for backward compatibility
  if (!data.category) data = { ...data, category: data.cat || 'misc' }
  return data
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

// ── ASYNC LOOKUP from DB ──────────────────────────────────
export async function lookupItemFromDB(name) {
  try {
    const { data } = await supabase.from('knowledge_chunks')
      .select('content, name, type').eq('type','equipment').ilike('name', name).limit(1)
    if (!data?.[0]) return null
    const text  = data[0].content
    const cost  = text.match(/Cost:\s*(\d+)\s*(gp|sp|cp)/i)
    const ac    = text.match(/AC:\s*(\d+)/)
    const dmg   = text.match(/Damage:\s*([^\n|]+)/)
    const props = text.match(/Properties:\s*([^\n]+)/)
    return {
      name:       data[0].name,
      cost:       cost ? parseInt(cost[1])*(cost[2]==='sp'?.1:cost[2]==='cp'?.01:1) : null,
      ac:         ac   ? parseInt(ac[1]) : null,
      damage:     dmg  ? dmg[1].trim()   : null,
      properties: props? props[1].split(',').map(p=>p.trim()) : [],
    }
  } catch { return null }
}
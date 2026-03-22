// src/lib/contentRegistry.js
// ══════════════════════════════════════════════════════════════
// CONTENT REGISTRY — Single source of truth for all custom content.
//
// Handles: Items, Spells, Creatures, NPCs, Campaigns
// Every piece of custom content goes through here:
//   1. Validated against balance rules
//   2. Converted to a structured schema the engine understands
//   3. Stored in Supabase
//   4. Served back to the engine and DM prompt
//
// The LLM NEVER invents mechanics. It receives structured data
// from here and narrates outcomes only.
// ══════════════════════════════════════════════════════════════

import { supabase }          from './supabase'
import { contentValidator as _realValidator } from './contentValidator'

// Prefer real validator; fall back to passthrough if import fails
const _fallbackValidator = {
  validateItem:    (raw) => ({ ok: true, data: raw, warnings: [] }),
  validateSpell:   (raw) => ({ ok: true, data: raw, warnings: [] }),
  validateCreature:(raw) => ({ ok: true, data: raw, warnings: [] }),
}
const contentValidator = _realValidator || _fallbackValidator

// ── In-memory caches ──────────────────────────────────────────
const _cache = {
  items:     {},   // slug → ItemDef
  spells:    {},   // slug → SpellDef
  creatures: {},   // slug → CreatureDef
  npcs:      {},   // id   → NPCDef
}

// ════════════════════════════════════════════════════════════
// SCHEMAS — canonical shapes for every content type
// ════════════════════════════════════════════════════════════

/**
 * ITEM SCHEMA
 * Compatible with ITEM_DB in items.js and ArmorModal/InventoryModal
 */
export const ItemSchema = {
  name:       '',          // display name
  slug:       '',          // url-safe key
  cat:        'misc',      // weapon | armor | jewelry | consumable | tool | misc
  slot:       null,        // mainhand | offhand | chest | head | amulet | ring1 | ring2 | hands | feet | cloak | ranged | consumable
  rarity:     'common',    // common | uncommon | rare | very_rare | legendary
  cost:       0,           // gold pieces
  weight:     0,           // lbs
  icon:       '📦',
  desc:       '',
  attunement: false,
  // Weapon fields
  damage:     null,        // e.g. '1d8'
  dmgType:    null,        // slashing | piercing | bludgeoning | fire | etc
  props:      [],          // ['Finesse', 'Versatile (1d10)']
  finesse:    false,
  versatile:  null,        // dice for two-handed e.g. '1d10'
  // Armor fields
  baseAC:     null,
  addDex:     false,
  maxDex:     null,
  acBonus:    null,
  stealthDis: false,
  strReq:     null,
  // Magic item stat setters
  setCon: null, setStr: null, setDex: null,
  setInt: null, setWis: null, setCha: null,
  hpBonus:    null,
  saveBonus:  null,
  // Combat triggers (executed by engine, NOT described by LLM)
  onHit:      null,        // { damage: '1d4', type: 'necrotic', condition: 'bleeding', duration: 2 }
  onCrit:     null,        // { damage: '2d6', type: 'fire' }
  onEquip:    null,        // { stat: 'CON', value: 19 }
  // Consumable
  heal:       null,        // '2d4+2'
  // Passive text (shown to player)
  passive:    null,
  // Meta
  campaign_id: null,
  created_by:  'player',   // 'player' | 'ai' | 'system'
  validated:   false,
}

/**
 * SPELL SCHEMA
 * Compatible with PLAYER_SPELLS in engine.js and spellCompiler.js
 */
export const SpellSchema = {
  name:         '',
  slug:         '',
  level:        0,
  school:       'evocation',
  castAs:       'action',       // action | bonus | reaction
  castingStat:  'int',          // int | wis | cha
  concentration: false,
  ritual:       false,
  spellType:    'utility',      // attack | save | heal | buff | debuff | utility | dart
  rangeType:    'single',       // single | aoe | self | touch
  targetType:   'enemy',        // enemy | self | self_or_ally | all_enemies | any
  damageDice:   null,           // '3d6'
  damageType:   null,           // fire | cold | etc
  saveStat:     null,           // STR | DEX | CON | INT | WIS | CHA
  saveOnHalf:   false,
  isAttackRoll: false,
  isHeal:       false,
  healDice:     null,
  statusEffect: null,           // { effectId: 'stunned', duration: 2 }
  halfOnSave:   false,
  icon:         '✨',
  description:  '',
  mechanics:    {},             // freeform notes for unusual rules
  campaign_id:  null,
  created_by:   'player',
  validated:    false,
}

/**
 * CREATURE SCHEMA
 * Compatible with MONSTER_STATS in engine.js and lookupMonsterStats in rag.js
 */
export const CreatureSchema = {
  name:       '',
  slug:       '',
  cr:         '1',              // '1/8' | '1/4' | '1/2' | '1' | '2' | etc
  size:       'Medium',
  type:       'humanoid',
  hp:         10,
  maxHp:      10,
  ac:         12,
  speed:      30,
  str: 10, dex: 10, con: 10,
  int: 10, wis: 10, cha: 10,
  profBonus:  2,
  savingThrows: [],             // ['DEX', 'CON']
  skills:     {},               // { Perception: 4, Stealth: 6 }
  damageImmunities:    [],
  damageResistances:   [],
  damageVulnerabilities: [],
  conditionImmunities: [],
  senses:     '',               // 'darkvision 60 ft'
  languages:  'Common',
  xp:         50,
  attacks: [
    // { name: 'Claw', bonus: 4, damage: '1d6+2', type: 'slashing',
    //   special: { stat: 'DEX', dc: 12, effectId: 'prone', duration: 1, desc: 'knocked prone' } }
  ],
  spellList:  [],               // keys into ENEMY_SPELLS
  loot:       { gold: [0,5], items: [] },
  flavor:     [],               // attack flavor strings
  legendary:  false,
  legendaryActions: [],
  description: '',
  campaign_id: null,
  created_by:  'player',
  validated:   false,
}

/**
 * NPC SCHEMA
 */
export const NPCSchema = {
  name:         '',
  role:         'neutral',      // ally | foe | neutral
  attitude:     2,              // 0-4: Hostile | Unfriendly | Indifferent | Friendly | Helpful
  location:     '',
  description:  '',
  personality:  '',
  wants:        '',             // their primary motivation
  secret:       '',             // something they hide
  notes:        '',
  // Combat capability (optional — if they fight)
  is_combatant: false,
  creature_slug: null,          // links to CreatureSchema
  // Dialogue
  voice:        '',             // gruff | whispery | formal | jovial
  topics:       [],             // things they know about: ['the dungeon', 'the thieves guild']
  campaign_id:  null,
  created_by:   'player',
}

/**
 * CAMPAIGN SCHEMA
 */
export const CampaignContentSchema = {
  campaign_id:        null,
  theme:              'balanced',    // dark | heroic | comedic | mystery | survival | political
  world_name:         'the Forgotten Realms',
  start_location:     '',
  // Structured world content
  locations: [],                     // { name, description, type, npcs, encounters, loot_table }
  key_npcs:  [],                     // NPC slugs
  available_monsters: [],            // CreatureSchema slugs valid for this campaign
  custom_loot_tables: {},            // zone → [{ itemSlug, weight }]
  // Rules
  house_rules:        '',
  difficulty:         'standard',   // easy | standard | hard | deadly
  // Meta
  created_at:         null,
}

// ════════════════════════════════════════════════════════════
// REGISTRY OPERATIONS
// ════════════════════════════════════════════════════════════

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ── ITEMS ─────────────────────────────────────────────────────

export async function registerItem(raw, campaignId) {
  const validated = contentValidator.validateItem(raw)
  if (!validated.ok) return { error: validated.errors }

  const item = { ...ItemSchema, ...raw, ...validated.data,
    slug: slugify(raw.name), campaign_id: campaignId, validated: true }

  // Persist to Supabase
  const { error } = await supabase.from('custom_content').upsert({
    campaign_id: campaignId,
    type:        'item',
    slug:        item.slug,
    name:        item.name,
    data:        JSON.stringify(item),
    created_at:  new Date().toISOString(),
  }, { onConflict: 'campaign_id,type,slug' })

  if (error) return { error: error.message }

  // Cache it
  _cache.items[item.slug] = item
  // Also inject into window.__customItemCache so getItem() finds it instantly
  if (typeof window !== 'undefined') {
    window.__customItemCache = window.__customItemCache || {}
    window.__customItemCache[item.name] = item
  }

  console.log(`[Registry] Item "${item.name}" registered (${item.rarity}, ${item.cat})`)
  return { ok: true, item }
}

export async function getRegisteredItem(nameOrSlug, campaignId) {
  const slug = slugify(nameOrSlug)
  if (_cache.items[slug]) return _cache.items[slug]

  try {
    const { data } = await supabase.from('custom_content')
      .select('data').eq('campaign_id', campaignId).eq('type', 'item').eq('slug', slug).single()
    if (data?.data) {
      const item = typeof data.data === 'string' ? JSON.parse(data.data) : data.data
      _cache.items[slug] = item
      return item
    }
  } catch {}
  return null
}

export async function listRegisteredItems(campaignId) {
  const { data } = await supabase.from('custom_content')
    .select('slug, name, data').eq('campaign_id', campaignId).eq('type', 'item').order('name')
  return (data || []).map(r => typeof r.data === 'string' ? JSON.parse(r.data) : r.data)
}

// ── SPELLS ────────────────────────────────────────────────────

export async function registerSpell(raw, campaignId) {
  const validated = contentValidator.validateSpell(raw)
  if (!validated.ok) return { error: validated.errors }

  const spell = { ...SpellSchema, ...raw, ...validated.data,
    slug: slugify(raw.name), campaign_id: campaignId, validated: true }

  const { error } = await supabase.from('custom_content').upsert({
    campaign_id: campaignId,
    type:        'spell',
    slug:        spell.slug,
    name:        spell.name,
    data:        JSON.stringify(spell),
    created_at:  new Date().toISOString(),
  }, { onConflict: 'campaign_id,type,slug' })

  if (error) return { error: error.message }
  _cache.spells[spell.slug] = spell

  // Also persist to compiled_spells table so spellResolver finds it
  await supabase.from('compiled_spells').upsert({
    campaign_id: campaignId,
    name:        spell.name,
    slug:        spell.slug,
    level:       spell.level,
    school:      spell.school,
    definition:  JSON.stringify(spell),
    created_at:  new Date().toISOString(),
  }, { onConflict: 'campaign_id,slug' })

  console.log(`[Registry] Spell "${spell.name}" registered (Lv${spell.level} ${spell.school})`)
  return { ok: true, spell }
}

export async function getRegisteredSpell(nameOrSlug, campaignId) {
  const slug = slugify(nameOrSlug)
  if (_cache.spells[slug]) return _cache.spells[slug]

  try {
    const { data } = await supabase.from('custom_content')
      .select('data').eq('campaign_id', campaignId).eq('type', 'spell').eq('slug', slug).single()
    if (data?.data) {
      const spell = typeof data.data === 'string' ? JSON.parse(data.data) : data.data
      _cache.spells[slug] = spell
      return spell
    }
  } catch {}
  return null
}

// ── CREATURES ─────────────────────────────────────────────────

export async function registerCreature(raw, campaignId) {
  const validated = contentValidator.validateCreature(raw)
  if (!validated.ok) return { error: validated.errors }

  const creature = { ...CreatureSchema, ...raw, ...validated.data,
    slug: slugify(raw.name), campaign_id: campaignId, validated: true }

  const { error } = await supabase.from('custom_content').upsert({
    campaign_id: campaignId,
    type:        'creature',
    slug:        creature.slug,
    name:        creature.name,
    data:        JSON.stringify(creature),
    created_at:  new Date().toISOString(),
  }, { onConflict: 'campaign_id,type,slug' })

  if (error) return { error: error.message }
  _cache.creatures[creature.slug] = creature

  console.log(`[Registry] Creature "${creature.name}" registered (CR ${creature.cr})`)
  return { ok: true, creature }
}

export async function getRegisteredCreature(nameOrSlug, campaignId) {
  const slug = slugify(nameOrSlug)
  if (_cache.creatures[slug]) return _cache.creatures[slug]

  try {
    const { data } = await supabase.from('custom_content')
      .select('data').eq('campaign_id', campaignId).eq('type', 'creature').eq('slug', slug).single()
    if (data?.data) {
      const creature = typeof data.data === 'string' ? JSON.parse(data.data) : data.data
      _cache.creatures[slug] = creature
      return creature
    }
  } catch {}
  return null
}

export async function listRegisteredCreatures(campaignId) {
  const { data } = await supabase.from('custom_content')
    .select('slug, name, data').eq('campaign_id', campaignId).eq('type', 'creature').order('name')
  return (data || []).map(r => typeof r.data === 'string' ? JSON.parse(r.data) : r.data)
}

// ── NPCS ──────────────────────────────────────────────────────

export async function registerNPC(raw, campaignId) {
  const npc = { ...NPCSchema, ...raw, campaign_id: campaignId }

  const { data, error } = await supabase.from('npcs').upsert({
    campaign_id:  campaignId,
    name:         npc.name,
    role:         npc.role,
    location:     npc.location,
    description:  npc.description,
    notes:        JSON.stringify({ personality: npc.personality, wants: npc.wants, secret: npc.secret, voice: npc.voice, topics: npc.topics }),
    is_combatant: npc.is_combatant,
    creature_slug: npc.creature_slug,
  }, { onConflict: 'campaign_id,name' }).select().single()

  if (error) return { error: error.message }
  return { ok: true, npc: { ...npc, id: data?.id } }
}

// ── LOAD ALL CUSTOM CONTENT INTO CACHE ────────────────────────
// Call once per campaign load to warm up all caches

export async function loadCampaignContent(campaignId) {
  if (!campaignId) return
  try {
    const { data } = await supabase.from('custom_content')
      .select('type, slug, name, data').eq('campaign_id', campaignId)

    if (!data?.length) return

    const items = []
    for (const row of data) {
      const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data
      _cache[row.type + 's'] = _cache[row.type + 's'] || {}
      _cache[row.type + 's'][row.slug] = parsed

      // Warm up window.__customItemCache for items
      if (row.type === 'item' && typeof window !== 'undefined') {
        window.__customItemCache = window.__customItemCache || {}
        window.__customItemCache[parsed.name] = parsed
      }
      if (row.type === 'item') items.push(parsed)
    }

    console.log(`[Registry] Loaded ${data.length} custom content records for campaign ${campaignId}`)
    return { items }
  } catch (e) {
    console.warn('[Registry] Failed to load campaign content:', e.message)
  }
}

// ── CONTEXT INJECTION FOR LLM PROMPT ─────────────────────────
// Builds a compact block the DM prompt can use to reference available
// custom content WITHOUT revealing stats (those stay in the engine)

export function buildContentContextBlock(campaignId) {
  const items     = Object.values(_cache.items).filter(i => i.campaign_id === campaignId)
  const creatures = Object.values(_cache.creatures).filter(c => c.campaign_id === campaignId)
  const spells    = Object.values(_cache.spells).filter(s => s.campaign_id === campaignId)

  const lines = []

  if (items.length) {
    lines.push('CUSTOM ITEMS (use these names exactly when giving items):')
    lines.push(...items.map(i => `  [ITEM: ${i.name} | ${i.slot || 'misc'} | ${i.passive || i.desc?.slice(0,80)}]`))
  }

  if (creatures.length) {
    lines.push('CUSTOM CREATURES (use these ONLY — do not invent others):')
    lines.push(...creatures.map(c => `  ${c.name} (CR ${c.cr}) — ${c.description?.slice(0,80) || c.type}`))
  }

  if (spells.length) {
    lines.push('CUSTOM SPELLS (character knows these — reference by name):')
    lines.push(...spells.map(s => `  ${s.name} (Lv${s.level} ${s.school}) — ${s.description?.slice(0,80)}`))
  }

  return lines.length ? lines.join('\n') : ''
}

// ── PARSE ITEM FROM DM [ITEM:] TAG AND REGISTER ───────────────
// Called by useCampaign.processEvents when DM issues an [ITEM:] tag

export async function parseAndRegisterItemFromTag(itemName, slot, effectText, campaignId) {
  const effect = effectText.toLowerCase()

  const item = { ...ItemSchema, name: itemName }

  // Detect category from slot
  item.slot = slot
  item.cat = slot === 'consumable' ? 'consumable'
    : /mainhand|offhand|ranged/.test(slot) ? 'weapon'
    : /chest|head|hands|feet|legs/.test(slot) ? 'armor'
    : 'jewelry'

  // Parse weapon stats
  const dmgMatch = effect.match(/(\d+d\d+(?:[+-]\d+)?)\s+(slashing|piercing|bludgeoning|fire|cold|lightning|necrotic|radiant|poison|psychic|thunder|acid|force)/i)
  if (dmgMatch) { item.damage = dmgMatch[1]; item.dmgType = dmgMatch[2].toLowerCase() }

  // Parse on-hit effects
  const bleedMatch  = effect.match(/bleed[s]?\s+(\d+d\d+)\s+(necrotic|poison|acid)/i)
  const burnMatch   = effect.match(/burn[s]?\s+(\d+d\d+)/i)
  if (bleedMatch) item.onHit = { damage: bleedMatch[1], type: bleedMatch[2], condition: 'bleeding', duration: 2 }
  if (burnMatch)  item.onHit = { damage: burnMatch[1], type: 'fire', condition: 'burning', duration: 2 }

  // Parse on-crit effects
  const critMatch = effect.match(/on\s+crit(?:ical)?,?\s+([^.]+)/i)
  if (critMatch) {
    const critDmg = critMatch[1].match(/(\d+d\d+)\s+(\w+)/)
    if (critDmg) item.onCrit = { damage: critDmg[1], type: critDmg[2].toLowerCase() }
  }

  // Parse stat setters (Amulet of Health pattern)
  const setConMatch = effect.match(/(?:sets?|raises?|become)\s+con(?:stitution)?\s+(?:to\s+)?(\d+)/i)
  const setStrMatch = effect.match(/(?:sets?|raises?|become)\s+str(?:ength)?\s+(?:to\s+)?(\d+)/i)
  if (setConMatch) { item.setCon = parseInt(setConMatch[1]); item.attunement = true }
  if (setStrMatch) { item.setStr = parseInt(setStrMatch[1]); item.attunement = true }

  // Parse AC bonus
  const acMatch = effect.match(/\+([123])\s+ac/i)
  if (acMatch) item.acBonus = parseInt(acMatch[1])

  // Parse save bonus
  const saveMatch = effect.match(/\+([123])\s+(?:to (?:all )?)?saving throws/i)
  if (saveMatch) item.saveBonus = parseInt(saveMatch[1])

  // Parse attunement flag
  if (/requires? attunement|attunement required/i.test(effectText)) item.attunement = true

  // Parse healing (consumables)
  const healMatch = effect.match(/restore[sd]?\s+(\d+d\d+[+-]?\d*)\s+hp/i)
  if (healMatch) { item.heal = healMatch[1]; item.cat = 'consumable'; item.slot = 'consumable' }

  // Estimate rarity from power level
  const totalMagicCount = [item.damage, item.onHit, item.onCrit, item.setCon, item.setStr, item.acBonus, item.saveBonus].filter(Boolean).length
  item.rarity = totalMagicCount === 0 ? 'common'
    : totalMagicCount === 1 ? 'uncommon'
    : totalMagicCount === 2 ? 'rare'
    : 'very_rare'

  item.cost = item.rarity === 'uncommon' ? 500 : item.rarity === 'rare' ? 5000 : item.rarity === 'very_rare' ? 50000 : 50
  item.desc  = effectText
  item.passive = effectText
  item.created_by = 'ai'

  return registerItem(item, campaignId)
}
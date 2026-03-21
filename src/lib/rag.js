// src/lib/rag.js
// ══════════════════════════════════════════════════════════
// Knowledge base using dnd5eapi.co/api/2014
// Complete SRD data with structured JSON — far better than Open5e
// ══════════════════════════════════════════════════════════
import { supabase } from './supabase'

const BASE = 'https://www.dnd5eapi.co/api/2014'

// ── ALL ENDPOINTS ─────────────────────────────────────────
export const ALL_ENDPOINTS = [
  { key: 'monsters',           label: 'Monsters',          icon: '🐉', desc: '330+ creatures with full stat blocks' },
  { key: 'spells',             label: 'Spells',             icon: '✨', desc: '320+ spells with damage scaling' },
  { key: 'equipment',          label: 'Equipment & Weapons',icon: '⚔️', desc: 'All weapons, armor, gear with real costs' },
  { key: 'magic-items',        label: 'Magic Items',        icon: '💍', desc: 'Magic items with full descriptions' },
  { key: 'classes',            label: 'Classes',            icon: '🧙', desc: 'All 12 classes with features' },
  { key: 'subclasses',         label: 'Subclasses',         icon: '🎯', desc: 'All subclasses with features' },
  { key: 'races',              label: 'Races',              icon: '🧝', desc: 'All races and subraces with traits' },
  { key: 'backgrounds',        label: 'Backgrounds',        icon: '📜', desc: 'All backgrounds with features' },
  { key: 'feats',              label: 'Feats',              icon: '⭐', desc: 'All feats with prerequisites' },
  { key: 'conditions',         label: 'Conditions',         icon: '🌀', desc: 'All conditions (Poisoned, Stunned…)' },
  { key: 'damage-types',       label: 'Damage Types',       icon: '💥', desc: 'All damage types' },
  { key: 'traits',             label: 'Racial Traits',      icon: '🔖', desc: 'All racial traits' },
  { key: 'proficiencies',      label: 'Proficiencies',      icon: '📋', desc: 'All weapon/armor/skill proficiencies' },
  { key: 'skills',             label: 'Skills',             icon: '🎲', desc: 'All 18 skills with ability scores' },
  { key: 'ability-scores',     label: 'Ability Scores',     icon: '💪', desc: 'STR/DEX/CON/INT/WIS/CHA descriptions' },
  { key: 'alignments',         label: 'Alignments',         icon: '☯️', desc: 'All 9 alignments' },
  { key: 'languages',          label: 'Languages',          icon: '🗣️', desc: 'All languages' },
  { key: 'rule-sections',      label: 'Rules',              icon: '📖', desc: 'SRD rules text' },
]

// ── FETCH ALL FROM dnd5eapi ────────────────────────────────
export async function fetchAllFromDnd5e(endpoint, onProgress) {
  // First get the list of all items
  const listRes  = await fetch(`${BASE}/${endpoint}?limit=500`)
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} for ${endpoint}`)
  const listData = await listRes.json()

  const items    = listData.results || listData
  const total    = items.length
  const results  = []

  // Fetch each item's full data
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const url  = item.url ? `https://www.dnd5eapi.co${item.url}` : `${BASE}/${endpoint}/${item.index}`
    try {
      const res  = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        results.push(data)
      }
    } catch { /* skip failed items */ }
    if (onProgress) onProgress(i + 1, total)
    // Small delay to be respectful to the API
    if (i % 20 === 19) await new Promise(r => setTimeout(r, 200))
  }
  return results
}

// ── CHUNKERS ──────────────────────────────────────────────

function arr(val) {
  if (!val) return ''
  if (Array.isArray(val)) return val.join(', ')
  return String(val)
}

function descText(val) {
  if (!val) return ''
  if (Array.isArray(val)) return val.join('\n')
  return String(val)
}

export function chunkMonster(m) {
  const actions   = (m.actions || []).map(a => `  • ${a.name}: ${a.desc || ''}`).join('\n')
  const specials  = (m.special_abilities || []).map(a => `  • ${a.name}: ${a.desc || ''}`).join('\n')
  const legendary = (m.legendary_actions || []).map(a => `  • ${a.name}: ${a.desc || ''}`).join('\n')
  const reactions = (m.reactions || []).map(a => `  • ${a.name}: ${a.desc || ''}`).join('\n')

  const saves = (m.proficiencies || [])
    .filter(p => p.proficiency?.name?.startsWith('Saving Throw'))
    .map(p => `${p.proficiency.name.replace('Saving Throw: ','')} ${p.value >= 0 ? '+' : ''}${p.value}`)
    .join(', ')

  const skills = (m.proficiencies || [])
    .filter(p => p.proficiency?.name?.startsWith('Skill'))
    .map(p => `${p.proficiency.name.replace('Skill: ','')} ${p.value >= 0 ? '+' : ''}${p.value}`)
    .join(', ')

  const speed = Object.entries(m.speed || {}).map(([k,v]) => `${k} ${v}`).join(', ')

  return {
    id: `monster:${m.index}`, type: 'monster', name: m.name, source: 'dnd5eapi',
    text: [
      `MONSTER: ${m.name}`,
      `Type: ${m.type}${m.subtype ? ` (${m.subtype})` : ''} | Size: ${m.size} | CR: ${m.challenge_rating} | Alignment: ${m.alignment || 'any'}`,
      `AC: ${m.armor_class?.[0]?.value || m.armor_class} (${m.armor_class?.[0]?.type || ''}) | HP: ${m.hit_points} (${m.hit_points_roll || ''}) | Speed: ${speed}`,
      `STR ${m.strength} | DEX ${m.dexterity} | CON ${m.constitution} | INT ${m.intelligence} | WIS ${m.wisdom} | CHA ${m.charisma}`,
      saves  && `Saving Throws: ${saves}`,
      skills && `Skills: ${skills}`,
      m.damage_vulnerabilities?.length && `Vulnerabilities: ${arr(m.damage_vulnerabilities)}`,
      m.damage_resistances?.length     && `Resistances: ${arr(m.damage_resistances)}`,
      m.damage_immunities?.length      && `Immunities: ${arr(m.damage_immunities)}`,
      m.condition_immunities?.length   && `Condition Immunities: ${m.condition_immunities.map(c=>c.name).join(', ')}`,
      `Senses: ${Object.entries(m.senses || {}).map(([k,v])=>`${k} ${v}`).join(', ')} | Languages: ${m.languages || 'none'}`,
      `XP: ${m.xp || 0}`,
      specials  && `\nSpecial Abilities:\n${specials}`,
      actions   && `\nActions:\n${actions}`,
      reactions && `\nReactions:\n${reactions}`,
      legendary && `\nLegendary Actions:\n${legendary}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkSpell(s) {
  const dmg = s.damage
    ? `${s.damage.damage_type?.name || ''} | Scaling: ${JSON.stringify(s.damage.damage_at_slot_level || s.damage.damage_at_character_level || {})}`
    : ''
  const dc  = s.dc ? `DC: ${s.dc.dc_type?.name} (${s.dc.dc_success})` : ''
  const heal= s.heal_at_slot_level ? `Healing: ${JSON.stringify(s.heal_at_slot_level)}` : ''

  return {
    id: `spell:${s.index}`, type: 'spell', name: s.name, source: 'dnd5eapi',
    text: [
      `SPELL: ${s.name}`,
      `Level: ${s.level === 0 ? 'Cantrip' : `${s.level}${['st','nd','rd'][s.level-1]||'th'}-level`} ${s.school?.name || ''}`,
      `Casting Time: ${s.casting_time} | Range: ${s.range} | Duration: ${s.duration}`,
      `Components: ${arr(s.components)}${s.material ? ` (${s.material})` : ''}`,
      `Ritual: ${s.ritual ? 'Yes' : 'No'} | Concentration: ${s.concentration ? 'Yes' : 'No'}`,
      `Classes: ${(s.classes || []).map(c=>c.name).join(', ')}`,
      dmg  && `Damage: ${dmg}`,
      dc   && dc,
      heal && heal,
      s.attack_type && `Attack type: ${s.attack_type}`,
      `\n${descText(s.desc)}`,
      s.higher_level?.length && `\nAt Higher Levels: ${descText(s.higher_level)}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkEquipment(e) {
  // Covers weapons, armor, adventuring gear, tools, mounts, vehicles
  const category = e.equipment_category?.name || 'equipment'
  const cost     = e.cost ? `${e.cost.quantity} ${e.cost.unit}` : 'unknown'
  const weight   = e.weight ? `${e.weight} lb` : ''

  let details = ''
  if (e.weapon_range) {
    const dmg = e.damage ? `${e.damage.damage_dice} ${e.damage.damage_type?.name}` : ''
    const r2  = e.two_handed_damage ? ` (versatile: ${e.two_handed_damage.damage_dice})` : ''
    const rng = e.range ? `Range: ${e.range.normal}${e.range.long?`/${e.range.long}`:''} ft` : ''
    const props = (e.properties || []).map(p=>p.name).join(', ')
    details = `Damage: ${dmg}${r2} | ${rng} | Properties: ${props}`
  }
  if (e.armor_category) {
    const acStr = e.armor_class
      ? `AC: ${e.armor_class.base}${e.armor_class.dex_bonus?' + DEX':''}${e.armor_class.max_bonus?` (max +${e.armor_class.max_bonus})`:''}`
      : ''
    const stealth = e.stealth_disadvantage ? ' | Stealth: Disadvantage' : ''
    const str_min = e.str_minimum ? ` | Requires STR ${e.str_minimum}` : ''
    details = `${acStr}${stealth}${str_min}`
  }

  return {
    id: `equipment:${e.index}`, type: 'equipment', name: e.name, source: 'dnd5eapi',
    text: [
      `EQUIPMENT: ${e.name}`,
      `Category: ${category}${e.weapon_category?' | '+e.weapon_category:''}${e.armor_category?' | '+e.armor_category:''}`,
      `Cost: ${cost}${weight ? ` | Weight: ${weight}` : ''}`,
      details,
      e.desc?.length && `\n${descText(e.desc)}`,
      e.special?.length && `Special: ${descText(e.special)}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkMagicItem(item) {
  return {
    id: `magic-item:${item.index}`, type: 'magic-item', name: item.name, source: 'dnd5eapi',
    text: [
      `MAGIC ITEM: ${item.name}`,
      `Rarity: ${item.rarity?.name || 'varies'} | Category: ${item.equipment_category?.name || 'wondrous'}`,
      item.requires_attunement && `Attunement: Required`,
      `\n${descText(item.desc)}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkClass(c) {
  const proficiencies = (c.proficiencies || []).map(p=>p.name).join(', ')
  const savingThrows  = (c.saving_throws || []).map(s=>s.name).join(', ')

  return {
    id: `class:${c.index}`, type: 'class', name: c.name, source: 'dnd5eapi',
    text: [
      `CLASS: ${c.name}`,
      `Hit Die: d${c.hit_die} | Saving Throws: ${savingThrows}`,
      `Proficiencies: ${proficiencies}`,
      c.proficiency_choices?.length && `Skill Choices: pick ${c.proficiency_choices[0]?.choose} from ${(c.proficiency_choices[0]?.from?.options||[]).map(o=>o.item?.name||'').filter(Boolean).join(', ')}`,
      c.multi_classing?.prerequisites?.length && `Multiclass Requires: ${c.multi_classing.prerequisites.map(p=>`${p.ability_score?.name} ${p.minimum_score}`).join(', ')}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkSubclass(s) {
  return {
    id: `subclass:${s.index}`, type: 'subclass', name: s.name, source: 'dnd5eapi',
    text: [
      `SUBCLASS: ${s.name} (${s.class?.name || ''})`,
      `Flavor: ${s.subclass_flavor || ''}`,
      `\n${descText(s.desc)}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkRace(r) {
  const asi = (r.ability_bonuses || []).map(a=>`${a.ability_score?.name} +${a.bonus}`).join(', ')
  const traits = (r.traits || []).map(t=>t.name).join(', ')

  return {
    id: `race:${r.index}`, type: 'race', name: r.name, source: 'dnd5eapi',
    text: [
      `RACE: ${r.name}`,
      `Speed: ${r.speed} ft | Size: ${r.size} | ${r.size_description || ''}`,
      asi && `Ability Bonuses: ${asi}`,
      traits && `Traits: ${traits}`,
      r.languages?.length && `Languages: ${r.languages.map(l=>l.name).join(', ')}`,
      r.language_desc && r.language_desc,
      r.alignment && `Alignment tendency: ${r.alignment}`,
      r.age && `Age: ${r.age}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkBackground(b) {
  const skills = (b.starting_proficiencies || []).map(p=>p.name).join(', ')
  const feature= b.feature ? `Feature — ${b.feature.name}: ${b.feature.desc?.[0] || ''}` : ''

  return {
    id: `background:${b.index}`, type: 'background', name: b.name, source: 'dnd5eapi',
    text: [
      `BACKGROUND: ${b.name}`,
      skills && `Skills: ${skills}`,
      feature,
      b.personality_traits?.from?.options?.length &&
        `Personality traits: ${b.personality_traits.from.options.slice(0,2).map(o=>o.string||'').join(' | ')}`,
      b.ideals?.from?.options?.length &&
        `Ideals: ${b.ideals.from.options.slice(0,2).map(o=>o.desc||o.string||'').join(' | ')}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkFeat(f) {
  return {
    id: `feat:${f.index}`, type: 'feat', name: f.name, source: 'dnd5eapi',
    text: [
      `FEAT: ${f.name}`,
      f.prerequisites?.length && `Prerequisites: ${f.prerequisites.map(p=>`${p.ability_score?.name||''} ${p.minimum_score||''}`).join(', ')}`,
      `\n${descText(f.desc)}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkCondition(c) {
  return {
    id: `condition:${c.index}`, type: 'condition', name: c.name, source: 'dnd5eapi',
    text: `CONDITION: ${c.name}\n\n${descText(c.desc)}`,
  }
}

export function chunkSkill(s) {
  return {
    id: `skill:${s.index}`, type: 'skill', name: s.name, source: 'dnd5eapi',
    text: `SKILL: ${s.name}\nAbility Score: ${s.ability_score?.full_name || s.ability_score?.name}\n\n${descText(s.desc)}`,
  }
}

export function chunkTrait(t) {
  return {
    id: `trait:${t.index}`, type: 'trait', name: t.name, source: 'dnd5eapi',
    text: [
      `TRAIT: ${t.name}`,
      t.races?.length && `Races: ${t.races.map(r=>r.name).join(', ')}`,
      `\n${descText(t.desc)}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkGeneric(item, type) {
  return {
    id: `${type}:${item.index}`, type, name: item.name, source: 'dnd5eapi',
    text: [
      `${type.toUpperCase()}: ${item.name}`,
      descText(item.desc),
    ].filter(Boolean).join('\n'),
  }
}

export const CHUNKER_MAP = {
  'monsters':       chunkMonster,
  'spells':         chunkSpell,
  'equipment':      chunkEquipment,
  'magic-items':    chunkMagicItem,
  'classes':        chunkClass,
  'subclasses':     chunkSubclass,
  'races':          chunkRace,
  'backgrounds':    chunkBackground,
  'feats':          chunkFeat,
  'conditions':     chunkCondition,
  'traits':         chunkTrait,
  'skills':         chunkSkill,
  'damage-types':   (i) => chunkGeneric(i, 'damage-type'),
  'proficiencies':  (i) => chunkGeneric(i, 'proficiency'),
  'ability-scores': (i) => chunkGeneric(i, 'ability-score'),
  'alignments':     (i) => chunkGeneric(i, 'alignment'),
  'languages':      (i) => chunkGeneric(i, 'language'),
  'rule-sections':  (i) => chunkGeneric(i, 'rule'),
}

// ── RETRIEVE from Supabase ────────────────────────────────
const STOP_WORDS = new Set([
  'the','and','for','are','but','not','you','all','can','has','this','that',
  'with','have','from','they','will','your','which','their','been','what',
  'does','how','when','where','who','tell','me','about','is','a','an','of',
  'in','on','at','to','do','its','give','use','would','could','should',
  'make','into','also','more','some','any','my','by','or','so','if',
])

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
}

export async function retrieveFromSupabase(query, topK = 5) {
  const tokens = tokenize(query)
  if (!tokens.length) return []

  const { data: nameMatches } = await supabase
    .from('knowledge_chunks').select('chunk_id, type, name, source, content')
    .ilike('name', `%${tokens[0]}%`).limit(topK * 2)

  const { data: contentMatches } = await supabase
    .from('knowledge_chunks').select('chunk_id, type, name, source, content')
    .textSearch('content', tokens.slice(0,3).join(' | '), { type: 'websearch' })
    .limit(topK * 2).catch(() => ({ data: [] }))

  const all  = [...(nameMatches||[]), ...(contentMatches||[])]
  const seen = new Set()
  const unique = all.filter(r => { if (seen.has(r.chunk_id)) return false; seen.add(r.chunk_id); return true })

  const scored = unique.map(row => {
    const nl = row.name.toLowerCase(); const cl = row.content.toLowerCase()
    let score = 0
    for (const t of tokens) {
      if (nl === t) score += 8
      else if (nl.includes(t)) score += 4
      if (cl.includes(t)) score += 1
    }
    return { row, score }
  })

  return scored.sort((a,b)=>b.score-a.score).slice(0,topK)
    .map(s => ({ id:s.row.chunk_id, type:s.row.type, name:s.row.name, source:s.row.source, text:s.row.content }))
}

export function buildContextBlock(chunks) {
  if (!chunks.length) return 'No specific lore retrieved.'
  return chunks.map((c,i) => `[${i+1}] ${c.text}`).join('\n\n---\n\n')
}

// ── MONSTER LOOKUP (for combat) ───────────────────────────
export async function lookupMonsterStats(name) {
  if (!name) return null
  const { data: exact } = await supabase
    .from('knowledge_chunks').select('content, name')
    .eq('type','monster').ilike('name', name).limit(1)
  if (exact?.[0]) return parseMonsterChunk(exact[0])

  const words = name.split(' ').filter(w=>w.length>3)
  for (const word of [...words].reverse()) {
    const { data } = await supabase
      .from('knowledge_chunks').select('content, name')
      .eq('type','monster').ilike('name',`%${word}%`).limit(3)
    if (data?.length) {
      const best = data.sort((a,b)=>{
        const as_ = a.name.toLowerCase().split(' ').filter(w=>name.toLowerCase().includes(w)).length
        const bs_ = b.name.toLowerCase().split(' ').filter(w=>name.toLowerCase().includes(w)).length
        return bs_ - as_
      })[0]
      return parseMonsterChunk(best)
    }
  }
  return null
}

function parseMonsterChunk(row) {
  if (!row) return null
  const text = row.content
  const get  = (rx) => { const m = text.match(rx); return m?.[1]?.trim() || null }

  const acRaw = get(/AC:\s*(\d+)/)
  const ac    = parseInt(acRaw) || 12
  const hp    = parseInt(get(/HP:\s*(\d+)/)) || 10
  const cr    = get(/CR:\s*([^\s|,\n]+)/) || '1/4'

  const stats = {}
  ;['STR','DEX','CON','INT','WIS','CHA'].forEach(s => {
    stats[s.toLowerCase()] = parseInt(get(new RegExp(`${s}\\s+(\\d+)`))) || 10
  })

  const attacks = []
  const actionSection = text.match(/Actions:\s*([\s\S]+?)(?:\nReactions:|$)/)?.[1] || ''
  const atkMatches = [...actionSection.matchAll(/•\s*([^:]+):\s*[^+]*([+-]\d+)\s*to hit[^.]+Hit:\s*([^(]+)\(([^)]+)\)\s*([\w]+)\s+damage/gi)]
  for (const m of atkMatches) {
    attacks.push({ name:m[1].trim(), bonus:parseInt(m[2])||3, damage:`${m[4].trim()}+${parseInt(m[2])||0}`, type:m[5]?.toLowerCase()||'slashing' })
  }

  const crXP = {'0':10,'1/8':25,'1/4':50,'1/2':100,'1':200,'2':450,'3':700,'4':1100,'5':1800,'6':2300,'7':2900,'8':3900}
  return {
    name:row.name, hp, maxHp:hp, ac, cr, xp:crXP[cr]||200,
    str:stats.str||10, dex:stats.dex||10, con:stats.con||10,
    int:stats.int||10, wis:stats.wis||10, cha:stats.cha||10,
    speed: parseInt(get(/walking\s+(\d+)/i)) || 30,
    attacks: attacks.length ? attacks : [{ name:'Attack', bonus:3, damage:'1d6+2', type:'slashing' }],
    flavor: ['moves aggressively','strikes with precision','lunges forward'],
    fromDatabase: true,
  }
}

// ── ENCOUNTER SELECTOR ────────────────────────────────────
export async function selectEncounterMonsters(character, difficulty='medium') {
  const level  = character.level || 1
  const hp     = character.current_hp || character.max_hp || 10
  const maxHP  = character.max_hp || 10

  const SOLO_BUDGETS = {
    easy:   [6,12,18,31,62,93,125,156,200,250],
    medium: [12,25,37,62,125,187,250,312,400,500],
    hard:   [18,37,56,93,187,281,375,468,600,750],
  }
  let budget = (SOLO_BUDGETS[difficulty]||SOLO_BUDGETS.medium)[Math.min(level-1,9)]
  if (hp/maxHP < 0.5) budget = SOLO_BUDGETS.easy[Math.min(level-1,9)]

  const crRange = level<=1?['0','1/8','1/4']:level<=2?['1/8','1/4','1/2']:level<=4?['1/4','1/2','1']:level<=6?['1/2','1','2']:['1','2','3']
  const crXP    = {'0':10,'1/8':25,'1/4':50,'1/2':100,'1':200,'2':450,'3':700}

  let candidates = []
  for (const cr of crRange) {
    const xp = crXP[cr]||50
    if (xp > budget*2) continue
    const { data } = await supabase.from('knowledge_chunks').select('name,content')
      .eq('type','monster').ilike('content',`%CR: ${cr}%`).limit(15)
    if (data?.length) candidates.push(...data.map(d=>({name:d.name,cr,xp})))
  }
  if (!candidates.length) return level<=2?['Goblin','Wolf']:level<=4?['Orc','Gnoll']:['Ogre','Ghoul']

  candidates = candidates.sort(()=>Math.random()-0.5)
  const encounter = []; let usedXP = 0
  for (const c of candidates) {
    const mult = [1,1.5,2,2.5][Math.min(encounter.length,3)]
    if (usedXP + c.xp*mult <= budget) { encounter.push(c.name); usedXP += c.xp }
    if (encounter.length >= 3) break
  }
  return encounter.length ? encounter : [candidates[0].name]
}

// ── EQUIPMENT LOOKUP (for items.js AC/cost) ──────────────
export async function lookupEquipmentStats(name) {
  if (!name) return null
  const { data } = await supabase.from('knowledge_chunks')
    .select('content, name').eq('type','equipment').ilike('name', name).limit(1)
  if (!data?.[0]) return null
  const text = data[0].content
  const cost = text.match(/Cost:\s*(\d+)\s*(gp|sp|cp)/i)
  const ac   = text.match(/AC:\s*(\d+)/)
  const dmg  = text.match(/Damage:\s*([^\n|]+)/)
  return {
    name:     data[0].name,
    cost:     cost ? parseInt(cost[1]) * (cost[2]==='sp'?0.1:cost[2]==='cp'?0.01:1) : null,
    ac:       ac   ? parseInt(ac[1])   : null,
    damage:   dmg  ? dmg[1].trim()     : null,
    rawText:  text,
  }
}

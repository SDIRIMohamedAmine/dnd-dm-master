// src/lib/rag.js — Open5e API (reverted from dnd5eapi)
import { supabase } from './supabase'

const OPEN5E = 'https://api.open5e.com'

export const ALL_ENDPOINTS = [
  { key: 'monsters',    label: 'Monsters',    icon: '🐉', desc: '~400 creatures with full stat blocks' },
  { key: 'spells',      label: 'Spells',      icon: '✨', desc: '~500 spells with full descriptions'   },
  { key: 'magicitems',  label: 'Magic Items', icon: '💍', desc: '~200 magic items'                     },
  { key: 'weapons',     label: 'Weapons',     icon: '⚔️', desc: 'All SRD weapons with damage + cost'   },
  { key: 'armor',       label: 'Armor',       icon: '🛡️', desc: 'All SRD armor with AC formulas'       },
  { key: 'backgrounds', label: 'Backgrounds', icon: '📜', desc: 'All backgrounds with features'        },
  { key: 'classes',     label: 'Classes',     icon: '🧙', desc: 'All 12 classes with features'         },
  { key: 'races',       label: 'Races',       icon: '🧝', desc: 'All races with traits and ASIs'       },
  { key: 'feats',       label: 'Feats',       icon: '⭐', desc: 'All feats with prerequisites'         },
  { key: 'conditions',  label: 'Conditions',  icon: '🌀', desc: 'All conditions'                       },
  { key: 'sections',    label: 'Rules (SRD)', icon: '📖', desc: 'Complete SRD rules text'              },
]

export async function fetchAllFromOpen5e(endpoint, onProgress) {
  const results = []
  let url = `${OPEN5E}/${endpoint}/?limit=100&format=json`
  while (url) {
    const res  = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    results.push(...data.results)
    url = data.next
    if (onProgress) onProgress(results.length, data.count || results.length)
  }
  return results
}

export function chunkMonster(m) {
  const actions   = (m.actions||[]).map(a=>`  • ${a.name}: ${a.desc}`).join('\n')
  const specials  = (m.special_abilities||[]).map(a=>`  • ${a.name}: ${a.desc}`).join('\n')
  const legendary = (m.legendary_actions||[]).map(a=>`  • ${a.name}: ${a.desc}`).join('\n')
  const reactions = (m.reactions||[]).map(a=>`  • ${a.name}: ${a.desc}`).join('\n')
  const saves = ['strength','dexterity','constitution','intelligence','wisdom','charisma']
    .map(s=>m[`${s}_save`]!=null&&`${s.slice(0,3).toUpperCase()} +${m[`${s}_save`]}`).filter(Boolean).join(', ')
  return {
    id:`monster:${m.slug}`, type:'monster', name:m.name, source:m.document__slug||'srd',
    text:[
      `MONSTER: ${m.name}`,
      `Type: ${m.type} | Size: ${m.size} | CR: ${m.challenge_rating} | Alignment: ${m.alignment}`,
      `AC: ${m.armor_class}${m.armor_desc?` (${m.armor_desc})`:''} | HP: ${m.hit_points} (${m.hit_dice}) | Speed: ${JSON.stringify(m.speed||{})}`,
      `STR ${m.strength} | DEX ${m.dexterity} | CON ${m.constitution} | INT ${m.intelligence} | WIS ${m.wisdom} | CHA ${m.charisma}`,
      saves&&`Saving Throws: ${saves}`,
      m.skills&&`Skills: ${JSON.stringify(m.skills)}`,
      m.damage_immunities&&`Damage Immunities: ${m.damage_immunities}`,
      m.damage_resistances&&`Damage Resistances: ${m.damage_resistances}`,
      m.condition_immunities&&`Condition Immunities: ${m.condition_immunities}`,
      `Senses: ${m.senses||'normal'} | Languages: ${m.languages||'none'}`,
      `XP: ${m.cr_xp||0}`,
      m.desc&&`\nLore: ${m.desc}`,
      specials&&`\nSpecial Abilities:\n${specials}`,
      actions&&`\nActions:\n${actions}`,
      reactions&&`\nReactions:\n${reactions}`,
      legendary&&`\nLegendary Actions:\n${legendary}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkSpell(s) {
  return {
    id:`spell:${s.slug}`, type:'spell', name:s.name, source:s.document__slug||'srd',
    text:[
      `SPELL: ${s.name}`,
      `Level: ${s.level_int===0?'Cantrip':`${s.level_int}th-level`} ${s.school}`,
      `Casting Time: ${s.casting_time} | Range: ${s.range} | Duration: ${s.duration}`,
      `Components: ${s.components}${s.material?` (${s.material})`:''}`,
      `Concentration: ${s.concentration==='yes'?'Yes':'No'} | Ritual: ${s.ritual==='yes'?'Yes':'No'}`,
      `Classes: ${s.dnd_class||'various'}`,
      `\n${s.desc}`,
      s.higher_level&&`\nAt Higher Levels: ${s.higher_level}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkMagicItem(item) {
  return {
    id:`item:${item.slug}`, type:'magic-item', name:item.name, source:item.document__slug||'srd',
    text:[
      `MAGIC ITEM: ${item.name}`,
      `Type: ${item.type} | Rarity: ${item.rarity}`,
      item.requires_attunement?'Attunement: Required':'Attunement: Not required',
      `\n${item.desc}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkWeapon(w) {
  const props = (w.properties||[]).map(p=>p.name||p).join(', ')
  return {
    id:`weapon:${w.slug}`, type:'weapon', name:w.name, source:w.document__slug||'srd',
    text:[
      `WEAPON: ${w.name}`,
      `Category: ${w.category} | Cost: ${w.cost} | Weight: ${w.weight}`,
      `Damage: ${w.damage_dice} ${w.damage_type}`,
      props&&`Properties: ${props}`,
      w.range&&`Range: ${w.range}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkArmor(a) {
  return {
    id:`armor:${a.slug}`, type:'armor', name:a.name, source:a.document__slug||'srd',
    text:[
      `ARMOR: ${a.name}`,
      `Category: ${a.category} | Cost: ${a.cost} | Weight: ${a.weight}`,
      `AC: ${a.ac_string}`,
      a.strength_requirement&&`Strength required: ${a.strength_requirement}`,
      a.stealth_disadvantage&&'Imposes Stealth disadvantage',
    ].filter(Boolean).join('\n'),
  }
}

export function chunkBackground(b) {
  return {
    id:`background:${b.slug}`, type:'background', name:b.name, source:b.document__slug||'srd',
    text:[
      `BACKGROUND: ${b.name}`,
      b.skill_proficiencies&&`Skills: ${b.skill_proficiencies}`,
      b.tool_proficiencies&&`Tools: ${b.tool_proficiencies}`,
      b.equipment&&`Equipment: ${b.equipment}`,
      b.desc&&`\n${b.desc}`,
      b.feature&&`\nFeature — ${b.feature}: ${b.feature_desc||''}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkClass(c) {
  const archetypes = (c.archetypes||[]).map(a=>`  • ${a.name}: ${a.desc||''}`).join('\n')
  return {
    id:`class:${c.slug}`, type:'class', name:c.name, source:c.document__slug||'srd',
    text:[
      `CLASS: ${c.name}`,
      `Hit Die: ${c.hit_dice} | Saving Throws: ${c.saving_throws||'varies'}`,
      c.prof_armor&&`Armor: ${c.prof_armor}`,
      c.prof_weapons&&`Weapons: ${c.prof_weapons}`,
      c.prof_skills&&`Skills: ${c.prof_skills}`,
      c.desc&&`\n${c.desc}`,
      archetypes&&`\nSubclasses:\n${archetypes}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkRace(r) {
  const subraces = (r.subraces||[]).map(s=>`  • ${s.name}: ${s.desc||''}`).join('\n')
  return {
    id:`race:${r.slug}`, type:'race', name:r.name, source:r.document__slug||'srd',
    text:[
      `RACE: ${r.name}`,
      r.asi_desc&&`Ability Score Increases: ${r.asi_desc}`,
      r.age&&`Age: ${r.age}`,
      r.size&&`Size: ${r.size}`,
      r.speed&&`Speed: ${r.speed}`,
      r.vision&&`Vision: ${r.vision}`,
      r.traits&&`\nTraits: ${r.traits}`,
      subraces&&`\nSubraces:\n${subraces}`,
    ].filter(Boolean).join('\n'),
  }
}

export function chunkFeat(f) {
  return {
    id:`feat:${f.slug}`, type:'feat', name:f.name, source:f.document__slug||'srd',
    text:[`FEAT: ${f.name}`, f.prerequisite&&`Prerequisite: ${f.prerequisite}`, `\n${f.desc}`].filter(Boolean).join('\n'),
  }
}

export function chunkCondition(c) {
  return {
    id:`condition:${c.slug}`, type:'condition', name:c.name, source:c.document__slug||'srd',
    text:`CONDITION: ${c.name}\n\n${c.desc}`,
  }
}

export function chunkSection(s) {
  return {
    id:`section:${s.slug}`, type:'rule', name:s.name, source:s.document__slug||'srd',
    text:[`RULE: ${s.name}`, s.parent&&`Category: ${s.parent}`, `\n${(s.desc||'').slice(0,1200)}`].filter(Boolean).join('\n'),
  }
}

export const CHUNKER_MAP = {
  monsters:chunkMonster, spells:chunkSpell, magicitems:chunkMagicItem,
  weapons:chunkWeapon, armor:chunkArmor, backgrounds:chunkBackground,
  classes:chunkClass, races:chunkRace, feats:chunkFeat,
  conditions:chunkCondition, sections:chunkSection,
}

const STOP_WORDS = new Set(['the','and','for','are','but','not','you','all','can','has','this','that','with','have','from','they','will','your','which','their','been','what','does','how','when','where','who','tell','me','about','is','a','an','of','in','on','at','to','do','its','give','use','would','could','should','make','into','also','more','some','any','my','by','or','so','if'])

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>2&&!STOP_WORDS.has(w))
}

// Extract the most meaningful search terms from a player message.
// Prioritises capitalised proper nouns, spell names, monster names, item names.
function extractSearchTerms(query) {
  // 1. Pull capitalised words (likely names: Fireball, Goblin, Longsword)
  const capitals = (query.match(/\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*/g) || [])
    .filter(w => !['The','And','But','You','Your','With','From','That','This','When','Where','What','Into','Over'].includes(w))

  // 2. Known D&D keyword patterns
  const dndKeywords = (query.match(
    /\b(fireball|magic missile|cure wounds|healing word|eldritch blast|sacred flame|toll the dead|guiding bolt|thunderwave|shatter|hex|bless|shield|misty step|counterspell|burning hands|hold person|invisibility|fly|haste|polymorph|greater invisibility|banishment|wall of fire|disintegrate|power word|wish|goblin|orc|wolf|troll|dragon|vampire|zombie|skeleton|bandit|cultist|guard|gnoll|ogre|giant|wraith|specter|ghoul|ghast|wight|mummy|lich|beholder|mind flayer|drow|duergar|hobgoblin|kobold|bugbear|werewolf|werebear|basilisk|medusa|harpy|manticore|griffon|hippogriff|owlbear|displacer beast|rust monster|mimic|gelatinous cube|longsword|shortsword|rapier|dagger|greataxe|greatsword|handaxe|quarterstaff|mace|warhammer|shortbow|longbow|chain mail|leather armor|plate|shield|spell|attack|rage|sneak attack|divine smite|channel divinity|wild shape|bardic inspiration|ki|second wind|action surge|lay on hands)/gi
  ) || [])

  // 3. Multi-word phrases (2-3 words) are often item/spell names
  const phrases = []
  const words = query.split(/\s+/)
  for (let i = 0; i < words.length - 1; i++) {
    const bi = `${words[i]} ${words[i+1]}`.replace(/[^a-zA-Z ]/g,'').trim()
    if (bi.length > 5) phrases.push(bi)
    if (i < words.length - 2) {
      const tri = `${words[i]} ${words[i+1]} ${words[i+2]}`.replace(/[^a-zA-Z ]/g,'').trim()
      if (tri.length > 8) phrases.push(tri)
    }
  }

  // 4. Fallback: all meaningful tokens
  const tokens = tokenize(query)

  // Deduplicate and prioritise: capitals > dndKeywords > phrases > tokens
  const seen = new Set()
  const result = []
  for (const t of [...capitals, ...dndKeywords, ...phrases, ...tokens]) {
    const key = t.toLowerCase()
    if (!seen.has(key) && key.length > 2) { seen.add(key); result.push(t) }
  }
  return result.slice(0, 8)
}

export async function retrieveFromSupabase(query, topK=5) {
  const terms = extractSearchTerms(query)
  if (!terms.length) return []

  const allRows = []

  // Run parallel name searches for the top terms
  // Searching multiple terms gives much better recall than only tokens[0]
  const nameSearches = terms.slice(0, 4).map(term =>
    supabase.from('knowledge_chunks')
      .select('chunk_id,type,name,source,content')
      .ilike('name', `%${term}%`)
      .limit(topK)
  )
  const nameResults = await Promise.all(nameSearches)
  for (const {data} of nameResults) if (data) allRows.push(...data)

  // Full-text search on content using the top meaningful terms
  const ftQuery = terms.slice(0, 5).join(' | ')
  const {data: ftData} = await supabase
    .from('knowledge_chunks')
    .select('chunk_id,type,name,source,content')
    .textSearch('content', ftQuery, {type:'websearch'})
    .limit(topK * 2)
    .catch(() => ({data:[]}))
  if (ftData) allRows.push(...ftData)

  // Deduplicate
  const seen = new Set()
  const unique = allRows.filter(r => {
    if (seen.has(r.chunk_id)) return false
    seen.add(r.chunk_id); return true
  })

  // Score: exact name match scores highest, then partial, then content hits
  const termsLower = terms.map(t => t.toLowerCase())
  const scored = unique.map(row => {
    const nl = row.name.toLowerCase()
    const cl = row.content.toLowerCase()
    let score = 0
    for (const t of termsLower) {
      if (nl === t)            score += 12  // exact name match
      else if (nl.startsWith(t) || t.startsWith(nl)) score += 8  // prefix match
      else if (nl.includes(t)) score += 5  // partial name
      if (cl.includes(t))      score += 1  // content mention
    }
    return {row, score}
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a,b) => b.score - a.score)
    .slice(0, topK)
    .map(s => ({id:s.row.chunk_id, type:s.row.type, name:s.row.name, source:s.row.source, text:s.row.content}))
}

export function buildContextBlock(chunks) {
  if(!chunks.length) return 'No specific lore retrieved.'
  return chunks.map((c,i)=>`[${i+1}] ${c.text}`).join('\n\n---\n\n')
}

export async function lookupMonsterStats(name, campaignId) {
  if(!name) return null
  // Check custom creature registry first (campaign-specific creatures)
  if (campaignId) {
    try {
      const { getRegisteredCreature } = await import('./contentRegistry')
      const custom = await getRegisteredCreature(name, campaignId)
      if (custom) { console.log(`[RAG] Using custom creature: ${name}`); return custom }
    } catch {}
  }
  const {data:exact}=await supabase.from('knowledge_chunks').select('content,name').eq('type','monster').ilike('name',name).limit(1)
  if(exact?.[0]) return parseMonsterChunk(exact[0])
  const words=name.split(' ').filter(w=>w.length>3)
  for(const word of [...words].reverse()){
    const {data}=await supabase.from('knowledge_chunks').select('content,name').eq('type','monster').ilike('name',`%${word}%`).limit(3)
    if(data?.length){
      const best=data.sort((a,b)=>{
        const as_=a.name.toLowerCase().split(' ').filter(w=>name.toLowerCase().includes(w)).length
        const bs_=b.name.toLowerCase().split(' ').filter(w=>name.toLowerCase().includes(w)).length
        return bs_-as_
      })[0];return parseMonsterChunk(best)
    }
  }
  return null
}

function parseMonsterChunk(row) {
  if (!row) return null
  const text = row.content

  const getNum = (rx, fallback = 0) => {
    const m = text.match(rx); return m ? parseInt(m[1]) || fallback : fallback
  }
  const getStr = (rx, fallback = '') => {
    const m = text.match(rx); return m ? m[1].trim() : fallback
  }

  const ac  = getNum(/AC:\s*(\d+)/, 12)
  const hp  = getNum(/HP:\s*(\d+)/, 10)
  const cr  = getStr(/CR:\s*([\d/]+)/, '1/4')

  // Speed (feet)
  const speedM = text.match(/Speed:[^\n]*(\d+)\s*ft/)
  const speed  = speedM ? parseInt(speedM[1]) : 30

  // Ability scores — Open5e chunk format: "STR 14 | DEX 12 ..."
  const stats = {}
  for (const s of ['STR','DEX','CON','INT','WIS','CHA']) {
    stats[s.toLowerCase()] = getNum(new RegExp(`${s}\\s+(\\d+)`), 10)
  }

  // Saving throws (optional line in chunk)
  const saves = {}
  const saveMatch = text.match(/Saving Throws:([^\n]+)/)
  if (saveMatch) {
    for (const part of saveMatch[1].split(',')) {
      const sm = part.trim().match(/([A-Z]{3})\s+([+-]\d+)/)
      if (sm) saves[sm[1].toLowerCase()] = parseInt(sm[2])
    }
  }

  // Parse attacks from the Actions block
  const attacks = []
  const actionSection = text.match(/Actions:\s*([\s\S]+?)(?=\nReactions:|\nLegendary|$)/)?.[1] || ''

  // Pattern 1: "• Name: ...+N to hit...Hit: N (XdY+Z) type damage"
  const p1 = [...actionSection.matchAll(/•\s*([^:]+):[^+\-]*?([+-]\d+)\s*to hit[^.]*?Hit:\s*\d+\s*\(([^)]+)\)\s*(\w+)\s+damage/gi)]
  for (const m of p1) {
    attacks.push({ name: m[1].trim(), bonus: parseInt(m[2]) || 3, damage: m[3].trim(), type: m[4].toLowerCase() })
  }

  // Pattern 2: fallback — "• Name: ...deals XdY+Z slashing"
  if (!attacks.length) {
    const p2 = [...actionSection.matchAll(/•\s*([^:]+):[^\n]*(\d+d\d+[+-]?\d*)\s+(\w+)\s+damage/gi)]
    for (const m of p2) {
      attacks.push({ name: m[1].trim(), bonus: 3, damage: m[2], type: m[3].toLowerCase() })
    }
  }

  const crXP = {'0':10,'1/8':25,'1/4':50,'1/2':100,'1':200,'2':450,'3':700,'4':1100,'5':1800,'6':2300,'7':2900,'8':3900}

  return {
    name: row.name, hp, maxHp: hp, ac, cr,
    xp: crXP[cr] || 200, speed,
    str: stats.str, dex: stats.dex, con: stats.con,
    int: stats.int, wis: stats.wis, cha: stats.cha,
    savingThrows: saves,
    attacks: attacks.length ? attacks : [{ name: 'Attack', bonus: 3, damage: '1d6+2', type: 'slashing' }],
    flavor: ['moves aggressively', 'strikes with precision'],
    fromDatabase: true,
  }
}

// CR value → XP
const CR_XP = {'0':10,'1/8':25,'1/4':50,'1/2':100,'1':200,'2':450,'3':700,'4':1100,'5':1800,'6':2300,'7':2900,'8':3900,'9':5000,'10':5900}

// Parse CR from monster chunk text — handles "CR: 1/4", "CR: 0.25", "challenge_rating: 0.25"
function parseCRFromText(text) {
  // Try "CR: X" format (Open5e stores as fraction string)
  const crMatch = text.match(/CR:\s*([0-9/]+)/)
  if (crMatch) return crMatch[1].trim()
  // Try decimal format
  const decMatch = text.match(/challenge_rating[:\s]+([0-9.]+)/)
  if (decMatch) {
    const dec = parseFloat(decMatch[1])
    if (dec === 0)    return '0'
    if (dec <= 0.125) return '1/8'
    if (dec <= 0.25)  return '1/4'
    if (dec <= 0.5)   return '1/2'
    return String(Math.round(dec))
  }
  return null
}

// XP budget for CR value
function crToXP(cr) {
  return CR_XP[cr] || 50
}

export async function selectEncounterMonsters(character, difficulty='medium') {
  const level  = character.level || 1
  const hp     = character.current_hp || character.max_hp || 10
  const maxHP  = character.max_hp || 10

  const SOLO_BUDGETS = {
    easy:   [6,  12, 18, 31,  62, 93,  125, 156, 200, 250],
    medium: [12, 25, 37, 62,  125,187, 250, 312, 400, 500],
    hard:   [18, 37, 56, 93,  187,281, 375, 468, 600, 750],
  }
  let budget = (SOLO_BUDGETS[difficulty] || SOLO_BUDGETS.medium)[Math.min(level-1,9)]
  if (hp/maxHP < 0.5) budget = SOLO_BUDGETS.easy[Math.min(level-1,9)]

  // CR ranges by level
  const crRange = level<=1 ? ['0','1/8','1/4']
    : level<=2 ? ['1/8','1/4','1/2']
    : level<=4 ? ['1/4','1/2','1']
    : level<=6 ? ['1/2','1','2']
    : level<=9 ? ['1','2','3']
    : ['2','3','4','5']

  let candidates = []

  // Search with multiple CR format variants to handle data inconsistencies
  for (const cr of crRange) {
    const xp = crToXP(cr)
    if (xp > budget * 2) continue

    // Build search variants: "CR: 1/4", "CR: 0.25", "CR: .25"
    const decVal = cr === '1/8' ? '0.125' : cr === '1/4' ? '0.25' : cr === '1/2' ? '0.5' : cr
    const searches = [
      supabase.from('knowledge_chunks').select('name,content').eq('type','monster').ilike('content',`%CR: ${cr}%`).limit(12),
      supabase.from('knowledge_chunks').select('name,content').eq('type','monster').ilike('content',`%CR: ${decVal}%`).limit(8),
    ]
    const results = await Promise.all(searches)
    for (const {data} of results) {
      if (!data?.length) continue
      for (const row of data) {
        // Double-check the parsed CR matches what we want (avoid false positives)
        const parsedCR = parseCRFromText(row.content)
        if (parsedCR === cr || crToXP(parsedCR) === xp) {
          candidates.push({ name: row.name, cr: parsedCR || cr, xp })
        }
      }
    }
  }

  // Fallback to well-known monsters if DB has nothing
  if (!candidates.length) {
    const fallbacks = level<=1 ? ['Goblin','Giant Rat','Kobold']
      : level<=3 ? ['Orc','Gnoll','Ghoul']
      : level<=6 ? ['Ogre','Troll','Wight']
      : ['Stone Giant','Vampire Spawn','Adult Blue Dragon']
    return fallbacks
  }

  // Deduplicate by name
  const seen = new Set()
  candidates = candidates.filter(c => {
    if (seen.has(c.name)) return false
    seen.add(c.name); return true
  })

  // Shuffle then build encounter within XP budget
  candidates = candidates.sort(() => Math.random() - 0.5)
  const encounter = []
  let usedXP = 0
  const multipliers = [1, 1.5, 2, 2.5]

  for (const c of candidates) {
    const mult = multipliers[Math.min(encounter.length, 3)]
    if (usedXP + c.xp * mult <= budget) {
      encounter.push(c.name)
      usedXP += c.xp
    }
    if (encounter.length >= 3) break
  }

  return encounter.length ? encounter : [candidates[0].name]
}

// ── localStorage helpers (Fix 10) ────────────────────────
// Cap at 4MB to stay safely under the 5MB browser limit.
const LS_KEY     = 'dnd_kb_chunks'
const LS_MAX_LEN = 4 * 1024 * 1024

export function saveChunksToStorage(chunks) {
  try {
    const json = JSON.stringify(chunks)
    if (json.length > LS_MAX_LEN) {
      console.warn(`[KB] ${chunks.length} chunks too large for localStorage (${(json.length/1024).toFixed(0)} KB). Skipping.`)
      return false
    }
    localStorage.setItem(LS_KEY, json)
    return true
  } catch (e) {
    console.warn('[KB] localStorage write failed:', e.message)
    return false
  }
}

export function loadChunksFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function clearChunksFromStorage() {
  try { localStorage.removeItem(LS_KEY) } catch {}
}

export function retrieveChunks(query, chunks, topK = 5) {
  if (!chunks?.length || !query) return []
  const terms = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  return chunks
    .map(c => {
      let score = 0
      const nl  = c.name?.toLowerCase() || ''
      const txt = c.text?.toLowerCase() || ''
      for (const t of terms) {
        if (nl.includes(t)) score += 5
        if (txt.includes(t)) score += 1
      }
      return { ...c, _score: score }
    })
    .filter(c => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, topK)
}

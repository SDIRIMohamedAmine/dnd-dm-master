// src/lib/storyArcs.js
// ══════════════════════════════════════════════════════════
// Dynamic Story Arc Engine
//
// Architecture:
//   - 2–4 arcs generated at campaign start from character context
//   - Each arc has a power score (0–100)
//   - Player actions shift power scores via AI extraction
//   - Dominant arc (highest power) shapes DM narration
//   - No fixed ending — the story emerges from player choices
// ══════════════════════════════════════════════════════════
import { supabase } from './supabase'
import { callAI }   from './openrouter'

// ── ARC ARCHETYPES ────────────────────────────────────────
// Seed templates the AI can draw from. Actual arcs are
// generated fresh for each campaign based on setting + character.
const ARC_ARCHETYPES = [
  {
    key: 'ancient_evil',
    theme: 'horror',
    loreTags: ['undead','demon','fiend','necromancer','lich','vampire','cultist','ritual'],
    powerKeywords: ['darkness','ritual','corruption','undead','shadow','doom','sacrifice'],
  },
  {
    key: 'political_conflict',
    theme: 'political',
    loreTags: ['noble','guard','spy','assassin','faction','war','king','rebel'],
    powerKeywords: ['throne','alliance','betrayal','coup','war','election','noble','power'],
  },
  {
    key: 'natural_disaster',
    theme: 'survival',
    loreTags: ['elemental','giant','dragon','beast','natural','storm','earthquake'],
    powerKeywords: ['storm','earthquake','flood','disaster','migration','destroy','nature'],
  },
  {
    key: 'lost_artifact',
    theme: 'mystery',
    loreTags: ['magic','artifact','ancient','dungeon','trap','construct','golem'],
    powerKeywords: ['relic','artifact','treasure','discovery','ancient','power','magic'],
  },
  {
    key: 'divine_awakening',
    theme: 'divine',
    loreTags: ['celestial','deity','paladin','cleric','temple','prophecy','aasimar'],
    powerKeywords: ['prophecy','chosen','deity','blessing','curse','divine','awakening'],
  },
  {
    key: 'criminal_empire',
    theme: 'noir',
    loreTags: ['bandit','rogue','assassin','thieves guild','spy','fence','criminal'],
    powerKeywords: ['guild','crime','heist','blackmail','assassination','underworld','contraband'],
  },
  {
    key: 'planar_incursion',
    theme: 'cosmic',
    loreTags: ['demon','devil','aberration','mindflayer','beholder','portal','planar'],
    powerKeywords: ['portal','invasion','planar','aberration','reality','dimensional','chaos'],
  },
  {
    key: 'war_brewing',
    theme: 'war',
    loreTags: ['soldier','orc','goblinoid','giant','war','siege','mercenary'],
    powerKeywords: ['army','siege','battle','territory','invasion','horde','alliance'],
  },
]

// ── GENERATE ARCS for a new campaign ─────────────────────
// Called once when the first message is sent.
// Uses the AI to create 3 contextual arcs based on the character
// and campaign settings, then saves them to Supabase.
export async function generateStoryArcs(campaignId, userId, character, campaignSettings) {
  // Check if arcs already exist
  const { data: existing } = await supabase
    .from('story_arcs').select('id').eq('campaign_id', campaignId).limit(1)
  if (existing?.length) return existing

  const world     = campaignSettings?.world_name     || 'a fantasy realm'
  const location  = campaignSettings?.start_location || 'an unknown land'
  const tone      = campaignSettings?.tone           || 'balanced'
  const charDesc  = `${character.race} ${character.class} named ${character.name} (${character.background} background, ${character.alignment})`

  // Ask AI to generate 3 distinct story arcs
  const prompt = `You are designing story arcs for a D&D campaign.

Character: ${charDesc}
World: ${world}
Starting Location: ${location}
Tone: ${tone}

Generate exactly 3 distinct story arcs that could unfold over this campaign.
Each arc should feel different (different themes, factions, stakes).
Make them specific to this character and setting — not generic.

Return ONLY valid JSON array, no markdown:
[
  {
    "arc_key": "snake_case_identifier",
    "title": "Short dramatic title",
    "description": "2 sentences: what threat/conflict exists and what's at stake",
    "theme": "horror|political|mystery|survival|divine|noir|cosmic|war",
    "faction": "Name of the main faction or force driving this arc",
    "lore_tags": ["tag1","tag2","tag3"],
    "starting_variables": {
      "variable_name": 10,
      "another_variable": 5
    }
  }
]

Rules:
- arc_key must be unique and snake_case
- lore_tags should be D&D monster/creature types relevant to this arc
- starting_variables are numeric metrics tracking arc progress (10–20 starting value, max 100)
- The 3 arcs should create narrative tension between them`

  let arcs = []
  try {
    const raw     = await callAI([{ role: 'user', content: prompt }], 800)
    const cleaned = raw.replace(/```json|```/g, '').trim()
    arcs = JSON.parse(cleaned)
  } catch (err) {
    console.warn('[StoryArcs] AI generation failed, using defaults:', err.message)
    arcs = generateDefaultArcs(character, campaignSettings)
  }

  // Assign initial power scores — all start roughly equal with slight variance
  const withPower = arcs.map((arc, i) => ({
    ...arc,
    power:    10 + Math.floor(Math.random() * 8),  // 10–17 starting
    momentum: 0,
    status:   'dormant',
    revealed: false,
    variables: arc.starting_variables || {},
  }))

  // Save to Supabase
  const rows = withPower.map(arc => ({
    campaign_id:  campaignId,
    user_id:      userId,
    arc_key:      arc.arc_key,
    title:        arc.title,
    description:  arc.description,
    theme:        arc.theme,
    faction:      arc.faction || null,
    lore_tags:    arc.lore_tags || [],
    power:        arc.power,
    momentum:     arc.momentum,
    status:       arc.status,
    revealed:     arc.revealed,
    variables:    arc.variables,
  }))

  const { data: saved, error } = await supabase.from('story_arcs').insert(rows).select()
  if (error) { console.error('[StoryArcs] Save failed:', error.message); return [] }

  console.log('[StoryArcs] Generated:', saved.map(a => `${a.arc_key}(${a.power})`).join(', '))
  return saved
}

// Fallback arcs if AI fails
function generateDefaultArcs(character, settings) {
  return [
    {
      arc_key: 'shadow_rising',
      title: 'The Shadow Rising',
      description: 'A ancient evil stirs beneath the region, corrupting the land and its inhabitants. If left unchecked, it will consume everything.',
      theme: 'horror',
      faction: 'The Abyssal Cult',
      lore_tags: ['undead', 'cultist', 'demon', 'shadow'],
      starting_variables: { cult_power: 15, corruption_level: 10 },
    },
    {
      arc_key: 'throne_in_crisis',
      title: 'The Throne in Crisis',
      description: 'The ruling power is fractured. Noble factions scheme against each other, and the common people suffer the consequences.',
      theme: 'political',
      faction: 'House Ravenmoor',
      lore_tags: ['noble', 'guard', 'spy', 'assassin'],
      starting_variables: { noble_influence: 12, unrest: 8 },
    },
    {
      arc_key: 'lost_legacy',
      title: 'The Lost Legacy',
      description: 'An ancient artifact of immense power has resurfaced. Multiple factions race to claim it before its power destroys the region.',
      theme: 'mystery',
      faction: 'The Seekers',
      lore_tags: ['magic', 'ancient', 'construct', 'dungeon'],
      starting_variables: { artifact_power: 20, seekers_progress: 10 },
    },
  ]
}

// ── LOAD ARCS ─────────────────────────────────────────────
export async function loadStoryArcs(campaignId) {
  const { data, error } = await supabase
    .from('story_arcs')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('power', { ascending: false })
  if (error) { console.error('[StoryArcs] Load failed:', error.message); return [] }
  return data || []
}

// ── GET DOMINANT ARC ──────────────────────────────────────
export function getDominantArc(arcs) {
  if (!arcs?.length) return null
  return arcs.reduce((best, arc) => arc.power > best.power ? arc : best, arcs[0])
}

// ── UPDATE ARC POWER ──────────────────────────────────────
// Called after each DM message to shift arc power based on what happened
export async function updateArcPower(campaignId, arcId, arcKey, delta, reason) {
  if (!delta) return

  // Log the event
  await supabase.from('arc_events').insert({
    campaign_id: campaignId,
    arc_id:      arcId,
    arc_key:     arcKey,
    delta,
    reason,
  })

  // Update power score (clamped 0–100)
  const { data } = await supabase
    .from('story_arcs')
    .select('power, momentum, status')
    .eq('id', arcId)
    .single()

  if (!data) return

  const newPower    = Math.min(100, Math.max(0, data.power + delta))
  const newMomentum = Math.round((data.momentum + delta) * 0.6)  // decays over time

  let newStatus = data.status
  if (newPower >= 70)      newStatus = 'dominant'
  else if (newPower >= 40) newStatus = 'rising'
  else if (newPower <= 5)  newStatus = 'failed'
  else if (newPower <= 20) newStatus = 'dormant'

  await supabase.from('story_arcs').update({
    power:      newPower,
    momentum:   newMomentum,
    status:     newStatus,
    updated_at: new Date().toISOString(),
  }).eq('id', arcId)
}

// ── UPDATE ARC VARIABLE ───────────────────────────────────
export async function updateArcVariable(arcId, varKey, delta) {
  const { data } = await supabase.from('story_arcs').select('variables').eq('id', arcId).single()
  if (!data) return
  const vars = { ...data.variables, [varKey]: Math.max(0, (data.variables[varKey] || 0) + delta) }
  await supabase.from('story_arcs').update({ variables: vars }).eq('id', arcId)
}

// ── REVEAL ARC ────────────────────────────────────────────
export async function revealArc(arcId) {
  await supabase.from('story_arcs').update({ revealed: true }).eq('id', arcId)
}

// ── RESOLVE ARC ───────────────────────────────────────────
export async function resolveArc(arcId, success) {
  await supabase.from('story_arcs').update({
    status: success ? 'resolved' : 'failed',
    power:  success ? 100 : 0,
  }).eq('id', arcId)
}

// ── AI-POWERED ARC EXTRACTION ─────────────────────────────
// After each exchange, ask the AI to detect which arcs were touched
// and by how much. This is the key that makes arcs dynamic.
// In-memory call tracker to prevent runaway arc extraction calls
let _lastArcExtractTime = 0
const ARC_EXTRACT_COOLDOWN_MS = 90_000  // at most once per 90 seconds

export async function extractArcDeltas(playerAction, dmResponse, arcs) {
  if (!arcs?.length) return []

  // Hard cooldown — arc tracking is background, never fires faster than 90s
  const now = Date.now()
  if (now - _lastArcExtractTime < ARC_EXTRACT_COOLDOWN_MS) return []
  _lastArcExtractTime = now

  const arcSummary = arcs.map(a =>
    `- ${a.arc_key} (${a.title}): ${a.description}`
  ).join('\n')

  const prompt = `You are analyzing a D&D game exchange to track story arc progression.

ACTIVE STORY ARCS:
${arcSummary}

PLAYER ACTION: ${playerAction.slice(0, 200)}

DM RESPONSE: ${dmResponse.slice(0, 400)}

For each story arc, determine if this exchange advanced or hindered it.
Only include arcs that were clearly affected (ignore ones not mentioned or implied).

Return ONLY valid JSON array (empty array if nothing changed):
[
  {
    "arc_key": "exact_arc_key",
    "delta": 5,
    "reason": "One sentence explaining why this arc shifted"
  }
]

Rules:
- delta is an integer: positive = arc gains power, negative = arc loses power
- Typical range: -10 to +10 per exchange
- Large events (boss fight, major choice): up to ±20
- Only include arcs where delta is non-zero
- delta should reflect narrative weight, not combat outcome`

  try {
    const raw     = await callAI([{ role: 'user', content: prompt }], 300)
    const cleaned = raw.replace(/```json|```/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    return []  // Fail silently — arc tracking is background, not critical
  }
}

// ── BUILD ARC CONTEXT BLOCK for DM prompt ─────────────────
// This is injected into the system prompt every message.
// It tells the DM what's happening in the world.
export function buildArcPromptBlock(arcs) {
  if (!arcs?.length) return ''

  const dominant  = getDominantArc(arcs)
  const rising    = arcs.filter(a => a.status === 'rising' && a.id !== dominant?.id)
  const dormant   = arcs.filter(a => a.status === 'dormant')
  const revealed  = arcs.filter(a => a.revealed)

  const formatArc = (a, showPower = false) => {
    const vars = Object.entries(a.variables || {})
      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`)
      .join(', ')
    return `  • [${a.arc_key}] "${a.title}" — ${a.description}${vars ? ` | Metrics: ${vars}` : ''}${showPower ? ` | Power: ${a.power}/100` : ''}`
  }

  let block = `═══ DYNAMIC STORY ARCS ═══
The world has multiple unfolding threats and conflicts. Your narration should subtly reflect the dominant arc.
Do NOT announce arcs to the player — weave them into the story organically.

`

  if (dominant) {
    block += `DOMINANT ARC (shape narration around this):
${formatArc(dominant, true)}
→ The DM should: drop hints about "${dominant.title}", have relevant NPCs mention ${dominant.faction || 'the faction'}, 
  use monsters from these types: [${(dominant.lore_tags || []).join(', ')}]
  Relevant encounters should involve ${dominant.faction || 'this threat'}.

`
  }

  if (rising.length) {
    block += `RISING ARCS (these are building in the background):\n`
    rising.forEach(a => { block += `${formatArc(a)}\n` })
    block += `→ These should appear as rumors, environmental details, or secondary encounters.\n\n`
  }

  if (revealed.length > 0) {
    block += `ARCS THE PLAYER HAS DISCOVERED:\n`
    revealed.forEach(a => { block += `  • "${a.title}" — the player knows this is happening.\n` })
    block += '\n'
  }

  if (dormant.length) {
    block += `DORMANT ARCS (not yet active, but seeds exist):\n`
    dormant.forEach(a => { block += `  • ${a.title}\n` })
    block += `→ These can appear as distant rumors or unrelated events that hint at something larger.\n\n`
  }

  block += `ARC POWER SHIFTS — Actions that should increase/decrease arc power:
- Player fights cultists → +5 to cult arc (exposed it), -3 if they flee (cult feels emboldened)
- Player helps a noble house → +8 to political arc
- Player finds ancient ruins → +5 to artifact/mystery arc
- Player ignores a crisis → dominant arc gains +3 momentum (world moves without them)

IMPORTANT: Even when the player focuses on one arc, the others continue evolving.
If the player spends 3 sessions ignoring the cult, the cult ritual progresses — mention it.`

  return block
}

// ── FETCH RAG LORE FOR DOMINANT ARC ──────────────────────
// Returns monster/lore chunks relevant to the dominant arc
export async function fetchArcLore(dominantArc, limit = 3) {
  if (!dominantArc?.lore_tags?.length) return []

  const tags = dominantArc.lore_tags.slice(0, 3)
  const chunks = []

  for (const tag of tags) {
    const { data } = await supabase
      .from('knowledge_chunks')
      .select('chunk_id, type, name, content')
      .eq('type', 'monster')
      .ilike('content', `%${tag}%`)
      .limit(2)
    if (data?.length) chunks.push(...data.map(d => ({ id: d.chunk_id, name: d.name, text: d.content })))
  }

  // Deduplicate
  const seen = new Set()
  return chunks.filter(c => { if (seen.has(c.id)) return false; seen.add(c.id); return true }).slice(0, limit)
}

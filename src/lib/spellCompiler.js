// src/lib/spellCompiler.js
// ══════════════════════════════════════════════════════════════
// Spell Compiler
//
// When a player encounters a spell not in PLAYER_SPELLS and not
// on Open5e (custom, homebrew, campaign-specific), this module:
//   1. Sends the spell's natural language description to the AI
//   2. Gets back a structured JSON mechanical definition
//   3. Validates the definition is safe and executable
//   4. Saves it to the `compiled_spells` Supabase table
//   5. Returns it as a spellData object CombatScreen can execute
//
// The compiled definition uses the exact same shape as PLAYER_SPELLS
// in engine.js, so zero changes are needed in the execution layer.
// ══════════════════════════════════════════════════════════════

import { supabase } from './supabase'
import { callAI }   from './openrouter'

// ── In-memory cache: slug → compiled spell data ───────────────
const compiledCache = {}

// ── Load a compiled spell for this campaign ───────────────────
export async function loadCompiledSpell(spellName, campaignId) {
  const key = spellName.toLowerCase().trim()
  if (compiledCache[key]) return compiledCache[key]

  try {
    const { data } = await supabase
      .from('compiled_spells')
      .select('definition')
      .eq('campaign_id', campaignId)
      .ilike('name', spellName)
      .limit(1)

    if (data?.[0]?.definition) {
      const def = typeof data[0].definition === 'string'
        ? JSON.parse(data[0].definition)
        : data[0].definition
      compiledCache[key] = def
      return def
    }
  } catch { /* cache miss */ }
  return null
}

// ── Validate AI-compiled spell definition ─────────────────────
// Prevents spells with wrong type from doing nothing in combat.
export function validateCompiledSpell(raw) {
  if (!raw) return null
  const VALID_TYPES = ['attack', 'save', 'heal', 'buff', 'debuff', 'utility', 'dart']
  const VALID_STATS  = ['STR','DEX','CON','INT','WIS','CHA']
  const VALID_DMGTYPES = ['fire','cold','lightning','thunder','poison','acid','psychic',
    'necrotic','radiant','force','bludgeoning','piercing','slashing']

  // Ensure spellType is valid
  if (!VALID_TYPES.includes(raw.spellType)) {
    // Infer from other fields
    if (raw.isAttackRoll || raw.castingStat === 'attack') raw.spellType = 'attack'
    else if (raw.isHeal || raw.healDice)                  raw.spellType = 'heal'
    else if (raw.saveStat)                                raw.spellType = 'save'
    else if (raw.damageDice)                              raw.spellType = raw.isAttackRoll ? 'attack' : 'save'
    else                                                  raw.spellType = 'utility'
  }

  // Attack spells must have damageDice
  if (raw.spellType === 'attack' && !raw.damageDice) {
    if (raw.saveStat) raw.spellType = 'save'
    else              raw.spellType = 'utility'
  }

  // Save spells must have a saveStat
  if (raw.spellType === 'save' && !VALID_STATS.includes(raw.saveStat)) {
    raw.saveStat = 'DEX'
  }

  // Heal spells must have healDice
  if (raw.spellType === 'heal' && !raw.healDice) {
    raw.healDice = `${raw.level || 1}d8+2`
  }

  // Damage type validation
  if (raw.damageType && !VALID_DMGTYPES.includes(raw.damageType.toLowerCase())) {
    raw.damageType = 'force'
  }

  // Damage dice format validation
  if (raw.damageDice && !String(raw.damageDice).match(/\d+d\d+/)) {
    raw.damageDice = null
    if (raw.spellType === 'attack') raw.spellType = 'utility'
  }

  // Ensure casting stat
  if (!['int','wis','cha'].includes(raw.castingStat)) raw.castingStat = 'int'

  // Level range
  raw.level = Math.max(0, Math.min(9, parseInt(raw.level) || 0))

  console.log(`[SpellCompiler] Validated "${raw.name}": type=${raw.spellType}, dice=${raw.damageDice}, save=${raw.saveStat}`)
  return raw
}

// ── Compile a spell from natural language description ─────────
// Returns a spellData object ready for CombatScreen to execute.
export async function compileSpell({ name, description, level, school, campaignId, character }) {
  const charClass = character?.class || 'Wizard'
  const castingStat = /Cleric|Druid|Ranger/.test(charClass) ? 'wis'
    : /Bard|Paladin|Sorcerer|Warlock/.test(charClass) ? 'cha' : 'int'

  const prompt = `You are a D&D 5e rules engine. Analyze this spell and output a mechanical JSON definition that can be executed in code.

SPELL NAME: ${name}
SPELL LEVEL: ${level || 'unknown'}
SCHOOL: ${school || 'unknown'}
DESCRIPTION:
${description}

Return ONLY valid JSON with NO markdown. Use this exact structure:

{
  "name": "${name}",
  "level": <integer 0-9>,
  "school": "<abjuration|conjuration|divination|enchantment|evocation|illusion|necromancy|transmutation>",
  "castAs": "<action|bonus|reaction>",
  "castingStat": "<int|wis|cha>",
  "concentration": <true|false>,
  "ritual": <true|false>,
  "spellType": "<attack|save|heal|buff|debuff|utility|dart>",
  "rangeType": "<single|aoe|self|touch>",
  "targetType": "<enemy|self|self_or_ally|all_enemies|any>",
  "damageDice": "<dice expression like 3d6 or null>",
  "damageType": "<fire|cold|lightning|thunder|poison|acid|psychic|necrotic|radiant|force|bludgeoning|piercing|slashing|null>",
  "saveStat": "<STR|DEX|CON|INT|WIS|CHA|null>",
  "saveOnHalf": <true|false>,
  "isAttackRoll": <true|false>,
  "isHeal": <false>,
  "healDice": "<dice expression or null>",
  "statusEffect": { "effectId": "<poisoned|stunned|frightened|prone|frozen|burning|bleeding|weakened|blessed>", "duration": <turns> },
  "halfOnSave": <true|false>,
  "icon": "<single emoji>",
  "description": "<one sentence mechanical summary — what it does, not flavour>",
  "mechanics": {
    "notes": "<any unusual mechanics that don't fit the standard model, described precisely>",
    "requiresBloodRelation": <true|false>,
    "transfersSpell": <true|false>,
    "ritual": <true|false>,
    "castingTime": "<1 action|10 minutes|1 minute|etc>",
    "range": "<Self|Touch|30 feet|1 mile|etc>",
    "duration": "<Instantaneous|1 minute|Until dispelled|etc>"
  }
}

RULES for filling this out:
- spellType: "attack" = spell attack roll vs enemy. "save" = enemy makes saving throw. "heal" = restores HP. "buff" = improves caster/ally. "utility" = no direct combat effect.
- If the spell transfers or redirects another spell (like Blood Strike), set spellType = "utility", transfersSpell = true, damageDice = null.
- statusEffect: pick the CLOSEST match from the allowed effectId list. null if no condition is applied.
- damageDice: ONLY the dice expression, e.g. "3d8" or "2d6+4". null if no damage.
- icon: one emoji that fits the spell's theme.
- Ritual spells with 10+ minute casting time: castAs = "action" but note castingTime in mechanics.
- description: mechanical only. Example: "Target makes DEX save or takes 8d6 fire damage, half on success."`

  try {
    const raw   = await callAI([{ role: 'user', content: prompt }], 800)
    const clean = raw.replace(/```json|```/g, '').trim()
    const start = clean.indexOf('{')
    const end   = clean.lastIndexOf('}') + 1
    if (start === -1 || end === 0) throw new Error('No JSON in response')

    const def = JSON.parse(clean.slice(start, end))

    // ── Validate and sanitize ─────────────────────────────────
    const compiled = {
      name:          def.name || name,
      level:         typeof def.level === 'number' ? def.level : (parseInt(level) || 0),
      school:        def.school || school || 'evocation',
      castAs:        ['action','bonus','reaction'].includes(def.castAs) ? def.castAs : 'action',
      castingStat:   ['int','wis','cha'].includes(def.castingStat) ? def.castingStat : castingStat,
      concentration: !!def.concentration,
      ritual:        !!def.ritual,
      spellType:     ['attack','save','heal','buff','debuff','utility','dart'].includes(def.spellType) ? def.spellType : 'utility',
      rangeType:     ['single','aoe','self','touch'].includes(def.rangeType) ? def.rangeType : 'single',
      targetType:    def.targetType || 'enemy',
      damageDice:    isValidDice(def.damageDice) ? def.damageDice : null,
      damageType:    def.damageType || null,
      saveStat:      def.saveStat   || null,
      saveOnHalf:    !!def.saveOnHalf,
      isAttackRoll:  !!def.isAttackRoll,
      isHeal:        !!def.isHeal,
      healDice:      isValidDice(def.healDice) ? def.healDice : null,
      statusEffect:  validateStatusEffect(def.statusEffect),
      halfOnSave:    !!def.halfOnSave,
      icon:          def.icon || '✨',
      description:   def.description || description?.slice(0, 200) || '',
      mechanics:     def.mechanics   || {},
      compiledAt:    new Date().toISOString(),
      fromCompiler:  true,
    }

    // ── Save to Supabase ──────────────────────────────────────
    if (campaignId) {
      await supabase.from('compiled_spells').upsert({
        campaign_id: campaignId,
        name:        compiled.name,
        slug:        compiled.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        level:       compiled.level,
        school:      compiled.school,
        definition:  JSON.stringify(compiled),
        created_at:  new Date().toISOString(),
      }, { onConflict: 'campaign_id,slug' })
    }

    // Cache it
    // Validate before storing — prevents wrong spellType from silently doing nothing
    const validated = validateCompiledSpell(compiled)
    if (!validated) {
      console.warn(`[SpellCompiler] "${name}" failed validation — not stored`)
      return null
    }
    compiledCache[validated.name.toLowerCase().trim()] = validated
    console.log(`[SpellCompiler] Compiled "${name}" →`, validated.spellType, validated.damageDice || 'no damage')
    return validated

  } catch (err) {
    console.error('[SpellCompiler] Failed to compile spell:', err.message)
    return null
  }
}

// ── List all compiled spells for a campaign ───────────────────
export async function listCompiledSpells(campaignId) {
  if (!campaignId) return []
  try {
    const { data } = await supabase
      .from('compiled_spells')
      .select('name, level, school, definition')
      .eq('campaign_id', campaignId)
      .order('name')
    return (data || []).map(row => ({
      name:  row.name,
      level: row.level,
      school: row.school,
      definition: typeof row.definition === 'string' ? JSON.parse(row.definition) : row.definition,
    }))
  } catch { return [] }
}

// ── Delete a compiled spell (let player recompile if wrong) ───
export async function deleteCompiledSpell(campaignId, spellName) {
  delete compiledCache[spellName.toLowerCase().trim()]
  await supabase.from('compiled_spells')
    .delete()
    .eq('campaign_id', campaignId)
    .ilike('name', spellName)
}

// ── Helpers ───────────────────────────────────────────────────
function isValidDice(expr) {
  if (!expr || expr === 'null') return false
  return /\d+d\d+([+-]\d+)?/.test(String(expr))
}

const VALID_EFFECTS = ['poisoned','stunned','frightened','prone','frozen','burning','bleeding','weakened','blessed','shielded','regenerating','poisonDot']
function validateStatusEffect(se) {
  if (!se || typeof se !== 'object') return null
  if (!VALID_EFFECTS.includes(se.effectId)) return null
  return { effectId: se.effectId, duration: parseInt(se.duration) || 2 }
}

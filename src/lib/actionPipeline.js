// src/lib/actionPipeline.js
// ══════════════════════════════════════════════════════════════
// ACTION RESOLUTION PIPELINE
//
// The core problem this solves: the LLM was both computing
// outcomes AND narrating them. This separates those two jobs.
//
// PIPELINE ORDER (immutable):
//   1. START_OF_TURN   — tick status effects, check conditions
//   2. VALIDATION      — is the action legal? does the player have it?
//   3. RESOLUTION      — engine computes the mechanical outcome
//   4. STATE_UPDATE    — write new HP/conditions/spell slots to state
//   5. NARRATION       — LLM receives the computed result, narrates ONLY
//
// The LLM NEVER decides outcomes.
// The engine NEVER narrates.
// ══════════════════════════════════════════════════════════════

import { rollDice, roll, abilityMod, resolveSave, STATUS_EFFECTS, getSpellDef } from '../combat/engine'
import { getRegisteredItem, getRegisteredCreature }                 from './contentRegistry'
import { loadCompiledSpell, validateCompiledSpell }                 from './spellCompiler'
import { getItem }                                                   from './items'
import { executeAbility, attackToAbility }                          from '../combat/abilitySystem'

// ── Action types the pipeline understands ────────────────────
export const ACTION_TYPES = {
  ATTACK:          'attack',
  CAST_SPELL:      'cast_spell',
  USE_ITEM:        'use_item',
  CLASS_FEATURE:   'class_feature',
  SKILL_CHECK:     'skill_check',
  SAVING_THROW:    'saving_throw',
  MOVE:            'move',
  DASH:            'dash',
  DODGE:           'dodge',
  HELP:            'help',
  HIDE:            'hide',
  DISENGAGE:       'disengage',
  INTERACT:        'interact',
  NARRATIVE:       'narrative',    // free-text action, goes to LLM without engine resolution
}

// ── Pipeline result shape ─────────────────────────────────────
function makeResult(action, success, data = {}) {
  return {
    action,
    success,
    // Mechanical outcome — fed to LLM as context, not invented by it
    mechanical: {
      rolls:         [],      // all dice rolled { label, die, result }
      total:         null,
      hits:          null,
      damage:        null,
      damageType:    null,
      healing:       null,
      saveResult:    null,
      conditions:    [],      // applied/removed conditions
      resourcesUsed: [],      // spell slots, class feature charges
      notes:         [],
    },
    // State delta — applied immediately BEFORE LLM is called
    stateDelta: {
      hpDelta:       0,       // positive = heal, negative = damage
      newConditions: [],
      removedConditions: [],
      spellSlotUsed: null,    // level number
      xpGain:        0,
    },
    // Narration context fed to LLM (machine-generated, factual)
    narrativeContext: '',
    ...data,
  }
}

// ═══════════════════════════════════════════════════════════
// PHASE 1 — VALIDATION
// ═══════════════════════════════════════════════════════════

export function validateAction(action, character, gameState) {
  const { type, payload } = action
  const errors = []

  switch (type) {
    case ACTION_TYPES.ATTACK: {
      const equip = (character.equipment || []).join(' ').toLowerCase()
      const weapon = payload.weapon || 'unarmed'
      // Allow if weapon is in equipment OR it's unarmed
      if (weapon !== 'unarmed' && !equip.includes(weapon.toLowerCase())) {
        errors.push(`You don't have a ${weapon} equipped.`)
      }
      break
    }

    case ACTION_TYPES.CAST_SPELL: {
      const spellName = payload.spellName?.replace(/\s*\(cantrip\)/i, '').trim()
      const known     = (character.spells || []).map(s => s.replace(/\s*\(cantrip\)/i, '').trim().toLowerCase())
      if (!known.includes(spellName?.toLowerCase())) {
        errors.push(`${character.name} doesn't know ${spellName}.`)
        break
      }
      // Check spell slot availability for leveled spells
      if (payload.slotLevel && payload.slotLevel > 0) {
        const slots = character.spell_slots?.[String(payload.slotLevel)]
        if (!slots || (slots.max - (slots.used || 0)) <= 0) {
          errors.push(`No level ${payload.slotLevel} spell slots remaining.`)
        }
      }
      break
    }

    case ACTION_TYPES.USE_ITEM: {
      const itemName = payload.itemName
      const equip    = character.equipment || []
      if (!equip.some(e => e.toLowerCase().includes(itemName?.toLowerCase()))) {
        errors.push(`${character.name} doesn't have ${itemName}.`)
      }
      break
    }

    case ACTION_TYPES.CLASS_FEATURE: {
      const featureId = payload.featureId
      const charges   = gameState.classCharges?.[featureId]
      if (charges !== undefined && charges <= 0) {
        errors.push(`${featureId} has no charges remaining.`)
      }
      break
    }
  }

  return { valid: errors.length === 0, errors }
}

// ═══════════════════════════════════════════════════════════
// PHASE 2 — RESOLUTION
// The engine computes dice, damage, saves, conditions.
// ═══════════════════════════════════════════════════════════

export async function resolveAction(action, character, target, campaignId) {
  const { type, payload } = action
  const result = makeResult(action, true)
  const prof    = character.proficiency_bonus || 2

  switch (type) {

    // ── Weapon attack ─────────────────────────────────────
    case ACTION_TYPES.ATTACK: {
      const strMod = abilityMod(character.strength || 10)
      const dexMod = abilityMod(character.dexterity || 10)
      const weapon = payload.weaponData || getItem(payload.weapon || 'Unarmed')
      const usesDex = weapon.finesse ? dexMod > strMod : !!weapon.ranged
      const statMod = usesDex ? dexMod : strMod

      // Fighting style bonus
      const styleBonus = getFightingStyleAttackBonus(character, weapon)

      const atkBonus = statMod + prof + styleBonus
      const d20      = roll(20)
      const atkTotal = d20 + atkBonus
      const isCrit   = d20 === 20
      const isFumble = d20 === 1
      const hits     = target ? (isCrit || (!isFumble && atkTotal >= (target.ac || 10))) : false

      result.mechanical.rolls.push({ label: 'Attack', die: 20, result: d20, modifier: atkBonus })
      result.mechanical.total = atkTotal
      result.mechanical.hits  = hits

      if (hits && target) {
        const dmgDice    = weapon.damageDice || weapon.damage || '1d4'
        const dmgStatMod = usesDex ? dexMod : strMod
        const dmgBonus   = dmgStatMod + getFightingStyleDamageBonus(character, weapon)
        const dmgResult  = rollDice(isCrit
          ? dmgDice.replace(/^(\d+)d/, (_, n) => `${parseInt(n)*2}d`)
          : dmgDice)
        let totalDamage  = dmgResult.total + dmgBonus

        // On-hit proc (e.g. Blade of Blood: 1d4 necrotic bleed on crit)
        const itemFull = await getRegisteredItem(weapon.name, campaignId).catch(() => null) || weapon
        if (isCrit && itemFull.onCrit) {
          const critExtra = rollDice(itemFull.onCrit.damage)
          totalDamage    += critExtra.total
          result.mechanical.notes.push(`On-crit: +${critExtra.total} ${itemFull.onCrit.type}`)
        }
        if (itemFull.onHit) {
          result.stateDelta.newConditions.push({
            target: 'enemy',
            condition: itemFull.onHit.condition,
            duration:  itemFull.onHit.duration,
          })
        }

        result.mechanical.damage     = totalDamage
        result.mechanical.damageType = weapon.dmgType || weapon.type || 'slashing'
        result.stateDelta.hpDelta    = -totalDamage
        result.mechanical.rolls.push({ label: 'Damage', die: dmgDice, result: dmgResult.rolls, total: dmgResult.total })
      }

      result.narrativeContext = hits
        ? `${character.name} attacks ${target?.name || 'the target'} — HITS for ${result.mechanical.damage} ${result.mechanical.damageType} damage${isCrit ? ' (CRITICAL HIT)' : ''}.`
        : isFumble
          ? `${character.name} attacks — CRITICAL MISS (rolled 1).`
          : `${character.name} attacks ${target?.name || 'the target'} — MISSES (rolled ${atkTotal} vs AC ${target?.ac || '?'}).`
      break
    }

    // ── Spell cast ────────────────────────────────────────
    case ACTION_TYPES.CAST_SPELL: {
      const spellName = payload.spellName?.replace(/\s*\(cantrip\)/i, '').trim()
      const slotLevel = payload.slotLevel || 0

      // Load spell definition — local dict first (328 SRD spells, instant),
      // then compiled DB (custom/homebrew spells), never raw AI text.
      const localDef   = getSpellDef(spellName)
      const compiledDef = localDef ? null : await loadCompiledSpell(spellName, campaignId)
      const spellDef   = localDef || compiledDef
      if (!spellDef) {
        result.success = false
        result.narrativeContext = `Spell "${spellName}" is not in the spell dictionary and has not been compiled yet. Use it in combat first to trigger compilation.`
        break
      }

      // Convert spell definition to an ability and run through the universal executor.
      // This ensures spells use the exact same pipeline as enemy abilities.
      const spellAbility = spellDefToAbility(spellDef, slotLevel, prof, character)
      const abilResult   = executeAbility(spellAbility, character, target, { profBonus: prof })

      result.mechanical.hits       = abilResult.hits
      result.mechanical.damage     = abilResult.damage
      result.mechanical.damageType = abilResult.damageType
      result.mechanical.healing    = abilResult.healing
      result.mechanical.saveResult = abilResult.saveResult
      result.mechanical.rolls      = [...result.mechanical.rolls, ...(abilResult.rolls || [])]
      result.stateDelta.hpDelta    = abilResult.healing > 0 ? abilResult.healing : -(abilResult.damage || 0)
      for (const cond of (abilResult.conditionsApplied || [])) {
        result.stateDelta.newConditions.push({
          target: spellDef.targetType === 'self' ? 'self' : 'enemy',
          effectId:  cond.statusId,
          duration:  cond.duration,
        })
      }

      if (slotLevel > 0) result.stateDelta.spellSlotUsed = slotLevel
      result.mechanical.resourcesUsed.push(`Level ${slotLevel || 'cantrip'} spell slot`)
      result.narrativeContext = buildSpellNarrative(spellDef, character, target, result.mechanical)
      break
    }

    // ── Use item (consumable) ─────────────────────────────
    case ACTION_TYPES.USE_ITEM: {
      const itemName   = payload.itemName
      const item       = await getRegisteredItem(itemName, campaignId).catch(() => null) || getItem(itemName)
      if (item?.heal) {
        const healRoll = rollDice(item.heal)
        result.mechanical.healing = healRoll.total
        result.stateDelta.hpDelta = healRoll.total
        result.narrativeContext   = `${character.name} uses ${itemName} — recovers ${healRoll.total} HP (rolled ${healRoll.rolls.join('+')} = ${healRoll.total}).`
      }
      break
    }

    // ── Narrative / RP actions ────────────────────────────
    case ACTION_TYPES.NARRATIVE:
    default:
      result.narrativeContext = ''  // LLM has full freedom for pure RP
      break
  }

  return result
}

// ═══════════════════════════════════════════════════════════
// PHASE 3 — BUILD NARRATION CONTEXT BLOCK
// This is what gets injected into the LLM prompt.
// The LLM RECEIVES this — it does NOT compute it.
// ═══════════════════════════════════════════════════════════

export function buildMechanicalContext(pipelineResult) {
  if (!pipelineResult?.mechanical) return ''
  const { mechanical, stateDelta, action } = pipelineResult
  const lines = []

  // Tell the LLM exactly what happened mechanically
  if (action?.type === ACTION_TYPES.NARRATIVE) return ''

  lines.push('[MECHANICAL RESULT — narrate this outcome, do not change it:]')

  if (mechanical.hits === true)  lines.push(`• Attack: HIT — ${mechanical.damage} ${mechanical.damageType || ''} damage`)
  if (mechanical.hits === false) lines.push(`• Attack: MISS`)
  if (mechanical.healing)        lines.push(`• Healing: +${mechanical.healing} HP`)
  if (mechanical.saveResult)     lines.push(`• ${mechanical.saveResult.stat} Save: ${mechanical.saveResult.success ? 'SUCCESS' : 'FAILED'} (rolled ${mechanical.saveResult.total} vs DC ${mechanical.saveResult.dc})`)
  if (stateDelta.newConditions?.length) {
    lines.push(`• Conditions applied: ${stateDelta.newConditions.map(c => c.condition || c.effectId).join(', ')}`)
  }
  if (stateDelta.spellSlotUsed) lines.push(`• Spell slot used: Level ${stateDelta.spellSlotUsed}`)
  if (mechanical.notes?.length)  lines.push(...mechanical.notes.map(n => `• ${n}`))

  lines.push('[Describe the outcome vividly. Do NOT roll dice or invent additional effects.]')
  return lines.join('\n')
}

// ── Helpers ───────────────────────────────────────────────────

// ── Convert a PLAYER_SPELLS definition to an AbilitySchema ─────────────────
// Bridges the existing spellData.js format with the universal ability system.
function spellDefToAbility(spellDef, slotLevel, prof, character) {
  const charLevel = character?.level || 1
  const stat      = spellDef.castingStat || spellDef.atkStat || 'int'
  const statScore = { int: character?.intelligence, wis: character?.wisdom, cha: character?.charisma }[stat] || 10
  const spellMod  = abilityMod(statScore)
  const dc        = 8 + prof + spellMod

  let damageDice = spellDef.damageDice || spellDef.damage || null
  if (typeof damageDice === 'function') damageDice = damageDice(slotLevel, charLevel)

  let healDice = spellDef.healDice || null
  if (typeof healDice === 'function') healDice = healDice(slotLevel)

  const resolutionType = spellDef.spellType === 'attack' || spellDef.isAttackRoll
    ? 'attack_roll'
    : spellDef.spellType === 'save' || spellDef.saveStat
      ? 'saving_throw'
      : spellDef.isHeal || spellDef.type === 'heal'
        ? 'auto_hit'
        : 'no_roll'

  return {
    id:   `spell_${(spellDef.name||'unknown').toLowerCase().replace(/\s+/g,'_')}`,
    name: spellDef.name || 'Unknown Spell',
    icon: spellDef.icon || '✨',
    trigger: 'active',
    condition: {},
    effect: {
      type:      spellDef.isHeal || spellDef.type === 'heal'
                   ? 'heal'
                   : spellDef.spellType === 'buff'
                     ? 'apply_status'
                     : 'damage',
      dice:       damageDice,
      healDice:   healDice,
      damageType: spellDef.damageType || spellDef.dmgType || 'force',
      statusId:   spellDef.statusEffect?.effectId || spellDef.applyEffect,
      duration:   spellDef.statusEffect?.duration || spellDef.effectDuration || 2,
    },
    resolution: {
      type:       resolutionType,
      stat:       spellDef.saveStat || null,
      bonus:      resolutionType === 'attack_roll' ? spellMod + prof : undefined,
      dc:         resolutionType === 'saving_throw' ? dc : undefined,
      halfOnSave: spellDef.saveOnHalf || spellDef.halfOnSave || false,
    },
    targeting: {
      type:  spellDef.targetType || (spellDef.rangeType === 'aoe' ? 'all_enemies' : 'single_enemy'),
      range: spellDef.rangeType || 'single',
    },
    cost:    { type: slotLevel > 0 ? 'spell_slot' : 'none', level: slotLevel },
    castAs:  spellDef.castAs || 'action',
    cooldown: 0,
  }
}

function resolveDiceForSlot(spellDef, slotLevel, isHeal = false) {
  const table = isHeal ? spellDef.healAtSlot : spellDef.damageAtSlot
  if (table && Object.keys(table).length) {
    const available = Object.keys(table).map(Number).filter(k => k <= (slotLevel || spellDef.level || 1)).sort((a,b) => b-a)
    if (available.length) return table[String(available[0])]
  }
  return isHeal ? (spellDef.healDice || '1d8+2') : (spellDef.damageDice || '1d6')
}

function getFightingStyleAttackBonus(character, weapon) {
  const style = character.fighting_style || ''
  if (/Archery/i.test(style) && weapon.ranged) return 2
  return 0
}

function getFightingStyleDamageBonus(character, weapon) {
  const style = character.fighting_style || ''
  const equip = (character.equipment || []).join(' ').toLowerCase()
  if (/Dueling/i.test(style) && !weapon.twoHanded && !equip.includes('offhand')) return 2
  return 0
}

function buildSpellNarrative(spellDef, character, target, mechanical) {
  const parts = [`${character.name} casts ${spellDef.name}.`]
  if (mechanical.hits === true)  parts.push(`Spell attack hits ${target?.name} for ${mechanical.damage} ${mechanical.damageType} damage.`)
  if (mechanical.hits === false) parts.push(`Spell attack misses ${target?.name}.`)
  if (mechanical.damage && mechanical.saveResult) {
    parts.push(mechanical.saveResult.success
      ? `${target?.name} saves (${mechanical.saveResult.total} vs DC ${mechanical.saveResult.dc})${mechanical.damage > 0 ? ` — takes ${mechanical.damage} ${mechanical.damageType} (half)` : ''}.`
      : `${target?.name} fails (${mechanical.saveResult.total} vs DC ${mechanical.saveResult.dc}) — takes ${mechanical.damage} ${mechanical.damageType}.`)
  }
  if (mechanical.healing) parts.push(`${character.name} recovers ${mechanical.healing} HP.`)
  return parts.join(' ')
}

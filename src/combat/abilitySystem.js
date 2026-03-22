// src/combat/abilitySystem.js
// ══════════════════════════════════════════════════════════════
// UNIVERSAL ABILITY SYSTEM
//
// Everything in the game that deals damage, heals, or applies a
// status effect goes through this file. Players, enemies, items,
// and spells all use the same AbilitySchema and executeAbility().
//
// The engine decides outcomes. The LLM narrates them.
// Nothing here calls the network. Nothing here touches React state.
// ══════════════════════════════════════════════════════════════

import { roll, rollDice, resolveSave, abilityMod, STATUS_EFFECTS } from './engine'

// ── AbilitySchema ─────────────────────────────────────────────
// Full definition of the shape — used for documentation and
// runtime validation. Every ability in the game must match this.
export const ABILITY_TRIGGERS = {
  ACTIVE:         'active',         // player or enemy consciously uses it
  ON_TURN_START:  'on_turn_start',  // fires automatically at start of turn
  ON_HIT:         'on_hit',         // fires when an attack from this creature hits
  ON_TAKE_DAMAGE: 'on_take_damage', // fires when creature takes damage
  ON_DEATH:       'on_death',       // fires at 0 HP
  PASSIVE:        'passive',        // always active, modifies stats
}

export const RESOLUTION_TYPES = {
  ATTACK_ROLL:    'attack_roll',    // roll d20+bonus vs AC
  SAVING_THROW:   'saving_throw',   // target rolls d20+mod vs DC
  AUTO_HIT:       'auto_hit',       // always hits (Magic Missile)
  NO_ROLL:        'no_roll',        // pure buff/debuff, no resolution
}

export const EFFECT_TYPES = {
  DAMAGE:         'damage',
  HEAL:           'heal',
  APPLY_STATUS:   'apply_status',
  REMOVE_STATUS:  'remove_status',
  GRANT_ACTION:   'grant_action',
  MODIFY_STAT:    'modify_stat',
}

// ── Condition evaluator ───────────────────────────────────────
// Pure function. Returns true if all conditions in `condition` are met.

export function meetsCondition(condition = {}, actor, target, context = {}) {
  if (!condition || Object.keys(condition).length === 0) return true

  const hpFrac = actor.hp / (actor.maxHp || 1)

  if (condition.hpBelow  !== undefined && hpFrac >= condition.hpBelow)  return false
  if (condition.hpAbove  !== undefined && hpFrac <= condition.hpAbove)  return false

  if (condition.hasStatus) {
    const has = (actor.statusEffects || []).some(s => s.effectId === condition.hasStatus)
    if (!has) return false
  }
  if (condition.notHasStatus) {
    const has = (actor.statusEffects || []).some(s => s.effectId === condition.notHasStatus)
    if (has) return false
  }

  if (condition.allyNearby !== undefined) {
    if (condition.allyNearby !== (context.allyNearby ?? false)) return false
  }

  if (condition.chargesMin !== undefined) {
    const charges = (actor.abilityCharges || {})[condition.chargesId] ?? Infinity
    if (charges < condition.chargesMin) return false
  }

  if (condition.targetHpBelow !== undefined && target) {
    const targetFrac = target.hp / (target.maxHp || 1)
    if (targetFrac >= condition.targetHpBelow) return false
  }

  return true
}

// ── Enemy ability chooser ─────────────────────────────────────
// Deterministic priority — reads the enemy's abilities array.
// No randomness except as a tiebreaker for equal-priority abilities.
//
// Priority order:
//   1. Self-heal if HP < 35% and heal ability available
//   2. Crowd control (abilities that apply stunned/frozen)
//   3. Highest expected damage
//   4. Any remaining eligible active ability
//   5. null → fall back to basic attack

export function chooseEnemyAbility(enemy, player, allEnemies, round) {
  const abilities = enemy.abilities || []
  if (!abilities.length) return null

  const cooldowns = enemy.abilityCooldowns || {}
  const allyNearby = allEnemies.filter(e => e.id !== enemy.id && !e.dead).length > 0

  const context = { allyNearby, round }

  const eligible = abilities.filter(a => {
    if (a.trigger === ABILITY_TRIGGERS.PASSIVE) return false
    if (a.trigger !== ABILITY_TRIGGERS.ACTIVE)  return false
    if ((cooldowns[a.id] || 0) > 0)             return false
    return meetsCondition(a.condition || {}, enemy, player, context)
  })

  if (!eligible.length) return null

  // 1. Self-heal if critical HP
  if (enemy.hp / enemy.maxHp < 0.35) {
    const heal = eligible.find(a => a.effect?.type === EFFECT_TYPES.HEAL)
    if (heal) return heal
  }

  // 2. Crowd control
  const cc = eligible.find(a =>
    a.effect?.type === EFFECT_TYPES.APPLY_STATUS &&
    ['stunned','frozen','frightened'].includes(a.effect?.statusId)
  )
  if (cc) return cc

  // 3. Highest expected damage
  const damaging = eligible.filter(a => a.effect?.type === EFFECT_TYPES.DAMAGE)
  if (damaging.length) {
    damaging.sort((a, b) => _avgDamage(b.effect.dice) - _avgDamage(a.effect.dice))
    return damaging[0]
  }

  return eligible[0]
}

function _avgDamage(dice) {
  if (!dice) return 0
  const m = String(dice).match(/(\d+)d(\d+)([+-]\d+)?/)
  if (!m) return parseFloat(dice) || 0
  return parseInt(m[1]) * (parseInt(m[2]) + 1) / 2 + parseInt(m[3] || '0')
}

// ── Universal ability executor ────────────────────────────────
// INPUT:  an AbilitySchema object, the attacker, the target, context
// OUTPUT: an AbilityResult (pure data — NO React state changes)
// CALLER: applies the result to state

export function executeAbility(ability, attacker, target, context = {}) {
  const { profBonus = 2, advantage = false, disadvantage = false } = context

  const result = {
    abilityId:         ability.id,
    abilityName:       ability.name,
    icon:              ability.icon || '⚔️',
    actor:             attacker.name,
    targetName:        target?.name || null,
    hits:              null,
    isCrit:            false,
    isFumble:          false,
    damage:            0,
    damageType:        ability.effect?.damageType || null,
    healing:           0,
    conditionsApplied: [],   // [{ statusId, duration }]
    conditionsRemoved: [],   // [statusId]
    rolls:             [],   // [{ label, die, result, modifier }]
    saveResult:        null,
    narrativeContext:  '',
    success:           true,
  }

  const eff = ability.effect
  if (!eff) {
    result.narrativeContext = `${attacker.name} uses ${ability.name}.`
    return result
  }

  const resType = ability.resolution?.type || RESOLUTION_TYPES.NO_ROLL

  // ── Attack roll ─────────────────────────────────────────────
  if (resType === RESOLUTION_TYPES.ATTACK_ROLL) {
    const bonus = ability.resolution.bonus ??
      (profBonus + abilityMod(attacker[ability.resolution.statScore || 'str'] || 10))

    const d1 = roll(20), d2 = roll(20)
    const dieRoll = (advantage && !disadvantage) ? Math.max(d1, d2)
                  : (disadvantage && !advantage)  ? Math.min(d1, d2)
                  : d1
    const total   = dieRoll + bonus
    result.isCrit   = dieRoll === 20
    result.isFumble = dieRoll === 1
    result.hits     = result.isCrit || (!result.isFumble && total >= (target?.ac || 10))
    result.rolls.push({ label: 'Attack', die: 20, result: dieRoll, modifier: bonus, total })

    if (result.hits && eff.type === EFFECT_TYPES.DAMAGE) {
      const expr = result.isCrit
        ? eff.dice.replace(/^(\d+)d/, (_, n) => `${parseInt(n) * 2}d`)
        : eff.dice
      const dmg = rollDice(expr)
      result.damage    = dmg.total
      result.damageType = eff.damageType
      result.rolls.push({ label: 'Damage', die: eff.dice, result: dmg.rolls, total: dmg.total })
    }

    if (result.hits && eff.type === EFFECT_TYPES.APPLY_STATUS) {
      result.conditionsApplied.push({ statusId: eff.statusId, duration: eff.duration || 1 })
    }

    // On-hit secondary effect (e.g. Wolf: knock prone on STR save)
    if (result.hits && ability.onHitEffect) {
      _applySecondaryEffect(ability.onHitEffect, target, result, profBonus)
    }
  }

  // ── Saving throw ────────────────────────────────────────────
  else if (resType === RESOLUTION_TYPES.SAVING_THROW) {
    const dc      = ability.resolution.dc ?? (8 + profBonus)
    const stat    = ability.resolution.stat || 'DEX'
    const saveRes = target ? resolveSave({ creature: target, stat, dc }) : null
    result.saveResult = saveRes
    result.hits       = saveRes ? !saveRes.success : true  // hits = failed save
    if (saveRes) {
      result.rolls.push({ label: `${stat} Save`, die: 20, result: saveRes.dieRoll,
        modifier: saveRes.mod, total: saveRes.total, dc })
    }

    const saved = saveRes?.success ?? false

    if (eff.type === EFFECT_TYPES.DAMAGE) {
      const dmg = rollDice(eff.dice)
      result.damage     = saved
        ? (ability.resolution.halfOnSave ? Math.floor(dmg.total / 2) : 0)
        : dmg.total
      result.damageType = eff.damageType
      result.rolls.push({ label: 'Damage', die: eff.dice, result: dmg.rolls, total: dmg.total })
    }

    if (eff.type === EFFECT_TYPES.APPLY_STATUS && !saved) {
      result.conditionsApplied.push({ statusId: eff.statusId, duration: eff.duration || 2 })
    }
  }

  // ── Auto-hit (Magic Missile, healing word, buffs) ────────────
  else {
    result.hits = true

    if (eff.type === EFFECT_TYPES.DAMAGE) {
      const dmg = rollDice(eff.dice)
      result.damage    = dmg.total
      result.damageType = eff.damageType
      result.rolls.push({ label: 'Damage', die: eff.dice, result: dmg.rolls, total: dmg.total })
    }

    if (eff.type === EFFECT_TYPES.HEAL) {
      const heal = rollDice(eff.healDice || '1d4+2')
      result.healing = heal.total
      result.rolls.push({ label: 'Healing', die: eff.healDice, result: heal.rolls, total: heal.total })
    }

    if (eff.type === EFFECT_TYPES.APPLY_STATUS) {
      result.conditionsApplied.push({ statusId: eff.statusId, duration: eff.duration || 2 })
    }

    if (eff.type === EFFECT_TYPES.REMOVE_STATUS) {
      result.conditionsRemoved.push(eff.statusId)
    }
  }

  result.narrativeContext = _buildNarrative(ability, result, attacker, target)
  return result
}

function _applySecondaryEffect(onHitEff, target, result, profBonus) {
  const eff = onHitEff.effect
  if (!eff || !target) return

  if (eff.type === 'saving_throw') {
    const dc      = eff.dc ?? (8 + profBonus)
    const saveRes = resolveSave({ creature: target, stat: eff.stat || 'CON', dc })
    result.rolls.push({ label: `${eff.stat} Save (secondary)`, die: 20,
      result: saveRes.dieRoll, modifier: saveRes.mod, total: saveRes.total, dc })
    if (!saveRes.success && eff.onFail) {
      result.conditionsApplied.push({
        statusId: eff.onFail.statusId,
        duration: eff.onFail.duration || 1,
      })
    }
  }

  if (eff.type === 'apply_status') {
    result.conditionsApplied.push({ statusId: eff.statusId, duration: eff.duration || 1 })
  }
}

function _buildNarrative(ability, result, attacker, target) {
  const parts = []

  if (result.isCrit)   parts.push('CRITICAL HIT!')
  if (result.isFumble) return `${attacker.name} uses ${ability.name} — Critical Fumble!`

  if (result.hits === false && result.saveResult) {
    parts.push(`${target?.name} saves (${result.saveResult.total} vs DC ${result.saveResult.dc})`)
    if (result.damage > 0) parts.push(`takes ${result.damage} ${result.damageType} (half)`)
    else parts.push('no effect')
  } else if (result.hits === false) {
    parts.push('MISS')
  } else {
    if (result.damage > 0)  parts.push(`${result.damage} ${result.damageType} damage`)
    if (result.healing > 0) parts.push(`+${result.healing} HP`)
    if (result.conditionsApplied.length) {
      parts.push(result.conditionsApplied.map(c => {
        const e = STATUS_EFFECTS[c.statusId]
        return e ? `${e.icon} ${e.name}` : c.statusId
      }).join(', '))
    }
  }

  const outcomeStr = parts.join(', ') || 'no effect'
  const targetStr  = target ? ` on ${target.name}` : ''
  return `${attacker.name} uses ${ability.name}${targetStr} — ${outcomeStr}.`
}

// ── Cooldown tracker ──────────────────────────────────────────
// Returns new cooldowns object after an ability is used.
// Caller stores this on the enemy state.

export function tickCooldowns(cooldowns) {
  const next = {}
  for (const [id, remaining] of Object.entries(cooldowns)) {
    if (remaining > 1) next[id] = remaining - 1
    // else drop it — cooldown expired
  }
  return next
}

export function usedAbility(cooldowns, abilityId, cooldown) {
  if (!cooldown || cooldown <= 0) return cooldowns
  return { ...cooldowns, [abilityId]: cooldown }
}

// ── Passive ability processor ─────────────────────────────────
// Called once at the start of each turn. Returns modifiers to apply.

export function getPassiveModifiers(abilities = [], actor, context = {}) {
  const modifiers = {
    attackAdvantage:    false,
    attackDisadvantage: false,
    acBonus:            0,
    damageBonus:        0,
  }

  for (const ability of abilities) {
    if (ability.trigger !== ABILITY_TRIGGERS.PASSIVE) continue
    if (!meetsCondition(ability.condition || {}, actor, null, context)) continue

    const eff = ability.effect
    if (!eff) continue

    if (eff.type === 'modify_stat') {
      if (eff.stat === 'attack_advantage') modifiers.attackAdvantage = true
      if (eff.stat === 'ac_bonus')         modifiers.acBonus += eff.value || 0
      if (eff.stat === 'damage_bonus')     modifiers.damageBonus += eff.value || 0
    }
  }

  return modifiers
}

// ── Turn-start auto-abilities ─────────────────────────────────
// Returns array of AbilityResults to apply at start of this actor's turn.

export function resolveTurnStartAbilities(abilities = [], actor, target, context = {}) {
  const results = []
  for (const ability of abilities) {
    if (ability.trigger !== ABILITY_TRIGGERS.ON_TURN_START) continue
    if (!meetsCondition(ability.condition || {}, actor, target, context)) continue
    results.push(executeAbility(ability, actor, ability.targeting?.type === 'self' ? actor : target, context))
  }
  return results
}

// ── Convert legacy MONSTER_STATS attack into AbilitySchema ────
// Used when a monster doesn't have an abilities[] array yet.
// Provides backward compatibility during migration.

export function attackToAbility(attack, monsterName) {
  const ability = {
    id:      `${monsterName.toLowerCase().replace(/\s+/g,'_')}_${attack.name.toLowerCase().replace(/\s+/g,'_')}`,
    name:    attack.name,
    icon:    '⚔️',
    trigger: ABILITY_TRIGGERS.ACTIVE,
    condition: {},
    effect:  { type: EFFECT_TYPES.DAMAGE, dice: attack.damage, damageType: attack.type },
    resolution: { type: RESOLUTION_TYPES.ATTACK_ROLL, bonus: attack.bonus },
    targeting: { type: 'single_enemy', range: 'melee' },
    cost:    { type: 'none' },
    castAs:  'action',
    cooldown: 0,
    flavor:  [],
  }

  // Carry over the special on-hit save
  if (attack.special) {
    ability.onHitEffect = {
      effect: {
        type:      'saving_throw',
        stat:      attack.special.stat,
        dc:        attack.special.dc,
        onFail: {
          type:     'apply_status',
          statusId: attack.special.effectId,
          duration: attack.special.duration || 1,
        },
      },
    }
  }

  return ability
}

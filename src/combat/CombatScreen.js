// src/combat/CombatScreen.js — Full Combat System v2
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  roll, rollDice, rollMultiple, abilityMod, modStr,
  resolveAttack, resolveSave, buildLogEntry,
  getMonsterStats, buildCustomMonster, rollLoot,
  STATUS_EFFECTS, applyStatusTick, ENEMY_SPELLS, getEnemySpellList,
  getSpellDef,
} from './engine'
import {
  fetchSpell, getDamageDiceForSlot, getHealDiceForSlot,
  spellNeedsEnemyTarget, spellIsSelfCast,
} from './spellResolver'
import { CLASS_BONUS_ACTIONS } from '../lib/classData'
import { getItem, ITEM_CATEGORIES } from '../lib/items'
import { callAI } from '../lib/openrouter'
import { lookupMonsterStats } from '../lib/rag'
import './CombatScreen.css'

const PHASES = { PLAYER: 'player', ENEMY: 'enemy', END: 'end', ROLL: 'roll', DEFEAT: 'defeat' }

function statBlock(char) {
  return {
    name: char.name, hp: char.current_hp, maxHp: char.max_hp,
    ac: char.armor_class,
    str: char.strength, dex: char.dexterity, con: char.constitution,
    int: char.intelligence, wis: char.wisdom, cha: char.charisma,
    profBonus: char.proficiency_bonus || 2,
    isPlayer: true,
    statusEffects: [], // { effectId, name, duration, icon, color }
  }
}

// ── Targeting modes ──────────────────────────────────────────
const TARGET_MODE = {
  SINGLE_ENEMY: 'single_enemy',
  SELF: 'self',
  AOE: 'aoe',           // all enemies
  MULTI: 'multi',       // select multiple manually
  DART: 'dart',         // assign darts/rays to specific targets
}

export default function CombatScreen({ character, enemyNames, onCombatEnd }) {
  const initEnemies = useCallback(() =>
    (enemyNames || []).map((nameStr, i) => {
      const found = getMonsterStats(nameStr)
      const base  = found || buildCustomMonster(nameStr, null, character.level || 1)
      return {
        ...base, id: `enemy_${i}`, name: nameStr,
        hp: base.maxHp, conditions: [], dead: false,
        loadingStats: !found,
        statusEffects: [],
        spellList: getEnemySpellList(base),
        spellCooldown: 0, // turns until can cast again
      }
    }), [enemyNames, character.level])

  const [player,       setPlayer]       = useState(() => ({ ...statBlock(character), conditions: [], spellSlotsUsed: {} }))
  const [enemies,      setEnemies]      = useState(initEnemies)
  const [phase,        setPhase]        = useState(PHASES.PLAYER)
  const [round,        setRound]        = useState(1)
  const [log,          setLog]          = useState([])
  const [actionUsed,   setActionUsed]   = useState(false)
  const [bonusUsed,    setBonusUsed]    = useState(false)

  // ── Targeting state ──────────────────────────────────────
  const [targetMode,   setTargetMode]   = useState(TARGET_MODE.SINGLE_ENEMY)
  const [selectedTargets, setSelectedTargets] = useState([]) // array of ids ('player' or enemy id)

  // ── Spell state ──────────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState('actions')
  const [selectedSlot, setSlot]         = useState(null)
  const [spellFetching, setSpellFetching] = useState(null) // name of spell being fetched
  // Dart/ray assignment for Magic Missile / Scorching Ray
  const [dartAssign,   setDartAssign]   = useState(null)
  // { spellName, totalDarts, assignments: [ enemyId | 'player' ], slotLevel }

  const [summary,      setSummary]      = useState(null)
  const [generating,   setGenerating]   = useState(false)
  const [loot,         setLoot]         = useState(null)
  const [diceRequest,  setDiceRequest]  = useState(null)
  const [dicePool,     setDicePool]     = useState([])
  const [diceResults,  setDiceResults]  = useState(null)

  const logRef     = useRef(null)
  const playerRef  = useRef(player)
  const enemiesRef = useRef(enemies)
  useEffect(() => { playerRef.current  = player  }, [player])
  useEffect(() => { enemiesRef.current = enemies }, [enemies])

  // Load real monster stats from DB
  useEffect(() => {
    async function loadMonsterStats() {
      const updated = await Promise.all(
        enemies.map(async (enemy) => {
          try {
            const dbStats = await lookupMonsterStats(enemy.name)
            if (dbStats) {
              return {
                ...enemy,
                ac: dbStats.ac, hp: dbStats.hp, maxHp: dbStats.maxHp,
                cr: dbStats.cr, xp: dbStats.xp,
                str: dbStats.str, dex: dbStats.dex, con: dbStats.con,
                int: dbStats.int, wis: dbStats.wis, cha: dbStats.cha,
                attacks: dbStats.attacks?.length ? dbStats.attacks : enemy.attacks,
                loadingStats: false, fromDatabase: true,
              }
            }
          } catch {}
          return { ...enemy, loadingStats: false }
        })
      )
      setEnemies(updated)
    }
    loadMonsterStats()
  }, []) // eslint-disable-line

  // Roll initiative
  useEffect(() => {
    const dexMod = abilityMod(character.dexterity || 10)
    const pRoll  = roll(20) + dexMod
    const order  = [
      { id: 'player', name: character.name, isPlayer: true, initiative: pRoll },
      ...initEnemies().map(e => {
        const m = abilityMod(e.dex || 10)
        return { id: e.id, name: e.name, isPlayer: false, initiative: roll(20) + m }
      }),
    ].sort((a, b) => b.initiative - a.initiative || (b.isPlayer ? 1 : -1))
    addLog('initiative', { entries: order.map(c => `${c.name}: ${c.initiative}`) })
    const first = order[0]
    if (!first.isPlayer) { setPhase(PHASES.ENEMY); setTimeout(runEnemyTurns, 700) }
    else setPhase(PHASES.PLAYER)
  }, []) // eslint-disable-line

  useEffect(() => { logRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth' }) }, [log])

  function addLog(type, data) { setLog(prev => [...prev, buildLogEntry(type, data)]) }

  // ── Targeting helpers ─────────────────────────────────────
  function toggleTarget(id) {
    if (targetMode === TARGET_MODE.AOE) return
    if (targetMode === TARGET_MODE.DART) {
      // Handled separately
      return
    }
    if (targetMode === TARGET_MODE.MULTI) {
      setSelectedTargets(prev =>
        prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
      )
    } else {
      setSelectedTargets(prev => prev[0] === id ? [] : [id])
    }
  }

  function selectSelf() {
    setTargetMode(TARGET_MODE.SELF)
    setSelectedTargets(['player'])
  }

  function selectAoE() {
    setTargetMode(TARGET_MODE.AOE)
    const liveIds = enemies.filter(e => !e.dead).map(e => e.id)
    setSelectedTargets(liveIds)
  }

  function resetTargeting() {
    setTargetMode(TARGET_MODE.SINGLE_ENEMY)
    setSelectedTargets([])
  }

  // ── Status effects helpers ────────────────────────────────
  function addStatusToEnemy(enemyId, effectId, duration) {
    setEnemies(prev => prev.map(e => {
      if (e.id !== enemyId) return e
      const existing = e.statusEffects.find(s => s.effectId === effectId)
      if (existing) {
        return { ...e, statusEffects: e.statusEffects.map(s => s.effectId === effectId ? { ...s, duration: Math.max(s.duration, duration) } : s) }
      }
      const eff = STATUS_EFFECTS[effectId]
      return { ...e, statusEffects: [...e.statusEffects, { effectId, name: eff.name, duration, icon: eff.icon, color: eff.color }] }
    }))
  }

  function addStatusToPlayer(effectId, duration) {
    const eff = STATUS_EFFECTS[effectId]
    if (!eff) return
    setPlayer(prev => {
      const existing = prev.statusEffects.find(s => s.effectId === effectId)
      if (existing) {
        return { ...prev, statusEffects: prev.statusEffects.map(s => s.effectId === effectId ? { ...s, duration: Math.max(s.duration, duration) } : s) }
      }
      return { ...prev, statusEffects: [...prev.statusEffects, { effectId, name: eff.name, duration, icon: eff.icon, color: eff.color }] }
    })
  }

  function tickStatusEffects() {
    // Tick enemy statuses
    setEnemies(prev => prev.map(e => {
      if (e.dead) return e
      let newHp = e.hp
      const logs = []
      const newEffects = []
      for (const se of e.statusEffects) {
        const result = applyStatusTick(e, se.effectId)
        if (result) {
          newHp = Math.max(0, newHp - result.damage + result.heal)
          logs.push(...result.logs)
          if (!result.removeEffect && se.duration > 1) {
            newEffects.push({ ...se, duration: se.duration - 1 })
          }
        } else {
          if (se.duration > 1) newEffects.push({ ...se, duration: se.duration - 1 })
        }
      }
      for (const l of logs) addLog(l.type, l)
      if (newHp <= 0 && !e.dead) addLog('death', { name: e.name })
      return { ...e, hp: Math.max(0, newHp), dead: newHp <= 0, statusEffects: newEffects }
    }))

    // Tick player statuses
    setPlayer(prev => {
      let newHp = prev.hp
      const newEffects = []
      for (const se of prev.statusEffects) {
        const result = applyStatusTick(prev, se.effectId)
        if (result) {
          newHp = Math.max(0, Math.min(prev.maxHp, newHp - result.damage + result.heal))
          for (const l of result.logs) addLog(l.type, l)
          if (!result.removeEffect && se.duration > 1) {
            newEffects.push({ ...se, duration: se.duration - 1 })
          }
        } else {
          if (se.duration > 1) newEffects.push({ ...se, duration: se.duration - 1 })
        }
      }
      return { ...prev, hp: newHp, statusEffects: newEffects }
    })
  }

  // ── Player weapon stats ───────────────────────────────────
  function getWeaponName() {
    const equip = (character.equipment || []).join(' ').toLowerCase()
    const ws = ['greatsword','longsword','rapier','shortsword','handaxe','dagger','greataxe','quarterstaff','mace','warhammer','spear']
    return ws.find(w => equip.includes(w)) || 'weapon'
  }
  function getPlayerDamageDice() {
    const equip = (character.equipment || []).join(' ').toLowerCase()
    if (equip.includes('greatsword'))   return '2d6'
    if (equip.includes('longsword'))    return '1d8'
    if (equip.includes('rapier'))       return '1d8'
    if (equip.includes('shortsword'))   return '1d6'
    if (equip.includes('handaxe'))      return '1d6'
    if (equip.includes('dagger'))       return '1d4'
    if (equip.includes('greataxe'))     return '1d12'
    return '1d6'
  }
  function getPlayerAttackBonus() {
    return Math.max(abilityMod(player.str||10), abilityMod(player.dex||10)) + (player.profBonus || 2)
  }
  function getSpellcastingMod(stat) {
    const m = { cha: character.charisma, int: character.intelligence, wis: character.wisdom }
    return abilityMod(m[stat] || 10)
  }
  function getSpellDC(stat) {
    return 8 + (character.proficiency_bonus || 2) + getSpellcastingMod(stat)
  }

  // ── Dice request ──────────────────────────────────────────
  function requestDice(expr, label, onResult) {
    const m     = expr.match(/(\d*)d(\d+)([+-]\d+)?/)
    const count = parseInt(m?.[1] || '1')
    const sides = parseInt(m?.[2] || '20')
    const bonus = parseInt(m?.[3] || '0')
    setDiceRequest({ expr, label, sides, count, bonus, onResult })
    setDicePool(Array.from({ length: count }, () => 0))
    setPhase(PHASES.ROLL)
  }

  function rollOneDie(idx) {
    const sides = diceRequest?.sides || 20
    setDicePool(prev => { const next = [...prev]; next[idx] = roll(sides); return next })
  }

  function rollAllDice() {
    const sides = diceRequest?.sides || 20
    setDicePool(diceRequest ? Array.from({ length: diceRequest.count }, () => roll(sides)) : [])
  }

  function confirmDiceRoll() {
    if (!diceRequest) return
    const allRolled = dicePool.every(r => r > 0)
    if (!allRolled) return
    const total    = dicePool.reduce((s, r) => s + r, 0) + (diceRequest.bonus || 0)
    const isCrit   = diceRequest.sides === 20 && dicePool[0] === 20
    const isFumble = diceRequest.sides === 20 && dicePool[0] === 1
    const callback = diceRequest.onResult
    setDiceRequest(null)
    setDicePool([])
    callback(total, dicePool, isCrit, isFumble)
  }

  // ── Apply damage to enemy ────────────────────────────────
  function applyDamageToEnemy(id, dmg) {
    setEnemies(prev => prev.map(e => {
      if (e.id !== id) return e
      const newHp = Math.max(0, e.hp - dmg)
      if (newHp <= 0 && !e.dead) addLog('death', { name: e.name })
      return { ...e, hp: newHp, dead: newHp <= 0 }
    }))
  }

  function applyHealToPlayer(amount) {
    setPlayer(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + amount) }))
  }

  // ── PLAYER ATTACK ─────────────────────────────────────────
  function handlePlayerAttack() {
    if (actionUsed || selectedTargets.length === 0) return
    const targetId = selectedTargets[0]
    const target   = enemies.find(e => e.id === targetId)
    if (!target || target.dead) return

    const atkBonus  = getPlayerAttackBonus()
    const dmgDice   = getPlayerDamageDice()
    const dmgBonus  = Math.max(abilityMod(player.str||10), abilityMod(player.dex||10))

    // Check if player has advantage from target status
    const hasAdvantage = target.statusEffects?.some(s =>
      STATUS_EFFECTS[s.effectId]?.giveAdvantageToAttackers ||
      STATUS_EFFECTS[s.effectId]?.giveAdvantageToMelee
    )
    // Check if player has disadvantage from own status
    const hasDisadvantage = player.statusEffects?.some(s =>
      STATUS_EFFECTS[s.effectId]?.attackDisadvantage
    )

    const label = hasAdvantage ? `Attack (Advantage) vs ${target.name} (AC ${target.ac})` :
                  hasDisadvantage ? `Attack (Disadvantage) vs ${target.name}` :
                  `Attack vs ${target.name} (AC ${target.ac})`

    requestDice(`1d20${atkBonus >= 0 ? '+' : ''}${atkBonus}`, label, (total, rolls, isCrit, isFumble) => {
      const hits = isCrit || (!isFumble && total >= target.ac)
      if (hits) {
        const dmgExpr = isCrit ? `${dmgDice.replace('1d','2d')}+${dmgBonus}` : `${dmgDice}+${dmgBonus}`
        requestDice(dmgExpr, `Damage${isCrit ? ' (CRITICAL!)' : ''}`, (dmgTotal, dmgRolls) => {
          addLog('attack', { actor: player.name, target: target.name, weapon: getWeaponName(), roll: rolls[0], bonus: atkBonus, total, ac: target.ac, hits: true, isCrit, damage: dmgTotal, damageRolls: dmgRolls, damageType: 'slashing' })
          applyDamageToEnemy(target.id, dmgTotal)
          setActionUsed(true); resetTargeting(); setPhase(PHASES.PLAYER)
        })
      } else {
        addLog('attack', { actor: player.name, target: target.name, weapon: getWeaponName(), roll: rolls[0], bonus: atkBonus, total, ac: target.ac, hits: false, isFumble, damage: 0, damageType: 'slashing' })
        setActionUsed(true); resetTargeting(); setPhase(PHASES.PLAYER)
      }
    })
  }

  // ── PLAYER SPELL — fetches from Open5e live ─────────────────
  async function handlePlayerSpell(spellName, slotLevel) {
    const slotLevelInt = slotLevel ? parseInt(slotLevel, 10) : null
    const cleanName    = spellName.replace(/\s*\(cantrip\)/i, '').trim()

    // Fast path: check local PLAYER_SPELLS dict first — no network call
    let spellData = null
    const localDef = getSpellDef(cleanName)
    if (localDef) {
      spellData = {
        name: cleanName, level: localDef.level || 0,
        castAs:       localDef.castAs || 'action',
        castingStat:  localDef.atkStat || 'int',
        spellType:    localDef.type === 'heal' ? 'heal' : localDef.type === 'buff' ? 'buff' : localDef.type === 'attack' ? 'attack' : 'save',
        rangeType:    localDef.range === 'aoe' ? 'aoe' : localDef.range === 'self' ? 'self' : 'single',
        isSelfRange:  localDef.range === 'self',
        isHeal:       localDef.type === 'heal',
        isDart:       localDef.type === 'multi_attack',
        isAttackRoll: localDef.type === 'attack',
        damageDice:   typeof localDef.damage === 'function' ? localDef.damage(slotLevelInt) : (localDef.damage || null),
        damageType:   localDef.dmgType || null,
        damageAtSlot: {},
        saveStat:     localDef.saveStat || null,
        saveOnHalf:   !!localDef.halfOnSave,
        healAtSlot:   localDef.healDice
          ? { [String(localDef.level||1)]: typeof localDef.healDice === 'function' ? localDef.healDice(slotLevelInt) : localDef.healDice }
          : {},
        statusEffect: localDef.applyEffect
          ? { effectId: localDef.applyEffect, duration: localDef.effectDuration || 2 }
          : null,
        targetType:   localDef.targetType || 'enemy',
        description:  localDef.description || '',
        dartCount:    localDef.rays ? () => localDef.rays : null,
        icon:         localDef.icon || '✨',
      }
    } else {
      // Fall back to Open5e live fetch
      setSpellFetching(cleanName)
      spellData = await fetchSpell(cleanName)
      setSpellFetching(null)
    }

    if (!spellData) {
      // Unknown spell: log it and consume action so turn still proceeds
      addLog('spell', {
        actor: player.name, spell: cleanName, target: '?', slotLevel: slotLevelInt,
        damage: 0, hits: false, note: 'Spell not found in Open5e — resolve with DM.',
      })
      setActionUsed(true)
      setPhase(PHASES.PLAYER)
      return
    }

    const isBonus    = spellData.castAs === 'bonus' || spellData.castAs === 'reaction'
    const isSelf     = spellIsSelfCast(spellData)
    const isAoE      = spellData.rangeType === 'aoe'
    const isDart     = spellData.isDart
    const isHeal     = spellData.isHeal
    const needsEnemy = spellNeedsEnemyTarget(spellData)

    // ── Route by spell type ──────────────────────────────────

    // 1. Dart spells (Magic Missile, Scorching Ray)
    if (isDart) {
      const totalDarts = typeof spellData.dartCount === 'function'
        ? spellData.dartCount(slotLevelInt)
        : 3
      const dmgPerDart = spellData.damageDice || '1d4+1'
      setDartAssign({
        spellName: cleanName, spellData,
        damageDice: dmgPerDart, dmgType: spellData.damageType || 'force',
        statusEffect: spellData.statusEffect,
        totalDarts, assignments: [], slotLevelInt, isBonus,
      })
      return
    }

    // 2. Self / buff spells — always auto-target player, no selection needed
    if (isSelf && !isHeal) {
      resolveBuffSpell(spellData, cleanName, slotLevelInt, isBonus)
      return
    }

    // 3. Healing spells — default to self if no enemy selected
    if (isHeal) {
      const tId = (selectedTargets[0] && selectedTargets[0] !== 'player')
        ? selectedTargets[0] : 'player'
      resolveHealSpell(spellData, cleanName, slotLevelInt, isBonus, tId)
      return
    }

    // 4. AoE — hit all living enemies
    if (isAoE) {
      resolveAoESpell(spellData, cleanName, slotLevelInt, isBonus)
      return
    }

    // 5. Single-target offensive — need an enemy selected
    if (needsEnemy && (selectedTargets.length === 0 || selectedTargets[0] === 'player')) {
      addLog('action', { actor: player.name, action: `⚠ Select an enemy target first for ${cleanName}` })
      return
    }

    const target = enemies.find(e => e.id === selectedTargets[0])
    if (!target || target.dead) return

    // Route by attack type
    if (spellData.spellType === 'save') {
      resolveSaveSpell(spellData, cleanName, slotLevelInt, isBonus, target)
    } else if (spellData.isAttackRoll || spellData.spellType === 'attack') {
      resolveAttackSpell(spellData, cleanName, slotLevelInt, isBonus, target)
    } else {
      // Fallback: if has damage dice, treat as save spell; else buff
      if (spellData.damageDice) {
        resolveSaveSpell(spellData, cleanName, slotLevelInt, isBonus, target)
      } else {
        resolveBuffSpell(spellData, cleanName, slotLevelInt, isBonus)
      }
    }
  }

  // ── Buff / protective self-cast ───────────────────────────
  function resolveBuffSpell(spellData, spellName, slotLevelInt, isBonus) {
    const eff = spellData.statusEffect
    if (eff) addStatusToPlayer(eff.effectId, eff.duration)

    const effLabel = eff ? (STATUS_EFFECTS[eff.effectId]?.name || eff.effectId) : null
    addLog('spell', {
      actor: player.name, spell: spellName, target: player.name,
      slotLevel: slotLevelInt, damage: 0, hits: true, damageType: 'buff',
      note: effLabel
        ? `${effLabel} applied for ${eff.duration} turns`
        : spellData.description?.slice(0, 80),
    })
    finishSpell(isBonus, slotLevelInt)
  }

  // ── Heal spell ────────────────────────────────────────────
  function resolveHealSpell(spellData, spellName, slotLevelInt, isBonus, targetId) {
    const healExpr = getHealDiceForSlot(spellData, slotLevelInt)
    const isPlayer = targetId === 'player'
    requestDice(healExpr, `${spellName} — Healing${isPlayer ? ' (self)' : ''}`, (healTotal, rolls) => {
      applyHealToPlayer(healTotal)
      // Apply any status effect too (e.g. Armor of Agathys also gives buff)
      if (spellData.statusEffect) addStatusToPlayer(spellData.statusEffect.effectId, spellData.statusEffect.duration)
      addLog('heal', {
        actor: player.name, spell: spellName,
        target: isPlayer ? player.name : targetId,
        slotLevel: slotLevelInt, heal: healTotal, rolls,
      })
      finishSpell(isBonus, slotLevelInt)
    })
  }

  // ── AoE save spell ────────────────────────────────────────
  function resolveAoESpell(spellData, spellName, slotLevelInt, isBonus) {
    const liveEnemies = enemies.filter(e => !e.dead)
    if (liveEnemies.length === 0) return
    const dmgExpr = getDamageDiceForSlot(spellData, slotLevelInt, character)

    requestDice(dmgExpr, `${spellName} — AoE vs ${liveEnemies.length} targets`, (total, rolls) => {
      for (const enemy of liveEnemies) {
        const dc = getSpellDC((spellData.saveStat || 'DEX').toLowerCase())
        const saveResult = spellData.saveStat
          ? resolveSave({ creature: enemy, stat: spellData.saveStat, dc })
          : { success: false, dieRoll: 0, mod: 0, total: 0 }
        const finalDmg = saveResult.success
          ? (spellData.saveOnHalf ? Math.floor(total / 2) : 0)
          : total
        addLog('spell_aoe', {
          actor: player.name, spell: spellName, target: enemy.name,
          slotLevel: slotLevelInt, damage: finalDmg,
          damageType: spellData.damageType,
          saveRoll: saveResult.total, saveDC: dc, saveSuccess: saveResult.success,
        })
        if (finalDmg > 0) applyDamageToEnemy(enemy.id, finalDmg)
        if (!saveResult.success && spellData.statusEffect) {
          addStatusToEnemy(enemy.id, spellData.statusEffect.effectId, spellData.statusEffect.duration)
        }
      }
      finishSpell(isBonus, slotLevelInt)
    })
  }

  // ── Save-based spell ──────────────────────────────────────
  function resolveSaveSpell(spellData, spellName, slotLevelInt, isBonus, target) {
    const dc = getSpellDC((spellData.saveStat || 'DEX').toLowerCase())
    const saveResult = resolveSave({ creature: target, stat: spellData.saveStat || 'DEX', dc })
    addLog('enemy_save', {
      name: target.name, stat: spellData.saveStat, dc,
      roll: saveResult.dieRoll, mod: saveResult.mod, total: saveResult.total, success: saveResult.success,
    })

    const dmgExpr = getDamageDiceForSlot(spellData, slotLevelInt, character)

    // Control-only spell (no damage)
    if (!spellData.damageDice && !dmgExpr.match(/d\d/)) {
      if (!saveResult.success && spellData.statusEffect) {
        addStatusToEnemy(target.id, spellData.statusEffect.effectId, spellData.statusEffect.duration)
        addLog('spell', {
          actor: player.name, spell: spellName, target: target.name,
          slotLevel: slotLevelInt, damage: 0, hits: true, damageType: 'control',
          note: `${STATUS_EFFECTS[spellData.statusEffect.effectId]?.name} applied`,
        })
      } else {
        addLog('spell', {
          actor: player.name, spell: spellName, target: target.name,
          slotLevel: slotLevelInt, damage: 0, hits: false, note: 'Save succeeded',
        })
      }
      finishSpell(isBonus, slotLevelInt)
      return
    }

    // Damage + optional effect
    requestDice(dmgExpr, `${spellName} damage${saveResult.success ? ' (half — save succeeded)' : ''}`, (total, rolls) => {
      const finalDmg = saveResult.success
        ? (spellData.saveOnHalf ? Math.floor(total / 2) : 0)
        : total
      addLog('spell', {
        actor: player.name, spell: spellName, target: target.name,
        slotLevel: slotLevelInt, damage: finalDmg, damageRolls: rolls,
        hits: finalDmg > 0, damageType: spellData.damageType,
      })
      if (finalDmg > 0) applyDamageToEnemy(target.id, finalDmg)
      if (!saveResult.success && spellData.statusEffect) {
        addStatusToEnemy(target.id, spellData.statusEffect.effectId, spellData.statusEffect.duration)
      }
      finishSpell(isBonus, slotLevelInt)
    })
  }

  // ── Attack roll spell ─────────────────────────────────────
  function resolveAttackSpell(spellData, spellName, slotLevelInt, isBonus, target) {
    const castStat = spellData.castingStat || 'int'
    const atkMod   = getSpellcastingMod(castStat) + (character.proficiency_bonus || 2)
    requestDice(
      `1d20${atkMod >= 0 ? '+' : ''}${atkMod}`,
      `${spellData.icon || '✨'} ${spellName} attack vs ${target.name} (AC ${target.ac})`,
      (total, rolls, isCrit) => {
        const hits = isCrit || total >= target.ac
        if (!hits) {
          addLog('spell', {
            actor: player.name, spell: spellName, target: target.name,
            slotLevel: slotLevelInt, damage: 0, hits: false, damageType: spellData.damageType,
          })
          finishSpell(isBonus, slotLevelInt)
          return
        }
        let dmgExpr = getDamageDiceForSlot(spellData, slotLevelInt, character)
        // Double dice on crit
        if (isCrit) dmgExpr = dmgExpr.replace(/(\d+)d/g, (_, n) => `${parseInt(n)*2}d`)
        requestDice(dmgExpr, `${spellName} damage${isCrit ? ' (CRITICAL!)' : ''}`, (dmgTotal, dmgRolls) => {
          addLog('spell', {
            actor: player.name, spell: spellName, target: target.name,
            slotLevel: slotLevelInt, damage: dmgTotal, damageRolls: dmgRolls,
            hits: true, isCrit, damageType: spellData.damageType,
          })
          applyDamageToEnemy(target.id, dmgTotal)
          if (spellData.statusEffect) {
            addStatusToEnemy(target.id, spellData.statusEffect.effectId, spellData.statusEffect.duration)
          }
          // Vampiric spells: heal player for half damage
          if (/vampiric|life drain|drain/i.test(spellName)) {
            const heal = Math.floor(dmgTotal / 2)
            applyHealToPlayer(heal)
            addLog('heal', { actor: player.name, spell: spellName, target: player.name, heal, note: 'life drain' })
          }
          finishSpell(isBonus, slotLevelInt)
        })
      }
    )
  }

  // ── Dart assignment (Magic Missile, Scorching Ray) ────────
  function assignDart(targetId) {
    if (!dartAssign) return
    setDartAssign(prev => {
      if (prev.assignments.length >= prev.totalDarts) return prev
      return { ...prev, assignments: [...prev.assignments, targetId] }
    })
  }

  function removeDart(idx) {
    setDartAssign(prev => ({ ...prev, assignments: prev.assignments.filter((_, i) => i !== idx) }))
  }

  function confirmDartAssignment() {
    if (!dartAssign || dartAssign.assignments.length !== dartAssign.totalDarts) return
    const { spellName, damageDice, dmgType, statusEffect, assignments, slotLevelInt, isBonus, totalDarts } = dartAssign
    setDartAssign(null)

    const dmgPerDart = damageDice || '1d4+1'
    const targetGroups = {}
    for (const tId of assignments) targetGroups[tId] = (targetGroups[tId] || 0) + 1

    const allRolls = Array.from({ length: totalDarts }, () => rollDice(dmgPerDart))
    let dartIdx = 0
    for (const [tId, count] of Object.entries(targetGroups)) {
      let totalDmg = 0
      const dartRolls = []
      for (let i = 0; i < count; i++) {
        totalDmg += allRolls[dartIdx].total
        dartRolls.push(...allRolls[dartIdx].rolls)
        dartIdx++
      }
      const target = enemies.find(e => e.id === tId)
      addLog('spell', {
        actor: player.name, spell: spellName, target: target?.name || tId,
        slotLevel: slotLevelInt, damage: totalDmg, damageRolls: dartRolls,
        hits: true, damageType: dmgType || 'force',
        note: `${count} dart${count > 1 ? 's' : ''}`,
      })
      applyDamageToEnemy(tId, totalDmg)
      if (statusEffect) addStatusToEnemy(tId, statusEffect.effectId, statusEffect.duration)
    }
    finishSpell(isBonus, slotLevelInt)
    resetTargeting()
  }

  // ── Shared turn finisher ──────────────────────────────────
  function finishSpell(isBonus, slotLevel) {
    if (isBonus) setBonusUsed(true); else setActionUsed(true)
    spendSlot(slotLevel)
    resetTargeting()
    setPhase(PHASES.PLAYER)
  }

  function spendSlot(level) {
    if (!level) return
    setPlayer(prev => ({ ...prev, spellSlotsUsed: { ...prev.spellSlotsUsed, [level]: (prev.spellSlotsUsed[level]||0)+1 } }))
  }

  // ── ENEMY TURNS ───────────────────────────────────────────
  const runEnemyTurns = useCallback(async () => {
    const currentPlayer = playerRef.current
    const liveEnemies   = enemiesRef.current.filter(e => !e.dead)
    if (liveEnemies.length === 0) return

    let updatedPlayerHP = currentPlayer.hp

    for (const enemy of liveEnemies) {
      await new Promise(r => setTimeout(r, 900))

      // Check if stunned/frozen
      const isStunned = enemy.statusEffects?.some(s => STATUS_EFFECTS[s.effectId]?.skipTurn)
      if (isStunned) {
        addLog('action', { actor: enemy.name, action: `${enemy.name} is stunned and loses their turn!` })
        continue
      }

      // Decide: attack or cast spell
      const canCastSpell = enemy.spellList?.length > 0 && (enemy.spellCooldown || 0) <= 0
      const shouldCastSpell = canCastSpell && (
        Math.random() < 0.4 || // 40% base chance
        (enemy.hp / enemy.maxHp < 0.5 && enemy.spellList.some(s => ENEMY_SPELLS[s]?.type === 'heal')) // heal if low HP
      )

      if (shouldCastSpell) {
        // Pick spell: prioritize healing if low HP, else offensive
        let chosenSpellKey = null
        if (enemy.hp / enemy.maxHp < 0.4) {
          chosenSpellKey = enemy.spellList.find(s => ENEMY_SPELLS[s]?.type === 'heal')
        }
        if (!chosenSpellKey) {
          const offensive = enemy.spellList.filter(s => {
            const sp = ENEMY_SPELLS[s]
            return sp && sp.type !== 'heal' && sp.type !== 'buff'
          })
          chosenSpellKey = offensive[Math.floor(Math.random() * offensive.length)]
        }
        if (!chosenSpellKey) chosenSpellKey = enemy.spellList[Math.floor(Math.random() * enemy.spellList.length)]

        const spell = ENEMY_SPELLS[chosenSpellKey]
        if (spell) {
          const hpAfterSpell = await resolveEnemySpell(enemy, spell, currentPlayer, updatedPlayerHP)
          if (hpAfterSpell !== undefined) updatedPlayerHP = hpAfterSpell
          setEnemies(prev => prev.map(e => e.id === enemy.id ? { ...e, spellCooldown: 2 } : e))
          if (updatedPlayerHP <= 0) { setPhase(PHASES.DEFEAT); return }
          continue
        }
      }

      // Reduce spell cooldown
      if ((enemy.spellCooldown || 0) > 0) {
        setEnemies(prev => prev.map(e => e.id === enemy.id ? { ...e, spellCooldown: e.spellCooldown - 1 } : e))
      }

      // Regular attack
      const attack = enemy.attacks?.[0]
      if (!attack) continue

      const alliesNear  = liveEnemies.filter(e => e.id !== enemy.id).length > 0
      const packTactics = alliesNear && (enemy.name.toLowerCase().includes('wolf') || enemy.name.toLowerCase().includes('rat'))
      const d1 = roll(20), d2 = roll(20)
      const dieRoll = packTactics ? Math.max(d1, d2) : d1
      const total   = dieRoll + attack.bonus
      const isCrit  = dieRoll === 20
      const isFumble = dieRoll === 1
      const hits    = isCrit || (!isFumble && total >= currentPlayer.ac)

      let damage = 0, damageRolls = []
      if (hits) {
        const dmg = rollDice(attack.damage)
        damageRolls = dmg.rolls; damage = dmg.total
        if (isCrit) {
          const extra = rollMultiple(damageRolls.length, parseInt(attack.damage.split('d')[1])||6)
          damage += extra.reduce((s,r) => s+r, 0); damageRolls = [...damageRolls, ...extra]
        }
        // Check if enemy is weakened
        const isWeakened = enemy.statusEffects?.some(s => STATUS_EFFECTS[s.effectId]?.halfDamage)
        if (isWeakened) damage = Math.floor(damage / 2)
      }

      const flavor = enemy.flavor?.[Math.floor(Math.random()*enemy.flavor.length)] || 'attacks'
      addLog('enemy_attack', { actor: enemy.name, target: currentPlayer.name, weapon: attack.name, flavor, roll: dieRoll, bonus: attack.bonus, total, ac: currentPlayer.ac, hits, isCrit, isFumble, damage, damageRolls, damageType: attack.type, packTactics })

      if (hits && damage > 0) {
        updatedPlayerHP = Math.max(0, updatedPlayerHP - damage)
        setPlayer(prev => ({ ...prev, hp: updatedPlayerHP }))

        // Apply attack special effect
        if (attack.special) {
          const saveRes = resolveSave({ creature: currentPlayer, stat: attack.special.stat, dc: attack.special.dc })
          addLog('enemy_save', { name: currentPlayer.name, stat: attack.special.stat, dc: attack.special.dc, roll: saveRes.dieRoll, mod: saveRes.mod, total: saveRes.total, success: saveRes.success })
          if (!saveRes.success && attack.special.effectId) {
            addStatusToPlayer(attack.special.effectId, attack.special.duration || 2)
            addLog('status_applied', { target: currentPlayer.name, effect: attack.special.desc, effectId: attack.special.effectId })
          }
        }

        if (updatedPlayerHP <= 0) {
          addLog('death', { name: currentPlayer.name, isPlayer: true })
          await new Promise(r => setTimeout(r, 500))
          setPhase(PHASES.DEFEAT)
          return
        }
      }
    }

    await new Promise(r => setTimeout(r, 400))
    // Tick statuses at end of round
    tickStatusEffects()
    addLog('turn_marker', { round })
    setRound(r => r + 1)
    setPhase(PHASES.PLAYER)
    setActionUsed(false)
    setBonusUsed(false)
  }, [enemies, round]) // eslint-disable-line

  async function resolveEnemySpell(enemy, spell, currentPlayer, updatedHP) {
    addLog('enemy_spell_cast', { actor: enemy.name, spell: spell.name, icon: spell.icon })
    await new Promise(r => setTimeout(r, 500))

    if (spell.type === 'heal') {
      const healResult = rollDice(spell.healDice || '1d4+2')
      const newHp = Math.min(enemy.maxHp, enemy.hp + healResult.total)
      setEnemies(prev => prev.map(e => e.id === enemy.id ? { ...e, hp: newHp } : e))
      addLog('enemy_heal', { actor: enemy.name, spell: spell.name, heal: healResult.total, newHp })
      return
    }
    if (spell.type === 'buff') {
      setEnemies(prev => prev.map(e => {
        if (e.id !== enemy.id) return e
        const eff = STATUS_EFFECTS[spell.applyEffect]
        return { ...e, statusEffects: [...(e.statusEffects || []), { effectId: spell.applyEffect, name: eff.name, duration: spell.effectDuration || 2, icon: eff.icon, color: eff.color }] }
      }))
      addLog('action', { actor: enemy.name, action: `${enemy.name} casts ${spell.name}! Gains ${spell.applyEffect}` })
      return
    }

    // AoE vs player
    if (spell.range === 'aoe' || spell.type === 'save') {
      const dc = spell.dc || 13
      const saveResult = resolveSave({ creature: currentPlayer, stat: spell.saveStat || 'CON', dc })
      addLog('enemy_save', { name: currentPlayer.name, stat: spell.saveStat, dc, roll: saveResult.dieRoll, mod: saveResult.mod, total: saveResult.total, success: saveResult.success })

      if (!saveResult.success) {
        const dmg = rollDice(spell.damage || '1d6')
        const newHP = Math.max(0, updatedHP - dmg.total)
        setPlayer(prev => ({ ...prev, hp: newHP }))
        addLog('enemy_spell_hit', { actor: enemy.name, spell: spell.name, target: currentPlayer.name, damage: dmg.total, dmgType: spell.dmgType, saveSuccess: false })
        if (spell.applyEffect) addStatusToPlayer(spell.applyEffect, spell.effectDuration || 2)
        if (newHP <= 0) { addLog('death', { name: currentPlayer.name, isPlayer: true }); setPhase(PHASES.DEFEAT) }
        return newHP  // ← propagate to runEnemyTurns
      } else {
        addLog('enemy_spell_hit', { actor: enemy.name, spell: spell.name, target: currentPlayer.name, damage: 0, dmgType: spell.dmgType, saveSuccess: true })
      }
    } else if (spell.type === 'attack') {
      const atkBonus = spell.attackBonus || 4
      const d20 = roll(20)
      const total = d20 + atkBonus
      const hits = d20 === 20 || total >= currentPlayer.ac
      if (hits) {
        const dmg = rollDice(spell.damage || '1d6')
        const newHP = Math.max(0, updatedHP - dmg.total)
        setPlayer(prev => ({ ...prev, hp: newHP }))
        addLog('enemy_spell_hit', { actor: enemy.name, spell: spell.name, target: currentPlayer.name, damage: dmg.total, dmgType: spell.dmgType, roll: d20, total, ac: currentPlayer.ac, hits: true })
        if (spell.applyEffect) addStatusToPlayer(spell.applyEffect, spell.effectDuration || 2)
        if (newHP <= 0) { addLog('death', { name: currentPlayer.name, isPlayer: true }); setPhase(PHASES.DEFEAT) }
        return newHP  // ← propagate to runEnemyTurns
      } else {
        addLog('enemy_spell_hit', { actor: enemy.name, spell: spell.name, target: currentPlayer.name, damage: 0, dmgType: spell.dmgType, roll: d20, total, ac: currentPlayer.ac, hits: false })
      }
    }
  }

  function endPlayerTurn() {
    const live = enemies.filter(e => !e.dead)
    if (live.length === 0) { triggerVictory(); return }
    addLog('turn_marker', { round, whose: player.name })
    setPhase(PHASES.ENEMY)
    setTimeout(runEnemyTurns, 400)
  }

  function triggerVictory() {
    setPhase(PHASES.END)
    const dead = enemies.filter(e => e.dead)
    const xp   = dead.reduce((s,e) => s+(e.xp||50), 0)
    let totalGold = 0
    const lootItems = []
    for (const e of dead) {
      const drop = rollLoot(e.name, e.cr)
      totalGold += drop.gold
      if (drop.item) lootItems.push(drop.item)
    }
    setLoot({ totalGold, items: lootItems })
    addLog('combat_end', { victory: true, xpGained: xp, gold: totalGold })
    generateSummary(true, xp)
  }

  useEffect(() => {
    const live = enemies.filter(e => !e.dead)
    if (live.length === 0 && [PHASES.PLAYER, PHASES.ENEMY].includes(phase) && log.length > 2) triggerVictory()
  }, [enemies]) // eslint-disable-line

  async function generateSummary(victory, xpGained) {
    setGenerating(true)
    const logText = log.map(e => {
      if (e.type === 'attack' || e.type === 'enemy_attack') return `${e.actor} ${e.hits ? `hit ${e.target} for ${e.damage}` : `missed ${e.target}`}`
      if (e.type === 'spell') return `${e.actor} cast ${e.spell} on ${e.target}: ${e.damage > 0 ? `${e.damage} damage` : 'no damage'}`
      if (e.type === 'heal') return `${e.actor} healed for ${e.heal} HP`
      if (e.type === 'death') return `${e.name} ${e.isPlayer ? 'fell' : 'slain'}`
      return ''
    }).filter(Boolean).join('\n')
    try {
      const prompt = `Write a vivid 2-paragraph D&D battle narrative. Third person, past tense.
Hero: ${character.name}, Level ${character.level} ${character.race} ${character.class}
Enemies: ${enemies.map(e => e.name).join(', ')}
Result: ${victory ? 'Hero victorious' : 'Hero defeated'}
Events:\n${logText}\nWrite only the narrative.`
      const text = await callAI([{ role:'user', content: prompt }], 400)
      setSummary({ narrative: text.trim(), xpGained: xpGained||0, victory })
    } catch {
      setSummary({ narrative: victory ? 'Victory!' : 'Defeated.', xpGained: xpGained||0, victory })
    }
    setGenerating(false)
  }

  // ── Spell slots ───────────────────────────────────────────
  const spellSlots     = character.spell_slots || {}
  const availableSlots = Object.entries(spellSlots)
    .filter(([lvl, d]) => (d.max - d.used - (player.spellSlotsUsed[lvl]||0)) > 0)
    .reduce((acc, [lvl, d]) => { acc[lvl] = d.max - d.used - (player.spellSlotsUsed[lvl]||0); return acc }, {})
  const knownSpells    = (character.spells||[]).map(s => s.replace(/\s*\(cantrip\)/i,'').trim())
  const isPlayerTurn   = phase === PHASES.PLAYER
  const liveEnemies    = enemies.filter(e => !e.dead)

  // ── LOG RENDERER ──────────────────────────────────────────
  function renderLog(entry) {
    switch (entry.type) {
      case 'initiative': return <div className="log-initiative">⚔️ Initiative: {entry.entries.join(' · ')}</div>
      case 'attack': case 'enemy_attack': return (
        <div className={`log-entry ${entry.type==='enemy_attack'?'log-enemy':'log-player'}`}>
          <span className="log-actor">{entry.actor}</span>
          <span className="log-verb">{entry.flavor||`attacks ${entry.target}`}</span>
          {entry.packTactics && <span className="log-tag">Pack Tactics</span>}
          {entry.isCrit && <span className="log-tag crit">CRIT!</span>}
          {entry.isFumble && <span className="log-tag fumble">FUMBLE</span>}
          <span className="log-roll-line">
            <span className={`log-die ${entry.isCrit?'crit':entry.isFumble?'fumble':''}`}>{entry.roll}</span>
            <span className="log-math">+{entry.bonus}={entry.total} vs AC {entry.ac}</span>
            <span className={`log-result ${entry.hits?'hit':'miss'}`}>{entry.hits?`HIT — ${entry.damage} ${entry.damageType}`:'MISS'}</span>
          </span>
        </div>
      )
      case 'spell': return (
        <div className="log-entry log-player log-spell">
          <span className="log-actor">{entry.actor}</span>
          <span className="log-verb">casts {entry.spell}</span>
          {entry.slotLevel && <span className="log-tag">Lv{entry.slotLevel}</span>}
          {entry.note && <span className="log-tag">{entry.note}</span>}
          <span className="log-target">→ {entry.target}</span>
          <span className={`log-result ${entry.hits?'hit':'miss'}`}>
            {entry.damage > 0 ? `${entry.damage} ${entry.damageType}` : entry.note || 'NO DAMAGE'}
          </span>
        </div>
      )
      case 'spell_aoe': return (
        <div className="log-entry log-player log-spell">
          <span className="log-actor">{entry.actor}</span>
          <span className="log-verb">AoE → {entry.target}</span>
          {entry.saveRoll && <span className="log-math">DC {entry.saveDC} save: {entry.saveRoll} {entry.saveSuccess?'✓ saved':'✗ failed'}</span>}
          <span className={`log-result ${entry.damage>0?'hit':'miss'}`}>{entry.damage > 0 ? `${entry.damage} ${entry.damageType}` : 'SAVED'}</span>
        </div>
      )
      case 'heal': return (
        <div className="log-entry log-heal">
          <span className="log-actor">{entry.actor}</span>
          <span className="log-verb">✨ heals {entry.target}</span>
          {entry.note && <span className="log-tag">{entry.note}</span>}
          <span className="log-result heal">+{entry.heal} HP</span>
        </div>
      )
      case 'enemy_spell_cast': return (
        <div className="log-entry log-enemy">
          <span className="log-actor">{entry.actor}</span>
          <span className="log-verb">{entry.icon} casts {entry.spell}!</span>
        </div>
      )
      case 'enemy_spell_hit': return (
        <div className="log-entry log-enemy log-spell">
          <span className="log-actor">{entry.actor}</span>
          <span className="log-verb">→ {entry.target}</span>
          {entry.roll && <span className="log-math">Roll {entry.roll}={entry.total} vs AC {entry.ac}</span>}
          <span className={`log-result ${entry.hits||entry.damage>0?'hit':'miss'}`}>
            {entry.damage>0?`${entry.damage} ${entry.dmgType}`:'MISS / SAVED'}
          </span>
        </div>
      )
      case 'enemy_heal': return (
        <div className="log-entry log-enemy">
          <span className="log-actor">{entry.actor}</span>
          <span className="log-verb">💚 heals itself for {entry.heal} HP ({entry.newHp} HP)</span>
        </div>
      )
      case 'status_tick': return (
        <div className="log-entry log-status">
          <span className="log-actor">{entry.creature}</span>
          <span className="log-verb">{entry.icon} {entry.effect} — {entry.damage} {entry.dmgType} damage</span>
        </div>
      )
      case 'status_heal': return (
        <div className="log-entry log-heal">
          <span className="log-actor">{entry.creature}</span>
          <span className="log-verb">{entry.icon} {entry.effect} — +{entry.heal} HP</span>
        </div>
      )
      case 'status_save': return (
        <div className="log-save">{entry.creature} {entry.stat} save: {entry.roll} vs DC {entry.dc} — {entry.success?'✓ effect ends':'✗ effect continues'}</div>
      )
      case 'status_applied': return (
        <div className="log-save">⚠ {entry.target} is now {entry.effect}</div>
      )
      case 'enemy_save': return (
        <div className="log-save">{entry.name} {entry.stat} save: {entry.total} (d20={entry.roll}{entry.mod>=0?'+':''}{entry.mod}) vs DC {entry.dc} — {entry.success?'✓ PASS':'✗ FAIL'}</div>
      )
      case 'death': return (
        <div className={`log-entry ${entry.isPlayer?'log-death-player':'log-death'}`}>
          ☠️ <strong>{entry.name}</strong> {entry.isPlayer?'falls unconscious!':'slain!'}
        </div>
      )
      case 'turn_marker': return <div className="log-divider">── Round {entry.round} End ──</div>
      case 'combat_end': return <div className="log-entry log-end">{entry.victory?`⚔️ Victory! +${entry.xpGained} XP`:''}{entry.gold>0?` · +${entry.gold} gp`:''}</div>
      case 'action': return <div className="log-entry log-player"><span className="log-actor">{entry.actor}</span><span className="log-verb">{entry.action}</span></div>
      default: return null
    }
  }

  // ── SCREENS ───────────────────────────────────────────────

  // Defeat
  if (phase === PHASES.DEFEAT) {
    return (
      <div className="cs-defeat-screen">
        <div className="cs-defeat-inner">
          <div className="cs-defeat-icon">💀</div>
          <h2 className="cs-defeat-title">You have fallen…</h2>
          <p className="cs-defeat-sub">{character.name} lies unconscious.</p>
          <div className="cs-defeat-choices">
            <button className="cs-defeat-btn cs-replay-btn" onClick={() => {
              setPlayer({ ...statBlock(character), conditions: [], spellSlotsUsed: {} })
              setEnemies(initEnemies())
              setPhase(PHASES.PLAYER); setRound(1); setLog([])
              setActionUsed(false); setBonusUsed(false); resetTargeting()
              setDiceRequest(null)
            }}>🔄 Replay Fight</button>
            <button className="cs-defeat-btn cs-bear-btn" onClick={() =>
              onCombatEnd({ victory: false, narrative: `${character.name} was overwhelmed.`, playerHP: 1, xpGained: 0 })
            }>⚔️ Bear the Consequences</button>
          </div>
        </div>
      </div>
    )
  }

  // Victory
  if (phase === PHASES.END && summary) {
    return (
      <div className="cs-summary">
        <div className="cs-summary-inner">
          <div className="cs-summary-icon">⚔️</div>
          <h2 className="cs-summary-title">Victory</h2>
          {summary.xpGained > 0 && <div className="cs-summary-xp">+{summary.xpGained} XP earned</div>}
          {loot && (loot.totalGold > 0 || loot.items.length > 0) && (
            <div className="cs-summary-loot">
              <div className="cs-loot-title">⚙ Loot</div>
              {loot.totalGold > 0 && <div className="cs-loot-row">⚙ {loot.totalGold} gp</div>}
              {loot.items.map((item, i) => <div key={i} className="cs-loot-row">📦 {item}</div>)}
            </div>
          )}
          {generating ? <div className="cs-summary-loading"><span/><span/><span/></div>
            : <div className="cs-summary-text">{summary.narrative.split('\n\n').map((p,i)=><p key={i}>{p}</p>)}</div>}
          <button className="cs-summary-btn" onClick={() => onCombatEnd({ victory: true, xpGained: summary.xpGained, narrative: summary.narrative, playerHP: player.hp, loot })} disabled={generating}>
            Continue Story →
          </button>
        </div>
      </div>
    )
  }

  // Dice Roll Panel
  if (phase === PHASES.ROLL && diceRequest) {
    const allRolled = dicePool.every(r => r > 0)
    const total     = allRolled ? dicePool.reduce((s,r) => s+r, 0) + (diceRequest.bonus||0) : null
    const isCrit    = allRolled && diceRequest.sides === 20 && dicePool[0] === 20
    const isFumble  = allRolled && diceRequest.sides === 20 && dicePool[0] === 1
    return (
      <div className="cs-dice-screen">
        <div className="cs-dice-panel">
          <div className="cs-dice-title">{diceRequest.label}</div>
          <div className="cs-dice-expr">{diceRequest.expr}</div>
          <div className="cs-dice-pool">
            {dicePool.map((val, i) => (
              <button key={i} className={`cs-die-btn ${val>0?'rolled':''} ${val===diceRequest.sides&&diceRequest.sides===20?'max':''} ${val===1&&diceRequest.sides===20?'min':''}`}
                onClick={() => rollOneDie(i)} disabled={val>0}>
                {val > 0 ? val : <span className="cs-die-icon">d{diceRequest.sides}</span>}
              </button>
            ))}
          </div>
          {diceRequest.bonus !== 0 && allRolled && (
            <div className="cs-dice-bonus">
              <span className="cs-dice-sum">{dicePool.reduce((s,r)=>s+r,0)}</span>
              <span className="cs-dice-mod-label">{diceRequest.bonus>=0?`+${diceRequest.bonus}`:diceRequest.bonus}</span>
              <span className="cs-dice-equals">= <strong>{total}</strong></span>
            </div>
          )}
          {allRolled && (
            <div className="cs-dice-result">
              {isCrit && <div className="cs-dice-crit">⭐ CRITICAL HIT!</div>}
              {isFumble && <div className="cs-dice-fumble">💀 Critical Fumble!</div>}
              <div className="cs-dice-total">{total}</div>
            </div>
          )}
          <div className="cs-dice-actions">
            <button className="cs-roll-all-btn" onClick={rollAllDice} disabled={allRolled}>🎲 Roll All</button>
            <button className="cs-confirm-btn" onClick={confirmDiceRoll} disabled={!allRolled}>✓ Confirm</button>
          </div>
        </div>
      </div>
    )
  }

  // ── DART ASSIGNMENT SCREEN ────────────────────────────────
  if (dartAssign) {
    const assigned = dartAssign.assignments.length
    const remaining = dartAssign.totalDarts - assigned
    return (
      <div className="cs-root">
        <div className="cs-dart-screen">
          <div className="cs-dart-panel">
            <div className="cs-dart-title">
              {dartAssign.spellName}
              {dartAssign.spellDef?.icon && ` ${dartAssign.spellDef.icon}`}
            </div>
            <div className="cs-dart-subtitle">
              Assign {dartAssign.totalDarts} dart{dartAssign.totalDarts>1?'s':''} to targets
            </div>
            <div className="cs-dart-progress">
              {Array.from({length: dartAssign.totalDarts}).map((_, i) => (
                <div key={i} className={`cs-dart-pip ${i < assigned ? 'assigned' : 'empty'}`}>
                  {i < assigned ? '✦' : '○'}
                </div>
              ))}
            </div>
            <div className="cs-dart-remaining">{remaining} dart{remaining!==1?'s':''} remaining</div>

            <div className="cs-dart-targets">
              {enemies.filter(e => !e.dead).map(enemy => (
                <button key={enemy.id} className="cs-dart-target-btn"
                  onClick={() => remaining > 0 && assignDart(enemy.id)}
                  disabled={remaining === 0}>
                  <div className="cs-dart-target-name">{enemy.name}</div>
                  <div className="cs-dart-target-hp">{enemy.hp}/{enemy.maxHp} HP</div>
                  <div className="cs-dart-target-count">
                    {dartAssign.assignments.filter(t => t === enemy.id).length > 0 &&
                      <span className="cs-dart-count-badge">
                        {dartAssign.assignments.filter(t => t === enemy.id).length}✦
                      </span>
                    }
                  </div>
                </button>
              ))}
            </div>

            {assigned > 0 && (
              <div className="cs-dart-assignment-list">
                <div className="cs-dart-list-title">Assigned:</div>
                {dartAssign.assignments.map((tId, i) => {
                  const t = enemies.find(e => e.id === tId)
                  return (
                    <div key={i} className="cs-dart-assignment-row">
                      <span>Dart {i+1} → {t?.name}</span>
                      <button className="cs-dart-remove" onClick={() => removeDart(i)}>✕</button>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="cs-dart-actions">
              <button className="cs-cancel-btn" onClick={() => setDartAssign(null)}>Cancel</button>
              <button className="cs-confirm-btn" onClick={confirmDartAssignment}
                disabled={assigned !== dartAssign.totalDarts}>
                🎯 Fire! ({dartAssign.totalDarts} darts)
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── MAIN COMBAT UI ────────────────────────────────────────
  return (
    <div className="cs-root">
      {/* Left: Log */}
      <div className="cs-log-panel">
        <div className="cs-log-header">
          <span className="cs-log-title">Combat Log</span>
          <span className="cs-round-badge">Round {round}</span>
        </div>
        <div className="cs-log" ref={logRef}>
          {log.map(e => <div key={e.id}>{renderLog(e)}</div>)}
          {phase === PHASES.ENEMY && <div className="cs-enemy-acting">⚔ Enemy acting…</div>}
        </div>
      </div>

      {/* Center: Battlefield */}
      <div className="cs-battlefield">
        <div className={`cs-turn-banner ${isPlayerTurn?'player-turn':'enemy-turn'}`}>
          {isPlayerTurn ? '⚔ YOUR TURN' : '⏳ ENEMY TURN'}
        </div>

        {/* Enemies */}
        <div className="cs-enemies">
          {enemies.map(enemy => {
            const isSelected = selectedTargets.includes(enemy.id)
            return (
              <button key={enemy.id}
                className={`cs-creature cs-enemy-card ${isSelected?'selected':''} ${enemy.dead?'dead':''} ${!isPlayerTurn?'disabled':''}`}
                onClick={() => isPlayerTurn && !enemy.dead && toggleTarget(enemy.id)}
                disabled={!isPlayerTurn || enemy.dead}>
                <div className="cs-creature-name">{enemy.dead?'☠️ ':isSelected?'🎯 ':''}{enemy.name}</div>
                <div className="cs-hp-bar-wrap">
                  <div className="cs-hp-bar" style={{ width:`${Math.max(0,Math.round((enemy.hp/enemy.maxHp)*100))}%`, background: enemy.hp/enemy.maxHp>.5?'#4ecb71':enemy.hp/enemy.maxHp>.25?'#e8b84a':'#e05050' }}/>
                </div>
                <div className="cs-creature-stats">
                  <span className="cs-stat-pill hp">{enemy.dead?0:enemy.hp}/{enemy.maxHp} HP</span>
                  <span className="cs-stat-pill ac">AC {enemy.ac}</span>
                  <span className="cs-stat-pill cr">CR {enemy.cr}</span>
                </div>
                {/* Status effects */}
                {!enemy.dead && enemy.statusEffects?.length > 0 && (
                  <div className="cs-status-effects">
                    {enemy.statusEffects.map((se, i) => (
                      <span key={i} className="cs-status-badge" style={{ borderColor: se.color, color: se.color }} title={`${se.name} (${se.duration} turns)`}>
                        {se.icon} {se.name} <span className="cs-status-dur">{se.duration}</span>
                      </span>
                    ))}
                  </div>
                )}
                {/* Enemy spell list hint */}
                {!enemy.dead && enemy.spellList?.length > 0 && (
                  <div className="cs-enemy-spells">
                    {enemy.spellList.map(s => ENEMY_SPELLS[s]).filter(Boolean).slice(0,2).map((sp,i) => (
                      <span key={i} className="cs-enemy-spell-tag">{sp.icon} {sp.name}</span>
                    ))}
                  </div>
                )}
                {!enemy.dead && (
                  <div className="cs-creature-attacks">
                    {enemy.attacks?.map((a,i)=><div key={i} className="cs-atk-pill">{a.name}: +{a.bonus} / {a.damage}</div>)}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <div className="cs-vs">VS</div>

        {/* Player */}
        <div className="cs-player-card">
          <div className="cs-creature-name">{player.name}</div>
          <div className="cs-hp-bar-wrap">
            <div className="cs-hp-bar" style={{ width:`${Math.max(0,Math.round((player.hp/player.maxHp)*100))}%`, background: player.hp/player.maxHp>.5?'#4ecb71':player.hp/player.maxHp>.25?'#e8b84a':'#e05050' }}/>
          </div>
          <div className="cs-creature-stats">
            <span className="cs-stat-pill hp">{player.hp}/{player.maxHp} HP</span>
            <span className="cs-stat-pill ac">AC {player.ac}</span>
            <span className="cs-stat-pill">Lv {character.level}</span>
          </div>
          {/* Player status effects */}
          {player.statusEffects?.length > 0 && (
            <div className="cs-status-effects">
              {player.statusEffects.map((se, i) => (
                <span key={i} className="cs-status-badge" style={{ borderColor: se.color, color: se.color }}>
                  {se.icon} {se.name} <span className="cs-status-dur">{se.duration}</span>
                </span>
              ))}
            </div>
          )}
          <div className="cs-economy">
            <div className={`cs-pip action ${actionUsed?'used':''}`}>A</div>
            <div className={`cs-pip bonus ${bonusUsed?'used':''}`}>B</div>
          </div>
        </div>

        {/* Targeting mode buttons */}
        {isPlayerTurn && (
          <div className="cs-targeting-bar">
            <span className="cs-targeting-label">Target:</span>
            <button className={`cs-target-mode-btn ${targetMode===TARGET_MODE.SINGLE_ENEMY?'active':''}`}
              onClick={() => { setTargetMode(TARGET_MODE.SINGLE_ENEMY); setSelectedTargets([]) }}>
              🎯 Single
            </button>
            <button className={`cs-target-mode-btn ${targetMode===TARGET_MODE.MULTI?'active':''}`}
              onClick={() => { setTargetMode(TARGET_MODE.MULTI); setSelectedTargets([]) }}>
              🎯🎯 Multi
            </button>
            <button className={`cs-target-mode-btn ${targetMode===TARGET_MODE.AOE?'active':''}`}
              onClick={selectAoE}>
              💥 AoE
            </button>
            <button className={`cs-target-mode-btn ${selectedTargets[0]==='player'?'active':''}`}
              onClick={selectSelf}>
              🧍 Self
            </button>
            {selectedTargets.length > 0 && (
              <button className="cs-target-clear-btn" onClick={resetTargeting}>✕ Clear</button>
            )}
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="cs-action-panel">
        <div className="cs-action-header">
          {selectedTargets.length === 0
            ? <span className="cs-target-hint">{isPlayerTurn?'Select a target above':'Enemies acting…'}</span>
            : selectedTargets[0] === 'player'
              ? <span className="cs-target-label" style={{color:'#a0c8ff'}}>🧍 Self-target</span>
              : selectedTargets.length > 1
                ? <span className="cs-target-label" style={{color:'#e8b84a'}}>🎯 {selectedTargets.length} targets</span>
                : <span className="cs-target-label">🎯 {enemies.find(e=>e.id===selectedTargets[0])?.name || targetMode}</span>
          }
        </div>

        <div className="cs-tabs">
          {['actions','spells','bonus'].map(tab => (
            <button key={tab} className={`cs-tab ${activeTab===tab?'active':''}`} onClick={() => setActiveTab(tab)}>
              {tab==='actions'?'⚔️ Actions':tab==='spells'?'✨ Spells':'⚡ Bonus'}
            </button>
          ))}
        </div>

        <div className="cs-action-body">
          {!isPlayerTurn && <div className="cs-waiting">Enemies are acting…</div>}

          {/* ACTIONS TAB */}
          {isPlayerTurn && activeTab==='actions' && (
            <div className="cs-action-list">
              <button className={`cs-action-btn primary ${(!selectedTargets.length || selectedTargets[0]==='player' || actionUsed)?'disabled':''}`}
                onClick={handlePlayerAttack}
                disabled={!selectedTargets.length || selectedTargets[0]==='player' || actionUsed}>
                <span className="cs-ab-icon">⚔️</span>
                <span className="cs-ab-name">Attack</span>
                <span className="cs-ab-detail">{getWeaponName()} · +{getPlayerAttackBonus()} to hit · {getPlayerDamageDice()}</span>
              </button>
              {['Dash','Dodge','Disengage','Help','Hide'].map(a => (
                <button key={a} className={`cs-action-btn ${actionUsed?'disabled':''}`}
                  onClick={() => { if(!actionUsed){ addLog('action',{actor:player.name,action:a}); setActionUsed(true) } }}
                  disabled={actionUsed}>
                  <span className="cs-ab-name">{a}</span>
                </button>
              ))}
            </div>
          )}

          {/* SPELLS TAB */}
          {isPlayerTurn && activeTab==='spells' && (
            <div className="cs-spell-panel">
              {knownSpells.length === 0 && <div className="cs-empty">No spells known.</div>}

              {/* Slot selector */}
              {Object.keys(availableSlots).length > 0 && (
                <div className="cs-slot-row">
                  <span className="cs-slot-label">Slot:</span>
                  {Object.entries(availableSlots).map(([lvl,count]) => (
                    <button key={lvl} className={`cs-slot-btn ${selectedSlot===lvl?'active':''}`}
                      onClick={() => setSlot(p => p===lvl?null:lvl)}>
                      Lv{lvl} ({count})
                    </button>
                  ))}
                </div>
              )}

              <div className="cs-spell-list">
                {knownSpells.map(spell => {
                  const cleanSpell = spell.replace(/\s*\(cantrip\)/i, '').trim()
                  const isCantrip  = (character.spells||[]).some(s =>
                    s.toLowerCase().includes(cleanSpell.toLowerCase()) && s.toLowerCase().includes('cantrip')
                  )
                  const isFetching = spellFetching === cleanSpell

                  // For display purposes, assume self-targeters & heals are always clickable
                  // We don't know exactly until we fetch — but common sense defaults:
                  // If no action used and (cantrip or slot selected) → always allow click
                  const needsSlot    = !isCantrip
                  const hasSlot      = !!selectedSlot
                  const spellDisabled = actionUsed ||
                                        isFetching ||
                                        (needsSlot && !hasSlot)

                  return (
                    <button
                      key={spell}
                      className={`cs-spell-btn ${isCantrip ? 'cantrip' : ''} ${spellDisabled ? 'disabled' : ''} ${isFetching ? 'fetching' : ''}`}
                      onClick={() => !spellDisabled && handlePlayerSpell(spell, selectedSlot ? parseInt(selectedSlot, 10) : null)}
                      disabled={spellDisabled}
                      title={cleanSpell}
                    >
                      <div className="cs-spell-info">
                        <span className="cs-sb-name">
                          {isFetching ? '⏳' : '✨'} {cleanSpell}
                        </span>
                        <span className="cs-sb-desc">
                          {isFetching ? 'Fetching from Open5e…' : (isCantrip ? 'Cantrip — free cast' : selectedSlot ? `Cast at level ${selectedSlot}` : 'Select a slot level above')}
                        </span>
                      </div>
                      <div className="cs-spell-badges">
                        {isCantrip && <span className="cs-spell-target-badge cantrip">∞</span>}
                        {!isCantrip && <span className="cs-sb-type">{selectedSlot ? `Lv${selectedSlot}` : '—'}</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* BONUS ACTIONS TAB */}
          {isPlayerTurn && activeTab==='bonus' && (
            <div className="cs-action-list">
              {(CLASS_BONUS_ACTIONS[character.class]||[]).map(a => (
                <button key={a.id} className={`cs-action-btn ${bonusUsed?'disabled':''}`}
                  onClick={() => { if(!bonusUsed){ addLog('bonus_action',{actor:player.name,action:a.name}); setBonusUsed(true) } }}
                  disabled={bonusUsed}>
                  <span className="cs-ab-icon">{a.icon}</span>
                  <span className="cs-ab-name">{a.name}</span>
                  <span className="cs-ab-detail">{a.desc.slice(0,55)}</span>
                </button>
              ))}
              {!(CLASS_BONUS_ACTIONS[character.class]||[]).length && (
                <div className="cs-empty">No class bonus actions.</div>
              )}
              {/* Bonus-action spells — known bonus-action spell names (Open5e fetched on click) */}
              {knownSpells.filter(s => {
                const clean = s.replace(/\s*\(cantrip\)/i, '').trim().toLowerCase()
                // These are the common bonus-action spells from the SRD
                const bonusActionSpells = [
                  'healing word','shield of faith','hex','hunter's mark',
                  'misty step','sanctuary','spiritual weapon','thunderous smite',
                  'wrathful smite','searing smite','branding smite','swift quiver',
                  'bonus action attack','mass healing word','armor of agathys',
                  'hellish rebuke','shield','expeditious retreat',
                ]
                return bonusActionSpells.includes(clean)
              }).map(spell => {
                const cleanSpell = spell.replace(/\s*\(cantrip\)/i, '').trim()
                const isFetching = spellFetching === cleanSpell
                const disabled   = bonusUsed || isFetching
                return (
                  <button key={spell} className={`cs-action-btn ${disabled ? 'disabled' : ''}`}
                    onClick={() => !disabled && handlePlayerSpell(spell, null)}
                    disabled={disabled}>
                    <span className="cs-ab-icon">{isFetching ? '⏳' : '⚡'}</span>
                    <span className="cs-ab-name">{cleanSpell}</span>
                    <span className="cs-ab-detail">{isFetching ? 'Fetching…' : 'Bonus action spell'}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {isPlayerTurn && <button className="cs-end-turn" onClick={endPlayerTurn}>⏭ End Turn — Enemies Act</button>}
        {isPlayerTurn && <button className="cs-flee" onClick={() => onCombatEnd({fled:true,narrative:`${character.name} fled.`,playerHP:player.hp})}>🏃 Flee</button>}
      </div>
    </div>
  )
}

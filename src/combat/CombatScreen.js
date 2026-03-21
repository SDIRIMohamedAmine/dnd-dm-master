// src/combat/CombatScreen.js
import { useState, useEffect, useRef, useCallback } from 'react'
import {
  roll, rollDice, rollMultiple, abilityMod, modStr,
  resolveAttack, resolveSave, buildLogEntry,
  getMonsterStats, buildCustomMonster, rollLoot,
} from './engine'
import { CLASS_BONUS_ACTIONS } from '../lib/classData'
import { getItem, applyItemEffect, rollHealDice, ITEM_CATEGORIES } from '../lib/items'
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
  }
}

export default function CombatScreen({ character, enemyNames, onCombatEnd }) {
  const initEnemies = useCallback(() =>
    (enemyNames || []).map((nameStr, i) => {
      // Use local stat block as placeholder — DB lookup happens async in useEffect
      const found = getMonsterStats(nameStr)
      const base  = found || buildCustomMonster(nameStr, null, character.level || 1)
      return { ...base, id: `enemy_${i}`, name: nameStr, hp: base.maxHp, conditions: [], dead: false, loadingStats: !found }
    }), [enemyNames, character.level])

  const [player,       setPlayer]      = useState(() => ({ ...statBlock(character), conditions: [], spellSlotsUsed: {} }))
  const [enemies,      setEnemies]     = useState(initEnemies)
  const [phase,        setPhase]       = useState(PHASES.PLAYER)
  const [round,        setRound]       = useState(1)
  const [log,          setLog]         = useState([])
  const [actionUsed,   setActionUsed]  = useState(false)
  const [bonusUsed,    setBonusUsed]   = useState(false)
  const [selectedTarget, setTarget]    = useState(null)
  const [activeTab,    setActiveTab]   = useState('actions')
  const [summary,      setSummary]     = useState(null)
  const [generating,   setGenerating]  = useState(false)
  const [loot,         setLoot]         = useState(null)
  // Dice roll request state
  const [diceRequest,  setDiceRequest] = useState(null)
  // { expr, label, sides, count, bonus, onResult(total, rolls) }
  const [dicePool,     setDicePool]    = useState([])
  const [diceResults,  setDiceResults] = useState(null)
  const [diceModifier, setDiceModifier]= useState(0)
  const [selectedSlot, setSlot]        = useState(null)
  const [showInventory, setShowInventory] = useState(false)
  const logRef   = useRef(null)
  const playerRef = useRef(player)
  useEffect(() => { playerRef.current = player }, [player])

  // Load real monster stats from database (overrides hardcoded stats if found)
  useEffect(() => {
    async function loadMonsterStats() {
      const updated = await Promise.all(
        enemies.map(async (enemy) => {
          try {
            const dbStats = await lookupMonsterStats(enemy.name)
            if (dbStats) {
              console.log(`[RAG] Loaded stats for ${enemy.name} from DB:`, dbStats.ac, dbStats.hp)
              return {
                ...enemy,
                ac:      dbStats.ac,
                hp:      dbStats.hp,
                maxHp:   dbStats.maxHp,
                cr:      dbStats.cr,
                xp:      dbStats.xp,
                str:     dbStats.str, dex: dbStats.dex, con: dbStats.con,
                int:     dbStats.int, wis: dbStats.wis, cha: dbStats.cha,
                speed:   dbStats.speed,
                attacks: dbStats.attacks?.length ? dbStats.attacks : enemy.attacks,
                loadingStats: false,
                fromDatabase: true,
              }
            }
          } catch (err) {
            console.warn(`[RAG] Could not load stats for ${enemy.name}:`, err.message)
          }
          return { ...enemy, loadingStats: false }
        })
      )
      setEnemies(updated)
    }
    loadMonsterStats()
  }, []) // eslint-disable-line

  // Roll initiative on mount
  useEffect(() => {
    const dexMod = abilityMod(character.dexterity || 10)
    const pRoll  = roll(20) + dexMod
    const order  = [
      { id: 'player', name: character.name, isPlayer: true, initiative: pRoll },
      ...initEnemies().map(e => {
        const m = abilityMod(e.dex || 10); const r = roll(20) + m
        return { id: e.id, name: e.name, isPlayer: false, initiative: r }
      }),
    ].sort((a, b) => b.initiative - a.initiative || (b.isPlayer ? 1 : -1))

    addLog('initiative', { entries: order.map(c => `${c.name}: ${c.initiative}`) })
    const first = order[0]
    if (!first.isPlayer) { setPhase(PHASES.ENEMY); setTimeout(runEnemyTurns, 700) }
    else setPhase(PHASES.PLAYER)
  }, []) // eslint-disable-line

  useEffect(() => { logRef.current?.lastElementChild?.scrollIntoView({ behavior: 'smooth' }) }, [log])

  function addLog(type, data) { setLog(prev => [...prev, buildLogEntry(type, data)]) }

  // ── Player weapon stats ──────────────────────────────────
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
    if (equip.includes('quarterstaff')) return '1d6'
    return '1d6'
  }
  function getPlayerAttackBonus() {
    const strM = abilityMod(player.str || 10)
    const dexM = abilityMod(player.dex || 10)
    return Math.max(strM, dexM) + (player.profBonus || 2)
  }

  // ── Dice request flow ────────────────────────────────────
  // Instead of auto-rolling, we show the dice roller and wait for the player
  function requestDice(expr, label, onResult) {
    // Parse expr like "1d20+4" or "2d8+3"
    const m     = expr.match(/(\d*)d(\d+)([+-]\d+)?/)
    const count = parseInt(m?.[1] || '1')
    const sides = parseInt(m?.[2] || '20')
    const bonus = parseInt(m?.[3] || '0')
    setDiceRequest({ expr, label, sides, count, bonus, onResult })
    setDicePool(Array.from({ length: count }, () => 0))
    setDiceResults(null)
    setDiceModifier(bonus)
    setPhase(PHASES.ROLL)
  }

  function rollOneDie(idx) {
    const sides = diceRequest?.sides || 20
    const result = roll(sides)
    setDicePool(prev => { const next = [...prev]; next[idx] = result; return next })
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
    // IMPORTANT: capture callback and clear state BEFORE calling it
    // so that if onResult calls requestDice() again, the new request is not overwritten
    const callback = diceRequest.onResult
    setDiceRequest(null)
    setDicePool([])
    // Now call — any new requestDice() inside will set fresh state
    callback(total, dicePool, isCrit, isFumble)
  }

  // ── Player attack ────────────────────────────────────────
  function handlePlayerAttack() {
    if (!selectedTarget || actionUsed) return
    const target = enemies.find(e => e.id === selectedTarget)
    if (!target || target.dead) return
    const atkBonus  = getPlayerAttackBonus()
    const dmgDice   = getPlayerDamageDice()
    const dmgBonus  = Math.max(abilityMod(player.str||10), abilityMod(player.dex||10))

    requestDice(`1d20${atkBonus >= 0 ? '+' : ''}${atkBonus}`, `Attack roll vs ${target.name} (AC ${target.ac})`, (total, rolls, isCrit, isFumble) => {
      const hits = isCrit || (!isFumble && total >= target.ac)
      if (hits) {
        // Now roll damage
        const dmgExpr = isCrit ? `${dmgDice.replace('1d','2d')}+${dmgBonus}` : `${dmgDice}+${dmgBonus}`
        requestDice(dmgExpr, `Damage${isCrit ? ' (CRITICAL — double dice!)' : ''}`, (dmgTotal, dmgRolls) => {
          addLog('attack', { actor: player.name, target: target.name, weapon: getWeaponName(), roll: rolls[0], bonus: atkBonus, total, ac: target.ac, hits: true, isCrit, damage: dmgTotal, damageRolls: dmgRolls, damageType: 'slashing' })
          applyDamageToEnemy(target.id, dmgTotal)
          setActionUsed(true); setTarget(null); setPhase(PHASES.PLAYER)
        })
      } else {
        addLog('attack', { actor: player.name, target: target.name, weapon: getWeaponName(), roll: rolls[0], bonus: atkBonus, total, ac: target.ac, hits: false, isFumble, damage: 0, damageType: 'slashing' })
        setActionUsed(true); setTarget(null); setPhase(PHASES.PLAYER)
      }
    })
  }

  // ── Player spell ─────────────────────────────────────────
  const SPELL_DATA = {
    'Fire Bolt':     { atkStat:'cha', dmg:'1d10', type:'fire' },
    'Ray of Frost':  { atkStat:'int', dmg:'1d8',  type:'cold' },
    'Shocking Grasp':{ atkStat:'int', dmg:'1d8',  type:'lightning' },
    'Chill Touch':   { atkStat:'cha', dmg:'1d8',  type:'necrotic' },
    'Poison Spray':  { save:'CON', dc: () => 8+(character.proficiency_bonus||2)+abilityMod(character.constitution||10), dmg:'1d12', type:'poison' },
    'Sacred Flame':  { save:'DEX', dc: () => 8+(character.proficiency_bonus||2)+abilityMod(character.wisdom||10),      dmg:'1d8',  type:'radiant' },
    'Vicious Mockery':{ save:'WIS', dc: () => 8+(character.proficiency_bonus||2)+abilityMod(character.charisma||10),   dmg:'1d4',  type:'psychic' },
    'Toll the Dead': { save:'WIS', dc: () => 8+(character.proficiency_bonus||2)+abilityMod(character.wisdom||10),      dmg: t => t.hp < t.maxHp ? '1d12':'1d8', type:'necrotic' },
    'Magic Missile': { auto:true,  dmg: sl => `${(sl||1)+2}d4+${(sl||1)+2}`, type:'force' },
    'Burning Hands': { save:'DEX', dc: () => 8+(character.proficiency_bonus||2)+Math.max(abilityMod(character.intelligence||10),abilityMod(character.charisma||10)), dmg: sl=>`${(sl||1)*2+1}d6`, type:'fire' },
    'Chromatic Orb': { atkStat:'int', dmg: sl=>`${sl||1}d8`, type:'varies' },
    'Inflict Wounds':{ atkStat:'wis', dmg: sl=>`${(sl||1)*2+1}d10`, type:'necrotic' },
    'Guiding Bolt':  { atkStat:'wis', dmg:'4d6', type:'radiant' },
    'Witch Bolt':    { atkStat:'int', dmg: sl=>`${sl||1}d12`, type:'lightning' },
  }

  function spellCastingMod(stat) {
    const m = { cha: character.charisma, int: character.intelligence, wis: character.wisdom }
    return abilityMod((m[stat] || 10))
  }

  function handlePlayerSpell(spellName, slotLevel) {
    if (!selectedTarget || actionUsed) return
    const target   = enemies.find(e => e.id === selectedTarget)
    if (!target || target.dead) return
    // CRITICAL: slotLevel comes from state as a string ("1","2"...) — must parse to int
    const slotLevelInt = slotLevel ? parseInt(slotLevel, 10) : null
    const isCantrip = (character.spells||[]).find(s => s.toLowerCase().includes(spellName.toLowerCase()) && s.includes('cantrip'))
    const data      = SPELL_DATA[spellName]

    if (!data) {
      // Unknown spell - just log it
      addLog('spell', { actor: player.name, spell: spellName, target: target.name, slotLevel, damage: 0, hits: false, note:'Resolve with DM after combat.' })
      setActionUsed(true); setPhase(PHASES.PLAYER); return
    }

    const dmgExpr  = typeof data.dmg === 'function' ? data.dmg(slotLevelInt, target) : data.dmg
    const spellType = data.type

    function resolveDamage(hits, halfOnMiss) {
      if (!hits && !halfOnMiss) {
        addLog('spell', { actor: player.name, spell: spellName, target: target.name, slotLevel, damage: 0, hits: false, damageType: spellType })
        setActionUsed(true); spendSlot(isCantrip ? null : slotLevelInt); setPhase(PHASES.PLAYER); return
      }
      requestDice(dmgExpr, `${spellName} damage${halfOnMiss && !hits ? ' (half — save succeeded)' : ''}`, (total, rolls) => {
        const finalDmg = halfOnMiss && !hits ? Math.floor(total / 2) : total
        addLog('spell', { actor: player.name, spell: spellName, target: target.name, slotLevel, damage: finalDmg, damageRolls: rolls, hits, damageType: spellType })
        applyDamageToEnemy(target.id, finalDmg)
        setActionUsed(true); spendSlot(isCantrip ? null : slotLevel); setPhase(PHASES.PLAYER)
      })
    }

    if (data.auto) {
      requestDice(dmgExpr, `${spellName} — automatic hit, roll damage`, (total, rolls) => {
        addLog('spell', { actor: player.name, spell: spellName, target: target.name, slotLevel, damage: total, damageRolls: rolls, hits: true, damageType: spellType })
        applyDamageToEnemy(target.id, total)
        setActionUsed(true); spendSlot(slotLevel); setPhase(PHASES.PLAYER)
      })
    } else if (data.save) {
      const dc = typeof data.dc === 'function' ? data.dc() : data.dc
      const hasSave = !!data.save
      addLog('spell_save_announce', { spell: spellName, dc, stat: data.save, target: target.name })
      // Auto-resolve enemy save (enemy rolls)
      const saveResult = resolveSave({ creature: target, stat: data.save, dc })
      setTimeout(() => {
        addLog('enemy_save', { name: target.name, stat: data.save, dc, roll: saveResult.dieRoll, mod: saveResult.mod, total: saveResult.total, success: saveResult.success })
        resolveDamage(!saveResult.success, hasSave)
      }, 500)
    } else if (data.atkStat) {
      const atkMod = spellCastingMod(data.atkStat) + (character.proficiency_bonus || 2)
      requestDice(`1d20${atkMod >= 0 ? '+' : ''}${atkMod}`, `${spellName} attack vs ${target.name} (AC ${target.ac})`, (total, rolls, isCrit) => {
        const hits = isCrit || total >= target.ac
        if (hits) resolveDamage(true, false)
        else {
          addLog('spell', { actor: player.name, spell: spellName, target: target.name, slotLevel, damage: 0, hits: false, damageType: spellType })
          setActionUsed(true); spendSlot(isCantrip ? null : slotLevelInt); setPhase(PHASES.PLAYER)
        }
      })
    }
  }

  function spendSlot(level) {
    if (!level) return
    setPlayer(prev => ({ ...prev, spellSlotsUsed: { ...prev.spellSlotsUsed, [level]: (prev.spellSlotsUsed[level]||0)+1 } }))
  }

  function applyDamageToEnemy(id, dmg) {
    setEnemies(prev => prev.map(e => {
      if (e.id !== id) return e
      const newHp = Math.max(0, e.hp - dmg)
      if (newHp <= 0) addLog('death', { name: e.name })
      return { ...e, hp: newHp, dead: newHp <= 0 }
    }))
  }

  // ── Enemy turns ──────────────────────────────────────────
  const runEnemyTurns = useCallback(async () => {
    const currentPlayer = playerRef.current
    const liveEnemies   = enemies.filter(e => !e.dead)
    if (liveEnemies.length === 0) return

    let updatedPlayerHP = currentPlayer.hp

    for (const enemy of liveEnemies) {
      await new Promise(r => setTimeout(r, 900))
      const attack       = enemy.attacks?.[0]
      if (!attack) continue
      const alliesNear   = liveEnemies.filter(e => e.id !== enemy.id).length > 0
      const packTactics  = alliesNear && (enemy.name.toLowerCase().includes('wolf') || enemy.name.toLowerCase().includes('rat'))
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
      }

      const flavor = enemy.flavor?.[Math.floor(Math.random()*enemy.flavor.length)] || 'attacks'
      addLog('enemy_attack', { actor: enemy.name, target: currentPlayer.name, weapon: attack.name, flavor, roll: dieRoll, bonus: attack.bonus, total, ac: currentPlayer.ac, hits, isCrit, isFumble, damage, damageRolls, damageType: attack.type, packTactics, rolls: packTactics ? [d1,d2] : [d1] })

      if (hits && damage > 0) {
        updatedPlayerHP = Math.max(0, updatedPlayerHP - damage)
        setPlayer(prev => ({ ...prev, hp: updatedPlayerHP }))

        if (updatedPlayerHP <= 0) {
          addLog('death', { name: currentPlayer.name, isPlayer: true })
          await new Promise(r => setTimeout(r, 500))
          setPhase(PHASES.DEFEAT)  // FIX 2: go to defeat screen not END
          return
        }
      }
    }

    await new Promise(r => setTimeout(r, 400))
    addLog('turn_marker', { round })
    setRound(r => r + 1)
    setPhase(PHASES.PLAYER)
    setActionUsed(false)
    setBonusUsed(false)
  }, [enemies, round]) // eslint-disable-line

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

    // Roll loot for each slain enemy
    let totalGold = 0
    const lootItems = []
    for (const e of dead) {
      const drop = rollLoot(e.name, e.cr)
      totalGold += drop.gold
      if (drop.item) lootItems.push(drop.item)
      if (drop.gold > 0 || drop.item) {
        addLog('loot', { enemy: e.name, gold: drop.gold, item: drop.item })
      }
    }
    setLoot({ totalGold, items: lootItems })

    addLog('combat_end', { victory: true, xpGained: xp, gold: totalGold, items: lootItems })
    generateSummary(true, xp)
  }

  // Win check
  useEffect(() => {
    const live = enemies.filter(e => !e.dead)
    if (live.length === 0 && [PHASES.PLAYER, PHASES.ENEMY].includes(phase) && log.length > 2) triggerVictory()
  }, [enemies]) // eslint-disable-line

  async function generateSummary(victory, xpGained) {
    setGenerating(true)
    const logText = log.map(e => {
      if (e.type === 'attack' || e.type === 'enemy_attack') return `${e.actor} ${e.hits ? `hit ${e.target} for ${e.damage} damage` : `missed ${e.target}`}`
      if (e.type === 'spell') return `${e.actor} cast ${e.spell} on ${e.target}: ${e.damage > 0 ? `${e.damage} damage` : 'no damage'}`
      if (e.type === 'death') return `${e.name} ${e.isPlayer ? 'fell' : 'slain'}`
      return ''
    }).filter(Boolean).join('\n')
    try {
      const prompt = `Write a vivid 2-paragraph D&D battle narrative. Third person, past tense, dramatic.
Hero: ${character.name}, Level ${character.level} ${character.race} ${character.class}
Enemies: ${enemies.map(e => e.name).join(', ')}
Result: ${victory ? 'Hero victorious' : 'Hero defeated'}
Events:\n${logText}\nWrite only the narrative.`
      const text = await callAI([{ role:'user', content: prompt }], 400)
      setSummary({ narrative: text.trim(), xpGained: xpGained||0, victory })
    } catch { setSummary({ narrative: victory ? 'You emerged victorious from the battle.' : 'You were overwhelmed and fell unconscious.', xpGained: xpGained||0, victory }) }
    setGenerating(false)
  }

  // ── Spell slots ──────────────────────────────────────────
  const spellSlots    = character.spell_slots || {}
  const availableSlots = Object.entries(spellSlots)
    .filter(([lvl, d]) => (d.max - d.used - (player.spellSlotsUsed[lvl]||0)) > 0)
    .reduce((acc, [lvl, d]) => { acc[lvl] = d.max - d.used - (player.spellSlotsUsed[lvl]||0); return acc }, {})
  const knownSpells   = (character.spells||[]).map(s => s.replace(/\s*\(cantrip\)/i,'').trim())
  const isPlayerTurn  = phase === PHASES.PLAYER
  const liveEnemies   = enemies.filter(e => !e.dead)

  // ── Log renderer ─────────────────────────────────────────
  function renderLog(entry) {
    switch (entry.type) {
      case 'initiative': return <div className="log-initiative">⚔️ {entry.entries.join(' | ')}</div>
      case 'attack': case 'enemy_attack': return (
        <div className={`log-entry ${entry.type === 'enemy_attack' ? 'log-enemy' : 'log-player'}`}>
          <span className="log-actor">{entry.actor}</span>
          <span className="log-verb">{entry.flavor || `attacks ${entry.target}`}</span>
          {entry.packTactics && <span className="log-tag">Pack Tactics</span>}
          {entry.isCrit    && <span className="log-tag crit">CRIT!</span>}
          {entry.isFumble  && <span className="log-tag fumble">FUMBLE</span>}
          <span className="log-roll-line">
            <span className={`log-die ${entry.isCrit?'crit':entry.isFumble?'fumble':''}`}>{entry.roll}</span>
            <span className="log-math">+{entry.bonus} = {entry.total} vs AC {entry.ac}</span>
            <span className={`log-result ${entry.hits?'hit':'miss'}`}>
              {entry.hits ? `HIT — ${entry.damage} ${entry.damageType}` : 'MISS'}
            </span>
          </span>
        </div>
      )
      case 'spell': return (
        <div className="log-entry log-player log-spell">
          <span className="log-actor">{entry.actor}</span>
          <span className="log-verb">casts {entry.spell}</span>
          {entry.slotLevel && <span className="log-tag">Lv{entry.slotLevel}</span>}
          <span className="log-target">→ {entry.target}</span>
          <span className={`log-result ${entry.hits?'hit':'miss'}`}>
            {entry.damage > 0 ? `${entry.damage} ${entry.damageType}` : 'NO EFFECT'}
          </span>
        </div>
      )
      case 'spell_save_announce': return <div className="log-save">⚠ {entry.spell} — {entry.target} makes DC {entry.dc} {entry.stat} save</div>
      case 'enemy_save': return <div className="log-save">{entry.name} {entry.stat} save: {entry.total} (d20={entry.roll}{entry.mod>=0?'+':''}{entry.mod}) vs DC {entry.dc} — {entry.success ? '✓ PASS':'✗ FAIL'}</div>
      case 'death': return <div className={`log-entry ${entry.isPlayer?'log-death-player':'log-death'}`}>☠️ <strong>{entry.name}</strong> {entry.isPlayer?'falls unconscious!':'slain!'}</div>
      case 'turn_marker': return <div className="log-divider">── End of Round {entry.round} ──</div>
      case 'combat_end': return (
        <div className="log-entry log-end">
          {entry.victory ? `⚔️ Victory! +${entry.xpGained} XP` : '💀 Defeated'}
          {entry.gold > 0 && ` · +${entry.gold} gp`}
        </div>
      )
      case 'loot': return (
        <div className="log-entry log-player" style={{fontSize:'.7rem'}}>
          <span className="log-actor">Loot</span>
          <span className="log-verb">{entry.enemy} dropped:</span>
          {entry.gold > 0 && <span className="log-result hit">+{entry.gold} gp</span>}
          {entry.item && <span className="log-result hit">📦 {entry.item}</span>}
        </div>
      )
      case 'action': case 'bonus_action': return <div className="log-entry log-player"><span className="log-actor">{entry.actor}</span><span className="log-verb">{entry.action}</span></div>
      case 'item_use': return (
        <div className="log-entry log-player">
          <span className="log-actor">{entry.actor}</span>
          <span className="log-verb">uses {entry.item}</span>
          <span className="log-result hit">{entry.result}</span>
        </div>
      )
      default: return null
    }
  }

  // ── DEFEAT SCREEN (FIX 2) ────────────────────────────────
  if (phase === PHASES.DEFEAT) {
    return (
      <div className="cs-defeat-screen">
        <div className="cs-defeat-inner">
          <div className="cs-defeat-icon">💀</div>
          <h2 className="cs-defeat-title">You have fallen…</h2>
          <p className="cs-defeat-sub">{character.name} lies unconscious on the battlefield.</p>
          <div className="cs-defeat-choices">
            <button className="cs-defeat-btn cs-replay-btn" onClick={() => {
              setPlayer({ ...statBlock(character), conditions: [], spellSlotsUsed: {} })
              setEnemies(initEnemies())
              setPhase(PHASES.PLAYER)
              setRound(1)
              setLog([])
              setActionUsed(false)
              setBonusUsed(false)
              setTarget(null)
              setDiceRequest(null)
            }}>
              🔄 Replay Fight
            </button>
            <button className="cs-defeat-btn cs-bear-btn" onClick={() => {
              const narrative = `${character.name} was overwhelmed and fell unconscious. The enemies stood over the fallen ${character.class}.`
              onCombatEnd({ victory: false, narrative, playerHP: 1, xpGained: 0 })
            }}>
              ⚔️ Bear the Consequences
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── VICTORY / SUMMARY ────────────────────────────────────
  if (phase === PHASES.END && summary) {
    return (
      <div className="cs-summary">
        <div className="cs-summary-inner">
          <div className="cs-summary-icon">⚔️</div>
          <h2 className="cs-summary-title">Victory</h2>
          {summary.xpGained > 0 && <div className="cs-summary-xp">+{summary.xpGained} XP earned</div>}
          {loot && (loot.totalGold > 0 || loot.items.length > 0) && (
            <div className="cs-summary-loot">
              <div className="cs-loot-title">⚙ Loot Found</div>
              {loot.totalGold > 0 && <div className="cs-loot-row">⚙ {loot.totalGold} gold pieces</div>}
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

  // ── DICE ROLL PANEL (FIX 1) ──────────────────────────────
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
              <button key={i} className={`cs-die-btn ${val > 0 ? 'rolled' : ''} ${val === diceRequest.sides && diceRequest.sides === 20 ? 'max' : ''} ${val === 1 && diceRequest.sides === 20 ? 'min' : ''}`}
                onClick={() => rollOneDie(i)} disabled={val > 0}>
                {val > 0 ? val : <span className="cs-die-icon">d{diceRequest.sides}</span>}
              </button>
            ))}
          </div>

          {diceRequest.bonus !== 0 && (
            <div className="cs-dice-bonus">
              {allRolled && <span className="cs-dice-sum">{dicePool.reduce((s,r)=>s+r,0)}</span>}
              <span className="cs-dice-mod-label">{diceRequest.bonus >= 0 ? `+${diceRequest.bonus}` : diceRequest.bonus}</span>
              {allRolled && <span className="cs-dice-equals">= <strong>{total}</strong></span>}
            </div>
          )}

          {allRolled && (
            <div className="cs-dice-result">
              {isCrit   && <div className="cs-dice-crit">⭐ CRITICAL HIT!</div>}
              {isFumble && <div className="cs-dice-fumble">💀 Critical Fumble!</div>}
              <div className="cs-dice-total">{total}</div>
            </div>
          )}

          <div className="cs-dice-actions">
            <button className="cs-roll-all-btn" onClick={rollAllDice} disabled={allRolled}>
              🎲 Roll All
            </button>
            <button className="cs-confirm-btn" onClick={confirmDiceRoll} disabled={!allRolled}>
              ✓ Confirm
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── MAIN COMBAT UI ───────────────────────────────────────
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

        <div className="cs-enemies">
          {enemies.map(enemy => (
            <button key={enemy.id}
              className={`cs-creature cs-enemy-card ${selectedTarget===enemy.id?'selected':''} ${enemy.dead?'dead':''} ${!isPlayerTurn?'disabled':''}`}
              onClick={() => isPlayerTurn && !enemy.dead && setTarget(p => p===enemy.id ? null : enemy.id)}
              disabled={!isPlayerTurn || enemy.dead}>
              <div className="cs-creature-name">{enemy.dead?'☠️ ':selectedTarget===enemy.id?'🎯 ':''}{enemy.name}</div>
              <div className="cs-hp-bar-wrap"><div className="cs-hp-bar" style={{ width:`${Math.max(0,Math.round((enemy.hp/enemy.maxHp)*100))}%`, background: enemy.hp/enemy.maxHp>.5?'#4ecb71':enemy.hp/enemy.maxHp>.25?'#e8b84a':'#e05050' }}/></div>
              <div className="cs-creature-stats">
                <span className="cs-stat-pill hp">{enemy.dead?0:enemy.hp}/{enemy.maxHp} HP</span>
                <span className="cs-stat-pill ac">AC {enemy.ac}</span>
                <span className="cs-stat-pill cr">CR {enemy.cr}</span>
              </div>
              {!enemy.dead && (<>
                <div className="cs-creature-statblock">
                  {['str','dex','con','int','wis','cha'].map(s=>(
                    <div key={s} className="cs-mini-stat"><span>{s.toUpperCase()}</span><span>{enemy[s]||10}</span><span>{modStr(enemy[s]||10)}</span></div>
                  ))}
                </div>
                <div className="cs-creature-attacks">
                  {enemy.attacks?.map((a,i)=><div key={i} className="cs-atk-pill">{a.name}: +{a.bonus} / {a.damage} {a.type}</div>)}
                </div>
              </>)}
            </button>
          ))}
        </div>

        <div className="cs-vs">VS</div>

        <div className="cs-player-card">
          <div className="cs-creature-name">{player.name}</div>
          <div className="cs-hp-bar-wrap"><div className="cs-hp-bar" style={{ width:`${Math.max(0,Math.round((player.hp/player.maxHp)*100))}%`, background: player.hp/player.maxHp>.5?'#4ecb71':player.hp/player.maxHp>.25?'#e8b84a':'#e05050' }}/></div>
          <div className="cs-creature-stats">
            <span className="cs-stat-pill hp">{player.hp}/{player.maxHp} HP</span>
            <span className="cs-stat-pill ac">AC {player.ac}</span>
            <span className="cs-stat-pill">Lv {character.level}</span>
          </div>
          <div className="cs-creature-statblock">
            {[['STR',player.str],['DEX',player.dex],['CON',player.con],['INT',player.int],['WIS',player.wis],['CHA',player.cha]].map(([n,v])=>(
              <div key={n} className="cs-mini-stat"><span>{n}</span><span>{v}</span><span>{modStr(v)}</span></div>
            ))}
          </div>
          <div className="cs-economy">
            <div className={`cs-pip action ${actionUsed?'used':''}`} title="Action">A</div>
            <div className={`cs-pip bonus ${bonusUsed?'used':''}`} title="Bonus">B</div>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="cs-action-panel">
        <div className="cs-action-header">
          {selectedTarget
            ? <span className="cs-target-label">🎯 {enemies.find(e=>e.id===selectedTarget)?.name}</span>
            : <span className="cs-target-hint">{isPlayerTurn?'Click an enemy to target':'Waiting for enemies…'}</span>}
        </div>
        <div className="cs-tabs">
          {['actions','spells','bonus'].map(tab=>(
            <button key={tab} className={`cs-tab ${activeTab===tab?'active':''}`} onClick={()=>setActiveTab(tab)}>
              {tab==='actions'?'⚔️ Actions':tab==='spells'?'✨ Spells':'⚡ Bonus'}
            </button>
          ))}
        </div>
        <div className="cs-action-body">
          {!isPlayerTurn && <div className="cs-waiting">Enemies are acting…</div>}

          {isPlayerTurn && activeTab==='actions' && (
            <div className="cs-action-list">
              <button className={`cs-action-btn primary ${!selectedTarget||actionUsed?'disabled':''}`}
                onClick={handlePlayerAttack} disabled={!selectedTarget||actionUsed}>
                <span className="cs-ab-icon">⚔️</span>
                <span className="cs-ab-name">Attack</span>
                <span className="cs-ab-detail">{getWeaponName()} · +{getPlayerAttackBonus()} to hit · {getPlayerDamageDice()}</span>
              </button>
              {['Dash','Dodge','Disengage','Help','Hide'].map(a=>(
                <button key={a} className={`cs-action-btn ${actionUsed?'disabled':''}`}
                  onClick={()=>{if(!actionUsed){addLog('action',{actor:player.name,action:a});setActionUsed(true)}}}
                  disabled={actionUsed}>
                  <span className="cs-ab-name">{a}</span>
                </button>
              ))}
            </div>
          )}

          {isPlayerTurn && activeTab==='spells' && (
            <div className="cs-spell-panel">
              {knownSpells.length===0 && <div className="cs-empty">No spells known.</div>}
              {Object.keys(availableSlots).length>0 && (
                <div className="cs-slot-row">
                  <span className="cs-slot-label">Slot:</span>
                  {Object.entries(availableSlots).map(([lvl,count])=>(
                    <button key={lvl} className={`cs-slot-btn ${selectedSlot===lvl?'active':''}`} onClick={()=>setSlot(p=>p===lvl?null:lvl)}>
                      Lv{lvl} ({count})
                    </button>
                  ))}
                </div>
              )}
              <div className="cs-spell-list">
                {knownSpells.map(spell=>{
                  const isCantrip = (character.spells||[]).find(s=>s.toLowerCase().includes(spell.toLowerCase())&&s.includes('cantrip'))
                  const disabled  = !selectedTarget || actionUsed || (!isCantrip && !selectedSlot)
                  return (
                    <button key={spell} className={`cs-spell-btn ${isCantrip?'cantrip':''} ${disabled?'disabled':''}`}
                      onClick={()=>!disabled&&handlePlayerSpell(spell, selectedSlot ? parseInt(selectedSlot, 10) : null)} disabled={disabled}
                      title={!isCantrip&&!selectedSlot?'Select a spell slot level first':''}>
                      <span className="cs-sb-name">{spell}</span>
                      <span className="cs-sb-type">{isCantrip?'∞':selectedSlot?`Lv${selectedSlot}`:'—'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {isPlayerTurn && activeTab==='bonus' && (
            <div className="cs-action-list">
              {(CLASS_BONUS_ACTIONS[character.class]||[]).map(a=>(
                <button key={a.id} className={`cs-action-btn ${bonusUsed?'disabled':''}`}
                  onClick={()=>{if(!bonusUsed){addLog('bonus_action',{actor:player.name,action:a.name});setBonusUsed(true)}}}
                  disabled={bonusUsed}>
                  <span className="cs-ab-icon">{a.icon}</span>
                  <span className="cs-ab-name">{a.name}</span>
                  <span className="cs-ab-detail">{a.desc.slice(0,55)}{a.desc.length>55?'…':''}</span>
                </button>
              ))}
              {!(CLASS_BONUS_ACTIONS[character.class]||[]).length && <div className="cs-empty">No class bonus actions.</div>}

              <div className="cs-inv-section">
                <div className="cs-inv-title">🎒 Use Item (Bonus Action)</div>
                {(character.equipment || []).filter(item => {
                  const d = getItem(item)
                  return d.category === ITEM_CATEGORIES.CONSUMABLE
                }).filter((v,i,a) => a.indexOf(v) === i).map(item => {
                  const d = getItem(item)
                  return (
                    <button key={item} className={`cs-action-btn ${bonusUsed ? 'disabled' : ''}`}
                      onClick={() => {
                        if (bonusUsed) return
                        const result = applyItemEffect(item, { ...character, current_hp: player.hp, max_hp: player.maxHp })
                        if (result.hpChange) {
                          setPlayer(prev => ({ ...prev, hp: Math.min(prev.maxHp, prev.hp + result.hpChange) }))
                          addLog('item_use', { actor: player.name, item, result: result.message })
                        }
                        setBonusUsed(true)
                        // Tell parent to remove item from inventory
                        if (result.consume) {
                          const eq = [...(character.equipment || [])]
                          const idx = eq.indexOf(item)
                          if (idx > -1) eq.splice(idx, 1)
                          // We can't call updateCharacterStats here directly but we pass it up
                          if (window.__combatItemUsed) window.__combatItemUsed(item)
                        }
                      }}
                      disabled={bonusUsed}>
                      <span className="cs-ab-icon">{d.icon || '🧪'}</span>
                      <span className="cs-ab-name">{item}</span>
                      <span className="cs-ab-detail">{d.desc?.slice(0,50)}</span>
                    </button>
                  )
                })}
                {!(character.equipment||[]).some(item => getItem(item).category === ITEM_CATEGORIES.CONSUMABLE) && (
                  <div className="cs-empty" style={{fontSize:'.68rem'}}>No consumables in inventory.</div>
                )}
              </div>
            </div>
          )}
        </div>

        {isPlayerTurn && <button className="cs-end-turn" onClick={endPlayerTurn}>⏭ End Turn — Enemies Act</button>}
        {isPlayerTurn && <button className="cs-flee" onClick={()=>onCombatEnd({fled:true,narrative:`${character.name} fled from battle.`,playerHP:player.hp})}>🏃 Flee</button>}
      </div>
    </div>
  )
}
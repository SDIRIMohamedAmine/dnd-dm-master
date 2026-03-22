// src/combat/CombatScreen.js — Full Combat System v3
// Fix 1: Replay reloads DB stats via loadedStatsRef cache
// Fix 2: OA miss + all dice callbacks call returnToPlayerPhase()
// Fix 3: handleReplay clears pendingPlayerSaves
// Fix 4: getLegalSlots gates slots by class/level via getMaxSlots
// Fix 5: normalizeSpellDef maps type:'auto' → isDart for Magic Missile
// Fix 6: triggerDeathSavingThrow replaces instant DEFEAT
import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  roll, rollDice, rollMultiple, abilityMod,
  resolveSave, buildLogEntry,
  getMonsterStats, buildCustomMonster, rollLoot,
  STATUS_EFFECTS, applyStatusTick, ENEMY_SPELLS, getEnemySpellList,
  getSpellDef, getEquippedWeapon, CLASS_COMBAT_FEATURES,
} from './engine'
import {
  fetchSpell, getDamageDiceForSlot, getHealDiceForSlot,
  spellNeedsEnemyTarget, spellIsSelfCast,
} from './spellResolver'
import { getMaxSlots } from '../lib/spellSlots'
import { callAI } from '../lib/openrouter'
import { lookupMonsterStats } from '../lib/rag'
import { loadCompiledSpell, compileSpell } from '../lib/spellCompiler'
import {
  chooseEnemyAbility, executeAbility,
  attackToAbility, meetsCondition,
  tickCooldowns, usedAbility,
  getPassiveModifiers, resolveTurnStartAbilities,
} from './abilitySystem'
import './CombatScreen.css'

const PHASES = { PLAYER:'player', ENEMY:'enemy', ROLL:'roll', DEATH_SAVE:'death_save', END:'end', DEFEAT:'defeat' }
const TARGET_MODE = { SINGLE_ENEMY:'single_enemy', SELF:'self', AOE:'aoe' }

function buildPlayerState(char) {
  return {
    name:char.name, hp:char.current_hp, maxHp:char.max_hp, ac:char.armor_class,
    str:char.strength, dex:char.dexterity, con:char.constitution,
    int:char.intelligence, wis:char.wisdom, cha:char.charisma,
    profBonus:char.proficiency_bonus||2,
    saving_throw_proficiencies:char.saving_throw_proficiencies||[],
    fighting_style:char.fighting_style||null,
    isPlayer:true, statusEffects:[], spellSlotsUsed:{},
    deathSaveSuccesses:0, deathSaveFailures:0, stable:false,
  }
}

function buildEnemyList(names, level) {
  return (names||[]).map((n,i)=>{
    const found = getMonsterStats(n)
    const base  = found || buildCustomMonster(n,null,level||1)
    return { ...base, id:`enemy_${i}_${Date.now()}`, name:n, hp:base.maxHp,
      conditions:[], dead:false, loadingStats:!found, statusEffects:[],
      spellList:getEnemySpellList(base), spellCooldown:0,
        abilityCooldowns:{}, }
  })
}

function initCharges(char) {
  const feats=CLASS_COMBAT_FEATURES[char.class]||{}, charges={}
  for(const[id,f]of Object.entries(feats)){
    if(!f.noCharge&&f.charges!==undefined)
      charges[id]=typeof f.charges==='function'?f.charges(char.level||1):f.charges
    if(f.id==='layOnHands') charges['layOnHands_pool']=f.pool(char.level||1)
  }
  return charges
}


export default function CombatScreen({ character, enemyNames, onCombatEnd, campaignId }) {
  const [player,setPlayer]             = useState(()=>buildPlayerState(character))
  const [enemies,setEnemies]           = useState(()=>buildEnemyList(enemyNames,character.level))
  const [phase,setPhase]               = useState(PHASES.PLAYER)
  const [round,setRound]               = useState(1)
  const [log,setLog]                   = useState([])
  const [actionUsed,setActionUsed]     = useState(false)
  const [bonusUsed,setBonusUsed]       = useState(false)
  const [reactionUsed,setReactionUsed] = useState(false)
  const [reckless,setReckless]         = useState(false)
  const [sneakUsed,setSneakUsed]       = useState(false)
  const [isRaging,setIsRaging]         = useState(false)
  const [ragingDuration,setRagingDuration] = useState(0)
  const [concentration,setConcentration]   = useState(null)
  const [opportunityTarget,setOpportunityTarget] = useState(null)
  const [classCharges,setClassCharges] = useState(()=>initCharges(character))
  const [layOnHandsPool,setLayOnHandsPool] = useState(
    ()=>(CLASS_COMBAT_FEATURES[character.class]?.layOnHands?.pool(character.level||1))||0)
  const [targetMode,setTargetMode]         = useState(TARGET_MODE.SINGLE_ENEMY)
  const [selectedTargets,setSelectedTargets] = useState([])
  const [activeTab,setActiveTab]           = useState('actions')
  const [selectedSlot,setSelectedSlot]     = useState(null)
  const [spellFetching,setSpellFetching]   = useState(null)
  const [compilingSpell,setCompilingSpell] = useState(null)
  const [dartAssign,setDartAssign]         = useState(null)
  const [diceRequest,setDiceRequest]       = useState(null)
  const [dicePool,setDicePool]             = useState([])
  const [pendingPlayerSaves,setPendingPlayerSaves] = useState([])
  const [summary,setSummary]               = useState(null)
  const [generating,setGenerating]         = useState(false)
  const [loot,setLoot]                     = useState(null)

  const logRef       = useRef(null)
  const playerRef    = useRef(player)
  const enemiesRef   = useRef(enemies)
  const characterRef = useRef(character)
  useEffect(()=>{playerRef.current=player},[player])
  useEffect(()=>{enemiesRef.current=enemies},[enemies])
  useEffect(()=>{characterRef.current=character},[character])
  useEffect(()=>{logRef.current?.lastElementChild?.scrollIntoView({behavior:'smooth'})},[log])

  // FIX 1: cache DB stats so replay re-uses them without re-fetching
  const loadedStatsRef = useRef({})

  const loadMonsterStats = useCallback(async (currentEnemies) => {
    const updated = await Promise.all(currentEnemies.map(async (enemy) => {
      if (loadedStatsRef.current[enemy.name]) {
        return mergeDbStats(enemy, loadedStatsRef.current[enemy.name])
      }
      try {
        const db = await lookupMonsterStats(enemy.name, campaignId)
        if (db) { loadedStatsRef.current[enemy.name]=db; return mergeDbStats(enemy,db) }
      } catch {}
      return { ...enemy, loadingStats:false }
    }))
    setEnemies(updated)
  }, [campaignId]) // eslint-disable-line

  function mergeDbStats(enemy, db) {
    return { ...enemy,
      ac:db.ac??enemy.ac, hp:db.maxHp??enemy.hp, maxHp:db.maxHp??enemy.maxHp,
      cr:db.cr??enemy.cr, xp:db.xp??enemy.xp,
      str:db.str??enemy.str, dex:db.dex??enemy.dex, con:db.con??enemy.con,
      int:db.int??enemy.int, wis:db.wis??enemy.wis, cha:db.cha??enemy.cha,
      attacks:db.attacks?.length?db.attacks:enemy.attacks,
      spellList:db.spellList?.length?db.spellList:enemy.spellList,
      loadingStats:false, fromDatabase:true }
  }

  useEffect(()=>{ loadMonsterStats(enemies) },[]) // eslint-disable-line

  // Roll initiative
  useEffect(()=>{
    const dexMod=abilityMod(character.dexterity||10), pRoll=roll(20)+dexMod
    const order=[
      {id:'player',name:character.name,isPlayer:true,initiative:pRoll},
      ...enemiesRef.current.map(e=>({id:e.id,name:e.name,isPlayer:false,initiative:roll(20)+abilityMod(e.dex||10)})),
    ].sort((a,b)=>b.initiative-a.initiative||(b.isPlayer?1:-1))
    addLog('initiative',{entries:order.map(c=>`${c.name}: ${c.initiative}`)})
    if(!order[0].isPlayer){setPhase(PHASES.ENEMY);setTimeout(runEnemyTurns,700)}
    else setPhase(PHASES.PLAYER)
  },[]) // eslint-disable-line

  // Auto-resolve pending saves when PLAYER phase and no active dice request
  // FIX 3 (partial): guard prevents old saves from firing immediately on replay
  useEffect(()=>{
    if(pendingPlayerSaves.length>0 && phase===PHASES.PLAYER && !diceRequest)
      resolveNextPendingSave()
  },[pendingPlayerSaves,phase,diceRequest]) // eslint-disable-line

  // FIX 6: trigger DST at start of player turn when at 0 HP
  // Guard: only fire when there's no active dice request and not already in DST phase
  useEffect(()=>{
    if(phase===PHASES.PLAYER && player.hp<=0 && !player.stable
       && player.deathSaveSuccesses<3 && player.deathSaveFailures<3
       && !diceRequest)
      setTimeout(triggerDeathSavingThrow, 400)
  },[phase]) // eslint-disable-line

  // FIX 4: compute legal spell slots from class/level table
  function getLegalSlots() {
    let classMax = {}
    try { classMax = getMaxSlots(character.class, character.level||1) || {} } catch { classMax = {} }
    const dbSlots = character.spell_slots||{}
    const result  = {}
    for(const[lvl]of Object.entries(classMax)){
      const db  = dbSlots[String(lvl)]
      const rem = db?(db.max-(db.used||0)-(player.spellSlotsUsed[String(lvl)]||0)):0
      if(rem>0) result[String(lvl)]=rem
    }
    return result
  }

  function addLog(type,data){setLog(prev=>[...prev,buildLogEntry(type,data)])}

  function resetTargeting(){setTargetMode(TARGET_MODE.SINGLE_ENEMY);setSelectedTargets([])}
  function toggleTarget(id){setSelectedTargets(prev=>prev[0]===id?[]:[id])}
  function selectAoE(){setTargetMode(TARGET_MODE.AOE);setSelectedTargets(enemies.filter(e=>!e.dead).map(e=>e.id))}
  function selectSelf(){setTargetMode(TARGET_MODE.SELF);setSelectedTargets(['player'])}

  function applyDamageToEnemy(id,dmg){
    setEnemies(prev=>prev.map(e=>{
      if(e.id!==id)return e
      const newHp=Math.max(0,e.hp-dmg)
      if(newHp<=0&&!e.dead)addLog('death',{name:e.name})
      return{...e,hp:newHp,dead:newHp<=0}
    }))
  }
  function applyHealToPlayer(amt){setPlayer(prev=>({...prev,hp:Math.min(prev.maxHp,prev.hp+amt)}))}

  function addStatusToEnemy(id,effectId,duration){
    const eff=STATUS_EFFECTS[effectId]; if(!eff)return
    setEnemies(prev=>prev.map(e=>{
      if(e.id!==id)return e
      const ex=e.statusEffects.find(s=>s.effectId===effectId)
      if(ex)return{...e,statusEffects:e.statusEffects.map(s=>s.effectId===effectId?{...s,duration:Math.max(s.duration,duration)}:s)}
      return{...e,statusEffects:[...e.statusEffects,{effectId,name:eff.name,duration,icon:eff.icon,color:eff.color}]}
    }))
  }
  function addStatusToPlayer(effectId,duration){
    const eff=STATUS_EFFECTS[effectId]; if(!eff)return
    setPlayer(prev=>{
      const ex=prev.statusEffects.find(s=>s.effectId===effectId)
      if(ex)return{...prev,statusEffects:prev.statusEffects.map(s=>s.effectId===effectId?{...s,duration:Math.max(s.duration,duration)}:s)}
      return{...prev,statusEffects:[...prev.statusEffects,{effectId,name:eff.name,duration,icon:eff.icon,color:eff.color}]}
    })
  }
  function spendSlot(level){
    if(!level)return
    setPlayer(prev=>({...prev,spellSlotsUsed:{...prev.spellSlotsUsed,[String(level)]:(prev.spellSlotsUsed[String(level)]||0)+1}}))
  }

  // Dice system - FIX 2: every callback must call returnToPlayerPhase()
  function requestDice(expr,label,onResult){
    const m=expr.match(/(\d*)d(\d+)([+-]\d+)?/)
    const count=parseInt(m?.[1]||'1'), sides=parseInt(m?.[2]||'20'), bonus=parseInt(m?.[3]||'0')
    setDiceRequest({expr,label,sides,count,bonus,onResult})
    setDicePool(Array.from({length:count},()=>0))
    setPhase(PHASES.ROLL)
  }
  function rollOneDie(idx){const s=diceRequest?.sides||20;setDicePool(prev=>{const n=[...prev];n[idx]=roll(s);return n})}
  function rollAllDice(){if(!diceRequest)return;setDicePool(Array.from({length:diceRequest.count},()=>roll(diceRequest.sides)))}
  function confirmDiceRoll(){
    if(!diceRequest||!dicePool.every(r=>r>0))return
    const total=dicePool.reduce((s,r)=>s+r,0)+(diceRequest.bonus||0)
    const isCrit=diceRequest.sides===20&&dicePool[0]===20
    const isFumble=diceRequest.sides===20&&dicePool[0]===1
    const cb=diceRequest.onResult; setDiceRequest(null); setDicePool([])
    cb(total,dicePool,isCrit,isFumble)
  }
  function returnToPlayerPhase(){setPhase(PHASES.PLAYER)}


  // Concentration
  function setConcentrationSpell(spellName,effectId){
    if(concentration?.effectId) setPlayer(prev=>({...prev,statusEffects:prev.statusEffects.filter(s=>s.effectId!==concentration.effectId)}))
    setConcentration(spellName?{spellName,effectId}:null)
  }
  function checkConcentrationAfterDamage(damage){
    if(!concentration||damage<=0)return
    const dc=Math.max(10,Math.floor(damage/2)), conMod=abilityMod(playerRef.current.con||10)
    requestDice(`1d20${conMod>=0?'+':''}${conMod}`,`Concentration Save DC ${dc} — ${concentration.spellName}`,(total)=>{
      if(total>=dc) addLog('action',{actor:playerRef.current.name,action:`Concentration maintained! (${total} vs DC ${dc})`})
      else { addLog('action',{actor:playerRef.current.name,action:`Concentration broken! — ${concentration.spellName} ends.`}); setConcentrationSpell(null,null) }
      returnToPlayerPhase()
    })
  }

  // Pending player saves
  function queuePlayerSave({stat,dc,onSuccess,onFail,label}){
    setPendingPlayerSaves(prev=>[...prev,{stat,dc,onSuccess,onFail,label}])
  }
  function resolveNextPendingSave(){
    const save=pendingPlayerSaves[0]; if(!save)return
    const statMap={STR:'str',DEX:'dex',CON:'con',INT:'int',WIS:'wis',CHA:'cha'}
    const score=playerRef.current[statMap[save.stat]||'con']||10
    const mod=abilityMod(score)
    const prof=(characterRef.current.saving_throw_proficiencies||[]).includes(save.stat)
    const totalMod=mod+(prof?characterRef.current.proficiency_bonus||2:0)
    requestDice(`1d20${totalMod>=0?'+':''}${totalMod}`,save.label||`${save.stat} Save DC ${save.dc}`,(total,rolls)=>{
      setPendingPlayerSaves(prev=>prev.slice(1))
      const success=total>=save.dc
      addLog('player_save',{name:playerRef.current.name,stat:save.stat,dc:save.dc,roll:rolls[0],mod:totalMod,total,success})
      if(success)save.onSuccess?.(); else save.onFail?.()
      returnToPlayerPhase() // FIX 2: always restore phase
    })
  }

  // FIX 6: Death saving throws
  function triggerDeathSavingThrow(){
    setPhase(PHASES.DEATH_SAVE)
    requestDice('1d20','Death Saving Throw (need 10+ to succeed)',(total,rolls)=>{
      const isCrit=rolls[0]===20, isFumble=rolls[0]===1
      setPlayer(prev=>{
        let{deathSaveSuccesses:s,deathSaveFailures:f}=prev
        if(isCrit){
          addLog('death_save',{name:prev.name,roll:rolls[0],success:true,note:'NAT 20 — regain 1 HP!'})
          setTimeout(()=>{setPlayer(p=>({...p,hp:1,deathSaveSuccesses:0,deathSaveFailures:0}));setPhase(PHASES.PLAYER)},600)
          return{...prev,deathSaveSuccesses:3}
        }
        if(isFumble){f=Math.min(3,f+2);addLog('death_save',{name:prev.name,roll:rolls[0],success:false,note:'NAT 1 — two failures!'})}
        else if(total>=10){s=Math.min(3,s+1);addLog('death_save',{name:prev.name,roll:total,success:true})}
        else{f=Math.min(3,f+1);addLog('death_save',{name:prev.name,roll:total,success:false})}
        if(f>=3){addLog('action',{actor:prev.name,action:`${prev.name} has died.`});setTimeout(()=>setPhase(PHASES.DEFEAT),800);return{...prev,deathSaveSuccesses:s,deathSaveFailures:f}}
        if(s>=3){addLog('action',{actor:prev.name,action:`${prev.name} stabilizes!`});setTimeout(()=>setPhase(PHASES.PLAYER),600);return{...prev,deathSaveSuccesses:s,deathSaveFailures:f,stable:true}}
        setTimeout(()=>setPhase(PHASES.PLAYER),600)
        return{...prev,deathSaveSuccesses:s,deathSaveFailures:f}
      })
    })
  }

  // Status ticks
  function tickStatusEffects(){
    setEnemies(prev=>prev.map(e=>{
      if(e.dead)return e
      let newHp=e.hp; const newEffects=[]
      for(const se of e.statusEffects){
        const r=applyStatusTick(e,se.effectId)
        if(r){newHp=Math.max(0,newHp-r.damage+r.heal);for(const l of r.logs)addLog(l.type,l);if(!r.removeEffect&&se.duration>1)newEffects.push({...se,duration:se.duration-1})}
        else{if(se.duration>1)newEffects.push({...se,duration:se.duration-1})}
      }
      if(newHp<=0&&!e.dead)addLog('death',{name:e.name})
      return{...e,hp:Math.max(0,newHp),dead:newHp<=0,statusEffects:newEffects}
    }))
    setPlayer(prev=>{
      let newHp=prev.hp; const newEffects=[]
      for(const se of prev.statusEffects){
        const r=applyStatusTick(prev,se.effectId)
        if(r){newHp=Math.max(0,Math.min(prev.maxHp,newHp-r.damage+r.heal));for(const l of r.logs)addLog(l.type,l);if(!r.removeEffect&&se.duration>1)newEffects.push({...se,duration:se.duration-1})}
        else{if(se.duration>1)newEffects.push({...se,duration:se.duration-1})}
      }
      return{...prev,hp:newHp,statusEffects:newEffects}
    })
  }

  // Weapon helpers
  function getActiveWeapon(){return getEquippedWeapon(character.equipment,player.str||10,player.dex||10)}
  function getWeaponName(){return getActiveWeapon().name}
  function getPlayerDamageDice(){
    const w=getActiveWeapon()
    if(w.name==='Unarmed'&&character.class==='Monk')return CLASS_COMBAT_FEATURES.Monk?.martialArts?.unarmedDice(character.level||1)||'1d4'
    return w.damageDice
  }
  function getFightingStyleAttackBonus(){const s=player.fighting_style||'';return /Archery/i.test(s)&&getActiveWeapon().ranged?2:0}
  function getFightingStyleDamageBonus(){
    const s=player.fighting_style||'',w=getActiveWeapon()
    const eq=(character.equipment||[]).join(' ').toLowerCase()
    const hasOff=['dagger','shortsword','handaxe','sickle','scimitar'].some(x=>eq.includes(x))
    return /Dueling/i.test(s)&&!w.twoHanded&&!hasOff?2:0
  }
  function getPlayerAttackBonus(){return getActiveWeapon().statMod+(player.profBonus||2)+getFightingStyleAttackBonus()}
  function getPlayerDamageBonus(){return getActiveWeapon().statMod+(isRaging?2:0)+getFightingStyleDamageBonus()}
  function getSpellcastingMod(stat){return abilityMod({cha:character.charisma,int:character.intelligence,wis:character.wisdom}[stat]||10)}
  function getSpellDC(stat){return 8+(character.proficiency_bonus||2)+getSpellcastingMod(stat)}


  // PLAYER ATTACK
  function handlePlayerAttack(){
    if(actionUsed||!selectedTargets.length)return
    const target=enemies.find(e=>e.id===selectedTargets[0]&&!e.dead); if(!target)return
    const atkBonus=getPlayerAttackBonus(), dmgDice=getPlayerDamageDice(), dmgBonus=getPlayerDamageBonus()
    const weapon=getActiveWeapon()
    const hasAdv=target.statusEffects?.some(s=>STATUS_EFFECTS[s.effectId]?.giveAdvantageToAttackers)||reckless
    const canSneak=character.class==='Rogue'&&!sneakUsed&&hasAdv
    const sneakDice=canSneak?CLASS_COMBAT_FEATURES.Rogue.sneakAttack.extraDice(character.level||1):null
    const label=`Attack${hasAdv?' (Advantage)':''} vs ${target.name} (AC ${target.ac})`
    requestDice(`1d20${atkBonus>=0?'+':''}${atkBonus}`,label,(total,rolls,isCrit,isFumble)=>{
      const hits=isCrit||(!isFumble&&total>=target.ac)
      if(!hits){
        addLog('attack',{actor:player.name,target:target.name,weapon:weapon.name,roll:rolls[0],bonus:atkBonus,total,ac:target.ac,hits:false,isFumble,damage:0,damageType:weapon.type||'slashing'})
        setActionUsed(true);resetTargeting();returnToPlayerPhase();return
      }
      const baseDice=isCrit?dmgDice.replace(/^(\d+)d/,(_,n)=>`${parseInt(n)*2}d`):dmgDice
      const dmgExpr=`${baseDice}${dmgBonus!==0?(dmgBonus>0?'+':'')+dmgBonus:''}`
      requestDice(dmgExpr,`Damage${isCrit?' (CRIT!)':''}${sneakDice?` + ${sneakDice} Sneak`:''}`,(baseDmg)=>{
        let finalDmg=baseDmg
        if(sneakDice){const sx=isCrit?sneakDice.replace(/^(\d+)d/,(_,n)=>`${parseInt(n)*2}d`):sneakDice;finalDmg+=rollDice(sx).total;setSneakUsed(true)}
        addLog('attack',{actor:player.name,target:target.name,weapon:weapon.name,roll:rolls[0],bonus:atkBonus,total,ac:target.ac,hits:true,isCrit,damage:finalDmg,damageType:weapon.type||'slashing'})
        applyDamageToEnemy(target.id,finalDmg)
        setActionUsed(true);resetTargeting();returnToPlayerPhase()
      })
    })
  }

  // FIX 5: normalise spell def — maps spellData.js fields to combat fields
  function normalizeSpellDef(def,slotLevel){
    if(!def)return def
    const charLvl=character.level||1
    let damageDice=def.damageDice||def.damage||null
    if(typeof damageDice==='function')damageDice=damageDice(slotLevel,charLvl)
    let healDice=def.healDice||null
    if(typeof healDice==='function')healDice=healDice(slotLevel)
    // isDart: covers type:'auto' (Magic Missile) and type:'multi_attack' (Scorching Ray) and explicit canAssignTargets
    const isDart=def.isDart||def.canAssignTargets||def.type==='auto'||def.type==='multi_attack'
    return{...def,
      spellType:def.spellType||(def.type==='attack'?'attack':def.type==='heal'?'heal':def.type==='buff'?'buff':def.type==='save'?'save':null),
      isAttackRoll:def.isAttackRoll||def.type==='attack',
      isHeal:def.isHeal||def.type==='heal',
      isDart,
      castAs:def.castAs||'action',
      castingStat:def.castingStat||def.atkStat||'int',
      damageDice, healDice,
      damageType:def.damageType||def.dmgType||null,
      saveOnHalf:def.saveOnHalf??def.halfOnSave??false,
      statusEffect:def.statusEffect||(def.applyEffect?{effectId:def.applyEffect,duration:def.effectDuration||2}:null),
      rangeType:def.rangeType||def.range||'single',
      targetType:def.targetType||'enemy',
      dartCount:def.dartCount||(def.darts?(s)=>typeof def.darts==='function'?def.darts(s):def.darts:null),
      damagePer:def.damagePer||def.damagePerRay||null,
      concentration:def.concentration||false,
    }
  }

  async function handlePlayerSpell(spellName,slotLevel){
    const slotLevelInt=slotLevel?parseInt(slotLevel,10):null
    const cleanName=spellName.replace(/\s*\(cantrip\)/i,'').trim()
    let spellDef=getSpellDef(cleanName)
    if(!spellDef){setSpellFetching(cleanName);spellDef=await fetchSpell(cleanName);setSpellFetching(null)}
    if(!spellDef&&campaignId){
      const cached=await loadCompiledSpell(cleanName,campaignId)
      if(cached){spellDef=cached}
      else{
        setCompilingSpell(cleanName)
        addLog('action',{actor:player.name,action:`🔮 Compiling "${cleanName}"…`})
        try{const c=await compileSpell({name:cleanName,level:slotLevelInt,campaignId,character});if(c)spellDef=c}catch{}
        setCompilingSpell(null)
      }
    }
    if(!spellDef){addLog('spell',{actor:player.name,spell:cleanName,target:'?',slotLevel:slotLevelInt,damage:0,hits:false,note:'Spell not found.'});setActionUsed(true);return}

    const norm=normalizeSpellDef(spellDef,slotLevelInt)
    const isBonus=norm.castAs==='bonus'||norm.castAs==='reaction'

    // FIX 5: dart path catches Magic Missile (type:'auto'), Scorching Ray (multi_attack), any canAssignTargets
    if(norm.isDart){
      const totalDarts=norm.dartCount?norm.dartCount(slotLevelInt):(slotLevelInt||1)+2
      setDartAssign({spellName:cleanName,spellDef:norm,
        damageDice:norm.damagePer||norm.damageDice||'1d4+1',
        dmgType:norm.damageType||'force',
        statusEffect:norm.statusEffect||null,
        totalDarts,assignments:[],slotLevelInt,isBonus})
      return
    }
    if(spellIsSelfCast(norm)&&!norm.isHeal){resolveBuffSpell(norm,cleanName,slotLevelInt,isBonus);return}
    if(norm.isHeal){resolveHealSpell(norm,cleanName,slotLevelInt,isBonus,selectedTargets[0]||'player');return}
    if(norm.rangeType==='aoe'||norm.targetType==='all_enemies'){resolveAoESpell(norm,cleanName,slotLevelInt,isBonus);return}
    const target=enemies.find(e=>e.id===selectedTargets[0]&&!e.dead)
    if(!target&&spellNeedsEnemyTarget(norm)){addLog('action',{actor:player.name,action:`⚠ Select an enemy for ${cleanName}`});return}
    if(norm.spellType==='attack'||norm.isAttackRoll)resolveAttackSpell(norm,cleanName,slotLevelInt,isBonus,target)
    else if(norm.spellType==='save'||norm.saveStat||norm.damageDice)resolveSaveSpell(norm,cleanName,slotLevelInt,isBonus,target)
    else resolveBuffSpell(norm,cleanName,slotLevelInt,isBonus)
  }

  function finishSpell(isBonus,slotLevel){
    if(isBonus)setBonusUsed(true);else setActionUsed(true)
    spendSlot(slotLevel);resetTargeting();returnToPlayerPhase()
  }

  function resolveBuffSpell(def,name,slot,isBonus){
    const eff=def.statusEffect
    if(eff){addStatusToPlayer(eff.effectId,eff.duration);if(def.concentration)setConcentrationSpell(name,eff.effectId)}
    addLog('spell',{actor:player.name,spell:name,target:player.name,slotLevel:slot,damage:0,hits:true,damageType:'buff',note:[eff?`${STATUS_EFFECTS[eff.effectId]?.name||eff.effectId} for ${eff.duration}t`:null,def.concentration?'⚠ Concentration':null].filter(Boolean).join(' — ')||def.description?.slice(0,80)})
    finishSpell(isBonus,slot)
  }

  function resolveHealSpell(def,name,slot,isBonus,targetId){
    const expr=getHealDiceForSlot(def,slot)
    requestDice(expr,`${name} — Healing`,(total)=>{
      applyHealToPlayer(total)
      if(def.statusEffect)addStatusToPlayer(def.statusEffect.effectId,def.statusEffect.duration)
      addLog('heal',{actor:player.name,spell:name,target:targetId==='player'?player.name:targetId,slotLevel:slot,heal:total})
      finishSpell(isBonus,slot)
    })
  }

  function resolveAoESpell(def,name,slot,isBonus){
    const live=enemies.filter(e=>!e.dead); if(!live.length)return
    const expr=getDamageDiceForSlot(def,slot,character)
    requestDice(expr,`${name} — AoE (${live.length} targets)`,(total)=>{
      for(const e of live){
        const dc=getSpellDC((def.saveStat||'DEX').toLowerCase())
        const sr=def.saveStat?resolveSave({creature:e,stat:def.saveStat,dc}):{success:false}
        const finalDmg=sr.success?(def.saveOnHalf?Math.floor(total/2):0):total
        addLog('spell_aoe',{actor:player.name,spell:name,target:e.name,slotLevel:slot,damage:finalDmg,damageType:def.damageType,saveRoll:sr.total,saveDC:dc,saveSuccess:sr.success})
        if(finalDmg>0)applyDamageToEnemy(e.id,finalDmg)
        if(!sr.success&&def.statusEffect)addStatusToEnemy(e.id,def.statusEffect.effectId,def.statusEffect.duration)
      }
      finishSpell(isBonus,slot)
    })
  }

  function resolveSaveSpell(def,name,slot,isBonus,target){
    if(!target)return
    const dc=getSpellDC((def.saveStat||'DEX').toLowerCase())
    const sr=resolveSave({creature:target,stat:def.saveStat||'DEX',dc})
    addLog('enemy_save',{name:target.name,stat:def.saveStat,dc,roll:sr.dieRoll,mod:sr.mod,total:sr.total,success:sr.success})
    const expr=getDamageDiceForSlot(def,slot,character)
    if(!def.damageDice&&!/d\d/.test(expr)){
      if(!sr.success&&def.statusEffect){addStatusToEnemy(target.id,def.statusEffect.effectId,def.statusEffect.duration);addLog('spell',{actor:player.name,spell:name,target:target.name,slotLevel:slot,damage:0,hits:true,damageType:'control',note:`${STATUS_EFFECTS[def.statusEffect.effectId]?.name||def.statusEffect.effectId} applied`})}
      else addLog('spell',{actor:player.name,spell:name,target:target.name,slotLevel:slot,damage:0,hits:false,note:'Save succeeded'})
      finishSpell(isBonus,slot);return
    }
    requestDice(expr,`${name} damage${sr.success?' (half)':''}`,(total)=>{
      const finalDmg=sr.success?(def.saveOnHalf?Math.floor(total/2):0):total
      addLog('spell',{actor:player.name,spell:name,target:target.name,slotLevel:slot,damage:finalDmg,hits:finalDmg>0,damageType:def.damageType})
      if(finalDmg>0)applyDamageToEnemy(target.id,finalDmg)
      if(!sr.success&&def.statusEffect)addStatusToEnemy(target.id,def.statusEffect.effectId,def.statusEffect.duration)
      finishSpell(isBonus,slot)
    })
  }

  function resolveAttackSpell(def,name,slot,isBonus,target){
    if(!target)return
    const atkMod=getSpellcastingMod(def.castingStat||'int')+(character.proficiency_bonus||2)
    requestDice(`1d20${atkMod>=0?'+':''}${atkMod}`,`${def.icon||'✨'} ${name} vs ${target.name} (AC ${target.ac})`,(total,rolls,isCrit)=>{
      if(!isCrit&&total<target.ac){addLog('spell',{actor:player.name,spell:name,target:target.name,slotLevel:slot,damage:0,hits:false,damageType:def.damageType});finishSpell(isBonus,slot);return}
      let expr=getDamageDiceForSlot(def,slot,character)
      if(isCrit)expr=expr.replace(/(\d+)d/g,(_,n)=>`${parseInt(n)*2}d`)
      requestDice(expr,`${name} damage${isCrit?' (CRIT!)':''}`,(dmgTotal)=>{
        addLog('spell',{actor:player.name,spell:name,target:target.name,slotLevel:slot,damage:dmgTotal,hits:true,isCrit,damageType:def.damageType})
        applyDamageToEnemy(target.id,dmgTotal)
        if(def.statusEffect)addStatusToEnemy(target.id,def.statusEffect.effectId,def.statusEffect.duration)
        if(/vampiric|life drain/i.test(name)){const h=Math.floor(dmgTotal/2);applyHealToPlayer(h);addLog('heal',{actor:player.name,spell:name,target:player.name,heal:h,note:'life drain'})}
        finishSpell(isBonus,slot)
      })
    })
  }


  // Dart assignment
  function assignDart(targetId){if(!dartAssign||dartAssign.assignments.length>=dartAssign.totalDarts)return;setDartAssign(prev=>({...prev,assignments:[...prev.assignments,targetId]}))}
  function removeDart(idx){setDartAssign(prev=>({...prev,assignments:prev.assignments.filter((_,i)=>i!==idx)}))}
  function confirmDartAssignment(){
    if(!dartAssign||dartAssign.assignments.length!==dartAssign.totalDarts)return
    const{spellName,damageDice,dmgType,statusEffect,assignments,slotLevelInt,isBonus,totalDarts}=dartAssign
    setDartAssign(null)
    const groups={};for(const t of assignments)groups[t]=(groups[t]||0)+1
    const allRolls=Array.from({length:totalDarts},()=>rollDice(damageDice||'1d4+1'))
    let idx=0
    for(const[tId,count]of Object.entries(groups)){
      let dmg=0;for(let i=0;i<count;i++)dmg+=allRolls[idx++].total
      const t=enemies.find(e=>e.id===tId)
      addLog('spell',{actor:player.name,spell:spellName,target:t?.name||tId,slotLevel:slotLevelInt,damage:dmg,hits:true,damageType:dmgType||'force',note:`${count} dart${count>1?'s':''}`})
      applyDamageToEnemy(tId,dmg)
      if(statusEffect)addStatusToEnemy(tId,statusEffect.effectId,statusEffect.duration)
    }
    finishSpell(isBonus,slotLevelInt);resetTargeting()
  }

  // Class features
  function handleClassFeature(featureId){
    const feat=Object.values(CLASS_COMBAT_FEATURES[character.class]||{}).find(f=>f.id===featureId); if(!feat)return
    if(featureId==='rage'){
      if((classCharges.rage||0)<=0){addLog('action',{actor:player.name,action:'No Rage charges!'});return}
      setIsRaging(true);setRagingDuration(feat.duration||10);setClassCharges(p=>({...p,rage:p.rage-1}));addStatusToPlayer('raging',feat.duration||10)
      addLog('action',{actor:player.name,action:'🔴 Rage! +2 damage, resist physical.'});setBonusUsed(true);return
    }
    if(featureId==='recklessAttack'){setReckless(true);addLog('action',{actor:player.name,action:'⚡ Reckless Attack! Advantage on attacks, enemies have advantage vs you.'});return}
    if(featureId==='secondWind'){
      if((classCharges.secondWind||0)<=0){addLog('action',{actor:player.name,action:'Second Wind used!'});return}
      requestDice(feat.healDice(character.level||1),'Second Wind',(total)=>{applyHealToPlayer(total);setClassCharges(p=>({...p,secondWind:0}));addLog('heal',{actor:player.name,spell:'Second Wind',target:player.name,heal:total});setBonusUsed(true);returnToPlayerPhase()});return
    }
    if(featureId==='actionSurge'){
      if((classCharges.actionSurge||0)<=0){addLog('action',{actor:player.name,action:'Action Surge used!'});return}
      setClassCharges(p=>({...p,actionSurge:0}));setActionUsed(false);addLog('action',{actor:player.name,action:'⚡ Action Surge! Extra action.'});return
    }
    if(featureId==='divineSmite'){
      const legal=getLegalSlots(), avail=Object.keys(legal).map(Number).sort((a,b)=>a-b)
      if(!avail.length){addLog('action',{actor:player.name,action:'No spell slots!'});return}
      requestDice(`${avail[0]+1}d8`,`Divine Smite (Slot ${avail[0]})`,(total)=>{
        const t=enemies.find(e=>e.id===selectedTargets[0]&&!e.dead)||enemies.find(e=>!e.dead)
        if(t){applyDamageToEnemy(t.id,total);addLog('spell',{actor:player.name,spell:'Divine Smite',target:t.name,slotLevel:avail[0],damage:total,hits:true,damageType:'radiant'})}
        spendSlot(String(avail[0]));setBonusUsed(true);returnToPlayerPhase()
      });return
    }
    if(featureId==='layOnHands'){
      if(layOnHandsPool<=0){addLog('action',{actor:player.name,action:'Lay on Hands pool empty!'});return}
      const toHeal=Math.min(layOnHandsPool,player.maxHp-player.hp)
      applyHealToPlayer(toHeal);setLayOnHandsPool(p=>p-toHeal);addLog('heal',{actor:player.name,spell:'Lay on Hands',target:player.name,heal:toHeal});setActionUsed(true);return
    }
    if(featureId==='stunningStrike'){
      if((classCharges.ki||0)<=0){addLog('action',{actor:player.name,action:'No Ki!'});return}
      const t=enemies.find(e=>e.id===selectedTargets[0]&&!e.dead)
      if(!t){addLog('action',{actor:player.name,action:'Select a target.'});return}
      const dc=8+(character.proficiency_bonus||2)+abilityMod(character.wisdom||10)
      const sr=resolveSave({creature:t,stat:'CON',dc});setClassCharges(p=>({...p,ki:p.ki-1}))
      if(!sr.success){addStatusToEnemy(t.id,'stunned',1);addLog('action',{actor:player.name,action:`Stunning Strike! ${t.name} stunned (${sr.total} vs DC ${dc}).`})}
      else addLog('action',{actor:player.name,action:`Stunning Strike: ${t.name} resists (${sr.total} vs DC ${dc}).`})
      return
    }
    addLog('bonus_action',{actor:player.name,action:feat.name});setBonusUsed(true)
  }

  // Player at 0 HP
  function handlePlayerAtZeroHP(){
    addLog('death',{name:playerRef.current.name,isPlayer:true})
    setPlayer(prev=>({...prev,hp:0,deathSaveSuccesses:0,deathSaveFailures:0,stable:false}))
    setTimeout(triggerDeathSavingThrow,800)
  }

  // ENEMY TURNS
  const runEnemyTurns = useCallback(async()=>{
    const cp=playerRef.current, live=enemiesRef.current.filter(e=>!e.dead)
    if(!live.length)return
    let updatedHP=cp.hp
    for(const enemy of live){
      await new Promise(r=>setTimeout(r,900))
      const isStunned=enemy.statusEffects?.some(s=>STATUS_EFFECTS[s.effectId]?.skipTurn)
      if(isStunned){addLog('action',{actor:enemy.name,action:`${enemy.name} is stunned — loses turn!`});continue}
      // ── ABILITY SYSTEM: deterministic enemy decisions ────────────
      // 1. Get passive modifiers (Pack Tactics, etc.)
      const passives = getPassiveModifiers(enemy.abilities || [], enemy,
        { allyNearby: live.filter(e=>e.id!==enemy.id&&!e.dead).length>0 })

      // 2. Resolve turn-start auto-abilities (on_turn_start trigger)
      const turnStartResults = resolveTurnStartAbilities(
        enemy.abilities || [], enemy, cp, { allyNearby: live.length>1 })
      for(const tsr of turnStartResults){
        if(tsr.damage>0){
          updatedHP=Math.max(0,updatedHP-tsr.damage)
          setPlayer(prev=>({...prev,hp:updatedHP}))
        }
        if(tsr.healing>0)
          setEnemies(prev=>prev.map(e=>e.id===enemy.id?{...e,hp:Math.min(e.maxHp,e.hp+tsr.healing)}:e))
        addLog('action',{actor:enemy.name,action:tsr.narrativeContext})
        if(updatedHP<=0){handlePlayerAtZeroHP();return}
      }

      // 3. Tick cooldowns (runs every turn regardless of action taken)
      setEnemies(prev=>prev.map(e=>
        e.id===enemy.id?{...e,abilityCooldowns:tickCooldowns(e.abilityCooldowns||{})}:e))

      // 4. Choose best active ability using structured conditions
      const allLive = enemiesRef.current.filter(e=>!e.dead)
      const chosen  = chooseEnemyAbility(enemy, cp, allLive, round)

      // 5. Fall back to first attack if no ability chosen, or convert legacy attack to ability
      const abilityToUse = chosen
        || (enemy.attacks?.[0] ? attackToAbility(enemy.attacks[0], enemy.name) : null)
      if(!abilityToUse) continue

      // 6. Execute ability — engine computes outcome, no AI involved
      const context = {
        profBonus:  2,
        advantage:  passives.attackAdvantage,
        allyNearby: allLive.filter(e=>e.id!==enemy.id).length>0,
      }
      const abilResult = executeAbility(abilityToUse, enemy, cp, context)

      // 7. Apply state changes
      if(abilResult.damage>0){
        updatedHP=Math.max(0,updatedHP-abilResult.damage)
        setPlayer(prev=>({...prev,hp:updatedHP}))
      }
      if(abilResult.healing>0)
        setEnemies(prev=>prev.map(e=>e.id===enemy.id?{...e,hp:Math.min(e.maxHp,e.hp+abilResult.healing)}:e))
      for(const cond of (abilResult.conditionsApplied||[])){
        if(cond.statusId){
          // Conditions targeting player vs self
          const targetsPlayer = abilityToUse.targeting?.type!=='self'
          if(targetsPlayer) queuePlayerSave({
            stat: cond.saveStatOverride || 'CON', dc: cond.dcOverride || 12,
            label: `${cond.saveStatOverride||'CON'} Save DC ${cond.dcOverride||12} — resist ${cond.statusId}`,
            onFail:()=>addStatusToPlayer(cond.statusId, cond.duration||2),
            onSuccess:()=>addLog('action',{actor:cp.name,action:`Resisted ${cond.statusId}!`}),
          })
          else addStatusToEnemy(enemy.id, cond.statusId, cond.duration||2)
        }
      }

      // 8. Set cooldown on used ability
      if(abilityToUse.cooldown>0)
        setEnemies(prev=>prev.map(e=>e.id===enemy.id?
          {...e,abilityCooldowns:usedAbility(e.abilityCooldowns||{},abilityToUse.id,abilityToUse.cooldown)}:e))

      // 9. Log with exact mechanical outcome (LLM narrates this in GamePage after combat)
      const flavor=enemy.flavor?.[Math.floor(Math.random()*(enemy.flavor?.length||1))]||'acts'
      addLog('enemy_attack',{
        actor:enemy.name, target:cp.name,
        weapon:abilityToUse.name, flavor,
        roll:abilResult.rolls?.[0]?.result||0,
        bonus:abilResult.rolls?.[0]?.modifier||0,
        total:(abilResult.rolls?.[0]?.result||0)+(abilResult.rolls?.[0]?.modifier||0),
        ac:cp.ac, hits:abilResult.hits!==false, isCrit:abilResult.isCrit,
        damage:abilResult.damage, damageType:abilResult.damageType,
        saveResult:abilResult.saveResult,
      })

      // 10. OA opportunity (structural, not controlled by ability system)
      const hasSentinel=(characterRef.current?.feats||[]).includes('Sentinel')
      if((hasSentinel||Math.random()<0.2)&&!reactionUsed&&!enemy.dead)setOpportunityTarget(enemy.id)

      if(updatedHP<=0){await new Promise(r=>setTimeout(r,400));handlePlayerAtZeroHP();return}
    }
    await new Promise(r=>setTimeout(r,400))
    tickStatusEffects()
    addLog('turn_marker',{round})
    setRound(r=>r+1)
    setActionUsed(false);setBonusUsed(false);setReactionUsed(false);setReckless(false);setSneakUsed(false)
    setOpportunityTarget(null)
    if(isRaging)setRagingDuration(prev=>{if(prev<=1){setIsRaging(false);addLog('action',{actor:playerRef.current.name,action:'Rage ends.'});return 0}return prev-1})
    setPhase(PHASES.PLAYER)
  },[enemies,round,isRaging,player.name]) // eslint-disable-line

  async function resolveEnemySpell(enemy,spell,cp,updatedHP){
    addLog('enemy_spell_cast',{actor:enemy.name,spell:spell.name,icon:spell.icon})
    await new Promise(r=>setTimeout(r,500))
    if(spell.type==='heal'){const hr=rollDice(spell.healDice||'1d4+2');const newHp=Math.min(enemy.maxHp,enemy.hp+hr.total);setEnemies(prev=>prev.map(e=>e.id===enemy.id?{...e,hp:newHp}:e));addLog('enemy_heal',{actor:enemy.name,spell:spell.name,heal:hr.total,newHp});return}
    if(spell.type==='buff'){const eff=STATUS_EFFECTS[spell.applyEffect];if(eff)setEnemies(prev=>prev.map(e=>e.id===enemy.id?{...e,statusEffects:[...(e.statusEffects||[]),{effectId:spell.applyEffect,name:eff.name,duration:spell.effectDuration||2,icon:eff.icon,color:eff.color}]}:e));addLog('action',{actor:enemy.name,action:`${enemy.name} casts ${spell.name}!`});return}
    if(spell.type==='save'||spell.type==='aoe'){
      const dc=spell.dc||13
      addLog('action',{actor:enemy.name,action:`${enemy.name} casts ${spell.name}! Roll ${spell.saveStat||'DEX'} save DC ${dc}!`})
      queuePlayerSave({stat:spell.saveStat||'DEX',dc,label:`${spell.saveStat||'DEX'} Save DC ${dc} — ${spell.name}`,
        onFail:()=>{const dmg=rollDice(spell.damage||'1d6');const newHP=Math.max(0,playerRef.current.hp-dmg.total);setPlayer(prev=>({...prev,hp:newHP}));addLog('enemy_spell_hit',{actor:enemy.name,spell:spell.name,target:cp.name,damage:dmg.total,dmgType:spell.dmgType,saveSuccess:false});if(spell.applyEffect)addStatusToPlayer(spell.applyEffect,spell.effectDuration||2);if(newHP<=0)handlePlayerAtZeroHP()},
        onSuccess:()=>{if(spell.halfOnSave){const h=Math.floor(rollDice(spell.damage||'0').total/2);if(h>0)setPlayer(prev=>({...prev,hp:Math.max(0,prev.hp-h)}));addLog('enemy_spell_hit',{actor:enemy.name,spell:spell.name,target:cp.name,damage:h,dmgType:spell.dmgType,saveSuccess:true})}
        else addLog('enemy_spell_hit',{actor:enemy.name,spell:spell.name,target:cp.name,damage:0,dmgType:spell.dmgType,saveSuccess:true})}})
      return
    }
    if(spell.type==='attack'){
      const d20=roll(20),total=d20+(spell.attackBonus||4),hits=d20===20||total>=cp.ac
      if(hits){const dmg=rollDice(spell.damage||'1d6');const newHP=Math.max(0,updatedHP-dmg.total);setPlayer(prev=>({...prev,hp:newHP}));addLog('enemy_spell_hit',{actor:enemy.name,spell:spell.name,target:cp.name,damage:dmg.total,dmgType:spell.dmgType,roll:d20,total,ac:cp.ac,hits:true});if(spell.applyEffect)addStatusToPlayer(spell.applyEffect,spell.effectDuration||2);if(newHP<=0){handlePlayerAtZeroHP();return newHP}return newHP}
      else addLog('enemy_spell_hit',{actor:enemy.name,spell:spell.name,target:cp.name,damage:0,hits:false,roll:d20,total,ac:cp.ac})
    }
  }

  function endPlayerTurn(){
    if(player.hp<=0&&!player.stable)return
    const live=enemies.filter(e=>!e.dead)
    if(!live.length){triggerVictory();return}
    // FIX 5b: clear OA target when turn ends so banner can't show mid-enemy-loop
    setOpportunityTarget(null)
    addLog('turn_marker',{round,whose:player.name})
    setPhase(PHASES.ENEMY);setTimeout(runEnemyTurns,400)
  }

  function triggerVictory(){
    setPhase(PHASES.END)
    const dead=enemies.filter(e=>e.dead)
    const xp=dead.reduce((s,e)=>s+(e.xp||50),0)
    let gold=0;const items=[]
    for(const e of dead){const drop=rollLoot(e.name,e.cr);gold+=drop.gold;if(drop.item)items.push(drop.item)}
    setLoot({totalGold:gold,items});addLog('combat_end',{victory:true,xpGained:xp,gold});generateSummary(true,xp)
  }

  useEffect(()=>{
    const live=enemies.filter(e=>!e.dead)
    if(!live.length&&[PHASES.PLAYER,PHASES.ENEMY].includes(phase)&&log.length>2)triggerVictory()
  },[enemies]) // eslint-disable-line

  async function generateSummary(victory,xpGained){
    setGenerating(true)
    const logText=log.map(e=>{
      if(e.type==='attack'||e.type==='enemy_attack')return `${e.actor} ${e.hits?`hit ${e.target} for ${e.damage}`:`missed ${e.target}`}`
      if(e.type==='spell')return `${e.actor} cast ${e.spell}: ${e.damage>0?`${e.damage} damage`:'no damage'}`
      if(e.type==='heal')return `${e.actor} healed for ${e.heal} HP`
      if(e.type==='death')return `${e.name} ${e.isPlayer?'fell':'slain'}`
      return ''
    }).filter(Boolean).join('\n')
    try{const t=await callAI([{role:'user',content:`Write a vivid 2-paragraph D&D battle narrative. Third person, past tense.\nHero: ${character.name}, Lv${character.level} ${character.race} ${character.class}\nEnemies: ${enemies.map(e=>e.name).join(', ')}\nResult: ${victory?'Hero victorious':'Hero defeated'}\nEvents:\n${logText}\nWrite only the narrative.`}],400);setSummary({narrative:t.trim(),xpGained:xpGained||0,victory})}
    catch{setSummary({narrative:victory?'Victory!':'Defeated.',xpGained:xpGained||0,victory})}
    setGenerating(false)
  }

  // FIX 1 + FIX 3: handleReplay
  function handleReplay(){
    const freshEnemies=buildEnemyList(enemyNames,character.level)
    setPlayer(buildPlayerState(character))
    setEnemies(freshEnemies)
    setPhase(PHASES.PLAYER);setRound(1);setLog([])
    setActionUsed(false);setBonusUsed(false);setReactionUsed(false);setReckless(false);setSneakUsed(false)
    setIsRaging(false);setRagingDuration(0);setConcentration(null);setOpportunityTarget(null)
    setDiceRequest(null);setDicePool([]);setDartAssign(null);setSelectedSlot(null)
    setPendingPlayerSaves([])  // FIX 3: clear stale saves
    setClassCharges(initCharges(character))
    setLayOnHandsPool((CLASS_COMBAT_FEATURES[character.class]?.layOnHands?.pool(character.level||1))||0)
    setSummary(null);setLoot(null)
    loadMonsterStats(freshEnemies)  // FIX 1: reload stats for fresh enemies
  }

  // Derived
  const availableSlots=getLegalSlots()  // FIX 4
  const knownSpells=(character.spells||[]).map(s=>s.replace(/\s*\(cantrip\)/i,'').trim())
  const isPlayerTurn=phase===PHASES.PLAYER
  const liveEnemies=enemies.filter(e=>!e.dead)

  // ── Log renderer ─────────────────────────────────────────
  function renderLog(entry) {
    switch(entry.type) {
      case 'initiative': return <div className="log-initiative">⚔️ Initiative: {entry.entries.join(' · ')}</div>
      case 'attack': case 'enemy_attack': return (
        <div className={`log-entry ${entry.type==='enemy_attack'?'log-enemy':'log-player'}`}>
          <span className="log-actor">{entry.actor}</span>
          <span className="log-verb">{entry.flavor||`attacks ${entry.target}`}</span>
          {entry.packTactics&&<span className="log-tag">Pack Tactics</span>}
          {entry.isCrit&&<span className="log-tag crit">CRIT!</span>}
          {entry.isFumble&&<span className="log-tag fumble">FUMBLE</span>}
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
          {entry.slotLevel&&<span className="log-tag">Lv{entry.slotLevel}</span>}
          {entry.note&&<span className="log-tag">{entry.note}</span>}
          <span className="log-target">→ {entry.target}</span>
          <span className={`log-result ${entry.hits?'hit':'miss'}`}>{entry.damage>0?`${entry.damage} ${entry.damageType}`:entry.note||'NO DAMAGE'}</span>
        </div>
      )
      case 'spell_aoe': return (
        <div className="log-entry log-player log-spell">
          <span className="log-actor">{entry.actor}</span>
          <span className="log-verb">AoE → {entry.target}</span>
          {entry.saveRoll&&<span className="log-math">DC {entry.saveDC}: {entry.saveRoll} {entry.saveSuccess?'✓':'✗'}</span>}
          <span className={`log-result ${entry.damage>0?'hit':'miss'}`}>{entry.damage>0?`${entry.damage} ${entry.damageType}`:'SAVED'}</span>
        </div>
      )
      case 'heal': return (
        <div className="log-entry log-heal">
          <span className="log-actor">{entry.actor}</span>
          <span className="log-verb">✨ heals {entry.target}</span>
          {entry.note&&<span className="log-tag">{entry.note}</span>}
          <span className="log-result heal">+{entry.heal} HP</span>
        </div>
      )
      case 'death_save': return (
        <div className={`log-entry ${entry.success?'log-heal':'log-death'}`}>
          💀 <strong>Death Save</strong> — {entry.name} rolled {entry.roll} {entry.success?'✓ SUCCESS':'✗ FAILURE'}{entry.note?` — ${entry.note}`:''}
        </div>
      )
      case 'enemy_spell_cast': return <div className="log-entry log-enemy"><span className="log-actor">{entry.actor}</span><span className="log-verb">{entry.icon} casts {entry.spell}!</span></div>
      case 'enemy_spell_hit': return (
        <div className="log-entry log-enemy log-spell">
          <span className="log-actor">{entry.actor}</span>
          <span className="log-verb">→ {entry.target}</span>
          {entry.roll&&<span className="log-math">{entry.roll}={entry.total} vs AC {entry.ac}</span>}
          <span className={`log-result ${entry.hits||entry.damage>0?'hit':'miss'}`}>{entry.damage>0?`${entry.damage} ${entry.dmgType}`:'MISS / SAVED'}</span>
        </div>
      )
      case 'enemy_heal': return <div className="log-entry log-enemy"><span className="log-actor">{entry.actor}</span><span className="log-verb">💚 heals {entry.heal} HP ({entry.newHp} HP)</span></div>
      case 'status_tick': return <div className="log-entry log-status"><span className="log-actor">{entry.creature}</span><span className="log-verb">{entry.icon} {entry.effect} — {entry.damage} dmg</span></div>
      case 'status_applied': return <div className="log-save">⚠ {entry.target} is now {entry.effect}</div>
      case 'enemy_save': return <div className="log-save">{entry.name} {entry.stat} save: {entry.total} vs DC {entry.dc} — {entry.success?'✓ PASS':'✗ FAIL'}</div>
      case 'player_save': return <div className="log-save">You: {entry.stat} save {entry.total} vs DC {entry.dc} — {entry.success?'✓ Saved!':'✗ Failed'}</div>
      case 'death': return <div className={`log-entry ${entry.isPlayer?'log-death-player':'log-death'}`}>☠️ <strong>{entry.name}</strong> {entry.isPlayer?'falls unconscious!':'slain!'}</div>
      case 'turn_marker': return <div className="log-divider">── Round {entry.round||''} End ──</div>
      case 'combat_end': return <div className="log-entry log-end">{entry.victory?`⚔️ Victory! +${entry.xpGained} XP`:''}{entry.gold>0?` · +${entry.gold} gp`:''}</div>
      case 'action': return <div className="log-entry log-player"><span className="log-actor">{entry.actor}</span><span className="log-verb">{entry.action}</span></div>
      case 'bonus_action': return <div className="log-entry log-player"><span className="log-actor">{entry.actor}</span><span className="log-verb">⚡ {entry.action}</span></div>
      default: return null
    }
  }

  // ════════════════════════════════════════════════════════
  // SCREENS
  // ════════════════════════════════════════════════════════

  if (phase === PHASES.DEFEAT) {
    return (
      <div className="cs-defeat-screen">
        <div className="cs-defeat-inner">
          <div className="cs-defeat-icon">💀</div>
          <h2 className="cs-defeat-title">You have fallen…</h2>
          <p className="cs-defeat-sub">{character.name} has died.</p>
          <div className="cs-defeat-choices">
            <button className="cs-defeat-btn cs-replay-btn" onClick={handleReplay}>🔄 Replay Fight</button>
            <button className="cs-defeat-btn cs-bear-btn" onClick={() => onCombatEnd({ victory:false, narrative:`${character.name} was slain.`, playerHP:1, xpGained:0 })}>
              ⚔️ Bear the Consequences
            </button>
          </div>
        </div>
      </div>
    )
  }

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
              {loot.totalGold > 0 && <div className="cs-loot-row">💰 {loot.totalGold} gp</div>}
              {loot.items.map((item,i) => <div key={i} className="cs-loot-row">📦 {item}</div>)}
            </div>
          )}
          {generating
            ? <div className="cs-summary-loading"><span/><span/><span/></div>
            : <div className="cs-summary-text">{summary.narrative.split('\n\n').map((p,i)=><p key={i}>{p}</p>)}</div>
          }
          <button className="cs-summary-btn" disabled={generating}
            onClick={() => onCombatEnd({ victory:true, xpGained:summary.xpGained, narrative:summary.narrative, playerHP:player.hp, loot })}>
            Continue Story →
          </button>
        </div>
      </div>
    )
  }

  // Dice roll screen — used for attacks, saves, concentration, AND death saves
  // FIX 4b: death save progress pips shown when phase === DEATH_SAVE
  if ((phase === PHASES.ROLL || phase === PHASES.DEATH_SAVE) && diceRequest) {
    const allRolled = dicePool.every(r => r > 0)
    const total     = allRolled ? dicePool.reduce((s,r) => s+r, 0) + (diceRequest.bonus||0) : null
    const isCrit    = allRolled && diceRequest.sides === 20 && dicePool[0] === 20
    const isFumble  = allRolled && diceRequest.sides === 20 && dicePool[0] === 1
    return (
      <div className="cs-dice-screen">
        <div className="cs-dice-panel">
          <div className="cs-dice-title">{diceRequest.label}</div>
          <div className="cs-dice-expr">{diceRequest.expr}</div>
          {phase === PHASES.DEATH_SAVE && (
            <div style={{display:'flex',gap:'16px',justifyContent:'center',margin:'8px 0'}}>
              <div style={{color:'#4ecb71',fontSize:'.8rem'}}>✓ Successes: {'●'.repeat(player.deathSaveSuccesses)}{'○'.repeat(3-player.deathSaveSuccesses)}</div>
              <div style={{color:'#e05050',fontSize:'.8rem'}}>✗ Failures: {'●'.repeat(player.deathSaveFailures)}{'○'.repeat(3-player.deathSaveFailures)}</div>
            </div>
          )}
          <div className="cs-dice-pool">
            {dicePool.map((val,i) => (
              <button key={i}
                className={`cs-die-btn ${val>0?'rolled':''} ${val===diceRequest.sides&&diceRequest.sides===20?'max':''} ${val===1&&diceRequest.sides===20?'min':''}`}
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
              {isCrit   && <div className="cs-dice-crit">⭐ CRITICAL!</div>}
              {isFumble && <div className="cs-dice-fumble">💀 Fumble!</div>}
              <div className="cs-dice-total">{total}</div>
            </div>
          )}
          <div className="cs-dice-actions">
            <button className="cs-roll-all-btn" onClick={rollAllDice} disabled={allRolled}>🎲 Roll All</button>
            <button className="cs-confirm-btn"  onClick={confirmDiceRoll} disabled={!allRolled}>✓ Confirm</button>
          </div>
        </div>
      </div>
    )
  }

  // Dart assignment screen
  if (dartAssign) {
    const assigned  = dartAssign.assignments.length
    const remaining = dartAssign.totalDarts - assigned
    return (
      <div className="cs-root">
        <div className="cs-dart-screen">
          <div className="cs-dart-panel">
            <div className="cs-dart-title">{dartAssign.spellName} {dartAssign.spellDef?.icon||'✨'}</div>
            <div className="cs-dart-subtitle">Assign {dartAssign.totalDarts} dart{dartAssign.totalDarts>1?'s':''} to targets</div>
            <div className="cs-dart-progress">
              {Array.from({length:dartAssign.totalDarts}).map((_,i) => (
                <div key={i} className={`cs-dart-pip ${i<assigned?'assigned':'empty'}`}>{i<assigned?'✦':'○'}</div>
              ))}
            </div>
            <div className="cs-dart-remaining">{remaining} dart{remaining!==1?'s':''} remaining</div>
            <div className="cs-dart-targets">
              {enemies.filter(e=>!e.dead).map(enemy => (
                <button key={enemy.id} className="cs-dart-target-btn"
                  onClick={() => remaining>0 && assignDart(enemy.id)} disabled={remaining===0}>
                  <div className="cs-dart-target-name">{enemy.name}</div>
                  <div className="cs-dart-target-hp">{enemy.hp}/{enemy.maxHp} HP</div>
                  {dartAssign.assignments.filter(t=>t===enemy.id).length>0 &&
                    <span className="cs-dart-count-badge">{dartAssign.assignments.filter(t=>t===enemy.id).length}✦</span>}
                </button>
              ))}
            </div>
            {assigned > 0 && (
              <div className="cs-dart-assignment-list">
                {dartAssign.assignments.map((tId,i) => {
                  const t = enemies.find(e=>e.id===tId)
                  return (
                    <div key={i} className="cs-dart-assignment-row">
                      <span>Dart {i+1} → {t?.name}</span>
                      <button className="cs-dart-remove" onClick={()=>removeDart(i)}>✕</button>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="cs-dart-actions">
              <button className="cs-cancel-btn" onClick={()=>setDartAssign(null)}>Cancel</button>
              <button className="cs-confirm-btn" onClick={confirmDartAssignment} disabled={assigned!==dartAssign.totalDarts}>
                🎯 Fire! ({dartAssign.totalDarts} darts)
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════
  // MAIN COMBAT UI
  // ════════════════════════════════════════════════════════
  const isDead = player.hp <= 0 && !player.stable

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
          {isDead ? '💀 MAKE A DEATH SAVING THROW' : isPlayerTurn ? '⚔ YOUR TURN' : '⏳ ENEMY TURN'}
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
                  <div className="cs-hp-bar" style={{width:`${Math.max(0,Math.round((enemy.hp/enemy.maxHp)*100))}%`,background:enemy.hp/enemy.maxHp>.5?'#4ecb71':enemy.hp/enemy.maxHp>.25?'#e8b84a':'#e05050'}}/>
                </div>
                <div className="cs-creature-stats">
                  <span className="cs-stat-pill hp">{enemy.dead?0:enemy.hp}/{enemy.maxHp} HP</span>
                  <span className="cs-stat-pill ac">AC {enemy.ac}</span>
                  <span className="cs-stat-pill cr">CR {enemy.cr}</span>
                </div>
                {!enemy.dead && enemy.statusEffects?.length > 0 && (
                  <div className="cs-status-effects">
                    {enemy.statusEffects.map((se,i) => (
                      <span key={i} className="cs-status-badge"
                        style={{borderColor:se.color,color:se.color,background:`${se.color}18`,animation:se.duration<=1?'statusPulse .8s ease-in-out infinite':'none'}}>
                        {se.icon} {se.name} <span className="cs-status-dur">{se.duration}t</span>
                      </span>
                    ))}
                  </div>
                )}
                {!enemy.dead && enemy.attacks?.map((a,i) => <div key={i} className="cs-atk-pill">{a.name}: +{a.bonus} / {a.damage}</div>)}
              </button>
            )
          })}
        </div>

        <div className="cs-vs">VS</div>

        {/* Player */}
        <div className="cs-player-card">
          <div className="cs-creature-name">{player.name}</div>
          <div className="cs-hp-bar-wrap">
            <div className="cs-hp-bar" style={{width:`${Math.max(0,Math.round((player.hp/player.maxHp)*100))}%`,background:player.hp/player.maxHp>.5?'#4ecb71':player.hp/player.maxHp>.25?'#e8b84a':'#e05050'}}/>
          </div>
          <div className="cs-creature-stats">
            <span className="cs-stat-pill hp">{player.hp}/{player.maxHp} HP</span>
            <span className="cs-stat-pill ac">AC {player.ac}</span>
            <span className="cs-stat-pill">Lv {character.level}</span>
          </div>
          {isDead && (
            <div style={{display:'flex',gap:'12px',justifyContent:'center',marginTop:'4px'}}>
              <span style={{color:'#4ecb71',fontSize:'.75rem'}}>✓ {'●'.repeat(player.deathSaveSuccesses)}{'○'.repeat(3-player.deathSaveSuccesses)}</span>
              <span style={{color:'#e05050',fontSize:'.75rem'}}>✗ {'●'.repeat(player.deathSaveFailures)}{'○'.repeat(3-player.deathSaveFailures)}</span>
            </div>
          )}
          {player.stable && <div style={{color:'#4ecb71',fontSize:'.75rem',textAlign:'center'}}>💚 Stable</div>}
          {player.statusEffects?.length > 0 && (
            <div className="cs-status-effects">
              {player.statusEffects.map((se,i) => (
                <span key={i} className="cs-status-badge" style={{borderColor:se.color,color:se.color,background:`${se.color}18`}}>
                  {se.icon} {se.name} <span className="cs-status-dur">{se.duration}</span>
                </span>
              ))}
            </div>
          )}
          <div className="cs-economy">
            <div className={`cs-pip action ${actionUsed?'used':''}`}>A</div>
            <div className={`cs-pip bonus ${bonusUsed?'used':''}`}>B</div>
            <div className={`cs-pip reaction ${reactionUsed?'used':''}`}>R</div>
          </div>
        </div>

        {/* Targeting bar — hidden when dead */}
        {isPlayerTurn && !isDead && (
          <div className="cs-targeting-bar">
            <span className="cs-targeting-label">Target:</span>
            <button className={`cs-target-mode-btn ${targetMode===TARGET_MODE.SINGLE_ENEMY&&selectedTargets[0]!=='player'?'active':''}`}
              onClick={()=>{setTargetMode(TARGET_MODE.SINGLE_ENEMY);setSelectedTargets([])}}>🎯 Single</button>
            <button className={`cs-target-mode-btn ${targetMode===TARGET_MODE.AOE?'active':''}`} onClick={selectAoE}>💥 AoE</button>
            <button className={`cs-target-mode-btn ${selectedTargets[0]==='player'?'active':''}`} onClick={selectSelf}>🧍 Self</button>
            {selectedTargets.length>0 && <button className="cs-target-clear-btn" onClick={resetTargeting}>✕</button>}
          </div>
        )}
      </div>

      {/* Right: Actions */}
      <div className="cs-action-panel">
        <div className="cs-action-header">
          {selectedTargets.length===0
            ? <span className="cs-target-hint">{isPlayerTurn?'Select a target above':'Enemies acting…'}</span>
            : selectedTargets[0]==='player'
              ? <span className="cs-target-label" style={{color:'#a0c8ff'}}>🧍 Self</span>
              : <span className="cs-target-label">🎯 {enemies.find(e=>e.id===selectedTargets[0])?.name}</span>
          }
        </div>

        <div className="cs-tabs">
          {['actions','spells','bonus'].map(tab => (
            <button key={tab} className={`cs-tab ${activeTab===tab?'active':''}`} onClick={()=>setActiveTab(tab)}>
              {tab==='actions'?'⚔️ Actions':tab==='spells'?'✨ Spells':'⚡ Bonus'}
            </button>
          ))}
        </div>

        <div className="cs-action-body">
          {!isPlayerTurn && <div className="cs-waiting">Enemies are acting…</div>}

          {/* ACTIONS TAB */}
          {isPlayerTurn && !isDead && activeTab==='actions' && (
            <div className="cs-action-list">
              <button
                className={`cs-action-btn primary ${(!selectedTargets.length||selectedTargets[0]==='player'||actionUsed)?'disabled':''}`}
                onClick={handlePlayerAttack}
                disabled={!selectedTargets.length||selectedTargets[0]==='player'||actionUsed}>
                <span className="cs-ab-icon">⚔️</span>
                <span className="cs-ab-name">Attack</span>
                <span className="cs-ab-detail">{getWeaponName()} · +{getPlayerAttackBonus()} · {getPlayerDamageDice()}</span>
              </button>
              {['Dash','Dodge','Disengage','Help','Hide'].map(a => (
                <button key={a} className={`cs-action-btn ${actionUsed?'disabled':''}`}
                  onClick={()=>{if(!actionUsed){addLog('action',{actor:player.name,action:a});setActionUsed(true)}}}
                  disabled={actionUsed}>
                  <span className="cs-ab-name">{a}</span>
                </button>
              ))}
            </div>
          )}

          {/* SPELLS TAB */}
          {isPlayerTurn && !isDead && activeTab==='spells' && (
            <div className="cs-spell-panel">
              {knownSpells.length===0 && <div className="cs-empty">No spells known.</div>}
              {Object.keys(availableSlots).length>0 && (
                <div className="cs-slot-row">
                  <span className="cs-slot-label">Slot:</span>
                  {Object.entries(availableSlots).map(([lvl,count]) => (
                    <button key={lvl} className={`cs-slot-btn ${selectedSlot===lvl?'active':''}`}
                      onClick={()=>setSelectedSlot(p=>p===lvl?null:lvl)}>
                      Lv{lvl} ({count})
                    </button>
                  ))}
                </div>
              )}
              <div className="cs-spell-list">
                {knownSpells.map(spell => {
                  const cleanSpell = spell.replace(/\s*\(cantrip\)/i,'').trim()
                  const isCantrip  = (character.spells||[]).some(s=>s.toLowerCase().includes(cleanSpell.toLowerCase())&&s.toLowerCase().includes('cantrip'))
                  const isFetching = spellFetching===cleanSpell||compilingSpell===cleanSpell
                  const disabled   = actionUsed||isFetching||(!isCantrip&&!selectedSlot)
                  return (
                    <button key={spell}
                      className={`cs-spell-btn ${isCantrip?'cantrip':''} ${disabled?'disabled':''} ${isFetching?'fetching':''}`}
                      onClick={()=>!disabled&&handlePlayerSpell(spell,selectedSlot?parseInt(selectedSlot,10):null)}
                      disabled={disabled}>
                      <div className="cs-spell-info">
                        <span className="cs-sb-name">{isFetching?'⏳':'✨'} {cleanSpell}</span>
                        <span className="cs-sb-desc">{isFetching?'Loading…':isCantrip?'Cantrip — free cast':selectedSlot?`Cast at level ${selectedSlot}`:'Select a slot above'}</span>
                      </div>
                      <div className="cs-spell-badges">
                        {isCantrip&&<span className="cs-spell-target-badge cantrip">∞</span>}
                        {!isCantrip&&<span className="cs-sb-type">{selectedSlot?`Lv${selectedSlot}`:'—'}</span>}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* BONUS ACTIONS TAB */}
          {isPlayerTurn && !isDead && activeTab==='bonus' && (
            <div className="cs-action-list">
              {Object.entries(CLASS_COMBAT_FEATURES[character.class]||{}).map(([id,feat]) => {
                const charges = classCharges[id]
                const outOfCharges = charges!==undefined&&charges<=0
                const canUse = !outOfCharges && !(bonusUsed&&!['recklessAttack','divineSmite','layOnHands','actionSurge'].includes(id))
                const label  = [feat.icon||'⚡',feat.name,charges!==undefined?`(${charges}/${typeof feat.charges==='function'?feat.charges(character.level||1):feat.charges})`:null,id==='layOnHands'?`(${layOnHandsPool} HP)`:null].filter(Boolean).join(' ')
                return (
                  <button key={id} className={`cs-action-btn ${!canUse?'disabled':''}`}
                    onClick={()=>handleClassFeature(id)} disabled={!canUse}>
                    <span className="cs-ab-name">{label}</span>
                    <span className="cs-ab-detail" style={{fontSize:'.65rem',opacity:.7}}>
                      {typeof feat.description==='function'?feat.description(character.level||1):feat.description}
                    </span>
                  </button>
                )
              })}
              {/* Bonus-action spells — identified from hardcoded spell dict */}
              {knownSpells.filter(s=>getSpellDef(s.replace(/\s*\(cantrip\)/i,'').trim())?.castAs==='bonus').map(spell => {
                const cleanSpell = spell.replace(/\s*\(cantrip\)/i,'').trim()
                const isFetching = spellFetching===cleanSpell
                const disabled   = bonusUsed||isFetching
                return (
                  <button key={spell} className={`cs-action-btn ${disabled?'disabled':''}`}
                    onClick={()=>!disabled&&handlePlayerSpell(spell,selectedSlot?parseInt(selectedSlot,10):null)}
                    disabled={disabled}>
                    <span className="cs-ab-icon">⚡</span>
                    <span className="cs-ab-name">{cleanSpell}</span>
                    <span className="cs-ab-detail">Bonus action</span>
                  </button>
                )
              })}
              {!Object.keys(CLASS_COMBAT_FEATURES[character.class]||{}).length&&<div className="cs-empty">No class features.</div>}
            </div>
          )}

          {/* Dead but not yet stabilized — show DST info */}
          {isPlayerTurn && isDead && (
            <div style={{padding:'12px',textAlign:'center',color:'#e05050'}}>
              <div style={{fontSize:'1.2rem',marginBottom:'4px'}}>💀 Unconscious</div>
              <div style={{fontSize:'.75rem',color:'var(--parch3,#aaa)'}}>Roll a death saving throw each turn. 3 successes = stable. 3 failures = dead.</div>
              <div style={{display:'flex',gap:'16px',justifyContent:'center',margin:'8px 0'}}>
                <span style={{color:'#4ecb71'}}>✓ {'●'.repeat(player.deathSaveSuccesses)}{'○'.repeat(3-player.deathSaveSuccesses)}</span>
                <span style={{color:'#e05050'}}>✗ {'●'.repeat(player.deathSaveFailures)}{'○'.repeat(3-player.deathSaveFailures)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Status badges */}
        {concentration && (
          <div style={{fontSize:'.72rem',color:'#7ebbff',padding:'2px 8px',background:'rgba(100,150,255,.12)',borderRadius:'6px',border:'1px solid rgba(100,150,255,.25)',flexShrink:0}}>
            🔵 Concentrating: {concentration.spellName}
          </div>
        )}
        {isRaging && (
          <div style={{fontSize:'.72rem',color:'#ff6040',padding:'2px 8px',background:'rgba(255,80,30,.12)',borderRadius:'6px',border:'1px solid rgba(255,80,30,.25)',flexShrink:0}}>
            🔴 Raging ({ragingDuration} rounds)
          </div>
        )}

        {/* FIX 2: OA banner — only shown during PLAYER phase, not during/after End Turn */}
        {isPlayerTurn && !isDead && opportunityTarget && !reactionUsed && (
          <div style={{display:'flex',gap:'6px',alignItems:'center',padding:'4px 8px',background:'rgba(255,160,40,.12)',border:'1px solid rgba(255,160,40,.3)',borderRadius:'7px',fontSize:'.72rem',flexShrink:0}}>
            <span style={{color:'#ffa040'}}>⚡ Opportunity Attack!</span>
            <button style={{padding:'3px 8px',background:'rgba(255,160,40,.2)',border:'1px solid rgba(255,160,40,.4)',borderRadius:'5px',cursor:'pointer',color:'#ffa040',fontSize:'.68rem'}}
              onClick={()=>{
                const target=enemies.find(e=>e.id===opportunityTarget&&!e.dead)
                if(!target){setOpportunityTarget(null);return}
                const atkBonus=getPlayerAttackBonus()
                requestDice(`1d20${atkBonus>=0?'+':''}${atkBonus}`,`⚡ OA vs ${target.name} (AC ${target.ac})`,(total,rolls,isCrit,isFumble)=>{
                  const hits=isCrit||(!isFumble&&total>=target.ac)
                  if(hits){
                    const dmgDice=getPlayerDamageDice(), dmgBonus=getPlayerDamageBonus()
                    requestDice(`${dmgDice}${dmgBonus!==0?(dmgBonus>0?'+':'')+dmgBonus:''}`, 'OA Damage',(dmg)=>{
                      applyDamageToEnemy(target.id,dmg)
                      addLog('attack',{actor:player.name,target:target.name,weapon:getWeaponName(),roll:rolls[0],bonus:atkBonus,total,ac:target.ac,hits:true,isCrit,damage:dmg,damageType:'slashing',note:'Opportunity Attack'})
                      setReactionUsed(true);setOpportunityTarget(null);returnToPlayerPhase()
                    })
                  } else {
                    addLog('attack',{actor:player.name,target:target.name,weapon:getWeaponName(),roll:rolls[0],bonus:atkBonus,total,ac:target.ac,hits:false,note:'OA — missed'})
                    setReactionUsed(true);setOpportunityTarget(null)
                    returnToPlayerPhase() // FIX 2: always restore phase on miss
                  }
                })
              }}>Strike!</button>
            <button style={{padding:'3px 6px',background:'transparent',border:'1px solid rgba(255,255,255,.15)',borderRadius:'5px',cursor:'pointer',color:'#aaa',fontSize:'.65rem'}}
              onClick={()=>setOpportunityTarget(null)}>Pass</button>
          </div>
        )}

        {isPlayerTurn && !isDead && (
          <button className="cs-end-turn" onClick={endPlayerTurn}>⏭ End Turn — Enemies Act</button>
        )}
        {isPlayerTurn && !isDead && (
          <button className="cs-flee" onClick={()=>onCombatEnd({fled:true,narrative:`${character.name} fled.`,playerHP:player.hp})}>🏃 Flee</button>
        )}
      </div>
    </div>
  )
}

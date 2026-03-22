// src/pages/GamePage.js
import { useState, useRef, useEffect } from 'react'
import { useCampaign } from '../hooks/useCampaign'
import { callDM, callOpeningScene, cleanDMText, shouldTriggerCombat, detectPromptMode, callAmbientDetail } from '../lib/openrouter'
import { getPassivePerception, getSkillBonus } from '../lib/dndData'
import { supabase } from '../lib/supabase'
import { migrateToCurrency, formatCurrencyShort, formatCurrency, addGold } from '../lib/currency'
import { retrieveFromSupabase, buildContextBlock, lookupMonsterStats, selectEncounterMonsters } from '../lib/rag'
import { executeSlashCommand } from '../lib/slashCommandExecutor'
import { parseSlashCommand, COMMAND_REGISTRY } from '../lib/slashCommands'
import { ACTION_TYPES, validateAction, resolveAction, buildMechanicalContext } from '../lib/actionPipeline'
import { buildContentContextBlock } from '../lib/contentRegistry'
import { loadCompiledSpell, compileSpell, listCompiledSpells } from '../lib/spellCompiler'
import { getItem, applyItemEffect, detectItemSlot, calculateAC, getEquippedPassives, resolveItem, getEquipStatUpdates, getUnequipStatUpdates } from '../lib/items'
  import {generateStoryArcs, loadStoryArcs, getDominantArc,
  extractArcDeltas, updateArcPower, buildArcPromptBlock, fetchArcLore,
} from '../lib/storyArcs'
import DiceRoller          from '../components/DiceRoller'
import LevelUpModal        from '../components/LevelUpModal'
import RestModal           from '../components/RestModal'
import PreparedSpellsModal from '../components/PreparedSpellsModal'
import SpellSlotTracker    from '../components/SpellSlotTracker'
import SuggestedActions    from '../components/SuggestedActions'
import AmbientSound        from '../components/AmbientSound'
import SessionSummary      from '../components/SessionSummary'
import ConditionsTracker   from '../components/ConditionsTracker'
import NotesPanel          from '../components/NotesPanel'
import CharacterEditModal  from '../components/CharacterEditModal'
import CampaignSetupModal  from '../components/CampaignSetupModal'
import CombatScreen        from '../combat/CombatScreen'
import InventoryModal      from '../components/InventoryModal'
import SkillCheckPanel      from '../components/SkillCheckPanel'
import DeathSavingThrows   from '../components/DeathSavingThrows'
import ArcStatus           from '../components/ArcStatus'
import CompanionPanel      from '../components/CompanionPanel'
import NPCPanel           from '../components/NPCPanel'
import ContentCreator     from '../components/ContentCreator'
import AdventureLog       from '../components/AdventureLog'
import SpellbookPanel     from '../components/SpellbookPanel'
import LootPanel          from '../components/LootPanel'
import MerchantPanel      from '../components/MerchantPanel'
import ArmorModal         from '../components/ArmorModal'
import EventToastContainer, { showGameEvent } from '../components/EventToast'
import './GamePage.css'

export default function GamePage({ campaignId, userId, campaign, onBack, onCampaignUpdate }) {
  const {
    messages, character, memory, npcs, quests, loading, error: campaignError,
    saveMessage, updateCharacterStats, processDMReply,
    deleteLastAssistantMessage, updateQuestStatus,
    performRest, spendSpellSlot, restoreSpellSlot,
    saveCombatState,
  } = useCampaign(campaignId, userId)

  const [input,        setInput]        = useState('')
  const [sending,      setSending]      = useState(false)
  const [error,        setError]        = useState(null)
  const [sidebar,      setSidebar]      = useState(null)
  const [editHP,       setEditHP]       = useState(false)
  const [hpInput,      setHpInput]      = useState('')
  const [levelUpData,  setLevelUpData]  = useState(null)
  const [showRest,     setShowRest]     = useState(false)
  const [showPrepSpells,   setShowPrepSpells]   = useState(false)
  const [showContentCreator, setShowContentCreator] = useState(false)
  const [showSummary,  setShowSummary]  = useState(false)
  const [showEditChar, setShowEditChar] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [speaking,     setSpeaking]     = useState(null)
  const [combatants,   setCombatants]   = useState(null)
  const [inCombat,     setInCombat]     = useState(false)
  const [skillCheck,   setSkillCheck]   = useState(null)
  const [deathSaves,   setDeathSaves]   = useState(false)  // show death saving throws panel
  const [combatEnemies,  setCombatEnemies]  = useState([])
  const [showInventory,  setShowInventory]  = useState(false)
  const [lootTarget,     setLootTarget]     = useState(null)   // { name, isPickpocket }
  const [merchantData,   setMerchantData]   = useState(null)   // { type, name }
  const [showArmor,     setShowArmor]     = useState(false)
  const [monsterContext, setMonsterContext] = useState('')
  const [suggestedMonsters, setSuggestedMonsters] = useState([])
  const [storyArcs,        setStoryArcs]        = useState([])
  const [suggestionsEnabled, setSuggestionsEnabled] = useState(false)
  const [arcsInitialized,  setArcsInitialized]  = useState(false)
  const [autoScene,        setAutoScene]        = useState(null)
  const [hasInspiration,   setHasInspiration]   = useState(false)
  const [slashHints,       setSlashHints]       = useState([])  // autocomplete suggestions
  const [exhaustionLevel,  setExhaustionLevel]  = useState(0)
  const lastCombatMsgId = useRef(null)
  const [campaignData, setCampaignData] = useState(campaign || {})
  const bottomRef    = useRef(null)
  const inputRef     = useRef(null)
  const openingFired = useRef(false)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, sending])

  useEffect(() => {
    if (loading || !character) return
    if (messages.length > 0) return   // campaign already has messages
    if (openingFired.current) return  // already fired this render cycle
    openingFired.current = true
    sendOpeningMessage()
  }, [loading, character, messages.length]) // eslint-disable-line

  useEffect(() => () => window.speechSynthesis?.cancel(), [])

  // Retry arc generation once we have enough messages (first exchange complete)
  useEffect(() => {
    if (!character || !campaignId || storyArcs.length > 0 || messages.length < 2) return
    generateStoryArcs(campaignId, userId, character, campaignData)
      .then(generated => { if (generated?.length) setStoryArcs(generated) })
      .catch(() => {})
  }, [messages.length]) // eslint-disable-line

  // Pre-load monster suggestions from DB based on current character stats
  useEffect(() => {
    if (!character || !character.level) return
    selectEncounterMonsters(character, 'medium')
      .then(monsters => setSuggestedMonsters(monsters))
      .catch(() => {})
  }, [character?.level, character?.current_hp]) // eslint-disable-line

  // Load or generate story arcs
  useEffect(() => {
    if (!character || !campaignId || arcsInitialized) return
    setArcsInitialized(true)
    loadStoryArcs(campaignId).then(async loaded => {
      if (loaded.length > 0) {
        setStoryArcs(loaded)
      } else if (messages.length >= 2) {
        // Only generate after first real exchange (needs context)
        try {
          const generated = await generateStoryArcs(campaignId, userId, character, campaignData)
          if (generated?.length) setStoryArcs(generated)
        } catch (e) { console.warn('[Arcs] Generation failed:', e.message) }
      }
      // If messages < 2, a separate effect below will retry once messages grow
    })
  }, [character?.id, campaignId]) 

  // FIX: Restore combat state from Supabase on load (survives refresh)
  useEffect(() => {
    if (!loading && memory) {
      if (memory.in_combat) {
        setInCombat(true)
        const saved = memory.initiative_order
        if (Array.isArray(saved) && saved.length > 0) {
          // Sync player HP from character sheet on restore
          const withFreshHP = saved.map(c =>
            c.isPlayer && character
              ? { ...c, hp: character.current_hp, maxHp: character.max_hp }
              : c
          )
          setCombatants(withFreshHP)
        }
      }
    }
  }, [loading, memory]) // eslint-disable-line

  // Keep player HP in combat tracker in sync with character sheet
  useEffect(() => {
    if (!character || !inCombat) return
    setCombatants(prev => {
      if (!prev) return prev
      return prev.map(c =>
        c.isPlayer ? { ...c, hp: character.current_hp, maxHp: character.max_hp } : c
      )
    })
  }, [character?.current_hp]) // eslint-disable-line

  // Detect skill check requests from DM (🎲 Skill Check — DC X)
  // Does NOT fire during combat — CombatScreen handles its own dice
  useEffect(() => {
    if (!messages.length || inCombat) return
    const lastDM = [...messages].reverse().find(m => m.role === 'assistant')
    if (!lastDM || !character) return
    const text = lastDM.content

    const checkMatch = text.match(/🎲\s+([A-Za-z\s]+?)\s+Check\s*[—–-]+\s*DC\s*(\d+)/i)
    if (checkMatch && !skillCheck) {
      const skill   = checkMatch[1].trim()
      const dc      = parseInt(checkMatch[2])
      // Determine the ability modifier for this skill
      const skillToStat = {
        persuasion:'charisma', deception:'charisma', intimidation:'charisma', performance:'charisma',
        stealth:'dexterity', acrobatics:'dexterity', 'sleight of hand':'dexterity',
        athletics:'strength',
        perception:'wisdom', insight:'wisdom', medicine:'wisdom', survival:'wisdom', 'animal handling':'wisdom',
        arcana:'intelligence', history:'intelligence', investigation:'intelligence', nature:'intelligence', religion:'intelligence',
      }
      const statKey  = skillToStat[skill.toLowerCase()] || 'charisma'
      const totalMod = getSkillBonus(character, skill)
      const statMod_ = Math.floor(((character[statKey] || 10) - 10) / 2)
      const hasProficiency = (character.skill_proficiencies || []).some(s => s.toLowerCase().includes(skill.toLowerCase()))
      setSkillCheck({ skill, dc, statMod: totalMod, statKey, rawMod: statMod_, proficient: hasProficiency })
    }
  }, [messages]) // eslint-disable-line

  // Detect combat start from DM message → switch to CombatScreen
  useEffect(() => {
    if (!messages.length) return
    const lastDM = [...messages].reverse().find(m => m.role === 'assistant')
    if (!lastDM) return

    if (lastDM.content.includes('COMBAT BEGINS') && !inCombat && lastDM.id !== lastCombatMsgId.current) {
      lastCombatMsgId.current = lastDM.id
      // Extract enemy names from initiative order block
      const enemyNames = []
      const lines = lastDM.content.split('\n')
      let inInit = false
      for (const line of lines) {
        if (/initiative order/i.test(line)) { inInit = true; continue }
        if (inInit && /^[-=]{3,}/.test(line.trim())) { inInit = false; continue }
        if (!inInit) continue
        // Match: "- Wolf 1 (HP: 11/11): 15" or "- Goblin: 12"
        const m = line.match(/[-•]\s+([A-Za-z][A-Za-z0-9 '#]+?)(?:\s*\(HP:|:)/)
        if (m) {
          const name = m[1].trim()
          const isPlayer = character && name.toLowerCase() === character.name.toLowerCase()
          if (!isPlayer) enemyNames.push(name)
        }
      }
      if (enemyNames.length > 0) {
        setCombatEnemies(enemyNames)
        setInCombat(true)
        saveCombatState(true, enemyNames.map(n => ({ name: n })))
        // Look up real monster stats from DB and inject into DM context
        ;(async () => {
          try {
            const statBlocks = await Promise.all(
              enemyNames.map(async name => {
                try {
                  const stats = await lookupMonsterStats(name)
                  return stats ? `${name}: AC ${stats.ac}, HP ${stats.hp}, CR ${stats.cr}` : null
                } catch { return null }
              })
            )
            const ctx = statBlocks.filter(Boolean).join('\n')
            if (ctx) setMonsterContext(ctx)
          } catch (e) { console.warn('[Monster lookup]', e.message) }
        })()
      }
    }
    if (lastDM.content.includes('COMBAT ENDS')) {
      setInCombat(false)
      setCombatEnemies([])
      saveCombatState(false, [])
    }
  }, [messages]) // eslint-disable-line

  async function getRAGContext(query) {
    try {
      const lastDM    = [...messages].reverse().find(m => m.role === 'assistant')
      const dmSnippet = lastDM?.content?.slice(0, 300) || ''
      const combined  = [query, dmSnippet].join(' ')

      // Detect what kind of context we need
      const isMerchant  = /shop|merchant|wares|sell|buy|what do you have|for sale|tavern keeper|mage sells|alchemist|blacksmith/i.test(combined)
      const isMonster   = /attack|combat|encounter|fight|creature|monster|beast|undead|dragon|goblin|orc|wolf|troll|vampire|quasit|demon|devil|elemental/i.test(combined)
      const isSkillCheck = /persuade|convince|deceive|intimidate|sneak|hide|search|investigate|climb|swim|jump|steal|pickpocket|notice|perception|check|roll/i.test(combined)

      const chunks = await retrieveFromSupabase(combined, 6)

      // For merchants: fetch level-appropriate magic items
      if (isMerchant) {
        const charLevel = character?.level || 1
        // Rarity tiers by character level
        const rarityFilter = charLevel <= 4  ? ['common','uncommon']
          : charLevel <= 8  ? ['uncommon','rare']
          : charLevel <= 12 ? ['rare','very rare']
          : ['very rare','legendary']

        // Build OR filter for rarity
        const rarityOr = rarityFilter.map(r => `content.ilike.%${r}%`).join(',')
        const { data: magicItems } = await supabase
          .from('knowledge_chunks')
          .select('chunk_id, type, name, source, content')
          .eq('type', 'magic-item')
          .or(rarityOr)
          .order('name')
          .limit(8)
        if (magicItems?.length) {
          const seen = new Set(chunks.map(c => c.id))
          for (const row of magicItems) {
            if (!seen.has(row.chunk_id)) {
              chunks.push({ id: row.chunk_id, type: row.type, name: row.name, source: row.source, text: row.content })
              seen.add(row.chunk_id)
            }
          }
        }
      }

      // For monsters: fetch full stat blocks for creatures in context
      if (isMonster && chunks.length < 4) {
        // Extract potential monster names from the DM text
        const monsterNames = dmSnippet.match(/(goblin|orc|wolf|troll|dragon|vampire|skeleton|zombie|quasit|bandit|cultist|gnoll|ogre|giant|wraith|ghoul|kobold|hobgoblin|bugbear|basilisk|medusa|harpy|manticore|owlbear|mimic)\w*/gi) || []
        for (const name of [...new Set(monsterNames)].slice(0, 3)) {
          const { data } = await supabase
            .from('knowledge_chunks')
            .select('chunk_id, type, name, source, content')
            .eq('type', 'monster')
            .ilike('name', `%${name}%`)
            .limit(1)
          if (data?.[0] && !chunks.find(c => c.id === data[0].chunk_id)) {
            chunks.push({ id: data[0].chunk_id, type: data[0].type, name: data[0].name, source: data[0].source, text: data[0].content })
          }
        }
      }

      // For skill checks: fetch relevant skill descriptions
      if (isSkillCheck) {
        const skillMatch = combined.match(/(persuasion|deception|intimidation|stealth|perception|investigation|athletics|acrobatics|arcana|history|nature|religion|insight|medicine|survival|performance|sleight of hand|animal handling)/i)
        if (skillMatch) {
            const { data } = await supabase
            .from('knowledge_chunks')
            .select('chunk_id, type, name, source, content')
            .ilike('name', `%${skillMatch[1]}%`)
            .limit(1)
          if (data?.[0]) chunks.push({ id: data[0].chunk_id, type: data[0].type, name: data[0].name, source: data[0].source, text: data[0].content })
        }
      }

      // Pull lore for dominant story arc tags — keeps world-building grounded in DB
      const dominantArc = storyArcs?.sort((a, b) => b.power - a.power)[0]
      if (dominantArc?.lore_tags?.length && chunks.length < 6) {
        for (const tag of dominantArc.lore_tags.slice(0, 2)) {
          const { data: arcData } = await supabase
            .from('knowledge_chunks')
            .select('chunk_id, type, name, source, content')
            .or(`type.eq.monster,type.eq.section`)
            .ilike('content', `%${tag}%`)
            .limit(2)
          if (arcData) {
            const seen = new Set(chunks.map(c => c.id))
            for (const row of arcData) {
              if (!seen.has(row.chunk_id) && chunks.length < 8) {
                chunks.push({ id: row.chunk_id, type: row.type, name: row.name, source: row.source, text: row.content })
                seen.add(row.chunk_id)
              }
            }
          }
        }
      }

      // Pull condition rules if character has active conditions
      if (character?.conditions?.length) {
        for (const cond of character.conditions.slice(0, 2)) {
          const { data: condData } = await supabase
            .from('knowledge_chunks')
            .select('chunk_id, type, name, source, content')
            .eq('type', 'condition')
            .ilike('name', `%${cond}%`)
            .limit(1)
          if (condData?.[0]) {
            const seen = new Set(chunks.map(c => c.id))
            if (!seen.has(condData[0].chunk_id)) {
              chunks.push({ id: condData[0].chunk_id, type: condData[0].type, name: condData[0].name, source: condData[0].source, text: condData[0].content })
            }
          }
        }
      }

      return buildContextBlock(chunks.slice(0, 8))
    }
    catch { return '' }
  }

  async function handleItemUse({ item, updates: effectUpdates, consume }) {
    const charUpdates = { ...(effectUpdates || {}) }
    if (consume) {
      const eq  = character.equipment || []
      const idx = eq.findIndex(e => e === item)
      if (idx !== -1) charUpdates.equipment = [...eq.slice(0, idx), ...eq.slice(idx + 1)]
    }
    if (Object.keys(charUpdates).length > 0) await updateCharacterStats(charUpdates)
  }

  async function handleDropItem(item) {
    const eq  = character.equipment || []
    const idx = eq.findIndex(e => e === item)
    if (idx !== -1) await updateCharacterStats({ equipment: [...eq.slice(0, idx), ...eq.slice(idx + 1)] })
  }

  async function handleEquipArmor(slot, itemName, attune = false) {
    // Resolve item data — checks ITEM_DB first, then RAG database for unknown items
    const itemData = await resolveItem(itemName)
    const equipped = { ...(character.equipped || {}), [slot]: itemName }

    // Recalculate AC with new item in slot
    const newAC = calculateAC(equipped, {
      dexterity: character.dexterity, constitution: character.constitution,
      wisdom: character.wisdom, class: character.class,
    })

    // Apply any stat-setting effects (Amulet of Health → CON 19, etc.)
    const statUpdates = getEquipStatUpdates(itemData, character)

    // If CON changed, recalculate max HP delta
    let hpUpdates = {}
    if (statUpdates.constitution) {
      const oldConMod = Math.floor(((character.constitution || 10) - 10) / 2)
      const newConMod = Math.floor((statUpdates.constitution - 10) / 2)
      const hpDelta   = (newConMod - oldConMod) * (character.level || 1)
      if (hpDelta > 0) {
        hpUpdates = {
          max_hp:     (character.max_hp || 10) + hpDelta,
          current_hp: (character.current_hp || 10) + hpDelta,
        }
      }
    }

    // Handle attunement flag — stored as `${slot}_attuned`
    if (attune) equipped[`${slot}_attuned`] = true
    else if (attune === false && equipped[`${slot}_attuned`]) {
      // Removing attunement — stat effects no longer apply
      equipped[`${slot}_attuned`] = false
    }
    await updateCharacterStats({ equipped, armor_class: newAC, ...statUpdates, ...hpUpdates })

    // Toast notification for passive effects
    if (itemData?.passive) {
      showGameEvent({ ambientDetail: `✦ ${itemName}: ${itemData.passive}` })
    }
  }

  async function handleUnequipArmor(slot) {
    const itemName = character.equipped?.[slot]
    const itemData = itemName ? await resolveItem(itemName) : null
    const equipped = { ...(character.equipped || {}), [slot]: null }

    const newAC = calculateAC(equipped, {
      dexterity: character.dexterity, constitution: character.constitution,
      wisdom: character.wisdom, class: character.class,
    })

    // Reverse stat effects when unequipping
    const statRestores = getUnequipStatUpdates(itemData, character, null)

    // Reverse CON-based HP if applicable
    let hpUpdates = {}
    if (statRestores.constitution) {
      const oldConMod = Math.floor(((character.constitution || 10) - 10) / 2)
      const newConMod = Math.floor((statRestores.constitution - 10) / 2)
      const hpDelta   = (newConMod - oldConMod) * (character.level || 1)
      if (hpDelta < 0) {
        hpUpdates = {
          max_hp:     Math.max(1, (character.max_hp || 10) + hpDelta),
          current_hp: Math.max(1, (character.current_hp || 10) + hpDelta),
        }
      }
    }

    await updateCharacterStats({ equipped, armor_class: newAC, ...statRestores, ...hpUpdates })
  }

  // ── LOOT HANDLING ───────────────────────────────────────
  function handleOpenLoot(creatureName, isPickpocket = false) {
    setLootTarget({ name: creatureName, isPickpocket })
  }

  async function handleTakeItem(itemName, qty) {
    const existing = character.equipment || []
    const newItems = [...existing, ...Array(qty).fill(itemName)]
    await updateCharacterStats({ equipment: newItems })
    showGameEvent({ newItems:[itemName], removeItems:[], newSpells:[], newNPCs:[], newQuests:[], questComplete:[], goldChange:null, levelUp:null, hpChange:null, xpGain:null, newConditions:[], removedConditions:[] })
    // Tell the DM what was looted so story continuity is maintained
    await send(`I took the ${itemName} from the body.`)
  }

  async function handleTakeAll(items) {
    const existing = character.equipment || []
    const newItems = [...existing, ...items.flatMap(i => Array(i.qty).fill(i.name))]
    await updateCharacterStats({ equipment: newItems })
    showGameEvent({ newItems: items.map(i => i.name), removeItems:[], newSpells:[], newNPCs:[], newQuests:[], questComplete:[], goldChange:null, levelUp:null, hpChange:null, xpGain:null, newConditions:[], removedConditions:[] })
    const itemList = items.map(i => i.qty > 1 ? `${i.qty}× ${i.name}` : i.name).join(', ')
    await send(`I looted the body and took: ${itemList}.`)
  }

  // ── MERCHANT HANDLING ────────────────────────────────────
  function handleOpenMerchant(context = 'general store', name = 'Merchant') {
    setMerchantData({ context, name })
  }

  async function handleBuyItem(itemName, qty, cost) {
    const existing = character.equipment || []
    const newItems = [...existing, ...Array(qty).fill(itemName)]
    const newGold  = Math.max(0, (character.gold || 0) - cost)
    await updateCharacterStats({ equipment: newItems, gold: newGold })
    showGameEvent({ newItems:[itemName], goldChange: -cost, removeItems:[], newSpells:[], newNPCs:[], newQuests:[], questComplete:[], levelUp:null, hpChange:null, xpGain:null, newConditions:[], removedConditions:[] })
    await send(`I bought ${qty > 1 ? qty + '× ' : ''}${itemName} for ${cost} gp.`)
  }

  async function handleSellItem(itemName, qty, earned) {
    const existing = character.equipment || []
    const idx      = existing.indexOf(itemName)
    const newItems = idx > -1 ? [...existing.slice(0, idx), ...existing.slice(idx+1)] : existing
    const newGold  = (character.gold || 0) + earned
    await updateCharacterStats({ equipment: newItems, gold: newGold })
    showGameEvent({ removeItems:[itemName], goldChange: earned, newItems:[], newSpells:[], newNPCs:[], newQuests:[], questComplete:[], levelUp:null, hpChange:null, xpGain:null, newConditions:[], removedConditions:[] })
    await send(`I sold my ${itemName} for ${earned} gp.`)
  }

  async function handleSkillCheckResult(roll) {
    if (!skillCheck) return
    const total    = roll + skillCheck.statMod
    const success  = total >= skillCheck.dc
    const isCrit   = roll === 20
    const isFumble = roll === 1
    const profBonus = character.proficiency_bonus || 2
    const isExpert  = (character.expertise_skills || []).some(s => s.toLowerCase() === skillCheck.skill.toLowerCase())
    // Build a clear breakdown string for the DM
    const bonusBreakdown = isExpert
      ? `${roll} + ${skillCheck.rawMod} (${skillCheck.skill}) + ${profBonus * 2} (expertise) = **${total}**`
      : skillCheck.proficient
        ? `${roll} + ${skillCheck.rawMod} (${skillCheck.skill}) + ${profBonus} (prof) = **${total}**`
        : `${roll} + ${skillCheck.rawMod} (${skillCheck.skill}) = **${total}**`

    let resultMsg
    if (isCrit)    resultMsg = `Natural 20! ${bonusBreakdown} vs DC ${skillCheck.dc} — Critical Success!`
    else if (isFumble) resultMsg = `Natural 1. ${bonusBreakdown} vs DC ${skillCheck.dc} — Critical Failure!`
    else if (success)  resultMsg = `${bonusBreakdown} vs DC ${skillCheck.dc} — Success! (by ${total - skillCheck.dc})`
    else               resultMsg = `${bonusBreakdown} vs DC ${skillCheck.dc} — Failure. (by ${skillCheck.dc - total})`

    setSkillCheck(null)
    await send(resultMsg)
  }

  async function handleCombatEnd({ victory, fled, narrative, xpGained, playerHP, loot }) {
    // Clear immediately — before any async work — so useEffect can't re-trigger
    setInCombat(false)
    setCombatEnemies([])
    setMonsterContext('')
    saveCombatState(false, [])

    // Build all character updates in one call to avoid race conditions
    const updates = {}
    if (playerHP !== undefined) updates.current_hp = Math.max(1, playerHP)

    if (xpGained) {
      const newXP    = (character.experience || 0) + xpGained
      const newLevel = levelFromXP(newXP)
      updates.experience = newXP
      // Check level-up — fires immediately if XP crosses a threshold
      if (newLevel > (character.level || 1)) {
        updates.level             = newLevel
        updates.proficiency_bonus = proficiencyBonus(newLevel)
        updates.xp_to_next_level  = xpToNextLevel(newLevel)
        const conMod = Math.floor(((character.constitution || 10) - 10) / 2)
        updates.max_hp     = (character.max_hp || 10) + Math.floor((HIT_DICE[character.class] || 8) / 2) + 1 + conMod
        updates.current_hp = Math.min((character.current_hp || 1) + Math.floor((HIT_DICE[character.class] || 8) / 2) + 1 + conMod, updates.max_hp)
        const newSlots = buildInitialSlots(character.class, newLevel)
        if (Object.keys(newSlots).length > 0) updates.spell_slots = newSlots
      }
    }

    // Apply loot
    if (loot && victory) {
      if (loot.totalGold > 0) {
        updates.gold = (character.gold || 0) + loot.totalGold
      }
      if (loot.items?.length > 0) {
        const existing = character.equipment || []
        updates.equipment = [...existing, ...loot.items]
      }
    }

    if (Object.keys(updates).length > 0) {
      await updateCharacterStats(updates)
    }

    // Show toast + open level-up modal if level increased
    const newLevelAfterXP = xpGained ? levelFromXP((character.experience || 0) + xpGained) : character.level
    const didLevelUp      = newLevelAfterXP > (character.level || 1)
    const eventPayload = {
      xpGain:     xpGained || null,
      goldChange: loot?.totalGold || null,
      newItems:   loot?.items || [],
      levelUp:    didLevelUp ? newLevelAfterXP : null,
      removeItems:[], newSpells:[], newNPCs:[], newQuests:[], questComplete:[],
      hpChange:null, newConditions:[], removedConditions:[]
    }
    showGameEvent(eventPayload)
    if (didLevelUp) setLevelUpData({ newLevel: newLevelAfterXP })
    // Strip combat markers from narrative so they don't re-trigger the combat screen
    const cleanNarrative = (narrative || '')
      .replace(/⚔️ COMBAT BEGINS/gi, '')
      .replace(/⚔️ COMBAT ENDS/gi, '')
      .replace(/COMBAT BEGINS/gi, '')
      .replace(/COMBAT ENDS/gi, '')
      .trim()

    // Clear combat state before sending so the useEffect doesn't re-trigger
    setInCombat(false)
    setCombatEnemies([])

    const outcome = fled
      ? `I fled from the battle. ${cleanNarrative} What happens next?`
      : victory
        ? `Victory — the fight is over. ${cleanNarrative} Continue the story.`
        : `I was knocked unconscious and defeated. ${cleanNarrative} What happens next?`

    await send(outcome)

    // Prompt short rest after a victory if HP is meaningfully low
    const currentHP = updates.current_hp ?? character.current_hp ?? character.max_hp
    const hpPct     = currentHP / (character.max_hp || 10)
    if (victory && hpPct < 0.75) {
      setTimeout(() => setShowRest(true), 1200)
    }
  }

  async function sendOpeningMessage() {
    setSending(true)
    try {
      // Use dedicated opening scene function — guaranteed correct format
      const reply = await callOpeningScene({ character, campaignSettings: campaignData })
      const clean = cleanDMText(reply)
      await saveMessage('assistant', clean)
      // No event processing needed for opening — it's pure narrative
    } catch (err) { setError(err.message) }
    finally { setSending(false) }
  }

  // ── Apply slash command state changes ──────────────────────
  async function applySlashStateChanges(changes) {
    if (!changes || !Object.keys(changes).length) return

    // Items
    if (changes.addItems?.length) {
      const existing = character.equipment || []
      await updateCharacterStats({ equipment: [...existing, ...changes.addItems] })
      showGameEvent({ newItems: changes.addItems, removeItems:[], newSpells:[], newNPCs:[], newQuests:[], questComplete:[], goldChange:null, levelUp:null, hpChange:null, xpGain:null, newConditions:[], removedConditions:[] })
    }
    if (changes.removeItem) {
      const eq  = character.equipment || []
      const idx = eq.findIndex(e => e.toLowerCase().includes(changes.removeItem.toLowerCase()))
      if (idx !== -1) await updateCharacterStats({ equipment: [...eq.slice(0,idx), ...eq.slice(idx+1)] })
    }

    // Equip
    if (changes.equipItem) {
      const { slot, itemName } = changes.equipItem
      const { calculateAC, getEquipStatUpdates } = await import('../lib/items').catch(() => ({}))
      const equipped = { ...(character.equipped || {}), [slot]: itemName }
      const newAC    = calculateAC?.(equipped, { dexterity: character.dexterity, constitution: character.constitution, wisdom: character.wisdom, class: character.class }) ?? character.armor_class
      const statUpds = getEquipStatUpdates ? (await import('../lib/items').then(m => m.getEquipStatUpdates(getItem(itemName), character)).catch(() => ({}))) : {}
      await updateCharacterStats({ equipped, armor_class: newAC, ...statUpds })
    }

    // Gold
    if (changes.setGold !== undefined) {
      await updateCharacterStats({ gold: changes.setGold })
    }

    // HP
    if (changes.setHP !== undefined) {
      await updateCharacterStats({ current_hp: changes.setHP })
    }

    // Spell
    if (changes.addSpell) {
      const existing = character.spells || []
      await updateCharacterStats({ spells: [...new Set([...existing, changes.addSpell])] })
      showGameEvent({ newSpells: [changes.addSpell], newItems:[], removeItems:[], newNPCs:[], newQuests:[], questComplete:[], goldChange:null, levelUp:null, hpChange:null, xpGain:null, newConditions:[], removedConditions:[] })
    }

    // Conditions
    if (changes.addCondition) {
      const conds = [...new Set([...(character.conditions||[]), changes.addCondition])]
      await updateCharacterStats({ conditions: conds })
    }
    if (changes.removeCondition) {
      const conds = (character.conditions||[]).filter(c => c !== changes.removeCondition)
      await updateCharacterStats({ conditions: conds })
    }

    // Inspiration
    if (changes.grantInspiration) {
      setHasInspiration(true)
    }

    // Combat
    if (changes.startCombat && changes.combatEnemies?.length) {
      setCombatEnemies(changes.combatEnemies)
      setInCombat(true)
      saveCombatState(true, changes.combatEnemies.map(n => ({ name: n })))
    }
    if (changes.endCombat) {
      setInCombat(false)
      setCombatEnemies([])
      saveCombatState(false, [])
    }

    // Rest
    if (changes.triggerRest) {
      setShowRest(true)
    }

    // Level up
    if (changes.triggerLevelUp) {
      setLevelUpData({ newLevel: changes.triggerLevelUp })
    }

    // Spell slots
    if (changes.restoreSlots) {
      if (changes.restoreSlots === 'all') {
        const slots = { ...character.spell_slots }
        for (const lvl of Object.keys(slots)) slots[lvl] = { ...slots[lvl], used: 0 }
        await updateCharacterStats({ spell_slots: slots })
      } else {
        restoreSpellSlot(String(changes.restoreSlots))
      }
    }
    if (changes.useSlot) {
      spendSpellSlot(String(changes.useSlot))
    }

    // NPCs
    if (changes.addNPC) {
      showGameEvent({ newNPCs: [changes.addNPC], newItems:[], removeItems:[], newSpells:[], newQuests:[], questComplete:[], goldChange:null, levelUp:null, hpChange:null, xpGain:null, newConditions:[], removedConditions:[] })
    }

    // Quests
    if (changes.addQuest) {
      showGameEvent({ newQuests: [changes.addQuest], newItems:[], removeItems:[], newNPCs:[], newSpells:[], questComplete:[], goldChange:null, levelUp:null, hpChange:null, xpGain:null, newConditions:[], removedConditions:[] })
    }
    if (changes.completeQuest) {
      showGameEvent({ questComplete: [changes.completeQuest], newItems:[], removeItems:[], newNPCs:[], newSpells:[], newQuests:[], goldChange:null, levelUp:null, hpChange:null, xpGain:null, newConditions:[], removedConditions:[] })
    }
  }

  async function send(overrideText) {
    const raw = (overrideText || input).trim()
    if (!raw || sending) return

    // Sanitize: strip control characters, limit length, prevent prompt injection
    const content = raw
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')  // control chars
      .replace(/\[SYSTEM\]|\[INST\]|<\|system\|>|<\|user\|>/gi, '')  // injection patterns
      .slice(0, 2000)  // hard cap

    if (!content) return
    setInput('')
    setError(null)

    // ── Slash command intercept ─────────────────────────────
    if (parseSlashCommand(content)) {
      const slashResult = await executeSlashCommand(content, {
        character, inCombat, hasInspiration, messages, campaignId,
      })
      if (slashResult.handled) {
        // Show feedback as a system message in the chat
        if (slashResult.feedback) {
          await saveMessage('assistant', `\`\`\`
${slashResult.feedback}
\`\`\``)
        }
        // Apply all state changes immediately
        await applySlashStateChanges(slashResult.stateChanges || {})
        // If skipDM, stop here — don't call the LLM
        if (slashResult.skipDM) return
        // If sendToDM, override the text that goes to the DM
        if (slashResult.sendToDM) {
          await send(slashResult.sendToDM)
          return
        }
        return
      }
    }

    // Detect rest request
    if (/\b(long rest|short rest|make camp|take a rest|i rest|we rest)\b/i.test(content)) {
      setShowRest(true); return
    }

    // Detect loot request
    const lootMatch = content.match(/i\s+(?:loot|search|check|examine)\s+(?:the\s+)?([\w\s]+?)(?:'s body|body| corpse|\.|$)/i)
                   || content.match(/loot(?:ing)?\s+(?:the\s+)?([\w\s]+)/i)
    if (lootMatch) {
      const target = lootMatch[1]?.trim()
      if (target && target.length > 1 && target.length < 40) {
        handleOpenLoot(target, false); return
      }
    }

    // Detect pickpocket
    const pickMatch = content.match(/i\s+(?:pickpocket|steal from|rob|pick the pocket of)\s+([\w\s]+)/i)
    if (pickMatch) {
      const target = pickMatch[1]?.trim()
      if (target && target.length > 1) { handleOpenLoot(target, true); return }
    }

    // Detect merchant / shop
    const shopMatch = content.match(/(?:what do you have|what.s for sale|browse|buy|purchase|i.d like to buy|shop|trade|sell me|your wares)/i)
                   || content.match(/(?:show|open|visit|enter|go to)\s+(?:the\s+)?(?:shop|store|market|blacksmith|apothecary|magic)/i)
    if (shopMatch) {
      // Extract the merchant/shop name from context (last DM message)
      const lastDM = [...messages].reverse().find(m => m.role === 'assistant')
      const dmText = lastDM?.content || ''
      // Try to find a named NPC mentioned in the DM text
      const npcMatch = dmText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:the\s+)?(?:merchant|shopkeeper|blacksmith|apothecary|trader|vendor|alchemist|wizard)/i)
      const merchantName = npcMatch?.[1] || 'the merchant'
      const shopContext  = /blacksmith|forge|weapon|armor/i.test(dmText + content) ? 'blacksmith and armory'
        : /apothecary|herb|potion|alchemist/i.test(dmText + content) ? 'apothecary and alchemist shop'
        : /magic|arcane|scroll|spell/i.test(dmText + content) ? 'magic shop and arcane goods'
        : /tavern|inn|food|drink/i.test(dmText + content) ? 'general goods and provisions'
        : 'general trading post'
      handleOpenMerchant(shopContext, merchantName)
      return
    }

    setSending(true)
    try {
      await saveMessage('user', content)
      const ragContext = await getRAGContext(content)
      const history    = [...messages, { role: 'user', content }]

      // Detect which focused prompt mode to use for this action
      const lastDMMsg = [...messages].reverse().find(m => m.role === 'assistant')?.content || ''
      const { mode: promptMode, npc: npcTarget } = detectPromptMode({
        playerAction: content, inCombat, lastDMMessage: lastDMMsg, npcs,
      })
      const skillCtx = promptMode === 'skill_check' && lastDMMsg.includes('🎲')
        ? lastDMMsg.slice(lastDMMsg.indexOf('🎲'), lastDMMsg.indexOf('🎲') + 220)
        : null

      // ── Action pipeline: validate → resolve → get mechanical context ──
      // For combat actions or structured commands, engine resolves BEFORE LLM narrates
      let mechanicalContext = null
      let customContentBlock = null
      try {
        customContentBlock = buildContentContextBlock(campaignId) || null
      } catch {}

      if (inCombat && !['narrative','npc_dialogue','skill_check'].includes(promptMode)) {
        try {
          // Classify what the player is trying to do
          const actionType = classifyPlayerAction(content)
          if (actionType !== ACTION_TYPES.NARRATIVE) {
            const action = { type: actionType, payload: { rawText: content } }
            const validation = validateAction(action, character, {})
            if (!validation.valid) {
              // Invalid action — tell the DM what was wrong, skip resolution
              mechanicalContext = `[ACTION INVALID: ${validation.errors.join('; ')} — narrate why the character cannot do this.]`
            } else {
              const pipelineResult = await resolveAction(action, character, null, campaignId)
              mechanicalContext = buildMechanicalContext(pipelineResult)
            }
          }
        } catch (pErr) {
          console.warn('[Pipeline] Resolution failed:', pErr.message)
        }
      }

      const reply = await callDM({
        messages: history, character, memory, ragContext, npcs, quests,
        campaignSettings: campaignData, monsterContext, suggestedMonsters, storyArcs,
        inCombat, promptMode, npcTarget,
        checkContext: skillCtx,
        rollResult: promptMode === 'skill_check' ? content : null,
        mechanicalContext,
        customContentBlock,
      })
      const clean = cleanDMText(reply)
      await saveMessage('assistant', clean)
      const { events } = await processDMReply(reply, content)

      // Detect DM granting inspiration
      if (/you gain inspiration|granting you inspiration|you have inspiration|inspiration for/i.test(reply)) {
        setHasInspiration(true)
        showGameEvent({ ambientDetail: '✨ You gained Inspiration! Spend it to reroll any d20.' })
      }

      // Auto-switch ambient sound based on location header in DM reply
      const locMatch = clean.match(/📍\s*([^|\n]+)/i)
      if (locMatch) {
        const loc = locMatch[1].toLowerCase()
        const detectedScene =
          /tavern|inn|bar|alehouse|pub|feast|hall/i.test(loc) ? 'tavern'
          : /forest|wood|grove|jungle|swamp|marsh|wild/i.test(loc) ? 'forest'
          : /dungeon|cave|cavern|crypt|tomb|ruin|underground|sewer|mine/i.test(loc) ? 'dungeon'
          : /city|town|village|street|market|castle|keep|temple|shrine/i.test(loc) ? 'tavern'
          : null
        if (detectedScene) setAutoScene(detectedScene)
      }
      if (events.combatStarted) setAutoScene('combat')
      if (events.combatEnded)   setAutoScene('dungeon')

      // Client-side combat trigger: catches cases where the DM narrated a fight
      // without writing COMBAT BEGINS — the main bug this patch fixes.
      if (!inCombat && shouldTriggerCombat(content, reply) && !reply.includes('COMBAT BEGINS')) {
        const patch = clean + '\n ⚔️ COMBAT BEGINS \n Initiative Order: \n  - Enemy (HP: ?/?): ? \n - '
          + (character?.name || 'Hero') + ' (HP: '
          + (character?.current_hp || 10) + '/' + (character?.max_hp || 10) + '): ?'
        await saveMessage('assistant', patch).catch(() => {})
      }
      showGameEvent(events)
      if (events.levelUp) setLevelUpData({ newLevel: events.levelUp })

      // Auto-compile any new spells that aren't in PLAYER_SPELLS or Open5e
      // We pass the DM reply as the description source so the compiler has context
      if (events.newSpells?.length) {
        events.newSpells.forEach(async (spellName) => {
          const clean = spellName.replace(/\s*\(cantrip\)/i, '').trim()
          const cached = await loadCompiledSpell(clean, campaignId)
          if (cached) return // already compiled
          // Extract spell description from the DM reply if it's there
          const descMatch = reply.match(new RegExp(`${clean.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}[^.]*\.([\s\S]{20,400})`, 'i'))
          const desc = descMatch?.[1]?.trim() || reply.slice(0, 600)
          compileSpell({ name: clean, description: desc, campaignId, character })
            .then(compiled => {
              if (compiled) console.log(`[SpellCompiler] Pre-compiled "${clean}" from DM reply`)
            })
            .catch(() => {})
        })
      }

      // Ambient world detail every 6 narrative turns — fire-and-forget
      if (!inCombat && promptMode === 'narrative' && messages.length % 6 === 0) {
        callAmbientDetail({ character, memory, storyArcs, campaignSettings: campaignData })
          .then(detail => { if (detail) console.log('[Ambient]', detail) })
          .catch(() => {})
      }

      // Update story arc powers every 8 messages (not every 3) to save API quota
      const msgCount = messages.length
      if (storyArcs.length > 0 && msgCount % 8 === 0) {
        extractArcDeltas(content, reply, storyArcs).then(deltas => {
          if (!deltas?.length) return
          setStoryArcs(prev => {
            const updated = [...prev]
            for (const delta of deltas) {
              const arc = updated.find(a => a.arc_key === delta.arc_key)
              if (arc) {
                arc.power = Math.min(100, Math.max(0, arc.power + delta.delta))
                // Update in DB asynchronously
                updateArcPower(campaignId, arc.id, arc.arc_key, delta.delta, delta.reason)
                  .catch(() => {})
              }
            }
            return updated.sort((a, b) => b.power - a.power)
          })
        }).catch(() => {})

        // Generate arcs if we have messages but no arcs yet
        if (storyArcs.length === 0 && messages.length >= 2) {
          generateStoryArcs(campaignId, userId, character, campaignData)
            .then(arcs => { if (arcs?.length) setStoryArcs(arcs) })
            .catch(() => {})
        }
      }
    } catch (err) { setError(err.message) }
    finally { setSending(false); setTimeout(() => inputRef.current?.focus(), 50) }
  }

  async function regenerate() {
    if (sending) return
    await deleteLastAssistantMessage()
    setSending(true)
    setError(null)
    try {
      const filteredHistory = messages.slice(0, -1)
      const lastUserMsg     = filteredHistory.filter(m => m.role === 'user').slice(-1)[0]?.content || ''
      const ragContext      = await getRAGContext(lastUserMsg)
      const reply  = await callDM({ messages: filteredHistory, character, memory, ragContext, npcs, quests, campaignSettings: campaignData, monsterContext, suggestedMonsters, storyArcs, inCombat })
      const clean  = cleanDMText(reply)
      await saveMessage('assistant', clean)
      const { events } = await processDMReply(reply, lastUserMsg)
      showGameEvent(events)
    } catch (err) { setError(err.message) }
    finally { setSending(false) }
  }

  async function handlePrepareSpells(spells) {
    await updateCharacterStats({ spells })
    setShowPrepSpells(false)
  }

  async function handleRest(type, updates) {
    await performRest(type, updates)
    setShowRest(false)
    await send(type === 'long' ? 'I take a long rest.' : 'I take a short rest.')
  }

  async function handleConditionAdd(condition) {
    const current = character?.conditions || []
    if (!current.includes(condition)) {
      await updateCharacterStats({ conditions: [...current, condition] })
      showGameEvent({ newConditions: [condition], removeItems:[], newItems:[], newSpells:[], newNPCs:[], newQuests:[], questComplete:[], goldChange:null, xpGain:null, levelUp:null, hpChange:null, removedConditions:[] })
    }
  }

  async function handleConditionRemove(condition) {
    const current = character?.conditions || []
    await updateCharacterStats({ conditions: current.filter(c => c !== condition) })
  }

  async function handleExhaustionChange(level) {
    const updates = { exhaustion_level: level }
    // Level 4: halve max HP. Dropping below 4: restore it
    const prev = character.exhaustion_level || 0
    if (level >= 4 && prev < 4) {
      updates.max_hp     = Math.floor((character.max_hp || 10) / 2)
      updates.current_hp = Math.min(character.current_hp || 10, updates.max_hp)
    } else if (level < 4 && prev >= 4) {
      updates.max_hp = (character.max_hp || 10) * 2
    }
    await updateCharacterStats(updates)
  }

  function speak(text, msgId) {
    if (!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    if (speaking === msgId) { setSpeaking(null); return }
    const clean = text.replace(/[📍🕐📅⚔️🔴🔵🟢═─]/g, '').replace(/\*\*/g, '').slice(0, 3000)
    const utt   = new SpeechSynthesisUtterance(clean)
    utt.rate  = 0.88; utt.pitch = 0.9
    const voices = window.speechSynthesis.getVoices()
    const pref   = voices.find(v => v.name.includes('Daniel') || v.name.includes('UK English Male') || v.name.includes('Male'))
    if (pref) utt.voice = pref
    utt.onend = () => setSpeaking(null); utt.onerror = () => setSpeaking(null)
    setSpeaking(msgId)
    window.speechSynthesis.speak(utt)
  }

  function handleRollResult(result) {
    // If there's a pending skill check, auto-submit the roll
    if (skillCheck) {
      handleSkillCheckResult(result.rolls?.[0] || result.total)
      return
    }
    // Otherwise append to input — player can review before sending
    setInput(prev => { const b = prev.trim(); return b ? `${b} ${result.summary}` : result.summary })
    inputRef.current?.focus()
  }

  // Classify a player's free-text action into a pipeline action type
  function classifyPlayerAction(text) {
    const t = text.toLowerCase()
    if (/^i cast|^cast |^using.*spell|^fire bolt|^magic missile/i.test(t)) return ACTION_TYPES.CAST_SPELL
    if (/^i attack|^attack|^i strike|^i hit|^i swing|^i slash|^i stab/i.test(t)) return ACTION_TYPES.ATTACK
    if (/^i drink|^i use.*potion|^use.*healing|^drink.*potion/i.test(t)) return ACTION_TYPES.USE_ITEM
    if (/^i dash|^dash/i.test(t))      return ACTION_TYPES.DASH
    if (/^i dodge|^dodge/i.test(t))    return ACTION_TYPES.DODGE
    if (/^i hide|^hide/i.test(t))      return ACTION_TYPES.HIDE
    if (/^i disengage|^disengage/i.test(t)) return ACTION_TYPES.DISENGAGE
    return ACTION_TYPES.NARRATIVE
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
    if (e.key === 'Escape') setSlashHints([])
    if (e.key === 'Tab' && slashHints.length > 0) {
      e.preventDefault()
      setInput(slashHints[0].aliases[0] + ' ')
      setSlashHints([])
    }
  }

  function autoResize(el) { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 160) + 'px' }

  async function saveHP() {
    const hp = parseInt(hpInput)
    if (isNaN(hp)) return
    await updateCharacterStats({ current_hp: Math.max(0, Math.min(hp, character.max_hp)) })
    setEditHP(false)
    setHpInput('')
  }

  function toggleSidebar(panel) { setSidebar(prev => prev === panel ? null : panel) }

  const lastDMMessage   = [...messages].reverse().find(m => m.role === 'assistant')?.content || ''
  const hpPct           = character ? Math.round((character.current_hp / character.max_hp) * 100) : 100
  const hpColor         = hpPct > 60 ? '#4ecb71' : hpPct > 25 ? '#e8b84a' : '#e05050'
  const xpPct           = character ? Math.round(((character.experience || 0) / (character.xp_to_next_level || 300)) * 100) : 0
  const activeQuests    = quests.filter(q => q.status === 'active')
  const activeConditions = character?.conditions || []

  if (loading) return <div className="game-loading"><span>Loading your adventure…</span></div>

  // ── BG3 Combat Screen ─────────────────────────────────────
  if (inCombat && combatEnemies.length > 0 && character) {
    return (
      <>
        <EventToastContainer />
        {levelUpData && <LevelUpModal character={character} newLevel={levelUpData.newLevel}
          onSave={async (u) => { await updateCharacterStats(u); setLevelUpData(null) }}
          onClose={() => setLevelUpData(null)} />}
        <CombatScreen
          character={character}
          enemyNames={combatEnemies}
          campaignId={campaignId}
          onCombatEnd={handleCombatEnd}
        />
      </>
    )
  }

  return (
    <div className="game-page">
      <EventToastContainer />

      {levelUpData && character && (
        <LevelUpModal character={character} newLevel={levelUpData.newLevel}
          onSave={async (u) => { await updateCharacterStats(u); setLevelUpData(null) }}
          onClose={() => setLevelUpData(null)} />
      )}
      {showPrepSpells && character && ['Cleric','Druid','Paladin','Wizard'].includes(character.class) && (
        <PreparedSpellsModal
          character={character}
          onSave={handlePrepareSpells}
          onClose={() => setShowPrepSpells(false)}
        />
      )}
      {showPrepSpells && character && ['Cleric','Druid','Paladin','Wizard'].includes(character.class) && (
        <PreparedSpellsModal character={character} onSave={handlePrepareSpells} onClose={() => setShowPrepSpells(false)} />
      )}
      {showContentCreator && campaignId && (
        <ContentCreator
          campaignId={campaignId}
          onClose={() => setShowContentCreator(false)}
          onCreated={() => { setShowContentCreator(false) }}
        />
      )}
      {showRest && character && (
        <RestModal character={character} onRest={handleRest} onClose={() => setShowRest(false)} />
      )}
      {showSummary && (
        <SessionSummary messages={messages} character={character} onClose={() => setShowSummary(false)} />
      )}
      {lootTarget && character && (
        <LootPanel
          creatureName={lootTarget.name}
          isPickpocket={lootTarget.isPickpocket}
          character={character}
          onTakeItem={handleTakeItem}
          onTakeAll={handleTakeAll}
          onClose={() => setLootTarget(null)}
        />
      )}
      {merchantData && character && (
        <MerchantPanel
          merchantContext={merchantData.context}
          merchantName={merchantData.name}
          character={character}
          onBuy={handleBuyItem}
          onSell={handleSellItem}
          onClose={() => setMerchantData(null)}
        />
      )}
      {deathSaves && character && (
        <DeathSavingThrows
          characterName={character.name}
          onStabilized={async (hpGain) => {
            setDeathSaves(false)
            await updateCharacterStats({ current_hp: Math.max(1, hpGain) })
            if (hpGain > 0) await send(`I regained ${hpGain} HP on a natural 20 and am back on my feet!`)
            else await send('I stabilized — I am unconscious but stable.')
          }}
          onDied={async () => {
            setDeathSaves(false)
            await send('I failed my death saving throws. I am dead.')
          }}
        />
      )}
      {skillCheck && (
        <SkillCheckPanel
          check={skillCheck}
          onResult={handleSkillCheckResult}
          onDismiss={() => setSkillCheck(null)}
        />
      )}
      {showInventory && character && (
        <InventoryModal
          character={character}
          onUseItem={handleItemUse}
          onDropItem={handleDropItem}
          onClose={() => setShowInventory(false)}
        />
      )}
      {showArmor && character && (
        <ArmorModal
          character={character}
          onEquip={handleEquipArmor}
          onUnequip={handleUnequipArmor}
          onClose={() => setShowArmor(false)}
        />
      )}
      {showEditChar && character && (
        <CharacterEditModal character={character}
          onSave={async (u) => { await updateCharacterStats(u); setShowEditChar(false) }}
          onClose={() => setShowEditChar(false)} />
      )}
      {showSettings && (
        <CampaignSetupModal campaign={campaignData}
          onSave={(updated) => { setCampaignData(updated); if (onCampaignUpdate) onCampaignUpdate(updated); setShowSettings(false) }}
          onClose={() => setShowSettings(false)} />
      )}

      {/* Top bar */}
      <div className="game-topbar">
        <button className="game-back" onClick={onBack}>← Campaigns</button>
        <div className="game-topbar-title">{campaignData.title || 'Adventure'}</div>
        {character && (
          <div className="game-topbar-char">
            <span>{character.name}</span>
            <span className="game-sep">·</span>
            <span>Lv {character.level} {character.class}</span>
            <span className="game-sep">·</span>
            {character.avatar && <span style={{fontSize:'1.1rem'}}>{character.avatar}</span>}
            <span style={{ color: hpColor }}>HP {character.current_hp}/{character.max_hp}</span>
            <span className="game-sep">·</span>
            <span className="game-gold">⚙ {formatCurrencyShort(character.gold ?? 10)}</span>
            {activeConditions.length > 0 && (
              <><span className="game-sep">·</span>
              {hasInspiration && (
            <button
              className="game-sidebar-btn"
              style={{color:'#f0c040',borderColor:'rgba(240,192,64,.4)',background:'rgba(240,192,64,.1)',animation:'inspirePulse 2s ease-in-out infinite'}}
              onClick={() => {
                setHasInspiration(false)
                // Insert reroll token into chat input
                setInput(prev => (prev + ' [INSPIRATION REROLL]').trim())
                updateCharacterStats({ inspiration: false })
              }}
              title="Spend inspiration to reroll one d20"
            >
              ✨ Inspiration
            </button>
          )}
          <span className="game-conditions">⚠ {activeConditions.join(', ')}</span></>
            )}
          </div>
        )}
        <div className="game-topbar-actions">
          <AmbientSound autoScene={autoScene} />
          <button className="game-sidebar-btn" onClick={() => setShowInventory(true)}>🎒 Items</button>

          <button className="game-sidebar-btn" onClick={() => setShowArmor(true)}>🛡️ Armor</button>
          {storyArcs.length > 0 && (
            <button className="game-sidebar-btn" onClick={() => setSidebar(prev => prev === 'arcs' ? null : 'arcs')}>🌍 World</button>
          )}
          <button className={`game-sidebar-btn ${sidebar==='companions'?'active':''}`}
            onClick={() => setSidebar(prev => prev==='companions'?null:'companions')}>🤝</button>
          {inCombat && (
            <button
              className={`game-sidebar-btn combat-active-btn`}
              onClick={() => setSidebar(prev => prev === '__combat' ? null : null)}
              title="Combat interface is open on the right"
            >
              ⚔️ In Combat
            </button>
          )}
          <button className="game-sidebar-btn" onClick={() => setShowRest(true)}>😴</button>
          <button className="game-sidebar-btn" title="Create custom content" onClick={() => setShowContentCreator(true)}>⚙️ Create</button>
          {['Cleric','Druid','Paladin','Wizard'].includes(character?.class) && (
            <button className="game-sidebar-btn" title="Prepare spells" onClick={() => setShowPrepSpells(true)}>📖 Prep</button>
          )}
          <button className="game-sidebar-btn" onClick={() => setShowSummary(true)}>📖</button>
          <button className="game-sidebar-btn" onClick={() => setShowSettings(true)}>⚙️</button>
          {['dice','sheet','quests','npcs','notes','spells','log'].map(panel => (
            <button key={panel} className={`game-sidebar-btn ${sidebar === panel ? 'active' : ''}`} onClick={() => toggleSidebar(panel)}>
              {panel === 'dice'  && '🎲 Dice'}
              {panel === 'sheet' && '📋 Sheet'}
              {panel === 'spells' && '✨ Spells'}
              {panel === 'log'    && '📜 Log'}
              {panel === 'quests'&& `📜${activeQuests.length ? ` (${activeQuests.length})` : ''}`}
              {panel === 'npcs'  && `👥${npcs.length ? ` (${npcs.length})` : ''}`}
              {panel === 'notes' && '📝'}
            </button>
          ))}
        </div>
      </div>

      <div className="game-body">
        <div className="game-chat">
          {memory?.summary && (
            <div className="memory-banner">
              <span className="memory-label">📖 Memory</span>
              <span className="memory-text">{memory.summary.slice(0, 200)}{memory.summary.length > 200 ? '…' : ''}</span>
            </div>
          )}

          <div className="game-messages">
            {messages.map((msg, idx) => {
              const isLast      = idx === messages.length - 1
              const isAssistant = msg.role === 'assistant'
              // FIX 14: Show timestamp
              const ts = new Date(msg.created_at).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
              return (
                <div key={msg.id} className={`gm-msg gm-msg-${msg.role}`}>
                  <div className="gm-avatar">{msg.role === 'user' ? '⚔' : '🎲'}</div>
                  <div className="gm-bubble-wrap">
                    <div className="gm-name">
                      {msg.role === 'user' ? character?.name || 'You' : 'Dungeon Master'}
                      <span className="gm-timestamp">{ts}</span>
                    </div>
                    <div className="gm-bubble">
                      {msg.content.split('\n').map((line, i, arr) => (
                        <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                      ))}
                    </div>
                    {isAssistant && (
                      <div className="gm-actions">
                        <button className={`gm-action-btn ${speaking === msg.id ? 'active' : ''}`} onClick={() => speak(msg.content, msg.id)}>
                          {speaking === msg.id ? '⏹ Stop' : '🔊 Listen'}
                        </button>
                        {isLast && !sending && (
                          <button className="gm-action-btn" onClick={regenerate}>🔄 Regenerate</button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {sending && (
              <div className="gm-msg gm-msg-assistant">
                <div className="gm-avatar">🎲</div>
                <div className="gm-bubble-wrap">
                  <div className="gm-name">Dungeon Master</div>
                  <div className="gm-bubble gm-typing"><span /><span /><span /></div>
                </div>
              </div>
            )}
            {campaignError && (
              <div className="game-error">⚠ {campaignError}</div>
            )}
            {(error) && (
              <div className="game-error" onClick={() => setError(null)} title="Click to dismiss">
                ⚠ {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {!sending && lastDMMessage && (
            <><div style={{ display: 'flex', alignItems: 'center', marginBottom: 3 }}>
              <button
                style={{ fontSize: '.62rem', padding: '2px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '10px', color: 'var(--parch3)', cursor: 'pointer' }}
                onClick={() => setSuggestionsEnabled(p => !p)}
              >{suggestionsEnabled ? '💡 Suggestions ON' : '💡 Suggestions OFF'}</button>
            </div><SuggestedActions lastDMMessage={lastDMMessage} characterName={character?.name} onSelect={send} disabled={sending} enabled={suggestionsEnabled} /></>
          )}

          <div className="game-input-area" style={{position:'relative'}}>
            {/* Slash command autocomplete */}
            {slashHints.length > 0 && (
              <div style={{
                position:'absolute',bottom:'calc(100% + 6px)',left:0,right:0,
                background:'var(--surface-1,#1f1200)',border:'1px solid rgba(200,146,42,.3)',
                borderRadius:'8px',overflow:'hidden',zIndex:100,boxShadow:'0 -4px 16px rgba(0,0,0,.5)'
              }}>
                {slashHints.map(cmd => (
                  <button key={cmd.id}
                    onMouseDown={e => { e.preventDefault(); setInput(cmd.aliases[0] + ' '); setSlashHints([]); inputRef.current?.focus() }}
                    style={{
                      display:'flex',alignItems:'baseline',gap:'8px',width:'100%',padding:'7px 12px',
                      background:'none',border:'none',borderBottom:'1px solid rgba(255,255,255,.06)',
                      cursor:'pointer',textAlign:'left',
                    }}>
                    <span style={{color:'var(--gold,#c8922a)',fontFamily:'monospace',fontSize:'.72rem',minWidth:'180px',flexShrink:0}}>{cmd.aliases[0]}</span>
                    <span style={{color:'var(--parch3,#aaa)',fontSize:'.66rem'}}>{cmd.description}</span>
                  </button>
                ))}
                <div style={{padding:'4px 12px',fontSize:'.58rem',color:'rgba(255,255,255,.3)'}}>
                  Tab to complete · Esc to dismiss
                </div>
              </div>
            )}
            <textarea ref={inputRef} className="game-input" value={input}
              onChange={e => {
                setInput(e.target.value)
                autoResize(e.target)
                // Show slash command hints when typing /
                if (e.target.value.startsWith('/')) {
                  const q = e.target.value.toLowerCase()
                  const hits = COMMAND_REGISTRY.filter(c =>
                    c.aliases.some(a => a.toLowerCase().startsWith(q)) ||
                    c.id.startsWith(q.slice(1))
                  ).slice(0, 6)
                  setSlashHints(hits)
                } else {
                  setSlashHints([])
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={character ? `What does ${character.name} do?` : 'What do you do?'}
              rows={1} disabled={sending} />
            <button className="game-send" onClick={() => send()} disabled={sending || !input.trim()}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Sidebar panels */}
        {sidebar && (
          <div className="game-sidebar">
            {sidebar === 'dice'  && <DiceRoller onRollResult={handleRollResult} />}
            {sidebar === 'notes'   && <NotesPanel campaignId={campaignId} userId={userId} />}
            {sidebar === 'log'    && <AdventureLog campaignId={campaignId} messages={messages} character={character} />}
            {sidebar === 'spells' && character && <SpellbookPanel character={character} campaignId={campaignId} />}

            {sidebar === 'sheet' && character && (
              <div className="sheet-panel">
                <div className="sheet-name-row">
                  <div>
                    <div className="sheet-name">{character.name}</div>
                    <div className="sheet-sub">Lv {character.level} {character.race} {character.class}{character.subclass ? ` (${character.subclass})` : ''}</div>
                    <div className="sheet-align">{character.background} · {character.alignment}</div>
                  </div>
                  <button className="sheet-edit-btn" onClick={() => setShowEditChar(true)} title="Edit character">✏️</button>
                </div>

                <div className="sheet-section">
                  <div className="sheet-section-title">Experience</div>
                  <div className="sheet-xp-bar-wrap"><div className="sheet-xp-bar" style={{ width:`${Math.min(100,xpPct)}%` }} /></div>
                  <div className="sheet-xp-text">{character.experience||0} / {character.xp_to_next_level||300} XP</div>
                </div>

                <div className="sheet-section">
                  <div className="sheet-section-title">Hit Points</div>
                  <div className="sheet-hp-bar-wrap"><div className="sheet-hp-bar" style={{ width:`${hpPct}%`, background:hpColor }} /></div>
                  <div className="sheet-hp-row">
                    {editHP ? (
                      <div className="sheet-hp-edit">
                        <input type="number" className="sheet-hp-input" value={hpInput} onChange={e => setHpInput(e.target.value)} onKeyDown={e => e.key==='Enter'&&saveHP()} placeholder={character.current_hp} autoFocus />
                        <button className="sheet-hp-save" onClick={saveHP}>✓</button>
                        <button className="sheet-hp-cancel" onClick={() => setEditHP(false)}>✕</button>
                      </div>
                    ) : (
                      <span className="sheet-hp-val" onClick={() => { setEditHP(true); setHpInput(String(character.current_hp)) }}>
                        {character.current_hp} / {character.max_hp} HP
                      </span>
                    )}
                    <span className="sheet-ac-val">AC {character.armor_class} · Prof +{character.proficiency_bonus||2} · PP {getPassivePerception(character)}</span>
                  </div>
                </div>

                <div className="sheet-section">
                  <div className="sheet-section-title">Gold</div>
                  <div className="sheet-gold">
                    {(() => {
                      const c = migrateToCurrency(character.gold ?? 10)
                      return (
                        <div style={{display:'flex',gap:'8px',flexWrap:'wrap',fontSize:'.78rem'}}>
                          {c.pp > 0 && <span style={{color:'#c8c8ff'}}>⬜ {c.pp} pp</span>}
                          {c.gp > 0 && <span style={{color:'var(--gold,#c8922a)'}}>🟡 {c.gp} gp</span>}
                          {c.sp > 0 && <span style={{color:'#c0c0c0'}}>⚪ {c.sp} sp</span>}
                          {c.cp > 0 && <span style={{color:'#b87333'}}>🟤 {c.cp} cp</span>}
                          {(c.pp+c.gp+c.sp+c.cp === 0) && <span>0 gp</span>}
                        </div>
                      )
                    })()}
                  </div>
                </div>

                <div className="sheet-section">
                  <div className="sheet-section-title">Ability Scores</div>
                  <div className="sheet-stats-grid">
                    {[['STR',character.strength],['DEX',character.dexterity],['CON',character.constitution],
                      ['INT',character.intelligence],['WIS',character.wisdom],['CHA',character.charisma]].map(([n,v]) => {
                      const m = Math.floor((v-10)/2)
                      return (
                        <div key={n} className="sheet-stat">
                          <span className="sheet-stat-name">{n}</span>
                          <span className="sheet-stat-score">{v}</span>
                          <span className="sheet-stat-mod">{m>=0?`+${m}`:m}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* FIX 15: Conditions tracker */}
                <div className="sheet-section">
                  <div className="sheet-section-title">Conditions</div>
                  <ConditionsTracker
                    conditions={activeConditions}
                    onAdd={handleConditionAdd}
                    onRemove={handleConditionRemove}
                  />
                </div>

                {character.spell_slots && Object.keys(character.spell_slots).length > 0 && (
                  <div className="sheet-section">
                    <div className="sheet-section-title">Spell Slots</div>
                    <SpellSlotTracker spellSlots={character.spell_slots} onUseSlot={spendSpellSlot} onRestoreSlot={restoreSpellSlot} />
                  </div>
                )}

                {/* Skill list */}
                <div className="sheet-section">
                  <div className="sheet-section-title">Skills</div>
                  {[['Acrobatics','DEX'],['Animal Handling','WIS'],['Arcana','INT'],['Athletics','STR'],['Deception','CHA'],['History','INT'],['Insight','WIS'],['Intimidation','CHA'],['Investigation','INT'],['Medicine','WIS'],['Nature','INT'],['Perception','WIS'],['Performance','CHA'],['Persuasion','CHA'],['Religion','INT'],['Sleight of Hand','DEX'],['Stealth','DEX'],['Survival','WIS']].map(([skill, stat]) => {
                    const bonus   = getSkillBonus(character, skill)
                    const isProficient = (character.skill_proficiencies || []).some(s => s.toLowerCase() === skill.toLowerCase())
                    const isExpert     = (character.expertise_skills || []).some(s => s.toLowerCase() === skill.toLowerCase())
                    const bonusStr = bonus >= 0 ? `+${bonus}` : `${bonus}`
                    return (
                      <div key={skill} style={{display:'flex',justifyContent:'space-between',fontSize:'.66rem',padding:'1px 0',color:isProficient?'var(--parch,#e8dcc0)':'var(--parch3,#aaa)'}}>
                        <span>{isExpert?'◆ ':isProficient?'● ':'○ '}{skill} <span style={{opacity:.5,fontSize:'.58rem'}}>({stat})</span></span>
                        <span style={{fontFamily:'var(--font-mono)',color:isExpert?'#f0c040':isProficient?'var(--gold,#c8922a)':'inherit'}}>{bonusStr}</span>
                      </div>
                    )
                  })}
                </div>

                {character.feats?.length > 0 && (
                  <div className="sheet-section">
                    <div className="sheet-section-title">Feats</div>
                    {character.feats.map((f,i) => <div key={i} className="sheet-item">⭐ {f}</div>)}
                  </div>
                )}

                {character.equipment?.length > 0 && (
                  <div className="sheet-section">
                    <div className="sheet-section-title">Equipment ({character.equipment.length})</div>
                    {character.equipment.map((e,i) => <div key={i} className="sheet-item">• {e}</div>)}
                  </div>
                )}

                {character.spells?.length > 0 && (
                  <div className="sheet-section">
                    <div className="sheet-section-title">Spells ({character.spells.length})</div>
                    {character.spells.map((s,i) => <div key={i} className="sheet-item">• {s}</div>)}
                  </div>
                )}

                <div className="sheet-section">
                  <button className="sheet-rest-btn" onClick={() => setShowRest(true)}>😴 Take a Rest</button>
                </div>

                {memory?.summary && (
                  <div className="sheet-section">
                    <div className="sheet-section-title">Campaign Memory</div>
                    <div className="sheet-memory">{memory.summary}</div>
                    <div className="sheet-memory-note">Updated every 10 messages</div>
                  </div>
                )}
              </div>
            )}

            {sidebar === 'quests' && (
              <div className="quests-panel">
                <div className="panel-title">📜 Quests
                  <span className="panel-title-sub">{activeQuests.length} active</span>
                </div>
                {quests.length === 0 && (
                  <div className="panel-empty">
                    No quests yet.<br/>
                    <span style={{fontSize:'.7rem',opacity:.6}}>Talk to NPCs and explore to discover quests.</span>
                  </div>
                )}
                {['active','completed','failed'].map(status => {
                  const filtered = quests.filter(q => q.status === status)
                  if (!filtered.length) return null
                  return (
                    <div key={status} className="quest-group">
                      <div className={`quest-status-label quest-status-${status}`}>
                        {status==='active'?'🟡 Active':status==='completed'?'✅ Completed':'❌ Failed'}
                        <span className="quest-count">{filtered.length}</span>
                      </div>
                      {filtered.map(q => (
                        <div key={q.id} className={`quest-card quest-${q.status}`}>
                          <div className="quest-title-row">
                            <div className="quest-title">{q.title}</div>
                            {q.status==='active' && (
                              <div className="quest-actions">
                                <button className="quest-btn quest-btn-complete" title="Mark complete" onClick={() => updateQuestStatus(q.id,'completed')}>✓</button>
                                <button className="quest-btn quest-btn-fail"     title="Mark failed"   onClick={() => updateQuestStatus(q.id,'failed')}>✗</button>
                              </div>
                            )}
                          </div>
                          {q.giver       && <div className="quest-meta">📍 From: {q.giver}</div>}
                          {q.description && <div className="quest-desc">{q.description}</div>}
                          {q.reward      && <div className="quest-reward">🏆 Reward: {q.reward}</div>}
                          {/* Progress bar for active quests */}
                          {q.status==='active' && (
                            <div className="quest-progress-wrap">
                              <div className="quest-progress-bar"
                                style={{width: q.progress ? `${Math.min(100,q.progress)}%` : '15%'}}/>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}

            {sidebar === 'npcs' && (
              <NPCPanel
                npcs={npcs}
                onUpdateNPC={async (id, updates) => {
                  await supabase.from('npcs').update(updates).eq('id', id)
                  // Refresh npcs from DB would require useCampaign exposure; for now optimistic update
                }}
                onTalkTo={(npcName) => {
                  setInput(`I speak with ${npcName}.`)
                  setSidebar(null)
                  setTimeout(() => inputRef.current?.focus(), 50)
                }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

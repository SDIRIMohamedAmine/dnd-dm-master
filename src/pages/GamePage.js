// src/pages/GamePage.js
import { useState, useRef, useEffect } from 'react'
import { useCampaign } from '../hooks/useCampaign'
import { callDM, callOpeningScene, cleanDMText } from '../lib/openrouter'
import { supabase } from '../lib/supabase'
import { retrieveFromSupabase, buildContextBlock, lookupMonsterStats, selectEncounterMonsters } from '../lib/rag'
import {
  generateStoryArcs, loadStoryArcs, getDominantArc,
  extractArcDeltas, updateArcPower, buildArcPromptBlock, fetchArcLore,
} from '../lib/storyArcs'
import DiceRoller          from '../components/DiceRoller'
import LevelUpModal        from '../components/LevelUpModal'
import RestModal           from '../components/RestModal'
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
import LootPanel          from '../components/LootPanel'
import MerchantPanel      from '../components/MerchantPanel'
import ArmorModal         from '../components/ArmorModal'
import EventToastContainer, { showGameEvent } from '../components/EventToast'
import './GamePage.css'

export default function GamePage({ campaignId, userId, campaign, onBack, onCampaignUpdate }) {
  const {
    messages, character, memory, npcs, quests, loading,
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
      const statVal  = character[statKey] || 10
      const statMod_ = Math.floor((statVal - 10) / 2)
      const profBonus = character.proficiency_bonus || 2
      // Check if character has proficiency (background skills or class saves)
      const profSkills = character.skill_proficiencies || []
      const hasProficiency = profSkills.some(s => s.toLowerCase().includes(skill.toLowerCase()))
      const totalMod = statMod_ + (hasProficiency ? profBonus : 0)
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

      return buildContextBlock(chunks.slice(0, 7))
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

  async function handleEquipArmor(slot, itemName) {
    const { calculateAC } = await import('../lib/items')
    const equipped = { ...(character.equipped || {}), [slot]: itemName }
    const newAC    = calculateAC(equipped, { dexterity: character.dexterity, constitution: character.constitution, wisdom: character.wisdom, class: character.class })
    await updateCharacterStats({ equipped, armor_class: newAC })
  }

  async function handleUnequipArmor(slot) {
    const { calculateAC } = await import('../lib/items')
    const equipped = { ...(character.equipped || {}), [slot]: null }
    const newAC    = calculateAC(equipped, { dexterity: character.dexterity, constitution: character.constitution, wisdom: character.wisdom, class: character.class })
    await updateCharacterStats({ equipped, armor_class: newAC })
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
    const total   = roll + skillCheck.statMod
    const success = total >= skillCheck.dc
    const isCrit  = roll === 20
    const isFumble = roll === 1

    let resultMsg
    if (isCrit)   resultMsg = `I rolled a Natural 20! Total: ${total} vs DC ${skillCheck.dc} — Critical Success!`
    else if (isFumble) resultMsg = `I rolled a Natural 1. Total: ${total} vs DC ${skillCheck.dc} — Critical Failure!`
    else if (success) resultMsg = `I rolled ${roll} + ${skillCheck.statMod} = ${total}. That's ${total - skillCheck.dc} above DC ${skillCheck.dc} — Success!`
    else          resultMsg = `I rolled ${roll} + ${skillCheck.statMod} = ${total}. That's ${skillCheck.dc - total} below DC ${skillCheck.dc} — Failure.`

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
      updates.experience = (character.experience || 0) + xpGained
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

    // Show toast notifications
    const eventPayload = {
      xpGain: xpGained || null,
      goldChange: loot?.totalGold || null,
      newItems: loot?.items || [],
      removeItems:[], newSpells:[], newNPCs:[], newQuests:[], questComplete:[],
      levelUp:null, hpChange:null, newConditions:[], removedConditions:[]
    }
    showGameEvent(eventPayload)
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

  async function send(overrideText) {
    const content = (overrideText || input).trim()
    if (!content || sending) return
    setInput('')
    setError(null)

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
      const reply      = await callDM({ messages: history, character, memory, ragContext, npcs, quests, campaignSettings: campaignData, monsterContext, suggestedMonsters, storyArcs })
      const clean      = cleanDMText(reply)
      await saveMessage('assistant', clean)
      const { events } = await processDMReply(reply, content)
      showGameEvent(events)
      if (events.levelUp) setLevelUpData({ newLevel: events.levelUp })

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
      const reply  = await callDM({ messages: filteredHistory, character, memory, ragContext, npcs, quests, campaignSettings: campaignData, monsterContext, suggestedMonsters, storyArcs })
      const clean  = cleanDMText(reply)
      await saveMessage('assistant', clean)
      const { events } = await processDMReply(reply, lastUserMsg)
      showGameEvent(events)
    } catch (err) { setError(err.message) }
    finally { setSending(false) }
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
    setInput(prev => { const b = prev.trim(); return b ? `${b}\n${result.summary}` : result.summary })
    inputRef.current?.focus()
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
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
            <span className="game-gold">⚙ {character.gold ?? 10} gp</span>
            {activeConditions.length > 0 && (
              <><span className="game-sep">·</span>
              <span className="game-conditions">⚠ {activeConditions.join(', ')}</span></>
            )}
          </div>
        )}
        <div className="game-topbar-actions">
          <AmbientSound />
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
          <button className="game-sidebar-btn" onClick={() => setShowSummary(true)}>📖</button>
          <button className="game-sidebar-btn" onClick={() => setShowSettings(true)}>⚙️</button>
          {['dice','sheet','quests','npcs','notes'].map(panel => (
            <button key={panel} className={`game-sidebar-btn ${sidebar === panel ? 'active' : ''}`} onClick={() => toggleSidebar(panel)}>
              {panel === 'dice'  && '🎲 Dice'}
              {panel === 'sheet' && '📋 Sheet'}
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
            {error && <div className="game-error"><strong>Error:</strong> {error}</div>}
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

          <div className="game-input-area">
            <textarea ref={inputRef} className="game-input" value={input}
              onChange={e => { setInput(e.target.value); autoResize(e.target) }}
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
            {sidebar === 'notes' && <NotesPanel campaignId={campaignId} userId={userId} />}

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
                    <span className="sheet-ac-val">AC {character.armor_class} · +{character.proficiency_bonus||2}</span>
                  </div>
                </div>

                <div className="sheet-section">
                  <div className="sheet-section-title">Gold</div>
                  <div className="sheet-gold">⚙ {character.gold??10} gp</div>
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
              <div className="npcs-panel">
                <div className="panel-title">👥 Known NPCs</div>
                {npcs.length === 0 && <div className="panel-empty">No NPCs encountered yet.</div>}
                {['ally','neutral','foe'].map(role => {
                  const filtered = npcs.filter(n => n.role === role)
                  if (!filtered.length) return null
                  return (
                    <div key={role}>
                      <div className={`npc-role-label npc-role-${role}`}>
                        {role==='ally'?'💚 Allies':role==='foe'?'❤️ Foes':'⬜ Neutral'}
                      </div>
                      {filtered.map(n => (
                        <div key={n.id} className={`npc-card npc-${n.role}`}>
                          <div className="npc-name">{n.name}</div>
                          {n.location    && <div className="npc-location">📍 {n.location}</div>}
                          {n.description && <div className="npc-desc">{n.description}</div>}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

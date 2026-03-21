// src/hooks/useCampaign.js
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { callSummarizer, parseGameEvents, extractGameEvents, actionNeedsExtraction } from '../lib/openrouter'
import { levelFromXP, xpToNextLevel, proficiencyBonus } from '../lib/subclasses'
import { buildInitialSlots, useSlot as applySlotUsage, HIT_DICE } from '../lib/spellSlots'

const SUMMARY_EVERY = 10

export function useCampaign(campaignId, userId) {
  const [messages,  setMessages]  = useState([])
  const [character, setCharacter] = useState(null)
  const [memory,    setMemory]    = useState(null)
  const [npcs,      setNpcs]      = useState([])
  const [quests,    setQuests]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)

  // FIX 7: Use refs for npcs/quests in processEvents to avoid stale closure
  const npcsRef   = useRef([])
  const questsRef = useRef([])
  useEffect(() => { npcsRef.current   = npcs   }, [npcs])
  useEffect(() => { questsRef.current = quests }, [quests])

  useEffect(() => {
    if (!campaignId || !userId) return
    setLoading(true)
    async function load() {
      try {
        const [msgRes, charRes, memRes, npcRes, questRes] = await Promise.all([
          supabase.from('messages').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: true }),
          supabase.from('characters').select('*').eq('campaign_id', campaignId).single(),
          supabase.from('campaign_memory').select('*').eq('campaign_id', campaignId).single(),
          supabase.from('npcs').select('*').eq('campaign_id', campaignId).order('created_at'),
          supabase.from('quests').select('*').eq('campaign_id', campaignId).order('created_at'),
        ])
        setMessages(msgRes.data || [])
        setNpcs(npcRes.data || [])
        setQuests(questRes.data || [])
        const memData = memRes.data || null
        setMemory(memData)
        const char = charRes.data
        if (char && (!char.spell_slots || Object.keys(char.spell_slots || {}).length === 0)) {
          const slots = buildInitialSlots(char.class, char.level)
          if (Object.keys(slots).length > 0) {
            const { data: upd } = await supabase.from('characters')
              .update({ spell_slots: slots }).eq('id', char.id).select().single()
            setCharacter(upd || char)
          } else { setCharacter(char) }
        } else { setCharacter(char || null) }
      } catch (err) { setError(err.message) }
      finally { setLoading(false) }
    }
    load()
  }, [campaignId, userId])

  // FIX 7: Use ref-based npcs/quests for duplicate checking
  const processEvents = useCallback(async (events, currentChar) => {
    if (!currentChar) return currentChar
    let updatedChar = { ...currentChar }
    let needsUpdate = false

    if (events.newItems?.length) {
      const ex = updatedChar.equipment || []
      updatedChar.equipment = [...ex, ...events.newItems.filter(i => !ex.includes(i))]
      needsUpdate = true
    }
    if (events.removeItems?.length) {
      const ex = updatedChar.equipment || []
      updatedChar.equipment = ex.filter(item =>
        !events.removeItems.some(ri => item.toLowerCase().includes(ri.toLowerCase()))
      )
      needsUpdate = true
    }
    if (events.newSpells?.length) {
      const ex = updatedChar.spells || []
      // Normalize: strip (cantrip) suffix, filter placeholders and duplicates
      const cleanNew = events.newSpells
        .map(s => s.replace(/\s*\(cantrip\)/i, '').trim())
        .filter(s => s.length > 1 && !s.includes('[') && !s.includes(']'))
      const cleanEx  = ex.map(s => s.replace(/\s*\(cantrip\)/i, '').trim())
      updatedChar.spells = [...new Set([...cleanEx, ...cleanNew.filter(s => !cleanEx.includes(s))])]
      needsUpdate = true
    }
    if (events.goldChange !== null && events.goldChange !== undefined) {
      updatedChar.gold = Math.max(0, (updatedChar.gold ?? 10) + events.goldChange)
      needsUpdate = true
    }
    // HP FIX: explicit hpChange from extractor
    if (events.hpChange !== null && events.hpChange !== undefined && events.hpChange !== 0) {
      const newHP = Math.max(0, Math.min(
        updatedChar.max_hp,
        (updatedChar.current_hp ?? updatedChar.max_hp) + events.hpChange
      ))
      updatedChar.current_hp = newHP
      needsUpdate = true
    }
    // Conditions
    if (events.newConditions?.length) {
      const ex = updatedChar.conditions || []
      updatedChar.conditions = [...new Set([...ex, ...events.newConditions])]
      needsUpdate = true
    }
    if (events.removedConditions?.length) {
      const ex = updatedChar.conditions || []
      updatedChar.conditions = ex.filter(c =>
        !events.removedConditions.some(rc => c.toLowerCase() === rc.toLowerCase())
      )
      needsUpdate = true
    }
    if (events.xpGain) {
      const newXP    = (updatedChar.experience || 0) + events.xpGain
      const newLevel = levelFromXP(newXP)
      updatedChar.experience = newXP
      if (newLevel > updatedChar.level) {
        updatedChar.level             = newLevel
        updatedChar.xp_to_next_level  = xpToNextLevel(newLevel)
        updatedChar.proficiency_bonus = proficiencyBonus(newLevel)
        const conMod = Math.floor(((updatedChar.constitution || 10) - 10) / 2)
        updatedChar.max_hp = (updatedChar.max_hp || 10) + Math.floor((HIT_DICE[updatedChar.class] || 8) / 2) + 1 + conMod
        const newSlots = buildInitialSlots(updatedChar.class, newLevel)
        if (Object.keys(newSlots).length > 0) updatedChar.spell_slots = newSlots
      }
      needsUpdate = true
    }
    if (events.levelUp && events.levelUp > updatedChar.level) {
      updatedChar.level             = events.levelUp
      updatedChar.xp_to_next_level  = xpToNextLevel(events.levelUp)
      updatedChar.proficiency_bonus = proficiencyBonus(events.levelUp)
      const newSlots = buildInitialSlots(updatedChar.class, events.levelUp)
      if (Object.keys(newSlots).length > 0) updatedChar.spell_slots = newSlots
      needsUpdate = true
    }

    if (needsUpdate) {
      const { data } = await supabase.from('characters')
        .update({ ...updatedChar, updated_at: new Date().toISOString() })
        .eq('campaign_id', campaignId).select().single()
      if (data) { setCharacter(data); return data }
    }

    // FIX 7: Use refs so we always see latest npcs/quests
    for (const npc of (events.newNPCs || [])) {
      if (!npcsRef.current.find(n => n.name.toLowerCase() === npc.name.toLowerCase())) {
        const rawRole = (npc.role || '').toLowerCase()
        const role = rawRole.includes('ally') || rawRole.includes('friend') ? 'ally'
          : rawRole.includes('foe') || rawRole.includes('enemy') ? 'foe' : 'neutral'
        const { data } = await supabase.from('npcs')
          .insert({ ...npc, role, campaign_id: campaignId, user_id: userId }).select().single()
        if (data) setNpcs(prev => { const next = [...prev, data]; npcsRef.current = next; return next })
      }
    }
    for (const quest of (events.newQuests || [])) {
      if (!questsRef.current.find(q => q.title.toLowerCase() === quest.title.toLowerCase())) {
        const { data } = await supabase.from('quests')
          .insert({ ...quest, campaign_id: campaignId, user_id: userId, status: 'active' }).select().single()
        if (data) setQuests(prev => { const next = [...prev, data]; questsRef.current = next; return next })
      }
    }
    for (const title of (events.questComplete || [])) {
      const quest = questsRef.current.find(q => q.title.toLowerCase() === title.toLowerCase())
      if (quest) {
        await supabase.from('quests').update({ status: 'completed' }).eq('id', quest.id)
        setQuests(prev => prev.map(q => q.id === quest.id ? { ...q, status: 'completed' } : q))
      }
    }
    return updatedChar
  }, [campaignId, userId])

  const saveMessage = useCallback(async (role, content) => {
    const { data, error } = await supabase.from('messages')
      .insert({ campaign_id: campaignId, user_id: userId, role, content }).select().single()
    if (error) throw error
    setMessages(prev => {
      const updated = [...prev, data]
      if (updated.length % SUMMARY_EVERY === 0) updateMemorySummary(updated)
      return updated
    })
    await supabase.from('campaigns').update({ updated_at: new Date().toISOString() }).eq('id', campaignId)
    return data
  }, [campaignId, userId]) // eslint-disable-line

  // FIX 1+2: Smart extraction — only run when action is meaningful
  const processDMReply = useCallback(async (dmContent, playerAction) => {
    let events
    if (playerAction && actionNeedsExtraction(playerAction)) {
      events = await extractGameEvents(playerAction, dmContent, character)
    } else {
      events = parseGameEvents(dmContent)
    }
    const updated = await processEvents(events, character)
    return { events, updatedCharacter: updated }
  }, [character, processEvents])

  const updateMemorySummary = useCallback(async (allMessages) => {
    try {
      const newSummary = await callSummarizer(memory?.summary || '', allMessages.slice(-SUMMARY_EVERY))
      if (memory) {
        const { data } = await supabase.from('campaign_memory')
          .update({ summary: newSummary, message_count: allMessages.length, updated_at: new Date().toISOString() })
          .eq('campaign_id', campaignId).select().single()
        if (data) setMemory(data)
      } else {
        const { data } = await supabase.from('campaign_memory')
          .insert({ campaign_id: campaignId, summary: newSummary, message_count: allMessages.length }).select().single()
        if (data) setMemory(data)
      }
    } catch (err) { console.warn('[Memory]', err.message) }
  }, [campaignId, memory])

  const saveCharacter = useCallback(async (charData) => {
    if (character) {
      const { data, error } = await supabase.from('characters')
        .update({ ...charData, updated_at: new Date().toISOString() })
        .eq('campaign_id', campaignId).select().single()
      if (error) throw error; setCharacter(data); return data
    } else {
      const { data, error } = await supabase.from('characters')
        .insert({ ...charData, campaign_id: campaignId, user_id: userId }).select().single()
      if (error) throw error; setCharacter(data); return data
    }
  }, [campaignId, userId, character])

  const updateCharacterStats = useCallback(async (updates) => {
    const { data, error } = await supabase.from('characters')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('campaign_id', campaignId).select().single()
    if (error) throw error
    setCharacter(data)
    return data
  }, [campaignId])

  const performRest = useCallback(async (type, updates) => {
    // Clear conditions on long rest
    if (type === 'long') updates.conditions = []
    return await updateCharacterStats(updates)
  }, [updateCharacterStats])

  const spendSpellSlot = useCallback(async (level) => {
    if (!character?.spell_slots) return
    const updated = applySlotUsage(character.spell_slots, level)
    if (updated) await updateCharacterStats({ spell_slots: updated })
  }, [character, updateCharacterStats])

  const restoreSpellSlot = useCallback(async (level) => {
    if (!character?.spell_slots) return
    const slots = { ...character.spell_slots }
    const key   = String(level)
    if (slots[key] && slots[key].used > 0) {
      slots[key] = { ...slots[key], used: slots[key].used - 1 }
      await updateCharacterStats({ spell_slots: slots })
    }
  }, [character, updateCharacterStats])

  const deleteLastAssistantMessage = useCallback(async () => {
    const last = [...messages].reverse().find(m => m.role === 'assistant')
    if (!last) return
    await supabase.from('messages').delete().eq('id', last.id)
    setMessages(prev => prev.filter(m => m.id !== last.id))
  }, [messages])

  const updateQuestStatus = useCallback(async (questId, status) => {
    await supabase.from('quests').update({ status, updated_at: new Date().toISOString() }).eq('id', questId)
    setQuests(prev => prev.map(q => q.id === questId ? { ...q, status } : q))
  }, [])

  // Save combat state to campaign_memory so it survives refresh
  const saveCombatState = async (inCombat, combatants) => {
    try {
      if (memory) {
        await supabase.from('campaign_memory')
          .update({ in_combat: inCombat, initiative_order: combatants || [] })
          .eq('campaign_id', campaignId)
      } else {
        // Create memory row if it doesn't exist
        const { data } = await supabase.from('campaign_memory')
          .insert({ campaign_id: campaignId, summary: '', in_combat: inCombat, initiative_order: combatants || [] })
          .select().single()
        if (data) setMemory(data)
      }
    } catch (err) { console.warn('[Combat state save]', err.message) }
  }

  return {
    messages, character, memory, npcs, quests, loading, error,
    saveMessage, saveCharacter, updateCharacterStats,
    processDMReply, deleteLastAssistantMessage,
    updateQuestStatus, performRest, spendSpellSlot, restoreSpellSlot,
    saveCombatState,
  }
}

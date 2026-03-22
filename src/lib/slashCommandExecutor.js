// src/lib/slashCommandExecutor.js
// ══════════════════════════════════════════════════════════════
// SLASH COMMAND EXECUTOR
//
// Each command handler receives:
//   ctx — everything from GamePage the command needs to read/write
//   argsStr — raw argument string after the command
//
// Returns a SlashResult:
// {
//   handled:      true,
//   feedback:     string shown as a system message in chat,
//   stateChanges: object applied to game state (see handlers),
//   skipDM:       bool — true means don't call the LLM at all,
//   sendToDM:     string | null — if set, send this text to the DM after applying state
// }
// ══════════════════════════════════════════════════════════════

import { parseSlashCommand, getHelpText, rollDiceExpr } from './slashCommands'
import { getItem, detectItemSlot }                       from './items'
import { migrateToCurrency, addGold, formatCurrency }    from './currency'

// ── Execute any slash command ────────────────────────────────
export async function executeSlashCommand(raw, ctx) {
  const parsed = parseSlashCommand(raw)
  if (!parsed) return { handled: false }

  const { commandId, argsStr } = parsed
  const handler = HANDLERS[commandId]
  if (!handler) return { handled: false }

  try {
    return await handler(argsStr, ctx)
  } catch (e) {
    return {
      handled:  true,
      feedback: `⚠ Command error: ${e.message}`,
      skipDM:   true,
    }
  }
}

// ── Result factory ────────────────────────────────────────────
function result(feedback, stateChanges = {}, opts = {}) {
  return { handled: true, feedback, stateChanges, skipDM: opts.skipDM ?? true, sendToDM: opts.sendToDM ?? null }
}

// ── HANDLERS ──────────────────────────────────────────────────

const HANDLERS = {

  // ──────────────────────────────────────────────────────────
  // /start combat goblin, orc warrior
  // ──────────────────────────────────────────────────────────
  start_combat: async (argsStr, ctx) => {
    if (ctx.inCombat) return result('⚠ Already in combat. Use /end combat first.')

    const raw = argsStr.trim()
    if (!raw) return result('Usage: /start combat <enemy1>[, enemy2, ...]')

    // Number words → integer
    const WORD_NUMS = { one:1,a:1,an:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10 }

    function singular(name) {
      const s = name.trim()
      if (/ves$/i.test(s))                         return s.replace(/ves$/i, 'f')
      if (/ies$/i.test(s))                         return s.replace(/ies$/i, 'y')
      if (/s$/i.test(s) && !/ss$/i.test(s))        return s.replace(/s$/i, '')
      return s
    }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1) }

    function expandEntry(entry) {
      const t = entry.trim(); if (!t) return []
      // "2x goblin" or "2 goblins"
      const pre = t.match(/^(\d+)x?\s+(.+)$/i)
      if (pre) return Array(Math.min(+pre[1], 6)).fill(cap(singular(pre[2])))
      // "goblin x2" or "goblin 2"
      const suf = t.match(/^(.+?)\s+x?(\d+)$/i)
      if (suf) return Array(Math.min(+suf[2], 6)).fill(cap(singular(suf[1])))
      // "two goblins", "three rats"
      const words = t.split(/\s+/), first = words[0].toLowerCase()
      if (WORD_NUMS[first] !== undefined)
        return Array(Math.min(WORD_NUMS[first], 6)).fill(cap(singular(words.slice(1).join(' '))))
      return [cap(t)]
    }

    const enemyNames = raw.split(',').flatMap(expandEntry).filter(Boolean).slice(0, 6)
    if (!enemyNames.length) return result('⚠ Specify at least one enemy name.')

    const dexMod    = Math.floor(((ctx.character?.dexterity || 10) - 10) / 2)
    const pInit     = Math.floor(Math.random()*20) + 1 + dexMod
    const initLines = [
      ...enemyNames.map(n => `- ${n}: ${Math.floor(Math.random()*20)+1}`),
      `- ${ctx.character?.name}: ${pInit}`,
    ].join('\n')

    // Feedback: group duplicates as "2× Goblin"
    const counts = {}
    for (const n of enemyNames) counts[n] = (counts[n] || 0) + 1
    const summary = Object.entries(counts).map(([n,c]) => c > 1 ? `${c}× ${n}` : n).join(', ')

    return {
      handled: true,
      feedback: `⚔️ Combat started against: ${summary}`,
      stateChanges: { startCombat: true, combatEnemies: enemyNames },
      skipDM:   false,
      sendToDM: `⚔️ COMBAT BEGINS\nInitiative Order:\n${initLines}`,
    }
  },
  // ──────────────────────────────────────────────────────────
  // /end combat [victory|fled|defeated]
  // ──────────────────────────────────────────────────────────
  end_combat: async (argsStr, ctx) => {
    if (!ctx.inCombat) return result('⚠ Not in combat.')
    const outcome = argsStr.trim().toLowerCase() || 'victory'
    const valid   = ['victory', 'fled', 'defeated', 'escape', 'flee', 'retreat']
    const resolved = valid.includes(outcome) ? outcome : 'victory'
    return {
      handled: true,
      feedback: `Combat ended — ${resolved}.`,
      stateChanges: { endCombat: true, combatOutcome: resolved },
      skipDM:   false,
      sendToDM: `The combat ends. Outcome: ${resolved}.`,
    }
  },

  // ──────────────────────────────────────────────────────────
  // /get Healing Potion x2
  // /get "Blade of Blood"
  // ──────────────────────────────────────────────────────────
  get_item: async (argsStr, ctx) => {
    const raw = argsStr.trim()
    if (!raw) return result('Usage: /get <item name> [x<qty>]')

    // Parse quantity suffix: "Healing Potion x2" or "Healing Potion 2"
    const qtyMatch = raw.match(/\s+x?(\d+)$/i)
    const qty      = qtyMatch ? Math.min(parseInt(qtyMatch[1]), 99) : 1
    const itemName = qtyMatch ? raw.slice(0, raw.length - qtyMatch[0].length).trim() : raw
    const clean    = itemName.replace(/^"|"$/g, '').trim()   // strip quotes

    if (!clean) return result('⚠ Item name required.')

    const itemData = getItem(clean)
    const display  = qty > 1 ? `${qty}× ${clean}` : clean
    const rarity   = itemData.rarity ? ` (${itemData.rarity})` : ''

    return result(
      `✅ Added ${display}${rarity} to inventory.`,
      { addItems: Array(qty).fill(clean) },
      { skipDM: false, sendToDM: null }
    )
  },

  // ──────────────────────────────────────────────────────────
  // /remove Torch
  // ──────────────────────────────────────────────────────────
  remove_item: async (argsStr, ctx) => {
    const itemName = argsStr.trim().replace(/^"|"$/g, '')
    if (!itemName) return result('Usage: /remove <item name>')

    const equip = ctx.character?.equipment || []
    const idx   = equip.findIndex(e => e.toLowerCase().includes(itemName.toLowerCase()))
    if (idx === -1) return result(`⚠ "${itemName}" not found in inventory.`)

    return result(
      `🗑 Removed ${equip[idx]} from inventory.`,
      { removeItem: equip[idx] },
    )
  },

  // ──────────────────────────────────────────────────────────
  // /equip Longsword
  // /equip Ring of Protection in ring2
  // ──────────────────────────────────────────────────────────
  equip: async (argsStr, ctx) => {
    const slotMatch = argsStr.match(/\s+in\s+(\w+)$/i)
    const slot      = slotMatch?.[1]?.toLowerCase() || null
    const name      = (slotMatch ? argsStr.slice(0, argsStr.length - slotMatch[0].length) : argsStr).trim().replace(/^"|"$/g, '')

    const equip  = ctx.character?.equipment || []
    const found  = equip.find(e => e.toLowerCase().includes(name.toLowerCase()))
    if (!found) return result(`⚠ "${name}" not in inventory. Use /get first.`)

    const itemData    = getItem(found)
    const targetSlot  = slot || itemData.slot || detectItemSlot(found)
    if (!targetSlot)  return result(`⚠ Can't detect slot for "${found}". Use /equip "${found}" in <slot>.`)

    return result(
      `🛡 Equipped ${found} in ${targetSlot} slot.`,
      { equipItem: { slot: targetSlot, itemName: found } },
    )
  },

  // ──────────────────────────────────────────────────────────
  // /gold +50    /gold -20    /gold set 100
  // ──────────────────────────────────────────────────────────
  gold: async (argsStr, ctx) => {
    const raw = argsStr.trim()
    if (!raw) return result('Usage: /gold +<n>  or  /gold -<n>  or  /gold set <n>')

    const setMatch = raw.match(/^set\s+(\d+)/i)
    const delta    = setMatch ? null : parseFloat(raw.replace(/[^0-9.+-]/g, ''))

    if (setMatch) {
      const amount = parseInt(setMatch[1])
      const currency = migrateToCurrency(amount)
      return result(
        `💰 Gold set to ${formatCurrency(currency)}.`,
        { setGold: currency },
      )
    }
    if (isNaN(delta)) return result('⚠ Invalid amount. Example: /gold +50')
    const current  = ctx.character?.gold ?? 0
    const newGold  = addGold(current, delta)
    return result(
      `💰 ${delta >= 0 ? '+' : ''}${delta} gp → ${formatCurrency(newGold)}`,
      { setGold: newGold },
    )
  },

  // ──────────────────────────────────────────────────────────
  // /hp +15    /hp -8    /hp full    /hp set 20
  // ──────────────────────────────────────────────────────────
  hp: async (argsStr, ctx) => {
    const raw     = argsStr.trim().toLowerCase()
    const char    = ctx.character
    const maxHP   = char?.max_hp || 10
    const currHP  = char?.current_hp || 0

    if (raw === 'full' || raw === 'max') {
      return result(
        `💚 HP restored to full (${maxHP}/${maxHP}).`,
        { setHP: maxHP },
      )
    }
    const setM = raw.match(/^set\s+(\d+)/i)
    if (setM) {
      const v = Math.min(maxHP, Math.max(0, parseInt(setM[1])))
      return result(`💚 HP set to ${v}/${maxHP}.`, { setHP: v })
    }
    const delta = parseInt(raw.replace(/[^0-9+-]/g, ''))
    if (isNaN(delta)) return result('Usage: /hp +15  /hp -8  /hp full  /hp set 20')
    const newHP = Math.min(maxHP, Math.max(0, currHP + delta))
    const icon  = delta >= 0 ? '💚' : '🩸'
    return result(
      `${icon} HP: ${currHP} → ${newHP}/${maxHP} (${delta >= 0 ? '+' : ''}${delta})`,
      { setHP: newHP },
    )
  },

  // ──────────────────────────────────────────────────────────
  // /levelup
  // ──────────────────────────────────────────────────────────
  level_up: async (argsStr, ctx) => {
    const current = ctx.character?.level || 1
    const newLvl  = Math.min(20, current + 1)
    return result(
      `⭐ Level-up triggered! (${current} → ${newLvl})`,
      { triggerLevelUp: newLvl },
    )
  },

  // ──────────────────────────────────────────────────────────
  // /spell Fireball
  // ──────────────────────────────────────────────────────────
  add_spell: async (argsStr, ctx) => {
    const spellName = argsStr.trim().replace(/^"|"$/g, '')
    if (!spellName) return result('Usage: /spell <spell name>')
    const existing  = ctx.character?.spells || []
    if (existing.some(s => s.toLowerCase() === spellName.toLowerCase())) {
      return result(`⚠ ${spellName} already in your spell list.`)
    }
    return result(
      `✨ ${spellName} added to your spells.`,
      { addSpell: spellName },
    )
  },

  // ──────────────────────────────────────────────────────────
  // /condition add Poisoned
  // /condition remove Blinded
  // ──────────────────────────────────────────────────────────
  condition: async (argsStr, ctx) => {
    const m = argsStr.trim().match(/^(add|remove|set|clear)\s+(.+)$/i)
    if (!m) return result('Usage: /condition add <name>  or  /condition remove <name>')
    const action    = m[1].toLowerCase()
    const condName  = m[2].trim()
    const VALID     = ['Blinded','Charmed','Deafened','Frightened','Grappled','Incapacitated','Invisible','Paralyzed','Petrified','Poisoned','Prone','Restrained','Stunned','Unconscious']
    const matched   = VALID.find(c => c.toLowerCase() === condName.toLowerCase()) || condName

    if (action === 'add' || action === 'set') {
      return result(
        `🩺 Condition "${matched}" added.`,
        { addCondition: matched },
      )
    } else {
      return result(
        `✅ Condition "${matched}" removed.`,
        { removeCondition: matched },
      )
    }
  },

  // ──────────────────────────────────────────────────────────
  // /inspiration
  // ──────────────────────────────────────────────────────────
  inspiration: async (argsStr, ctx) => {
    return result(
      '✨ Inspiration granted!',
      { grantInspiration: true },
    )
  },

  // ──────────────────────────────────────────────────────────
  // /rest short    /rest long
  // ──────────────────────────────────────────────────────────
  rest: async (argsStr, ctx) => {
    const type = argsStr.trim().toLowerCase().includes('long') ? 'long' : 'short'
    return result(
      `😴 ${type === 'long' ? 'Long' : 'Short'} rest — opening rest dialog.`,
      { triggerRest: type },
    )
  },

  // ──────────────────────────────────────────────────────────
  // /slots restore
  // /slots restore 3
  // /slots use 2
  // ──────────────────────────────────────────────────────────
  slots: async (argsStr, ctx) => {
    const parts   = argsStr.trim().toLowerCase().split(/\s+/)
    const action  = parts[0] || 'restore'
    const level   = parts[1] ? parseInt(parts[1]) : null

    if (action === 'restore') {
      return result(
        level ? `🔮 Level ${level} spell slot restored.` : '🔮 All spell slots restored.',
        { restoreSlots: level || 'all' },
      )
    }
    if (action === 'use') {
      if (!level) return result('Usage: /slots use <level>  e.g. /slots use 3')
      return result(
        `🔮 Level ${level} spell slot used.`,
        { useSlot: level },
      )
    }
    return result('Usage: /slots restore [level]  or  /slots use <level>')
  },

  // ──────────────────────────────────────────────────────────
  // /npc add Thalara Moonsong ally
  // ──────────────────────────────────────────────────────────
  npc: async (argsStr, ctx) => {
    const m = argsStr.trim().match(/^add\s+(.+?)(?:\s+(ally|foe|neutral))?$/i)
    if (!m) return result('Usage: /npc add <name> [ally|foe|neutral]')
    const name = m[1].trim()
    const role = (m[2] || 'neutral').toLowerCase()
    return result(
      `👤 NPC "${name}" (${role}) added.`,
      { addNPC: { name, role, location: '', description: '' } },
      { skipDM: false, sendToDM: `I encounter ${name}.` },
    )
  },

  // ──────────────────────────────────────────────────────────
  // /quest add Find the missing artifact
  // /quest complete Find the missing artifact
  // ──────────────────────────────────────────────────────────
  quest: async (argsStr, ctx) => {
    const m = argsStr.trim().match(/^(add|complete|finish|done)\s+(.+)$/i)
    if (!m) return result('Usage: /quest add <title>  or  /quest complete <title>')
    const action = m[1].toLowerCase()
    const title  = m[2].trim()
    if (action === 'add') {
      return result(
        `📜 Quest "${title}" added.`,
        { addQuest: { title, description: '', giver: 'Unknown', reward: '' } },
      )
    } else {
      return result(
        `✅ Quest "${title}" completed!`,
        { completeQuest: title },
      )
    }
  },

  // ──────────────────────────────────────────────────────────
  // /tp Ironhold Tavern
  // ──────────────────────────────────────────────────────────
  teleport: async (argsStr, ctx) => {
    const location = argsStr.trim()
    if (!location) return result('Usage: /tp <location name>')
    return result(
      `🗺️ Teleporting to "${location}"…`,
      {},
      { skipDM: false, sendToDM: `I travel to ${location}. Describe my arrival.` },
    )
  },

  // ──────────────────────────────────────────────────────────
  // /time +8    /time set dawn
  // ──────────────────────────────────────────────────────────
  time: async (argsStr, ctx) => {
    const raw = argsStr.trim()
    const advance = raw.match(/^\+?(\d+)h?(?:ours?)?/i)
    const setTime = raw.match(/^set\s+(.+)/i)

    if (advance) {
      const hrs = parseInt(advance[1])
      return result(
        `🕐 Time advanced by ${hrs} hour${hrs !== 1 ? 's' : ''}.`,
        {},
        { skipDM: false, sendToDM: `${hrs} hour${hrs !== 1 ? 's' : ''} pass. What changes?` },
      )
    }
    if (setTime) {
      const t = setTime[1]
      return result(
        `🕐 Time set to ${t}.`,
        {},
        { skipDM: false, sendToDM: `It is now ${t}. Describe the scene.` },
      )
    }
    return result('Usage: /time +8  or  /time set dawn')
  },

  // ──────────────────────────────────────────────────────────
  // /help [command]
  // ──────────────────────────────────────────────────────────
  help: async (argsStr, ctx) => {
    const filter = argsStr.trim().replace(/^\//, '')
    return result(getHelpText(filter || null), {}, { skipDM: true })
  },

  // ──────────────────────────────────────────────────────────
  // /debug
  // ──────────────────────────────────────────────────────────
  debug: async (argsStr, ctx) => {
    const c     = ctx.character
    if (!c) return result('No character loaded.')
    const slots = Object.entries(c.spell_slots || {})
      .map(([l, s]) => `L${l}:${s.max-(s.used||0)}/${s.max}`)
      .join(' ')
    const text = [
      `**${c.name}** — ${c.race} ${c.class} Lv${c.level}`,
      `HP: ${c.current_hp}/${c.max_hp} | AC: ${c.armor_class} | Prof: +${c.proficiency_bonus||2}`,
      `STR${c.strength} DEX${c.dexterity} CON${c.constitution} INT${c.intelligence} WIS${c.wisdom} CHA${c.charisma}`,
      slots ? `Slots: ${slots}` : '',
      c.conditions?.length ? `Conditions: ${c.conditions.join(', ')}` : 'No conditions',
      `Exhaustion: ${c.exhaustion_level || 0}/6`,
      ctx.inCombat ? '⚔️ IN COMBAT' : '📖 Exploring',
      ctx.hasInspiration ? '✨ Has Inspiration' : '',
    ].filter(Boolean).join('\n')
    return result(text, {}, { skipDM: true })
  },

  // ──────────────────────────────────────────────────────────
  // /roll 2d6+3
  // ──────────────────────────────────────────────────────────
  roll: async (argsStr, ctx) => {
    const expr = argsStr.trim()
    if (!expr) return result('Usage: /roll <dice>  e.g. /roll 2d6+3')
    const rolled = rollDiceExpr(expr)
    const text   = `🎲 ${expr} → ${rolled.breakdown} = **${rolled.total}**`
    return result(
      text,
      {},
      { skipDM: false, sendToDM: text },  // sends result to DM so it can react
    )
  },
}

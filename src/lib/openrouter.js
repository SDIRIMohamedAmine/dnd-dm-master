// src/lib/openrouter.js
import { buildArcPromptBlock } from './storyArcs'

const API_KEY = process.env.REACT_APP_OPENROUTER_API_KEY
const MODEL   = process.env.REACT_APP_MODEL || 'google/gemma-2-9b-it:free'

// ── Retry helper ──────────────────────────────────────────
async function fetchWithRetry(url, options, retries = 2, delayMs = 1200) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options)
      if (res.status === 429) {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, delayMs * (attempt + 1)))
          continue
        }
        throw new Error('Rate limit reached. Please wait a moment before continuing.')
      }
      return res
    } catch (err) {
      if (attempt === retries) throw err
      await new Promise(r => setTimeout(r, delayMs))
    }
  }
}

// ── Base AI call ──────────────────────────────────────────
export async function callAI(messages, maxTokens = 500) {
  if (!API_KEY || API_KEY.includes('YOUR_KEY')) throw new Error('Missing API key')
  const res = await fetchWithRetry('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'http://localhost:3000',
      'X-Title':       'DnD DM',
    },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, temperature: 0.3, messages }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

// ── Helpers ───────────────────────────────────────────────
function mod(score) {
  const m = Math.floor((score - 10) / 2)
  return m >= 0 ? `+${m}` : `${m}`
}

export function playerWantsToFight(text) {
  return /\b(attack|charge|draw\s+(my\s+)?(sword|weapon|blade|bow|staff|wand|axe|dagger)|i\s+fight|engage|strike|stab|shoot|cast\s+\w+\s+(at|on)\s+|lunge|swing\s+at|fire\s+at|throw\s+(at|my)|start\s+combat)\b/i.test(text)
}

export function dmDescribesCombat(text) {
  return /⚔️\s*COMBAT\s*BEGINS|COMBAT\s*BEGINS/i.test(text)
}

export function actionNeedsExtraction(playerAction) {
  if (!playerAction || playerAction === 'BEGIN_ADVENTURE') return false
  return [
    /\b(take|grab|pick up|loot|steal|find|receive|buy|purchase|get)\b/i,
    /\b(give|pay|spend|drop|sell|throw|lose)\b/i,
    /\b(gold|gp|coin|money|sword|axe|armor|potion|item|weapon|shield|ring|staff|dagger)\b/i,
    /\b(attack|fight|hit|strike|stab|shoot|cast|spell|fireball|magic|use)\b/i,
    /\b(talk|speak|say|ask|tell|greet|meet|introduce|threaten)\b/i,
    /\b(quest|mission|task|help|accept)\b/i,
    /\b(damage|hurt|wound|heal|rest|hp)\b/i,
  ].some(r => r.test(playerAction))
}

// ── Prompt building blocks ────────────────────────────────
function charBlock(c) {
  if (!c) return 'No character.'
  const wisMod = Math.floor(((c.wisdom || 10) - 10) / 2)
  const profBonus = c.proficiency_bonus || 2
  const hasPerc = (c.skill_proficiencies || []).some(s => /perception/i.test(s))
  const passivePerc = 10 + wisMod + (hasPerc ? profBonus : 0)
  const skillProfs = (c.skill_proficiencies || []).join(', ') || 'none'
  const saveProfs  = (c.saving_throw_proficiencies || []).map(s => s.slice(0,3).toUpperCase()).join(', ') || 'none'
  const exhaustion = c.exhaustion_level ? `Exhaustion Level ${c.exhaustion_level}` : ''
  const conditions = [...(c.conditions || []), exhaustion].filter(Boolean).join(', ') || 'none'
  return `CHARACTER: ${c.name} | ${c.race} ${c.class}${c.subclass ? ` (${c.subclass})` : ''} Lv${c.level}
HP: ${c.current_hp}/${c.max_hp} | AC: ${c.armor_class} | Gold: ${c.gold ?? 10} gp | Passive Perception: ${passivePerc}
STR${mod(c.strength)} DEX${mod(c.dexterity)} CON${mod(c.constitution)} INT${mod(c.intelligence)} WIS${mod(c.wisdom)} CHA${mod(c.charisma)}
Prof: +${profBonus} | Save proficiencies: ${saveProfs} | Alignment: ${c.alignment}
Skill proficiencies: ${skillProfs}
Equipment: ${(c.equipment || []).join(', ') || 'none'}
Spells: ${(c.spells || []).map(s => s.replace(/ \(cantrip\)/i, '').trim()).join(', ') || 'none'}
Conditions: ${conditions}
Personality: ${c.personality_traits || '—'} | Flaw: ${c.flaws || '—'}
Origin: ${c.origin_story || '—'}`
}

function memBlock(memory) {
  return memory?.summary ? `CAMPAIGN MEMORY:\n${memory.summary}` : 'Campaign just started.'
}

function ragBlock(ragContext) {
  if (!ragContext) return ''
  return `D&D LORE (use exact stats, costs, descriptions — do not invent):\n${ragContext}`
}

function npcBlock(npcs) {
  if (!npcs?.length) return ''
  return `KNOWN NPCs:\n${npcs.map(n => `• ${n.name} [${n.role}]${n.location ? ` @ ${n.location}` : ''}${n.description ? ': ' + n.description : ''}`).join('\n')}`
}

function questBlock(quests) {
  const active = (quests || []).filter(q => q.status === 'active')
  if (!active.length) return ''
  return `ACTIVE QUESTS:\n${active.map(q => `• ${q.title}: ${q.description || ''}`).join('\n')}`
}

function settingsBlock(s) {
  if (!s) return ''
  return `SETTING: ${s.world_name || 'Forgotten Realms'} | Tone: ${s.tone || 'balanced'} | Difficulty: ${s.difficulty || 'normal'}${s.start_location ? ` | Location: ${s.start_location}` : ''}${s.house_rules ? `\nHouse rules: ${s.house_rules}` : ''}`
}

// ══════════════════════════════════════════════════════════
// PROMPT 1 — NARRATIVE DM (exploration / roleplay)
// Short and focused so a small free model can follow it all.
// ══════════════════════════════════════════════════════════
function buildNarrativePrompt({ c, memory, ragContext, npcs, quests, campaignSettings, storyArcs }) {
  const level = c?.level || 1
  const crRange = level <= 2 ? 'CR 1/8–1/4 (wolves, goblins, giant rats, bandits)'
    : level <= 4 ? 'CR 1/4–CR 1 (orcs, gnolls, hobgoblins, zombies)'
    : level <= 6 ? 'CR 1–CR 2 creatures'
    : 'CR 2–CR 4 creatures'

  const toneNote = campaignSettings?.tone === 'dark' ? 'Gritty, morally complex. High stakes. NPCs can die, betray, lie.'
    : campaignSettings?.tone === 'heroic' ? 'Epic and triumphant. Clear good vs evil. Victories feel earned.'
    : campaignSettings?.tone === 'comedic' ? 'Lighthearted with wit. Amusing NPCs. Adventure with levity.'
    : 'Balanced — dramatic but not relentless. Mix tension with wonder.'

  const arcBlock = storyArcs?.length ? buildArcPromptBlock(storyArcs) : ''

  return `You are a Dungeon Master for a solo D&D 5e campaign. Be vivid, specific, immersive.

${charBlock(c)}

${memBlock(memory)}

${arcBlock}

${ragBlock(ragContext)}

${npcBlock(npcs)}

${questBlock(quests)}

${settingsBlock(campaignSettings)}

━━━ RULES ━━━

FORMAT: Start every response with: 📍 [Location] | 🕐 [Time] | 📅 Day [N]

NARRATIVE: 2–4 paragraphs. Use all five senses. Address the player as ${c?.name || 'adventurer'}.

TONE: ${toneNote}

NAMES: Never use [PLACEHOLDER]. Invent specific names (Harven, Serath, Old Bram). Check KNOWN NPCs first.

LORE: Use D&D LORE section for exact item prices and spell descriptions. Never invent stats.

MERCHANTS: When showing wares, list REAL items from D&D LORE with actual gold costs.
Format: "• Item Name — X gp — brief description"

SKILL CHECKS: When outcome is uncertain, call for a roll:
🎲 [Skill] Check — DC [N]
Roll d20 + [STAT modifier]. Success: [what happens]. Failure: [consequence].
Then STOP and wait for the player's number. Do not continue the story yet.

SPELLS: If it's in the character's spell list, allow it. "Fire Bolt (cantrip)" = "Fire Bolt".

WEAPONS: Quarterstaffs are simple weapons — every class is proficient.

ITEMS: If item is not in Equipment, say "You don't have that."

GIVING ITEMS — CRITICAL:
When you give the player any weapon, armor, or magic item, ALWAYS end your message with a structured item tag on its own line so the game registers it:
[ITEM: <name> | <slot> | <mechanical effect>]

Examples:
[ITEM: Amulet of Health | amulet | Sets CON to 19 while worn. Requires attunement.]
[ITEM: Blade of Blood | mainhand | 1d8 slashing. On crit, target bleeds 1d4 necrotic per turn.]
[ITEM: Cloak of Elvenkind | cloak | Advantage on Stealth. +1 AC.]
[ITEM: Healing Potion | consumable | Restores 2d4+2 HP when consumed.]
[ITEM: Ring of Protection | ring1 | +1 AC and +1 to all saving throws. Attunement.]

Slots: mainhand, offhand, chest, head, amulet, ring1, ring2, hands, feet, cloak, ranged, consumable.
Always use exact numbers. Never invent effects that violate D&D 5e rules.

CURRENCY — D&D uses multiple denominations. Always be specific:
10 cp = 1 sp | 10 sp = 1 gp | 10 gp = 1 pp
Low-level purchases use copper/silver (a torch = 1 cp, a meal = 4 sp, a dagger = 2 gp).
After any transaction, state the exact change: "That costs 5 sp" or "You receive 3 gp 2 sp."
The goldChange event value is always in GOLD PIECES (gp). Convert: 5 sp = 0.5 gp, 10 cp = 0.1 gp.

INVENTORY — Items can have quantities. Say "2× Healing Potion" not just "Healing Potion" twice.

COMBAT TRIGGER — CRITICAL — READ THIS CAREFULLY:
If at any point a fight starts (player attacks, enemy attacks, player provokes hostility):
1. Write a brief 1-sentence dramatic hook ("The bandit snarls and draws his blade—")
2. Then write EXACTLY this on its own line with nothing else: ⚔️ COMBAT BEGINS
3. Then immediately write the initiative order:
Initiative Order:
- [Enemy Name] (HP: X/X): [d20 roll]
- ${c?.name || 'Hero'} (HP: ${c?.current_hp || 10}/${c?.max_hp || 10}): [d20+DEX roll]
DO NOT narrate the full fight. DO NOT describe attacks. Just the hook, the trigger, and the initiative.

ENCOUNTERS: Solo player. Use ONLY ${crRange} for random encounters. Max 1–2 enemies.
Boss/story fights may be harder but must have an escape route.

CRITICAL — AI CONTROL RULES:
1. You are a NARRATOR, not a rules engine. Describe outcomes — do not compute them.
2. NEVER invent damage numbers, hit/miss results, or saving throw outcomes. These come from the player's dice or the engine.
3. NEVER invent spells, items, or abilities the character doesn't have. If it's not in their spell list or equipment, it doesn't exist.
4. When [MECHANICAL RESULT] is in the player's message, narrate EXACTLY that outcome — do not modify or recalculate it.
5. CUSTOM CONTENT: If custom items/creatures/spells are listed in [CUSTOM CONTENT], use ONLY those names and descriptions.
6. GIVING ITEMS: ALWAYS end with an [ITEM: name | slot | effect] tag when handing the player any item.`
}

// ══════════════════════════════════════════════════════════
// PROMPT 2 — COMBAT DM
// Loaded only when inCombat is true. Pure mechanics.
// ══════════════════════════════════════════════════════════
function buildCombatPrompt({ c, ragContext, monsterContext }) {
  return `You are running turn-based D&D 5e combat for a solo player. Be mechanical and dramatic.

${charBlock(c)}

${monsterContext ? `ENEMY STAT BLOCKS (use these exactly):\n${monsterContext}` : ''}

${ragContext ? `D&D LORE:\n${ragContext}` : ''}

━━━ COMBAT RULES ━━━

TURN ORDER: Player acts first, then enemies.
- Wait for player to declare action and say "end turn" (or similar)
- Then resolve ALL enemy turns
- End every enemy-turn block with: "--- It is now ${c?.name || 'your'} turn (Round [N]). What do you do?"

PLAYER ATTACK: Ask for the roll, then stop.
"Roll d20 + [attack bonus] to hit [enemy]."
Wait for their number before resolving anything.

ENEMY ATTACK FORMAT — mandatory:
Describe the attack physically first, then the roll:
✓ "The wolf lunges for your throat — Attack: [N] vs AC ${c?.armor_class || 10} → Hit. Its fangs rake your shoulder — [N] piercing. ${c?.name || 'You'} (HP: [new]/${c?.max_hp || 10})"
✗ Never: "Attack roll: 14. Hit. 5 damage."

ENEMY ABILITIES: Use ALL abilities from the stat block. Never just "attacks."
- Wolves: Pack Tactics (advantage if ally adjacent), Bite (DC 11 STR or Prone)
- Goblins: Nimble Escape (Disengage or Hide as bonus action every turn)
- Undead: No morale. Fight to destruction. Describe them emotionlessly.
- Humanoids: DC 10 WIS morale check at 50% HP — fail = flee or surrender

HP TRACKING: Always show HP after any damage: Name (HP: current/max)

REACTIONS (only these interrupt turn order):
- Opportunity attack: "Do you use your Reaction?"
- Shield / Counterspell: only if character has it prepared

COMBAT ENDS when last enemy is downed or flees:
⚔️ COMBAT ENDS
[Award XP. Narrate the aftermath in 1–2 sentences.]`
}

// ══════════════════════════════════════════════════════════
// PROMPT 3 — NPC DIALOGUE
// Focused on voicing one specific NPC convincingly.
// ══════════════════════════════════════════════════════════
function buildNPCDialoguePrompt({ c, npc, ragContext, memory, campaignSettings }) {
  return `You are a Dungeon Master voicing a single NPC in conversation with the player.

${charBlock(c)}

${memBlock(memory)}

NPC: ${npc.name} | Role: ${npc.role} | Location: ${npc.location || 'unknown'}
${npc.description ? `Description: ${npc.description}` : ''}

${ragContext ? `Relevant lore:\n${ragContext}` : ''}

SETTING: ${campaignSettings?.world_name || 'Forgotten Realms'} | Tone: ${campaignSettings?.tone || 'balanced'}

━━━ RULES ━━━
- Stay in character as ${npc.name}. Speak in first person with a distinct voice.
- ${npc.role === 'foe' ? 'This NPC is hostile. They threaten, deceive, or intimidate.' : npc.role === 'ally' ? 'This NPC is friendly. They hint, help, or share lore.' : 'This NPC is neutral. They want something or are guarded.'}
- Use real D&D item costs from the lore above if prices come up.
- After dialogue, briefly describe body language or expression (1 sentence).
- If conversation turns violent: write ⚔️ COMBAT BEGINS then initiative order.
- End with what ${npc.name} does or waits for next.`
}

// ══════════════════════════════════════════════════════════
// PROMPT 4 — SKILL CHECK RESOLVER
// Tiny prompt just for resolving a reported roll result.
// ══════════════════════════════════════════════════════════
function buildSkillCheckPrompt({ c, checkContext, rollResult }) {
  return `You are a D&D 5e Dungeon Master resolving a skill check.

${charBlock(c)}

Context: ${checkContext || 'a skill check was just attempted'}
Player rolled: ${rollResult}

Narrate the outcome in 1–2 vivid paragraphs.
- Natural 20: exceptional success — add a bonus detail
- Natural 1: critical failure — something extra goes wrong
- Beat DC: success, describe it specifically
- Fail DC: real consequences, do not soften

Then continue the scene naturally. Only ask for another roll if a new uncertain action follows.`
}

// ══════════════════════════════════════════════════════════
// AMBIENT DETAIL — short atmospheric injection
// ══════════════════════════════════════════════════════════
function buildAmbientPrompt({ c, memory, storyArcs, campaignSettings }) {
  const dominantArc = storyArcs?.sort((a, b) => b.power - a.power)[0]
  return `You are a Dungeon Master adding a single ambient world detail.

${charBlock(c)}

${memBlock(memory)}

${dominantArc ? `Dominant story arc: ${dominantArc.title} — ${dominantArc.description}` : ''}

SETTING: ${campaignSettings?.world_name || 'Forgotten Realms'} | Tone: ${campaignSettings?.tone || 'balanced'}

Write exactly 1–2 sentences of sensory atmosphere. Use sound, smell, or touch — not vision.
Subtly hint at the dominant arc if one exists. No dialogue. No plot advancement. No questions.
Example: "A cold wind rolls down from the mountains, carrying the faint smell of ash — not woodsmoke, something older."`
}

// ══════════════════════════════════════════════════════════
// MODE DETECTOR
// ══════════════════════════════════════════════════════════
export function detectPromptMode({ playerAction, inCombat, lastDMMessage, npcs }) {
  if (inCombat) return { mode: 'combat' }

  // Player is reporting a roll number
  const isRollReport = /^(i\s+)?(rolled?|got)\s+\d+|^\d+(\s+on\s+\w+)?$|^my\s+(roll|result)\s+(is|was)\s+\d+/i.test((playerAction || '').trim())
  if (isRollReport) return { mode: 'skill_check' }

  // Player is speaking directly to a known NPC
  if (npcs?.length && lastDMMessage) {
    const isDialogue = /["']|says|tells you|asks|replies|speaks|greets/i.test(lastDMMessage)
      && /^["']|^i say|^i tell|^i ask|^i reply|^hello|^greet|speak to|talk to/i.test(playerAction || '')
    if (isDialogue) {
      const npc = npcs.find(n => lastDMMessage.toLowerCase().includes(n.name.toLowerCase()))
      if (npc) return { mode: 'npc_dialogue', npc }
    }
  }

  return { mode: 'narrative' }
}

// ══════════════════════════════════════════════════════════
// COMBAT SHOULD TRIGGER — client-side detection
// Solves the "DM narrates combat instead of triggering it" bug.
// ══════════════════════════════════════════════════════════
export function shouldTriggerCombat(playerAction, dmReply) {
  if (dmDescribesCombat(dmReply)) return true
  const playerAttacked = playerWantsToFight(playerAction || '')
  const dmShowedHostility = /lunges|charges|draws\s+(its|their|a)\s+\w+|raises\s+(its|a)\s+\w+|readies|snarls and leaps|rushes\s+(at|toward)\s+you|positions\s+(itself|themselves)\s+to\s+(fight|attack)/i.test(dmReply)
  return playerAttacked && dmShowedHostility
}

// ══════════════════════════════════════════════════════════
// MAIN DM CALL
// ══════════════════════════════════════════════════════════
export async function callDM({
  messages, character, memory, ragContext, npcs, quests,
  campaignSettings, monsterContext, suggestedMonsters, storyArcs,
  inCombat = false, promptMode = null, npcTarget = null,
  checkContext = null, rollResult = null,
}) {
  const c    = character
  const mode = promptMode || (inCombat ? 'combat' : 'narrative')

  let systemPrompt
  if (mode === 'combat') {
    systemPrompt = buildCombatPrompt({ c, ragContext, monsterContext })
  } else if (mode === 'npc_dialogue' && npcTarget) {
    systemPrompt = buildNPCDialoguePrompt({ c, npc: npcTarget, ragContext, memory, campaignSettings })
  } else if (mode === 'skill_check') {
    systemPrompt = buildSkillCheckPrompt({ c, checkContext, rollResult })
  } else {
    systemPrompt = buildNarrativePrompt({ c, memory, ragContext, npcs, quests, campaignSettings, storyArcs })
  }

  // Inject verified monster list into last user message for narrative mode
  let messageHistory = messages.slice(-14).map(m => ({ role: m.role, content: m.content }))
  if (mode === 'narrative' && suggestedMonsters?.length) {
    const hint = `[DM note: verified creatures for this level: ${suggestedMonsters.join(', ')}]`
    messageHistory = messageHistory.map((m, i) =>
      (i === messageHistory.length - 1 && m.role === 'user')
        ? { ...m, content: m.content + '\n\n' + hint }
        : m
    )
  }

  const res = await fetchWithRetry('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'http://localhost:3000',
      'X-Title':       'DnD Dungeon Master',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: mode === 'combat' ? 600 : mode === 'skill_check' ? 350 : 900,
      temperature: mode === 'combat' ? 0.72 : mode === 'skill_check' ? 0.6 : 0.88,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messageHistory,
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || '(no response)'
}

// ── Opening scene ─────────────────────────────────────────
export async function callOpeningScene({ character: c, campaignSettings }) {
  const loc     = campaignSettings?.start_location || 'a crossroads on the edge of a great city'
  const world   = campaignSettings?.world_name     || 'the Forgotten Realms'
  const tone    = campaignSettings?.tone           || 'balanced'
  const pronoun = c?.gender === 'Male' ? 'he' : c?.gender === 'Female' ? 'she' : 'they'

  const system = `You are a Dungeon Master starting a new D&D 5e campaign.
Character: ${c?.name}, a Level ${c?.level || 1} ${c?.race} ${c?.class}.
World: ${world}. Location: ${loc}. Tone: ${tone}.

Write the opening scene in EXACTLY this format:

📍 [Specific location name] | 🕐 [Time of day] | 📅 Day 1

[2–3 vivid sentences. Sights, sounds, smells. Ground the player here.]

[1 sentence placing ${c?.name || 'the character'} in the scene.]

═══ THREE PATHS BEFORE YOU ═══

🔴 [Place name]: [One sentence — what draws ${pronoun} here.]

🔵 [Place name]: [One sentence — what opportunity it presents.]

🟢 [Place name]: [One sentence — the mystery or danger hinted at.]

Where does ${c?.name || 'your character'} go first?

RULES: Use specific invented names everywhere. Never write [PLACEHOLDER]. Three paths must be different types. Stop after the question.

PASSIVE PERCEPTION: The character's Passive Perception is listed above. When they enter a room or area, check if hidden threats/traps/secrets fall below this threshold — if so, describe what they notice without requiring a roll. Only call for active Perception checks when the DC exceeds their passive score.

SKILLS IN ROLEPLAY: Use the character's skill proficiencies to flavor descriptions. A character proficient in Stealth naturally knows how to move quietly. A character with Arcana recognizes magical phenomena. A character with Insight picks up on NPC emotions without needing a roll for obvious things.

FEATS IN NARRATIVE: If the character has feats like Sentinel, Alert, or War Caster, these shape how they engage. Sentinel characters notice when enemies try to flee. Alert characters are never surprised. Reference these abilities when dramatically appropriate.

INSPIRATION: Award inspiration (say "You gain Inspiration" clearly) when the player does something exceptionally brave, clever, or true to their character's personality and flaws.`

  const res = await fetchWithRetry('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'http://localhost:3000',
      'X-Title':       'DnD Opening',
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 600, temperature: 0.9,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: 'Begin.' },
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `HTTP ${res.status}`)
  }
  const data = await res.json()
  return data.choices?.[0]?.message?.content || '(no response)'
}

// ── Summarizer ────────────────────────────────────────────
export async function callSummarizer(existingSummary, recentMessages) {
  const transcript = recentMessages
    .map(m => `${m.role === 'user' ? 'Player' : 'DM'}: ${m.content}`)
    .join('\n\n')

  const prompt = `Update this D&D campaign summary.

EXISTING:
${existingSummary || '(none)'}

RECENT:
${transcript}

Write updated summary (150–250 words): current location, active quests, key NPCs met and their attitude, major decisions, items found/lost, combat outcomes. Past tense. No preamble.`

  try { return await callAI([{ role: 'user', content: prompt }], 400) }
  catch { return existingSummary }
}

// ── Ambient detail ────────────────────────────────────────
export async function callAmbientDetail({ character, memory, storyArcs, campaignSettings }) {
  const system = buildAmbientPrompt({ c: character, memory, storyArcs, campaignSettings })
  try {
    return await callAI([
      { role: 'system', content: system },
      { role: 'user', content: 'Add an ambient detail.' },
    ], 120)
  } catch { return null }
}

// ── Event extractor ───────────────────────────────────────
export async function extractGameEvents(playerAction, dmResponse, character) {
  // ── ARCHITECTURE: HP is ENGINE-ONLY ──────────────────────────────────────
  // This function previously sent a second AI call to extract HP changes from
  // DM narrative text. That is WRONG: "you take 8 damage" was parsed by AI,
  // which made up numbers. HP changes now ONLY come from:
  //   • CombatScreen (engine rolls dice, applies damage)
  //   • slash commands (/hp set N, /hp +N)
  //   • [HP_CHANGE:N] explicit tags in DM text
  //
  // This function now uses only tag-based parsing (parseGameEvents).
  // The second AI call is removed. No network call here.
  // ─────────────────────────────────────────────────────────────────────────
  const tagEvents = parseGameEvents(dmResponse)

  // hpChange from tags is still allowed (explicit DM-authored tag),
  // but we drop it from the return so nothing accidentally uses AI-guessed HP.
  // Only [HP_CHANGE:N] tags written deliberately by the DM prompt system are
  // forwarded — and those only fire for out-of-combat healing (rest, potions).
  return {
    ...tagEvents,
    hpChange: null,  // HP is engine-only. Use [HP_CHANGE:N] for explicit OOC heals.
  }
}

export function parseGameEvents(text) {
  const events = {
    newItems: [], removeItems: [], goldChange: null, newSpells: [],
    xpGain: null, levelUp: null, hpChange: null,
    newConditions: [], removedConditions: [],
    newNPCs: [], newQuests: [], questComplete: [],
    combatStarted: /⚔️\s*COMBAT\s*BEGINS|COMBAT\s*BEGINS/i.test(text),
    combatEnded:   /⚔️\s*COMBAT\s*ENDS|COMBAT\s*ENDS/i.test(text),
  }
  events.newItems      = [...text.matchAll(/\[NEW_ITEM:\s*([^\]]+)\]/gi)].map(m => m[1].trim())
  events.removeItems   = [...text.matchAll(/\[REMOVE_ITEM:\s*([^\]]+)\]/gi)].map(m => m[1].trim())
  const goldM = text.match(/\[GOLD_CHANGE:\s*([+-]?\d+)\]/i); if (goldM) events.goldChange = parseInt(goldM[1])
  events.newSpells     = [...text.matchAll(/\[NEW_SPELL:\s*([^\]]+)\]/gi)].map(m => m[1].trim())
  const xpM   = text.match(/\[XP_GAIN:\s*(\d+)\]/i);          if (xpM)  events.xpGain    = parseInt(xpM[1])
  const lvlM  = text.match(/\[LEVEL_UP:\s*(\d+)\]/i);         if (lvlM) events.levelUp   = parseInt(lvlM[1])
  const hpM   = text.match(/\[HP_CHANGE:\s*([+-]?\d+)\]/i);   if (hpM)  events.hpChange  = parseInt(hpM[1])
  events.newNPCs = [...text.matchAll(/\[NPC:\s*([^|]+)\|([^|]+)\|([^|]+)\|([^\]]+)\]/gi)]
    .map(m => ({ name: m[1].trim(), role: m[2].trim().toLowerCase(), location: m[3].trim(), description: m[4].trim() }))
  events.newQuests = [...text.matchAll(/\[QUEST:\s*([^|]+)\|([^|]+)\|([^|]+)\|([^\]]+)\]/gi)]
    .map(m => ({ title: m[1].trim(), giver: m[2].trim(), description: m[3].trim(), reward: m[4].trim() }))
  events.questComplete = [...text.matchAll(/\[QUEST_COMPLETE:\s*([^\]]+)\]/gi)].map(m => m[1].trim())

  // Parse structured item tags — [ITEM: name | slot | effect]
  const itemTagMatches = [...text.matchAll(/\[ITEM:\s*([^|\]]+)\|([^|\]]+)\|([^\]]+)\]/gi)]
  for (const m of itemTagMatches) {
    const itemName = m[1].trim()
    const slot     = m[2].trim().toLowerCase()
    const effect   = m[3].trim()
    // Register as a new item if not already in the list
    if (!events.newItems.includes(itemName)) events.newItems.push(itemName)
    // Store rich item data for auto-equipping
    if (!events.itemData) events.itemData = {}
    events.itemData[itemName] = { slot, effect, fromTag: true }
  }

  return events
}

export function cleanDMText(text) {
  return text
    .replace(/\[NEW_ITEM:[^\]]+\]/gi, '')  .replace(/\[REMOVE_ITEM:[^\]]+\]/gi, '')
    .replace(/\[GOLD_CHANGE:[^\]]+\]/gi, '').replace(/\[NEW_SPELL:[^\]]+\]/gi, '')
    .replace(/\[XP_GAIN:[^\]]+\]/gi, '')   .replace(/\[LEVEL_UP:[^\]]+\]/gi, '')
    .replace(/\[HP_CHANGE:[^\]]+\]/gi, '') .replace(/\[NPC:[^\]]+\]/gi, '')
    .replace(/\[QUEST:[^\]]+\]/gi, '')     .replace(/\[QUEST_COMPLETE:[^\]]+\]/gi, '')
    .replace(/\[ITEM:[^\]]+\]/gi, '')
    .replace(/\n{3,}/g, '\n\n').trim()
}

export { MODEL }

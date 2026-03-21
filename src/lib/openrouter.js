// src/lib/openrouter.js
const API_KEY = process.env.REACT_APP_OPENROUTER_API_KEY
const MODEL   = process.env.REACT_APP_MODEL || 'google/gemma-2-9b-it:free'

export async function callAI(messages, maxTokens = 500) {
  if (!API_KEY || API_KEY.includes('YOUR_KEY')) throw new Error('Missing API key')
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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

function mod(score) {
  const m = Math.floor((score - 10) / 2)
  return m >= 0 ? `+${m}` : `${m}`
}

// FIX 1: Only run extractor when action is meaningful
export function actionNeedsExtraction(playerAction) {
  if (!playerAction || playerAction === 'BEGIN_ADVENTURE') return false
  const triggers = [
    /\b(take|grab|pick up|loot|steal|find|receive|buy|purchase|get)\b/i,
    /\b(give|pay|spend|drop|sell|throw|lose)\b/i,
    /\b(gold|gp|coin|money|sword|axe|armor|potion|item|weapon|shield|ring|staff|dagger)\b/i,
    /\b(attack|fight|hit|strike|stab|shoot|cast|spell|fireball|magic|use)\b/i,
    /\b(talk|speak|say|ask|tell|greet|meet|introduce|threaten)\b/i,
    /\b(quest|mission|task|help|accept)\b/i,
    /\b(damage|hurt|wound|heal|rest|hp)\b/i,
  ]
  return triggers.some(r => r.test(playerAction))
}

function buildSystemPrompt({ character: c, memory, ragContext, npcs, quests, campaignSettings, monsterContext, suggestedMonsters }) {
  const charBlock = c ? `
═══ CHARACTER SHEET ═══
Name: ${c.name} | Race: ${c.race} | Class: ${c.class}${c.subclass ? ` (${c.subclass})` : ''} | Background: ${c.background || '—'}
Gender: ${c.gender || 'unspecified'} | Pronouns: ${c.gender === 'Male' ? 'he/him' : c.gender === 'Female' ? 'she/her' : c.gender === 'Non-binary' ? 'they/them' : 'they/them'}
Alignment: ${c.alignment} | Level: ${c.level} | XP: ${c.experience} / ${c.xp_to_next_level || 300}
HP: ${c.current_hp}/${c.max_hp} | AC: ${c.armor_class} | Speed: ${c.speed}ft | Gold: ${c.gold ?? 10} gp
Proficiency Bonus: +${c.proficiency_bonus || 2}
STR ${c.strength}(${mod(c.strength)}) | DEX ${c.dexterity}(${mod(c.dexterity)}) | CON ${c.constitution}(${mod(c.constitution)}) | INT ${c.intelligence}(${mod(c.intelligence)}) | WIS ${c.wisdom}(${mod(c.wisdom)}) | CHA ${c.charisma}(${mod(c.charisma)})
Equipment: ${(c.equipment || []).join(', ') || 'None'}
Spells Known: ${(c.spells || []).map(s => s.replace(/ \(cantrip\)/i, '').trim()).join(', ') || 'None'}
Active Conditions: ${(c.conditions || []).join(', ') || 'None'}
Personality: ${c.personality_traits || '—'} | Flaw: ${c.flaws || '—'}
Origin: ${c.origin_story || '—'}`.trim() : 'No character sheet.'

  const memBlock    = memory?.summary ? `═══ CAMPAIGN MEMORY ═══\n${memory.summary}` : 'Campaign just started.'
  const ragBlock    = ragContext ? `═══ RETRIEVED D&D LORE (use this data for accuracy) ═══
The following entries were retrieved from the SRD database based on the player's action.
Use the EXACT stats, costs, descriptions, and rules shown here. Do NOT invent values if they are listed below.
If a monster stat block is shown, use those exact HP/AC/CR values. If a spell is shown, use that exact description.

${ragContext}
═══ END LORE ═══` : ''
  const suggestedBlock = suggestedMonsters?.length
    ? `═══ ENCOUNTER SUGGESTIONS (choose from these database-verified creatures) ═══
These monsters were selected from your database based on ${c?.name || 'the character'}'s level (${c?.level || 1}) and current HP (${c?.current_hp || '?'}/${c?.max_hp || '?'}):
${suggestedMonsters.join(', ')}
IMPORTANT: When designing any encounter, prefer these creatures. Their stats are verified in the database. You may use variations (e.g. "Undead Wolf" based on Wolf stats).`
    : ''

  const monsterBlock = monsterContext ? `═══ MONSTER STAT BLOCKS (USE EXACTLY AS WRITTEN) ═══
${monsterContext}
DO NOT invent or modify these stats. Use them exactly.` : ''
  const npcBlock    = npcs?.length ? `═══ KNOWN NPCs ═══\n${npcs.map(n => `• ${n.name} [${n.role}]${n.location ? ` @ ${n.location}` : ''}: ${n.description || ''}`).join('\n')}` : ''
  const questBlock  = quests?.filter(q => q.status === 'active').length
    ? `═══ ACTIVE QUESTS ═══\n${quests.filter(q => q.status === 'active').map(q => `• ${q.title}: ${q.description || ''}`).join('\n')}` : ''
  const settingsBlock = campaignSettings ? `
═══ CAMPAIGN SETTINGS ═══
World: ${campaignSettings.world_name || 'Forgotten Realms'}
Tone: ${campaignSettings.tone || 'balanced'}
Difficulty: ${campaignSettings.difficulty || 'normal'}
Starting Location: ${campaignSettings.start_location || 'unknown'}
${campaignSettings.house_rules ? `House Rules: ${campaignSettings.house_rules}` : ''}`.trim() : ''

  return `You are an expert Dungeon Master running a D&D 5e campaign.

${charBlock}
${memBlock}
${ragBlock}
${npcBlock}
${questBlock}
${settingsBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STORY RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Address player as ${c?.name || 'adventurer'}.

2. TIME HEADER — Every message starts with:
   📍 [Location] | 🕐 [Time] | 📅 Day [N]

3. NAMES — NEVER use placeholders like [PERSON_NAME], [NPC_NAME], [GUARD_NAME].
   Always invent specific names immediately: "Harven", "Captain Serath", "Old Bram".
   Once named, always use that exact name. Check the KNOWN NPCs list above first.

3b. MERCHANTS & ITEM EFFECTS — CRITICAL:
   When a merchant NPC shows their wares:
   - Check the D&D LORE section above for magic items — use REAL items from the database
   - A mage's shop should have scrolls, wands, potions, rings, and wondrous items from the SRD
   - NEVER invent fake items. Use items that actually exist in D&D (check the lore section)
   - State the real gold cost from the SRD for each item
   - Format: "• Ring of Protection (requires attunement) — 3,500 gp — +1 bonus to AC and saving throws"

   When the player USES a magic item:
   - READ the item's description from the lore section carefully
   - Apply its EXACT effect — a Rope of Climbing animates and can anchor itself
   - A Bag of Holding stores 500 lbs in extradimensional space — items placed inside are inaccessible until retrieved
   - A Potion of Speed grants the Haste effect for 1 minute
   - A Ring of Djinni Summoning summons a djinni who serves for 1 hour
   - Do NOT make up different effects. The item does EXACTLY what its description says.

4. INVENTORY & PROFICIENCY:

   SPELLS — CRITICAL:
   - NEVER refuse a spell in Spells Known, even with "(cantrip)" suffix in the name
   - "Fire Bolt (cantrip)" and "Fire Bolt" = SAME SPELL. Always allow it.
   - If it appears in Spells Known in any form → they can cast it

   WEAPON PROFICIENCY — D&D 5e (follow exactly):
   Simple weapons (ALL classes can use): club, dagger, handaxe, javelin, light hammer,
   mace, QUARTERSTAFF, sickle, spear, shortbow, light crossbow, dart, sling
   - Sorcerers/Wizards/Warlocks: proficient with daggers, quarterstaffs, light crossbows, darts, slings
   - Clerics/Druids: simple weapons + specific martial
   - Fighters/Barbarians/Paladins/Rangers: all simple + all martial
   - Rogues: simple weapons + hand crossbows, longswords, rapiers, shortswords
   QUARTERSTAFF = simple weapon → EVERY class is proficient. Never say otherwise.
   Only refuse MARTIAL weapons (longsword, rapier, battleaxe, greatsword, etc.) for arcane casters.

   ITEMS:
   - Item not in Equipment → "You don't have that"
   - After gold changes → state new total: "You now have X gp"

5. CONDITIONS — When a condition is applied or removed, say so clearly:
   "You are now Poisoned." / "The Frightened condition ends."
   Enforce condition effects: Blinded = disadvantage on attacks, Poisoned = disadvantage on ability checks, etc.

6. ENCOUNTER SCALING — USE THE RETRIEVED LORE ABOVE:
   The D&D LORE section above contains real monster stat blocks from the SRD database.
   When designing an encounter READ those stat blocks carefully — use their exact HP, AC, attacks,
   special abilities, and actions. Do NOT invent stats for monsters that appear in the lore section.

   ENCOUNTER DESIGN PROCESS (follow this every time):
   a) Decide the appropriate CR range for this level (see budget below)
   b) CHECK the Retrieved D&D Lore section for monsters in that CR range
   c) Use those exact stat blocks — their HP, AC, attacks, special abilities are all there
   d) If the lore shows a Quasit (CR 1, HP 7, AC 13) with Claw, Scare, and Invisibility actions — use ALL of those
   e) If the lore shows a Troll (CR 5) with Regeneration — trigger that ability in combat

   MONSTER ACTIONS MUST BE USED:
   - Every enemy has actions listed in their stat block. USE THEM ALL.
   - Quasit has Claw, Scare (DC 10 WIS save or frightened), and Invisibility — rotate through them
   - Gelatinous Cube has Engulf — it should try to engulf the player
   - Vampire has Charm — it should charm before combat if possible
   - Beholder has Eye Rays — roll which one it uses each turn
   - NEVER have a monster just "attack" if their stat block shows special abilities
   - Special abilities with recharge (5-6 on d6) — roll for them every round

   FALLBACK STATS (only if monster not in lore section):
   Wolf: CR 1/4 | HP 11 | AC 13 | Bite +4, 2d4+2 piercing, DC11 STR or prone
   Goblin: CR 1/4 | HP 7 | AC 15 | Scimitar +4, 1d6+2 slashing | Nimble Escape bonus
   Orc: CR 1/2 | HP 15 | AC 13 | Greataxe +5, 1d12+3 | Aggressive bonus move
   Skeleton: CR 1/4 | HP 13 | AC 13 | Shortsword +4, 1d6+2 | Immune to poison/exhaustion

   ENCOUNTER BUDGET BY CHARACTER LEVEL (party of 1):
   Level 1: Easy=25 XP, Medium=50 XP, Hard=75 XP, Deadly=100 XP
   Level 2: Easy=50 XP, Medium=100 XP, Hard=150 XP, Deadly=200 XP
   Level 3: Easy=75 XP, Medium=150 XP, Hard=225 XP, Deadly=400 XP
   Level 4: Easy=125 XP, Medium=250 XP, Hard=375 XP, Deadly=500 XP
   Level 5: Easy=250 XP, Medium=500 XP, Hard=750 XP, Deadly=1100 XP
   Monster XP: CR 0=10, CR 1/8=25, CR 1/4=50, CR 1/2=100, CR 1=200, CR 2=450, CR 3=700

   MULTIPLE MONSTER MULTIPLIER: 2 monsters ×1.5, 3-6 monsters ×2, 7-10 ×2.5
   3 wolves (3×50=150 XP × 2 multiplier = 300 XP) = DEADLY for level 1 — TOO HARD
   CORRECT level 1 encounter: 1-2 wolves, or 2-3 goblins, or 3-4 giant rats

   Current character: Level ${c?.level || 1}
   For this level, a normal encounter should use: ${
     (c?.level || 1) <= 2 ? 'CR 1/8 to CR 1/4 monsters (wolves, goblins, skeletons, bandits)' :
     (c?.level || 1) <= 4 ? 'CR 1/4 to CR 1 monsters (orcs, gnolls, small groups)' :
     (c?.level || 1) <= 6 ? 'CR 1 to CR 2 monsters' :
     'CR 2 to CR 4 monsters'
   }
   NEVER send a level 1 character against monsters totaling over 100 XP unless it is a story-critical deadly encounter with an escape route.

   CUSTOM/VARIANT MONSTERS — IMPORTANT:
   If you invent a custom monster (e.g. "Rotted Dire Wolf", "Corrupted Spider"), its stats MUST match
   the base CR you assign it. A "Rotted Dire Wolf" should be CR 1/4 with ~11-15 HP, not a reskinned
   Dire Wolf with 37 HP. The fictional name doesn't change what CR is appropriate for the encounter.
   Scale custom monsters DOWN to fit the encounter budget, not up to sound impressive.

   ⚠️ SOLO PLAYER BALANCE — THIS IS CRITICAL:
   This player is SOLO — no party. Standard D&D encounter math assumes 4 players.
   For a solo player, ALL encounter budgets must be divided by 4.
   
   SOLO ENCOUNTER BUDGET (XP limits for one player):
   Level 1: Easy=6 XP,  Medium=12 XP, Hard=18 XP, Deadly=25 XP
   Level 2: Easy=12 XP, Medium=25 XP, Hard=37 XP, Deadly=50 XP
   Level 3: Easy=18 XP, Medium=37 XP, Hard=56 XP, Deadly=100 XP
   Level 4: Easy=31 XP, Medium=62 XP, Hard=93 XP, Deadly=125 XP
   Level 5: Easy=62 XP, Medium=125 XP, Hard=187 XP, Deadly=275 XP

   SOLO ENCOUNTER EXAMPLES (what is actually balanced):
   Level 1 Medium: 1 wolf (50 XP × 1.0 = 50... too high! Use 1 giant rat 25 XP, or 1 goblin 50 XP)
   Level 1 Hard:   1 goblin OR 1 wolf — MAXIMUM. Never 3 wolves.
   Level 2 Medium: 1-2 goblins, OR 1 wolf — comfortable challenge
   Level 2 Hard:   2-3 goblins, OR 1-2 wolves — tough but winnable
   Level 3 Medium: 1-2 orcs, OR 3 goblins, OR 1 dire wolf
   Level 3 Hard:   2 orcs, OR 1 dire wolf + 1 goblin
   Level 5 Medium: 1-2 CR 1-2 monsters

   RANDOMENCOUNTERS (outside story moments): Always Easy or Medium for a solo player.
   STORY ENCOUNTERS (boss, climax): Can be Hard or Deadly, but MUST include an escape route.
   NEVER: 3+ medium enemies against a level 1 solo player — that is an instant death scenario.

7. SKILL CHECKS — When the player attempts anything with uncertain outcome:
   ALWAYS ask for a dice roll. NEVER auto-resolve social or physical actions.

   FORMAT FOR REQUESTING A ROLL:
   🎲 [Skill Name] Check — DC [number]
   Roll a d20 and add your [STAT] modifier ([value]).
   [Brief description of what success and failure mean]

   WHEN TO ASK FOR ROLLS (these situations REQUIRE a check):
   - Persuasion/Deception/Intimidation to influence NPCs
   - Stealth to sneak past guards or creatures
   - Perception to notice hidden things, traps, ambushes
   - Investigation to search for clues, hidden doors, items
   - Athletics to climb, swim, jump, break things
   - Acrobatics to balance, tumble, escape grapples
   - Arcana/History/Nature/Religion to recall knowledge
   - Sleight of Hand to pickpocket or palm items
   - Medicine to stabilise a dying creature
   - Animal Handling to calm or control beasts
   - Performance, Survival, any other skill

   DC GUIDELINES (pick appropriate difficulty):
   DC 5  = Very Easy (a child could do it)
   DC 10 = Easy (routine for an adventurer)
   DC 12 = Moderate (requires focus)
   DC 15 = Hard (trained adventurer may fail)
   DC 18 = Very Hard (even experts sometimes fail)
   DC 20 = Near Impossible (exceptional feat)
   DC 25 = Legendary (almost no one can do this)

   MODIFIERS: Use the character's relevant ability score modifier.
   CHA modifier for Persuasion/Deception/Intimidation/Performance
   DEX modifier for Stealth/Sleight of Hand/Acrobatics
   STR modifier for Athletics
   WIS modifier for Perception/Insight/Animal Handling/Medicine/Survival
   INT modifier for Arcana/History/Investigation/Nature/Religion
   Add Proficiency Bonus (+${c?.proficiency_bonus || 2}) if the background/class gives proficiency in that skill.

   EXAMPLE — Player: "I try to convince the guard to let me pass"
   DM: "🎲 Persuasion Check — DC 14
   The guard eyes you with suspicion.
   Roll a d20 and add your CHA modifier (${c ? mod(c.charisma) : '+0'}).
   Success: He nods and steps aside, grumbling.
   Failure: He stiffens and reaches for his weapon."

   After the player reports their roll:
   - Above DC: Narrate success
   - Below DC: Narrate failure with consequences (NPC refuses, becomes hostile, alarm raised)
   - Natural 20: Exceptional success — add a bonus (guard becomes friendly, gives info)
   - Natural 1: Critical failure — worse than normal failure (guard calls reinforcements)

   CRITICAL: Do NOT move the story forward until the player reports their roll result.
   After asking for a roll, STOP and wait. Do not say "If you succeed..." — wait for the actual number.

8. COMBAT — ANY of these starts a fight with ⚔️ COMBAT BEGINS:
   - Player attacks, casts harmful spell, draws weapon aggressively
   - NPC attacks the player
   - Player enters hostile territory
   Enemies FIGHT BACK. They do not flee unless they have taken damage and failed a morale check.
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TURN STRUCTURE — THE MOST IMPORTANT COMBAT RULE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Combat is TURN-BASED. One creature acts at a time. Follow initiative order strictly.

   PLAYER'S TURN:
   - Describe the situation and wait for the player to act
   - The player may use: 1 Action + 1 Bonus Action + Movement
   - After the player acts, WAIT for them to say "I end my turn" or "end turn"
   - DO NOT have enemies act until the player explicitly ends their turn
   - If the player only used their Action, remind them: "You still have a Bonus Action available."
   - Only exception: Reactions (opportunity attacks, Shield spell) can interrupt outside a turn

   ENEMY'S TURN (only after player ends turn):
   - Narrate ALL enemies in initiative order before the player — fully resolve each enemy turn
   - Then end with: "--- It is now ${c?.name || 'your'} turn. What do you do?"
   - Never ask the player to roll in the middle of an enemy turn — resolve enemy actions narratively
   - After ALL enemies have acted, STOP and wait for the player's next action

   REACTIONS (only these interrupt turn order):
   - Opportunity Attack: enemy leaves melee range → ask: "Do you want to use your Reaction for an opportunity attack?"
   - Shield spell: enemy hits you → ask: "Do you want to cast Shield as a Reaction? (uses your Reaction)"
   - Counterspell, Hellish Rebuke, etc.: only if player has them prepared

   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ENEMY BEHAVIOR — MAKE THEM FEEL ALIVE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Enemies are NOT just "roll attack → hit/miss" machines. Give each one personality and tactics:

   WOLVES / WOLF-TYPE:
   - Use Pack Tactics: if ally adjacent to target, roll attack twice take higher (advantage)
   - Bite: on hit, target must make DC 11 STR save or be knocked Prone
   - Tactics: circle their prey, one lunges while others flank, growl and snap to intimidate
   - Describe: "The wolf darts low, aiming for your ankle tendons" not just "The wolf attacks"
   - Injured wolves may whimper or retreat; alpha wolf fights to the death

   GOBLINS:
   - Nimble Escape: Disengage or Hide as bonus action every turn
   - Tactics: try to flank, throw objects, cackle insults, scatter if leader dies
   - Describe: throwing bottles, darting behind barrels, calling to unseen allies

   SKELETONS / UNDEAD:
   - No fear, no morale — fight mechanically until destroyed
   - Describe: "The skeleton's jaw clatters open in a soundless scream as it advances"

   HUMANOIDS (bandits, cultists, guards):
   - Morale: make a DC 10 WIS save when below 50% HP — on fail they flee or surrender
   - Tactics: try to surround, call for help, grab valuables if losing

   CUSTOM/VARIANT MONSTERS (e.g. "Rotted Dire Wolf"):
   - Use the SAME tactics as their base type but with flavor
   - "The rotted wolf's flesh tears as it lunges, black ichor dripping from its wounds"
   - May have a special ability once per combat (e.g. necrotic bite that reduces max HP by 1)

   GENERAL ENEMY COMBAT DESCRIPTION RULES:
   - NEVER just write "Attack roll: 17 → Hit." That is boring and lazy.
   - Always describe the ATTACK physically before showing the roll:
     WRONG: "Wolf attacks. Attack roll: 14 vs AC 15 → Miss."
     RIGHT: "The wolf lunges for your throat, jaws snapping — Attack roll: 14 vs AC 15 → Miss. Its teeth close on empty air as you twist aside."
   - For hits, describe WHERE and HOW: "The wolf's fangs catch your forearm, tearing through the armor — 6 piercing damage. ${c?.name || 'You'} (HP: [new HP]/${c?.max_hp || 10})"
   - For misses, describe the near-miss: "The blade passes an inch from your ear"

   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COMBAT FORMAT
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Opening:
   ⚔️ COMBAT BEGINS
   Initiative Order:
   - [Enemy 1] (HP: X/X): [roll]
   - [Enemy 2] (HP: X/X): [roll]
   - ${c?.name || 'Hero'} (HP: ${c?.current_hp || 10}/${c?.max_hp || 10}): [roll + DEX mod]
   ---

   Each enemy turn (after player ends turn):
   Round [N] — [Enemy]'s Turn
   [Vivid description of what the enemy does]
   [Enemy Name] (HP: current/max) → [attack description]
   Attack roll: [N] vs AC ${c?.armor_class || 10} → Hit/Miss
   [If hit]: [Describe impact] — [N] [type] damage. ${c?.name || 'You'} (HP: [new current]/${c?.max_hp || 10})
   [Any special effect: "Make a DC 11 STR save or fall Prone"]

   After ALL enemies have acted:
   ---
   It is now ${c?.name || 'your'} turn (Round [N]).
   [Brief status: list all creatures with current HP]
   What does ${c?.name || 'your character'} do?

   HP UPDATE RULE — NON-NEGOTIABLE:
   After ANY damage, ALWAYS show: CreatureName (HP: new/max)
   Example: "Wolf 2 takes 8 slashing damage. Wolf 2 (HP: 3/11)"
   Example: "${c?.name || 'You'} take 5 piercing damage. ${c?.name || 'You'} (HP: [new]/${c?.max_hp || 10})"

   ⚔️ COMBAT ENDS — written when last enemy is dead or flees, then give XP

8. DICE — NEVER ROLL FOR THE PLAYER:
   Describe what is happening → ask for the roll → STOP → wait for their result.
   WRONG: "Roll: 15 → Hit! You deal 8 damage."
   RIGHT: "➤ Roll d20 + STR (${mod(c?.strength || 10)}) to hit."
   [Wait for player's roll. Only after they report it, resolve the outcome.]

9. OPENING SCENE (BEGIN_ADVENTURE only):
   📍 [Location] | 🕐 [Time] | 📅 Day 1
   [Atmospheric description — 2 sentences]
   ═══ THREE PATHS BEFORE YOU ═══
   🔴 [Point of Interest 1 — one sentence]
   🔵 [Point of Interest 2 — one sentence]
   🟢 [Point of Interest 3 — one sentence]
   Which draws ${c?.name || 'your'} attention?

10. DIFFICULTY: ${campaignSettings?.difficulty || 'normal'}
   ${campaignSettings?.difficulty === 'hard' ? 'Enemies are tougher, resources scarcer, consequences permanent.' : ''}
   ${campaignSettings?.difficulty === 'easy' ? 'Forgiving encounters, extra hints, lower DCs.' : ''}

11. TONE: ${campaignSettings?.tone || 'balanced'}
    ${campaignSettings?.tone === 'dark' ? 'Gritty, morally complex, high stakes, realistic consequences.' : ''}
    ${campaignSettings?.tone === 'heroic' ? 'Epic, triumphant, clear good vs evil, satisfying victories.' : ''}
    ${campaignSettings?.tone === 'comedic' ? 'Lighthearted, witty NPCs, amusing situations alongside adventure.' : ''}

12. Be vivid, dramatic, use all five senses. 3-5 paragraphs per narrative turn.`
}

// ── SMART EXTRACTOR (second pass) ──────────────────────────
export async function extractGameEvents(playerAction, dmResponse, character) {
  const charSummary = character ? `
Character: ${character.name}, Lv${character.level} ${character.class}
HP: ${character.current_hp}/${character.max_hp} | Gold: ${character.gold ?? 10} gp
Equipment: ${(character.equipment || []).join(', ') || 'none'}
Spells: ${(character.spells || []).map(s => s.replace(/ \(cantrip\)/i, '').trim()).join(', ') || 'none'}
Conditions: ${(character.conditions || []).join(', ') || 'none'}`.trim() : ''

  const prompt = `You are a D&D 5e game state tracker. Analyze this exchange and extract ALL state changes.

${charSummary}

PLAYER ACTION: ${playerAction}

DM RESPONSE: ${dmResponse}

Return ONLY valid JSON (no markdown, no explanation):
{
  "newItems": [],
  "removeItems": [],
  "goldChange": null,
  "newSpells": [],
  "xpGain": null,
  "levelUp": null,
  "hpChange": null,
  "newConditions": [],
  "removedConditions": [],
  "newNPCs": [],
  "newQuests": [],
  "questComplete": [],
  "combatStarted": false,
  "combatEnded": false
}

EXTRACTION RULES — read carefully:
- hpChange: If DM says player takes N damage → -N. If healed → +N. MUST be extracted from combat hits.
  Examples: "you take 8 damage" → -8, "heals you for 5" → +5, "you lose 3 hit points" → -3
- goldChange: Any gold movement. "gives you 10 gold" → +10, "costs 5 gp" → -5, "you pay 2 coins" → -2
- newItems: Any item player receives, finds, loots, buys, or takes from an enemy.
  If player strips armor from someone → add that armor. If player picks up a weapon → add it.
- removeItems: Items the player loses in any way:
  * Consumed (potion drunk, torch burned out)
  * Given away voluntarily
  * Stolen, confiscated, or taken by enemies
  * Destroyed or lost in the environment
  * "Lost all equipment", "stripped of weapons", "everything taken" → list ALL equipment items
  * If captured and stripped: removeItems = all equipment items from the character sheet
- newNPCs: Every named character who appears for the first time.
  Format: {"name":"Gareth","role":"ally|foe|neutral","location":"The Docks","description":"one sentence"}
- newConditions: Conditions applied to player this turn (Poisoned, Blinded, Frightened, etc.)
- removedConditions: Conditions that ended this turn
- xpGain: Award XP for: kills (CR×100 approx), quest steps, clever solutions, good roleplay
- combatStarted: true if "COMBAT BEGINS" appears in DM response
- combatEnded: true if "COMBAT ENDS" appears in DM response`

  try {
    const raw    = await callAI([{ role: 'user', content: prompt }], 700)
    const clean  = raw.replace(/```json|```/g, '').trim()
    // Find JSON object in response
    const start = clean.indexOf('{')
    const end   = clean.lastIndexOf('}') + 1
    if (start === -1 || end === 0) throw new Error('No JSON found')
    const parsed = JSON.parse(clean.slice(start, end))
    return {
      newItems: (parsed.newItems || []).filter(s =>
        typeof s === 'string' &&
        s.length > 1 &&
        !s.includes('[') &&
        !s.match(/^\[/) &&
        s !== 'null' && s !== 'undefined'
      ),
      removeItems:       parsed.removeItems        || [],
      goldChange:        parsed.goldChange         ?? null,
      newSpells: (parsed.newSpells || []).filter(s => 
        typeof s === 'string' && 
        s.length > 1 && 
        !s.includes('[') && 
        !s.includes(']') &&
        !s.match(/^\[/) &&
        s !== 'null' && s !== 'undefined'
      ),
      xpGain:            parsed.xpGain             ?? null,
      levelUp:           parsed.levelUp            ?? null,
      hpChange:          parsed.hpChange           ?? null,
      newConditions:     parsed.newConditions      || [],
      removedConditions: parsed.removedConditions  || [],
      newNPCs:           (parsed.newNPCs || []).map(n => ({
        ...n,
        role: ['ally','foe','neutral'].includes((n.role||'').toLowerCase())
          ? n.role.toLowerCase() : 'neutral',
      })),
      newQuests:         parsed.newQuests          || [],
      questComplete:     parsed.questComplete      || [],
      combatStarted:     parsed.combatStarted      || false,
      combatEnded:       parsed.combatEnded        || false,
    }
  } catch (err) {
    console.warn('[Extractor] Failed:', err.message, '— using tag parser')
    return parseGameEvents(dmResponse)
  }
}

export function parseGameEvents(text) {
  const events = {
    newItems: [], removeItems: [], goldChange: null, newSpells: [],
    xpGain: null, levelUp: null, hpChange: null,
    newConditions: [], removedConditions: [],
    newNPCs: [], newQuests: [], questComplete: [],
    combatStarted: text.includes('COMBAT BEGINS'),
    combatEnded: text.includes('COMBAT ENDS'),
  }
  const itemM  = [...text.matchAll(/\[NEW_ITEM:\s*([^\]]+)\]/gi)];          events.newItems      = itemM.map(m => m[1].trim())
  const remM   = [...text.matchAll(/\[REMOVE_ITEM:\s*([^\]]+)\]/gi)];       events.removeItems   = remM.map(m => m[1].trim())
  const goldM  = text.match(/\[GOLD_CHANGE:\s*([+-]?\d+)\]/i);              if (goldM) events.goldChange = parseInt(goldM[1])
  const spellM = [...text.matchAll(/\[NEW_SPELL:\s*([^\]]+)\]/gi)];         events.newSpells     = spellM.map(m => m[1].trim())
  const xpM    = text.match(/\[XP_GAIN:\s*(\d+)\]/i);                       if (xpM)  events.xpGain    = parseInt(xpM[1])
  const lvlM   = text.match(/\[LEVEL_UP:\s*(\d+)\]/i);                      if (lvlM) events.levelUp   = parseInt(lvlM[1])
  const hpM    = text.match(/\[HP_CHANGE:\s*([+-]?\d+)\]/i);                if (hpM)  events.hpChange  = parseInt(hpM[1])
  const npcM   = [...text.matchAll(/\[NPC:\s*([^|]+)\|([^|]+)\|([^|]+)\|([^\]]+)\]/gi)]
  events.newNPCs = npcM.map(m => ({ name:m[1].trim(), role:m[2].trim().toLowerCase(), location:m[3].trim(), description:m[4].trim() }))
  const qM  = [...text.matchAll(/\[QUEST:\s*([^|]+)\|([^|]+)\|([^|]+)\|([^\]]+)\]/gi)]
  events.newQuests = qM.map(m => ({ title:m[1].trim(), giver:m[2].trim(), description:m[3].trim(), reward:m[4].trim() }))
  const qcM = [...text.matchAll(/\[QUEST_COMPLETE:\s*([^\]]+)\]/gi)];       events.questComplete = qcM.map(m => m[1].trim())
  return events
}

export function cleanDMText(text) {
  return text
    .replace(/\[NEW_ITEM:[^\]]+\]/gi, '')  .replace(/\[REMOVE_ITEM:[^\]]+\]/gi, '')
    .replace(/\[GOLD_CHANGE:[^\]]+\]/gi, '').replace(/\[NEW_SPELL:[^\]]+\]/gi, '')
    .replace(/\[XP_GAIN:[^\]]+\]/gi, '')   .replace(/\[LEVEL_UP:[^\]]+\]/gi, '')
    .replace(/\[HP_CHANGE:[^\]]+\]/gi, '') .replace(/\[NPC:[^\]]+\]/gi, '')
    .replace(/\[QUEST:[^\]]+\]/gi, '')     .replace(/\[QUEST_COMPLETE:[^\]]+\]/gi, '')
    .replace(/\n{3,}/g, '\n\n').trim()
}

// ── DEDICATED OPENING SCENE CALL ───────────────────────────
// Separate from callDM to guarantee the right format every time
export async function callOpeningScene({ character: c, campaignSettings }) {
  const loc   = campaignSettings?.start_location || 'a crossroads on the edge of a great city'
  const world = campaignSettings?.world_name     || 'the Forgotten Realms'
  const tone  = campaignSettings?.tone           || 'balanced'
  const conMod = Math.floor(((c?.constitution || 10) - 10) / 2)

  const system = `You are a Dungeon Master starting a new D&D 5e campaign.
Character: ${c?.name}, a Level ${c?.level || 1} ${c?.race} ${c?.class}.
World: ${world}. Location: ${loc}. Tone: ${tone}.
Gender/Pronouns: ${c?.gender === 'Male' ? 'he/him' : c?.gender === 'Female' ? 'she/her' : 'they/them'}.

Write the opening scene in EXACTLY this format — no deviations:

📍 [Specific location name] | 🕐 [Time of day] | 📅 Day 1

[2-3 vivid sentences describing the setting with sensory details — sights, sounds, smells.]

[1 sentence placing ${c?.name || 'the character'} in the scene and what ${c?.gender === 'Female' ? 'she' : c?.gender === 'Male' ? 'he' : 'they'} is doing.]

═══ THREE PATHS BEFORE YOU ═══

🔴 [Name of first point of interest]: [One sentence describing it and why it's intriguing.]

🔵 [Name of second point of interest]: [One sentence describing it and what draws attention.]

🟢 [Name of third point of interest]: [One sentence describing it and the opportunity it presents.]

Where does ${c?.name || 'your character'} go first?

RULES:
- The three paths must be genuinely different (not all combat, not all taverns)
- Use specific names for places and people, never [PLACEHOLDER] text
- Do not add anything after the question — stop there
- Do not number the paths, use exactly the emoji format above`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'DnD Opening',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 600,
      temperature: 0.9,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: 'Begin the adventure.' },
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

export async function callDM({ messages, character, memory, ragContext, npcs, quests, campaignSettings, monsterContext, suggestedMonsters }) {
  const systemPrompt = buildSystemPrompt({ character, memory, ragContext, npcs, quests, campaignSettings, monsterContext, suggestedMonsters })
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type':  'application/json',
      'HTTP-Referer':  'http://localhost:3000',
      'X-Title':       'DnD Dungeon Master',
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 1000, temperature: 0.85,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.slice(-16).map(m => ({ role: m.role, content: m.content })),
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

export async function callSummarizer(existingSummary, recentMessages) {
  const transcript = recentMessages.map(m => `${m.role === 'user' ? 'Player' : 'DM'}: ${m.content}`).join('\n\n')
  const prompt = `Update this D&D campaign summary.\n\nEXISTING:\n${existingSummary || '(none)'}\n\nRECENT:\n${transcript}\n\nWrite updated summary (150-250 words): current location, active quests, key NPCs met, major decisions, items found, combat outcomes. Past tense. No preamble.`
  try { return await callAI([{ role: 'user', content: prompt }], 400) }
  catch { return existingSummary }
}

export { MODEL }

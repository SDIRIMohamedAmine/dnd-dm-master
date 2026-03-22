// src/lib/slashCommands.js
// ══════════════════════════════════════════════════════════════
// SLASH COMMAND SYSTEM
//
// Slash commands give the player direct, deterministic control
// over game state — no LLM inference needed, no ambiguity.
//
// Usage in chat: /start combat goblin, orc
//               /get "Blade of Blood"
//               /hp +20
//               /spell Fireball
//               /help
//
// Every command returns a SlashResult:
//   { handled: true, feedback: '...', stateChanges: {...}, skipDM: bool }
//   { handled: false }   ← not a slash command, process normally
// ══════════════════════════════════════════════════════════════

// ── Command registry ──────────────────────────────────────────
// Each entry: { syntax, description, aliases, category }
export const COMMAND_REGISTRY = [
  // ── COMBAT ────────────────────────────────────────────────
  {
    id:          'start_combat',
    syntax:      '/start combat <enemy1>[, enemy2, ...]',
    aliases:     ['/fight', '/combat', '/start combat', '/begin combat', '/attack'],
    category:    'combat',
    description: 'Begin combat against the listed enemies.',
    example:     '/start combat goblin, orc warrior',
  },
  {
    id:          'end_combat',
    syntax:      '/end combat [victory|fled|defeated]',
    aliases:     ['/end combat', '/stop combat', '/flee', '/retreat', '/escape'],
    category:    'combat',
    description: 'End the current combat (victory, flee, or defeat).',
    example:     '/end combat victory',
  },

  // ── INVENTORY ─────────────────────────────────────────────
  {
    id:          'get_item',
    syntax:      '/get <item name> [x quantity]',
    aliases:     ['/get', '/give', '/add item', '/acquire'],
    category:    'inventory',
    description: 'Add an item to your inventory.',
    example:     '/get Healing Potion x2',
  },
  {
    id:          'remove_item',
    syntax:      '/remove <item name>',
    aliases:     ['/remove', '/drop', '/lose item', '/delete item'],
    category:    'inventory',
    description: 'Remove an item from your inventory.',
    example:     '/remove Torch',
  },
  {
    id:          'equip',
    syntax:      '/equip <item name> [in <slot>]',
    aliases:     ['/equip', '/wear', '/wield'],
    category:    'inventory',
    description: 'Equip an item to a slot.',
    example:     '/equip Longsword',
  },
  {
    id:          'gold',
    syntax:      '/gold +<amount> or -<amount>',
    aliases:     ['/gold', '/gp', '/money', '/add gold', '/remove gold'],
    category:    'inventory',
    description: 'Add or remove gold.',
    example:     '/gold +50',
  },

  // ── CHARACTER ─────────────────────────────────────────────
  {
    id:          'hp',
    syntax:      '/hp +<amount> | -<amount> | set <amount> | full',
    aliases:     ['/hp', '/health', '/heal', '/damage'],
    category:    'character',
    description: 'Modify HP directly.',
    example:     '/hp +15   /hp -8   /hp full   /hp set 20',
  },
  {
    id:          'level_up',
    syntax:      '/levelup [<level>]',
    aliases:     ['/levelup', '/level up', '/level', '/xp'],
    category:    'character',
    description: 'Trigger level-up (opens the level-up modal).',
    example:     '/levelup',
  },
  {
    id:          'add_spell',
    syntax:      '/spell <spell name>',
    aliases:     ['/spell', '/learn spell', '/add spell', '/learn'],
    category:    'character',
    description: 'Add a spell to your known spells.',
    example:     '/spell Fireball',
  },
  {
    id:          'condition',
    syntax:      '/condition <add|remove> <condition name>',
    aliases:     ['/condition', '/status', '/effect'],
    category:    'character',
    description: 'Add or remove a condition.',
    example:     '/condition add Poisoned   /condition remove Blinded',
  },
  {
    id:          'inspiration',
    syntax:      '/inspiration',
    aliases:     ['/inspiration', '/inspire'],
    category:    'character',
    description: 'Grant yourself inspiration.',
    example:     '/inspiration',
  },
  {
    id:          'rest',
    syntax:      '/rest [short|long]',
    aliases:     ['/rest', '/short rest', '/long rest', '/camp'],
    category:    'character',
    description: 'Take a rest.',
    example:     '/rest short',
  },
  {
    id:          'slots',
    syntax:      '/slots restore [level] | use [level]',
    aliases:     ['/slots', '/spell slots', '/restore slots'],
    category:    'character',
    description: 'Restore or use spell slots.',
    example:     '/slots restore   /slots restore 3   /slots use 2',
  },

  // ── WORLD ─────────────────────────────────────────────────
  {
    id:          'npc',
    syntax:      '/npc add <name> [ally|foe|neutral]',
    aliases:     ['/npc', '/add npc'],
    category:    'world',
    description: 'Add an NPC to your known NPCs.',
    example:     '/npc add Thalara Moonsong ally',
  },
  {
    id:          'quest',
    syntax:      '/quest add <title> | complete <title>',
    aliases:     ['/quest', '/add quest', '/complete quest'],
    category:    'world',
    description: 'Add or complete a quest.',
    example:     '/quest add Find the missing artifact',
  },
  {
    id:          'teleport',
    syntax:      '/tp <location name>',
    aliases:     ['/tp', '/teleport', '/goto', '/location'],
    category:    'world',
    description: 'Jump to a location (DM narrates the transition).',
    example:     '/tp Ironhold Tavern',
  },
  {
    id:          'time',
    syntax:      '/time [+<hours>] | set <time>',
    aliases:     ['/time', '/advance time', '/skip time'],
    category:    'world',
    description: 'Advance or set in-game time.',
    example:     '/time +8   /time set dawn',
  },

  // ── META ──────────────────────────────────────────────────
  {
    id:          'help',
    syntax:      '/help [command]',
    aliases:     ['/help', '/?', '/commands'],
    category:    'meta',
    description: 'Show all slash commands, or details for one.',
    example:     '/help   /help get',
  },
  {
    id:          'debug',
    syntax:      '/debug',
    aliases:     ['/debug', '/state', '/info'],
    category:    'meta',
    description: 'Show current game state (HP, conditions, slots).',
    example:     '/debug',
  },
  {
    id:          'roll',
    syntax:      '/roll <dice expression>',
    aliases:     ['/roll', '/r'],
    category:    'meta',
    description: 'Roll dice and send result to DM.',
    example:     '/roll 2d6+3   /roll d20',
  },
]

// ── Parser ────────────────────────────────────────────────────
// Returns { commandId, args } or null

export function parseSlashCommand(raw) {
  if (!raw?.startsWith('/')) return null
  const lower = raw.toLowerCase().trim()

  // Try longest-alias match first (so "/start combat" beats "/start")
  let bestMatch = null, bestLen = 0
  for (const cmd of COMMAND_REGISTRY) {
    for (const alias of cmd.aliases) {
      if (lower.startsWith(alias.toLowerCase()) && alias.length > bestLen) {
        bestMatch = cmd
        bestLen   = alias.length
      }
    }
  }
  if (!bestMatch) return null

  // Everything after the matched alias is the args string
  const argsStr = raw.slice(bestLen).trim()
  return { commandId: bestMatch.id, argsStr, command: bestMatch }
}

// ── Dice roller (used by /roll) ───────────────────────────────

export function rollDiceExpr(expr) {
  const clean = expr.replace(/\s/g, '').toLowerCase()
  const parts = []
  let total   = 0
  // Split on + and - keeping the sign
  const tokens = clean.split(/([+-])/).filter(Boolean)
  let sign = 1
  for (const t of tokens) {
    if (t === '+') { sign = 1; continue }
    if (t === '-') { sign = -1; continue }
    const m = t.match(/^(\d*)d(\d+)$/)
    if (m) {
      const count = parseInt(m[1] || '1')
      const sides = parseInt(m[2])
      const rolls = Array.from({ length: count }, () => Math.floor(Math.random() * sides) + 1)
      const sub   = rolls.reduce((s, r) => s + r, 0)
      total += sign * sub
      parts.push(`${count}d${sides}[${rolls.join(',')}]=${sub}`)
    } else {
      const n = parseInt(t) || 0
      total += sign * n
      parts.push(String(sign * n))
    }
    sign = 1
  }
  return { total, breakdown: parts.join(' + '), expr }
}

// ── Help text generator ───────────────────────────────────────

export function getHelpText(filter) {
  if (filter) {
    // Find the specific command
    const cmd = COMMAND_REGISTRY.find(c =>
      c.id.includes(filter.toLowerCase()) ||
      c.aliases.some(a => a.toLowerCase().includes(filter.toLowerCase()))
    )
    if (!cmd) return `Unknown command "${filter}". Type /help to see all commands.`
    return [
      `**${cmd.syntax}**`,
      cmd.description,
      `Example: ${cmd.example}`,
      cmd.aliases.length > 1 ? `Aliases: ${cmd.aliases.slice(1).join(', ')}` : '',
    ].filter(Boolean).join('\n')
  }

  const byCategory = {}
  for (const cmd of COMMAND_REGISTRY) {
    if (!byCategory[cmd.category]) byCategory[cmd.category] = []
    byCategory[cmd.category].push(cmd)
  }

  const lines = ['**Slash Commands** — type these directly in chat:\n']
  const catLabels = { combat: '⚔️ Combat', inventory: '🎒 Inventory', character: '📋 Character', world: '🗺️ World', meta: '⚙️ Meta' }
  for (const [cat, cmds] of Object.entries(byCategory)) {
    lines.push(`${catLabels[cat] || cat}`)
    for (const cmd of cmds) lines.push(`  ${cmd.syntax.padEnd(36)} — ${cmd.description}`)
    lines.push('')
  }
  return lines.join('\n')
}

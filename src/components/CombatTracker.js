// src/components/CombatTracker.js
import './CombatTracker.css'

// Parse initiative order from DM combat message
export function parseCombatants(dmText) {
  if (!dmText.includes('COMBAT BEGINS')) return null

  const combatants = []
  const lines = dmText.split('\n')

  // Find the initiative order block - lines between "Initiative Order" and the first "---"
  const skipWords = /attack|roll|damage|vs|ac|dc|round|turn|hit|miss|save|check|bonus|modifier/i
  let inInitiative = false
  for (const line of lines) {
    const trimmed = line.trim()

    if (/initiative order/i.test(trimmed)) { inInitiative = true; continue }
    if (inInitiative && /^[-=]{3,}/.test(trimmed)) { inInitiative = false; continue }
    if (!inInitiative) continue

    // Skip empty lines
    if (!trimmed) continue

    // Try many patterns the LLM might produce:
    // "- Goblin 1 (HP: 7/7): 15"
    // "- Goblin: 12 (rolled 8 + DEX +4)"
    // "- Hero (HP: 10/10): 18 (rolled 14 + DEX +4)"
    // "1. Goblin — 15"
    // "Goblin: 15"

    // Pattern 1: has (HP: X/Y) and initiative number
    const p1 = trimmed.match(/[-•*]?\s*(.+?)\s*\(HP:\s*(\d+)\/(\d+)\)[^\d]*(\d+)/)
    // Pattern 2: name then colon/dash then number (possibly with extra text)
    const p2 = trimmed.match(/[-•*\d.]+\s*(.+?)\s*[:\-–—]\s*(\d+)/)
    // Pattern 3: just find any line with a name and a standalone number
    const p3 = trimmed.match(/^\s*[-•*]?\s*([A-Za-z][A-Za-z0-9 \']+?)\s*[:\-–—]\s*(\d+)/)


    if (p1) {
      const name = p1[1].replace(/^[-•*\d.]+\s*/, '').trim()
      if (name.length > 0 && !skipWords.test(name)) {
        combatants.push({
          name, hp: parseInt(p1[2]), maxHp: parseInt(p1[3]),
          initiative: parseInt(p1[4]), isPlayer: false,
        })
      }
    } else if (p2 || p3) {
      const m = p2 || p3
      const name = m[1].replace(/^[-•*\d.]+\s*/, '').trim()
      const init = parseInt(m[2])
      if (name.length > 1 && !skipWords.test(name) && !isNaN(init) && init > 0) {
        combatants.push({
          name, hp: null, maxHp: null, initiative: init, isPlayer: false,
        })
      }
    }
  }

  // If initiative block parsing got nothing, try scanning full text for "Name (HP: X/Y)"
  if (combatants.length === 0) {
    const hpMatches = [...dmText.matchAll(/[-•]\s+([A-Za-z][A-Za-z0-9 \'#]+?)\s*\(HP:\s*(\d+)\/(\d+)\)/g)]
    for (const m of hpMatches) {
      const name = m[1].trim()
      if (!skipWords.test(name)) {
        combatants.push({ name, hp: parseInt(m[2]), maxHp: parseInt(m[3]), initiative: 0, isPlayer: false })
      }
    }
  }

  return combatants.length >= 2 ? combatants : null
}

// Update HP values from subsequent combat messages
export function updateCombatantHP(combatants, dmText, playerName) {
  if (!combatants) return combatants

  return combatants.map(c => {
    const escapedName = c.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const isPlayer = playerName && c.name.toLowerCase() === playerName.toLowerCase()

    // ── Pattern 1: "Name (HP: X/Y)" — explicit current/max ──────
    const p1 = new RegExp(`${escapedName}[^\n]*?\\(HP:\\s*(\\d+)\\s*/\\s*(\\d+)\\)`, 'i')
    const m1 = dmText.match(p1)
    if (m1) return { ...c, hp: Math.max(0, parseInt(m1[1])), maxHp: parseInt(m1[2]) }

    // ── Pattern 2: "Name has X HP remaining" / "Name: X/Y HP" ───
    const p2 = new RegExp(`${escapedName}[^\n]{0,30}?\\b(\\d+)\\s*/\\s*(\\d+)\\s*HP`, 'i')
    const m2 = dmText.match(p2)
    if (m2) return { ...c, hp: Math.max(0, parseInt(m2[1])), maxHp: parseInt(m2[2]) }

    // ── Pattern 3: "Name takes X damage" → subtract from current HP
    const p3 = new RegExp(`${escapedName}[^\n]{0,40}?takes?\\s+(\\d+)[^\n]{0,20}?damage`, 'i')
    const m3 = dmText.match(p3)
    if (m3 && c.hp !== null) {
      return { ...c, hp: Math.max(0, c.hp - parseInt(m3[1])) }
    }

    // ── Pattern 4: "Name is reduced to X HP" ────────────────────
    const p4 = new RegExp(`${escapedName}[^\n]{0,30}?reduced to\\s+(\\d+)\\s*HP`, 'i')
    const m4 = dmText.match(p4)
    if (m4) return { ...c, hp: Math.max(0, parseInt(m4[1])) }

    // ── Pattern 5: Player damage — "you take X damage" ──────────
    if (isPlayer) {
      const pPlayer = /you take[^\n]{0,20}?(\d+)[^\n]{0,20}?damage/i
      const mPlayer = dmText.match(pPlayer)
      if (mPlayer && c.hp !== null) {
        return { ...c, hp: Math.max(0, c.hp - parseInt(mPlayer[1])) }
      }
      // "you lose X hit points"
      const pLose = /you lose[^\n]{0,10}?(\d+)[^\n]{0,10}?hit point/i
      const mLose = dmText.match(pLose)
      if (mLose && c.hp !== null) {
        return { ...c, hp: Math.max(0, c.hp - parseInt(mLose[1])) }
      }
      // "you are healed for X" / "you regain X hit points"
      const pHeal = /(?:healed? for|regain)[^\n]{0,10}?(\d+)[^\n]{0,10}?(?:hit point|hp)/i
      const mHeal = dmText.match(pHeal)
      if (mHeal && c.hp !== null) {
        return { ...c, hp: Math.min(c.maxHp || c.hp, c.hp + parseInt(mHeal[1])) }
      }
    }

    // ── Death markers ────────────────────────────────────────────
    const deadPattern = new RegExp(`${escapedName}[^\n]{0,20}?(☠️|is dead|falls dead|is slain|drops dead|dies)`, 'i')
    if (deadPattern.test(dmText)) return { ...c, hp: 0 }

    return c
  })
}

export default function CombatTracker({ combatants, currentTurn, onClose }) {
  if (!combatants || combatants.length === 0) return null

  return (
    <div className="combat-tracker">
      <div className="ct-header">
        <span className="ct-title">⚔️ Combat</span>
        <button className="ct-close" onClick={onClose}>✕</button>
      </div>
      <div className="ct-list">
        {[...combatants].sort((a, b) => b.initiative - a.initiative).map((c, i) => {
          const hpPct   = c.hp !== null && c.maxHp ? Math.max(0, Math.round((c.hp / c.maxHp) * 100)) : 100
          const isDead  = c.hp === 0
          const hpColor = hpPct > 60 ? '#4ecb71' : hpPct > 25 ? '#e8b84a' : '#e05050'
          const isCurrent = currentTurn === i

          return (
            <div key={i} className={`ct-row ${isCurrent ? 'active' : ''} ${isDead ? 'dead' : ''} ${c.isPlayer ? 'player' : ''}`}>
              <span className="ct-initiative">{c.initiative}</span>
              <div className="ct-info">
                <span className="ct-name">
                  {isDead ? '☠️ ' : isCurrent ? '▶ ' : ''}{c.name}
                </span>
                {c.hp !== null && c.maxHp && !isDead && (
                  <div className="ct-hp-bar-wrap">
                    <div className="ct-hp-bar" style={{ width: `${hpPct}%`, background: hpColor }} />
                  </div>
                )}
              </div>
              {c.hp !== null && !isDead && (
                <span className="ct-hp-text" style={{ color: hpColor }}>{c.hp}/{c.maxHp}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

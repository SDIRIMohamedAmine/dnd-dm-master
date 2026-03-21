// src/components/SkillCheckPanel.js
import { useState } from 'react'
import './SkillCheckPanel.css'

export default function SkillCheckPanel({ check, onResult, onDismiss }) {
  const [rolling,  setRolling]  = useState(false)
  const [dieValue, setDieValue] = useState(null)
  const [confirmed, setConfirmed] = useState(false)

  const total   = dieValue !== null ? dieValue + check.statMod : null
  const success = total !== null ? total >= check.dc : null
  const isCrit  = dieValue === 20
  const isFumble = dieValue === 1

  function rollDie() {
    if (rolling || dieValue !== null) return
    setRolling(true)
    let count = 0
    const anim = setInterval(() => {
      count++
      // Show random numbers while spinning
      document.querySelector('.skc-die-face')?.setAttribute('data-val',
        String(Math.floor(Math.random() * 20) + 1))
      if (count > 15) {
        clearInterval(anim)
        const result = Math.floor(Math.random() * 20) + 1
        setDieValue(result)
        setRolling(false)
      }
    }, 60)
  }

  function confirm() {
    setConfirmed(true)
    setTimeout(() => onResult(dieValue), 600)
  }

  const modStr = check.statMod >= 0 ? `+${check.statMod}` : `${check.statMod}`
  const statLabel = { charisma:'CHA', dexterity:'DEX', strength:'STR', wisdom:'WIS', intelligence:'INT' }[check.statKey] || 'MOD'

  return (
    <div className="skc-backdrop">
      <div className={`skc-panel ${confirmed ? 'dismissing' : ''}`}>

        {/* Header */}
        <div className="skc-header">
          <div className="skc-skill-name">🎲 {check.skill} Check</div>
          <div className="skc-dc-badge">DC {check.dc}</div>
        </div>

        {/* Modifier breakdown */}
        <div className="skc-mod-row">
          <div className="skc-mod-item">
            <span className="skc-mod-label">{statLabel} mod</span>
            <span className="skc-mod-val">{check.rawMod >= 0 ? `+${check.rawMod}` : check.rawMod}</span>
          </div>
          {check.proficient && (
            <div className="skc-mod-item proficient">
              <span className="skc-mod-label">Proficiency</span>
              <span className="skc-mod-val">+{(check.statMod - check.rawMod)}</span>
            </div>
          )}
          <div className="skc-mod-item total">
            <span className="skc-mod-label">Total bonus</span>
            <span className="skc-mod-val">{modStr}</span>
          </div>
        </div>

        {/* Die */}
        <div className="skc-die-area">
          <div
            className={`skc-die-face ${rolling ? 'spinning' : ''} ${dieValue !== null ? 'rolled' : ''} ${isCrit ? 'crit' : ''} ${isFumble ? 'fumble' : ''}`}
            onClick={rollDie}
          >
            {dieValue !== null ? dieValue : <span className="skc-die-hint">d20</span>}
          </div>
          {dieValue === null && !rolling && (
            <div className="skc-roll-hint">Click the die to roll</div>
          )}
          {rolling && (
            <div className="skc-roll-hint">Rolling…</div>
          )}
        </div>

        {/* Result */}
        {dieValue !== null && (
          <div className={`skc-result ${success ? 'success' : 'failure'} ${isCrit ? 'crit' : ''} ${isFumble ? 'fumble' : ''}`}>
            {isCrit && <div className="skc-result-label">⭐ NATURAL 20!</div>}
            {isFumble && <div className="skc-result-label">💀 NATURAL 1!</div>}
            <div className="skc-result-math">
              {dieValue} {modStr} = <strong>{total}</strong>
            </div>
            <div className="skc-result-vs">vs DC {check.dc}</div>
            <div className="skc-result-outcome">
              {success ? '✓ Success' : '✗ Failure'}
              {!isCrit && !isFumble && (
                <span className="skc-result-margin">
                  {success ? ` (+${total - check.dc})` : ` (${total - check.dc})`}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="skc-actions">
          {dieValue !== null && !confirmed && (
            <button className="skc-confirm-btn" onClick={confirm}>
              Send Result to DM →
            </button>
          )}
          {dieValue === null && (
            <button className="skc-roll-btn" onClick={rollDie} disabled={rolling}>
              🎲 Roll d20
            </button>
          )}
          <button className="skc-dismiss-btn" onClick={onDismiss}>
            Skip check
          </button>
        </div>
      </div>
    </div>
  )
}

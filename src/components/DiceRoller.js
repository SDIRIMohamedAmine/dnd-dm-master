// src/components/DiceRoller.js
import { useState } from 'react'
import './DiceRoller.css'

const DICE = [4, 6, 8, 10, 12, 20, 100]

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1
}

export default function DiceRoller({ onRollResult }) {
  const [pool,     setPool]     = useState([])
  const [results,  setResults]  = useState(null)
  const [modifier, setModifier] = useState(0)
  const [rolling,  setRolling]  = useState(false)
  const [history,  setHistory]  = useState([])

  function addDie(sides) {
    setPool(prev => [...prev, { sides, id: Date.now() + Math.random() }])
    setResults(null)
  }
  function removeDie(id) { setPool(prev => prev.filter(d => d.id !== id)); setResults(null) }
  function clearPool() { setPool([]); setResults(null); setModifier(0) }

  async function roll() {
    if (!pool.length) return
    setRolling(true)
    await new Promise(r => setTimeout(r, 250))

    const rolls    = pool.map(d => ({ sides: d.sides, result: rollDie(d.sides) }))
    const rawTotal = rolls.reduce((s, r) => s + r.result, 0)
    const total    = rawTotal + modifier
    const label    = pool.map(d => `d${d.sides}`).join('+')
    const resultData = { rolls, rawTotal, modifier, total, label }

    setResults(resultData)
    setHistory(prev => [{ ...resultData, id: Date.now() }, ...prev].slice(0, 8))
    setRolling(false)

    if (onRollResult) {
      const modStr = modifier !== 0 ? ` ${modifier > 0 ? '+' : ''}${modifier}` : ''
      onRollResult({
        dice: label, rolls: rolls.map(r => r.result), modifier, total,
        summary: `[Rolled ${label}${modStr}: ${rolls.map(r => r.result).join('+')}${modStr} = **${total}**]`,
      })
    }
  }

  const poolSummary = (() => {
    const counts = {}
    pool.forEach(d => { counts[d.sides] = (counts[d.sides] || 0) + 1 })
    return Object.entries(counts).map(([s, c]) => `${c}d${s}`).join('+')
  })()

  return (
    <div className="dice-roller">
      <div className="dice-title">🎲 Dice Roller</div>

      <div className="dice-buttons">
        {DICE.map(d => (
          <button key={d} className="dice-btn" onClick={() => addDie(d)}>
            <span className="dice-btn-label">d{d}</span>
          </button>
        ))}
      </div>

      <div className="dice-pool-area">
        <div className="dice-pool-header">
          <span className="dice-pool-label">{pool.length === 0 ? 'Click dice to add' : poolSummary}</span>
          {pool.length > 0 && <button className="dice-clear" onClick={clearPool}>Clear</button>}
        </div>
        {pool.length > 0 && (
          <div className="dice-pool">
            {pool.map(d => (
              <button key={d.id} className="dice-pool-chip" onClick={() => removeDie(d.id)}>d{d.sides} ×</button>
            ))}
          </div>
        )}
      </div>

      <div className="dice-modifier-row">
        <span className="dice-modifier-label">Modifier</span>
        <button className="dice-mod-btn" onClick={() => setModifier(m => m - 1)}>−</button>
        <span className={`dice-mod-val ${modifier > 0 ? 'pos' : modifier < 0 ? 'neg' : ''}`}>
          {modifier > 0 ? `+${modifier}` : modifier}
        </span>
        <button className="dice-mod-btn" onClick={() => setModifier(m => m + 1)}>+</button>
      </div>

      <button className="dice-roll-btn" onClick={roll} disabled={!pool.length || rolling}>
        {rolling ? '🎲 Rolling…' : pool.length ? `Roll ${poolSummary}` : 'Add dice first'}
      </button>

      {results && (
        <div className="dice-results">
          <div className="dice-results-rolls">
            {results.rolls.map((r, i) => (
              <span key={i} className={`dice-result-chip ${r.result === r.sides ? 'crit' : r.result === 1 && r.sides === 20 ? 'fumble' : ''}`}>
                {r.result}
                {r.result === r.sides && <span className="dice-crit-label">MAX</span>}
                {r.result === 1 && r.sides === 20 && <span className="dice-fumble-label">1!</span>}
              </span>
            ))}
            {results.modifier !== 0 && (
              <span className="dice-result-mod">{results.modifier > 0 ? `+${results.modifier}` : results.modifier}</span>
            )}
          </div>
          <div className="dice-total">{results.total}</div>
          <div className="dice-total-label">
            {results.label}{results.modifier !== 0 ? ` ${results.modifier > 0 ? '+' : ''}${results.modifier}` : ''} = {results.total}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="dice-history">
          <div className="dice-history-title">Recent Rolls</div>
          {history.map(h => (
            <div key={h.id} className="dice-history-row">
              <span className="dice-history-label">{h.label}</span>
              <span className="dice-history-rolls">{h.rolls.map(r => r.result).join(', ')}</span>
              <span className={`dice-history-total ${h.total >= 15 ? 'high' : h.total <= 5 ? 'low' : ''}`}>= {h.total}</span>
            </div>
          ))}
        </div>
      )}

      <div className="dice-tip">Roll, then send the result to the DM.</div>
    </div>
  )
}

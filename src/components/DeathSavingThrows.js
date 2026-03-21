// src/components/DeathSavingThrows.js
// D&D 5e death saving throws: 3 successes = stable, 3 failures = dead
// Appears when player HP = 0. Player rolls d20 each turn.
import { useState } from 'react'
import './DeathSavingThrows.css'

export default function DeathSavingThrows({ characterName, onStabilized, onDied }) {
  const [successes, setSuccesses] = useState(0)
  const [failures,  setFailures]  = useState(0)
  const [lastRoll,  setLastRoll]  = useState(null)
  const [rolling,   setRolling]   = useState(false)
  const [done,      setDone]      = useState(false)

  function rollSave() {
    if (rolling || done) return
    setRolling(true)

    // Animate briefly
    let ticks = 0
    const anim = setInterval(() => {
      ticks++
      setLastRoll(Math.floor(Math.random() * 20) + 1)
      if (ticks > 10) {
        clearInterval(anim)
        const result = Math.floor(Math.random() * 20) + 1
        setLastRoll(result)
        setRolling(false)
        resolveRoll(result)
      }
    }, 50)
  }

  function resolveRoll(roll) {
    // Natural 20 = regain 1 HP and stabilize immediately
    if (roll === 20) {
      setDone(true)
      setTimeout(() => onStabilized(1), 800)
      return
    }
    // Natural 1 = two failures
    const isNat1    = roll === 1
    const isSuccess = roll >= 10

    if (isSuccess) {
      const newS = successes + 1
      setSuccesses(newS)
      if (newS >= 3) { setDone(true); setTimeout(() => onStabilized(0), 800) }
    } else {
      const newF = failures + (isNat1 ? 2 : 1)
      setFailures(newF)
      if (newF >= 3) { setDone(true); setTimeout(() => onDied(), 800) }
    }
  }

  const isNat20 = lastRoll === 20
  const isNat1  = lastRoll === 1

  return (
    <div className="dst-backdrop">
      <div className="dst-panel">
        <div className="dst-title">☠️ Death Saving Throw</div>
        <div className="dst-name">{characterName} is dying…</div>
        <div className="dst-desc">Roll a d20 each turn. 3 successes = stable. 3 failures = dead.</div>

        <div className="dst-tracks">
          <div className="dst-track">
            <span className="dst-track-label success">Successes</span>
            <div className="dst-pips">
              {[0,1,2].map(i => <div key={i} className={`dst-pip success ${i < successes ? 'filled' : ''}`}/>)}
            </div>
          </div>
          <div className="dst-track">
            <span className="dst-track-label failure">Failures</span>
            <div className="dst-pips">
              {[0,1,2].map(i => <div key={i} className={`dst-pip failure ${i < Math.min(failures,3) ? 'filled' : ''}`}/>)}
            </div>
          </div>
        </div>

        {lastRoll && (
          <div className={`dst-result ${isNat20?'nat20':isNat1?'nat1':lastRoll>=10?'success':'failure'}`}>
            <div className="dst-die">{lastRoll}</div>
            <div className="dst-verdict">
              {isNat20 ? '⭐ Natural 20 — You regain 1 HP!' :
               isNat1  ? '💀 Natural 1 — Two failures!' :
               lastRoll >= 10 ? '✓ Success' : '✗ Failure'}
            </div>
          </div>
        )}

        {done ? (
          <div className="dst-done">
            {successes >= 3 ? '💚 Stabilized — you survive.' :
             isNat20 ? '💚 Miraculous recovery!' :
             '💀 You have died.'}
          </div>
        ) : (
          <button className="dst-roll-btn" onClick={rollSave} disabled={rolling}>
            {rolling ? 'Rolling…' : '🎲 Roll Death Save'}
          </button>
        )}

        <div className="dst-rules">
          10+ = success · 1–9 = failure · Nat 20 = regain 1 HP · Nat 1 = 2 failures
        </div>
      </div>
    </div>
  )
}

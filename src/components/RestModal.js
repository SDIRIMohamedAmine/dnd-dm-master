// src/components/RestModal.js
import { useState } from 'react'
import { HIT_DICE, restoreAllSlots, restoreWarlockSlots } from '../lib/spellSlots'
import './RestModal.css'

export default function RestModal({ character, onRest, onClose }) {
  const [restType, setRestType]     = useState(null)
  const [hitDiceToSpend, setDice]   = useState(0)
  const [saving,    setSaving]      = useState(false)
  const [lastRolls, setLastRolls]   = useState([])
  const [hpGained,  setHpGained]    = useState(null)

  const hitDie        = HIT_DICE[character.class] || 8
  const maxHitDice    = character.level
  const usedHitDice   = character.hit_dice_used || 0
  const availableHD   = maxHitDice - usedHitDice
  const conMod        = Math.floor(((character.constitution || 10) - 10) / 2)
  const isWarlock     = character.class === 'Warlock'

  // Estimate HP recovery per hit die
  const avgPerDie = Math.floor(hitDie / 2) + 1 + conMod

  // Roll hit dice on rest (not average)
  function rollHitDice(count, sides, conMod) {
    let total = 0
    const rolls = []
    for (let i = 0; i < count; i++) {
      const r = Math.floor(Math.random() * sides) + 1
      rolls.push(r)
      total += Math.max(1, r + conMod)
    }
    return { total, rolls }
  }

  async function confirmRest() {
    setSaving(true)
    const updates = {}

    if (restType === 'short') {
      // Roll actual hit dice instead of using average
      const { total: hpGain, rolls } = rollHitDice(hitDiceToSpend, hitDie, conMod)
      setLastRolls(rolls)
      setHpGained(hpGain)
      updates.current_hp     = Math.min(character.max_hp, character.current_hp + hpGain)
      updates.hit_dice_used  = usedHitDice + hitDiceToSpend
      if (isWarlock && character.spell_slots) {
        updates.spell_slots = restoreWarlockSlots(character.spell_slots)
      }
    }

    if (restType === 'long') {
      updates.current_hp    = character.max_hp
      updates.hit_dice_used = Math.max(0, Math.floor(usedHitDice / 2))
      if (character.spell_slots) updates.spell_slots = restoreAllSlots(character.spell_slots)
      // Clear conditions that end on long rest
      const persistentConditions = ['Exhaustion'] // only exhaustion persists (reduced by 1 level)
      const currentConds = character.conditions || []
      updates.conditions = currentConds.filter(c => persistentConditions.includes(c))
    }

    await onRest(restType, updates)
    setSaving(false)
  }

  return (
    <div className="rest-backdrop" onClick={onClose}>
      <div className="rest-modal" onClick={e => e.stopPropagation()}>
        <div className="rest-header">
          <h2 className="rest-title">Take a Rest</h2>
          <button className="rest-close" onClick={onClose}>✕</button>
        </div>

        {!restType ? (
          <div className="rest-options">
            <button className="rest-option" onClick={() => setRestType('short')}>
              <span className="rest-option-icon">⏱</span>
              <div>
                <div className="rest-option-name">Short Rest</div>
                <div className="rest-option-desc">1 hour. Spend hit dice to recover HP.{isWarlock ? ' Regain Warlock spell slots.' : ''}</div>
              </div>
            </button>
            <button className="rest-option rest-option-long" onClick={() => setRestType('long')}>
              <span className="rest-option-icon">🌙</span>
              <div>
                <div className="rest-option-name">Long Rest</div>
                <div className="rest-option-desc">8 hours. Full HP. Recover all spell slots. Regain half your hit dice.</div>
              </div>
            </button>
          </div>
        ) : (
          <div className="rest-confirm">
            <div className="rest-type-label">
              {restType === 'short' ? '⏱ Short Rest' : '🌙 Long Rest'}
            </div>

            {restType === 'short' && (
              <div className="rest-hit-dice">
                <div className="rest-hd-info">
                  Hit Dice available: <strong>{availableHD}d{hitDie}</strong>
                  <span className="rest-hd-sub"> (avg {avgPerDie} HP per die)</span>
                </div>
                <div className="rest-hd-controls">
                  <button className="rest-hd-btn" onClick={() => setDice(d => Math.max(0, d - 1))} disabled={hitDiceToSpend === 0}>−</button>
                  <span className="rest-hd-count">{hitDiceToSpend}d{hitDie}</span>
                  <button className="rest-hd-btn" onClick={() => setDice(d => Math.min(availableHD, d + 1))} disabled={hitDiceToSpend >= availableHD}>+</button>
                </div>
                <div className="rest-hd-preview">
                  {hpGained !== null ? (
                    <>
                      <strong>Rolled: {lastRolls.join(', ')} (+{conMod} each) = +{hpGained} HP</strong>
                      <span> → {Math.min(character.max_hp, character.current_hp + hpGained)} HP</span>
                    </>
                  ) : (
                    <>HP recovery: roll {hitDiceToSpend}d{hitDie}{conMod >= 0 ? `+${conMod*hitDiceToSpend}` : `${conMod*hitDiceToSpend}`} (avg ≈ +{hitDiceToSpend * avgPerDie})</>
                  )}
                </div>
              </div>
            )}

            {restType === 'long' && (
              <div className="rest-long-preview">
                <div className="rest-preview-row"><span>HP</span><span>{character.current_hp}/{character.max_hp} → <strong>{character.max_hp}/{character.max_hp}</strong></span></div>
                <div className="rest-preview-row"><span>Hit Dice</span><span>Recover {Math.ceil(usedHitDice / 2)} dice</span></div>
                {character.spell_slots && Object.keys(character.spell_slots).length > 0 && (
                  <div className="rest-preview-row"><span>Spell Slots</span><span>All restored</span></div>
                )}
              </div>
            )}

            <div className="rest-footer">
              <button className="rest-back-btn" onClick={() => setRestType(null)}>← Back</button>
              <button className="rest-confirm-btn" onClick={confirmRest} disabled={saving || (restType === 'short' && hitDiceToSpend === 0 && !isWarlock)}>
                {saving ? 'Resting…' : `Confirm ${restType === 'short' ? 'Short' : 'Long'} Rest`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

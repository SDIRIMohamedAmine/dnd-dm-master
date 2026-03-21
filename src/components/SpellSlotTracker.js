// src/components/SpellSlotTracker.js
import './SpellSlotTracker.css'

export default function SpellSlotTracker({ spellSlots, onUseSlot, onRestoreSlot }) {
  if (!spellSlots || Object.keys(spellSlots).length === 0) return null

  const levels = Object.keys(spellSlots).sort((a, b) => Number(a) - Number(b))

  return (
    <div className="sst-container">
      {levels.map(lvl => {
        const { max, used } = spellSlots[lvl]
        const remaining = max - used
        return (
          <div key={lvl} className="sst-row">
            <span className="sst-label">Level {lvl}</span>
            <div className="sst-pips">
              {Array.from({ length: max }).map((_, i) => {
                const isUsed = i >= remaining
                return (
                  <button
                    key={i}
                    className={`sst-pip ${isUsed ? 'used' : 'available'}`}
                    onClick={() => isUsed ? onRestoreSlot?.(lvl) : onUseSlot?.(lvl)}
                    title={isUsed ? 'Click to restore' : 'Click to use'}
                  />
                )
              })}
            </div>
            <span className="sst-count">{remaining}/{max}</span>
          </div>
        )
      })}
    </div>
  )
}

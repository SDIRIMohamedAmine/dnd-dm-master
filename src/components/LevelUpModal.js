// src/components/LevelUpModal.js
import { useState } from 'react'
import { CLASS_FEATURES, getSpellsForLevel, getSpellsToLearnCount, hpGainForLevel } from '../lib/classData'
import { CLASSES } from '../lib/dndData'
import './LevelUpModal.css'

const STAT_NAMES = ['strength','dexterity','constitution','intelligence','wisdom','charisma']
const STAT_LABELS = { strength:'STR',dexterity:'DEX',constitution:'CON',intelligence:'INT',wisdom:'WIS',charisma:'CHA' }
const ASI_LEVELS  = new Set([4,8,12,16,19])

export default function LevelUpModal({ character, newLevel, onSave, onClose }) {
  const conMod      = Math.floor(((character.constitution || 10) - 10) / 2)
  const hpGain      = hpGainForLevel(character.class, conMod)
  const features    = CLASS_FEATURES[character.class]?.[newLevel] || []
  const { cantrips: availableCantrips, spells: availableSpells } = getSpellsForLevel(character.class, newLevel)
  const spellCount  = getSpellsToLearnCount(character.class, newLevel)
  const showASI     = ASI_LEVELS.has(newLevel)

  const [asiMode,       setAsiMode]      = useState('one')
  const [asiStat1,      setAsiStat1]     = useState('')
  const [asiStat2,      setAsiStat2]     = useState('')
  const [chosenSpells,  setChosenSpells] = useState([])
  const [chosenSubclass,setChosenSubclass] = useState(character.subclass || '')
  const [saving,        setSaving]       = useState(false)
  const [step,          setStep]         = useState(0)

  // Subclass choice at level 3 (if not already chosen)
  const clsData          = CLASSES.find(c => c.name === character.class)
  const needsSubclass    = newLevel === 3 && !character.subclass && clsData?.subclasses?.length > 0

  // Calculate steps to show
  const steps = ['features']
  steps.push('hp')
  if (needsSubclass) steps.push('subclass')
  if (availableSpells.length > 0 && spellCount > 0) steps.push('spells')
  if (showASI) steps.push('asi')
  const currentStep  = steps[step]
  const isLastStep   = step === steps.length - 1

  function toggleSpell(spell) {
    setChosenSpells(prev => {
      if (prev.includes(spell)) return prev.filter(s => s !== spell)
      if (prev.length >= spellCount) return prev
      return [...prev, spell]
    })
  }

  function canAdvance() {
    if (currentStep === 'subclass' && needsSubclass && !chosenSubclass) return false
    if (currentStep === 'spells' && spellCount > 0 && chosenSpells.length < Math.min(spellCount, availableSpells.length)) return false
    if (currentStep === 'asi' && showASI) {
      if (asiMode === 'one'  && !asiStat1)            return false
      if (asiMode === 'two'  && (!asiStat1 || !asiStat2)) return false
    }
    return true
  }

  async function handleFinish() {
    setSaving(true)
    const updates = {
      level:             newLevel,
      max_hp:            character.max_hp + hpGain,
      current_hp:        character.max_hp + hpGain,  // full heal on level up
      xp_to_next_level:  require('../lib/subclasses').xpToNextLevel(newLevel),
      proficiency_bonus: require('../lib/subclasses').proficiencyBonus(newLevel),
    }

    // Save subclass choice
    if (chosenSubclass && !character.subclass) updates.subclass = chosenSubclass

    // Add chosen spells
    if (chosenSpells.length > 0) {
      const existing = character.spells || []
      updates.spells = [...new Set([...existing, ...chosenSpells])]
    }

    // ASI
    if (showASI) {
      if (asiMode === 'one' && asiStat1) {
        updates[asiStat1] = Math.min(20, (character[asiStat1] || 10) + 2)
      } else if (asiMode === 'two' && asiStat1 && asiStat2) {
        updates[asiStat1] = Math.min(20, (character[asiStat1] || 10) + 1)
        updates[asiStat2] = Math.min(20, (character[asiStat2] || 10) + 1)
      }
    }

    // Update spell slots
    const { buildInitialSlots } = require('../lib/spellSlots')
    const newSlots = buildInitialSlots(character.class, newLevel)
    if (Object.keys(newSlots).length > 0) updates.spell_slots = newSlots

    // Recalculate AC if DEX or CON changed (e.g. Barbarian Unarmored Defense)
    const newDex = updates.dexterity || character.dexterity || 10
    const newCon = updates.constitution || character.constitution || 10
    const newWis = updates.wisdom || character.wisdom || 10
    const dexMod = Math.floor((newDex - 10) / 2)
    const conMod2 = Math.floor((newCon - 10) / 2)
    const wisMod = Math.floor((newWis - 10) / 2)
    if (updates.dexterity || updates.constitution || updates.wisdom) {
      // Recalculate only if unarmored (no chest armor equipped)
      const equipped = character.equipped || {}
      if (!equipped.chest) {
        if (character.class === 'Barbarian') updates.armor_class = 10 + dexMod + conMod2
        else if (character.class === 'Monk')  updates.armor_class = 10 + dexMod + wisMod
        else                                   updates.armor_class = 10 + dexMod
      }
    }

    await onSave(updates)
    setSaving(false)
  }

  return (
    <div className="lvlup-backdrop">
      <div className="lvlup-modal">

        {/* Hero header */}
        <div className="lvlup-hero">
          <div className="lvlup-burst">⭐</div>
          <h2 className="lvlup-title">Level {newLevel}!</h2>
          <p className="lvlup-char">{character.name} — {character.race} {character.class}</p>
          <div className="lvlup-step-dots">
            {steps.map((s, i) => (
              <div key={s} className={`lvlup-dot ${i === step ? 'active' : i < step ? 'done' : ''}`} />
            ))}
          </div>
        </div>

        {/* ── STEP: Features ── */}
        {currentStep === 'features' && (
          <div className="lvlup-body">
            <h3 className="lvlup-section-title">🎉 New Class Features</h3>
            {features.length === 0 ? (
              <p className="lvlup-empty">No new features at this level — but your combat power grows!</p>
            ) : (
              <div className="lvlup-features">
                {features.map((f, i) => (
                  <div key={i} className="lvlup-feature-card">
                    <span className="lvlup-feature-icon">✦</span>
                    <span className="lvlup-feature-name">{f}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="lvlup-hp-preview">
              <span className="lvlup-hp-label">HP gained at this level:</span>
              <span className="lvlup-hp-val">+{hpGain} HP</span>
              <span className="lvlup-hp-sub">(avg d{hpGainForLevel(character.class, 0) - conMod + conMod} + CON {conMod >= 0 ? `+${conMod}` : conMod})</span>
            </div>
            <div className="lvlup-fullheal">
              <span>💚</span>
              <span>You are <strong>fully healed</strong> upon leveling up!</span>
            </div>
          </div>
        )}

        {/* ── STEP: HP Roll ── */}
        {currentStep === 'hp' && (
          <div className="lvlup-body">
            <h3 className="lvlup-section-title">❤️ Hit Points</h3>
            <div className="lvlup-hp-display">
              <div className="lvlup-hp-old">{character.max_hp} HP</div>
              <div className="lvlup-hp-arrow">→</div>
              <div className="lvlup-hp-new">{character.max_hp + hpGain} HP</div>
            </div>
            <div className="lvlup-hp-breakdown">
              <div className="lvlup-hp-row"><span>Previous max HP</span><span>{character.max_hp}</span></div>
              <div className="lvlup-hp-row"><span>Average {character.class} hit die roll</span><span>+{hpGain - conMod}</span></div>
              <div className="lvlup-hp-row"><span>Constitution modifier</span><span>{conMod >= 0 ? `+${conMod}` : conMod}</span></div>
              <div className="lvlup-hp-row lvlup-hp-total"><span>New max HP</span><span>{character.max_hp + hpGain}</span></div>
            </div>
            <div className="lvlup-fullheal">
              <span>💚</span><span>Your HP is fully restored to <strong>{character.max_hp + hpGain}</strong>.</span>
            </div>
          </div>
        )}

        {/* ── STEP: Spells ── */}
        {currentStep === 'spells' && (
          <div className="lvlup-body lvlup-body-scroll">
            <h3 className="lvlup-section-title">✨ Learn New Spells</h3>
            <p className="lvlup-spell-sub">
              Choose <strong>{spellCount}</strong> new spell{spellCount > 1 ? 's' : ''} to add to your spellbook.
              <span className="lvlup-chosen-count"> {chosenSpells.length}/{spellCount} chosen</span>
            </p>
            <div className="lvlup-spell-grid">
              {availableCantrips.map(c => {
                const alreadyKnown = (character.spells || []).includes(c)
                return (
                  <button
                    key={c}
                    className={`lvlup-spell-chip ${chosenSpells.includes(c) ? 'selected' : ''} ${alreadyKnown ? 'known' : ''}`}
                    onClick={() => !alreadyKnown && toggleSpell(c)}
                    disabled={alreadyKnown}
                  >
                    <span className="lvlup-spell-level">Cantrip</span>
                    <span className="lvlup-spell-name">{c}</span>
                    {alreadyKnown && <span className="lvlup-spell-known">✓ Known</span>}
                    {chosenSpells.includes(c) && <span className="lvlup-spell-check">✓</span>}
                  </button>
                )
              })}
              {availableSpells.map(({ spell, level }) => {
                const alreadyKnown = (character.spells || []).includes(spell)
                return (
                  <button
                    key={spell}
                    className={`lvlup-spell-chip ${chosenSpells.includes(spell) ? 'selected' : ''} ${alreadyKnown ? 'known' : ''} ${!alreadyKnown && chosenSpells.length >= spellCount && !chosenSpells.includes(spell) ? 'maxed' : ''}`}
                    onClick={() => !alreadyKnown && toggleSpell(spell)}
                    disabled={alreadyKnown || (!chosenSpells.includes(spell) && chosenSpells.length >= spellCount)}
                  >
                    <span className="lvlup-spell-level">Level {level}</span>
                    <span className="lvlup-spell-name">{spell}</span>
                    {alreadyKnown && <span className="lvlup-spell-known">✓ Known</span>}
                    {chosenSpells.includes(spell) && !alreadyKnown && <span className="lvlup-spell-check">✓</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── STEP: ASI ── */}
        {currentStep === 'asi' && (
          <div className="lvlup-body">
            <h3 className="lvlup-section-title">💪 Ability Score Improvement</h3>
            <p className="lvlup-spell-sub">Your training pays off. Choose how to improve:</p>
            <div className="lvlup-asi-modes">
              <button className={`lvlup-asi-mode ${asiMode === 'one' ? 'active' : ''}`} onClick={() => { setAsiMode('one'); setAsiStat2('') }}>
                +2 to one ability
              </button>
              <button className={`lvlup-asi-mode ${asiMode === 'two' ? 'active' : ''}`} onClick={() => setAsiMode('two')}>
                +1 to two abilities
              </button>
            </div>
            <div className="lvlup-asi-pickers">
              <div className="lvlup-asi-picker">
                <label>{asiMode === 'one' ? 'Choose stat (+2)' : 'First stat (+1)'}</label>
                <select className="lvlup-asi-select" value={asiStat1} onChange={e => setAsiStat1(e.target.value)}>
                  <option value="">Choose…</option>
                  {STAT_NAMES.map(s => (
                    <option key={s} value={s} disabled={character[s] >= 20}>
                      {STAT_LABELS[s]} — currently {character[s] || 10}{character[s] >= 20 ? ' (max)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              {asiMode === 'two' && (
                <div className="lvlup-asi-picker">
                  <label>Second stat (+1)</label>
                  <select className="lvlup-asi-select" value={asiStat2} onChange={e => setAsiStat2(e.target.value)}>
                    <option value="">Choose…</option>
                    {STAT_NAMES.filter(s => s !== asiStat1).map(s => (
                      <option key={s} value={s} disabled={character[s] >= 20}>
                        {STAT_LABELS[s]} — currently {character[s] || 10}{character[s] >= 20 ? ' (max)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="lvlup-footer">
          {step > 0 && <button className="lvlup-back" onClick={() => setStep(s => s - 1)}>← Back</button>}
          <div style={{ flex: 1 }} />
          {!isLastStep ? (
            <button className="lvlup-next" onClick={() => setStep(s => s + 1)} disabled={!canAdvance()}>
              Next →
            </button>
          ) : (
            <button className="lvlup-finish" onClick={handleFinish} disabled={saving || !canAdvance()}>
              {saving ? 'Saving…' : '✓ Level Up!'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

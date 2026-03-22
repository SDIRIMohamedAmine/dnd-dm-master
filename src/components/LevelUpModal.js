// src/components/LevelUpModal.js
import { useState } from 'react'
import { CLASS_FEATURES, getSpellsForLevel, getSpellsToLearnCount, hpGainForLevel } from '../lib/classData'
import { CLASSES } from '../lib/dndData'
import './LevelUpModal.css'

const STAT_NAMES = ['strength','dexterity','constitution','intelligence','wisdom','charisma']
const STAT_LABELS = { strength:'STR',dexterity:'DEX',constitution:'CON',intelligence:'INT',wisdom:'WIS',charisma:'CHA' }
const ASI_LEVELS  = new Set([4,8,12,16,19])

const FEATS = [
  { name: 'Alert',              desc: '+5 initiative. Not surprised. Hidden attackers get no advantage on you.', statBonus: null },
  { name: 'Athlete',            desc: '+1 STR or DEX. Standing up costs only 5ft. Running jumps from 5ft.', statBonus: 'str_or_dex' },
  { name: 'Actor',              desc: '+1 CHA. Advantage on Deception and Performance. Mimic sounds and speech.', statBonus: 'charisma' },
  { name: 'Charger',            desc: 'After Dash, bonus action melee attack (+5 damage) or shove 10ft.', statBonus: null },
  { name: 'Crossbow Expert',    desc: 'Ignore loading. No disadvantage in melee. Bonus action crossbow attack after one-handed attack.', statBonus: null },
  { name: 'Defensive Duelist',  desc: 'Reaction: +proficiency to AC vs one melee attack. Requires finesse weapon.', statBonus: null },
  { name: 'Dual Wielder',       desc: '+1 AC while dual wielding. Use non-light weapons for two-weapon fighting.', statBonus: null },
  { name: 'Dungeon Delver',     desc: 'Advantage on Perception/Investigation for traps and secret doors. Resist trap damage.', statBonus: null },
  { name: 'Durable',            desc: '+1 CON. Minimum Hit Die recovery roll = 2×CON mod.', statBonus: 'constitution' },
  { name: 'Elemental Adept',    desc: 'Choose a damage type. Spells ignore resistance. Treat 1s as 2s on damage rolls.', statBonus: null },
  { name: 'Great Weapon Master',desc: 'On crit or kill, bonus action attack. Option: -5 attack for +10 damage.', statBonus: null },
  { name: 'Healer',             desc: "Stabilize brings to 1 HP. Healer's Kit heals 1d6+4+HD once per short rest.", statBonus: null },
  { name: 'Heavily Armored',    desc: '+1 STR. Proficiency with heavy armor.', statBonus: 'strength' },
  { name: 'Heavy Armor Master', desc: '+1 STR. Non-magical physical damage reduced by 3 while in heavy armor.', statBonus: 'strength' },
  { name: 'Inspiring Leader',   desc: '+1 CHA. 10-min speech gives 6 creatures temp HP = level + CHA mod.', statBonus: 'charisma' },
  { name: 'Keen Mind',          desc: '+1 INT. Know north, sunrise time, and recall anything from last month.', statBonus: 'intelligence' },
  { name: 'Lucky',              desc: '3 luck points/day. Spend to roll extra d20 and choose result for any attack, save, or check.', statBonus: null },
  { name: 'Mage Slayer',        desc: 'Reaction: attack creature casting adjacent spell. Advantage on saves vs adjacent spellcasters.', statBonus: null },
  { name: 'Magic Initiate',     desc: 'Learn 2 cantrips and one 1st-level spell from any class list.', statBonus: null },
  { name: 'Martial Adept',      desc: 'Learn 2 Battle Master maneuvers and gain 1 superiority die (d6).', statBonus: null },
  { name: 'Mobile',             desc: '+10ft speed. Dash ignores difficult terrain. No opportunity attacks after you attack.', statBonus: null },
  { name: 'Observant',          desc: '+1 INT or WIS. Read lips. +5 passive Perception and Investigation.', statBonus: 'int_or_wis' },
  { name: 'Polearm Master',     desc: 'Bonus action butt-end attack (1d4). Opportunity attack when enemy enters reach.', statBonus: null },
  { name: 'Resilient',          desc: "+1 to chosen ability. Gain proficiency in that ability's saving throws.", statBonus: 'chosen' },
  { name: 'Ritual Caster',      desc: 'Learn 2 ritual spells. Cast as rituals without using spell slots.', statBonus: null },
  { name: 'Savage Attacker',    desc: 'Once per turn, reroll weapon damage dice and take the higher result.', statBonus: null },
  { name: 'Sentinel',           desc: 'Opportunity attacks stop movement. React to allies being attacked. No Disengage escape.', statBonus: null },
  { name: 'Sharpshooter',       desc: 'No long-range disadvantage. Ignore half/three-quarters cover. -5 attack for +10 damage option.', statBonus: null },
  { name: 'Shield Master',      desc: 'Bonus shove after Attack action. Add shield AC to DEX saves. Evasion on DEX saves.', statBonus: null },
  { name: 'Skilled',            desc: 'Gain proficiency in any 3 skills or tools.', statBonus: null },
  { name: 'Spell Sniper',       desc: 'Double range of attack spells. Ignore half/three-quarters cover. Learn one attack cantrip.', statBonus: null },
  { name: 'Tavern Brawler',     desc: '+1 STR or CON. Proficient with improvised weapons. Unarmed 1d4. Bonus action grapple on hit.', statBonus: 'str_or_con' },
  { name: 'Tough',              desc: 'Max HP +2 per level retroactively, and +2 every future level.', statBonus: null },
  { name: 'War Caster',         desc: 'Advantage on concentration saves. Somatic components with hands full. Cast spell as opportunity attack.', statBonus: null },
  { name: 'Weapon Master',      desc: '+1 STR or DEX. Gain proficiency with 4 weapons of your choice.', statBonus: 'str_or_dex' },
]


export default function LevelUpModal({ character, newLevel, onSave, onClose }) {
  const conMod      = Math.floor(((character.constitution || 10) - 10) / 2)
  const hpGain      = hpGainForLevel(character.class, conMod)
  const features    = CLASS_FEATURES[character.class]?.[newLevel] || []
  const { cantrips: availableCantrips, spells: availableSpells } = getSpellsForLevel(character.class, newLevel)
  const spellCount  = getSpellsToLearnCount(character.class, newLevel)
  const showASI     = ASI_LEVELS.has(newLevel)

  const [asiMode,       setAsiMode]      = useState('stat')
  const [asiStat1,      setAsiStat1]     = useState('')
  const [asiStat2,      setAsiStat2]     = useState('')
  const [chosenFeat,    setChosenFeat]   = useState('')
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
      if (asiMode === 'stat' && !asiStat1)  return false
      if (asiMode === 'feat' && !chosenFeat) return false
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

    // ASI or Feat
    if (showASI) {
      if (asiMode === 'stat' && asiStat1) {
        if (asiStat2) {
          updates[asiStat1] = Math.min(20, (character[asiStat1] || 10) + 1)
          updates[asiStat2] = Math.min(20, (character[asiStat2] || 10) + 1)
        } else {
          updates[asiStat1] = Math.min(20, (character[asiStat1] || 10) + 2)
        }
      } else if (asiMode === 'feat' && chosenFeat) {
        const feat = FEATS.find(f => f.name === chosenFeat)
        if (feat?.statBonus === 'constitution') updates.constitution = Math.min(20, (character.constitution || 10) + 1)
        if (feat?.statBonus === 'strength')     updates.strength     = Math.min(20, (character.strength || 10) + 1)
        if (feat?.statBonus === 'intelligence') updates.intelligence = Math.min(20, (character.intelligence || 10) + 1)
        if (feat?.statBonus === 'charisma')     updates.charisma     = Math.min(20, (character.charisma || 10) + 1)
        if (feat?.statBonus === 'dexterity')    updates.dexterity    = Math.min(20, (character.dexterity || 10) + 1)
        if (feat?.name === 'Tough') {
          updates.max_hp     = (character.max_hp || 10) + newLevel * 2
          updates.current_hp = (character.max_hp || 10) + newLevel * 2
        }
        const existing = character.feats || []
        updates.feats = [...existing, chosenFeat]
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
            <h3 className="lvlup-section-title">💪 Ability Score Improvement or Feat</h3>
            <p className="lvlup-spell-sub">Choose how to grow at level {newLevel}:</p>
            <div className="lvlup-asi-modes">
              <button className={`lvlup-asi-mode ${asiMode === 'stat' ? 'active' : ''}`}
                onClick={() => { setAsiMode('stat'); setChosenFeat('') }}>
                +2 / +1+1 ability
              </button>
              <button className={`lvlup-asi-mode ${asiMode === 'feat' ? 'active' : ''}`}
                onClick={() => { setAsiMode('feat'); setAsiStat1(''); setAsiStat2('') }}>
                ⭐ Take a Feat
              </button>
            </div>
            {asiMode === 'stat' && (
              <div className="lvlup-asi-pickers">
                <div className="lvlup-asi-picker">
                  <label>Primary stat (+2, or +1 if choosing two)</label>
                  <select className="lvlup-asi-select" value={asiStat1} onChange={e => setAsiStat1(e.target.value)}>
                    <option value="">Choose…</option>
                    {STAT_NAMES.map(s => (
                      <option key={s} value={s} disabled={character[s] >= 20}>
                        {STAT_LABELS[s]} — currently {character[s] || 10}{character[s] >= 20 ? ' (max)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="lvlup-asi-picker">
                  <label>Second stat +1 (optional)</label>
                  <select className="lvlup-asi-select" value={asiStat2} onChange={e => setAsiStat2(e.target.value)}>
                    <option value="">None — give all +2 to first</option>
                    {STAT_NAMES.filter(s => s !== asiStat1).map(s => (
                      <option key={s} value={s} disabled={character[s] >= 20}>
                        {STAT_LABELS[s]} — currently {character[s] || 10}{character[s] >= 20 ? ' (max)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {asiMode === 'feat' && (
              <div style={{marginTop:'10px',maxHeight:'280px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'5px'}}>
                {FEATS.map(f => (
                  <button key={f.name}
                    onClick={() => setChosenFeat(f.name)}
                    style={{
                      padding:'8px 10px',borderRadius:'7px',fontSize:'.74rem',cursor:'pointer',textAlign:'left',
                      border: chosenFeat===f.name ? '1px solid rgba(200,146,42,.6)' : '1px solid rgba(255,255,255,.12)',
                      background: chosenFeat===f.name ? 'rgba(200,146,42,.12)' : 'transparent',
                      color: chosenFeat===f.name ? 'var(--gold,#c8922a)' : 'var(--parch,#e8dcc0)',
                    }}>
                    <div style={{fontWeight:500}}>{f.name}{f.statBonus ? ' (+1 stat)' : ''}</div>
                    <div style={{fontSize:'.65rem',opacity:.7,marginTop:'2px'}}>{f.desc}</div>
                  </button>
                ))}
              </div>
            )}
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

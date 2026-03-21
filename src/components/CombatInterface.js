// src/components/CombatInterface.js
// ══════════════════════════════════════════════════════════
// BG3-style combat interface
// Shows action bar, spell slots, initiative order
// Player clicks actions → sends structured message to DM
// ══════════════════════════════════════════════════════════
import { useState } from 'react'
import { STANDARD_ACTIONS, CLASS_BONUS_ACTIONS } from '../lib/classData'
import './CombatInterface.css'

export default function CombatInterface({ character, combatants, spellSlots, onAction, onEndCombat }) {
  const [actionUsed,      setActionUsed]      = useState(false)
  const [bonusUsed,       setBonusUsed]       = useState(false)
  const [reactionUsed,    setReactionUsed]    = useState(false)
  const [selectedSpellLv, setSelectedSpellLv] = useState(null)
  const [activeTab,       setActiveTab]       = useState('actions')  // actions | spells | bonus

  const classBonus = CLASS_BONUS_ACTIONS[character?.class] || []
  const knownSpells = character?.spells || []
  const conditions  = character?.conditions || []
  const isIncapacitated = conditions.some(c =>
    ['Incapacitated','Paralyzed','Stunned','Unconscious','Petrified'].includes(c)
  )

  // Available spell slots
  const availableSlots = {}
  for (const [lvl, data] of Object.entries(spellSlots || {})) {
    if ((data.max - data.used) > 0) availableSlots[lvl] = data.max - data.used
  }
  const hasSpellSlots  = Object.keys(availableSlots).length > 0
  const isSpellcaster  = knownSpells.length > 0

  function buildActionMessage(action, spellLevel) {
    const c = character
    const statMod = (stat) => {
      const v = c?.[stat] || 10
      const m = Math.floor((v - 10) / 2)
      return m >= 0 ? `+${m}` : `${m}`
    }

    switch (action.id) {
      case 'attack':
        return `I use my Action to Attack. Roll d20 + STR modifier (${statMod('strength')}) for my attack roll against the target.`
      case 'dash':
        return `I use my Action to Dash, doubling my movement speed this turn.`
      case 'disengage':
        return `I use my Action to Disengage. My movement won't provoke opportunity attacks this turn.`
      case 'dodge':
        return `I use my Action to Dodge. Attackers have disadvantage against me until my next turn.`
      case 'help':
        return `I use my Action to Help an ally. Which ally should I assist? They get advantage on their next roll.`
      case 'hide':
        return `I use my Action to Hide. Roll d20 + DEX modifier (${statMod('dexterity')}) for my Stealth check.`
      case 'shove':
        return `I use my Action to Shove. Roll d20 + STR modifier (${statMod('strength')}) for Athletics vs target's Athletics/Acrobatics.`
      case 'grapple':
        return `I use my Action to Grapple. Roll d20 + STR modifier (${statMod('strength')}) for Athletics vs target's Athletics/Acrobatics.`
      case 'rage':
        return `I use my Bonus Action to enter Rage! I gain +2 to damage rolls, resistance to physical damage, and advantage on STR checks for 1 minute.`
      case 'flurry':
        return `I spend 1 Ki point to use Flurry of Blows as a Bonus Action — making 2 additional unarmed strikes. Roll d20 + DEX (${statMod('dexterity')}) for each.`
      case 'patient_defense':
        return `I spend 1 Ki point for Patient Defense — Dodging as a Bonus Action.`
      case 'step_of_wind':
        return `I spend 1 Ki point for Step of the Wind — Dashing or Disengaging as a Bonus Action, and my jump distance is doubled.`
      case 'divine_smite':
        return `I use Divine Smite after hitting — expending a level ${spellLevel || 1} spell slot for ${(spellLevel || 1) + 1}d8 radiant damage.`
      case 'bardic_inspiration':
        return `I use Bardic Inspiration as a Bonus Action to give an ally a d6 inspiration die.`
      case 'cunning_action_dash':
        return `I use Cunning Action to Dash as a Bonus Action.`
      case 'cunning_action_disengage':
        return `I use Cunning Action to Disengage as a Bonus Action.`
      case 'cunning_action_hide':
        return `I use Cunning Action to Hide as a Bonus Action. Roll d20 + DEX (${statMod('dexterity')}) for Stealth.`
      case 'bonus_attack':
        return `I make an offhand Attack as a Bonus Action. Roll d20 + DEX (${statMod('dexterity')}) (no ability modifier to damage).`
      case 'end_turn':
        return `I end my turn. Enemies may now act.`
      default:
        if (action.type === 'spell') {
          return `I cast ${action.name} using a level ${spellLevel || action.minLevel || 1} spell slot. ${action.desc || ''}`
        }
        return `I use ${action.name}.`
    }
  }

  function handleAction(action) {
    if (isIncapacitated && action.id !== 'end_turn') return

    const needsSlot = action.type === 'spell'
    if (needsSlot && !selectedSpellLv) return

    const message = buildActionMessage(action, selectedSpellLv)

    if (action.type === 'action' || action.type === 'spell') setActionUsed(true)
    if (action.type === 'bonus')   setBonusUsed(true)
    if (action.type === 'reaction') setReactionUsed(true)
    if (action.id   === 'end_turn') { setActionUsed(false); setBonusUsed(false); setReactionUsed(false) }

    onAction(message)
  }

  function resetTurn() {
    setActionUsed(false)
    setBonusUsed(false)
    setReactionUsed(false)
  }

  return (
    <div className="combat-ui">
      {/* Initiative / HP bar */}
      <div className="combat-header">
        <div className="combat-header-title">⚔️ Combat</div>
        <div className="combat-economy">
          <div className={`economy-pip ${actionUsed ? 'used' : 'available'}`} title="Action">A</div>
          <div className={`economy-pip bonus ${bonusUsed ? 'used' : 'available'}`} title="Bonus Action">B</div>
          <div className={`economy-pip reaction ${reactionUsed ? 'used' : 'available'}`} title="Reaction">R</div>
          <button className="economy-reset" onClick={resetTurn} title="Reset turn economy">↺</button>
        </div>
        {/* HP bar */}
        {character && (
          <div className="combat-hp-wrap">
            <div className="combat-hp-bar">
              <div className="combat-hp-fill" style={{
                width: `${Math.max(0, Math.round((character.current_hp / character.max_hp) * 100))}%`,
                background: character.current_hp / character.max_hp > 0.5 ? '#4ecb71' : character.current_hp / character.max_hp > 0.25 ? '#e8b84a' : '#e05050'
              }} />
            </div>
            <span className="combat-hp-text">{character.current_hp}/{character.max_hp} HP</span>
          </div>
        )}
      </div>

      {isIncapacitated && (
        <div className="combat-incapacitated">
          ⚠ You are {conditions.filter(c => ['Incapacitated','Paralyzed','Stunned','Unconscious'].includes(c)).join(', ')} — most actions unavailable.
        </div>
      )}

      {/* Tab bar */}
      <div className="combat-tabs">
        {['actions','bonus','spells'].map(tab => (
          <button
            key={tab}
            className={`combat-tab ${activeTab === tab ? 'active' : ''}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'actions' && `⚔️ Actions${actionUsed ? ' ✓' : ''}`}
            {tab === 'bonus'   && `⚡ Bonus${bonusUsed ? ' ✓' : ''}`}
            {tab === 'spells'  && `✨ Spells`}
          </button>
        ))}
      </div>

      {/* Actions tab */}
      {activeTab === 'actions' && (
        <div className="combat-action-grid">
          {STANDARD_ACTIONS.filter(a => a.type === 'action' || a.type === 'special').map(action => {
            const disabled = (action.type === 'action' && actionUsed) || isIncapacitated
            return (
              <button
                key={action.id}
                className={`combat-action-btn ${disabled ? 'disabled' : ''} ${action.id === 'end_turn' ? 'end-turn' : ''}`}
                onClick={() => !disabled && handleAction(action)}
                title={action.desc}
                disabled={disabled}
              >
                <span className="ca-icon">{action.icon}</span>
                <span className="ca-name">{action.name}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Bonus actions tab */}
      {activeTab === 'bonus' && (
        <div className="combat-action-grid">
          {/* Standard bonus attack */}
          {[STANDARD_ACTIONS.find(a => a.id === 'bonus_attack'), ...classBonus].filter(Boolean).map(action => {
            const disabled = bonusUsed || isIncapacitated
            return (
              <button
                key={action.id}
                className={`combat-action-btn ${disabled ? 'disabled' : ''}`}
                onClick={() => !disabled && handleAction(action)}
                title={action.desc}
                disabled={disabled}
              >
                <span className="ca-icon">{action.icon}</span>
                <span className="ca-name">{action.name}</span>
                <span className="ca-desc">{action.desc.slice(0, 60)}{action.desc.length > 60 ? '…' : ''}</span>
              </button>
            )
          })}
          {classBonus.length === 0 && (
            <div className="combat-empty">No class bonus actions. You can still use a weapon offhand attack if dual-wielding.</div>
          )}
        </div>
      )}

      {/* Spells tab */}
      {activeTab === 'spells' && (
        <div className="combat-spells">
          {!isSpellcaster ? (
            <div className="combat-empty">Your class does not cast spells.</div>
          ) : !hasSpellSlots ? (
            <div className="combat-empty">No spell slots remaining. Take a rest to recover them.</div>
          ) : (
            <>
              {/* Spell slot selector */}
              <div className="spell-slot-selector">
                <span className="ssl-label">Cast at level:</span>
                {Object.entries(availableSlots).map(([lvl, count]) => (
                  <button
                    key={lvl}
                    className={`ssl-btn ${selectedSpellLv === lvl ? 'active' : ''}`}
                    onClick={() => setSelectedSpellLv(selectedSpellLv === lvl ? null : lvl)}
                  >
                    Lv {lvl} <span className="ssl-count">({count})</span>
                  </button>
                ))}
              </div>

              {/* Spell list */}
              <div className="combat-spell-list">
                {knownSpells.map(spell => {
                  // Normalize: some spells stored with (cantrip) suffix, some without
                  const rawSpell      = spell
                  const isCantripLike = rawSpell.toLowerCase().includes('(cantrip)')
                  const spellName     = rawSpell.replace(/\s*\(cantrip\)/i, '').trim()
                  const disabled      = (!isCantripLike && (!selectedSpellLv || actionUsed)) || isIncapacitated
                  return (
                    <button
                      key={spell}
                      className={`combat-spell-btn ${disabled ? 'disabled' : ''} ${isCantripLike ? 'cantrip' : ''}`}
                      onClick={() => !disabled && handleAction({ id: `spell_${spellName}`, name: spellName, type: isCantripLike ? 'action' : 'spell', desc: '' })}
                      disabled={disabled}
                      title={isCantripLike ? 'Free to cast (cantrip)' : selectedSpellLv ? `Cast at level ${selectedSpellLv}` : 'Select a spell level first'}
                    >
                      <span className="csb-name">{spellName}</span>
                      <span className="csb-type">{isCantripLike ? 'cantrip' : '▲'}</span>
                    </button>
                  )
                })}
              </div>

              {!selectedSpellLv && knownSpells.some(s => !s.includes('(cantrip)')) && (
                <div className="spell-slot-hint">↑ Select a spell level above to cast leveled spells</div>
              )}
            </>
          )}
        </div>
      )}

      {/* End turn button always visible */}
      <div className="combat-footer">
        <button className="combat-end-turn" onClick={() => {
          handleAction(STANDARD_ACTIONS.find(a => a.id === 'end_turn'))
        }}>
          ⏭ End Turn — Enemy Acts
        </button>
        <button className="combat-flee" onClick={() => onAction('I attempt to flee the battle — rolling DEX (Acrobatics) to disengage.')}>
          🏃 Flee
        </button>
        <button className="combat-end-combat" onClick={onEndCombat}>
          ✓ Combat Over
        </button>
      </div>
    </div>
  )
}

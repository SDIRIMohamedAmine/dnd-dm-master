// src/components/ConditionsTracker.js
import './ConditionsTracker.css'

const ALL_CONDITIONS = [
  { name: 'Blinded',        icon: '👁️', color: '#888', desc: 'Disadvantage on attacks. Attackers have advantage vs you.' },
  { name: 'Charmed',        icon: '💕', color: '#f090c0', desc: 'Cannot attack the charmer. Charmer has advantage on social checks.' },
  { name: 'Deafened',       icon: '👂', color: '#888', desc: 'Cannot hear. Fails checks requiring hearing.' },
  { name: 'Exhaustion',     icon: '😓', color: '#c0a060', desc: 'Cumulative debuffs by level (1-6).' },
  { name: 'Frightened',     icon: '😱', color: '#c060c0', desc: 'Disadvantage while source is visible. Cannot move closer to source.' },
  { name: 'Grappled',       icon: '🤜', color: '#a06020', desc: 'Speed 0. Ends if grappler is incapacitated.' },
  { name: 'Incapacitated',  icon: '💫', color: '#888', desc: 'Cannot take actions or reactions.' },
  { name: 'Invisible',      icon: '👻', color: '#a0d0ff', desc: 'Advantage on attacks. Attackers have disadvantage vs you.' },
  { name: 'Paralyzed',      icon: '⚡', color: '#f0e060', desc: 'Incapacitated. Auto-fail STR/DEX saves. Attacks have advantage, melee hits are crits.' },
  { name: 'Petrified',      icon: '🪨', color: '#a0a080', desc: 'Transformed to stone. Incapacitated, resistant to all damage.' },
  { name: 'Poisoned',       icon: '☠️', color: '#60c060', desc: 'Disadvantage on attack rolls and ability checks.' },
  { name: 'Prone',          icon: '⬇️', color: '#a08060', desc: 'Disadvantage on attacks. Melee attacks have advantage; ranged disadvantage.' },
  { name: 'Restrained',     icon: '🔗', color: '#c07030', desc: 'Speed 0. Disadvantage on attacks and DEX saves. Attackers have advantage.' },
  { name: 'Stunned',        icon: '💥', color: '#f0a020', desc: 'Incapacitated. Auto-fail STR/DEX saves. Attackers have advantage.' },
  { name: 'Unconscious',    icon: '💤', color: '#6060a0', desc: 'Incapacitated, prone. Auto-fail STR/DEX saves. Melee attacks are crits.' },
]

export default function ConditionsTracker({ conditions = [], onAdd, onRemove }) {
  const active = ALL_CONDITIONS.filter(c => conditions.includes(c.name))
  const inactive = ALL_CONDITIONS.filter(c => !conditions.includes(c.name))

  return (
    <div className="conditions-wrap">
      {/* Active conditions */}
      {active.length > 0 && (
        <div className="conditions-active">
          {active.map(c => (
            <div key={c.name} className="condition-badge" style={{ borderColor: c.color }} title={c.desc}>
              <span>{c.icon} {c.name}</span>
              <button className="condition-remove" onClick={() => onRemove(c.name)}>×</button>
            </div>
          ))}
        </div>
      )}

      {/* Add condition dropdown */}
      <div className="conditions-add">
        <select
          className="condition-select"
          value=""
          onChange={e => { if (e.target.value) onAdd(e.target.value) }}
        >
          <option value="">+ Add condition</option>
          {inactive.map(c => (
            <option key={c.name} value={c.name}>{c.icon} {c.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

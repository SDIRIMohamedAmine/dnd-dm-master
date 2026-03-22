// src/components/ConditionsTracker.js
import './ConditionsTracker.css'

export const ALL_CONDITIONS = [
  { name: 'Blinded',        icon: '👁️', color: '#888', desc: 'Disadvantage on attacks. Attackers have advantage vs you.' },
  { name: 'Charmed',        icon: '💕', color: '#f090c0', desc: 'Cannot attack the charmer. Charmer has advantage on social checks.' },
  { name: 'Deafened',       icon: '👂', color: '#888', desc: 'Cannot hear. Fails checks requiring hearing.' },
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

// D&D 5e exhaustion levels — each level stacks all previous effects
export const EXHAUSTION_EFFECTS = [
  null,                                                    // 0: no exhaustion
  'Disadvantage on ability checks',                        // 1
  'Speed halved',                                          // 2
  'Disadvantage on attack rolls and saving throws',        // 3
  'Hit point maximum halved',                              // 4
  'Speed reduced to 0',                                    // 5
  'Death',                                                 // 6
]

// Returns the mechanical penalties active at a given exhaustion level
export function getExhaustionPenalties(level) {
  return EXHAUSTION_EFFECTS.slice(1, level + 1).filter(Boolean)
}

export default function ConditionsTracker({ conditions = [], exhaustionLevel = 0, onAdd, onRemove, onExhaustionChange }) {
  const active   = ALL_CONDITIONS.filter(c => conditions.includes(c.name))
  const inactive = ALL_CONDITIONS.filter(c => !conditions.includes(c.name))

  return (
    <div className="conditions-wrap">
      {/* ── Exhaustion tracker ── */}
      <div className="exhaustion-row" style={{marginBottom:'8px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'4px'}}>
          <span style={{fontSize:'.65rem',letterSpacing:'.1em',color:'var(--gold,#c8922a)',textTransform:'uppercase'}}>
            Exhaustion
          </span>
          <span style={{fontSize:'.65rem',color: exhaustionLevel >= 5 ? '#e05050' : exhaustionLevel >= 3 ? '#e08040' : '#aaa'}}>
            Level {exhaustionLevel}/6{exhaustionLevel >= 6 ? ' — DEATH' : ''}
          </span>
        </div>
        <div style={{display:'flex',gap:'4px',alignItems:'center'}}>
          {[1,2,3,4,5,6].map(lvl => (
            <button key={lvl}
              onClick={() => onExhaustionChange?.(exhaustionLevel === lvl ? lvl - 1 : lvl)}
              title={EXHAUSTION_EFFECTS[lvl]}
              style={{
                width:'22px',height:'22px',borderRadius:'50%',fontSize:'.6rem',cursor:'pointer',
                border: lvl <= exhaustionLevel ? '1px solid rgba(200,80,40,.6)' : '1px solid rgba(255,255,255,.2)',
                background: lvl <= exhaustionLevel
                  ? `rgba(${200 - (lvl-1)*20}, ${60 + (lvl-1)*10}, 40, ${0.3 + lvl*0.1})`
                  : 'transparent',
                color: lvl <= exhaustionLevel ? '#ffb090' : '#666',
                fontWeight: 'bold',
              }}>
              {lvl}
            </button>
          ))}
          {exhaustionLevel > 0 && (
            <button onClick={() => onExhaustionChange?.(0)}
              style={{fontSize:'.6rem',padding:'2px 5px',cursor:'pointer',background:'transparent',border:'1px solid rgba(255,255,255,.15)',borderRadius:'4px',color:'#888',marginLeft:'4px'}}>
              Clear
            </button>
          )}
        </div>
        {exhaustionLevel > 0 && (
          <div style={{marginTop:'4px',fontSize:'.62rem',color:'#e09060'}}>
            {getExhaustionPenalties(exhaustionLevel).map((p, i) => <div key={i}>• {p}</div>)}
          </div>
        )}
      </div>

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
        <select className="condition-select" value="" onChange={e => { if (e.target.value) onAdd(e.target.value) }}>
          <option value="">+ Add condition</option>
          {inactive.map(c => (
            <option key={c.name} value={c.name}>{c.icon} {c.name}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

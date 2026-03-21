// src/components/CompanionPanel.js
// Lightweight companion tracker for hired NPCs, familiars, summoned allies
// Shows in the game sidebar. Companion actions are narrated by the DM.
import { useState } from 'react'
import './CompanionPanel.css'

const COMPANION_TYPES = [
  { type:'hireling',  icon:'🗡️', label:'Hireling' },
  { type:'familiar',  icon:'🐱', label:'Familiar' },
  { type:'summon',    icon:'👻', label:'Summoned' },
  { type:'ally',      icon:'🤝', label:'Ally NPC' },
]

export default function CompanionPanel({ campaignId, userId, onSendToGame }) {
  const [companions, setCompanions]  = useState([])
  const [adding,     setAdding]      = useState(false)
  const [form,       setForm]        = useState({ name:'', type:'hireling', hp:10, maxHp:10, notes:'' })

  function addCompanion() {
    if (!form.name.trim()) return
    const newComp = {
      id:    Date.now(),
      ...form,
      hp:    parseInt(form.hp)||10,
      maxHp: parseInt(form.maxHp)||10,
    }
    setCompanions(prev => [...prev, newComp])
    setForm({ name:'', type:'hireling', hp:10, maxHp:10, notes:'' })
    setAdding(false)
  }

  function updateHP(id, delta) {
    setCompanions(prev => prev.map(c =>
      c.id === id ? { ...c, hp: Math.max(0, Math.min(c.maxHp, c.hp + delta)) } : c
    ))
  }

  function removeCompanion(id) {
    setCompanions(prev => prev.filter(c => c.id !== id))
  }

  function sendAction(companion, action) {
    if (onSendToGame) {
      onSendToGame(`${companion.name} ${action}`)
    }
  }

  const typeInfo = (type) => COMPANION_TYPES.find(t => t.type === type) || COMPANION_TYPES[0]

  return (
    <div className="comp-panel">
      <div className="comp-panel-header">
        <span className="comp-panel-title">🤝 Companions</span>
        <button className="comp-add-btn" onClick={() => setAdding(p => !p)}>
          {adding ? '✕' : '+ Add'}
        </button>
      </div>

      {adding && (
        <div className="comp-add-form">
          <input className="comp-input" placeholder="Name (e.g. Garrick the Guard)"
            value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} />
          <div className="comp-form-row">
            <select className="comp-select" value={form.type} onChange={e=>setForm(p=>({...p,type:e.target.value}))}>
              {COMPANION_TYPES.map(t=><option key={t.type} value={t.type}>{t.label}</option>)}
            </select>
            <input type="number" className="comp-input comp-input-sm" placeholder="HP"
              value={form.hp} onChange={e=>setForm(p=>({...p,hp:e.target.value,maxHp:e.target.value}))} />
          </div>
          <input className="comp-input" placeholder="Notes (class, abilities…)"
            value={form.notes} onChange={e=>setForm(p=>({...p,notes:e.target.value}))} />
          <button className="comp-confirm-btn" onClick={addCompanion} disabled={!form.name.trim()}>
            Add Companion
          </button>
        </div>
      )}

      {companions.length === 0 && !adding && (
        <div className="comp-empty">
          No companions yet.<br/>
          <span>Hire a guard, summon a familiar, or recruit an ally.</span>
        </div>
      )}

      {companions.map(comp => {
        const ti   = typeInfo(comp.type)
        const hpPct = Math.max(0, (comp.hp / comp.maxHp) * 100)
        const hpColor = hpPct > 50 ? '#4ecb71' : hpPct > 25 ? '#e8b84a' : '#e05050'
        return (
          <div key={comp.id} className={`comp-card ${comp.hp <= 0 ? 'down' : ''}`}>
            <div className="comp-card-header">
              <span className="comp-type-icon">{ti.icon}</span>
              <div className="comp-info">
                <div className="comp-name">{comp.name}</div>
                <div className="comp-type-label">{ti.label}</div>
              </div>
              <button className="comp-remove" onClick={() => removeCompanion(comp.id)}>✕</button>
            </div>

            {/* HP bar */}
            <div className="comp-hp-row">
              <button className="comp-hp-btn" onClick={() => updateHP(comp.id, -1)}>−</button>
              <div className="comp-hp-wrap">
                <div className="comp-hp-bar" style={{width:`${hpPct}%`,background:hpColor}}/>
              </div>
              <span className="comp-hp-text" style={{color:hpColor}}>{comp.hp}/{comp.maxHp}</span>
              <button className="comp-hp-btn" onClick={() => updateHP(comp.id, +1)}>+</button>
            </div>

            {comp.notes && <div className="comp-notes">{comp.notes}</div>}

            {/* Quick action buttons */}
            <div className="comp-actions">
              <button className="comp-action" onClick={() => sendAction(comp, 'attacks the nearest enemy.')}>⚔️ Attack</button>
              <button className="comp-action" onClick={() => sendAction(comp, 'moves to protect me.')}>🛡️ Guard</button>
              <button className="comp-action" onClick={() => sendAction(comp, 'uses their special ability.')}>✨ Ability</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

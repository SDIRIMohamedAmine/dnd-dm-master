// src/components/CharacterEditModal.js
import { useState } from 'react'
import './CharacterEditModal.css'

const STAT_NAMES = ['strength','dexterity','constitution','intelligence','wisdom','charisma']
const STAT_LABELS = { strength:'STR',dexterity:'DEX',constitution:'CON',intelligence:'INT',wisdom:'WIS',charisma:'CHA' }

export default function CharacterEditModal({ character, onSave, onClose }) {
  const [form, setForm] = useState({
    name:          character.name          || '',
    armor_class:   character.armor_class   || 10,
    speed:         character.speed         || 30,
    max_hp:        character.max_hp        || 10,
    gold:          character.gold          ?? 10,
    proficiency_bonus: character.proficiency_bonus || 2,
    strength:      character.strength      || 10,
    dexterity:     character.dexterity     || 10,
    constitution:  character.constitution  || 10,
    intelligence:  character.intelligence  || 10,
    wisdom:        character.wisdom        || 10,
    charisma:      character.charisma      || 10,
    equipment_raw: (character.equipment || []).join('\n'),
    spells_raw:    (character.spells    || []).join('\n'),
  })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    const updates = {
      name:              form.name,
      armor_class:       parseInt(form.armor_class) || 10,
      speed:             parseInt(form.speed)        || 30,
      max_hp:            parseInt(form.max_hp)       || 10,
      gold:              parseInt(form.gold)          ?? 10,
      proficiency_bonus: parseInt(form.proficiency_bonus) || 2,
      strength:          parseInt(form.strength)     || 10,
      dexterity:         parseInt(form.dexterity)    || 10,
      constitution:      parseInt(form.constitution) || 10,
      intelligence:      parseInt(form.intelligence) || 10,
      wisdom:            parseInt(form.wisdom)       || 10,
      charisma:          parseInt(form.charisma)     || 10,
      equipment:  form.equipment_raw.split('\n').map(s => s.trim()).filter(Boolean),
      spells:     form.spells_raw.split('\n').map(s => s.trim()).filter(Boolean),
    }
    await onSave(updates)
    setSaving(false)
  }

  return (
    <div className="cedit-backdrop" onClick={onClose}>
      <div className="cedit-modal" onClick={e => e.stopPropagation()}>
        <div className="cedit-header">
          <h2 className="cedit-title">✏️ Edit Character</h2>
          <button className="cedit-close" onClick={onClose}>✕</button>
        </div>

        <div className="cedit-body">
          <div className="cedit-section">
            <div className="cedit-section-title">Identity</div>
            <div className="cedit-grid-2">
              <Field label="Name"><input className="cedit-input" value={form.name} onChange={e => set('name', e.target.value)} /></Field>
              <Field label="Proficiency Bonus"><input type="number" className="cedit-input" value={form.proficiency_bonus} onChange={e => set('proficiency_bonus', e.target.value)} /></Field>
            </div>
          </div>

          <div className="cedit-section">
            <div className="cedit-section-title">Combat Stats</div>
            <div className="cedit-grid-4">
              <Field label="Max HP"><input type="number" className="cedit-input" value={form.max_hp} onChange={e => set('max_hp', e.target.value)} /></Field>
              <Field label="Armor Class"><input type="number" className="cedit-input" value={form.armor_class} onChange={e => set('armor_class', e.target.value)} /></Field>
              <Field label="Speed (ft)"><input type="number" className="cedit-input" value={form.speed} onChange={e => set('speed', e.target.value)} /></Field>
              <Field label="Gold (gp)"><input type="number" className="cedit-input" value={form.gold} onChange={e => set('gold', e.target.value)} /></Field>
            </div>
          </div>

          <div className="cedit-section">
            <div className="cedit-section-title">Ability Scores</div>
            <div className="cedit-grid-6">
              {STAT_NAMES.map(s => (
                <Field key={s} label={STAT_LABELS[s]}>
                  <input type="number" min={1} max={30} className="cedit-input cedit-stat" value={form[s]} onChange={e => set(s, e.target.value)} />
                </Field>
              ))}
            </div>
          </div>

          <div className="cedit-section">
            <div className="cedit-section-title">Equipment (one per line)</div>
            <textarea className="cedit-input cedit-textarea" value={form.equipment_raw} onChange={e => set('equipment_raw', e.target.value)} rows={5} placeholder="Longsword&#10;Shield&#10;Explorer's Pack" />
          </div>

          <div className="cedit-section">
            <div className="cedit-section-title">Spells Known (one per line)</div>
            <textarea className="cedit-input cedit-textarea" value={form.spells_raw} onChange={e => set('spells_raw', e.target.value)} rows={4} placeholder="Fireball&#10;Healing Word&#10;Shield" />
          </div>
        </div>

        <div className="cedit-footer">
          <button className="cedit-cancel" onClick={onClose}>Cancel</button>
          <button className="cedit-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : '✓ Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return <div className="cedit-field"><label className="cedit-label">{label}</label>{children}</div>
}

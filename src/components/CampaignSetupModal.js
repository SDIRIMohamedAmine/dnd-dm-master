// src/components/CampaignSetupModal.js
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import './CampaignSetupModal.css'

const TONES = [
  { id: 'balanced', label: '⚖️ Balanced',  desc: 'Mix of challenge, drama, and fun.' },
  { id: 'dark',     label: '🌑 Dark',       desc: 'Gritty, morally complex, real consequences.' },
  { id: 'heroic',   label: '🌟 Heroic',     desc: 'Epic battles, clear good vs evil, triumphant.' },
  { id: 'comedic',  label: '🎭 Comedic',    desc: 'Lighthearted, witty, fun situations.' },
]

const DIFFICULTIES = [
  { id: 'easy',   label: '🌿 Easy',    desc: 'Lower DCs, forgiving, story-focused.' },
  { id: 'normal', label: '⚔️ Normal',   desc: 'Standard D&D challenge rating.' },
  { id: 'hard',   label: '💀 Hard',     desc: 'Tougher enemies, scarcer resources.' },
]

export default function CampaignSetupModal({ campaign, onSave, onClose }) {
  const [form, setForm] = useState({
    title:          campaign.title          || '',
    world_name:     campaign.world_name     || '',
    tone:           campaign.tone           || 'balanced',
    difficulty:     campaign.difficulty     || 'normal',
    start_location: campaign.start_location || '',
    house_rules:    campaign.house_rules    || '',
  })
  const [saving, setSaving] = useState(false)

  function set(k, v) { setForm(p => ({ ...p, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.from('campaigns').update({
      title:          form.title,
      world_name:     form.world_name,
      tone:           form.tone,
      difficulty:     form.difficulty,
      start_location: form.start_location,
      house_rules:    form.house_rules,
      updated_at:     new Date().toISOString(),
    }).eq('id', campaign.id)
    if (!error) onSave(form)
    setSaving(false)
  }

  return (
    <div className="csetup-backdrop" onClick={onClose}>
      <div className="csetup-modal" onClick={e => e.stopPropagation()}>
        <div className="csetup-header">
          <h2 className="csetup-title">⚙️ Campaign Settings</h2>
          <button className="csetup-close" onClick={onClose}>✕</button>
        </div>

        <div className="csetup-body">
          <Field label="Campaign Title">
            <input className="csetup-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="My Epic Adventure" />
          </Field>
          <Field label="World / Setting Name">
            <input className="csetup-input" value={form.world_name} onChange={e => set('world_name', e.target.value)} placeholder="Forgotten Realms, Eberron, custom world…" />
          </Field>
          <Field label="Starting Location">
            <input className="csetup-input" value={form.start_location} onChange={e => set('start_location', e.target.value)} placeholder="Waterdeep, a small village, a dark dungeon…" />
          </Field>

          <div className="csetup-group">
            <div className="csetup-group-title">Tone</div>
            <div className="csetup-options">
              {TONES.map(t => (
                <button key={t.id} className={`csetup-option ${form.tone === t.id ? 'active' : ''}`} onClick={() => set('tone', t.id)}>
                  <span className="csetup-opt-label">{t.label}</span>
                  <span className="csetup-opt-desc">{t.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="csetup-group">
            <div className="csetup-group-title">Difficulty</div>
            <div className="csetup-options csetup-options-3">
              {DIFFICULTIES.map(d => (
                <button key={d.id} className={`csetup-option ${form.difficulty === d.id ? 'active' : ''}`} onClick={() => set('difficulty', d.id)}>
                  <span className="csetup-opt-label">{d.label}</span>
                  <span className="csetup-opt-desc">{d.desc}</span>
                </button>
              ))}
            </div>
          </div>

          <Field label="House Rules (optional — the DM will follow these)">
            <textarea className="csetup-input csetup-textarea" value={form.house_rules} onChange={e => set('house_rules', e.target.value)} placeholder="e.g. Nat 1 = critical fail with consequence. Inspiration rewarded for good roleplay." rows={3} />
          </Field>
        </div>

        <div className="csetup-footer">
          <button className="csetup-cancel" onClick={onClose}>Cancel</button>
          <button className="csetup-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : '✓ Save Settings'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return <div className="csetup-field"><label className="csetup-label">{label}</label>{children}</div>
}

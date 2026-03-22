// src/components/NPCPanel.js
// Rich NPC tracker: notes, attitude meter, last interaction, quick-talk button
import { useState } from 'react'

const ROLE_LABELS = { ally: '💚 Allies', neutral: '⬜ Neutral', foe: '❤️ Foes' }
const ROLE_COLORS = { ally: '#4ecb71', neutral: '#aaa', foe: '#e05050' }

const ATTITUDE_LABELS = ['Hostile', 'Unfriendly', 'Indifferent', 'Friendly', 'Helpful']
const ATTITUDE_COLORS = ['#e05050', '#e08060', '#aaa', '#7eb8ff', '#4ecb71']

export default function NPCPanel({ npcs = [], onUpdateNPC, onTalkTo }) {
  const [expanded,    setExpanded]    = useState(null)
  const [editingNote, setEditingNote] = useState(null)  // npc id
  const [noteInput,   setNoteInput]   = useState('')
  const [attitudes,   setAttitudes]   = useState({})    // id → 0-4 index

  function getAttitude(npc) {
    if (attitudes[npc.id] !== undefined) return attitudes[npc.id]
    // Default from role
    return npc.role === 'ally' ? 3 : npc.role === 'foe' ? 0 : 2
  }

  function setAttitude(id, val) {
    setAttitudes(prev => ({ ...prev, [id]: val }))
    const roleMap = [0,1].includes(val) ? 'foe' : val === 2 ? 'neutral' : 'ally'
    onUpdateNPC?.(id, { role: roleMap, attitude: ATTITUDE_LABELS[val] })
  }

  function startEditNote(npc) {
    setEditingNote(npc.id)
    setNoteInput(npc.notes || '')
  }

  function saveNote(npc) {
    onUpdateNPC?.(npc.id, { notes: noteInput })
    setEditingNote(null)
  }

  if (!npcs.length) return (
    <div style={{ padding: '14px 12px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', letterSpacing: '.12em', color: 'var(--gold,#c8922a)', textTransform: 'uppercase', marginBottom: '8px' }}>
        👥 Known NPCs
      </div>
      <div style={{ fontSize: '.78rem', color: 'var(--parch3,#aaa)', fontStyle: 'italic' }}>No NPCs encountered yet.</div>
    </div>
  )

  return (
    <div style={{ padding: '12px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', letterSpacing: '.12em', color: 'var(--gold,#c8922a)', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
        <span>👥 NPCs</span>
        <span style={{ fontSize: '.6rem', opacity: .6 }}>{npcs.length} known</span>
      </div>

      {['ally','neutral','foe'].map(role => {
        const group = npcs.filter(n => n.role === role)
        if (!group.length) return null
        return (
          <div key={role} style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '.6rem', letterSpacing: '.1em', color: ROLE_COLORS[role], textTransform: 'uppercase', marginBottom: '5px' }}>
              {ROLE_LABELS[role]}
            </div>
            {group.map(npc => {
              const isOpen    = expanded === npc.id
              const attitude  = getAttitude(npc)
              const attColor  = ATTITUDE_COLORS[attitude]
              const attLabel  = ATTITUDE_LABELS[attitude]

              return (
                <div key={npc.id} style={{ background: 'rgba(255,255,255,.04)', borderRadius: '8px', border: `1px solid rgba(255,255,255,.08)`, marginBottom: '5px', overflow: 'hidden' }}>
                  {/* Header */}
                  <button onClick={() => setExpanded(isOpen ? null : npc.id)} style={{
                    width: '100%', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '8px',
                    background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '.8rem', color: 'var(--parch,#e8dcc0)', fontWeight: 500 }}>{npc.name}</div>
                      {npc.location && <div style={{ fontSize: '.62rem', color: 'var(--parch3,#aaa)' }}>📍 {npc.location}</div>}
                    </div>
                    {/* Attitude pill */}
                    <span style={{ fontSize: '.55rem', padding: '2px 6px', borderRadius: '8px', background: `${attColor}20`, border: `1px solid ${attColor}50`, color: attColor, flexShrink: 0 }}>
                      {attLabel}
                    </span>
                  </button>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div style={{ padding: '0 10px 10px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
                      {npc.description && (
                        <div style={{ fontSize: '.7rem', color: 'var(--parch3,#aaa)', marginTop: '7px', lineHeight: 1.5 }}>{npc.description}</div>
                      )}

                      {/* Attitude slider */}
                      <div style={{ marginTop: '9px' }}>
                        <div style={{ fontSize: '.6rem', color: 'var(--parch3,#aaa)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '.08em' }}>Attitude</div>
                        <div style={{ display: 'flex', gap: '3px' }}>
                          {ATTITUDE_LABELS.map((label, i) => (
                            <button key={i} onClick={() => setAttitude(npc.id, i)}
                              title={label}
                              style={{
                                flex: 1, padding: '5px 0', borderRadius: '4px', fontSize: '.55rem', cursor: 'pointer',
                                border: `1px solid ${i === attitude ? ATTITUDE_COLORS[i] + '80' : 'rgba(255,255,255,.12)'}`,
                                background: i === attitude ? ATTITUDE_COLORS[i] + '20' : 'transparent',
                                color: i === attitude ? ATTITUDE_COLORS[i] : 'rgba(255,255,255,.3)',
                              }}>
                              {label.slice(0, 4)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Notes */}
                      <div style={{ marginTop: '9px' }}>
                        <div style={{ fontSize: '.6rem', color: 'var(--parch3,#aaa)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '.08em' }}>Notes</div>
                        {editingNote === npc.id ? (
                          <div>
                            <textarea
                              value={noteInput}
                              onChange={e => setNoteInput(e.target.value)}
                              placeholder="What do you know about them? What do they want?"
                              style={{
                                width: '100%', minHeight: '60px', background: 'rgba(255,255,255,.06)',
                                border: '1px solid rgba(255,255,255,.2)', borderRadius: '5px',
                                color: 'var(--parch,#e8dcc0)', fontSize: '.7rem', padding: '5px 7px',
                                resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                              }}
                              autoFocus
                            />
                            <div style={{ display: 'flex', gap: '5px', marginTop: '4px' }}>
                              <button onClick={() => saveNote(npc)} style={{ flex: 1, padding: '4px', fontSize: '.65rem', cursor: 'pointer', background: 'rgba(78,203,113,.15)', border: '1px solid rgba(78,203,113,.3)', borderRadius: '4px', color: '#4ecb71' }}>✓ Save</button>
                              <button onClick={() => setEditingNote(null)} style={{ padding: '4px 8px', fontSize: '.65rem', cursor: 'pointer', background: 'transparent', border: '1px solid rgba(255,255,255,.15)', borderRadius: '4px', color: '#888' }}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div onClick={() => startEditNote(npc)} style={{ fontSize: '.7rem', color: npc.notes ? 'var(--parch3,#aaa)' : 'rgba(255,255,255,.25)', fontStyle: npc.notes ? 'normal' : 'italic', cursor: 'pointer', padding: '4px 6px', background: 'rgba(255,255,255,.03)', borderRadius: '4px', border: '1px solid rgba(255,255,255,.06)', minHeight: '28px', lineHeight: 1.5 }}>
                            {npc.notes || 'Click to add notes…'}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '5px', marginTop: '9px' }}>
                        <button onClick={() => onTalkTo?.(npc.name)} style={{
                          flex: 1, padding: '5px', fontSize: '.68rem', cursor: 'pointer',
                          background: 'rgba(200,146,42,.1)', border: '1px solid rgba(200,146,42,.3)',
                          borderRadius: '5px', color: 'var(--gold,#c8922a)',
                        }}>
                          💬 Speak with {npc.name.split(' ')[0]}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

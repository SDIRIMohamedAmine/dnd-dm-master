// src/components/AdventureLog.js
// Searchable adventure timeline extracted from campaign messages.
// Shows level-ups, combat victories, quest completions, major events.
import { useMemo, useState } from 'react'

const EVENT_PATTERNS = [
  { type: 'levelup',  icon: '⭐', color: '#f0c040', rx: /level\s*(?:up|ed|ed to)?\s*(\d+)|you (?:are now|reach|have reached) level/i },
  { type: 'combat',   icon: '⚔️', color: '#e08060', rx: /⚔️ COMBAT ENDS|COMBAT ENDS|enemies? (?:are|is) defeated|victory|you (?:win|won|defeat)/i },
  { type: 'quest',    icon: '📜', color: '#7eb8ff', rx: /quest.*(?:complete|finished|done)|you have completed|objective.*achieved/i },
  { type: 'loot',     icon: '💎', color: '#c080ff', rx: /you (?:find|receive|discover|loot|take)\b.*(?:gp|gold|sword|ring|amulet|armor|staff|wand|scroll|gem)/i },
  { type: 'npc',      icon: '👤', color: '#4ecb71', rx: /(?:meet|encounter|greet|introduce yourself to|speak with)\s+([A-Z][a-z]+)/i },
  { type: 'location', icon: '🗺️', color: '#ffa040', rx: /you (?:arrive|enter|reach|find yourself) (?:at|in|inside)/i },
  { type: 'death',    icon: '💀', color: '#e05050', rx: /you (?:are dying|fall unconscious|are at 0|have died)|death saving/i },
  { type: 'rest',     icon: '😴', color: '#a0b0ff', rx: /(?:long|short) rest|you (?:rest|sleep|make camp)/i },
]

function classifyMessage(text) {
  for (const { type, icon, color, rx } of EVENT_PATTERNS) {
    if (rx.test(text)) return { type, icon, color }
  }
  return null
}

function extractHeadline(text, type) {
  // Extract a short meaningful line from the DM message
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 15 && l.length < 120)
  if (type === 'levelup') {
    const m = text.match(/level\s+(\d+)/i)
    return m ? `Reached Level ${m[1]}` : 'Leveled up!'
  }
  if (type === 'combat') {
    const enemy = text.match(/(?:defeated?|slain?|killed?)\s+(?:the\s+)?([A-Z][a-zA-Z\s]+?)(?:\.|,|!)/i)
    return enemy ? `Defeated ${enemy[1].trim()}` : 'Won a battle'
  }
  if (type === 'quest') return 'Quest completed'
  if (type === 'location') {
    const m = text.match(/(?:arrive|enter|reach)\s+(?:at\s+|in\s+|inside\s+)?(?:the\s+)?([A-Z][a-zA-Z\s']+?)(?:\.|,|!)/i)
    return m ? `Arrived at ${m[1].trim()}` : 'Reached a new location'
  }
  // Fallback: first interesting sentence
  return lines[0]?.slice(0, 80) + (lines[0]?.length > 80 ? '…' : '') || 'Event'
}

export default function AdventureLog({ campaignId, messages = [], character }) {
  const [filter,  setFilter]  = useState('all')
  const [search,  setSearch]  = useState('')
  const [expanded,setExpanded]= useState(null)

  // Extract key events from DM messages
  const events = useMemo(() => {
    const result = []
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      const classified = classifyMessage(msg.content)
      if (!classified) continue
      result.push({
        id:        msg.id,
        type:      classified.type,
        icon:      classified.icon,
        color:     classified.color,
        headline:  extractHeadline(msg.content, classified.type),
        full:      msg.content,
        ts:        msg.created_at ? new Date(msg.created_at) : null,
        msgIndex:  messages.indexOf(msg),
      })
    }
    return result.reverse()  // newest first
  }, [messages])

  const filtered = events.filter(e => {
    if (filter !== 'all' && e.type !== filter) return false
    if (search && !e.headline.toLowerCase().includes(search.toLowerCase()) && !e.full.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const types = ['all', ...new Set(events.map(e => e.type))]

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', height: '100%' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', letterSpacing: '.12em', color: 'var(--gold,#c8922a)', textTransform: 'uppercase', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>📜 Adventure Log</span>
        <span style={{ fontSize: '.6rem', opacity: .6 }}>{events.length} events</span>
      </div>

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search events…"
        style={{
          width: '100%', padding: '5px 9px', fontSize: '.72rem',
          background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.15)',
          borderRadius: '6px', color: 'var(--parch,#e8dcc0)', outline: 'none',
          boxSizing: 'border-box',
        }}
      />

      {/* Type filter */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px' }}>
        {types.map(t => {
          const evType = EVENT_PATTERNS.find(p => p.type === t)
          return (
            <button key={t} onClick={() => setFilter(t)} style={{
              padding: '2px 7px', fontSize: '.58rem', borderRadius: '8px', cursor: 'pointer',
              border: filter === t ? '1px solid rgba(200,146,42,.5)' : '1px solid rgba(255,255,255,.12)',
              background: filter === t ? 'rgba(200,146,42,.12)' : 'transparent',
              color: filter === t ? 'var(--gold,#c8922a)' : 'var(--parch3,#aaa)',
            }}>
              {t === 'all' ? 'All' : `${evType?.icon || ''} ${t}`}
            </button>
          )
        })}
      </div>

      {/* Events list */}
      <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {filtered.length === 0 && (
          <div style={{ fontSize: '.75rem', color: 'var(--parch3,#aaa)', fontStyle: 'italic', padding: '10px 0' }}>
            {events.length === 0 ? 'Your story is just beginning.' : 'No matching events.'}
          </div>
        )}
        {filtered.map(ev => (
          <div key={ev.id} style={{ background: 'rgba(255,255,255,.04)', borderRadius: '7px', border: '1px solid rgba(255,255,255,.07)', overflow: 'hidden' }}>
            <button onClick={() => setExpanded(expanded === ev.id ? null : ev.id)} style={{
              width: '100%', padding: '8px 10px', display: 'flex', alignItems: 'flex-start', gap: '8px',
              background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
            }}>
              <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>{ev.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.74rem', color: ev.color, fontWeight: 500, lineHeight: 1.3 }}>{ev.headline}</div>
                {ev.ts && (
                  <div style={{ fontSize: '.58rem', color: 'rgba(255,255,255,.3)', marginTop: '2px' }}>
                    {ev.ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    {' · '}Turn {ev.msgIndex + 1}
                  </div>
                )}
              </div>
            </button>
            {expanded === ev.id && (
              <div style={{ padding: '0 10px 10px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
                <div style={{ fontSize: '.68rem', color: 'var(--parch3,#aaa)', lineHeight: 1.6, marginTop: '7px', maxHeight: '160px', overflowY: 'auto' }}>
                  {ev.full.slice(0, 600)}{ev.full.length > 600 ? '…' : ''}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

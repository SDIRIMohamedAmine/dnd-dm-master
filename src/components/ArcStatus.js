// src/components/ArcStatus.js
// Shows the player a glimpse of the world's shifting story arcs
// Vague and atmospheric — doesn't spoil arcs they haven't found
import './ArcStatus.css'

const THEME_ICONS = {
  horror: '💀', political: '⚜️', mystery: '🔍',
  survival: '🌊', divine: '✝️', noir: '🗡️',
  cosmic: '🌌', war: '⚔️',
}

const STATUS_COLORS = {
  dormant:  'rgba(100,100,100,.6)',
  rising:   'rgba(200,146,42,.8)',
  dominant: 'rgba(200,60,20,.9)',
  resolved: 'rgba(78,203,113,.7)',
  failed:   'rgba(80,80,80,.5)',
}

export default function ArcStatus({ arcs, onClose }) {
  if (!arcs?.length) return null

  const dominant = arcs[0]  // already sorted by power

  return (
    <div className="arc-panel">
      <div className="arc-panel-header">
        <span className="arc-panel-title">🌍 World Events</span>
        <button className="arc-panel-close" onClick={onClose}>✕</button>
      </div>

      <div className="arc-panel-hint">
        The world moves whether you act or not. These forces shape your story.
      </div>

      <div className="arc-list">
        {arcs.map((arc, i) => {
          const isRevealed = arc.revealed
          const isDominant = i === 0
          const pct        = arc.power
          const barColor   = STATUS_COLORS[arc.status] || STATUS_COLORS.dormant

          return (
            <div key={arc.id} className={`arc-item ${isDominant ? 'dominant' : ''} ${arc.status}`}>
              <div className="arc-item-header">
                <span className="arc-theme-icon">{THEME_ICONS[arc.theme] || '⚡'}</span>
                <div className="arc-item-info">
                  {isRevealed ? (
                    <div className="arc-name">{arc.title}</div>
                  ) : (
                    <div className="arc-name unknown">
                      {isDominant ? '⚠ Something is gathering…' : '— unknown threat —'}
                    </div>
                  )}
                  <div className="arc-status-label">{arc.status}</div>
                </div>
                {isDominant && <span className="arc-dominant-badge">DOMINANT</span>}
              </div>

              {/* Power bar */}
              <div className="arc-bar-wrap">
                <div className="arc-bar" style={{ width: `${pct}%`, background: barColor }} />
              </div>

              {/* Revealed details */}
              {isRevealed && arc.description && (
                <div className="arc-description">{arc.description}</div>
              )}

              {/* Variables */}
              {isRevealed && Object.keys(arc.variables || {}).length > 0 && (
                <div className="arc-variables">
                  {Object.entries(arc.variables).map(([k, v]) => (
                    <div key={k} className="arc-var">
                      <span>{k.replace(/_/g, ' ')}</span>
                      <div className="arc-var-bar-wrap">
                        <div className="arc-var-bar" style={{ width: `${Math.min(v, 100)}%` }} />
                      </div>
                      <span className="arc-var-val">{v}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="arc-panel-footer">
        Your choices shift these forces. The dominant arc shapes the world.
      </div>
    </div>
  )
}

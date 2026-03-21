// src/pages/CampaignsPage.js
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import './CampaignsPage.css'

export default function CampaignsPage({ onSelect, onNew, onRAGSetup }) {
  const { user, signOut } = useAuth()
  const [campaigns, setCampaigns] = useState([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('campaigns')
        .select(`
          *,
          characters ( name, class, race, level ),
          messages   ( id )
        `)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })

      setCampaigns(data || [])
      setLoading(false)
    }
    load()
  }, [user.id])

  async function deleteCampaign(e, id) {
    e.stopPropagation()
    if (!window.confirm('Delete this campaign? This cannot be undone.')) return
    await supabase.from('campaigns').delete().eq('id', id)
    setCampaigns(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="campaigns-page">
      <header className="campaigns-header">
        <div className="campaigns-header-left">
          <D20 />
          <div>
            <h1 className="campaigns-title">THE DUNGEON MASTER</h1>
            <p className="campaigns-email">{user.email}</p>
          </div>
        </div>
        <div className="campaigns-header-right">
          <button className="btn-new" onClick={onNew}>+ New Campaign</button>
          <button className="btn-rag-setup" onClick={onRAGSetup}>⚙ D&amp;D Lore Setup</button>
          <button className="btn-signout" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className="campaigns-main">
        <h2 className="campaigns-section-title">Your Campaigns</h2>

        {loading && <div className="campaigns-loading">Loading your adventures…</div>}

        {!loading && campaigns.length === 0 && (
          <div className="campaigns-empty">
            <div className="campaigns-empty-icon">🎲</div>
            <p>No campaigns yet.</p>
            <p className="campaigns-empty-sub">Begin your first adventure.</p>
            <button className="btn-new-large" onClick={onNew}>+ Start a New Campaign</button>
          </div>
        )}

        <div className="campaigns-grid">
          {campaigns.map(c => {
            const char = c.characters?.[0]
            const msgCount = c.messages?.length || 0
            const updatedAt = new Date(c.updated_at).toLocaleDateString('en-US', {
              month: 'short', day: 'numeric', year: 'numeric'
            })

            return (
              <div key={c.id} className="campaign-card" onClick={() => onSelect(c.id)}>
                <div className="campaign-card-header">
                  <div className="campaign-card-title">{c.title}</div>
                  <button
                    className="campaign-delete"
                    onClick={e => deleteCampaign(e, c.id)}
                    title="Delete campaign"
                  >✕</button>
                </div>

                {char ? (
                  <div className="campaign-char">
                    <span className="campaign-char-name">{char.name}</span>
                    <span className="campaign-char-info">
                      Level {char.level} {char.race} {char.class}
                    </span>
                  </div>
                ) : (
                  <div className="campaign-char campaign-char-missing">
                    No character created yet
                  </div>
                )}

                <div className="campaign-card-footer">
                  <span className="campaign-msgs">{msgCount} messages</span>
                  <span className="campaign-date">Updated {updatedAt}</span>
                </div>
              </div>
            )
          })}
        </div>
      </main>
    </div>
  )
}

function D20() {
  return (
    <svg width="36" height="36" viewBox="0 0 100 100" fill="none"
      style={{ filter: 'drop-shadow(0 0 8px rgba(200,146,42,0.5))', flexShrink: 0 }}>
      <polygon points="50,5 95,28 95,72 50,95 5,72 5,28" fill="#2a0a00" stroke="#c8922a" strokeWidth="2.5"/>
      <polygon points="50,5 75,28 50,38 25,28"  fill="#3d1200" stroke="#c8922a" strokeWidth="1"/>
      <polygon points="50,95 75,72 50,62 25,72" fill="#1a0800" stroke="#c8922a" strokeWidth="1"/>
      <polygon points="5,28 25,28 25,72 5,72"   fill="#220e00" stroke="#c8922a" strokeWidth="1"/>
      <polygon points="95,28 75,28 75,72 95,72" fill="#220e00" stroke="#c8922a" strokeWidth="1"/>
      <text x="50" y="57" textAnchor="middle" fontFamily="serif" fontSize="26" fill="#c8922a" fontWeight="bold">20</text>
    </svg>
  )
}

// src/App.js
import { useState } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import AuthPage          from './pages/AuthPage'
import CampaignsPage     from './pages/CampaignsPage'
import CharacterCreation from './pages/CharacterCreation'
import GamePage          from './pages/GamePage'
import RAGIngestion      from './pages/RAGIngestion'
import { supabase }      from './lib/supabase'
import './App.css'

function InnerApp() {
  const { user } = useAuth()
  const [view,            setView]            = useState('campaigns')
  const [campaignId,      setCampaignId]      = useState(null)
  const [campaignTitle,   setCampaignTitle]   = useState('')
  const [campaignObj,     setCampaignObj]     = useState({})

  async function handleNewCampaign() {
    const title = `Adventure — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    const { data, error } = await supabase
      .from('campaigns').insert({ user_id: user.id, title }).select().single()
    if (error) { alert(error.message); return }
    setCampaignId(data.id)
    setCampaignTitle(data.title)
    setCampaignObj(data)
    setView('character-creation')
  }

  async function handleSelectCampaign(id) {
    const { data: camp } = await supabase.from('campaigns').select('title').eq('id', id).single()
    const { data: char } = await supabase.from('characters').select('id').eq('campaign_id', id).single()
    setCampaignId(id)
    setCampaignTitle(camp?.title || 'Adventure')
    setCampaignObj(camp || {})
    setView(char ? 'game' : 'character-creation')
  }

  async function handleCharacterComplete(charData) {
    const { error } = await supabase.from('characters')
      .insert({ ...charData, campaign_id: campaignId, user_id: user.id })
    if (error) throw error
    await supabase.from('campaigns')
      .update({ title: `${charData.name}'s Adventure` }).eq('id', campaignId)
    setCampaignTitle(`${charData.name}'s Adventure`)
    setView('game')
  }

  if (view === 'rag-setup')         return <RAGIngestion onDone={() => setView('campaigns')} />
  if (view === 'campaigns')         return <CampaignsPage onSelect={handleSelectCampaign} onNew={handleNewCampaign} onRAGSetup={() => setView('rag-setup')} />
  if (view === 'character-creation') return <CharacterCreation campaignTitle={campaignTitle} onComplete={handleCharacterComplete} onBack={() => setView('campaigns')} />
  if (view === 'game')              return <GamePage
    campaignId={campaignId}
    userId={user.id}
    campaignTitle={campaignTitle}
    campaign={campaignObj}
    onBack={() => setView('campaigns')}
    onCampaignUpdate={(updated) => { setCampaignObj(prev => ({...prev, ...updated})); if (updated.title) setCampaignTitle(updated.title) }}
  />
  return null
}

export default function App() {
  return (
    <AuthProvider>
      <RootGate />
    </AuthProvider>
  )
}

function RootGate() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--parch3)',fontFamily:'var(--font-display)',fontSize:'0.85rem',letterSpacing:'0.1em' }}>
      Loading…
    </div>
  )
  return user ? <InnerApp /> : <AuthPage />
}

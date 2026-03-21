// src/App.js — with React Router routing
import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import AuthPage          from './pages/AuthPage'
import CampaignsPage     from './pages/CampaignsPage'
import CharacterCreation from './pages/CharacterCreation'
import GamePage          from './pages/GamePage'
import RAGIngestion      from './pages/RAGIngestion'
import LibraryPage       from './pages/LibraryPage'
import { supabase }      from './lib/supabase'
import './App.css'

// ── Route-aware inner app ──────────────────────────────────
function InnerApp() {
  const { user } = useAuth()
  const navigate  = useNavigate()

  // ── New campaign ──────────────────────────────────────────
  async function handleNewCampaign() {
    const title = `Adventure — ${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'})}`
    const { data, error } = await supabase.from('campaigns').insert({ user_id:user.id, title }).select().single()
    if (error) { alert(error.message); return }
    navigate(`/campaign/${data.id}/create`)
  }

  async function handleSelectCampaign(id) {
    const { data:char } = await supabase.from('characters').select('id').eq('campaign_id',id).single()
    navigate(char ? `/campaign/${id}/play` : `/campaign/${id}/create`)
  }

  async function handleCharacterComplete(charData, campaignId) {
    const { data:camp } = await supabase.from('campaigns').select('title').eq('id',campaignId).single()
    const { error } = await supabase.from('characters').insert({ ...charData, campaign_id:campaignId, user_id:user.id })
    if (error) throw error
    await supabase.from('campaigns').update({ title:`${charData.name}'s Adventure` }).eq('id',campaignId)
    navigate(`/campaign/${campaignId}/play`)
  }

  return (
    <Routes>
      <Route path="/"              element={<Navigate to="/campaigns" replace />} />
      <Route path="/campaigns"     element={<CampaignsPage onSelect={handleSelectCampaign} onNew={handleNewCampaign} onRAGSetup={()=>navigate('/rag-setup')} onLibrary={()=>navigate('/library')} />} />
      <Route path="/rag-setup"     element={<RAGIngestion onDone={()=>navigate('/campaigns')} />} />
      <Route path="/library"       element={<LibraryPage onBack={()=>navigate('/campaigns')} />} />
      <Route path="/campaign/:id/create" element={<CreateRoute onComplete={handleCharacterComplete} onBack={()=>navigate('/campaigns')} />} />
      <Route path="/campaign/:id/play"   element={<PlayRoute onBack={()=>navigate('/campaigns')} />} />
      <Route path="*"              element={<Navigate to="/campaigns" replace />} />
    </Routes>
  )
}

function CreateRoute({ onComplete, onBack }) {
  const { id } = useParams()
  const [title, setTitle] = useState(null)

  useEffect(() => {
    supabase.from('campaigns').select('title').eq('id',id).single()
      .then(({data}) => setTitle(data?.title||'New Campaign'))
  }, [id]) // eslint-disable-line

  return (
    <CharacterCreation
      campaignTitle={title||'New Campaign'}
      onComplete={(charData) => onComplete(charData, id)}
      onBack={onBack}
    />
  )
}

function PlayRoute({ onBack }) {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate  = useNavigate()
  const [camp, setCamp] = useState(null)

  useEffect(() => {
    supabase.from('campaigns').select('*').eq('id',id).single()
      .then(({data}) => setCamp(data))
  }, [id]) // eslint-disable-line

  if (!camp) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--parch3)',fontFamily:'var(--font-display)',fontSize:'.85rem',letterSpacing:'.1em'}}>Loading…</div>

  return (
    <GamePage
      campaignId={id}
      userId={user.id}
      campaignTitle={camp.title}
      campaign={camp}
      onBack={onBack}
      onCampaignUpdate={(updated) => setCamp(prev=>({...prev,...updated}))}
    />
  )
}

// ── Root with auth gate ────────────────────────────────────
function RootGate() {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--parch3)',fontFamily:'var(--font-display)',fontSize:'.85rem',letterSpacing:'.1em'}}>
      Loading…
    </div>
  )
  if (!user) return <AuthPage />
  return <InnerApp />
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RootGate />
      </AuthProvider>
    </BrowserRouter>
  )
}

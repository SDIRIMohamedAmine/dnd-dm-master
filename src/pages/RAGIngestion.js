// src/pages/RAGIngestion.js — dnd5eapi.co version
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fetchAllFromDnd5e, CHUNKER_MAP, ALL_ENDPOINTS } from '../lib/rag'
import './RAGIngestion.css'

export default function RAGIngestion({ onDone }) {
  const [dbCount,    setDbCount]    = useState(null)
  const [typeCounts, setTypeCounts] = useState({})
  const [running,    setRunning]    = useState(false)
  const [progress,   setProgress]   = useState({ endpoint:'', loaded:0, total:0, pct:0 })
  const [log,        setLog]        = useState([])
  const [selected,   setSelected]   = useState(new Set(ALL_ENDPOINTS.map(e=>e.key)))
  const [done,       setDone]       = useState(false)
  const [clearing,   setClearing]   = useState(false)

  useEffect(() => { loadStats() }, [])

  async function loadStats() {
    const { count } = await supabase.from('knowledge_chunks').select('id',{count:'exact',head:true})
    setDbCount(count||0)
    const types = ['monster','spell','equipment','magic-item','class','subclass','race','background','feat','condition','skill','trait']
    const counts = {}
    await Promise.all(types.map(async t => {
      const { count:c } = await supabase.from('knowledge_chunks').select('id',{count:'exact',head:true}).eq('type',t)
      if (c > 0) counts[t] = c
    }))
    setTypeCounts(counts)
  }

  function addLog(msg, type='info') {
    setLog(prev => [...prev, { time: new Date().toLocaleTimeString(), msg, type }])
  }

  async function clearAndRebuild() {
    setClearing(true)
    addLog('Clearing old knowledge_chunks table…', 'warn')
    // Delete all rows (Supabase requires a filter, use truthy condition)
    const { error } = await supabase.from('knowledge_chunks').delete().neq('chunk_id','__never__')
    if (error) {
      // Try alternate approach
      const { error: e2 } = await supabase.from('knowledge_chunks').delete().gte('id', 0)
      if (e2) addLog(`Clear error: ${e2.message}`, 'error')
      else addLog('✓ Old data cleared', 'success')
    } else {
      addLog('✓ Old data cleared', 'success')
    }
    setClearing(false)
    await runIngestion()
  }

  async function runIngestion() {
    setRunning(true)
    setLog(prev => [...prev, { time: new Date().toLocaleTimeString(), msg: 'Starting ingestion from dnd5eapi.co…', type:'info' }])
    setDone(false)

    let total = 0, errors = 0

    for (const key of selected) {
      const chunker = CHUNKER_MAP[key]
      if (!chunker) { addLog(`No chunker for ${key}`, 'warn'); continue }

      setProgress({ endpoint:key, loaded:0, total:0, pct:0 })
      addLog(`Fetching ${key} from dnd5eapi.co…`)

      try {
        const items = await fetchAllFromDnd5e(key, (loaded, total_) => {
          setProgress({ endpoint:key, loaded, total:total_, pct:Math.round((loaded/total_)*100) })
        })

        if (!items.length) { addLog(`  — ${key}: empty`, 'warn'); continue }

        const chunks = items.map(item => {
          try { return chunker(item) } catch { return null }
        }).filter(Boolean)

        addLog(`  → ${items.length} items → ${chunks.length} chunks. Saving…`)

        const BATCH = 100
        let saved = 0
        for (let i = 0; i < chunks.length; i += BATCH) {
          const batch = chunks.slice(i, i+BATCH).map(c => ({
            chunk_id: c.id, type: c.type, name: c.name, source: c.source || 'dnd5eapi', content: c.text,
          }))
          const { error } = await supabase.from('knowledge_chunks')
            .upsert(batch, { onConflict: 'chunk_id' })
          if (error) { addLog(`  ✗ Batch error: ${error.message}`, 'error'); errors++ }
          else saved += batch.length
          setProgress({ endpoint:key, loaded:i+BATCH, total:chunks.length, pct:Math.round(((i+BATCH)/chunks.length)*100) })
        }
        total += saved
        addLog(`  ✓ ${key} — ${saved} chunks`, 'success')

      } catch (err) {
        addLog(`  ✗ ${key}: ${err.message}`, 'error'); errors++
      }
    }

    setProgress({ endpoint:'', loaded:0, total:0, pct:0 })
    const { count } = await supabase.from('knowledge_chunks').select('id',{count:'exact',head:true})
    setDbCount(count||0)
    await loadStats()
    addLog(`\n✅ Done! ${(count||0).toLocaleString()} chunks in database.${errors?` (${errors} errors)`:''}`, 'success')
    addLog('DM now uses real dnd5eapi data for every monster, spell, and item.', 'info')
    setRunning(false); setDone(true)
  }

  async function verifyData() {
    addLog('Verifying key entries…')
    const tests = [
      { type:'monster',   name:'Goblin',       fields:['/CR:/','/HP:/'] },
      { type:'monster',   name:'Adult Red Dragon', fields:['/CR:/','/Actions:/'] },
      { type:'spell',     name:'Fireball',     fields:['/Level:/','/Damage:/'] },
      { type:'equipment', name:'Longsword',    fields:['/Cost:/','/Damage:/'] },
      { type:'equipment', name:'Chain Mail',   fields:['/Cost:/','/AC:/'] },
    ]
    for (const t of tests) {
      const { data } = await supabase.from('knowledge_chunks').select('name,content')
        .eq('type',t.type).ilike('name',t.name).limit(1)
      if (data?.[0]) {
        const checks = t.fields.map(f => new RegExp(f.slice(1,-1)).test(data[0].content) ? '✓' : '✗')
        addLog(`  ${checks.join('')} ${data[0].name}: ${data[0].content.slice(0,80)}…`, checks.every(c=>c==='✓')?'success':'warn')
      } else {
        addLog(`  ✗ ${t.name} (${t.type}) not found`, 'error')
      }
    }
  }

  return (
    <div className="rag-setup-page">
      <div className="rag-setup-card">
        <button className="rag-back" onClick={onDone}>← Back to Campaigns</button>
        <h1 className="rag-setup-title">📚 D&D Knowledge Base</h1>
        <p className="rag-setup-sub">
          Populates your database from <strong>dnd5eapi.co</strong> — structured JSON with real prices, 
          damage dice, AC formulas, spell scaling, and monster stat blocks. 
          Run "Clear & Rebuild" if you had old Open5e data.
        </p>

        {dbCount !== null && (
          <div className={`rag-db-status ${dbCount>0?'has-data':'empty'}`}>
            {dbCount > 0 ? (
              <div>
                <div>✓ <strong>{dbCount.toLocaleString()}</strong> knowledge chunks in database</div>
                <div className="rag-type-grid">
                  {Object.entries(typeCounts).map(([t,c])=>(
                    <span key={t} className="rag-type-pill">{t}: {c}</span>
                  ))}
                </div>
              </div>
            ) : '⚠ Database is empty — run ingestion to enable the full DM.'}
          </div>
        )}

        {running && progress.endpoint && (
          <div className="rag-progress">
            <div className="rag-progress-label">{progress.endpoint} — {progress.loaded}/{progress.total} ({progress.pct}%)</div>
            <div className="rag-progress-bar"><div className="rag-progress-fill" style={{width:`${progress.pct}%`}}/></div>
          </div>
        )}

        <div className="rag-sources">
          <div className="rag-sources-header">
            <span className="rag-label">Select sources ({[...selected].length}/{ALL_ENDPOINTS.length})</span>
            <button className="rag-link" onClick={()=>setSelected(new Set(ALL_ENDPOINTS.map(e=>e.key)))}>All</button>
            <button className="rag-link" onClick={()=>setSelected(new Set())}>None</button>
          </div>
          <div className="rag-source-grid">
            {ALL_ENDPOINTS.map(ep=>(
              <label key={ep.key} className={`rag-source-chip ${selected.has(ep.key)?'on':''}`}>
                <input type="checkbox" checked={selected.has(ep.key)} onChange={()=>setSelected(prev=>{
                  const n=new Set(prev); n.has(ep.key)?n.delete(ep.key):n.add(ep.key); return n
                })}/>
                <span>{ep.icon} {ep.label}</span>
                <span className="rag-chip-desc">{ep.desc}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="rag-actions">
          <button className="rag-run-btn" onClick={()=>runIngestion()} disabled={running||clearing||!selected.size}>
            {running ? '⏳ Importing…' : dbCount>0 ? '🔄 Update / Re-run' : '⬇ Run Ingestion'}
          </button>
          <button className="rag-run-btn" style={{background:'rgba(200,60,20,.15)',borderColor:'rgba(200,60,20,.4)',color:'#e08060'}}
            onClick={clearAndRebuild} disabled={running||clearing||!selected.size}
            title="Delete all old Open5e data and replace with dnd5eapi">
            {clearing ? '🗑 Clearing…' : '🗑 Clear & Rebuild'}
          </button>
          {dbCount>0 && (
            <button className="rag-verify-btn" onClick={verifyData} disabled={running}>
              🔍 Verify
            </button>
          )}
        </div>

        {log.length>0 && (
          <div className="rag-log">
            {log.map((l,i)=>(
              <div key={i} className={`rag-log-line ${l.type||''}`}>
                <span className="rag-log-time">{l.time}</span>
                <span>{l.msg}</span>
              </div>
            ))}
          </div>
        )}
        {done && <button className="rag-done-btn" onClick={onDone}>✓ Done — Go to Campaigns</button>}

        <div className="rag-info">
          <strong>Why dnd5eapi.co?</strong> Structured JSON with real costs (Longsword: 15 gp), 
          exact damage formulas, spell scaling tables, and complete monster stat blocks. 
          Every item the shop shows and every creature the DM spawns uses real SRD data.
        </div>
      </div>
    </div>
  )
}

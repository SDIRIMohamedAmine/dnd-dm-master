import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fetchAllFromOpen5e, CHUNKER_MAP, ALL_ENDPOINTS } from '../lib/rag'
import './RAGIngestion.css'

export default function RAGIngestion({ onDone }) {
  const [dbCount,   setDbCount]   = useState(null)
  const [typeCounts,setTypeCounts]= useState({})
  const [running,   setRunning]   = useState(false)
  const [progress,  setProgress]  = useState({ endpoint:'', loaded:0, total:0, pct:0 })
  const [log,       setLog]       = useState([])
  const [selected,  setSelected]  = useState(new Set(ALL_ENDPOINTS.map(e=>e.key)))
  const [done,      setDone]      = useState(false)

  useEffect(()=>{ loadStats() },[])

  async function loadStats() {
    const {count}=await supabase.from('knowledge_chunks').select('id',{count:'exact',head:true})
    setDbCount(count||0)
    const types=['monster','spell','magic-item','weapon','armor','background','class','race','feat','condition','rule']
    const counts={}
    await Promise.all(types.map(async t=>{const {count:c}=await supabase.from('knowledge_chunks').select('id',{count:'exact',head:true}).eq('type',t);if(c>0)counts[t]=c}))
    setTypeCounts(counts)
  }

  function addLog(msg,type='info'){setLog(prev=>[...prev,{time:new Date().toLocaleTimeString(),msg,type}])}

  async function runIngestion() {
    setRunning(true);setLog([]);setDone(false)
    addLog('Starting D&D lore ingestion from Open5e…')
    let total=0,errors=0
    for(const key of selected){
      const chunker=CHUNKER_MAP[key]
      if(!chunker){addLog(`No chunker for ${key}`,'warn');continue}
      setProgress({endpoint:key,loaded:0,total:0,pct:0})
      addLog(`Fetching ${key}…`)
      try{
        const items=await fetchAllFromOpen5e(key,(loaded,count)=>{setProgress({endpoint:key,loaded,total:count,pct:Math.round((loaded/count)*100)})})
        if(!items.length){addLog(`  — ${key}: empty`,'warn');continue}
        const chunks=items.map(item=>{try{return chunker(item)}catch{return null}}).filter(Boolean)
        addLog(`  → ${items.length} items → ${chunks.length} chunks. Saving…`)
        const BATCH=100;let saved=0
        for(let i=0;i<chunks.length;i+=BATCH){
          const batch=chunks.slice(i,i+BATCH).map(c=>({chunk_id:c.id,type:c.type,name:c.name,source:c.source||'srd',content:c.text}))
          const {error}=await supabase.from('knowledge_chunks').upsert(batch,{onConflict:'chunk_id'})
          if(error){addLog(`  ✗ ${error.message}`,'error');errors++}else saved+=batch.length
          setProgress({endpoint:key,loaded:i+BATCH,total:chunks.length,pct:Math.round(((i+BATCH)/chunks.length)*100)})
        }
        total+=saved;addLog(`  ✓ ${key} — ${saved} chunks`,'success')
      }catch(err){addLog(`  ✗ ${key}: ${err.message}`,'error');errors++}
    }
    setProgress({endpoint:'',loaded:0,total:0,pct:0})
    const {count}=await supabase.from('knowledge_chunks').select('id',{count:'exact',head:true})
    setDbCount(count||0);await loadStats()
    addLog(`\n✅ Done! ${(count||0).toLocaleString()} total chunks.${errors?` (${errors} errors)`:''}`, 'success')
    setRunning(false);setDone(true)
  }

  async function verifyMonsters() {
    addLog('Verifying monster coverage…')
    for(const name of ['Wolf','Goblin','Orc','Dragon','Troll','Vampire']){
      const {data}=await supabase.from('knowledge_chunks').select('name,content').eq('type','monster').ilike('name',name).limit(1)
      if(data?.[0]){
        const hp=data[0].content.match(/HP:\s*(\d+)/)?.[1]||'?'
        const ac=data[0].content.match(/AC:\s*(\d+)/)?.[1]||'?'
        const cr=data[0].content.match(/CR:\s*([^\s|]+)/)?.[1]||'?'
        addLog(`  ✓ ${data[0].name}: HP ${hp}, AC ${ac}, CR ${cr}`,'success')
      } else addLog(`  ✗ ${name} NOT FOUND`,'error')
    }
  }

  return (
    <div className="rag-setup-page">
      <div className="rag-setup-card">
        <button className="rag-back" onClick={onDone}>← Back</button>
        <h1 className="rag-setup-title">📚 D&D Knowledge Base Setup</h1>
        <p className="rag-setup-sub">Populate Supabase with complete D&D 5e SRD from Open5e. Run once — safe to re-run.</p>
        {dbCount!==null&&(
          <div className={`rag-db-status ${dbCount>0?'has-data':'empty'}`}>
            {dbCount>0?(<div><div>✓ <strong>{dbCount.toLocaleString()}</strong> chunks in database</div><div className="rag-type-grid">{Object.entries(typeCounts).map(([t,c])=><span key={t} className="rag-type-pill">{t}: {c}</span>)}</div></div>):'⚠ Database is empty — run ingestion.'}
          </div>
        )}
        {running&&progress.endpoint&&(
          <div className="rag-progress">
            <div className="rag-progress-label">{progress.endpoint} — {progress.loaded}/{progress.total} ({progress.pct}%)</div>
            <div className="rag-progress-bar"><div className="rag-progress-fill" style={{width:`${progress.pct}%`}}/></div>
          </div>
        )}
        <div className="rag-sources">
          <div className="rag-sources-header">
            <span className="rag-label">Sources ({[...selected].length}/{ALL_ENDPOINTS.length})</span>
            <button className="rag-link" onClick={()=>setSelected(new Set(ALL_ENDPOINTS.map(e=>e.key)))}>All</button>
            <button className="rag-link" onClick={()=>setSelected(new Set())}>None</button>
          </div>
          <div className="rag-source-grid">
            {ALL_ENDPOINTS.map(ep=>(
              <label key={ep.key} className={`rag-source-chip ${selected.has(ep.key)?'on':''}`}>
                <input type="checkbox" checked={selected.has(ep.key)} onChange={()=>setSelected(prev=>{const n=new Set(prev);n.has(ep.key)?n.delete(ep.key):n.add(ep.key);return n})}/>
                <span>{ep.icon} {ep.label}</span>
                <span className="rag-chip-desc">{ep.desc}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="rag-actions">
          <button className="rag-run-btn" onClick={runIngestion} disabled={running||!selected.size}>
            {running?'⏳ Importing…':dbCount>0?'🔄 Re-run / Update':'⬇ Run Ingestion'}
          </button>
          {dbCount>0&&<button className="rag-verify-btn" onClick={verifyMonsters} disabled={running}>🔍 Verify</button>}
        </div>
        {log.length>0&&(
          <div className="rag-log">
            {log.map((l,i)=><div key={i} className={`rag-log-line ${l.type||''}`}><span className="rag-log-time">{l.time}</span><span>{l.msg}</span></div>)}
          </div>
        )}
        {done&&<button className="rag-done-btn" onClick={onDone}>✓ Done — Go to Campaigns</button>}
      </div>
    </div>
  )
}

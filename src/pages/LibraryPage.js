// src/pages/LibraryPage.js — SRD Reference Library
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import './LibraryPage.css'

const TYPES = [
  { key:'',          label:'All',         icon:'📚' },
  { key:'monster',   label:'Monsters',    icon:'🐉' },
  { key:'spell',     label:'Spells',      icon:'✨' },
  { key:'weapon',    label:'Weapons',     icon:'⚔️' },
  { key:'armor',     label:'Armor',       icon:'🛡️' },
  { key:'magic-item',label:'Magic Items', icon:'💍' },
  { key:'class',     label:'Classes',     icon:'🧙' },
  { key:'race',      label:'Races',       icon:'🧝' },
  { key:'background',label:'Backgrounds', icon:'📜' },
  { key:'feat',      label:'Feats',       icon:'⭐' },
  { key:'condition', label:'Conditions',  icon:'🌀' },
]

function parseMonsterCard(text, name) {
  const get  = (rx) => text.match(rx)?.[1]?.trim() || null
  const type = get(/Type:\s*([^|]+)/) || ''
  const size = get(/Size:\s*([^|]+)/) || ''
  const cr   = get(/CR:\s*([^\s|,\n]+)/) || '?'
  const ac   = get(/AC:\s*(\d+)/) || '?'
  const hp   = get(/HP:\s*(\d+)/) || '?'
  const hpDice = get(/HP:\s*\d+\s*\(([^)]+)\)/) || ''
  const xp   = get(/XP:\s*(\d+)/) || '0'
  const str_ = get(/STR\s+(\d+)/) || '10'
  const dex  = get(/DEX\s+(\d+)/) || '10'
  const con  = get(/CON\s+(\d+)/) || '10'
  const int_ = get(/INT\s+(\d+)/) || '10'
  const wis  = get(/WIS\s+(\d+)/) || '10'
  const cha  = get(/CHA\s+(\d+)/) || '10'
  const langs = get(/Languages:\s*([^\n]+)/) || 'none'
  const senses = get(/Senses:\s*([^\n]+)/) || ''
  const dr   = get(/Damage Resistances:\s*([^\n]+)/) || 'None'
  const di   = get(/Damage Immunities:\s*([^\n]+)/) || 'None'
  const dv   = get(/Damage Vulnerabilities:\s*([^\n]+)/) || 'None' // may not exist
  const ci   = get(/Condition Immunities:\s*([^\n]+)/) || 'None'

  // Extract actions block
  const actSection = text.match(/\nActions:\n([\s\S]+?)(?:\nReactions:|$)/)?.[1] || ''
  const actions = [...actSection.matchAll(/•\s*([^:]+):\s*([^\n•]+)/g)].map(m=>({ name:m[1].trim(), desc:m[2].trim() }))

  const specSection = text.match(/\nSpecial Abilities:\n([\s\S]+?)(?:\nActions:|$)/)?.[1] || ''
  const specials = [...specSection.matchAll(/•\s*([^:]+):\s*([^\n•]+)/g)].map(m=>({ name:m[1].trim(), desc:m[2].trim() }))

  // HP range from dice
  let hpMin='?', hpMax='?', hpAvg=hp
  const diceM = hpDice.match(/(\d+)d(\d+)([+-]\d+)?/)
  if(diceM){
    const cnt=parseInt(diceM[1]), sides=parseInt(diceM[2]), bonus=parseInt(diceM[3]||0)
    hpMin = cnt+bonus; hpMax = cnt*sides+bonus; hpAvg = Math.floor(cnt*(sides+1)/2)+bonus
  }

  return { name, type:type.trim(), size:size.trim(), cr, ac, hp, hpMin, hpMax, hpAvg, hpDice, xp,
    str:str_, dex, con, int:int_, wis, cha, langs, senses, dr, di, dv, ci, actions, specials }
}

function parseSpellCard(text, name) {
  const get = (rx) => text.match(rx)?.[1]?.trim() || null
  const level = get(/Level:\s*([^\n]+)/) || '?'
  const castTime = get(/Casting Time:\s*([^|]+)/) || '?'
  const range_ = get(/Range:\s*([^|]+)/) || '?'
  const duration = get(/Duration:\s*([^\n]+)/) || '?'
  const components = get(/Components:\s*([^\n]+)/) || '?'
  const concentration = /Concentration: Yes/.test(text)
  const ritual = /Ritual: Yes/.test(text)
  const classes = get(/Classes:\s*([^\n]+)/) || '?'
  const descStart = text.indexOf('\n', text.indexOf('Classes:')) + 1
  const desc = text.slice(descStart).replace(/At Higher Levels:.*/s,'').trim()
  const higher = get(/At Higher Levels:\s*([\s\S]+?)$/) || ''
  return { name, level, castTime, range:range_, duration, components, concentration, ritual, classes, desc, higher }
}

function parseEquipCard(text, name, type) {
  const get = (rx) => text.match(rx)?.[1]?.trim() || null
  const category = get(/Category:\s*([^\n]+)/) || type
  const cost     = get(/Cost:\s*([^\n|]+)/) || '?'
  const weight   = get(/Weight:\s*([^\n]+)/) || '?'
  const damage   = get(/Damage:\s*([^\n]+)/) || null
  const ac       = get(/AC:\s*([^\n]+)/) || null
  const props    = get(/Properties:\s*([^\n]+)/) || null
  const descM    = text.match(/\n([A-Z][^.]{10,200}\.)/)
  const desc     = descM?.[1] || ''
  return { name, category, cost, weight, damage, ac, props, desc }
}

function parseMagicItem(text, name) {
  const get = (rx) => text.match(rx)?.[1]?.trim() || null
  const rarity  = get(/Rarity:\s*([^\n|]+)/) || '?'
  const type_   = get(/Type:\s*([^\n|]+)/) || '?'
  const attune  = /Attunement: Required/.test(text)
  const descStart = text.indexOf('\n', text.indexOf(attune?'Attunement':type_||rarity)) + 1
  const desc = text.slice(Math.max(descStart, text.indexOf('\n')+1)).trim()
  return { name, rarity, type:type_, attune, desc }
}

function StatBlock({ label, value, mod }) {
  const m = Math.floor((parseInt(value||10)-10)/2)
  return (
    <div className="lib-stat">
      <div className="lib-stat-label">{label}</div>
      <div className="lib-stat-value">{value}</div>
      <div className="lib-stat-mod">{m>=0?`+${m}`:m}</div>
    </div>
  )
}

function MonsterCard({ data }) {
  return (
    <div className="lib-card-full">
      <div className="lib-card-hero">
        <div>
          <h2 className="lib-card-title">{data.name}</h2>
          <div className="lib-card-subtitle">CR {data.cr} • {data.size} {data.type}</div>
        </div>
        <div className="lib-card-badges">
          <div className="lib-badge hp">HP {data.hpMin}–{data.hpMax}<span>(Avg: {data.hpAvg})</span></div>
          <div className="lib-badge ac">AC {data.ac}</div>
          <div className="lib-badge xp">XP {parseInt(data.xp).toLocaleString()}</div>
        </div>
      </div>

      <div className="lib-section-grid">
        <div className="lib-section">
          <div className="lib-section-title">Ability Scores</div>
          <div className="lib-stat-row">
            {[['STR',data.str],['DEX',data.dex],['CON',data.con],['INT',data.int],['WIS',data.wis],['CHA',data.cha]].map(([l,v])=>(
              <StatBlock key={l} label={l} value={v} />
            ))}
          </div>
        </div>

        <div className="lib-section">
          <div className="lib-section-title">Defenses</div>
          <div className="lib-detail-grid">
            <div className="lib-detail-row"><span>Size</span><span>{data.size}</span></div>
            <div className="lib-detail-row"><span>Type</span><span>{data.type}</span></div>
            <div className="lib-detail-row"><span>CR</span><span>{data.cr}</span></div>
            <div className="lib-detail-row"><span>XP</span><span>{parseInt(data.xp).toLocaleString()}</span></div>
            <div className="lib-detail-row"><span>Languages</span><span>{data.langs}</span></div>
            <div className="lib-detail-row warn"><span>Vulnerabilities</span><span>{data.dv}</span></div>
            <div className="lib-detail-row"><span>Resistances</span><span>{data.dr}</span></div>
            <div className="lib-detail-row"><span>Immunities</span><span>{data.di}</span></div>
            <div className="lib-detail-row"><span>Cond. Immunities</span><span>{data.ci}</span></div>
            {data.senses&&<div className="lib-detail-row"><span>Senses</span><span>{data.senses}</span></div>}
          </div>
        </div>
      </div>

      {data.specials.length>0&&(
        <div className="lib-section">
          <div className="lib-section-title">Special Abilities</div>
          {data.specials.map((a,i)=>(
            <div key={i} className="lib-action"><strong>{a.name}.</strong> {a.desc}</div>
          ))}
        </div>
      )}

      {data.actions.length>0&&(
        <div className="lib-section">
          <div className="lib-section-title">Actions</div>
          {data.actions.map((a,i)=>(
            <div key={i} className="lib-action"><strong>{a.name}.</strong> {a.desc}</div>
          ))}
        </div>
      )}
    </div>
  )
}

function SpellCard({ data }) {
  return (
    <div className="lib-card-full">
      <div className="lib-card-hero">
        <div>
          <h2 className="lib-card-title">{data.name}</h2>
          <div className="lib-card-subtitle">{data.level}</div>
        </div>
        <div className="lib-card-badges">
          {data.concentration&&<div className="lib-badge conc">Concentration</div>}
          {data.ritual&&<div className="lib-badge ritual">Ritual</div>}
        </div>
      </div>
      <div className="lib-detail-grid">
        <div className="lib-detail-row"><span>Casting Time</span><span>{data.castTime}</span></div>
        <div className="lib-detail-row"><span>Range</span><span>{data.range}</span></div>
        <div className="lib-detail-row"><span>Duration</span><span>{data.duration}</span></div>
        <div className="lib-detail-row"><span>Components</span><span>{data.components}</span></div>
        <div className="lib-detail-row"><span>Classes</span><span>{data.classes}</span></div>
      </div>
      <div className="lib-section">
        <div className="lib-desc">{data.desc}</div>
        {data.higher&&<div className="lib-higher"><strong>At Higher Levels.</strong> {data.higher}</div>}
      </div>
    </div>
  )
}

function GenericCard({ data, type }) {
  return (
    <div className="lib-card-full">
      <div className="lib-card-hero">
        <div>
          <h2 className="lib-card-title">{data.name}</h2>
          <div className="lib-card-subtitle">{data.category||data.type||type}</div>
        </div>
        {(data.cost||data.rarity)&&(
          <div className="lib-card-badges">
            {data.cost&&<div className="lib-badge xp">{data.cost}</div>}
            {data.rarity&&<div className="lib-badge conc">{data.rarity}</div>}
            {data.attune&&<div className="lib-badge ritual">Attunement</div>}
          </div>
        )}
      </div>
      <div className="lib-detail-grid">
        {data.weight&&data.weight!=='?'&&<div className="lib-detail-row"><span>Weight</span><span>{data.weight}</span></div>}
        {data.damage&&<div className="lib-detail-row"><span>Damage</span><span>{data.damage}</span></div>}
        {data.ac&&<div className="lib-detail-row"><span>AC</span><span>{data.ac}</span></div>}
        {data.props&&<div className="lib-detail-row"><span>Properties</span><span>{data.props}</span></div>}
      </div>
      {(data.desc||data.type)&&(
        <div className="lib-section">
          <div className="lib-desc">{data.desc||''}</div>
        </div>
      )}
    </div>
  )
}

export default function LibraryPage({ onBack }) {
  const [activeType,  setActiveType]  = useState('')
  const [search,      setSearch]      = useState('')
  const [results,     setResults]     = useState([])
  const [selected,    setSelected]    = useState(null)
  const [loading,     setLoading]     = useState(false)
  const [page,        setPage]        = useState(0)
  const [hasMore,     setHasMore]     = useState(false)
  const PAGE_SIZE = 40

  const fetchItems = useCallback(async (type, q, pg) => {
    setLoading(true)
    let query = supabase.from('knowledge_chunks').select('chunk_id,type,name,content')
    if (type)  query = query.eq('type', type)
    if (q)     query = query.ilike('name', `%${q}%`)
    query = query.order('name').range(pg*PAGE_SIZE, (pg+1)*PAGE_SIZE-1)
    const { data } = await query
    setLoading(false)
    setHasMore((data?.length||0) === PAGE_SIZE)
    return data || []
  }, [])

  useEffect(() => {
    setPage(0); setSelected(null)
    fetchItems(activeType, search, 0).then(setResults)
  }, [activeType, search, fetchItems])

  function loadMore() {
    const next = page+1
    setPage(next)
    fetchItems(activeType, search, next).then(more => setResults(prev=>[...prev,...more]))
  }

  function renderCard(row) {
    const text = row.content
    if (row.type==='monster')    return <MonsterCard    key={row.chunk_id} data={parseMonsterCard(text, row.name)} />
    if (row.type==='spell')      return <SpellCard      key={row.chunk_id} data={parseSpellCard(text, row.name)} />
    if (row.type==='weapon')     return <GenericCard    key={row.chunk_id} data={parseEquipCard(text,row.name,'weapon')} type="weapon" />
    if (row.type==='armor')      return <GenericCard    key={row.chunk_id} data={parseEquipCard(text,row.name,'armor')}  type="armor"  />
    if (row.type==='magic-item') return <GenericCard    key={row.chunk_id} data={parseMagicItem(text,row.name)} type="magic-item" />
    return <GenericCard key={row.chunk_id} data={{ name:row.name, desc:text.split('\n').slice(1).join(' ').slice(0,300) }} type={row.type} />
  }

  const selectedRow = selected ? results.find(r=>r.chunk_id===selected) : null

  return (
    <div className="lib-page">
      {/* Sidebar */}
      <div className="lib-sidebar">
        <button className="lib-back-btn" onClick={onBack}>← Back</button>
        <div className="lib-logo">📖 SRD Library</div>
        <div className="lib-search-wrap">
          <input className="lib-search" placeholder="Search…" value={search}
            onChange={e=>{setSearch(e.target.value)}} />
        </div>
        <div className="lib-type-list">
          {TYPES.map(t=>(
            <button key={t.key} className={`lib-type-btn ${activeType===t.key?'active':''}`}
              onClick={()=>setActiveType(t.key)}>
              <span>{t.icon}</span><span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Results list */}
      <div className="lib-list-panel">
        <div className="lib-list-header">
          {search ? `"${search}"` : TYPES.find(t=>t.key===activeType)?.label||'All Entries'}
        </div>
        <div className="lib-list">
          {results.map(row=>(
            <button key={row.chunk_id} className={`lib-list-item ${selected===row.chunk_id?'selected':''}`}
              onClick={()=>setSelected(selected===row.chunk_id?null:row.chunk_id)}>
              <span className="lib-list-icon">{TYPES.find(t=>t.key===row.type)?.icon||'📄'}</span>
              <div className="lib-list-info">
                <span className="lib-list-name">{row.name}</span>
                <span className="lib-list-type">{row.type}</span>
              </div>
            </button>
          ))}
          {loading&&<div className="lib-loading">Loading…</div>}
          {!loading&&results.length===0&&<div className="lib-empty">No entries found. Run the Knowledge Base setup first if the library is empty.</div>}
          {hasMore&&!loading&&<button className="lib-more-btn" onClick={loadMore}>Load more…</button>}
        </div>
      </div>

      {/* Detail panel */}
      <div className="lib-detail-panel">
        {!selectedRow ? (
          <div className="lib-detail-empty">
            <div className="lib-detail-empty-icon">📖</div>
            <div>Select an entry to view its full stat block</div>
          </div>
        ) : (
          <div className="lib-detail-scroll">
            {renderCard(selectedRow)}
          </div>
        )}
      </div>
    </div>
  )
}
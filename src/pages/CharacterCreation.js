// src/pages/CharacterCreation.js — fully rewritten
import { useState, useEffect } from 'react'
import { callAI } from '../lib/openrouter'
import { CLASS_SPELLS_BY_LEVEL } from '../lib/classData'
import {
  RACES, CLASSES, BACKGROUNDS, ALIGNMENTS,
  STANDARD_ARRAY, STAT_NAMES, STAT_LABELS, STAT_DESC,
  applyRacialASI, getClassFeatures, buildStartingEquipment, getStartingGold, calcMaxHP,
} from '../lib/dndData'
import './CharacterCreation.css'

const GENDERS  = [
  { label:'👨 Male', val:'Male' },
  { label:'👩 Female', val:'Female' },
  { label:'🧑 Non-binary', val:'Non-binary' },
  { label:'✨ Other', val:'Other' },
]

function statMod(score) {
  const m = Math.floor((score - 10) / 2)
  return m >= 0 ? `+${m}` : `${m}`
}

function getCantrips(className) {
  return (CLASS_SPELLS_BY_LEVEL[className]?.cantrip || []).map(s => `${s} (cantrip)`)
}
function getLevel1Spells(className) {
  const data = CLASS_SPELLS_BY_LEVEL[className]
  if (!data) return []
  return [...(data.cantrip||[]).map(s=>`${s} (cantrip)`), ...(data[1]||[])]
}

export default function CharacterCreation({ campaignTitle, onComplete, onBack }) {
  const [step,      setStep]      = useState(0)
  const [saving,    setSaving]    = useState(false)
  const [error,     setError]     = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  const [form, setForm] = useState({
    name:'', race:'', gender:'', class:'', subclass:'',
    background:'', alignment:'',
    assigned:{}, // statName → value
    equipment:[], spells:[],
    personality_traits:'', ideals:'', bonds:'', flaws:'',
    origin_story:'',
    // Computed on finish:
    strength:10, dexterity:10, constitution:10,
    intelligence:10, wisdom:10, charisma:10,
  })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const clsData  = CLASSES.find(c => c.name === form.class)
  const raceData = RACES.find(r => r.name === form.race)
  const bgData   = BACKGROUNDS.find(b => b.name === form.background)
  const isCaster = !!clsData?.spellcaster

  // Steps depend on whether caster
  const STEPS    = ['Name & Race','Class','Subclass','Background','Alignment','Stats','Equipment', ...(isCaster?['Spells']:[]), 'Personality','Origin']
  const isLast   = step === STEPS.length - 1
  const stepName = STEPS[step] || ''

  // Keep step in bounds if class changes (caster ↔ non-caster)
  useEffect(() => {
    if (step >= STEPS.length) setStep(STEPS.length - 1)
  }, [STEPS.length]) // eslint-disable-line

  // ── Validation ─────────────────────────────────────────
  function canAdvance() {
    if (stepName==='Name & Race')  return form.name.trim().length>1 && !!form.race && !!form.gender
    if (stepName==='Class')        return !!form.class
    if (stepName==='Subclass')     return true
    if (stepName==='Background')   return !!form.background
    if (stepName==='Alignment')    return !!form.alignment
    if (stepName==='Stats')        return Object.keys(form.assigned).length===6
    if (stepName==='Equipment')    return true  // auto-equipped from class; extras optional
    if (stepName==='Spells')       return true  // spells optional
    if (stepName==='Personality')  return true
    if (stepName==='Origin')       return true
    return true
  }

  // ── Stat assignment ────────────────────────────────────
  const assignedVals = Object.values(form.assigned)
  const usedCounts   = {}
  for (const v of assignedVals) usedCounts[v] = (usedCounts[v]||0)+1
  const availableVals = STANDARD_ARRAY.filter(v => {
    const needed = STANDARD_ARRAY.filter(x=>x===v).length
    return (usedCounts[v]||0) < needed
  })

  function assignStat(stat, value) {
    const next = { ...form.assigned }
    if (value === null) { delete next[stat] }
    else { next[stat] = value }
    set('assigned', next)
  }

  // Get stats with racial bonuses applied for preview
  function getStatWithBonus(stat) {
    const base  = form.assigned[stat] || 10
    const bonus = raceData?.asi?.[stat] || 0
    return base + bonus
  }

  // ── Equipment step — class default + extras from DB ────
  // Show class starting equipment as a reference; let player pick spells
  const classEquipment = clsData ? buildStartingEquipment(form.class, form.background) : []

  // ── AI generators ──────────────────────────────────────
  async function aiGeneratePersonality() {
    setAiLoading(true)
    try {
      const ps = form.gender==='Male'?'he/him':form.gender==='Female'?'she/her':'they/them'
      const p  = `Generate D&D character personality for ${form.name}, a ${form.gender} ${form.race} ${form.class} (${form.background}, ${form.alignment}). Pronouns: ${ps}.
Return ONLY valid JSON with keys: personality_traits, ideals, bonds, flaws. One sentence each. Use correct pronouns. No markdown.`
      const raw    = await callAI([{role:'user',content:p}], 300)
      const parsed = JSON.parse(raw.replace(/```json|```/g,'').trim())
      setForm(prev => ({...prev,...parsed}))
    } catch(e){ console.warn('AI personality failed',e) }
    finally { setAiLoading(false) }
  }

  async function aiGenerateOrigin() {
    setAiLoading(true)
    try {
      const sub  = form.gender==='Male'?'he':form.gender==='Female'?'she':'they'
      const obj  = form.gender==='Male'?'him':form.gender==='Female'?'her':'them'
      const poss = form.gender==='Male'?'his':form.gender==='Female'?'her':'their'
      const p    = `Write a vivid 3-paragraph D&D origin story for ${form.name}, a ${form.alignment} ${form.race} ${form.class} (${form.background}).
Pronouns: ${sub}/${obj}/${poss}. Personality: ${form.personality_traits}. Bond: ${form.bonds}. Flaw: ${form.flaws}.
Write flowing prose — no headers, no lists. End on why ${sub} began adventuring.`
      const story = await callAI([{role:'user',content:p}], 500)
      set('origin_story', story.trim())
    } catch(e){ console.warn('AI origin failed',e) }
    finally { setAiLoading(false) }
  }

  // ── Finish ──────────────────────────────────────────────
  async function handleFinish() {
    setSaving(true); setError(null)
    try {
      // Build final base stats from assignment
      const base = {}
      STAT_NAMES.forEach(s => { base[s] = form.assigned[s] || 10 })
      // Apply racial ASI
      const withASI = applyRacialASI(base, form.race)

      const con = withASI.constitution || 10
      const dex = withASI.dexterity || 10
      const wis = withASI.wisdom || 10
      const maxHP = calcMaxHP(form.class, con, 1)

      // Base AC: check class unarmored defense or default
      let baseAC = 10 + Math.floor((dex-10)/2)
      if (form.class==='Barbarian') baseAC = 10 + Math.floor((dex-10)/2) + Math.floor((con-10)/2)
      if (form.class==='Monk')      baseAC = 10 + Math.floor((dex-10)/2) + Math.floor((wis-10)/2)

      // Starting equipment — class + background real items
      const startItems = buildStartingEquipment(form.class, form.background)
      // Add any extra spellcasting items from form.equipment (additional picks)
      const allEquip   = [...new Set([...startItems, ...form.equipment])]

      // Starting gold from background
      const startGold = getStartingGold(form.background)

      // Build spell slots from class data
      const slotTable = clsData?.spellSlots || null
      const spellSlots = slotTable ? Object.fromEntries(
        Object.entries(slotTable).map(([lvl, max]) => [lvl, { max, used: 0 }])
      ) : {}

      // Class features at level 1
      const level1Features = getClassFeatures(form.class, 1)

      // Race traits
      const raceTraits = raceData?.traits?.map(t=>`${t.name}: ${t.desc}`) || []

      // Background skills
      const bgSkills = bgData?.skills || []

      await onComplete({
        name: form.name.trim(),
        race: form.race,
        class: form.class,
        subclass: form.subclass || null,
        gender: form.gender,
        background: form.background,
        alignment: form.alignment,
        ...withASI,
        max_hp:        maxHP,
        current_hp:    maxHP,
        armor_class:   baseAC,
        speed:         raceData?.speed || 30,
        level:         1,
        experience:    0,
        xp_to_next_level: 300,
        proficiency_bonus: 2,
        gold:          startGold,
        equipment:     allEquip,
        spells:        form.spells,
        spell_slots:   spellSlots,
        languages:     ['Common', ...(raceData?.languages?.filter(l=>l!=='Common')||[])],
        // race_traits, class_features, skill_proficiencies stored in notes/prompt
        // not separate DB columns — they're computed from race/class in the system prompt
        personality_traits: form.personality_traits,
        ideals:   form.ideals,
        bonds:    form.bonds,
        flaws:    form.flaws,
        origin_story: form.origin_story,
        hit_dice_used: 0,
      })
    } catch(err) { setError(err.message); setSaving(false) }
  }

  // ── RENDER ──────────────────────────────────────────────
  return (
    <div className="cc-page">
      <div className="cc-card">
        {/* Header */}
        <div className="cc-header">
          <button className="cc-back" onClick={onBack}>← Back</button>
          <div className="cc-header-center">
            <div className="cc-campaign-label">{campaignTitle}</div>
            <h2 className="cc-title">Create Your Character</h2>
          </div>
          <div style={{width:60}}/>
        </div>

        <div className="cc-progress-bar">
          <div className="cc-progress-fill" style={{width:`${((step+1)/STEPS.length)*100}%`}}/>
        </div>
        <div className="cc-step-label">
          <span className="cc-step-num">Step {step+1} of {STEPS.length}</span>
          <span className="cc-step-name">{stepName}</span>
        </div>

        {/* ── STEP: Name & Race ── */}
        {stepName==='Name & Race' && (
          <div className="cc-body">
            <div className="cc-field">
              <label className="cc-field-label">Character Name *</label>
              <input className="cc-input" value={form.name}
                onChange={e=>set('name',e.target.value)}
                placeholder="e.g. Aldric Thornwood, Lyra Dawnwhisper…" autoFocus/>
            </div>
            <div className="cc-field">
              <label className="cc-field-label">Gender *</label>
              <p className="cc-hint">The Dungeon Master uses this for correct pronouns throughout your story.</p>
              <div className="cc-gender-row">
                {GENDERS.map(g=>(
                  <button key={g.val} className={`cc-gender-btn ${form.gender===g.val?'selected':''}`}
                    onClick={()=>set('gender',g.val)}>{g.label}</button>
                ))}
              </div>
            </div>
            <div className="cc-field">
              <label className="cc-field-label">Race *</label>
              <div className="cc-card-grid">
                {RACES.map(r=>(
                  <button key={r.name} className={`cc-option-card ${form.race===r.name?'selected':''}`}
                    onClick={()=>set('race',r.name)}>
                    <span className="cc-option-icon">{r.icon}</span>
                    <span className="cc-option-name">{r.name}</span>
                    <span className="cc-option-desc">{r.desc}</span>
                    {form.race===r.name && r.asi && (
                      <div className="cc-race-bonuses">
                        {Object.entries(r.asi).filter(([k])=>k!=='_choose2').map(([s,v])=>(
                          <span key={s} className="cc-asi-pill">
                            {STAT_LABELS[s]||s} {v>0?'+':''}{v}
                          </span>
                        ))}
                        {r.chooseTwoStats && <span className="cc-asi-pill">+1 × 2 any</span>}
                      </div>
                    )}
                    {form.race===r.name && r.traits?.length>0 && (
                      <div className="cc-race-traits">
                        {r.traits.slice(0,3).map((t,i)=>(
                          <div key={i} className="cc-race-trait">✦ {t.name}</div>
                        ))}
                        {r.traits.length>3 && <div className="cc-race-trait muted">+{r.traits.length-3} more traits</div>}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: Class ── */}
        {stepName==='Class' && (
          <div className="cc-body">
            <div className="cc-field">
              <label className="cc-field-label">Class *</label>
              <p className="cc-hint">Your class is your profession and determines abilities, hit points, and equipment. ✨ = uses spells.</p>
              <div className="cc-card-grid">
                {CLASSES.map(c=>(
                  <button key={c.name} className={`cc-option-card ${form.class===c.name?'selected':''}`}
                    onClick={()=>set('class',c.name)}>
                    <span className="cc-option-icon">{c.icon}{c.spellcaster?' ✨':''}</span>
                    <span className="cc-option-name">{c.name}</span>
                    <span className="cc-option-desc">{c.desc}</span>
                    {form.class===c.name && (
                      <div className="cc-class-detail">
                        <div className="cc-detail-row"><span>Hit Die</span><span>d{c.hitDie}</span></div>
                        <div className="cc-detail-row"><span>Saves</span><span>{c.savingThrows.map(s=>STAT_LABELS[s]).join(', ')}</span></div>
                        <div className="cc-detail-row"><span>Armor</span><span>{c.armorProf.join(', ') || 'None'}</span></div>
                        <div className="cc-detail-row"><span>Weapons</span><span>{c.weaponProf.join(', ')}</span></div>
                        {c.castingStat && <div className="cc-detail-row"><span>Casting</span><span>{STAT_LABELS[c.castingStat]}</span></div>}
                        <div className="cc-detail-section">Level 1 Features:</div>
                        {(c.features[1]||[]).map((f,i)=>(
                          <div key={i} className="cc-feature-pill">
                            <strong>{f.name}</strong>
                            <span>{f.desc.slice(0,80)}{f.desc.length>80?'…':''}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: Subclass ── */}
        {stepName==='Subclass' && (
          <div className="cc-body">
            <div className="cc-field">
              <label className="cc-field-label">Subclass (Optional — unlocked at level 3)</label>
              <p className="cc-hint">Your subclass specializes your {form.class}. You can decide now or during your adventure.</p>
              <div className="cc-card-grid">
                <button className={`cc-option-card ${!form.subclass?'selected':''}`} onClick={()=>set('subclass','')}>
                  <span className="cc-option-name">Decide at Level 3</span>
                  <span className="cc-option-desc">Skip this now. When you reach level 3, you'll be prompted to choose.</span>
                </button>
                {(clsData?.subclasses||[]).map(sc=>(
                  <button key={sc} className={`cc-option-card ${form.subclass===sc?'selected':''}`}
                    onClick={()=>set('subclass',form.subclass===sc?'':sc)}>
                    <span className="cc-option-name">{sc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: Background ── */}
        {stepName==='Background' && (
          <div className="cc-body">
            <div className="cc-field">
              <label className="cc-field-label">Background *</label>
              <p className="cc-hint">Your background gives you skills, a unique feature, and starting equipment from your past life.</p>
              <div className="cc-card-grid">
                {BACKGROUNDS.map(b=>(
                  <button key={b.name} className={`cc-option-card ${form.background===b.name?'selected':''}`}
                    onClick={()=>set('background',b.name)}>
                    <span className="cc-option-icon">{b.icon}</span>
                    <span className="cc-option-name">{b.name}</span>
                    <span className="cc-option-desc">{b.desc}</span>
                    {form.background===b.name && (
                      <div className="cc-class-detail">
                        <div className="cc-detail-row"><span>Skills</span><span>{b.skills.join(', ')}</span></div>
                        {b.tools.length>0 && <div className="cc-detail-row"><span>Tools</span><span>{b.tools.join(', ')}</span></div>}
                        {b.languages>0 && <div className="cc-detail-row"><span>Languages</span><span>+{b.languages} language{b.languages>1?'s':''}</span></div>}
                        <div className="cc-detail-section">Feature: {b.feature.name}</div>
                        <div style={{fontSize:'.75rem',color:'var(--parch3)',lineHeight:1.5,padding:'4px 0'}}>{b.feature.desc}</div>
                        <div className="cc-detail-section">Starting Equipment</div>
                        <div style={{fontSize:'.72rem',color:'var(--parch3)',lineHeight:1.6}}>{b.equipment.join(' · ')}</div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: Alignment ── */}
        {stepName==='Alignment' && (
          <div className="cc-body">
            <div className="cc-field">
              <label className="cc-field-label">Alignment *</label>
              <p className="cc-hint">Your moral compass. Affects how the DM portrays your character and NPC reactions.</p>
              <div className="cc-alignment-grid">
                {ALIGNMENTS.map(a=>(
                  <button key={a.name} className={`cc-alignment-card ${form.alignment===a.name?'selected':''}`}
                    onClick={()=>set('alignment',a.name)}>
                    <span className="cc-align-icon">{a.icon}</span>
                    <span className="cc-align-short">{a.short}</span>
                    <span className="cc-align-name">{a.name}</span>
                    <span className="cc-align-desc">{a.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: Stats ── */}
        {stepName==='Stats' && (
          <div className="cc-body">
            <div className="cc-field">
              <label className="cc-field-label">Ability Score Assignment *</label>
              <p className="cc-hint">Assign the standard array [15, 14, 13, 12, 10, 8] to your six stats. Racial bonuses are added automatically after.</p>
              {raceData?.asi && (
                <div className="cc-asi-preview">
                  Racial bonuses: {Object.entries(raceData.asi).filter(([k])=>k!=='_choose2')
                    .map(([s,v])=>`${STAT_LABELS[s]} ${v>0?'+':''}${v}`).join(', ')}
                  {raceData.chooseTwoStats && ' + choose two stats +1'}
                </div>
              )}
              {/* Available values */}
              <div className="cc-array-pool">
                <span className="cc-pool-label">Available:</span>
                {STANDARD_ARRAY.map((v,i)=>{
                  const usedCount = assignedVals.filter(x=>x===v).length
                  const totalCount = STANDARD_ARRAY.filter(x=>x===v).length
                  const remaining  = totalCount - usedCount
                  if (remaining <= 0) return null
                  return Array.from({length:remaining}).map((_,j)=>(
                    <span key={`${v}-${i}-${j}`} className="cc-array-chip">{v}</span>
                  ))
                })}
                {availableVals.length===0 && <span style={{color:'var(--parch3)',fontSize:'.78rem'}}>All assigned ✓</span>}
              </div>
              {/* Stat rows */}
              <div className="cc-stat-grid">
                {STAT_NAMES.map(stat=>{
                  const assigned = form.assigned[stat]
                  const bonus    = raceData?.asi?.[stat] || 0
                  const final    = assigned ? assigned + bonus : null
                  const isPrimary = clsData?.primaryStat===stat
                  const isSave    = clsData?.savingThrows?.includes(stat)
                  return (
                    <div key={stat} className={`cc-stat-row ${isPrimary?'primary':''}`}>
                      <div className="cc-stat-label">
                        <span className="cc-stat-abbr">{STAT_LABELS[stat]}</span>
                        <span className="cc-stat-desc-small">{STAT_DESC[stat]}</span>
                        <div className="cc-stat-tags">
                          {isPrimary && <span className="cc-tag primary">Primary</span>}
                          {isSave    && <span className="cc-tag save">Save</span>}
                        </div>
                      </div>
                      <div className="cc-stat-assign">
                        {assigned ? (
                          <div className="cc-stat-assigned-row">
                            <div className="cc-stat-value-block">
                              <span className="cc-stat-base">{assigned}</span>
                              {bonus!==0&&<span className="cc-stat-bonus">{bonus>0?'+':''}{bonus}</span>}
                              <span className="cc-stat-final">{final}</span>
                              <span className="cc-stat-mod">{statMod(final)}</span>
                            </div>
                            <button className="cc-stat-clear" onClick={()=>assignStat(stat,null)}>✕</button>
                          </div>
                        ) : (
                          <div className="cc-stat-chips">
                            {availableVals.filter((v,i,a)=>a.indexOf(v)===i).map(v=>(
                              <button key={v} className="cc-stat-chip" onClick={()=>assignStat(stat,v)}>{v}</button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* Final HP preview */}
              {Object.keys(form.assigned).length===6 && (
                <div className="cc-hp-preview">
                  Starting HP: <strong>{calcMaxHP(form.class, (form.assigned.constitution||10)+(raceData?.asi?.constitution||0), 1)}</strong>
                  {' '}· Base AC: <strong>{10+Math.floor(((form.assigned.dexterity||10)+(raceData?.asi?.dexterity||0)-10)/2)}</strong>
                  {form.class==='Barbarian'&&' (Unarmored Defense: 10+DEX+CON)'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── STEP: Equipment ── */}
        {stepName==='Equipment' && (
          <div className="cc-body">
            <div className="cc-field">
              <label className="cc-field-label">Starting Equipment</label>
              <p className="cc-hint">
                Your class and background give you this equipment automatically. All items use their real SRD values in shops.
              </p>
              <div className="cc-equip-auto">
                <div className="cc-equip-section-label">Auto-equipped from {form.class} + {form.background}:</div>
                <div className="cc-equip-list">
                  {classEquipment.map((item,i)=>(
                    <div key={i} className="cc-equip-item">
                      <span className="cc-equip-check">✓</span>
                      <span>{item}</span>
                    </div>
                  ))}
                  {classEquipment.length===0 && <div style={{color:'var(--parch3)',fontStyle:'italic'}}>Loading equipment…</div>}
                </div>
              </div>
              <div className="cc-equip-section-label" style={{marginTop:14}}>Add extra starting items (optional):</div>
              <p className="cc-hint">Common additions: Healing Potion, Thieves' Tools, Holy Water, extra Torch</p>
              <div className="cc-equip-extras">
                {['Healing Potion','Potion of Greater Healing','Antitoxin','Holy Water','Alchemist\'s Fire','Torch','Rations (1 day)','Rope (50ft)','Thieves\' Tools','Healer\'s Kit','Arcane Focus','Holy Symbol'].map(item=>{
                  const sel = form.equipment.includes(item)
                  return (
                    <button key={item} className={`cc-equip-extra-btn ${sel?'selected':''}`}
                      onClick={()=>setForm(p=>({...p, equipment: sel?p.equipment.filter(e=>e!==item):[...p.equipment,item]}))}>
                      {item}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: Spells ── */}
        {stepName==='Spells' && (
          <div className="cc-body">
            <div className="cc-field">
              <label className="cc-field-label">Starting Spells</label>
              <p className="cc-hint">
                Choose your starting spells. Cantrips are free and unlimited.
                Leveled spells use spell slots (recover on long rest).
                {clsData?.castingStat && <> Casting stat: <strong>{STAT_LABELS[clsData.castingStat]}</strong>.</>}
              </p>
              <div className="cc-spell-count">Selected: {form.spells.length}</div>
              <div className="cc-spell-groups">
                <div className="cc-spell-group">
                  <div className="cc-spell-group-label">Cantrips (∞ — pick 2-3)</div>
                  <div className="cc-spell-list">
                    {getCantrips(form.class).map(spell=>{
                      const name = spell.replace(' (cantrip)','')
                      const sel  = form.spells.includes(spell)
                      return (
                        <button key={spell} className={`cc-spell-btn cantrip ${sel?'selected':''}`}
                          onClick={()=>setForm(p=>({...p,spells:sel?p.spells.filter(s=>s!==spell):[...p.spells,spell]}))}>
                          <span className="cc-spell-name">{name}</span>
                          <span className="cc-spell-level">Cantrip</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
                <div className="cc-spell-group">
                  <div className="cc-spell-group-label">1st Level Spells (pick 2-4)</div>
                  <div className="cc-spell-list">
                    {(CLASS_SPELLS_BY_LEVEL[form.class]?.[1]||[]).map(spell=>{
                      const sel = form.spells.includes(spell)
                      return (
                        <button key={spell} className={`cc-spell-btn ${sel?'selected':''}`}
                          onClick={()=>setForm(p=>({...p,spells:sel?p.spells.filter(s=>s!==spell):[...p.spells,spell]}))}>
                          <span className="cc-spell-name">{spell}</span>
                          <span className="cc-spell-level">1st</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: Personality ── */}
        {stepName==='Personality' && (
          <div className="cc-body cc-body-scrollable">
            <div className="cc-field">
              <div className="cc-label-row">
                <label className="cc-field-label">Personality</label>
                <button className="cc-ai-btn" onClick={aiGeneratePersonality} disabled={aiLoading}>
                  {aiLoading ? '⏳ Generating…' : '✨ Auto-generate with AI'}
                </button>
              </div>
              <p className="cc-hint">Fill these in or let AI suggest them based on your character choices.</p>
              <div className="cc-personality-grid">
                {[
                  { key:'personality_traits', label:'Personality Traits', placeholder:'How does your character act day-to-day? What quirks do they have?' },
                  { key:'ideals',             label:'Ideals',             placeholder:'What does your character believe in most deeply?' },
                  { key:'bonds',              label:'Bonds',              placeholder:'Who or what is most important to your character?' },
                  { key:'flaws',              label:'Flaws',              placeholder:'What weakness or vice does your character struggle with?' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key} className="cc-field">
                    <label className="cc-field-label-sm">{label}</label>
                    <textarea
                      className="cc-input cc-textarea"
                      value={form[key]}
                      onChange={e => set(key, e.target.value)}
                      placeholder={placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: Origin Story ── */}
        {stepName==='Origin' && (
          <div className="cc-body cc-body-scrollable">
            <div className="cc-field">
              <div className="cc-label-row">
                <label className="cc-field-label">Origin Story</label>
                <button className="cc-ai-btn" onClick={aiGenerateOrigin} disabled={aiLoading || !form.name || !form.race}>
                  {aiLoading ? '⏳ Writing…' : '✨ Auto-generate with AI'}
                </button>
              </div>
              <p className="cc-hint">
                Tell your character's backstory. The DM will remember this and weave it into the adventure.
                Click Auto-generate to have AI write one based on your choices.
              </p>
              <textarea
                className="cc-input cc-textarea cc-textarea-lg"
                value={form.origin_story}
                onChange={e => set('origin_story', e.target.value)}
                placeholder="Born in the shadow of the mountains, I never knew my parents…"
              />
              {/* Final character summary */}
              <div className="cc-summary-card">
                <div className="cc-summary-title">Character Summary</div>
                <div className="cc-summary-row"><span>{form.name}</span><span>{form.race} {form.class}{form.subclass?` (${form.subclass})`:''}</span></div>
                <div className="cc-summary-row"><span>{form.background}</span><span>{form.alignment}</span></div>
                <div className="cc-summary-stats">
                  {STAT_NAMES.map(s=>{
                    const base  = form.assigned[s]||10
                    const bonus = raceData?.asi?.[s]||0
                    const final = base+bonus
                    return <div key={s} className="cc-sum-stat"><span>{STAT_LABELS[s]}</span><span>{final}</span><span>{statMod(final)}</span></div>
                  })}
                </div>
                <div className="cc-summary-row">
                  <span>HP: {calcMaxHP(form.class, (form.assigned.constitution||10)+(raceData?.asi?.constitution||0), 1)}</span>
                  <span>Gold: {getStartingGold(form.background)} gp</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Navigation ── */}
        {error && <div className="cc-error">{error}</div>}
        <div className="cc-nav">
          {step > 0 && (
            <button className="cc-nav-back" onClick={() => setStep(s=>s-1)}>← Back</button>
          )}
          <div style={{flex:1}}/>
          {!isLast ? (
            <button className="cc-nav-next" onClick={()=>setStep(s=>s+1)} disabled={!canAdvance()}>
              Next →
            </button>
          ) : (
            <button className="cc-nav-finish" onClick={handleFinish} disabled={saving||aiLoading}>
              {saving ? 'Creating…' : '⚔️ Begin Adventure'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
// src/components/ContentCreator.js
// ══════════════════════════════════════════════════════════════
// CONTENT CREATOR
// Players define custom Items, Spells, Creatures, and Campaigns.
// Every piece of content is validated and registered in the DB
// before the game can use it. The LLM never invents — it receives.
// ══════════════════════════════════════════════════════════════
import { useState } from 'react'
import { registerItem, registerSpell, registerCreature } from '../lib/contentRegistry'
import { contentValidator } from '../lib/contentValidator'

const TABS = ['Item', 'Spell', 'Creature']

const RARITY_COLORS = {
  common: '#aaa', uncommon: '#4ecb71', rare: '#7eb8ff',
  very_rare: '#c080ff', legendary: '#f0c040',
}

const SCHOOLS = ['abjuration','conjuration','divination','enchantment','evocation','illusion','necromancy','transmutation']
const SPELL_TYPES = ['attack','save','heal','buff','debuff','utility','dart']
const DAMAGE_TYPES = ['slashing','piercing','bludgeoning','fire','cold','lightning','thunder','poison','acid','psychic','necrotic','radiant','force']
const STATUS_EFFECTS = ['poisoned','stunned','frightened','prone','frozen','burning','bleeding','weakened','blessed','shielded']

export default function ContentCreator({ campaignId, onClose, onCreated }) {
  const [tab,     setTab]     = useState('Item')
  const [saving,  setSaving]  = useState(false)
  const [result,  setResult]  = useState(null)
  const [warnings,setWarnings]= useState([])

  // ── Item form ────────────────────────────────────────────
  const [item, setItem] = useState({
    name: '', cat: 'weapon', slot: 'mainhand', rarity: 'uncommon',
    damage: '', dmgType: 'slashing', props: '',
    baseAC: '', acBonus: '', saveBonus: '',
    setCon: '', setStr: '', attunement: false,
    heal: '', desc: '', passive: '',
    onHit: '', onHitType: 'necrotic', onHitCondition: '', onCrit: '',
    icon: '⚔️',
  })
  const setI = (k, v) => setItem(p => ({ ...p, [k]: v }))

  // ── Spell form ───────────────────────────────────────────
  const [spell, setSpell] = useState({
    name: '', level: 1, school: 'evocation', castAs: 'action',
    castingStat: 'int', concentration: false, ritual: false,
    spellType: 'attack', rangeType: 'single', targetType: 'enemy',
    damageDice: '', damageType: 'fire',
    saveStat: 'DEX', saveOnHalf: true,
    isHeal: false, healDice: '',
    statusEffect: '', statusDuration: 2,
    icon: '✨', description: '',
  })
  const setS = (k, v) => setSpell(p => ({ ...p, [k]: v }))

  // ── Creature form ────────────────────────────────────────
  const [creature, setCreature] = useState({
    name: '', cr: '1', size: 'Medium', type: 'humanoid',
    hp: 30, ac: 13, speed: 30,
    str: 12, dex: 12, con: 12, int: 8, wis: 10, cha: 8,
    atkName: 'Strike', atkBonus: 4, atkDamage: '1d6+2', atkType: 'slashing',
    atkSpecialStat: '', atkSpecialDC: '', atkSpecialEffect: '', atkSpecialDesc: '',
    lootGoldMin: 1, lootGoldMax: 8,
    flavor: '', description: '',
    icon: '👹',
  })
  const setC = (k, v) => setCreature(p => ({ ...p, [k]: v }))

  async function handleSave() {
    setSaving(true)
    setResult(null)
    setWarnings([])

    try {
      let res
      if (tab === 'Item') {
        const raw = {
          name:       item.name.trim(),
          cat:        item.cat,
          slot:       item.slot,
          rarity:     item.rarity,
          icon:       item.icon,
          desc:       item.desc,
          passive:    item.passive || item.desc,
          attunement: item.attunement,
          damage:     item.damage || null,
          dmgType:    item.dmgType || null,
          props:      item.props ? item.props.split(',').map(p => p.trim()).filter(Boolean) : [],
          baseAC:     item.baseAC ? parseInt(item.baseAC) : null,
          acBonus:    item.acBonus ? parseInt(item.acBonus) : null,
          saveBonus:  item.saveBonus ? parseInt(item.saveBonus) : null,
          setCon:     item.setCon ? parseInt(item.setCon) : null,
          setStr:     item.setStr ? parseInt(item.setStr) : null,
          heal:       item.heal || null,
          onHit:      item.onHit ? { damage: item.onHit, type: item.onHitType, condition: item.onHitCondition || null, duration: 2 } : null,
          onCrit:     item.onCrit ? { damage: item.onCrit, type: item.dmgType } : null,
        }
        res = await registerItem(raw, campaignId)
      } else if (tab === 'Spell') {
        const raw = {
          name:         spell.name.trim(),
          level:        parseInt(spell.level),
          school:       spell.school,
          castAs:       spell.castAs,
          castingStat:  spell.castingStat,
          concentration: spell.concentration,
          ritual:       spell.ritual,
          spellType:    spell.spellType,
          rangeType:    spell.rangeType,
          targetType:   spell.targetType,
          damageDice:   spell.damageDice || null,
          damageType:   spell.damageType || null,
          saveStat:     spell.saveStat || null,
          saveOnHalf:   spell.saveOnHalf,
          isHeal:       spell.isHeal,
          healDice:     spell.healDice || null,
          statusEffect: spell.statusEffect ? { effectId: spell.statusEffect, duration: parseInt(spell.statusDuration) || 2 } : null,
          icon:         spell.icon,
          description:  spell.description,
        }
        res = await registerSpell(raw, campaignId)
      } else {
        const raw = {
          name:        creature.name.trim(),
          cr:          creature.cr,
          size:        creature.size,
          type:        creature.type,
          hp:          parseInt(creature.hp),
          maxHp:       parseInt(creature.hp),
          ac:          parseInt(creature.ac),
          speed:       parseInt(creature.speed),
          str: parseInt(creature.str), dex: parseInt(creature.dex), con: parseInt(creature.con),
          int: parseInt(creature.int), wis: parseInt(creature.wis), cha: parseInt(creature.cha),
          attacks: [{
            name:    creature.atkName,
            bonus:   parseInt(creature.atkBonus),
            damage:  creature.atkDamage,
            type:    creature.atkType,
            ...(creature.atkSpecialStat ? {
              special: {
                stat:     creature.atkSpecialStat,
                dc:       parseInt(creature.atkSpecialDC) || 12,
                effectId: creature.atkSpecialEffect,
                duration: 2,
                desc:     creature.atkSpecialDesc,
              }
            } : {})
          }],
          loot:     { gold: [parseInt(creature.lootGoldMin), parseInt(creature.lootGoldMax)], items: [] },
          flavor:   creature.flavor ? creature.flavor.split(',').map(f => f.trim()).filter(Boolean) : ['attacks'],
          description: creature.description,
        }
        res = await registerCreature(raw, campaignId)
      }

      if (res.error) {
        setResult({ ok: false, message: res.error })
      } else {
        setResult({ ok: true, message: `${tab} "${res.item?.name || res.spell?.name || res.creature?.name}" registered successfully!` })
        if (res.warnings?.length) setWarnings(res.warnings)
        onCreated?.()
      }
    } catch (e) {
      setResult({ ok: false, message: e.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,.8)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1200 }}>
      <div style={{ background:'var(--surface-0,#1a0e00)',border:'1px solid rgba(200,146,42,.3)',borderRadius:'12px',width:'560px',maxHeight:'90vh',display:'flex',flexDirection:'column',overflow:'hidden' }}>

        {/* Header */}
        <div style={{ padding:'14px 16px',borderBottom:'1px solid rgba(200,146,42,.2)',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <div style={{ fontFamily:'var(--font-display,serif)',color:'var(--gold,#c8922a)',fontSize:'.9rem',letterSpacing:'.08em' }}>
            ⚙️ Content Creator
          </div>
          <button onClick={onClose} style={{ background:'transparent',border:'none',color:'#aaa',cursor:'pointer',fontSize:'1rem' }}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex',borderBottom:'1px solid rgba(255,255,255,.08)' }}>
          {TABS.map(t => (
            <button key={t} onClick={() => { setTab(t); setResult(null); setWarnings([]) }}
              style={{ flex:1,padding:'8px',fontSize:'.74rem',cursor:'pointer',background:'none',border:'none',
                borderBottom: tab===t ? '2px solid var(--gold,#c8922a)' : '2px solid transparent',
                color: tab===t ? 'var(--gold,#c8922a)' : 'var(--parch3,#aaa)' }}>
              {t === 'Item' ? '🗡️ Item' : t === 'Spell' ? '✨ Spell' : '👹 Creature'}
            </button>
          ))}
        </div>

        {/* Form body */}
        <div style={{ overflowY:'auto',flex:1,padding:'14px 16px' }}>

          {/* ── ITEM FORM ── */}
          {tab === 'Item' && (
            <div style={{ display:'flex',flexDirection:'column',gap:'10px' }}>
              <Row label="Name *"><input value={item.name} onChange={e=>setI('name',e.target.value)} placeholder="Blade of Eternal Night" style={inputStyle} /></Row>
              <Row label="Icon"><input value={item.icon} onChange={e=>setI('icon',e.target.value)} style={{...inputStyle,width:'50px'}} /></Row>
              <Row label="Category">
                <select value={item.cat} onChange={e=>setI('cat',e.target.value)} style={inputStyle}>
                  {['weapon','armor','jewelry','consumable','tool','misc'].map(c => <option key={c}>{c}</option>)}
                </select>
              </Row>
              <Row label="Slot">
                <select value={item.slot} onChange={e=>setI('slot',e.target.value)} style={inputStyle}>
                  {['mainhand','offhand','chest','head','amulet','ring1','ring2','hands','feet','cloak','ranged','consumable'].map(s => <option key={s}>{s}</option>)}
                </select>
              </Row>
              <Row label="Rarity">
                <select value={item.rarity} onChange={e=>setI('rarity',e.target.value)} style={{...inputStyle,color:RARITY_COLORS[item.rarity]}}>
                  {Object.keys(RARITY_COLORS).map(r => <option key={r} style={{color:RARITY_COLORS[r]}}>{r}</option>)}
                </select>
              </Row>
              {item.cat === 'weapon' && <>
                <Row label="Damage dice"><input value={item.damage} onChange={e=>setI('damage',e.target.value)} placeholder="1d8" style={inputStyle} /></Row>
                <Row label="Damage type">
                  <select value={item.dmgType} onChange={e=>setI('dmgType',e.target.value)} style={inputStyle}>
                    {DAMAGE_TYPES.map(d => <option key={d}>{d}</option>)}
                  </select>
                </Row>
                <Row label="Properties"><input value={item.props} onChange={e=>setI('props',e.target.value)} placeholder="Finesse, Light" style={inputStyle} /></Row>
                <Row label="On-hit proc (dice)"><input value={item.onHit} onChange={e=>setI('onHit',e.target.value)} placeholder="1d4" style={inputStyle} /></Row>
                {item.onHit && <>
                  <Row label="On-hit type">
                    <select value={item.onHitType} onChange={e=>setI('onHitType',e.target.value)} style={inputStyle}>
                      {DAMAGE_TYPES.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </Row>
                  <Row label="On-hit condition">
                    <select value={item.onHitCondition} onChange={e=>setI('onHitCondition',e.target.value)} style={inputStyle}>
                      <option value="">None</option>
                      {STATUS_EFFECTS.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </Row>
                </>}
                <Row label="On-crit extra (dice)"><input value={item.onCrit} onChange={e=>setI('onCrit',e.target.value)} placeholder="2d6" style={inputStyle} /></Row>
              </>}
              {item.cat === 'armor' && <>
                <Row label="Base AC"><input value={item.baseAC} onChange={e=>setI('baseAC',e.target.value)} placeholder="14" style={inputStyle} /></Row>
                <Row label="AC Bonus"><input value={item.acBonus} onChange={e=>setI('acBonus',e.target.value)} placeholder="+1" style={inputStyle} /></Row>
              </>}
              {item.cat === 'jewelry' && <>
                <Row label="Set CON to"><input value={item.setCon} onChange={e=>setI('setCon',e.target.value)} placeholder="19" style={inputStyle} /></Row>
                <Row label="Set STR to"><input value={item.setStr} onChange={e=>setI('setStr',e.target.value)} placeholder="19" style={inputStyle} /></Row>
                <Row label="+Save bonus"><input value={item.saveBonus} onChange={e=>setI('saveBonus',e.target.value)} placeholder="1" style={inputStyle} /></Row>
                <Row label="+AC bonus"><input value={item.acBonus} onChange={e=>setI('acBonus',e.target.value)} placeholder="1" style={inputStyle} /></Row>
              </>}
              {item.cat === 'consumable' && <>
                <Row label="Heals (dice)"><input value={item.heal} onChange={e=>setI('heal',e.target.value)} placeholder="2d4+2" style={inputStyle} /></Row>
              </>}
              <Row label="Requires attunement">
                <input type="checkbox" checked={item.attunement} onChange={e=>setI('attunement',e.target.checked)} />
              </Row>
              <Row label="Description">
                <textarea value={item.desc} onChange={e=>setI('desc',e.target.value)} placeholder="A blade forged in shadow..." style={{...inputStyle,minHeight:'60px',resize:'vertical'}} />
              </Row>
            </div>
          )}

          {/* ── SPELL FORM ── */}
          {tab === 'Spell' && (
            <div style={{ display:'flex',flexDirection:'column',gap:'10px' }}>
              <Row label="Name *"><input value={spell.name} onChange={e=>setS('name',e.target.value)} placeholder="Blood Strike" style={inputStyle} /></Row>
              <Row label="Icon"><input value={spell.icon} onChange={e=>setS('icon',e.target.value)} style={{...inputStyle,width:'50px'}} /></Row>
              <Row label="Level"><input type="number" min="0" max="9" value={spell.level} onChange={e=>setS('level',e.target.value)} style={{...inputStyle,width:'60px'}} /></Row>
              <Row label="School">
                <select value={spell.school} onChange={e=>setS('school',e.target.value)} style={inputStyle}>
                  {SCHOOLS.map(s => <option key={s}>{s}</option>)}
                </select>
              </Row>
              <Row label="Cast as">
                <select value={spell.castAs} onChange={e=>setS('castAs',e.target.value)} style={inputStyle}>
                  {['action','bonus','reaction'].map(s => <option key={s}>{s}</option>)}
                </select>
              </Row>
              <Row label="Casting stat">
                <select value={spell.castingStat} onChange={e=>setS('castingStat',e.target.value)} style={inputStyle}>
                  {['int','wis','cha'].map(s => <option key={s}>{s}</option>)}
                </select>
              </Row>
              <Row label="Spell type">
                <select value={spell.spellType} onChange={e=>setS('spellType',e.target.value)} style={inputStyle}>
                  {SPELL_TYPES.map(s => <option key={s}>{s}</option>)}
                </select>
              </Row>
              <Row label="Range type">
                <select value={spell.rangeType} onChange={e=>setS('rangeType',e.target.value)} style={inputStyle}>
                  {['single','aoe','self','touch'].map(s => <option key={s}>{s}</option>)}
                </select>
              </Row>
              {(spell.spellType === 'attack' || spell.spellType === 'save') && <>
                <Row label="Damage dice"><input value={spell.damageDice} onChange={e=>setS('damageDice',e.target.value)} placeholder="3d6" style={inputStyle} /></Row>
                <Row label="Damage type">
                  <select value={spell.damageType} onChange={e=>setS('damageType',e.target.value)} style={inputStyle}>
                    {DAMAGE_TYPES.map(d => <option key={d}>{d}</option>)}
                  </select>
                </Row>
              </>}
              {spell.spellType === 'save' && <>
                <Row label="Save stat">
                  <select value={spell.saveStat} onChange={e=>setS('saveStat',e.target.value)} style={inputStyle}>
                    {['STR','DEX','CON','INT','WIS','CHA'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </Row>
                <Row label="Half on save"><input type="checkbox" checked={spell.saveOnHalf} onChange={e=>setS('saveOnHalf',e.target.checked)} /></Row>
              </>}
              {spell.spellType === 'heal' && <>
                <Row label="Heal dice"><input value={spell.healDice} onChange={e=>setS('healDice',e.target.value)} placeholder="2d8+4" style={inputStyle} /></Row>
              </>}
              <Row label="Status effect">
                <select value={spell.statusEffect} onChange={e=>setS('statusEffect',e.target.value)} style={inputStyle}>
                  <option value="">None</option>
                  {STATUS_EFFECTS.map(s => <option key={s}>{s}</option>)}
                </select>
              </Row>
              {spell.statusEffect && <Row label="Duration (turns)"><input type="number" min="1" max="10" value={spell.statusDuration} onChange={e=>setS('statusDuration',e.target.value)} style={{...inputStyle,width:'60px'}} /></Row>}
              <Row label="Concentration"><input type="checkbox" checked={spell.concentration} onChange={e=>setS('concentration',e.target.checked)} /></Row>
              <Row label="Ritual"><input type="checkbox" checked={spell.ritual} onChange={e=>setS('ritual',e.target.checked)} /></Row>
              <Row label="Description">
                <textarea value={spell.description} onChange={e=>setS('description',e.target.value)} placeholder="Mechanical summary..." style={{...inputStyle,minHeight:'60px',resize:'vertical'}} />
              </Row>
            </div>
          )}

          {/* ── CREATURE FORM ── */}
          {tab === 'Creature' && (
            <div style={{ display:'flex',flexDirection:'column',gap:'10px' }}>
              <Row label="Name *"><input value={creature.name} onChange={e=>setC('name',e.target.value)} placeholder="Shadow Stalker" style={inputStyle} /></Row>
              <Row label="CR">
                <select value={creature.cr} onChange={e=>setC('cr',e.target.value)} style={inputStyle}>
                  {['0','1/8','1/4','1/2','1','2','3','4','5','6','7','8'].map(c => <option key={c}>{c}</option>)}
                </select>
              </Row>
              <Row label="Size">
                <select value={creature.size} onChange={e=>setC('size',e.target.value)} style={inputStyle}>
                  {['Tiny','Small','Medium','Large','Huge','Gargantuan'].map(s => <option key={s}>{s}</option>)}
                </select>
              </Row>
              <Row label="HP / AC / Speed" style={{gap:'5px'}}>
                <input type="number" value={creature.hp} onChange={e=>setC('hp',e.target.value)} style={{...inputStyle,width:'70px'}} placeholder="HP" />
                <input type="number" value={creature.ac} onChange={e=>setC('ac',e.target.value)} style={{...inputStyle,width:'70px'}} placeholder="AC" />
                <input type="number" value={creature.speed} onChange={e=>setC('speed',e.target.value)} style={{...inputStyle,width:'70px'}} placeholder="Speed" />
              </Row>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:'5px',marginTop:'4px' }}>
                {['str','dex','con','int','wis','cha'].map(s => (
                  <div key={s} style={{ textAlign:'center' }}>
                    <div style={{ fontSize:'.6rem',color:'var(--parch3,#aaa)',textTransform:'uppercase' }}>{s}</div>
                    <input type="number" min="1" max="30" value={creature[s]} onChange={e=>setC(s,e.target.value)}
                      style={{ width:'100%',padding:'3px',background:'rgba(255,255,255,.07)',border:'1px solid rgba(255,255,255,.15)',borderRadius:'4px',color:'var(--parch,#e8dcc0)',fontSize:'.7rem',textAlign:'center',outline:'none' }} />
                  </div>
                ))}
              </div>
              <div style={{ fontSize:'.65rem',color:'var(--gold,#c8922a)',marginTop:'4px',letterSpacing:'.08em' }}>ATTACK</div>
              <Row label="Name"><input value={creature.atkName} onChange={e=>setC('atkName',e.target.value)} style={inputStyle} /></Row>
              <Row label="+Hit / Damage">
                <input type="number" value={creature.atkBonus} onChange={e=>setC('atkBonus',e.target.value)} style={{...inputStyle,width:'60px'}} />
                <input value={creature.atkDamage} onChange={e=>setC('atkDamage',e.target.value)} placeholder="1d6+2" style={{...inputStyle,width:'100px',marginLeft:'6px'}} />
                <select value={creature.atkType} onChange={e=>setC('atkType',e.target.value)} style={{...inputStyle,marginLeft:'6px'}}>
                  {['slashing','piercing','bludgeoning','poison','fire','cold','necrotic','radiant'].map(t => <option key={t}>{t}</option>)}
                </select>
              </Row>
              <div style={{ fontSize:'.65rem',color:'var(--parch3,#aaa)',letterSpacing:'.08em' }}>SPECIAL EFFECT ON HIT (optional)</div>
              <Row label="Save stat">
                <select value={creature.atkSpecialStat} onChange={e=>setC('atkSpecialStat',e.target.value)} style={inputStyle}>
                  <option value="">None</option>
                  {['STR','DEX','CON','INT','WIS','CHA'].map(s => <option key={s}>{s}</option>)}
                </select>
              </Row>
              {creature.atkSpecialStat && <>
                <Row label="Save DC"><input type="number" value={creature.atkSpecialDC} onChange={e=>setC('atkSpecialDC',e.target.value)} style={{...inputStyle,width:'60px'}} /></Row>
                <Row label="Effect">
                  <select value={creature.atkSpecialEffect} onChange={e=>setC('atkSpecialEffect',e.target.value)} style={inputStyle}>
                    {STATUS_EFFECTS.map(s => <option key={s}>{s}</option>)}
                  </select>
                </Row>
                <Row label="Desc"><input value={creature.atkSpecialDesc} onChange={e=>setC('atkSpecialDesc',e.target.value)} placeholder="knocked prone" style={inputStyle} /></Row>
              </>}
              <Row label="Gold loot (min–max)">
                <input type="number" value={creature.lootGoldMin} onChange={e=>setC('lootGoldMin',e.target.value)} style={{...inputStyle,width:'60px'}} />
                <input type="number" value={creature.lootGoldMax} onChange={e=>setC('lootGoldMax',e.target.value)} style={{...inputStyle,width:'60px',marginLeft:'6px'}} />
              </Row>
              <Row label="Attack flavors (comma-sep)">
                <input value={creature.flavor} onChange={e=>setC('flavor',e.target.value)} placeholder="lunges at you, slashes viciously" style={inputStyle} />
              </Row>
              <Row label="Description">
                <textarea value={creature.description} onChange={e=>setC('description',e.target.value)} placeholder="A creature born from shadow..." style={{...inputStyle,minHeight:'50px',resize:'vertical'}} />
              </Row>
            </div>
          )}

          {/* Validation warnings */}
          {warnings.length > 0 && (
            <div style={{ marginTop:'10px',padding:'8px 10px',background:'rgba(255,160,40,.08)',border:'1px solid rgba(255,160,40,.25)',borderRadius:'6px' }}>
              <div style={{ fontSize:'.65rem',color:'#ffa040',marginBottom:'4px',fontWeight:'bold' }}>⚠ Balance adjustments applied:</div>
              {warnings.map((w,i) => <div key={i} style={{ fontSize:'.65rem',color:'#ffa040' }}>• {w}</div>)}
            </div>
          )}

          {/* Result */}
          {result && (
            <div style={{ marginTop:'10px',padding:'8px 10px',background:result.ok?'rgba(78,203,113,.08)':'rgba(200,50,50,.08)',border:`1px solid ${result.ok?'rgba(78,203,113,.3)':'rgba(200,50,50,.3)'}`,borderRadius:'6px',fontSize:'.74rem',color:result.ok?'#4ecb71':'#e05050' }}>
              {result.ok ? '✓ ' : '✗ '}{result.message}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 16px',borderTop:'1px solid rgba(200,146,42,.2)',display:'flex',gap:'8px' }}>
          <button onClick={onClose} style={{ flex:1,padding:'8px',background:'transparent',border:'1px solid rgba(255,255,255,.2)',borderRadius:'6px',color:'#aaa',cursor:'pointer',fontSize:'.8rem' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ flex:2,padding:'8px',background:'rgba(200,146,42,.2)',border:'1px solid rgba(200,146,42,.5)',borderRadius:'6px',color:'var(--gold,#c8922a)',cursor:'pointer',fontSize:'.8rem',fontWeight:'bold',opacity:saving?.5:1 }}>
            {saving ? '⏳ Registering…' : `✓ Register ${tab}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ display:'flex',alignItems:'flex-start',gap:'8px' }}>
      <div style={{ fontSize:'.65rem',color:'var(--parch3,#aaa)',minWidth:'100px',paddingTop:'6px',flexShrink:0 }}>{label}</div>
      <div style={{ flex:1,display:'flex',flexWrap:'wrap',gap:'4px' }}>{children}</div>
    </div>
  )
}

const inputStyle = {
  flex: 1, padding: '5px 8px', fontSize: '.74rem',
  background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.2)',
  borderRadius: '5px', color: 'var(--parch,#e8dcc0)', outline: 'none',
}

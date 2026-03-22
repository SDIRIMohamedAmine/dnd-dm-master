// src/components/SpellbookPanel.js
// Shows all known spells with their compiled mechanics.
// For spells with no compiled definition yet, offers a "Compile" button.
// This turns the spellbook from a list of names into a real mechanical reference.
import { useState, useEffect } from 'react'
import { getSpellDef } from '../combat/engine'
import { loadCompiledSpell, compileSpell, deleteCompiledSpell, listCompiledSpells } from '../lib/spellCompiler'
import { fetchSpell } from '../combat/spellResolver'

const SCHOOL_COLORS = {
  evocation: '#ff6040', necromancy: '#9060ff', enchantment: '#40a0ff',
  abjuration: '#4090ff', conjuration: '#40c080', illusion: '#c080ff',
  transmutation: '#ffa040', divination: '#40d0d0',
}

export default function SpellbookPanel({ character, campaignId }) {
  const [spells,       setSpells]       = useState([])
  const [compiling,    setCompiling]    = useState(null)
  const [expanded,     setExpanded]     = useState(null)
  const [filter,       setFilter]       = useState('all')  // all | compiled | unknown

  const knownSpells = (character?.spells || []).map(s => s.replace(/\s*\(cantrip\)/i, '').trim())

  useEffect(() => {
    if (!knownSpells.length) return
    loadAllSpellData()
  }, [character?.spells?.length, campaignId]) // eslint-disable-line

  async function loadAllSpellData() {
    // Load compiled spells for this campaign
    const compiledList = campaignId ? await listCompiledSpells(campaignId) : []
    const compiledMap  = Object.fromEntries(compiledList.map(s => [s.name.toLowerCase(), s.definition]))

    const result = await Promise.all(knownSpells.map(async (name) => {
      // Priority: local engine dict → compiled DB → Open5e
      const localDef   = getSpellDef(name)
      const compiledDef = compiledMap[name.toLowerCase()]

      if (compiledDef) {
        return { name, source: 'compiled', data: compiledDef }
      }
      if (localDef) {
        return { name, source: 'engine', data: { ...localDef, name } }
      }
      // Try Open5e (async, may be null)
      const open5e = await fetchSpell(name).catch(() => null)
      if (open5e) {
        return { name, source: 'open5e', data: open5e }
      }
      return { name, source: 'unknown', data: null }
    }))

    setSpells(result)
  }

  async function handleCompile(spellName) {
    setCompiling(spellName)
    try {
      const compiled = await compileSpell({
        name: spellName,
        description: `Spell: ${spellName}. Infer mechanics from name and common D&D knowledge.`,
        campaignId,
        character,
      })
      if (compiled) {
        setSpells(prev => prev.map(s =>
          s.name === spellName ? { ...s, source: 'compiled', data: compiled } : s
        ))
      }
    } finally {
      setCompiling(null)
    }
  }

  async function handleRecompile(spellName) {
    if (campaignId) await deleteCompiledSpell(campaignId, spellName)
    await handleCompile(spellName)
  }

  const filtered = spells.filter(s => {
    if (filter === 'compiled') return s.source === 'compiled' || s.source === 'engine' || s.source === 'open5e'
    if (filter === 'unknown')  return s.source === 'unknown'
    return true
  })

  const unknownCount = spells.filter(s => s.source === 'unknown').length

  return (
    <div style={{ padding: '12px', color: 'var(--parch, #e8dcc0)' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '.72rem', letterSpacing: '.12em', color: 'var(--gold, #c8922a)', textTransform: 'uppercase', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>📖 Spellbook</span>
        <span style={{ fontSize: '.6rem', opacity: .6 }}>{spells.length} spells</span>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
        {['all', 'compiled', 'unknown'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '3px 8px', fontSize: '.6rem', borderRadius: '10px', cursor: 'pointer',
            border: filter === f ? '1px solid var(--gold, #c8922a)' : '1px solid rgba(255,255,255,.15)',
            background: filter === f ? 'rgba(200,146,42,.15)' : 'transparent',
            color: filter === f ? 'var(--gold, #c8922a)' : 'var(--parch3, #aaa)',
          }}>
            {f === 'all' ? `All (${spells.length})` : f === 'unknown' ? `Unknown (${unknownCount})` : 'Coded'}
          </button>
        ))}
      </div>

      {unknownCount > 0 && filter === 'all' && (
        <div style={{ fontSize: '.68rem', color: '#ffa040', marginBottom: '8px', padding: '6px 8px', background: 'rgba(255,160,64,.08)', borderRadius: '6px', border: '1px solid rgba(255,160,64,.2)' }}>
          ⚠ {unknownCount} spell{unknownCount > 1 ? 's' : ''} have no mechanical code yet.
          <button onClick={() => spells.filter(s => s.source === 'unknown').forEach(s => handleCompile(s.name))}
            style={{ marginLeft: '8px', padding: '2px 6px', fontSize: '.62rem', cursor: 'pointer', background: 'rgba(255,160,64,.2)', border: '1px solid rgba(255,160,64,.4)', borderRadius: '4px', color: '#ffa040' }}>
            Compile all
          </button>
        </div>
      )}

      {/* Spell list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {filtered.map(({ name, source, data }) => {
          const isExpanded = expanded === name
          const color = data?.school ? SCHOOL_COLORS[data.school] || '#a0a0a0' : '#666'
          const isCompiling = compiling === name

          return (
            <div key={name} style={{ background: 'rgba(255,255,255,.04)', borderRadius: '6px', border: '1px solid rgba(255,255,255,.08)', overflow: 'hidden' }}>
              {/* Header row */}
              <button onClick={() => setExpanded(isExpanded ? null : name)} style={{
                width: '100%', padding: '7px 10px', display: 'flex', alignItems: 'center', gap: '8px',
                background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
              }}>
                <span style={{ fontSize: '16px' }}>{data?.icon || '✨'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.78rem', color: 'var(--parch, #e8dcc0)', fontWeight: 500 }}>{name}</div>
                  <div style={{ fontSize: '.62rem', color: 'var(--parch3, #aaa)', marginTop: '1px' }}>
                    {data ? `Lv${data.level || 0} ${data.school || ''} · ${data.castAs || 'action'}` : 'No mechanics compiled'}
                  </div>
                </div>
                {/* Source badge */}
                <span style={{
                  fontSize: '.55rem', padding: '1px 5px', borderRadius: '8px', flexShrink: 0,
                  background: source === 'compiled' ? 'rgba(160,100,255,.2)' : source === 'engine' ? 'rgba(80,200,130,.15)' : source === 'open5e' ? 'rgba(80,150,255,.15)' : 'rgba(255,100,50,.15)',
                  color: source === 'compiled' ? '#c080ff' : source === 'engine' ? '#4ecb71' : source === 'open5e' ? '#7eb8ff' : '#ff8060',
                  border: `1px solid ${source === 'compiled' ? 'rgba(160,100,255,.3)' : source === 'engine' ? 'rgba(80,200,130,.3)' : source === 'open5e' ? 'rgba(80,150,255,.3)' : 'rgba(255,100,50,.3)'}`,
                }}>
                  {source === 'compiled' ? '🔮 compiled' : source === 'engine' ? '⚡ built-in' : source === 'open5e' ? '📖 SRD' : '❓ unknown'}
                </span>
              </button>

              {/* Expanded mechanics */}
              {isExpanded && (
                <div style={{ padding: '0 10px 10px', borderTop: '1px solid rgba(255,255,255,.06)' }}>
                  {data ? (
                    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <SpellStat label="Type"       value={data.spellType} />
                      <SpellStat label="Range"      value={data.rangeType} />
                      {data.damageDice  && <SpellStat label="Damage" value={`${data.damageDice} ${data.damageType || ''}`} highlight />}
                      {data.saveStat    && <SpellStat label="Save"   value={`${data.saveStat}${data.saveOnHalf ? ' (half on save)' : ''}`} />}
                      {data.isHeal && data.healDice && <SpellStat label="Healing" value={data.healDice} highlight color="#4ecb71" />}
                      {data.statusEffect && <SpellStat label="Effect" value={`${data.statusEffect.effectId} ${data.statusEffect.duration}t`} />}
                      {data.concentration && <SpellStat label="Concentration" value="Yes" color="#ffa040" />}
                      {data.mechanics?.notes && (
                        <div style={{ fontSize: '.68rem', color: 'var(--parch3, #aaa)', marginTop: '4px', lineHeight: 1.5, padding: '5px 7px', background: 'rgba(255,255,255,.04)', borderRadius: '4px' }}>
                          📝 {data.mechanics.notes}
                        </div>
                      )}
                      <div style={{ fontSize: '.65rem', color: 'var(--parch3, #aaa)', marginTop: '2px', lineHeight: 1.5 }}>
                        {data.description}
                      </div>
                      {/* Recompile button for compiled spells */}
                      {(source === 'compiled' || source === 'unknown') && (
                        <button onClick={() => handleRecompile(name)} disabled={!!compiling}
                          style={{ marginTop: '4px', padding: '3px 8px', fontSize: '.62rem', cursor: 'pointer', background: 'rgba(160,100,255,.1)', border: '1px solid rgba(160,100,255,.3)', borderRadius: '4px', color: '#c080ff', opacity: compiling ? .5 : 1 }}>
                          {compiling === name ? '⏳ Recompiling…' : '🔄 Recompile mechanics'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div style={{ marginTop: '8px' }}>
                      <div style={{ fontSize: '.7rem', color: 'var(--parch3, #aaa)', marginBottom: '6px' }}>
                        No mechanical definition. Casting this spell in combat will auto-compile it, or compile now:
                      </div>
                      <button onClick={() => handleCompile(name)} disabled={!!compiling}
                        style={{ padding: '5px 12px', fontSize: '.72rem', cursor: 'pointer', background: 'rgba(160,100,255,.15)', border: '1px solid rgba(160,100,255,.4)', borderRadius: '6px', color: '#c080ff' }}>
                        {isCompiling ? '⏳ Compiling…' : '🔮 Compile spell mechanics'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SpellStat({ label, value, highlight, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.68rem', padding: '2px 0' }}>
      <span style={{ color: 'var(--parch3, #aaa)' }}>{label}</span>
      <span style={{ color: color || (highlight ? 'var(--gold, #c8922a)' : 'var(--parch, #e8dcc0)'), fontWeight: highlight ? 500 : 400 }}>{value}</span>
    </div>
  )
}

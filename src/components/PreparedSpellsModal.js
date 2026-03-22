// src/components/PreparedSpellsModal.js
import { useState, useMemo } from 'react'
import { CLASS_SPELLS_BY_LEVEL } from '../lib/classData'

const PREP_RULES = {
  Cleric:  { stat: 'wisdom',       label: 'WIS', formula: (lvl, mod) => Math.max(1, lvl + mod) },
  Druid:   { stat: 'wisdom',       label: 'WIS', formula: (lvl, mod) => Math.max(1, lvl + mod) },
  Paladin: { stat: 'charisma',     label: 'CHA', formula: (lvl, mod) => Math.max(1, Math.floor(lvl / 2) + mod) },
  Wizard:  { stat: 'intelligence', label: 'INT', formula: (lvl, mod) => Math.max(1, lvl + mod) },
}

export default function PreparedSpellsModal({ character, onSave, onClose }) {
  // ── All hooks must come before any conditional return ──────────────────
  const rule       = PREP_RULES[character.class]
  const statScore  = character[rule?.stat] || 10
  const statMod    = Math.floor((statScore - 10) / 2)
  const maxPrepared = rule ? rule.formula(character.level || 1, statMod) : 0

  const allSpells = useMemo(() => {
    if (!rule) return []
    const list   = CLASS_SPELLS_BY_LEVEL[character.class] || {}
    const spells = []
    for (let lvl = 1; lvl <= (character.level || 1); lvl++) {
      const slotLevel = character.spell_slots?.[String(lvl)]
      if (!slotLevel) continue
      for (const s of (list[lvl] || [])) spells.push({ name: s, level: lvl })
    }
    return spells
  }, [rule, character.class, character.level, character.spell_slots])

  const cantrips = useMemo(() => {
    if (!rule) return []
    return (CLASS_SPELLS_BY_LEVEL[character.class]?.cantrip || []).map(s => s + ' (cantrip)')
  }, [rule, character.class])

  const currentPrepared = useMemo(
    () => (character.spells || []).filter(s => !s.includes('(cantrip)')),
    [character.spells]
  )

  const [prepared, setPrepared] = useState(() => new Set(currentPrepared))

  // ── Early return AFTER all hooks ───────────────────────────────────────
  if (!rule) return null

  function toggle(spellName) {
    setPrepared(prev => {
      const next = new Set(prev)
      if (next.has(spellName)) {
        next.delete(spellName)
      } else {
        if (next.size >= maxPrepared) return prev
        next.add(spellName)
      }
      return next
    })
  }

  function handleSave() {
    onSave([...cantrips, ...Array.from(prepared)])
  }

  const byLevel = {}
  for (const s of allSpells) {
    if (!byLevel[s.level]) byLevel[s.level] = []
    byLevel[s.level].push(s.name)
  }

  const remaining = maxPrepared - prepared.size

  return (
    <div style={{
      position:'fixed',inset:0,background:'rgba(0,0,0,.75)',display:'flex',
      alignItems:'center',justifyContent:'center',zIndex:1000
    }}>
      <div style={{
        background:'var(--surface-0,#1a0e00)',border:'1px solid rgba(200,146,42,.3)',
        borderRadius:'12px',width:'480px',maxHeight:'80vh',display:'flex',
        flexDirection:'column',overflow:'hidden'
      }}>

        {/* Header */}
        <div style={{padding:'14px 16px',borderBottom:'1px solid rgba(200,146,42,.2)',
          display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontFamily:'var(--font-display,serif)',color:'var(--gold,#c8922a)',
              fontSize:'.9rem',letterSpacing:'.08em'}}>
              📖 Prepare Spells
            </div>
            <div style={{fontSize:'.72rem',color:'var(--parch3,#aaa)',marginTop:'2px'}}>
              {character.name} · {character.class} · Level {character.level}
              · {rule.label} {statMod >= 0 ? '+' : ''}{statMod}
            </div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:'.8rem',fontWeight:'bold',
              color: remaining === 0 ? '#e08060' : '#4ecb71'}}>
              {prepared.size} / {maxPrepared}
            </div>
            <div style={{fontSize:'.65rem',color:'var(--parch3,#aaa)'}}>prepared</div>
          </div>
        </div>

        {/* Cantrips note */}
        {cantrips.length > 0 && (
          <div style={{padding:'8px 16px',background:'rgba(200,146,42,.05)',
            fontSize:'.72rem',color:'var(--parch3,#aaa)'}}>
            Always prepared: {cantrips.map(c => c.replace(' (cantrip)','')).join(', ')}
          </div>
        )}

        {/* Spell list */}
        <div style={{overflowY:'auto',flex:1,padding:'8px 16px'}}>
          {Object.entries(byLevel).map(([lvl, spells]) => (
            <div key={lvl} style={{marginBottom:'12px'}}>
              <div style={{fontSize:'.6rem',letterSpacing:'.12em',color:'var(--gold,#c8922a)',
                textTransform:'uppercase',marginBottom:'6px',
                borderBottom:'1px solid rgba(200,146,42,.15)',paddingBottom:'3px'}}>
                Level {lvl} Spells
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:'5px'}}>
                {spells.map(spell => {
                  const isPrepared = prepared.has(spell)
                  const isAtCap    = !isPrepared && prepared.size >= maxPrepared
                  return (
                    <button key={spell} onClick={() => toggle(spell)} disabled={isAtCap}
                      style={{
                        padding:'4px 10px',borderRadius:'20px',fontSize:'.72rem',cursor:'pointer',
                        border: isPrepared
                          ? '1px solid rgba(200,146,42,.6)'
                          : '1px solid rgba(255,255,255,.15)',
                        background: isPrepared ? 'rgba(200,146,42,.18)' : 'transparent',
                        color: isPrepared
                          ? 'var(--gold,#c8922a)'
                          : isAtCap ? 'rgba(255,255,255,.3)'
                          : 'var(--parch,#e8dcc0)',
                        transition:'all .15s',
                      }}>
                      {isPrepared ? '✓ ' : ''}{spell}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {Object.keys(byLevel).length === 0 && (
            <div style={{color:'var(--parch3,#aaa)',fontSize:'.8rem',padding:'12px 0'}}>
              No spells available yet. Gain levels and spell slots first.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{padding:'12px 16px',borderTop:'1px solid rgba(200,146,42,.2)',
          display:'flex',gap:'8px'}}>
          <button onClick={onClose} style={{
            flex:1,padding:'8px',background:'transparent',
            border:'1px solid rgba(255,255,255,.2)',borderRadius:'6px',
            color:'var(--parch3,#aaa)',cursor:'pointer',fontSize:'.8rem'}}>
            Cancel
          </button>
          <button onClick={handleSave} style={{
            flex:2,padding:'8px',background:'rgba(200,146,42,.2)',
            border:'1px solid rgba(200,146,42,.5)',borderRadius:'6px',
            color:'var(--gold,#c8922a)',cursor:'pointer',
            fontSize:'.8rem',fontWeight:'bold'}}>
            Confirm ({prepared.size}/{maxPrepared} prepared)
          </button>
        </div>
      </div>
    </div>
  )
}
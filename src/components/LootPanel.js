// src/components/LootPanel.js
// Fetches real loot from the knowledge_chunks database
// based on the actual creature's stat block and equipment
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { rollHealDice } from '../lib/items'
import './LootPanel.css'

// Parse what a creature would realistically carry from its stat block text
function extractCreatureLoot(creatureName, chunkText, cr) {
  const loot = []
  const text  = chunkText || ''

  // ── Gold from CR ────────────────────────────────────────
  const crGoldRanges = {
    '0':   [0,2],   '1/8': [1,6],   '1/4': [2,10],
    '1/2': [3,15],  '1':   [5,25],  '2':   [10,50],
    '3':   [20,80], '4':   [30,120],'5':   [50,200],
  }
  const [min, max] = crGoldRanges[cr] || [1,8]
  const gold = min + Math.floor(Math.random() * (max - min + 1))
  if (gold > 0) loot.push({ name: 'Gold Pieces', qty: gold, value: 1, desc: `${gold} gold pieces found on the body.`, icon: '⚙', source: 'gold' })

  // ── Weapons from Actions ─────────────────────────────────
  // Parse attack names from the stat block
  const actionSection = text.match(/Actions:\s*([\s\S]+?)(?:\nReactions:|$)/)?.[1] || ''
  const weaponMatches = [...actionSection.matchAll(/•\s*([^:]+):\s*Melee Weapon Attack/gi)]
  for (const m of weaponMatches) {
    const weaponName = m[1].trim()
    // Skip generic "Multiattack" or class features
    if (!/multiattack|claw|bite|slam|gore|tail|tentacle|sting|hoof|ram|gore|trample/i.test(weaponName)) {
      // Damage dice from same line
      const lineMatch = actionSection.match(new RegExp(`${weaponName}[^\\n]+Hit:\\s*([^(]+)\\(([^)]+)\\)\\s*([\\w]+)\\s+damage`, 'i'))
      const dmg  = lineMatch ? `${lineMatch[2]} ${lineMatch[3]}` : '1d6 slashing'
      const avg  = lineMatch ? estimateValue(lineMatch[2]) : 5
      loot.push({ name: weaponName, qty: 1, value: avg, desc: `Looted from ${creatureName}. ${dmg} damage.`, icon: '⚔️', source: 'weapon' })
    }
  }

  // ── Armor from AC / description ──────────────────────────
  const armorMatch = text.match(/AC:\s*(\d+)\s*\(([^)]+)\)/i)
  if (armorMatch) {
    const armorName = armorMatch[2].trim()
    // Only physical armor, not natural armor or spells
    if (!/(natural|unarmored|mage armor|defense)/i.test(armorName)) {
      const cleanName = armorName.replace(/,.*$/, '').trim()
      const acVal = parseInt(armorMatch[1]) || 10
      const value = acVal >= 16 ? 75 : acVal >= 14 ? 50 : acVal >= 12 ? 10 : 5
      loot.push({ name: cleanName, qty: 1, value, desc: `${creatureName}'s armor. AC ${acVal}.`, icon: '🛡️', source: 'armor' })
    }
  }

  // ── Special items from description ───────────────────────
  const descLower = text.toLowerCase()
  if (descLower.includes('spellbook'))  loot.push({ name: 'Spellbook',    qty: 1, value: 50,  desc: 'Spell formulas and notes.',      icon: '📖', source: 'misc' })
  if (descLower.includes('staff'))      loot.push({ name: 'Staff',        qty: 1, value: 5,   desc: 'A magical or mundane staff.',    icon: '🏑', source: 'misc' })
  if (descLower.includes('wand'))       loot.push({ name: 'Wand',         qty: 1, value: 100, desc: 'A magical wand.',               icon: '🪄', source: 'misc' })
  if (descLower.includes('holy symbol')) loot.push({ name: 'Holy Symbol', qty: 1, value: 5,   desc: 'Divine focus for clerics.',     icon: '✝️', source: 'misc' })
  if (descLower.includes('pouch'))      loot.push({ name: 'Coin Pouch',   qty: 1, value: Math.floor(Math.random()*15)+5, desc:'A small leather pouch of coins.', icon:'👝', source:'misc' })

  // ── Creature-specific natural loot ───────────────────────
  const nameLower = creatureName.toLowerCase()
  const naturalDrops = {
    wolf:       [{ name:'Wolf Pelt',     qty:1, value:2,  desc:'Thick grey fur.',           icon:'🐺' }],
    dragon:     [{ name:'Dragon Scale',  qty:3, value:50, desc:'Iridescent and hard as steel.',icon:'🐉'}, { name:'Dragon Claw', qty:2, value:30, desc:'Razor sharp.',icon:'🦶'}],
    goblin:     [{ name:'Crude Dagger',  qty:1, value:2,  desc:'Chipped blade.',            icon:'🗡️'}],
    skeleton:   [{ name:'Bone Fragments',qty:3, value:1,  desc:'Alchemically useful.',      icon:'🦴'}],
    troll:      [{ name:'Troll Hide',    qty:1, value:5,  desc:'Slowly regenerating scraps.',icon:'🧶'}],
    vampire:    [{ name:'Vampire Fang',  qty:2, value:50, desc:'Valuable to hunters.',      icon:'🦷'}],
    zombie:     [{ name:'Rotted Cloth',  qty:1, value:0,  desc:'Worthless.',                icon:'🧶'}],
  }
  for (const [key, drops] of Object.entries(naturalDrops)) {
    if (nameLower.includes(key)) {
      for (const d of drops) {
        if (Math.random() < 0.75) loot.push({ ...d, source: 'natural' })
      }
    }
  }

  // Deduplicate by name
  const seen = new Set()
  return loot.filter(item => {
    if (seen.has(item.name)) return false
    seen.add(item.name)
    return true
  })
}

function estimateValue(diceExpr) {
  const m = diceExpr.match(/(\d*)d(\d+)([+-]\d+)?/)
  if (!m) return parseInt(diceExpr) || 5
  const avg = (parseInt(m[1]||1) * (parseInt(m[2])+1) / 2) + parseInt(m[3]||0)
  return Math.max(1, Math.floor(avg))
}

export default function LootPanel({ creatureName, isPickpocket, character, onTakeItem, onTakeAll, onClose }) {
  const dexMod = Math.floor(((character?.dexterity || 10) - 10) / 2)
  const [phase,   setPhase]   = useState(isPickpocket ? 'check' : 'loading')
  const [dieVal,  setDieVal]  = useState(0)
  const [rolling, setRolling] = useState(false)
  const [result,  setResult]  = useState(null)
  const [loot,    setLoot]    = useState(null)
  const [taken,   setTaken]   = useState(new Set())
  const [error,   setError]   = useState(null)
  const DC = 13

  useEffect(() => {
    if (phase === 'loading') fetchCreatureLoot()
  }, [phase]) // eslint-disable-line

  async function fetchCreatureLoot() {
    try {
      // Search by name — try exact, then partial
      let row = null
      const { data: exact } = await supabase
        .from('knowledge_chunks').select('content, name')
        .eq('type','monster').ilike('name', creatureName).limit(1)
      if (exact?.[0]) { row = exact[0] }

      if (!row) {
        const words = creatureName.split(' ').filter(w => w.length > 3)
        for (const word of [...words].reverse()) {
          const { data: partial } = await supabase
            .from('knowledge_chunks').select('content, name')
            .eq('type','monster').ilike('name', `%${word}%`).limit(3)
          if (partial?.length) {
            row = partial.sort((a,b) => {
              const as = a.name.toLowerCase().split(' ').filter(w => creatureName.toLowerCase().includes(w)).length
              const bs = b.name.toLowerCase().split(' ').filter(w => creatureName.toLowerCase().includes(w)).length
              return bs - as
            })[0]; break
          }
        }
      }

      const cr = row?.content?.match(/CR:\s*([^\s|,\n]+)/)?.[1]?.trim() || '1/4'
      const items = extractCreatureLoot(creatureName, row?.content || '', cr)
      setLoot(items)
      setPhase('loot')
    } catch (err) {
      setError(err.message)
      // Fallback: just gold
      setLoot([{ name:'Gold Pieces', qty: 2 + Math.floor(Math.random()*8), value:1, desc:'Some coins.', icon:'⚙', source:'gold' }])
      setPhase('loot')
    }
  }

  async function rollDexCheck() {
    setRolling(true)
    let count = 0
    const anim = setInterval(() => {
      setDieVal(Math.floor(Math.random()*20)+1)
      if (++count > 12) {
        clearInterval(anim)
        const finalRoll = Math.floor(Math.random()*20)+1
        const total     = finalRoll + dexMod
        setDieVal(finalRoll)
        setRolling(false)
        if (total >= DC) {
          setResult('success')
          setTimeout(() => setPhase('loading'), 1000)
        } else {
          setResult('fail')
        }
      }
    }, 60)
  }

  function takeItem(item) {
    if (taken.has(item.name)) return
    setTaken(prev => new Set([...prev, item.name]))
    onTakeItem(item.name, item.qty)
  }

  function takeAll() {
    if (!loot) return
    const remaining = loot.filter(i => !taken.has(i.name))
    remaining.forEach(i => setTaken(prev => new Set([...prev, i.name])))
    onTakeAll(remaining)
  }

  const totalValue = loot?.reduce((s,i) => s + (i.value * i.qty), 0).toFixed(0)
  const dexModStr  = dexMod >= 0 ? `+${dexMod}` : `${dexMod}`

  return (
    <div className="loot-backdrop" onClick={onClose}>
      <div className="loot-panel" onClick={e => e.stopPropagation()}>
        <div className="loot-header">
          <div className="loot-creature-icon">{isPickpocket ? '🤫' : '💀'}</div>
          <div className="loot-header-text">
            <div className="loot-title">{isPickpocket ? `Pickpocket: ${creatureName}` : `Searching: ${creatureName}`}</div>
            <div className="loot-subtitle">{isPickpocket ? 'Reach carefully into their pockets…' : 'You search the body for anything useful.'}</div>
          </div>
          <button className="loot-close" onClick={onClose}>✕</button>
        </div>

        {/* ── PICKPOCKET CHECK ── */}
        {phase === 'check' && (
          <div className="loot-check-phase">
            <div className="loot-check-info">
              <div className="loot-check-label">Sleight of Hand Check</div>
              <div className="loot-check-dc">DC {DC}</div>
              <div className="loot-check-mod">DEX modifier: {dexModStr}</div>
            </div>
            <div className="loot-dice-area">
              <div className={`loot-die ${rolling?'spinning':dieVal?'rolled':''} ${dieVal===20?'nat20':dieVal===1?'nat1':''}`}>
                {dieVal || 'd20'}
              </div>
              {dieVal > 0 && !rolling && !result && (
                <div className="loot-roll-calc">{dieVal} {dexMod>=0?'+':''}{dexMod} = <strong>{dieVal+dexMod}</strong> vs DC {DC}</div>
              )}
              {!dieVal && <button className="loot-roll-btn" onClick={rollDexCheck}>🎲 Roll Sleight of Hand</button>}
            </div>
            {result === 'success' && <div className="loot-result success"><div className="loot-result-icon">✓</div><div className="loot-result-text">{dieVal+dexMod} vs DC {DC} — <strong>Success!</strong><br/>Your nimble fingers find what you sought…</div></div>}
            {result === 'fail' && <div className="loot-result fail"><div className="loot-result-icon">✗</div><div className="loot-result-text">{dieVal+dexMod} vs DC {DC} — <strong>Failed!</strong><br/>Your hand is noticed.</div><button className="loot-close-btn" onClick={onClose}>Close</button></div>}
          </div>
        )}

        {/* ── LOADING ── */}
        {phase === 'loading' && (
          <div className="loot-check-phase">
            <div className="loot-loading">
              <div className="loot-loading-dots"><span/><span/><span/></div>
              <div style={{fontSize:'.78rem',color:'var(--parch3)'}}>Searching the body…</div>
            </div>
          </div>
        )}

        {/* ── LOOT ── */}
        {phase === 'loot' && loot && (
          <>
            <div className="loot-value-bar">
              <span>{loot.length} item{loot.length!==1?'s':''} found on {creatureName}</span>
              <span className="loot-total-value">≈ {totalValue} gp total</span>
            </div>
            <div className="loot-items">
              {loot.map((item, i) => {
                const isTaken = taken.has(item.name)
                return (
                  <div key={i} className={`loot-item ${isTaken?'taken':''}`} style={{animationDelay:`${i*0.07}s`}}>
                    <div className="loot-item-icon">{item.icon}</div>
                    <div className="loot-item-info">
                      <div className="loot-item-name">{item.name}{item.qty>1&&<span className="loot-qty"> ×{item.qty}</span>}</div>
                      <div className="loot-item-desc">{item.desc}</div>
                      {item.value > 0 && <div className="loot-item-value">≈ {(item.value*item.qty).toFixed(0)} gp</div>}
                    </div>
                    <button className={`loot-take-btn ${isTaken?'done':''}`} onClick={()=>!isTaken&&takeItem(item)} disabled={isTaken}>
                      {isTaken ? '✓' : 'Take'}
                    </button>
                  </div>
                )
              })}
            </div>
            <div className="loot-footer">
              {loot.some(i => !taken.has(i.name))
                ? <button className="loot-take-all-btn" onClick={takeAll}>⚙ Take All</button>
                : <div className="loot-all-taken">All items collected.</div>}
              <button className="loot-leave-btn" onClick={onClose}>Leave</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

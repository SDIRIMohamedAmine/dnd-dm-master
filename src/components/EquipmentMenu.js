// src/components/EquipmentMenu.js
// Lets the player use items from their inventory during the story
// Consumables trigger effects, all items can be "used" to narrate usage
import { useState } from 'react'
import './EquipmentMenu.css'

// Item categories and their effects
const ITEM_EFFECTS = {
  // Healing potions
  'potion of healing':        { type: 'heal',  amount: '2d4+2', desc: 'Restores 2d4+2 HP' },
  'potion of greater healing': { type: 'heal',  amount: '4d4+4', desc: 'Restores 4d4+4 HP' },
  'healing potion':            { type: 'heal',  amount: '2d4+2', desc: 'Restores 2d4+2 HP' },
  'potion':                    { type: 'heal',  amount: '2d4+2', desc: 'Restores 2d4+2 HP' },
  // Gold/money
  'gold':      { type: 'gold', desc: 'Add to your gold total' },
  'coin':      { type: 'gold', desc: 'Add to your gold total' },
  'coins':     { type: 'gold', desc: 'Add to your gold total' },
  'gp':        { type: 'gold', desc: 'Add to your gold total' },
  // Tools
  'rope':          { type: 'use',  desc: 'Tie things up, climb, set traps' },
  'torch':         { type: 'use',  desc: 'Provides light for 1 hour' },
  'thieves tools': { type: 'use',  desc: 'Pick locks (DEX check)' },
  'healer\'s kit': { type: 'heal', amount: '1', desc: 'Stabilize a dying creature (no roll)' },
  'antitoxin':     { type: 'cure', desc: 'Advantage on CON saves vs poison for 1 hour. Consume.' },
  'holy water':    { type: 'use',  desc: 'Deal 2d6 damage to undead/fiends' },
}

function getItemEffect(itemName) {
  const lower = itemName.toLowerCase()
  for (const [key, effect] of Object.entries(ITEM_EFFECTS)) {
    if (lower.includes(key)) return effect
  }
  // Detect by keywords
  if (lower.includes('potion')) return { type: 'heal', amount: '2d4+2', desc: 'Restores HP (amount varies)' }
  if (lower.includes('gold') || lower.includes(' gp') || lower.includes('coin')) return { type: 'gold', desc: 'Adds to gold' }
  if (lower.includes('scroll')) return { type: 'scroll', desc: 'Cast the spell on the scroll' }
  if (lower.includes('food') || lower.includes('ration')) return { type: 'use', desc: 'Eat to sustain yourself' }
  return { type: 'use', desc: 'Use this item' }
}

function rollHeal(expr) {
  if (!expr || expr === '1') return 1
  const m = expr.match(/(\d*)d(\d+)([+-]\d+)?/)
  if (!m) return parseInt(expr) || 2
  const count  = parseInt(m[1] || '1')
  const sides  = parseInt(m[2])
  const bonus  = parseInt(m[3] || '0')
  let total = 0
  for (let i = 0; i < count; i++) total += Math.floor(Math.random() * sides) + 1
  return total + bonus
}

function parseGoldAmount(itemName) {
  // e.g. "Bag of 50 Gold", "10 gp", "3 gold coins"
  const m = itemName.match(/(\d+)\s*(?:gold|gp|coin)/i)
  return m ? parseInt(m[1]) : 10
}

export default function EquipmentMenu({ character, onUseItem, onClose }) {
  const [result, setResult] = useState(null)
  const equipment = character.equipment || []

  function handleUse(item) {
    const effect = getItemEffect(item)

    if (effect.type === 'heal') {
      const healed = rollHeal(effect.amount)
      const newHP  = Math.min(character.max_hp, character.current_hp + healed)
      const actual = newHP - character.current_hp
      setResult({ item, msg: `You drink the ${item} and recover ${actual} HP. (${character.current_hp} → ${newHP})`, icon: '❤️' })
      onUseItem({ item, type: 'heal', hpChange: actual, consume: true })
    }
    else if (effect.type === 'gold') {
      const amount = parseGoldAmount(item)
      setResult({ item, msg: `You add ${amount} gp to your purse. (+${amount} gold)`, icon: '⚙' })
      onUseItem({ item, type: 'gold', goldChange: amount, consume: true })
    }
    else if (effect.type === 'cure') {
      setResult({ item, msg: `You use the ${item}. ${effect.desc}`, icon: '✨' })
      onUseItem({ item, type: 'cure', consume: true })
    }
    else {
      setResult({ item, msg: `You use the ${item}. Narrate this to the DM.`, icon: '🎒' })
      onUseItem({ item, type: 'use', consume: false })
    }
  }

  function handleGive(item) {
    setResult({ item, msg: `You give away the ${item}. Removed from inventory.`, icon: '🤝' })
    onUseItem({ item, type: 'give', consume: true })
  }

  function handleDrop(item) {
    setResult({ item, msg: `You drop the ${item}. Removed from inventory.`, icon: '🗑' })
    onUseItem({ item, type: 'drop', consume: true })
  }

  const [selected, setSelected] = useState(null)

  return (
    <div className="equip-backdrop" onClick={onClose}>
      <div className="equip-modal" onClick={e => e.stopPropagation()}>
        <div className="equip-header">
          <span className="equip-title">🎒 Inventory</span>
          <span className="equip-stats">HP {character.current_hp}/{character.max_hp} · {character.gold ?? 0} gp</span>
          <button className="equip-close" onClick={onClose}>✕</button>
        </div>

        {result && (
          <div className="equip-result">
            <span className="equip-result-icon">{result.icon}</span>
            <span>{result.msg}</span>
            <button className="equip-result-close" onClick={() => setResult(null)}>×</button>
          </div>
        )}

        <div className="equip-list">
          {equipment.length === 0 && <div className="equip-empty">Your inventory is empty.</div>}
          {equipment.map((item, i) => {
            const effect  = getItemEffect(item)
            const isOpen  = selected === i
            return (
              <div key={i} className={`equip-item ${isOpen ? 'open' : ''}`}>
                <button className="equip-item-row" onClick={() => setSelected(isOpen ? null : i)}>
                  <span className="equip-item-icon">
                    {effect.type === 'heal' ? '🧪' : effect.type === 'gold' ? '⚙' : effect.type === 'scroll' ? '📜' : '⚔️'}
                  </span>
                  <span className="equip-item-name">{item}</span>
                  <span className="equip-item-effect">{effect.desc}</span>
                  <span className="equip-item-arrow">{isOpen ? '▲' : '▼'}</span>
                </button>
                {isOpen && (
                  <div className="equip-item-actions">
                    <button className="equip-btn equip-btn-use" onClick={() => { handleUse(item); setSelected(null) }}>
                      {effect.type === 'heal' ? '🧪 Drink / Use' : effect.type === 'gold' ? '⚙ Add to Gold' : '⚡ Use'}
                    </button>
                    <button className="equip-btn equip-btn-give" onClick={() => { handleGive(item); setSelected(null) }}>🤝 Give Away</button>
                    <button className="equip-btn equip-btn-drop" onClick={() => { handleDrop(item); setSelected(null) }}>🗑 Drop</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

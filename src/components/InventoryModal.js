// src/components/InventoryModal.js
import { useState } from 'react'
import { getItem, applyItemEffect, ITEM_CATEGORIES } from '../lib/items'
import './InventoryModal.css'

export default function InventoryModal({ character, onUseItem, onDropItem, onClose }) {
  const [selectedItem, setSelectedItem]   = useState(null)
  const [lastResult,   setLastResult]     = useState(null)
  const [activeTab,    setActiveTab]      = useState('all')

  // Parse inventory: character.equipment is array of strings, may have duplicates
  // Convert to { name: quantity } map
  const inventoryMap = {}
  for (const item of (character.equipment || [])) {
    if (!item || item.trim() === '') continue
    inventoryMap[item] = (inventoryMap[item] || 0) + 1
  }

  const items = Object.entries(inventoryMap).map(([name, qty]) => ({
    name, qty, data: getItem(name),
  }))

  const tabs = [
    { id: 'all',        label: 'All' },
    { id: 'weapon',     label: '⚔️ Weapons' },
    { id: 'armor',      label: '🛡 Armor' },
    { id: 'consumable', label: '🧪 Consumables' },
    { id: 'misc',       label: '📦 Other' },
  ]

  const filtered = activeTab === 'all' ? items : items.filter(i => {
    if (activeTab === 'misc') return i.data.category === ITEM_CATEGORIES.TOOL || i.data.category === ITEM_CATEGORIES.MISC || i.data.category === ITEM_CATEGORIES.AMMO
    return i.data.category === activeTab
  })

  const selected = selectedItem ? items.find(i => i.name === selectedItem) : null

  function handleUse() {
    if (!selected) return
    const result = applyItemEffect(selected.name, character)
    setLastResult(result)
    onUseItem({ item: selected.name, ...result })
    if (result.consume) setSelectedItem(null)
  }

  function handleDrop() {
    if (!selected) return
    onDropItem(selected.name)
    setSelectedItem(null)
  }

  const canUse = selected && selected.data.category !== ITEM_CATEGORIES.WEAPON && selected.data.category !== ITEM_CATEGORIES.ARMOR

  return (
    <div className="inv-backdrop" onClick={onClose}>
      <div className="inv-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="inv-header">
          <span className="inv-title">🎒 Inventory</span>
          <div className="inv-header-stats">
            <span className="inv-stat">HP {character.current_hp}/{character.max_hp}</span>
            <span className="inv-stat gold">⚙ {character.gold ?? 0} gp</span>
          </div>
          <button className="inv-close" onClick={onClose}>✕</button>
        </div>

        {/* Result banner */}
        {lastResult && (
          <div className="inv-result">
            <span>{lastResult.message}</span>
            <button onClick={() => setLastResult(null)}>×</button>
          </div>
        )}

        {/* Tabs */}
        <div className="inv-tabs">
          {tabs.map(t => (
            <button key={t.id} className={`inv-tab ${activeTab === t.id ? 'active' : ''}`} onClick={() => setActiveTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="inv-body">
          {/* Item list */}
          <div className="inv-list">
            {filtered.length === 0 && (
              <div className="inv-empty">No {activeTab === 'all' ? 'items' : activeTab + 's'} in inventory.</div>
            )}
            {filtered.map(({ name, qty, data }) => (
              <button
                key={name}
                className={`inv-item-row ${selectedItem === name ? 'selected' : ''}`}
                onClick={() => setSelectedItem(selectedItem === name ? null : name)}
              >
                <span className="inv-item-icon">{data.icon || '📦'}</span>
                <div className="inv-item-info">
                  <span className="inv-item-name">{name}</span>
                  <span className="inv-item-cat">{data.category}</span>
                </div>
                <div className="inv-item-right">
                  {qty > 1 && <span className="inv-item-qty">×{qty}</span>}
                  {data.cost > 0 && <span className="inv-item-price">{data.cost} gp</span>}
                </div>
              </button>
            ))}
          </div>

          {/* Item detail panel */}
          <div className="inv-detail">
            {!selected ? (
              <div className="inv-detail-empty">
                <span>Select an item to see details</span>
              </div>
            ) : (
              <>
                <div className="inv-detail-header">
                  <span className="inv-detail-icon">{selected.data.icon || '📦'}</span>
                  <div>
                    <div className="inv-detail-name">{selected.name}</div>
                    <div className="inv-detail-meta">
                      {selected.data.category} · {selected.data.weight} lb · {selected.data.cost} gp
                    </div>
                  </div>
                </div>

                <div className="inv-detail-desc">{selected.data.desc}</div>

                {/* Weapon stats */}
                {selected.data.effect?.type === 'weapon' && (
                  <div className="inv-detail-stats">
                    <div className="inv-stat-row"><span>Damage</span><span>{selected.data.effect.damage} {selected.data.effect.damageType}</span></div>
                    <div className="inv-stat-row"><span>Attack</span><span>{selected.data.effect.attackStat === 'finesse' ? 'STR or DEX' : selected.data.effect.attackStat?.toUpperCase()}</span></div>
                    {selected.data.effect.range && <div className="inv-stat-row"><span>Range</span><span>{selected.data.effect.range} ft</span></div>}
                    {selected.data.effect.properties?.length > 0 && (
                      <div className="inv-stat-row"><span>Properties</span><span>{selected.data.effect.properties.join(', ')}</span></div>
                    )}
                  </div>
                )}

                {/* Armor stats */}
                {selected.data.effect?.type === 'armor' && (
                  <div className="inv-detail-stats">
                    {selected.data.effect.baseAC && <div className="inv-stat-row"><span>Base AC</span><span>{selected.data.effect.baseAC}{selected.data.effect.addDex ? ' + DEX' : ''}{selected.data.effect.maxDex !== null && selected.data.effect.maxDex !== undefined ? ` (max +${selected.data.effect.maxDex})` : ''}</span></div>}
                    {selected.data.effect.acBonus && <div className="inv-stat-row"><span>AC Bonus</span><span>+{selected.data.effect.acBonus}</span></div>}
                    {selected.data.effect.passive && <div className="inv-stat-row"><span>Passive</span><span>{selected.data.effect.passive}</span></div>}
                    {selected.data.effect.stealthDisadvantage && <div className="inv-stat-row warn"><span>⚠ Stealth</span><span>Disadvantage</span></div>}
                    {selected.data.effect.strRequired && <div className="inv-stat-row"><span>Requires</span><span>STR {selected.data.effect.strRequired}+</span></div>}
                    {selected.data.effect.attunement && <div className="inv-stat-row"><span>Attunement</span><span>Required</span></div>}
                  </div>
                )}

                {/* Heal stats */}
                {selected.data.effect?.type === 'heal' && (
                  <div className="inv-detail-stats">
                    <div className="inv-stat-row heal"><span>Heals</span><span>{selected.data.effect.dice} HP</span></div>
                    <div className="inv-stat-row"><span>Consumable</span><span>Yes — disappears after use</span></div>
                  </div>
                )}

                {/* Passive */}
                {selected.data.effect?.passive && (
                  <div className="inv-detail-passive">✦ Passive: {selected.data.effect.passive}</div>
                )}

                <div className="inv-detail-quantity">In bag: ×{selected.qty}</div>

                <div className="inv-detail-actions">
                  {canUse && (
                    <button className="inv-action-btn inv-use-btn" onClick={handleUse}>
                      {selected.data.useLabel || '⚡ Use'}
                    </button>
                  )}
                  {selected.data.category === ITEM_CATEGORIES.WEAPON && (
                    <div className="inv-action-note">Equip weapons in the Armor & Equipment page</div>
                  )}
                  {selected.data.category === ITEM_CATEGORIES.ARMOR && (
                    <div className="inv-action-note">Equip armor in the Armor & Equipment page</div>
                  )}
                  <button className="inv-action-btn inv-drop-btn" onClick={handleDrop}>
                    🗑 Drop
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

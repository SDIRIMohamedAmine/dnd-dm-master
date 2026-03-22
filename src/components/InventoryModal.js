// src/components/InventoryModal.js
import { useState, useEffect } from 'react'
import { getItem, applyItemEffect, ITEM_CATEGORIES, resolveItem } from '../lib/items'
import './InventoryModal.css'

export default function InventoryModal({ character, onUseItem, onDropItem, onClose }) {
  const [selectedItem, setSelectedItem]   = useState(null)
  const [lastResult,   setLastResult]     = useState(null)
  const [activeTab,    setActiveTab]      = useState('all')
  const [resolvedData, setResolvedData]   = useState({})

  // ── Build items BEFORE the useEffect that references it ──────
  const inventoryMap = {}
  for (const item of (character.equipment || [])) {
    if (!item || item.trim() === '') continue
    inventoryMap[item] = (inventoryMap[item] || 0) + 1
  }
  const items = Object.entries(inventoryMap).map(([name, qty]) => ({
    name, qty, data: resolvedData[name] || getItem(name),
  }))

  // Async-resolve unknown items via RAG (after items is declared)
  useEffect(() => {
    const unknownItems = items.filter(i =>
      i.data.cat === 'misc' && i.data.icon === '📦' && !resolvedData[i.name]
    )
    if (!unknownItems.length) return
    unknownItems.forEach(({ name }) => {
      resolveItem(name).then(data => {
        if (data) setResolvedData(prev => ({ ...prev, [name]: data }))
      }).catch(() => {})
    })
  }, [items.length]) // eslint-disable-line

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

                <div className="inv-detail-desc">{selected.data.desc || selected.data.passive || 'No description available.'}</div>

                {/* Weapon stats */}
                {selected.data.cat === 'weapon' && (
                  <div className="inv-detail-stats">
                    {selected.data.damage && <div className="inv-stat-row"><span>Damage</span><span>{selected.data.damage} {selected.data.dmgType}</span></div>}
                    {selected.data.finesse && <div className="inv-stat-row"><span>Attack stat</span><span>STR or DEX (Finesse)</span></div>}
                    {selected.data.versatile && <div className="inv-stat-row"><span>Versatile</span><span>{selected.data.versatile} two-handed</span></div>}
                    {selected.data.props?.length > 0 && <div className="inv-stat-row"><span>Properties</span><span>{selected.data.props.join(', ')}</span></div>}
                    {selected.data.cost > 0 && <div className="inv-stat-row"><span>Value</span><span>{selected.data.cost} gp</span></div>}
                    {selected.data.fromDB && <div className="inv-stat-row" style={{color:'#4ecb71',fontSize:'.65rem'}}><span>✓ Verified from SRD</span></div>}
                  </div>
                )}

                {/* Armor stats */}
                {selected.data.cat === 'armor' && (
                  <div className="inv-detail-stats">
                    {selected.data.baseAC && <div className="inv-stat-row"><span>Base AC</span><span>{selected.data.baseAC}{selected.data.addDex ? ' + DEX' : ''}{selected.data.maxDex != null ? ` (max +${selected.data.maxDex})` : ''}</span></div>}
                    {selected.data.acBonus && <div className="inv-stat-row"><span>AC Bonus</span><span>+{selected.data.acBonus}</span></div>}
                    {selected.data.stealthDis && <div className="inv-stat-row" style={{color:'#e08060'}}><span>⚠ Stealth</span><span>Disadvantage</span></div>}
                    {selected.data.strReq && <div className="inv-stat-row"><span>Requires</span><span>STR {selected.data.strReq}+</span></div>}
                    {selected.data.attunement && <div className="inv-stat-row"><span>Attunement</span><span>Required</span></div>}
                    {selected.data.fromDB && <div className="inv-stat-row" style={{color:'#4ecb71',fontSize:'.65rem'}}><span>✓ Verified from SRD</span></div>}
                  </div>
                )}

                {/* Magic item / jewelry passives */}
                {(selected.data.cat === 'jewelry' || selected.data.setCon || selected.data.setStr || selected.data.acBonus || selected.data.saveBonus || selected.data.hpBonus) && (
                  <div className="inv-detail-stats">
                    {selected.data.setCon && <div className="inv-stat-row" style={{color:'#4ecb71'}}><span>CON</span><span>Set to {selected.data.setCon} (if lower)</span></div>}
                    {selected.data.setStr && <div className="inv-stat-row" style={{color:'#4ecb71'}}><span>STR</span><span>Set to {selected.data.setStr} (if lower)</span></div>}
                    {selected.data.setInt && <div className="inv-stat-row" style={{color:'#4ecb71'}}><span>INT</span><span>Set to {selected.data.setInt} (if lower)</span></div>}
                    {selected.data.setWis && <div className="inv-stat-row" style={{color:'#4ecb71'}}><span>WIS</span><span>Set to {selected.data.setWis} (if lower)</span></div>}
                    {selected.data.setCha && <div className="inv-stat-row" style={{color:'#4ecb71'}}><span>CHA</span><span>Set to {selected.data.setCha} (if lower)</span></div>}
                    {selected.data.acBonus && <div className="inv-stat-row"><span>AC Bonus</span><span>+{selected.data.acBonus}</span></div>}
                    {selected.data.saveBonus && <div className="inv-stat-row"><span>Saving throws</span><span>+{selected.data.saveBonus}</span></div>}
                    {selected.data.hpBonus && <div className="inv-stat-row"><span>Max HP</span><span>+{selected.data.hpBonus}</span></div>}
                    {selected.data.attunement && <div className="inv-stat-row" style={{color:'#c8922a'}}><span>Attunement</span><span>Required</span></div>}
                    {selected.data.rarity && <div className="inv-stat-row"><span>Rarity</span><span style={{textTransform:'capitalize'}}>{selected.data.rarity}</span></div>}
                    {selected.data.fromDB && <div className="inv-stat-row" style={{color:'#4ecb71',fontSize:'.65rem'}}><span>✓ Verified from SRD</span></div>}
                  </div>
                )}

                {/* Heal stats */}
                {selected.data.heal && (
                  <div className="inv-detail-stats">
                    <div className="inv-stat-row heal"><span>Heals</span><span>{selected.data.heal} HP</span></div>
                    <div className="inv-stat-row"><span>Consumable</span><span>Yes — used on use</span></div>
                  </div>
                )}

                {/* Passive text */}
                {selected.data.passive && !selected.data.setCon && !selected.data.setStr && (
                  <div className="inv-detail-passive">✦ {selected.data.passive}</div>
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
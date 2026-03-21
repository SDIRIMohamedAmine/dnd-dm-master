// src/components/ArmorModal.js — BG3-style full equipment page
import { useState } from 'react'
import { EQUIPMENT_SLOTS, getItem, calculateAC, getEquippedPassives, detectItemSlot } from '../lib/items'
import './ArmorModal.css'

export default function ArmorModal({ character, onEquip, onUnequip, onClose }) {
  const [selectedSlot, setSelectedSlot] = useState(null)
  const [tooltip,      setTooltip]      = useState(null)

  const equipped   = character.equipped || {}
  const stats      = { dexterity: character.dexterity, constitution: character.constitution, wisdom: character.wisdom, class: character.class }
  const currentAC  = calculateAC(equipped, stats)
  const passives   = getEquippedPassives(equipped, { ...stats, strength: character.strength })

  // Inventory — items that can be equipped (not consumables/tools/misc)
  const inventoryMap = {}
  for (const item of (character.equipment || [])) {
    if (item) inventoryMap[item] = (inventoryMap[item]||0)+1
  }

  function getEquippableForSlot(slotId) {
    return Object.keys(inventoryMap).filter(itemName => {
      const det = detectItemSlot(itemName)
      if (slotId === 'ring2' && det === 'ring1') return true  // rings can go in either ring slot
      return det === slotId
    })
  }

  function handleEquip(slot, itemName) {
    onEquip(slot, itemName)
    setSelectedSlot(null)
  }

  const slotOrder = ['head','amulet','chest','cloak','hands','legs','feet','ring1','ring2','mainhand','offhand','ranged']

  return (
    <div className="armor-backdrop" onClick={onClose}>
      <div className="armor-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="armor-header">
          <span className="armor-title">⚔️ Equipment</span>
          <div className="armor-ac-badge">
            <span className="armor-ac-num">{currentAC}</span>
            <span className="armor-ac-lbl">AC</span>
          </div>
          <button className="armor-close" onClick={onClose}>✕</button>
        </div>

        {/* Passives */}
        {passives.length > 0 && (
          <div className="armor-passives">
            {passives.map((p,i) => (
              <div key={i} className="armor-passive-pill">✦ {p.item}: {p.text}</div>
            ))}
          </div>
        )}

        {/* Equipment grid */}
        <div className="armor-grid">
          {slotOrder.map(slotId => {
            const slot       = EQUIPMENT_SLOTS[slotId]
            const equippedName = equipped[slotId]
            const equippedItem = equippedName ? getItem(equippedName) : null
            const isOpen     = selectedSlot === slotId
            const equippable = getEquippableForSlot(slotId)

            return (
              <div key={slotId} className={`armor-slot-cell ${isOpen?'open':''} ${equippedName?'filled':''}`}>
                <button className="armor-slot-btn" onClick={() => setSelectedSlot(isOpen?null:slotId)}>
                  <div className="armor-slot-icon">{equippedName ? (equippedItem?.icon || slot.icon) : slot.icon}</div>
                  <div className="armor-slot-info">
                    <div className="armor-slot-label">{slot.label}</div>
                    <div className="armor-slot-item">{equippedName || '— empty —'}</div>
                    {equippedItem?.baseAC && (
                      <div className="armor-slot-stat">AC {equippedItem.baseAC}{equippedItem.addDex?'+DEX':''}</div>
                    )}
                    {equippedItem?.damage && (
                      <div className="armor-slot-stat">{equippedItem.damage} {equippedItem.dmgType}</div>
                    )}
                    {equippedItem?.acBonus && (
                      <div className="armor-slot-stat">+{equippedItem.acBonus} AC</div>
                    )}
                  </div>
                  {equippedName && (
                    <button className="armor-slot-remove" onClick={e=>{e.stopPropagation();onUnequip(slotId)}}>✕</button>
                  )}
                </button>

                {/* Item detail on equipped item */}
                {isOpen && equippedName && (
                  <div className="armor-item-detail">
                    <div className="armor-detail-name">{equippedName}</div>
                    <div className="armor-detail-body">
                      {equippedItem?.baseAC && (
                        <div className="armor-detail-row">
                          <span>AC</span>
                          <span>{equippedItem.baseAC}{equippedItem.addDex?` + DEX${equippedItem.maxDex!=null?` (max +${equippedItem.maxDex})`:''}`:''}</span>
                        </div>
                      )}
                      {equippedItem?.damage && (
                        <div className="armor-detail-row"><span>Damage</span><span>{equippedItem.damage} {equippedItem.dmgType}</span></div>
                      )}
                      {equippedItem?.props?.length > 0 && (
                        <div className="armor-detail-row"><span>Properties</span><span>{equippedItem.props.join(', ')}</span></div>
                      )}
                      {equippedItem?.acBonus && (
                        <div className="armor-detail-row"><span>AC Bonus</span><span>+{equippedItem.acBonus}</span></div>
                      )}
                      {equippedItem?.passive && (
                        <div className="armor-detail-passive">✦ {equippedItem.passive}</div>
                      )}
                      {equippedItem?.stealthDis && (
                        <div className="armor-detail-warn">⚠ Stealth Disadvantage</div>
                      )}
                      {equippedItem?.strReq && (
                        <div className="armor-detail-warn">⚠ Requires STR {equippedItem.strReq}</div>
                      )}
                      {equippedItem?.cost && (
                        <div className="armor-detail-row muted"><span>Value</span><span>{equippedItem.cost} gp</span></div>
                      )}
                    </div>
                  </div>
                )}

                {/* Swap picker */}
                {isOpen && (
                  <div className="armor-pick-panel">
                    <div className="armor-pick-title">
                      {equippable.length > 0 ? `Equip from inventory:` : `No ${slot.label.toLowerCase()} items in inventory.`}
                    </div>
                    {equippable.map(itemName => {
                      const d = getItem(itemName)
                      const isCurrent = equippedName === itemName
                      return (
                        <button key={itemName}
                          className={`armor-pick-item ${isCurrent?'current':''}`}
                          onClick={()=>!isCurrent&&handleEquip(slotId,itemName)}>
                          <span className="armor-pick-icon">{d.icon||'📦'}</span>
                          <div className="armor-pick-info">
                            <span className="armor-pick-name">{itemName}</span>
                            <span className="armor-pick-stat">
                              {d.baseAC?`AC ${d.baseAC}${d.addDex?'+DEX':''}`:d.damage?`${d.damage} ${d.dmgType||''}`:d.acBonus?`+${d.acBonus} AC`:d.desc?.slice(0,40)||''}
                            </span>
                          </div>
                          {isCurrent && <span className="armor-pick-equipped">Equipped</span>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="armor-footer">
          AC is recalculated automatically when you equip or remove items.
        </div>
      </div>
    </div>
  )
}

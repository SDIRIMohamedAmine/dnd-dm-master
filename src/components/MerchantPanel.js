// src/components/MerchantPanel.js
// Queries knowledge_chunks for real items with real SRD prices
// Merchant stock generated from context (NPC name, location, DM description)
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { getItem } from '../lib/items'
import './MerchantPanel.css'

// Parse real cost from a chunk's content field
// Open5e stores: "Cost: 25 gp" or "cost: 25 gp" or just the number
function parseCost(content) {
  const m = content?.match(/cost[:\s]+([0-9,]+)\s*(gp|sp|cp|pp)/i)
  if (!m) return null
  const amount = parseInt(m[1].replace(/,/g, ''))
  const unit   = m[2].toLowerCase()
  // Normalize everything to gp
  if (unit === 'sp') return Math.max(1, Math.round(amount / 10))
  if (unit === 'cp') return Math.max(1, Math.round(amount / 100))
  if (unit === 'pp') return amount * 10
  return amount
}

function parseWeight(content) {
  const m = content?.match(/weight[:\s]+([0-9.]+)\s*lb/i)
  return m ? parseFloat(m[1]) : null
}

function chunkToItem(row) {
  const cost   = parseCost(row.content) ?? 5
  const weight = parseWeight(row.content)
  // Pull one-line description: first sentence after any header line
  const descMatch = row.content.match(/\n([A-Z][^.!?\n]{10,120}[.!?])/)
  const desc = descMatch?.[1]?.trim() || row.content.split('\n').slice(1).find(l => l.length > 20)?.trim() || ''
  return {
    name:    row.name,
    cost,
    weight,
    desc:    desc.slice(0, 120),
    content: row.content,
    type:    row.type,
    icon:    iconForType(row.type, row.name),
  }
}

function iconForType(type, name) {
  if (type === 'weapon')     return '⚔️'
  if (type === 'armor')      return '🛡️'
  if (type === 'magic-item') return '✨'
  const n = name.toLowerCase()
  if (n.includes('potion'))  return '🧪'
  if (n.includes('scroll'))  return '📜'
  if (n.includes('torch'))   return '🔥'
  if (n.includes('rope'))    return '🪢'
  if (n.includes('ration'))  return '🍖'
  if (n.includes('book') || n.includes('spell')) return '📖'
  if (n.includes('shield'))  return '🛡️'
  if (n.includes('dagger') || n.includes('sword') || n.includes('axe')) return '⚔️'
  return '📦'
}

// Decide what to fetch based on merchant context
function getMerchantQueries(merchantContext) {
  const ctx = merchantContext.toLowerCase()
  // Blacksmith / armory
  if (/blacksmith|armory|weaponsmith|smith|forge/.test(ctx))
    return [
      { type: 'weapon', limit: 12 },
      { type: 'armor',  limit: 8  },
    ]
  // Apothecary / alchemist / herbalist
  if (/apothecary|alchemist|herb|potion|healer/.test(ctx))
    return [
      { type: 'weapon', name: 'potion', limit: 10 },
      { type: 'magic-item', name: 'potion', limit: 6 },
    ]
  // Magic shop / arcane
  if (/magic|arcane|wizard|scroll|enchant|sorcerer/.test(ctx))
    return [
      { type: 'magic-item', limit: 12 },
      { type: 'weapon', name: 'wand', limit: 4 },
    ]
  // General / market / tavern / trader
  return [
    { type: 'weapon',  limit: 6 },
    { type: 'armor',   limit: 4 },
    { type: 'weapon',  name: 'potion', limit: 4 },
  ]
}

async function fetchMerchantStock(merchantContext) {
  const queries   = getMerchantQueries(merchantContext)
  const allItems  = []
  const seenNames = new Set()

  for (const q of queries) {
    let query = supabase
      .from('knowledge_chunks')
      .select('chunk_id, type, name, content')
      .eq('type', q.type)

    if (q.name) query = query.ilike('name', `%${q.name}%`)

    // Only items that have a cost in the content
    query = query.ilike('content', '%cost%').limit(q.limit * 3)

    const { data } = await query
    if (!data?.length) continue

    for (const row of data) {
      if (seenNames.has(row.name)) continue
      const cost = parseCost(row.content)
      if (!cost) continue  // skip if no real price in the data
      seenNames.add(row.name)
      allItems.push(chunkToItem(row))
    }
  }

  // Sort by cost ascending, cap at 20 items
  return allItems.sort((a, b) => a.cost - b.cost).slice(0, 20)
}

export default function MerchantPanel({
  merchantContext = 'general store',
  merchantName    = 'Merchant',
  character,
  onBuy,
  onSell,
  onClose,
}) {
  const [tab,      setTab]      = useState('buy')
  const [stock,    setStock]    = useState(null)
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)
  const [buyQty,   setBuyQty]   = useState(1)
  const [msg,      setMsg]      = useState(null)
  const gold = character?.gold ?? 0

  useEffect(() => {
    fetchMerchantStock(merchantContext).then(items => {
      setStock(items)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [merchantContext])

  // Player inventory for selling — with real prices from chunks
  const [sellPrices, setSellPrices] = useState({})
  useEffect(() => {
    async function loadSellPrices() {
      const names  = [...new Set(character?.equipment || [])]
      const prices = {}
      for (const name of names) {
        // Try to get price from DB first
        const { data } = await supabase
          .from('knowledge_chunks')
          .select('content')
          .ilike('name', name)
          .limit(1)
        const cost = data?.[0] ? parseCost(data[0].content) : null
        // Sell at 50% SRD price, fallback to items.js data, fallback to 1 gp
        const baseCost = cost ?? getItem(name)?.cost ?? 2
        prices[name] = Math.max(1, Math.floor(baseCost * 0.5))
      }
      setSellPrices(prices)
    }
    if (character?.equipment?.length) loadSellPrices()
  }, [character?.equipment]) // eslint-disable-line

  function flash(text, type = 'ok') {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 2500)
  }

  function handleBuy() {
    if (!selected) return
    const item  = stock.find(i => i.name === selected)
    if (!item) return
    const total = item.cost * buyQty
    if (gold < total) { flash(`Need ${total} gp — you only have ${gold} gp.`, 'err'); return }
    onBuy(item.name, buyQty, total)
    flash(`Bought ${buyQty > 1 ? buyQty + '× ' : ''}${item.name} for ${total} gp.`)
    setSelected(null); setBuyQty(1)
  }

  function handleSell(itemName) {
    const earned = sellPrices[itemName] ?? 1
    onSell(itemName, 1, earned)
    flash(`Sold ${itemName} for ${earned} gp.`)
    setSelected(null)
  }

  // Inventory map with quantities
  const invMap = {}
  for (const item of character?.equipment || []) {
    if (item) invMap[item] = (invMap[item] || 0) + 1
  }
  const sellItems = Object.entries(invMap).map(([name, qty]) => ({
    name, qty, price: sellPrices[name] ?? 1,
    icon: iconForType('', name),
  }))

  const buyItem  = selected && tab === 'buy'  ? stock?.find(i => i.name === selected) : null
  const buyTotal = buyItem ? buyItem.cost * buyQty : 0

  return (
    <div className="merch-backdrop" onClick={onClose}>
      <div className="merch-panel" onClick={e => e.stopPropagation()}>

        <div className="merch-header">
          <div className="merch-shop-icon">🏪</div>
          <div className="merch-header-info">
            <div className="merch-shop-name">{merchantName}</div>
            <div className="merch-shop-flavor">{merchantContext}</div>
          </div>
          <div className="merch-gold-display">
            <span className="merch-gold-icon">⚙</span>
            <span className="merch-gold-value">{gold}</span>
            <span className="merch-gold-label">gp</span>
          </div>
          <button className="merch-close" onClick={onClose}>✕</button>
        </div>

        {msg && <div className={`merch-msg ${msg.type}`}>{msg.text}</div>}

        <div className="merch-tabs">
          <button className={`merch-tab ${tab==='buy'?'active':''}`}  onClick={() => { setTab('buy');  setSelected(null) }}>🛒 Buy</button>
          <button className={`merch-tab ${tab==='sell'?'active':''}`} onClick={() => { setTab('sell'); setSelected(null) }}>💰 Sell</button>
        </div>

        <div className="merch-body">

          {/* ── BUY ── */}
          {tab === 'buy' && (
            <>
              {loading && (
                <div className="merch-loading">
                  <div className="merch-loading-dots"><span/><span/><span/></div>
                  <div>Browsing {merchantName}'s wares…</div>
                </div>
              )}
              {!loading && !stock?.length && (
                <div className="merch-empty">This merchant has nothing in stock right now.</div>
              )}
              {!loading && !!stock?.length && (
                <div className="merch-stock">
                  {stock.map(item => {
                    const canAfford = gold >= item.cost
                    const isSel = selected === item.name
                    return (
                      <button key={item.name}
                        className={`merch-item ${isSel?'selected':''} ${!canAfford?'cant-afford':''}`}
                        onClick={() => { setSelected(isSel ? null : item.name); setBuyQty(1) }}>
                        <div className="merch-item-icon">{item.icon}</div>
                        <div className="merch-item-info">
                          <div className="merch-item-name">{item.name}</div>
                          <div className="merch-item-desc">{item.desc.slice(0,65)}{item.desc.length>65?'…':''}</div>
                        </div>
                        <div className="merch-item-price">
                          <span className="merch-price-val">{item.cost}</span>
                          <span className="merch-price-unit">gp</span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}

              {buyItem && (
                <div className="merch-buy-detail">
                  <div className="merch-detail-name">{buyItem.icon} {buyItem.name}</div>
                  <div className="merch-detail-desc">{buyItem.desc}</div>
                  {buyItem.weight && <div className="merch-detail-meta">Weight: {buyItem.weight} lb</div>}
                  <div className="merch-buy-controls">
                    <div className="merch-qty-ctrl">
                      <button onClick={() => setBuyQty(q => Math.max(1,q-1))}>−</button>
                      <span>{buyQty}</span>
                      <button onClick={() => setBuyQty(q => q+1)}>+</button>
                    </div>
                    <div className="merch-buy-total">
                      Total: <strong className={gold<buyTotal?'cant-afford':''}>
                        {buyTotal} gp
                      </strong>
                      <span className="merch-have">You have {gold} gp</span>
                    </div>
                    <button className="merch-buy-btn" onClick={handleBuy} disabled={gold<buyTotal}>
                      Buy {buyQty>1?`×${buyQty}`:''}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── SELL ── */}
          {tab === 'sell' && (
            <>
              {!sellItems.length
                ? <div className="merch-empty">Your inventory is empty. Nothing to sell.</div>
                : <div className="merch-stock">
                    {sellItems.map(item => (
                      <button key={item.name}
                        className={`merch-item ${selected===item.name?'selected':''}`}
                        onClick={() => setSelected(selected===item.name?null:item.name)}>
                        <div className="merch-item-icon">{item.icon}</div>
                        <div className="merch-item-info">
                          <div className="merch-item-name">{item.name}{item.qty>1&&<span className="merch-qty-badge">×{item.qty}</span>}</div>
                          <div className="merch-item-desc">You'll receive {item.price} gp (50% of SRD value)</div>
                        </div>
                        <div className="merch-item-price">
                          <span className="merch-price-val sell">{item.price}</span>
                          <span className="merch-price-unit">gp</span>
                        </div>
                      </button>
                    ))}
                  </div>}
              {selected && tab==='sell' && sellItems.find(i=>i.name===selected) && (
                <div className="merch-buy-detail">
                  <div className="merch-detail-name">{selected}</div>
                  <div className="merch-detail-desc">Selling at 50% of the standard SRD cost.</div>
                  <div className="merch-buy-controls">
                    <div className="merch-buy-total">
                      You receive: <strong className="sell-gold">{sellItems.find(i=>i.name===selected)?.price} gp</strong>
                    </div>
                    <button className="merch-sell-btn" onClick={() => handleSell(selected)}>
                      Sell for {sellItems.find(i=>i.name===selected)?.price} gp
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

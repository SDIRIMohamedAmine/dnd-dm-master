// src/components/EventToast.js
import { useState, useEffect, useCallback } from 'react'
import './EventToast.css'

let toastId = 0

// Global toast manager
const listeners = new Set()

export function showToast(message, type = 'info', duration = 3500) {
  const id = ++toastId
  const toast = { id, message, type, duration }
  listeners.forEach(fn => fn({ action: 'add', toast }))
  return id
}

export function showGameEvent(events) {
  if (!events) return
  const delay = (ms) => new Promise(r => setTimeout(r, ms))

  async function fire() {
    if (events.xpGain) {
      showToast(`+${events.xpGain} XP`, 'xp')
      await delay(400)
    }
    if (events.goldChange !== null && events.goldChange !== undefined) {
      const sign = events.goldChange >= 0 ? '+' : ''
      showToast(`${sign}${events.goldChange} gp`, events.goldChange >= 0 ? 'gold-gain' : 'gold-loss')
      await delay(400)
    }
    if (events.levelUp) {
      showToast(`⭐ Level Up! You are now level ${events.levelUp}`, 'levelup', 5000)
      await delay(400)
    }
    for (const item of (events.newItems || [])) {
      showToast(`📦 New item: ${item}`, 'item')
      await delay(300)
    }
    for (const item of (events.removeItems || [])) {
      showToast(`🗑 Used: ${item}`, 'remove')
      await delay(300)
    }
    for (const spell of (events.newSpells || [])) {
      showToast(`✨ Learned: ${spell}`, 'spell')
      await delay(300)
    }
    for (const npc of (events.newNPCs || [])) {
      const icon = npc.role === 'ally' ? '💚' : npc.role === 'foe' ? '❤️' : '⬜'
      showToast(`${icon} Met: ${npc.name}`, 'npc')
      await delay(300)
    }
    for (const quest of (events.newQuests || [])) {
      showToast(`📜 Quest: ${quest.title}`, 'quest', 4000)
      await delay(300)
    }
    for (const title of (events.questComplete || [])) {
      showToast(`✅ Completed: ${title}`, 'quest-complete', 4000)
      await delay(300)
    }
  }

  fire()
}

export default function EventToastContainer() {
  const [toasts, setToasts] = useState([])

  const handleEvent = useCallback(({ action, toast }) => {
    if (action === 'add') {
      setToasts(prev => [...prev, { ...toast, visible: true }])
      setTimeout(() => {
        setToasts(prev => prev.map(t => t.id === toast.id ? { ...t, visible: false } : t))
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== toast.id))
        }, 400)
      }, toast.duration)
    }
  }, [])

  useEffect(() => {
    listeners.add(handleEvent)
    return () => listeners.delete(handleEvent)
  }, [handleEvent])

  if (!toasts.length) return null

  return (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type} ${t.visible ? 'toast-in' : 'toast-out'}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

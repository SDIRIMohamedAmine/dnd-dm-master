// src/components/SuggestedActions.js
// DISABLED BY DEFAULT — user must opt in to avoid burning API quota
// When enabled, generates 4 action suggestions after each DM message
import { useState, useEffect, useRef } from 'react'
import { callAI } from '../lib/openrouter'
import './SuggestedActions.css'

// Local cache: avoid re-generating for the same DM message
const suggestionCache = new Map()

export default function SuggestedActions({ lastDMMessage, characterName, onSelect, disabled, enabled }) {
  const [suggestions, setSuggestions] = useState([])
  const [loading,     setLoading]     = useState(false)
  const prevMsgRef    = useRef('')

  useEffect(() => {
    // Only run if explicitly enabled by the user
    if (!enabled || !lastDMMessage || disabled) {
      setSuggestions([])
      return
    }
    if (lastDMMessage === prevMsgRef.current) return
    prevMsgRef.current = lastDMMessage

    // Check cache first — no API call needed if we've seen this message
    const cacheKey = lastDMMessage.slice(0, 100)
    if (suggestionCache.has(cacheKey)) {
      setSuggestions(suggestionCache.get(cacheKey))
      return
    }

    generateSuggestions(lastDMMessage, cacheKey)
  }, [lastDMMessage, enabled]) // eslint-disable-line

  async function generateSuggestions(dmText, cacheKey) {
    setLoading(true)
    setSuggestions([])
    try {
      const prompt = `D&D action suggestions. Given this DM message, give 4 short player responses.
One bold action, one cautious action, one social/roleplay, one investigative.
Return ONLY a JSON array of 4 strings, each under 8 words. No markdown.
DM: ${dmText.slice(0, 400)}`

      const raw    = await callAI([{ role: 'user', content: prompt }], 150)
      const clean  = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      if (Array.isArray(parsed)) {
        const final = parsed.slice(0, 4)
        suggestionCache.set(cacheKey, final)
        // Keep cache small
        if (suggestionCache.size > 20) suggestionCache.delete(suggestionCache.keys().next().value)
        setSuggestions(final)
      }
    } catch { /* Fail silently */ }
    finally { setLoading(false) }
  }

  if (!enabled) return null
  if (!suggestions.length && !loading) return null

  return (
    <div className="suggestions-row">
      {loading ? (
        <div className="suggestions-loading"><span/><span/><span/></div>
      ) : (
        suggestions.map((s, i) => (
          <button key={i} className="suggestion-chip" onClick={() => onSelect(s)} disabled={disabled}>
            {s}
          </button>
        ))
      )}
    </div>
  )
}

// src/components/SuggestedActions.js
import { useState, useEffect, useRef } from 'react'
import { callAI } from '../lib/openrouter'
import './SuggestedActions.css'

export default function SuggestedActions({ lastDMMessage, characterName, onSelect, disabled }) {
  const [suggestions, setSuggestions] = useState([])
  const [loading,     setLoading]     = useState(false)

  // FIX 2: Only regenerate when lastDMMessage actually changes value, not on re-renders
  const prevMsgRef = useRef('')
  useEffect(() => {
    if (!lastDMMessage || disabled) return
    if (lastDMMessage === prevMsgRef.current) return
    prevMsgRef.current = lastDMMessage
    generateSuggestions(lastDMMessage)
  }, [lastDMMessage]) // eslint-disable-line

  async function generateSuggestions(dmText) {
    setLoading(true)
    setSuggestions([])
    try {
      const prompt = `Given this D&D Dungeon Master message, generate exactly 4 short player action suggestions.
Each suggestion should be a different type of response (one bold action, one cautious action, one social/roleplay action, one investigative action).
Return ONLY a JSON array of 4 strings, each under 8 words. No preamble, no markdown, no explanation.
Example: ["Attack the goblin with my sword", "Hide behind the barrel", "Ask the guard about the noise", "Examine the strange markings"]

DM message: ${dmText.slice(0, 600)}`

      const raw  = await callAI([{ role: 'user', content: prompt }], 200)
      const clean = raw.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      if (Array.isArray(parsed)) setSuggestions(parsed.slice(0, 4))
    } catch {
      // Fail silently — suggestions are optional
    } finally {
      setLoading(false)
    }
  }

  if (!suggestions.length && !loading) return null

  return (
    <div className="suggestions-row">
      {loading ? (
        <div className="suggestions-loading">
          <span /><span /><span />
        </div>
      ) : (
        suggestions.map((s, i) => (
          <button
            key={i}
            className="suggestion-chip"
            onClick={() => onSelect(s)}
            disabled={disabled}
          >
            {s}
          </button>
        ))
      )}
    </div>
  )
}

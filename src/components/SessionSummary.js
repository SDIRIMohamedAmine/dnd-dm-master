// src/components/SessionSummary.js
import { useState } from 'react'
import { callAI } from '../lib/openrouter'
import './SessionSummary.css'

export default function SessionSummary({ messages, character, onClose }) {
  const [summary,  setSummary]  = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [copied,   setCopied]   = useState(false)

  async function generate() {
    setLoading(true)
    try {
      const transcript = messages
        .filter(m => m.role !== 'system')
        .map(m => `${m.role === 'user' ? character?.name || 'Player' : 'Dungeon Master'}: ${m.content}`)
        .join('\n\n')
        .slice(0, 6000)

      const prompt = `Write a narrative session summary for a D&D adventure, styled like a chapter in a fantasy novel.

Character: ${character?.name}, Level ${character?.level} ${character?.race} ${character?.class}

Session transcript:
${transcript}

Write 3-4 paragraphs that:
- Open with an evocative scene-setting sentence
- Summarize the key events in vivid, third-person narrative prose
- Name important NPCs and locations naturally
- End with a cliffhanger or forward-looking sentence about what lies ahead
- Use the character's name throughout, not "the player"

Write only the narrative. No headers, no bullet points.`

      const result = await callAI([{ role: 'user', content: prompt }], 600)
      setSummary(result.trim())
    } catch (err) {
      setSummary(`Failed to generate summary: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  function copyToClipboard() {
    if (!summary) return
    navigator.clipboard.writeText(summary)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="summary-backdrop" onClick={onClose}>
      <div className="summary-modal" onClick={e => e.stopPropagation()}>
        <div className="summary-header">
          <h2 className="summary-title">📖 Session Summary</h2>
          <button className="summary-close" onClick={onClose}>✕</button>
        </div>

        <div className="summary-body">
          {!summary && !loading && (
            <div className="summary-empty">
              <div className="summary-empty-icon">📜</div>
              <p>Generate a narrative recap of your session, written like a chapter in a fantasy novel.</p>
              <p className="summary-empty-sub">{messages.filter(m => m.role !== 'system').length} messages in this session.</p>
              <button className="summary-gen-btn" onClick={generate}>
                ✨ Generate Session Summary
              </button>
            </div>
          )}

          {loading && (
            <div className="summary-loading">
              <div className="summary-loading-dots"><span /><span /><span /></div>
              <p>Writing your story…</p>
            </div>
          )}

          {summary && !loading && (
            <>
              <div className="summary-text">
                {summary.split('\n\n').map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
              <div className="summary-actions">
                <button className="summary-copy-btn" onClick={copyToClipboard}>
                  {copied ? '✓ Copied!' : '📋 Copy to clipboard'}
                </button>
                <button className="summary-regen-btn" onClick={generate}>
                  🔄 Regenerate
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

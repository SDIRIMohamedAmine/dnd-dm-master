// src/components/NotesPanel.js
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import './NotesPanel.css'

export default function NotesPanel({ campaignId, userId }) {
  const [content,  setContent]  = useState('')
  const [noteId,   setNoteId]   = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  useEffect(() => {
    supabase.from('campaign_notes').select('*')
      .eq('campaign_id', campaignId).single()
      .then(({ data }) => {
        if (data) { setContent(data.content); setNoteId(data.id) }
      })
  }, [campaignId])

  const save = useCallback(async (text) => {
    setSaving(true)
    if (noteId) {
      await supabase.from('campaign_notes')
        .update({ content: text, updated_at: new Date().toISOString() }).eq('id', noteId)
    } else {
      const { data } = await supabase.from('campaign_notes')
        .insert({ campaign_id: campaignId, user_id: userId, content: text }).select().single()
      if (data) setNoteId(data.id)
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }, [campaignId, userId, noteId])

  // Auto-save after 1.5s of no typing
  useEffect(() => {
    const timer = setTimeout(() => {
      if (content !== '' || noteId) save(content)
    }, 1500)
    return () => clearTimeout(timer)
  }, [content]) // eslint-disable-line

  return (
    <div className="notes-panel">
      <div className="notes-header">
        <span className="notes-title">📝 Notes</span>
        <span className="notes-status">{saving ? 'Saving…' : saved ? '✓ Saved' : ''}</span>
      </div>
      <textarea
        className="notes-textarea"
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder={'Jot anything down here...\n\n• The innkeeper mentioned a cave to the east\n• Gareth owes us a favor\n• The red door leads to the undercroft'}
      />
    </div>
  )
}

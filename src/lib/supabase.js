// src/lib/supabase.js
import { createClient } from '@supabase/supabase-js'

const url = process.env.REACT_APP_SUPABASE_URL
const key = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY

if (!url || !key) {
  console.error('[Supabase] Missing env vars. Check your .env file.')
}

export const supabase = createClient(url || '', key || '')

// Test connection on load
supabase.from('campaigns').select('id', { count: 'exact', head: true })
  .then(({ error }) => {
    if (error) console.error('[Supabase] Connection error:', error.message)
    else console.log('[Supabase] Connected OK')
  })

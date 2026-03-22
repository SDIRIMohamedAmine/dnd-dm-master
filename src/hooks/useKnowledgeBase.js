// ══════════════════════════════════════════════════════════
// src/hooks/useKnowledgeBase.js
//
// On first load: restores chunks from localStorage instantly.
// After import: saves to localStorage so next load is instant.
// ══════════════════════════════════════════════════════════
import { useState, useCallback } from 'react';
import {
  fetchAllFromOpen5e,
  CHUNKER_MAP,
  retrieveChunks,
  buildContextBlock,
  saveChunksToStorage,
  loadChunksFromStorage,
  clearChunksFromStorage,
} from '../lib/rag';

export function useKnowledgeBase() {
  // Initialize from localStorage on first render — no loading spinner needed
  const [chunks,  setChunks]  = useState(() => loadChunksFromStorage());
  const [status,  setStatus]  = useState({ loading: false, message: '', progress: null });

  // ── Import selected endpoints from Open5e ───────────────
  const importFromOpen5e = useCallback(async (endpointKeys) => {
    setStatus({ loading: true, message: 'Starting import…', progress: null });
    const newChunks = [];

    for (const key of endpointKeys) {
      const chunker = CHUNKER_MAP[key];
      if (!chunker) continue;

      setStatus(s => ({ ...s, message: `Fetching ${key}…`, progress: null }));

      try {
        const items = await fetchAllFromOpen5e(key, (loaded, total) => {
          setStatus(s => ({
            ...s,
            message: `${key}: ${loaded} / ${total}`,
            progress: total ? Math.round((loaded / total) * 100) : null,
          }));
        });

        const chunked = items.map(chunker).filter(Boolean);
        newChunks.push(...chunked);

        setStatus(s => ({
          ...s,
          message: `✓ ${key}: ${chunked.length} chunks`,
        }));

      } catch (err) {
        setStatus(s => ({ ...s, message: `✗ ${key} failed: ${err.message}` }));
      }
    }

    // Merge with existing, skip duplicates by id
    setChunks(prev => {
      const existingIds = new Set(prev.map(c => c.id));
      const merged      = [...prev, ...newChunks.filter(c => !existingIds.has(c.id))];

      // NOTE: localStorage is capped at ~5MB. For large SRD imports this
      // cache will fail silently. The Supabase knowledge_chunks table is the
      // real source of truth — this cache only speeds up offline/fallback use.
      let saved = false
      try {
        saved = saveChunksToStorage(merged)
      } catch (e) {
        console.warn('[KB] localStorage quota exceeded — data is in Supabase but not cached locally')
      }

      const cacheNote = saved
        ? ' Cached locally for fast reloads.'
        : ' Local cache full — data is still in Supabase and will be retrieved per-query.'

      setStatus({
        loading:  false,
        message:  `Done! ${newChunks.length} chunks imported, ${merged.length} total.${cacheNote}`,
        progress: 100,
      });

      return merged;
    });
  }, []);

  // ── Clear everything ────────────────────────────────────
  const clearKB = useCallback(() => {
    clearChunksFromStorage();
    setChunks([]);
    setStatus({ loading: false, message: 'Knowledge base cleared.', progress: null });
  }, []);

  // ── Retrieve top-k chunks for a query ──────────────────
  const retrieve = useCallback((query, topK = 5) => {
    return retrieveChunks(query, chunks, topK);
  }, [chunks]);

  // ── Get context block for prompt injection ─────────────
  const getContext = useCallback((query, topK = 5) => {
    const retrieved    = retrieveChunks(query, chunks, topK);
    const contextBlock = buildContextBlock(retrieved);
    return { retrieved, contextBlock };
  }, [chunks]);

  // ── Stats breakdown by type ─────────────────────────────
  const stats = {
    total:      chunks.length,
    monsters:   chunks.filter(c => c.type === 'monster').length,
    spells:     chunks.filter(c => c.type === 'spell').length,
    items:      chunks.filter(c => c.type === 'magic-item').length,
    weapons:    chunks.filter(c => c.type === 'weapon').length,
    armor:      chunks.filter(c => c.type === 'armor').length,
    backgrounds:chunks.filter(c => c.type === 'background').length,
    classes:    chunks.filter(c => c.type === 'class').length,
    races:      chunks.filter(c => c.type === 'race').length,
    feats:      chunks.filter(c => c.type === 'feat').length,
    conditions: chunks.filter(c => c.type === 'condition').length,
    rules:      chunks.filter(c => c.type === 'rule').length,
  };

  return { chunks, stats, status, importFromOpen5e, clearKB, retrieve, getContext };
}

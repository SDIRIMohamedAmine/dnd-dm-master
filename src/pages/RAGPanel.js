import { useState } from 'react';
import { ALL_ENDPOINTS } from '../lib/rag';
import './RAGPanel.css';

const STAT_ROWS = [
  { key: 'monsters',    label: 'Monsters'    },
  { key: 'spells',      label: 'Spells'      },
  { key: 'items',       label: 'Magic Items' },
  { key: 'weapons',     label: 'Weapons'     },
  { key: 'armor',       label: 'Armor'       },
  { key: 'backgrounds', label: 'Backgrounds' },
  { key: 'classes',     label: 'Classes'     },
  { key: 'races',       label: 'Races'       },
  { key: 'feats',       label: 'Feats'       },
  { key: 'conditions',  label: 'Conditions'  },
  { key: 'rules',       label: 'Rules'       },
];

export default function RAGPanel({ kb }) {
  const { chunks, stats, status, importFromOpen5e, clearKB } = kb;

  const [selected,   setSelected]   = useState(new Set(['monsters', 'spells', 'magicitems']));
  const [testQuery,  setTestQuery]  = useState('');
  const [testResult, setTestResult] = useState(null);
  const [search,     setSearch]     = useState('');
  const [viewChunk,  setViewChunk]  = useState(null);

  function toggleEndpoint(key) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function selectAll()  { setSelected(new Set(ALL_ENDPOINTS.map(e => e.key))); }
  function selectNone() { setSelected(new Set()); }

  function handleTest() {
    if (!testQuery.trim()) return;
    setTestResult(kb.retrieve(testQuery, 6));
  }

  const filtered = search
    ? chunks.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.type.includes(search.toLowerCase()))
    : chunks.slice(0, 150);

  const isLoaded = stats.total > 0;

  return (
    <div className="rag-panel">

      {/* ── LEFT ── */}
      <div className="rag-left">

        {/* Persistent storage notice */}
        {isLoaded && (
          <div className="storage-notice">
            ✓ Knowledge base loaded from cache ({stats.total.toLocaleString()} chunks). No need to re-import.
          </div>
        )}

        {/* Import */}
        <section className="rag-section">
          <h2 className="section-title">📡 Data Sources</h2>
          <p className="section-sub">
            {isLoaded
              ? 'Re-import only if you want to add new categories.'
              : 'Select categories to import from the free Open5e API.'}
          </p>

          <div className="select-all-row">
            <button className="btn-link" onClick={selectAll}>Select all</button>
            <span>·</span>
            <button className="btn-link" onClick={selectNone}>None</button>
          </div>

          <div className="endpoint-list">
            {ALL_ENDPOINTS.map(ep => (
              <label key={ep.key} className={`endpoint-card ${selected.has(ep.key) ? 'selected' : ''}`}>
                <input type="checkbox" checked={selected.has(ep.key)} onChange={() => toggleEndpoint(ep.key)} />
                <span className="ep-icon">{ep.icon}</span>
                <div>
                  <div className="ep-label">{ep.label}</div>
                  <div className="ep-desc">{ep.desc}</div>
                </div>
              </label>
            ))}
          </div>

          <button
            className="btn-primary"
            onClick={() => importFromOpen5e([...selected])}
            disabled={status.loading || !selected.size}
          >
            {status.loading ? '⏳ Importing…' : `⬇ Import ${selected.size} source${selected.size !== 1 ? 's' : ''}`}
          </button>

          {status.message && (
            <div className={`status-bar ${status.loading ? 'loading' : 'done'}`}>
              {status.loading && status.progress != null && (
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${status.progress}%` }} />
                </div>
              )}
              <span>{status.message}</span>
            </div>
          )}
        </section>

        {/* Stats */}
        <section className="rag-section">
          <div className="stats-header">
            <h2 className="section-title">📊 Knowledge Base</h2>
            <span className="stats-total">{stats.total.toLocaleString()} total</span>
          </div>

          <div className="stats-table">
            {STAT_ROWS.map(row => (
              stats[row.key] > 0 && (
                <div key={row.key} className="stats-row">
                  <span className="stats-row-label">{row.label}</span>
                  <div className="stats-row-bar-wrap">
                    <div
                      className="stats-row-bar"
                      style={{ width: `${Math.min(100, (stats[row.key] / Math.max(stats.total, 1)) * 100 * 3)}%` }}
                    />
                  </div>
                  <span className="stats-row-num">{stats[row.key]}</span>
                </div>
              )
            ))}
          </div>

          {isLoaded && (
            <button className="btn-danger" onClick={clearKB}>🗑 Clear knowledge base & cache</button>
          )}
        </section>

        {/* Test retrieval */}
        <section className="rag-section">
          <h2 className="section-title">🔍 Test Retrieval</h2>
          <p className="section-sub">See what chunks the RAG injects for a given query</p>
          <div className="test-input-row">
            <input
              className="text-input"
              value={testQuery}
              onChange={e => setTestQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleTest()}
              placeholder="e.g. fire dragon, healing spell, plate armor…"
            />
            <button className="btn-secondary" onClick={handleTest} disabled={!testQuery.trim() || !isLoaded}>
              Test
            </button>
          </div>

          {testResult && (
            <div className="test-results">
              <div className="test-results-header">
                {testResult.length} chunk{testResult.length !== 1 ? 's' : ''} retrieved
              </div>
              {testResult.length === 0 && (
                <div className="test-empty">No matches found. Try a different query.</div>
              )}
              {testResult.map((c, i) => (
                <div key={c.id} className="test-chunk" onClick={() => setViewChunk(c)}>
                  <span className="test-rank">#{i + 1}</span>
                  <span className={`badge badge-${c.type}`}>{c.type}</span>
                  <span className="chunk-name">{c.name}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── RIGHT: chunk browser ── */}
      <div className="rag-right">
        <div className="chunk-browser-header">
          <h2 className="section-title">📚 Chunk Browser</h2>
          <input
            className="text-input search-input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or type…"
          />
        </div>

        {chunks.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📖</div>
            <p>No knowledge base yet.</p>
            <p className="empty-sub">Import sources from the left panel. Data persists between sessions.</p>
          </div>
        ) : (
          <div className="chunk-list">
            {filtered.map(c => (
              <div key={c.id} className="chunk-row" onClick={() => setViewChunk(c)}>
                <span className={`badge badge-${c.type}`}>{c.type}</span>
                <span className="chunk-row-name">{c.name}</span>
                <span className="chunk-row-src">{c.source}</span>
              </div>
            ))}
            {!search && chunks.length > 150 && (
              <div className="chunk-overflow">
                Showing 150 of {chunks.length.toLocaleString()}. Use search to filter.
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Modal ── */}
      {viewChunk && (
        <div className="modal-backdrop" onClick={() => setViewChunk(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className={`badge badge-${viewChunk.type}`}>{viewChunk.type}</span>
              <h3>{viewChunk.name}</h3>
              <button className="modal-close" onClick={() => setViewChunk(null)}>✕</button>
            </div>
            <pre className="modal-body">{viewChunk.text}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

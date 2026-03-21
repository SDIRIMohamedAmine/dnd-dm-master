import { useState, useRef, useEffect } from 'react';
import { callDM, MODEL } from '../lib/openrouter';
import './ChatPage.css';

const STARTERS = [
  "Describe a beholder I encounter in a dungeon corridor.",
  "I cast Fireball at the goblin camp. What happens?",
  "Tell me about the properties of a Vorpal Sword.",
  "I want to fight an Adult Red Dragon. Set the scene.",
  "What spells does a Lich typically use in combat?",
];

export default function ChatPage({ kb }) {
  const [messages,  setMessages]  = useState([]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [lastCtx,   setLastCtx]   = useState(null);
  const [showCtx,   setShowCtx]   = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  async function send(text) {
    const content = (text || input).trim();
    if (!content || loading) return;

    setInput('');
    setError(null);

    const userMsg = { role: 'user', content, id: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    try {
      const { retrieved, contextBlock } = kb.getContext(content, 4);
      setLastCtx(retrieved);

      const history = [...messages, userMsg].map(({ role, content }) => ({ role, content }));
      const reply   = await callDM(history, contextBlock);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: reply,
        id: Date.now() + 1,
        retrievedCount: retrieved.length,
        retrievedNames: retrieved.map(c => c.name),
      }]);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }

  return (
    <div className="chat-page">
      <div className="chat-main">

        {/* Status bar */}
        <div className="chat-status-bar">
          <div className="status-item">
            <span className="dot dot-green" />
            <span>{MODEL.split('/')[1]}</span>
          </div>
          <div className="status-divider" />
          <div className="status-item">
            {kb.stats.total > 0 ? (
              <><span className="dot dot-gold" /><span>{kb.stats.total} lore chunks loaded</span></>
            ) : (
              <><span className="dot dot-red" /><span>No KB — import lore in the RAG tab first</span></>
            )}
          </div>
          <button
            className={`ctx-toggle ${showCtx ? 'active' : ''}`}
            onClick={() => setShowCtx(s => !s)}
          >
            ⚔ Context
          </button>
        </div>

        {/* Messages */}
        <div className="messages-area">
          {messages.length === 0 && (
            <div className="welcome-screen">
              <div className="welcome-icon">⚔</div>
              <h2 className="welcome-title">The Dungeon Master Awaits</h2>
              <p className="welcome-sub">
                {kb.stats.total > 0
                  ? `${kb.stats.total} lore chunks ready. Ask about any monster, spell, or item.`
                  : 'Import D&D lore in the RAG tab first for accurate answers.'}
              </p>
              <div className="starters">
                {STARTERS.map((s, i) => (
                  <button key={i} className="starter-btn" onClick={() => send(s)}>{s}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`message message-${msg.role}`}>
              <div className="msg-avatar">{msg.role === 'user' ? '⚔' : '🎲'}</div>
              <div className="msg-content">
                <div className="msg-name">{msg.role === 'user' ? 'You' : 'Dungeon Master'}</div>
                <div className="msg-bubble">
                  {msg.content.split('\n').map((line, i, arr) => (
                    <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
                  ))}
                </div>
                {msg.role === 'assistant' && msg.retrievedCount > 0 && (
                  <div className="rag-badge">📖 Retrieved: {msg.retrievedNames.join(', ')}</div>
                )}
                {msg.role === 'assistant' && msg.retrievedCount === 0 && (
                  <div className="rag-badge rag-badge-empty">○ No lore retrieved — model improvised</div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="message message-assistant">
              <div className="msg-avatar">🎲</div>
              <div className="msg-content">
                <div className="msg-name">Dungeon Master</div>
                <div className="msg-bubble typing-bubble">
                  <span /><span /><span />
                </div>
              </div>
            </div>
          )}

          {error && <div className="error-banner"><strong>Error:</strong> {error}</div>}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <textarea
            ref={inputRef}
            className="chat-input"
            value={input}
            onChange={e => { setInput(e.target.value); autoResize(e.target); }}
            onKeyDown={handleKeyDown}
            placeholder="What do you do?"
            rows={1}
            disabled={loading}
          />
          <button
            className="send-btn"
            onClick={() => send()}
            disabled={loading || !input.trim()}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Context panel */}
      {showCtx && (
        <div className="context-panel">
          <div className="ctx-panel-title">⚔ Last Retrieved Context</div>
          {!lastCtx || lastCtx.length === 0 ? (
            <div className="ctx-empty">Send a message to see what RAG retrieves.</div>
          ) : (
            lastCtx.map((c, i) => (
              <div key={c.id} className="ctx-chunk">
                <div className="ctx-chunk-header">
                  <span className={`badge badge-${c.type}`}>{c.type}</span>
                  <span className="ctx-chunk-name">{c.name}</span>
                  <span className="ctx-rank">#{i + 1}</span>
                </div>
                <pre className="ctx-chunk-text">{c.text.slice(0, 400)}{c.text.length > 400 ? '…' : ''}</pre>
              </div>
            ))
          )}
          <div className="ctx-panel-footer">
            Exact text injected into the system prompt before the LLM responds.
          </div>
        </div>
      )}
    </div>
  );
}

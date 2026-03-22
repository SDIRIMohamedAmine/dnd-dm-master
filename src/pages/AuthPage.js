// src/pages/AuthPage.js
import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import './AuthPage.css'

export default function AuthPage() {
  const { signIn, signUp, resetPassword } = useAuth()
  const [mode,     setMode]     = useState('login')   // 'login' | 'signup' | 'reset'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState(null)
  const [loading,  setLoading]  = useState(false)
  const [done,     setDone]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (mode === 'signup') {
        await signUp(email, password)
        setDone(true)
      } else if (mode === 'reset') {
        await resetPassword(email)
        setDone(true)
      } else {
        await signIn(email, password)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-icon">📜</div>
          <h2 className="auth-title">Check your email</h2>
          <p className="auth-sub">
            {mode === 'reset'
              ? <>We sent a password reset link to <strong>{email}</strong>.</>
              : <>We sent a confirmation link to <strong>{email}</strong>. Click it, then come back and log in.</>
            }
          </p>
          <button className="auth-link" onClick={() => { setMode('login'); setDone(false) }}>
            Back to login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <D20 />
        <h1 className="auth-brand-title">THE DUNGEON MASTER</h1>
        <p className="auth-brand-sub">Your adventure begins here</p>
      </div>

      <div className="auth-card">
        <h2 className="auth-title">
          {mode === 'login' ? 'Enter the realm' : mode === 'signup' ? 'Join the realm' : 'Reset your password'}
        </h2>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              required
              autoComplete="email"
            />
          </div>

          {mode !== 'reset' && (
            <div className="auth-field">
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••'}
                required={mode !== 'reset'}
                minLength={6}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              />
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? '⏳ Please wait…'
              : mode === 'login' ? '⚔ Enter'
              : mode === 'signup' ? '📜 Create Account'
              : '📨 Send Reset Link'}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'login' && (
            <>
              No account? <button className="auth-link" onClick={() => { setMode('signup'); setError(null) }}>Sign up</button>
              <span className="auth-sep"> · </span>
              <button className="auth-link" onClick={() => { setMode('reset'); setError(null) }}>Forgot password?</button>
            </>
          )}
          {mode === 'signup' && (
            <>Have an account? <button className="auth-link" onClick={() => { setMode('login'); setError(null) }}>Log in</button></>
          )}
          {mode === 'reset' && (
            <>Remembered it? <button className="auth-link" onClick={() => { setMode('login'); setError(null) }}>Back to login</button></>
          )}
        </div>
      </div>
    </div>
  )
}

function D20() {
  return (
    <svg width="52" height="52" viewBox="0 0 100 100" fill="none"
      style={{ filter: 'drop-shadow(0 0 12px rgba(200,146,42,0.6))' }}>
      <polygon points="50,5 95,28 95,72 50,95 5,72 5,28" fill="#2a0a00" stroke="#c8922a" strokeWidth="2.5"/>
      <polygon points="50,5 75,28 50,38 25,28"  fill="#3d1200" stroke="#c8922a" strokeWidth="1"/>
      <polygon points="50,95 75,72 50,62 25,72" fill="#1a0800" stroke="#c8922a" strokeWidth="1"/>
      <polygon points="5,28 25,28 25,72 5,72"   fill="#220e00" stroke="#c8922a" strokeWidth="1"/>
      <polygon points="95,28 75,28 75,72 95,72" fill="#220e00" stroke="#c8922a" strokeWidth="1"/>
      <text x="50" y="57" textAnchor="middle" fontFamily="serif" fontSize="26" fill="#c8922a" fontWeight="bold">20</text>
    </svg>
  )
}

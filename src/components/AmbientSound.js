// src/components/AmbientSound.js
// Generates atmospheric D&D ambience using Web Audio API — no external files needed
import { useState, useRef, useEffect } from 'react'
import './AmbientSound.css'

const SCENES = [
  { id: 'tavern',   label: 'Tavern',   icon: '🍺' },
  { id: 'dungeon',  label: 'Dungeon',  icon: '🕯️' },
  { id: 'forest',   label: 'Forest',   icon: '🌲' },
  { id: 'combat',   label: 'Tension',  icon: '⚔️' },
]

export default function AmbientSound({ autoScene = null }) {
  const [active,  setActive]  = useState(false)
  const [scene,   setScene]   = useState(() => localStorage.getItem('ambient_scene') || 'dungeon')
  const [volume,  setVolume]  = useState(() => parseFloat(localStorage.getItem('ambient_vol') || '0.4'))
  const [open,    setOpen]    = useState(false)
  const ctxRef    = useRef(null)
  const nodesRef  = useRef([])

  function getCtx() {
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    return ctxRef.current
  }

  function stopAll() {
    nodesRef.current.forEach(n => { try { n.stop(); n.disconnect() } catch {} })
    nodesRef.current = []
  }

  function createNoise(ctx, type = 'brown') {
    const bufferSize = ctx.sampleRate * 3
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data   = buffer.getChannelData(0)
    let last = 0
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1
      if (type === 'brown') {
        last = (last + 0.02 * white) / 1.02
        data[i] = last * 3.5
      } else {
        data[i] = white
      }
    }
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.loop   = true
    return src
  }

  function createOscillator(ctx, freq, type = 'sine', gainVal = 0.01) {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type      = type
    osc.frequency.value = freq
    gain.gain.value     = gainVal
    osc.connect(gain)
    return { osc, gain, start: () => osc.start(), stop: () => { try { osc.stop() } catch {} } }
  }

  function startScene(sceneName, vol) {
    stopAll()
    const ctx     = getCtx()
    if (ctx.state === 'suspended') ctx.resume()
    const master  = ctx.createGain()
    master.gain.value = vol
    master.connect(ctx.destination)

    const nodes = [master]

    if (sceneName === 'dungeon') {
      // Low drone + drip sounds + distant rumble
      const noise = createNoise(ctx, 'brown')
      const filt  = ctx.createBiquadFilter()
      filt.type        = 'lowpass'
      filt.frequency.value = 120
      const ng = ctx.createGain(); ng.gain.value = 0.6
      noise.connect(filt); filt.connect(ng); ng.connect(master)
      noise.start()
      nodes.push(noise, filt, ng)

      // Slow low hum
      const { osc: hum, gain: hg, start } = createOscillator(ctx, 42, 'sine', 0.025)
      hg.connect(master); start()
      nodes.push(hum, hg)

      // Occasional drip (random high blip)
      function scheduleDrip() {
        const t    = ctx.currentTime + 2 + Math.random() * 8
        const osc  = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = 600 + Math.random() * 400
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(0.06, t + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
        osc.connect(gain); gain.connect(master)
        osc.start(t); osc.stop(t + 0.35)
        nodes.push(osc, gain)
        setTimeout(scheduleDrip, (2 + Math.random() * 8) * 1000)
      }
      scheduleDrip()
    }

    if (sceneName === 'tavern') {
      // Warm mid-range noise (crowd chatter simulation)
      const noise = createNoise(ctx, 'brown')
      const filt  = ctx.createBiquadFilter()
      filt.type = 'bandpass'; filt.frequency.value = 800; filt.Q.value = 0.5
      const ng = ctx.createGain(); ng.gain.value = 0.4
      noise.connect(filt); filt.connect(ng); ng.connect(master)
      noise.start(); nodes.push(noise, filt, ng)

      // Fire crackle layer
      const noise2 = createNoise(ctx, 'brown')
      const filt2  = ctx.createBiquadFilter()
      filt2.type = 'highpass'; filt2.frequency.value = 2000
      const ng2 = ctx.createGain(); ng2.gain.value = 0.08
      noise2.connect(filt2); filt2.connect(ng2); ng2.connect(master)
      noise2.start(); nodes.push(noise2, filt2, ng2)

      // Warm low hum (fire, chatter base)
      const { osc: hum, gain: hg, start } = createOscillator(ctx, 80, 'sine', 0.015)
      hg.connect(master); start(); nodes.push(hum, hg)
    }

    if (sceneName === 'forest') {
      // Wind layer
      const wind = createNoise(ctx, 'brown')
      const wf   = ctx.createBiquadFilter()
      wf.type = 'bandpass'; wf.frequency.value = 400; wf.Q.value = 0.3
      const wg = ctx.createGain(); wg.gain.value = 0.3
      wind.connect(wf); wf.connect(wg); wg.connect(master)
      wind.start(); nodes.push(wind, wf, wg)

      // High rustle
      const rustle = createNoise(ctx)
      const rf     = ctx.createBiquadFilter()
      rf.type = 'highpass'; rf.frequency.value = 3000
      const rg = ctx.createGain(); rg.gain.value = 0.05
      rustle.connect(rf); rf.connect(rg); rg.connect(master)
      rustle.start(); nodes.push(rustle, rf, rg)

      // Bird-like chirps
      function scheduleChirp() {
        const t   = ctx.currentTime + 1 + Math.random() * 6
        const osc = ctx.createOscillator()
        const g   = ctx.createGain()
        const baseFreq = 800 + Math.random() * 1200
        osc.frequency.setValueAtTime(baseFreq, t)
        osc.frequency.linearRampToValueAtTime(baseFreq * 1.3, t + 0.08)
        g.gain.setValueAtTime(0, t)
        g.gain.linearRampToValueAtTime(0.04, t + 0.02)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2)
        osc.connect(g); g.connect(master)
        osc.start(t); osc.stop(t + 0.25)
        nodes.push(osc, g)
        setTimeout(scheduleChirp, (1 + Math.random() * 6) * 1000)
      }
      scheduleChirp()
    }

    if (sceneName === 'combat') {
      // Tense low drone
      const { osc: d1, gain: g1, start: s1 } = createOscillator(ctx, 55, 'sawtooth', 0.018)
      g1.connect(master); s1(); nodes.push(d1, g1)
      const { osc: d2, gain: g2, start: s2 } = createOscillator(ctx, 110, 'square', 0.008)
      g2.connect(master); s2(); nodes.push(d2, g2)

      // Rhythmic low pulse
      function pulse() {
        const t = ctx.currentTime
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.06, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4)
        const o = ctx.createOscillator()
        o.frequency.value = 60; o.type = 'sine'
        o.connect(g); g.connect(master)
        o.start(t); o.stop(t + 0.5)
        nodes.push(o, g)
        setTimeout(pulse, 800 + Math.random() * 400)
      }
      pulse()

      // Metal clang occasionally
      function clang() {
        const t = ctx.currentTime + 3 + Math.random() * 8
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.05, t)
        g.gain.exponentialRampToValueAtTime(0.001, t + 1.5)
        const o = ctx.createOscillator()
        o.frequency.value = 300 + Math.random() * 200
        o.connect(g); g.connect(master)
        o.start(t); o.stop(t + 2)
        nodes.push(o, g)
        setTimeout(clang, (3 + Math.random() * 8) * 1000)
      }
      clang()
    }

    nodesRef.current = nodes
  }

  function toggle() {
    if (active) {
      stopAll()
      setActive(false)
    } else {
      startScene(scene, volume)
      setActive(true)
    }
  }

  function switchScene(newScene) {
    setScene(newScene)
    localStorage.setItem('ambient_scene', newScene)
    if (active) startScene(newScene, volume)
  }

  function changeVolume(v) {
    setVolume(v)
    localStorage.setItem('ambient_vol', String(v))
    const master = nodesRef.current[0]
    if (master && master.gain) master.gain.value = v
  }

  // Auto-switch scene when parent passes a detected location type
  useEffect(() => {
    if (autoScene && autoScene !== scene) {
      switchScene(autoScene)
    }
  }, [autoScene]) // eslint-disable-line

  useEffect(() => () => stopAll(), []) // eslint-disable-line

  return (
    <div className="ambient-wrap">
      <button
        className={`ambient-toggle ${active ? 'on' : ''}`}
        onClick={toggle}
        title={active ? 'Stop ambient sound' : 'Play ambient sound'}
      >
        {active ? '🔊' : '🔇'}
      </button>

      {active && (
        <div className="ambient-panel">
          <div className="ambient-scenes">
            {SCENES.map(s => (
              <button
                key={s.id}
                className={`ambient-scene ${scene === s.id ? 'active' : ''}`}
                onClick={() => switchScene(s.id)}
                title={s.label}
              >
                {s.icon}
              </button>
            ))}
          </div>
          <input
            type="range" min={0} max={1} step={0.05}
            value={volume}
            onChange={e => changeVolume(parseFloat(e.target.value))}
            className="ambient-volume"
            title="Volume"
          />
        </div>
      )}
    </div>
  )
}

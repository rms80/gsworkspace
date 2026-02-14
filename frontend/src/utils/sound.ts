/**
 * Simple sound utility using the Web Audio API.
 * Mute state is persisted in localStorage.
 */

const MUTED_KEY = 'gsworkspace-muted'

let audioCtx: AudioContext | null = null
let failureBuffer: AudioBuffer | null = null

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  return audioCtx
}

export function isMuted(): boolean {
  return localStorage.getItem(MUTED_KEY) === 'true'
}

export function setMuted(muted: boolean): void {
  localStorage.setItem(MUTED_KEY, String(muted))
}

function playSuccess(ctx: AudioContext): void {
  const now = ctx.currentTime
  const notes = [660, 880]
  const noteDuration = 0.12
  const gap = 0.06

  for (let i = 0; i < notes.length; i++) {
    const startTime = now + i * (noteDuration + gap)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = notes[i]
    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(0.15, startTime + 0.01)
    gain.gain.linearRampToValueAtTime(0, startTime + noteDuration)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(startTime)
    osc.stop(startTime + noteDuration)
  }
}

/** Preload the failure sound buffer so playback is synchronous */
function preloadFailureBuffer(): void {
  try {
    const ctx = getAudioContext()
    fetch(`${import.meta.env.BASE_URL}error.mp3`)
      .then(r => r.arrayBuffer())
      .then(buf => ctx.decodeAudioData(buf))
      .then(decoded => { failureBuffer = decoded })
      .catch(() => {})
  } catch {
    // ignore
  }
}

// Start preloading on module init
preloadFailureBuffer()

function playFailure(ctx: AudioContext): void {
  if (!failureBuffer) return
  const source = ctx.createBufferSource()
  source.buffer = failureBuffer
  const gain = ctx.createGain()
  gain.gain.value = 0.3
  source.connect(gain)
  gain.connect(ctx.destination)
  source.start()
}

/**
 * Play a notification sound.
 * Safe to call at any time — silently does nothing if muted or audio is unavailable.
 */
export function playNotificationSound(type: 'success' | 'failure' = 'success'): void {
  if (isMuted()) return

  try {
    const ctx = getAudioContext()
    if (type === 'failure') {
      playFailure(ctx)
    } else {
      playSuccess(ctx)
    }
  } catch {
    // Audio not available — ignore silently
  }
}

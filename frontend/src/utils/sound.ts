/**
 * Simple sound utility using the Web Audio API.
 * No external audio files needed — sounds are synthesized on the fly.
 * Mute state is persisted in localStorage.
 */

const MUTED_KEY = 'gsworkspace-muted'

let audioCtx: AudioContext | null = null

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

/**
 * Play a short notification chime (two rising tones).
 * Safe to call at any time — silently does nothing if muted or audio is unavailable.
 */
export function playNotificationSound(): void {
  if (isMuted()) return

  try {
    const ctx = getAudioContext()
    const now = ctx.currentTime

    // Two-note rising chime
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
  } catch {
    // Audio not available — ignore silently
  }
}

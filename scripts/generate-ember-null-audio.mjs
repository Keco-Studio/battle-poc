import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const sampleRate = 22050
const root = path.join(process.cwd(), 'public', 'assets', 'ember-null', 'audio')

function wav(samples) {
  const dataBytes = samples.length * 2
  const out = Buffer.alloc(44 + dataBytes)
  out.write('RIFF', 0)
  out.writeUInt32LE(36 + dataBytes, 4)
  out.write('WAVEfmt ', 8)
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20)
  out.writeUInt16LE(1, 22)
  out.writeUInt32LE(sampleRate, 24)
  out.writeUInt32LE(sampleRate * 2, 28)
  out.writeUInt16LE(2, 32)
  out.writeUInt16LE(16, 34)
  out.write('data', 36)
  out.writeUInt32LE(dataBytes, 40)
  samples.forEach((value, index) => out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(value * 32767))), 44 + index * 2))
  return out
}

function synth(duration, sample) {
  const count = Math.floor(duration * sampleRate)
  return Array.from({ length: count }, (_, index) => sample(index / sampleRate, index))
}

const clips = {
  'combat-loop.wav': synth(16, (t) => {
    const beat = t % 0.5
    const kick = Math.sin(2 * Math.PI * (72 - beat * 58) * beat) * Math.exp(-beat * 18)
    const pulse = Math.sin(2 * Math.PI * (55 + (Math.floor(t * 2) % 4) * 7) * t) * 0.18
    const metal = Math.sin(2 * Math.PI * 820 * t) * Math.exp(-(t % 2) * 22) * 0.09
    const noise = (Math.random() * 2 - 1) * Math.exp(-(t % 0.25) * 35) * 0.025
    return (kick * 0.42 + pulse + metal + noise) * 0.62
  }),
  'relay-shot.wav': synth(0.42, (t) => Math.sin(2 * Math.PI * (740 - t * 900) * t) * Math.exp(-t * 10) * 0.55),
  'thermal-shock.wav': synth(0.9, (t) => ((Math.random() * 2 - 1) * Math.exp(-t * 7) + Math.sin(2 * Math.PI * 68 * t) * Math.exp(-t * 3)) * 0.48),
  'phase-dash.wav': synth(0.5, (t) => Math.sin(2 * Math.PI * (220 + t * 1300) * t) * Math.exp(-t * 5) * 0.42),
  'enemy-impact.wav': synth(0.36, (t) => (Math.sin(2 * Math.PI * 94 * t) + (Math.random() * 2 - 1) * 0.55) * Math.exp(-t * 13) * 0.5),
  'boss-warning.wav': synth(1.3, (t) => (Math.sin(2 * Math.PI * (58 + t * 26) * t) + Math.sin(2 * Math.PI * 116 * t) * 0.4) * Math.min(1, t * 4) * Math.exp(-t * 0.7) * 0.32),
}

await mkdir(root, { recursive: true })
await Promise.all(Object.entries(clips).map(([name, samples]) => writeFile(path.join(root, name), wav(samples))))
process.stdout.write(`EMBER//NULL audio: ${Object.keys(clips).length} clips\n`)

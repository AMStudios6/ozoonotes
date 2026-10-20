import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import './CircuitSimulator.css'
import { SimulatorThemePicker, useSimulatorTheme } from './SimulatorTheme'

type Kind = 'source' | 'ac-source' | 'resistor' | 'capacitor' | 'inductor' | 'diode' | 'switch' | 'ground' | 'junction'
type MeterMode = 'voltage' | 'current' | 'resistance'
type DiodeModel = 'silicon' | 'schottky' | 'zener' | 'led'
type Part = { id: string; kind: Kind; x: number; y: number; value: number; label: string; on: boolean; frequency?: number; rotation?: number; mirrorX?: boolean; mirrorY?: boolean; powerRating?: number; voltageRating?: number; currentRating?: number; diodeModel?: DiodeModel; zenerVoltage?: number; reverseRecoveryNs?: number; junctionCapacitancePf?: number; thermalResistance?: number; maxJunctionTemperature?: number }
type Point = { x: number; y: number }
type Wire = { id: string; from: string; to: string; points?: Point[] }
type WireHandle = { wireId: string; index: number }
type WireSnap = { partId: string; wireId: string; pinId: string; point: Point; x: number; y: number; segmentIndex: number }
type Pin = { id: string; x: number; y: number; label: string }
type DrawKind = 'image' | 'text' | 'arrow' | 'rectangle' | 'ellipse'
type DrawItem = { id: string; kind: DrawKind; x: number; y: number; content?: string; color?: string }
type CircuitOptions = { showCurrent: boolean; showVoltage: boolean; showPower: boolean; showValues: boolean; smallGrid: boolean; toolbar: boolean; cursorCrosshair: boolean; europeanResistors: boolean; showOhmUnit: boolean; whiteBackground: boolean; conventionalCurrent: boolean; disableEditing: boolean; editValuesWithMouseWheel: boolean }
type Reading = { id: string; label: string; voltage: number; current: number; power: number; voltagePhase?: number; currentPhase?: number }
type Simulation = { readings: Reading[]; nodeVoltages: Record<string, number>; nodePhasors?: Record<string, { re: number; im: number }>; frequency?: number; ac?: boolean; message: string; timeDomain?: TransientResult }
type TransientResult = { times: number[]; nodeVoltages: Record<string, number[]>; partVoltages: Record<string, number[]>; partCurrents: Record<string, number[]>; message: string }
type Circuit = { parts: Part[]; wires: Wire[]; drawings?: DrawItem[] }
type PresetPart = { kind: Exclude<Kind, 'ground' | 'junction'>; value: number; label: string; diodeModel?: DiodeModel; zenerVoltage?: number; reverse?: boolean }
type CircuitPreset = { name: string; category: string; description: string; source: 'dc' | 'ac'; voltage: number; frequency?: number; parts: PresetPart[]; topology?: 'bridge' }
type SavedRun = { id: string; name: string; createdAt: string; analysis: string; readings: Reading[] }
const circuitPresets: CircuitPreset[] = [
  { category: 'Basics', name: 'Simple resistor circuit', description: 'DC supply with one resistor', source: 'dc', voltage: 9, parts: [{ kind: 'resistor', value: 1000, label: 'R1' }] },
  { category: 'Basics', name: 'Voltage divider', description: 'Two resistors share the supply voltage', source: 'dc', voltage: 9, parts: [{ kind: 'resistor', value: 1000, label: 'R1' }, { kind: 'resistor', value: 2000, label: 'R2' }] },
  { category: 'Basics', name: 'Switched load', description: 'Open and close a resistive load', source: 'dc', voltage: 5, parts: [{ kind: 'switch', value: 0, label: 'S1' }, { kind: 'resistor', value: 220, label: 'R1' }] },
  { category: 'Basics', name: 'LED current limiter', description: 'DC source, current-limiting resistor, and diode', source: 'dc', voltage: 5, parts: [{ kind: 'resistor', value: 220, label: 'R1' }, { kind: 'diode', value: 0.7, label: 'D1' }] },
  { category: 'A/C Circuits', name: 'AC resistive load', description: 'AC supply with a resistive load', source: 'ac', voltage: 12, frequency: 60, parts: [{ kind: 'resistor', value: 1000, label: 'R1' }] },
  { category: 'A/C Circuits', name: 'Series RC circuit', description: 'Observe resistor and capacitor at AC', source: 'ac', voltage: 12, frequency: 60, parts: [{ kind: 'resistor', value: 1000, label: 'R1' }, { kind: 'capacitor', value: 10e-6, label: 'C1' }] },
  { category: 'A/C Circuits', name: 'Series RL circuit', description: 'Observe resistor and inductor at AC', source: 'ac', voltage: 12, frequency: 60, parts: [{ kind: 'resistor', value: 470, label: 'R1' }, { kind: 'inductor', value: 10e-3, label: 'L1' }] },
  { category: 'A/C Circuits', name: 'Series RLC circuit', description: 'Explore AC behavior of R, L, and C together', source: 'ac', voltage: 12, frequency: 60, parts: [{ kind: 'resistor', value: 100, label: 'R1' }, { kind: 'inductor', value: 10e-3, label: 'L1' }, { kind: 'capacitor', value: 100e-6, label: 'C1' }] },
  { category: 'Passive Filters', name: 'RC low-pass example', description: 'Simple series RC filter for AC study', source: 'ac', voltage: 5, frequency: 100, parts: [{ kind: 'resistor', value: 1000, label: 'R1' }, { kind: 'capacitor', value: 1e-6, label: 'C1' }] },
  { category: 'Passive Filters', name: 'RC high-pass example', description: 'Series capacitor and resistor at AC', source: 'ac', voltage: 5, frequency: 1000, parts: [{ kind: 'capacitor', value: 100e-9, label: 'C1' }, { kind: 'resistor', value: 10000, label: 'R1' }] },
  { category: 'Passive Filters', name: 'RL filter example', description: 'Series resistor and inductor at AC', source: 'ac', voltage: 5, frequency: 500, parts: [{ kind: 'resistor', value: 470, label: 'R1' }, { kind: 'inductor', value: 47e-3, label: 'L1' }] },
  { category: 'Diodes', name: 'Diode forward-bias circuit', description: 'DC source and diode operating point', source: 'dc', voltage: 5, parts: [{ kind: 'resistor', value: 1000, label: 'R1' }, { kind: 'diode', value: 0.7, label: 'D1', diodeModel: 'silicon' }] },
  { category: 'Diodes', name: 'Half-wave rectifier', description: 'See an AC supply turn into pulsating DC through one diode', source: 'ac', voltage: 9, frequency: 60, parts: [{ kind: 'diode', value: 0.7, label: 'D1', diodeModel: 'silicon' }, { kind: 'resistor', value: 1000, label: 'RL' }] },
  { category: 'Diodes', name: 'Bridge rectifier', description: 'Four diodes rectify both halves of an AC waveform', source: 'ac', voltage: 9, frequency: 60, parts: [], topology: 'bridge' },
  { category: 'Diodes', name: 'Zener voltage regulator', description: 'Series resistor and reverse-biased 5.1 V Zener clamp', source: 'dc', voltage: 12, parts: [{ kind: 'resistor', value: 1000, label: 'R1' }, { kind: 'diode', value: 0.7, label: 'DZ1', diodeModel: 'zener', zenerVoltage: 5.1, reverse: true }] },
]
type GuidedLesson = { title: string; preset: string; intro: string; steps: string[] }
const guidedLessons: GuidedLesson[] = [
  { title: 'Build a voltage divider', preset: 'Voltage divider', intro: 'Two resistors in series split the source voltage. The larger resistance receives the larger share.', steps: ['Run the simulation and note the voltage across R1 and R2.', 'Change R2 to twice its value. Predict the voltage split before simulating again.', 'Check that the two resistor voltages add up to the supply voltage.'] },
  { title: 'Limit LED current', preset: 'LED current limiter', intro: 'A series resistor limits the current through a diode. Too little resistance can overdrive the LED.', steps: ['Run the circuit and note the diode current.', 'Increase the resistor value and simulate again.', 'Compare the current and power readings with the parts list ratings.'] },
  { title: 'Explore an RC low-pass filter', preset: 'RC low-pass example', intro: 'A resistor and capacitor respond differently as frequency changes, forming a simple filter.', steps: ['Run an AC frequency sweep on the capacitor or resistor.', 'Compare the voltage curve at low and high frequencies.', 'Change the capacitor value and repeat the sweep.'] },
]
type SavedCircuit = { id: string; name: string; updatedAt: string; circuit: Circuit }
function loadSavedCircuits(): SavedCircuit[] { try { const saved = JSON.parse(localStorage.getItem('ozoo:circuit-library') ?? '[]'); return Array.isArray(saved) ? saved.filter((item) => item && typeof item.name === 'string' && item.circuit?.parts && item.circuit?.wires) : [] } catch { return [] } }
function loadSavedRuns(): SavedRun[] { try { const saved = JSON.parse(localStorage.getItem('ozoo:circuit-runs') ?? '[]'); return Array.isArray(saved) ? saved.filter((item) => item && typeof item.id === 'string' && Array.isArray(item.readings)).slice(0, 10) : [] } catch { return [] } }
async function encodeCircuitShare(value: string): Promise<string> {
  let bytes = new TextEncoder().encode(value), prefix = 'raw.'
  if ('CompressionStream' in window) { const compressed = new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')); bytes = new Uint8Array(await new Response(compressed).arrayBuffer()); prefix = 'gz.' }
  let binary = ''; for (let i=0;i<bytes.length;i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i,i+0x8000))
  return prefix + btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')
}
async function decodeCircuitShare(payload: string): Promise<string> {
  const compressed=payload.startsWith('gz.'), encoded=payload.replace(/^(gz|raw)\./,'').replaceAll('-','+').replaceAll('_','/')
  const binary=atob(encoded), bytes=Uint8Array.from(binary,(char)=>char.charCodeAt(0))
  if(compressed&&'DecompressionStream' in window){const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));return await new Response(stream).text()}
  return new TextDecoder().decode(bytes)
}
const defaultCircuitOptions: CircuitOptions = { showCurrent: true, showVoltage: true, showPower: false, showValues: true, smallGrid: false, toolbar: true, cursorCrosshair: false, europeanResistors: false, showOhmUnit: true, whiteBackground: false, conventionalCurrent: true, disableEditing: false, editValuesWithMouseWheel: true }

const W = 1120
const H = 700
const makeId = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
const pinId = (part: Part, side: string) => part.id + ':' + side
const rotatePoint = (part: Part, x: number, y: number) => {
  const angle = ((part.rotation ?? 0) * Math.PI) / 180
  const localX = x * (part.mirrorX ? -1 : 1), localY = y * (part.mirrorY ? -1 : 1)
  return { x: part.x + localX * Math.cos(angle) - localY * Math.sin(angle), y: part.y + localX * Math.sin(angle) + localY * Math.cos(angle) }
}
const pinsFor = (part: Part): Pin[] => {
  if (part.kind === 'ground') { const point = rotatePoint(part, 0, -23); return [{ id: pinId(part, 'g'), ...point, label: 'GND' }] }
  if (part.kind === 'junction') return [{ id: pinId(part, 'j'), x: part.x, y: part.y, label: 'J' }]
  const a = rotatePoint(part, -48, 0), b = rotatePoint(part, 48, 0)
  return [
    { id: pinId(part, 'a'), ...a, label: part.kind === 'source' || part.kind === 'ac-source' ? '+' : '1' },
    { id: pinId(part, 'b'), ...b, label: part.kind === 'source' || part.kind === 'ac-source' ? '−' : '2' },
  ]
}
function exampleCircuit(): Circuit {
  const source: Part = { id: 'v1', kind: 'source', x: 270, y: 290, value: 5, label: 'V1', on: true }
  const resistor: Part = { id: 'r1', kind: 'resistor', x: 570, y: 290, value: 1000, label: 'R1', on: true }
  const ground: Part = { id: 'g1', kind: 'ground', x: 270, y: 475, value: 0, label: 'GND', on: true }
  return {
    parts: [source, resistor, ground],
    wires: [
      { id: 'w1', from: pinId(source, 'a'), to: pinId(resistor, 'a') },
      { id: 'w2', from: pinId(resistor, 'b'), to: pinId(ground, 'g') },
      { id: 'w3', from: pinId(ground, 'g'), to: pinId(source, 'b') },
    ],
  }
}
function buildPresetCircuit(preset: CircuitPreset): Circuit {
  if (preset.topology === 'bridge') {
    const source: Part = { id: makeId(), kind: 'ac-source', x: 140, y: 350, value: preset.voltage, frequency: preset.frequency ?? 60, label: 'VAC1', on: true }
    const junction = (x: number, y: number, label: string): Part => ({ id: makeId(), kind: 'junction', x, y, value: 0, label, on: true })
    const acLeft = junction(300, 350, 'AC1'), acRight = junction(820, 350, 'AC2'), positive = junction(560, 175, 'V+'), negative = junction(560, 525, 'V−')
    const diode = (x: number, y: number, rotation: number, label: string): Part => ({ id: makeId(), kind: 'diode', x, y, rotation, value: .7, diodeModel: 'silicon', label, on: true })
    const d1=diode(455,260,315,'D1'), d2=diode(665,260,225,'D2'), d3=diode(455,440,225,'D3'), d4=diode(665,440,315,'D4')
    const load: Part = { id: makeId(), kind: 'resistor', x: 730, y: 350, rotation: 90, value: 1000, label: 'RL', on: true }
    const ground: Part = { id: makeId(), kind: 'ground', x: 560, y: 580, value: 0, label: 'GND', on: true }
    const parts=[source,acLeft,acRight,positive,negative,d1,d2,d3,d4,load,ground]
    const wire=(from:string,to:string,points?:Point[]):Wire=>({id:makeId(),from,to,...(points?{points}:{})})
    const wires=[
      wire(pinId(source,'a'),pinId(acLeft,'j'),[{x:220,y:350}]),wire(pinId(source,'b'),pinId(acRight,'j'),[{x:220,y:350},{x:220,y:620},{x:820,y:620},{x:820,y:350}]),
      wire(pinId(d1,'a'),pinId(acLeft,'j'),[{x:390,y:294},{x:300,y:294},{x:300,y:350}]),wire(pinId(d3,'b'),pinId(acLeft,'j'),[{x:390,y:406},{x:300,y:406},{x:300,y:350}]),
      wire(pinId(d2,'a'),pinId(acRight,'j'),[{x:730,y:294},{x:820,y:294},{x:820,y:350}]),wire(pinId(d4,'b'),pinId(acRight,'j'),[{x:730,y:406},{x:820,y:406},{x:820,y:350}]),
      wire(pinId(d1,'b'),pinId(positive,'j'),[{x:500,y:226},{x:500,y:175}]),wire(pinId(d2,'b'),pinId(positive,'j'),[{x:620,y:226},{x:620,y:175}]),
      wire(pinId(d3,'a'),pinId(negative,'j'),[{x:500,y:474},{x:500,y:525}]),wire(pinId(d4,'a'),pinId(negative,'j'),[{x:620,y:474},{x:620,y:525}]),
      wire(pinId(positive,'j'),pinId(load,'a'),[{x:560,y:175},{x:730,y:175}]),wire(pinId(load,'b'),pinId(negative,'j'),[{x:730,y:398},{x:730,y:525},{x:560,y:525}]),wire(pinId(negative,'j'),pinId(ground,'g')),
    ]
    return { parts, wires, drawings: [] }
  }
  const source: Part = { id: makeId(), kind: preset.source === 'ac' ? 'ac-source' : 'source', x: 190, y: 300, value: preset.voltage, label: preset.source === 'ac' ? 'VAC1' : 'V1', on: true, ...(preset.source === 'ac' ? { frequency: preset.frequency ?? 60 } : {}) }
  const parts: Part[] = [source, ...preset.parts.map((item, index) => ({ id: makeId(), kind: item.kind, x: 410 + index * 185, y: 300, value: item.value, label: item.label, on: true, ...(item.diodeModel ? { diodeModel: item.diodeModel } : {}), ...(item.zenerVoltage ? { zenerVoltage: item.zenerVoltage } : {}) }))]
  const ground: Part = { id: makeId(), kind: 'ground', x: 190, y: 485, value: 0, label: 'GND', on: true }
  const inputPin = (index: number) => preset.parts[index]?.reverse ? 'b' : 'a'
  const outputPin = (index: number) => preset.parts[index]?.reverse ? 'a' : 'b'
  const wires: Wire[] = [{ id: makeId(), from: pinId(source, 'a'), to: pinId(parts[1], inputPin(0)) }]
  for (let index = 1; index < parts.length - 1; index++) wires.push({ id: makeId(), from: pinId(parts[index], outputPin(index - 1)), to: pinId(parts[index + 1], inputPin(index)) })
  const last = parts[parts.length - 1]
  const lastOutputSide = outputPin(parts.length - 2)
  wires.push({ id: makeId(), from: pinId(source, 'b'), to: pinId(ground, 'g'), points: [{ x: 238, y: 300 }, { x: 238, y: 462 }, { x: 190, y: 462 }] })
  wires.push({ id: makeId(), from: pinId(last, lastOutputSide), to: pinId(ground, 'g'), points: [{ x: last.x + (lastOutputSide === 'a' ? -48 : 48), y: 300 }, { x: last.x + (lastOutputSide === 'a' ? -70 : 70), y: 300 }, { x: last.x + (lastOutputSide === 'a' ? -70 : 70), y: 462 }, { x: 220, y: 462 }] })
  return { parts: [...parts, ground], wires, drawings: [] }
}
function parseCircuitText(text: string): Circuit {
  const trimmed = text.trim()
  const jsonStart = trimmed.indexOf('{')
  if (jsonStart >= 0) {
    const parsed = JSON.parse(trimmed.slice(jsonStart)) as Circuit
    if (Array.isArray(parsed.parts) && Array.isArray(parsed.wires)) return { ...parsed, drawings: Array.isArray(parsed.drawings) ? parsed.drawings : [] }
  }
  const readValue = (raw: string) => {
    const match = raw.trim().match(/^([+-]?(?:\d+\.?\d*|\.\d+))(meg|[kMmunµp]?)(?:[A-Za-zΩ]+)?$/i)
    if (!match) return NaN
    const scale: Record<string, number> = { '': 1, k: 1e3, K: 1e3, M: 1e6, meg: 1e6, m: 1e-3, u: 1e-6, 'µ': 1e-6, n: 1e-9, p: 1e-12 }
    return Number(match[1]) * (scale[match[2]] ?? 1)
  }
  const rows = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#') && !line.startsWith('*'))
  let source: { kind: 'dc' | 'ac'; value: number; frequency: number; label: string } | null = null
  const parts: PresetPart[] = []
  for (const row of rows) {
    const fields = row.replace(/,/g, ' ').split(/\s+/)
    const [label, type, valueText, frequencyText] = fields
    const kind = type?.toLowerCase()
    if (['source', 'dc', 'voltage', 'ac-source', 'ac'].includes(kind)) {
      const value = readValue(valueText ?? '')
      if (!Number.isFinite(value) || value <= 0 || source) throw new Error('Text import needs one source line, for example: V1 source 9V or VAC1 ac 12V 60Hz.')
      source = { kind: kind === 'ac' || kind === 'ac-source' ? 'ac' : 'dc', value, frequency: readValue(frequencyText ?? '60Hz'), label }
      continue
    }
    const kinds: Record<string, PresetPart['kind']> = { resistor: 'resistor', r: 'resistor', capacitor: 'capacitor', c: 'capacitor', inductor: 'inductor', l: 'inductor', diode: 'diode', d: 'diode', switch: 'switch', s: 'switch' }
    const componentKind = kinds[kind?.replace(/\d+$/, '') ?? ''] ?? kinds[kind ?? '']
    if (!componentKind) { if (/^(ozoo|circuit|#|\.)/i.test(row)) continue; throw new Error(`Unknown component in text import: ${label ?? row}`) }
    const value = componentKind === 'switch' && !valueText ? 0 : readValue(valueText ?? '')
    if (!Number.isFinite(value) || (componentKind !== 'switch' && value <= 0)) throw new Error(`Check the value on line: ${row}`)
    parts.push({ kind: componentKind, value, label })
  }
  if (!source || !parts.length) throw new Error('No circuit found. Add a source and at least one component. Example lines: V1 source 9V, R1 resistor 1kΩ.')
  return buildPresetCircuit({ category: 'Imported', name: 'Text circuit', description: 'Imported from a component list', source: source.kind, voltage: source.value, frequency: source.frequency, parts })
}
function loadCircuit(): Circuit {
  try {
    const value = JSON.parse(localStorage.getItem('ozoo:circuit') ?? 'null')
    if (value && Array.isArray(value.parts) && Array.isArray(value.wires)) return { ...value, drawings: Array.isArray(value.drawings) ? value.drawings : [] } as Circuit
  } catch {}
  return exampleCircuit()
}
type Complex = { re: number; im: number }
const complex = (re = 0, im = 0): Complex => ({ re, im })
const cAdd = (a: Complex, b: Complex): Complex => complex(a.re + b.re, a.im + b.im)
const cSub = (a: Complex, b: Complex): Complex => complex(a.re - b.re, a.im - b.im)
const cMul = (a: Complex, b: Complex): Complex => complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re)
const cDiv = (a: Complex, b: Complex): Complex => { const d = b.re * b.re + b.im * b.im; return d ? complex((a.re * b.re + a.im * b.im) / d, (a.im * b.re - a.re * b.im) / d) : complex() }
const cAbs = (a: Complex) => Math.hypot(a.re, a.im)
const cPhase = (a: Complex) => Math.atan2(a.im, a.re)
function solveAcCircuit(parts: Part[], wires: Wire[], frequencyOverride?: number): Simulation {
  const sources = parts.filter((part) => part.kind === 'source' || part.kind === 'ac-source')
  const acSources = sources.filter((part) => part.kind === 'ac-source')
  const frequency = frequencyOverride ?? acSources[0]?.frequency ?? 60
  if (!frequency || frequency < 0.1 || frequency > 1e6) throw new Error('AC frequency must be between 0.1 Hz and 1 MHz.')
  if (acSources.some((part) => Math.abs((part.frequency ?? 60) - frequency) > 0.001)) throw new Error('All AC supplies in one circuit must use the same frequency.')
  if (parts.some((part) => part.kind === 'diode')) return solveDiodeAcWaveform(parts, wires, frequency)
  const parent = new Map<string, string>()
  const find = (id: string): string => { if (!parent.has(id)) parent.set(id, id); const p = parent.get(id)!; if (p !== id) parent.set(id, find(p)); return parent.get(id)! }
  const join = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  const allPins = parts.flatMap(pinsFor); allPins.forEach((pin) => find(pin.id)); wires.forEach((wire) => join(wire.from, wire.to))
  const grounds = parts.filter((part) => part.kind === 'ground').map((part) => pinId(part, 'g'))
  if (!grounds.length) throw new Error('Add a ground reference before running AC analysis.')
  for (let i = 1; i < grounds.length; i++) join(grounds[0], grounds[i])
  const groundRoot = find(grounds[0]), roots = Array.from(new Set(allPins.map((pin) => find(pin.id)))).filter((root) => root !== groundRoot)
  const nodeIndex = new Map(roots.map((root, index) => [root, index])), size = roots.length + sources.length
  if (!acSources.length) throw new Error('Add an AC power supply to run frequency analysis.')
  const matrix: Complex[][] = Array.from({ length: size }, () => Array.from({ length: size }, () => complex()))
  const rhs: Complex[] = Array.from({ length: size }, () => complex())
  const nodeFor = (id: string) => nodeIndex.get(find(id))
  const stamp = (a: string, b: string, y: Complex) => {
    const ia = nodeFor(a), ib = nodeFor(b)
    if (ia !== undefined) matrix[ia][ia] = cAdd(matrix[ia][ia], y)
    if (ib !== undefined) matrix[ib][ib] = cAdd(matrix[ib][ib], y)
    if (ia !== undefined && ib !== undefined) { matrix[ia][ib] = cSub(matrix[ia][ib], y); matrix[ib][ia] = cSub(matrix[ib][ia], y) }
  }
  const omega = 2 * Math.PI * frequency
  parts.forEach((part) => {
    const a = pinId(part, 'a'), b = pinId(part, 'b')
    if (part.kind === 'resistor') stamp(a, b, complex(1 / Math.max(0.001, part.value)))
    if (part.kind === 'switch') stamp(a, b, complex(part.on ? 50 : 1e-10))
    if (part.kind === 'capacitor') stamp(a, b, complex(0, omega * Math.max(0, part.value)))
    if (part.kind === 'inductor') stamp(a, b, complex(0, -1 / (omega * Math.max(1e-12, part.value))))
  })
  sources.forEach((part, index) => {
    const col = roots.length + index, a = nodeFor(pinId(part, 'a')), b = nodeFor(pinId(part, 'b'))
    if (a !== undefined) { matrix[a][col] = cAdd(matrix[a][col], complex(1)); matrix[col][a] = cAdd(matrix[col][a], complex(1)) }
    if (b !== undefined) { matrix[b][col] = cSub(matrix[b][col], complex(1)); matrix[col][b] = cSub(matrix[col][b], complex(1)) }
    if (part.kind === 'ac-source') rhs[col] = complex(part.value)
  })
  for (let col = 0; col < size; col++) {
    let pivot = col
    for (let row = col + 1; row < size; row++) if (cAbs(matrix[row][col]) > cAbs(matrix[pivot][col])) pivot = row
    if (cAbs(matrix[pivot][col]) < 1e-14) throw new Error('This AC circuit has a floating or disconnected node. Check each connection and add a ground.')
    ;[matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]]; [rhs[col], rhs[pivot]] = [rhs[pivot], rhs[col]]
    const divisor = matrix[col][col]
    for (let j = col; j < size; j++) matrix[col][j] = cDiv(matrix[col][j], divisor)
    rhs[col] = cDiv(rhs[col], divisor)
    for (let row = 0; row < size; row++) { if (row === col) continue; const factor = matrix[row][col]; if (cAbs(factor) < 1e-18) continue; for (let j = col; j < size; j++) matrix[row][j] = cSub(matrix[row][j], cMul(factor, matrix[col][j])); rhs[row] = cSub(rhs[row], cMul(factor, rhs[col])) }
  }
  const voltage = (id: string) => { const index = nodeFor(id); return index === undefined ? complex() : rhs[index] }
  const phasors: Record<string, Complex> = { [groundRoot]: complex() }
  roots.forEach((root, index) => { phasors[root] = rhs[index] })
  const nodePhasors = Object.fromEntries(allPins.map((pin) => [pin.id, voltage(pin.id)]))
  const readings = parts.filter((part) => part.kind !== 'ground' && part.kind !== 'junction').map((part) => {
    const a = pinId(part, 'a'), b = pinId(part, 'b'), v = cSub(voltage(a), voltage(b))
    const admittance = part.kind === 'resistor' ? complex(1 / Math.max(0.001, part.value))
      : part.kind === 'switch' ? complex(part.on ? 50 : 1e-10)
        : part.kind === 'capacitor' ? complex(0, omega * Math.max(0, part.value))
          : part.kind === 'inductor' ? complex(0, -1 / (omega * Math.max(1e-12, part.value))) : complex()
    const i = part.kind === 'source' || part.kind === 'ac-source' ? rhs[roots.length + sources.findIndex((source) => source.id === part.id)] : cMul(admittance, v)
    const vRms = cAbs(v), iRms = cAbs(i)
    return { id: part.id, label: part.label, voltage: vRms, current: iRms, power: vRms * iRms * Math.cos(cPhase(v) - cPhase(i)), voltagePhase: cPhase(v), currentPhase: cPhase(i) }
  })
  return { readings, nodeVoltages: Object.fromEntries(allPins.map((pin) => [pin.id, cAbs(nodePhasors[pin.id])])), nodePhasors, frequency, ac: true, message: `AC steady-state solved · ${frequency} Hz · component values show RMS` }
}
function solveCircuit(parts: Part[], wires: Wire[]): Simulation {
  if (parts.some((part) => part.kind === 'ac-source')) return solveAcCircuit(parts, wires)
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    if (!parent.has(id)) parent.set(id, id)
    const p = parent.get(id)!
    if (p !== id) parent.set(id, find(p))
    return parent.get(id)!
  }
  const join = (a: string, b: string) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  const allPins = parts.flatMap(pinsFor)
  allPins.forEach((pin) => find(pin.id))
  wires.forEach((wire) => join(wire.from, wire.to))
  const grounds = parts.filter((part) => part.kind === 'ground').map((part) => pinId(part, 'g'))
  if (!grounds.length) throw new Error('Add a ground reference before running the circuit.')
  for (let i = 1; i < grounds.length; i++) join(grounds[0], grounds[i])
  const groundRoot = find(grounds[0])
  const roots = Array.from(new Set(allPins.map((pin) => find(pin.id)))).filter((root) => root !== groundRoot)
  const nodeIndex = new Map(roots.map((root, index) => [root, index]))
  const voltageSources = parts.filter((part) => part.kind === 'source')
  const size = roots.length + voltageSources.length
  if (!size) throw new Error('Add a voltage source and a load to the circuit.')
  let matrix = Array.from({ length: size }, () => Array(size).fill(0))
  let rhs = Array(size).fill(0)
  const nodeFor = (id: string) => nodeIndex.get(find(id))
  const stampConductance = (a: string, b: string, conductance: number) => {
    const ia = nodeFor(a), ib = nodeFor(b)
    if (ia !== undefined) matrix[ia][ia] += conductance
    if (ib !== undefined) matrix[ib][ib] += conductance
    if (ia !== undefined && ib !== undefined) { matrix[ia][ib] -= conductance; matrix[ib][ia] -= conductance }
  }
  const diodeConductance = 1000
  const diodeStates = new Map<string, -1 | 0 | 1>()
  let solved = Array(size).fill(0)
  let iterations = 0
  let changed = true
  while (changed && iterations++ < parts.length + 2) {
    changed = false
    matrix = Array.from({ length: size }, () => Array(size).fill(0))
    rhs = Array(size).fill(0)
    parts.forEach((part) => {
      if (part.kind === 'resistor') stampConductance(pinId(part, 'a'), pinId(part, 'b'), 1 / Math.max(0.001, part.value))
      if (part.kind === 'inductor') stampConductance(pinId(part, 'a'), pinId(part, 'b'), 1e6)
      if (part.kind === 'switch') stampConductance(pinId(part, 'a'), pinId(part, 'b'), part.on ? 50 : 1e-10)
      const diodeState = part.kind === 'diode' ? diodeStates.get(part.id) ?? 0 : 0
      if (part.kind === 'diode' && diodeState !== 0) {
        stampConductance(pinId(part, 'a'), pinId(part, 'b'), diodeConductance)
        const targetVoltage = diodeState === 1 ? Math.max(0, part.value) : -(part.zenerVoltage ?? 5.1)
        const a = nodeFor(pinId(part, 'a')), b = nodeFor(pinId(part, 'b')), bias = diodeConductance * targetVoltage
        if (a !== undefined) rhs[a] += bias
        if (b !== undefined) rhs[b] -= bias
      }
    })
    voltageSources.forEach((part, sourceIndex) => {
      const column = roots.length + sourceIndex
      const a = nodeFor(pinId(part, 'a')), b = nodeFor(pinId(part, 'b'))
      if (a !== undefined) { matrix[a][column] += 1; matrix[column][a] += 1 }
      if (b !== undefined) { matrix[b][column] -= 1; matrix[column][b] -= 1 }
      rhs[column] = part.value
    })
    for (let column = 0; column < size; column++) {
      let pivot = column
      for (let row = column + 1; row < size; row++) if (Math.abs(matrix[row][column]) > Math.abs(matrix[pivot][column])) pivot = row
      if (Math.abs(matrix[pivot][column]) < 1e-14) throw new Error('This circuit has a floating or disconnected node. Check every connection and add a ground.')
      ;[matrix[column], matrix[pivot]] = [matrix[pivot], matrix[column]]
      ;[rhs[column], rhs[pivot]] = [rhs[pivot], rhs[column]]
      const divisor = matrix[column][column]
      for (let j = column; j < size; j++) matrix[column][j] /= divisor
      rhs[column] /= divisor
      for (let row = 0; row < size; row++) {
        if (row === column) continue
        const factor = matrix[row][column]
        if (Math.abs(factor) < 1e-18) continue
        for (let j = column; j < size; j++) matrix[row][j] -= factor * matrix[column][j]
        rhs[row] -= factor * rhs[column]
      }
    }
    solved = rhs
    const voltageOfNode = (id: string) => { const index = nodeFor(id); return index === undefined ? 0 : solved[index] }
    parts.filter((part) => part.kind === 'diode').forEach((part) => {
      const voltage = voltageOfNode(pinId(part, 'a')) - voltageOfNode(pinId(part, 'b'))
      const nextState: -1 | 0 | 1 = voltage > Math.max(0, part.value) ? 1 : part.diodeModel === 'zener' && voltage < -(part.zenerVoltage ?? 5.1) ? -1 : 0
      if (nextState !== (diodeStates.get(part.id) ?? 0)) { diodeStates.set(part.id, nextState); changed = true }
    })
  }
  const nodeVoltages: Record<string, number> = { [groundRoot]: 0 }
  roots.forEach((root, index) => { nodeVoltages[root] = solved[index] })
  const voltageOf = (id: string) => nodeVoltages[find(id)] ?? 0
  const readings = parts.filter((part) => part.kind !== 'ground' && part.kind !== 'junction').map((part) => {
    const a = voltageOf(pinId(part, 'a')), b = voltageOf(pinId(part, 'b'))
    const voltage = a - b
    const current = part.kind === 'source' ? solved[roots.length + voltageSources.findIndex((source) => source.id === part.id)]
      : part.kind === 'resistor' ? voltage / Math.max(0.001, part.value)
        : part.kind === 'inductor' ? voltage * 1e6
          : part.kind === 'diode' ? ((diodeStates.get(part.id) ?? 0) === 1 ? (voltage - Math.max(0, part.value)) * diodeConductance : (diodeStates.get(part.id) ?? 0) === -1 ? (voltage + (part.zenerVoltage ?? 5.1)) * diodeConductance : 0)
            : part.kind === 'switch' ? voltage * (part.on ? 50 : 1e-10) : 0
    return { id: part.id, label: part.label, voltage, current, power: voltage * current }
  })
  const pins = allPins.map((pin) => ({ id: pin.id, voltage: voltageOf(pin.id) }))
  return { readings, nodeVoltages: Object.fromEntries(pins.map((pin) => [pin.id, pin.voltage])), message: 'DC operating point solved · diodes block reverse current; Zeners conduct in breakdown.' }
}
type CircuitCheck = { level: 'error' | 'warning' | 'info'; title: string; detail: string }
function checkCircuit(parts: Part[], wires: Wire[], simulation?: Simulation | null): CircuitCheck[] {
  const checks: CircuitCheck[] = []
  const knownPins = new Set(parts.flatMap(pinsFor).map((pin) => pin.id))
  const pinUse = new Map<string, number>()
  wires.forEach((wire) => { pinUse.set(wire.from, (pinUse.get(wire.from) ?? 0) + 1); pinUse.set(wire.to, (pinUse.get(wire.to) ?? 0) + 1) })
  const supplies = parts.filter((part) => part.kind === 'source' || part.kind === 'ac-source')
  const loads = parts.filter((part) => ['resistor', 'capacitor', 'inductor', 'diode', 'switch'].includes(part.kind))
  if (!supplies.length) checks.push({ level: 'error', title: 'No power source', detail: 'Place a DC source or AC supply before simulating.' })
  else checks.push({ level: 'info', title: `${supplies.length} power source${supplies.length === 1 ? '' : 's'} placed`, detail: supplies.map((part) => part.label).join(', ') })
  if (!parts.some((part) => part.kind === 'ground')) checks.push({ level: 'error', title: 'Ground reference is missing', detail: 'Add ground and connect it to the circuit so node voltages have a reference.' })
  else checks.push({ level: 'info', title: 'Ground reference found', detail: 'A reference node is available for voltage analysis.' })
  parts.filter((part)=>part.kind==='ground'&&(pinUse.get(pinId(part,'g'))??0)===0).forEach((part)=>checks.push({level:'warning',title:'Ground is not connected',detail:`Connect ${part.label} to a circuit node before relying on node voltage readings.`}))
  if (!loads.length) checks.push({ level: 'warning', title: 'No load components', detail: 'Add a resistor, capacitor, inductor, diode, or switch to study circuit behavior.' })
  const dangling = parts.filter((part) => !['ground', 'junction'].includes(part.kind)).flatMap((part) => pinsFor(part)).filter((pin) => (pinUse.get(pin.id) ?? 0) === 0)
  if (dangling.length) checks.push({ level: 'warning', title: `${dangling.length} unconnected terminal${dangling.length === 1 ? '' : 's'}`, detail: `Connect: ${dangling.slice(0, 6).map((pin) => `${parts.find((part) => pin.id.startsWith(part.id + ':'))?.label ?? 'part'} ${pin.label}`).join(', ')}${dangling.length > 6 ? '…' : ''}` })
  const invalid = parts.filter((part) => ['source', 'ac-source', 'resistor', 'capacitor', 'inductor', 'diode'].includes(part.kind) && (!Number.isFinite(part.value) || part.value <= 0))
  if (invalid.length) checks.push({ level: 'error', title: 'Invalid component values', detail: invalid.map((part) => part.label).join(', ') })
  const staleWires = wires.filter((wire) => !knownPins.has(wire.from) || !knownPins.has(wire.to))
  if (staleWires.length) checks.push({ level: 'error', title: 'Wire endpoint is missing', detail: 'Delete or reconnect the wire with a missing terminal.' })
  const nets = new Map<string,string>()
  const root = (id: string): string => { if (!nets.has(id)) nets.set(id,id); const parent=nets.get(id)!; if (parent!==id) nets.set(id,root(parent)); return nets.get(id)! }
  wires.filter((wire) => knownPins.has(wire.from) && knownPins.has(wire.to)).forEach((wire) => nets.set(root(wire.from),root(wire.to)))
  supplies.forEach((part) => { if (root(pinId(part,'a'))===root(pinId(part,'b'))) checks.push({ level:'error',title:`${part.label} is shorted`,detail:'Both supply terminals are connected to the same wire net. Separate the terminals before powering the circuit.' }) })
  const closedSwitches = parts.filter((part) => part.kind === 'switch' && part.on)
  if (closedSwitches.length) checks.push({ level: 'info', title: `${closedSwitches.length} closed switch${closedSwitches.length === 1 ? '' : 'es'}`, detail: 'Closed switches are treated as a small resistance in this idealized model.' })
  const peakMagnitude = (values: number[] | undefined) => values?.length ? Math.max(...values.map((value) => Math.abs(value))) : undefined
  if (simulation) parts.forEach((part) => {
    const reading = simulation.readings.find((item) => item.id === part.id)
    if (!reading) return
    const voltageSamples = simulation.timeDomain?.partVoltages[part.id], currentSamples = simulation.timeDomain?.partCurrents[part.id]
    const currentStress = peakMagnitude(currentSamples) ?? Math.abs(reading.current)
    const voltageStress = part.kind === 'diode' && voltageSamples?.length ? Math.max(0, ...voltageSamples.map((value) => -value)) : peakMagnitude(voltageSamples) ?? Math.abs(reading.voltage)
    const peakPower = voltageSamples?.length && currentSamples?.length ? Math.max(...voltageSamples.map((value, index) => Math.abs(value * (currentSamples[index] ?? 0)))) : Math.abs(reading.power)
    if (part.powerRating && ['resistor', 'diode'].includes(part.kind) && peakPower > part.powerRating) checks.push({ level: 'warning', title: `${part.label} may exceed its power rating`, detail: `Estimated peak dissipation ${fmt(peakPower, 'W')} is above the entered ${fmt(part.powerRating, 'W')} rating.` })
    if (part.currentRating && ['diode', 'inductor'].includes(part.kind) && currentStress > part.currentRating) checks.push({ level: 'warning', title: `${part.label} may exceed its current rating`, detail: `Estimated peak current ${fmt(currentStress, 'A')} is above the entered ${fmt(part.currentRating, 'A')} rating.` })
    if (part.voltageRating && ['capacitor', 'diode'].includes(part.kind) && voltageStress > part.voltageRating) checks.push({ level: 'warning', title: `${part.label} may exceed its voltage rating`, detail: `${part.kind === 'diode' ? 'Estimated reverse voltage' : 'Estimated voltage'} ${fmt(voltageStress, 'V')} is above the entered ${fmt(part.voltageRating, 'V')} rating.` })
    if (part.kind === 'diode' && part.thermalResistance && Math.abs(reading.power) > 0) {
      const estimatedJunction = 25 + Math.abs(reading.power) * part.thermalResistance
      if (estimatedJunction > (part.maxJunctionTemperature ?? 125)) checks.push({ level: 'warning', title: `${part.label} may overheat`, detail: `Estimated junction temperature is ${estimatedJunction.toFixed(0)} °C at 25 °C ambient, above the entered limit of ${(part.maxJunctionTemperature ?? 125).toFixed(0)} °C.` })
    }
    if (part.kind === 'diode' && part.diodeModel === 'zener') {
      const breakdown = Math.abs(reading.voltage) >= (part.zenerVoltage ?? 5.1) * 0.9
      checks.push({ level: 'info', title: `${part.label} Zener ${simulation.ac ? 'AC readings' : breakdown ? 'regulation active' : 'below breakdown'}`, detail: `${simulation.ac ? 'RMS voltage' : 'Output across Zener'}: ${fmt(Math.abs(reading.voltage), 'V')} · ${simulation.ac ? 'RMS current' : 'Zener current'}: ${fmt(Math.abs(reading.current), 'A')}${breakdown && !simulation.ac ? '' : ` · target breakdown ${fmt(part.zenerVoltage ?? 5.1, 'V')}`}.` })
    }
  })
  if (parts.some((part) => part.kind === 'ac-source') && parts.some((part) => part.kind === 'diode')) checks.push({ level: 'info', title: 'AC diodes use a waveform model', detail: 'The simulator samples three AC cycles to estimate RMS values; open transient analysis to inspect the rectified waveform.' })
  if (checks.every((check) => check.level !== 'error' && check.level !== 'warning')) checks.push({ level: 'info', title: 'Ready to simulate', detail: 'No basic connection or setup issues were found.' })
  return checks
}
function solveTransient(parts: Part[], wires: Wire[], duration: number, steps: number): TransientResult {
  if (!Number.isFinite(duration) || duration <= 0 || duration > 10) throw new Error('Transient duration must be between 0 and 10 seconds.')
  if (!Number.isInteger(steps) || steps < 40 || steps > 1600) throw new Error('Choose between 40 and 1,600 time steps.')
  const sources=parts.filter((part)=>part.kind==='source'||part.kind==='ac-source'), inductors=parts.filter((part)=>part.kind==='inductor'), diodes=parts.filter((part)=>part.kind==='diode')
  if (!sources.length) throw new Error('Add a DC or AC supply before running transient analysis.')
  const parent=new Map<string,string>(), find=(id:string):string=>{if(!parent.has(id))parent.set(id,id);const p=parent.get(id)!;if(p!==id)parent.set(id,find(p));return parent.get(id)!}, join=(a:string,b:string)=>{const ra=find(a),rb=find(b);if(ra!==rb)parent.set(ra,rb)}
  const pins=parts.flatMap(pinsFor); pins.forEach(pin=>find(pin.id)); wires.forEach(wire=>{if(parent.has(wire.from)&&parent.has(wire.to))join(wire.from,wire.to)})
  const grounds=parts.filter(part=>part.kind==='ground').map(part=>pinId(part,'g'))
  if(!grounds.length)throw new Error('Add ground before running transient analysis.')
  grounds.slice(1).forEach(id=>join(grounds[0],id))
  const ground=find(grounds[0]), roots=Array.from(new Set(pins.map(pin=>find(pin.id)))).filter(id=>id!==ground), nodeIndex=new Map(roots.map((id,index)=>[id,index]))
  const sourceBranch=roots.length, inductorBranch=sourceBranch+sources.length, size=roots.length+sources.length+inductors.length, dt=duration/steps
  const node=(id:string)=>nodeIndex.get(find(id)), times=[0], nodeSamples:Record<string,number[]>={}, voltageSamples:Record<string,number[]>={}, currentSamples:Record<string,number[]>={}
  pins.forEach(pin=>nodeSamples[pin.id]=[0]); parts.filter(part=>!['ground','junction'].includes(part.kind)).forEach(part=>{voltageSamples[part.id]=[0];currentSamples[part.id]=[0]})
  const capacitorHistory=new Map<string,number>(), inductorHistory=new Map<string,number>(), diodeModes=new Map<string,-1|0|1|2>(), diodeRecoveryUntil=new Map<string,number>()
  const solve=(matrix:number[][],rhs:number[])=>{
    for(let col=0;col<size;col++){let pivot=col;for(let row=col+1;row<size;row++)if(Math.abs(matrix[row][col])>Math.abs(matrix[pivot][col]))pivot=row;if(Math.abs(matrix[pivot][col])<1e-16)throw new Error('Transient solve failed: the circuit has a floating node, an open loop, or an ideal short. Check the connections.');[matrix[col],matrix[pivot]]=[matrix[pivot],matrix[col]];[rhs[col],rhs[pivot]]=[rhs[pivot],rhs[col]];const d=matrix[col][col];for(let j=col;j<size;j++)matrix[col][j]/=d;rhs[col]/=d;for(let row=0;row<size;row++){if(row===col)continue;const f=matrix[row][col];if(Math.abs(f)<1e-20)continue;for(let j=col;j<size;j++)matrix[row][j]-=f*matrix[col][j];rhs[row]-=f*rhs[col]}}
    return rhs
  }
  for(let step=1;step<=steps;step++){
    const t=step*dt
    let solution:number[]=[]
    for(let iteration=0;iteration<8;iteration++){
      const matrix=Array.from({length:size},()=>Array(size).fill(0)),rhs=Array(size).fill(0)
      const stampG=(a:string,b:string,g:number)=>{const ia=node(a),ib=node(b);if(ia!==undefined)matrix[ia][ia]+=g;if(ib!==undefined)matrix[ib][ib]+=g;if(ia!==undefined&&ib!==undefined){matrix[ia][ib]-=g;matrix[ib][ia]-=g}}
      parts.forEach(part=>{const a=pinId(part,'a'),b=pinId(part,'b');if(part.kind==='resistor')stampG(a,b,1/Math.max(.001,part.value));if(part.kind==='switch')stampG(a,b,part.on?50:1e-10);if(part.kind==='capacitor'){const g=Math.max(0,part.value)/dt;stampG(a,b,g);const history=g*(capacitorHistory.get(part.id)??0),ia=node(a),ib=node(b);if(ia!==undefined)rhs[ia]+=history;if(ib!==undefined)rhs[ib]-=history}if(part.kind==='diode'){const mode=diodeModes.get(part.id)??0,capacitance=(part.junctionCapacitancePf??0)*1e-12;if(capacitance>0){const gc=capacitance/dt,history=gc*(capacitorHistory.get(part.id)??0),ia=node(a),ib=node(b);stampG(a,b,gc);if(ia!==undefined)rhs[ia]+=history;if(ib!==undefined)rhs[ib]-=history}if(mode){const target=mode===1?Math.max(0,part.value):mode===-1?-(part.zenerVoltage??5.1):0,g=mode===2?20:1000,ia=node(a),ib=node(b);stampG(a,b,g);if(ia!==undefined)rhs[ia]+=g*target;if(ib!==undefined)rhs[ib]-=g*target}}})
      const stampBranch=(a:string,b:string,column:number,seriesTerm:number,history:number,sourceVoltage?:number)=>{const ia=node(a),ib=node(b);if(ia!==undefined){matrix[ia][column]+=1;matrix[column][ia]+=1}if(ib!==undefined){matrix[ib][column]-=1;matrix[column][ib]-=1}matrix[column][column]-=seriesTerm;rhs[column]=sourceVoltage??history}
      sources.forEach((part,index)=>{const voltage=part.kind==='ac-source'?Math.SQRT2*part.value*Math.sin(2*Math.PI*(part.frequency??60)*t):part.value;stampBranch(pinId(part,'a'),pinId(part,'b'),sourceBranch+index,0,0,voltage)})
      inductors.forEach((part,index)=>{const term=Math.max(1e-12,part.value)/dt;stampBranch(pinId(part,'a'),pinId(part,'b'),inductorBranch+index,term,-term*(inductorHistory.get(part.id)??0))})
      solution=solve(matrix,rhs)
      const value=(id:string)=>{const index=node(id);return index===undefined?0:solution[index]}
      let changed=false
      diodes.forEach(part=>{const v=value(pinId(part,'a'))-value(pinId(part,'b')),previous=diodeModes.get(part.id)??0;let mode:-1|0|1|2=v>Math.max(0,part.value)?1:part.diodeModel==='zener'&&v<-(part.zenerVoltage??5.1)?-1:0;if(previous===1&&mode!==1&&(part.reverseRecoveryNs??0)>0)diodeRecoveryUntil.set(part.id,t+(part.reverseRecoveryNs??0)*1e-9);if(mode===0&&v<0&&t<(diodeRecoveryUntil.get(part.id)??0))mode=2;if(mode!==previous){diodeModes.set(part.id,mode);changed=true}})
      if(!changed)break
    }
    const value=(id:string)=>{const index=node(id);return index===undefined?0:solution[index]}
    pins.forEach(pin=>nodeSamples[pin.id].push(value(pin.id)))
    parts.filter(part=>!['ground','junction'].includes(part.kind)).forEach(part=>{const va=value(pinId(part,'a')),vb=value(pinId(part,'b')),v=va-vb;let current=0;if(part.kind==='resistor')current=v/Math.max(.001,part.value);else if(part.kind==='switch')current=v*(part.on?50:1e-10);else if(part.kind==='capacitor'){const g=Math.max(0,part.value)/dt;current=g*(v-(capacitorHistory.get(part.id)??0));capacitorHistory.set(part.id,v)}else if(part.kind==='inductor'){current=solution[inductorBranch+inductors.findIndex(item=>item.id===part.id)];inductorHistory.set(part.id,current)}else if(part.kind==='diode'){const mode=diodeModes.get(part.id)??0,target=mode===1?Math.max(0,part.value):mode===-1?-(part.zenerVoltage??5.1):0,conductance=mode===2?20:1000,oldVoltage=capacitorHistory.get(part.id)??0;current=(mode?conductance*(v-target):0)+((part.junctionCapacitancePf??0)*1e-12/dt)*(v-oldVoltage);if((part.junctionCapacitancePf??0)>0)capacitorHistory.set(part.id,v)}else if(part.kind==='source'||part.kind==='ac-source')current=solution[sourceBranch+sources.findIndex(item=>item.id===part.id)];voltageSamples[part.id].push(v);currentSamples[part.id].push(current)})
    times.push(t)
  }
  return {times,nodeVoltages:nodeSamples,partVoltages:voltageSamples,partCurrents:currentSamples,message:`Transient response solved · ${steps} steps over ${fmt(duration,'s')} · diode recovery and junction capacitance use a simplified model`}
}
function solveDiodeAcWaveform(parts: Part[], wires: Wire[], frequency: number): Simulation {
  if (frequency > 5000) throw new Error('AC diode waveforms are limited to 5 kHz for this time-domain model. Lower the supply frequency or use an idealized AC circuit without diodes.')
  const duration=Math.min(10,3/frequency),steps=Math.min(1600,Math.max(240,Math.round(duration*frequency*240)))
  const timeDomain=solveTransient(parts,wires,duration,steps),samples=Math.max(12,Math.min(steps,Math.round(steps/(duration*frequency)))),start=Math.max(1,steps-samples+1)
  const rms=(values:number[])=>Math.sqrt(values.slice(start).reduce((sum,value)=>sum+value*value,0)/Math.max(1,values.length-start))
  const averageProduct=(a:number[],b:number[])=>{const pairs=a.slice(start).map((value,index)=>value*(b[start+index]??0));return pairs.reduce((sum,value)=>sum+value,0)/Math.max(1,pairs.length)}
  const readings=parts.filter(part=>part.kind!=='ground'&&part.kind!=='junction').map(part=>({id:part.id,label:part.label,voltage:rms(timeDomain.partVoltages[part.id]??[]),current:rms(timeDomain.partCurrents[part.id]??[]),power:averageProduct(timeDomain.partVoltages[part.id]??[],timeDomain.partCurrents[part.id]??[])}))
  const nodeVoltages=Object.fromEntries(Object.entries(timeDomain.nodeVoltages).map(([id,values])=>[id,rms(values)]))
  return {readings,nodeVoltages,frequency,ac:true,message:`AC diode response solved over three waveform cycles at ${frequency} Hz · readings are RMS voltage/current and average power`,timeDomain}
}
const fmt = (value: number, unit: string) => {
  const abs = Math.abs(value)
  const [scaled, prefix] = abs >= 1e6 ? [value / 1e6, 'M'] : abs >= 1e3 ? [value / 1e3, 'k'] : abs >= 1 ? [value, ''] : abs >= 1e-3 ? [value * 1e3, 'm'] : [value * 1e6, 'µ']
  return (Math.abs(scaled) < 10 ? scaled.toFixed(3) : scaled.toFixed(2)) + ' ' + prefix + unit
}
const partNames: Record<Kind, string> = { source: 'DC source', 'ac-source': 'AC supply', resistor: 'Resistor', capacitor: 'Capacitor', inductor: 'Inductor', diode: 'Diode', switch: 'Switch', ground: 'Ground', junction: 'Wire junction' }
const partGlyph: Record<Kind, string> = { source: '＋', 'ac-source': '∿', resistor: '▱', capacitor: '║', inductor: '∿', diode: '▷', switch: '⌁', ground: '⏚', junction: '●' }
const diodeModelDefaults: Record<DiodeModel, number> = { silicon: 0.7, schottky: 0.3, zener: 0.7, led: 1.8 }
const commonPartValues: Partial<Record<Kind,{label:string;value:number;model?:DiodeModel}[]>> = {
  source:[1.5,3.3,5,9,12,24].map(value=>({label:`${value} V`,value})),
  'ac-source':[1,3,6,12,24,120,230].map(value=>({label:`${value} V RMS`,value})),
  resistor:[10,22,47,100,220,330,470,1000,2200,4700,10000].map(value=>({label:fmt(value,'Ω'),value})),
  capacitor:[1e-9,10e-9,100e-9,1e-6,10e-6,47e-6,100e-6,470e-6].map(value=>({label:fmt(value,'F'),value})),
  inductor:[1e-3,4.7e-3,10e-3,47e-3,100e-3,1].map(value=>({label:fmt(value,'H'),value})),
  diode:[{label:'Schottky · 0.3 V',value:.3,model:'schottky'},{label:'Silicon · 0.7 V',value:.7,model:'silicon'},{label:'Red LED · 1.8 V',value:1.8,model:'led'},{label:'Blue LED · 3.0 V',value:3,model:'led'}],
}
function componentTracePath(reading: Reading, simulation: Simulation, current = false) {
  const magnitude = current ? reading.current : reading.voltage
  const phase = current ? reading.currentPhase ?? 0 : reading.voltagePhase ?? 0
  const samples = Array.from({ length: 81 }, (_, index) => simulation.ac ? Math.SQRT2 * magnitude * Math.sin(2 * Math.PI * index / 80 + phase) : magnitude)
  const max = Math.max(...samples.map(Math.abs), 1e-12)
  return samples.map((sample, index) => `${index ? 'L' : 'M'} ${54 + index * 11.15} ${current ? 112 - sample / max * 25 : 43 - sample / max * 25}`).join(' ')
}
function transientTracePath(values: number[], yTop: number, yBottom: number) {
  if(!values.length)return ''
  const stride=Math.max(1,Math.ceil(values.length/600)),sampled=values.filter((_,index)=>index%stride===0||index===values.length-1),max=Math.max(...sampled.map(Math.abs),1e-12),span=yBottom-yTop
  return sampled.map((value,index)=>`${index?'L':'M'} ${52+index*(916/Math.max(1,sampled.length-1))} ${yTop+span/2-value/max*(span*.44)}`).join(' ')
}
function transientRange(values: number[]) {
  if (!values.length) return { min: 0, max: 0 }
  const min = Math.min(...values), max = Math.max(...values)
  if (Math.abs(max - min) < 1e-12) return { min: min - 1e-9, max: max + 1e-9 }
  return { min, max }
}
function transientPlotPath(values: number[], yTop: number, yBottom: number) {
  if (!values.length) return ''
  const stride = Math.max(1, Math.ceil(values.length / 600))
  const sampled = values.filter((_, index) => index % stride === 0 || index === values.length - 1)
  const { min, max } = transientRange(sampled), span = max - min || 1
  return sampled.map((value, index) => `${index ? 'L' : 'M'} ${60 + index * (900 / Math.max(1, sampled.length - 1))} ${yBottom - ((value - min) / span) * (yBottom - yTop)}`).join(' ')
}
const symbolPinsText = (part: Part) => pinsFor(part)
const wirePath = (a: Point, b: Point, points: Point[] = []) => [a, ...points, b].map((point, index) => (index === 0 ? 'M' : 'L') + point.x + ' ' + point.y).join(' ')
const constrainWirePoint = (origin: Point, target: Point): Point => Math.abs(target.x - origin.x) >= Math.abs(target.y - origin.y) ? { x: target.x, y: origin.y } : { x: origin.x, y: target.y }
const nearestPointOnSegment = (point: Point, a: Point, b: Point) => {
  const dx = b.x - a.x, dy = b.y - a.y
  const lengthSquared = dx * dx + dy * dy
  const t = lengthSquared ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared)) : 0
  const projected = { x: a.x + t * dx, y: a.y + t * dy }
  return { point: projected, distance: Math.hypot(point.x - projected.x, point.y - projected.y) }
}
function PartSymbol({ part, selected, onPointerDown, onPin, onPinPointerDown, voltageMap, showValues, showOhmUnit, europeanResistors }: {
  part: Part; selected: boolean; onPointerDown: (event: ReactPointerEvent<SVGGElement>, part: Part) => void
  onPin: (pin: Pin) => void; onPinPointerDown: (event: ReactPointerEvent<SVGGElement>, pin: Pin) => void; voltageMap?: Record<string, number>; showValues: boolean; showOhmUnit: boolean; europeanResistors: boolean
}) {
  const pins = symbolPinsText(part)
  const localPinOffset = (pin: Pin) => part.kind === 'ground' ? { x: 0, y: -23 } : part.kind === 'junction' ? { x: 0, y: 0 } : { x: pin.id.endsWith(':a') ? -48 : 48, y: 0 }
  const voltageLabel = (pin: Pin) => voltageMap ? fmt(voltageMap[pin.id] ?? 0, 'V') : pin.label
  return <g data-part-id={part.id} transform={'translate(' + part.x + ' ' + part.y + ') rotate(' + (part.rotation ?? 0) + ') scale(' + (part.mirrorX ? -1 : 1) + ' ' + (part.mirrorY ? -1 : 1) + ')'} className={'circuit-part ' + (selected ? 'selected' : '')} onPointerDown={(event) => onPointerDown(event, part)}>
    {part.kind === 'resistor' && <>
      {europeanResistors ? <><line x1="-48" y1="0" x2="-25" y2="0" /><rect x="-25" y="-10" width="50" height="20" /><line x1="25" y1="0" x2="48" y2="0" /></> : <><line x1="-48" y1="0" x2="-31" y2="0" /><path d="M-31 0 L-21 -12 L-11 12 L-1 -12 L9 12 L19 -12 L29 0" /><line x1="29" y1="0" x2="48" y2="0" /></>}
    </>}
    {part.kind === 'capacitor' && <><line x1="-48" y1="0" x2="-8" y2="0" /><line x1="-8" y1="-18" x2="-8" y2="18" className="component-plate" /><line x1="8" y1="-18" x2="8" y2="18" className="component-plate" /><line x1="8" y1="0" x2="48" y2="0" /></>}
    {part.kind === 'inductor' && <><line x1="-48" y1="0" x2="-30" y2="0" /><path d="M-30 0 C-30 -21 -10 -21 -10 0 C-10 -21 10 -21 10 0 C10 -21 30 -21 30 0" /><line x1="30" y1="0" x2="48" y2="0" /></>}
    {part.kind === 'diode' && <><line x1="-48" y1="0" x2="-14" y2="0" /><path d="M-14 -17 L14 0 L-14 17 Z" className="diode-triangle" /><line x1="14" y1="-18" x2="14" y2="18" className="component-plate" /><line x1="14" y1="0" x2="48" y2="0" /></>}
    {(part.kind === 'source' || part.kind === 'ac-source') && <>
      <line x1="-48" y1="0" x2="-27" y2="0" /><line x1="27" y1="0" x2="48" y2="0" /><circle r="27" /><text className="source-plus" x="-9" y="-3">+</text><text className="source-minus" x="7" y="5">−</text>
    </>}
    {part.kind === 'switch' && <>
      <line x1="-48" y1="0" x2="-25" y2="0" /><line x1="25" y1="0" x2="48" y2="0" /><circle cx="-25" r="3" /><circle cx="25" r="3" /><line x1="-25" y1="0" x2={part.on ? 24 : 12} y2={part.on ? 0 : -14} className="switch-lever" />
    </>}
    {part.kind === 'ground' && <g transform="translate(0 -23)"><line y1="0" y2="10" /><line x1="-17" y1="10" x2="17" y2="10" /><line x1="-11" y1="15" x2="11" y2="15" /><line x1="-5" y1="20" x2="5" y2="20" /></g>}
    {pins.map((pin) => {
      const local = localPinOffset(pin)
      return <g key={pin.id} data-pin-id={pin.id} className="circuit-pin" onPointerDown={(event) => { event.stopPropagation(); onPinPointerDown(event, pin) }} onClick={(event) => { event.stopPropagation(); onPin(pin) }}>
        <circle cx={local.x} cy={local.y} r="8" className="pin-hit" />
        <circle cx={local.x} cy={local.y} r="3.2" className="pin-dot" />
        <text x={local.x} y={local.y - 12} className="pin-label">{voltageLabel(pin)}</text>
      </g>
    })}
    {part.kind !== 'ground' && part.kind !== 'junction' && <text x="0" y="39" className="part-label">{part.label}</text>}
    {showValues && part.kind !== 'ground' && part.kind !== 'junction' && <text x="0" y="56" className="part-value">{part.kind === 'source' ? fmt(part.value, 'V') : part.kind === 'ac-source' ? fmt(part.value, 'V rms') : part.kind === 'resistor' ? fmt(part.value, showOhmUnit ? 'Ω' : '') : part.kind === 'capacitor' ? fmt(part.value, 'F') : part.kind === 'inductor' ? fmt(part.value, 'H') : part.kind === 'diode' ? 'Vf ' + fmt(part.value, 'V') : part.on ? 'Closed' : 'Open'}</text>}
  </g>
}
export default function CircuitSimulator({ onBack }: { onBack: () => void }) {
  const [circuit, setCircuit] = useState<Circuit>(loadCircuit)
  const [colorTheme, setColorTheme] = useSimulatorTheme()
  const [selectedPart, setSelectedPart] = useState<string | null>(null)
  const [selectedParts, setSelectedParts] = useState<string[]>([])
  const [selectedWire, setSelectedWire] = useState<string | null>(null)
  const [selectedDrawing, setSelectedDrawing] = useState<string | null>(null)
  const [drawingDrag, setDrawingDrag] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const [openMenu, setOpenMenu] = useState<'file' | 'place' | 'edit' | 'draw' | 'options' | 'tools' | 'circuits' | null>(null)
  const [findQuery, setFindQuery] = useState('')
  const [clipboard, setClipboard] = useState<{ parts: Part[]; wires: Wire[] }>({ parts: [], wires: [] })
  const [zoom, setZoom] = useState(1)
  const [viewCenter, setViewCenter] = useState<Point>({ x: W / 2, y: H / 2 })
  const [placement, setPlacement] = useState<Kind | null>(null)
  const [drawMode, setDrawMode] = useState<DrawKind | null>(null)
  const [drawContent, setDrawContent] = useState('')
  const [wireStart, setWireStart] = useState<string | null>(null)
  const [dmmActive, setDmmActive] = useState(false)
  const [meterMode, setMeterMode] = useState<MeterMode>('voltage')
  const [meterProbe, setMeterProbe] = useState<'red' | 'black' | null>(null)
  const [meterPins, setMeterPins] = useState<{ red: string | null; black: string | null }>({ red: null, black: null })
  const [meterReading, setMeterReading] = useState('Choose a mode, then connect the probes.')
  const [gridVisible, setGridVisible] = useState(true)
  const [options, setOptions] = useState<CircuitOptions>(() => { try { return { ...defaultCircuitOptions, ...JSON.parse(localStorage.getItem('ozoo:circuit-options') ?? '{}') } } catch { return defaultCircuitOptions } })
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showOtherOptions, setShowOtherOptions] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [hasRecovery, setHasRecovery] = useState(() => { try { return !!localStorage.getItem('ozoo:circuit-recovery') } catch { return false } })
  const [circuitSearch, setCircuitSearch] = useState('')
  const toggleOption = (key: keyof CircuitOptions) => setOptions((current) => ({ ...current, [key]: !current[key] }))
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [simulationActive, setSimulationActive] = useState(false)
  const [circuitChecks, setCircuitChecks] = useState<CircuitCheck[] | null>(null)
  const [frequencySweep, setFrequencySweep] = useState<{ label: string; samples: { frequency: number; voltage: number }[] } | null>(null)
  const [savedCircuits, setSavedCircuits] = useState<SavedCircuit[]>(loadSavedCircuits)
  const [savedRuns, setSavedRuns] = useState<SavedRun[]>(loadSavedRuns)
  const [lesson, setLesson] = useState<{ lesson: GuidedLesson; step: number } | null>(null)
  const [comparisonBase, setComparisonBase] = useState<{ readings: Reading[]; label: string } | null>(null)
  const [transient, setTransient] = useState<TransientResult | null>(null)
  const [transientDurationMs, setTransientDurationMs] = useState(100)
  const [transientSteps, setTransientSteps] = useState(500)
  const [scopeActive, setScopeActive] = useState(false)
  const [scopeProbe, setScopeProbe] = useState<'a' | 'b' | null>(null)
  const [scopePins, setScopePins] = useState<{ a: string | null; b: string | null }>({ a: null, b: null })
  const [historyVersion, setHistoryVersion] = useState(0)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const [dragPoint, setDragPoint] = useState<WireHandle | null>(null)
  const [wirePoints, setWirePoints] = useState<Point[]>([])
  const [wireCursor, setWireCursor] = useState<Point | null>(null)
  const [wireSnapPreview, setWireSnapPreview] = useState<WireSnap | null>(null)
  const partDragOrigin = useRef<Point | null>(null)
  const partDragMoved = useRef(false)
  const wireDrag = useRef<{ from: string; x: number; y: number; moved: boolean } | null>(null)
  const suppressPinClick = useRef(false)
  const undoStack = useRef<Circuit[]>([])
  const redoStack = useRef<Circuit[]>([])
  const lastCircuit = useRef(circuit)
  const historyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const historyAction = useRef(false)
  const designFileInput = useRef<HTMLInputElement>(null)
  const pictureFileInput = useRef<HTMLInputElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const selected = circuit.parts.find((part) => part.id === selectedPart)
  const selectedReading = selected ? simulation?.readings.find((reading) => reading.id === selected.id) : undefined
  const diodeWaveform = selected?.kind === 'diode' ? transient ?? simulation?.timeDomain : undefined
  const diodeVoltage = diodeWaveform?.partVoltages[selected!.id] ?? []
  const diodeCurrent = diodeWaveform?.partCurrents[selected!.id] ?? []
  const diodePower = diodeVoltage.map((voltage, index) => voltage * (diodeCurrent[index] ?? 0))
  const selectedIds = selectedParts.length ? selectedParts : selectedPart ? [selectedPart] : []
  const metricColumns = Number(options.showVoltage) + Number(options.showCurrent) + Number(options.showPower)
  const viewWidth = W / zoom, viewHeight = H / zoom
  const viewBox = `${viewCenter.x - viewWidth / 2} ${viewCenter.y - viewHeight / 2} ${viewWidth} ${viewHeight}`
  const pinLookup = Object.fromEntries(circuit.parts.flatMap(pinsFor).map((pin) => [pin.id, pin]))
  const findWireSnap = (part: Part, x: number, y: number): WireSnap | null => {
    if (part.kind === 'junction') return null
    const movedPart = { ...part, x, y }
    const candidatePins = pinsFor(movedPart)
    // A dragged symbol should snap when its body reaches a wire; the chosen terminal
    // may be a short distance from the wire before it is translated into place.
    let closest: WireSnap | null = null, bestDistance = 58
    for (const wire of circuit.wires) {
      if (wire.from.startsWith(part.id + ':') || wire.to.startsWith(part.id + ':')) continue
      const a = pinLookup[wire.from], b = pinLookup[wire.to]
      if (!a || !b) continue
      const vertices = [a, ...(wire.points ?? []), b]
      for (const pin of candidatePins) for (let index = 0; index < vertices.length - 1; index++) {
        const projection = nearestPointOnSegment(pin, vertices[index], vertices[index + 1])
        if (projection.distance >= bestDistance) continue
        bestDistance = projection.distance
        closest = { partId: part.id, wireId: wire.id, pinId: pin.id, point: projection.point, x: x + projection.point.x - pin.x, y: y + projection.point.y - pin.y, segmentIndex: index }
      }
    }
    return closest
  }
  const attachPartToWire = (snap: WireSnap) => {
    const junctionId = makeId(), junctionPin = pinId({ id: junctionId } as Part, 'j')
    setCircuit((current) => {
      const target = current.wires.find((wire) => wire.id === snap.wireId)
      const moving = current.parts.find((part) => part.id === snap.partId)
      if (!target || !moving) return current
      const a = current.parts.flatMap(pinsFor).find((pin) => pin.id === target.from)
      const b = current.parts.flatMap(pinsFor).find((pin) => pin.id === target.to)
      if (!a || !b) return current
      const vertices = [a, ...(target.points ?? []), b]
      const leftPoints = vertices.slice(1, snap.segmentIndex + 1).map(({ x, y }) => ({ x, y }))
      const rightPoints = vertices.slice(snap.segmentIndex + 1, -1).map(({ x, y }) => ({ x, y }))
      const junction: Part = { id: junctionId, kind: 'junction', x: snap.point.x, y: snap.point.y, value: 0, label: 'J', on: true }
      const updatedMoving = { ...moving, x: snap.x, y: snap.y }
      const wires = current.wires.filter((wire) => wire.id !== target.id)
      wires.push(
        { id: makeId(), from: target.from, to: junctionPin, points: leftPoints },
        { id: makeId(), from: junctionPin, to: target.to, points: rightPoints },
        { id: makeId(), from: snap.pinId, to: junctionPin },
      )
      return { parts: [...current.parts.map((part) => part.id === updatedMoving.id ? updatedMoving : part), junction], wires }
    })
    setSelectedPart(snap.partId); setSelectedParts([]); setSelectedWire(null); setSimulation(null); setError('Component snapped to wire and connected.'); setWireSnapPreview(null)
  }
  useEffect(() => { try { const next = JSON.stringify(circuit); const previous = localStorage.getItem('ozoo:circuit'); if (previous && previous !== next) { localStorage.setItem('ozoo:circuit-recovery', previous); setHasRecovery(true) } localStorage.setItem('ozoo:circuit', next) } catch {} }, [circuit])
  useEffect(() => { setFrequencySweep(null); setCircuitChecks(null); setTransient(null) }, [circuit])
  useEffect(() => {
    const payload=new URLSearchParams(window.location.hash.slice(1)).get('circuit')
    if(!payload)return
    let active=true
    void decodeCircuitShare(payload).then((text)=>{if(!active)return;const data=JSON.parse(text) as Circuit;if(!Array.isArray(data.parts)||!Array.isArray(data.wires))throw new Error('This shared circuit is not a valid OzooNotes file.');setCircuit({parts:data.parts,wires:data.wires,drawings:Array.isArray(data.drawings)?data.drawings:[]});setSelectedPart(null);setSelectedParts([]);setSelectedWire(null);setError('Shared circuit loaded. Save a copy if you want to keep it in your browser.');const url=new URL(window.location.href);url.hash='';window.history.replaceState(window.history.state,'',url.pathname+url.search)}).catch(()=>setError('This shared circuit link is incomplete or unsupported.'))
    return()=>{active=false}
  },[])
  useEffect(() => { try { localStorage.setItem('ozoo:circuit-options', JSON.stringify(options)) } catch {} }, [options])
  useEffect(() => { try { localStorage.setItem('ozoo:circuit-library', JSON.stringify(savedCircuits)) } catch { setError('The saved circuit library is full. Export circuits as files to keep additional copies.') } }, [savedCircuits])
  useEffect(() => { try { localStorage.setItem('ozoo:circuit-runs', JSON.stringify(savedRuns)) } catch { setError('Unable to save simulation history in this browser. Remove some saved runs and try again.') } }, [savedRuns])
  useEffect(() => {
    if (historyAction.current) { historyAction.current = false; lastCircuit.current = circuit; return }
    if (circuit === lastCircuit.current) return
    const previous = lastCircuit.current
    if (historyTimer.current) clearTimeout(historyTimer.current)
    historyTimer.current = setTimeout(() => { undoStack.current.push(previous); if (undoStack.current.length > 80) undoStack.current.shift(); redoStack.current = []; lastCircuit.current = circuit; historyTimer.current = null; setHistoryVersion((version) => version + 1) }, 240)
  }, [circuit])
  useEffect(() => {
    if (!simulationActive) return
    try { const result = solveCircuit(circuit.parts, circuit.wires); setSimulation(result); setCircuitChecks(checkCircuit(circuit.parts, circuit.wires, result)); setError('') }
    catch (reason) { setSimulation(null); setCircuitChecks(checkCircuit(circuit.parts, circuit.wires)); setError(reason instanceof Error ? reason.message : String(reason)) }
  }, [circuit, simulationActive])
  const screenPoint = (event: { clientX: number; clientY: number }) => {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (svg && matrix) {
      const point = svg.createSVGPoint()
      point.x = event.clientX; point.y = event.clientY
      const local = point.matrixTransform(matrix.inverse())
      return { x: local.x, y: local.y }
    }
    return { x: W / 2, y: H / 2 }
  }
  const addPartAt = (kind: Kind, x: number, y: number) => {
    if (options.disableEditing) return
    const labels: Record<Kind, string> = { source: 'V', 'ac-source': 'VAC', resistor: 'R', capacitor: 'C', inductor: 'L', diode: 'D', switch: 'S', ground: 'GND', junction: 'J' }
    const value = kind === 'source' || kind === 'ac-source' ? 5 : kind === 'resistor' ? 1000 : kind === 'capacitor' ? 100e-6 : kind === 'inductor' ? 10e-3 : kind === 'diode' ? 0.7 : 0
    const label = kind === 'ground' ? 'GND' : labels[kind] + (circuit.parts.filter((part) => part.kind === kind).length + 1)
    const part: Part = { id: makeId(), kind, x: Math.max(64, Math.min(W - 64, x)), y: Math.max(90, Math.min(H - 62, y)), value, label, on: true, ...(kind === 'ac-source' ? { frequency: 60 } : {}), ...(kind === 'diode' ? { diodeModel: 'silicon' as const } : {}) }
    setCircuit((current) => ({ ...current, parts: [...current.parts, part] }))
    setSelectedPart(part.id); setSelectedParts([]); setSelectedWire(null); setSelectedDrawing(null); setSimulation(null); setPlacement(null); setDmmActive(false); setMeterPins({ red: null, black: null })
  }
  const importPicture = (event: ChangeEvent<HTMLInputElement>) => {
    if (options.disableEditing) { event.target.value = ''; return }
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Choose an image file to place on the schematic.'); event.target.value = ''; return }
    if (file.size > 2 * 1024 * 1024) { setError('Images must be 2 MB or smaller so the circuit remains safely saved in this browser.'); event.target.value = ''; return }
    const reader = new FileReader()
    reader.onload = () => {
      setDrawContent(String(reader.result ?? ''))
      setDrawMode('image')
      setPlacement(null); setWireStart(null); setOpenMenu(null); setSelectedPart(null); setSelectedParts([]); setSelectedWire(null); setSelectedDrawing(null)
      setError('Click an open spot on the board to place the image.')
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }
  const beginDrawing = (kind: DrawKind) => {
    if (options.disableEditing) return
    if (kind === 'image') { pictureFileInput.current?.click(); return }
    const content = kind === 'text' ? window.prompt('Text to place on the circuit:') : ''
    if (kind === 'text' && !content?.trim()) return
    setDrawContent(content?.trim() ?? '')
    setDrawMode(kind); setPlacement(null); setWireStart(null); setOpenMenu(null); setSelectedPart(null); setSelectedParts([]); setSelectedWire(null); setSelectedDrawing(null)
    setError(`Click an open spot on the board to place ${kind === 'text' ? 'the text' : `a ${kind}`}.`)
  }
  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) return
    if (wireStart) {
      const raw = screenPoint(event), origin = wirePoints.at(-1) ?? pinLookup[wireStart]
      const point = event.shiftKey && origin ? constrainWirePoint(origin, raw) : raw
      setWirePoints((current) => [...current, point])
      setWireCursor(point)
      setError('Bend added. Click to add another bend or select a pin to finish the wire.')
      return
    }
    if (placement && !options.disableEditing) {
      const point = screenPoint(event)
      addPartAt(placement, point.x, point.y)
      return
    }
    if (drawMode && !options.disableEditing) {
      const point = screenPoint(event)
      const drawing: DrawItem = { id: makeId(), kind: drawMode, x: point.x, y: point.y, ...(drawContent ? { content: drawContent } : {}) }
      setCircuit((current) => ({ ...current, drawings: [...(current.drawings ?? []), drawing] }))
      setSelectedDrawing(null)
      setDrawMode(null); setDrawContent(''); setError('Drawing added to the circuit.')
      return
    }
    setSelectedDrawing(null)
    setSelectedPart(null)
    setSelectedParts([])
    setSelectedWire(null)
  }
  const handlePartPointerDown = (event: ReactPointerEvent<SVGGElement>, part: Part) => {
    if (event.button !== 0 || placement) return
    if (options.disableEditing) { setSelectedPart(part.id); setSelectedParts([]); setSelectedWire(null); setSelectedDrawing(null); return }
    if (dmmActive) {
      setSelectedPart(part.id); setSelectedParts([]); setSelectedWire(null); setSelectedDrawing(null)
      if (meterMode === 'voltage') { setMeterReading('Voltage mode: select two terminal pins.'); return }
      try {
        const analysis = solveCircuit(circuit.parts, circuit.wires)
        setSimulation(analysis)
        const result = analysis.readings.find((reading) => reading.id === part.id)
        if (meterMode === 'current') setMeterReading(result ? part.label + ' current: ' + fmt(result.current, analysis.ac ? 'A RMS' : 'A') : 'This component has no current reading.')
        else if (part.kind === 'resistor') setMeterReading(part.label + ' resistance: ' + fmt(part.value, 'Ω'))
        else if (part.kind === 'switch') setMeterReading(part.label + ' resistance: ' + (part.on ? '≈ 20 mΩ (closed)' : 'OL (open)'))
        else setMeterReading('Resistance mode: select a resistor or switch.')
      } catch (reason) { setMeterReading(reason instanceof Error ? reason.message : 'Run a valid circuit before measuring.') }
      return
    }
    if (event.shiftKey) {
      setSelectedParts((current) => { const base = current.length ? current : selectedPart ? [selectedPart] : []; return base.includes(part.id) ? base.filter((id) => id !== part.id) : [...base, part.id] })
      setSelectedPart(null); setSelectedWire(null); return
    }
    const point = screenPoint(event)
    setWireSnapPreview(null)
    partDragOrigin.current = point
    partDragMoved.current = false
    if (!selectedParts.includes(part.id)) { setSelectedPart(part.id); setSelectedParts([]) }
    else setSelectedPart(part.id)
    setSelectedWire(null); setSelectedDrawing(null)
    try { setSimulation(solveCircuit(circuit.parts, circuit.wires)); setError('') } catch { /* The scope stays empty until the circuit can be solved. */ }
    setDrag({ id: part.id, dx: point.x - part.x, dy: point.y - part.y })
    svgRef.current?.setPointerCapture(event.pointerId)
  }
  const handlePin = (pin: Pin) => {
    if (suppressPinClick.current) { suppressPinClick.current = false; return }
    if (options.disableEditing) return
    if (scopeProbe) { setScopePins((current)=>({...current,[scopeProbe]:pin.id})); setError(`Oscilloscope channel ${scopeProbe.toUpperCase()} connected to ${pin.label}.`); setScopeProbe(null); setScopeActive(true); return }
    if (dmmActive && meterMode !== 'voltage') { setMeterReading('Click a component body to measure ' + (meterMode === 'current' ? 'current.' : 'resistance.')); return }
    if (dmmActive && meterMode === 'voltage') {
      const lead = meterProbe ?? (meterPins.red === null ? 'red' : 'black')
      const nextPins = { ...meterPins, [lead]: pin.id }
      setMeterPins(nextPins)
      setMeterProbe(null)
      setError('')
      if (!nextPins.red || !nextPins.black) {
        setMeterReading(`${lead === 'red' ? 'Red' : 'Black'} probe placed on ${pin.label}. Choose the other probe and select a terminal.`)
        return
      }
      try {
        const result = solveCircuit(circuit.parts, circuit.wires)
        const volts = result.ac && result.nodePhasors
          ? cAbs(cSub(result.nodePhasors[nextPins.red] ?? complex(), result.nodePhasors[nextPins.black] ?? complex()))
          : (result.nodeVoltages[nextPins.red] ?? 0) - (result.nodeVoltages[nextPins.black] ?? 0)
        setMeterReading(fmt(volts, result.ac ? 'V RMS' : 'V'))
        setSimulation(result); setError('')
      } catch (reason) { setMeterReading(reason instanceof Error ? reason.message : 'Run a valid circuit before measuring.'); setError('') }
      return
    }
    setSelectedPart(null); setSelectedParts([]); setSelectedWire(null); setSelectedDrawing(null)
    if (!wireStart) { setPlacement(null); setWireStart(pin.id); setWirePoints([]); setWireCursor({ x: pin.x, y: pin.y }); setError('Wire follows the pointer. Click the board to add a bend, then another pin to finish.'); return }
    if (wireStart !== pin.id) setCircuit((current) => ({ ...current, wires: [...current.wires, { id: makeId(), from: wireStart, to: pin.id, points: wirePoints }] }))
    setWireStart(null); setWirePoints([]); setWireCursor(null); setError(''); setSimulation(null)
  }
  const handlePinPointerDown = (event: ReactPointerEvent<SVGGElement>, pin: Pin) => {
    if (event.button !== 0 || dmmActive || scopeProbe || placement || wireStart || options.disableEditing) return
    const point = screenPoint(event)
    wireDrag.current = { from: pin.id, x: point.x, y: point.y, moved: false }
    setWireStart(pin.id); setWirePoints([]); setWireCursor(point); setSelectedPart(null); setSelectedWire(null)
    setError('Drag this terminal to another pin to connect it, or click pins to route a wire.')
    svgRef.current?.setPointerCapture(event.pointerId)
  }
  const runSimulation = () => {
    setSimulationActive(true)
    setError('')
    try { const result = solveCircuit(circuit.parts, circuit.wires); setSimulation(result); setCircuitChecks(checkCircuit(circuit.parts, circuit.wires, result)); setTransient(result.timeDomain ?? null) }
    catch (reason) { setSimulation(null); setCircuitChecks(checkCircuit(circuit.parts, circuit.wires)); setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const runCircuitChecks = () => {
    let readings: Simulation | null = simulation
    if (!readings) { try { readings = solveCircuit(circuit.parts, circuit.wires) } catch { readings = null } }
    setCircuitChecks(checkCircuit(circuit.parts, circuit.wires, readings)); setOpenMenu(null)
  }
  const saveToCircuitLibrary = () => {
    if (options.disableEditing) return
    const name = window.prompt('Name this circuit:', `Circuit ${savedCircuits.length + 1}`)?.trim()
    if (!name) return
    if (savedCircuits.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) { setError('A saved circuit already has that name. Choose a different name.'); return }
    setSavedCircuits((items) => [{ id: makeId(), name, updatedAt: new Date().toISOString(), circuit: JSON.parse(JSON.stringify(circuit)) as Circuit }, ...items])
    setError(`“${name}” saved in this browser.`)
  }
  const openSavedCircuit = (saved: SavedCircuit) => { setCircuit(JSON.parse(JSON.stringify(saved.circuit)) as Circuit); setSelectedPart(null); setSelectedParts([]); setSelectedWire(null); setSelectedDrawing(null); setSimulation(null); setSimulationActive(false); setError(`Opened “${saved.name}”.`) }
  const beginLesson = (item: GuidedLesson) => {
    const preset = circuitPresets.find((entry) => entry.name === item.preset)
    if (!preset) return
    loadCircuitPreset(preset); setLesson({ lesson: item, step: 0 }); setOpenMenu(null)
  }
  const setComparisonBaseline = () => {
    try { const result = solveCircuit(circuit.parts, circuit.wires); setComparisonBase({ readings: result.readings, label: circuit.parts.filter((part) => !['ground','junction'].includes(part.kind)).map((part) => part.label).join(', ') }); setError('Comparison baseline saved. Change values or load another circuit, then simulate to compare.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Solve this circuit before saving a comparison baseline.') }
  }
  const saveSimulationRun = () => {
    try {
      const result = simulation ?? solveCircuit(circuit.parts, circuit.wires)
      const name = window.prompt('Name this simulation run:', `Run ${savedRuns.length + 1}`)?.trim()
      if (!name) return
      const run: SavedRun = { id: makeId(), name, createdAt: new Date().toISOString(), analysis: result.ac ? `AC · ${result.frequency} Hz` : 'DC', readings: result.readings.map((reading) => ({ ...reading })) }
      setSavedRuns((runs) => [run, ...runs].slice(0, 10))
      setError(`“${name}” saved. Keep up to 10 runs in this browser.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Run a valid circuit before saving a snapshot.') }
  }
  const compareSavedRun = (run: SavedRun) => { setComparisonBase({ readings: run.readings, label: `${run.name} · ${run.analysis}` }); setError(`Comparing current results with “${run.name}”.`) }
  const exportPartsCsv = () => {
    const rows = [['Reference','Component','Value','Rating'], ...circuit.parts.filter((part) => !['ground','junction'].includes(part.kind)).map((part) => {
      const value = part.kind === 'resistor' ? fmt(part.value,'Ω') : ['source','ac-source'].includes(part.kind) ? fmt(part.value,'V') : part.kind === 'capacitor' ? fmt(part.value,'F') : part.kind === 'inductor' ? fmt(part.value,'H') : part.kind === 'diode' ? fmt(part.value,'V') : part.on ? 'Closed' : 'Open'
      const rating = part.powerRating ? fmt(part.powerRating,'W') : part.voltageRating ? fmt(part.voltageRating,'V') : part.currentRating ? fmt(part.currentRating,'A') : ''
      return [part.label, partNames[part.kind], value, rating]
    })]
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"','""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})); const anchor=document.createElement('a'); anchor.href=url; anchor.download='ozoo-circuit-parts.csv'; anchor.click(); URL.revokeObjectURL(url)
  }
  const runFrequencySweep = () => {
    if (circuit.parts.some((part) => part.kind === 'diode')) { setError('Frequency sweeps use a linear AC model. Run Simulate or Time-domain analysis to inspect the diode waveform.'); return }
    const source = circuit.parts.find((part) => part.kind === 'ac-source')
    const target = selected && selected.kind !== 'ac-source' ? selected : circuit.parts.find((part) => !['source', 'ac-source', 'ground', 'junction'].includes(part.kind))
    if (!source || !target) { setError('Add an AC supply and select a component to run a frequency sweep.'); return }
    try {
      const center = source.frequency ?? 60
      const low = Math.max(0.1, center / 1000), high = Math.min(1e6, center * 1000)
      const samples = Array.from({ length: 49 }, (_, index) => {
        const frequency = low * (high / low) ** (index / 48)
        const result = solveAcCircuit(circuit.parts, circuit.wires, frequency)
        return { frequency, voltage: result.readings.find((reading) => reading.id === target.id)?.voltage ?? 0 }
      })
      setFrequencySweep({ label: target.label, samples }); setSimulation(solveCircuit(circuit.parts, circuit.wires)); setError('')
    } catch (reason) { setFrequencySweep(null); setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const runTransientSimulation = () => {
    try { const result=solveTransient(circuit.parts,circuit.wires,transientDurationMs/1000,transientSteps);setTransient(result);setSimulationActive(false);setError(result.message) }
    catch(reason){setTransient(null);setError(reason instanceof Error?reason.message:String(reason))}
  }
  const shareCircuitLink = async () => {
    try {
      const payload=await encodeCircuitShare(JSON.stringify({format:'ozoonotes-circuit',version:1,parts:circuit.parts,wires:circuit.wires,drawings:circuit.drawings??[]}))
      const url=new URL(window.location.href);url.searchParams.set('simulator','electronics');url.hash=new URLSearchParams({circuit:payload}).toString();const shareUrl=url.toString()
      if(shareUrl.length>60000){setError('This circuit is too large for a share link. Use File → Export Ozoo circuit file instead.');return}
      if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(shareUrl);setError('Circuit link copied. Anyone with the link can view and edit their own copy.')}
      else window.prompt('Copy this circuit link:',shareUrl)
    }catch(reason){setError(reason instanceof Error?reason.message:'Unable to create a share link.')}
  }
  const exportOzooCircuit = () => {
    const data=JSON.stringify({format:'ozoonotes-circuit',version:1,parts:circuit.parts,wires:circuit.wires,drawings:circuit.drawings??[]},null,2)
    const url=URL.createObjectURL(new Blob([data],{type:'application/vnd.ozoonotes.circuit+json'})),anchor=document.createElement('a');anchor.href=url;anchor.download='circuit.ozoo';anchor.click();URL.revokeObjectURL(url);setError('OzooNotes circuit file downloaded.')
  }
  const exportResultsCsv = () => {
    if (!simulation) return
    const rows = [['Component', simulation.ac ? 'Voltage (V RMS)' : 'Voltage (V)', simulation.ac ? 'Current (A RMS)' : 'Current (A)', 'Power (W)'], ...simulation.readings.map((reading) => [reading.label, String(reading.voltage), String(reading.current), String(reading.power)])]
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'ozoo-circuit-results.csv'; anchor.click(); URL.revokeObjectURL(url)
  }
  const updateSelected = (change: Partial<Part>) => {
    if (!selectedPart || options.disableEditing) return
    setCircuit((current) => ({ ...current, parts: current.parts.map((part) => part.id === selectedPart ? { ...part, ...change } : part) }))
    setSimulation(null)
  }
  const undoCircuit = () => {
    if (options.disableEditing) return
    if (historyTimer.current) { clearTimeout(historyTimer.current); historyTimer.current = null; undoStack.current.push(lastCircuit.current); lastCircuit.current = circuit }
    const previous = undoStack.current.pop()
    if (!previous) return
    redoStack.current.push(circuit); historyAction.current = true; lastCircuit.current = previous; setCircuit(previous); setSimulation(null); setHistoryVersion((version) => version + 1)
  }
  const redoCircuit = () => {
    if (options.disableEditing) return
    const next = redoStack.current.pop()
    if (!next) return
    undoStack.current.push(circuit); historyAction.current = true; lastCircuit.current = next; setCircuit(next); setSimulation(null); setHistoryVersion((version) => version + 1)
  }
  const deleteSelection = () => {
    if (options.disableEditing) return
    if (selectedIds.length) setCircuit((current) => ({ parts: current.parts.filter((part) => !selectedIds.includes(part.id)), wires: current.wires.filter((wire) => !selectedIds.some((id) => wire.from.startsWith(id + ':') || wire.to.startsWith(id + ':'))) }))
    else if (selectedWire) setCircuit((current) => ({ ...current, wires: current.wires.filter((wire) => wire.id !== selectedWire) }))
    else if (selectedDrawing) setCircuit((current) => ({ ...current, drawings: (current.drawings ?? []).filter((item) => item.id !== selectedDrawing) }))
    setSelectedPart(null); setSelectedParts([]); setSelectedWire(null); setSelectedDrawing(null); setSimulation(null)
  }
  const copySelection = () => {
    if (!selectedIds.length) return
    const parts = circuit.parts.filter((part) => selectedIds.includes(part.id))
    const wires = circuit.wires.filter((wire) => selectedIds.some((id) => wire.from.startsWith(id + ':')) && selectedIds.some((id) => wire.to.startsWith(id + ':')))
    setClipboard({ parts, wires })
  }
  const pasteParts = (parts: Part[], wires: Wire[]) => {
    if (!parts.length || options.disableEditing) return
    const remap = new Map(parts.map((part) => [part.id, makeId()]))
    const copies = parts.map((part) => ({ ...part, id: remap.get(part.id)!, x: Math.min(W - 64, part.x + 42), y: Math.min(H - 62, part.y + 42), label: part.label + ' copy' }))
    const mapPin = (id: string) => { const split = id.lastIndexOf(':'); return (remap.get(id.slice(0, split)) ?? id.slice(0, split)) + id.slice(split) }
    const copiedWires = wires.map((wire) => ({ ...wire, id: makeId(), from: mapPin(wire.from), to: mapPin(wire.to), points: wire.points?.map((point) => ({ x: point.x + 42, y: point.y + 42 })) }))
    setCircuit((current) => ({ parts: [...current.parts, ...copies], wires: [...current.wires, ...copiedWires] }))
    setSelectedPart(null); setSelectedParts(copies.map((part) => part.id)); setSelectedWire(null); setSimulation(null)
  }
  const duplicateSelection = () => pasteParts(circuit.parts.filter((part) => selectedIds.includes(part.id)), circuit.wires.filter((wire) => selectedIds.some((id) => wire.from.startsWith(id + ':')) && selectedIds.some((id) => wire.to.startsWith(id + ':'))))
  const centerCircuit = () => {
    if (!circuit.parts.length) { setZoom(1); setViewCenter({ x: W / 2, y: H / 2 }); return }
    const xs = circuit.parts.map((part) => part.x), ys = circuit.parts.map((part) => part.y)
    const minX = Math.min(...xs) - 110, maxX = Math.max(...xs) + 110, minY = Math.min(...ys) - 90, maxY = Math.max(...ys) + 100
    setViewCenter({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 }); setZoom(Math.min(1, W / (maxX - minX), H / (maxY - minY)))
  }
  const setZoomBy = (factor: number) => setZoom((value) => Math.max(0.35, Math.min(3, value * factor)))
  const resetZoom = () => { setZoom(1); setViewCenter({ x: W / 2, y: H / 2 }) }
  const rotateSelection = (degrees: number) => { if (selectedIds.length && !options.disableEditing) setCircuit((current) => ({ ...current, parts: current.parts.map((part) => selectedIds.includes(part.id) ? { ...part, rotation: ((part.rotation ?? 0) + degrees + 360) % 360 } : part) })) }
  const mirrorSelection = (axis: 'mirrorX' | 'mirrorY') => { if (selectedIds.length && !options.disableEditing) setCircuit((current) => ({ ...current, parts: current.parts.map((part) => selectedIds.includes(part.id) ? { ...part, [axis]: !part[axis] } : part) })) }
  const selectAll = () => { setSelectedParts(circuit.parts.map((part) => part.id)); setSelectedPart(null); setSelectedWire(null) }
  const findComponent = () => {
    const query = findQuery.trim().toLowerCase()
    if (!query) return
    const found = circuit.parts.find((part) => part.label.toLowerCase().includes(query) || partNames[part.kind].toLowerCase().includes(query))
    if (found) { setSelectedPart(found.id); setSelectedParts([]); setViewCenter({ x: found.x, y: found.y }); setZoom(1.5); setError('Found ' + found.label + '.') }
    else setError('No component matched “' + findQuery + '”.')
  }
  const saveDesign = (name = 'ozoo-circuit', extension = '.json', mime = 'application/json') => {
    const payload = JSON.stringify({ format: 'ozoo-circuit', version: 1, parts: circuit.parts, wires: circuit.wires, drawings: circuit.drawings ?? [] }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: mime })), link = document.createElement('a')
    link.href = url; link.download = name.replace(/[^\w.-]+/g, '-').replace(/\.(json|txt)$/i, '') + extension; link.click(); URL.revokeObjectURL(url)
  }
  const importDesign = async (event: ChangeEvent<HTMLInputElement>) => {
    if (options.disableEditing) { event.target.value = ''; return }
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = (file.name.toLowerCase().endsWith('.txt') ? parseCircuitText(text) : JSON.parse(text)) as Circuit & { format?: string; version?: number }
      if (!Array.isArray(data.parts) || !Array.isArray(data.wires) || data.parts.some((part) => !part.id || !part.kind || !Number.isFinite(part.x) || !Number.isFinite(part.y)) || data.wires.some((wire) => !wire.from || !wire.to)) throw new Error('This file is not a valid circuit design.')
      setCircuit({ parts: data.parts, wires: data.wires, drawings: Array.isArray(data.drawings) ? data.drawings : [] }); setSelectedPart(null); setSelectedParts([]); setSelectedWire(null); setSimulation(null); setError('Circuit design opened.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to open this circuit file.') }
    event.target.value = ''
  }
  const recoverAutoSave = () => {
    try {
      const saved = localStorage.getItem('ozoo:circuit-recovery')
      if (!saved) { setError('No earlier autosave is available.'); return }
      const data = JSON.parse(saved) as Circuit
      if (!Array.isArray(data.parts) || !Array.isArray(data.wires)) throw new Error('The recovery copy is invalid.')
      setCircuit({ ...data, drawings: Array.isArray(data.drawings) ? data.drawings : [] }); setSelectedPart(null); setSelectedParts([]); setSelectedWire(null); setSelectedDrawing(null); setSimulation(null); setError('Recovered the previous autosave.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to recover the previous autosave.') }
  }
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = !!target?.closest('input, textarea, select, [contenteditable="true"]')
      if (event.key === 'Escape') { setOpenMenu(null); setPlacement(null); setDrawMode(null); setWireStart(null); setWirePoints([]); setWireCursor(null); setDragPoint(null); return }
      if (typing) return
      const mod = event.ctrlKey || event.metaKey
      if (mod && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redoCircuit() : undoCircuit(); return }
      if (mod && event.key.toLowerCase() === 'y') { event.preventDefault(); redoCircuit(); return }
      if (mod && event.key.toLowerCase() === 'a') { event.preventDefault(); selectAll(); return }
      if (mod && event.key.toLowerCase() === 'c') { event.preventDefault(); copySelection(); return }
      if (mod && event.key.toLowerCase() === 'x') { event.preventDefault(); copySelection(); deleteSelection(); return }
      if (mod && event.key.toLowerCase() === 'v') { event.preventDefault(); pasteParts(clipboard.parts, clipboard.wires); return }
      if (mod && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelection(); return }
      if (event.key === '/') { event.preventDefault(); setOpenMenu('edit'); return }
      if (event.key === '0') { resetZoom(); return }
      if (event.key === '+' || event.key === '=') { setZoomBy(1.2); return }
      if (event.key === '-') { setZoomBy(1 / 1.2); return }
      if (event.key === 'Home') { centerCircuit(); return }
      if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); deleteSelection() }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [circuit, selectedPart, selectedParts, selectedWire, selectedDrawing, clipboard])
  const newCircuit = () => { setCircuit({ parts: [], wires: [], drawings: [] }); setSimulation(null); setError(''); setSelectedPart(null); setSelectedParts([]); setSelectedWire(null); setSelectedDrawing(null); setWireStart(null); setMeterPins({ red: null, black: null }); setMeterProbe(null); setMeterReading('Choose a mode, then connect the probes.') }
  const loadCircuitPreset = (preset: CircuitPreset) => {
    if (options.disableEditing) return
    const nextCircuit = buildPresetCircuit(preset)
    setCircuit(nextCircuit)
    try { const result = solveCircuit(nextCircuit.parts, nextCircuit.wires); setSimulation(result); setTransient(result.timeDomain ?? null) } catch { setSimulation(null); setTransient(null) }
    setSelectedPart(null); setSelectedParts([]); setSelectedWire(null); setSelectedDrawing(null); setWireStart(null); setWirePoints([]); setWireCursor(null); setError(`${preset.name} loaded · ${preset.description}`); setOpenMenu(null); setCircuitSearch('')
  }
  const downloadSvg = () => {
    const svg = svgRef.current
    if (!svg) return
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'ozoo-circuit.svg'; link.click(); URL.revokeObjectURL(url)
  }
  const exportCircuitText = () => saveDesign('ozoo-circuit', '.txt', 'text/plain')
  const getCircuitPng = async () => {
    const svg = svgRef.current
    if (!svg) throw new Error('The circuit canvas is not ready yet.')
    const clone = svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); clone.setAttribute('width', String(W)); clone.setAttribute('height', String(H)); clone.style.backgroundColor = options.whiteBackground ? '#fff' : '#f8faf9'
    const sourceElements = [svg, ...Array.from(svg.querySelectorAll('*'))], cloneElements = [clone, ...Array.from(clone.querySelectorAll('*'))]
    const cssProps = ['stroke', 'fill', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'opacity', 'font-family', 'font-size', 'font-weight', 'text-anchor', 'dominant-baseline', 'color']
    sourceElements.forEach((source, index) => { const target = cloneElements[index] as SVGElement | undefined; if (!target) return; const style = getComputedStyle(source); cssProps.forEach((prop) => target.style.setProperty(prop, style.getPropertyValue(prop))); target.style.setProperty('animation', 'none') })
    clone.querySelectorAll('.wire-hit,.pin-hit,.wire-handle,.drawing-selection-frame,.wire-snap-indicator').forEach((node) => node.remove())
    const svgBlob = new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(svgBlob)
    try {
      const image = new Image()
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Unable to render the circuit image.')); image.src = url })
      const canvas = document.createElement('canvas'); canvas.width = W * 2; canvas.height = H * 2
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Image export is not supported by this browser.')
      context.fillStyle = options.whiteBackground ? '#fff' : '#f8faf9'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height)
      return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Unable to create the PNG image.')), 'image/png'))
    } finally { URL.revokeObjectURL(url) }
  }
  const saveAsImage = async () => {
    try { const blob = await getCircuitPng(); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'ozoo-circuit.png'; link.click(); URL.revokeObjectURL(url); setError('Circuit image downloaded.') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save the circuit image.') }
  }
  const copyCircuitImage = async () => {
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Image clipboard is not supported here. Use Save As Image instead.')
      const blob = await getCircuitPng(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); setError('Circuit image copied to clipboard.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to copy the circuit image.') }
  }
  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() }
    catch { setError('Fullscreen mode is not available in this browser.') }
  }
  useEffect(() => {
    const fileShortcuts = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (!(event.ctrlKey || event.metaKey) || target?.closest('input,textarea,select,[contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if (key === 'o') { event.preventDefault(); if (!options.disableEditing) designFileInput.current?.click() }
      else if (key === 's') { event.preventDefault(); const name = window.prompt('Save circuit as:', 'ozoo-circuit'); if (name !== null) saveDesign(name) }
      else if (key === 'p') { event.preventDefault(); window.print() }
    }
    window.addEventListener('keydown', fileShortcuts)
    return () => window.removeEventListener('keydown', fileShortcuts)
  }, [options.disableEditing, circuit])
  return <main className="circuit-workspace" data-theme={colorTheme} data-white-background={options.whiteBackground}>
    <header className="circuit-topbar">
      <button className="circuit-back" onClick={onBack}>← <span>Simulator</span></button>
      <div className="circuit-brand"><span className="circuit-brand-icon">Ω</span><div><strong>Circuit Studio</strong><small>Electronics simulator</small></div></div>
      <div className="circuit-top-actions"><SimulatorThemePicker theme={colorTheme} onChange={setColorTheme} /><button aria-label="Delete selected" title="Delete selected component, wire, or drawing" disabled={options.disableEditing || (!selectedIds.length && !selectedWire && !selectedDrawing)} onClick={deleteSelection}>Delete</button><button className="circuit-run" onClick={runSimulation}>▶ Simulate</button></div>
    </header>
    <section className="circuit-heading"><div><p>SIMULATOR / ELECTRONICS</p><h1>Build a circuit. See it work.</h1><span>Drag parts into place, connect terminals, and watch current and voltage.</span></div><span className="circuit-local"><i /> Saved on this device</span></section>
    <section className="circuit-layout">
      <nav className="circuit-menubar" aria-label="Circuit menus" data-history-version={historyVersion}>
<div className="circuit-menu-wrap"><button className={openMenu === 'file' ? 'open' : ''} aria-expanded={openMenu === 'file'} onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}>File <span>⌄</span></button>{openMenu === 'file' && <div className="circuit-menu-popover circuit-file-popover" role="menu"><button role="menuitem" disabled={options.disableEditing} onClick={() => { newCircuit(); setOpenMenu(null) }}>＋ New Blank Circuit</button><button role="menuitem" disabled={options.disableEditing} onClick={() => designFileInput.current?.click()}>▱ Open File… <kbd>Ctrl+O</kbd></button><button role="menuitem" disabled={options.disableEditing} title="Choose an Ozoo JSON or text file with lines such as V1 source 9V and R1 resistor 1kΩ." onClick={() => designFileInput.current?.click()}>▧ Import From Text…</button><button role="menuitem" disabled title="Dropbox import is not connected yet.">◈ Import From Dropbox…</button><hr /><button role="menuitem" onClick={() => { const name = window.prompt('Save circuit as:', 'ozoo-circuit'); if (name !== null) saveDesign(name); setOpenMenu(null) }}>▣ Save As… <kbd>Ctrl+S</kbd></button><button role="menuitem" onClick={() => { void shareCircuitLink(); setOpenMenu(null) }}>↗ Copy share link…</button><button role="menuitem" onClick={() => { exportOzooCircuit(); setOpenMenu(null) }}>⬇ Export Ozoo circuit file…</button><button role="menuitem" onClick={() => { exportCircuitText(); setOpenMenu(null) }}>▤ Export As Text…</button><button role="menuitem" onClick={() => { void saveAsImage(); setOpenMenu(null) }}>▧ Save As Image…</button><button role="menuitem" onClick={() => { void copyCircuitImage(); setOpenMenu(null) }}>▧ Copy Circuit Image to Clipboard</button><button role="menuitem" onClick={() => { downloadSvg(); setOpenMenu(null) }}>▧ Save As SVG…</button><button role="menuitem" disabled title="Subcircuits are not supported by the current circuit solver.">▥ Create Subcircuit…</button><hr /><button role="menuitem" disabled={circuit.parts.some((part) => part.kind === 'ac-source')} title={circuit.parts.some((part) => part.kind === 'ac-source') ? 'Remove the AC source to run DC analysis.' : 'Solve and show the DC operating point.'} onClick={() => { runSimulation(); setOpenMenu(null) }}>⌁ Find DC Operating Point</button><button role="menuitem" disabled={!hasRecovery || options.disableEditing} title={hasRecovery ? 'Restore the circuit saved before the latest changes.' : 'No earlier autosave is available.'} onClick={() => { recoverAutoSave(); setOpenMenu(null) }}>↶ Recover Auto-Save</button><button role="menuitem" onClick={() => { window.print(); setOpenMenu(null) }}>▤ Print… <kbd>Ctrl+P</kbd></button><button role="menuitem" onClick={() => { void toggleFullscreen(); setOpenMenu(null) }}>⛶ Toggle Full Screen</button><hr /><button role="menuitem" onClick={() => { setShowAbout(true); setOpenMenu(null) }}>ⓘ About…</button></div>}</div>
        <div className="circuit-menu-wrap"><button className={openMenu === 'edit' ? 'open' : ''} aria-expanded={openMenu === 'edit'} onClick={() => setOpenMenu(openMenu === 'edit' ? null : 'edit')}>Edit <span>⌄</span></button>{openMenu === 'edit' && <div className="circuit-menu-popover circuit-edit-popover" role="menu"><button role="menuitem" disabled={!undoStack.current.length} onClick={() => { undoCircuit(); setOpenMenu(null) }}>↶ Undo <kbd>Ctrl+Z</kbd></button><button role="menuitem" disabled={!redoStack.current.length} onClick={() => { redoCircuit(); setOpenMenu(null) }}>↷ Redo <kbd>Ctrl+Y</kbd></button><hr /><button role="menuitem" disabled={!selectedIds.length} onClick={() => { copySelection(); deleteSelection(); setOpenMenu(null) }}>✂ Cut <kbd>Ctrl+X</kbd></button><button role="menuitem" disabled={!selectedIds.length} onClick={() => { copySelection(); setOpenMenu(null) }}>▢ Copy <kbd>Ctrl+C</kbd></button><button role="menuitem" disabled={!clipboard.parts.length} onClick={() => { pasteParts(clipboard.parts, clipboard.wires); setOpenMenu(null) }}>▣ Paste <kbd>Ctrl+V</kbd></button><button role="menuitem" disabled={!selectedIds.length} onClick={() => { duplicateSelection(); setOpenMenu(null) }}>▧ Duplicate <kbd>Ctrl+D</kbd></button><button role="menuitem" onClick={() => { selectAll(); setOpenMenu(null) }}>✣ Select all <kbd>Ctrl+A</kbd></button><hr /><label className="circuit-menu-search"><span>Find component <kbd>/</kbd></span><div><input value={findQuery} onChange={(event) => setFindQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { findComponent(); setOpenMenu(null) } }} placeholder="Name or type…" /><button onClick={() => { findComponent(); setOpenMenu(null) }}>Find</button></div></label><button role="menuitem" onClick={() => { centerCircuit(); setOpenMenu(null) }}>⌖ Center circuit <kbd>Home</kbd></button><button role="menuitem" onClick={() => { resetZoom(); setOpenMenu(null) }}>◎ Zoom 100% <kbd>0</kbd></button><button role="menuitem" onClick={() => { setZoomBy(1.2); setOpenMenu(null) }}>⊕ Zoom in <kbd>+</kbd></button><button role="menuitem" onClick={() => { setZoomBy(1 / 1.2); setOpenMenu(null) }}>⊖ Zoom out <kbd>−</kbd></button><hr /><button role="menuitem" disabled={!selectedIds.length} onClick={() => { mirrorSelection('mirrorX'); setOpenMenu(null) }}>↔ Mirror X</button><button role="menuitem" disabled={!selectedIds.length} onClick={() => { mirrorSelection('mirrorY'); setOpenMenu(null) }}>↕ Mirror Y</button><button role="menuitem" disabled={!selectedIds.length} onClick={() => { rotateSelection(-90); setOpenMenu(null) }}>↶ Rotate CCW</button><button role="menuitem" disabled={!selectedIds.length} onClick={() => { rotateSelection(90); setOpenMenu(null) }}>↻ Rotate CW</button></div>}</div>
        <div className="circuit-menu-wrap"><button className={openMenu === 'tools' ? 'open' : ''} aria-expanded={openMenu === 'tools'} onClick={() => setOpenMenu(openMenu === 'tools' ? null : 'tools')}>Tools <span>⌄</span></button>{openMenu === 'tools' && <div className="circuit-menu-popover" role="menu"><button role="menuitem" aria-pressed={dmmActive} onClick={() => { setDmmActive((active) => !active); setPlacement(null); setDrawMode(null); setWireStart(null); setOpenMenu(null) }}>▦ {dmmActive ? 'Close multimeter' : 'Digital multimeter'}</button><button role="menuitem" disabled={options.disableEditing} onClick={() => { setPlacement(null); setDrawMode(null); setError('Drag from a pin to another pin, or click two pins to wire.'); setOpenMenu(null) }}>⌁ Wire tool</button><button role="menuitemcheckbox" aria-checked={gridVisible} onClick={() => setGridVisible((visible) => !visible)}>▧ {gridVisible ? 'Hide grid' : 'Show grid'}</button><button role="menuitem" onClick={setComparisonBaseline}>⇄ Set comparison baseline</button><hr /><strong className="circuit-menu-label">GUIDED LESSONS</strong>{guidedLessons.map((item) => <button role="menuitem" key={item.title} onClick={() => beginLesson(item)}>▸ {item.title}</button>)}</div>}</div>
<div className="circuit-menu-wrap"><button className={openMenu === 'place' ? 'open' : ''} aria-expanded={openMenu === 'place'} onClick={() => setOpenMenu(openMenu === 'place' ? null : 'place')}>Place & Draw <span>⌄</span></button>{openMenu === 'place' && <div className="circuit-menu-popover circuit-place-draw-popover" role="menu"><div className="circuit-menu-label">COMPONENTS</div><div className="circuit-place-draw-grid">{(['source', 'ac-source', 'resistor', 'capacitor', 'inductor', 'diode', 'switch', 'ground'] as Kind[]).map((kind) => <button role="menuitem" key={kind} disabled={options.disableEditing} onClick={() => { setPlacement(kind); setDrawMode(null); setWireStart(null); setError('Click the board to place ' + partNames[kind].toLowerCase() + '.'); setOpenMenu(null) }}><span className={'palette-symbol symbol-' + kind}>{partGlyph[kind]}</span>{partNames[kind]}</button>)}</div><hr /><div className="circuit-menu-label">ANNOTATIONS & PICTURES</div><div className="circuit-place-draw-annotations"><button role="menuitem" disabled={options.disableEditing} onClick={() => beginDrawing('image')}>▧ Insert image…</button><button role="menuitem" disabled={options.disableEditing} onClick={() => beginDrawing('text')}>T Add text label…</button><button role="menuitem" disabled={options.disableEditing} onClick={() => beginDrawing('arrow')}>↗ Add arrow</button><button role="menuitem" disabled={options.disableEditing} onClick={() => beginDrawing('rectangle')}>▱ Add rectangle</button><button role="menuitem" disabled={options.disableEditing} onClick={() => beginDrawing('ellipse')}>◯ Add ellipse</button></div></div>}</div>
        <div className="circuit-menu-wrap"><button className={openMenu === 'circuits' ? 'open' : ''} aria-expanded={openMenu === 'circuits'} onClick={() => setOpenMenu(openMenu === 'circuits' ? null : 'circuits')}>Circuits <span>⌄</span></button>{openMenu === 'circuits' && <div className="circuit-menu-popover circuit-presets-popover" role="menu"><label className="circuit-preset-search"><span>PREMADE CIRCUITS</span><input value={circuitSearch} onChange={(event) => setCircuitSearch(event.target.value)} placeholder="Search circuits…" /></label><div className="circuit-preset-groups">{Array.from(new Set(circuitPresets.map((preset) => preset.category))).map((category, index) => { const presets = circuitPresets.filter((preset) => preset.category === category && (!circuitSearch || `${preset.name} ${preset.description} ${preset.category}`.toLowerCase().includes(circuitSearch.toLowerCase()))); return presets.length ? <details key={category} open={!!circuitSearch || index === 0}><summary>{category}<span>{presets.length}</span></summary><div>{presets.map((preset) => <button key={preset.name} role="menuitem" disabled={options.disableEditing} onClick={() => loadCircuitPreset(preset)}><strong>{preset.name}</strong><small>{preset.description}</small></button>)}</div></details> : null })}{!circuitPresets.some((preset) => `${preset.name} ${preset.description} ${preset.category}`.toLowerCase().includes(circuitSearch.toLowerCase())) && <p className="circuit-preset-empty">No matching circuits. Try a different search.</p>}</div><hr /><button role="menuitem" disabled={options.disableEditing} onClick={() => { newCircuit(); setOpenMenu(null) }}>＋ Blank circuit</button></div>}</div>
        <div className="circuit-menu-wrap"><button className={openMenu === 'options' ? 'open' : ''} aria-expanded={openMenu === 'options'} onClick={() => setOpenMenu(openMenu === 'options' ? null : 'options')}>Options <span>⌄</span></button>{openMenu === 'options' && <div className="circuit-menu-popover circuit-options-popover" role="menu">
          <div className="circuit-menu-label">DISPLAY</div>
          {([['showCurrent','Show Current'],['showVoltage','Show Voltage'],['showPower','Show Power'],['showValues','Show Values'],['smallGrid','Small Grid'],['toolbar','Toolbar'],['cursorCrosshair','Show Cursor Crosshair'],['europeanResistors','European Resistors'],['showOhmUnit','Show Ω Unit'],['whiteBackground','White Background'],['conventionalCurrent','Conventional Current Motion'],['disableEditing','Disable Editing'],['editValuesWithMouseWheel','Edit Values With Mouse Wheel']] as [keyof CircuitOptions,string][]).map(([key,label]) => <button key={key} role="menuitemcheckbox" aria-checked={options[key]} onClick={() => toggleOption(key)}><span className="option-check">{options[key] ? '✓' : ''}</span>{label}</button>)}
          <button role="menuitem" disabled title="Digital logic-gate parts are not available in this simulator yet.">IEC Gates <small>coming later</small></button><hr />
          <button role="menuitem" onClick={() => { setShowShortcuts(true); setOpenMenu(null) }}>⌨ Shortcuts…</button><button role="menuitem" onClick={() => { setShowOtherOptions(true); setOpenMenu(null) }}>Other Options…</button>
        </div>}</div>
        <input ref={designFileInput} type="file" accept=".ozoo,.json,.txt,application/json,text/plain" hidden onChange={importDesign} /><input ref={pictureFileInput} type="file" accept="image/*" hidden onChange={importPicture} />
      </nav>
      {options.toolbar && <section className="circuit-tools" aria-label="Circuit tools">
        <div className="circuit-tools-group"><div className="circuit-section-title">TOOLS</div><button className={dmmActive ? 'active' : ''} onClick={() => { setDmmActive((active) => !active); setPlacement(null); setDrawMode(null); setWireStart(null); setMeterPins({ red: null, black: null }); setMeterProbe(null); setMeterReading('Choose a mode, then connect the probes.') }}><span className="palette-symbol symbol-meter">DMM</span><span>Multimeter</span></button><button className={scopeActive ? 'active' : ''} onClick={() => {setScopeActive((active)=>!active);setScopeProbe(null);setDmmActive(false);setPlacement(null);setDrawMode(null);setWireStart(null);setError('Choose channel A or B, then click a circuit terminal to probe its voltage.') }}><span className="palette-symbol">◉</span><span>Oscilloscope</span></button><button className={wireStart ? 'active' : ''} onClick={() => { setPlacement(null); setDrawMode(null); setError('Drag from a pin to another pin, or click two pins to wire.') }}><span className="palette-symbol">⌁</span><span>Wire</span></button><button className={gridVisible ? 'active' : ''} onClick={() => setGridVisible((visible) => !visible)} title="Toggle schematic grid"><span className="palette-symbol">▦</span><span>Grid</span></button><button onClick={runCircuitChecks}><span className="palette-symbol">✓</span><span>Check</span></button><button onClick={runFrequencySweep} disabled={!circuit.parts.some((part) => part.kind === 'ac-source')} title="Measure selected component voltage across a logarithmic frequency range"><span className="palette-symbol">∿</span><span>AC sweep</span></button><button onClick={runTransientSimulation} title="Calculate the circuit response as time passes"><span className="palette-symbol">⏱</span><span>Transient</span></button><button onClick={newCircuit} disabled={options.disableEditing}><span className="palette-symbol">＋</span><span>New</span></button></div>
      </section>}
      <section className="circuit-main">
        <div className="circuit-canvas-head"><span><i /> Schematic</span><span className="circuit-canvas-controls"><span>{wireSnapPreview ? 'Release to connect component to wire' : drawMode ? `Click the board to place ${drawMode} · Esc to cancel` : placement ? 'Click to place · Esc to cancel' : wireStart ? 'Drag to a pin or click the destination terminal' : 'Drag parts to arrange · drag a pin to wire'}</span><div className="circuit-zoom-controls"><button title="Zoom out" aria-label="Zoom out" onClick={() => setZoomBy(1 / 1.2)}>−</button><output>{Math.round(zoom * 100)}%</output><button title="Zoom in" aria-label="Zoom in" onClick={() => setZoomBy(1.2)}>+</button><button title="Center circuit" onClick={centerCircuit}>Center</button></div></span></div>
        <svg ref={svgRef} viewBox={viewBox} className={'circuit-canvas ' + (placement || drawMode ? 'placing' : '') + (options.cursorCrosshair ? ' crosshair' : '')} onWheel={(event: ReactWheelEvent<SVGSVGElement>) => {
          if (!options.editValuesWithMouseWheel || options.disableEditing || !selectedPart) return
          const target = event.target instanceof Element ? event.target.closest<SVGGElement>('.circuit-part') : null
          if (target?.dataset.partId !== selectedPart) return
          const part = circuit.parts.find((item) => item.id === selectedPart)
          if (!part || !['source', 'ac-source', 'resistor', 'capacitor', 'inductor', 'diode'].includes(part.kind)) return
          event.preventDefault()
          const amount = Math.max(Math.abs(part.value) * 0.05, part.kind === 'capacitor' ? 1e-7 : 0.01)
          const next = Math.max(0.000001, part.value + (event.deltaY < 0 ? amount : -amount))
          setCircuit((current) => ({ ...current, parts: current.parts.map((item) => item.id === part.id ? { ...item, value: next } : item) }))
        }} onPointerDown={handleCanvasPointerDown} onPointerMove={(event) => {
          const point = screenPoint(event)
          if (wireDrag.current) { const state = wireDrag.current, origin = pinLookup[state.from], wirePoint = event.shiftKey && origin ? constrainWirePoint(origin, point) : point; if (Math.hypot(point.x - state.x, point.y - state.y) > 6) state.moved = true; setWireCursor(wirePoint) }
          else if (wireStart) { const origin = wirePoints.at(-1) ?? pinLookup[wireStart]; setWireCursor(event.shiftKey && origin ? constrainWirePoint(origin, point) : point) }
          if (drawingDrag) { setCircuit((current) => ({ ...current, drawings: (current.drawings ?? []).map((item) => item.id === drawingDrag.id ? { ...item, x: point.x - drawingDrag.dx, y: point.y - drawingDrag.dy } : item) })); return }
          if (dragPoint) { setWireSnapPreview(null); setCircuit((current) => ({ ...current, wires: current.wires.map((wire) => wire.id === dragPoint.wireId ? { ...wire, points: (wire.points ?? []).map((item, index) => index === dragPoint.index ? point : item) } : wire) })); return }
          if (!drag) return
          if (partDragOrigin.current && Math.hypot(point.x - partDragOrigin.current.x, point.y - partDragOrigin.current.y) > 4) partDragMoved.current = true
          const movingPart = circuit.parts.find((part) => part.id === drag.id)
          if (!movingPart) return
          const rawX = Math.max(55, Math.min(W - 55, point.x - drag.dx)), rawY = Math.max(70, Math.min(H - 45, point.y - drag.dy))
          const snap = findWireSnap(movingPart, rawX, rawY)
          setWireSnapPreview(snap)
          setCircuit((current) => ({ ...current, parts: current.parts.map((part) => part.id === drag.id ? { ...part, x: snap?.x ?? rawX, y: snap?.y ?? rawY } : part) }))
        }} onPointerUp={(event) => {
          if (wireDrag.current) {
            const state = wireDrag.current
            const endpoint = document.elementFromPoint(event.clientX, event.clientY)?.closest<SVGGElement>('.circuit-pin')?.dataset.pinId
            if (state.moved && endpoint && endpoint !== state.from) {
              setCircuit((value) => ({ ...value, wires: [...value.wires, { id: makeId(), from: state.from, to: endpoint }] }))
              setWireStart(null); setWireCursor(null); setWirePoints([]); setSimulation(null); setError('Wire connected.')
            } else if (state.moved) { const raw = screenPoint(event), origin = pinLookup[state.from], point = event.shiftKey && origin ? constrainWirePoint(origin, raw) : raw; setWirePoints((value) => [...value, point]); setWireCursor(point) }
            suppressPinClick.current = true; window.setTimeout(() => { suppressPinClick.current = false }, 0); wireDrag.current = null
          }
          if (drag && wireSnapPreview) attachPartToWire(wireSnapPreview)
          if (drawingDrag) setDrawingDrag(null)
          if (drag || dragPoint) { setDrag(null); setDragPoint(null); if (!wireSnapPreview && (dragPoint || partDragMoved.current)) setSimulation(null) }
          partDragOrigin.current = null; partDragMoved.current = false
          if (!drag) setWireSnapPreview(null)
          try { svgRef.current?.releasePointerCapture(event.pointerId) } catch {}
        }}>
          <defs><pattern id="circuit-grid" width={options.smallGrid ? 12 : 24} height={options.smallGrid ? 12 : 24} patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" /></pattern><marker id="circuit-arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8Z" fill="currentColor" /></marker></defs>
          {gridVisible && <rect width={W} height={H} fill="url(#circuit-grid)" />}
          {(circuit.drawings ?? []).map((item) => <g key={item.id} className={'circuit-drawing ' + (selectedDrawing === item.id ? 'selected' : '')} onPointerDown={(event) => { if (event.button !== 0) return; event.stopPropagation(); const point = screenPoint(event); setSelectedDrawing(item.id); setSelectedPart(null); setSelectedParts([]); setSelectedWire(null); if (!options.disableEditing) { setDrawingDrag({ id: item.id, dx: point.x - item.x, dy: point.y - item.y }); svgRef.current?.setPointerCapture(event.pointerId) } }} onClick={(event) => { event.stopPropagation(); setSelectedDrawing(item.id); setSelectedPart(null); setSelectedParts([]); setSelectedWire(null) }}>
            {selectedDrawing === item.id && item.kind === 'image' && <rect className="drawing-selection-frame" x={item.x - 110} y={item.y - 73} width="220" height="146" rx="4" />}
            {selectedDrawing === item.id && item.kind === 'text' && <rect className="drawing-selection-frame" x={item.x - 94} y={item.y - 24} width="188" height="34" rx="4" />}
            {item.kind === 'image' && item.content && <image href={item.content} x={item.x - 105} y={item.y - 68} width="210" height="136" preserveAspectRatio="xMidYMid meet" />}
            {item.kind === 'text' && <text className="circuit-drawing-text" x={item.x} y={item.y} textAnchor="middle">{item.content}</text>}
            {item.kind === 'arrow' && <line x1={item.x - 58} y1={item.y + 34} x2={item.x + 58} y2={item.y - 34} markerEnd="url(#circuit-arrowhead)" />}
            {item.kind === 'rectangle' && <rect x={item.x - 64} y={item.y - 38} width="128" height="76" rx="5" />}
            {item.kind === 'ellipse' && <ellipse cx={item.x} cy={item.y} rx="62" ry="36" />}
          </g>)}
          {circuit.wires.map((wire) => {
            const a = pinLookup[wire.from], b = pinLookup[wire.to]
            if (!a || !b) return null
            const middle = wire.points?.[Math.floor((wire.points.length - 1) / 2)] ?? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
            const path = wirePath(a, b, wire.points)
            return <g key={wire.id} className={'circuit-wire ' + (selectedWire === wire.id ? 'selected' : '')} onClick={(event) => { event.stopPropagation(); setSelectedWire(wire.id); setSelectedPart(null); setSelectedParts([]); setSelectedDrawing(null) }}>
              <path d={path} className={simulation && options.showCurrent && simulation.readings.some((reading) => Math.abs(reading.current) > 1e-8) ? 'current-live' + (options.conventionalCurrent ? '' : ' reverse') : ''} />
              <path className="wire-hit" d={path} />
              {selectedWire === wire.id && (wire.points ?? []).map((point, index) => <circle key={index} className="wire-handle" cx={point.x} cy={point.y} r="6" onPointerDown={(event) => { if (options.disableEditing) return; event.stopPropagation(); setSelectedWire(wire.id); setSelectedPart(null); setDragPoint({ wireId: wire.id, index }); svgRef.current?.setPointerCapture(event.pointerId) }} />)}
              {simulation && options.showVoltage && <text x={middle.x} y={middle.y - 6} className="wire-voltage">{fmt(simulation.nodeVoltages[wire.from] ?? 0, 'V')}</text>}
            </g>
          })}
          {wireStart && wireCursor && pinLookup[wireStart] && <><path className="wire-preview" d={wirePath(pinLookup[wireStart], wireCursor, wirePoints)} />{wirePoints.map((point, index) => <circle key={'route-' + index} className="wire-preview-handle" cx={point.x} cy={point.y} r="4" />)}</>}
          {wireSnapPreview && pinLookup[wireSnapPreview.pinId] && <g className="wire-snap-indicator" pointerEvents="none"><circle cx={wireSnapPreview.point.x} cy={wireSnapPreview.point.y} r="9" /><path d={`M ${wireSnapPreview.point.x - 13} ${wireSnapPreview.point.y} H ${wireSnapPreview.point.x + 13} M ${wireSnapPreview.point.x} ${wireSnapPreview.point.y - 13} V ${wireSnapPreview.point.y + 13}`} /></g>}
          {circuit.parts.map((part) => <PartSymbol key={part.id} part={part} selected={selectedPart === part.id || selectedParts.includes(part.id)} onPointerDown={handlePartPointerDown} onPin={handlePin} onPinPointerDown={handlePinPointerDown} voltageMap={options.showVoltage ? simulation?.nodeVoltages : undefined} showValues={options.showValues} showOhmUnit={options.showOhmUnit} europeanResistors={options.europeanResistors} />)}
        </svg>
        <div className="circuit-status" role="status">{error ? <span className="error">⚠ {error}</span> : simulation ? <span className="success">✓ {simulation.message}</span> : <span>Ready · Drag parts to move them · drag terminals to connect wires · Simulate to show voltages and current</span>}</div>
        {lesson && <section className="circuit-lesson"><header><div><small>GUIDED LESSON · {lesson.lesson.title}</small><button onClick={() => setLesson(null)} aria-label="Close lesson">×</button></div><p>{lesson.lesson.intro}</p></header><div className="lesson-step"><b>Step {lesson.step + 1} of {lesson.lesson.steps.length}</b><span>{lesson.lesson.steps[lesson.step]}</span></div><footer><button disabled={lesson.step === 0} onClick={() => setLesson((current) => current ? { ...current, step: Math.max(0,current.step-1) } : current)}>Previous</button><button className="lesson-next" onClick={() => setLesson((current) => current ? current.step + 1 >= current.lesson.steps.length ? null : { ...current, step: current.step+1 } : current)}>{lesson.step + 1 === lesson.lesson.steps.length ? 'Finish lesson' : 'Next step'}</button></footer></section>}
        {circuitChecks && <section className="circuit-check-panel" aria-label="Circuit health check"><header><div><strong>Circuit health check</strong><small>{circuitChecks.filter((item) => item.level === 'error').length} errors · {circuitChecks.filter((item) => item.level === 'warning').length} warnings</small></div><button onClick={() => setCircuitChecks(null)} aria-label="Close circuit checks">×</button></header><ul>{circuitChecks.map((check, index) => <li className={'check-' + check.level} key={index}><span>{check.level === 'error' ? '!' : check.level === 'warning' ? '△' : '✓'}</span><div><strong>{check.title}</strong><small>{check.detail}</small></div></li>)}</ul></section>}
        {transient && <section className="transient-panel" aria-label="Transient circuit response"><header><div><strong>Time-domain response</strong><small>{transient.message}</small></div><button onClick={()=>setTransient(null)} aria-label="Close transient graph">×</button></header><div className="transient-settings"><label>Duration (ms)<input type="number" min="0.001" max="10000" step="any" value={transientDurationMs} onChange={(event)=>setTransientDurationMs(Number(event.target.value))}/></label><label>Time steps<input type="number" min="40" max="1600" step="20" value={transientSteps} onChange={(event)=>setTransientSteps(Number(event.target.value))}/></label><button onClick={runTransientSimulation}>Run again</button></div><svg viewBox="0 0 1000 220" role="img" aria-label="Transient voltage and current versus time"><path className="scope-grid" d="M52 15H968M52 60H968M52 105H968M52 150H968M52 195H968M52 15V195M235 15V195M418 15V195M602 15V195M785 15V195M968 15V195"/>{selected && transient.partVoltages[selected.id] && <><path className="scope-voltage" d={transientTracePath(transient.partVoltages[selected.id],18,105)}/><path className="scope-current" d={transientTracePath(transient.partCurrents[selected.id]??[],110,195)}/><text x="8" y="25">V</text><text x="8" y="118">A</text></>}{!selected && <>{scopePins.a && transient.nodeVoltages[scopePins.a] && <path className="scope-voltage" d={transientTracePath(transient.nodeVoltages[scopePins.a],18,195)}/>}{scopePins.b && transient.nodeVoltages[scopePins.b] && <path className="scope-current" d={transientTracePath(transient.nodeVoltages[scopePins.b],18,195)}/>}</>}<text x="52" y="215">0 ms</text><text x="900" y="215">{fmt(transient.times.at(-1)??0,'s')}</text></svg><footer>{selected ? `${selected.label}: voltage (yellow) and current (green).` : 'Oscilloscope channels A (yellow) and B (green), measured against ground.'} This educational transient solver uses a backward Euler approximation.</footer></section>}
        {selected?.kind === 'diode' && diodeWaveform && <section className="diode-waveform-panel" aria-label={`${selected.label} voltage, current, and power waveforms`}>
          <header><div><strong>{selected.label} · diode waveforms</strong><small>Time-domain readings for the selected diode</small></div><span>{diodeWaveform.times.length} samples</span></header>
          <svg viewBox="0 0 1000 270" role="img" aria-label="Diode voltage, current, and power versus time">
            <path className="scope-grid" d="M60 18H960M60 88H960M60 100H960M60 170H960M60 182H960M60 252H960M60 18V252M285 18V252M510 18V252M735 18V252M960 18V252"/>
            {[{ name: 'Voltage', unit: 'V', values: diodeVoltage, top: 22, bottom: 82, className: 'scope-voltage' }, { name: 'Current', unit: 'A', values: diodeCurrent, top: 104, bottom: 164, className: 'scope-current' }, { name: 'Power', unit: 'W', values: diodePower, top: 186, bottom: 246, className: 'scope-power' }].map((plot) => {
              const range = transientRange(plot.values)
              return <g key={plot.name}><path className={plot.className} d={transientPlotPath(plot.values, plot.top, plot.bottom)}/><text x="5" y={plot.top + 10}>{plot.name} ({plot.unit})</text><text x="5" y={plot.bottom}>{fmt(range.min, plot.unit)}</text><text x="910" y={plot.top + 10}>{fmt(range.max, plot.unit)}</text></g>
            })}
            <text x="60" y="267">0 s</text><text x="900" y="267">{fmt(diodeWaveform.times.at(-1) ?? 0, 's')}</text>
          </svg>
          <footer>Each trace is scaled to its own min/max range. Run <b>Time-domain analysis</b> to view switching behavior; steady-state DC alone has no time waveform.</footer>
        </section>}
        {frequencySweep && <section className="frequency-sweep-panel" aria-label="AC frequency response"><header><div><strong>AC frequency response</strong><small>{frequencySweep.label} · {frequencySweep.samples.length} points · peak {fmt(Math.max(...frequencySweep.samples.map((point)=>point.voltage)),'V RMS')}</small></div><button onClick={() => setFrequencySweep(null)} aria-label="Close frequency response">×</button></header><svg viewBox="0 0 760 190" role="img" aria-label="Logarithmic frequency sweep chart"><path className="scope-grid" d="M58 12H744M58 52H744M58 92H744M58 132H744M58 172H744M58 12V172M230 12V172M401 12V172M573 12V172M744 12V172"/><path className="sweep-trace" d={frequencySweep.samples.map((point,index) => { const x=58+index*686/(frequencySweep.samples.length-1), max=Math.max(...frequencySweep.samples.map((item)=>item.voltage),1e-9), y=164-(point.voltage/max)*144; return `${index?'L':'M'} ${x} ${y}` }).join(' ')}/><text x="58" y="187">{fmt(frequencySweep.samples[0].frequency,'Hz')}</text><text x="695" y="187">{fmt(frequencySweep.samples.at(-1)!.frequency,'Hz')}</text><text x="10" y="20">V</text></svg><footer>Frequency axis is logarithmic · supply amplitude stays constant · select another component and run sweep again.</footer></section>}
        {selected && selectedReading && simulation && <section className="component-scope" aria-label="Selected component scope">
          <header><div><span className="scope-live-dot" /><strong>Scope</strong><span className="scope-part-name">{selected.label} · {partNames[selected.kind]}</span></div><small>{simulation.ac ? `AC · ${simulation.frequency} Hz · one cycle` : 'DC · steady state'}</small></header>
          <svg viewBox="0 0 1000 160" role="img" aria-label={`${selected.label} scope graph`}><path className="scope-grid" d="M54 10H946M54 43H946M54 77H946M54 112H946M54 145H946M54 10V145M165 10V145M277 10V145M388 10V145M500 10V145M611 10V145M723 10V145M834 10V145M946 10V145"/>{options.showVoltage && <><path className="scope-voltage" d={componentTracePath(selectedReading, simulation)} /><text x="8" y="18">V</text></>}{options.showCurrent && <><path className="scope-current" d={componentTracePath(selectedReading, simulation, true)} /><text x="8" y="87">A</text></>}<text x="54" y="157">0</text><text x="920" y="157">{simulation.ac ? '1 cycle' : 'time'}</text></svg>
          <footer>{options.showVoltage && <span><i className="scope-key-voltage" />Voltage {simulation.ac ? 'RMS ' : ''}{fmt(selectedReading.voltage, 'V')}</span>}{options.showCurrent && <span><i className="scope-key-current" />Current {simulation.ac ? 'RMS ' : ''}{fmt(selectedReading.current, 'A')}</span>}{options.showPower && <span><i className="scope-key-power" />Power {fmt(selectedReading.power, 'W')}</span>}<small>{simulation.ac ? 'AC waveform shown from its steady-state phasor.' : 'Flat trace: DC steady-state does not model transients.'}</small></footer>
        </section>}
        {simulation && <div className="circuit-results"><div className="circuit-results-head"><strong>Operating point</strong><span>{simulation.ac ? `AC · ${simulation.frequency} Hz` : 'DC analysis'}</span><button type="button" onClick={exportResultsCsv}>Download CSV</button></div><div className="circuit-results-table"><div className="circuit-result-row labels" style={{ gridTemplateColumns: `minmax(70px,1fr) repeat(${Math.max(1, metricColumns)},minmax(55px,.7fr))` }}><span>Part</span>{options.showVoltage && <span>Voltage</span>}{options.showCurrent && <span>Current</span>}{options.showPower && <span>Power</span>}</div>{simulation.readings.map((reading) => <div className="circuit-result-row" key={reading.id} style={{ gridTemplateColumns: `minmax(70px,1fr) repeat(${Math.max(1, metricColumns)},minmax(55px,.7fr))` }}><span>{reading.label}</span>{options.showVoltage && <span>{fmt(reading.voltage, 'V')}</span>}{options.showCurrent && <span>{fmt(reading.current, 'A')}</span>}{options.showPower && <span>{fmt(reading.power, 'W')}</span>}</div>)}</div></div>}
        {simulation && comparisonBase && <section className="circuit-comparison"><header><strong>Baseline comparison</strong><button onClick={() => setComparisonBase(null)}>Clear</button></header><p>Current readings compared with the saved baseline ({comparisonBase.label || 'circuit'}).</p><div className="comparison-table"><div className="comparison-row labels"><span>Part</span><span>Baseline V</span><span>Now V</span><span>Δ V</span></div>{simulation.readings.map((reading) => { const base = comparisonBase.readings.find((item) => item.label === reading.label); return <div className="comparison-row" key={reading.id}><span>{reading.label}</span><span>{base ? fmt(base.voltage,'V') : 'New'}</span><span>{fmt(reading.voltage,'V')}</span><strong>{base ? `${reading.voltage-base.voltage >= 0 ? '+' : ''}${fmt(reading.voltage-base.voltage,'V')}` : '—'}</strong></div> })}</div><button className="circuit-secondary-action" onClick={setComparisonBaseline}>Use current setup as new baseline</button></section>}
      </section>
      <aside className="circuit-inspector">
        <div className="circuit-section-title">INSPECTOR</div>
        <section className="circuit-bom"><header><strong>Parts list</strong><span>{circuit.parts.filter((part) => !['ground','junction'].includes(part.kind)).length} parts</span></header>{circuit.parts.filter((part) => !['ground','junction'].includes(part.kind)).length ? <ul>{circuit.parts.filter((part) => !['ground','junction'].includes(part.kind)).map((part) => <li key={part.id}><span><i className={'palette-symbol symbol-' + part.kind}>{partGlyph[part.kind]}</i><b>{part.label}</b><small>{partNames[part.kind]}</small></span><strong>{part.kind === 'source' || part.kind === 'ac-source' ? fmt(part.value,'V') : part.kind === 'resistor' ? fmt(part.value,'Ω') : part.kind === 'capacitor' ? fmt(part.value,'F') : part.kind === 'inductor' ? fmt(part.value,'H') : part.kind === 'diode' ? fmt(part.value,'V') : part.on ? 'Closed' : 'Open'}</strong></li>)}</ul> : <p>Add components to build a parts list as you work.</p>}<button type="button" className="circuit-secondary-action" onClick={exportPartsCsv}>Export parts list CSV</button></section>
        <details className="circuit-saved-library"><summary>My saved circuits <span>{savedCircuits.length}</span></summary><button type="button" className="circuit-secondary-action" onClick={saveToCircuitLibrary} disabled={options.disableEditing}>＋ Save current circuit</button>{savedCircuits.length ? <ul>{savedCircuits.map((item) => <li key={item.id}><button className="saved-circuit-open" onClick={() => openSavedCircuit(item)}><b>{item.name}</b><small>{new Date(item.updatedAt).toLocaleDateString()}</small></button><button className="saved-circuit-delete" aria-label={`Delete ${item.name}`} onClick={() => setSavedCircuits((items) => items.filter((saved) => saved.id !== item.id))}>×</button></li>)}</ul> : <p>Save circuits here to reopen them later in this browser.</p>}</details>
        {scopeActive && <section className="circuit-probe-panel" aria-label="Oscilloscope probes"><header><strong>Oscilloscope</strong><button onClick={()=>{setScopeActive(false);setScopeProbe(null)}} aria-label="Close oscilloscope">×</button></header><p>Select a channel, then click a terminal. Voltage is shown relative to ground.</p><div><button className={scopeProbe==='a'?'active':''} onClick={()=>setScopeProbe('a')}>Channel A · {scopePins.a?pinLookup[scopePins.a]?.label??'Connected':'Choose terminal'}</button><button className={scopeProbe==='b'?'active':''} onClick={()=>setScopeProbe('b')}>Channel B · {scopePins.b?pinLookup[scopePins.b]?.label??'Connected':'Choose terminal'}</button></div><button className="circuit-secondary-action" onClick={()=>setScopePins({a:null,b:null})}>Clear probes</button></section>}
        {dmmActive && <section className="physical-dmm" aria-label="Digital multimeter">
          <div className="dmm-topline"><span>OZOO</span><small>DIGITAL MULTIMETER</small></div>
          <div className="dmm-screen"><small>{meterMode === 'voltage' ? simulation?.ac ? 'AC VOLTS RMS' : 'DC VOLTS' : meterMode === 'current' ? simulation?.ac ? 'AC AMPS RMS' : 'DC AMPS' : 'RESISTANCE'}</small><output>{meterReading}</output><span>{meterMode === 'voltage' ? 'RED − BLACK' : 'SELECT COMPONENT'}</span></div>
          <div className="dmm-mode-label">MEASURE</div>
          <div className="dmm-modes">{([['voltage', 'V'], ['current', 'A'], ['resistance', 'Ω']] as const).map(([mode, label]) => <button key={mode} className={meterMode === mode ? 'active' : ''} onClick={() => { setMeterMode(mode); setMeterProbe(null); setMeterPins({ red: null, black: null }); setMeterReading(mode === 'voltage' ? 'Choose red and black probe terminals.' : `Select a component to read ${mode === 'current' ? 'current.' : 'resistance.'}`) }}>{label}</button>)}</div>
          <div className="dmm-leads"><button className={'dmm-lead red ' + (meterProbe === 'red' ? 'chosen' : '')} onClick={() => { setMeterProbe('red'); setMeterReading('Red probe selected. Click a circuit terminal.') }}><i /> RED PROBE <b>{meterPins.red ? pinLookup[meterPins.red]?.label ?? 'Set' : 'Set'}</b></button><button className={'dmm-lead black ' + (meterProbe === 'black' ? 'chosen' : '')} onClick={() => { setMeterProbe('black'); setMeterReading('Black probe selected. Click a circuit terminal.') }}><i /> BLACK PROBE <b>{meterPins.black ? pinLookup[meterPins.black]?.label ?? 'Set' : 'Set'}</b></button></div>
          <p className="dmm-hint">{meterMode === 'voltage' ? 'Select a probe, then click a terminal. Voltage is measured red relative to black.' : 'Select a component on the schematic to measure it.'}</p>
        </section>}
        {selected ? <>
          <div className="circuit-selected-kind"><span className={'palette-symbol symbol-' + selected.kind}>{partGlyph[selected.kind]}</span><span><b>{partNames[selected.kind]}</b><small>{selected.label}</small></span></div>
          {selected.kind !== 'ground' && <label className="circuit-field"><span>{selected.kind === 'source' || selected.kind === 'ac-source' ? selected.kind === 'ac-source' ? 'AC voltage (RMS)' : 'Voltage' : selected.kind === 'resistor' ? 'Resistance' : selected.kind === 'capacitor' ? 'Capacitance' : selected.kind === 'inductor' ? 'Inductance' : selected.kind === 'diode' ? 'Diode forward voltage drop' : 'Switch state'}</span>
            {selected.kind === 'switch' ? <button className={'switch-toggle ' + (selected.on ? 'on' : '')} onClick={() => updateSelected({ on: !selected.on })}>{selected.on ? 'Closed' : 'Open'}</button> : <span className="circuit-number"><input aria-label={selected.kind === 'diode' ? 'Diode forward voltage drop in volts' : `${partNames[selected.kind]} value`} type="number" min={['resistor', 'capacitor', 'inductor', 'diode'].includes(selected.kind) ? 0.000001 : undefined} step={selected.kind === 'resistor' ? 100 : selected.kind === 'capacitor' ? 0.000001 : selected.kind === 'inductor' ? 0.001 : selected.kind === 'diode' ? 0.05 : 0.1} value={selected.value} onChange={(event) => updateSelected({ value: Number(event.target.value) })} /><b>{selected.kind === 'source' || selected.kind === 'ac-source' || selected.kind === 'diode' ? 'V' : selected.kind === 'resistor' ? 'Ω' : selected.kind === 'capacitor' ? 'F' : 'H'}</b></span>}
          </label>}
          {selected.kind === 'diode' && <p className="circuit-field-hint">Used as the diode’s voltage drop in DC simulation. Typical values: silicon 0.7 V, red LED 1.8 V, blue LED 3.0 V.</p>}
          {selected.kind === 'diode' && <label className="circuit-field"><span>Diode model</span><select className="circuit-common-value" value={selected.diodeModel ?? 'silicon'} onChange={(event) => { const diodeModel = event.target.value as DiodeModel; updateSelected({ diodeModel, value: diodeModelDefaults[diodeModel], ...(diodeModel === 'zener' ? { zenerVoltage: selected.zenerVoltage ?? 5.1 } : {}) }) }}><option value="silicon">Standard silicon</option><option value="schottky">Schottky</option><option value="zener">Zener</option><option value="led">LED</option></select></label>}
          {selected.kind === 'diode' && selected.diodeModel === 'zener' && <label className="circuit-field"><span>Zener breakdown voltage</span><span className="circuit-number"><input aria-label="Zener breakdown voltage in volts" type="number" min="0.1" step="0.1" value={selected.zenerVoltage ?? 5.1} onChange={(event) => updateSelected({ zenerVoltage: Math.max(0.1, Number(event.target.value)) })} /><b>V</b></span></label>}
          {selected.kind === 'diode' && <><label className="circuit-field"><span>Reverse recovery time (optional)</span><span className="circuit-number"><input aria-label="Diode reverse recovery time in nanoseconds" type="number" min="0" step="1" placeholder="e.g. 50" value={selected.reverseRecoveryNs ?? ''} onChange={(event) => updateSelected({ reverseRecoveryNs: Number(event.target.value) > 0 ? Number(event.target.value) : undefined })} /><b>ns</b></span></label><label className="circuit-field"><span>Junction capacitance (optional)</span><span className="circuit-number"><input aria-label="Diode junction capacitance in picofarads" type="number" min="0" step="1" placeholder="e.g. 15" value={selected.junctionCapacitancePf ?? ''} onChange={(event) => updateSelected({ junctionCapacitancePf: Number(event.target.value) > 0 ? Number(event.target.value) : undefined })} /><b>pF</b></span></label><p className="circuit-field-hint">Switching effects are easiest to see with a short transient duration and a high step count.</p></>}
          {selected.kind === 'ac-source' && <label className="circuit-field"><span>Frequency</span><span className="circuit-number"><input type="number" min="0.1" max="1000000" step="1" value={selected.frequency ?? 60} onChange={(event) => updateSelected({ frequency: Number(event.target.value) })} /><b>Hz</b></span></label>}
          {selected.kind === 'resistor' && <label className="circuit-field"><span>Power rating (optional)</span><span className="circuit-number"><input aria-label="Resistor power rating" type="number" min="0" step="0.1" placeholder="e.g. 0.25" value={selected.powerRating ?? ''} onChange={(event) => updateSelected({ powerRating: Number(event.target.value) > 0 ? Number(event.target.value) : undefined })} /><b>W</b></span></label>}
          {selected.kind === 'capacitor' && <label className="circuit-field"><span>Voltage rating (optional)</span><span className="circuit-number"><input aria-label="Capacitor voltage rating" type="number" min="0" step="1" placeholder="e.g. 25" value={selected.voltageRating ?? ''} onChange={(event) => updateSelected({ voltageRating: Number(event.target.value) > 0 ? Number(event.target.value) : undefined })} /><b>V</b></span></label>}
          {['diode','inductor'].includes(selected.kind) && <label className="circuit-field"><span>Current rating (optional)</span><span className="circuit-number"><input aria-label="Component current rating" type="number" min="0" step="0.01" placeholder="e.g. 0.5" value={selected.currentRating ?? ''} onChange={(event) => updateSelected({ currentRating: Number(event.target.value) > 0 ? Number(event.target.value) : undefined })} /><b>A</b></span></label>}
          {selected.kind === 'diode' && <label className="circuit-field"><span>Power rating (optional)</span><span className="circuit-number"><input aria-label="Diode power rating" type="number" min="0" step="0.1" placeholder="e.g. 0.5" value={selected.powerRating ?? ''} onChange={(event) => updateSelected({ powerRating: Number(event.target.value) > 0 ? Number(event.target.value) : undefined })} /><b>W</b></span></label>}
          {selected.kind === 'diode' && <><label className="circuit-field"><span>Thermal resistance (optional)</span><span className="circuit-number"><input aria-label="Diode thermal resistance in degrees Celsius per watt" type="number" min="0" step="1" placeholder="e.g. 100" value={selected.thermalResistance ?? ''} onChange={(event) => updateSelected({ thermalResistance: Number(event.target.value) > 0 ? Number(event.target.value) : undefined })} /><b>°C/W</b></span></label>{selected.thermalResistance && <label className="circuit-field"><span>Maximum junction temperature</span><span className="circuit-number"><input aria-label="Maximum diode junction temperature in degrees Celsius" type="number" min="25" step="5" value={selected.maxJunctionTemperature ?? 125} onChange={(event) => updateSelected({ maxJunctionTemperature: Math.max(25, Number(event.target.value)) })} /><b>°C</b></span></label>}<p className="circuit-field-hint">Temperature warning estimates use 25 °C ambient and the thermal resistance you enter.</p></>}
          {selected.kind === 'diode' && selected.diodeModel !== 'zener' && <label className="circuit-field"><span>Maximum reverse voltage (optional)</span><span className="circuit-number"><input aria-label="Diode maximum reverse voltage" type="number" min="0" step="1" placeholder="e.g. 50" value={selected.voltageRating ?? ''} onChange={(event) => updateSelected({ voltageRating: Number(event.target.value) > 0 ? Number(event.target.value) : undefined })} /><b>V</b></span></label>}
          {commonPartValues[selected.kind] && <label className="circuit-field"><span>Common real-world values</span><select className="circuit-common-value" value="" onChange={(event)=>{const choice=commonPartValues[selected.kind]?.find((item)=>item.label===event.target.value);if(choice)updateSelected({value:choice.value,...(choice.model?{diodeModel:choice.model}:{})})}}><option value="">Choose a standard value…</option>{commonPartValues[selected.kind]?.map((item)=><option key={item.label} value={item.label}>{item.label}</option>)}</select></label>}
          <label className="circuit-field"><span>Reference name</span><input value={selected.label} onChange={(event) => updateSelected({ label: event.target.value })} /></label>
          <div className="circuit-rotation"><span>Rotate</span><button type="button" title="Rotate counterclockwise 90°" aria-label="Rotate counterclockwise" onClick={() => updateSelected({ rotation: ((selected.rotation ?? 0) + 270) % 360 })}>↶</button><output>{selected.rotation ?? 0}°</output><button type="button" title="Rotate clockwise 90°" aria-label="Rotate clockwise" onClick={() => updateSelected({ rotation: ((selected.rotation ?? 0) + 90) % 360 })}>↻</button></div>
          <div className="circuit-rotation"><span>Mirror</span><button type="button" className={selected.mirrorX ? 'pressed' : ''} title="Mirror left to right" aria-label="Mirror horizontally" onClick={() => updateSelected({ mirrorX: !selected.mirrorX })}>↔</button><button type="button" className={selected.mirrorY ? 'pressed' : ''} title="Mirror top to bottom" aria-label="Mirror vertically" onClick={() => updateSelected({ mirrorY: !selected.mirrorY })}>↕</button></div>
          <button className="circuit-danger" onClick={() => { setCircuit((value) => ({ parts: value.parts.filter((part) => part.id !== selected.id), wires: value.wires.filter((wire) => !wire.from.startsWith(selected.id + ':') && !wire.to.startsWith(selected.id + ':')) })); setSelectedPart(null); setSimulation(null) }}>Delete component</button>
        </> : selectedParts.length ? <p className="circuit-empty">{selectedParts.length} components selected. Use Edit to duplicate, rotate, mirror, or delete them.</p> : selectedWire ? <><p className="circuit-empty">Wire selected</p><button className="circuit-danger" onClick={() => { setCircuit((value) => ({ ...value, wires: value.wires.filter((wire) => wire.id !== selectedWire) })); setSelectedWire(null); setSimulation(null) }}>Delete wire</button></> : <p className="circuit-empty">Select a part or wire to inspect it. Components, values, and circuit files stay in this browser.</p>}
        {selected?.kind === 'diode' && selected.diodeModel === 'zener' && selectedReading && <section className="zener-readout" aria-label="Zener regulator readings"><strong>Zener readings</strong><div><span>{simulation?.ac ? 'RMS voltage' : 'Output voltage'}</span><b>{fmt(Math.abs(selectedReading.voltage), 'V')}</b></div><div><span>{simulation?.ac ? 'RMS current' : 'Zener current'}</span><b>{fmt(Math.abs(selectedReading.current), 'A')}</b></div><small>{simulation?.ac ? 'AC waveform values are RMS estimates; inspect the time-domain trace for peak behavior.' : Math.abs(selectedReading.voltage) >= (selected.zenerVoltage ?? 5.1) * .9 ? 'Breakdown region · regulating' : `Below the ${fmt(selected.zenerVoltage ?? 5.1, 'V')} breakdown target`}</small></section>}
        <details className="circuit-saved-runs"><summary>Saved simulation runs <span>{savedRuns.length}/10</span></summary><button type="button" className="circuit-secondary-action" onClick={saveSimulationRun} disabled={!simulation}>＋ Save current run</button>{savedRuns.length ? <ul>{savedRuns.map((run) => <li key={run.id}><div><b>{run.name}</b><small>{run.analysis} · {new Date(run.createdAt).toLocaleString()}</small></div><button type="button" onClick={() => compareSavedRun(run)} disabled={!simulation}>Compare</button><button type="button" className="saved-circuit-delete" aria-label={`Delete run ${run.name}`} onClick={() => setSavedRuns((runs) => runs.filter((item) => item.id !== run.id))}>×</button></li>)}</ul> : <p>Save solved results to compare them with later runs. Up to 10 snapshots stay in this browser.</p>}</details>
        <div className="circuit-library-note"><strong>Simulator model</strong><p>Diodes block reverse current; Zener models conduct at their breakdown voltage. AC circuits with diodes are sampled in the time domain for rectified waveform and RMS estimates. Reverse recovery and junction capacitance are simplified transient approximations.</p></div>
      </aside>
    </section>
{(showShortcuts || showOtherOptions || showAbout) && <div className="circuit-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowShortcuts(false); setShowOtherOptions(false); setShowAbout(false) } }}><section className="circuit-options-dialog" role="dialog" aria-modal="true" aria-labelledby="circuit-options-dialog-title"><button className="circuit-dialog-close" aria-label="Close dialog" onClick={() => { setShowShortcuts(false); setShowOtherOptions(false); setShowAbout(false) }}>×</button><h2 id="circuit-options-dialog-title">{showShortcuts ? 'Keyboard shortcuts' : showAbout ? 'About Circuit Studio' : 'Other options'}</h2>{showShortcuts ? <ul><li><kbd>Ctrl</kbd> + <kbd>O</kbd> Open circuit file</li><li><kbd>Ctrl</kbd> + <kbd>S</kbd> Save circuit as</li><li><kbd>Ctrl</kbd> + <kbd>P</kbd> Print circuit</li><li><kbd>Ctrl</kbd> + <kbd>Z</kbd> Undo</li><li><kbd>Ctrl</kbd> + <kbd>Y</kbd> Redo</li><li><kbd>Ctrl</kbd> + <kbd>D</kbd> Duplicate</li><li><kbd>Delete</kbd> Remove selection</li><li><kbd>Shift</kbd> while routing a wire Constrain its direction</li><li><kbd>0</kbd> Reset zoom</li><li><kbd>Home</kbd> Center the circuit</li><li><kbd>Esc</kbd> Cancel current action</li></ul> : showAbout ? <p>OzooNotes Circuit Studio lets you sketch and analyze basic DC and AC circuits. Circuit designs are autosaved in this browser. Current analysis supports sources, resistors, capacitors, inductors, switches, diodes in DC mode, and ground.</p> : <><p>These display and editing preferences are saved in this browser. Circuit designs and uploaded pictures are also stored locally on this device.</p><button className="circuit-reset-options" onClick={() => setOptions(defaultCircuitOptions)}>Restore default options</button></>}</section></div>}
  </main>
}


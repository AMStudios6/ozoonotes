import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react'
import './CircuitSimulator.css'
import { SimulatorThemePicker, useSimulatorTheme } from './SimulatorTheme'

type Kind = 'source' | 'ac-source' | 'resistor' | 'capacitor' | 'inductor' | 'diode' | 'switch' | 'ground' | 'junction'
type MeterMode = 'voltage' | 'current' | 'resistance'
type Part = { id: string; kind: Kind; x: number; y: number; value: number; label: string; on: boolean; frequency?: number; rotation?: number; mirrorX?: boolean; mirrorY?: boolean }
type Point = { x: number; y: number }
type Wire = { id: string; from: string; to: string; points?: Point[] }
type WireHandle = { wireId: string; index: number }
type WireSnap = { partId: string; wireId: string; pinId: string; point: Point; x: number; y: number; segmentIndex: number }
type Pin = { id: string; x: number; y: number; label: string }
type DrawKind = 'image' | 'text' | 'arrow' | 'rectangle' | 'ellipse'
type DrawItem = { id: string; kind: DrawKind; x: number; y: number; content?: string; color?: string }
type CircuitOptions = { showCurrent: boolean; showVoltage: boolean; showPower: boolean; showValues: boolean; smallGrid: boolean; toolbar: boolean; cursorCrosshair: boolean; europeanResistors: boolean; showOhmUnit: boolean; whiteBackground: boolean; conventionalCurrent: boolean; disableEditing: boolean; editValuesWithMouseWheel: boolean }
type Reading = { id: string; label: string; voltage: number; current: number; power: number; voltagePhase?: number; currentPhase?: number }
type Simulation = { readings: Reading[]; nodeVoltages: Record<string, number>; nodePhasors?: Record<string, { re: number; im: number }>; frequency?: number; ac?: boolean; message: string }
type Circuit = { parts: Part[]; wires: Wire[]; drawings?: DrawItem[] }
type PresetPart = { kind: Exclude<Kind, 'ground' | 'junction'>; value: number; label: string }
type CircuitPreset = { name: string; category: string; description: string; source: 'dc' | 'ac'; voltage: number; frequency?: number; parts: PresetPart[] }
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
  { category: 'Diodes', name: 'Diode forward-bias circuit', description: 'DC source and diode operating point', source: 'dc', voltage: 5, parts: [{ kind: 'resistor', value: 1000, label: 'R1' }, { kind: 'diode', value: 0.7, label: 'D1' }] },
]
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
  const source: Part = { id: makeId(), kind: preset.source === 'ac' ? 'ac-source' : 'source', x: 190, y: 300, value: preset.voltage, label: preset.source === 'ac' ? 'VAC1' : 'V1', on: true, ...(preset.source === 'ac' ? { frequency: preset.frequency ?? 60 } : {}) }
  const parts: Part[] = [source, ...preset.parts.map((item, index) => ({ id: makeId(), kind: item.kind, x: 410 + index * 185, y: 300, value: item.value, label: item.label, on: true }))]
  const ground: Part = { id: makeId(), kind: 'ground', x: 190, y: 485, value: 0, label: 'GND', on: true }
  const wires: Wire[] = [{ id: makeId(), from: pinId(source, 'a'), to: pinId(parts[1], 'a') }]
  for (let index = 1; index < parts.length - 1; index++) wires.push({ id: makeId(), from: pinId(parts[index], 'b'), to: pinId(parts[index + 1], 'a') })
  const last = parts[parts.length - 1]
  wires.push({ id: makeId(), from: pinId(source, 'b'), to: pinId(ground, 'g'), points: [{ x: 238, y: 300 }, { x: 238, y: 462 }, { x: 190, y: 462 }] })
  wires.push({ id: makeId(), from: pinId(last, 'b'), to: pinId(ground, 'g'), points: [{ x: last.x + 48, y: 300 }, { x: last.x + 70, y: 300 }, { x: last.x + 70, y: 462 }, { x: 220, y: 462 }] })
  return { parts: [...parts, ground], wires, drawings: [] }
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
function solveAcCircuit(parts: Part[], wires: Wire[]): Simulation {
  const sources = parts.filter((part) => part.kind === 'source' || part.kind === 'ac-source')
  const acSources = sources.filter((part) => part.kind === 'ac-source')
  const frequency = acSources[0]?.frequency ?? 60
  if (!frequency || frequency < 0.1 || frequency > 1e6) throw new Error('AC frequency must be between 0.1 Hz and 1 MHz.')
  if (acSources.some((part) => Math.abs((part.frequency ?? 60) - frequency) > 0.001)) throw new Error('All AC supplies in one circuit must use the same frequency.')
  if (parts.some((part) => part.kind === 'diode')) throw new Error('AC analysis currently supports resistors, capacitors, inductors, switches, and voltage sources. Remove the diode or use DC analysis.')
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
  const activeDiodes = new Set<string>()
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
      if (part.kind === 'diode' && activeDiodes.has(part.id)) {
        stampConductance(pinId(part, 'a'), pinId(part, 'b'), diodeConductance)
        const a = nodeFor(pinId(part, 'a')), b = nodeFor(pinId(part, 'b')), bias = diodeConductance * Math.max(0, part.value)
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
      const forward = voltageOfNode(pinId(part, 'a')) - voltageOfNode(pinId(part, 'b')) > Math.max(0, part.value)
      if (forward !== activeDiodes.has(part.id)) { if (forward) activeDiodes.add(part.id); else activeDiodes.delete(part.id); changed = true }
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
          : part.kind === 'diode' ? (activeDiodes.has(part.id) ? Math.max(0, voltage - Math.max(0, part.value)) * diodeConductance : 0)
            : part.kind === 'switch' ? voltage * (part.on ? 50 : 1e-10) : 0
    return { id: part.id, label: part.label, voltage, current, power: voltage * current }
  })
  const pins = allPins.map((pin) => ({ id: pin.id, voltage: voltageOf(pin.id) }))
  return { readings, nodeVoltages: Object.fromEntries(pins.map((pin) => [pin.id, pin.voltage])), message: 'DC steady state solved · capacitor open, inductor short, diode forward-drop model' }
}
const fmt = (value: number, unit: string) => {
  const abs = Math.abs(value)
  const [scaled, prefix] = abs >= 1e6 ? [value / 1e6, 'M'] : abs >= 1e3 ? [value / 1e3, 'k'] : abs >= 1 ? [value, ''] : abs >= 1e-3 ? [value * 1e3, 'm'] : [value * 1e6, 'µ']
  return (Math.abs(scaled) < 10 ? scaled.toFixed(3) : scaled.toFixed(2)) + ' ' + prefix + unit
}
const partNames: Record<Kind, string> = { source: 'DC source', 'ac-source': 'AC supply', resistor: 'Resistor', capacitor: 'Capacitor', inductor: 'Inductor', diode: 'Diode', switch: 'Switch', ground: 'Ground', junction: 'Wire junction' }
const partGlyph: Record<Kind, string> = { source: '＋', 'ac-source': '∿', resistor: '▱', capacitor: '║', inductor: '∿', diode: '▷', switch: '⌁', ground: '⏚', junction: '●' }
function componentTracePath(reading: Reading, simulation: Simulation, current = false) {
  const magnitude = current ? reading.current : reading.voltage
  const phase = current ? reading.currentPhase ?? 0 : reading.voltagePhase ?? 0
  const samples = Array.from({ length: 81 }, (_, index) => simulation.ac ? Math.SQRT2 * magnitude * Math.sin(2 * Math.PI * index / 80 + phase) : magnitude)
  const max = Math.max(...samples.map(Math.abs), 1e-12)
  return samples.map((sample, index) => `${index ? 'L' : 'M'} ${54 + index * 11.15} ${current ? 112 - sample / max * 25 : 43 - sample / max * 25}`).join(' ')
}
const symbolPinsText = (part: Part) => pinsFor(part)
const wirePath = (a: Point, b: Point, points: Point[] = []) => [a, ...points, b].map((point, index) => (index === 0 ? 'M' : 'L') + point.x + ' ' + point.y).join(' ')
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
  const [circuitSearch, setCircuitSearch] = useState('')
  const toggleOption = (key: keyof CircuitOptions) => setOptions((current) => ({ ...current, [key]: !current[key] }))
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [simulationActive, setSimulationActive] = useState(false)
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
  useEffect(() => { try { localStorage.setItem('ozoo:circuit', JSON.stringify(circuit)) } catch {} }, [circuit])
  useEffect(() => { try { localStorage.setItem('ozoo:circuit-options', JSON.stringify(options)) } catch {} }, [options])
  useEffect(() => {
    if (historyAction.current) { historyAction.current = false; lastCircuit.current = circuit; return }
    if (circuit === lastCircuit.current) return
    const previous = lastCircuit.current
    if (historyTimer.current) clearTimeout(historyTimer.current)
    historyTimer.current = setTimeout(() => { undoStack.current.push(previous); if (undoStack.current.length > 80) undoStack.current.shift(); redoStack.current = []; lastCircuit.current = circuit; historyTimer.current = null; setHistoryVersion((version) => version + 1) }, 240)
  }, [circuit])
  useEffect(() => {
    if (!simulationActive) return
    try { setSimulation(solveCircuit(circuit.parts, circuit.wires)); setError('') }
    catch (reason) { setSimulation(null); setError(reason instanceof Error ? reason.message : String(reason)) }
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
    const part: Part = { id: makeId(), kind, x: Math.max(64, Math.min(W - 64, x)), y: Math.max(90, Math.min(H - 62, y)), value, label, on: true, ...(kind === 'ac-source' ? { frequency: 60 } : {}) }
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
      const point = screenPoint(event)
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
    if (event.button !== 0 || dmmActive || placement || wireStart || options.disableEditing) return
    const point = screenPoint(event)
    wireDrag.current = { from: pin.id, x: point.x, y: point.y, moved: false }
    setWireStart(pin.id); setWirePoints([]); setWireCursor(point); setSelectedPart(null); setSelectedWire(null)
    setError('Drag this terminal to another pin to connect it, or click pins to route a wire.')
    svgRef.current?.setPointerCapture(event.pointerId)
  }
  const runSimulation = () => {
    setSimulationActive(true)
    setError('')
    try { setSimulation(solveCircuit(circuit.parts, circuit.wires)) }
    catch (reason) { setSimulation(null); setError(reason instanceof Error ? reason.message : String(reason)) }
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
  const saveDesign = () => {
    const payload = JSON.stringify({ format: 'ozoo-circuit', version: 1, parts: circuit.parts, wires: circuit.wires, drawings: circuit.drawings ?? [] }, null, 2)
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' })), link = document.createElement('a')
    link.href = url; link.download = 'ozoo-circuit.json'; link.click(); URL.revokeObjectURL(url)
  }
  const importDesign = async (event: ChangeEvent<HTMLInputElement>) => {
    if (options.disableEditing) { event.target.value = ''; return }
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const data = JSON.parse(await file.text()) as Circuit & { format?: string; version?: number }
      if (!Array.isArray(data.parts) || !Array.isArray(data.wires) || data.parts.some((part) => !part.id || !part.kind || !Number.isFinite(part.x) || !Number.isFinite(part.y)) || data.wires.some((wire) => !wire.from || !wire.to)) throw new Error('This file is not a valid circuit design.')
      setCircuit({ parts: data.parts, wires: data.wires, drawings: Array.isArray(data.drawings) ? data.drawings : [] }); setSelectedPart(null); setSelectedParts([]); setSelectedWire(null); setSimulation(null); setError('Circuit design opened.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to open this circuit file.') }
    event.target.value = ''
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
    try { setSimulation(solveCircuit(nextCircuit.parts, nextCircuit.wires)) } catch { setSimulation(null) }
    setSelectedPart(null); setSelectedParts([]); setSelectedWire(null); setSelectedDrawing(null); setWireStart(null); setWirePoints([]); setWireCursor(null); setError(`${preset.name} loaded · ${preset.description}`); setOpenMenu(null); setCircuitSearch('')
  }
  const downloadSvg = () => {
    const svg = svgRef.current
    if (!svg) return
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'ozoo-circuit.svg'; link.click(); URL.revokeObjectURL(url)
  }
  return <main className="circuit-workspace" data-theme={colorTheme} data-white-background={options.whiteBackground}>
    <header className="circuit-topbar">
      <button className="circuit-back" onClick={onBack}>← <span>Simulator</span></button>
      <div className="circuit-brand"><span className="circuit-brand-icon">Ω</span><div><strong>Circuit Studio</strong><small>Electronics simulator</small></div></div>
      <div className="circuit-top-actions"><SimulatorThemePicker theme={colorTheme} onChange={setColorTheme} /><button aria-label="Delete selected" title="Delete selected component, wire, or drawing" disabled={options.disableEditing || (!selectedIds.length && !selectedWire && !selectedDrawing)} onClick={deleteSelection}>Delete</button><button className="circuit-run" onClick={runSimulation}>▶ Simulate</button></div>
    </header>
    <section className="circuit-heading"><div><p>SIMULATOR / ELECTRONICS</p><h1>Build a circuit. See it work.</h1><span>Drag parts into place, connect terminals, and watch current and voltage.</span></div><span className="circuit-local"><i /> Saved on this device</span></section>
    <section className="circuit-layout">
      <nav className="circuit-menubar" aria-label="Circuit menus" data-history-version={historyVersion}>
        <div className="circuit-menu-wrap"><button className={openMenu === 'file' ? 'open' : ''} aria-expanded={openMenu === 'file'} onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}>File <span>⌄</span></button>{openMenu === 'file' && <div className="circuit-menu-popover" role="menu"><button role="menuitem" disabled={options.disableEditing} onClick={() => { newCircuit(); setOpenMenu(null) }}>New design</button><button role="menuitem" disabled={options.disableEditing} onClick={() => designFileInput.current?.click()}>Open design…</button><button role="menuitem" onClick={() => { saveDesign(); setOpenMenu(null) }}>Download design <kbd>JSON</kbd></button><button role="menuitem" onClick={() => { downloadSvg(); setOpenMenu(null) }}>Export schematic <kbd>SVG</kbd></button><hr /><button role="menuitem" disabled={options.disableEditing} onClick={() => { setCircuit(exampleCircuit()); setSelectedPart(null); setSelectedParts([]); setSimulation(null); setError(''); setOpenMenu(null) }}>Load example circuit</button></div>}</div>
        <div className="circuit-menu-wrap"><button className={openMenu === 'edit' ? 'open' : ''} aria-expanded={openMenu === 'edit'} onClick={() => setOpenMenu(openMenu === 'edit' ? null : 'edit')}>Edit <span>⌄</span></button>{openMenu === 'edit' && <div className="circuit-menu-popover circuit-edit-popover" role="menu"><button role="menuitem" disabled={!undoStack.current.length} onClick={() => { undoCircuit(); setOpenMenu(null) }}>↶ Undo <kbd>Ctrl+Z</kbd></button><button role="menuitem" disabled={!redoStack.current.length} onClick={() => { redoCircuit(); setOpenMenu(null) }}>↷ Redo <kbd>Ctrl+Y</kbd></button><hr /><button role="menuitem" disabled={!selectedIds.length} onClick={() => { copySelection(); deleteSelection(); setOpenMenu(null) }}>✂ Cut <kbd>Ctrl+X</kbd></button><button role="menuitem" disabled={!selectedIds.length} onClick={() => { copySelection(); setOpenMenu(null) }}>▢ Copy <kbd>Ctrl+C</kbd></button><button role="menuitem" disabled={!clipboard.parts.length} onClick={() => { pasteParts(clipboard.parts, clipboard.wires); setOpenMenu(null) }}>▣ Paste <kbd>Ctrl+V</kbd></button><button role="menuitem" disabled={!selectedIds.length} onClick={() => { duplicateSelection(); setOpenMenu(null) }}>▧ Duplicate <kbd>Ctrl+D</kbd></button><button role="menuitem" onClick={() => { selectAll(); setOpenMenu(null) }}>✣ Select all <kbd>Ctrl+A</kbd></button><hr /><label className="circuit-menu-search"><span>Find component <kbd>/</kbd></span><div><input value={findQuery} onChange={(event) => setFindQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { findComponent(); setOpenMenu(null) } }} placeholder="Name or type…" /><button onClick={() => { findComponent(); setOpenMenu(null) }}>Find</button></div></label><button role="menuitem" onClick={() => { centerCircuit(); setOpenMenu(null) }}>⌖ Center circuit <kbd>Home</kbd></button><button role="menuitem" onClick={() => { resetZoom(); setOpenMenu(null) }}>◎ Zoom 100% <kbd>0</kbd></button><button role="menuitem" onClick={() => { setZoomBy(1.2); setOpenMenu(null) }}>⊕ Zoom in <kbd>+</kbd></button><button role="menuitem" onClick={() => { setZoomBy(1 / 1.2); setOpenMenu(null) }}>⊖ Zoom out <kbd>−</kbd></button><hr /><button role="menuitem" disabled={!selectedIds.length} onClick={() => { mirrorSelection('mirrorX'); setOpenMenu(null) }}>↔ Mirror X</button><button role="menuitem" disabled={!selectedIds.length} onClick={() => { mirrorSelection('mirrorY'); setOpenMenu(null) }}>↕ Mirror Y</button><button role="menuitem" disabled={!selectedIds.length} onClick={() => { rotateSelection(-90); setOpenMenu(null) }}>↶ Rotate CCW</button><button role="menuitem" disabled={!selectedIds.length} onClick={() => { rotateSelection(90); setOpenMenu(null) }}>↻ Rotate CW</button></div>}</div>
        <div className="circuit-menu-wrap"><button className={openMenu === 'tools' ? 'open' : ''} aria-expanded={openMenu === 'tools'} onClick={() => setOpenMenu(openMenu === 'tools' ? null : 'tools')}>Tools <span>⌄</span></button>{openMenu === 'tools' && <div className="circuit-menu-popover" role="menu"><button role="menuitem" aria-pressed={dmmActive} onClick={() => { setDmmActive((active) => !active); setPlacement(null); setDrawMode(null); setWireStart(null); setOpenMenu(null) }}>▦ {dmmActive ? 'Close multimeter' : 'Digital multimeter'}</button><button role="menuitem" disabled={options.disableEditing} onClick={() => { setPlacement(null); setDrawMode(null); setError('Drag from a pin to another pin, or click two pins to wire.'); setOpenMenu(null) }}>⌁ Wire tool</button><button role="menuitemcheckbox" aria-checked={gridVisible} onClick={() => setGridVisible((visible) => !visible)}>▧ {gridVisible ? 'Hide grid' : 'Show grid'}</button></div>}</div>
<div className="circuit-menu-wrap"><button className={openMenu === 'place' ? 'open' : ''} aria-expanded={openMenu === 'place'} onClick={() => setOpenMenu(openMenu === 'place' ? null : 'place')}>Place & Draw <span>⌄</span></button>{openMenu === 'place' && <div className="circuit-menu-popover circuit-place-draw-popover" role="menu"><div className="circuit-menu-label">COMPONENTS</div><div className="circuit-place-draw-grid">{(['source', 'ac-source', 'resistor', 'capacitor', 'inductor', 'diode', 'switch', 'ground'] as Kind[]).map((kind) => <button role="menuitem" key={kind} disabled={options.disableEditing} onClick={() => { setPlacement(kind); setDrawMode(null); setWireStart(null); setError('Click the board to place ' + partNames[kind].toLowerCase() + '.'); setOpenMenu(null) }}><span className={'palette-symbol symbol-' + kind}>{partGlyph[kind]}</span>{partNames[kind]}</button>)}</div><hr /><div className="circuit-menu-label">ANNOTATIONS & PICTURES</div><div className="circuit-place-draw-annotations"><button role="menuitem" disabled={options.disableEditing} onClick={() => beginDrawing('image')}>▧ Insert image…</button><button role="menuitem" disabled={options.disableEditing} onClick={() => beginDrawing('text')}>T Add text label…</button><button role="menuitem" disabled={options.disableEditing} onClick={() => beginDrawing('arrow')}>↗ Add arrow</button><button role="menuitem" disabled={options.disableEditing} onClick={() => beginDrawing('rectangle')}>▱ Add rectangle</button><button role="menuitem" disabled={options.disableEditing} onClick={() => beginDrawing('ellipse')}>◯ Add ellipse</button></div></div>}</div>
        <div className="circuit-menu-wrap"><button className={openMenu === 'circuits' ? 'open' : ''} aria-expanded={openMenu === 'circuits'} onClick={() => setOpenMenu(openMenu === 'circuits' ? null : 'circuits')}>Circuits <span>⌄</span></button>{openMenu === 'circuits' && <div className="circuit-menu-popover circuit-presets-popover" role="menu"><label className="circuit-preset-search"><span>PREMADE CIRCUITS</span><input value={circuitSearch} onChange={(event) => setCircuitSearch(event.target.value)} placeholder="Search circuits…" /></label><div className="circuit-preset-groups">{Array.from(new Set(circuitPresets.map((preset) => preset.category))).map((category, index) => { const presets = circuitPresets.filter((preset) => preset.category === category && (!circuitSearch || `${preset.name} ${preset.description} ${preset.category}`.toLowerCase().includes(circuitSearch.toLowerCase()))); return presets.length ? <details key={category} open={!!circuitSearch || index === 0}><summary>{category}<span>{presets.length}</span></summary><div>{presets.map((preset) => <button key={preset.name} role="menuitem" disabled={options.disableEditing} onClick={() => loadCircuitPreset(preset)}><strong>{preset.name}</strong><small>{preset.description}</small></button>)}</div></details> : null })}{!circuitPresets.some((preset) => `${preset.name} ${preset.description} ${preset.category}`.toLowerCase().includes(circuitSearch.toLowerCase())) && <p className="circuit-preset-empty">No matching circuits. Try a different search.</p>}</div><hr /><button role="menuitem" disabled={options.disableEditing} onClick={() => { newCircuit(); setOpenMenu(null) }}>＋ Blank circuit</button></div>}</div>
        <div className="circuit-menu-wrap"><button className={openMenu === 'options' ? 'open' : ''} aria-expanded={openMenu === 'options'} onClick={() => setOpenMenu(openMenu === 'options' ? null : 'options')}>Options <span>⌄</span></button>{openMenu === 'options' && <div className="circuit-menu-popover circuit-options-popover" role="menu">
          <div className="circuit-menu-label">DISPLAY</div>
          {([['showCurrent','Show Current'],['showVoltage','Show Voltage'],['showPower','Show Power'],['showValues','Show Values'],['smallGrid','Small Grid'],['toolbar','Toolbar'],['cursorCrosshair','Show Cursor Crosshair'],['europeanResistors','European Resistors'],['showOhmUnit','Show Ω Unit'],['whiteBackground','White Background'],['conventionalCurrent','Conventional Current Motion'],['disableEditing','Disable Editing'],['editValuesWithMouseWheel','Edit Values With Mouse Wheel']] as [keyof CircuitOptions,string][]).map(([key,label]) => <button key={key} role="menuitemcheckbox" aria-checked={options[key]} onClick={() => toggleOption(key)}><span className="option-check">{options[key] ? '✓' : ''}</span>{label}</button>)}
          <button role="menuitem" disabled title="Digital logic-gate parts are not available in this simulator yet.">IEC Gates <small>coming later</small></button><hr />
          <button role="menuitem" onClick={() => { setShowShortcuts(true); setOpenMenu(null) }}>⌨ Shortcuts…</button><button role="menuitem" onClick={() => { setShowOtherOptions(true); setOpenMenu(null) }}>Other Options…</button>
        </div>}</div>
        <input ref={designFileInput} type="file" accept=".json,application/json" hidden onChange={importDesign} /><input ref={pictureFileInput} type="file" accept="image/*" hidden onChange={importPicture} />
      </nav>
      {options.toolbar && <section className="circuit-tools" aria-label="Circuit tools">
        <div className="circuit-tools-group"><div className="circuit-section-title">TOOLS</div><button className={dmmActive ? 'active' : ''} onClick={() => { setDmmActive((active) => !active); setPlacement(null); setDrawMode(null); setWireStart(null); setMeterPins({ red: null, black: null }); setMeterProbe(null); setMeterReading('Choose a mode, then connect the probes.') }}><span className="palette-symbol symbol-meter">DMM</span><span>Multimeter</span></button><button className={wireStart ? 'active' : ''} onClick={() => { setPlacement(null); setDrawMode(null); setError('Drag from a pin to another pin, or click two pins to wire.') }}><span className="palette-symbol">⌁</span><span>Wire</span></button><button className={gridVisible ? 'active' : ''} onClick={() => setGridVisible((visible) => !visible)} title="Toggle schematic grid"><span className="palette-symbol">▦</span><span>Grid</span></button><button onClick={newCircuit} disabled={options.disableEditing}><span className="palette-symbol">＋</span><span>New</span></button></div>
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
          if (wireDrag.current) { const state = wireDrag.current; if (Math.hypot(point.x - state.x, point.y - state.y) > 6) state.moved = true; setWireCursor(point) }
          else if (wireStart) setWireCursor(point)
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
            } else if (state.moved) { const point = screenPoint(event); setWirePoints((value) => [...value, point]); setWireCursor(point) }
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
        {selected && selectedReading && simulation && <section className="component-scope" aria-label="Selected component scope">
          <header><div><span className="scope-live-dot" /><strong>Scope</strong><span className="scope-part-name">{selected.label} · {partNames[selected.kind]}</span></div><small>{simulation.ac ? `AC · ${simulation.frequency} Hz · one cycle` : 'DC · steady state'}</small></header>
          <svg viewBox="0 0 1000 160" role="img" aria-label={`${selected.label} scope graph`}><path className="scope-grid" d="M54 10H946M54 43H946M54 77H946M54 112H946M54 145H946M54 10V145M165 10V145M277 10V145M388 10V145M500 10V145M611 10V145M723 10V145M834 10V145M946 10V145"/>{options.showVoltage && <><path className="scope-voltage" d={componentTracePath(selectedReading, simulation)} /><text x="8" y="18">V</text></>}{options.showCurrent && <><path className="scope-current" d={componentTracePath(selectedReading, simulation, true)} /><text x="8" y="87">A</text></>}<text x="54" y="157">0</text><text x="920" y="157">{simulation.ac ? '1 cycle' : 'time'}</text></svg>
          <footer>{options.showVoltage && <span><i className="scope-key-voltage" />Voltage {simulation.ac ? 'RMS ' : ''}{fmt(selectedReading.voltage, 'V')}</span>}{options.showCurrent && <span><i className="scope-key-current" />Current {simulation.ac ? 'RMS ' : ''}{fmt(selectedReading.current, 'A')}</span>}{options.showPower && <span><i className="scope-key-power" />Power {fmt(selectedReading.power, 'W')}</span>}<small>{simulation.ac ? 'AC waveform shown from its steady-state phasor.' : 'Flat trace: DC steady-state does not model transients.'}</small></footer>
        </section>}
        {simulation && <div className="circuit-results"><div className="circuit-results-head"><strong>Operating point</strong><span>{simulation.ac ? `AC · ${simulation.frequency} Hz` : 'DC analysis'}</span></div><div className="circuit-results-table"><div className="circuit-result-row labels" style={{ gridTemplateColumns: `minmax(70px,1fr) repeat(${Math.max(1, metricColumns)},minmax(55px,.7fr))` }}><span>Part</span>{options.showVoltage && <span>Voltage</span>}{options.showCurrent && <span>Current</span>}{options.showPower && <span>Power</span>}</div>{simulation.readings.map((reading) => <div className="circuit-result-row" key={reading.id} style={{ gridTemplateColumns: `minmax(70px,1fr) repeat(${Math.max(1, metricColumns)},minmax(55px,.7fr))` }}><span>{reading.label}</span>{options.showVoltage && <span>{fmt(reading.voltage, 'V')}</span>}{options.showCurrent && <span>{fmt(reading.current, 'A')}</span>}{options.showPower && <span>{fmt(reading.power, 'W')}</span>}</div>)}</div></div>}
      </section>
      <aside className="circuit-inspector">
        <div className="circuit-section-title">INSPECTOR</div>
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
          {selected.kind !== 'ground' && <label className="circuit-field"><span>{selected.kind === 'source' || selected.kind === 'ac-source' ? selected.kind === 'ac-source' ? 'AC voltage (RMS)' : 'Voltage' : selected.kind === 'resistor' ? 'Resistance' : selected.kind === 'capacitor' ? 'Capacitance' : selected.kind === 'inductor' ? 'Inductance' : selected.kind === 'diode' ? 'Forward voltage' : 'Switch state'}</span>
            {selected.kind === 'switch' ? <button className={'switch-toggle ' + (selected.on ? 'on' : '')} onClick={() => updateSelected({ on: !selected.on })}>{selected.on ? 'Closed' : 'Open'}</button> : <span className="circuit-number"><input type="number" min={['resistor', 'capacitor', 'inductor', 'diode'].includes(selected.kind) ? 0.000001 : undefined} step={selected.kind === 'resistor' ? 100 : selected.kind === 'capacitor' ? 0.000001 : selected.kind === 'inductor' ? 0.001 : 0.1} value={selected.value} onChange={(event) => updateSelected({ value: Number(event.target.value) })} /><b>{selected.kind === 'source' || selected.kind === 'ac-source' || selected.kind === 'diode' ? 'V' : selected.kind === 'resistor' ? 'Ω' : selected.kind === 'capacitor' ? 'F' : 'H'}</b></span>}
          </label>}
          {selected.kind === 'ac-source' && <label className="circuit-field"><span>Frequency</span><span className="circuit-number"><input type="number" min="0.1" max="1000000" step="1" value={selected.frequency ?? 60} onChange={(event) => updateSelected({ frequency: Number(event.target.value) })} /><b>Hz</b></span></label>}
          <label className="circuit-field"><span>Reference name</span><input value={selected.label} onChange={(event) => updateSelected({ label: event.target.value })} /></label>
          <div className="circuit-rotation"><span>Rotate</span><button type="button" title="Rotate counterclockwise 90°" aria-label="Rotate counterclockwise" onClick={() => updateSelected({ rotation: ((selected.rotation ?? 0) + 270) % 360 })}>↶</button><output>{selected.rotation ?? 0}°</output><button type="button" title="Rotate clockwise 90°" aria-label="Rotate clockwise" onClick={() => updateSelected({ rotation: ((selected.rotation ?? 0) + 90) % 360 })}>↻</button></div>
          <div className="circuit-rotation"><span>Mirror</span><button type="button" className={selected.mirrorX ? 'pressed' : ''} title="Mirror left to right" aria-label="Mirror horizontally" onClick={() => updateSelected({ mirrorX: !selected.mirrorX })}>↔</button><button type="button" className={selected.mirrorY ? 'pressed' : ''} title="Mirror top to bottom" aria-label="Mirror vertically" onClick={() => updateSelected({ mirrorY: !selected.mirrorY })}>↕</button></div>
          <button className="circuit-danger" onClick={() => { setCircuit((value) => ({ parts: value.parts.filter((part) => part.id !== selected.id), wires: value.wires.filter((wire) => !wire.from.startsWith(selected.id + ':') && !wire.to.startsWith(selected.id + ':')) })); setSelectedPart(null); setSimulation(null) }}>Delete component</button>
        </> : selectedParts.length ? <p className="circuit-empty">{selectedParts.length} components selected. Use Edit to duplicate, rotate, mirror, or delete them.</p> : selectedWire ? <><p className="circuit-empty">Wire selected</p><button className="circuit-danger" onClick={() => { setCircuit((value) => ({ ...value, wires: value.wires.filter((wire) => wire.id !== selectedWire) })); setSelectedWire(null); setSimulation(null) }}>Delete wire</button></> : <p className="circuit-empty">Select a part or wire to inspect it. Components, values, and circuit files stay in this browser.</p>}
        <div className="circuit-library-note"><strong>Simulator model</strong><p>DC mode solves steady state; AC mode uses RMS phasors for resistors, capacitors, inductors, switches, and sources. AC diode analysis and time-domain transients are not modeled.</p></div>
      </aside>
    </section>
    {(showShortcuts || showOtherOptions) && <div className="circuit-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowShortcuts(false); setShowOtherOptions(false) } }}><section className="circuit-options-dialog" role="dialog" aria-modal="true" aria-labelledby="circuit-options-dialog-title"><button className="circuit-dialog-close" aria-label="Close dialog" onClick={() => { setShowShortcuts(false); setShowOtherOptions(false) }}>×</button><h2 id="circuit-options-dialog-title">{showShortcuts ? 'Keyboard shortcuts' : 'Other options'}</h2>{showShortcuts ? <ul><li><kbd>Ctrl</kbd> + <kbd>Z</kbd> Undo</li><li><kbd>Ctrl</kbd> + <kbd>Y</kbd> Redo</li><li><kbd>Ctrl</kbd> + <kbd>D</kbd> Duplicate</li><li><kbd>Delete</kbd> Remove selection</li><li><kbd>0</kbd> Reset zoom</li><li><kbd>+</kbd> / <kbd>−</kbd> Zoom in or out</li><li><kbd>Home</kbd> Center the circuit</li><li><kbd>Esc</kbd> Cancel current action</li></ul> : <><p>These display and editing preferences are saved in this browser. Circuit designs and uploaded pictures are also stored locally on this device.</p><button className="circuit-reset-options" onClick={() => setOptions(defaultCircuitOptions)}>Restore default options</button></>}</section></div>}
  </main>
}

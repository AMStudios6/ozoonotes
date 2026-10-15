import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import './CircuitSimulator.css'

type Kind = 'source' | 'resistor' | 'switch' | 'ground'
type MeterMode = 'voltage' | 'current' | 'resistance'
type Part = { id: string; kind: Kind; x: number; y: number; value: number; label: string; on: boolean; rotation?: number }
type Wire = { id: string; from: string; to: string }
type Pin = { id: string; x: number; y: number; label: string }
type Reading = { id: string; label: string; voltage: number; current: number; power: number }
type Simulation = { readings: Reading[]; nodeVoltages: Record<string, number>; message: string }
type Circuit = { parts: Part[]; wires: Wire[] }

const W = 1120
const H = 700
const makeId = () => globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)
const pinId = (part: Part, side: string) => part.id + ':' + side
const rotatePoint = (part: Part, x: number, y: number) => {
  const angle = ((part.rotation ?? 0) * Math.PI) / 180
  return { x: part.x + x * Math.cos(angle) - y * Math.sin(angle), y: part.y + x * Math.sin(angle) + y * Math.cos(angle) }
}
const pinsFor = (part: Part): Pin[] => {
  if (part.kind === 'ground') { const point = rotatePoint(part, 0, -23); return [{ id: pinId(part, 'g'), ...point, label: 'GND' }] }
  const a = rotatePoint(part, -48, 0), b = rotatePoint(part, 48, 0)
  return [
    { id: pinId(part, 'a'), ...a, label: part.kind === 'source' ? '+' : '1' },
    { id: pinId(part, 'b'), ...b, label: part.kind === 'source' ? '−' : '2' },
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
function loadCircuit(): Circuit {
  try {
    const value = JSON.parse(localStorage.getItem('ozoo:circuit') ?? 'null')
    if (value && Array.isArray(value.parts) && Array.isArray(value.wires)) return value as Circuit
  } catch {}
  return exampleCircuit()
}
function solveCircuit(parts: Part[], wires: Wire[]): Simulation {
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
  const matrix = Array.from({ length: size }, () => Array(size).fill(0))
  const rhs = Array(size).fill(0)
  const nodeFor = (id: string) => nodeIndex.get(find(id))
  const stampConductance = (a: string, b: string, conductance: number) => {
    const ia = nodeFor(a), ib = nodeFor(b)
    if (ia !== undefined) matrix[ia][ia] += conductance
    if (ib !== undefined) matrix[ib][ib] += conductance
    if (ia !== undefined && ib !== undefined) { matrix[ia][ib] -= conductance; matrix[ib][ia] -= conductance }
  }
  parts.forEach((part) => {
    if (part.kind === 'resistor') stampConductance(pinId(part, 'a'), pinId(part, 'b'), 1 / Math.max(0.001, part.value))
    if (part.kind === 'switch') stampConductance(pinId(part, 'a'), pinId(part, 'b'), part.on ? 50 : 1e-10)
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
  const nodeVoltages: Record<string, number> = { [groundRoot]: 0 }
  roots.forEach((root, index) => { nodeVoltages[root] = rhs[index] })
  const voltageOf = (id: string) => nodeVoltages[find(id)] ?? 0
  const readings = parts.filter((part) => part.kind !== 'ground').map((part) => {
    const a = voltageOf(pinId(part, 'a')), b = voltageOf(pinId(part, 'b'))
    const voltage = a - b
    const current = part.kind === 'source' ? rhs[roots.length + voltageSources.findIndex((source) => source.id === part.id)] : voltage * (part.kind === 'resistor' ? 1 / Math.max(0.001, part.value) : part.on ? 50 : 1e-10)
    return { id: part.id, label: part.label, voltage, current, power: voltage * current }
  })
  const pins = allPins.map((pin) => ({ id: pin.id, voltage: voltageOf(pin.id) }))
  return { readings, nodeVoltages: Object.fromEntries(pins.map((pin) => [pin.id, pin.voltage])), message: 'DC operating point solved · ideal wires · resistive components' }
}
const fmt = (value: number, unit: string) => {
  const abs = Math.abs(value)
  const [scaled, prefix] = abs >= 1e6 ? [value / 1e6, 'M'] : abs >= 1e3 ? [value / 1e3, 'k'] : abs >= 1 ? [value, ''] : abs >= 1e-3 ? [value * 1e3, 'm'] : [value * 1e6, 'µ']
  return (Math.abs(scaled) < 10 ? scaled.toFixed(3) : scaled.toFixed(2)) + ' ' + prefix + unit
}
const partNames: Record<Kind, string> = { source: 'DC source', resistor: 'Resistor', switch: 'Switch', ground: 'Ground' }
const symbolPinsText = (part: Part) => pinsFor(part)
function PartSymbol({ part, selected, onPointerDown, onPin, voltageMap }: {
  part: Part; selected: boolean; onPointerDown: (event: ReactPointerEvent<SVGGElement>, part: Part) => void
  onPin: (pin: Pin) => void; voltageMap?: Record<string, number>
}) {
  const pins = symbolPinsText(part)
  const voltageLabel = (pin: Pin) => voltageMap ? fmt(voltageMap[pin.id] ?? 0, 'V') : pin.label
  return <g transform={'translate(' + part.x + ' ' + part.y + ') rotate(' + (part.rotation ?? 0) + ')'} className={'circuit-part ' + (selected ? 'selected' : '')} onPointerDown={(event) => onPointerDown(event, part)}>
    {part.kind === 'resistor' && <>
      <line x1="-48" y1="0" x2="-31" y2="0" /><path d="M-31 0 L-21 -12 L-11 12 L-1 -12 L9 12 L19 -12 L29 0" /><line x1="29" y1="0" x2="48" y2="0" />
    </>}
    {part.kind === 'source' && <>
      <line x1="-48" y1="0" x2="-27" y2="0" /><line x1="27" y1="0" x2="48" y2="0" /><circle r="27" /><text className="source-plus" x="-9" y="-3">+</text><text className="source-minus" x="7" y="5">−</text>
    </>}
    {part.kind === 'switch' && <>
      <line x1="-48" y1="0" x2="-25" y2="0" /><line x1="25" y1="0" x2="48" y2="0" /><circle cx="-25" r="3" /><circle cx="25" r="3" /><line x1="-25" y1="0" x2={part.on ? 24 : 12} y2={part.on ? 0 : -14} className="switch-lever" />
    </>}
    {part.kind === 'ground' && <g transform="translate(0 -23)"><line y1="0" y2="10" /><line x1="-17" y1="10" x2="17" y2="10" /><line x1="-11" y1="15" x2="11" y2="15" /><line x1="-5" y1="20" x2="5" y2="20" /></g>}
    {pins.map((pin) => <g key={pin.id} className="circuit-pin" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); onPin(pin) }}>
      <circle cx={pin.x - part.x} cy={pin.y - part.y} r="8" className="pin-hit" />
      <circle cx={pin.x - part.x} cy={pin.y - part.y} r="3.2" className="pin-dot" />
      <text x={pin.x - part.x} y={pin.y - part.y - 12} className="pin-label">{voltageLabel(pin)}</text>
    </g>)}
    <text x="0" y="39" className="part-label">{part.label}</text>
    {part.kind !== 'ground' && <text x="0" y="56" className="part-value">{part.kind === 'source' ? fmt(part.value, 'V') : part.kind === 'resistor' ? fmt(part.value, 'Ω') : part.on ? 'Closed' : 'Open'}</text>}
  </g>
}
export default function CircuitSimulator({ onBack }: { onBack: () => void }) {
  const [circuit, setCircuit] = useState<Circuit>(loadCircuit)
  const [selectedPart, setSelectedPart] = useState<string | null>(null)
  const [selectedWire, setSelectedWire] = useState<string | null>(null)
  const [placement, setPlacement] = useState<Kind | null>(null)
  const [wireStart, setWireStart] = useState<string | null>(null)
  const [dmmActive, setDmmActive] = useState(false)
  const [meterMode, setMeterMode] = useState<MeterMode>('voltage')
  const [meterFirstPin, setMeterFirstPin] = useState<string | null>(null)
  const [meterReading, setMeterReading] = useState('Select a measurement mode, then probe the circuit.')
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [error, setError] = useState('')
  const [drag, setDrag] = useState<{ id: string; dx: number; dy: number } | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const selected = circuit.parts.find((part) => part.id === selectedPart)
  const pinLookup = Object.fromEntries(circuit.parts.flatMap(pinsFor).map((pin) => [pin.id, pin]))
  useEffect(() => { try { localStorage.setItem('ozoo:circuit', JSON.stringify(circuit)) } catch {} }, [circuit])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setPlacement(null); setWireStart(null) }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedPart) {
        setCircuit((value) => ({ parts: value.parts.filter((part) => part.id !== selectedPart), wires: value.wires.filter((wire) => !wire.from.startsWith(selectedPart + ':') && !wire.to.startsWith(selectedPart + ':')) }))
        setSelectedPart(null); setSimulation(null)
      }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [selectedPart])
  const screenPoint = (event: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect()
    return rect ? { x: (event.clientX - rect.left) * W / rect.width, y: (event.clientY - rect.top) * H / rect.height } : { x: W / 2, y: H / 2 }
  }
  const addPartAt = (kind: Kind, x: number, y: number) => {
    const labels = { source: 'V', resistor: 'R', switch: 'S', ground: 'GND' }
    const value = kind === 'source' ? 5 : kind === 'resistor' ? 1000 : 0
    const label = kind === 'ground' ? 'GND' : labels[kind] + (circuit.parts.filter((part) => part.kind === kind).length + 1)
    const part: Part = { id: makeId(), kind, x: Math.max(64, Math.min(W - 64, x)), y: Math.max(90, Math.min(H - 62, y)), value, label, on: true }
    setCircuit((current) => ({ ...current, parts: [...current.parts, part] }))
    setSelectedPart(part.id); setSelectedWire(null); setSimulation(null); setPlacement(null); setDmmActive(false); setMeterFirstPin(null)
  }
  const handleCanvasPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.target !== event.currentTarget) return
    if (placement) {
      const point = screenPoint(event)
      addPartAt(placement, point.x, point.y)
      return
    }
    setSelectedPart(null)
    setSelectedWire(null)
  }
  const handlePartPointerDown = (event: ReactPointerEvent<SVGGElement>, part: Part) => {
    if (placement) return
    if (dmmActive) {
      setSelectedPart(part.id); setSelectedWire(null)
      try {
        const result = solveCircuit(circuit.parts, circuit.wires).readings.find((reading) => reading.id === part.id)
        if (meterMode === 'current') setMeterReading(result ? part.label + ' current: ' + fmt(result.current, 'A') : 'This component has no current reading.')
        else if (part.kind === 'resistor') setMeterReading(part.label + ' resistance: ' + fmt(part.value, 'Ω'))
        else if (part.kind === 'switch') setMeterReading(part.label + ' resistance: ' + (part.on ? '≈ 20 mΩ (closed)' : 'OL (open)'))
        else setMeterReading('Resistance mode: select a resistor or switch.')
      } catch (reason) { setMeterReading(reason instanceof Error ? reason.message : 'Run a valid circuit before measuring.') }
      return
    }
    const point = screenPoint(event)
    setSelectedPart(part.id); setSelectedWire(null)
    setDrag({ id: part.id, dx: point.x - part.x, dy: point.y - part.y })
    svgRef.current?.setPointerCapture(event.pointerId)
  }
  const handlePin = (pin: Pin) => {
    if (dmmActive && meterMode === 'voltage') {
      if (!meterFirstPin) { setMeterFirstPin(pin.id); setMeterReading('Probe A set. Select a second pin for Probe B.'); setError(''); return }
      if (meterFirstPin === pin.id) { setMeterReading('Choose a different pin for Probe B.'); return }
      try {
        const result = solveCircuit(circuit.parts, circuit.wires)
        const volts = (result.nodeVoltages[pin.id] ?? 0) - (result.nodeVoltages[meterFirstPin] ?? 0)
        setMeterReading('Voltage B − A: ' + fmt(volts, 'V'))
        setSimulation(result); setError('')
      } catch (reason) { setMeterReading(reason instanceof Error ? reason.message : 'Run a valid circuit before measuring.'); setError('') }
      setMeterFirstPin(null); return
    }
    setSelectedPart(null); setSelectedWire(null)
    if (!wireStart) { setWireStart(pin.id); setError('Choose another pin to finish the wire.'); return }
    if (wireStart !== pin.id) setCircuit((current) => ({ ...current, wires: [...current.wires, { id: makeId(), from: wireStart, to: pin.id }] }))
    setWireStart(null); setError(''); setSimulation(null)
  }
  const runSimulation = () => {
    setError('')
    try { setSimulation(solveCircuit(circuit.parts, circuit.wires)) }
    catch (reason) { setSimulation(null); setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const updateSelected = (change: Partial<Part>) => {
    if (!selectedPart) return
    setCircuit((current) => ({ ...current, parts: current.parts.map((part) => part.id === selectedPart ? { ...part, ...change } : part) }))
    setSimulation(null)
  }
  const newCircuit = () => { setCircuit({ parts: [], wires: [] }); setSimulation(null); setError(''); setSelectedPart(null); setSelectedWire(null); setWireStart(null) }
  const downloadSvg = () => {
    const svg = svgRef.current
    if (!svg) return
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = 'ozoo-circuit.svg'; link.click(); URL.revokeObjectURL(url)
  }
  return <main className="circuit-workspace">
    <header className="circuit-topbar">
      <button className="circuit-back" onClick={onBack}>← <span>Simulator</span></button>
      <div className="circuit-brand"><span className="circuit-brand-icon">Ω</span><div><strong>Circuit Studio</strong><small>Electronics simulator</small></div></div>
      <div className="circuit-top-actions"><button onClick={() => { setCircuit(exampleCircuit()); setSimulation(null); setError('') }}>Load example</button><button aria-label="Delete selected" title="Delete selected component or wire" disabled={!selectedPart && !selectedWire} onClick={() => { if (selectedWire) { setCircuit((value) => ({ ...value, wires: value.wires.filter((wire) => wire.id !== selectedWire) })); setSelectedWire(null) } else if (selectedPart) { setCircuit((value) => ({ parts: value.parts.filter((part) => part.id !== selectedPart), wires: value.wires.filter((wire) => !wire.from.startsWith(selectedPart + ':') && !wire.to.startsWith(selectedPart + ':')) })); setSelectedPart(null) } setSimulation(null) }}>Delete</button><button onClick={downloadSvg}>Export SVG</button><button className="circuit-run" onClick={runSimulation}>▶ Simulate</button></div>
    </header>
    <section className="circuit-heading"><div><p>SIMULATOR / ELECTRONICS</p><h1>Build a circuit. See it work.</h1><span>Place components, wire the pins, and solve a basic DC operating point.</span></div><span className="circuit-local"><i /> Saved on this device</span></section>
    <section className="circuit-layout">
      <aside className="circuit-palette">
        <div className="circuit-section-title">COMPONENTS</div>
        {(['source', 'resistor', 'switch', 'ground'] as Kind[]).map((kind) => <button key={kind} className={placement === kind ? 'active' : ''} onClick={() => { setPlacement(placement === kind ? null : kind); setWireStart(null); setError('Click the canvas to place ' + partNames[kind].toLowerCase() + '.') }}>
          <span className={'palette-symbol symbol-' + kind}>{kind === 'source' ? '＋' : kind === 'resistor' ? '▱' : kind === 'switch' ? '⌁' : '⏚'}</span><span>{partNames[kind]}</span><small>{kind === 'source' ? 'DC voltage' : kind === 'resistor' ? 'Resistance' : kind === 'switch' ? 'Open / close' : 'Reference node'}</small>
        </button>)}
        <div className="circuit-section-title">TOOLS</div>
        <button className={dmmActive ? 'active' : ''} onClick={() => { setDmmActive((active) => !active); setPlacement(null); setWireStart(null); setMeterFirstPin(null); setMeterReading('Voltage: select two pins · Current / resistance: select a component.') }}><span className="palette-symbol symbol-meter">DMM</span><span>Digital multimeter</span><small>Measure voltage, current, resistance</small></button>
        {dmmActive && <div className="circuit-meter-panel"><strong>Meter mode</strong><select aria-label="Multimeter mode" value={meterMode} onChange={(event) => { setMeterMode(event.target.value as MeterMode); setMeterFirstPin(null); setMeterReading('Choose where to probe the circuit.') }}><option value="voltage">Voltage (two pins)</option><option value="current">Current (component)</option><option value="resistance">Resistance (component)</option></select><output>{meterReading}</output></div>}
        <button className={wireStart ? 'active' : ''} onClick={() => { setPlacement(null); setError('Click any two pins to connect them with a wire.') }}><span className="palette-symbol">⌁</span><span>Wire</span><small>Click pin → click pin</small></button>
        <button onClick={newCircuit}><span className="palette-symbol">＋</span><span>New circuit</span><small>Clear this canvas</small></button>
        <div className="circuit-help"><strong>Quick start</strong><p>Select a component, then click the canvas. To wire it, click one terminal dot and then another.</p><p>Try the loaded 5 V source and 1 kΩ resistor. Click <b>Simulate</b> to read voltage and current.</p></div>
      </aside>
      <section className="circuit-main">
        <div className="circuit-canvas-head"><span><i /> Schematic</span><span>{placement ? 'Click to place · Esc to cancel' : wireStart ? 'Select the second pin' : 'Drag parts to arrange · click a pin to wire'}</span></div>
        <svg ref={svgRef} viewBox={'0 0 ' + W + ' ' + H} className={'circuit-canvas ' + (placement ? 'placing' : '')} onPointerDown={handleCanvasPointerDown} onPointerMove={(event) => {
          if (!drag) return
          const point = screenPoint(event)
          setCircuit((current) => ({ ...current, parts: current.parts.map((part) => part.id === drag.id ? { ...part, x: Math.max(55, Math.min(W - 55, point.x - drag.dx)), y: Math.max(70, Math.min(H - 45, point.y - drag.dy)) } : part) }))
        }} onPointerUp={(event) => { if (drag) { setDrag(null); setSimulation(null); try { svgRef.current?.releasePointerCapture(event.pointerId) } catch {} } }}>
          <defs><pattern id="circuit-grid" width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" /></pattern></defs>
          <rect width={W} height={H} fill="url(#circuit-grid)" />
          {circuit.wires.map((wire) => {
            const a = pinLookup[wire.from], b = pinLookup[wire.to]
            if (!a || !b) return null
            const middle = (a.x + b.x) / 2
            return <g key={wire.id} className={'circuit-wire ' + (selectedWire === wire.id ? 'selected' : '')} onClick={(event) => { event.stopPropagation(); setSelectedWire(wire.id); setSelectedPart(null) }}>
              <path d={'M' + a.x + ' ' + a.y + ' L' + middle + ' ' + a.y + ' L' + middle + ' ' + b.y + ' L' + b.x + ' ' + b.y} />
              <path className="wire-hit" d={'M' + a.x + ' ' + a.y + ' L' + middle + ' ' + a.y + ' L' + middle + ' ' + b.y + ' L' + b.x + ' ' + b.y} />
              {simulation && <text x={middle} y={(a.y + b.y) / 2 - 6} className="wire-voltage">{fmt(simulation.nodeVoltages[wire.from] ?? 0, 'V')}</text>}
            </g>
          })}
          {circuit.parts.map((part) => <PartSymbol key={part.id} part={part} selected={selectedPart === part.id} onPointerDown={handlePartPointerDown} onPin={handlePin} voltageMap={simulation?.nodeVoltages} />)}
        </svg>
        <div className="circuit-status" role="status">{error ? <span className="error">⚠ {error}</span> : simulation ? <span className="success">✓ {simulation.message}</span> : <span>Ready · 5 V example loaded · Double click a switch to toggle it in the inspector</span>}</div>
        {simulation && <div className="circuit-results"><div className="circuit-results-head"><strong>Operating point</strong><span>DC analysis</span></div><div className="circuit-results-table"><div className="circuit-result-row labels"><span>Part</span><span>Voltage</span><span>Current</span><span>Power</span></div>{simulation.readings.map((reading) => <div className="circuit-result-row" key={reading.id}><span>{reading.label}</span><span>{fmt(reading.voltage, 'V')}</span><span>{fmt(reading.current, 'A')}</span><span>{fmt(reading.power, 'W')}</span></div>)}</div></div>}
      </section>
      <aside className="circuit-inspector">
        <div className="circuit-section-title">INSPECTOR</div>
        {selected ? <>
          <div className="circuit-selected-kind"><span className={'palette-symbol symbol-' + selected.kind}>{selected.kind === 'source' ? '＋' : selected.kind === 'resistor' ? '▱' : selected.kind === 'switch' ? '⌁' : '⏚'}</span><span><b>{partNames[selected.kind]}</b><small>{selected.label}</small></span></div>
          {selected.kind !== 'ground' && <label className="circuit-field"><span>{selected.kind === 'source' ? 'Voltage' : selected.kind === 'resistor' ? 'Resistance' : 'Switch state'}</span>
            {selected.kind === 'switch' ? <button className={'switch-toggle ' + (selected.on ? 'on' : '')} onClick={() => updateSelected({ on: !selected.on })}>{selected.on ? 'Closed' : 'Open'}</button> : <span className="circuit-number"><input type="number" min={selected.kind === 'resistor' ? 0.001 : undefined} step={selected.kind === 'resistor' ? 100 : 0.1} value={selected.value} onChange={(event) => updateSelected({ value: Number(event.target.value) })} /><b>{selected.kind === 'source' ? 'V' : 'Ω'}</b></span>}
          </label>}
          <label className="circuit-field"><span>Reference name</span><input value={selected.label} onChange={(event) => updateSelected({ label: event.target.value })} /></label>
          <div className="circuit-rotation"><span>Orientation</span><button type="button" title="Rotate counterclockwise 90°" aria-label="Rotate counterclockwise" onClick={() => updateSelected({ rotation: ((selected.rotation ?? 0) + 270) % 360 })}>↶</button><output>{selected.rotation ?? 0}°</output><button type="button" title="Rotate clockwise 90°" aria-label="Rotate clockwise" onClick={() => updateSelected({ rotation: ((selected.rotation ?? 0) + 90) % 360 })}>↻</button></div>
          <button className="circuit-danger" onClick={() => { setCircuit((value) => ({ parts: value.parts.filter((part) => part.id !== selected.id), wires: value.wires.filter((wire) => !wire.from.startsWith(selected.id + ':') && !wire.to.startsWith(selected.id + ':')) })); setSelectedPart(null); setSimulation(null) }}>Delete component</button>
        </> : selectedWire ? <><p className="circuit-empty">Wire selected</p><button className="circuit-danger" onClick={() => { setCircuit((value) => ({ ...value, wires: value.wires.filter((wire) => wire.id !== selectedWire) })); setSelectedWire(null); setSimulation(null) }}>Delete wire</button></> : <p className="circuit-empty">Select a part or wire to inspect it. Components, values, and circuit files stay in this browser.</p>}
        <div className="circuit-library-note"><strong>Supported in this simulator</strong><p>DC voltage sources, resistors, switches, and ground. This solver handles resistive DC circuits; it does not model AC, capacitors, inductors, diodes, or transistor behavior yet.</p></div>
      </aside>
    </section>
  </main>
}

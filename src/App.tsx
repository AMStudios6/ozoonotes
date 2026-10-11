import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import './App.css'

type Tool = 'Brush' | 'Pencil' | 'Pen' | 'Marker' | 'Highlighter' | 'Select' | 'Shape' | 'Text' | 'Line' | 'Eraser'
type ShapeKind = 'Rectangle' | 'Ellipse' | 'Triangle' | 'Diamond' | 'Arrow'
type RulerUnit = 'mm' | 'cm' | 'in'
type PageSize = 'Infinite' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | 'Tabloid'
type Board = { name: string; pages: number; pageSize?: PageSize; infinite?: boolean; orientation?: 'portrait' | 'landscape'; pageBackground?: string }
type CloudUser = { id: number; username: string }
type BoardState = { pages: number; pageSize?: PageSize; infinite?: boolean; orientation: 'portrait' | 'landscape'; pageBackground: string; gridEnabled?: boolean; showScale?: boolean; pageStrokes: Stroke[][] }
type EncryptedBoardState = { encrypted: 'doomnotes-aes-gcm'; version: 1; kdf: 'PBKDF2-SHA-256'; iterations: number; salt: string; iv: string; ciphertext: string }
type CloudBoard = { id: number; name: string; folderId: number | null; state: BoardState | EncryptedBoardState; role?: string; ownerName?: string }
type CloudComment = { id: number; username: string; body: string; createdAt: string }
type LibraryItem = { id: string; name: string; strokes: Stroke[] }
type Point = { x: number; y: number }
type Stroke = { tool: 'Brush' | 'Pencil' | 'Pen' | 'Marker' | 'Highlighter' | 'Shape' | 'Line' | 'Text' | 'Image' | 'Eraser'; color: string; width: number; opacity: number; points: Point[]; text?: string; shapeKind?: ShapeKind; imageData?: string }
type MoveSession = { indices: number[]; start: Point; originals: Stroke[]; preview: Stroke[] }
const penColors = ['#18202a', '#e65353', '#ee8b33', '#48a879', '#378cdb', '#9762d5']
const pageColors = ['auto', 'white', '#19171e', '#fff9e8', '#e9f2ff', '#f3e9ff']
function resolvePageBackground(background: string, dark: boolean) {
  if (background === 'auto' || background === '#ffffff') return dark ? '#08060d' : '#ffffff'
  if (background === 'white') return '#ffffff'
  return background
}
function pageBackgroundSwatchStyle(background: string): React.CSSProperties {
  if (background === 'auto') return { background: 'linear-gradient(135deg, #08060d 50%, #fff 50%)' }
  return { backgroundColor: background === 'white' ? '#ffffff' : background }
}
function pageBackgroundLabel(background: string) {
  if (background === 'auto') return 'Page background follows theme'
  if (background === 'white') return 'Page background white'
  return 'Page background ' + background
}
function gridLineColor(dark: boolean) {
  return dark ? 'rgba(189, 139, 255, .48)' : 'rgba(130, 70, 193, .34)'
}
const inkTools: Tool[] = ['Brush', 'Pen', 'Pencil', 'Marker', 'Highlighter']
const drawingToolGroup: Tool[] = [...inkTools, 'Eraser']
const imageCache = new Map<string, HTMLImageElement>()
const pageDimensionsMm: Record<Exclude<PageSize, 'Infinite'>, [number, number]> = {
  A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297], A5: [148, 210],
  Letter: [216, 279], Legal: [216, 356], Tabloid: [279, 432],
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...init.headers } })
  const data = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`)
  return data
}

function isEncryptedBoardState(state: BoardState | EncryptedBoardState): state is EncryptedBoardState {
  return 'encrypted' in state && state.encrypted === 'doomnotes-aes-gcm' && state.version === 1
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return btoa(binary)
}

function base64ToBytes(encoded: string) {
  const binary = atob(encoded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

async function deriveBoardKey(passphrase: string, salt: Uint8Array) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: Uint8Array.from(salt).buffer, iterations: 310_000, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

async function encryptBoardState(state: BoardState, passphrase: string): Promise<EncryptedBoardState> {
  if (!crypto.subtle) throw new Error('Browser encryption requires a secure page (HTTPS or localhost).')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveBoardKey(passphrase, salt)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(state)))
  return { encrypted: 'doomnotes-aes-gcm', version: 1, kdf: 'PBKDF2-SHA-256', iterations: 310_000, salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) }
}

async function decryptBoardState(encrypted: EncryptedBoardState, passphrase: string): Promise<BoardState> {
  if (!crypto.subtle || encrypted.kdf !== 'PBKDF2-SHA-256' || encrypted.iterations !== 310_000) throw new Error('This encrypted board format is not supported by this browser.')
  try {
    const salt = base64ToBytes(encrypted.salt)
    const iv = base64ToBytes(encrypted.iv)
    const key = await deriveBoardKey(passphrase, salt)
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, base64ToBytes(encrypted.ciphertext))
    return JSON.parse(new TextDecoder().decode(plaintext)) as BoardState
  } catch {
    throw new Error('That passphrase did not unlock this board.')
  }
}

function pointToSegmentDistance(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared))
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy))
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)
  const abC = cross(a, b, c)
  const abD = cross(a, b, d)
  const cdA = cross(c, d, a)
  const cdB = cross(c, d, b)
  return abC * abD <= 0 && cdA * cdB <= 0
}

function shapeGeometry(kind: ShapeKind, first: Point, last: Point) {
  const left = Math.min(first.x, last.x)
  const right = Math.max(first.x, last.x)
  const top = Math.min(first.y, last.y)
  const bottom = Math.max(first.y, last.y)
  const centerX = (left + right) / 2
  const centerY = (top + bottom) / 2
  if (kind === 'Rectangle') return { points: [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }], closed: true }
  if (kind === 'Triangle') return { points: [{ x: centerX, y: top }, { x: right, y: bottom }, { x: left, y: bottom }], closed: true }
  if (kind === 'Diamond') return { points: [{ x: centerX, y: top }, { x: right, y: centerY }, { x: centerX, y: bottom }, { x: left, y: centerY }], closed: true }
  if (kind === 'Arrow') {
    const angle = Math.atan2(last.y - first.y, last.x - first.x)
    const head = 0.025
    const a = { x: last.x - head * Math.cos(angle - Math.PI / 6), y: last.y - head * Math.sin(angle - Math.PI / 6) }
    const b = { x: last.x - head * Math.cos(angle + Math.PI / 6), y: last.y - head * Math.sin(angle + Math.PI / 6) }
    return { points: [first, last, a, last, b], closed: false }
  }
  const rx = Math.abs(last.x - first.x) / 2
  const ry = Math.abs(last.y - first.y) / 2
  return { points: Array.from({ length: 48 }, (_, i) => { const angle = (i / 48) * Math.PI * 2; return { x: centerX + Math.cos(angle) * rx, y: centerY + Math.sin(angle) * ry } }), closed: true }
}

function rulerTicks(lengthMm: number, unit: RulerUnit) {
  const step = unit === 'mm' ? 10 : unit === 'cm' ? 10 : 12.7
  const values: { label: string; position: number }[] = []
  for (let mm = 0; mm <= lengthMm; mm += step) {
    const value = unit === 'mm' ? Math.round(mm) : unit === 'cm' ? mm / 10 : mm / 25.4
    const label = unit === 'in' ? Number(value.toFixed(1)).toString() : Number(value.toFixed(0)).toString()
    values.push({ label, position: mm / lengthMm * 100 })
  }
  return values
}

function getImage(data: string, onLoad: () => void) {
  let image = imageCache.get(data)
  if (!image) {
    image = new Image()
    imageCache.set(data, image)
    image.onload = onLoad
    image.src = data
  }
  return image
}

function strokeTouchesEraser(stroke: Stroke, eraser: Stroke, canvasWidth: number, canvasHeight: number) {
  const toCanvas = (point: Point) => ({ x: point.x * canvasWidth, y: point.y * canvasHeight })
  const strokePoints = stroke.points.map(toCanvas)
  const eraserPoints = eraser.points.map(toCanvas)
  const radius = eraser.width / 2 + stroke.width / 2
  const pathPoints = stroke.tool === 'Image' && strokePoints.length > 1
    ? [strokePoints[0], { x: strokePoints[1].x, y: strokePoints[0].y }, strokePoints[1], { x: strokePoints[0].x, y: strokePoints[1].y }, strokePoints[0]]
    : stroke.tool === 'Shape' && stroke.shapeKind && strokePoints.length > 1
      ? shapeGeometry(stroke.shapeKind, stroke.points[0], stroke.points[stroke.points.length - 1]).points.map(toCanvas)
      : strokePoints
  const strokeSegments = pathPoints.length > 1 ? pathPoints.slice(1).map((point, i) => [pathPoints[i], point] as const) : [[pathPoints[0], pathPoints[0]] as const]
  const eraserSegments = eraserPoints.length > 1 ? eraserPoints.slice(1).map((point, i) => [eraserPoints[i], point] as const) : [[eraserPoints[0], eraserPoints[0]] as const]
  return strokeSegments.some(([a, b]) => eraserSegments.some(([c, d]) =>
    segmentsIntersect(a, b, c, d) ||
    pointToSegmentDistance(a, c, d) <= radius || pointToSegmentDistance(b, c, d) <= radius ||
    pointToSegmentDistance(c, a, b) <= radius || pointToSegmentDistance(d, a, b) <= radius,
  ))
}

function hitTestObject(stroke: Stroke, point: Point, canvasWidth: number, canvasHeight: number) {
  const pointPx = { x: point.x * canvasWidth, y: point.y * canvasHeight }
  const points = stroke.points.map((item) => ({ x: item.x * canvasWidth, y: item.y * canvasHeight }))
  if (!points.length) return false
  if (stroke.tool === 'Text') {
    const textWidth = Math.max(32, (stroke.text?.length ?? 1) * stroke.width * 2.7)
    const textHeight = Math.max(26, stroke.width * 5)
    return pointPx.x >= points[0].x - 10 && pointPx.x <= points[0].x + textWidth + 10 && pointPx.y >= points[0].y - 10 && pointPx.y <= points[0].y + textHeight + 10
  }
  if (stroke.tool === 'Image' && points.length > 1) {
    return pointPx.x >= Math.min(points[0].x, points[1].x) && pointPx.x <= Math.max(points[0].x, points[1].x) && pointPx.y >= Math.min(points[0].y, points[1].y) && pointPx.y <= Math.max(points[0].y, points[1].y)
  }
  if (stroke.tool === 'Shape') {
    const a = points[0]
    const b = points[points.length - 1]
    const pad = 14 + stroke.width
    return pointPx.x >= Math.min(a.x, b.x) - pad && pointPx.x <= Math.max(a.x, b.x) + pad && pointPx.y >= Math.min(a.y, b.y) - pad && pointPx.y <= Math.max(a.y, b.y) + pad
  }
  const segments = points.length > 1 ? points.slice(1).map((item, index) => [points[index], item] as const) : [[points[0], points[0]] as const]
  return segments.some(([a, b]) => pointToSegmentDistance(pointPx, a, b) <= 15 + stroke.width / 2)
}

function renderDrawings(canvas: HTMLCanvasElement, drawings: Stroke[], selected: number[] = [], erasePreview: number[] = [], eraserPoint?: Point, eraserRadius = 0) {
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  for (const [drawingIndex, drawing] of drawings.entries()) {
    if (!drawing.points.length || drawing.tool === 'Eraser') continue
    const first = drawing.points[0]
    const last = drawing.points[drawing.points.length - 1]
    context.strokeStyle = drawing.color
    context.fillStyle = drawing.color
    context.lineWidth = drawing.width
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.globalAlpha = drawing.opacity / 100 * (drawing.tool === 'Pencil' ? 0.62 : drawing.tool === 'Marker' ? 0.82 : drawing.tool === 'Highlighter' ? 0.24 : 1)
    if (drawing.tool === 'Image' && drawing.imageData && drawing.points.length > 1) {
      const image = getImage(drawing.imageData, () => renderDrawings(canvas, drawings, selected, erasePreview, eraserPoint, eraserRadius))
      if (image.complete && image.naturalWidth) context.drawImage(image, first.x * canvas.width, first.y * canvas.height, (last.x - first.x) * canvas.width, (last.y - first.y) * canvas.height)
    } else if (drawing.tool === 'Text') {
      context.font = `${Math.max(16, drawing.width * 5)}px sans-serif`
      context.textBaseline = 'top'
      context.fillText(drawing.text ?? '', first.x * canvas.width, first.y * canvas.height)
    } else if (drawing.tool === 'Shape') {
      const geometry = shapeGeometry(drawing.shapeKind ?? 'Rectangle', first, last)
      context.beginPath()
      context.moveTo(geometry.points[0].x * canvas.width, geometry.points[0].y * canvas.height)
      for (const point of geometry.points.slice(1)) context.lineTo(point.x * canvas.width, point.y * canvas.height)
      if (geometry.closed) context.closePath()
      context.stroke()
    } else {
      context.beginPath()
      context.moveTo(first.x * canvas.width, first.y * canvas.height)
      if (drawing.tool === 'Line') {
        context.lineTo(last.x * canvas.width, last.y * canvas.height)
      } else {
        for (const point of drawing.points.slice(1)) context.lineTo(point.x * canvas.width, point.y * canvas.height)
      }
      context.stroke()
    }
    if (selected.includes(drawingIndex) || erasePreview.includes(drawingIndex)) {
      context.save()
      context.globalAlpha = 1
      context.strokeStyle = erasePreview.includes(drawingIndex) ? '#ff535d' : '#a977eb'
      context.fillStyle = erasePreview.includes(drawingIndex) ? 'rgba(255, 83, 93, .09)' : 'transparent'
      context.lineWidth = erasePreview.includes(drawingIndex) ? 3 : 2
      context.setLineDash([7, 4])
      const xs = drawing.points.map((point) => point.x * canvas.width)
      const ys = drawing.points.map((point) => point.y * canvas.height)
      const padding = drawing.tool === 'Text' ? Math.max(12, drawing.width * 2) : 10
      const textWidth = drawing.tool === 'Text' ? Math.max(32, (drawing.text?.length ?? 1) * drawing.width * 2.7) : 0
      const textHeight = drawing.tool === 'Text' ? Math.max(26, drawing.width * 5) : 0
      const boxX = Math.min(...xs) - padding
      const boxY = Math.min(...ys) - padding
      const boxWidth = Math.max(...xs) - Math.min(...xs) + textWidth + padding * 2
      const boxHeight = Math.max(...ys) - Math.min(...ys) + textHeight + padding * 2
      if (erasePreview.includes(drawingIndex)) context.fillRect(boxX, boxY, boxWidth, boxHeight)
      context.strokeRect(boxX, boxY, boxWidth, boxHeight)
      context.restore()
    }
  }
  if (eraserPoint && eraserRadius > 0) {
    context.save()
    context.globalAlpha = .22
    context.fillStyle = '#ff535d'
    context.strokeStyle = '#ff535d'
    context.lineWidth = 1.5
    context.setLineDash([4, 3])
    context.beginPath()
    context.arc(eraserPoint.x * canvas.width, eraserPoint.y * canvas.height, eraserRadius / 2, 0, Math.PI * 2)
    context.fill()
    context.globalAlpha = .95
    context.stroke()
    context.restore()
  }
  context.globalAlpha = 1
}


const graphColors = ['#378cdb', '#e65353', '#48a879', '#9762d5', '#ee8b33']

function evaluateGraphExpression(expression: string, x: number): number {
  const tokens = expression.match(/(?:\d*\.?\d+(?:e[+-]?\d+)?)|(?:[a-z]+)|[-()+*\/^]/gi)
  if (!tokens || tokens.join('').toLowerCase() !== expression.replace(/\s+/g, '').toLowerCase()) throw new Error('Use numbers, x, parentheses, and + − × ÷ ^ or sin/cos/tan/sqrt/abs/log/ln/exp.')
  let index = 0
  const peek = () => tokens[index]?.toLowerCase()
  const take = () => tokens[index++]
  const primary = (): number => {
    const token = take()
    if (token === undefined) throw new Error('The equation is incomplete.')
    if (token === '(') {
      const value = sum()
      if (take() !== ')') throw new Error('Check the parentheses in the equation.')
      return value
    }
    const value = Number(token)
    if (Number.isFinite(value) && token !== '') return value
    const name = token.toLowerCase()
    if (name === 'x') return x
    if (name === 'pi') return Math.PI
    if (name === 'e') return Math.E
    const functions: Record<string, (n: number) => number> = { sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt, abs: Math.abs, log: Math.log10, ln: Math.log, exp: Math.exp }
    const fn = functions[name]
    if (!fn) throw new Error(`Unknown value or function: ${token}`)
    let input: number
    if (peek() === '(') {
      take()
      input = sum()
      if (take() !== ')') throw new Error('Check the parentheses in the equation.')
    } else input = unary()
    return fn(input)
  }
  const power = (): number => { const left = primary(); return peek() === '^' ? (take(), left ** unary()) : left }
  const unary = (): number => peek() === '+' ? (take(), unary()) : peek() === '-' ? (take(), -unary()) : power()
  const product = (): number => { let value = unary(); while (peek() === '*' || peek() === '/') { const op = take(); const next = unary(); value = op === '*' ? value * next : value / next } return value }
  const sum = (): number => { let value = product(); while (peek() === '+' || peek() === '-') { const op = take(); const next = product(); value = op === '+' ? value + next : value - next } return value }
  const result = sum()
  if (index !== tokens.length) throw new Error('Check the equation format.')
  return result
}

function makeGraphSvg(options: { mode: 'equation' | 'points'; equation: string; points: string; xMin: number; xMax: number; yMin: number; yMax: number }) {
  const width = 900, height = 580
  const left = 72, right = 30, top = 34, bottom = 62
  const plotWidth = width - left - right, plotHeight = height - top - bottom
  const px = (x: number) => left + (x - options.xMin) / (options.xMax - options.xMin) * plotWidth
  const py = (y: number) => top + (options.yMax - y) / (options.yMax - options.yMin) * plotHeight
  const esc = (value: string) => value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!)
  let series: string[] = []
  if (options.mode === 'equation') {
    const expressions = options.equation.split(/\n|;/).map((line) => line.trim()).filter(Boolean)
    if (!expressions.length) throw new Error('Enter an equation such as y = x^2.')
    series = expressions.map((line, seriesIndex) => {
      const expression = line.replace(/^y\s*=\s*/i, '')
      let path = '', drawing = false
      for (let i = 0; i <= 500; i++) {
        const x = options.xMin + (options.xMax - options.xMin) * i / 500
        const y = evaluateGraphExpression(expression, x)
        const visible = Number.isFinite(y) && y >= options.yMin && y <= options.yMax
        if (!visible) { drawing = false; continue }
        path += `${drawing ? 'L' : 'M'}${px(x).toFixed(2)},${py(y).toFixed(2)} `
        drawing = true
      }
      if (!path) throw new Error('This equation has no points in the selected ranges.')
      return `<path d="${path}" fill="none" stroke="${graphColors[seriesIndex % graphColors.length]}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`
    })
  } else {
    const pairs = options.points.split(/[;\n]+/).map((pair) => pair.trim()).filter(Boolean).map((pair) => pair.split(/[\s,]+/).map(Number))
    if (!pairs.length || pairs.some((pair) => pair.length !== 2 || !pair.every(Number.isFinite))) throw new Error('Enter points like 1, 2; 2, 5; 3, 4.')
    const visible = pairs.filter(([x, y]) => x >= options.xMin && x <= options.xMax && y >= options.yMin && y <= options.yMax)
    if (!visible.length) throw new Error('No points are inside the selected ranges.')
    series = [
      `<polyline points="${visible.map(([x, y]) => `${px(x).toFixed(2)},${py(y).toFixed(2)}`).join(' ')}" fill="none" stroke="${graphColors[0]}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
      ...visible.map(([x, y]) => `<circle cx="${px(x)}" cy="${py(y)}" r="7" fill="${graphColors[0]}" stroke="#fff" stroke-width="2"/>`),
    ]
  }
  const grid: string[] = []
  for (let i = 0; i <= 5; i++) {
    const x = options.xMin + (options.xMax - options.xMin) * i / 5
    const y = options.yMin + (options.yMax - options.yMin) * i / 5
    const gx = px(x), gy = py(y)
    grid.push(`<line x1="${gx}" y1="${top}" x2="${gx}" y2="${height-bottom}" stroke="#e5e7eb"/><text x="${gx}" y="${height-bottom+24}" text-anchor="middle" fill="#667085" font-size="16">${esc(Number(x.toPrecision(3)).toString())}</text>`)
    grid.push(`<line x1="${left}" y1="${gy}" x2="${width-right}" y2="${gy}" stroke="#e5e7eb"/><text x="${left-12}" y="${gy+5}" text-anchor="end" fill="#667085" font-size="16">${esc(Number(y.toPrecision(3)).toString())}</text>`)
  }
  const xAxisY = options.yMin <= 0 && options.yMax >= 0 ? py(0) : height - bottom
  const yAxisX = options.xMin <= 0 && options.xMax >= 0 ? px(0) : left
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" rx="20" fill="#fff"/><text x="${width/2}" y="25" text-anchor="middle" fill="#18202a" font-family="Arial,sans-serif" font-size="18" font-weight="700">${options.mode === 'equation' ? esc(options.equation.split(/\n|;/)[0]) : 'Data points'}</text>${grid.join('')}<line x1="${left}" y1="${xAxisY}" x2="${width-right}" y2="${xAxisY}" stroke="#667085" stroke-width="2"/><line x1="${yAxisX}" y1="${top}" x2="${yAxisX}" y2="${height-bottom}" stroke="#667085" stroke-width="2"/>${series.join('')}<text x="${width-right}" y="${height-16}" text-anchor="end" fill="#667085" font-family="Arial,sans-serif" font-size="16">x</text><text x="20" y="${top}" fill="#667085" font-family="Arial,sans-serif" font-size="16">y</text></svg>`
}

const toolIcons: Record<Tool, string> = {
  Brush: '✎', Pencil: '✏', Pen: '✒', Marker: '▰', Highlighter: '▱', Select: '⌖', Shape: '▢', Text: 'T', Line: '╱', Eraser: '◩',
}

type SavedWorkspace = { names: string[]; activeBoard: number; page: number }
type RestoredWorkspace = {
  boards: Board[]
  activeBoard: number
  page: number
  pageSize: PageSize
  infinitePage: boolean
  orientation: 'portrait' | 'landscape'
  pageBackground: string
  gridEnabled: boolean
  showScale: boolean
  strokesByPage: Record<string, Stroke[]>
}
const openWorkspaceStorageKey = 'ozoo:open-workspace'

function readSavedWorkspace(): RestoredWorkspace {
  const empty: RestoredWorkspace = { boards: [], activeBoard: 0, page: 1, pageSize: 'A4', infinitePage: false, orientation: 'portrait', pageBackground: 'auto', gridEnabled: false, showScale: false, strokesByPage: {} }
  try {
    const savedWorkspace = JSON.parse(localStorage.getItem(openWorkspaceStorageKey) ?? 'null') as SavedWorkspace | null
    if (!savedWorkspace || !Array.isArray(savedWorkspace.names)) return empty

    const loaded = savedWorkspace.names.filter((name): name is string => typeof name === 'string').map((name) => {
      const raw = localStorage.getItem(`doomnotes:${name}`)
      if (!raw) return null
      const saved = JSON.parse(raw) as { name?: string; pages?: number; pageSize?: PageSize; infinite?: boolean; orientation?: 'portrait' | 'landscape'; pageBackground?: string; gridEnabled?: boolean; showScale?: boolean; pageStrokes?: Stroke[][] }
      if (typeof saved.name !== 'string' || typeof saved.pages !== 'number' || !Array.isArray(saved.pageStrokes)) return null
      return { board: { name: saved.name, pages: saved.pages, pageSize: saved.pageSize ?? 'A4', infinite: saved.infinite ?? false, orientation: saved.orientation ?? 'portrait', pageBackground: saved.pageBackground ?? 'auto' }, saved }
    }).filter((item): item is NonNullable<typeof item> => item !== null)

    if (!loaded.length) return empty
    const boards = loaded.map(({ board }) => board)
    const activeBoard = Math.max(0, Math.min(Number.isInteger(savedWorkspace.activeBoard) ? savedWorkspace.activeBoard : 0, boards.length - 1))
    const activeSaved = loaded[activeBoard].saved
    const strokesByPage = Object.fromEntries(loaded.flatMap(({ saved }, boardIndex) => (saved.pageStrokes ?? []).map((strokes, pageIndex) => [`${boardIndex}:${pageIndex + 1}`, strokes ?? []])))
    const activePage = Math.max(1, Math.min(Number.isInteger(savedWorkspace.page) ? savedWorkspace.page : 1, boards[activeBoard].pages))
    return {
      boards,
      activeBoard,
      page: activePage,
      pageSize: activeSaved.pageSize ?? 'A4',
      infinitePage: activeSaved.infinite ?? false,
      orientation: activeSaved.orientation ?? 'portrait',
      pageBackground: activeSaved.pageBackground ?? 'auto',
      gridEnabled: activeSaved.gridEnabled ?? false,
      showScale: activeSaved.showScale ?? false,
      strokesByPage,
    }
  } catch {
    return empty
  }
}

function App() {
  const localOnly = import.meta.env.VITE_LOCAL_ONLY === 'true'
  const [initialWorkspace] = useState(readSavedWorkspace)
  const [boards, setBoards] = useState<Board[]>(initialWorkspace.boards)
  const [nextFileNumber, setNextFileNumber] = useState(() => Math.max(0, ...initialWorkspace.boards.map(({ name }) => Number(name.match(/^File (\d+)$/)?.[1] ?? 0))) + 1)
  const [activeBoard, setActiveBoard] = useState(initialWorkspace.activeBoard)
  const [activeTool, setActiveTool] = useState<Tool>('Brush')
  const [drawingToolsOpen, setDrawingToolsOpen] = useState(false)
  const [activeColor, setActiveColor] = useState(penColors[0])
  const [showSettingsPanel, setShowSettingsPanel] = useState(true)
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [opacity, setOpacity] = useState(100)
  const [pageBackground, setPageBackground] = useState(initialWorkspace.pageBackground)
  const [pageSize, setPageSize] = useState<PageSize>(initialWorkspace.pageSize)
  const [infinitePage, setInfinitePage] = useState(initialWorkspace.infinitePage)
  const [showNewFileDialog, setShowNewFileDialog] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const [graphMode, setGraphMode] = useState<'equation' | 'points'>('equation')
  const [graphEquation, setGraphEquation] = useState('y = x^2')
  const [graphPoints, setGraphPoints] = useState('1, 2; 2, 5; 3, 4')
  const [graphRange, setGraphRange] = useState({ xMin: -10, xMax: 10, yMin: -10, yMax: 10 })
  const [graphError, setGraphError] = useState('')
  const [cloudUser, setCloudUser] = useState<CloudUser | null>(null)
  const [cloudBoards, setCloudBoards] = useState<CloudBoard[]>([])
  const cloudKeys = useRef<Record<number, string>>({})
  const [cloudFolders, setCloudFolders] = useState<{ id: number; name: string }[]>([])
  const [folderName, setFolderName] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [cloudBoardIds, setCloudBoardIds] = useState<Record<string, number>>(() => JSON.parse(localStorage.getItem('doomnotes:cloud-board-ids') ?? '{}') as Record<string, number>)
  const [accountOpen, setAccountOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authUsername, setAuthUsername] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [cloudMessage, setCloudMessage] = useState('')
  const [cloudSaveOpen, setCloudSaveOpen] = useState(false)
  const [cloudSaveEncrypted, setCloudSaveEncrypted] = useState(false)
  const [cloudSavePassphrase, setCloudSavePassphrase] = useState('')
  const [cloudSaveConfirmation, setCloudSaveConfirmation] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUsername, setShareUsername] = useState('')
  const [shareRole, setShareRole] = useState<'view' | 'edit'>('view')
  const [shareList, setShareList] = useState<{ username: string; role: 'view' | 'edit' }[]>([])
  const [shareTeams, setShareTeams] = useState<{ id: number; name: string; role: 'view' | 'edit' }[]>([])
  const [shareTeamId, setShareTeamId] = useState<number | null>(null)
  const [shareTeamRole, setShareTeamRole] = useState<'view' | 'edit'>('view')
  const [publicLink, setPublicLink] = useState('')
  const [commentOpen, setCommentOpen] = useState(false)
  const [comments, setComments] = useState<CloudComment[]>([])
  const [commentText, setCommentText] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamUsername, setTeamUsername] = useState('')
  const [teams, setTeams] = useState<{ id: number; name: string }[]>([])
  const [activeTeam, setActiveTeam] = useState<number | null>(null)
  const [teamMembers, setTeamMembers] = useState<{ username: string; role: string }[]>([])
  const [teamOpen, setTeamOpen] = useState(false)
  const sharedToken = window.location.pathname.match(/^\/shared\/([a-f0-9]+)\/?$/)?.[1]
  const [sharedBoard, setSharedBoard] = useState<CloudBoard | null>(null)
  const [draftName, setDraftName] = useState('')
  const [draftSize, setDraftSize] = useState<PageSize>('A4')
  const [draftOrientation, setDraftOrientation] = useState<'portrait' | 'landscape'>('portrait')
  const [draftBackground, setDraftBackground] = useState('auto')
  const [gridEnabled, setGridEnabled] = useState(initialWorkspace.gridEnabled)
  const [showScale, setShowScale] = useState(initialWorkspace.showScale)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [libraryName, setLibraryName] = useState('')
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>(() => {
    try {
      const items = JSON.parse(localStorage.getItem('doomnotes:library') ?? '[]') as unknown
      return Array.isArray(items) ? items.filter((item): item is LibraryItem => Boolean(item && typeof item.id === 'string' && typeof item.name === 'string' && Array.isArray(item.strokes))) : []
    } catch { return [] }
  })
  const [rulerUnit, setRulerUnit] = useState<RulerUnit>('cm')
  const [shapeKind, setShapeKind] = useState<ShapeKind>('Rectangle')
  const [selectedIndices, setSelectedIndices] = useState<number[]>([])
  const [eraserHover, setEraserHover] = useState<Point | null>(null)
  const [erasePreviewIndices, setErasePreviewIndices] = useState<number[]>([])
  const [textEditor, setTextEditor] = useState<{ point: Point; value: string } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [saveNotice, setSaveNotice] = useState('')
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [recentFiles, setRecentFiles] = useState<string[]>(() => Object.keys(localStorage).filter((key) => key.startsWith('doomnotes:')).map((key) => key.slice('doomnotes:'.length)))
  const [page, setPage] = useState(initialWorkspace.page)
  const [zoom, setZoom] = useState(100)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(initialWorkspace.orientation)
  const [dark, setDark] = useState(true)
  const [strokesByPage, setStrokesByPage] = useState<Record<string, Stroke[]>>(initialWorkspace.strokesByPage)
  const strokesByPageRef = useRef<Record<string, Stroke[]>>({})
  const historyByPage = useRef<Record<string, { past: Stroke[][]; future: Stroke[][] }>>({})
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const brushToolRef = useRef<HTMLButtonElement>(null)
  const settingsToggleRef = useRef<HTMLButtonElement>(null)
  const settingsPanelRef = useRef<HTMLElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)
  const lastTextPoint = useRef<Point>({ x: 0.3, y: 0.3 })
  const activeStroke = useRef<Stroke | null>(null)
  const activeMove = useRef<MoveSession | null>(null)
  const cancelTextRef = useRef(false)
  const pageKey = `${activeBoard}:${page}`
  const strokes = strokesByPage[pageKey] ?? []

  const refreshHistoryState = (key: string) => {
    const history = historyByPage.current[key] ?? { past: [], future: [] }
    setHistoryState({ canUndo: history.past.length > 0, canRedo: history.future.length > 0 })
  }
  const editCurrentPage = (update: (current: Stroke[]) => Stroke[]) => {
    const before = strokesByPageRef.current[pageKey] ?? []
    const after = update(before)
    if (after === before) return
    const history = historyByPage.current[pageKey] ?? { past: [], future: [] }
    history.past.push(before)
    if (history.past.length > 100) history.past.shift()
    history.future = []
    historyByPage.current[pageKey] = history
    const next = { ...strokesByPageRef.current, [pageKey]: after }
    strokesByPageRef.current = next
    setStrokesByPage(next)
    refreshHistoryState(pageKey)
  }
  const undo = () => {
    const history = historyByPage.current[pageKey]
    if (!history?.past.length) return
    const current = strokesByPageRef.current[pageKey] ?? []
    const previous = history.past.pop()!
    history.future.push(current)
    const next = { ...strokesByPageRef.current, [pageKey]: previous }
    strokesByPageRef.current = next
    setStrokesByPage(next)
    setSelectedIndices([])
    refreshHistoryState(pageKey)
  }
  const redo = () => {
    const history = historyByPage.current[pageKey]
    if (!history?.future.length) return
    const current = strokesByPageRef.current[pageKey] ?? []
    const nextSnapshot = history.future.pop()!
    history.past.push(current)
    const next = { ...strokesByPageRef.current, [pageKey]: nextSnapshot }
    strokesByPageRef.current = next
    setStrokesByPage(next)
    setSelectedIndices([])
    refreshHistoryState(pageKey)
  }
  const changeSelection = (patch: Partial<Stroke>) => {
    if (!selectedIndices.length) return
    const selected = new Set(selectedIndices)
    editCurrentPage((current) => current.map((stroke, index) => selected.has(index) ? { ...stroke, ...patch } : stroke))
  }
  const deleteSelection = () => {
    if (!selectedIndices.length) return
    const removed = new Set(selectedIndices)
    editCurrentPage((current) => current.filter((_, index) => !removed.has(index)))
    setSelectedIndices([])
  }
  const duplicateSelection = () => {
    if (!selectedIndices.length) return
    const selected = selectedIndices.map((index) => strokes[index]).filter((stroke): stroke is Stroke => Boolean(stroke))
    const copies = selected.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ x: Math.min(0.98, point.x + 0.025), y: Math.min(0.98, point.y + 0.025) })) }))
    editCurrentPage((current) => [...current, ...copies])
    setSelectedIndices(copies.map((_, index) => strokes.length + index))
  }
  const moveSelectionLayer = (direction: 'front' | 'back') => {
    if (!selectedIndices.length) return
    const selected = new Set(selectedIndices)
    editCurrentPage((current) => {
      const picked = current.filter((_, index) => selected.has(index))
      const rest = current.filter((_, index) => !selected.has(index))
      return direction === 'front' ? [...rest, ...picked] : [...picked, ...rest]
    })
    const start = direction === 'front' ? strokes.length - selectedIndices.length : 0
    setSelectedIndices(Array.from({ length: selectedIndices.length }, (_, index) => start + index))
  }
  const saveSelectionToLibrary = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const name = libraryName.trim()
    const selected = selectedIndices.map((index) => strokes[index]).filter((stroke): stroke is Stroke => Boolean(stroke))
    if (!name || !selected.length) return
    const item: LibraryItem = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name, strokes: selected.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) })) }
    const updated = [item, ...libraryItems]
    setLibraryItems(updated)
    localStorage.setItem('doomnotes:library', JSON.stringify(updated))
    setLibraryName('')
  }
  const insertLibraryItem = (item: LibraryItem) => {
    const points = item.strokes.flatMap((stroke) => stroke.points)
    if (!points.length) return
    const minX = Math.min(...points.map((point) => point.x))
    const maxX = Math.max(...points.map((point) => point.x))
    const minY = Math.min(...points.map((point) => point.y))
    const maxY = Math.max(...points.map((point) => point.y))
    const offsetX = Math.max(-minX, Math.min(1 - maxX, .5 - (minX + maxX) / 2))
    const offsetY = Math.max(-minY, Math.min(1 - maxY, .5 - (minY + maxY) / 2))
    const added = item.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ x: point.x + offsetX, y: point.y + offsetY })) }))
    const firstIndex = strokes.length
    editCurrentPage((current) => [...current, ...added])
    setSelectedIndices(added.map((_, index) => firstIndex + index))
    setActiveTool('Select')
    setLibraryOpen(false)
  }
  const deleteLibraryItem = (id: string) => {
    const updated = libraryItems.filter((item) => item.id !== id)
    setLibraryItems(updated)
    localStorage.setItem('doomnotes:library', JSON.stringify(updated))
  }

  useEffect(() => {
    if (localOnly) return
    apiRequest<{ user: CloudUser | null }>('/api/me').then(({ user }) => {
      setCloudUser(user)
      if (user) void refreshCloudBoards()
    }).catch(() => undefined)
  }, [localOnly])

  useEffect(() => {
    if (!inkTools.includes(activeTool)) setShowSettingsPanel(false)
  }, [activeTool])

  useEffect(() => {
    if (!showSettingsPanel) return
    const dismissBrushColors = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (!settingsPanelRef.current?.contains(target) && !settingsToggleRef.current?.contains(target)) {
        setShowSettingsPanel(false)
      }
    }
    const dismissBrushColorsOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowSettingsPanel(false)
    }
    document.addEventListener('pointerdown', dismissBrushColors)
    document.addEventListener('keydown', dismissBrushColorsOnEscape)
    return () => {
      document.removeEventListener('pointerdown', dismissBrushColors)
      document.removeEventListener('keydown', dismissBrushColorsOnEscape)
    }
  }, [showSettingsPanel])

  useEffect(() => {
    if (!sharedToken) return
    apiRequest<{ board: CloudBoard }>(`/api/public/${sharedToken}`).then(async ({ board }) => {
      if (isEncryptedBoardState(board.state)) {
        const passphrase = window.prompt(`Enter the encryption passphrase for “${board.name}”. Ask the board owner for it if you do not have it.`)
        if (!passphrase) { setCloudMessage('This board stays encrypted until you enter its passphrase.'); return }
        board.state = await decryptBoardState(board.state, passphrase)
      }
      setSharedBoard(board)
    }).catch((error) => setCloudMessage(error instanceof Error ? error.message : 'This shared board is unavailable.'))
  }, [sharedToken])

  useEffect(() => {
    const canvas = canvasRef.current
    if (sharedBoard && canvas && !isEncryptedBoardState(sharedBoard.state)) renderDrawings(canvas, sharedBoard.state.pageStrokes[0] ?? [])
  }, [sharedBoard])

  const refreshCloudBoards = async () => {
    try {
      const [{ boards: remote }, { folders: remoteFolders }] = await Promise.all([apiRequest<{ boards: CloudBoard[] }>('/api/boards'), apiRequest<{ folders: { id: number; name: string }[] }>('/api/folders')])
      setCloudBoards(remote)
      setCloudFolders(remoteFolders)
      const ids = Object.fromEntries(remote.map((item) => [item.name, item.id]))
      setCloudBoardIds(ids)
      localStorage.setItem('doomnotes:cloud-board-ids', JSON.stringify(ids))
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Could not load cloud boards.') }
  }

  const submitAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const { user } = await apiRequest<{ user: CloudUser }>(`/api/auth/${authMode === 'register' ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify({ username: authUsername, password: authPassword }) })
      setCloudUser(user)
      setCloudBoardIds({})
      setSelectedFolderId(null)
      localStorage.removeItem('doomnotes:cloud-board-ids')
      setCloudMessage(`Signed in as ${user.username}`)
      setAccountOpen(false)
      setAuthPassword('')
      await refreshCloudBoards()
      const { teams: availableTeams } = await apiRequest<{ teams: { id: number; name: string }[] }>('/api/teams')
      setTeams(availableTeams)
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Could not sign in.') }
  }

  const saveToCloud = async (passphrase?: string) => {
    if (!cloudUser) { setAccountOpen(true); setCloudMessage('Sign in or create an account to save this board to your server.'); return }
    const currentBoard = boards[activeBoard]
    const state = { pages: currentBoard.pages, pageSize, infinite: infinitePage, orientation, pageBackground, gridEnabled, showScale, pageStrokes: Array.from({ length: currentBoard.pages }, (_, index) => strokesByPage[`${activeBoard}:${index + 1}`] ?? []) }
    const existingId = cloudBoardIds[currentBoard.name]
    try {
      const cloudId = existingId
      const currentRemote = cloudId ? cloudBoards.find((board) => board.id === cloudId) : undefined
      const existingIsEncrypted = currentRemote ? isEncryptedBoardState(currentRemote.state) : false
      const encryptionKey = passphrase || (cloudId ? cloudKeys.current[cloudId] : undefined)
      if (existingIsEncrypted && !encryptionKey) throw new Error('This board is encrypted. Enter its passphrase before saving changes.')
      if (passphrase && passphrase.length < 12) throw new Error('Use an encryption passphrase with at least 12 characters.')
      const savedState = encryptionKey ? await encryptBoardState(state, encryptionKey) : state
      const result = existingId
        ? await apiRequest<{ board: CloudBoard }>(`/api/boards/${existingId}`, { method: 'PUT', body: JSON.stringify({ name: currentBoard.name, folderId: selectedFolderId, state: savedState }) })
        : await apiRequest<{ board: CloudBoard }>('/api/boards', { method: 'POST', body: JSON.stringify({ name: currentBoard.name, folderId: selectedFolderId, state: savedState }) })
      const nextIds = { ...cloudBoardIds, [currentBoard.name]: result.board.id }
      if (encryptionKey) cloudKeys.current[result.board.id] = encryptionKey
      setCloudBoardIds(nextIds)
      localStorage.setItem('doomnotes:cloud-board-ids', JSON.stringify(nextIds))
      setCloudMessage('Saved to your OzooNotes server.')
      setCloudSaveOpen(false)
      setCloudSavePassphrase('')
      setCloudSaveConfirmation('')
      await refreshCloudBoards()
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Cloud save failed.') }
  }

  const loadCloudBoard = async (remote: CloudBoard) => {
    const newIndex = boards.length
    let state: BoardState
    if (isEncryptedBoardState(remote.state)) {
      const passphrase = cloudKeys.current[remote.id] ?? window.prompt(`Enter the encryption passphrase for “${remote.name}”. Ask the owner if you do not have it.`)
      if (!passphrase) return
      try { state = await decryptBoardState(remote.state, passphrase); cloudKeys.current[remote.id] = passphrase }
      catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Could not unlock this board.'); return }
    } else state = remote.state
    setBoards((current) => [...current, { name: remote.name, pages: state.pages, pageSize: state.pageSize ?? 'A4', infinite: state.infinite ?? false, orientation: state.orientation, pageBackground: state.pageBackground }])
    setActiveBoard(newIndex)
    setPage(1)
    setPageSize(state.pageSize ?? 'A4')
    setInfinitePage(state.infinite ?? false)
    setOrientation(state.orientation)
    setPageBackground(state.pageBackground)
    setGridEnabled(state.gridEnabled ?? false)
    setShowScale(state.showScale ?? false)
    setStrokesByPage((current) => ({ ...current, ...Object.fromEntries(state.pageStrokes.map((items, index) => [`${newIndex}:${index + 1}`, items])) }))
    const ids = { ...cloudBoardIds, [remote.name]: remote.id }
    setCloudBoardIds(ids)
    localStorage.setItem('doomnotes:cloud-board-ids', JSON.stringify(ids))
    setSelectedFolderId(remote.folderId)
  }

  const openCloudSaveDialog = () => {
    if (!cloudUser) { setAccountOpen(true); return }
    const id = cloudBoardIds[boards[activeBoard]?.name]
    const remote = cloudBoards.find((board) => board.id === id)
    const alreadyEncrypted = Boolean(remote && isEncryptedBoardState(remote.state))
    setCloudSaveEncrypted(alreadyEncrypted)
    setCloudSavePassphrase(id ? cloudKeys.current[id] ?? '' : '')
    setCloudSaveConfirmation('')
    setCloudSaveOpen(true)
  }

  const submitCloudSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const id = cloudBoardIds[boards[activeBoard]?.name]
    const remote = cloudBoards.find((board) => board.id === id)
    const alreadyEncrypted = Boolean(remote && isEncryptedBoardState(remote.state))
    if (cloudSaveEncrypted && cloudSavePassphrase.length < 12) { setCloudMessage('Use an encryption passphrase with at least 12 characters.'); return }
    if (cloudSaveEncrypted && !alreadyEncrypted && cloudSavePassphrase !== cloudSaveConfirmation) { setCloudMessage('The encryption passphrases do not match.'); return }
    setCloudMessage('')
    void saveToCloud(cloudSaveEncrypted ? cloudSavePassphrase : undefined)
  }

  const openShareManager = async () => {
    if (!cloudUser) { setAccountOpen(true); return }
    const id = cloudBoardIds[boards[activeBoard].name]
    if (!id) { setCloudMessage('Save this file to your server first.'); return }
    try {
      const [{ access }, { teams: grantedTeams }] = await Promise.all([apiRequest<{ access: { username: string; role: 'view' | 'edit' }[] }>(`/api/boards/${id}/share`), apiRequest<{ teams: { id: number; name: string; role: 'view' | 'edit' }[] }>(`/api/boards/${id}/teams`)])
      setShareList(access)
      setShareTeams(grantedTeams)
      setShareOpen(true)
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Could not load access settings.') }
  }

  const inviteToBoard = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const id = cloudBoardIds[boards[activeBoard].name]
    if (!id) return
    try {
      await apiRequest(`/api/boards/${id}/share`, { method: 'POST', body: JSON.stringify({ username: shareUsername, role: shareRole }) })
      setShareUsername('')
      const { access } = await apiRequest<{ access: { username: string; role: 'view' | 'edit' }[] }>(`/api/boards/${id}/share`)
      setShareList(access)
      setCloudMessage('Access updated.')
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Could not share board.') }
  }

  const grantTeamBoardAccess = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const id = cloudBoardIds[boards[activeBoard].name]
    if (!id || !shareTeamId) return
    try {
      await apiRequest(`/api/boards/${id}/teams`, { method: 'POST', body: JSON.stringify({ teamId: shareTeamId, role: shareTeamRole }) })
      const { teams: grantedTeams } = await apiRequest<{ teams: { id: number; name: string; role: 'view' | 'edit' }[] }>(`/api/boards/${id}/teams`)
      setShareTeams(grantedTeams)
      setCloudMessage('Team access updated.')
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Could not grant team access.') }
  }

  const createPublicLink = async () => {
    const id = cloudBoardIds[boards[activeBoard].name]
    if (!id) return
    try {
      const { url } = await apiRequest<{ url: string }>(`/api/boards/${id}/public-link`, { method: 'POST', body: '{}' })
      const fullUrl = `${window.location.origin}${url}`
      setPublicLink(fullUrl)
      await navigator.clipboard?.writeText(fullUrl)
      setCloudMessage('Read-only link created and copied.')
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Could not create link.') }
  }

  const loadComments = async (id: number) => {
    const { comments: remoteComments } = await apiRequest<{ comments: CloudComment[] }>(`/api/boards/${id}/comments`)
    setComments(remoteComments)
  }

  const addComment = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const id = cloudBoardIds[boards[activeBoard].name]
    if (!id) return
    try {
      await apiRequest(`/api/boards/${id}/comments`, { method: 'POST', body: JSON.stringify({ body: commentText }) })
      setCommentText('')
      await loadComments(id)
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Could not post comment.') }
  }

  const createTeam = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await apiRequest('/api/teams', { method: 'POST', body: JSON.stringify({ name: teamName }) })
      setTeamName('')
      const { teams: updated } = await apiRequest<{ teams: { id: number; name: string }[] }>('/api/teams')
      setTeams(updated)
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Could not create team.') }
  }

  const createCloudFolder = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      const folder = await apiRequest<{ id: number; name: string }>('/api/folders', { method: 'POST', body: JSON.stringify({ name: folderName }) })
      setCloudFolders((current) => [...current, folder].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedFolderId(folder.id)
      setFolderName('')
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Could not create folder.') }
  }

  const addTeamMember = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeTeam) return
    try {
      await apiRequest(`/api/teams/${activeTeam}/members`, { method: 'POST', body: JSON.stringify({ username: teamUsername }) })
      setTeamUsername('')
      const { members } = await apiRequest<{ members: { username: string; role: string }[] }>(`/api/teams/${activeTeam}/members`)
      setTeamMembers(members)
      setCloudMessage('Team member added.')
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Could not add team member.') }
  }

  const logout = async () => {
    try { await apiRequest('/api/auth/logout', { method: 'POST', body: '{}' }) } catch { /* server may be offline */ }
    setCloudUser(null)
    setCloudBoards([])
    setCloudBoardIds({})
    setCloudFolders([])
    setSelectedFolderId(null)
    localStorage.removeItem('doomnotes:cloud-board-ids')
    setAccountOpen(false)
    setCloudMessage('Signed out.')
  }

  useEffect(() => {
    if (!cloudUser) return
    const id = cloudBoardIds[boards[activeBoard]?.name]
    if (!id) return
    const stream = new EventSource(`/api/boards/${id}/events`)
    stream.addEventListener('board-updated', () => {
      void apiRequest<{ board: CloudBoard }>(`/api/boards/${id}`).then(async ({ board: remote }) => {
        const localIndex = boards.findIndex((item) => cloudBoardIds[item.name] === id)
        if (localIndex < 0) return
        let remoteState: BoardState
        if (isEncryptedBoardState(remote.state)) {
          const key = cloudKeys.current[id]
          if (!key) return
          remoteState = await decryptBoardState(remote.state, key)
        } else remoteState = remote.state
        setBoards((current) => current.map((item, index) => index === localIndex ? { ...item, pages: remoteState.pages, pageSize: remoteState.pageSize ?? 'A4', infinite: remoteState.infinite ?? false, orientation: remoteState.orientation, pageBackground: remoteState.pageBackground } : item))
        setStrokesByPage((current) => ({ ...current, ...Object.fromEntries(remoteState.pageStrokes.map((items, index) => [`${localIndex}:${index + 1}`, items])) }))
        if (localIndex === activeBoard) {
          setPageSize(remoteState.pageSize ?? 'A4'); setInfinitePage(remoteState.infinite ?? false); setOrientation(remoteState.orientation); setPageBackground(remoteState.pageBackground); setGridEnabled(remoteState.gridEnabled ?? false); setShowScale(remoteState.showScale ?? false)
        }
      }).catch(() => undefined)
    })
    stream.addEventListener('comment-added', () => { if (commentOpen) void loadComments(id).catch(() => undefined) })
    if (commentOpen) void loadComments(id).catch(() => undefined)
    return () => stream.close()
  }, [cloudUser, cloudBoardIds, activeBoard, boards, commentOpen])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) renderDrawings(canvas, strokes, selectedIndices, activeTool === 'Eraser' ? erasePreviewIndices : [], activeTool === 'Eraser' ? eraserHover ?? undefined : undefined, activeTool === 'Eraser' ? 44 : 0)
  }, [strokes, orientation, selectedIndices, erasePreviewIndices, eraserHover, activeTool])

  useEffect(() => { strokesByPageRef.current = strokesByPage }, [strokesByPage])

  useEffect(() => { setSelectedIndices([]); refreshHistoryState(pageKey) }, [pageKey])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.key !== 'Delete' && event.key !== 'Backspace') || !selectedIndices.length) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      event.preventDefault()
      const removed = new Set(selectedIndices)
      editCurrentPage((current) => current.filter((_, index) => !removed.has(index)))
      setSelectedIndices([])
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIndices, pageKey])

  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handleHistoryShortcut)
    return () => window.removeEventListener('keydown', handleHistoryShortcut)
  }, [pageKey])

  const commitText = () => {
    const editor = textEditor
    if (editor?.value.trim()) {
      const textItem: Stroke = { tool: 'Text', color: activeColor, width: strokeWidth, opacity, points: [editor.point], text: editor.value.trim() }
      editCurrentPage((current) => [...current, textItem])
    }
    setTextEditor(null)
  }

  const insertImageBlob = (blob: Blob, point = lastTextPoint.current) => {
    if (!blob.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      const imageData = String(reader.result ?? '')
      const image = new Image()
      image.onload = () => {
        const aspect = image.naturalWidth / image.naturalHeight || 1
        let width = 0.42
        let height = width / aspect
        if (height > 0.42) { height = 0.42; width = height * aspect }
        const x = Math.max(0, Math.min(1 - width, point.x))
        const y = Math.max(0, Math.min(1 - height, point.y))
        const imageItem: Stroke = { tool: 'Image', color: '#ffffff', width: 1, opacity: 100, points: [{ x, y }, { x: x + width, y: y + height }], imageData }
        imageCache.set(imageData, image)
        editCurrentPage((current) => [...current, imageItem])
      }
      image.src = imageData
    }
    reader.readAsDataURL(blob)
  }

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const imageFile = Array.from(event.clipboardData?.items ?? []).find((item) => item.type.startsWith('image/'))?.getAsFile()
      if (!imageFile) return
      event.preventDefault()
      insertImageBlob(imageFile)
    }
    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [pageKey])

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height }
  }
  const startStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    setDrawingToolsOpen(false)
    const point = pointFromEvent(event)
    const hardwareEraser = event.pointerType === 'pen' && (event.button === 5 || (event.buttons & 32) === 32)
    if (!hardwareEraser && activeTool === 'Text') {
      lastTextPoint.current = point
      cancelTextRef.current = false
      setTextEditor({ point, value: '' })
      return
    }
    if (!hardwareEraser && activeTool === 'Select') {
      const canvas = event.currentTarget
      const hit = strokes.map((stroke, strokeIndex) => ({ stroke, strokeIndex })).reverse().find(({ stroke }) => hitTestObject(stroke, point, canvas.width, canvas.height))?.strokeIndex
      if (hit === undefined) { if (!event.shiftKey) setSelectedIndices([]); return }
      const next = event.shiftKey ? (selectedIndices.includes(hit) ? selectedIndices.filter((index) => index !== hit) : [...selectedIndices, hit]) : (selectedIndices.includes(hit) ? selectedIndices : [hit])
      setSelectedIndices(next)
      if (!next.includes(hit)) return
      event.currentTarget.setPointerCapture(event.pointerId)
      const originals = next.map((index) => strokes[index])
      activeMove.current = { indices: next, start: point, originals, preview: originals }
      return
    }
    const strokeTool = hardwareEraser ? 'Eraser' : activeTool
    if (strokeTool !== 'Brush' && strokeTool !== 'Pencil' && strokeTool !== 'Pen' && strokeTool !== 'Marker' && strokeTool !== 'Highlighter' && strokeTool !== 'Shape' && strokeTool !== 'Line' && strokeTool !== 'Eraser') return
    event.currentTarget.setPointerCapture(event.pointerId)
    const stroke: Stroke = {
      tool: strokeTool,
      color: activeColor,
      width: strokeTool === 'Eraser' ? 44 : strokeWidth * (strokeTool === 'Brush' ? 2.5 : strokeTool === 'Pencil' ? 0.68 : strokeTool === 'Marker' ? 1.8 : strokeTool === 'Highlighter' ? 3 : 1),
      opacity,
      points: [point],
      ...(strokeTool === 'Shape' ? { shapeKind } : {}),
    }
    activeStroke.current = stroke
    if (strokeTool !== 'Eraser') renderDrawings(event.currentTarget, [...strokes, stroke], selectedIndices)
    else {
      const candidates = strokes.map((item, index) => strokeTouchesEraser(item, stroke, event.currentTarget.width, event.currentTarget.height) ? index : -1).filter((index) => index >= 0)
      setEraserHover(point)
      setErasePreviewIndices(candidates)
      renderDrawings(event.currentTarget, strokes, selectedIndices, candidates, point, stroke.width)
    }
  }
  const continueStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = pointFromEvent(event)
    if (activeMove.current) {
      const move = activeMove.current
      const allPoints = move.originals.flatMap((stroke) => stroke.points)
      const xs = allPoints.map((item) => item.x)
      const ys = allPoints.map((item) => item.y)
      const dx = Math.max(-Math.min(...xs), Math.min(1 - Math.max(...xs), point.x - move.start.x))
      const dy = Math.max(-Math.min(...ys), Math.min(1 - Math.max(...ys), point.y - move.start.y))
      move.preview = move.originals.map((original) => ({ ...original, points: original.points.map((item) => ({ x: item.x + dx, y: item.y + dy })) }))
      const updated = [...strokes]
      move.indices.forEach((index, offset) => { updated[index] = move.preview[offset] })
      renderDrawings(event.currentTarget, updated, move.indices)
      return
    }
    if (!activeStroke.current) {
      if (activeTool === 'Eraser') {
        setEraserHover(point)
        const eraser = { tool: 'Eraser' as const, color: '#ff535d', width: 44, opacity: 100, points: [point] }
        const candidates = strokes.map((stroke, index) => strokeTouchesEraser(stroke, eraser, event.currentTarget.width, event.currentTarget.height) ? index : -1).filter((index) => index >= 0)
        setErasePreviewIndices(candidates)
        renderDrawings(event.currentTarget, strokes, selectedIndices, candidates, point, eraser.width)
      }
      return
    }
    activeStroke.current.points.push(point)
    if (activeStroke.current.tool !== 'Eraser') renderDrawings(event.currentTarget, [...strokes, activeStroke.current], selectedIndices)
    else {
      const eraser = activeStroke.current
      const candidates = strokes.map((stroke, index) => strokeTouchesEraser(stroke, eraser, event.currentTarget.width, event.currentTarget.height) ? index : -1).filter((index) => index >= 0)
      setEraserHover(point)
      setErasePreviewIndices(candidates)
      renderDrawings(event.currentTarget, strokes, selectedIndices, candidates, point, eraser.width)
    }
  }
  const saveCurrentFile = () => {
    const payload = { name: boards[activeBoard].name, pages: boards[activeBoard].pages, pageSize, infinite: infinitePage, orientation, pageBackground, gridEnabled, showScale, pageStrokes: Array.from({ length: boards[activeBoard].pages }, (_, index) => strokesByPage[`${activeBoard}:${index + 1}`] ?? []) }
    localStorage.setItem(`doomnotes:${boards[activeBoard].name}`, JSON.stringify(payload))
    setRecentFiles((files) => [boards[activeBoard].name, ...files.filter((name) => name !== boards[activeBoard].name)])
    setSaveNotice('Saved in this browser')
    window.setTimeout(() => setSaveNotice(''), 2400)
    setMenuOpen(false)
  }
  useEffect(() => {
    try {
      localStorage.setItem(openWorkspaceStorageKey, JSON.stringify({ names: boards.map((board) => board.name), activeBoard, page }))
    } catch { /* Keep the current workspace usable if browser storage is unavailable. */ }
  }, [boards, activeBoard, page])

  useEffect(() => {
    const board = boards[activeBoard]
    if (!board) { setAutoSaveStatus('idle'); return }
    setAutoSaveStatus('saving')
    const saveBoard = () => {
      const payload = { name: board.name, pages: board.pages, pageSize, infinite: board.infinite ?? infinitePage, orientation: board.orientation ?? orientation, pageBackground: board.pageBackground ?? pageBackground, gridEnabled, showScale, pageStrokes: Array.from({ length: board.pages }, (_, index) => strokesByPage[`${activeBoard}:${index + 1}`] ?? []) }
      try {
        localStorage.setItem(`doomnotes:${board.name}`, JSON.stringify(payload))
        setRecentFiles((files) => [board.name, ...files.filter((name) => name !== board.name)])
        setAutoSaveStatus('saved')
      } catch {
        setAutoSaveStatus('error')
      }
    }
    const timer = window.setTimeout(saveBoard, 650)
    window.addEventListener('pagehide', saveBoard)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pagehide', saveBoard)
    }
  }, [boards, activeBoard, pageSize, infinitePage, orientation, pageBackground, gridEnabled, showScale, strokesByPage])
  const getBoardDocument = () => ({ format: 'doomnotes', version: 1, name: boards[activeBoard].name, pages: boards[activeBoard].pages, pageSize, infinite: infinitePage, orientation, pageBackground, gridEnabled, showScale, pageStrokes: Array.from({ length: boards[activeBoard].pages }, (_, index) => strokesByPage[`${activeBoard}:${index + 1}`] ?? []) })
  const downloadNamedBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const downloadBlob = (blob: Blob, extension: string) => {
    const safeName = boards[activeBoard].name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'OzooNotes'
    downloadNamedBlob(blob, `${safeName}.${extension}`)
  }
  const saveBoardToFile = () => {
    downloadBlob(new Blob([JSON.stringify(getBoardDocument(), null, 2)], { type: 'application/vnd.ozoonotes+json' }), 'ozoonotes')
    setSaveNotice('OzooNotes file downloaded')
    window.setTimeout(() => setSaveNotice(''), 2400)
    setMenuOpen(false)
  }
  const renderPageCanvas = async (pageStrokes: Stroke[], width = canvasWidth, height = canvasHeight, background = infinitePage ? (dark ? '#08060d' : '#ffffff') : resolvePageBackground(pageBackground, dark)) => {
    const sources = [...new Set(pageStrokes.flatMap((stroke) => stroke.tool === 'Image' && stroke.imageData ? [stroke.imageData] : []))]
    await Promise.all(sources.map((source) => new Promise<void>((resolve) => {
        let image = imageCache.get(source)
        if (!image) { image = new Image(); imageCache.set(source, image); image.src = source }
        if (image.complete) resolve()
        else { image.addEventListener('load', () => resolve(), { once: true }); image.addEventListener('error', () => resolve(), { once: true }) }
    })))
    const output = window.document.createElement('canvas')
    output.width = width
    output.height = height
    const context = output.getContext('2d')
    if (!context) throw new Error('Could not render the page image.')
    context.fillStyle = background
    context.fillRect(0, 0, width, height)
    if (gridEnabled && !infinitePage) {
      context.strokeStyle = gridLineColor(dark)
      context.lineWidth = 1
      for (let x = 40; x < width; x += 40) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke() }
      for (let y = 40; y < height; y += 40) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke() }
    }
    const drawing = window.document.createElement('canvas')
    drawing.width = width
    drawing.height = height
    renderDrawings(drawing, pageStrokes)
    context.drawImage(drawing, 0, 0)
    return output
  }
  const svgForPage = (pageStrokes: Stroke[], width: number, height: number, background: string) => {
    const escapeXml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!)
    const paths = pageStrokes.map((stroke) => {
      if (!stroke.points.length || stroke.tool === 'Eraser') return ''
      const [first, last] = [stroke.points[0], stroke.points[stroke.points.length - 1]]
      const alpha = stroke.opacity / 100 * (stroke.tool === 'Brush' ? .72 : stroke.tool === 'Pencil' ? .62 : stroke.tool === 'Marker' ? .82 : stroke.tool === 'Highlighter' ? .24 : 1)
      if (stroke.tool === 'Image' && stroke.imageData && stroke.points.length > 1) return `<image href="${stroke.imageData}" x="${first.x * width}" y="${first.y * height}" width="${(last.x - first.x) * width}" height="${(last.y - first.y) * height}" preserveAspectRatio="none"/>`
      if (stroke.tool === 'Text') return `<text x="${first.x * width}" y="${first.y * height}" fill="${escapeXml(stroke.color)}" opacity="${alpha}" font-size="${Math.max(16, stroke.width * 5)}" font-family="sans-serif">${escapeXml(stroke.text ?? '')}</text>`
      const points = stroke.tool === 'Shape' && stroke.points.length > 1 ? shapeGeometry(stroke.shapeKind ?? 'Rectangle', first, last).points : stroke.points
      const pointString = points.map((point) => `${point.x * width},${point.y * height}`).join(' ')
      const tag = stroke.tool === 'Shape' && stroke.shapeKind !== 'Arrow' ? 'polygon' : 'polyline'
      return `<${tag} points="${pointString}" fill="none" stroke="${escapeXml(stroke.color)}" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round" opacity="${alpha}"/>`
    }).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${escapeXml(background)}"/>${paths}</svg>`
  }
  const exportDrawing = async (format: 'png' | 'svg') => {
    const pageStrokes = strokesByPage[pageKey] ?? []
    if (format === 'png') {
      const output = await renderPageCanvas(pageStrokes)
      output.toBlob((blob) => { if (blob) downloadBlob(blob, 'png') }, 'image/png')
    } else {
      const background = infinitePage ? (dark ? '#08060d' : '#ffffff') : resolvePageBackground(pageBackground, dark)
      downloadBlob(new Blob([svgForPage(pageStrokes, canvasWidth, canvasHeight, background)], { type: 'image/svg+xml;charset=utf-8' }), 'svg')
    }
    setMenuOpen(false)
  }
  const copyPageForNotion = async () => {
    const output = await renderPageCanvas(strokesByPage[pageKey] ?? [])
    const blob = await new Promise<Blob | null>((resolve) => output.toBlob(resolve, 'image/png'))
    if (!blob) return
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('Image clipboard is unavailable.')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setSaveNotice('Page image copied. Paste it into Notion.')
    } catch {
      downloadBlob(blob, 'png')
      setSaveNotice('Could not copy the image. Downloaded the PNG instead.')
    }
    window.setTimeout(() => setSaveNotice(''), 3000)
    setMenuOpen(false)
  }
  const exportObsidianNote = () => {
    const safeName = boards[activeBoard].name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'OzooNotes'
    const background = infinitePage ? (dark ? '#08060d' : '#ffffff') : resolvePageBackground(pageBackground, dark)
    const pageStrokes = Array.from({ length: boards[activeBoard].pages }, (_, index) => strokesByPage[`${activeBoard}:${index + 1}`] ?? [])
    const markdownPages = pageStrokes.map((items, index) => {
      const imageName = `${safeName} - page ${index + 1}.svg`
      downloadNamedBlob(new Blob([svgForPage(items, canvasWidth, canvasHeight, background)], { type: 'image/svg+xml;charset=utf-8' }), imageName)
      const textLines = items.filter((stroke) => stroke.tool === 'Text' && stroke.text?.trim()).map((stroke) => `- ${stroke.text!.replace(/\r?\n/g, '\n  ')}`)
      return `## Page ${index + 1}\n\n![[${imageName}]]\n\n${textLines.length ? `### Text on page\n\n${textLines.join('\n')}` : '_No text objects on this page._'}`
    })
    const markdown = `---\ntitle: "${boards[activeBoard].name.replace(/"/g, '\\"')}"\nsource: OzooNotes\n---\n\n# ${boards[activeBoard].name}\n\nPage size: ${infinitePage ? 'Infinite' : `${pageSize} (${orientation})`}\n\n${markdownPages.join('\n\n---\n\n')}\n`
    downloadNamedBlob(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }), `${safeName}.md`)
    setSaveNotice('Markdown and page SVGs downloaded. Move them into your Obsidian vault.')
    window.setTimeout(() => setSaveNotice(''), 3500)
    setMenuOpen(false)
  }
  const openSavedFile = (name: string) => {
    const raw = localStorage.getItem(`doomnotes:${name}`)
    if (!raw) return
    try {
      const saved = JSON.parse(raw) as { name: string; pages: number; pageSize?: PageSize; infinite?: boolean; orientation: 'portrait' | 'landscape'; pageBackground: string; gridEnabled?: boolean; showScale?: boolean; pageStrokes: Stroke[][] }
      const boardIndex = boards.length
      setBoards((current) => [...current, { name: saved.name, pages: saved.pages, pageSize: saved.pageSize ?? 'A4', infinite: saved.infinite ?? false, orientation: saved.orientation, pageBackground: saved.pageBackground }])
      setActiveBoard(boardIndex)
      setPage(1)
      setOrientation(saved.orientation)
      setPageBackground(saved.pageBackground)
      setPageSize(saved.pageSize ?? 'A4')
      setInfinitePage(saved.infinite ?? false)
      setGridEnabled(saved.gridEnabled ?? false)
      setShowScale(saved.showScale ?? false)
      setStrokesByPage((current) => ({ ...current, ...Object.fromEntries(saved.pageStrokes.map((strokes, index) => [`${boardIndex}:${index + 1}`, strokes])) }))
    } catch {
      setSaveNotice('This saved file could not be opened')
      window.setTimeout(() => setSaveNotice(''), 2400)
    }
  }
  const openBoardFile = async (file: File) => {
    try {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const pdfUrl = URL.createObjectURL(file)
        window.open(pdfUrl, '_blank', 'noopener,noreferrer')
        setSaveNotice('PDF opened in a new tab')
        window.setTimeout(() => setSaveNotice(''), 2400)
        return
      }
      const documentData = JSON.parse(await file.text()) as { format?: string; version?: number; name?: string; pages?: number; pageSize?: PageSize; infinite?: boolean; orientation?: 'portrait' | 'landscape'; pageBackground?: string; gridEnabled?: boolean; showScale?: boolean; pageStrokes?: Stroke[][] }
      if (documentData.format !== 'doomnotes' || documentData.version !== 1 || typeof documentData.name !== 'string' || !Number.isInteger(documentData.pages) || (documentData.pages ?? 0) < 1 || !Array.isArray(documentData.pageStrokes) || documentData.pageStrokes.length !== documentData.pages) throw new Error('That file is not a valid OzooNotes document.')
      if (documentData.pageSize !== undefined && !['Infinite', 'A1', 'A2', 'A3', 'A4', 'A5', 'Letter', 'Legal', 'Tabloid'].includes(documentData.pageSize)) throw new Error('That OzooNotes file uses an unsupported page size.')
      const boardIndex = boards.length
      const importedSize = documentData.pageSize ?? 'A4'
      const importedInfinite = documentData.infinite ?? importedSize === 'Infinite'
      const importedOrientation = documentData.orientation ?? 'portrait'
      const importedBackground = documentData.pageBackground ?? 'auto'
      setBoards((current) => [...current, { name: documentData.name!, pages: documentData.pages!, pageSize: importedSize, infinite: importedInfinite, orientation: importedOrientation, pageBackground: importedBackground }])
      setActiveBoard(boardIndex)
      setPage(1)
      setPageSize(importedSize)
      setInfinitePage(importedInfinite)
      setOrientation(importedOrientation)
      setPageBackground(importedBackground)
      setGridEnabled(documentData.gridEnabled ?? false)
      setShowScale(documentData.showScale ?? false)
      setStrokesByPage((current) => ({ ...current, ...Object.fromEntries(documentData.pageStrokes!.map((pageStrokes, index) => [`${boardIndex}:${index + 1}`, pageStrokes])) }))
      setRecentFiles((files) => [documentData.name!, ...files.filter((name) => name !== documentData.name)])
      setSaveNotice(`Opened ${documentData.name}`)
      window.setTimeout(() => setSaveNotice(''), 2400)
    } catch (error) {
      setSaveNotice(error instanceof Error ? error.message : 'Could not open that OzooNotes file.')
      window.setTimeout(() => setSaveNotice(''), 3500)
    }
  }
  const finishStroke = () => {
    const move = activeMove.current
    activeMove.current = null
    if (move) {
      editCurrentPage((current) => {
        const pageStrokes = [...current]
        move.indices.forEach((index, offset) => { pageStrokes[index] = move.preview[offset] })
        return pageStrokes
      })
      return
    }
    const completedStroke = activeStroke.current
    activeStroke.current = null
    if (completedStroke) {
      const savedStroke = { ...completedStroke, points: [...completedStroke.points] }
      if (savedStroke.tool === 'Eraser') {
        const canvas = canvasRef.current
        if (canvas) editCurrentPage((current) => current.filter((stroke) => !strokeTouchesEraser(stroke, savedStroke, canvas.width, canvas.height)))
      } else {
        editCurrentPage((current) => [...current, savedStroke])
      }
    }
    if (completedStroke?.tool === 'Eraser') {
      setEraserHover(null)
      setErasePreviewIndices([])
    }
    const context = canvasRef.current?.getContext('2d')
    if (context) {
      context.globalAlpha = 1
      context.globalCompositeOperation = 'source-over'
    }
  }

  const exportPdf = async () => {
    if (infinitePage) return
    const pageWidth = orientedPageMm[0] * 72 / 25.4
    const pageHeight = orientedPageMm[1] * 72 / 25.4
    const logicalWidth = canvasWidth
    const logicalHeight = canvasHeight
    const boardPages = Array.from({ length: boards[activeBoard].pages }, (_, index) => strokesByPage[`${activeBoard}:${index + 1}`] ?? [])
    if (boardPages.some((pageStrokes) => pageStrokes.some((stroke) => stroke.tool === 'Image'))) {
      const encoder = new TextEncoder()
      const images = [...new Set(boardPages.flatMap((pageStrokes) => pageStrokes.flatMap((stroke) => stroke.tool === 'Image' && stroke.imageData ? [stroke.imageData] : [])))]
      await Promise.all(images.map((source) => new Promise<void>((resolve) => {
        let image = imageCache.get(source)
        if (!image) { image = new Image(); imageCache.set(source, image); image.src = source }
        if (image.complete) resolve()
        else { image.addEventListener('load', () => resolve(), { once: true }); image.addEventListener('error', () => resolve(), { once: true }) }
      })))
      const rasterPages = boardPages.map((pageStrokes) => {
        const scale = 2
        const canvas = window.document.createElement('canvas')
        canvas.width = logicalWidth * scale
        canvas.height = logicalHeight * scale
        const drawingCanvas = window.document.createElement('canvas')
        drawingCanvas.width = canvas.width
        drawingCanvas.height = canvas.height
        const drawingContext = drawingCanvas.getContext('2d')
        const context = canvas.getContext('2d')
        if (!context || !drawingContext) throw new Error('Could not render the page for PDF export')
        renderDrawings(drawingCanvas, pageStrokes.map((stroke) => ({ ...stroke, width: stroke.width * scale })))
        context.fillStyle = resolvePageBackground(pageBackground, dark)
        context.fillRect(0, 0, canvas.width, canvas.height)
        if (gridEnabled) {
          context.strokeStyle = gridLineColor(dark)
          context.lineWidth = 1
          for (let x = 40; x < canvas.width; x += 40) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke() }
          for (let y = 40; y < canvas.height; y += 40) { context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke() }
        }
        context.drawImage(drawingCanvas, 0, 0)
        const encoded = canvas.toDataURL('image/jpeg', 0.92).split(',')[1]
        const binary = window.atob(encoded)
        const jpeg = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) jpeg[i] = binary.charCodeAt(i)
        return { jpeg, width: canvas.width, height: canvas.height }
      })
      const objects: Uint8Array[] = []
      const addObject = (contents: string | Uint8Array) => {
        objects.push(typeof contents === 'string' ? encoder.encode(contents) : contents)
        return objects.length
      }
      addObject('<< /Type /Catalog /Pages 2 0 R >>')
      addObject('')
      const pageIds: number[] = []
      rasterPages.forEach((raster) => {
        const imageId = objects.length + 1
        const prefix = encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${raster.width} /Height ${raster.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${raster.jpeg.length} >>\nstream\n`)
        const suffix = encoder.encode('\nendstream')
        const imageObject = new Uint8Array(prefix.length + raster.jpeg.length + suffix.length)
        imageObject.set(prefix)
        imageObject.set(raster.jpeg, prefix.length)
        imageObject.set(suffix, prefix.length + raster.jpeg.length)
        addObject(imageObject)
        const pageId = objects.length + 1
        const contentId = pageId + 1
        pageIds.push(pageId)
        addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)
        const stream = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`
        addObject(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`)
      })
      objects[1] = encoder.encode(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`)
      const chunks: Uint8Array[] = [encoder.encode('%PDF-1.4\n')]
      const offsets = [0]
      let byteLength = chunks[0].length
      objects.forEach((object, index) => {
        offsets.push(byteLength)
        const header = encoder.encode(`${index + 1} 0 obj\n`)
        const footer = encoder.encode('\nendobj\n')
        chunks.push(header, object, footer)
        byteLength += header.length + object.length + footer.length
      })
      const xrefOffset = byteLength
      const xref = encoder.encode(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`)
      chunks.push(xref)
      const pdfBytes = new Uint8Array(byteLength + xref.length)
      let offset = 0
      for (const chunk of chunks) { pdfBytes.set(chunk, offset); offset += chunk.length }
      const url = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }))
      const link = window.document.createElement('a')
      link.href = url
      link.download = `${boards[activeBoard].name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'whiteboard'}.pdf`
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      return
    }
    const pageStreams = Array.from({ length: boards[activeBoard].pages }, (_, pageIndex) => {
      const pageStrokes = strokesByPage[`${activeBoard}:${pageIndex + 1}`] ?? []
      const commands = ['q']
      const bg = resolvePageBackground(pageBackground, dark).replace('#', '')
      const bgRgb = [0, 2, 4].map((offset) => parseInt(bg.slice(offset, offset + 2), 16) / 255)
      commands.push(`${bgRgb.map((value) => value.toFixed(4)).join(' ')} rg`, `0 0 ${pageWidth} ${pageHeight} re f`)
      if (gridEnabled) {
        commands.push('0.82 0.80 0.86 RG', '0.35 w')
        for (let x = 20; x < pageWidth; x += 20) commands.push(`${x} 0 m ${x} ${pageHeight} l S`)
        for (let y = 20; y < pageHeight; y += 20) commands.push(`0 ${y} m ${pageWidth} ${y} l S`)
      }
      for (const stroke of pageStrokes) {
        if (stroke.tool === 'Eraser' || stroke.tool === 'Image' || !stroke.points.length) continue
        const hex = stroke.color.replace('#', '')
        const rgb = [0, 2, 4].map((offset, i) => {
          const ink = parseInt(hex.slice(offset, offset + 2), 16) / 255
          return (ink * stroke.opacity + bgRgb[i] * (100 - stroke.opacity)) / 100
        })
        const [red, green, blue] = rgb
        const first = stroke.points[0]
        if (stroke.tool === 'Text') {
          const escaped = (stroke.text ?? '').replace(/[^\x20-\x7E]/g, '?').replace(/[\\()]/g, '\\$&')
          const size = Math.max(12, stroke.width * 5 * pageHeight / logicalHeight)
          const textY = pageHeight - first.y * pageHeight - size
          commands.push(`${red.toFixed(4)} ${green.toFixed(4)} ${blue.toFixed(4)} rg`, `BT /F1 ${size.toFixed(2)} Tf ${(first.x * pageWidth).toFixed(2)} ${textY.toFixed(2)} Td (${escaped}) Tj ET`)
          continue
        }
        commands.push(`${red.toFixed(4)} ${green.toFixed(4)} ${blue.toFixed(4)} RG`)
        commands.push('1 J', '1 j')
        commands.push(`${(stroke.width * pageWidth / logicalWidth).toFixed(2)} w`)
        if (stroke.tool === 'Shape') {
          const last = stroke.points[stroke.points.length - 1]
          const geometry = shapeGeometry(stroke.shapeKind ?? 'Rectangle', first, last)
          geometry.points.forEach((point, index) => commands.push(`${(point.x * pageWidth).toFixed(2)} ${(pageHeight - point.y * pageHeight).toFixed(2)} ${index === 0 ? 'm' : 'l'}`))
          if (geometry.closed) commands.push('h')
          commands.push('S')
        } else {
          commands.push(`${(first.x * pageWidth).toFixed(2)} ${(pageHeight - first.y * pageHeight).toFixed(2)} m`)
          const points = stroke.tool === 'Line' ? stroke.points.slice(-1) : stroke.points.slice(1)
          for (const point of points) commands.push(`${(point.x * pageWidth).toFixed(2)} ${(pageHeight - point.y * pageHeight).toFixed(2)} l`)
          if (stroke.points.length > 1) commands.push('S')
        }
        if (stroke.points.length === 1) {
          const radius = stroke.width * pageWidth / logicalWidth / 2
          const centerX = first.x * pageWidth
          const centerY = pageHeight - first.y * pageHeight
          commands.push(`${(stroke.width * pageWidth / logicalWidth).toFixed(2)} w`, `${(centerX - radius).toFixed(2)} ${centerY.toFixed(2)} m ${(centerX + radius).toFixed(2)} ${centerY.toFixed(2)} l S`)
        }
      }
      commands.push('Q')
      return commands.join('\n')
    })

    const objects: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    const pageIds: number[] = []
    pageStreams.forEach((stream) => {
      const pageId = objects.length + 1
      const contentId = pageId + 1
      pageIds.push(pageId)
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`)
      objects.push(`<< /Length ${new TextEncoder().encode(stream).length + 1} >>\nstream\n${stream}\nendstream`)
    })
    objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`
    let document = '%PDF-1.4\n'
    const offsets = [0]
    objects.forEach((object, index) => {
      offsets.push(new TextEncoder().encode(document).length)
      document += `${index + 1} 0 obj\n${object}\nendobj\n`
    })
    const xrefOffset = new TextEncoder().encode(document).length
    document += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (const offset of offsets.slice(1)) document += `${String(offset).padStart(10, '0')} 00000 n \n`
    document += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
    const url = URL.createObjectURL(new Blob([document], { type: 'application/pdf' }))
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${boards[activeBoard].name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'whiteboard'}.pdf`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const addGraphToBoard = () => {
    try {
      const ranges = { xMin: Number(graphRange.xMin), xMax: Number(graphRange.xMax), yMin: Number(graphRange.yMin), yMax: Number(graphRange.yMax) }
      if (!Object.values(ranges).every(Number.isFinite) || ranges.xMin >= ranges.xMax || ranges.yMin >= ranges.yMax) throw new Error('Each minimum must be smaller than its maximum.')
      const svg = makeGraphSvg({ mode: graphMode, equation: graphEquation, points: graphPoints, ...ranges })
      const imageData = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
      const image = new Image()
      image.onload = () => {
        const width = 0.58, height = width * 580 / 900
        const x = Math.max(0, Math.min(1 - width, 0.21)), y = Math.max(0, Math.min(1 - height, 0.28))
        const graph: Stroke = { tool: 'Image', color: '#ffffff', width: 1, opacity: 100, points: [{ x, y }, { x: x + width, y: y + height }], imageData }
        imageCache.set(imageData, image)
        editCurrentPage((current) => [...current, graph])
        setGraphOpen(false)
        setGraphError('')
      }
      image.onerror = () => setGraphError('Could not create the graph. Please check the equation or data points.')
      image.src = imageData
    } catch (error) {
      setGraphError(error instanceof Error ? error.message : 'Could not create the graph.')
    }
  }

  const addBoard = () => {
    setDraftName(`File ${nextFileNumber}`)
    setDraftSize('A4')
    setDraftOrientation('portrait')
    setDraftBackground('auto')
    setShowNewFileDialog(true)
  }
  const createBoard = () => {
    const isInfinite = draftSize === 'Infinite'
    const name = draftName.trim() || `File ${nextFileNumber}`
    setBoards((current) => [...current, { name, pages: 1, pageSize: draftSize, infinite: isInfinite, orientation: draftOrientation, pageBackground: draftBackground }])
    setActiveBoard(boards.length)
    setPage(1)
    setPageSize(draftSize)
    setInfinitePage(isInfinite)
    setOrientation(draftOrientation)
    setPageBackground(draftBackground)
    setGridEnabled(false)
    setShowScale(false)
    setNextFileNumber(nextFileNumber + 1)
    setShowNewFileDialog(false)
  }
  const activateBoard = (index: number) => {
    const board = boards[index]
    if (!board) return
    setActiveBoard(index)
    setPage(1)
    setPageSize(board.pageSize ?? 'A4')
    setInfinitePage(board.infinite ?? false)
    setOrientation(board.orientation ?? 'portrait')
    setPageBackground(board.pageBackground ?? 'auto')
  }
  const setActiveBackground = (color: string) => {
    setPageBackground(color)
    setBoards((current) => current.map((board, index) => index === activeBoard ? { ...board, pageBackground: color } : board))
  }
  const setActiveOrientation = (value: 'portrait' | 'landscape') => {
    setOrientation(value)
    setBoards((current) => current.map((board, index) => index === activeBoard ? { ...board, orientation: value } : board))
  }
  const closeBoard = (index: number) => {
    if (boards.length === 1) {
      setBoards([])
      return
    }
    const remaining = boards.filter((_, boardIndex) => boardIndex !== index)
    setBoards(remaining)
    if (index === activeBoard) {
      const nextIndex = Math.min(index, remaining.length - 1)
      const nextBoard = remaining[nextIndex]
      setActiveBoard(nextIndex)
      setPage(1)
      setPageSize(nextBoard.pageSize ?? 'A4')
      setInfinitePage(nextBoard.infinite ?? false)
      setOrientation(nextBoard.orientation ?? 'portrait')
      setPageBackground(nextBoard.pageBackground ?? 'auto')
    } else if (index < activeBoard) {
      setActiveBoard(activeBoard - 1)
    }
  }
  const addPage = () => {
    const updated = boards.map((board, index) => index === activeBoard ? { ...board, pages: board.pages + 1 } : board)
    setBoards(updated)
    setPage(updated[activeBoard].pages)
  }

  const newFileDialog = showNewFileDialog && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNewFileDialog(false) }}><section className="new-file-dialog" role="dialog" aria-modal="true" aria-labelledby="new-file-title"><button className="dialog-close" aria-label="Close new file settings" onClick={() => setShowNewFileDialog(false)}>×</button><p className="eyebrow">NEW BOARD</p><h2 id="new-file-title">Set up your page</h2><label className="dialog-label">File name<input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder={`File ${nextFileNumber}`} /></label><fieldset className="page-size-picker"><legend>Page size</legend><div className="page-size-options">{(['A1', 'A2', 'A3', 'A4', 'A5', 'Letter', 'Legal', 'Tabloid', 'Infinite'] as PageSize[]).map((size) => <button type="button" key={size} aria-pressed={draftSize === size} className={`page-size-option ${draftSize === size ? 'chosen' : ''} ${size === 'Infinite' ? 'infinite-choice' : ''}`} onClick={() => setDraftSize(size)}>{size === 'Infinite' ? '∞ Infinite' : size}</button>)}</div></fieldset>{draftSize !== 'Infinite' ? <><label className="dialog-label">Orientation<select value={draftOrientation} onChange={(event) => setDraftOrientation(event.target.value as 'portrait' | 'landscape')}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label><fieldset className="page-size-picker"><legend>Page background</legend><div className="dialog-colors">{pageColors.map((color) => <button type="button" key={color} aria-label={pageBackgroundLabel(color)} aria-pressed={draftBackground === color} className={`settings-swatch ${draftBackground === color ? 'chosen' : ''}`} style={pageBackgroundSwatchStyle(color)} onClick={() => setDraftBackground(color)} />)}<label className="custom-color"><span>Custom</span><input type="color" value={draftBackground} aria-label="Custom page background" onChange={(event) => setDraftBackground(event.target.value)} /></label></div></fieldset></> : <p className="infinite-note">A large, scrollable board that matches the current theme. PDF export is unavailable for infinite boards.</p>}<footer className="dialog-actions"><button className="dialog-cancel" onClick={() => setShowNewFileDialog(false)}>Cancel</button><button className="dialog-create" onClick={createBoard}>Create board</button></footer></section></div>

  const accountDialog = accountOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title"><button className="dialog-close" aria-label="Close account" onClick={() => setAccountOpen(false)}>×</button><p className="eyebrow">SELF-HOSTED CLOUD</p><h2 id="account-title">{cloudUser ? `Hello, ${cloudUser.username}` : authMode === 'register' ? 'Create your account' : 'Sign in to OzooNotes'}</h2>{cloudUser ? <><p className="infinite-note">Your boards are saved on the OzooNotes server you run.</p><form className="share-form folder-form" onSubmit={(event) => { void createCloudFolder(event) }}><label className="dialog-label">New folder<input required value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Folder name" /></label><button className="dialog-create">Create folder</button></form><label className="dialog-label">Save boards in<select value={selectedFolderId ?? ''} onChange={(event) => setSelectedFolderId(Number(event.target.value) || null)}><option value="">No folder</option>{cloudFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><button className="dialog-create full-button" onClick={() => { void logout() }}>Sign out</button></> : <><form onSubmit={(event) => { void submitAccount(event) }}><label className="dialog-label">Username<input required minLength={3} maxLength={32} autoComplete="username" value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} /></label><label className="dialog-label">Password<input required minLength={authMode === 'register' ? 12 : 1} type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} /></label><button className="dialog-create full-button">{authMode === 'register' ? 'Create account' : 'Sign in'}</button><button className="text-button" type="button" onClick={() => setAuthMode(authMode === 'register' ? 'login' : 'register')}>{authMode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'}</button></form></>}{cloudMessage && <p className="cloud-message" role="status">{cloudMessage}</p>}</section></div>

  const shareDialog = shareOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShareOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title"><button className="dialog-close" aria-label="Close sharing" onClick={() => setShareOpen(false)}>×</button><p className="eyebrow">ACCESS MANAGEMENT</p><h2 id="share-title">Share “{boards[activeBoard]?.name}”</h2><form className="share-form" onSubmit={(event) => { void inviteToBoard(event) }}><label className="dialog-label">Username<input required value={shareUsername} onChange={(event) => setShareUsername(event.target.value)} placeholder="Their OzooNotes username" /></label><label className="dialog-label">Permission<select value={shareRole} onChange={(event) => setShareRole(event.target.value as 'view' | 'edit')}><option value="view">View only</option><option value="edit">Can edit</option></select></label><button className="dialog-create">Grant access</button></form><h3 className="small-heading">People with access</h3>{shareList.length ? <ul className="access-list">{shareList.map((entry) => <li key={entry.username}><span>{entry.username}<small>{entry.role === 'view' ? 'View only' : 'Can edit'}</small></span><button onClick={() => { const id = cloudBoardIds[boards[activeBoard].name]; void apiRequest(`/api/boards/${id}/share`, { method: 'DELETE', body: JSON.stringify({ username: entry.username }) }).then(() => setShareList((current) => current.filter((item) => item.username !== entry.username))).catch((error) => setCloudMessage(error.message)) }}>Remove</button></li>)}</ul> : <p className="empty-hint">No one else has access yet.</p>}<h3 className="small-heading">Share with a team</h3>{teams.length ? <><form className="share-form" onSubmit={(event) => { void grantTeamBoardAccess(event) }}><label className="dialog-label">Team<select value={shareTeamId ?? ''} onChange={(event) => setShareTeamId(Number(event.target.value) || null)}><option value="">Choose a team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label className="dialog-label">Permission<select value={shareTeamRole} onChange={(event) => setShareTeamRole(event.target.value as 'view' | 'edit')}><option value="view">View only</option><option value="edit">Can edit</option></select></label><button className="dialog-create">Grant</button></form>{shareTeams.map((team) => <p className="team-access-row" key={team.id}>{team.name}: {team.role}<button onClick={() => { const id = cloudBoardIds[boards[activeBoard].name]; void apiRequest(`/api/boards/${id}/teams`, { method: 'DELETE', body: JSON.stringify({ teamId: team.id }) }).then(() => setShareTeams((current) => current.filter((item) => item.id !== team.id))) }}>Remove</button></p>)}</> : <p className="empty-hint">Create a team to grant access to a group.</p>}<div className="menu-divider" /><button className="dialog-create full-button" onClick={() => { void createPublicLink() }}>Create read-only link</button>{publicLink && <><div className="public-link-value">{publicLink}</div><button className="text-button" onClick={() => { const id = cloudBoardIds[boards[activeBoard].name]; void apiRequest(`/api/boards/${id}/public-link`, { method: 'DELETE', body: '{}' }).then(() => { setPublicLink(''); setCloudMessage('Read-only links revoked.') }).catch((error) => setCloudMessage(error.message)) }}>Revoke read-only links</button></>}{cloudMessage && <p className="cloud-message">{cloudMessage}</p>}</section></div>

  const commentsDialog = commentOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommentOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="comments-title"><button className="dialog-close" aria-label="Close comments" onClick={() => setCommentOpen(false)}>×</button><p className="eyebrow">TEAM COMMENTS</p><h2 id="comments-title">{boards[activeBoard]?.name}</h2>{comments.length ? <ul className="comment-list">{comments.map((comment) => <li key={comment.id}><strong>{comment.username}</strong><time>{new Date(`${comment.createdAt.replace(' ', 'T')}Z`).toLocaleString()}</time><p>{comment.body}</p></li>)}</ul> : <p className="empty-hint">No comments yet.</p>}<form onSubmit={(event) => { void addComment(event) }}><label className="dialog-label">Add a comment<textarea required rows={3} maxLength={4000} value={commentText} onChange={(event) => setCommentText(event.target.value)} /></label><button className="dialog-create full-button">Post comment</button></form>{cloudMessage && <p className="cloud-message">{cloudMessage}</p>}</section></div>

  const activeBoardName = boards[activeBoard]?.name
  const activeCloudId = activeBoardName ? cloudBoardIds[activeBoardName] : undefined
  const activeRemoteBoard = activeCloudId ? cloudBoards.find((board) => board.id === activeCloudId) : undefined
  const activeRemoteEncrypted = Boolean(activeRemoteBoard && isEncryptedBoardState(activeRemoteBoard.state))
  const cloudSaveDialog = cloudSaveOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCloudSaveOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="cloud-save-title"><button className="dialog-close" aria-label="Close cloud save options" onClick={() => setCloudSaveOpen(false)}>×</button><p className="eyebrow">SAVE TO YOUR SERVER</p><h2 id="cloud-save-title">Protect this board?</h2><form onSubmit={submitCloudSave}><label className="encryption-choice"><input type="checkbox" checked={cloudSaveEncrypted} disabled={activeRemoteEncrypted} onChange={(event) => setCloudSaveEncrypted(event.target.checked)} /><span><strong>Encrypt board in this browser</strong><small>Your server stores encrypted drawing data. Board name, comments, and sharing settings remain visible to the server.</small></span></label>{cloudSaveEncrypted && <><label className="dialog-label">Encryption passphrase<input required minLength={12} type="password" autoComplete="new-password" value={cloudSavePassphrase} onChange={(event) => setCloudSavePassphrase(event.target.value)} placeholder="At least 12 characters" /></label>{!activeRemoteEncrypted && <label className="dialog-label">Confirm passphrase<input required minLength={12} type="password" autoComplete="new-password" value={cloudSaveConfirmation} onChange={(event) => setCloudSaveConfirmation(event.target.value)} /></label>}<p className="encryption-note">Keep this passphrase safe and share it with collaborators yourself. OzooNotes cannot recover it.</p></>}{cloudMessage && <p className="cloud-message" role="status">{cloudMessage}</p>}<footer className="dialog-actions"><button type="button" className="dialog-cancel" onClick={() => setCloudSaveOpen(false)}>Cancel</button><button className="dialog-create">Save board</button></footer></form></section></div>

  const teamDialog = teamOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTeamOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="teams-title"><button className="dialog-close" aria-label="Close teams" onClick={() => setTeamOpen(false)}>×</button><p className="eyebrow">TEAM MANAGEMENT</p><h2 id="teams-title">Teams</h2><form className="share-form" onSubmit={(event) => { void createTeam(event) }}><label className="dialog-label">New team<input required value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Team name" /></label><button className="dialog-create">Create team</button></form>{teams.length > 0 && <><label className="dialog-label">Select team<select value={activeTeam ?? ''} onChange={(event) => { const id = Number(event.target.value) || null; setActiveTeam(id); if (id) void apiRequest<{ members: { username: string; role: string }[] }>(`/api/teams/${id}/members`).then(({ members }) => setTeamMembers(members)).catch((error) => setCloudMessage(error.message)); else setTeamMembers([]) }}><option value="">Choose a team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><form className="share-form" onSubmit={(event) => { void addTeamMember(event) }}><label className="dialog-label">Add member<input required value={teamUsername} onChange={(event) => setTeamUsername(event.target.value)} placeholder="Their OzooNotes username" /></label><button className="dialog-create" disabled={!activeTeam}>Add</button></form><ul className="access-list">{teamMembers.map((member) => <li key={member.username}><span>{member.username}<small>{member.role}</small></span></li>)}</ul></>}{cloudMessage && <p className="cloud-message">{cloudMessage}</p>}</section></div>

  const selectedForLibrary = selectedIndices.map((index) => strokes[index]).filter((stroke): stroke is Stroke => Boolean(stroke))
  const libraryDialog = libraryOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLibraryOpen(false) }}><section className="new-file-dialog compact-dialog library-dialog" role="dialog" aria-modal="true" aria-labelledby="library-title"><button className="dialog-close" aria-label="Close library" onClick={() => setLibraryOpen(false)}>×</button><p className="eyebrow">REUSABLE OBJECTS</p><h2 id="library-title">Libraries</h2><form className="library-save-form" onSubmit={saveSelectionToLibrary}><label className="dialog-label">Save the {selectedForLibrary.length || 'selected'} selected object{selectedForLibrary.length === 1 ? '' : 's'}<input required maxLength={80} value={libraryName} onChange={(event) => setLibraryName(event.target.value)} placeholder="Name this library item" /></label><button className="dialog-create" disabled={!selectedForLibrary.length || !libraryName.trim()}>Save selection</button></form>{libraryItems.length ? <ul className="library-list">{libraryItems.map((item) => <li key={item.id}><span><strong>{item.name}</strong><small>{item.strokes.length} object{item.strokes.length === 1 ? '' : 's'}</small></span><button className="library-insert" onClick={() => insertLibraryItem(item)}>Insert</button><button className="library-delete" aria-label={`Delete ${item.name} from library`} title="Delete library item" onClick={() => deleteLibraryItem(item.id)}>×</button></li>)}</ul> : <p className="empty-hint">No saved objects yet. Select objects on the board and save them here for reuse.</p>}</section></div>

  const graphDialog = graphOpen && <div className="new-file-overlay graph-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setGraphOpen(false) }}><section className="new-file-dialog graph-dialog" role="dialog" aria-modal="true" aria-labelledby="graph-title"><button className="dialog-close" aria-label="Close graph tool" onClick={() => setGraphOpen(false)}>×</button><p className="eyebrow">WHITEBOARD TOOL</p><h2 id="graph-title">Create a graph</h2><div className="graph-mode-picker" role="group" aria-label="Graph input type"><button type="button" className={graphMode === 'equation' ? 'selected' : ''} aria-pressed={graphMode === 'equation'} onClick={() => { setGraphMode('equation'); setGraphError('') }}>Equation</button><button type="button" className={graphMode === 'points' ? 'selected' : ''} aria-pressed={graphMode === 'points'} onClick={() => { setGraphMode('points'); setGraphError('') }}>Data points</button></div>{graphMode === 'equation' ? <label className="dialog-label">Equation(s)<textarea className="graph-textarea" value={graphEquation} onChange={(event) => setGraphEquation(event.target.value)} placeholder="y = x^2" rows={3} /><small>Use x, numbers, + − * / ^, parentheses, or sin, cos, tan, sqrt, abs, log, ln, exp. Put each equation on a new line.</small></label> : <label className="dialog-label">Points (x, y)<textarea className="graph-textarea" value={graphPoints} onChange={(event) => setGraphPoints(event.target.value)} placeholder="1, 2; 2, 5; 3, 4" rows={3} /><small>Enter points as x, y pairs separated by semicolons or new lines.</small></label>}<div className="graph-range-grid"><label className="dialog-label">X minimum<input type="number" value={graphRange.xMin} onChange={(event) => setGraphRange({ ...graphRange, xMin: Number(event.target.value) })} /></label><label className="dialog-label">X maximum<input type="number" value={graphRange.xMax} onChange={(event) => setGraphRange({ ...graphRange, xMax: Number(event.target.value) })} /></label><label className="dialog-label">Y minimum<input type="number" value={graphRange.yMin} onChange={(event) => setGraphRange({ ...graphRange, yMin: Number(event.target.value) })} /></label><label className="dialog-label">Y maximum<input type="number" value={graphRange.yMax} onChange={(event) => setGraphRange({ ...graphRange, yMax: Number(event.target.value) })} /></label></div>{graphError && <p className="graph-error" role="alert">{graphError}</p>}<button className="dialog-create" onClick={addGraphToBoard}>Add graph to page</button></section></div>

  const pageSizeMm = pageSize === 'Infinite' ? [1, 1] : pageDimensionsMm[pageSize]
  const orientedPageMm = orientation === 'portrait' || pageSize === 'Infinite' ? pageSizeMm : [pageSizeMm[1], pageSizeMm[0]]
  const canvasWidth = infinitePage ? 2800 : Math.round(orientedPageMm[0] * 3.78)
  const canvasHeight = infinitePage ? 2800 : Math.round(orientedPageMm[1] * 3.78)

  if (sharedToken) {
    const state = sharedBoard && !isEncryptedBoardState(sharedBoard.state) ? sharedBoard.state : undefined
    const sharedSize = state?.pageSize && state.pageSize !== 'Infinite' ? state.pageSize : 'A4'
    const sharedMm = pageDimensionsMm[sharedSize]
    const sharedMmOriented = state?.orientation === 'landscape' ? [sharedMm[1], sharedMm[0]] : sharedMm
    const sharedWidth = state?.infinite ? 2800 : Math.round(sharedMmOriented[0] * 3.78)
    const sharedHeight = state?.infinite ? 2800 : Math.round(sharedMmOriented[1] * 3.78)
    return <main className={`app ${dark ? 'dark' : 'light'}`}><section className="shared-board-view"><header><div className="brand"><img className="brand-mark" src={`${import.meta.env.BASE_URL}ozoo-logo.png`} alt="OzooNotes" /></div><span className="shared-readonly">Read-only link</span></header>{sharedBoard ? <><h1>{sharedBoard.name}</h1><div className={`paper shared-paper ${state?.infinite ? 'infinite' : ''}`} style={{ width: state?.infinite ? 'min(2400px, 90vw)' : undefined, aspectRatio: state?.infinite ? '1 / 1' : `${sharedMmOriented[0]} / ${sharedMmOriented[1]}`, backgroundColor: state?.infinite ? undefined : resolvePageBackground(state?.pageBackground ?? 'auto', dark) }}><canvas className="shared-canvas" ref={canvasRef} width={sharedWidth} height={sharedHeight} aria-label="Shared read-only whiteboard" /></div></> : <p>{cloudMessage || 'Opening shared board…'}</p>}</section></main>
  }

  if (boards.length === 0) {
    return (
      <main className={`app ${dark ? 'dark' : 'light'}`}>
        <section className="landing-window">
          <header className="landing-topbar">
            <a className="landing-brand" href="#" aria-label="OzooNotes home"><img className="brand-mark" src={`${import.meta.env.BASE_URL}ozoo-logo.png`} alt="OzooNotes" /></a>
            <nav className="landing-nav" aria-label="Main navigation">
              <a href="#landing-tools">What you can do</a>
              <a href="#landing-files">Your files</a>
            </nav>
            <div className="landing-top-actions">
              {!localOnly && <button className="account-button" onClick={() => setAccountOpen(true)}>{cloudUser ? `☁ ${cloudUser.username}` : '☁ Sign in'}</button>}
              <button className="theme-toggle" onClick={() => setDark(!dark)} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}>{dark ? '☼' : '☾'} <span>{dark ? 'Light' : 'Dark'} mode</span></button>
            </div>
          </header>
          <div className="landing-page">
            <section className="landing-hero">
              <div className="landing-copy">
                <p className="landing-kicker"><span className="status-dot" /> Your space to think on paper</p>
                <h1>Don’t Doomscroll.<br /><span>Make something.</span></h1>
                <p className="hero-description">Sketch ideas, add notes, shape your thoughts, and plot a graph—all in one calm workspace.</p>
                <div className="landing-cta-row">
                  <button className="hero-new-file" onClick={addBoard}>Start a new board <span>→</span></button>
                  <button className="landing-open-file" onClick={() => documentInputRef.current?.click()}><span>↗</span> Open a file</button>
                </div>
                <p className="landing-local-note">Your boards save in this browser. Export a file when you want a portable copy.</p>
              </div>
              <div className="landing-art" aria-label="Illustration of drawing and graph tools">
                <div className="landing-art-shadow" />
                <div className="art-paper">
                  <div className="art-toolbar"><span>✎</span><span>▱</span><span>○</span><span>↗</span><i /><b /><b /><b /></div>
                  <div className="art-note art-note-one"><span>ideas</span><strong>Make room<br />for a new thought.</strong><svg viewBox="0 0 120 42" aria-hidden="true"><path d="M4 30 C22 4 30 40 48 18 S75 8 82 26 S100 36 116 10" /></svg></div>
                  <div className="art-note art-note-two"><span>GRAPH</span><svg viewBox="0 0 150 100" aria-hidden="true"><path className="graph-grid" d="M10 10H145M10 35H145M10 60H145M10 85H145M10 10V90M45 10V90M80 10V90M115 10V90M145 10V90" /><path className="graph-axis" d="M10 60H145M80 10V90" /><path className="graph-curve" d="M12 82 C40 80 47 67 62 46 S94 14 144 15" /></svg><small>y = x²</small></div>
                  <div className="art-shape art-shape-circle" /><div className="art-shape art-shape-diamond" /><div className="art-caption">a little space for big ideas</div>
                </div>
                <div className="art-spark art-spark-one">✳</div><div className="art-spark art-spark-two">✦</div>
              </div>
            </section>
            <section className="landing-tools" id="landing-tools">
              <div className="landing-section-heading"><span>MAKE IT YOURS</span><h2>Simple tools. Room to explore.</h2></div>
              <div className="landing-feature-grid">
                <article className="landing-feature"><span className="feature-icon feature-draw">✎</span><h3>Draw and arrange</h3><p>Use the brush, pen, shapes, text, lines, and eraser. Move and organize what you create.</p></article>
                <article className="landing-feature"><span className="feature-icon feature-graph">⌁</span><h3>Put ideas on a graph</h3><p>Plot equations or enter points, then add the graph to your board.</p></article>
                <article className="landing-feature"><span className="feature-icon feature-pages">▤</span><h3>Keep it portable</h3><p>Work across pages, import images, and export as PDF, PNG, or SVG.</p></article>
              </div>
            </section>
            <section className="landing-files" id="landing-files">
              <div className="landing-files-heading"><div><span>READY WHEN YOU ARE</span><h2>Your files, close at hand.</h2></div><button className="landing-new-small" onClick={addBoard}>＋ New board</button></div>
              <input ref={documentInputRef} className="image-file-input" type="file" accept=".ozoonotes,.doomnotes,.json,application/json,application/pdf,.pdf" aria-label="Open a OzooNotes or PDF file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openBoardFile(file); event.currentTarget.value = '' }} />
              {recentFiles.length ? <div className="landing-recent-list">{recentFiles.map((name) => <button key={name} onClick={() => openSavedFile(name)}><span className="recent-icon">▤</span><span>{name}<small>Saved in this browser</small></span><b>Open →</b></button>)}</div> : <div className="landing-empty-files"><span className="recent-icon">▤</span><div><strong>Your recent files will show up here.</strong><p>Create a board to get started, or open an OzooNotes file you already have.</p></div><button className="landing-open-file" onClick={() => documentInputRef.current?.click()}>↗ Open file</button></div>}
              {!localOnly && cloudUser && <div className="landing-cloud-files"><h3>Cloud boards</h3>{cloudBoards.length ? <div className="landing-recent-list">{cloudBoards.map((board) => <button key={board.id} onClick={() => loadCloudBoard(board)}><span className="recent-icon">☁</span><span>{board.name}<small>{board.ownerName ? `Shared by ${board.ownerName}` : 'Saved on your server'}</small></span><b>Open →</b></button>)}</div> : <p className="empty-hint">No cloud boards yet.</p>}</div>}
            </section>
            <footer className="landing-footer"><div className="landing-brand"><img className="brand-mark" src={`${import.meta.env.BASE_URL}ozoo-logo.png`} alt="OzooNotes" /></div><span>Don’t Doomscroll, just OzooNotes</span></footer>
          </div>
        </section>
        {newFileDialog}
        {!localOnly && accountDialog}
      </main>
    )
  }

  return (
    <main className={`app ${dark ? 'dark' : 'light'}`}>
      <div className="window">
        <header className="window-top">
          <div className="brand"><img className="brand-mark" src={`${import.meta.env.BASE_URL}ozoo-logo.png`} alt="OzooNotes" /></div>
          <nav className="file-tabs" aria-label="Whiteboard files">
            {boards.map((board, index) => <div key={board.name} className={`file-tab ${index === activeBoard ? 'selected' : ''}`}>
              <button className="tab-open" onClick={() => activateBoard(index)}>{board.name}</button>
              <button className="tab-close" aria-label={`Close ${board.name}`} title={`Close ${board.name}`} onClick={() => closeBoard(index)}>×</button>
            </div>)}
            <button className="add-file" onClick={addBoard} aria-label="Create new file">+</button>
            <button className="export-pdf" onClick={exportPdf} disabled={infinitePage} title={infinitePage ? 'Infinite boards cannot be exported as PDF' : 'Download PDF'}><span>↓</span> Download PDF</button>
            <button className="theme-toggle" onClick={() => setDark(!dark)} title="Toggle theme">{dark ? '☼' : '☾'} <span>{dark ? 'Light' : 'Dark'} mode</span></button>
            {!localOnly && <button className="account-button header-account" onClick={() => setAccountOpen(true)} title="Account and cloud sync">{cloudUser ? `☁ ${cloudUser.username}` : '☁ Sign in'}</button>}
          </nav>
        </header>

        <section className="board-area">
          <div className="board-menu-wrap">
            <button className="menu-trigger" aria-label="Open drawing menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
            {menuOpen && <div className="board-menu">
              <p className="menu-title">Page options</p>
              <label className="menu-option"><input type="checkbox" checked={gridEnabled} onChange={(event) => setGridEnabled(event.target.checked)} /> Unlock grid on page</label>
              <label className="menu-option"><input type="checkbox" disabled={infinitePage} checked={showScale && !infinitePage} onChange={(event) => setShowScale(event.target.checked)} /> Scale on page</label>
              {showScale && !infinitePage && <label className="menu-option ruler-unit-option">Ruler units<select value={rulerUnit} onChange={(event) => setRulerUnit(event.target.value as RulerUnit)}><option value="mm">Millimeters (mm)</option><option value="cm">Centimeters (cm)</option><option value="in">Inches (in)</option></select></label>}
              <div className="menu-divider" />
              <button onClick={() => { setLibraryName(''); setLibraryOpen(true); setMenuOpen(false) }}>▧ <span>Libraries</span></button>
              <button onClick={exportPdf} disabled={infinitePage}>↓ <span>{infinitePage ? 'PDF unavailable for infinite board' : 'Download PDF'}</span></button>
              <button onClick={() => { void exportDrawing('png') }}>▧ <span>Export this page as PNG</span></button>
              <button onClick={() => { void exportDrawing('svg') }}>◇ <span>Export this page as SVG</span></button>
              <button onClick={() => { void copyPageForNotion() }}>▧ <span>Copy page for Notion</span></button>
              <button onClick={exportObsidianNote}>▤ <span>Export for Obsidian</span></button>
              <button onClick={saveCurrentFile}>▣ <span>Save</span></button>
              <button onClick={saveBoardToFile}>↓ <span>Save OzooNotes file</span></button>
              <button onClick={() => documentInputRef.current?.click()}>↗ <span>Open OzooNotes file</span></button>
              {!localOnly && <>
              <button onClick={openCloudSaveDialog}>☁ <span>Save to server</span></button>
              <button onClick={() => { void openShareManager() }}>♧ <span>Access and read-only links</span></button>
              <button onClick={() => { if (!cloudUser) setAccountOpen(true); else { setCommentOpen(true); const id = cloudBoardIds[boards[activeBoard].name]; if (id) void loadComments(id).catch((error) => setCloudMessage(error.message)); else setCloudMessage('Save this board to your server first.') } }}>▤ <span>Comments</span></button>
              <button onClick={() => { if (!cloudUser) setAccountOpen(true); else { setTeamOpen(true); void apiRequest<{ teams: { id: number; name: string }[] }>('/api/teams').then(({ teams: result }) => setTeams(result)).catch((error) => setCloudMessage(error.message)) } }}>♧ <span>Team management</span></button>
              {saveNotice && <div className="save-notice">{saveNotice}</div>}
              {cloudMessage && <div className="save-notice">{cloudMessage}</div>}
              </>}
            </div>}
          </div>
          <div className="quick-actions" aria-label="Selection actions">
            <button className="history-label" title="Undo" aria-label="Undo" disabled={!historyState.canUndo} onClick={undo}>Undo</button>
            <button className="history-label" title="Redo" aria-label="Redo" disabled={!historyState.canRedo} onClick={redo}>Redo</button>
            <button title="Delete selection" aria-label="Delete selection" disabled={!selectedIndices.length} onClick={deleteSelection}>▤</button>
            <button title="Duplicate selection" aria-label="Duplicate selection" disabled={!selectedIndices.length} onClick={duplicateSelection}>▢</button>
            <button title="Send selection backward" aria-label="Send selection backward" disabled={!selectedIndices.length} onClick={() => moveSelectionLayer('back')}>⋯</button>
          </div>
          <div className="toolbar" aria-label="Drawing tools">
            <button type="button" className="tool-button image-import" title="Import image" aria-label="Import image" onClick={() => imageInputRef.current?.click()}><span>▧</span></button>
            <button type="button" className="tool-button graph-tool" title="Add graph" aria-label="Add graph" onClick={() => { setGraphError(''); setGraphOpen(true) }}><span>⌁</span></button>
            <div className="drawing-tool-group">
              <button type="button" ref={brushToolRef} className={'tool-button drawing-tool-toggle ' + (drawingToolGroup.includes(activeTool) ? 'active' : '')} title={'Drawing tools: ' + (drawingToolGroup.includes(activeTool) ? activeTool : 'choose a tool')} aria-label="Choose drawing tool" aria-expanded={drawingToolsOpen} aria-controls="drawing-tool-menu" onClick={() => setDrawingToolsOpen((open) => !open)}><span>{toolIcons[drawingToolGroup.includes(activeTool) ? activeTool : 'Brush']}</span><small>⌄</small></button>
              {drawingToolsOpen && <div id="drawing-tool-menu" className="drawing-tool-menu" role="group" aria-label="Drawing tools">{drawingToolGroup.map((tool) => <button key={tool} type="button" className={'drawing-tool-option ' + (activeTool === tool ? 'active' : '')} aria-pressed={activeTool === tool} onClick={() => { setActiveTool(tool); setDrawingToolsOpen(false); if (inkTools.includes(tool)) setShowSettingsPanel(true) }}><span>{toolIcons[tool]}</span><span>{tool}</span></button>)}</div>}
            </div>
            {(['Select', 'Shape', 'Text', 'Line'] as Tool[]).map((tool) => <button key={tool} type="button" title={tool} aria-label={tool} className={'tool-button ' + (activeTool === tool ? 'active' : '')} onClick={() => { setDrawingToolsOpen(false); setActiveTool(tool) }}><span>{toolIcons[tool]}</span></button>)}
            <button type="button" ref={settingsToggleRef} className="tool-button settings-toggle" title={showSettingsPanel ? 'Hide drawing settings' : 'Show drawing settings'} aria-label={showSettingsPanel ? 'Hide drawing settings' : 'Show drawing settings'} aria-expanded={showSettingsPanel} aria-controls="drawing-settings" onClick={() => setShowSettingsPanel((visible) => !visible)}><span>⚙</span></button>
          </div>
          <input ref={imageInputRef} className="image-file-input" type="file" accept="image/*" aria-label="Choose an image to import" onChange={(event) => { const file = event.target.files?.[0]; if (file) insertImageBlob(file); event.currentTarget.value = '' }} />
          <input ref={documentInputRef} className="image-file-input" type="file" accept=".ozoonotes,.doomnotes,.json,application/json,application/pdf,.pdf" aria-label="Open a OzooNotes or PDF file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openBoardFile(file); event.currentTarget.value = '' }} />
          <div className="page-navigation">
            <button aria-label="Previous page" title="Previous page" disabled={page <= 1} onClick={() => setPage(Math.max(1, page - 1))}>‹</button>
            <span>Page</span><input aria-label="Current page number" type="number" min={1} max={boards[activeBoard].pages} value={page} onChange={(event) => setPage(Math.min(boards[activeBoard].pages, Math.max(1, Number(event.target.value) || 1)))} />
            <span>of {boards[activeBoard].pages}</span>
            <button aria-label="Next page" title="Next page" disabled={page >= boards[activeBoard].pages} onClick={() => setPage(Math.min(boards[activeBoard].pages, page + 1))}>›</button>
          </div>

          {showSettingsPanel && <aside id="drawing-settings" ref={settingsPanelRef} className="stroke-panel" aria-label="Selection and drawing settings">
            {inkTools.includes(activeTool) && <div className="settings-group"><div className="settings-heading">Color</div><div className="selection-colors">{penColors.concat(['#cf78e9','#d99c3d','#188c73','#e43141']).map((color) => <button key={color} type="button" aria-label={`Stroke color ${color}`} aria-pressed={activeColor === color} className={`selection-color ${activeColor === color ? 'chosen' : ''}`} style={{ backgroundColor: color }} onClick={() => { setActiveColor(color); changeSelection({ color }) }} />)}</div></div>}
            {!infinitePage && <div className="settings-group"><div className="settings-heading">Background</div><div className="settings-swatches">{pageColors.map((color) => <button key={color} type="button" aria-label={pageBackgroundLabel(color)} aria-pressed={pageBackground === color} className={`settings-swatch ${pageBackground === color ? 'chosen' : ''}`} style={pageBackgroundSwatchStyle(color)} onClick={() => setActiveBackground(color)} />)}</div></div>}
            <div className="settings-group opacity-group"><label className="settings-heading" htmlFor="stroke-width">Stroke width</label><input id="stroke-width" type="range" min="1" max="16" step="1" value={strokeWidth} onChange={(event) => { const width = Number(event.target.value); setStrokeWidth(width); changeSelection({ width }) }} /><div className="opacity-labels"><span>1</span><span>{strokeWidth}px</span><span>16</span></div><div className="stroke-sizes">{[['S',2],['M',4],['L',7],['XL',12]].map(([name,width]) => <button key={name} className={strokeWidth === width ? 'selected' : ''} onClick={() => { setStrokeWidth(width as number); changeSelection({ width: width as number }) }}>{name}</button>)}</div></div>
            <div className="selection-actions" aria-label="Object ordering and selection actions"><button title="Duplicate" aria-label="Duplicate" disabled={!selectedIndices.length} onClick={duplicateSelection}>▢</button><button title="Send backward" aria-label="Send backward" disabled={!selectedIndices.length} onClick={() => moveSelectionLayer('back')}>▱</button><button title="Bring forward" aria-label="Bring forward" disabled={!selectedIndices.length} onClick={() => moveSelectionLayer('front')}>▰</button><button title="Delete" aria-label="Delete" disabled={!selectedIndices.length} onClick={deleteSelection}>▧</button></div>
            {activeTool === 'Shape' && <div className="settings-group"><div className="settings-heading">Shape</div><div className="shape-options">{(['Rectangle', 'Ellipse', 'Triangle', 'Diamond', 'Arrow'] as ShapeKind[]).map((kind) => <button key={kind} className={`shape-option ${shapeKind === kind ? 'selected' : ''}`} aria-pressed={shapeKind === kind} onClick={() => setShapeKind(kind)}>{kind}</button>)}</div></div>}
            <div className="settings-group opacity-group"><label className="settings-heading" htmlFor="stroke-opacity">Opacity</label><input id="stroke-opacity" type="range" min="0" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /><div className="opacity-labels"><span>{opacity === 0 ? 0 : opacity}</span><span>100</span></div></div>
          </aside>}

          <div className={`workspace ${zoom > 100 ? 'zoomed' : ''}`}>
            <div className={`paper ${orientation} ${infinitePage ? 'infinite' : ''} ${gridEnabled ? 'grid-enabled' : ''} ${showScale ? 'scale-enabled' : ''}`} style={{ zoom: zoom / 100, ...(infinitePage ? { width: '2400px', aspectRatio: '1 / 1' } : { backgroundColor: resolvePageBackground(pageBackground, dark), aspectRatio: `${orientedPageMm[0]} / ${orientedPageMm[1]}` }) }} aria-label={infinitePage ? 'Infinite whiteboard' : `${pageSize} ${orientation} page`}>
              {showScale && !infinitePage && <div className="rulers" aria-label={`Ruler in ${rulerUnit}`} aria-hidden="true"><div className="ruler-top">{rulerTicks(orientedPageMm[0], rulerUnit).map((tick, index) => <span key={index} style={{ left: `${tick.position}%` }}>{tick.label}</span>)}</div><div className="ruler-left">{rulerTicks(orientedPageMm[1], rulerUnit).map((tick, index) => <span key={index} style={{ top: `${tick.position}%` }}>{tick.label}</span>)}</div></div>}
              {textEditor && <textarea className="text-editor" autoFocus aria-label="Text to add to page" placeholder="Type here…" value={textEditor.value} style={{ left: `${textEditor.point.x * 100}%`, top: `${textEditor.point.y * 100}%`, color: activeColor, fontSize: `${Math.max(16, strokeWidth * 5)}px` }} onChange={(event) => setTextEditor({ ...textEditor, value: event.target.value })} onBlur={() => { if (!cancelTextRef.current) commitText(); cancelTextRef.current = false }} onKeyDown={(event) => { if (event.key === 'Escape') { cancelTextRef.current = true; setTextEditor(null) } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) event.currentTarget.blur() }} />}
              <canvas ref={canvasRef} className={`drawing-canvas ${activeTool === 'Select' ? 'move-cursor' : activeTool === 'Eraser' ? 'erase-cursor' : ''}`} width={canvasWidth} height={canvasHeight} onPointerDown={startStroke} onPointerMove={continueStroke} onPointerUp={finishStroke} onPointerCancel={finishStroke} onPointerLeave={() => { if (!activeStroke.current) { setEraserHover(null); setErasePreviewIndices([]) } }} aria-label="Drawing canvas" />
            </div>
          </div>

          <div className="bottom-controls">
            <div className="zoom-control">
              <button aria-label="Zoom out" onClick={() => setZoom(Math.max(50, zoom - 10))}>−</button>
              <span className="zoom-value">{zoom}%</span>
              <button aria-label="Zoom in" onClick={() => setZoom(Math.min(150, zoom + 10))}>+</button>
            </div>
            <div className="history-controls" aria-label="Edit history">
              <button aria-label="Undo (Ctrl+Z)" title="Undo · Ctrl+Z" disabled={!historyState.canUndo} onClick={undo}>Undo</button>
              <button aria-label="Redo (Ctrl+Shift+Z)" title="Redo · Ctrl+Shift+Z" disabled={!historyState.canRedo} onClick={redo}>Redo</button>
            </div>
            <div className="page-actions">
              {!infinitePage && <label className="orientation-select"><span className="orientation-icon">▯</span><select value={orientation} onChange={(event) => setActiveOrientation(event.target.value as 'portrait' | 'landscape')} aria-label="Page orientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>}
              {!infinitePage && <button className="add-page" onClick={addPage}><span>+</span> Add page</button>}
            </div>
          </div>
          <div className={`tool-status autosave-${autoSaveStatus}`} role="status"><span className="status-dot" />{autoSaveStatus === 'saving' ? 'Saving locally…' : autoSaveStatus === 'saved' ? 'Saved locally' : autoSaveStatus === 'error' ? 'Auto-save failed · use Save' : 'Not saved yet'}{selectedIndices.length ? ` · ${selectedIndices.length} selected` : ''} · {activeTool}</div>
        </section>
      </div>
      {newFileDialog}
      {!localOnly && accountDialog}
      {!localOnly && shareDialog}
      {!localOnly && commentsDialog}
      {!localOnly && teamDialog}
      {libraryDialog}
      {!localOnly && cloudSaveDialog}
      {graphDialog}
    </main>
  )
}

export default App


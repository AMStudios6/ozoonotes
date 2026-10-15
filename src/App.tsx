import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type WheelEvent, type CSSProperties } from 'react'
import './App.css'
import notesPng from './assets/notes.png'
import downloadPng from './assets/download.png'
import folderPng from './assets/folder.png'
import StudentSpace from './StudentSpace'
import CppSimulator from './CppSimulator'
import CodeSimulator from './CodeSimulator'
import CircuitSimulator from './CircuitSimulator'
import { installAppContextMenu } from './contextMenu'

type Tool = 'Brush' | 'Pencil' | 'Pen' | 'Marker' | 'Highlighter' | 'Hand' | 'Select' | 'Shape' | 'Text' | 'Line' | 'Eraser'
type IconName = 'brush' | 'pencil' | 'pen' | 'marker' | 'highlighter' | 'hand' | 'select' | 'shape' | 'text' | 'line' | 'eraser' | 'image' | 'graph' | 'settings' | 'undo' | 'redo' | 'delete' | 'duplicate' | 'layer' | 'addPage' | 'portrait' | 'landscape' | 'zoomIn' | 'zoomOut' | 'next' | 'previous' | 'notes' | 'study' | 'lesson' | 'worksheet' | 'diagram' | 'share' | 'cloud' | 'sun' | 'moon' | 'close' | 'menu' | 'pdf' | 'chevronDown'
type AudienceRole = 'student' | 'teacher'
type ColorTheme = 'forest' | 'purple' | 'white-purple' | 'red-white' | 'red-black' | 'doom'
type ShapeKind = 'Rectangle' | 'Ellipse' | 'Triangle' | 'Diamond' | 'Arrow'
type RulerUnit = 'mm' | 'cm' | 'in'
type PageSize = 'Infinite' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | 'Tabloid'
type PageTemplate = 'Blank' | 'Lined notes' | 'Graph paper' | 'Cornell notes' | 'Weekly planner' | 'Lesson plan' | 'Worksheet' | 'Class diagram' | 'Exit ticket' | 'Rubric' | 'Seating chart' | 'Mood board' | 'Coding notes'
type SectionTitle = { id: string; title: string; page: number }
type LayerName = 'writing' | 'text' | 'images'
type DrawingStyle = 'solid' | 'handwriting' | 'dashed' | 'dotted' | 'calligraphy'
type Board = { name: string; pages: number; pageSize?: PageSize; infinite?: boolean; orientation?: 'portrait' | 'landscape'; pageOrientations?: ('portrait' | 'landscape')[]; pageBackground?: string; notebook?: string; tags?: string[]; titles?: SectionTitle[]; hiddenLayers?: LayerName[] }
type ScratchItem = { id: string; text: string; done: boolean }
type CloudUser = { id: number; username: string }
type BoardState = { pages: number; pageSize?: PageSize; infinite?: boolean; orientation: 'portrait' | 'landscape'; pageOrientations?: ('portrait' | 'landscape')[]; pageBackground: string; gridEnabled?: boolean; showScale?: boolean; hiddenLayers?: LayerName[]; pageStrokes: Stroke[][] }
type EncryptedBoardState = { encrypted: 'doomnotes-aes-gcm'; version: 1; kdf: 'PBKDF2-SHA-256'; iterations: number; salt: string; iv: string; ciphertext: string }
type CloudBoard = { id: number; name: string; folderId: number | null; state: BoardState | EncryptedBoardState; role?: string; ownerName?: string }
type CloudComment = { id: number; username: string; body: string; createdAt: string }
type LibraryItem = { id: string; name: string; strokes: Stroke[] }
type Point = { x: number; y: number }
type Stroke = { tool: 'Brush' | 'Pencil' | 'Pen' | 'Marker' | 'Highlighter' | 'Shape' | 'Line' | 'Text' | 'Image' | 'Eraser'; color: string; width: number; opacity: number; points: Point[]; text?: string; shapeKind?: ShapeKind; cornerRadius?: number; imageData?: string; layer?: LayerName; drawingStyle?: DrawingStyle }
type MoveSession = { indices: number[]; start: Point; originals: Stroke[]; preview: Stroke[] }
type SelectionBox = { start: Point; current: Point }
const penColors = ['#8b5cf6', '#18202a', '#e65353', '#ee8b33', '#48a879', '#378cdb', '#9762d5']
const pageColors = ['auto', 'white', '#19171e', '#fff9e8', '#e9f2ff', '#f3e9ff']
function themedCanvasBackground(theme: ColorTheme) {
  return theme === 'doom' ? '#090d0a' : theme === 'red-black' ? '#130909' : '#08060d'
}
const colorThemes: { id: ColorTheme; name: string; dark: boolean }[] = [
  { id: 'forest', name: 'Forest & Mint', dark: true },
  { id: 'purple', name: 'Purple & Black', dark: true },
  { id: 'white-purple', name: 'White & Purple', dark: false },
  { id: 'red-white', name: 'Red & White', dark: false },
  { id: 'red-black', name: 'Red & Black', dark: true },
  { id: 'doom', name: 'Doom • Emerald Armor', dark: true },
]
function makeTemplateStrokes(template: PageTemplate, size: PageSize, orientation: 'portrait' | 'landscape', theme: ColorTheme = 'forest'): Stroke[] {
  if (template === 'Blank') return []
  const dimensions = size === 'Infinite' ? [210, 297] : pageDimensionsMm[size]
  const [widthMm, heightMm] = orientation === 'landscape' ? [dimensions[1], dimensions[0]] : dimensions
  const accent = theme === 'purple' || theme === 'white-purple' ? (theme === 'purple' ? '#bd8bff' : '#8246c1') : theme === 'red-white' ? '#c13e47' : theme === 'red-black' ? '#ff7777' : theme === 'doom' ? '#63e978' : '#73d5b2'
  const soft = '#a3b1a7'
  const textScale = pageContentScale(size)
  const line = (x1: number, y1: number, x2: number, y2: number, color = soft, opacity = 42, width = 0.8): Stroke => ({ tool: 'Line', color, width, opacity, points: [{ x: x1 / widthMm, y: y1 / heightMm }, { x: x2 / widthMm, y: y2 / heightMm }] })
  const text = (value: string, xMm: number, yMm: number, width = 3): Stroke => ({ tool: 'Text', color: accent, width: width * textScale, opacity: 100, text: value, points: [{ x: xMm / widthMm, y: yMm / heightMm }] })
  const lines: Stroke[] = []
  if (template === 'Lined notes') {
    for (let y = 22; y < heightMm - 10; y += 8) lines.push(line(12, y, widthMm - 10, y))
    lines.push(line(24, 12, 24, heightMm - 10, accent, 54, 1))
  } else if (template === 'Graph paper') {
    for (let x = 10; x < widthMm - 9; x += 10) lines.push(line(x, 10, x, heightMm - 10, soft, 38, 0.65))
    for (let y = 10; y < heightMm - 9; y += 10) lines.push(line(10, y, widthMm - 10, y, soft, 38, 0.65))
  } else if (template === 'Cornell notes') {
    const summaryTop = heightMm - 48
    lines.push(line(14, 30, widthMm - 12, 30, accent, 58, 1), line(widthMm * 0.32, 30, widthMm * 0.32, summaryTop, accent, 58, 1), line(14, summaryTop, widthMm - 12, summaryTop, accent, 58, 1))
    for (let y = 40; y < summaryTop - 4; y += 8) lines.push(line(14, y, widthMm - 12, y))
    for (let y = summaryTop + 8; y < heightMm - 10; y += 8) lines.push(line(14, y, widthMm - 12, y))
  } else if (template === 'Weekly planner') {
    const top = 24, bottom = heightMm - 14, rowHeight = (bottom - top) / 7
    const divider = widthMm * 0.22
    lines.push(text('WEEKLY PLAN', 14, 9, 3.4), line(14, top, widthMm - 12, top, accent, 58, 1), line(divider, top, divider, bottom, accent, 58, 1))
    const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
    days.forEach((day, index) => {
      const y = top + rowHeight * (index + 1)
      lines.push(line(14, y, widthMm - 12, y))
      lines.push(text(day, 16, top + rowHeight * index + rowHeight * 0.35, 2.8))
    })
  } else if (template === 'Lesson plan') {
    const divider = widthMm * 0.34
    lines.push(text('LESSON PLAN', 14, 10, 3.6), text('OBJECTIVE', 14, 30, 2.8), text('MATERIALS', divider + 5, 30, 2.8), line(14, 25, widthMm - 14, 25, accent, 58, 1), line(divider, 27, divider, 105, accent, 50, 0.9))
    for (let y = 42; y <= 98; y += 12) lines.push(line(14, y, divider - 5, y), line(divider + 5, y, widthMm - 14, y))
    lines.push(text('LESSON FLOW', 14, 118, 2.8))
    for (let y = 132; y < heightMm - 12; y += 16) lines.push(line(14, y, widthMm - 14, y))
  } else if (template === 'Worksheet') {
    lines.push(text('WORKSHEET', 14, 9, 3.6), text('Name:', 14, 25, 2.8), line(31, 32, widthMm * 0.62, 32), text('Date:', widthMm * 0.68, 25, 2.8), line(widthMm * 0.79, 32, widthMm - 14, 32, soft, 42, 0.8))
    for (let question = 0, y = 52; y < heightMm - 35; question++, y += 42) {
      lines.push(text(`${question + 1}.`, 14, y, 3), line(25, y + 6, widthMm - 14, y + 6, accent, 48, 0.9), line(25, y + 20, widthMm - 14, y + 20), line(25, y + 32, widthMm - 14, y + 32))
    }
  } else if (template === 'Coding notes') {
    const left = 14, right = widthMm - 14
    const split = left + (right - left) * 0.43
    const footerTop = heightMm * 0.82
    const rowGap = Math.max(7, heightMm / 38)
    lines.push(
      text('CODING NOTES', left, 10, 3.7),
      text('LANGUAGE / TOPIC', left, 26, 2.3),
      line(left, 34, right, 34, accent, 58, 1),
      text('THEORY & EXPLANATION', left, 41, 2.0),
      text('CODE EXAMPLE', split + 5, 41, 2.0),
      line(left, 47, right, 47, accent, 48, 0.8),
      line(split, 49, split, footerTop - 7, soft, 38, 0.8),
      text('OUTPUT / TEST NOTES', left, footerTop, 2.1),
      line(left, footerTop + 8, right, footerTop + 8, soft, 42, 0.7),
      line(left, footerTop + 16, right, footerTop + 16, soft, 42, 0.7),
    )
    for (let row = 0, y = 57; y < footerTop - 10; row++, y += rowGap) {
      lines.push(line(left, y, split - 5, y, soft, 34, 0.55))
      lines.push(text(String(row + 1).padStart(2, '0'), split + 4, y - 2, 1.35))
      lines.push(line(split + 14, y, right, y, soft, 27, 0.5))
    }
  } else if (template === 'Class diagram') {
    const centerX = widthMm / 2, centerY = heightMm / 2
    lines.push(text('CONCEPT MAP', 14, 10, 3.4), line(centerX, 42, centerX, heightMm - 42, soft, 34, 0.7), line(22, centerY, widthMm - 22, centerY, soft, 34, 0.7), line(centerX, 42, widthMm * 0.25, heightMm * 0.25, accent, 52, 1), line(centerX, 42, widthMm * 0.75, heightMm * 0.25, accent, 52, 1), line(centerX, heightMm - 42, widthMm * 0.25, heightMm * 0.75, accent, 52, 1), line(centerX, heightMm - 42, widthMm * 0.75, heightMm * 0.75, accent, 52, 1))
  } else if (template === 'Exit ticket') {
    lines.push(text('EXIT TICKET', 14, 10, 3.6), text('Name:', 14, 27, 2.8), line(32, 34, widthMm - 14, 34, soft, 42, 0.8))
    const prompts = ['ONE THING I LEARNED', 'ONE QUESTION I STILL HAVE', 'AN EXAMPLE OR CONNECTION']
    prompts.forEach((label, index) => {
      const top = 52 + index * Math.max(46, (heightMm - 105) / 3)
      lines.push(text(label, 14, top, 2.7), line(14, top + 15, widthMm - 14, top + 15, accent, 46, 0.9), line(14, top + 30, widthMm - 14, top + 30), line(14, top + 42, widthMm - 14, top + 42))
    })
  } else if (template === 'Rubric') {
    const top = 42, bottom = heightMm - 20, columns = 4, rows = 6
    lines.push(text('ASSESSMENT RUBRIC', 14, 10, 3.5), text('CRITERIA', 14, 27, 2.4))
    for (let column = 0; column <= columns; column++) {
      const x = 14 + (widthMm - 28) * column / columns
      lines.push(line(x, top, x, bottom, accent, 44, 0.8))
    }
    for (let row = 0; row <= rows; row++) {
      const y = top + (bottom - top) * row / rows
      lines.push(line(14, y, widthMm - 14, y, accent, row === 0 ? 56 : 38, row === 0 ? 1 : 0.75))
    }
  } else if (template === 'Seating chart') {
    const columns = 4, rows = 5, gapX = (widthMm - 36) / columns, gapY = Math.min(38, (heightMm - 70) / rows)
    lines.push(text('SEATING CHART', 14, 10, 3.5))
    for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
      const x = 14 + column * gapX, y = 40 + row * gapY
      lines.push(line(x, y, x + gapX - 7, y, accent, 48, 0.8), line(x, y, x, y + gapY - 8, accent, 48, 0.8), line(x + gapX - 7, y, x + gapX - 7, y + gapY - 8, accent, 48, 0.8), line(x, y + gapY - 8, x + gapX - 7, y + gapY - 8, accent, 48, 0.8))
    }
  } else if (template === 'Mood board') {
    const portrait = heightMm >= widthMm
    const columns = portrait ? 2 : 3
    const rows = portrait ? (heightMm >= 280 ? 3 : 2) : (heightMm < 180 ? 1 : 2)
    const top = heightMm < 180 ? 34 : 45
    const footer = heightMm < 180 ? 22 : 48
    const bottom = heightMm - footer
    const gap = 6
    const cardWidth = (widthMm - 28 - gap * (columns - 1)) / columns
    const cardHeight = (bottom - top - gap * (rows - 1)) / rows
    const swatches = ['#e5a45b', '#e77a78', '#80b99a', '#7197c9', '#a487c8']
    const ellipse = (x: number, y: number, diameter: number, color: string, width = 1.3): Stroke => ({ tool: 'Shape', shapeKind: 'Ellipse', color, width, opacity: 78, points: [{ x: x / widthMm, y: y / heightMm }, { x: (x + diameter) / widthMm, y: (y + diameter) / heightMm }] })
    const outline = (x: number, y: number, w: number, h: number, color: string, opacity = 62) => [line(x, y, x + w, y, color, opacity), line(x + w, y, x + w, y + h, color, opacity), line(x + w, y + h, x, y + h, color, opacity), line(x, y + h, x, y, color, opacity)]
    lines.push(text('MOOD BOARD', 14, 9, 3.8), text('THEME / PROJECT', 14, 27, 2.7), line(14, 37, widthMm - 14, 37, accent, 48, 0.9))
    for (let index = 0; index < columns * rows; index++) {
      const column = index % columns, row = Math.floor(index / columns)
      const x = 14 + column * (cardWidth + gap), y = top + row * (cardHeight + gap)
      lines.push(...outline(x, y, cardWidth, cardHeight, accent), text(`IMAGE / REF ${index + 1}`, x + 3, y + 3, 1.8))
      const baseY = y + cardHeight * 0.77
      lines.push(line(x + cardWidth * 0.12, baseY, x + cardWidth * 0.38, baseY - cardHeight * 0.22, soft, 42, 0.8), line(x + cardWidth * 0.38, baseY - cardHeight * 0.22, x + cardWidth * 0.55, baseY - cardHeight * 0.08, soft, 42, 0.8), line(x + cardWidth * 0.55, baseY - cardHeight * 0.08, x + cardWidth * 0.73, baseY - cardHeight * 0.31, soft, 42, 0.8), line(x + cardWidth * 0.73, baseY - cardHeight * 0.31, x + cardWidth * 0.88, baseY, soft, 42, 0.8))
    }
    const paletteY = heightMm - (heightMm < 180 ? 13 : 34)
    lines.push(text('COLOR PALETTE', 14, paletteY, 2.1))
    const swatchDiameter = Math.max(4, Math.min(8, heightMm / 34))
    const swatchStart = widthMm * 0.42
    swatches.forEach((color, index) => lines.push(ellipse(swatchStart + index * (swatchDiameter + 5), paletteY - 1, swatchDiameter, color, 1.8)))
    if (heightMm >= 180) lines.push(text('WORDS / NOTES', 14, heightMm - 18, 2.2), line(44, heightMm - 14, widthMm - 14, heightMm - 14, soft, 42, 0.7))
  }
  return lines
}
function resolvePageBackground(background: string, dark: boolean, theme: ColorTheme = 'forest') {
  if (background === 'auto' || background === '#ffffff') return dark ? themedCanvasBackground(theme) : '#ffffff'
  if (background === 'white') return '#ffffff'
  return background
}
function pageBackgroundSwatchStyle(background: string): React.CSSProperties {
  if (background === 'auto') return { background: 'linear-gradient(135deg, var(--workspace) 50%, #fff 50%)' }
  return { backgroundColor: background === 'white' ? '#ffffff' : background }
}
function isBackgroundChoiceSelected(current: string, choice: string) {
  return current === choice || (choice === 'auto' && current === '#ffffff')
}
function pageBackgroundLabel(background: string) {
  if (background === 'auto') return 'Page background follows theme'
  if (background === 'white') return 'Page background white'
  return 'Page background ' + background
}
function gridLineColor(dark: boolean, theme: ColorTheme = 'forest') {
  if (theme === 'red-black' || theme === 'red-white') return dark ? 'rgba(245, 92, 92, .48)' : 'rgba(194, 44, 52, .30)'
  if (theme === 'doom') return dark ? 'rgba(92, 220, 117, .46)' : 'rgba(38, 136, 57, .30)'
  if (theme === 'forest') return dark ? 'rgba(115, 213, 178, .46)' : 'rgba(20, 124, 97, .30)'
  return dark ? 'rgba(189, 139, 255, .48)' : 'rgba(130, 70, 193, .34)'
}
const inkTools: Tool[] = ['Brush', 'Pen', 'Pencil', 'Marker', 'Highlighter']
const drawingToolGroup: Tool[] = [...inkTools, 'Eraser']
const imageCache = new Map<string, HTMLImageElement>()
const pageDimensionsMm: Record<Exclude<PageSize, 'Infinite'>, [number, number]> = {
  A1: [594, 841], A2: [420, 594], A3: [297, 420], A4: [210, 297], A5: [148, 210],
  Letter: [216, 279], Legal: [216, 356], Tabloid: [279, 432],
}
const pageSizes: PageSize[] = ['A1', 'A2', 'A3', 'A4', 'A5', 'Letter', 'Legal', 'Tabloid', 'Infinite']
function pageContentScale(size: PageSize) {
  if (size === 'Infinite') return 1
  const [width, height] = pageDimensionsMm[size]
  return Math.sqrt((width * height) / (210 * 297))
}
function normalizeBoardName(name: string) {
  return name.trim().normalize('NFKC').toLocaleLowerCase()
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

function shapeGeometry(kind: ShapeKind, first: Point, last: Point, cornerRadius = 0) {
  const left = Math.min(first.x, last.x)
  const right = Math.max(first.x, last.x)
  const top = Math.min(first.y, last.y)
  const bottom = Math.max(first.y, last.y)
  const centerX = (left + right) / 2
  const centerY = (top + bottom) / 2
  let polygon: Point[] | null = null
  if (kind === 'Rectangle') polygon = [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]
  if (kind === 'Triangle') polygon = [{ x: centerX, y: top }, { x: right, y: bottom }, { x: left, y: bottom }]
  if (kind === 'Diamond') polygon = [{ x: centerX, y: top }, { x: right, y: centerY }, { x: centerX, y: bottom }, { x: left, y: centerY }]
  if (polygon) {
    const radius = Math.min(right - left, bottom - top) * Math.max(0, Math.min(30, cornerRadius)) / 100
    if (!radius) return { points: polygon, closed: true }
    const points: Point[] = []
    polygon.forEach((vertex, index) => {
      const previous = polygon![(index + polygon!.length - 1) % polygon!.length]
      const next = polygon![(index + 1) % polygon!.length]
      const inLength = Math.hypot(previous.x - vertex.x, previous.y - vertex.y)
      const outLength = Math.hypot(next.x - vertex.x, next.y - vertex.y)
      const distance = Math.min(radius, inLength / 2, outLength / 2)
      const incoming = { x: vertex.x + (previous.x - vertex.x) * distance / inLength, y: vertex.y + (previous.y - vertex.y) * distance / inLength }
      const outgoing = { x: vertex.x + (next.x - vertex.x) * distance / outLength, y: vertex.y + (next.y - vertex.y) * distance / outLength }
      points.push(incoming)
      for (let step = 1; step <= 6; step++) {
        const t = step / 6, inverse = 1 - t
        points.push({ x: inverse * inverse * incoming.x + 2 * inverse * t * vertex.x + t * t * outgoing.x, y: inverse * inverse * incoming.y + 2 * inverse * t * vertex.y + t * t * outgoing.y })
      }
    })
    return { points, closed: true }
  }
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
      ? shapeGeometry(stroke.shapeKind, stroke.points[0], stroke.points[stroke.points.length - 1], stroke.cornerRadius).points.map(toCanvas)
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

function strokeLayer(stroke: Stroke): LayerName { return stroke.layer ?? (stroke.tool === 'Text' ? 'text' : stroke.tool === 'Image' ? 'images' : 'writing') }
function renderDrawings(canvas: HTMLCanvasElement, drawings: Stroke[], selected: number[] = [], erasePreview: number[] = [], eraserPoint?: Point, eraserRadius = 0, cameraOffset: Point = { x: 0, y: 0 }, selectionBox?: SelectionBox, hiddenLayers: LayerName[] = []) {
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.save()
  context.translate(-cameraOffset.x * canvas.width, -cameraOffset.y * canvas.height)
  for (const [drawingIndex, drawing] of drawings.entries()) {
    if (!drawing.points.length || drawing.tool === 'Eraser' || hiddenLayers.includes(strokeLayer(drawing))) continue
    const first = drawing.points[0]
    const last = drawing.points[drawing.points.length - 1]
    context.strokeStyle = drawing.color
    context.fillStyle = drawing.color
    context.lineWidth = drawing.width
    context.lineCap = drawing.drawingStyle === 'calligraphy' ? 'square' : 'round'
    context.lineJoin = 'round'
    context.setLineDash(drawing.drawingStyle === 'dashed' ? [drawing.width * 2.5, drawing.width * 1.8] : drawing.drawingStyle === 'dotted' ? [drawing.width * .15, drawing.width * 1.8] : [])
    if (drawing.drawingStyle === 'calligraphy') context.lineWidth *= 1.7
    context.globalAlpha = drawing.opacity / 100 * (drawing.tool === 'Pencil' ? 0.62 : drawing.tool === 'Marker' ? 0.82 : drawing.tool === 'Highlighter' ? 0.24 : 1)
    if (erasePreview.includes(drawingIndex)) context.globalAlpha *= 0.3
    if (drawing.tool === 'Image' && drawing.imageData && drawing.points.length > 1) {
      const image = getImage(drawing.imageData, () => renderDrawings(canvas, drawings, selected, erasePreview, eraserPoint, eraserRadius, cameraOffset, undefined, hiddenLayers))
      if (image.complete && image.naturalWidth) context.drawImage(image, first.x * canvas.width, first.y * canvas.height, (last.x - first.x) * canvas.width, (last.y - first.y) * canvas.height)
    } else if (drawing.tool === 'Text') {
      context.font = `${Math.max(8, drawing.width * 5)}px sans-serif`
      context.textBaseline = 'top'
      context.fillText(drawing.text ?? '', first.x * canvas.width, first.y * canvas.height)
    } else if (drawing.tool === 'Shape') {
      const geometry = shapeGeometry(drawing.shapeKind ?? 'Rectangle', first, last, drawing.cornerRadius)
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
      } else if (drawing.drawingStyle === 'handwriting' && drawing.points.length > 2) {
        for (let index = 1; index < drawing.points.length - 1; index++) {
          const point = drawing.points[index], next = drawing.points[index + 1]
          context.quadraticCurveTo(point.x * canvas.width, point.y * canvas.height, (point.x + next.x) * canvas.width / 2, (point.y + next.y) * canvas.height / 2)
        }
        const lastPoint = drawing.points[drawing.points.length - 1]
        context.lineTo(lastPoint.x * canvas.width, lastPoint.y * canvas.height)
      } else {
        for (const point of drawing.points.slice(1)) context.lineTo(point.x * canvas.width, point.y * canvas.height)
      }
      context.stroke()
    }
    if (selected.includes(drawingIndex) && !erasePreview.includes(drawingIndex)) {
      context.save()
      context.globalAlpha = 1
      context.strokeStyle = '#a977eb'
      context.fillStyle = 'transparent'
      context.lineWidth = 2
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
      context.strokeRect(boxX, boxY, boxWidth, boxHeight)
      context.restore()
    }
  }
  if (selectionBox) {
    context.save()
    context.globalAlpha = 1
    context.fillStyle = 'rgba(169, 119, 235, .12)'
    context.strokeStyle = '#a977eb'
    context.lineWidth = 1.5
    context.setLineDash([6, 4])
    const left = Math.min(selectionBox.start.x, selectionBox.current.x) * canvas.width
    const top = Math.min(selectionBox.start.y, selectionBox.current.y) * canvas.height
    const width = Math.abs(selectionBox.current.x - selectionBox.start.x) * canvas.width
    const height = Math.abs(selectionBox.current.y - selectionBox.start.y) * canvas.height
    context.fillRect(left, top, width, height)
    context.strokeRect(left, top, width, height)
    context.restore()
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
  context.restore()
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

const toolIcons: Record<Tool, IconName> = { Brush: 'brush', Pencil: 'pencil', Pen: 'pen', Marker: 'marker', Highlighter: 'highlighter', Hand: 'hand', Select: 'select', Shape: 'shape', Text: 'text', Line: 'line', Eraser: 'eraser' }
const roleTemplates: Record<AudienceRole, PageTemplate[]> = {
  student: ['Blank', 'Lined notes', 'Cornell notes', 'Graph paper', 'Weekly planner', 'Coding notes', 'Mood board'],
  teacher: ['Blank', 'Lesson plan', 'Worksheet', 'Class diagram', 'Exit ticket', 'Rubric', 'Seating chart', 'Weekly planner', 'Lined notes', 'Graph paper', 'Coding notes', 'Mood board'],
}
const roleStarters: Record<AudienceRole, { title: string; description: string; fileName: string; template: PageTemplate; icon: IconName }[]> = {
  student: [
    { title: 'Class notes', description: 'Capture key ideas and review them later.', fileName: 'Class notes', template: 'Cornell notes', icon: 'notes' },
    { title: 'Study guide', description: 'Build a tidy page for revision.', fileName: 'Study guide', template: 'Lined notes', icon: 'study' },
    { title: 'Concept map', description: 'Connect topics with sketches and shapes.', fileName: 'Concept map', template: 'Graph paper', icon: 'diagram' },
    { title: 'Weekly planner', description: 'Plan assignments and study sessions.', fileName: 'Weekly planner', template: 'Weekly planner', icon: 'lesson' },
    { title: 'Blank page', description: 'Start with a clean page for any subject.', fileName: 'Student board', template: 'Blank', icon: 'addPage' },
    { title: 'Mood board', description: 'Gather visual references, colors, and ideas.', fileName: 'Mood board', template: 'Mood board', icon: 'image' },
    { title: 'Coding notes', description: 'Keep code examples beside the ideas behind them.', fileName: 'Coding notes', template: 'Coding notes', icon: 'diagram' },
  ],
  teacher: [
    { title: 'Lesson plan', description: 'Organize the flow of a class session.', fileName: 'Lesson plan', template: 'Lesson plan', icon: 'lesson' },
    { title: 'Worksheet', description: 'Prepare a clean page to print or share.', fileName: 'Worksheet', template: 'Worksheet', icon: 'worksheet' },
    { title: 'Class diagram', description: 'Explain a topic with visual connections.', fileName: 'Class diagram', template: 'Class diagram', icon: 'diagram' },
    { title: 'Exit ticket', description: 'Collect a quick reflection before class ends.', fileName: 'Exit ticket', template: 'Exit ticket', icon: 'notes' },
    { title: 'Assessment rubric', description: 'Lay out criteria and performance levels.', fileName: 'Assessment rubric', template: 'Rubric', icon: 'worksheet' },
    { title: 'Seating chart', description: 'Arrange a room plan with open desk spaces.', fileName: 'Seating chart', template: 'Seating chart', icon: 'diagram' },
    { title: 'Lesson outline', description: 'Map objectives, materials, and lesson flow.', fileName: 'Lesson outline', template: 'Lesson plan', icon: 'lesson' },
    { title: 'Mood board', description: 'Collect visual references for a class project.', fileName: 'Class mood board', template: 'Mood board', icon: 'image' },
    { title: 'Code walkthrough', description: 'Pair sample code with teaching notes and tests.', fileName: 'Code walkthrough', template: 'Coding notes', icon: 'diagram' },
  ],
}

function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    brush: <><path d="m14.5 5.5 4 4-8.7 8.7a2.8 2.8 0 0 1-4-4z"/><path d="m12.5 7.5 4 4M5.4 18.2c-1.2.2-2.3 1-2.8 2.5 2.3.4 4.5-.3 5.4-2"/></>,
    pencil: <><path d="m4 16.5 10.7-10.7a2.1 2.1 0 0 1 3 3L7 19.5 3 21z"/><path d="m12.8 7.7 3.5 3.5M4 16.5l3.5 3.5"/></>,
    pen: <><path d="m4 19 1-5L16.7 2.3a2.1 2.1 0 0 1 3 3L7 18z"/><path d="m13.5 5.5 5 5M4 19l5-1"/></>,
    marker: <><path d="m5 16 9-12a2 2 0 0 1 3.2 2.4l-9 12z"/><path d="m5 16 4.5 3.5-3 1-3-2zM13 7l4 3"/></>,
    highlighter: <><path d="m4 15 10-11a2 2 0 0 1 3 0l4 4a2 2 0 0 1 0 3L10 22H4z"/><path d="m11 8 6 6M4 18h9"/></>,
    hand: <><path d="M8 12V5a1.5 1.5 0 0 1 3 0v6-7a1.5 1.5 0 0 1 3 0v7-5a1.5 1.5 0 0 1 3 0v6l.6-2a1.6 1.6 0 0 1 3.1.8L19 19a4 4 0 0 1-4 3h-3a5 5 0 0 1-4-2l-3-4a1.7 1.7 0 0 1 2.5-2.2z"/></>,
    select: <><path d="m4 3 13 12-6 .8-2.8 5z"/><path d="m14.5 17.5 4 4"/></>,
    shape: <><rect x="3.5" y="4" width="17" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m5 18 5-5 3 3 3-4 4 5"/></>,
    text: <><path d="M4 6V4h16v2M12 4v16M8.5 20h7"/></>,
    line: <><path d="M5 19 19 5"/><path d="M12 5h7v7"/></>,
    eraser: <><path d="m7 19-3-3a2 2 0 0 1 0-2.8l8.2-8.2a2 2 0 0 1 2.8 0l6 6a2 2 0 0 1 0 2.8L16 20H7z"/><path d="m9 9 7 7M12 20h9"/></>,
    image: <><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/></>,
    graph: <><path d="M4 20V4M4 20h17"/><path d="m6 16 4-5 3 2 6-8"/><circle cx="10" cy="11" r="1"/><circle cx="13" cy="13" r="1"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.7 1l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.7-1l-1.7.6-1.4-2.4L7.3 15a8 8 0 0 1 0-2l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.7-1l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.7 1l1.7-.6 1.4 2.4-1.4 1.1a8 8 0 0 1-.1 2z"/></>,
    undo: <><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-2"/></>,
    redo: <><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h2"/></>,
    delete: <><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></>,
    duplicate: <><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></>,
    layer: <><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/></>,
    addPage: <><path d="M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z"/><path d="M13 3v7h7M12 13v6m-3-3h6"/></>,
    portrait: <><rect x="7" y="3" width="10" height="18" rx="1.5"/><path d="M10 6h4"/></>,
    landscape: <><rect x="3" y="7" width="18" height="10" rx="1.5"/><path d="M6 10v4"/></>,
    zoomIn: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M10.5 7v7m-3.5-3.5h7"/></>,
    zoomOut: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5m-14-10.5h7"/></>,
    next: <><path d="m9 5 7 7-7 7"/></>,
    previous: <><path d="m15 5-7 7 7 7"/></>,
    notes: <><path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M8 12h8m-8 4h8"/></>,
    study: <><path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H11v17H5.5A2.5 2.5 0 0 0 3 22zM21 5.5A2.5 2.5 0 0 0 18.5 3H13v17h5.5A2.5 2.5 0 0 1 21 22z"/><path d="M6 7h2m-2 4h2m10-4h-2m2 4h-2"/></>,
    lesson: <><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8m-4-3v3M7 9h10M7 13h6"/></>,
    worksheet: <><path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M8 12l1 1 2-2m2 2h3m-8 4 1 1 2-2m2 2h3"/></>,
    diagram: <><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="7" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="m8.4 7 7.1-.1M7.5 8l3.2 7.5m6-5.5-3.4 6"/></>,
    share: <><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.7 10.7 6.6-4.4m-6.6 7 6.6 4.4"/></>,
    cloud: <><path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 8.5 4.8 4.8 0 0 0 7 18z"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
    moon: <><path d="M20.4 15.6A8.5 8.5 0 0 1 8.4 3.6 8.5 8.5 0 1 0 20.4 15.6z"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
    pdf: <><path d="M12 3v12m-5-5 5 5 5-5M4 19v2h16v-2"/><path d="M5 3h7l4 4v3"/></>,
    chevronDown: <><path d="m6 9 6 6 6-6"/></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function ThemeIcon({ source, size = 18, className = '' }: { source: string; size?: number; className?: string }) {
  const mask = `url("${source}")`
  return <span className={`themed-png-icon ${className}`} style={{ width: size, height: size, maskImage: mask, WebkitMaskImage: mask }} aria-hidden="true" />
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
      const saved = JSON.parse(raw) as { name?: string; pages?: number; pageSize?: PageSize; infinite?: boolean; orientation?: 'portrait' | 'landscape'; pageOrientations?: ('portrait' | 'landscape')[]; pageBackground?: string; notebook?: string; tags?: string[]; titles?: SectionTitle[]; hiddenLayers?: LayerName[]; gridEnabled?: boolean; showScale?: boolean; pageStrokes?: Stroke[][] }
      if (typeof saved.name !== 'string' || typeof saved.pages !== 'number' || !Array.isArray(saved.pageStrokes)) return null
      return { board: { name: saved.name, pages: saved.pages, pageSize: saved.pageSize ?? 'A4', infinite: saved.infinite ?? false, orientation: saved.orientation ?? 'portrait', pageOrientations: Array.from({ length: saved.pages }, (_, index) => saved.pageOrientations?.[index] ?? saved.orientation ?? 'portrait'), pageBackground: saved.pageBackground ?? 'auto', notebook: saved.notebook ?? 'Inbox', tags: saved.tags ?? [], titles: saved.titles ?? [], hiddenLayers: saved.hiddenLayers ?? [] }, saved }
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
      orientation: activeSaved.pageOrientations?.[activePage - 1] ?? activeSaved.orientation ?? 'portrait',
      pageBackground: activeSaved.pageBackground ?? 'auto',
      gridEnabled: activeSaved.gridEnabled ?? false,
      showScale: activeSaved.showScale ?? false,
      strokesByPage,
    }
  } catch {
    return empty
  }
}


type SimulatorFormula = { id: string; expression: string; color: string; visible: boolean }

function GraphSimulator({ onBack }: { onBack: () => void }) {
  const width = 1200
  const height = 720
  const colors = ['#2f71d5', '#d84d4d', '#278c66', '#8a57c4', '#d68a2e', '#1598ab']
  const graphRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const [view, setView] = useState({ x: 0, y: 0, scale: 42 })
  const [formulas, setFormulas] = useState<SimulatorFormula[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ozoo:graph-formulas') ?? '[]')
      const valid = Array.isArray(saved) ? saved.filter((item) => item && typeof item.expression === 'string' && typeof item.color === 'string').map((item) => ({ id: String(item.id || crypto.randomUUID()), expression: item.expression, color: item.color, visible: item.visible !== false })) : []
      return valid.length ? valid : [{ id: crypto.randomUUID(), expression: '', color: colors[0], visible: true }]
    } catch { return [{ id: crypto.randomUUID(), expression: '', color: colors[0], visible: true }] }
  })

  useEffect(() => {
    localStorage.setItem('ozoo:graph-formulas', JSON.stringify(formulas))
  }, [formulas])

  const visibleX = width / view.scale
  const visibleY = height / view.scale
  const xMin = view.x - visibleX / 2
  const xMax = view.x + visibleX / 2
  const yMin = view.y - visibleY / 2
  const yMax = view.y + visibleY / 2
  const rawStep = 52 / view.scale
  const power = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const gridStep = [1, 2, 5, 10].map((factor) => factor * power).find((step) => step >= rawStep) ?? 10 * power
  const xToPx = (x: number) => width / 2 + (x - view.x) * view.scale
  const yToPx = (y: number) => height / 2 - (y - view.y) * view.scale
  const minorStep = gridStep / 5
  const minorXs: number[] = []
  const minorYs: number[] = []
  for (let x = Math.floor(xMin / minorStep) * minorStep, count = 0; x <= xMax && count < 600; x += minorStep, count++) minorXs.push(x)
  for (let y = Math.floor(yMin / minorStep) * minorStep, count = 0; y <= yMax && count < 600; y += minorStep, count++) minorYs.push(y)
  const gridXs: number[] = []
  const gridYs: number[] = []
  for (let x = Math.floor(xMin / gridStep) * gridStep, count = 0; x <= xMax && count < 400; x += gridStep, count++) gridXs.push(x)
  for (let y = Math.floor(yMin / gridStep) * gridStep, count = 0; y <= yMax && count < 400; y += gridStep, count++) gridYs.push(y)
  const addFormula = () => setFormulas((current) => [...current, { id: crypto.randomUUID(), expression: '', color: colors[current.length % colors.length], visible: true }])
  const zoom = (factor: number, anchorX = width / 2, anchorY = height / 2) => {
    setView((current) => {
      const nextScale = Math.max(5, Math.min(220, current.scale * factor))
      const worldX = current.x + (anchorX - width / 2) / current.scale
      const worldY = current.y - (anchorY - height / 2) / current.scale
      return { x: worldX - (anchorX - width / 2) / nextScale, y: worldY + (anchorY - height / 2) / nextScale, scale: nextScale }
    })
  }
  const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
    event.preventDefault()
    const rect = event.currentTarget.getBoundingClientRect()
    zoom(Math.exp(-event.deltaY * 0.0012), (event.clientX - rect.left) * width / rect.width, (event.clientY - rect.top) * height / rect.height)
  }
  const curves = formulas.filter((formula) => formula.visible && formula.expression.trim()).map((formula) => {
    let path = ''
    let penDown = false
    const expression = formula.expression.replace(/^y\s*=\s*/i, '')
    for (let index = 0; index <= 700; index++) {
      const x = xMin + (xMax - xMin) * index / 700
      try {
        const y = evaluateGraphExpression(expression, x)
        const py = yToPx(y)
        if (!Number.isFinite(py) || py < -height || py > height * 2) { penDown = false; continue }
        path += `${penDown ? 'L' : 'M'}${xToPx(x).toFixed(2)},${py.toFixed(2)} `
        penDown = true
      } catch { penDown = false }
    }
    return { ...formula, path }
  })

  return (
    <main className="graph-workspace">
      <section className="graph-simulator-page">
        <header className="graph-topbar">
          <button type="button" className="graph-back-button" onClick={onBack} aria-label="Back to notes"><span aria-hidden="true">‹</span><span>Notes</span></button>
          <div className="graph-document-title"><span className="graph-document-glyph" aria-hidden="true">ƒ</span><span>Untitled Graph</span></div>
          <div className="graph-view-controls" aria-label="Graph view controls">
            <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1.25)}>+</button>
            <span>{Math.round(view.scale / 42 * 100)}%</span>
            <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(0.8)}>−</button>
            <button type="button" className="graph-reset-button" onClick={() => setView({ x: 0, y: 0, scale: 42 })}>Reset view</button>
          </div>
        </header>
        <div className="graph-simulator-stage">
          <svg ref={graphRef} className="graph-simulator-canvas" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label="Infinite graph coordinate plane" onWheel={handleWheel}
            onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { x: event.clientX, y: event.clientY } }}
            onPointerMove={(event) => { if (!dragRef.current) return; const rect = event.currentTarget.getBoundingClientRect(); const dx = (event.clientX - dragRef.current.x) * width / rect.width; const dy = (event.clientY - dragRef.current.y) * height / rect.height; dragRef.current = { x: event.clientX, y: event.clientY }; setView((current) => ({ ...current, x: current.x - dx / current.scale, y: current.y + dy / current.scale })) }}
            onPointerUp={(event) => { dragRef.current = null; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId) }}
            onPointerCancel={() => { dragRef.current = null }}>
            <defs><clipPath id="simulator-plot-clip"><rect width={width} height={height} /></clipPath></defs>
            <rect width={width} height={height} className="graph-plot-bg" />
          <g className="graph-minor-grid">{minorXs.map((x) => <line key={`mx${x}`} x1={xToPx(x)} x2={xToPx(x)} y1="0" y2={height} />)}{minorYs.map((y) => <line key={`my${y}`} x1="0" x2={width} y1={yToPx(y)} y2={yToPx(y)} />)}</g>
            <g className="graph-grid-lines">
              {gridXs.map((x) => <line key={`gx${x}`} x1={xToPx(x)} x2={xToPx(x)} y1="0" y2={height} />)}
              {gridYs.map((y) => <line key={`gy${y}`} x1="0" x2={width} y1={yToPx(y)} y2={yToPx(y)} />)}
            </g>
            {xToPx(0) >= 0 && xToPx(0) <= width && <line className="graph-axis" x1={xToPx(0)} x2={xToPx(0)} y1="0" y2={height} />}
            {yToPx(0) >= 0 && yToPx(0) <= height && <line className="graph-axis" x1="0" x2={width} y1={yToPx(0)} y2={yToPx(0)} />}
            <g className="graph-coordinate-labels">
              {gridXs.filter((x) => x !== 0).map((x) => <text key={`xl${x}`} x={xToPx(x) + 5} y={Math.max(16, Math.min(height - 6, yToPx(0) + 17))}>{Number(x.toPrecision(4))}</text>)}
              {gridYs.filter((y) => y !== 0).map((y) => <text key={`yl${y}`} x={Math.max(6, Math.min(width - 38, xToPx(0) + 7))} y={yToPx(y) - 5}>{Number(y.toPrecision(4))}</text>)}
              {xToPx(0) >= 0 && xToPx(0) <= width && yToPx(0) >= 0 && yToPx(0) <= height && <text x={xToPx(0) + 7} y={yToPx(0) - 7}>0</text>}
            </g>
            <g clipPath="url(#simulator-plot-clip)">
              {curves.map((curve) => <path key={curve.id} d={curve.path} className="graph-equation-curve" style={{ stroke: curve.color }} />)}
            </g>
          </svg>
          <div className="graph-canvas-tools" aria-label="Graph navigation"><button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1.25)}>+</button><button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(0.8)}>−</button></div>
        </div>
        <section className="graph-expression-panel" aria-label="Expressions">
          <div className="graph-expression-toolbar">
            <div className="graph-expression-title"><button type="button" className="graph-add-expression-icon" onClick={addFormula} aria-label="Add expression" title="Add expression">+</button><h2>Expressions</h2></div>
            <span className="graph-expression-count">{formulas.filter((item) => item.expression.trim()).length} active</span>
          </div>
          <div className="graph-formula-list">
            {formulas.map((formula, index) => <div className="graph-formula-row" key={formula.id}>
              <span className="graph-formula-number">{index + 1}</span>
              <button type="button" className={`graph-formula-swatch-button ${formula.visible ? '' : 'is-hidden'}`} style={{ '--formula-color': formula.color } as CSSProperties} aria-label={formula.visible ? 'Hide formula' : 'Show formula'} title={formula.visible ? 'Hide curve' : 'Show curve'} onClick={() => setFormulas((current) => current.map((item) => item.id === formula.id ? { ...item, visible: !item.visible } : item))}><span /></button>
              <span className="graph-equation-prefix">y =</span>
              <input className="graph-formula-input" aria-label={`Formula ${index + 1}`} value={formula.expression.replace(/^y\s*=\s*/i, '')} onChange={(event) => setFormulas((current) => current.map((item) => item.id === formula.id ? { ...item, expression: event.target.value } : item))} placeholder="Enter an expression, e.g. x^2" autoComplete="off" />
              <button type="button" className="graph-formula-remove" aria-label={`Remove formula ${index + 1}`} title="Remove formula" onClick={() => setFormulas((current) => current.filter((item) => item.id !== formula.id))}>×</button>
            </div>)}
          </div>
          <p className="graph-formula-help">Use x, numbers, parentheses, + − × ÷ ^ and functions such as sin, cos, tan, sqrt, abs and log.</p>
        </section>
      </section>
    </main>
  )
}

function App() {
  useEffect(() => installAppContextMenu(), [])
  const localOnly = import.meta.env.VITE_LOCAL_ONLY === 'true'
  const [initialWorkspace] = useState(readSavedWorkspace)
  const [boards, setBoards] = useState<Board[]>(initialWorkspace.boards)
  const [notebooks, setNotebooks] = useState<string[]>(() => { try { const value = JSON.parse(localStorage.getItem('ozoo:notebooks') ?? '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] } catch { return [] } })
  const [newNotebookName, setNewNotebookName] = useState('')
  const [scratchText, setScratchText] = useState('')
  const [scratchItems, setScratchItems] = useState<ScratchItem[]>(() => { try { const value = JSON.parse(localStorage.getItem('ozoo:scratchpad') ?? '[]'); return Array.isArray(value) ? value.filter((item): item is ScratchItem => item && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.done === 'boolean') : [] } catch { return [] } })
  const [fileSearch, setFileSearch] = useState('')
  const [notebookFilter, setNotebookFilter] = useState('All notebooks')
  const [tagFilter, setTagFilter] = useState('')
  const [nextFileNumber, setNextFileNumber] = useState(() => Math.max(0, ...initialWorkspace.boards.map(({ name }) => Number(name.match(/^File (\d+)$/)?.[1] ?? 0))) + 1)
  const [activeBoard, setActiveBoard] = useState(initialWorkspace.activeBoard)
  const [activeTool, setActiveTool] = useState<Tool>('Brush')
  const [drawingToolsOpen, setDrawingToolsOpen] = useState(false)
  const [simulatorMenuOpen, setSimulatorMenuOpen] = useState(false)
  const [graphSimulatorOpen, setGraphSimulatorOpen] = useState(false)
  const [circuitSimulatorOpen, setCircuitSimulatorOpen] = useState(false)
  const [codeSimulatorMode, setCodeSimulatorMode] = useState<'cpp' | 'python' | 'java' | 'web' | null>(null)
  const [landingAudience, setLandingAudience] = useState<AudienceRole>('student')
  const [landingPageSize, setLandingPageSize] = useState<PageSize>('A4')
  const [landingTemplate, setLandingTemplate] = useState<PageTemplate>('Cornell notes')
  const [activeColor, setActiveColor] = useState(penColors[0])
  const [showSettingsPanel, setShowSettingsPanel] = useState(true)
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [drawingStyle, setDrawingStyle] = useState<DrawingStyle>('solid')
  const [opacity, setOpacity] = useState(100)
  const [pageBackground, setPageBackground] = useState(initialWorkspace.pageBackground)
  const [pageSize, setPageSize] = useState<PageSize>(initialWorkspace.pageSize)
  const [draftTemplate, setDraftTemplate] = useState<PageTemplate>('Blank')
  const [infinitePage, setInfinitePage] = useState(initialWorkspace.infinitePage)
  const [showNewFileDialog, setShowNewFileDialog] = useState(false)
  const [titleDialogOpen, setTitleDialogOpen] = useState(false)
  const [sectionTitleDraft, setSectionTitleDraft] = useState('')
  const [exportDialogOpen, setExportDialogOpen] = useState(false)
  const [exportFormat, setExportFormat] = useState<'pdf' | 'png' | 'svg'>('pdf')
  const [exportPageSelection, setExportPageSelection] = useState('')
  const [exportIncludeIndex, setExportIncludeIndex] = useState(true)
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
  const [draftNameError, setDraftNameError] = useState('')
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
  const [shapeCornerRadius, setShapeCornerRadius] = useState(0)
  const [selectedIndices, setSelectedIndices] = useState<number[]>([])
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null)
  const [eraserHover, setEraserHover] = useState<Point | null>(null)
  const [erasePreviewIndices, setErasePreviewIndices] = useState<number[]>([])
  const [textEditor, setTextEditor] = useState<{ point: Point; value: string } | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreFeaturesOpen, setMoreFeaturesOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameError, setRenameError] = useState('')
  const [timerMinutes, setTimerMinutes] = useState(25)
  const [timerSeconds, setTimerSeconds] = useState(25 * 60)
  const [timerRunning, setTimerRunning] = useState(false)
  const [screenRecordingState, setScreenRecordingState] = useState<'idle' | 'recording' | 'paused'>('idle')
  const [screenRecordingSeconds, setScreenRecordingSeconds] = useState(0)
  const [screenRecordingError, setScreenRecordingError] = useState('')
  const screenRecorderRef = useRef<MediaRecorder | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const screenChunksRef = useRef<Blob[]>([])
  const hiddenLayers = boards[activeBoard]?.hiddenLayers ?? []
  const [quickStartOpen, setQuickStartOpen] = useState(false)
  const [addPageMenuOpen, setAddPageMenuOpen] = useState(false)
  const [saveNotice, setSaveNotice] = useState('')
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [recentFiles, setRecentFiles] = useState<string[]>(() => Object.keys(localStorage).filter((key) => key.startsWith('doomnotes:')).map((key) => key.slice('doomnotes:'.length)))
  useEffect(() => {
    if (!timerRunning) return
    const interval = window.setInterval(() => setTimerSeconds((seconds) => {
      if (seconds <= 1) { setTimerRunning(false); return 0 }
      return seconds - 1
    }), 1000)
    return () => window.clearInterval(interval)
  }, [timerRunning])
  useEffect(() => {
    if (screenRecordingState !== 'recording') return
    const interval = window.setInterval(() => setScreenRecordingSeconds((seconds) => seconds + 1), 1000)
    return () => window.clearInterval(interval)
  }, [screenRecordingState])
  useEffect(() => { try { localStorage.setItem('ozoo:notebooks', JSON.stringify(notebooks)) } catch { /* Notebook organization remains optional if storage is full. */ } }, [notebooks])
  useEffect(() => { try { localStorage.setItem('ozoo:scratchpad', JSON.stringify(scratchItems)) } catch { /* Keep the board usable if browser storage is full. */ } }, [scratchItems])
  const [page, setPage] = useState(initialWorkspace.page)
  const [indexView, setIndexView] = useState(() => (initialWorkspace.boards[initialWorkspace.activeBoard]?.titles?.length ?? 0) > 1)
  const [indexPage, setIndexPage] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(initialWorkspace.orientation)
  const [colorTheme, setColorTheme] = useState<ColorTheme>(() => {
    const saved = localStorage.getItem('ozoo:color-theme') as ColorTheme | null
    return colorThemes.some((theme) => theme.id === saved) ? saved! : 'forest'
  })
  const dark = colorThemes.find((theme) => theme.id === colorTheme)?.dark ?? true
  useEffect(() => { localStorage.setItem('ozoo:color-theme', colorTheme) }, [colorTheme])
  const brandLogo = `${import.meta.env.BASE_URL}${dark ? 'ozoo-logo-white-notes.png' : 'ozoo-logo-black-notes.png'}`
  const [strokesByPage, setStrokesByPage] = useState<Record<string, Stroke[]>>(initialWorkspace.strokesByPage)
  const strokesByPageRef = useRef<Record<string, Stroke[]>>({})
  const historyByPage = useRef<Record<string, { past: Stroke[][]; future: Stroke[][] }>>({})
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false })
  const [panOffset, setPanOffset] = useState<Point>({ x: 0, y: 0 })
  const [infiniteCameraByPage, setInfiniteCameraByPage] = useState<Record<string, Point>>(() => {
    try { return JSON.parse(localStorage.getItem('ozoo:infinite-camera') ?? '{}') as Record<string, Point> } catch { return {} }
  })
  const workspaceRef = useRef<HTMLDivElement>(null)
  const activePan = useRef<{ startClient: Point; startCamera: Point; startOffset: Point } | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const brushToolRef = useRef<HTMLButtonElement>(null)
  const toolHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toolHoldTriggered = useRef(false)
  const lastDrawingTool = useRef<Tool>('Brush')
  const settingsToggleRef = useRef<HTMLButtonElement>(null)
  const settingsPanelRef = useRef<HTMLElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)
  const lastTextPoint = useRef<Point>({ x: 0.3, y: 0.3 })
  const activeStroke = useRef<Stroke | null>(null)
  const activeMove = useRef<MoveSession | null>(null)
  const activeMarquee = useRef<{ start: Point; additive: boolean; baseSelection: number[] } | null>(null)
  const selectionClipboard = useRef<{ strokes: Stroke[]; camera: Point; infinite: boolean } | null>(null)
  const cancelTextRef = useRef(false)
  const pageKey = `${activeBoard}:${page}`
  const cameraKey = `${boards[activeBoard]?.name ?? activeBoard}:${page}`
  const cameraOffset = infiniteCameraByPage[cameraKey] ?? { x: 0, y: 0 }
  const strokes = strokesByPage[pageKey] ?? []

  useEffect(() => {
    if (drawingToolGroup.includes(activeTool)) lastDrawingTool.current = activeTool
  }, [activeTool])
  useEffect(() => () => { if (toolHoldTimer.current) clearTimeout(toolHoldTimer.current) }, [])
  const startDrawingToolHold = () => {
    toolHoldTriggered.current = false
    if (toolHoldTimer.current) clearTimeout(toolHoldTimer.current)
    toolHoldTimer.current = setTimeout(() => {
      toolHoldTriggered.current = true
      setDrawingToolsOpen(true)
    }, 1000)
  }
  const cancelDrawingToolHold = () => {
    if (toolHoldTimer.current) clearTimeout(toolHoldTimer.current)
    toolHoldTimer.current = null
  }
  const selectLastDrawingTool = () => {
    cancelDrawingToolHold()
    if (toolHoldTriggered.current) { toolHoldTriggered.current = false; return }
    setActiveTool(lastDrawingTool.current)
    setShowSettingsPanel(true)
    setDrawingToolsOpen(false)
  }

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
  const toggleLayerVisibility = (layer: LayerName) => setBoards((current) => current.map((board, index) => {
    if (index !== activeBoard) return board
    const hidden = board.hiddenLayers ?? []
    return { ...board, hiddenLayers: hidden.includes(layer) ? hidden.filter((item) => item !== layer) : [...hidden, layer] }
  }))
  const clearCurrentLayer = (layer: LayerName) => {
    const count = strokes.filter((stroke) => strokeLayer(stroke) === layer).length
    if (!count || !window.confirm(`Delete ${count} ${layer === 'images' ? 'image' : layer} item${count === 1 ? '' : 's'} from this page?`)) return
    editCurrentPage((current) => current.filter((stroke) => strokeLayer(stroke) !== layer))
    setSelectedIndices([])
  }
  const duplicateSelection = () => {
    if (!selectedIndices.length) return
    const selected = selectedIndices.map((index) => strokes[index]).filter((stroke): stroke is Stroke => Boolean(stroke))
    const copies = selected.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ x: infinitePage ? point.x + 0.025 : Math.min(0.98, point.x + 0.025), y: infinitePage ? point.y + 0.025 : Math.min(0.98, point.y + 0.025) })) }))
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
    const offsetX = infinitePage ? cameraOffset.x + .5 - (minX + maxX) / 2 : Math.max(-minX, Math.min(1 - maxX, .5 - (minX + maxX) / 2))
    const offsetY = infinitePage ? cameraOffset.y + .5 - (minY + maxY) / 2 : Math.max(-minY, Math.min(1 - maxY, .5 - (minY + maxY) / 2))
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
    const state = { pages: currentBoard.pages, pageSize, infinite: infinitePage, orientation, pageOrientations: currentBoard.pageOrientations, pageBackground, gridEnabled, showScale, hiddenLayers: currentBoard.hiddenLayers ?? [], pageStrokes: Array.from({ length: currentBoard.pages }, (_, index) => strokesByPage[`${activeBoard}:${index + 1}`] ?? []) }
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
    setBoards((current) => [...current, { name: remote.name, pages: state.pages, pageSize: state.pageSize ?? 'A4', infinite: state.infinite ?? false, orientation: state.orientation, pageOrientations: state.pageOrientations, pageBackground: state.pageBackground, hiddenLayers: state.hiddenLayers ?? [] }])
    setActiveBoard(newIndex)
    setPage(1)
    setIndexView(false)
    setIndexPage(1)
    setPageSize(state.pageSize ?? 'A4')
    setInfinitePage(state.infinite ?? false)
    setOrientation(state.pageOrientations?.[0] ?? state.orientation)
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
        setBoards((current) => current.map((item, index) => index === localIndex ? { ...item, pages: remoteState.pages, pageSize: remoteState.pageSize ?? 'A4', infinite: remoteState.infinite ?? false, orientation: remoteState.orientation, pageOrientations: remoteState.pageOrientations, pageBackground: remoteState.pageBackground, hiddenLayers: remoteState.hiddenLayers ?? [] } : item))
        setStrokesByPage((current) => ({ ...current, ...Object.fromEntries(remoteState.pageStrokes.map((items, index) => [`${localIndex}:${index + 1}`, items])) }))
        if (localIndex === activeBoard) {
          setPageSize(remoteState.pageSize ?? 'A4'); setInfinitePage(remoteState.infinite ?? false); setOrientation(remoteState.pageOrientations?.[page - 1] ?? remoteState.orientation); setPageBackground(remoteState.pageBackground); setGridEnabled(remoteState.gridEnabled ?? false); setShowScale(remoteState.showScale ?? false)
        }
      }).catch(() => undefined)
    })
    stream.addEventListener('comment-added', () => { if (commentOpen) void loadComments(id).catch(() => undefined) })
    if (commentOpen) void loadComments(id).catch(() => undefined)
    return () => stream.close()
  }, [cloudUser, cloudBoardIds, activeBoard, boards, commentOpen])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) renderDrawings(canvas, strokes, selectedIndices, activeTool === 'Eraser' ? erasePreviewIndices : [], activeTool === 'Eraser' ? eraserHover ?? undefined : undefined, activeTool === 'Eraser' ? 44 : 0, infinitePage ? cameraOffset : { x: 0, y: 0 }, selectionBox ?? undefined, hiddenLayers)
  }, [strokes, orientation, selectedIndices, erasePreviewIndices, eraserHover, activeTool, infinitePage, cameraOffset.x, cameraOffset.y, selectionBox, hiddenLayers])

  useEffect(() => { strokesByPageRef.current = strokesByPage }, [strokesByPage])

  useEffect(() => { setSelectedIndices([]); refreshHistoryState(pageKey) }, [pageKey])
  useEffect(() => { const active = boards[activeBoard]; if (active) setOrientation(active.pageOrientations?.[page - 1] ?? active.orientation ?? 'portrait') }, [activeBoard, page, boards])

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
      if (!(event.ctrlKey || event.metaKey) || boards.length === 0 || sharedToken) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const key = event.key.toLowerCase()
      if (key === 'a') {
        event.preventDefault()
        setSelectedIndices(strokes.map((_, index) => index))
      } else if (key === 'c' || key === 'x') {
        if (!selectedIndices.length) return
        event.preventDefault()
        const selected = new Set(selectedIndices)
        const copied = strokes.filter((_, index) => selected.has(index)).map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) }))
        selectionClipboard.current = { strokes: copied, camera: cameraOffset, infinite: infinitePage }
        if (key === 'x') {
          editCurrentPage((current) => current.filter((_, index) => !selected.has(index)))
          setSelectedIndices([])
        }
      } else if (key === 'v') {
        const clipboard = selectionClipboard.current
        if (!clipboard?.strokes.length) return
        event.preventDefault()
        const dx = (infinitePage ? cameraOffset.x : 0) - (clipboard.infinite ? clipboard.camera.x : 0)
        const dy = (infinitePage ? cameraOffset.y : 0) - (clipboard.infinite ? clipboard.camera.y : 0)
        const pasted = clipboard.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) }))
        const firstIndex = strokes.length
        editCurrentPage((current) => [...current, ...pasted])
        setSelectedIndices(pasted.map((_, index) => firstIndex + index))
      } else if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (key === 'y') {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handleHistoryShortcut)
    return () => window.removeEventListener('keydown', handleHistoryShortcut)
  }, [pageKey, selectedIndices, strokes, infinitePage, cameraOffset.x, cameraOffset.y, boards.length, sharedToken])

  const commitText = () => {
    const editor = textEditor
    if (editor?.value.trim()) {
      const textItem: Stroke = { tool: 'Text', color: activeColor, width: strokeWidth * pageContentScale(pageSize), opacity, points: [editor.point], text: editor.value.trim(), layer: 'text' }
      editCurrentPage((current) => [...current, textItem])
    }
    setTextEditor(null)
  }

  const insertImageBlob = (blob: Blob, point = { x: lastTextPoint.current.x + (infinitePage ? cameraOffset.x : 0), y: lastTextPoint.current.y + (infinitePage ? cameraOffset.y : 0) }) => {
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
        const x = infinitePage ? point.x : Math.max(0, Math.min(1 - width, point.x))
        const y = infinitePage ? point.y : Math.max(0, Math.min(1 - height, point.y))
        const imageItem: Stroke = { tool: 'Image', color: '#ffffff', width: 1, opacity: 100, points: [{ x, y }, { x: x + width, y: y + height }], imageData, layer: 'images' }
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
    return { x: (event.clientX - bounds.left) / bounds.width + (infinitePage ? cameraOffset.x : 0), y: (event.clientY - bounds.top) / bounds.height + (infinitePage ? cameraOffset.y : 0) }
  }
  const eraserCanTarget = (stroke: Stroke, index: number) => !hiddenLayers.includes(strokeLayer(stroke)) && (!selectedIndices.length || selectedIndices.includes(index))
  const startStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    setDrawingToolsOpen(false)
    const point = pointFromEvent(event)
    const hardwareEraser = event.pointerType === 'pen' && (event.button === 5 || (event.buttons & 32) === 32)
    if (!hardwareEraser && activeTool === 'Hand') {
      const workspace = workspaceRef.current
      if (!workspace) return
      event.currentTarget.setPointerCapture(event.pointerId)
      activePan.current = { startClient: { x: event.clientX, y: event.clientY }, startCamera: cameraOffset, startOffset: panOffset }
      return
    }
    if (!hardwareEraser && activeTool === 'Text') {
      lastTextPoint.current = point
      cancelTextRef.current = false
      setTextEditor({ point, value: '' })
      return
    }
    if (!hardwareEraser && activeTool === 'Select') {
      const canvas = event.currentTarget
      const hit = strokes.map((stroke, strokeIndex) => ({ stroke, strokeIndex })).reverse().find(({ stroke }) => !hiddenLayers.includes(strokeLayer(stroke)) && hitTestObject(stroke, point, canvas.width, canvas.height))?.strokeIndex
      if (hit === undefined) {
        if (!event.shiftKey) setSelectedIndices([])
        activeMarquee.current = { start: point, additive: event.shiftKey, baseSelection: event.shiftKey ? selectedIndices : [] }
        setSelectionBox({ start: point, current: point })
        event.currentTarget.setPointerCapture(event.pointerId)
        return
      }
      setSelectionBox(null)
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
      ...(strokeTool !== 'Eraser' ? { layer: 'writing' as const, drawingStyle } : {}),
      ...(strokeTool === 'Shape' ? { shapeKind, cornerRadius: shapeCornerRadius } : {}),
    }
    activeStroke.current = stroke
    if (strokeTool !== 'Eraser') renderDrawings(event.currentTarget, [...strokes, stroke], selectedIndices, [], undefined, 0, infinitePage ? cameraOffset : { x: 0, y: 0 }, undefined, hiddenLayers)
    else {
      const candidates = strokes.map((item, index) => eraserCanTarget(item, index) && strokeTouchesEraser(item, stroke, event.currentTarget.width, event.currentTarget.height) ? index : -1).filter((index) => index >= 0)
      setEraserHover(point)
      setErasePreviewIndices(candidates)
      renderDrawings(event.currentTarget, strokes, selectedIndices, candidates, point, stroke.width, infinitePage ? cameraOffset : { x: 0, y: 0 }, undefined, hiddenLayers)
    }
  }
  const continueStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pan = activePan.current
    if (pan) {
      const dx = event.clientX - pan.startClient.x
      const dy = event.clientY - pan.startClient.y
      if (infinitePage) {
        setInfiniteCameraByPage((current) => ({ ...current, [cameraKey]: { x: pan.startCamera.x - dx / (canvasWidth * zoom / 100), y: pan.startCamera.y - dy / (canvasHeight * zoom / 100) } }))
      } else {
        setPanOffset({ x: pan.startOffset.x + dx, y: pan.startOffset.y + dy })
      }
      return
    }
    const point = pointFromEvent(event)
    if (activeMarquee.current) {
      setSelectionBox({ start: activeMarquee.current.start, current: point })
      return
    }
    if (activeMove.current) {
      const move = activeMove.current
      const allPoints = move.originals.flatMap((stroke) => stroke.points)
      const xs = allPoints.map((item) => item.x)
      const ys = allPoints.map((item) => item.y)
      const dx = infinitePage ? point.x - move.start.x : Math.max(-Math.min(...xs), Math.min(1 - Math.max(...xs), point.x - move.start.x))
      const dy = infinitePage ? point.y - move.start.y : Math.max(-Math.min(...ys), Math.min(1 - Math.max(...ys), point.y - move.start.y))
      move.preview = move.originals.map((original) => ({ ...original, points: original.points.map((item) => ({ x: item.x + dx, y: item.y + dy })) }))
      const updated = [...strokes]
      move.indices.forEach((index, offset) => { updated[index] = move.preview[offset] })
      renderDrawings(event.currentTarget, updated, move.indices, [], undefined, 0, infinitePage ? cameraOffset : { x: 0, y: 0 }, undefined, hiddenLayers)
      return
    }
    if (!activeStroke.current) {
      if (activeTool === 'Eraser') {
        setEraserHover(point)
        const eraser = { tool: 'Eraser' as const, color: '#ff535d', width: 44, opacity: 100, points: [point] }
        const candidates = strokes.map((stroke, index) => eraserCanTarget(stroke, index) && strokeTouchesEraser(stroke, eraser, event.currentTarget.width, event.currentTarget.height) ? index : -1).filter((index) => index >= 0)
        setErasePreviewIndices(candidates)
        renderDrawings(event.currentTarget, strokes, selectedIndices, candidates, point, eraser.width, infinitePage ? cameraOffset : { x: 0, y: 0 }, undefined, hiddenLayers)
      }
      return
    }
    if (activeStroke.current.tool === 'Line' && event.shiftKey) {
      const start = activeStroke.current.points[0]
      const dx = point.x - start.x, dy = point.y - start.y
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
      const length = Math.hypot(dx, dy)
      activeStroke.current.points = [start, { x: start.x + Math.cos(angle) * length, y: start.y + Math.sin(angle) * length }]
    } else if (activeStroke.current.tool === 'Line') {
      activeStroke.current.points = [activeStroke.current.points[0], point]
    } else {
      activeStroke.current.points.push(point)
    }
    if (activeStroke.current.tool !== 'Eraser') renderDrawings(event.currentTarget, [...strokes, activeStroke.current], selectedIndices, [], undefined, 0, infinitePage ? cameraOffset : { x: 0, y: 0 }, undefined, hiddenLayers)
    else {
      const eraser = activeStroke.current
      const candidates = strokes.map((stroke, index) => eraserCanTarget(stroke, index) && strokeTouchesEraser(stroke, eraser, event.currentTarget.width, event.currentTarget.height) ? index : -1).filter((index) => index >= 0)
      setEraserHover(point)
      setErasePreviewIndices(candidates)
      renderDrawings(event.currentTarget, strokes, selectedIndices, candidates, point, eraser.width, infinitePage ? cameraOffset : { x: 0, y: 0 }, undefined, hiddenLayers)
    }
  }
  const saveCurrentFile = () => {
    const payload = { ...boards[activeBoard], name: boards[activeBoard].name, pages: boards[activeBoard].pages, pageSize, infinite: infinitePage, orientation, pageOrientations: boards[activeBoard].pageOrientations, pageBackground, gridEnabled, showScale, pageStrokes: Array.from({ length: boards[activeBoard].pages }, (_, index) => strokesByPage[`${activeBoard}:${index + 1}`] ?? []) }
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

  useEffect(() => { setPanOffset({ x: 0, y: 0 }) }, [activeBoard, page])
  useEffect(() => {
    try { localStorage.setItem('ozoo:infinite-camera', JSON.stringify(infiniteCameraByPage)) } catch { /* Keep panning usable when storage is unavailable. */ }
  }, [infiniteCameraByPage])

  useEffect(() => {
    const board = boards[activeBoard]
    if (!board) { setAutoSaveStatus('idle'); return }
    setAutoSaveStatus('saving')
    const saveBoard = () => {
      const payload = { ...board, name: board.name, pages: board.pages, pageSize, infinite: board.infinite ?? infinitePage, orientation: board.orientation ?? orientation, pageOrientations: board.pageOrientations, pageBackground: board.pageBackground ?? pageBackground, gridEnabled, showScale, pageStrokes: Array.from({ length: board.pages }, (_, index) => strokesByPage[`${activeBoard}:${index + 1}`] ?? []) }
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
  const getBoardDocument = () => ({ format: 'doomnotes', version: 1, ...boards[activeBoard], name: boards[activeBoard].name, pages: boards[activeBoard].pages, pageSize, infinite: infinitePage, orientation, pageOrientations: boards[activeBoard].pageOrientations, pageBackground, gridEnabled, showScale, pageStrokes: Array.from({ length: boards[activeBoard].pages }, (_, index) => strokesByPage[`${activeBoard}:${index + 1}`] ?? []) })
  const downloadNamedBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const startScreenRecording = async () => {
    setScreenRecordingError('')
    if (!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === 'undefined') {
      setScreenRecordingError('Screen recording is not supported in this browser. Try the latest version of Chrome or Edge.')
      return
    }
    let acquiredStream: MediaStream | null = null
    try {
      acquiredStream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 30, max: 60 } }, audio: false })
      const stream = acquiredStream
      const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      screenStreamRef.current = stream
      screenRecorderRef.current = recorder
      screenChunksRef.current = []
      setScreenRecordingSeconds(0)
      const safeName = boards[activeBoard].name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'OzooNotes'
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      recorder.ondataavailable = (event) => { if (event.data.size > 0) screenChunksRef.current.push(event.data) }
      recorder.onstop = () => {
        const chunks = screenChunksRef.current
        const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' })
        if (blob.size > 0) {
          downloadNamedBlob(blob, `${safeName}-screen-recording-${stamp}.webm`)
          setSaveNotice('Screen recording downloaded')
          window.setTimeout(() => setSaveNotice(''), 3000)
        } else {
          setScreenRecordingError('The recording was empty. Try sharing a screen or window for longer.')
        }
        stream.getTracks().forEach((track) => track.stop())
        if (screenStreamRef.current === stream) screenStreamRef.current = null
        if (screenRecorderRef.current === recorder) screenRecorderRef.current = null
        screenChunksRef.current = []
        setScreenRecordingState('idle')
      }
      recorder.onerror = () => setScreenRecordingError('The recording stopped because of a capture error.')
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorder.state !== 'inactive') recorder.stop()
      }, { once: true })
      recorder.start(1000)
      setScreenRecordingState('recording')
    } catch (error) {
      acquiredStream?.getTracks().forEach((track) => track.stop())
      screenStreamRef.current = null
      screenRecorderRef.current = null
      screenChunksRef.current = []
      setScreenRecordingState('idle')
      const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
      const messages: Record<string, string> = {
        NotAllowedError: 'Screen sharing was canceled or blocked. Choose a screen or window in the picker and allow sharing if your browser asks.',
        AbortError: 'The screen picker closed before a source was selected. Try recording again and choose a screen or window.',
        NotFoundError: 'No screen or window is available to record. Connect or enable a display, then try again.',
        NotReadableError: 'The selected screen could not be captured. Close other recording or screen-sharing apps and try again.',
        SecurityError: 'Screen recording requires a secure page. Open OzooNotes over HTTPS or localhost.',
        TypeError: 'This browser could not start screen capture. Update Chrome or Edge and try again.',
        InvalidStateError: 'The recording window is not active. Focus OzooNotes and try again.',
      }
      console.error('Screen recording could not start:', error)
      setScreenRecordingError(messages[name] ?? `Could not start screen recording${name ? ` (${name})` : ''}. Check the browser’s screen-capture permissions and try again.`)
    }
  }
  const stopScreenRecording = () => {
    const recorder = screenRecorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }
  const toggleScreenRecordingPause = () => {
    const recorder = screenRecorderRef.current
    if (!recorder) return
    if (recorder.state === 'recording') {
      recorder.pause()
      setScreenRecordingState('paused')
    } else if (recorder.state === 'paused') {
      recorder.resume()
      setScreenRecordingState('recording')
    }
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
  const renderPageCanvas = async (pageStrokes: Stroke[], width = canvasWidth, height = canvasHeight, background = infinitePage ? (dark ? themedCanvasBackground(colorTheme) : '#ffffff') : resolvePageBackground(pageBackground, dark, colorTheme), camera: Point = infinitePage ? cameraOffset : { x: 0, y: 0 }) => {
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
      context.strokeStyle = gridLineColor(dark, colorTheme)
      context.lineWidth = 1
      for (let x = 40; x < width; x += 40) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke() }
      for (let y = 40; y < height; y += 40) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke() }
    }
    const drawing = window.document.createElement('canvas')
    drawing.width = width
    drawing.height = height
    renderDrawings(drawing, pageStrokes, [], [], undefined, 0, camera, undefined, hiddenLayers)
    context.drawImage(drawing, 0, 0)
    return output
  }
  const svgForPage = (pageStrokes: Stroke[], width: number, height: number, background: string, camera: Point = { x: 0, y: 0 }) => {
    const escapeXml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!)
    const gridLines: string[] = []
    if (gridEnabled && !infinitePage) {
      const gridColor = dark ? '#bd8bff' : '#8246c1'
      const gridOpacity = dark ? '.48' : '.34'
      for (let x = 40; x < width; x += 40) gridLines.push('<line x1="' + x + '" y1="0" x2="' + x + '" y2="' + height + '" stroke="' + gridColor + '" stroke-opacity="' + gridOpacity + '" stroke-width="1"/>')
      for (let y = 40; y < height; y += 40) gridLines.push('<line x1="0" y1="' + y + '" x2="' + width + '" y2="' + y + '" stroke="' + gridColor + '" stroke-opacity="' + gridOpacity + '" stroke-width="1"/>')
    }
    const paths = pageStrokes.map((stroke) => {
      if (!stroke.points.length || stroke.tool === 'Eraser') return ''
      const [first, last] = [stroke.points[0], stroke.points[stroke.points.length - 1]]
      const alpha = stroke.opacity / 100 * (stroke.tool === 'Brush' ? .72 : stroke.tool === 'Pencil' ? .62 : stroke.tool === 'Marker' ? .82 : stroke.tool === 'Highlighter' ? .24 : 1)
      if (stroke.tool === 'Image' && stroke.imageData && stroke.points.length > 1) return `<image href="${stroke.imageData}" x="${first.x * width}" y="${first.y * height}" width="${(last.x - first.x) * width}" height="${(last.y - first.y) * height}" preserveAspectRatio="none"/>`
      if (stroke.tool === 'Text') return `<text x="${first.x * width}" y="${first.y * height}" fill="${escapeXml(stroke.color)}" opacity="${alpha}" font-size="${Math.max(8, stroke.width * 5)}" font-family="sans-serif">${escapeXml(stroke.text ?? '')}</text>`
      const points = stroke.tool === 'Shape' && stroke.points.length > 1 ? shapeGeometry(stroke.shapeKind ?? 'Rectangle', first, last, stroke.cornerRadius).points : stroke.points
      const pointString = points.map((point) => `${point.x * width},${point.y * height}`).join(' ')
      const handwriting = stroke.drawingStyle === 'handwriting' && points.length > 2 && stroke.tool !== 'Shape'
      const pathData = handwriting ? `M ${points[0].x * width} ${points[0].y * height} ${points.slice(1, -1).map((point, index) => { const next = points[index + 2]; return `Q ${point.x * width} ${point.y * height} ${(point.x + next.x) * width / 2} ${(point.y + next.y) * height / 2}` }).join(' ')} L ${last.x * width} ${last.y * height}` : ''
      const dash = stroke.drawingStyle === 'dashed' ? ` stroke-dasharray="${stroke.width * 2.5} ${stroke.width * 1.8}"` : stroke.drawingStyle === 'dotted' ? ` stroke-dasharray="${stroke.width * .15} ${stroke.width * 1.8}"` : ''
      const cap = stroke.drawingStyle === 'calligraphy' ? 'square' : 'round'
      const widthScale = stroke.drawingStyle === 'calligraphy' ? 1.7 : 1
      const tag = stroke.tool === 'Shape' && stroke.shapeKind !== 'Arrow' ? 'polygon' : handwriting ? 'path' : 'polyline'
      return handwriting ? `<path d="${pathData}" fill="none" stroke="${escapeXml(stroke.color)}" stroke-width="${stroke.width * widthScale}" stroke-linecap="${cap}" stroke-linejoin="round"${dash} opacity="${alpha}"/>` : `<${tag} points="${pointString}" fill="none" stroke="${escapeXml(stroke.color)}" stroke-width="${stroke.width * widthScale}" stroke-linecap="${cap}" stroke-linejoin="round"${dash} opacity="${alpha}"/>`
    }).join('')
    const cameraGroup = infinitePage ? `<g transform="translate(${-camera.x * width} ${-camera.y * height})">${paths}</g>` : paths
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${escapeXml(background)}"/>${gridLines.join('')}${cameraGroup}</svg>`
  }
  const exportDrawing = async (format: 'png' | 'svg') => {
    const pageStrokes = (strokesByPage[pageKey] ?? []).filter((stroke) => !hiddenLayers.includes(strokeLayer(stroke)))
    if (format === 'png') {
      const output = await renderPageCanvas(pageStrokes)
      output.toBlob((blob) => { if (blob) downloadBlob(blob, 'png') }, 'image/png')
    } else {
      const background = infinitePage ? (dark ? themedCanvasBackground(colorTheme) : '#ffffff') : resolvePageBackground(pageBackground, dark, colorTheme)
      downloadBlob(new Blob([svgForPage(pageStrokes, canvasWidth, canvasHeight, background, infinitePage ? cameraOffset : { x: 0, y: 0 })], { type: 'image/svg+xml;charset=utf-8' }), 'svg')
    }
    setMenuOpen(false)
  }
  const copyPageForNotion = async () => {
    const output = await renderPageCanvas((strokesByPage[pageKey] ?? []).filter((stroke) => !hiddenLayers.includes(strokeLayer(stroke))))
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
  const openTitleDialog = () => { setSectionTitleDraft(''); setTitleDialogOpen(true); setMenuOpen(false) }
  const addSectionTitle = () => {
    const title = sectionTitleDraft.trim()
    if (!title) return
    const titles = [...(boards[activeBoard].titles ?? []), { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, page }]
    setBoards((current) => current.map((board, index) => index === activeBoard ? { ...board, titles } : board))
    if (titles.length > 1) { setIndexView(true); setIndexPage(1) }
    setTitleDialogOpen(false)
  }
  const removeSectionTitle = (id: string) => {
    const remaining = (boards[activeBoard].titles ?? []).filter((item) => item.id !== id)
    setBoards((current) => current.map((board, index) => index === activeBoard ? { ...board, titles: remaining } : board))
    if (remaining.length < 2) setIndexView(false)
    setIndexPage(Math.min(indexPage, Math.max(1, Math.ceil(remaining.length / 20))))
  }
  const indexPageCount = Math.ceil((boards[activeBoard]?.titles?.length ?? 0) / 20)
  const openExportDialog = () => { setExportPageSelection(`1-${boards[activeBoard].pages}`); setExportIncludeIndex(true); setExportDialogOpen(true); setMenuOpen(false) }
  const exportSelectedPages = async () => {
    const text = exportPageSelection.trim()
    const selected = new Set<number>()
    try {
      for (const part of text.split(',').map((value) => value.trim()).filter(Boolean)) {
        const match = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/)
        if (!match) throw new Error()
        const first = Number(match[1]), last = Number(match[2] ?? match[1])
        if (first < 1 || last < first || last > boards[activeBoard].pages) throw new Error()
        for (let number = first; number <= last; number++) selected.add(number)
      }
      if (!selected.size) throw new Error()
    } catch {
      setSaveNotice(`Enter page numbers from 1 to ${boards[activeBoard].pages}, like 1, 3-5`)
      window.setTimeout(() => setSaveNotice(''), 3500)
      return
    }
    const selectedNumbers = [...selected].sort((a, b) => a - b)
    if (exportFormat === 'pdf') { await exportPdf(selectedNumbers, exportIncludeIndex); setExportDialogOpen(false); return }
    const board = boards[activeBoard]
    const size = board.pageSize ?? pageSize
    const infiniteExport = size === 'Infinite' || board.infinite
    const base: [number, number] = infiniteExport ? [210, 297] : pageDimensionsMm[size as Exclude<PageSize, 'Infinite'>]
    const bg = infiniteExport ? (dark ? themedCanvasBackground(colorTheme) : '#ffffff') : resolvePageBackground(board.pageBackground ?? pageBackground, dark, colorTheme)
    const indexStrokes = (sheet: number): Stroke[] => {
      const rows = (board.titles ?? []).slice(sheet * 20, sheet * 20 + 20)
      const textStroke = (value: string, x: number, y: number, width: number, color = dark ? '#f3f4f6' : '#20252b'): Stroke => ({ tool: 'Text', color, width, opacity: 100, points: [{ x, y }], text: value })
      return [textStroke('CONTENTS', .09, .09, 7, colorTheme === 'forest' ? '#39a96b' : '#8052bc'), textStroke(board.name, .09, .125, 3), ...rows.flatMap((item, row) => { const y = .19 + row * .037; return [textStroke(item.title, .10, y, 3.2), textStroke(`Page ${item.page}`, .77, y, 2.8, colorTheme === 'forest' ? '#39a96b' : '#8052bc')] })]
    }
    const pages: { strokes: Stroke[]; label: string; pageIndex: number | null }[] = [
      ...(exportIncludeIndex && (board.titles?.length ?? 0) > 1 ? Array.from({ length: indexPageCount }, (_, i) => ({ strokes: indexStrokes(i), label: `Index ${i + 1}`, pageIndex: null })) : []),
      ...selectedNumbers.map((number) => ({ strokes: (strokesByPage[`${activeBoard}:${number}`] ?? []).filter((stroke) => !hiddenLayers.includes(strokeLayer(stroke))), label: `Page ${number}`, pageIndex: number - 1 })),
    ]
    const safeName = board.name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'OzooNotes'
    for (const [index, item] of pages.entries()) {
      const [widthMm, heightMm] = item.pageIndex === null ? base : infiniteExport ? [canvasWidth / 3.78, canvasHeight / 3.78] : (board.pageOrientations?.[item.pageIndex] ?? board.orientation ?? orientation) === 'landscape' ? [base[1], base[0]] : [base[0], base[1]]
      const width = infiniteExport && item.pageIndex !== null ? canvasWidth : Math.round(widthMm * 3.78), height = infiniteExport && item.pageIndex !== null ? canvasHeight : Math.round(heightMm * 3.78)
      const suffix = pages.length === 1 ? '' : ` - ${item.label}`
      const camera = infiniteExport && item.pageIndex !== null ? infiniteCameraByPage[`${activeBoard}:${item.pageIndex + 1}`] ?? { x: 0, y: 0 } : { x: 0, y: 0 }
      if (exportFormat === 'svg') downloadNamedBlob(new Blob([svgForPage(item.strokes, width, height, bg, camera)], { type: 'image/svg+xml;charset=utf-8' }), `${safeName}${suffix}.svg`)
      else {
        const canvas = await renderPageCanvas(item.strokes, width, height, bg, camera)
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
        if (blob) downloadNamedBlob(blob, `${safeName}${suffix}.png`)
      }
      if (index < pages.length - 1) await new Promise((resolve) => window.setTimeout(resolve, 180))
    }
    setExportDialogOpen(false)
  }
  const exportObsidianNote = () => {
    const safeName = boards[activeBoard].name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'OzooNotes'
    const background = infinitePage ? (dark ? themedCanvasBackground(colorTheme) : '#ffffff') : resolvePageBackground(pageBackground, dark, colorTheme)
    const pageStrokes = Array.from({ length: boards[activeBoard].pages }, (_, index) => (strokesByPage[`${activeBoard}:${index + 1}`] ?? []).filter((stroke) => !hiddenLayers.includes(strokeLayer(stroke))))
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
      const saved = JSON.parse(raw) as { name: string; pages: number; pageSize?: PageSize; infinite?: boolean; orientation: 'portrait' | 'landscape'; pageOrientations?: ('portrait' | 'landscape')[]; pageBackground: string; notebook?: string; tags?: string[]; titles?: SectionTitle[]; hiddenLayers?: LayerName[]; gridEnabled?: boolean; showScale?: boolean; pageStrokes: Stroke[][] }
      const boardIndex = boards.length
      setBoards((current) => [...current, { name: saved.name, pages: saved.pages, pageSize: saved.pageSize ?? 'A4', infinite: saved.infinite ?? false, orientation: saved.orientation, pageOrientations: Array.from({ length: saved.pages }, (_, index) => saved.pageOrientations?.[index] ?? saved.orientation), pageBackground: saved.pageBackground, notebook: saved.notebook ?? 'Inbox', tags: saved.tags ?? [], titles: saved.titles ?? [], hiddenLayers: saved.hiddenLayers ?? [] }])
      setActiveBoard(boardIndex)
      setPage(1)
      setIndexView((saved.titles?.length ?? 0) > 1)
      setIndexPage(1)
      setOrientation(saved.pageOrientations?.[0] ?? saved.orientation)
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
      const documentData = JSON.parse(await file.text()) as { format?: string; version?: number; name?: string; pages?: number; pageSize?: PageSize; infinite?: boolean; orientation?: 'portrait' | 'landscape'; pageOrientations?: ('portrait' | 'landscape')[]; pageBackground?: string; gridEnabled?: boolean; showScale?: boolean; titles?: SectionTitle[]; hiddenLayers?: LayerName[]; pageStrokes?: Stroke[][] }
      if (documentData.format !== 'doomnotes' || documentData.version !== 1 || typeof documentData.name !== 'string' || !Number.isInteger(documentData.pages) || (documentData.pages ?? 0) < 1 || !Array.isArray(documentData.pageStrokes) || documentData.pageStrokes.length !== documentData.pages) throw new Error('That file is not a valid OzooNotes document.')
      if (documentData.pageSize !== undefined && !['Infinite', 'A1', 'A2', 'A3', 'A4', 'A5', 'Letter', 'Legal', 'Tabloid'].includes(documentData.pageSize)) throw new Error('That OzooNotes file uses an unsupported page size.')
      const boardIndex = boards.length
      const importedSize = documentData.pageSize ?? 'A4'
      const importedInfinite = documentData.infinite ?? importedSize === 'Infinite'
      const importedOrientation = documentData.orientation ?? 'portrait'
      const importedOrientations = Array.from({ length: documentData.pages! }, (_, index) => documentData.pageOrientations?.[index] ?? importedOrientation)
      const importedBackground = documentData.pageBackground ?? 'auto'
      setBoards((current) => [...current, { name: documentData.name!, pages: documentData.pages!, pageSize: importedSize, infinite: importedInfinite, orientation: importedOrientation, pageOrientations: importedOrientations, pageBackground: importedBackground, titles: documentData.titles ?? [], hiddenLayers: documentData.hiddenLayers ?? [] }])
      setActiveBoard(boardIndex)
      setPage(1)
      setIndexView((documentData.titles?.length ?? 0) > 1)
      setIndexPage(1)
      setPageSize(importedSize)
      setInfinitePage(importedInfinite)
      setOrientation(importedOrientations[0])
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
    if (activePan.current) { activePan.current = null; return }
    const marquee = activeMarquee.current
    if (marquee) {
      const box = selectionBox ?? { start: marquee.start, current: marquee.start }
      activeMarquee.current = null
      setSelectionBox(null)
      if (Math.hypot(box.current.x - box.start.x, box.current.y - box.start.y) > 0.006) {
        const left = Math.min(box.start.x, box.current.x), right = Math.max(box.start.x, box.current.x)
        const top = Math.min(box.start.y, box.current.y), bottom = Math.max(box.start.y, box.current.y)
        const contained = strokes.map((stroke, index) => {
          if (hiddenLayers.includes(strokeLayer(stroke))) return -1
          if (!stroke.points.length) return -1
          const xs = stroke.points.map((point) => point.x), ys = stroke.points.map((point) => point.y)
          return Math.max(...xs) >= left && Math.min(...xs) <= right && Math.max(...ys) >= top && Math.min(...ys) <= bottom ? index : -1
        }).filter((index) => index >= 0)
        setSelectedIndices(marquee.additive ? Array.from(new Set([...marquee.baseSelection, ...contained])) : contained)
      }
      return
    }
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
        if (canvas) editCurrentPage((current) => current.filter((stroke, index) => !eraserCanTarget(stroke, index) || !strokeTouchesEraser(stroke, savedStroke, canvas.width, canvas.height)))
        setSelectedIndices([])
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

  const exportPdf = async (selectedPageNumbers = Array.from({ length: boards[activeBoard].pages }, (_, index) => index + 1), includeIndex = true) => {
    if (infinitePage) return
    const activePdfBoard = boards[activeBoard]
    const exportSize = activePdfBoard.pageSize ?? pageSize
    const basePageMm = pageDimensionsMm[exportSize as Exclude<PageSize, 'Infinite'>]
    const pageOrientationAt = (pageIndex: number) => activePdfBoard.pageOrientations?.[pageIndex] ?? activePdfBoard.orientation ?? orientation
    const pageDimensionsAt = (pageIndex: number | null): [number, number] => pageIndex === null || pageOrientationAt(pageIndex) === 'portrait' ? [basePageMm[0], basePageMm[1]] : [basePageMm[1], basePageMm[0]]
    const makeIndexPageStrokes = (sheet: number): Stroke[] => {
      const titles = activePdfBoard.titles ?? []
      const firstIndex = sheet * 20
      const rows = titles.slice(firstIndex, firstIndex + 20)
      const text = (value: string, x: number, y: number, size: number, color = dark ? '#f3f4f6' : '#20252b'): Stroke => ({ tool: 'Text', color, width: size, opacity: 100, points: [{ x, y }], text: value })
      return [text('CONTENTS', .09, .09, 7, colorTheme === 'forest' ? '#39a96b' : '#8052bc'), text(activePdfBoard.name, .09, .125, 3), ...rows.flatMap((item, index) => { const y = .19 + index * .037; return [text(item.title, .10, y, 3.2), text(`Page ${item.page}`, .77, y, 2.8, colorTheme === 'forest' ? '#39a96b' : '#8052bc')] })]
    }
    const indexCount = includeIndex && (activePdfBoard.titles?.length ?? 0) > 1 ? Math.ceil((activePdfBoard.titles?.length ?? 0) / 20) : 0
    const exportPages: { pageStrokes: Stroke[]; pageIndex: number | null }[] = [
      ...Array.from({ length: indexCount }, (_, sheet) => ({ pageStrokes: makeIndexPageStrokes(sheet), pageIndex: null })),
      ...[...new Set(selectedPageNumbers)].filter((number) => Number.isInteger(number) && number >= 1 && number <= activePdfBoard.pages).map((number) => ({ pageStrokes: strokesByPage[`${activeBoard}:${number}`] ?? [], pageIndex: number - 1 })),
    ]
    const boardPages = exportPages.map(({ pageStrokes }) => pageStrokes)
    if (boardPages.some((pageStrokes) => pageStrokes.some((stroke) => stroke.tool === 'Image'))) {
      const encoder = new TextEncoder()
      const images = [...new Set(boardPages.flatMap((pageStrokes) => pageStrokes.flatMap((stroke) => stroke.tool === 'Image' && stroke.imageData ? [stroke.imageData] : [])))]
      await Promise.all(images.map((source) => new Promise<void>((resolve) => {
        let image = imageCache.get(source)
        if (!image) { image = new Image(); imageCache.set(source, image); image.src = source }
        if (image.complete) resolve()
        else { image.addEventListener('load', () => resolve(), { once: true }); image.addEventListener('error', () => resolve(), { once: true }) }
      })))
      const rasterPages = boardPages.map((pageStrokes, pageIndex) => {
        const scale = 2
        const [pageWidthMm, pageHeightMm] = pageDimensionsAt(exportPages[pageIndex].pageIndex)
        const pagePixelWidth = Math.round(pageWidthMm * 3.78)
        const pagePixelHeight = Math.round(pageHeightMm * 3.78)
        const canvas = window.document.createElement('canvas')
        canvas.width = pagePixelWidth * scale
        canvas.height = pagePixelHeight * scale
        const drawingCanvas = window.document.createElement('canvas')
        drawingCanvas.width = canvas.width
        drawingCanvas.height = canvas.height
        const drawingContext = drawingCanvas.getContext('2d')
        const context = canvas.getContext('2d')
        if (!context || !drawingContext) throw new Error('Could not render the page for PDF export')
        renderDrawings(drawingCanvas, pageStrokes.map((stroke) => ({ ...stroke, width: stroke.width * scale })), [], [], undefined, 0, { x: 0, y: 0 }, undefined, hiddenLayers)
        context.fillStyle = resolvePageBackground(pageBackground, dark, colorTheme)
        context.fillRect(0, 0, canvas.width, canvas.height)
        if (gridEnabled && exportPages[pageIndex].pageIndex !== null) {
          context.strokeStyle = gridLineColor(dark, colorTheme)
          context.lineWidth = 1
          for (let x = 40; x < canvas.width; x += 40) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke() }
          for (let y = 40; y < canvas.height; y += 40) { context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke() }
        }
        context.drawImage(drawingCanvas, 0, 0)
        const encoded = canvas.toDataURL('image/jpeg', 0.92).split(',')[1]
        const binary = window.atob(encoded)
        const jpeg = new Uint8Array(binary.length)
        for (let i = 0; i < binary.length; i++) jpeg[i] = binary.charCodeAt(i)
        return { jpeg, width: canvas.width, height: canvas.height, pageWidth: pageWidthMm * 72 / 25.4, pageHeight: pageHeightMm * 72 / 25.4 }
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
        addObject(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${raster.pageWidth} ${raster.pageHeight}] /Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`)
        const stream = `q\n${raster.pageWidth} 0 0 ${raster.pageHeight} 0 0 cm\n/Im0 Do\nQ`
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
    const pageStreams = exportPages.map(({ pageStrokes, pageIndex }) => {
      const [pageWidthMm, pageHeightMm] = pageDimensionsAt(pageIndex)
      const pageWidth = pageWidthMm * 72 / 25.4
      const pageHeight = pageHeightMm * 72 / 25.4
      const logicalWidth = Math.round(pageWidthMm * 3.78)
      const logicalHeight = Math.round(pageHeightMm * 3.78)
      const commands = ['q']
      const bg = resolvePageBackground(pageBackground, dark, colorTheme).replace('#', '')
      const bgRgb = [0, 2, 4].map((offset) => parseInt(bg.slice(offset, offset + 2), 16) / 255)
      commands.push(`${bgRgb.map((value) => value.toFixed(4)).join(' ')} rg`, `0 0 ${pageWidth} ${pageHeight} re f`)
      if (gridEnabled && !infinitePage && pageIndex !== null) {
        commands.push((dark ? '0.74 0.54 0.94' : '0.51 0.27 0.76') + ' RG', '0.35 w')
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
          const geometry = shapeGeometry(stroke.shapeKind ?? 'Rectangle', first, last, stroke.cornerRadius)
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
      return { stream: commands.join('\n'), width: pageWidth, height: pageHeight }
    })

    const objects: string[] = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    const pageIds: number[] = []
    pageStreams.forEach(({ stream, width, height }) => {
      const pageId = objects.length + 1
      const contentId = pageId + 1
      pageIds.push(pageId)
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`)
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

  const launchGraphSimulator = () => {
    setSimulatorMenuOpen(false)
    setGraphSimulatorOpen(true)
  }

  const launchCircuitSimulator = () => {
    setSimulatorMenuOpen(false)
    setCircuitSimulatorOpen(true)
  }

  const launchCodeSimulator = (mode: 'cpp' | 'python' | 'java' | 'web') => {
    setSimulatorMenuOpen(false)
    setCodeSimulatorMode(mode)
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
        const x = infinitePage ? cameraOffset.x + 0.21 : Math.max(0, Math.min(1 - width, 0.21)), y = infinitePage ? cameraOffset.y + 0.28 : Math.max(0, Math.min(1 - height, 0.28))
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

  const addBoard = (name?: string, template?: PageTemplate, size: PageSize = 'A4') => {
    setDraftName(name ?? `File ${nextFileNumber}`)
    setDraftNameError('')
    setDraftSize(size)
    setDraftTemplate(template ?? 'Blank')
    setDraftOrientation('portrait')
    setDraftBackground('auto')
    setShowNewFileDialog(true)
  }
  const saveFileOrganization = (name: string, notebook: string, rawTags: string) => {
    const tags = [...new Set(rawTags.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean))]
    try {
      const key = `doomnotes:${name}`
      const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
      localStorage.setItem(key, JSON.stringify({ ...saved, notebook: notebook || 'Inbox', tags }))
      setBoards((current) => current.map((board) => board.name === name ? { ...board, notebook: notebook || 'Inbox', tags } : board))
      setRecentFiles((current) => [...current])
    } catch { setSaveNotice('Could not save notebook or tags') }
  }
  const createNotebook = () => {
    const name = newNotebookName.trim()
    if (!name) return
    setNotebooks((current) => [...new Set([...current, name])])
    setNewNotebookName('')
  }
  const addScratchItem = () => { const text = scratchText.trim(); if (!text) return; setScratchItems((items) => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, done: false }, ...items]); setScratchText('') }
  const createBoard = () => {
    const isInfinite = draftSize === 'Infinite'
    const name = draftName.trim() || `File ${nextFileNumber}`
    if (boards.some((board) => normalizeBoardName(board.name) === normalizeBoardName(name))) {
      setDraftNameError('A file with this name already exists. Choose a different name.')
      return
    }
    setDraftNameError('')
    const boardIndex = boards.length
    const templateStrokes = makeTemplateStrokes(draftTemplate, draftSize, draftOrientation, colorTheme)
    setStrokesByPage((current) => ({ ...current, [`${boardIndex}:1`]: templateStrokes }))
    setBoards((current) => [...current, { name, pages: 1, pageSize: draftSize, infinite: isInfinite, orientation: draftOrientation, pageOrientations: [draftOrientation], pageBackground: draftBackground, notebook: 'Inbox', tags: [] }])
    setActiveBoard(boards.length)
    setPage(1)
    setIndexView(false)
    setPageSize(draftSize)
    setInfinitePage(isInfinite)
    setOrientation(draftOrientation)
    setPageBackground(draftBackground)
    setGridEnabled(false)
    setShowScale(false)
    setNextFileNumber(nextFileNumber + 1)
    setShowNewFileDialog(false)
  }
  const openRenameDialog = (name = boards[activeBoard]?.name) => {
    if (!name) return
    setRenameTarget(name)
    setRenameDraft(name)
    setRenameError('')
  }
  const renameBoard = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!renameTarget) return
    const nextName = renameDraft.trim()
    if (!nextName) { setRenameError('Enter a file name.'); return }
    if (boards.some((board) => board.name !== renameTarget && normalizeBoardName(board.name) === normalizeBoardName(nextName)) || recentFiles.some((name) => name !== renameTarget && normalizeBoardName(name) === normalizeBoardName(nextName)) || (localStorage.getItem(`doomnotes:${nextName}`) !== null && normalizeBoardName(nextName) !== normalizeBoardName(renameTarget))) {
      setRenameError('A file with this name already exists. Choose another name.')
      return
    }
    let renamedData: Record<string, unknown> = {}
    try {
      const oldKey = `doomnotes:${renameTarget}`
      const newKey = `doomnotes:${nextName}`
      const saved = localStorage.getItem(oldKey)
      if (saved) {
        const data = JSON.parse(saved) as Record<string, unknown>
        renamedData = { ...data, name: nextName }
        localStorage.setItem(newKey, JSON.stringify(renamedData))
        localStorage.removeItem(oldKey)
      }
    } catch { setRenameError('Could not update this file in browser storage.'); return }
    setBoards((current) => current.map((board) => board.name === renameTarget ? { ...board, name: nextName } : board))
    setRecentFiles((current) => current.map((name) => name === renameTarget ? nextName : name))
    setCloudBoardIds((current) => {
      const updated = { ...current }
      if (updated[renameTarget] !== undefined) { updated[nextName] = updated[renameTarget]; delete updated[renameTarget] }
      try { localStorage.setItem('doomnotes:cloud-board-ids', JSON.stringify(updated)) } catch { /* The local file rename is already saved. */ }
      return updated
    })
    setInfiniteCameraByPage((current) => Object.fromEntries(Object.entries(current).map(([key, value]) => [key.startsWith(`${renameTarget}:`) ? `${nextName}:${key.slice(renameTarget.length + 1)}` : key, value])))
    const cloudId = cloudBoardIds[renameTarget]
    if (cloudId && cloudUser) {
      const remoteState = cloudBoards.find((board) => board.id === cloudId)?.state
      const state = remoteState && isEncryptedBoardState(remoteState) ? remoteState : Array.isArray(renamedData.pageStrokes) ? { pages: renamedData.pages, pageSize: renamedData.pageSize, infinite: renamedData.infinite, orientation: renamedData.orientation, pageOrientations: renamedData.pageOrientations, pageBackground: renamedData.pageBackground, gridEnabled: renamedData.gridEnabled, showScale: renamedData.showScale, hiddenLayers: renamedData.hiddenLayers ?? [], pageStrokes: renamedData.pageStrokes } : remoteState
      if (state) void apiRequest(`/api/boards/${cloudId}`, { method: 'PUT', body: JSON.stringify({ name: nextName, folderId: selectedFolderId, state }) }).then(() => refreshCloudBoards()).catch((error) => setCloudMessage(error instanceof Error ? `Renamed locally; server rename failed: ${error.message}` : 'Renamed locally; server rename failed.'))
    }
    setRenameTarget(null)
  }
  const activateBoard = (index: number) => {
    const board = boards[index]
    if (!board) return
    setActiveBoard(index)
    setPage(1)
    setIndexView((board.titles?.length ?? 0) > 1)
    setIndexPage(1)
    setPageSize(board.pageSize ?? 'A4')
    setInfinitePage(board.infinite ?? false)
    setOrientation(board.pageOrientations?.[0] ?? board.orientation ?? 'portrait')
    setPageBackground(board.pageBackground ?? 'auto')
  }
  const setActiveBackground = (color: string) => {
    setPageBackground(color)
    setBoards((current) => current.map((board, index) => index === activeBoard ? { ...board, pageBackground: color } : board))
  }
  const setActiveOrientation = (value: 'portrait' | 'landscape') => {
    setOrientation(value)
    setBoards((current) => current.map((board, index) => index === activeBoard ? { ...board, orientation: value, pageOrientations: Array.from({ length: board.pages }, (_, pageIndex) => pageIndex === page - 1 ? value : board.pageOrientations?.[pageIndex] ?? board.orientation ?? 'portrait') } : board))
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
      setIndexView((nextBoard.titles?.length ?? 0) > 1)
      setIndexPage(1)
      setPageSize(nextBoard.pageSize ?? 'A4')
      setInfinitePage(nextBoard.infinite ?? false)
      setOrientation(nextBoard.pageOrientations?.[0] ?? nextBoard.orientation ?? 'portrait')
      setPageBackground(nextBoard.pageBackground ?? 'auto')
    } else if (index < activeBoard) {
      setActiveBoard(activeBoard - 1)
    }
  }
  const addPage = (newOrientation: 'portrait' | 'landscape') => {
    const updated = boards.map((board, index) => {
      if (index !== activeBoard) return board
      const pageOrientations = Array.from({ length: board.pages }, (_, pageIndex) => board.pageOrientations?.[pageIndex] ?? board.orientation ?? orientation)
      return { ...board, pages: board.pages + 1, pageOrientations: [...pageOrientations, newOrientation] }
    })
    setBoards(updated)
    setPage(updated[activeBoard].pages)
    setOrientation(newOrientation)
    setAddPageMenuOpen(false)
  }

  const newFileDialog = showNewFileDialog && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNewFileDialog(false) }}><section className="new-file-dialog" role="dialog" aria-modal="true" aria-labelledby="new-file-title"><button className="dialog-close" aria-label="Close new file settings" onClick={() => setShowNewFileDialog(false)}><Icon name="close" size={16} /></button><p className="eyebrow">NEW BOARD</p><h2 id="new-file-title">Set up your page</h2><label className="dialog-label">File name<input value={draftName} aria-invalid={Boolean(draftNameError)} aria-describedby={draftNameError ? "draft-name-error" : undefined} onChange={(event) => { setDraftName(event.target.value); setDraftNameError("") }} placeholder={`File ${nextFileNumber}`} /></label>{draftNameError && <p className="field-error" id="draft-name-error" role="alert">{draftNameError}</p>}<fieldset className="page-size-picker"><legend>Page size</legend><div className="page-size-options">{(['A1', 'A2', 'A3', 'A4', 'A5', 'Letter', 'Legal', 'Tabloid', 'Infinite'] as PageSize[]).map((size) => <button type="button" key={size} aria-pressed={draftSize === size} className={`page-size-option ${draftSize === size ? 'chosen' : ''} ${size === 'Infinite' ? 'infinite-choice' : ''}`} onClick={() => setDraftSize(size)}>{size === 'Infinite' ? '∞ Infinite' : size}</button>)}</div></fieldset><label className="dialog-label">Starter template<select value={draftTemplate} onChange={(event) => setDraftTemplate(event.target.value as PageTemplate)}><option>Blank</option><option>Lined notes</option><option>Graph paper</option><option>Cornell notes</option><option>Weekly planner</option><option>Lesson plan</option><option>Worksheet</option><option>Class diagram</option><option>Exit ticket</option><option>Rubric</option><option>Seating chart</option><option>Mood board</option><option>Coding notes</option></select></label>{draftTemplate !== 'Blank' && <p className="template-note">The layout is made from editable objects on the first page.</p>}{draftSize !== 'Infinite' ? <><label className="dialog-label">Orientation<select value={draftOrientation} onChange={(event) => setDraftOrientation(event.target.value as 'portrait' | 'landscape')}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label><fieldset className="page-size-picker"><legend>Page background</legend><div className="dialog-colors">{pageColors.map((color) => <button type="button" key={color} aria-label={pageBackgroundLabel(color)} aria-pressed={draftBackground === color} className={`settings-swatch ${draftBackground === color ? 'chosen' : ''}`} style={pageBackgroundSwatchStyle(color)} onClick={() => setDraftBackground(color)} />)}<label className="custom-color"><span>Custom</span><input type="color" value={resolvePageBackground(draftBackground, dark, colorTheme)} aria-label="Custom page background" onChange={(event) => setDraftBackground(event.target.value)} /></label></div></fieldset></> : <p className="infinite-note">A large, scrollable board that matches the current theme. PDF export is unavailable for infinite boards.</p>}<footer className="dialog-actions"><button className="dialog-cancel" onClick={() => setShowNewFileDialog(false)}>Cancel</button><button className="dialog-create" onClick={createBoard}>Create board</button></footer></section></div>
  const renameDialog = renameTarget && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameTarget(null) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-file-title"><button className="dialog-close" aria-label="Close rename dialog" onClick={() => setRenameTarget(null)}><Icon name="close" size={16} /></button><p className="eyebrow">FILE OPTIONS</p><h2 id="rename-file-title">Rename file</h2><form onSubmit={renameBoard}><label className="dialog-label">File name<input autoFocus required maxLength={120} value={renameDraft} onChange={(event) => { setRenameDraft(event.target.value); setRenameError('') }} /></label>{renameError && <p className="field-error" role="alert">{renameError}</p>}<footer className="dialog-actions"><button type="button" className="dialog-cancel" onClick={() => setRenameTarget(null)}>Cancel</button><button className="dialog-create">Save name</button></footer></form></section></div>
  const titleDialog = titleDialogOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTitleDialogOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="section-title-heading"><button className="dialog-close" aria-label="Close section titles" onClick={() => setTitleDialogOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">PAGE {page} SECTION</p><h2 id="section-title-heading">Add a section title</h2><p className="infinite-note">Titles appear in a separate contents page before your notes. They never take up or renumber a document page.</p><form onSubmit={(event) => { event.preventDefault(); addSectionTitle() }}><label className="dialog-label">Title for page {page}<input autoFocus maxLength={100} value={sectionTitleDraft} onChange={(event) => setSectionTitleDraft(event.target.value)} placeholder="e.g. Research links" /></label><button className="dialog-create full-button" disabled={!sectionTitleDraft.trim()}>Add title</button></form>{(boards[activeBoard].titles?.length ?? 0) > 0 && <><h3 className="small-heading">Titles in this board</h3><ul className="section-title-list">{boards[activeBoard].titles?.map((item) => <li key={item.id}><span>{item.title}<small>Page {item.page}</small></span><button type="button" aria-label={`Remove ${item.title}`} onClick={() => removeSectionTitle(item.id)}>Remove</button></li>)}</ul></>}</section></div>
  const exportDialog = exportDialogOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExportDialogOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title"><button className="dialog-close" aria-label="Close export options" onClick={() => setExportDialogOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">CUSTOM EXPORT</p><h2 id="export-dialog-title">Choose pages to export</h2><label className="dialog-label">Format<select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as 'pdf' | 'png' | 'svg')}><option value="pdf">PDF document</option><option value="png">PNG images</option><option value="svg">SVG images</option></select></label><label className="dialog-label">Page numbers<input value={exportPageSelection} onChange={(event) => setExportPageSelection(event.target.value)} placeholder="1, 3-5" /><small>Use commas and ranges, for example: 1, 3-5</small></label>{(boards[activeBoard].titles?.length ?? 0) > 1 && <label className="encryption-choice"><input type="checkbox" checked={exportIncludeIndex} onChange={(event) => setExportIncludeIndex(event.target.checked)} /><span><strong>Include contents index</strong><small>Add the title index before the selected note pages.</small></span></label>}{exportFormat !== 'pdf' && <p className="infinite-note">Each selected page downloads as its own {exportFormat.toUpperCase()} file.</p>}{infinitePage && exportFormat === 'pdf' && <p className="field-error">PDF export is unavailable for infinite boards.</p>}<footer className="dialog-actions"><button className="dialog-cancel" onClick={() => setExportDialogOpen(false)}>Cancel</button><button className="dialog-create" disabled={infinitePage && exportFormat === 'pdf'} onClick={() => void exportSelectedPages()}>Export</button></footer></section></div>

  const quickStartDialog = quickStartOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setQuickStartOpen(false) }}><section className="new-file-dialog compact-dialog quick-start-dialog" role="dialog" aria-modal="true" aria-labelledby="quick-start-title"><button className="dialog-close" aria-label="Close Quick Start guide" onClick={() => setQuickStartOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">OZOONOTES BASICS</p><h2 id="quick-start-title">Quick Start Guide</h2><ol className="quick-start-steps"><li><span>1</span><div><strong>Start with a board</strong><p>Choose <b>Start a new board</b>, or open an OzooNotes file you already have.</p></div></li><li><span>2</span><div><strong>Draw and create</strong><p>Pick a pen from the drawing tools. Use the shape, text, image, or graph tools to add more to your page.</p></div></li><li><span>3</span><div><strong>Select and move objects</strong><p>Choose Select. Drag over empty space to select several objects, or Shift-click to add or remove an object. Drag a selected object to move the group. Ctrl+A selects everything on the current page.</p></div></li><li><span>4</span><div><strong>Move around and add pages</strong><p>Use the Hand tool to pan across an infinite board. For regular boards, add a page and choose portrait or landscape; each page keeps its own orientation.</p></div></li><li><span>5</span><div><strong>Keep a copy of your work</strong><p>Your boards save in this browser on this device. Choose <b>Save OzooNotes file</b> to download a portable copy. You can also export pages as PNG or SVG, or regular boards as PDF.</p></div></li></ol><footer className="dialog-actions"><button className="dialog-create" onClick={() => setQuickStartOpen(false)}>Got it</button></footer></section></div>

  const accountDialog = accountOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title"><button className="dialog-close" aria-label="Close account" onClick={() => setAccountOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">SELF-HOSTED CLOUD</p><h2 id="account-title">{cloudUser ? `Hello, ${cloudUser.username}` : authMode === 'register' ? 'Create your account' : 'Sign in to OzooNotes'}</h2>{cloudUser ? <><p className="infinite-note">Your boards are saved on the OzooNotes server you run.</p><form className="share-form folder-form" onSubmit={(event) => { void createCloudFolder(event) }}><label className="dialog-label">New folder<input required value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Folder name" /></label><button className="dialog-create">Create folder</button></form><label className="dialog-label">Save boards in<select value={selectedFolderId ?? ''} onChange={(event) => setSelectedFolderId(Number(event.target.value) || null)}><option value="">No folder</option>{cloudFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><button className="dialog-create full-button" onClick={() => { void logout() }}>Sign out</button></> : <><form onSubmit={(event) => { void submitAccount(event) }}><label className="dialog-label">Username<input required minLength={3} maxLength={32} autoComplete="username" value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} /></label><label className="dialog-label">Password<input required minLength={authMode === 'register' ? 12 : 1} type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} /></label><button className="dialog-create full-button">{authMode === 'register' ? 'Create account' : 'Sign in'}</button><button className="text-button" type="button" onClick={() => setAuthMode(authMode === 'register' ? 'login' : 'register')}>{authMode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'}</button></form></>}{cloudMessage && <p className="cloud-message" role="status">{cloudMessage}</p>}</section></div>

  const shareDialog = shareOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShareOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title"><button className="dialog-close" aria-label="Close sharing" onClick={() => setShareOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">ACCESS MANAGEMENT</p><h2 id="share-title">Share “{boards[activeBoard]?.name}”</h2><form className="share-form" onSubmit={(event) => { void inviteToBoard(event) }}><label className="dialog-label">Username<input required value={shareUsername} onChange={(event) => setShareUsername(event.target.value)} placeholder="Their OzooNotes username" /></label><label className="dialog-label">Permission<select value={shareRole} onChange={(event) => setShareRole(event.target.value as 'view' | 'edit')}><option value="view">View only</option><option value="edit">Can edit</option></select></label><button className="dialog-create">Grant access</button></form><h3 className="small-heading">People with access</h3>{shareList.length ? <ul className="access-list">{shareList.map((entry) => <li key={entry.username}><span>{entry.username}<small>{entry.role === 'view' ? 'View only' : 'Can edit'}</small></span><button onClick={() => { const id = cloudBoardIds[boards[activeBoard].name]; void apiRequest(`/api/boards/${id}/share`, { method: 'DELETE', body: JSON.stringify({ username: entry.username }) }).then(() => setShareList((current) => current.filter((item) => item.username !== entry.username))).catch((error) => setCloudMessage(error.message)) }}>Remove</button></li>)}</ul> : <p className="empty-hint">No one else has access yet.</p>}<h3 className="small-heading">Share with a team</h3>{teams.length ? <><form className="share-form" onSubmit={(event) => { void grantTeamBoardAccess(event) }}><label className="dialog-label">Team<select value={shareTeamId ?? ''} onChange={(event) => setShareTeamId(Number(event.target.value) || null)}><option value="">Choose a team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label className="dialog-label">Permission<select value={shareTeamRole} onChange={(event) => setShareTeamRole(event.target.value as 'view' | 'edit')}><option value="view">View only</option><option value="edit">Can edit</option></select></label><button className="dialog-create">Grant</button></form>{shareTeams.map((team) => <p className="team-access-row" key={team.id}>{team.name}: {team.role}<button onClick={() => { const id = cloudBoardIds[boards[activeBoard].name]; void apiRequest(`/api/boards/${id}/teams`, { method: 'DELETE', body: JSON.stringify({ teamId: team.id }) }).then(() => setShareTeams((current) => current.filter((item) => item.id !== team.id))) }}>Remove</button></p>)}</> : <p className="empty-hint">Create a team to grant access to a group.</p>}<div className="menu-divider" /><button className="dialog-create full-button" onClick={() => { void createPublicLink() }}>Create read-only link</button>{publicLink && <><div className="public-link-value">{publicLink}</div><button className="text-button" onClick={() => { const id = cloudBoardIds[boards[activeBoard].name]; void apiRequest(`/api/boards/${id}/public-link`, { method: 'DELETE', body: '{}' }).then(() => { setPublicLink(''); setCloudMessage('Read-only links revoked.') }).catch((error) => setCloudMessage(error.message)) }}>Revoke read-only links</button></>}{cloudMessage && <p className="cloud-message">{cloudMessage}</p>}</section></div>

  const commentsDialog = commentOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommentOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="comments-title"><button className="dialog-close" aria-label="Close comments" onClick={() => setCommentOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">TEAM COMMENTS</p><h2 id="comments-title">{boards[activeBoard]?.name}</h2>{comments.length ? <ul className="comment-list">{comments.map((comment) => <li key={comment.id}><strong>{comment.username}</strong><time>{new Date(`${comment.createdAt.replace(' ', 'T')}Z`).toLocaleString()}</time><p>{comment.body}</p></li>)}</ul> : <p className="empty-hint">No comments yet.</p>}<form onSubmit={(event) => { void addComment(event) }}><label className="dialog-label">Add a comment<textarea required rows={3} maxLength={4000} value={commentText} onChange={(event) => setCommentText(event.target.value)} /></label><button className="dialog-create full-button">Post comment</button></form>{cloudMessage && <p className="cloud-message">{cloudMessage}</p>}</section></div>

  const activeBoardName = boards[activeBoard]?.name
  const activeCloudId = activeBoardName ? cloudBoardIds[activeBoardName] : undefined
  const activeRemoteBoard = activeCloudId ? cloudBoards.find((board) => board.id === activeCloudId) : undefined
  const activeRemoteEncrypted = Boolean(activeRemoteBoard && isEncryptedBoardState(activeRemoteBoard.state))
  const cloudSaveDialog = cloudSaveOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCloudSaveOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="cloud-save-title"><button className="dialog-close" aria-label="Close cloud save options" onClick={() => setCloudSaveOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">SAVE TO YOUR SERVER</p><h2 id="cloud-save-title">Protect this board?</h2><form onSubmit={submitCloudSave}><label className="encryption-choice"><input type="checkbox" checked={cloudSaveEncrypted} disabled={activeRemoteEncrypted} onChange={(event) => setCloudSaveEncrypted(event.target.checked)} /><span><strong>Encrypt board in this browser</strong><small>Your server stores encrypted drawing data. Board name, comments, and sharing settings remain visible to the server.</small></span></label>{cloudSaveEncrypted && <><label className="dialog-label">Encryption passphrase<input required minLength={12} type="password" autoComplete="new-password" value={cloudSavePassphrase} onChange={(event) => setCloudSavePassphrase(event.target.value)} placeholder="At least 12 characters" /></label>{!activeRemoteEncrypted && <label className="dialog-label">Confirm passphrase<input required minLength={12} type="password" autoComplete="new-password" value={cloudSaveConfirmation} onChange={(event) => setCloudSaveConfirmation(event.target.value)} /></label>}<p className="encryption-note">Keep this passphrase safe and share it with collaborators yourself. OzooNotes cannot recover it.</p></>}{cloudMessage && <p className="cloud-message" role="status">{cloudMessage}</p>}<footer className="dialog-actions"><button type="button" className="dialog-cancel" onClick={() => setCloudSaveOpen(false)}>Cancel</button><button className="dialog-create">Save board</button></footer></form></section></div>

  const teamDialog = teamOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTeamOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="teams-title"><button className="dialog-close" aria-label="Close teams" onClick={() => setTeamOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">TEAM MANAGEMENT</p><h2 id="teams-title">Teams</h2><form className="share-form" onSubmit={(event) => { void createTeam(event) }}><label className="dialog-label">New team<input required value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Team name" /></label><button className="dialog-create">Create team</button></form>{teams.length > 0 && <><label className="dialog-label">Select team<select value={activeTeam ?? ''} onChange={(event) => { const id = Number(event.target.value) || null; setActiveTeam(id); if (id) void apiRequest<{ members: { username: string; role: string }[] }>(`/api/teams/${id}/members`).then(({ members }) => setTeamMembers(members)).catch((error) => setCloudMessage(error.message)); else setTeamMembers([]) }}><option value="">Choose a team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><form className="share-form" onSubmit={(event) => { void addTeamMember(event) }}><label className="dialog-label">Add member<input required value={teamUsername} onChange={(event) => setTeamUsername(event.target.value)} placeholder="Their OzooNotes username" /></label><button className="dialog-create" disabled={!activeTeam}>Add</button></form><ul className="access-list">{teamMembers.map((member) => <li key={member.username}><span>{member.username}<small>{member.role}</small></span></li>)}</ul></>}{cloudMessage && <p className="cloud-message">{cloudMessage}</p>}</section></div>

  const selectedForLibrary = selectedIndices.map((index) => strokes[index]).filter((stroke): stroke is Stroke => Boolean(stroke))
  const libraryDialog = libraryOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLibraryOpen(false) }}><section className="new-file-dialog compact-dialog library-dialog" role="dialog" aria-modal="true" aria-labelledby="library-title"><button className="dialog-close" aria-label="Close library" onClick={() => setLibraryOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">REUSABLE OBJECTS</p><h2 id="library-title">Libraries</h2><form className="library-save-form" onSubmit={saveSelectionToLibrary}><label className="dialog-label">Save the {selectedForLibrary.length || 'selected'} selected object{selectedForLibrary.length === 1 ? '' : 's'}<input required maxLength={80} value={libraryName} onChange={(event) => setLibraryName(event.target.value)} placeholder="Name this library item" /></label><button className="dialog-create" disabled={!selectedForLibrary.length || !libraryName.trim()}>Save selection</button></form>{libraryItems.length ? <ul className="library-list">{libraryItems.map((item) => <li key={item.id}><span><strong>{item.name}</strong><small>{item.strokes.length} object{item.strokes.length === 1 ? '' : 's'}</small></span><button className="library-insert" onClick={() => insertLibraryItem(item)}>Insert</button><button className="library-delete" aria-label={`Delete ${item.name} from library`} title="Delete library item" onClick={() => deleteLibraryItem(item.id)}><Icon name="close" size={16} /></button></li>)}</ul> : <p className="empty-hint">No saved objects yet. Select objects on the board and save them here for reuse.</p>}</section></div>

  const graphDialog = graphOpen && <div className="new-file-overlay graph-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setGraphOpen(false) }}><section className="new-file-dialog graph-dialog" role="dialog" aria-modal="true" aria-labelledby="graph-title"><button className="dialog-close" aria-label="Close graph tool" onClick={() => setGraphOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">WHITEBOARD TOOL</p><h2 id="graph-title">Create a graph</h2><div className="graph-mode-picker" role="group" aria-label="Graph input type"><button type="button" className={graphMode === 'equation' ? 'selected' : ''} aria-pressed={graphMode === 'equation'} onClick={() => { setGraphMode('equation'); setGraphError('') }}>Equation</button><button type="button" className={graphMode === 'points' ? 'selected' : ''} aria-pressed={graphMode === 'points'} onClick={() => { setGraphMode('points'); setGraphError('') }}>Data points</button></div>{graphMode === 'equation' ? <label className="dialog-label">Equation(s)<textarea className="graph-textarea" value={graphEquation} onChange={(event) => setGraphEquation(event.target.value)} placeholder="y = x^2" rows={3} /><small>Use x, numbers, + − * / ^, parentheses, or sin, cos, tan, sqrt, abs, log, ln, exp. Put each equation on a new line.</small></label> : <label className="dialog-label">Points (x, y)<textarea className="graph-textarea" value={graphPoints} onChange={(event) => setGraphPoints(event.target.value)} placeholder="1, 2; 2, 5; 3, 4" rows={3} /><small>Enter points as x, y pairs separated by semicolons or new lines.</small></label>}<div className="graph-range-grid"><label className="dialog-label">X minimum<input type="number" value={graphRange.xMin} onChange={(event) => setGraphRange({ ...graphRange, xMin: Number(event.target.value) })} /></label><label className="dialog-label">X maximum<input type="number" value={graphRange.xMax} onChange={(event) => setGraphRange({ ...graphRange, xMax: Number(event.target.value) })} /></label><label className="dialog-label">Y minimum<input type="number" value={graphRange.yMin} onChange={(event) => setGraphRange({ ...graphRange, yMin: Number(event.target.value) })} /></label><label className="dialog-label">Y maximum<input type="number" value={graphRange.yMax} onChange={(event) => setGraphRange({ ...graphRange, yMax: Number(event.target.value) })} /></label></div>{graphError && <p className="graph-error" role="alert">{graphError}</p>}<button className="dialog-create" onClick={addGraphToBoard}>Add graph to page</button></section></div>

  const pageSizeMm = pageSize === 'Infinite' ? [1, 1] : pageDimensionsMm[pageSize]
  const orientedPageMm = orientation === 'portrait' || pageSize === 'Infinite' ? pageSizeMm : [pageSizeMm[1], pageSizeMm[0]]
  const canvasWidth = infinitePage ? 3600 : Math.round(orientedPageMm[0] * 3.78)
  const canvasHeight = infinitePage ? 3600 : Math.round(orientedPageMm[1] * 3.78)

  if (sharedToken) {
    const state = sharedBoard && !isEncryptedBoardState(sharedBoard.state) ? sharedBoard.state : undefined
    const sharedSize = state?.pageSize && state.pageSize !== 'Infinite' ? state.pageSize : 'A4'
    const sharedMm = pageDimensionsMm[sharedSize]
    const sharedMmOriented = state?.orientation === 'landscape' ? [sharedMm[1], sharedMm[0]] : sharedMm
    const sharedWidth = state?.infinite ? 2800 : Math.round(sharedMmOriented[0] * 3.78)
    const sharedHeight = state?.infinite ? 2800 : Math.round(sharedMmOriented[1] * 3.78)
    return <main className={`app ${dark ? 'dark' : 'light'}`} data-theme={colorTheme}><section className="shared-board-view"><header><div className="brand"><img className="brand-mark" src={brandLogo} alt="OzooNotes" /></div><span className="shared-readonly">Read-only link</span></header>{sharedBoard ? <><h1>{sharedBoard.name}</h1><div className={`paper shared-paper ${state?.infinite ? 'infinite' : ''}`} style={{ width: state?.infinite ? 'min(2400px, 90vw)' : undefined, aspectRatio: state?.infinite ? '1 / 1' : `${sharedMmOriented[0]} / ${sharedMmOriented[1]}`, backgroundColor: state?.infinite ? undefined : resolvePageBackground(state?.pageBackground ?? 'auto', dark, colorTheme) }}><canvas className="shared-canvas" ref={canvasRef} width={sharedWidth} height={sharedHeight} aria-label="Shared read-only whiteboard" /></div></> : <p>{cloudMessage || 'Opening shared board…'}</p>}</section></main>
  }

  if (circuitSimulatorOpen) return <CircuitSimulator onBack={() => setCircuitSimulatorOpen(false)} />
  if (graphSimulatorOpen) return <GraphSimulator onBack={() => setGraphSimulatorOpen(false)} />
  if (codeSimulatorMode === 'cpp') return <CppSimulator onBack={() => setCodeSimulatorMode(null)} />
  if (codeSimulatorMode) return <CodeSimulator initialLanguage={codeSimulatorMode} onBack={() => setCodeSimulatorMode(null)} />

  if (boards.length === 0) {
    return (
      <main className={`app ${dark ? 'dark' : 'light'}`} data-theme={colorTheme}>
        <section className="landing-window">
          <header className="landing-topbar">
            <a className="landing-brand" href="#" aria-label="OzooNotes home"><img className="brand-mark" src={brandLogo} alt="OzooNotes" /></a>
            <nav className="landing-nav" aria-label="Main navigation">
              <a href="#audience-starters">Board starters</a>
              <a href="#landing-tools">Tools</a>
              <div className="landing-simulator-wrap" onKeyDown={(event) => { if (event.key === 'Escape') setSimulatorMenuOpen(false) }}>
                <button type="button" className="landing-simulator-trigger" aria-haspopup="menu" aria-expanded={simulatorMenuOpen} onClick={() => setSimulatorMenuOpen((open) => !open)}>Simulator <Icon name="chevronDown" size={12} /></button>
                {simulatorMenuOpen && <div className="landing-simulator-menu" role="menu" aria-label="Simulators"><button type="button" role="menuitem" className="landing-simulator-option" onClick={launchCircuitSimulator}><span className="studio-menu-glyph" aria-hidden="true">Ω</span><span><strong>Electronics</strong><small>Build and simulate DC circuits</small></span></button><button type="button" role="menuitem" className="landing-simulator-option" onClick={launchGraphSimulator}><Icon name="graph" size={18} /><span><strong>Graph</strong><small>Plot equations or data points</small></span></button><button type="button" role="menuitem" className="landing-simulator-option" onClick={() => launchCodeSimulator('cpp')}><span className="cpp-menu-glyph" aria-hidden="true">&lt;/&gt;</span><span><strong>C++ coding</strong><small>Write and run C++ programs</small></span></button><button type="button" role="menuitem" className="landing-simulator-option" onClick={() => launchCodeSimulator('python')}><span className="studio-menu-glyph" aria-hidden="true">Py</span><span><strong>Python coding</strong><small>Write and run Python programs</small></span></button><button type="button" role="menuitem" className="landing-simulator-option" onClick={() => launchCodeSimulator('java')}><span className="studio-menu-glyph" aria-hidden="true">Ja</span><span><strong>Java coding</strong><small>Write and run Java programs</small></span></button><button type="button" role="menuitem" className="landing-simulator-option" onClick={() => launchCodeSimulator('web')}><span className="studio-menu-glyph" aria-hidden="true">&lt;/&gt;</span><span><strong>HTML · CSS · JavaScript</strong><small>Build and preview web projects</small></span></button></div>}
              </div>
              <a href="#landing-files">Your files</a>
              <a href="https://github.com/AMStudios6/ozoonotes" target="_blank" rel="noreferrer">GitHub</a>
            </nav>
            <div className="landing-top-actions">
              {!localOnly && <button className="account-button" onClick={() => setAccountOpen(true)}><Icon name="cloud" size={16} /> {cloudUser ? cloudUser.username : 'Sign in'}</button>}
              <label className="theme-toggle theme-picker"><span>Theme</span><select aria-label="Color scheme" value={colorTheme} onChange={(event) => setColorTheme(event.target.value as ColorTheme)}>{colorThemes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>
            </div>
          </header>
          <div className="landing-page">
            <section className="landing-hero">
              <div className="landing-copy">
                <p className="landing-kicker"><span className="status-dot" /> Your space to think on paper</p>
                <h1>Think through ideas.<br /><span>See the whole picture.</span></h1>
                <p className="hero-description">Bring handwriting, code examples, diagrams, graphs, and plans onto one flexible page. Start with a student or teacher template, then make it your own.</p>
                <div className="landing-cta-row">
                  <button className="hero-new-file" onClick={() => addBoard(undefined, landingTemplate, landingPageSize)}>Start a new board <Icon name="next" size={17} /></button>
                  <button className="landing-open-file" onClick={() => documentInputRef.current?.click()}><ThemeIcon source={folderPng} size={17} /> Open a file</button>
                  <a className="landing-github-link" href="https://github.com/AMStudios6/ozoonotes" target="_blank" rel="noreferrer">See how it works on GitHub ↗</a>
                  <button type="button" className="landing-help-link" onClick={() => setQuickStartOpen(true)}>Read the Quick Start guide</button>
                </div>
                <div className="landing-value-points" aria-label="Why use OzooNotes">
                  <div className="landing-value-point"><strong>Think visually</strong><span>Mix writing, sketches, and examples.</span></div>
                  <div className="landing-value-point"><strong>Start with a template</strong><span>Get straight to notes, lessons, or code.</span></div>
                  <div className="landing-value-point"><strong>Saved on your device</strong><span>Export a copy when you need one.</span></div>
                </div>
                <div className="landing-quick-setup" aria-label="Board setup options">
                  <label htmlFor="landing-audience"><span>Make this for</span><select id="landing-audience" value={landingAudience} onChange={(event) => { const role = event.target.value as AudienceRole; setLandingAudience(role); setLandingTemplate(role === 'student' ? 'Cornell notes' : 'Lesson plan') }}><option value="student">Student</option><option value="teacher">Teacher</option></select></label>
                  <label htmlFor="landing-page-size"><span>Paper size</span><select id="landing-page-size" value={landingPageSize} onChange={(event) => setLandingPageSize(event.target.value as PageSize)}>{pageSizes.map((size) => <option key={size} value={size}>{size === 'Infinite' ? '∞ Infinite' : size}</option>)}</select></label>
                  <label htmlFor="landing-template"><span>Starter template</span><select id="landing-template" value={landingTemplate} onChange={(event) => setLandingTemplate(event.target.value as PageTemplate)}>{roleTemplates[landingAudience].map((template) => <option key={template} value={template}>{template}</option>)}</select></label>
                </div>
                <p className="landing-local-note">Paper size also scales the starter layout, text, and image placement to fit your page.</p>
              </div>
              <div className="landing-art" aria-label="Illustration of drawing and graph tools">
                <div className="landing-art-shadow" />
                <div className="art-paper">
                  <div className="art-toolbar"><span><Icon name="pen" size={16} /></span><span><Icon name="shape" size={16} /></span><span><Icon name="text" size={16} /></span><span><Icon name="graph" size={16} /></span><i /><b /><b /><b /></div>
                  <div className="art-note art-note-one"><span>ideas</span><strong>Make room<br />for a new thought.</strong><svg viewBox="0 0 120 42" aria-hidden="true"><path d="M4 30 C22 4 30 40 48 18 S75 8 82 26 S100 36 116 10" /></svg></div>
                  <div className="art-note art-note-two"><span>GRAPH</span><svg viewBox="0 0 150 100" aria-hidden="true"><path className="graph-grid" d="M10 10H145M10 35H145M10 60H145M10 85H145M10 10V90M45 10V90M80 10V90M115 10V90M145 10V90" /><path className="graph-axis" d="M10 60H145M80 10V90" /><path className="graph-curve" d="M12 82 C40 80 47 67 62 46 S94 14 144 15" /></svg><small>y = x²</small></div>
                  <div className="art-shape art-shape-circle" /><div className="art-shape art-shape-diamond" /><div className="art-caption">a little space for big ideas</div>
                </div>
                <div className="art-spark art-spark-one">✳</div><div className="art-spark art-spark-two">✦</div>
              </div>
            </section>
            <section className="audience-starters" id="audience-starters" aria-labelledby="audience-title">
              <div className="landing-section-heading"><span>{landingAudience === 'student' ? 'STUDENT STARTERS' : 'TEACHER STARTERS'}</span><h2 id="audience-title">Start with what you need.</h2></div>
              <div className="starter-card-grid" role="tabpanel" aria-label={landingAudience === 'student' ? 'Student board starters' : 'Teacher board starters'}>
                {roleStarters[landingAudience].map((starter) => <button key={starter.title} type="button" className="starter-card" onClick={() => addBoard(starter.fileName, starter.template, landingPageSize)}><span className="starter-icon">{starter.icon === 'notes' ? <ThemeIcon source={notesPng} size={21} /> : <Icon name={starter.icon} size={21} />}</span><span className="starter-card-copy"><strong>{starter.title}</strong><small>{starter.description}</small></span><Icon name="next" size={17} /></button>)}
              </div>
            </section>
            {landingAudience === 'student' && <StudentSpace />}
            <section className="landing-tools" id="landing-tools">
              <div className="landing-section-heading"><span>MAKE IT YOURS</span><h2>Simple tools. Room to explore.</h2></div>
              <div className="landing-feature-grid">
                <article className="landing-feature"><span className="feature-icon feature-draw"><Icon name="pen" /></span><h3>Draw and arrange</h3><p>Use the brush, pen, shapes, text, lines, and eraser. Move and organize what you create.</p></article>
                <article className="landing-feature"><span className="feature-icon feature-graph"><Icon name="graph" /></span><h3>Put ideas on a graph</h3><p>Plot equations or enter points, then add the graph to your board.</p></article>
                <article className="landing-feature"><span className="feature-icon feature-pages"><ThemeIcon source={downloadPng} size={23} /></span><h3>Keep it portable</h3><p>Work across pages, import images, and export as PDF, PNG, or SVG.</p></article>
              </div>
            </section>
            <section className="landing-files" id="landing-files">
              <div className="landing-files-heading"><div><span>READY WHEN YOU ARE</span><h2>Your files, close at hand.</h2></div><button className="landing-new-small" onClick={() => addBoard()}>＋ New board</button></div>
              <div className="library-shortcuts" aria-label="Saved file quick views"><strong>Quick views</strong><button type="button" aria-pressed={tagFilter === 'active'} className={tagFilter === 'active' ? 'selected' : ''} onClick={() => setTagFilter(tagFilter === 'active' ? '' : 'active')}>◉ Active</button><button type="button" aria-pressed={tagFilter === 'favorite'} className={tagFilter === 'favorite' ? 'selected' : ''} onClick={() => setTagFilter(tagFilter === 'favorite' ? '' : 'favorite')}>★ Favorites</button><span className="para-shortcut-label">PARA notebooks</span>{['Projects', 'Areas', 'Resources', 'Archives'].map((book) => <button type="button" key={book} aria-pressed={notebookFilter === book} className={notebookFilter === book ? 'selected' : ''} onClick={() => { setNotebooks((current) => [...new Set([...current, book])]); setNotebookFilter(notebookFilter === book ? 'All notebooks' : book) }}>{book}</button>)}</div>
              <input ref={documentInputRef} className="image-file-input" type="file" accept=".ozoonotes,.doomnotes,.json,application/json,application/pdf,.pdf" aria-label="Open a OzooNotes or PDF file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openBoardFile(file); event.currentTarget.value = '' }} />
              <section className="scratchpad" aria-labelledby="scratchpad-title"><div className="scratchpad-heading"><div><span className="library-kicker">QUICK CAPTURE</span><h3 id="scratchpad-title">Scratchpad</h3><p>Catch a thought or task before you sort it into a notebook.</p></div><span className="scratchpad-count">{scratchItems.filter((item) => !item.done).length} open</span></div><form className="scratchpad-form" onSubmit={(event) => { event.preventDefault(); addScratchItem() }}><input aria-label="Quick note or task" placeholder="Add a thought or task…" value={scratchText} onChange={(event) => setScratchText(event.target.value)} /><button className="landing-new-small" type="submit">＋ Capture</button></form>{scratchItems.length > 0 && <ul className="scratchpad-list">{scratchItems.slice(0, 5).map((item) => <li key={item.id}><label><input type="checkbox" checked={item.done} onChange={() => setScratchItems((items) => items.map((current) => current.id === item.id ? { ...current, done: !current.done } : current))} /><span className={item.done ? 'scratch-done' : ''}>{item.text}</span></label><button type="button" aria-label={`Remove ${item.text}`} onClick={() => setScratchItems((items) => items.filter((current) => current.id !== item.id))}>×</button></li>)}</ul>}</section>
              <div className="library-controls">
                <input aria-label="Search files and tags" placeholder="Search files, tags, and notebooks…" value={fileSearch} onChange={(event) => setFileSearch(event.target.value)} />
                <select aria-label="Filter by notebook" value={notebookFilter} onChange={(event) => setNotebookFilter(event.target.value)}><option>All notebooks</option>{[...new Set(['Inbox', ...notebooks])].map((book) => <option key={book}>{book}</option>)}</select>
                <input aria-label="Filter by tag" placeholder="Filter by tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} />
              </div>
              <form className="notebook-create" onSubmit={(event) => { event.preventDefault(); createNotebook() }}><input aria-label="New notebook name" placeholder="Create a notebook…" value={newNotebookName} onChange={(event) => setNewNotebookName(event.target.value)} /><button className="landing-new-small" type="submit">＋ Add notebook</button><small>Notebooks group related files; add several tags separated by commas.</small></form>
              
              {(() => { const files = [...new Set(recentFiles)].filter((name) => name && !name.includes(':')); const query = tagFilter.trim().replace(/^#/, '').toLowerCase(); const filtered = files.filter((name) => { let meta: { notebook?: string; tags?: string[] } = {}; try { meta = JSON.parse(localStorage.getItem(`doomnotes:${name}`) ?? '{}') } catch {} const haystack = `${name} ${meta.notebook ?? 'Inbox'} ${(meta.tags ?? []).join(' ')}`.toLowerCase(); const tags = (meta.tags ?? []).map((tag) => tag.toLowerCase().replace(/^#/, '')); const tagMatches = !query || (query === 'active' || query === 'favorite' ? tags.includes(query) : tags.some((tag) => tag.includes(query))); return haystack.includes(fileSearch.trim().toLowerCase()) && (notebookFilter === 'All notebooks' || (meta.notebook ?? 'Inbox') === notebookFilter) && tagMatches }); return filtered.length ? <div className="landing-recent-list">{filtered.map((name) => { let meta: { notebook?: string; tags?: string[] } = {}; try { meta = JSON.parse(localStorage.getItem(`doomnotes:${name}`) ?? '{}') } catch {} return <article className="library-file-card" key={name}><button className="library-file-open" onClick={() => openSavedFile(name)}><span className="recent-icon"><ThemeIcon source={notesPng} size={19} /></span><span>{name}<small>Saved in this browser</small></span><b>Open <Icon name="next" size={13} /></b></button><button type="button" className="library-file-rename" onClick={() => openRenameDialog(name)}>Rename file</button><div className="library-file-meta"><label>Notebook<select aria-label={`Notebook for ${name}`} value={meta.notebook ?? 'Inbox'} onChange={(event) => saveFileOrganization(name, event.target.value, (meta.tags ?? []).join(', '))}><option value="Inbox">Inbox</option>{notebooks.map((book) => <option key={book}>{book}</option>)}</select></label><label>Tags<input aria-label={`Tags for ${name}`} defaultValue={(meta.tags ?? []).join(', ')} placeholder="ideas, article, #active…" onBlur={(event) => saveFileOrganization(name, meta.notebook ?? 'Inbox', event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label></div>{Boolean(meta.tags?.length) && <div className="file-tag-list">{meta.tags?.map((tag) => <span key={tag}>#{tag.replace(/^#/, '')}</span>)}</div>}</article> })}</div> : <div className="library-no-results">{files.length ? 'No files match those filters.' : 'Your saved boards will appear here. Create one to get started, or open an OzooNotes file.'}</div> })()}
              {!localOnly && cloudUser && <div className="landing-cloud-files"><h3>Cloud boards</h3>{cloudBoards.length ? <div className="landing-recent-list">{cloudBoards.map((board) => <button key={board.id} onClick={() => loadCloudBoard(board)}><span className="recent-icon"><Icon name="cloud" size={18} /></span><span>{board.name}<small>{board.ownerName ? `Shared by ${board.ownerName}` : 'Saved on your server'}</small></span><b>Open <Icon name="next" size={13} /></b></button>)}</div> : <p className="empty-hint">No cloud boards yet.</p>}</div>}
            </section>
            <footer className="landing-footer"><div className="landing-brand"><img className="brand-mark" src={brandLogo} alt="OzooNotes" /></div><span>Don’t Doomscroll, just OzooNotes</span></footer>
          </div>
        </section>
        {newFileDialog}
        {renameDialog}
        {quickStartDialog}
        {!localOnly && accountDialog}
      </main>
    )
  }

  return (
    <main className={`app ${dark ? 'dark' : 'light'}`} data-theme={colorTheme}>
      <div className="window">
        <header className="window-top">
          <nav className="file-tabs" aria-label="Whiteboard files">
            {boards.map((board, index) => <div key={board.name} className={`file-tab ${index === activeBoard ? 'selected' : ''}`}>
              <button className="tab-open" title="Double-click to rename" onClick={() => activateBoard(index)} onDoubleClick={() => openRenameDialog(board.name)}>{board.name}</button>
              <button className="tab-close" aria-label={`Close ${board.name}`} title={`Close ${board.name}`} onClick={() => closeBoard(index)}><Icon name="close" size={13} /></button>
            </div>)}
            <button className="add-file" onClick={() => addBoard()} aria-label="Create new file"><Icon name="addPage" size={18} /></button>
            <button className="export-pdf" onClick={openExportDialog} title={infinitePage ? 'Choose PNG or SVG for infinite boards' : 'Choose pages and export format'}><ThemeIcon source={downloadPng} size={17} /> Export…</button>
          </nav>
          <div className="more-features-wrap">
            <button className="more-features-trigger" aria-expanded={moreFeaturesOpen} aria-haspopup="true" onClick={() => setMoreFeaturesOpen((open) => !open)}><Icon name="settings" size={16} /> {timerRunning ? `More features · ${String(Math.floor(timerSeconds / 60)).padStart(2, '0')}:${String(timerSeconds % 60).padStart(2, '0')}` : 'More features'} <Icon name="chevronDown" size={12} /></button>
            {moreFeaturesOpen && <section className="more-features-panel" aria-label="More features">
              <div className="more-features-heading"><strong>More features</strong><button aria-label="Close more features" onClick={() => setMoreFeaturesOpen(false)}>×</button></div>
              <div className="more-feature-section"><span className="more-feature-label">LAYERS</span>
                {([['writing', 'Writing & shapes'], ['text', 'Text'], ['images', 'Pictures']] as [LayerName, string][]).map(([layer, label]) => <div className="feature-layer-row" key={layer}><button className="feature-layer-visibility" aria-pressed={!hiddenLayers.includes(layer)} onClick={() => toggleLayerVisibility(layer)}><span>{hiddenLayers.includes(layer) ? '◌' : '◉'}</span><span>{label}</span><small>{hiddenLayers.includes(layer) ? 'Hidden' : 'Visible'}</small></button><button className="feature-layer-clear" title={`Delete ${label.toLowerCase()} from this page`} aria-label={`Delete ${label.toLowerCase()} from this page`} onClick={() => clearCurrentLayer(layer)}>×</button></div>)}
                <p className="more-feature-hint">Hide a layer to focus. Delete removes that layer’s objects from this page.</p>
              </div>
              <div className="more-feature-section theme-feature"><span className="more-feature-label">APPEARANCE</span><label className="theme-toggle theme-picker"><span>Color theme</span><select aria-label="Color scheme" value={colorTheme} onChange={(event) => setColorTheme(event.target.value as ColorTheme)}>{colorThemes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>{!localOnly && <button className="account-button feature-account" onClick={() => setAccountOpen(true)}><Icon name="cloud" size={16} /> {cloudUser ? cloudUser.username : 'Sign in'}</button>}</div>
              <div className="more-feature-section screen-recording-section"><span className="more-feature-label">SCREEN RECORDING</span><p className="screen-recording-hint">Capture a screen, window, or tab. The video downloads to your device as a WebM file.</p>{screenRecordingState !== 'idle' && <div className="screen-recording-status"><span className={`recording-indicator ${screenRecordingState}`} /><strong>{screenRecordingState === 'paused' ? 'Paused' : 'Recording'}</strong><time>{String(Math.floor(screenRecordingSeconds / 60)).padStart(2, '0')}:{String(screenRecordingSeconds % 60).padStart(2, '0')}</time></div>}{screenRecordingError && <p className="screen-recording-error" role="alert">{screenRecordingError}</p>}<div className="screen-recording-actions">{screenRecordingState === 'idle' ? <button className="recording-start" onClick={() => { void startScreenRecording() }}><span className="recording-button-dot" /> Record screen</button> : <><button onClick={toggleScreenRecordingPause}>{screenRecordingState === 'paused' ? 'Resume' : 'Pause'}</button><button className="recording-stop" onClick={stopScreenRecording}>Stop & save</button></>}</div></div>
              <div className="more-feature-section timer-section"><span className="more-feature-label">FOCUS TIMER</span><div className="timer-readout" aria-live="polite">{String(Math.floor(timerSeconds / 60)).padStart(2, '0')}:{String(timerSeconds % 60).padStart(2, '0')}</div><label className="timer-duration">Minutes<input type="number" min={1} max={240} value={timerMinutes} disabled={timerRunning} onChange={(event) => { const value = Math.max(1, Math.min(240, Number(event.target.value) || 1)); setTimerMinutes(value); setTimerSeconds(value * 60) }} /></label><div className="timer-actions"><button onClick={() => { if (timerSeconds <= 0) setTimerSeconds(timerMinutes * 60); setTimerRunning((running) => !running) }}>{timerRunning ? 'Pause' : timerSeconds === 0 ? 'Start again' : 'Start'}</button><button onClick={() => { setTimerRunning(false); setTimerSeconds(timerMinutes * 60) }}>Reset</button></div></div>
            </section>}
          </div>
        </header>

        <section className="board-area">
          <div className="board-menu-wrap">
            <button className="menu-trigger" aria-label="Open drawing menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Icon name="menu" /></button>
            {menuOpen && <div className="board-menu">
              <p className="menu-title">Page options</p>
              <button onClick={() => { setQuickStartOpen(true); setMenuOpen(false) }}><ThemeIcon source={notesPng} size={18} /> <span>Quick Start Guide</span></button>
              <label className="menu-option"><input type="checkbox" checked={gridEnabled} onChange={(event) => setGridEnabled(event.target.checked)} /> Unlock grid on page</label>
              <label className="menu-option"><input type="checkbox" disabled={infinitePage} checked={showScale && !infinitePage} onChange={(event) => setShowScale(event.target.checked)} /> Scale on page</label>
              {showScale && !infinitePage && <label className="menu-option ruler-unit-option">Ruler units<select value={rulerUnit} onChange={(event) => setRulerUnit(event.target.value as RulerUnit)}><option value="mm">Millimeters (mm)</option><option value="cm">Centimeters (cm)</option><option value="in">Inches (in)</option></select></label>}
              <div className="menu-divider" />
              <button onClick={() => { setLibraryName(''); setLibraryOpen(true); setMenuOpen(false) }}><Icon name="layer" size={17} /> <span>Libraries</span></button>
              <button onClick={() => { setMenuOpen(false); openRenameDialog() }}><Icon name="text" size={17} /> <span>Rename this file…</span></button>
              <button onClick={openExportDialog}><ThemeIcon source={downloadPng} size={18} /> <span>Export pages…</span></button>
              <button onClick={openTitleDialog}><Icon name="notes" size={17} /> <span>Add section title to page {page}</span></button>
              <button onClick={() => { void exportDrawing('png') }}><Icon name="image" size={17} /> <span>Export this page as PNG</span></button>
              <button onClick={() => { void exportDrawing('svg') }}><Icon name="shape" size={17} /> <span>Export this page as SVG</span></button>
              <button onClick={() => { void copyPageForNotion() }}><Icon name="notes" size={17} /> <span>Copy page for Notion</span></button>
              <button onClick={exportObsidianNote}><Icon name="notes" size={17} /> <span>Export for Obsidian</span></button>
              <button onClick={saveCurrentFile}><Icon name="duplicate" size={17} /> <span>Save</span></button>
              <button onClick={saveBoardToFile}><ThemeIcon source={downloadPng} size={18} /> <span>Save OzooNotes file</span></button>
              <button onClick={() => documentInputRef.current?.click()}><ThemeIcon source={folderPng} size={18} /> <span>Open OzooNotes file</span></button>
              <a className="board-menu-github" href="https://github.com/AMStudios6/ozoonotes" target="_blank" rel="noreferrer"><Icon name="share" size={17} /> <span>See how it works on GitHub</span></a>
              {!localOnly && <>
              <button onClick={openCloudSaveDialog}><Icon name="cloud" size={17} /> <span>Save to server</span></button>
              <button onClick={() => { void openShareManager() }}><Icon name="share" size={17} /> <span>Access and read-only links</span></button>
              <button onClick={() => { if (!cloudUser) setAccountOpen(true); else { setCommentOpen(true); const id = cloudBoardIds[boards[activeBoard].name]; if (id) void loadComments(id).catch((error) => setCloudMessage(error.message)); else setCloudMessage('Save this board to your server first.') } }}><Icon name="notes" size={17} /> <span>Comments</span></button>
              <button onClick={() => { if (!cloudUser) setAccountOpen(true); else { setTeamOpen(true); void apiRequest<{ teams: { id: number; name: string }[] }>('/api/teams').then(({ teams: result }) => setTeams(result)).catch((error) => setCloudMessage(error.message)) } }}><Icon name="diagram" size={17} /> <span>Team management</span></button>
              {saveNotice && <div className="save-notice">{saveNotice}</div>}
              {cloudMessage && <div className="save-notice">{cloudMessage}</div>}
              </>}
            </div>}
          </div>
          <div className="quick-actions" aria-label="Selection actions">
            <button className="history-label" title="Undo" aria-label="Undo" disabled={!historyState.canUndo} onClick={undo}><Icon name="undo" size={17} /></button>
            <button className="history-label" title="Redo" aria-label="Redo" disabled={!historyState.canRedo} onClick={redo}><Icon name="redo" size={17} /></button>
            <button title="Delete selection" aria-label="Delete selection" disabled={!selectedIndices.length} onClick={deleteSelection}><Icon name="delete" size={17} /></button>
            <button title="Duplicate selection" aria-label="Duplicate selection" disabled={!selectedIndices.length} onClick={duplicateSelection}><Icon name="duplicate" size={17} /></button>
            <button title="Send selection backward" aria-label="Send selection backward" disabled={!selectedIndices.length} onClick={() => moveSelectionLayer('back')}><Icon name="layer" size={17} /></button>
          </div>
          <div className="toolbar" aria-label="Drawing tools">
            <button type="button" className="tool-button image-import" title="Import image" aria-label="Import image" onClick={() => imageInputRef.current?.click()}><span><Icon name="image" /></span></button>
            <button type="button" className="tool-button graph-tool" title="Add graph" aria-label="Add graph" onClick={() => { setGraphError(''); setGraphOpen(true) }}><span><Icon name="graph" /></span></button>
            <div className="drawing-tool-group">
              <button type="button" ref={brushToolRef} className={'tool-button drawing-tool-toggle ' + (drawingToolGroup.includes(activeTool) ? 'active' : '')} title="Tap to use the last drawing tool; hold for tool options" aria-label="Select the last drawing tool; hold for drawing tools" aria-expanded={drawingToolsOpen} aria-controls="drawing-tool-menu" onPointerDown={startDrawingToolHold} onPointerUp={cancelDrawingToolHold} onPointerLeave={cancelDrawingToolHold} onPointerCancel={cancelDrawingToolHold} onContextMenu={(event) => event.preventDefault()} onClick={selectLastDrawingTool}><span><Icon name={toolIcons[drawingToolGroup.includes(activeTool) ? activeTool : 'Brush']} /></span><small><Icon name="chevronDown" size={11} /></small></button>
              {drawingToolsOpen && <div id="drawing-tool-menu" className="drawing-tool-menu" role="group" aria-label="Drawing tools">{drawingToolGroup.map((tool) => <button key={tool} type="button" className={'drawing-tool-option ' + (activeTool === tool ? 'active' : '')} aria-pressed={activeTool === tool} onClick={() => { setActiveTool(tool); lastDrawingTool.current = tool; setDrawingToolsOpen(false); if (inkTools.includes(tool)) setShowSettingsPanel(true) }}><span><Icon name={toolIcons[tool]} size={18} /></span><span>{tool}</span></button>)}</div>}
            </div>
            {(['Hand', 'Select', 'Shape', 'Text', 'Line'] as Tool[]).map((tool) => <button key={tool} type="button" title={tool} aria-label={tool} className={'tool-button ' + (activeTool === tool ? 'active' : '')} onClick={() => { setDrawingToolsOpen(false); setActiveTool(tool) }}><span><Icon name={toolIcons[tool]} /></span></button>)}
            <button type="button" ref={settingsToggleRef} className="tool-button settings-toggle" title={showSettingsPanel ? 'Hide drawing settings' : 'Show drawing settings'} aria-label={showSettingsPanel ? 'Hide drawing settings' : 'Show drawing settings'} aria-expanded={showSettingsPanel} aria-controls="drawing-settings" onClick={() => setShowSettingsPanel((visible) => !visible)}><span><Icon name="settings" /></span></button>
          </div>
          <input ref={imageInputRef} className="image-file-input" type="file" accept="image/*" aria-label="Choose an image to import" onChange={(event) => { const file = event.target.files?.[0]; if (file) insertImageBlob(file); event.currentTarget.value = '' }} />
          <input ref={documentInputRef} className="image-file-input" type="file" accept=".ozoonotes,.doomnotes,.json,application/json,application/pdf,.pdf" aria-label="Open a OzooNotes or PDF file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openBoardFile(file); event.currentTarget.value = '' }} />
                    {showSettingsPanel && <aside id="drawing-settings" ref={settingsPanelRef} className="stroke-panel" aria-label="Selection and drawing settings">
            {inkTools.includes(activeTool) && <div className="settings-group"><label className="settings-heading" htmlFor="drawing-style">Brush & pen style</label><select id="drawing-style" className="drawing-style-select" value={drawingStyle} onChange={(event) => { const style = event.target.value as DrawingStyle; setDrawingStyle(style); changeSelection({ drawingStyle: style }) }}><option value="solid">Solid</option><option value="handwriting">Handwriting · smooth</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="calligraphy">Calligraphy</option></select></div>}
            {inkTools.includes(activeTool) && <div className="settings-group"><div className="settings-heading">Color</div><div className="selection-colors">{penColors.concat(['#cf78e9','#d99c3d','#188c73','#e43141']).map((color) => <button key={color} type="button" aria-label={`Stroke color ${color}`} aria-pressed={activeColor === color} className={`selection-color ${activeColor === color ? 'chosen' : ''}`} style={{ backgroundColor: color }} onClick={() => { setActiveColor(color); changeSelection({ color }) }} />)}</div></div>}
            {!infinitePage && <div className="settings-group"><div className="settings-heading">Background</div><div className="settings-swatches">{pageColors.map((color) => <button key={color} type="button" aria-label={pageBackgroundLabel(color)} aria-pressed={isBackgroundChoiceSelected(pageBackground, color)} className={`settings-swatch ${isBackgroundChoiceSelected(pageBackground, color) ? 'chosen' : ''}`} style={pageBackgroundSwatchStyle(color)} onClick={() => setActiveBackground(color)} />)}</div></div>}
            <div className="settings-group opacity-group"><label className="settings-heading" htmlFor="stroke-width">Stroke width</label><input id="stroke-width" type="range" min="1" max="16" step="1" value={strokeWidth} onChange={(event) => { const width = Number(event.target.value); setStrokeWidth(width); changeSelection({ width }) }} /><div className="opacity-labels"><span>1</span><span>{strokeWidth}px</span><span>16</span></div><div className="stroke-sizes">{[['S',2],['M',4],['L',7],['XL',12]].map(([name,width]) => <button key={name} className={strokeWidth === width ? 'selected' : ''} onClick={() => { setStrokeWidth(width as number); changeSelection({ width: width as number }) }}>{name}</button>)}</div></div>
            <div className="selection-actions" aria-label="Object ordering and selection actions"><button title="Duplicate" aria-label="Duplicate" disabled={!selectedIndices.length} onClick={duplicateSelection}><Icon name="duplicate" size={16} /></button><button title="Send backward" aria-label="Send backward" disabled={!selectedIndices.length} onClick={() => moveSelectionLayer('back')}><Icon name="layer" size={16} /></button><button title="Bring forward" aria-label="Bring forward" disabled={!selectedIndices.length} onClick={() => moveSelectionLayer('front')}><Icon name="layer" size={16} /></button><button title="Delete" aria-label="Delete" disabled={!selectedIndices.length} onClick={deleteSelection}><Icon name="delete" size={16} /></button></div>
            {activeTool === 'Shape' && <div className="settings-group"><div className="settings-heading">Shape</div><div className="shape-options">{(['Rectangle', 'Ellipse', 'Triangle', 'Diamond', 'Arrow'] as ShapeKind[]).map((kind) => <button key={kind} className={`shape-option ${shapeKind === kind ? 'selected' : ''}`} aria-pressed={shapeKind === kind} onClick={() => setShapeKind(kind)}>{kind}</button>)}</div>{shapeKind !== 'Ellipse' && shapeKind !== 'Arrow' && <div className="shape-rounding"><label className="settings-heading" htmlFor="shape-rounding">Corner rounding <span>{shapeCornerRadius === 0 ? 'Sharp' : `${shapeCornerRadius}%`}</span></label><input id="shape-rounding" type="range" min="0" max="30" step="1" value={shapeCornerRadius} onChange={(event) => { const radius = Number(event.target.value); setShapeCornerRadius(radius); changeSelection({ cornerRadius: radius }) }} /><div className="opacity-labels"><span>Sharp</span><span>Rounded</span></div></div>}</div>}
            <div className="settings-group opacity-group"><label className="settings-heading" htmlFor="stroke-opacity">Opacity</label><input id="stroke-opacity" type="range" min="0" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /><div className="opacity-labels"><span>{opacity === 0 ? 0 : opacity}</span><span>100</span></div></div>
          </aside>}

          <div ref={workspaceRef} className={`workspace ${zoom > 100 ? 'zoomed' : ''} ${infinitePage ? 'infinite-workspace' : ''}`} onWheel={(event) => { if (infinitePage) { event.preventDefault(); setInfiniteCameraByPage((current) => ({ ...current, [cameraKey]: { x: (current[cameraKey]?.x ?? 0) + event.deltaX / (canvasWidth * zoom / 100), y: (current[cameraKey]?.y ?? 0) + event.deltaY / (canvasHeight * zoom / 100) } })) } }}>
            <div className={`paper ${orientation} ${infinitePage ? 'infinite' : ''} ${gridEnabled ? 'grid-enabled' : ''} ${showScale ? 'scale-enabled' : ''}`} style={{ zoom: zoom / 100, ...(infinitePage ? { width: '3600px', aspectRatio: '1 / 1', backgroundPosition: `${-cameraOffset.x * canvasWidth}px ${-cameraOffset.y * canvasHeight}px` } : { backgroundColor: resolvePageBackground(pageBackground, dark, colorTheme), aspectRatio: `${orientedPageMm[0]} / ${orientedPageMm[1]}`, transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }) }} aria-label={infinitePage ? 'Infinite whiteboard' : `${pageSize} ${orientation} page`}>
              {showScale && !infinitePage && <div className="rulers" aria-label={`Ruler in ${rulerUnit}`} aria-hidden="true"><div className="ruler-top">{rulerTicks(orientedPageMm[0], rulerUnit).map((tick, index) => <span key={index} style={{ left: `${tick.position}%` }}>{tick.label}</span>)}</div><div className="ruler-left">{rulerTicks(orientedPageMm[1], rulerUnit).map((tick, index) => <span key={index} style={{ top: `${tick.position}%` }}>{tick.label}</span>)}</div></div>}
              {textEditor && <textarea className="text-editor" autoFocus aria-label="Text to add to page" placeholder="Type here…" value={textEditor.value} style={{ left: `${(textEditor.point.x - (infinitePage ? cameraOffset.x : 0)) * 100}%`, top: `${(textEditor.point.y - (infinitePage ? cameraOffset.y : 0)) * 100}%`, color: activeColor, fontSize: `${Math.max(8, strokeWidth * pageContentScale(pageSize) * 5)}px` }} onChange={(event) => setTextEditor({ ...textEditor, value: event.target.value })} onBlur={() => { if (!cancelTextRef.current) commitText(); cancelTextRef.current = false }} onKeyDown={(event) => { if (event.key === 'Escape') { cancelTextRef.current = true; setTextEditor(null) } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) event.currentTarget.blur() }} />}
              <canvas ref={canvasRef} className={`drawing-canvas ${activeTool === 'Hand' ? 'hand-cursor' : activeTool === 'Select' ? 'move-cursor' : activeTool === 'Eraser' ? 'erase-cursor' : ''}`} width={canvasWidth} height={canvasHeight} onPointerDown={startStroke} onPointerMove={continueStroke} onPointerUp={finishStroke} onPointerCancel={finishStroke} onPointerLeave={() => { if (!activeStroke.current) { setEraserHover(null); setErasePreviewIndices([]) } }} aria-label="Drawing canvas" />
              {indexView && indexPageCount > 0 && <section className="title-index-page" aria-label={`Contents index page ${indexPage} of ${indexPageCount}`}><div className="title-index-kicker">CONTENTS · {boards[activeBoard].name}</div><h1>Page index</h1><p>Choose a title to jump to that page.</p><ol>{(boards[activeBoard].titles ?? []).slice((indexPage - 1) * 20, indexPage * 20).map((item) => <li key={item.id}><button type="button" onClick={() => { setPage(item.page); setIndexView(false) }}><span>{item.title}</span><i /><b>Page {item.page}</b></button></li>)}</ol><small>Contents page {indexPage} of {indexPageCount} · your notes start on page 1</small></section>}
            </div>
          </div>

          <div className="bottom-controls">
            <div className="page-actions">
              {!infinitePage && <label className="orientation-select" title={`Page orientation: ${orientation}`}><span className="orientation-icon"><Icon name={orientation} size={17} /></span><select value={orientation} onChange={(event) => setActiveOrientation(event.target.value as 'portrait' | 'landscape')} aria-label="Page orientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>}
              {!infinitePage && <div className="add-page-wrap"><button className="add-page" aria-label="Add page" title="Add page" aria-haspopup="menu" aria-expanded={addPageMenuOpen} onClick={() => setAddPageMenuOpen((open) => !open)}><span><Icon name="addPage" size={17} /></span><span className="add-page-label">Add page</span></button>{addPageMenuOpen && <div className="add-page-menu" role="menu" aria-label="Choose new page orientation"><p>New page orientation</p><button role="menuitem" onClick={() => addPage('portrait')}><Icon name="portrait" size={17} /> Portrait</button><button role="menuitem" onClick={() => addPage('landscape')}><Icon name="landscape" size={17} /> Landscape</button></div>}</div>}
            </div>
            <div className="bottom-right-controls">
              <div className="zoom-control">
                <button aria-label="Zoom out" title="Zoom out" onClick={() => setZoom(Math.max(10, zoom - 10))}><Icon name="zoomOut" size={17} /></button>
                <span className="zoom-value">{zoom}%</span>
                <button aria-label="Zoom in" title="Zoom in" onClick={() => setZoom(Math.min(500, zoom + 10))}><Icon name="zoomIn" size={17} /></button>
              </div>
              <div className={`page-navigation ${indexView ? 'index-navigation' : ''}`}>
              <button aria-label="Previous page" title="Previous page" disabled={indexView ? indexPage <= 1 : page <= 1 && indexPageCount === 0} onClick={() => { if (indexView) setIndexPage(Math.max(1, indexPage - 1)); else if (page === 1 && indexPageCount) { setIndexView(true); setIndexPage(indexPageCount) } else setPage(Math.max(1, page - 1)) }}><Icon name="previous" size={16} /></button>
              {indexView ? <><span>Index</span><input aria-label="Index page number" type="number" min={1} max={indexPageCount} value={indexPage} onChange={(event) => setIndexPage(Math.min(indexPageCount, Math.max(1, Number(event.target.value) || 1)))} /><span>of {indexPageCount}</span></> : <><span>Page</span><input aria-label="Current page number" type="number" min={1} max={boards[activeBoard].pages} value={page} onChange={(event) => setPage(Math.min(boards[activeBoard].pages, Math.max(1, Number(event.target.value) || 1)))} /><span>of {boards[activeBoard].pages}</span></>}
              <button aria-label="Next page" title="Next page" disabled={!indexView && page >= boards[activeBoard].pages} onClick={() => { if (indexView && indexPage < indexPageCount) setIndexPage(indexPage + 1); else if (indexView) { setIndexView(false); setPage(1) } else setPage(Math.min(boards[activeBoard].pages, page + 1)) }}><Icon name="next" size={16} /></button>
              {!indexView && <><button className="page-title-action" title={`Add title to page ${page}`} aria-label={`Add title to page ${page}`} onClick={openTitleDialog}>＋ Title</button>{indexPageCount > 0 && <button className="page-index-action" title="Open contents index" onClick={() => { setIndexView(true); setIndexPage(1) }}>Contents</button>}</>}
              </div>
            </div>
          </div>
          <div className={`tool-status autosave-${autoSaveStatus}`} role="status"><span className="status-dot" />{autoSaveStatus === 'saving' ? 'Saving locally…' : autoSaveStatus === 'saved' ? 'Saved locally' : autoSaveStatus === 'error' ? 'Auto-save failed · use Save' : 'Not saved yet'}{selectedIndices.length ? ` · ${selectedIndices.length} selected` : ''} · {activeTool}</div>
        </section>
      </div>
      {newFileDialog}
        {renameDialog}
      {quickStartDialog}
      {!localOnly && accountDialog}
      {!localOnly && shareDialog}
      {!localOnly && commentsDialog}
      {!localOnly && teamDialog}
      {libraryDialog}
      {!localOnly && cloudSaveDialog}
      {graphDialog}
      {titleDialog}
      {exportDialog}
    </main>
  )
}

export default App


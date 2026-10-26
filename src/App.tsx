import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type WheelEvent, type CSSProperties, type FormEvent } from 'react'
import './App.css'
import './WorkspacePolish.css'
import notesPng from './assets/notes.png'
import downloadPng from './assets/download.png'
import folderPng from './assets/folder.png'
import CppSimulator from './CppSimulator'
import CodeSimulator from './CodeSimulator'
import CircuitSimulator from './CircuitSimulator'
import CalculusSimulator from './CalculusSimulator'
import ProjectStudio from './ProjectsPage'
import DiaryPage from './DiaryPage'
import RoadmapsPage from './RoadmapsPage'
import { installAppContextMenu } from './contextMenu'
import { SimulatorThemePicker, useSimulatorTheme } from './SimulatorTheme'
import { AdminPage, ContactPage, MarketingHome, ProductPage, PricingPage, type AdminAccount, type SiteRoute } from './SitePages'
import './ResponsiveLayout.css'

type Tool = 'Brush' | 'Pencil' | 'Pen' | 'Marker' | 'Highlighter' | 'Hand' | 'Select' | 'Shape' | 'Text' | 'Line' | 'Eraser'
type IconName = 'brush' | 'pencil' | 'pen' | 'marker' | 'highlighter' | 'hand' | 'select' | 'shape' | 'text' | 'line' | 'eraser' | 'image' | 'graph' | 'settings' | 'undo' | 'redo' | 'delete' | 'duplicate' | 'layer' | 'addPage' | 'portrait' | 'landscape' | 'zoomIn' | 'zoomOut' | 'next' | 'previous' | 'notes' | 'study' | 'lesson' | 'worksheet' | 'diagram' | 'share' | 'cloud' | 'sun' | 'moon' | 'close' | 'menu' | 'pdf' | 'chevronDown'
type AudienceRole = 'student' | 'teacher' | 'business'
type AccountType = 'student' | 'teacher' | 'business' | 'employee'
type ColorTheme = 'purple' | 'white-purple'
type ShapeKind = 'Rectangle' | 'Ellipse' | 'Triangle' | 'Diamond' | 'Arrow'
type RulerUnit = 'mm' | 'cm' | 'in'
type PageSize = 'Infinite' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | 'Tabloid'
type PageTemplate = 'Blank' | 'Lined notes' | 'Graph paper' | 'Cornell notes' | 'Weekly planner' | 'Lesson plan' | 'Worksheet' | 'Class diagram' | 'Exit ticket' | 'Rubric' | 'Seating chart' | 'Mood board' | 'Coding notes' | 'Meeting notes' | 'Project brief' | 'SWOT analysis' | 'Weekly update'
type SectionTitle = { id: string; title: string; page: number }
type LayerName = 'writing' | 'text' | 'images'
type DrawingStyle = 'solid' | 'handwriting' | 'dashed' | 'dotted' | 'calligraphy'
type Board = { name: string; pages: number; pageSize?: PageSize; infinite?: boolean; orientation?: 'portrait' | 'landscape'; pageOrientations?: ('portrait' | 'landscape')[]; pageBackground?: string; notebook?: string; tags?: string[]; titles?: SectionTitle[]; hiddenLayers?: LayerName[] }
type ScratchItem = { id: string; text: string; done: boolean }
type DashboardTask = { id: string; title: string; dueDate: string; createdAt: number; done: boolean; completedAt?: number }
type DashboardGoal = { id: string; title: string; month: string; done: boolean }
type DashboardProjectSummary = { id: string; title: string; description: string; updatedAt: number }
type DashboardShortcut = { id: string; kind: 'file' | 'folder' | 'project' | 'roadmap'; label: string; target: string }
type CloudUser = { id: number; username: string; email?: string | null; displayName?: string; avatar?: string | null; hasPassword?: boolean; plan?: 'normal' | 'pro'; businessPlan?: boolean; accountType?: AccountType; isAdmin?: boolean }
type BoardState = { pages: number; pageSize?: PageSize; infinite?: boolean; orientation: 'portrait' | 'landscape'; pageOrientations?: ('portrait' | 'landscape')[]; pageBackground: string; gridEnabled?: boolean; showScale?: boolean; hiddenLayers?: LayerName[]; pageStrokes: Stroke[][] }
type EncryptedBoardState = { encrypted: 'doomnotes-aes-gcm'; version: 1; kdf: 'PBKDF2-SHA-256'; iterations: number; salt: string; iv: string; ciphertext: string }
type CloudBoard = { id: number; ownerId?: number; name: string; folderId: number | null; state: BoardState | EncryptedBoardState; role?: string; canDownload?: boolean; ownerName?: string; updatedAt?: string }
type CloudComment = { id: number; username: string; body: string; createdAt: string }
type LibraryItem = { id: string; name: string; strokes: Stroke[] }
type Point = { x: number; y: number }
type Stroke = { tool: 'Brush' | 'Pencil' | 'Pen' | 'Marker' | 'Highlighter' | 'Shape' | 'Line' | 'Text' | 'Image' | 'Eraser'; color: string; width: number; opacity: number; points: Point[]; text?: string; shapeKind?: ShapeKind; cornerRadius?: number; imageData?: string; layer?: LayerName; drawingStyle?: DrawingStyle; smoothing?: number; strokeCap?: 'round' | 'square' }
type MoveSession = { indices: number[]; start: Point; originals: Stroke[]; preview: Stroke[] }
type SelectionBox = { start: Point; current: Point }
type DecorationPosition = 'top' | 'middle' | 'bottom' | 'left' | 'right'
type DashboardDecoration = { id: string; kind: 'banner'; position: DecorationPosition; title: string; subtitle: string; color: string; image?: string; url?: string } | { id: string; kind: 'sticker'; position: DecorationPosition; emoji: string; image?: string; alt: string; url?: string }
type DashboardAppearance = { backgroundMode: 'solid' | 'gradient'; background: string; backgroundEnd: string; gradientAngle: number; fileColor: string }
type FolderToolLink = 'projects' | 'roadmaps' | 'graph' | 'electronics' | 'calculus' | 'code'
function readDashboardValue<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback }
}
function dashboardMonthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` }
function readDashboardTasks(): DashboardTask[] {
  try { const value = JSON.parse(localStorage.getItem('ozoo:dashboard-tasks') ?? '[]'); return Array.isArray(value) ? value.filter((task): task is DashboardTask => task && typeof task.id === 'string' && typeof task.title === 'string' && typeof task.done === 'boolean' && typeof task.createdAt === 'number') : [] } catch { return [] }
}
function readDashboardGoals(): DashboardGoal[] {
  const month = dashboardMonthKey()
  try {
    const stored = localStorage.getItem(`ozoo:dashboard-monthly-goals:${month}`)
    if (stored) return (JSON.parse(stored) as DashboardGoal[]).filter((goal) => goal && goal.month === month && typeof goal.id === 'string' && typeof goal.title === 'string' && typeof goal.done === 'boolean')
  } catch {}
  return ['Review my notes each week', 'Finish one project', 'Make time to plan'].map((title, index) => ({ id: `goal-${month}-${index}`, title, month, done: false }))
}
function safeDashboardUrl(value: string) {
  const candidate = value.trim()
  if (!candidate) return undefined
  try { const parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(candidate) ? candidate : 'https://' + candidate); return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : undefined } catch { return undefined }
}
async function compressDashboardImage(file: File, maxWidth: number, maxHeight: number) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPEG, or WebP image.')
  if (file.size > 10 * 1024 * 1024) throw new Error('Images must be smaller than 10 MB.')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) { bitmap.close(); throw new Error('This browser could not prepare the image.') }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('The image could not be compressed.')), 'image/webp', 0.76))
  if (blob.size > 180 * 1024) throw new Error('This image is still too large after compression. Try a smaller image.')
  return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('The image could not be read.')); reader.readAsDataURL(blob) })
}
const penColors = ['#8b5cf6', '#18202a', '#e65353', '#ee8b33', '#48a879', '#378cdb', '#9762d5']
const pageColors = ['auto', 'white', '#19171e', '#fff9e8', '#e9f2ff', '#f3e9ff']
function themedCanvasBackground(theme: ColorTheme) {
  return theme === 'purple' ? '#08060d' : '#f8f5ff'
}
const colorThemes: { id: ColorTheme; name: string; dark: boolean }[] = [
  { id: 'purple', name: 'Black & White', dark: true },
  { id: 'white-purple', name: 'White & Black', dark: false },
]
function makeTemplateStrokes(template: PageTemplate, size: PageSize, orientation: 'portrait' | 'landscape', theme: ColorTheme = 'purple'): Stroke[] {
  if (template === 'Blank') return []
  const dimensions = size === 'Infinite' ? [210, 297] : pageDimensionsMm[size]
  const [widthMm, heightMm] = orientation === 'landscape' ? [dimensions[1], dimensions[0]] : dimensions
  const accent = theme === 'purple' ? '#bd8bff' : '#8246c1'
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
  } else if (template === 'Meeting notes') {
    lines.push(text('MEETING NOTES', 14, 10, 3.7), text('DATE / TIME', 14, 27, 2.2), line(45, 33, widthMm * 0.52, 33), text('ATTENDEES', widthMm * 0.56, 27, 2.2), line(widthMm * 0.76, 33, widthMm - 14, 33), line(14, 40, widthMm - 14, 40, accent, 55, 0.9))
    const sections = [['AGENDA', 48], ['DISCUSSION NOTES', 82], ['DECISIONS', 150], ['ACTION ITEMS · OWNER · DUE DATE', 204]] as const
    for (const [label, y] of sections) { if (y < heightMm - 16) { lines.push(text(label, 14, y, 2.4)); for (let row = 0; row < 2 && y + 12 + row * 11 < heightMm - 10; row++) lines.push(line(14, y + 10 + row * 11, widthMm - 14, y + 10 + row * 11, soft, 39, 0.65)) } }
  } else if (template === 'Project brief') {
    lines.push(text('PROJECT BRIEF', 14, 10, 3.7), text('GOAL', 14, 29, 2.4), line(14, 37, widthMm - 14, 37, accent, 47, 0.8), text('SCOPE & DELIVERABLES', 14, 49, 2.4), text('MILESTONES', 14, 95, 2.4), text('PEOPLE & RESOURCES', 14, 139, 2.4), text('RISKS / OPEN QUESTIONS', 14, 181, 2.4))
    for (let y = 57; y < heightMm - 15; y += 11) lines.push(line(14, y, widthMm - 14, y, soft, 38, 0.65))
  } else if (template === 'SWOT analysis') {
    const gap = 8, left = 14, top = 30, boxW = (widthMm - 28 - gap) / 2, boxH = Math.min(78, (heightMm - 48 - gap) / 2)
    lines.push(text('SWOT ANALYSIS', 14, 10, 3.7))
    ;[['STRENGTHS', left, top], ['WEAKNESSES', left + boxW + gap, top], ['OPPORTUNITIES', left, top + boxH + gap], ['THREATS', left + boxW + gap, top + boxH + gap]].forEach(([label, x, y]) => {
      const px = Number(x), py = Number(y)
      lines.push(text(String(label), px + 4, py + 4, 2.3), line(px, py, px + boxW, py, accent, 54), line(px + boxW, py, px + boxW, py + boxH, accent, 45), line(px + boxW, py + boxH, px, py + boxH, accent, 45), line(px, py + boxH, px, py, accent, 45))
      for (let row = 0; row < 3; row++) lines.push(line(px + 4, py + 17 + row * 13, px + boxW - 4, py + 17 + row * 13, soft, 38, 0.65))
    })
  } else if (template === 'Weekly update') {
    lines.push(text('WEEKLY TEAM UPDATE', 14, 10, 3.7), text('WEEK OF', 14, 28, 2.2), line(39, 34, widthMm - 14, 34, soft, 44, 0.8))
    const sections = ['WINS & PROGRESS', 'CURRENT PRIORITIES', 'BLOCKERS / SUPPORT NEEDED', 'NEXT WEEK']
    sections.forEach((label, index) => { const y = 47 + index * Math.max(38, (heightMm - 68) / 4); lines.push(text(label, 14, y, 2.4), line(14, y + 13, widthMm - 14, y + 13, soft, 38, 0.65), line(14, y + 25, widthMm - 14, y + 25, soft, 38, 0.65)) })
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
function resolvePageBackground(background: string, dark: boolean, theme: ColorTheme = 'purple') {
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
function gridLineColor(dark: boolean, theme: ColorTheme = 'purple') {
  const purpleTheme = theme === 'purple'
  return dark ? (purpleTheme ? 'rgba(189, 139, 255, .48)' : 'rgba(130, 70, 193, .34)') : 'rgba(130, 70, 193, .34)'
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

const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE || 'https://api.ozoonotes.com')

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init.headers } })
  const data = await response.json() as T & { error?: string }
  if (!response.ok) {
    const error = new Error(data.error ?? `Request failed (${response.status})`) as Error & { code?: string }
    error.code = (data as { code?: string }).code
    throw error
  }
  return data
}

type ClassroomLink = { userId: number; username: string; permission: 'view' | 'edit'; status: 'pending' | 'accepted' | 'declined' }
function ClassroomAccessPanel({ accountType }: { accountType: AccountType }) {
  const [links, setLinks] = useState<ClassroomLink[]>([])
  const [username, setUsername] = useState('')
  const [permission, setPermission] = useState<'view' | 'edit'>('view')
  const [message, setMessage] = useState('')
  const refresh = async () => {
    try { const result = await apiRequest<{ links: ClassroomLink[] }>('/api/classroom/links'); setLinks(result.links); setMessage('') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load classroom access.') }
  }
  useEffect(() => { void refresh() }, [accountType])
  const invite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await apiRequest('/api/classroom/links', { method: 'POST', body: JSON.stringify({ username, permission }) })
      setUsername(''); setMessage('Invitation sent. The student must accept before you can see their cloud notes.'); await refresh()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not send invitation.') }
  }
  const respond = async (link: ClassroomLink, status: 'accepted' | 'declined') => {
    try { await apiRequest(`/api/classroom/links/${link.userId}`, { method: 'PATCH', body: JSON.stringify({ status }) }); await refresh() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update this invitation.') }
  }
  const remove = async (link: ClassroomLink) => {
    try { await apiRequest(`/api/classroom/links/${link.userId}`, { method: 'DELETE' }); await refresh() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not remove classroom access.') }
  }
  return <section className="classroom-access-panel"><h3>{accountType === 'teacher' ? 'Student accounts' : 'Teacher access'}</h3>{accountType === 'teacher' ? <><p>Invite a student by username. Accepted students let you access their cloud-saved notes with the permission you choose.</p><form onSubmit={(event) => { void invite(event) }}><label className="dialog-label">Student username<input required value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Enter their username" /></label><label className="dialog-label">Access<select value={permission} onChange={(event) => setPermission(event.target.value as 'view' | 'edit')}><option value="view">Observe · view notes</option><option value="edit">Can edit notes</option></select></label><button className="dialog-create full-button">Send invitation</button></form></> : <p>Teachers can only access your cloud-saved notes after you accept an invitation. You can remove access at any time.</p>}{links.length > 0 && <div className="classroom-link-list">{links.map((link) => <article key={link.userId}><span><strong>@{link.username}</strong><small>{link.status === 'accepted' ? `${link.permission === 'edit' ? 'Can edit' : 'Can view'} · ${accountType === 'teacher' ? 'Student' : 'Teacher'}` : `Invitation ${link.status}`}</small></span>{accountType === 'student' && link.status === 'pending' ? <span><button type="button" onClick={() => void respond(link, 'accepted')}>Accept</button><button type="button" onClick={() => void respond(link, 'declined')}>Decline</button></span> : <button type="button" onClick={() => void remove(link)}>{link.status === 'pending' ? 'Cancel' : 'Remove'}</button>}</article>)}</div>}{message && <p className="cloud-message" role="status">{message}</p>}</section>
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
  const epsilon = 1e-7
  const onSegment = (start: Point, point: Point, end: Point) =>
    point.x >= Math.min(start.x, end.x) - epsilon && point.x <= Math.max(start.x, end.x) + epsilon &&
    point.y >= Math.min(start.y, end.y) - epsilon && point.y <= Math.max(start.y, end.y) + epsilon
  if (((abC > epsilon && abD < -epsilon) || (abC < -epsilon && abD > epsilon)) &&
      ((cdA > epsilon && cdB < -epsilon) || (cdA < -epsilon && cdB > epsilon))) return true
  return (Math.abs(abC) <= epsilon && onSegment(a, c, b)) ||
    (Math.abs(abD) <= epsilon && onSegment(a, d, b)) ||
    (Math.abs(cdA) <= epsilon && onSegment(c, a, d)) ||
    (Math.abs(cdB) <= epsilon && onSegment(c, b, d))
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
type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
type SelectionBounds = { left: number; top: number; right: number; bottom: number }
type ResizeSession = { indices: number[]; start: Point; originals: Stroke[]; preview: Stroke[]; bounds: SelectionBounds; handle: ResizeHandle }
function selectionBoundsFor(drawings: Stroke[], selected: number[], width: number, height: number): SelectionBounds | null {
  const visible = selected.map((index) => drawings[index]).filter((stroke): stroke is Stroke => !!stroke?.points.length)
  if (!visible.length) return null
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const stroke of visible) {
    const xs = stroke.points.map((point) => point.x * width)
    const ys = stroke.points.map((point) => point.y * height)
    left = Math.min(left, ...xs); top = Math.min(top, ...ys)
    right = Math.max(right, ...xs); bottom = Math.max(bottom, ...ys)
    if (stroke.tool === 'Text') {
      right = Math.max(right, xs[0] + Math.max(32, (stroke.text?.length ?? 1) * stroke.width * 2.7))
      bottom = Math.max(bottom, ys[0] + Math.max(26, stroke.width * 5))
    }
  }
  const padding = 10
  return { left: (left - padding) / width, top: (top - padding) / height, right: (right + padding) / width, bottom: (bottom + padding) / height }
}
function selectionHandles(bounds: SelectionBounds): { id: ResizeHandle; x: number; y: number }[] {
  const cx = (bounds.left + bounds.right) / 2, cy = (bounds.top + bounds.bottom) / 2
  return [
    { id: 'nw', x: bounds.left, y: bounds.top }, { id: 'n', x: cx, y: bounds.top }, { id: 'ne', x: bounds.right, y: bounds.top },
    { id: 'e', x: bounds.right, y: cy }, { id: 'se', x: bounds.right, y: bounds.bottom }, { id: 's', x: cx, y: bounds.bottom },
    { id: 'sw', x: bounds.left, y: bounds.bottom }, { id: 'w', x: bounds.left, y: cy },
  ]
}
function hitResizeHandle(bounds: SelectionBounds, point: Point, width: number, height: number): ResizeHandle | null {
  const x = point.x * width, y = point.y * height
  return selectionHandles(bounds).find((handle) => Math.hypot(x - handle.x * width, y - handle.y * height) <= 14)?.id ?? null
}
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
    context.lineCap = drawing.strokeCap ?? (drawing.drawingStyle === 'calligraphy' ? 'square' : 'round')
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
      } else if ((drawing.smoothing ?? (drawing.drawingStyle === 'handwriting' ? 65 : 0)) > 0 && drawing.points.length > 2) {
        const smoothing = Math.max(0, Math.min(100, drawing.smoothing ?? (drawing.drawingStyle === 'handwriting' ? 65 : 0))) / 100
        for (let index = 1; index < drawing.points.length - 1; index++) {
          const point = drawing.points[index], next = drawing.points[index + 1]
          const blend = smoothing * 0.5
          const endX = point.x * (1 - blend) + next.x * blend
          const endY = point.y * (1 - blend) + next.y * blend
          context.quadraticCurveTo(point.x * canvas.width, point.y * canvas.height, endX * canvas.width, endY * canvas.height)
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
  if (selected.length) {
    const bounds = selectionBoundsFor(drawings, selected, canvas.width, canvas.height)
    if (bounds) {
      context.save()
      context.globalAlpha = 1
      context.strokeStyle = '#a977eb'
      context.fillStyle = '#ffffff'
      context.lineWidth = 1.5
      context.setLineDash([])
      context.strokeRect(bounds.left * canvas.width, bounds.top * canvas.height, (bounds.right - bounds.left) * canvas.width, (bounds.bottom - bounds.top) * canvas.height)
      for (const handle of selectionHandles(bounds)) {
        const x = handle.x * canvas.width, y = handle.y * canvas.height
        context.fillRect(x - 5, y - 5, 10, 10)
        context.strokeRect(x - 5, y - 5, 10, 10)
      }
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
  const startsPrimary = (token: string | undefined) => Boolean(token && (token === '(' || /^[a-z]+$/i.test(token) || /^(?:\d*\.?\d+)(?:e[+-]?\d+)?$/i.test(token)))
  const product = (): number => { let value = unary(); while (peek() === '*' || peek() === '/' || startsPrimary(peek())) { const explicitOperator = peek() === '*' || peek() === '/'; const op = explicitOperator ? take() : '*'; const next = unary(); value = op === '*' ? value * next : value / next } return value }
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
  business: ['Blank', 'Meeting notes', 'Project brief', 'SWOT analysis', 'Weekly update', 'Weekly planner', 'Mood board'],
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
  business: [
    { title: 'Meeting notes', description: 'Capture agenda items, decisions, and action owners.', fileName: 'Meeting notes', template: 'Meeting notes', icon: 'notes' },
    { title: 'Project brief', description: 'Set out goals, scope, milestones, and risks.', fileName: 'Project brief', template: 'Project brief', icon: 'duplicate' },
    { title: 'SWOT analysis', description: 'Map strengths, weaknesses, opportunities, and threats.', fileName: 'SWOT analysis', template: 'SWOT analysis', icon: 'diagram' },
    { title: 'Weekly team update', description: 'Share progress, priorities, and blockers.', fileName: 'Weekly update', template: 'Weekly update', icon: 'lesson' },
    { title: 'Team planner', description: 'Organize work and key dates for the week.', fileName: 'Team planner', template: 'Weekly planner', icon: 'worksheet' },
    { title: 'Business mood board', description: 'Gather visual references for a product or campaign.', fileName: 'Business mood board', template: 'Mood board', icon: 'image' },
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
const normalDocumentLimit = 5
const normalSimulationsPerToolPerDay = 2

function readSiteRoute(): SiteRoute {
  const page = new URLSearchParams(window.location.search).get('page')
  if (page === 'home' || page === 'product' || page === 'pricing' || page === 'dashboard' || page === 'diary' || page === 'roadmaps' || page === 'contact' || page === 'notes' || page === 'signin' || page === 'profile' || page === 'account' || page === 'admin') return page
  return 'home'
}

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
  const [simulatorTheme, setSimulatorTheme] = useSimulatorTheme()
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
    <main className="graph-workspace" data-theme={simulatorTheme}>
      <section className="graph-simulator-page">
        <header className="graph-topbar">
          <button type="button" className="graph-back-button" onClick={onBack} aria-label="Back to notes"><span aria-hidden="true">‹</span><span>Notes</span></button>
          <div className="graph-document-title"><span className="graph-document-glyph" aria-hidden="true">ƒ</span><span>Untitled Graph</span></div>
          <div className="graph-view-controls" aria-label="Graph view controls"><SimulatorThemePicker theme={simulatorTheme} onChange={setSimulatorTheme} />
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
  const [sitePage, setSitePage] = useState<SiteRoute>(readSiteRoute)
  const [dashboardSidebarCollapsed, setDashboardSidebarCollapsed] = useState(() => (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 760px)').matches) || readDashboardValue('ozoo:dashboard-sidebar-collapsed', false))
  const [folderNavExpanded, setFolderNavExpanded] = useState(() => readDashboardValue('ozoo:dashboard-folders-expanded', true))

  const navigatePage = (target: string) => {
    const [pageTarget, anchor] = target.split('#', 2)
    const nextPage = (['home', 'product', 'pricing', 'dashboard', 'diary', 'roadmaps', 'contact', 'notes', 'signin', 'profile', 'account', 'admin'].includes(pageTarget) ? pageTarget : 'home') as SiteRoute
    const url = new URL(window.location.href)
    url.searchParams.delete('workspace')
    url.searchParams.delete('simulator')
    if (nextPage === 'home') url.searchParams.delete('page')
    else url.searchParams.set('page', nextPage)
    url.hash = anchor ? `#${anchor}` : ''
    window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`)
    setSitePage(nextPage)
    if (nextPage === 'signin' && !sessionStorage.getItem('ozoo:after-login')) sessionStorage.setItem('ozoo:after-login', 'dashboard')
    if (nextPage === 'profile') setProfileOpen(true)
    if (anchor) window.setTimeout(() => document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth' }), 60)
    else window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  useEffect(() => {
    const syncRoute = () => setSitePage(readSiteRoute())
    window.addEventListener('popstate', syncRoute)
    return () => window.removeEventListener('popstate', syncRoute)
  }, [])
  useEffect(() => {
    const titles: Record<SiteRoute, string> = { home: 'OzooNotes — Just imagine, and it will do it.', product: 'What OzooNotes offers', pricing: 'OzooNotes plans', dashboard: 'Your OzooNotes dashboard', diary: 'Diary · OzooNotes', roadmaps: 'Community roadmaps · OzooNotes', contact: 'Contact OzooNotes', notes: 'Notes · OzooNotes', signin: 'Sign in to OzooNotes', profile: 'Edit your profile · OzooNotes', account: 'Your account · OzooNotes', admin: 'OzooNotes admin' }
    document.title = titles[sitePage]
  }, [sitePage])
  const [initialWorkspace] = useState(readSavedWorkspace)
  const [boards, setBoards] = useState<Board[]>(initialWorkspace.boards)
  const [notebooks, setNotebooks] = useState<string[]>(() => { try { const value = JSON.parse(localStorage.getItem('ozoo:notebooks') ?? '[]'); return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [] } catch { return [] } })
  const [folderCreateOpen, setFolderCreateOpen] = useState(false)
  useEffect(() => { try { localStorage.setItem('ozoo:dashboard-sidebar-collapsed', String(dashboardSidebarCollapsed)) } catch {} }, [dashboardSidebarCollapsed])
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mobile = window.matchMedia('(max-width: 760px)')
    const collapseForMobile = (event: MediaQueryListEvent) => { if (event.matches) setDashboardSidebarCollapsed(true) }
    mobile.addEventListener('change', collapseForMobile)
    return () => mobile.removeEventListener('change', collapseForMobile)
  }, [])
  useEffect(() => { try { localStorage.setItem('ozoo:dashboard-folders-expanded', String(folderNavExpanded)) } catch {} }, [folderNavExpanded])


  const [folderLinks, setFolderLinks] = useState<Record<string, FolderToolLink[]>>(() => { try { const value = JSON.parse(localStorage.getItem('ozoo:folder-links') ?? '{}'); return value && typeof value === 'object' ? value as Record<string, FolderToolLink[]> : {} } catch { return {} } })
  const [folderAddOpen, setFolderAddOpen] = useState(false)
  const [folderToolDraft, setFolderToolDraft] = useState<FolderToolLink>('projects')
  const [newNotebookName, setNewNotebookName] = useState('')
  const [scratchText, setScratchText] = useState('')
  const [scratchItems, setScratchItems] = useState<ScratchItem[]>(() => { try { const value = JSON.parse(localStorage.getItem('ozoo:scratchpad') ?? '[]'); return Array.isArray(value) ? value.filter((item): item is ScratchItem => item && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.done === 'boolean') : [] } catch { return [] } })
const [dashboardTasks, setDashboardTasks] = useState<DashboardTask[]>(readDashboardTasks)
  const [dashboardTaskDraft, setDashboardTaskDraft] = useState('')
  const [dashboardTaskDueDraft, setDashboardTaskDueDraft] = useState('')
  const [dashboardGoals, setDashboardGoals] = useState<DashboardGoal[]>(readDashboardGoals)
  const [dashboardGoalDraft, setDashboardGoalDraft] = useState('')
  const [dashboardProjects, setDashboardProjects] = useState<DashboardProjectSummary[]>([])
  const [projectFocusId, setProjectFocusId] = useState<string | null>(null)
  const [fileSearch, setFileSearch] = useState('')
  const [notebookFilter, setNotebookFilter] = useState('All notebooks')
  const [selectedDashboardFile, setSelectedDashboardFile] = useState<string | null>(null)
  const [dashboardFileView, setDashboardFileView] = useState<'grid' | 'list'>(() => readDashboardValue<'grid' | 'list'>('ozoo:dashboard-file-view', 'grid'))
  const [dashboardShortcuts, setDashboardShortcuts] = useState<DashboardShortcut[]>(() => readDashboardValue<DashboardShortcut[]>('ozoo:dashboard-shortcuts', []))
  const [dashboardShortcutDraft, setDashboardShortcutDraft] = useState('')
  useEffect(() => { try { localStorage.setItem('ozoo:dashboard-file-view', dashboardFileView) } catch {} }, [dashboardFileView])
  useEffect(() => { try { localStorage.setItem('ozoo:dashboard-shortcuts', JSON.stringify(dashboardShortcuts)) } catch {} }, [dashboardShortcuts])
  const [selectedDashboardColor, setSelectedDashboardColor] = useState('#dcecff')
  const [selectedDashboardNotebook, setSelectedDashboardNotebook] = useState('Inbox')
  const [dragOverNotebook, setDragOverNotebook] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState('')
  const [nextFileNumber, setNextFileNumber] = useState(() => Math.max(0, ...initialWorkspace.boards.map(({ name }) => Number(name.match(/^File (\d+)$/)?.[1] ?? 0))) + 1)
  const [activeBoard, setActiveBoard] = useState(initialWorkspace.activeBoard)
  const [activeTool, setActiveTool] = useState<Tool>('Brush')
  const [drawingToolsOpen, setDrawingToolsOpen] = useState(false)
  const [simulatorMenuOpen, setSimulatorMenuOpen] = useState(false)
  const [projectsPageOpen, setProjectsPageOpen] = useState(() => new URLSearchParams(window.location.search).get('workspace') === 'projects')
  const [graphSimulatorOpen, setGraphSimulatorOpen] = useState(() => new URLSearchParams(window.location.search).get('simulator') === 'graph')
  const [circuitSimulatorOpen, setCircuitSimulatorOpen] = useState(() => new URLSearchParams(window.location.search).get('simulator') === 'electronics')
  const [calculusSimulatorOpen, setCalculusSimulatorOpen] = useState(() => new URLSearchParams(window.location.search).get('simulator') === 'calculus')
  const [codeSimulatorMode, setCodeSimulatorMode] = useState<'cpp' | 'python' | 'java' | 'web' | null>(() => {
    const mode = new URLSearchParams(window.location.search).get('simulator')
    return mode === 'cpp' || mode === 'python' || mode === 'java' || mode === 'web' ? mode : null
  })
  const [accountType, setAccountType] = useState<AccountType>(() => {
    const saved = localStorage.getItem('ozoo:account-type')
    return saved === 'teacher' || saved === 'business' || saved === 'employee' ? saved : 'student'
  })
  const [landingAudience, setLandingAudience] = useState<AudienceRole>(() => localStorage.getItem('ozoo:account-type') === 'teacher' ? 'teacher' : ['business','employee'].includes(localStorage.getItem('ozoo:account-type') ?? '') ? 'business' : 'student')
  const [landingPageSize, setLandingPageSize] = useState<PageSize>('A4')
  const [landingTemplate, setLandingTemplate] = useState<PageTemplate>('Cornell notes')
  const [activeColor, setActiveColor] = useState(penColors[0])
  const [hexColorDraft, setHexColorDraft] = useState(penColors[0])
  const [recentStrokeColors, setRecentStrokeColors] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('ozoo:recent-stroke-colors') ?? '[]')
      return Array.isArray(saved) ? saved.filter((color): color is string => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)).slice(0, 6) : []
    } catch { return [] }
  })
  const [showSettingsPanel, setShowSettingsPanel] = useState(true)
  const [strokeWidth, setStrokeWidth] = useState(4)
  const [drawingStyle, setDrawingStyle] = useState<DrawingStyle>('solid')
  const [strokeSmoothness, setStrokeSmoothness] = useState(45)
  const [strokeCap, setStrokeCap] = useState<'round' | 'square'>('round')
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
  const isProUser = cloudUser?.plan === 'pro'
  const [adminUsers, setAdminUsers] = useState<AdminAccount[]>([])
  const [adminTotals, setAdminTotals] = useState({ users: 0, proUsers: 0 })
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [authStatus, setAuthStatus] = useState<'loading' | 'signed-out' | 'signed-in' | 'error'>('loading')
  const [googleLoginEnabled, setGoogleLoginEnabled] = useState(false)
  const [githubLoginEnabled, setGithubLoginEnabled] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [cloudBoards, setCloudBoards] = useState<CloudBoard[]>([])
  const cloudKeys = useRef<Record<number, string>>({})
  const cloudSyncedSnapshots = useRef<Record<number, string>>({})
  const [cloudFolders, setCloudFolders] = useState<{ id: number; name: string }[]>([])
  const [folderName, setFolderName] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null)
  const [cloudBoardIds, setCloudBoardIds] = useState<Record<string, number>>(() => JSON.parse(localStorage.getItem('doomnotes:cloud-board-ids') ?? '{}') as Record<string, number>)
  const cloudBoardOriginalNames = useRef<Record<string, string>>({})
  const [accountOpen, setAccountOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(() => new URLSearchParams(window.location.search).get('page') === 'profile')
  const [accountOverviewTab, setAccountOverviewTab] = useState<'Info' | 'Objectives' | 'Documents' | 'Reviews'>('Info')
  const [profileDisplayName, setProfileDisplayName] = useState('')
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null)
  const [profileCurrentPassword, setProfileCurrentPassword] = useState('')
  const [profileNewPassword, setProfileNewPassword] = useState('')
  const profileMenuRef = useRef<HTMLDetailsElement>(null)
  const [studentProfileSummary, setStudentProfileSummary] = useState<{ field?: string; otherField?: string; stage?: string; otherStage?: string; degree?: string } | null>(() => { try { return JSON.parse(localStorage.getItem('ozoo:student-profile') ?? 'null') } catch { return null } })
  const [passwordResetToken, setPasswordResetToken] = useState(() => new URLSearchParams(window.location.search).get('reset_password') ?? sessionStorage.getItem('ozoo:password-reset-token') ?? '')
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'verify' | 'forgot' | 'reset'>(() => new URLSearchParams(window.location.search).has('reset_password') || Boolean(sessionStorage.getItem('ozoo:password-reset-token')) ? 'reset' : 'login')
  const [authUsername, setAuthUsername] = useState('')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [cloudMessage, setCloudMessage] = useState('')
  const [cloudSaveOpen, setCloudSaveOpen] = useState(false)
  const [cloudSaveEncrypted, setCloudSaveEncrypted] = useState(false)
  const [cloudSavePassphrase, setCloudSavePassphrase] = useState('')
  const [cloudSaveConfirmation, setCloudSaveConfirmation] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUsername, setShareUsername] = useState('')
  const [shareRole, setShareRole] = useState<'read' | 'edit' | 'download'>('read')
  const [shareList, setShareList] = useState<{ username: string; role: 'view' | 'edit'; canDownload?: boolean }[]>([])
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
  const [presentationMode, setPresentationMode] = useState(false)
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [findResults, setFindResults] = useState<{ page: number; index: number; text: string }[]>([])
  const [moreFeaturesOpen, setMoreFeaturesOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [renameError, setRenameError] = useState('')
  const [fileSettingsTarget, setFileSettingsTarget] = useState<string | null>(null)
  const [fileSettingsNotebook, setFileSettingsNotebook] = useState('Inbox')
  const [fileSettingsTags, setFileSettingsTags] = useState('')
  const [fileSettingsFavorite, setFileSettingsFavorite] = useState(false)
  const [fileSettingsColor, setFileSettingsColor] = useState('#dcecff')
  const [timerMinutes, setTimerMinutes] = useState(25)
  const [timerSeconds, setTimerSeconds] = useState(25 * 60)
  const [timerRunning, setTimerRunning] = useState(false)
  const [screenRecordingState, setScreenRecordingState] = useState<'idle' | 'recording' | 'paused'>('idle')
  const [screenRecordingSeconds, setScreenRecordingSeconds] = useState(0)
  const [screenRecordingError, setScreenRecordingError] = useState('')
  const screenRecorderRef = useRef<MediaRecorder | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const screenChunksRef = useRef<Blob[]>([])
  const [voiceRecordingState, setVoiceRecordingState] = useState<'idle' | 'recording' | 'paused'>('idle')
  const [voiceRecordingSeconds, setVoiceRecordingSeconds] = useState(0)
  const [voiceRecordingError, setVoiceRecordingError] = useState('')
  const voiceRecorderRef = useRef<MediaRecorder | null>(null)
  const voiceStreamRef = useRef<MediaStream | null>(null)
  const voiceChunksRef = useRef<Blob[]>([])
  const hiddenLayers = boards[activeBoard]?.hiddenLayers ?? []
  const [quickStartOpen, setQuickStartOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [addPageMenuOpen, setAddPageMenuOpen] = useState(false)
  const [saveNotice, setSaveNotice] = useState('')
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [autoSaveError, setAutoSaveError] = useState('')
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle')
  const [dashboardDecorations, setDashboardDecorations] = useState<DashboardDecoration[]>(() => readDashboardValue('ozoo:dashboard-decorations', []))
  const [dashboardCustomizerOpen, setDashboardCustomizerOpen] = useState(false)
  const [dashboardAppearance, setDashboardAppearance] = useState<DashboardAppearance>(() => { const fallback: DashboardAppearance = { backgroundMode: 'solid', background: '#f4f2f8', backgroundEnd: '#e9e3f2', gradientAngle: 135, fileColor: '#dcecff' }; const saved = readDashboardValue<Partial<DashboardAppearance>>( 'ozoo:dashboard-appearance', {}); return { ...fallback, ...saved, background: /^#[0-9a-f]{6}$/i.test(saved.background ?? '') ? saved.background! : fallback.background, backgroundEnd: /^#[0-9a-f]{6}$/i.test(saved.backgroundEnd ?? '') ? saved.backgroundEnd! : fallback.backgroundEnd, fileColor: /^#[0-9a-f]{6}$/i.test(saved.fileColor ?? '') ? saved.fileColor! : fallback.fileColor, backgroundMode: saved.backgroundMode === 'gradient' ? 'gradient' : 'solid', gradientAngle: [0,45,90,135,180,225,270,315].includes(Number(saved.gradientAngle)) ? Number(saved.gradientAngle) : fallback.gradientAngle } })
  const [customizerMessage, setCustomizerMessage] = useState('')
  const [bannerTitle, setBannerTitle] = useState('')
  const [bannerSubtitle, setBannerSubtitle] = useState('')
  const [bannerColor, setBannerColor] = useState('#bce9e8')
  const [bannerImage, setBannerImage] = useState('')
  const [bannerUrl, setBannerUrl] = useState('')
  const [bannerPosition, setBannerPosition] = useState<DecorationPosition>('top')
  const [stickerEmoji, setStickerEmoji] = useState('✨')
  const [stickerAlt, setStickerAlt] = useState('')
  const [stickerImage, setStickerImage] = useState('')
  const [stickerUrl, setStickerUrl] = useState('')
  const [stickerPosition, setStickerPosition] = useState<DecorationPosition>('top')
  const [dashboardFooterNote, setDashboardFooterNote] = useState<string>(() => readDashboardValue('ozoo:dashboard-footer-note', ''))
  const [footerNoteDraft, setFooterNoteDraft] = useState<string>(() => readDashboardValue('ozoo:dashboard-footer-note', ''))
  const [recentFiles, setRecentFiles] = useState<string[]>(() => Object.keys(localStorage).filter((key) => key.startsWith('doomnotes:') && key !== 'doomnotes:cloud-board-ids').filter((key) => { try { const saved = JSON.parse(localStorage.getItem(key) ?? 'null'); return typeof saved?.name === 'string' && typeof saved.pages === 'number' && Array.isArray(saved.pageStrokes) } catch { return false } }).map((key) => key.slice('doomnotes:'.length)))
  const saveDashboardDecoration = (decoration: DashboardDecoration) => {
    if (dashboardDecorations.length >= 24) { setCustomizerMessage('You can add up to 24 banners and stickers.'); return false }
    const next = [...dashboardDecorations, decoration]
    if (JSON.stringify(next).length > 1_200_000) { setCustomizerMessage('Dashboard decorations are using too much browser storage. Remove an image or choose a smaller one.'); return false }
    setDashboardDecorations(next); setCustomizerMessage(''); return true
  }
  const addDashboardBanner = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const title = bannerTitle.trim()
    if (!title && !bannerImage) { setCustomizerMessage('Add a title or image for your banner.'); return }
    const url = safeDashboardUrl(bannerUrl)
    if (bannerUrl.trim() && !url) { setCustomizerMessage('Enter a valid http or https link.'); return }
    if (saveDashboardDecoration({ id: crypto.randomUUID(), kind: 'banner', position: bannerPosition, title, subtitle: bannerSubtitle.trim(), color: bannerColor, ...(bannerImage ? { image: bannerImage } : {}), ...(url ? { url } : {}) })) { setBannerTitle(''); setBannerSubtitle(''); setBannerImage(''); setBannerUrl('') }
  }
  const addDashboardSticker = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const url = safeDashboardUrl(stickerUrl)
    if (stickerUrl.trim() && !url) { setCustomizerMessage('Enter a valid http or https link.'); return }
    if (saveDashboardDecoration({ id: crypto.randomUUID(), kind: 'sticker', position: stickerPosition, emoji: stickerEmoji.trim() || '✨', alt: stickerAlt.trim() || 'Dashboard sticker', ...(stickerImage ? { image: stickerImage } : {}), ...(url ? { url } : {}) })) { setStickerImage(''); setStickerAlt(''); setStickerUrl('') }
  }
  const updateDecorationPosition = (id: string, position: DecorationPosition) => setDashboardDecorations((current) => current.map((item) => item.id === id ? { ...item, position } as DashboardDecoration : item))
  const removeDashboardDecoration = (id: string) => setDashboardDecorations((current) => current.filter((item) => item.id !== id))
  const renderDashboardDecorations = (position: DecorationPosition) => dashboardDecorations.filter((item) => item.position === position).map((item) => item.kind === 'banner'
    ? <article className={"dashboard-decoration-banner" + (item.image ? ' has-image' : '')} key={item.id} style={{ backgroundColor: item.color }}>{item.image && <img src={item.image} alt="" />}{item.title && <strong>{item.title}</strong>}{item.subtitle && <span>{item.subtitle}</span>}{item.url && <a className="dashboard-decoration-click-target" href={safeDashboardUrl(item.url)} target="_blank" rel="noopener noreferrer" aria-label={'Open link: ' + (item.title || 'dashboard banner')} />}</article>
    : <div className="dashboard-decoration-sticker" key={item.id} title={item.alt}>{item.image ? <img src={item.image} alt={item.alt} /> : <span aria-hidden="true">{item.emoji}</span>}{item.url && <a className="dashboard-decoration-click-target" href={safeDashboardUrl(item.url)} target="_blank" rel="noopener noreferrer" aria-label={'Open link: ' + item.alt} />}</div>)
  const countSavedDocuments = () => [...new Set([...recentFiles, ...boards.filter((board) => !board.infinite).map((board) => board.name)])].filter((name) => {
    if (!name || name.includes(':')) return false
    try { return (JSON.parse(localStorage.getItem(`doomnotes:${name}`) ?? 'null') as { infinite?: boolean } | null)?.infinite !== true }
    catch { return true }
  }).length
  useEffect(() => {
    const openShortcuts = () => setShortcutsOpen(true)
    window.addEventListener('ozoo:open-shortcuts', openShortcuts)
    return () => window.removeEventListener('ozoo:open-shortcuts', openShortcuts)
  }, [])
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && presentationMode) setPresentationMode(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [presentationMode])
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
  useEffect(() => {
    if (voiceRecordingState !== 'recording') return
    const interval = window.setInterval(() => setVoiceRecordingSeconds((seconds) => seconds + 1), 1000)
    return () => window.clearInterval(interval)
  }, [voiceRecordingState])
  useEffect(() => () => {
    const recorder = voiceRecorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    voiceStreamRef.current?.getTracks().forEach((track) => track.stop())
  }, [])
  useEffect(() => { try { localStorage.setItem('ozoo:dashboard-decorations', JSON.stringify(dashboardDecorations)) } catch { setCustomizerMessage('Browser storage is full. Remove a large image or delete a decoration, then try again.') } }, [dashboardDecorations])
  useEffect(() => { try { localStorage.setItem('ozoo:dashboard-footer-note', JSON.stringify(dashboardFooterNote)) } catch { setCustomizerMessage('Browser storage is full. Your footer note could not be saved.') } }, [dashboardFooterNote])
  useEffect(() => { try { localStorage.setItem('ozoo:notebooks', JSON.stringify(notebooks)) } catch { /* Notebook organization remains optional if storage is full. */ } }, [notebooks])
  useEffect(() => { try { localStorage.setItem('ozoo:folder-links', JSON.stringify(folderLinks)) } catch {} }, [folderLinks])
  useEffect(() => { try { localStorage.setItem('ozoo:dashboard-appearance', JSON.stringify(dashboardAppearance)) } catch { setCustomizerMessage('Browser storage is full. Appearance could not be saved.') } }, [dashboardAppearance])
  useEffect(() => { try { localStorage.setItem('ozoo:scratchpad', JSON.stringify(scratchItems)) } catch { /* Keep the board usable if browser storage is full. */ } }, [scratchItems])
useEffect(() => { try { localStorage.setItem('ozoo:dashboard-tasks', JSON.stringify(dashboardTasks)) } catch {} }, [dashboardTasks])
  useEffect(() => { try { localStorage.setItem(`ozoo:dashboard-monthly-goals:${dashboardMonthKey()}`, JSON.stringify(dashboardGoals)) } catch {} }, [dashboardGoals])
  useEffect(() => {
    let active = true
    let database: IDBDatabase | null = null
    try {
      const request = indexedDB.open('ozoo-project-documents', 1)
      request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('projects')) request.result.createObjectStore('projects', { keyPath: 'id' }) }
      request.onsuccess = () => {
        database = request.result
        const query = database.transaction('projects', 'readonly').objectStore('projects').getAll()
        query.onsuccess = () => { if (active) setDashboardProjects((query.result as DashboardProjectSummary[]).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6)); database?.close(); database = null }
      }
    } catch {}
    return () => { active = false; database?.close() }
  }, [projectsPageOpen])
  const [page, setPage] = useState(initialWorkspace.page)
  const [indexView, setIndexView] = useState(() => (initialWorkspace.boards[initialWorkspace.activeBoard]?.titles?.length ?? 0) > 1)
  const [indexPage, setIndexPage] = useState(1)
  const [zoom, setZoom] = useState(100)
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(initialWorkspace.orientation)
  const [colorTheme, setColorTheme] = useState<ColorTheme>(() => {
    const saved = localStorage.getItem('ozoo:color-theme') as ColorTheme | null
    return colorThemes.some((theme) => theme.id === saved) ? saved! : 'purple'
  })
  const dark = colorThemes.find((theme) => theme.id === colorTheme)?.dark ?? true
  useEffect(() => {
    const url = new URL(window.location.href)
    url.searchParams.delete('workspace')
    url.searchParams.delete('simulator')
    if (projectsPageOpen) url.searchParams.set('workspace', 'projects')
    else if (graphSimulatorOpen) url.searchParams.set('simulator', 'graph')
    else if (circuitSimulatorOpen) url.searchParams.set('simulator', 'electronics')
    else if (calculusSimulatorOpen) url.searchParams.set('simulator', 'calculus')
    else if (codeSimulatorMode) url.searchParams.set('simulator', codeSimulatorMode)
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [projectsPageOpen, graphSimulatorOpen, circuitSimulatorOpen, calculusSimulatorOpen, codeSimulatorMode])
  useEffect(() => { localStorage.setItem('ozoo:color-theme', colorTheme) }, [colorTheme])
  useEffect(() => { try { localStorage.setItem('ozoo:recent-stroke-colors', JSON.stringify(recentStrokeColors)) } catch { /* Recent color shortcuts are optional. */ } }, [recentStrokeColors])
  useEffect(() => {
    const syncSimulatorTheme = (event: Event) => { const next = (event as CustomEvent<ColorTheme>).detail; if (colorThemes.some((theme) => theme.id === next)) setColorTheme(next) }
    window.addEventListener('ozoo:color-theme-change', syncSimulatorTheme)
    return () => window.removeEventListener('ozoo:color-theme-change', syncSimulatorTheme)
  }, [])
  const brandLogo = `${import.meta.env.BASE_URL}ozoo-logo.png`
  const dashboardWeekStart = (() => { const date = new Date(); date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); return date })()
  const dashboardWeekDays = Array.from({ length: 7 }, (_, index) => { const date = new Date(dashboardWeekStart); date.setDate(date.getDate() + index); return date })
  const dashboardDailyCompletions = dashboardWeekDays.map((date) => dashboardTasks.filter((task) => task.completedAt && new Date(task.completedAt).toDateString() === date.toDateString()).length)
  const dashboardWeekMax = Math.max(1, ...dashboardDailyCompletions)
  const dashboardMonthlyGoals = dashboardGoals.filter((goal) => goal.month === dashboardMonthKey())
  const dashboardMonthlyProgress = dashboardMonthlyGoals.length ? Math.round(dashboardMonthlyGoals.filter((goal) => goal.done).length / dashboardMonthlyGoals.length * 100) : 0
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
  const lastDrawingTool = useRef<Tool>('Brush')
  const settingsToggleRef = useRef<HTMLButtonElement>(null)
  const settingsPanelRef = useRef<HTMLElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)
  const lastTextPoint = useRef<Point>({ x: 0.3, y: 0.3 })
  const activeStroke = useRef<Stroke | null>(null)
  const activeMove = useRef<MoveSession | null>(null)
  const activeResize = useRef<ResizeSession | null>(null)
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
  const selectLastDrawingTool = () => {
    setActiveTool(lastDrawingTool.current)
    setShowSettingsPanel(true)
    setDrawingToolsOpen(false)
  }
  const toggleDrawingToolMenu = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setDrawingToolsOpen((open) => !open)
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
    const closeIfOutside = (event: PointerEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) profileMenuRef.current.removeAttribute('open')
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') profileMenuRef.current?.removeAttribute('open')
    }
    document.addEventListener('pointerdown', closeIfOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeIfOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  useEffect(() => {
    let active = true
    Promise.all([
      apiRequest<{ user: CloudUser | null }>('/api/me'),
      apiRequest<{ google: boolean; github: boolean }>('/api/auth/providers'),
    ]).then(([{ user }, providers]) => {
      if (!active) return
      setCloudUser(passwordResetToken ? null : user)
      setGoogleLoginEnabled(providers.google)
      setGithubLoginEnabled(providers.github)
      setAuthStatus(user && !passwordResetToken ? 'signed-in' : 'signed-out')
      setAuthError('')
      if (user && !passwordResetToken) void refreshCloudBoards()
    }).catch((error) => {
      if (!active) return
      setAuthStatus('error')
      setAuthError(error instanceof Error ? error.message : 'Could not connect to the sign-in server.')
    })
    return () => { active = false }
  }, [passwordResetToken])

  useEffect(() => {
    if (authStatus !== 'signed-in') return
    const intended = sessionStorage.getItem('ozoo:after-login')
    if (intended) {
      sessionStorage.removeItem('ozoo:after-login')
      navigatePage(cloudUser?.isAdmin ? 'admin' : intended)
      return
    }
    if (sitePage === 'signin') navigatePage(cloudUser?.isAdmin ? 'admin' : 'dashboard')
  }, [authStatus, sitePage, cloudUser?.isAdmin])

  useEffect(() => {
    if ((sitePage === 'profile' || sitePage === 'account') && authStatus === 'signed-out') navigatePage('signin')
  }, [sitePage, authStatus])

  useEffect(() => {
    const url = new URL(window.location.href)
    const verificationToken = url.searchParams.get('verify_email')
    const resetToken = url.searchParams.get('reset_password')
    const verified = url.searchParams.get('verified')
    if (resetToken) sessionStorage.setItem('ozoo:password-reset-token', resetToken)
    if (!verificationToken && !resetToken && verified !== '1') return
    url.searchParams.delete('verify_email')
    url.searchParams.delete('reset_password')
    url.searchParams.delete('verified')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    if (verified === '1') {
      setAuthMode('login')
      setAuthNotice('Your email is verified. Sign in to continue.')
      return
    }
    void apiRequest<{ message: string }>('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token: verificationToken }) })
      .then(({ message }) => { setAuthMode('login'); setAuthNotice(message); setAuthError('') })
      .catch((error) => { setAuthMode('verify'); setAuthError(error instanceof Error ? error.message : 'That verification link is invalid or has expired.') })
  }, [])

  useEffect(() => {
    if (!inkTools.includes(activeTool) && activeTool !== 'Eraser') setShowSettingsPanel(false)
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
      const ids = Object.fromEntries(remote.map((item) => [item.ownerId && item.ownerId !== cloudUser?.id ? `${item.ownerName || 'Student'} — ${item.name}` : item.name, item.id]))
      cloudBoardOriginalNames.current = Object.fromEntries(remote.filter((item) => item.ownerId && item.ownerId !== cloudUser?.id).map((item) => [`${item.ownerName || 'Student'} — ${item.name}`, item.name]))
      setCloudBoardIds(ids)
      localStorage.setItem('doomnotes:cloud-board-ids', JSON.stringify(ids))
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Could not load cloud boards.') }
  }

  const refreshAdminOverview = async () => {
    setAdminLoading(true)
    setAdminError('')
    try {
      const result = await apiRequest<{ users: AdminAccount[]; totals: { users: number; proUsers: number } }>('/api/admin/overview')
      setAdminUsers(result.users)
      setAdminTotals(result.totals)
    } catch (error) {
      setAdminError(error instanceof Error ? error.message : 'Could not load admin accounts.')
    } finally { setAdminLoading(false) }
  }
  useEffect(() => {
    if (sitePage === 'admin' && authStatus === 'signed-in') void refreshAdminOverview()
  }, [sitePage, authStatus])
  const updateAdminPlan = async (id: number, plan: 'normal' | 'pro' | 'business') => {
    try {
      const updated = await apiRequest<{ plan: 'normal' | 'pro'; businessPlan: boolean }>(`/api/admin/users/${id}/plan`, { method: 'PATCH', body: JSON.stringify({ plan: plan === 'normal' ? 'standard' : plan === 'pro' ? 'class_plus' : 'business' }) })
      const previousPremium = adminUsers.find((user) => user.id === id)?.plan === 'pro'
      setAdminUsers((users) => users.map((user) => user.id === id ? { ...user, plan: updated.plan, businessPlan: updated.businessPlan } : user))
      const nextPremium = updated.plan === 'pro'
      if (previousPremium !== nextPremium) setAdminTotals((totals) => ({ ...totals, proUsers: totals.proUsers + (nextPremium ? 1 : -1) }))
    } catch (error) { setAdminError(error instanceof Error ? error.message : 'Could not update this plan.') }
  }

  const submitAccount = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      if (authMode === 'verify' || authMode === 'forgot') {
        const route = authMode === 'verify' ? '/api/auth/resend-verification' : '/api/auth/password-reset/request'
        const { message } = await apiRequest<{ message: string }>(route, { method: 'POST', body: JSON.stringify({ email: authEmail }) })
        setAuthNotice(message)
        setAuthError('')
        return
      }
      if (authMode === 'reset') {
        const { message } = await apiRequest<{ message: string }>('/api/auth/password-reset/complete', { method: 'POST', body: JSON.stringify({ token: passwordResetToken, password: authPassword }) })
        setPasswordResetToken('')
        sessionStorage.removeItem('ozoo:password-reset-token')
        setAuthMode('login')
        setAuthPassword('')
        setAuthUsername('')
        setAuthNotice(message)
        setAuthError('')
        return
      }
      if (authMode === 'register') {
        const { message } = await apiRequest<{ requiresVerification: boolean; message: string }>('/api/auth/register', { method: 'POST', body: JSON.stringify({ username: authUsername, email: authEmail, password: authPassword }) })
        setAuthMode('login')
        setAuthUsername(authEmail)
        setAuthPassword('')
        setAuthNotice(message)
        setAuthError('')
        return
      }
      const { user } = await apiRequest<{ user: CloudUser }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ login: authUsername, password: authPassword }) })
      setCloudUser(user)
      setAuthStatus('signed-in')
      setAuthNotice('')
      setAuthError('')
      setCloudBoardIds({})
      setSelectedFolderId(null)
      localStorage.removeItem('doomnotes:cloud-board-ids')
      setCloudMessage(`Signed in as ${user.username}`)
      setAccountOpen(false)
      setAuthPassword('')
      await refreshCloudBoards()
      const { teams: availableTeams } = await apiRequest<{ teams: { id: number; name: string }[] }>('/api/teams')
      setTeams(availableTeams)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sign in.'
      setCloudMessage(message)
      setAuthError(message)
      if ((error as Error & { code?: string }).code === 'EMAIL_NOT_VERIFIED') {
        setAuthEmail(authUsername.includes('@') ? authUsername : '')
        setAuthMode('verify')
      }
    }
  }

  const saveToCloud = async (passphrase?: string) => {
    if (!canEditActiveBoard) { setCloudMessage('You have read-only access to this board.'); return }
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
        ? await apiRequest<{ board: CloudBoard }>(`/api/boards/${existingId}`, { method: 'PUT', body: JSON.stringify({ name: cloudBoardOriginalNames.current[currentBoard.name] ?? currentBoard.name, folderId: selectedFolderId, state: savedState }) })
        : await apiRequest<{ board: CloudBoard }>('/api/boards', { method: 'POST', body: JSON.stringify({ name: currentBoard.name, folderId: selectedFolderId, state: savedState }) })
      const nextIds = { ...cloudBoardIds, [currentBoard.name]: result.board.id }
      if (encryptionKey) cloudKeys.current[result.board.id] = encryptionKey
      setCloudBoardIds(nextIds)
      cloudSyncedSnapshots.current[result.board.id] = JSON.stringify(state)
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
    const displayName = remote.ownerId && remote.ownerId !== cloudUser?.id ? `${remote.ownerName || 'Student'} — ${remote.name}` : remote.name
    setBoards((current) => [...current, { name: displayName, pages: state.pages, pageSize: state.pageSize ?? 'A4', infinite: state.infinite ?? false, orientation: state.orientation, pageOrientations: state.pageOrientations, pageBackground: state.pageBackground, hiddenLayers: state.hiddenLayers ?? [] }])
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
    if (displayName !== remote.name) cloudBoardOriginalNames.current[displayName] = remote.name
    const ids = { ...cloudBoardIds, [displayName]: remote.id }
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
    const currentName = boards[activeBoard]?.name
    const id = (currentName ? cloudBoardIds[currentName] : undefined) ?? cloudBoards.find((board) => board.name === currentName)?.id
    setShareOpen(true)
    setCloudMessage('')
    if (!id) {
      setShareList([])
      setShareTeams([])
      setCloudMessage('Save this note to your server before you can share it.')
      return
    }
    setCloudMessage('Loading access settings…')
    try {
      const [{ access }, { teams: grantedTeams }] = await Promise.all([apiRequest<{ access: { username: string; role: 'view' | 'edit'; canDownload?: boolean }[] }>(`/api/boards/${id}/share`), apiRequest<{ teams: { id: number; name: string; role: 'view' | 'edit' }[] }>(`/api/boards/${id}/teams`)])
      setShareList(access)
      setShareTeams(grantedTeams)
      setCloudMessage('')
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Could not load access settings.') }
  }

  const inviteToBoard = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const id = cloudBoardIds[boards[activeBoard].name]
    if (!id) return
    try {
      await apiRequest(`/api/boards/${id}/share`, { method: 'POST', body: JSON.stringify({ username: shareUsername, role: shareRole === 'edit' ? 'edit' : 'view', canDownload: shareRole === 'download' }) })
      setShareUsername('')
      const { access } = await apiRequest<{ access: { username: string; role: 'view' | 'edit'; canDownload?: boolean }[] }>(`/api/boards/${id}/share`)
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
    setAuthStatus('signed-out')
    setCloudBoards([])
    setCloudBoardIds({})
    setCloudFolders([])
    setSelectedFolderId(null)
    localStorage.removeItem('doomnotes:cloud-board-ids')
    setAccountOpen(false)
    setCloudMessage('Signed out.')
  }

  const openProfileEditor = () => {
    setProfileDisplayName(cloudUser?.displayName || cloudUser?.username || '')
    setProfileAvatar(cloudUser?.avatar ?? null)
    setProfileCurrentPassword('')
    setProfileNewPassword('')
    setCloudMessage('')
    profileMenuRef.current?.removeAttribute('open')
    setProfileOpen(true)
  }

  const closeProfileEditor = () => {
    setProfileOpen(false)
    if (sitePage === 'profile') navigatePage('dashboard')
  }

  const chooseProfilePhoto = async (file?: File) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setCloudMessage('Choose a PNG, JPEG, or WebP image under 8 MB.')
      return
    }
    try {
      const bitmap = await createImageBitmap(file)
      const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Could not process that image.')
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      setProfileAvatar(canvas.toDataURL('image/webp', 0.84))
      setCloudMessage('')
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Could not load that image.') }
  }

  const saveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    localStorage.setItem('ozoo:account-type', accountType)
    try {
      if (cloudUser) {
        const { user } = await apiRequest<{ user: CloudUser }>('/api/me/profile', { method: 'PUT', body: JSON.stringify({ displayName: profileDisplayName, avatar: profileAvatar, accountType }) })
        setCloudUser(user)
      }
      setCloudMessage('Profile updated.')
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Could not update your profile.') }
  }

  useEffect(() => {
    if (!cloudUser?.accountType) return
    setAccountType(cloudUser.accountType)
    setLandingAudience(cloudUser.accountType === 'teacher' ? 'teacher' : cloudUser.accountType === 'business' || cloudUser.accountType === 'employee' ? 'business' : 'student')
    localStorage.setItem('ozoo:account-type', cloudUser.accountType)
  }, [cloudUser?.id, cloudUser?.accountType])

  useEffect(() => {
    localStorage.setItem('ozoo:account-type', accountType)
    setLandingAudience(accountType === 'teacher' ? 'teacher' : accountType === 'business' || accountType === 'employee' ? 'business' : 'student')
    setLandingTemplate(accountType === 'teacher' ? 'Lesson plan' : accountType === 'business' || accountType === 'employee' ? 'Meeting notes' : 'Cornell notes')
  }, [accountType])

  const changePassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      await apiRequest('/api/me/password', { method: 'POST', body: JSON.stringify({ currentPassword: profileCurrentPassword, newPassword: profileNewPassword }) })
      setProfileCurrentPassword('')
      setProfileNewPassword('')
      setCloudMessage('Password updated. Other signed-in sessions were signed out.')
    } catch (error) { setCloudMessage(error instanceof Error ? error.message : 'Could not update your password.') }
  }

  useEffect(() => {
    if (!cloudUser) return
    const id = cloudBoardIds[boards[activeBoard]?.name]
    if (!id) return
    const stream = new EventSource(`${API_BASE}/api/boards/${id}/events`, { withCredentials: true })
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
        cloudSyncedSnapshots.current[id] = JSON.stringify(remoteState)
        setCloudSyncStatus('synced')
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
  }, [strokes, orientation, pageSize, selectedIndices, erasePreviewIndices, eraserHover, activeTool, infinitePage, cameraOffset.x, cameraOffset.y, selectionBox, hiddenLayers])

  useEffect(() => { strokesByPageRef.current = strokesByPage }, [strokesByPage])
  useEffect(() => {
    if (!boards.length) return
    setAutoSaveStatus('saving')
    setAutoSaveError('')
    const persist = () => {
      try {
        const names = [...new Set(boards.map((board) => board.name).filter(Boolean))]
        const snapshots = boards.map((board, boardIndex) => {
          const existing = (() => { try { return JSON.parse(localStorage.getItem(`doomnotes:${board.name}`) ?? '{}') as Record<string, unknown> } catch { return {} } })()
          const pageStrokes = Array.from({ length: board.pages }, (_, pageIndex) => strokesByPage[`${boardIndex}:${pageIndex + 1}`] ?? [])
          const saved = {
            ...existing,
            name: board.name,
            pages: board.pages,
            pageSize: board.pageSize,
            infinite: board.infinite,
            orientation: board.orientation,
            pageOrientations: board.pageOrientations,
            pageBackground: boardIndex === activeBoard ? pageBackground : board.pageBackground,
            notebook: board.notebook ?? 'Inbox',
            tags: board.tags ?? [],
            titles: board.titles ?? [],
            hiddenLayers: board.hiddenLayers ?? [],
            gridEnabled: boardIndex === activeBoard ? gridEnabled : Boolean(existing.gridEnabled),
            showScale: boardIndex === activeBoard ? showScale : Boolean(existing.showScale),
            pageStrokes,
            savedAt: new Date().toISOString(),
          }
          return { name: board.name, value: JSON.stringify(saved) }
        })
        const workspaceSnapshot = JSON.stringify({ names, activeBoard, page: Math.max(1, page), savedAt: new Date().toISOString() })
        const prioritizedSnapshots = [...snapshots].sort((a, b) => Number(b.name === boards[activeBoard]?.name) - Number(a.name === boards[activeBoard]?.name))
        prioritizedSnapshots.forEach(({ name, value }) => localStorage.setItem(`doomnotes:${name}`, value))
        localStorage.setItem(openWorkspaceStorageKey, workspaceSnapshot)
        setRecentFiles((current) => [...new Set([...names, ...current])])
        setAutoSaveStatus('saved')
        setAutoSaveError('')
      } catch (error) {
        setAutoSaveStatus('error')
        const quotaExceeded = error instanceof DOMException && (error.name === 'QuotaExceededError' || error.code === 22 || error.code === 1014)
        setAutoSaveError(quotaExceeded
          ? 'Browser storage is full. Export a backup, then remove large images or unused files before continuing.'
          : error instanceof Error ? error.message : 'The browser could not write this note to local storage.')
      }
    }
    const timer = window.setTimeout(persist, 650)
    const flushPendingSave = () => {
      window.clearTimeout(timer)
      persist()
    }
    const flushWhenHidden = () => { if (document.visibilityState === 'hidden') flushPendingSave() }
    window.addEventListener('pagehide', flushPendingSave)
    document.addEventListener('visibilitychange', flushWhenHidden)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pagehide', flushPendingSave)
      document.removeEventListener('visibilitychange', flushWhenHidden)
    }
  }, [boards, strokesByPage, activeBoard, page, pageBackground, gridEnabled, showScale])

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

  useEffect(() => {
    const handleWorkspaceShortcuts = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || sharedToken) return
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      const key = event.key.toLowerCase()
      if (key === 'o') {
        event.preventDefault()
        setMenuOpen(false)
        documentInputRef.current?.click()
      } else if (key === 'f') {
        event.preventDefault()
        setFindQuery('')
        setFindResults([])
        setFindOpen(true)
      } else if (key === 'e' && event.shiftKey) {
        event.preventDefault()
        setMenuOpen(false)
        setExportPageSelection(`1-${boards[activeBoard].pages}`)
        setExportIncludeIndex(true)
        setExportDialogOpen(true)
      } else if (key === '/') {
        event.preventDefault()
        setCommandQuery('')
        setCommandPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', handleWorkspaceShortcuts)
    return () => window.removeEventListener('keydown', handleWorkspaceShortcuts)
  }, [activeBoard, boards, sharedToken])

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

  const pointFromEvent = (event: ReactPointerEvent<HTMLCanvasElement> | ReactMouseEvent<HTMLCanvasElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) / bounds.width + (infinitePage ? cameraOffset.x : 0), y: (event.clientY - bounds.top) / bounds.height + (infinitePage ? cameraOffset.y : 0) }
  }
  const eraserCanTarget = (stroke: Stroke, index: number) => !hiddenLayers.includes(strokeLayer(stroke)) && (!selectedIndices.length || selectedIndices.includes(index))
  const openTextEditorAt = (point: Point) => {
    if (!canEditActiveBoard) return
    lastTextPoint.current = point
    cancelTextRef.current = false
    setTextEditor({ point, value: '' })
  }
  const startStroke = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!canEditActiveBoard && activeTool !== 'Hand' && activeTool !== 'Select') return
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
      openTextEditorAt(point)
      return
    }
    if (!hardwareEraser && activeTool === 'Select') {
      const canvas = event.currentTarget
      const bounds = selectionBoundsFor(strokes, selectedIndices, canvas.width, canvas.height)
      const handle = bounds ? hitResizeHandle(bounds, point, canvas.width, canvas.height) : null
      if (bounds && handle && selectedIndices.length) {
        if (!canEditActiveBoard) return
        event.currentTarget.setPointerCapture(event.pointerId)
        const originals = selectedIndices.map((index) => strokes[index])
        activeResize.current = { indices: [...selectedIndices], start: point, originals, preview: originals, bounds, handle }
        return
      }
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
      if (!next.includes(hit) || !canEditActiveBoard) return
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
      ...(inkTools.includes(strokeTool) ? { smoothing: strokeSmoothness, strokeCap } : {}),
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
    if (!canEditActiveBoard && !activePan.current && activeTool !== 'Select') return
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
    if (activeResize.current) {
      const resize = activeResize.current
      const b = resize.bounds
      const movesX = ['nw', 'ne', 'e', 'se', 'sw', 'w'].includes(resize.handle)
      const movesY = ['nw', 'n', 'ne', 'se', 's', 'sw'].includes(resize.handle)
      const anchorX = resize.handle.includes('w') ? b.right : b.left
      const anchorY = resize.handle.includes('n') ? b.bottom : b.top
      const initialX = resize.handle.includes('w') ? b.left : b.right
      const initialY = resize.handle.includes('n') ? b.top : b.bottom
      const targetX = movesX ? point.x : initialX
      const targetY = movesY ? point.y : initialY
      let scaleX = movesX ? (targetX - anchorX) / (initialX - anchorX) : 1
      let scaleY = movesY ? (targetY - anchorY) / (initialY - anchorY) : 1
      const clampPagePoint = (value: number) => infinitePage ? value : Math.max(0, Math.min(1, value))
      const boundedX = clampPagePoint(targetX), boundedY = clampPagePoint(targetY)
      if (movesX) scaleX = (boundedX - anchorX) / (initialX - anchorX)
      if (movesY) scaleY = (boundedY - anchorY) / (initialY - anchorY)
      scaleX = Math.max(0.04, Math.min(20, scaleX))
      scaleY = Math.max(0.04, Math.min(20, scaleY))
      if (event.shiftKey && movesX && movesY) {
        const uniformScale = Math.abs(scaleX - 1) >= Math.abs(scaleY - 1) ? scaleX : scaleY
        scaleX = uniformScale
        scaleY = uniformScale
      }
      const strokeScale = Math.sqrt(Math.abs(scaleX * scaleY))
      resize.preview = resize.originals.map((original) => ({
        ...original,
        points: original.points.map((item) => ({
          x: anchorX + (item.x - anchorX) * scaleX,
          y: anchorY + (item.y - anchorY) * scaleY,
        })),
        width: original.width * strokeScale,
        ...(original.cornerRadius !== undefined ? { cornerRadius: original.cornerRadius * strokeScale } : {}),
      }))
      const updated = [...strokes]
      resize.indices.forEach((index, offset) => { updated[index] = resize.preview[offset] })
      renderDrawings(event.currentTarget, updated, resize.indices, [], undefined, 0, infinitePage ? cameraOffset : { x: 0, y: 0 }, undefined, hiddenLayers)
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
    if (!isProUser) { window.alert('Screen recording is included in Class Plus.'); return }
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
  const startVoiceRecording = async () => {
    if (!isProUser) { window.alert('Voice recording is included in Class Plus.'); return }
    setVoiceRecordingError('')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setVoiceRecordingError('Voice recording is not supported in this browser. Try the latest version of Chrome or Edge.')
      return
    }
    let acquiredStream: MediaStream | null = null
    try {
      acquiredStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const stream = acquiredStream
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type))
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      voiceStreamRef.current = stream
      voiceRecorderRef.current = recorder
      voiceChunksRef.current = []
      setVoiceRecordingSeconds(0)
      const safeName = boards[activeBoard].name.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'OzooNotes'
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      recorder.ondataavailable = (event) => { if (event.data.size > 0) voiceChunksRef.current.push(event.data) }
      recorder.onstop = () => {
        const blob = new Blob(voiceChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size > 0) {
          const extension = blob.type.includes('mp4') ? 'm4a' : 'webm'
          downloadNamedBlob(blob, `${safeName}-voice-recording-${stamp}.${extension}`)
          setSaveNotice('Voice recording downloaded')
          window.setTimeout(() => setSaveNotice(''), 3000)
        } else {
          setVoiceRecordingError('The recording was empty. Check your microphone and try again.')
        }
        stream.getTracks().forEach((track) => track.stop())
        if (voiceStreamRef.current === stream) voiceStreamRef.current = null
        if (voiceRecorderRef.current === recorder) voiceRecorderRef.current = null
        voiceChunksRef.current = []
        setVoiceRecordingState('idle')
      }
      recorder.onerror = () => setVoiceRecordingError('The voice recording stopped because of a microphone error.')
      stream.getAudioTracks()[0]?.addEventListener('ended', () => {
        if (recorder.state !== 'inactive') recorder.stop()
      }, { once: true })
      recorder.start(1000)
      setVoiceRecordingState('recording')
    } catch (error) {
      acquiredStream?.getTracks().forEach((track) => track.stop())
      voiceStreamRef.current = null
      voiceRecorderRef.current = null
      voiceChunksRef.current = []
      setVoiceRecordingState('idle')
      const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
      const messages: Record<string, string> = {
        NotAllowedError: 'Microphone access was denied. Allow microphone access in your browser or device settings, then try again.',
        NotFoundError: 'No microphone was found. Connect or enable a microphone, then try again.',
        NotReadableError: 'The microphone could not be opened. Close other apps using it and try again.',
        SecurityError: 'Voice recording requires a secure page. Open OzooNotes over HTTPS or localhost.',
        AbortError: 'Microphone access was interrupted. Try starting the recording again.',
      }
      console.error('Voice recording could not start:', error)
      setVoiceRecordingError(messages[name] ?? `Could not start voice recording${name ? ` (${name})` : ''}. Check microphone permissions and try again.`)
    }
  }
  const stopVoiceRecording = () => {
    const recorder = voiceRecorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }
  const toggleVoiceRecordingPause = () => {
    const recorder = voiceRecorderRef.current
    if (!recorder) return
    if (recorder.state === 'recording') {
      recorder.pause()
      setVoiceRecordingState('paused')
    } else if (recorder.state === 'paused') {
      recorder.resume()
      setVoiceRecordingState('recording')
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
      const smoothing = Math.max(0, Math.min(100, stroke.smoothing ?? (stroke.drawingStyle === 'handwriting' ? 65 : 0))) / 100
      const handwriting = smoothing > 0 && points.length > 2 && stroke.tool !== 'Shape'
      const pathData = handwriting ? `M ${points[0].x * width} ${points[0].y * height} ${points.slice(1, -1).map((point, index) => { const next = points[index + 2], blend = smoothing * .5, endX = point.x * (1 - blend) + next.x * blend, endY = point.y * (1 - blend) + next.y * blend; return `Q ${point.x * width} ${point.y * height} ${endX * width} ${endY * height}` }).join(' ')} L ${last.x * width} ${last.y * height}` : ''
      const dash = stroke.drawingStyle === 'dashed' ? ` stroke-dasharray="${stroke.width * 2.5} ${stroke.width * 1.8}"` : stroke.drawingStyle === 'dotted' ? ` stroke-dasharray="${stroke.width * .15} ${stroke.width * 1.8}"` : ''
      const cap = stroke.strokeCap ?? (stroke.drawingStyle === 'calligraphy' ? 'square' : 'round')
      const widthScale = stroke.drawingStyle === 'calligraphy' ? 1.7 : 1
      const tag = stroke.tool === 'Shape' && stroke.shapeKind !== 'Arrow' ? 'polygon' : handwriting ? 'path' : 'polyline'
      return handwriting ? `<path d="${pathData}" fill="none" stroke="${escapeXml(stroke.color)}" stroke-width="${stroke.width * widthScale}" stroke-linecap="${cap}" stroke-linejoin="round"${dash} opacity="${alpha}"/>` : `<${tag} points="${pointString}" fill="none" stroke="${escapeXml(stroke.color)}" stroke-width="${stroke.width * widthScale}" stroke-linecap="${cap}" stroke-linejoin="round"${dash} opacity="${alpha}"/>`
    }).join('')
    const cameraGroup = infinitePage ? `<g transform="translate(${-camera.x * width} ${-camera.y * height})">${paths}</g>` : paths
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="100%" height="100%" fill="${escapeXml(background)}"/>${gridLines.join('')}${cameraGroup}</svg>`
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
  const openExportDialog = () => { if (!activeCanDownload) { setCloudMessage('The owner has not granted download permission for this board.'); return } setExportPageSelection(`1-${boards[activeBoard].pages}`); setExportIncludeIndex(true); setExportDialogOpen(true); setMenuOpen(false) }
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
      return [textStroke('CONTENTS', .09, .09, 7, colorTheme === 'purple' ? '#bd8bff' : '#8052bc'), textStroke(board.name, .09, .125, 3), ...rows.flatMap((item, row) => { const y = .19 + row * .037; return [textStroke(item.title, .10, y, 3.2), textStroke(`Page ${item.page}`, .77, y, 2.8, colorTheme === 'purple' ? '#bd8bff' : '#8052bc')] })]
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
      navigatePage('notes')
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
      if (!isProUser && !(documentData.infinite ?? documentData.pageSize === 'Infinite') && countSavedDocuments() >= normalDocumentLimit) throw new Error(`Standard includes up to ${normalDocumentLimit} note documents.`)
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
      navigatePage('notes')
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
    const resize = activeResize.current
    activeResize.current = null
    if (resize) {
      editCurrentPage((current) => {
        const pageStrokes = [...current]
        resize.indices.forEach((index, offset) => { pageStrokes[index] = resize.preview[offset] })
        return pageStrokes
      })
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
      return [text('CONTENTS', .09, .09, 7, colorTheme === 'purple' ? '#bd8bff' : '#8052bc'), text(activePdfBoard.name, .09, .125, 3), ...rows.flatMap((item, index) => { const y = .19 + index * .037; return [text(item.title, .10, y, 3.2), text(`Page ${item.page}`, .77, y, 2.8, colorTheme === 'purple' ? '#bd8bff' : '#8052bc')] })]
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
        commands.push(stroke.strokeCap === 'square' ? '2 J' : '1 J', '1 j')
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

  const consumeSimulatorUse = (tool: string) => {
    if (isProUser) return true
    const today = new Date().toISOString().slice(0, 10)
    let usage: { date: string; counts: Record<string, number> } = { date: today, counts: {} }
    try {
      const saved = JSON.parse(localStorage.getItem('ozoo:simulator-usage') ?? 'null') as typeof usage | null
      if (saved?.date === today && saved.counts) usage = saved
    } catch { /* Start a fresh daily allowance when browser data cannot be read. */ }
    if ((usage.counts[tool] ?? 0) >= normalSimulationsPerToolPerDay) {
      window.alert(`Standard includes ${normalSimulationsPerToolPerDay} ${tool} simulator launches per day. Class Plus removes this limit.`)
      return false
    }
    usage.counts[tool] = (usage.counts[tool] ?? 0) + 1
    try { localStorage.setItem('ozoo:simulator-usage', JSON.stringify(usage)) } catch { /* Simulator access remains available if storage is full. */ }
    return true
  }
  const launchGraphSimulator = () => {
    if (!consumeSimulatorUse('graph')) return
    setSimulatorMenuOpen(false)
    setGraphSimulatorOpen(true)
  }

  const launchCalculusSimulator = () => {
    if (!consumeSimulatorUse('calculus')) return
    setSimulatorMenuOpen(false)
    setCalculusSimulatorOpen(true)
  }

  const launchCircuitSimulator = () => {
    if (!consumeSimulatorUse('electronics')) return
    setSimulatorMenuOpen(false)
    setCircuitSimulatorOpen(true)
  }

  const launchCodeSimulator = (mode: 'cpp' | 'python' | 'java' | 'web') => {
    if (!consumeSimulatorUse(mode)) return
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
    const savedDocuments = countSavedDocuments()
    if (!isProUser && size !== 'Infinite' && savedDocuments >= normalDocumentLimit) {
      window.alert(`Standard includes up to ${normalDocumentLimit} note documents. Your files remain available locally; plan access is managed separately.`)
      return
    }
    setDraftName(name ?? `File ${nextFileNumber}`)
    setDraftNameError('')
    setDraftSize(size)
    setDraftTemplate(template ?? 'Blank')
    setDraftOrientation('portrait')
    setDraftBackground('auto')
    setShowNewFileDialog(true)
  }
  const openInfiniteBoard = () => {
    const openBoardIndex = boards.findIndex((board) => board.infinite)
    if (openBoardIndex >= 0) {
      activateBoard(openBoardIndex)
      navigatePage('notes')
      return
    }
    const existing = recentFiles.find((name) => {
      try { return (JSON.parse(localStorage.getItem(`doomnotes:${name}`) ?? '{}') as { infinite?: boolean }).infinite === true }
      catch { return false }
    })
    if (existing) { openSavedFile(existing); return }
    let name = 'Infinite Board'
    let suffix = 2
    while (boards.some((board) => normalizeBoardName(board.name) === normalizeBoardName(name)) || recentFiles.some((file) => normalizeBoardName(file) === normalizeBoardName(name)) || localStorage.getItem(`doomnotes:${name}`) !== null) {
      name = `Infinite Board ${suffix++}`
    }
    try {
      localStorage.setItem(`doomnotes:${name}`, JSON.stringify({ name, pages: 1, pageSize: 'Infinite', infinite: true, orientation: 'landscape', pageOrientations: ['landscape'], pageBackground: 'auto', notebook: 'Inbox', tags: [], titles: [], hiddenLayers: [], gridEnabled: false, showScale: false, pageStrokes: [[]] }))
      setRecentFiles((current) => [name, ...current.filter((file) => file !== name)])
      openSavedFile(name)
    } catch {
      setSaveNotice('Could not prepare the Infinite Board in browser storage')
      window.setTimeout(() => setSaveNotice(''), 3000)
    }
  }
  const saveFileOrganization = (name: string, notebook: string, rawTags: string) => {
    const tags = [...new Set(rawTags.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean))]
    try {
      const key = `doomnotes:${name}`
      const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
      const color = /^#[0-9a-f]{6}$/i.test(fileSettingsColor) ? fileSettingsColor : dashboardAppearance.fileColor
      localStorage.setItem(key, JSON.stringify({ ...saved, notebook: notebook || 'Inbox', tags, dashboardColor: color }))
      setBoards((current) => current.map((board) => board.name === name ? { ...board, notebook: notebook || 'Inbox', tags } : board))
      setRecentFiles((current) => [...current])
    } catch { setSaveNotice('Could not save notebook or tags') }
  }
  const openFileSettings = (name: string) => {
    let meta: { notebook?: string; tags?: string[]; dashboardColor?: string } = {}
    try { meta = JSON.parse(localStorage.getItem(`doomnotes:${name}`) ?? '{}') }
    catch { /* Keep settings usable if optional organization metadata is malformed. */ }
    setFileSettingsTarget(name)
    setFileSettingsNotebook(meta.notebook ?? 'Inbox')
    setFileSettingsTags((meta.tags ?? []).filter((tag) => tag.toLowerCase().replace(/^#/, '') !== 'favorite').join(', '))
    setFileSettingsFavorite((meta.tags ?? []).some((tag) => tag.toLowerCase().replace(/^#/, '') === 'favorite'))
    setFileSettingsColor(/^#[0-9a-f]{6}$/i.test(meta.dashboardColor ?? '') ? meta.dashboardColor! : dashboardAppearance.fileColor)
  }
  const setDashboardFileColor = (name: string, color: string) => {
    if (!/^#[0-9a-f]{6}$/i.test(color)) return
    try {
      const key = `doomnotes:${name}`
      const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
      localStorage.setItem(key, JSON.stringify({ ...saved, dashboardColor: color }))
      setSelectedDashboardColor(color)
      setRecentFiles((current) => [...current])
    } catch { setSaveNotice('Could not save this file color. Browser storage may be full.') }
  }
  const openDashboardShortcut = (shortcut: DashboardShortcut) => {
    if (shortcut.kind === 'file') { openSavedFile(shortcut.target); return }
    if (shortcut.kind === 'folder') { setNotebookFilter(shortcut.target); document.getElementById('landing-files')?.scrollIntoView({ behavior: 'smooth' }); return }
    if (shortcut.kind === 'project') { setProjectFocusId(null); setProjectsPageOpen(true); return }
    navigatePage('roadmaps')
  }
  const addDashboardShortcut = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const separator = dashboardShortcutDraft.indexOf(':')
    if (separator < 0) return
    const kind = dashboardShortcutDraft.slice(0, separator) as DashboardShortcut['kind']
    const target = decodeURIComponent(dashboardShortcutDraft.slice(separator + 1))
    const label = kind === 'project' ? 'Projects' : kind === 'roadmap' ? 'Road map' : kind === 'folder' ? `Folder · ${target}` : target
    setDashboardShortcuts((current) => current.some((shortcut) => shortcut.id === dashboardShortcutDraft) ? current : [...current, { id: dashboardShortcutDraft, kind, label, target }])
    setDashboardShortcutDraft('')
  }
  const moveFileToNotebook = (name: string, notebook: string) => {
    try {
      const key = `doomnotes:${name}`
      const saved = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>
      localStorage.setItem(key, JSON.stringify({ ...saved, notebook }))
      if (selectedDashboardFile === name) setSelectedDashboardNotebook(notebook)
      setBoards((current) => current.map((board) => board.name === name ? { ...board, notebook } : board))
      setRecentFiles((current) => [...current])
      setSaveNotice(`Moved “${name}” to ${notebook}.`)
      window.setTimeout(() => setSaveNotice(''), 2200)
    } catch { setSaveNotice('Could not move this file. Browser storage may be full.') }
  }
  const createNotebook = () => {
    const name = newNotebookName.trim()
    if (!name) return
    if (['inbox','all notebooks'].includes(name.toLowerCase()) || notebooks.some((folder) => folder.toLowerCase() === name.toLowerCase())) { setSaveNotice('A folder with that name already exists.'); window.setTimeout(() => setSaveNotice(''), 2500); return }
    setNotebooks((current) => [...new Set([...current, name])])
    setNotebookFilter(name)
    setNewNotebookName('')
    setFolderCreateOpen(false)
  }
  const addFolderTool = () => { const folder = notebookFilter === 'All notebooks' ? 'Inbox' : notebookFilter; setFolderLinks((current) => ({ ...current, [folder]: [...new Set([...(current[folder] ?? []), folderToolDraft])] })); setFolderAddOpen(false) }
  const folderToolNames: Record<FolderToolLink, string> = { projects: 'Projects workspace', roadmaps: 'Learning roadmaps', graph: 'Graph simulator', electronics: 'Electronics simulator', calculus: 'Calculus simulator', code: 'Coding workspace' }
  const openFolderTool = (tool: FolderToolLink) => { if (tool === 'projects') setProjectsPageOpen(true); else if (tool === 'roadmaps') navigatePage('roadmaps'); else if (tool === 'graph') launchGraphSimulator(); else if (tool === 'electronics') launchCircuitSimulator(); else if (tool === 'calculus') launchCalculusSimulator(); else launchCodeSimulator('python') }
  const removeFolderTool = (folder: string, tool: FolderToolLink) => setFolderLinks((current) => ({ ...current, [folder]: (current[folder] ?? []).filter((item) => item !== tool) }))
  const addScratchItem = () => { const text = scratchText.trim(); if (!text) return; setScratchItems((items) => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text, done: false }, ...items]); setScratchText('') }
const addDashboardTask = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const title = dashboardTaskDraft.trim(); if (!title) return; setDashboardTasks((items) => [{ id: crypto.randomUUID(), title, dueDate: dashboardTaskDueDraft, createdAt: Date.now(), done: false }, ...items]); setDashboardTaskDraft(''); setDashboardTaskDueDraft('') }
  const addDashboardGoal = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const title = dashboardGoalDraft.trim(); if (!title) return; setDashboardGoals((goals) => [...goals, { id: crypto.randomUUID(), title, month: dashboardMonthKey(), done: false }]); setDashboardGoalDraft('') }
  const toggleDashboardTask = (id: string) => setDashboardTasks((items) => items.map((task) => task.id === id ? { ...task, done: !task.done, completedAt: !task.done ? Date.now() : undefined } : task))
  const isBoardNameTaken = (candidate: string, exceptName?: string) => {
    const normalized = normalizeBoardName(candidate)
    if (!normalized) return false
    const isExcepted = (name: string) => exceptName !== undefined && normalizeBoardName(name) === normalizeBoardName(exceptName)
    if (boards.some((board) => !isExcepted(board.name) && normalizeBoardName(board.name) === normalized)) return true
    if (recentFiles.some((name) => !isExcepted(name) && normalizeBoardName(name) === normalized)) return true
    if (cloudBoards.some((board) => !isExcepted(board.name) && normalizeBoardName(board.name) === normalized)) return true
    try {
      const prefix = 'doomnotes:'
      return Object.keys(localStorage).some((key) => {
        if (!key.startsWith(prefix) || key === 'doomnotes:cloud-board-ids') return false
        const storedName = key.slice(prefix.length)
        return !isExcepted(storedName) && normalizeBoardName(storedName) === normalized
      })
    } catch { return false }
  }
  const createBoard = () => {
    const isInfinite = draftSize === 'Infinite'
    const name = draftName.trim() || `File ${nextFileNumber}`
    const savedDocuments = countSavedDocuments()
    if (!isProUser && !isInfinite && savedDocuments >= normalDocumentLimit) {
      window.alert(`Standard includes up to ${normalDocumentLimit} note documents. Class Plus billing is not available yet.`)
      setShowNewFileDialog(false)
      return
    }
    if (isBoardNameTaken(name)) {
      setDraftNameError('A file with this name already exists. Choose a different name.')
      return
    }
    setDraftNameError('')
    const boardIndex = boards.length
    const templateStrokes = makeTemplateStrokes(draftTemplate, draftSize, draftOrientation, colorTheme)
    setStrokesByPage((current) => ({ ...current, [`${boardIndex}:1`]: templateStrokes }))
    setBoards((current) => [...current, { name, pages: 1, pageSize: draftSize, infinite: isInfinite, orientation: draftOrientation, pageOrientations: [draftOrientation], pageBackground: draftBackground, notebook: notebookFilter === 'All notebooks' ? 'Inbox' : notebookFilter, tags: [] }])
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
    navigatePage('notes')
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
    if (isBoardNameTaken(nextName, renameTarget)) {
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
  const removeSavedFile = (name: string) => {
    if (!window.confirm(`Remove “${name}” from saved files on this device?`)) return
    const openIndex = boards.findIndex((board) => board.name === name)
    if (openIndex >= 0) closeBoard(openIndex)
    try { localStorage.removeItem(`doomnotes:${name}`) }
    catch { setSaveNotice('Could not remove the saved file from this browser'); return }
    setRecentFiles((current) => current.filter((file) => file !== name))
    setFileSettingsTarget(null)
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

  const newFileDialog = showNewFileDialog && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNewFileDialog(false) }}><section className="new-file-dialog" role="dialog" aria-modal="true" aria-labelledby="new-file-title"><button className="dialog-close" aria-label="Close new file settings" onClick={() => setShowNewFileDialog(false)}><Icon name="close" size={16} /></button><p className="eyebrow">NEW BOARD</p><h2 id="new-file-title">Set up your page</h2><label className="dialog-label">File name<input value={draftName} aria-invalid={Boolean(draftNameError)} aria-describedby={draftNameError ? "draft-name-error" : undefined} onChange={(event) => { setDraftName(event.target.value); setDraftNameError("") }} placeholder={`File ${nextFileNumber}`} /></label>{draftNameError && <p className="field-error" id="draft-name-error" role="alert">{draftNameError}</p>}<fieldset className="page-size-picker"><legend>Page size</legend><div className="page-size-options">{(['A1', 'A2', 'A3', 'A4', 'A5', 'Letter', 'Legal', 'Tabloid', 'Infinite'] as PageSize[]).map((size) => <button type="button" key={size} aria-pressed={draftSize === size} className={`page-size-option ${draftSize === size ? 'chosen' : ''} ${size === 'Infinite' ? 'infinite-choice' : ''}`} onClick={() => setDraftSize(size)}>{size === 'Infinite' ? '∞ Infinite' : size}</button>)}</div></fieldset><label className="dialog-label">Starter template<select value={draftTemplate} onChange={(event) => setDraftTemplate(event.target.value as PageTemplate)}><option>Blank</option><option>Lined notes</option><option>Graph paper</option><option>Cornell notes</option><option>Weekly planner</option>{isProUser && <><option>Lesson plan</option><option>Worksheet</option><option>Class diagram</option><option>Exit ticket</option><option>Rubric</option><option>Seating chart</option><option>Mood board</option><option>Coding notes</option></>}</select></label>{draftTemplate !== 'Blank' && <p className="template-note">The layout is made from editable objects on the first page.</p>}{draftSize !== 'Infinite' ? <><label className="dialog-label">Orientation<select value={draftOrientation} onChange={(event) => setDraftOrientation(event.target.value as 'portrait' | 'landscape')}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label><fieldset className="page-size-picker"><legend>Page background</legend><div className="dialog-colors">{pageColors.map((color) => <button type="button" key={color} aria-label={pageBackgroundLabel(color)} aria-pressed={draftBackground === color} className={`settings-swatch ${draftBackground === color ? 'chosen' : ''}`} style={pageBackgroundSwatchStyle(color)} onClick={() => setDraftBackground(color)} />)}<label className="custom-color"><span>Custom</span><input type="color" value={resolvePageBackground(draftBackground, dark, colorTheme)} aria-label="Custom page background" onChange={(event) => setDraftBackground(event.target.value)} /></label></div></fieldset></> : <p className="infinite-note">A large, scrollable board that matches the current theme. PDF export is unavailable for infinite boards.</p>}<footer className="dialog-actions"><button className="dialog-cancel" onClick={() => setShowNewFileDialog(false)}>Cancel</button><button className="dialog-create" onClick={createBoard}>Create board</button></footer></section></div>
  const fileSettingsDialog = fileSettingsTarget && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFileSettingsTarget(null) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="saved-file-settings-title"><button className="dialog-close" aria-label="Close file settings" onClick={() => setFileSettingsTarget(null)}><Icon name="close" size={16} /></button><p className="eyebrow">SAVED FILE</p><h2 id="saved-file-settings-title">File settings</h2><p className="file-settings-current-name">{fileSettingsTarget}</p><div className="file-settings-actions"><button type="button" className="dialog-create" onClick={() => { const name = fileSettingsTarget; setFileSettingsTarget(null); openRenameDialog(name) }}>Rename file</button><button type="button" className="file-settings-remove" onClick={() => removeSavedFile(fileSettingsTarget)}>Remove saved file</button></div><label className="dialog-label">Card color<input type="color" value={fileSettingsColor} onChange={(event) => setFileSettingsColor(event.target.value)} /></label><label className="dialog-label">Notebook<select value={fileSettingsNotebook} onChange={(event) => setFileSettingsNotebook(event.target.value)}><option value="Inbox">Inbox</option>{notebooks.map((book) => <option key={book}>{book}</option>)}</select></label><label className="dialog-label">Tags<input value={fileSettingsTags} onChange={(event) => setFileSettingsTags(event.target.value)} placeholder="ideas, article, #active…" /><small>Separate tags with commas.</small></label><label className="file-settings-favorite"><input type="checkbox" checked={fileSettingsFavorite} onChange={(event) => setFileSettingsFavorite(event.target.checked)} /> Add to Favorites</label><footer className="dialog-actions"><button type="button" className="dialog-cancel" onClick={() => setFileSettingsTarget(null)}>Cancel</button><button type="button" className="dialog-create" onClick={() => { saveFileOrganization(fileSettingsTarget, fileSettingsNotebook, [fileSettingsTags, fileSettingsFavorite ? 'favorite' : ''].filter(Boolean).join(', ')); setFileSettingsTarget(null) }}>Save settings</button></footer><p className="file-settings-footnote">This saved copy is stored in this browser. Removing it does not delete a cloud copy.</p></section></div>
  const renameDialog = renameTarget && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setRenameTarget(null) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-file-title"><button className="dialog-close" aria-label="Close rename dialog" onClick={() => setRenameTarget(null)}><Icon name="close" size={16} /></button><p className="eyebrow">FILE OPTIONS</p><h2 id="rename-file-title">Rename file</h2><form onSubmit={renameBoard}><label className="dialog-label">File name<input autoFocus required maxLength={120} value={renameDraft} onChange={(event) => { setRenameDraft(event.target.value); setRenameError('') }} /></label>{renameError && <p className="field-error" role="alert">{renameError}</p>}<footer className="dialog-actions"><button type="button" className="dialog-cancel" onClick={() => setRenameTarget(null)}>Cancel</button><button className="dialog-create">Save name</button></footer></form></section></div>
  const titleDialog = titleDialogOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setTitleDialogOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="section-title-heading"><button className="dialog-close" aria-label="Close section titles" onClick={() => setTitleDialogOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">PAGE {page} SECTION</p><h2 id="section-title-heading">Add a section title</h2><p className="infinite-note">Titles appear in a separate contents page before your notes. They never take up or renumber a document page.</p><form onSubmit={(event) => { event.preventDefault(); addSectionTitle() }}><label className="dialog-label">Title for page {page}<input autoFocus maxLength={100} value={sectionTitleDraft} onChange={(event) => setSectionTitleDraft(event.target.value)} placeholder="e.g. Research links" /></label><button className="dialog-create full-button" disabled={!sectionTitleDraft.trim()}>Add title</button></form>{(boards[activeBoard].titles?.length ?? 0) > 0 && <><h3 className="small-heading">Titles in this board</h3><ul className="section-title-list">{boards[activeBoard].titles?.map((item) => <li key={item.id}><span>{item.title}<small>Page {item.page}</small></span><button type="button" aria-label={`Remove ${item.title}`} onClick={() => removeSectionTitle(item.id)}>Remove</button></li>)}</ul></>}</section></div>
  const exportDialog = exportDialogOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExportDialogOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title"><button className="dialog-close" aria-label="Close export options" onClick={() => setExportDialogOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">CUSTOM EXPORT</p><h2 id="export-dialog-title">Choose pages to export</h2><label className="dialog-label">Format<select value={exportFormat} onChange={(event) => setExportFormat(event.target.value as 'pdf' | 'png' | 'svg')}><option value="pdf">PDF document</option><option value="png">PNG images</option><option value="svg">SVG images</option></select></label><label className="dialog-label">Page numbers<input value={exportPageSelection} onChange={(event) => setExportPageSelection(event.target.value)} placeholder="1, 3-5" /><small>Use commas and ranges, for example: 1, 3-5</small></label>{(boards[activeBoard].titles?.length ?? 0) > 1 && <label className="encryption-choice"><input type="checkbox" checked={exportIncludeIndex} onChange={(event) => setExportIncludeIndex(event.target.checked)} /><span><strong>Include contents index</strong><small>Add the title index before the selected note pages.</small></span></label>}{exportFormat !== 'pdf' && <p className="infinite-note">Each selected page downloads as its own {exportFormat.toUpperCase()} file.</p>}{infinitePage && exportFormat === 'pdf' && <p className="field-error">PDF export is unavailable for infinite boards.</p>}<footer className="dialog-actions"><button className="dialog-cancel" onClick={() => setExportDialogOpen(false)}>Cancel</button><button className="dialog-create" disabled={infinitePage && exportFormat === 'pdf'} onClick={() => void exportSelectedPages()}>Export</button></footer></section></div>

  const quickStartDialog = quickStartOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setQuickStartOpen(false) }}><section className="new-file-dialog compact-dialog quick-start-dialog" role="dialog" aria-modal="true" aria-labelledby="quick-start-title"><button className="dialog-close" aria-label="Close Quick Start guide" onClick={() => setQuickStartOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">OZOONOTES BASICS</p><h2 id="quick-start-title">Quick Start Guide</h2><ol className="quick-start-steps"><li><span>1</span><div><strong>Start with a board</strong><p>Choose <b>Start a new board</b>, or open an OzooNotes file you already have.</p></div></li><li><span>2</span><div><strong>Draw and create</strong><p>Pick a pen from the drawing tools. Use the shape, text, image, or graph tools to add more to your page.</p></div></li><li><span>3</span><div><strong>Select and move objects</strong><p>Choose Select. Drag over empty space to select several objects, or Shift-click to add or remove an object. Drag a selected object to move the group. Ctrl+A selects everything on the current page.</p></div></li><li><span>4</span><div><strong>Move around and add pages</strong><p>Use the Hand tool to pan across an infinite board. For regular boards, add a page and choose portrait or landscape; each page keeps its own orientation.</p></div></li><li><span>5</span><div><strong>Keep a copy of your work</strong><p>Your boards save in this browser on this device. Choose <b>Save OzooNotes file</b> to download a portable copy. You can also export pages as PNG or SVG, or regular boards as PDF.</p></div></li></ol><footer className="dialog-actions"><button className="dialog-create" onClick={() => setQuickStartOpen(false)}>Got it</button></footer></section></div>

  const searchNoteText = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const query = findQuery.trim().toLocaleLowerCase()
    const results = query ? Array.from({ length: boards[activeBoard].pages }, (_, pageIndex) => {
      const pageNumber = pageIndex + 1
      return (strokesByPage[`${activeBoard}:${pageNumber}`] ?? []).flatMap((stroke, index) => stroke.tool === 'Text' && stroke.text?.toLocaleLowerCase().includes(query) ? [{ page: pageNumber, index, text: stroke.text }] : [])
    }).flat() : []
    setFindResults(results)
  }
  const jumpToFindResult = (result: { page: number; index: number }) => {
    setPage(result.page)
    setIndexView(false)
    setSelectedIndices([result.index])
    setFindOpen(false)
  }
  const commandActions: { label: string; keys?: string; run: () => void }[] = [
    { label: 'Open a note file', keys: 'Ctrl O', run: () => documentInputRef.current?.click() },
    { label: 'Save a copy', run: () => saveBoardToFile() },
    { label: 'Export pages', keys: 'Ctrl Shift E', run: () => { setExportPageSelection(`1-${boards[activeBoard].pages}`); setExportIncludeIndex(true); setExportDialogOpen(true) } },
    { label: 'Save to cloud', run: () => { if (!localOnly) openCloudSaveDialog() } },
    { label: 'Live collaboration', run: () => { if (!localOnly) void openShareManager() } },
    { label: 'Find text in notes', keys: 'Ctrl F', run: () => { setFindQuery(''); setFindResults([]); setFindOpen(true) } },
    { label: 'Rename note', run: () => openRenameDialog() },
    { label: 'Add a page title', run: () => openTitleDialog() },
    { label: 'Show or hide grid', run: () => setGridEnabled((value) => !value) },
    { label: 'Keyboard shortcuts', run: () => setShortcutsOpen(true) },
    { label: 'Quick Start guide', run: () => setQuickStartOpen(true) },
  ].filter((command) => !localOnly || !['Save to cloud', 'Live collaboration'].includes(command.label))
  const filteredCommands = commandActions.filter((command) => command.label.toLocaleLowerCase().includes(commandQuery.trim().toLocaleLowerCase()))
  const findDialog = findOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFindOpen(false) }}><section className="new-file-dialog compact-dialog menu-search-dialog" role="dialog" aria-modal="true" aria-labelledby="find-note-title"><button className="dialog-close" aria-label="Close note search" onClick={() => setFindOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">SEARCH THIS NOTE</p><h2 id="find-note-title">Find text in notes</h2><form onSubmit={searchNoteText}><label className="dialog-label">Text to find<input autoFocus value={findQuery} onChange={(event) => setFindQuery(event.target.value)} placeholder="Search typed text on every page" /></label><button className="dialog-create full-button" type="submit">Find</button></form>{findResults.length > 0 ? <ul className="menu-search-results">{findResults.map((result) => <li key={`${result.page}:${result.index}`}><button onClick={() => jumpToFindResult(result)}><span>{result.text}</span><kbd>Page {result.page}</kbd></button></li>)}</ul> : findQuery.trim() && <p className="empty-hint">No matching text found. Handwriting and text inside images are not searched.</p>}</section></div>
  const commandPaletteDialog = commandPaletteOpen && <div className="new-file-overlay command-palette-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommandPaletteOpen(false) }}><section className="new-file-dialog command-palette-dialog" role="dialog" aria-modal="true" aria-labelledby="command-palette-title"><button className="dialog-close" aria-label="Close command palette" onClick={() => setCommandPaletteOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">QUICK ACTIONS</p><h2 id="command-palette-title">Command palette</h2><input autoFocus aria-label="Search commands" className="command-palette-input" value={commandQuery} onChange={(event) => setCommandQuery(event.target.value)} placeholder="Search actions…" />{filteredCommands.length ? <div className="command-palette-list">{filteredCommands.map((command) => <button key={command.label} onClick={() => { setCommandPaletteOpen(false); command.run() }}><span>{command.label}</span>{command.keys && <kbd>{command.keys}</kbd>}</button>)}</div> : <p className="empty-hint">No commands match that search.</p>}</section></div>
  const shortcutsDialog = shortcutsOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShortcutsOpen(false) }}><section className="new-file-dialog shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title">
    <button className="dialog-close" aria-label="Close keyboard shortcuts" onClick={() => setShortcutsOpen(false)}><Icon name="close" size={16} /></button>
    <p className="eyebrow">QUICK REFERENCE</p><h2 id="shortcuts-title">Keyboard shortcuts</h2>
    <p className="shortcuts-intro">Use these shortcuts while the canvas is active. Text fields keep their usual editing shortcuts.</p>
    <div className="shortcuts-section"><h3>Editing</h3>
      <div className="shortcut-row"><span>Open a note file</span><kbd>Ctrl / ⌘</kbd><kbd>O</kbd></div>
      <div className="shortcut-row"><span>Find typed text in notes</span><kbd>Ctrl / ⌘</kbd><kbd>F</kbd></div>
      <div className="shortcut-row"><span>Export pages</span><kbd>Ctrl / ⌘</kbd><kbd>Shift</kbd><kbd>E</kbd></div>
      <div className="shortcut-row"><span>Open command palette</span><kbd>Ctrl / ⌘</kbd><kbd>/</kbd></div>
      <div className="shortcut-row"><span>Undo</span><kbd>Ctrl / ⌘</kbd><kbd>Z</kbd></div>
      <div className="shortcut-row"><span>Redo</span><kbd>Ctrl / ⌘</kbd><kbd>Y</kbd><i>or</i><kbd>Ctrl / ⌘</kbd><kbd>Shift</kbd><kbd>Z</kbd></div>
      <div className="shortcut-row"><span>Select everything on this page</span><kbd>Ctrl / ⌘</kbd><kbd>A</kbd></div>
      <div className="shortcut-row"><span>Copy selected objects</span><kbd>Ctrl / ⌘</kbd><kbd>C</kbd></div>
      <div className="shortcut-row"><span>Cut selected objects</span><kbd>Ctrl / ⌘</kbd><kbd>X</kbd></div>
      <div className="shortcut-row"><span>Paste copied objects</span><kbd>Ctrl / ⌘</kbd><kbd>V</kbd></div>
      <div className="shortcut-row"><span>Delete selected objects</span><kbd>Delete</kbd><i>or</i><kbd>Backspace</kbd></div>
    </div>
    <div className="shortcuts-section"><h3>Tools &amp; navigation</h3>
      <div className="shortcut-row"><span>Draw, select, add text, shapes, or images</span><b>Choose a tool from the toolbar</b></div>
      <div className="shortcut-row"><span>Pan around the page</span><b>Choose Hand, then drag</b></div>
      <div className="shortcut-row"><span>Zoom in or out</span><b>Use the zoom controls</b></div>
      <div className="shortcut-row"><span>Add a page or change orientation</span><b>Use the bottom page controls</b></div>
    </div>
    <footer className="dialog-actions"><button className="dialog-create" onClick={() => setShortcutsOpen(false)}>Done</button></footer>
  </section></div>

  const profileDialog = profileOpen && <div className="new-file-overlay profile-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeProfileEditor() }}><section className="new-file-dialog compact-dialog profile-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title"><button type="button" className="dialog-close" aria-label="Close profile settings" onClick={closeProfileEditor}><Icon name="close" size={16} /></button><p className="eyebrow">YOUR ACCOUNT</p><h2 id="profile-editor-title">Edit profile</h2><form onSubmit={(event) => { void saveProfile(event) }}><label className="dialog-label">I am a<select value={accountType} onChange={(event) => setAccountType(event.target.value as AccountType)}><option value="student">Student</option><option value="teacher">Teacher</option><option value="business">Business</option><option value="employee">Employee</option></select><small>Your choice is saved to this browser and your account when signed in.</small></label>{cloudUser && <><div className="profile-photo-row">{profileAvatar ? <img className="profile-photo-preview" src={profileAvatar} alt="Profile preview" /> : <span className="profile-photo-preview profile-photo-fallback">{(profileDisplayName || cloudUser.username).slice(0, 1).toUpperCase()}</span>}<div><label className="dialog-create profile-upload">Upload photo<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { void chooseProfilePhoto(event.target.files?.[0]); event.currentTarget.value = '' }} /></label><button className="text-button profile-remove-photo" type="button" disabled={!profileAvatar} onClick={() => setProfileAvatar(null)}>Remove photo</button><small>PNG, JPEG, or WebP. Resized to 512 × 512.</small></div></div><label className="dialog-label">Display name<input required maxLength={60} value={profileDisplayName} onChange={(event) => setProfileDisplayName(event.target.value)} /></label><label className="dialog-label">Username<input value={cloudUser.username} disabled /><small>This stays your sign-in and sharing name.</small></label></>}<button className="dialog-create full-button">Save profile</button></form>{cloudUser && <>{(accountType === 'student' || accountType === 'teacher') && <ClassroomAccessPanel key={`${cloudUser.id}-${accountType}`} accountType={accountType} />}<div className="profile-password-section"><h3>Change password</h3>{cloudUser.hasPassword ? <form onSubmit={(event) => { void changePassword(event) }}><label className="dialog-label">Current password<input required type="password" autoComplete="current-password" value={profileCurrentPassword} onChange={(event) => setProfileCurrentPassword(event.target.value)} /></label><label className="dialog-label">New password<input required minLength={12} maxLength={256} type="password" autoComplete="new-password" value={profileNewPassword} onChange={(event) => setProfileNewPassword(event.target.value)} placeholder="At least 12 characters" /></label><button className="dialog-create full-button">Update password</button></form> : <p className="empty-hint">This account signs in with Google or GitHub. Change its password with that provider.</p>}</div></>}{cloudMessage && <p className="cloud-message" role="status">{cloudMessage}</p>}</section></div>

  const accountDialog = accountOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setAccountOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="account-title"><button className="dialog-close" aria-label="Close account" onClick={() => setAccountOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">OZOONOTES ACCOUNT</p><h2 id="account-title">{cloudUser ? `Hello, ${cloudUser.username}` : authMode === 'register' ? 'Create your account' : 'Sign in to OzooNotes'}</h2>{cloudUser ? <><p className="infinite-note">Your boards are saved on the OzooNotes server you run.</p><form className="share-form folder-form" onSubmit={(event) => { void createCloudFolder(event) }}><label className="dialog-label">New folder<input required value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder="Folder name" /></label><button className="dialog-create">Create folder</button></form><label className="dialog-label">Save boards in<select value={selectedFolderId ?? ''} onChange={(event) => setSelectedFolderId(Number(event.target.value) || null)}><option value="">No folder</option>{cloudFolders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label><button className="dialog-create full-button" onClick={() => { void logout() }}>Sign out</button></> : <><form onSubmit={(event) => { void submitAccount(event) }}>{authMode === 'register' && <label className="dialog-label">Email address<input required type="email" maxLength={254} autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" /></label>}<label className="dialog-label">{authMode === 'register' ? 'Username' : 'Email or username'}<input required minLength={authMode === 'register' ? 3 : 1} maxLength={authMode === 'register' ? 32 : 254} autoComplete={authMode === 'register' ? 'username' : 'username'} value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} placeholder={authMode === 'register' ? 'Choose a username' : 'you@example.com'} /></label><label className="dialog-label">Password<input required minLength={authMode === 'register' ? 12 : 1} maxLength={256} type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder={authMode === 'register' ? 'At least 12 characters' : ''} /></label>{authMode === 'register' && <p className="auth-account-note">Your email is used for sign-in. Email verification and password recovery are not enabled yet.</p>}<button className="dialog-create full-button">{authMode === 'register' ? 'Create account' : 'Sign in'}</button><button className="text-button" type="button" onClick={() => { setAuthMode(authMode === 'register' ? 'login' : 'register'); setCloudMessage('') }}>{authMode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'}</button></form></>}{cloudMessage && <p className="cloud-message" role="status">{cloudMessage}</p>}</section></div>

  const shareDialog = shareOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShareOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title"><button className="dialog-close" aria-label="Close sharing" onClick={() => setShareOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">ACCESS MANAGEMENT</p><h2 id="share-title">Share “{boards[activeBoard]?.name}”</h2>{!cloudBoardIds[boards[activeBoard]?.name] && !cloudBoards.some((board) => board.name === boards[activeBoard]?.name) && <div className="share-prerequisite"><p>This note needs to be saved to your server before you can share it.</p><button type="button" className="dialog-create" onClick={() => { setShareOpen(false); openCloudSaveDialog() }}>Save to server</button></div>}<form className="share-form" onSubmit={(event) => { void inviteToBoard(event) }}><label className="dialog-label">Username<input required value={shareUsername} onChange={(event) => setShareUsername(event.target.value)} placeholder="Their OzooNotes username" /></label><label className="dialog-label">Permission<select value={shareRole} onChange={(event) => setShareRole(event.target.value as 'read' | 'edit' | 'download')}><option value="read">Read only</option><option value="edit">Can edit</option><option value="download">Can download</option></select></label><button className="dialog-create" disabled={!cloudBoardIds[boards[activeBoard]?.name] && !cloudBoards.some((board) => board.name === boards[activeBoard]?.name)}>Grant access</button></form><h3 className="small-heading">People with access</h3>{shareList.length ? <ul className="access-list">{shareList.map((entry) => <li key={entry.username}><span>{entry.username}<small>{entry.role === 'edit' ? 'Can edit' : entry.canDownload ? 'Can download' : 'Read only'}</small></span><button onClick={() => { const id = cloudBoardIds[boards[activeBoard].name]; void apiRequest(`/api/boards/${id}/share`, { method: 'DELETE', body: JSON.stringify({ username: entry.username }) }).then(() => setShareList((current) => current.filter((item) => item.username !== entry.username))).catch((error) => setCloudMessage(error.message)) }}>Remove</button></li>)}</ul> : <p className="empty-hint">No one else has access yet.</p>}<h3 className="small-heading">Share with a team</h3>{teams.length ? <><form className="share-form" onSubmit={(event) => { void grantTeamBoardAccess(event) }}><label className="dialog-label">Team<select value={shareTeamId ?? ''} onChange={(event) => setShareTeamId(Number(event.target.value) || null)}><option value="">Choose a team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label><label className="dialog-label">Permission<select value={shareTeamRole} onChange={(event) => setShareTeamRole(event.target.value as 'view' | 'edit')}><option value="view">View only</option><option value="edit">Can edit</option></select></label><button className="dialog-create">Grant</button></form>{shareTeams.map((team) => <p className="team-access-row" key={team.id}>{team.name}: {team.role}<button onClick={() => { const id = cloudBoardIds[boards[activeBoard].name]; void apiRequest(`/api/boards/${id}/teams`, { method: 'DELETE', body: JSON.stringify({ teamId: team.id }) }).then(() => setShareTeams((current) => current.filter((item) => item.id !== team.id))) }}>Remove</button></p>)}</> : <p className="empty-hint">Create a team to grant access to a group.</p>}<div className="menu-divider" /><button className="dialog-create full-button" onClick={() => { void createPublicLink() }}>Create read-only link</button>{publicLink && <><div className="public-link-value">{publicLink}</div><button className="text-button" onClick={() => { const id = cloudBoardIds[boards[activeBoard].name]; void apiRequest(`/api/boards/${id}/public-link`, { method: 'DELETE', body: '{}' }).then(() => { setPublicLink(''); setCloudMessage('Read-only links revoked.') }).catch((error) => setCloudMessage(error.message)) }}>Revoke read-only links</button></>}{cloudMessage && <p className="cloud-message">{cloudMessage}</p>}</section></div>

  const commentsDialog = commentOpen && <div className="new-file-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCommentOpen(false) }}><section className="new-file-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="comments-title"><button className="dialog-close" aria-label="Close comments" onClick={() => setCommentOpen(false)}><Icon name="close" size={16} /></button><p className="eyebrow">TEAM COMMENTS</p><h2 id="comments-title">{boards[activeBoard]?.name}</h2>{comments.length ? <ul className="comment-list">{comments.map((comment) => <li key={comment.id}><strong>{comment.username}</strong><time>{new Date(`${comment.createdAt.replace(' ', 'T')}Z`).toLocaleString()}</time><p>{comment.body}</p></li>)}</ul> : <p className="empty-hint">No comments yet.</p>}<form onSubmit={(event) => { void addComment(event) }}><label className="dialog-label">Add a comment<textarea required rows={3} maxLength={4000} value={commentText} onChange={(event) => setCommentText(event.target.value)} /></label><button className="dialog-create full-button">Post comment</button></form>{cloudMessage && <p className="cloud-message">{cloudMessage}</p>}</section></div>

  const activeBoardName = boards[activeBoard]?.name
  const activeCloudId = activeBoardName ? cloudBoardIds[activeBoardName] : undefined
  const activeRemoteBoard = activeCloudId ? cloudBoards.find((board) => board.id === activeCloudId) : undefined
  const activeRemoteEncrypted = Boolean(activeRemoteBoard && isEncryptedBoardState(activeRemoteBoard.state))
  const canEditActiveBoard = !activeRemoteBoard || activeRemoteBoard.role === 'owner' || activeRemoteBoard.role === 'edit'
  const activeCanDownload = !activeRemoteBoard || activeRemoteBoard.role === 'owner' || activeRemoteBoard.canDownload === true
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

  if (sitePage === 'signin' && authStatus !== 'signed-in') {
    const gateTitle = authStatus === 'loading' ? 'Preparing your workspace…' : authStatus === 'error' ? 'Sign-in is temporarily unavailable' : 'Your notes, ready when you are'
    return (
      <main className={'app ' + (dark ? 'dark' : 'light') + ' auth-app'} data-theme={colorTheme}>
        <section className="auth-screen" aria-labelledby="auth-heading">
          <header className="auth-topbar">
            <a className="auth-brand" href="/" aria-label="OzooNotes home">
              <img src={brandLogo} alt="OzooNotes" />
            </a>
            <a className="auth-dashboard-link" href="/?page=dashboard" aria-label="Go to dashboard">Dashboard</a>
            <label className="auth-theme-picker">
              <span>Theme</span>
              <select aria-label="Color scheme" value={colorTheme} onChange={(event) => setColorTheme(event.target.value as ColorTheme)}>
                {colorThemes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
              </select>
            </label>
          </header>

          <div className="auth-layout">
            <section className="auth-intro" aria-label="About your OzooNotes workspace">
              <p className="auth-kicker"><span /> A calmer place for big ideas</p>
              <h1>Think it through.<br /><em>See the whole picture.</em></h1>
              <p className="auth-intro-copy">Bring notes, sketches, graphs, code, and projects together in one flexible workspace.</p>

              <div className="auth-benefits" aria-label="Workspace features">
                <span><i aria-hidden="true">✎</i> Notes &amp; boards</span>
                <span><i aria-hidden="true">⌁</i> Graphs &amp; ideas</span>
                <span><i aria-hidden="true">⌘</i> Projects</span>
              </div>

              <div className="auth-preview" aria-hidden="true">
                <div className="auth-preview-toolbar"><span /><span /><span /><b>OZOO NOTES</b><i>•••</i></div>
                <div className="auth-preview-paper">
                  <small>THOUGHTS, IN PROGRESS</small>
                  <strong>Make room<br />for a new idea.</strong>
                  <div className="auth-preview-lines"><i /><i /><i /></div>
                  <svg className="auth-preview-doodle" viewBox="0 0 120 80" fill="none">
                    <path d="M7 63c16-38 22 25 41-7s20-32 31-6 21-29 34-35" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    <path d="M13 18h27M74 65h28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".45" />
                    <circle cx="91" cy="23" r="8" stroke="currentColor" strokeWidth="2" opacity=".65" />
                  </svg>
                </div>
                <div className="auth-preview-caption"><span className="auth-live-dot" /> A workspace that follows your thinking</div>
              </div>
            </section>

            <section className="auth-card" aria-labelledby="auth-heading">
              <div className="auth-card-icon" aria-hidden="true"><img src={brandLogo} alt="" /></div>
              <p className="auth-card-eyebrow">YOUR PERSONAL WORKSPACE</p>
              <h2 id="auth-heading">{authMode === 'register' ? 'Create your account' : authMode === 'verify' ? 'Verify your email' : authMode === 'forgot' ? 'Reset your password' : authMode === 'reset' ? 'Choose a new password' : gateTitle}</h2>
              <p className="auth-card-copy">{authMode === 'register' ? 'Create an account for cloud storage, profile tools, and sharing.' : authMode === 'verify' ? 'We’ll send a fresh one-time verification link to your inbox.' : authMode === 'forgot' ? 'Enter the email address on your account and we’ll send a reset link.' : authMode === 'reset' ? 'Choose a new password for your OzooNotes account.' : 'Sign in for cloud storage, account tools, and sharing. You can use the free workspace without an account.'}</p>

              {authStatus === 'loading' ? (
                <div className="auth-loading" role="status" aria-live="polite"><span className="auth-spinner" />Checking your sign-in…</div>
              ) : authStatus === 'error' ? (
                <div className="auth-error" role="alert">
                  <p>{authError}</p>
                  <button className="auth-provider auth-retry" onClick={() => window.location.reload()}>Try again <span aria-hidden="true">↻</span></button>
                </div>
              ) : (
                <>
                  <form className="auth-local-form" onSubmit={(event) => { void submitAccount(event) }}>
                    {['register', 'verify', 'forgot'].includes(authMode) && <label className="auth-field">Email address<input required type="email" maxLength={254} autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" /></label>}
                    {authMode === 'register' && <label className="auth-field">Username<input required minLength={3} maxLength={32} autoComplete="username" value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} placeholder="Choose a username" /></label>}
                    {authMode === 'login' && <label className="auth-field">Email or username<input required maxLength={254} autoComplete="username" value={authUsername} onChange={(event) => setAuthUsername(event.target.value)} placeholder="you@example.com" /></label>}
                    {['login', 'register', 'reset'].includes(authMode) && <label className="auth-field">{authMode === 'reset' ? 'New password' : 'Password'}<input required minLength={authMode === 'register' || authMode === 'reset' ? 12 : 1} maxLength={256} type="password" autoComplete={authMode === 'login' ? 'current-password' : 'new-password'} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder={authMode === 'login' ? '' : 'At least 12 characters'} /></label>}
                    {authMode === 'register' && <p className="auth-account-note">We’ll email a verification link before allowing sign-in. Use an address you can access.</p>}
                    {authError && <p className="auth-form-error" role="alert">{authError}</p>}
                    {authNotice && <p className="auth-form-notice" role="status">{authNotice}</p>}
                    <button className="auth-submit">{authMode === 'register' ? 'Create free account' : authMode === 'verify' ? 'Resend verification email' : authMode === 'forgot' ? 'Send password reset link' : authMode === 'reset' ? 'Update password' : 'Sign in with email'}</button>
                    {authMode === 'login' ? <div className="auth-secondary-actions"><button className="auth-mode-toggle" type="button" onClick={() => { setAuthMode('register'); setAuthError(''); setAuthNotice('') }}>Create an account</button><button className="auth-mode-toggle" type="button" onClick={() => { setAuthMode('forgot'); setAuthError(''); setAuthNotice('') }}>Forgot password?</button><button className="auth-mode-toggle" type="button" onClick={() => { setAuthMode('verify'); setAuthError(''); setAuthNotice('') }}>Resend verification email</button></div> : authMode === 'register' ? <button className="auth-mode-toggle" type="button" onClick={() => { setAuthMode('login'); setAuthError(''); setAuthNotice('') }}>Already have an account? Sign in</button> : <button className="auth-mode-toggle" type="button" onClick={() => { if (authMode === 'reset') { setPasswordResetToken(''); sessionStorage.removeItem('ozoo:password-reset-token') } setAuthMode('login'); setAuthError(''); setAuthNotice('') }}>Back to sign in</button>}
                  </form>
                  {(googleLoginEnabled || githubLoginEnabled) && <>
                    <div className="auth-provider-divider"><span>or continue with</span></div>
                    <div className="auth-provider-list">
                      {googleLoginEnabled && <a className="auth-provider" href={API_BASE + '/api/auth/google'}><span className="auth-provider-mark auth-google-mark" aria-hidden="true">G</span><span>Continue with Google</span><b aria-hidden="true">→</b></a>}
                      {githubLoginEnabled && <a className="auth-provider" href={API_BASE + '/api/auth/github'}><span className="auth-provider-mark auth-github-mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-2.1c-3.1.68-3.76-1.32-3.76-1.32-.5-1.3-1.23-1.65-1.23-1.65-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15.99 1.7 2.59 1.21 3.22.92.1-.72.39-1.21.7-1.49-2.48-.28-5.09-1.24-5.09-5.52 0-1.22.44-2.22 1.15-3-.12-.28-.5-1.42.11-2.96 0 0 .94-.3 3.06 1.15a10.67 10.67 0 0 1 5.57 0c2.13-1.45 3.06-1.15 3.06-1.15.61 1.54.23 2.68.11 2.96.72.78 1.15 1.78 1.15 3 0 4.29-2.62 5.24-5.11 5.51.4.35.75 1.02.75 2.06v3.12c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z"/></svg></span><span>Continue with GitHub</span><b aria-hidden="true">→</b></a>}
                    </div>
                  </>}
                </>
              )}

              <div className="auth-security-note"><span aria-hidden="true">✓</span><p>Passwords are stored as salted hashes. Keep your password private.</p></div>
              <div className="auth-card-footer"><span className="auth-live-dot" /> OzooNotes workspace access</div>
            </section>
          </div>

          <footer className="auth-footer"><span>OzooNotes</span><span>Make space for the way you think.</span></footer>
        </section>
      </main>
    )
  }

  if (calculusSimulatorOpen) return <CalculusSimulator onBack={() => setCalculusSimulatorOpen(false)} />
  if (circuitSimulatorOpen) return <CircuitSimulator onBack={() => setCircuitSimulatorOpen(false)} />
  if (graphSimulatorOpen) return <GraphSimulator onBack={() => setGraphSimulatorOpen(false)} />
  if (codeSimulatorMode === 'cpp') return <CppSimulator onBack={() => setCodeSimulatorMode(null)} />
  if (codeSimulatorMode) return <CodeSimulator initialLanguage={codeSimulatorMode} onBack={() => setCodeSimulatorMode(null)} />
  if (projectsPageOpen) return <ProjectStudio theme={colorTheme} onThemeChange={setColorTheme} initialProjectId={projectFocusId ?? undefined} onBack={() => { setProjectsPageOpen(false); setProjectFocusId(null) }} />

  if (sitePage === 'home') return <MarketingHome logo={brandLogo} theme={colorTheme} onNavigate={navigatePage} onThemeChange={setColorTheme} user={cloudUser} />
  if (sitePage === 'product') return <ProductPage logo={brandLogo} theme={colorTheme} onNavigate={navigatePage} onThemeChange={setColorTheme} user={cloudUser} />
  if (sitePage === 'pricing') return <PricingPage logo={brandLogo} theme={colorTheme} onNavigate={navigatePage} onThemeChange={setColorTheme} user={cloudUser} />
  if (sitePage === 'contact') return <ContactPage logo={brandLogo} theme={colorTheme} onNavigate={navigatePage} onThemeChange={setColorTheme} user={cloudUser} />
  if (sitePage === 'diary') return <DiaryPage theme={colorTheme} onBack={() => navigatePage('dashboard')} />
  if (sitePage === 'roadmaps') return <RoadmapsPage theme={colorTheme} user={cloudUser ? { username: cloudUser.username } : null} onBack={() => navigatePage('dashboard')} onSignIn={() => { sessionStorage.setItem('ozoo:after-login', 'roadmaps'); navigatePage('signin') }} />
  if (sitePage === 'account') {
    const accountGoals = dashboardGoals.filter((goal) => goal.month === dashboardMonthKey())
    const completedGoals = accountGoals.filter((goal) => goal.done).length
    const goalProgress = accountGoals.length ? Math.round(completedGoals / accountGoals.length * 100) : 0
    const deviceFiles = [...new Set(recentFiles)].filter((name) => name && !name.includes(':'))
    const accountPlan = cloudUser?.businessPlan ? 'Business' : cloudUser?.plan === 'pro' ? 'Class Plus' : 'Standard'
    return cloudUser ? <main className={`app ${dark ? 'dark' : 'light'}`} data-theme={colorTheme}><section className="account-overview-page"><div className="account-overview-shell">
      <button className="account-back-button" type="button" onClick={() => navigatePage('dashboard')}>← <span>Back to dashboard</span></button>
      <header className="account-overview-header">{cloudUser.avatar ? <img className="account-overview-avatar" src={cloudUser.avatar} alt="" /> : <span className="account-overview-avatar account-overview-avatar-fallback">{(cloudUser.displayName || cloudUser.username).trim().slice(0, 1).toUpperCase()}</span>}<div><p className="account-overview-eyebrow">YOUR OZOONOTES ACCOUNT</p><h1>{cloudUser.displayName || cloudUser.username}</h1><p className="account-overview-meta"><span>@{cloudUser.username}</span><i />{accountType[0].toUpperCase() + accountType.slice(1)}</p></div><button className="account-report-button" type="button" onClick={() => window.print()}>Download PDF</button></header>
      <nav className="account-overview-tabs" aria-label="Account sections">{(['Info', 'Objectives', 'Documents', 'Reviews'] as const).map((tab) => <button type="button" key={tab} className={accountOverviewTab === tab ? 'active' : ''} aria-current={accountOverviewTab === tab ? 'page' : undefined} onClick={() => setAccountOverviewTab(tab)}>{tab}</button>)}</nav>
      {accountOverviewTab === 'Info' && <div className="account-overview-content">
        <section className="account-progress-card"><div className="account-section-title"><div><span className="account-overview-eyebrow">THIS MONTH</span><h2>Objective progress</h2></div><strong>{goalProgress}<small>%</small></strong></div><div className="account-progress-track"><span style={{ width: `${goalProgress}%` }} /></div><p>{completedGoals} of {accountGoals.length} objectives completed</p><small>Updates as you check off goals on your dashboard.</small></section>
        <section className="account-plan-card"><span className="account-overview-eyebrow">CURRENT PLAN</span><h2>{accountPlan}</h2><p>{accountPlan === 'Standard' ? 'Your free workspace plan.' : `${accountPlan} access is enabled for this account.`}</p><button type="button" onClick={() => navigatePage('pricing')}>View plans</button></section>
        <section className="account-info-card"><div className="account-section-title"><div><span className="account-overview-eyebrow">ACCOUNT DETAILS</span><h2>Your information</h2></div><button type="button" onClick={() => openProfileEditor()}>Edit profile</button></div><dl><div><dt>Display name</dt><dd>{cloudUser.displayName || cloudUser.username}</dd></div><div><dt>Username</dt><dd>@{cloudUser.username}</dd></div><div><dt>Email</dt><dd>{cloudUser.email || 'Not provided'}</dd></div><div><dt>Account type</dt><dd>{accountType[0].toUpperCase() + accountType.slice(1)}</dd></div><div><dt>Theme</dt><dd>{colorThemes.find((theme) => theme.id === colorTheme)?.name ?? 'Custom'}</dd></div></dl></section>
        <section className="account-count-card"><span className="account-overview-eyebrow">YOUR WORKSPACE</span><div><strong>{deviceFiles.length}</strong><span>Files on this device</span></div><div><strong>{cloudBoards.length}</strong><span>Cloud boards</span></div><div><strong>{cloudFolders.length}</strong><span>Cloud folders</span></div></section>
      </div>}
      {accountOverviewTab === 'Objectives' && <section className="account-overview-content account-list-panel"><div className="account-section-title"><div><span className="account-overview-eyebrow">PERSONAL PROGRESS</span><h2>Monthly objectives</h2></div><button type="button" onClick={() => navigatePage('dashboard')}>Open dashboard</button></div>{accountGoals.length ? <ul>{accountGoals.map((goal) => <li key={goal.id}><span className={goal.done ? 'account-objective-done' : ''}>{goal.done ? '✓' : '○'}</span><strong>{goal.title}</strong><small>{goal.done ? 'Completed' : 'In progress'}</small></li>)}</ul> : <p className="account-empty-state">No objectives yet. Add goals on your dashboard to track your progress here.</p>}</section>}
      {accountOverviewTab === 'Documents' && <section className="account-overview-content account-list-panel"><div className="account-section-title"><div><span className="account-overview-eyebrow">YOUR SAVED WORK</span><h2>Documents</h2></div><button type="button" onClick={() => navigatePage('dashboard')}>Open dashboard</button></div><h3>Saved on this device</h3>{deviceFiles.length ? <ul>{deviceFiles.map((name) => <li key={name}><span>▤</span><strong>{name}</strong><small>Device file</small></li>)}</ul> : <p className="account-empty-state">No device files saved yet.</p>}<h3>Cloud boards</h3>{cloudBoards.length ? <ul>{cloudBoards.map((board) => <li key={board.id}><span>☁</span><strong>{board.name}</strong><small>{board.role === 'owner' ? 'Owned by you' : `Shared${board.ownerName ? ` by ${board.ownerName}` : ''}`}</small></li>)}</ul> : <p className="account-empty-state">No cloud boards are connected to this account yet.</p>}</section>}
      {accountOverviewTab === 'Reviews' && <section className="account-overview-content account-review-empty"><span aria-hidden="true">✦</span><h2>Reviews &amp; feedback</h2><p>Feedback and comments are attached to individual shared boards. Open a board from your dashboard to view its collaboration discussion.</p><button type="button" onClick={() => navigatePage('dashboard')}>Go to dashboard</button></section>}
    </div>{profileDialog}</section></main> : <main className={`app ${dark ? 'dark' : 'light'}`} data-theme={colorTheme}><section className="account-overview-page"><p>Opening your account…</p></section></main>
  }
  if (sitePage === 'profile') return cloudUser ? <main className={`app ${dark ? 'dark' : 'light'}`} data-theme={colorTheme}><section className="profile-page-layout"><a className="auth-dashboard-link" href="/?page=dashboard" onClick={(event) => { event.preventDefault(); navigatePage('dashboard') }}>← Back to dashboard</a><h1>Account profile</h1><p>Update the name and photo shown on your OzooNotes account.</p>{profileDialog}</section></main> : <main className={`app ${dark ? 'dark' : 'light'}`} data-theme={colorTheme}><section className="profile-page-layout"><p>Opening your profile…</p></section></main>
  if (sitePage === 'admin') return <AdminPage logo={brandLogo} theme={colorTheme} onNavigate={navigatePage} onThemeChange={setColorTheme} user={cloudUser} users={adminUsers} totals={adminTotals} loading={adminLoading} error={adminError || (cloudUser?.isAdmin ? '' : 'Admin access is not enabled for this account. Add your username to ADMIN_USERNAMES in Railway after deploying the server update.')} onRefresh={() => void refreshAdminOverview()} onChangePlan={(id, plan) => void updateAdminPlan(id, plan)} />

  if (boards.length === 0 || sitePage === 'dashboard') {
    return (
      <main className={`app ${dark ? 'dark' : 'light'}`} data-theme={colorTheme}>
        <section className={'landing-window ' + (sitePage === 'dashboard' ? 'dashboard-window' + (dashboardSidebarCollapsed ? ' sidebar-collapsed' : '') : '')} style={sitePage === 'dashboard' ? ({ '--dashboard-background': colorTheme === 'purple' ? (dashboardAppearance.backgroundMode === 'gradient' ? 'linear-gradient(' + dashboardAppearance.gradientAngle + 'deg, #252525, #080808)' : '#000000') : (dashboardAppearance.backgroundMode === 'gradient' ? 'linear-gradient(' + dashboardAppearance.gradientAngle + 'deg, ' + (dashboardAppearance.background === '#f4f2f8' ? '#f2f2f2' : dashboardAppearance.background) + ', ' + (dashboardAppearance.backgroundEnd === '#e9e3f2' ? '#e7e7e7' : dashboardAppearance.backgroundEnd) + ')' : (dashboardAppearance.background === '#f4f2f8' ? '#f2f2f2' : dashboardAppearance.background)), '--dashboard-file-color': dashboardAppearance.fileColor } as CSSProperties) : undefined}>
          {sitePage === 'dashboard' && dashboardSidebarCollapsed && <button type="button" className="dashboard-mobile-sidebar-toggle" aria-label="Open dashboard menu" aria-expanded="false" aria-controls="dashboard-navigation" title="Open menu" onClick={() => setDashboardSidebarCollapsed(false)}><span aria-hidden="true">☰</span></button>}
          {sitePage === 'dashboard' && !dashboardSidebarCollapsed && <button type="button" className="dashboard-mobile-sidebar-backdrop" aria-label="Close dashboard menu" onClick={() => setDashboardSidebarCollapsed(true)} />}
          <header className="landing-topbar">
            {sitePage === 'dashboard' && <button type="button" className="dashboard-sidebar-toggle" onClick={() => setDashboardSidebarCollapsed((collapsed) => !collapsed)} aria-label={dashboardSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!dashboardSidebarCollapsed} aria-controls="dashboard-navigation" title={dashboardSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}><span aria-hidden="true">{dashboardSidebarCollapsed ? '›' : '‹'}</span></button>}
            <a className="landing-brand" href="/?page=home" onClick={(event) => { event.preventDefault(); navigatePage('home') }} aria-label="OzooNotes home"><img className="brand-mark" src={sitePage === 'dashboard' && dashboardSidebarCollapsed ? `${import.meta.env.BASE_URL}ozoo-pen-icon.png` : brandLogo} alt="OzooNotes" /></a>
            {sitePage === 'dashboard' && <span className="dashboard-sidebar-label">Menu</span>}
            <a className="landing-dashboard-link" href="/?page=dashboard" onClick={(event) => { event.preventDefault(); navigatePage('dashboard') }} aria-label="Open dashboard">Dashboard</a>
            <nav id="dashboard-navigation" className="landing-nav" aria-label="Main navigation">
              {sitePage === 'dashboard' ? <>
                <div className="dashboard-nav-section"><span className="dashboard-sidebar-label">Workspace</span>
                  <button type="button" className="landing-nav-project" onClick={() => setProjectsPageOpen(true)} aria-label="Projects"><Icon name="duplicate" size={16} /><span>Projects</span></button>
                  <button type="button" className="landing-nav-project" onClick={() => navigatePage('diary')} aria-label="Diary"><Icon name="notes" size={16} /><span>Diary</span></button>
                  <button type="button" className="landing-nav-project" onClick={() => navigatePage('roadmaps')} aria-label="Road map"><Icon name="study" size={16} /><span>Road map</span></button>
                  <button type="button" className="landing-nav-project" onClick={openInfiniteBoard} aria-label="Infinite board"><Icon name="shape" size={16} /><span>Infinite board</span></button>
                  <div className="landing-simulator-wrap" onKeyDown={(event) => { if (event.key === 'Escape') setSimulatorMenuOpen(false) }}>
                    <button type="button" className="landing-simulator-trigger" aria-haspopup="menu" aria-expanded={simulatorMenuOpen} onClick={() => setSimulatorMenuOpen((open) => !open)} aria-label="Simulator"><Icon name="graph" size={16} /><span>Simulator</span><Icon name="chevronDown" size={12} /></button>
                    {simulatorMenuOpen && <div className="landing-simulator-menu" role="menu" aria-label="Simulators"><button type="button" role="menuitem" className="landing-simulator-option" onClick={launchCircuitSimulator}><span className="studio-menu-glyph" aria-hidden="true">Ω</span><span><strong>Electronics</strong><small>Build and simulate DC circuits</small></span></button><button type="button" role="menuitem" className="landing-simulator-option" onClick={launchGraphSimulator}><Icon name="graph" size={18} /><span><strong>Graph</strong><small>Plot equations or data points</small></span></button><button type="button" role="menuitem" className="landing-simulator-option" onClick={launchCalculusSimulator}><span className="studio-menu-glyph" aria-hidden="true">∫</span><span><strong>Differentiation & integration</strong><small>Find derivatives and antiderivatives</small></span></button><button type="button" role="menuitem" className="landing-simulator-option" onClick={() => launchCodeSimulator('cpp')}><span className="cpp-menu-glyph" aria-hidden="true">&lt;/&gt;</span><span><strong>C++ coding</strong><small>Write and run C++ programs</small></span></button><button type="button" role="menuitem" className="landing-simulator-option" onClick={() => launchCodeSimulator('python')}><span className="studio-menu-glyph" aria-hidden="true">Py</span><span><strong>Python coding</strong><small>Write and run Python programs</small></span></button><button type="button" role="menuitem" className="landing-simulator-option" onClick={() => launchCodeSimulator('java')}><span className="studio-menu-glyph" aria-hidden="true">Ja</span><span><strong>Java coding</strong><small>Write and run Java programs</small></span></button><button type="button" role="menuitem" className="landing-simulator-option" onClick={() => launchCodeSimulator('web')}><span className="studio-menu-glyph" aria-hidden="true">&lt;/&gt;</span><span><strong>HTML · CSS · JavaScript</strong><small>Build and preview web projects</small></span></button></div>}
                  </div>
                </div>
                <div className="dashboard-nav-section dashboard-nav-section-separated"><span className="dashboard-sidebar-label">Your work</span>
                  <button type="button" className="landing-nav-project" onClick={() => document.getElementById('dashboard-tasks')?.scrollIntoView({ behavior: 'smooth' })} aria-label="Focus tasks"><Icon name="study" size={16} /><span>Focus tasks</span></button>
                  <button type="button" className="landing-nav-project" onClick={() => document.getElementById('dashboard-progress')?.scrollIntoView({ behavior: 'smooth' })} aria-label="Progress"><Icon name="graph" size={16} /><span>Progress</span></button>
                  <button type="button" className="landing-nav-project" onClick={() => document.getElementById('landing-files')?.scrollIntoView({ behavior: 'smooth' })}><Icon name="notes" size={16} /><span>My files</span></button>
                </div>
                <div className="dashboard-nav-section dashboard-nav-section-separated dashboard-folder-section">
                  <div className="dashboard-folder-heading"><button type="button" className="dashboard-folder-section-button" aria-expanded={folderNavExpanded} onClick={() => setFolderNavExpanded((expanded) => !expanded)}><span className="dashboard-sidebar-label">Folders</span><span className="dashboard-folder-count">{notebooks.length + 1}</span><Icon name="chevronDown" size={13} /></button><button type="button" aria-label="Create folder" title="Create folder" onClick={() => { setFolderNavExpanded(true); setFolderCreateOpen((open) => !open) }}>＋</button></div>
                  {folderNavExpanded && <div className="dashboard-folder-tree">
                    {folderCreateOpen && <form className="dashboard-folder-create" onSubmit={(event) => { event.preventDefault(); createNotebook() }}><input autoFocus aria-label="Folder name" placeholder="New folder name" value={newNotebookName} onChange={(event) => setNewNotebookName(event.target.value)} /><button type="submit">Create</button></form>}
                    <div className="dashboard-folder-children">
                      <button type="button" className={'dashboard-folder-link ' + (notebookFilter === 'Inbox' ? 'selected' : '') + (dragOverNotebook === 'Inbox' ? ' drag-target' : '')} onDragOver={(event) => event.preventDefault()} onDragEnter={() => setDragOverNotebook('Inbox')} onDragLeave={() => setDragOverNotebook(null)} onDrop={(event) => { event.preventDefault(); const name = event.dataTransfer.getData('application/x-ozoo-file'); if (name) moveFileToNotebook(name, 'Inbox'); setDragOverNotebook(null) }} onClick={() => { setNotebookFilter('Inbox'); document.getElementById('landing-files')?.scrollIntoView({ behavior: 'smooth' }) }}><span className="dashboard-folder-icon folder-inbox">▰</span><span>Inbox</span></button>
                      {notebooks.map((folder, index) => <button type="button" key={folder} className={'dashboard-folder-link ' + (notebookFilter === folder ? 'selected' : '') + (dragOverNotebook === folder ? ' drag-target' : '')} onDragOver={(event) => event.preventDefault()} onDragEnter={() => setDragOverNotebook(folder)} onDragLeave={() => setDragOverNotebook(null)} onDrop={(event) => { event.preventDefault(); const name = event.dataTransfer.getData('application/x-ozoo-file'); if (name) moveFileToNotebook(name, folder); setDragOverNotebook(null) }} onClick={() => { setNotebookFilter(folder); document.getElementById('landing-files')?.scrollIntoView({ behavior: 'smooth' }) }}><span className={'dashboard-folder-icon folder-color-' + (index % 5)}>▰</span><span>{folder}<small>{[...new Set(recentFiles)].filter((name) => { try { return JSON.parse(localStorage.getItem('doomnotes:' + name) ?? '{}').notebook === folder } catch { return false } }).length}</small></span></button>)}
                    </div>
                  </div>}
                </div>
              </> : <><button type="button" className="landing-nav-project" onClick={() => setProjectsPageOpen(true)} aria-label="Projects"><Icon name="duplicate" size={16} /><span>Projects</span></button><button type="button" className="landing-nav-project" onClick={() => navigatePage('roadmaps')} aria-label="Road map"><Icon name="study" size={16} /><span>Road map</span></button><button type="button" className="landing-nav-project" onClick={openInfiniteBoard} aria-label="Infinite board"><Icon name="shape" size={16} /><span>Infinite board</span></button></>}
            </nav>
            <div className="landing-top-actions">
              {sitePage === 'dashboard' && <button aria-label="Customize dashboard" className="dashboard-editor-toggle" onClick={() => { setCustomizerMessage(''); setDashboardCustomizerOpen(true) }}>✦ <span>Customize</span></button>}
              {!localOnly && (cloudUser ? <details ref={profileMenuRef} className="profile-menu" onToggle={(event) => { if (event.currentTarget.open) { try { setStudentProfileSummary(JSON.parse(localStorage.getItem('ozoo:student-profile') ?? 'null')) } catch { setStudentProfileSummary(null) } } }}>
                <summary className="profile-menu-trigger" aria-label={`Open profile menu for ${cloudUser.username}`}>
                  {cloudUser.avatar ? <img className="profile-avatar profile-avatar-photo" src={cloudUser.avatar} alt="" /> : <span className="profile-avatar" aria-hidden="true">{(cloudUser.displayName || cloudUser.username).trim().slice(0, 1).toUpperCase() || 'O'}</span>}
                  <span className="profile-trigger-copy"><strong>{cloudUser.username}</strong><small>Profile</small></span>
                  <Icon name="chevronDown" size={12} />
                </summary>
                <div className="profile-dropdown">
                  <div className="profile-dropdown-top">
                    {cloudUser.avatar ? <img className="profile-avatar profile-avatar-large profile-avatar-photo" src={cloudUser.avatar} alt="" /> : <span className="profile-avatar profile-avatar-large" aria-hidden="true">{(cloudUser.displayName || cloudUser.username).trim().slice(0, 1).toUpperCase() || 'O'}</span>}
                    <span className="profile-identity"><small>Signed in to OzooNotes</small><strong>{cloudUser.displayName || cloudUser.username}</strong><small>@{cloudUser.username}</small><span className="profile-status"><i /> Account active</span></span>
                  </div>
                  <div className="profile-plan-card"><span>Current plan</span><strong className={cloudUser.businessPlan ? 'profile-plan-pro' : 'profile-plan-normal'}>{cloudUser.businessPlan ? 'Business' : cloudUser.plan === 'pro' ? 'Class Plus' : 'Standard'}</strong><small>{cloudUser.businessPlan ? 'Business access is enabled for this account.' : cloudUser.plan === 'pro' ? 'Class Plus access is enabled for this account.' : 'Free workspace plan'}</small></div>
                  <div className="profile-stat-grid">
                    <div className="profile-stat"><strong>{[...new Set(recentFiles)].filter((name) => name && !name.includes(':')).length}</strong><span>Device files</span></div>
                    <div className="profile-stat"><strong>{cloudBoards.length}</strong><span>Cloud boards</span></div>
                  </div>
                  <div className="profile-data-list">
                    <div className="profile-data-row"><span>Account type</span><strong>{accountType[0].toUpperCase() + accountType.slice(1)}</strong></div>
                    <div className="profile-data-row"><span>Theme</span><strong>{colorThemes.find((theme) => theme.id === colorTheme)?.name ?? 'Custom'}</strong></div>
                    {accountType === 'student' && studentProfileSummary && <div className="profile-study-summary"><span>Study profile</span><strong>{studentProfileSummary.field === 'Other' ? (studentProfileSummary.otherField || 'Other') : (studentProfileSummary.field || 'Student')}</strong><small>{studentProfileSummary.stage === 'Other' ? (studentProfileSummary.otherStage || 'Study level not set') : (studentProfileSummary.stage || 'Study level not set')}{studentProfileSummary.degree ? ` · ${studentProfileSummary.degree}` : ''}</small></div>}
                  </div>
                  <div className="profile-menu-actions">
                    <button type="button" className="profile-edit-action" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); openProfileEditor(); navigatePage('profile') }}><Icon name="settings" size={15} /> Edit profile</button>
                    {cloudUser.isAdmin && <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); navigatePage('admin') }}><Icon name="settings" size={15} /> Admin dashboard</button>}
                    <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); document.getElementById('landing-files')?.scrollIntoView({ behavior: 'smooth' }) }}><Icon name="notes" size={15} /> My files</button>
                    <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); setProjectsPageOpen(true) }}><Icon name="duplicate" size={15} /> Projects</button>
                    <button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); navigatePage('account') }}><Icon name="cloud" size={15} /> Account overview</button>
                    <button type="button" className="profile-signout" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void logout() }}><Icon name="close" size={15} /> Sign out</button>
                  </div>
                </div>
              </details> : <><button className="account-button" onClick={openProfileEditor}><Icon name="settings" size={16} /> Profile</button><button className="account-button" onClick={() => navigatePage('signin')}><Icon name="cloud" size={16} /> Sign in</button></>)}
              <label className="theme-toggle theme-picker"><span>Theme</span><select aria-label="Color scheme" value={colorTheme} onChange={(event) => setColorTheme(event.target.value as ColorTheme)}>{colorThemes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>
            </div>
          </header>
          <div className={sitePage === 'dashboard' ? 'dashboard-custom-layout' : 'landing-custom-layout'}>
            {sitePage === 'dashboard' && dashboardDecorations.some((item) => item.position === 'left') && <aside className="dashboard-decoration-rail left" aria-label="Left dashboard decorations">{renderDashboardDecorations('left')}</aside>}
            <div className="landing-page">
              {sitePage === 'dashboard' && <div className="dashboard-decoration-row dashboard-decoration-top">{renderDashboardDecorations('top')}</div>}
{sitePage === 'dashboard' && <section className="dashboard-overview" aria-label="Dashboard overview">
              <div className="dashboard-main-toolbar">
                <label className="dashboard-search"><span aria-hidden="true">⌕</span><input aria-label="Search your workspace" placeholder="Search your boards and notes…" value={fileSearch} onChange={(event) => setFileSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') document.getElementById('landing-files')?.scrollIntoView({ behavior: 'smooth' }) }} /></label>
                <span className="dashboard-today"><span aria-hidden="true">▦</span> {new Intl.DateTimeFormat('en', { weekday: 'short', month: 'long', day: 'numeric' }).format(new Date())}</span>
                <button className="dashboard-create-button" type="button" onClick={() => addBoard(undefined, landingTemplate, landingPageSize)}><span aria-hidden="true">＋</span> Create new</button>
              </div>
              <div className="dashboard-overview-grid">
                <section className="dashboard-welcome-card">
                  <div className="dashboard-welcome-copy">
                    <span className="dashboard-card-eyebrow">YOUR OZOO WORKSPACE</span>
                    <h1>Hi, {cloudUser?.displayName || cloudUser?.username || 'there'}!</h1>
                    <p>What would you like to work on today?</p>
                    <div className="dashboard-shortcuts">
                      <button type="button" onClick={() => addBoard(undefined, landingTemplate, landingPageSize)}><span>✎</span> Start a board</button>
                      <button type="button" onClick={() => documentInputRef.current?.click()}><span>↥</span> Open a file</button>
                      <button type="button" onClick={() => setProjectsPageOpen(true)}><span>▤</span> Projects</button>
                      <button type="button" onClick={launchGraphSimulator}><span>⌁</span> Graph simulator</button>
                    </div>
                  </div>
                  <div className="dashboard-welcome-art" aria-hidden="true">
                    <div className="dashboard-art-orbit dashboard-art-orbit-one" />
                    <div className="dashboard-art-orbit dashboard-art-orbit-two" />
                    <div className="dashboard-art-board"><span>OZOO NOTES</span><strong>Ideas,<br />in progress.</strong><i /><i /><i /></div>
                    <div className="dashboard-art-pencil">✎</div>
                    <div className="dashboard-art-spark">✦</div>
                  </div>
                </section>
                <aside className="dashboard-recent-panel" aria-labelledby="dashboard-recent-title">
                  <div className="dashboard-panel-heading"><div><span className="dashboard-card-eyebrow">PICK UP WHERE YOU LEFT OFF</span><h2 id="dashboard-recent-title">Recent boards</h2></div><button type="button" onClick={() => document.getElementById('landing-files')?.scrollIntoView({ behavior: 'smooth' })}>See all</button></div>
                  {[...new Set(recentFiles)].filter((name) => name && !name.includes(':')).slice(0, 3).length ? [...new Set(recentFiles)].filter((name) => name && !name.includes(':')).slice(0, 3).map((name, index) => <button type="button" className="dashboard-recent-item" key={name} onClick={() => openSavedFile(name)}><span className={'dashboard-recent-icon dashboard-recent-icon-' + index}><Icon name="notes" size={17} /></span><span><strong>{name}</strong><small>Saved on this device</small></span><Icon name="next" size={14} /></button>) : <div className="dashboard-recent-empty"><span aria-hidden="true">✦</span><strong>Your next idea starts here</strong><small>Create a board and it will show up in this list.</small><button type="button" onClick={() => addBoard(undefined, landingTemplate, landingPageSize)}>Create your first board</button></div>}
                </aside>
              </div>
              <div className="dashboard-metric-grid" aria-label="Workspace summary">
                <article className="dashboard-metric-card"><span className="dashboard-metric-icon metric-purple">▤</span><span className="dashboard-metric-label">Boards on this device</span><strong>{[...new Set(recentFiles)].filter((name) => name && !name.includes(':')).length}</strong><small>Saved in this browser</small></article>
                <article className="dashboard-metric-card"><span className="dashboard-metric-icon metric-green">✓</span><span className="dashboard-metric-label">Open scratchpad tasks</span><strong>{scratchItems.filter((item) => !item.done).length}</strong><small>Quick thoughts to sort later</small></article>
                <article className="dashboard-metric-card"><span className="dashboard-metric-icon metric-blue">☁</span><span className="dashboard-metric-label">Cloud boards</span><strong>{cloudBoards.length}</strong><small>{cloudUser ? 'Synced to your account' : 'Sign in to access cloud work'}</small></article>
                <article className="dashboard-metric-card"><span className="dashboard-metric-icon metric-amber">✦</span><span className="dashboard-metric-label">Your workspace</span><strong>{cloudUser?.businessPlan ? 'Business' : cloudUser?.plan === 'pro' ? 'Class Plus' : 'Standard'}</strong><small>{cloudUser ? 'Your plan and tools' : 'Free, no account needed'}</small></article>
              </div>
            <div className="dashboard-insights-grid" id="dashboard-progress" aria-label="Progress and goals">
                <section className="dashboard-insight-card dashboard-weekly-card"><div className="dashboard-insight-heading"><div><span className="dashboard-card-eyebrow">YOUR MOMENTUM</span><h2>Weekly progress</h2></div><span className="dashboard-insight-badge">{dashboardTasks.filter((task) => task.completedAt && task.completedAt >= dashboardWeekStart.getTime()).length} done</span></div><div className="dashboard-week-legend"><span><i /> Focus tasks</span><span>Mon — Sun</span></div><div className="dashboard-week-chart" role="img" aria-label="Completed focus tasks per day this week">{dashboardWeekDays.map((date, index) => <div className="dashboard-week-column" key={date.toISOString()}><div className="dashboard-week-bar-track"><i style={{ height: Math.max(8, dashboardDailyCompletions[index] / dashboardWeekMax * 100) + '%' }} /></div><small>{date.toLocaleDateString(undefined, { weekday: 'narrow' })}</small></div>)}</div><p className="dashboard-insight-footnote">Tick off a task to see your progress grow here.</p></section>
                <section className="dashboard-insight-card dashboard-month-card"><div className="dashboard-insight-heading"><div><span className="dashboard-card-eyebrow">A LITTLE AT A TIME</span><h2>Month progress</h2></div><span className="dashboard-month-delta">{dashboardMonthlyGoals.filter((goal) => goal.done).length}/{dashboardMonthlyGoals.length} goals</span></div><div className="dashboard-month-progress-content"><div className="dashboard-month-ring" style={{ '--progress-value': dashboardMonthlyProgress } as CSSProperties}><div><strong>{dashboardMonthlyProgress}%</strong><small>complete</small></div></div><div className="dashboard-month-key"><span><i className="goal-key-done" /> Done</span><span><i className="goal-key-open" /> To go</span></div></div><p className="dashboard-insight-footnote">Your monthly goals are saved on this device.</p></section>
              </div>
              <div className="dashboard-work-grid">
                <section className="dashboard-insight-card dashboard-goals-card" aria-labelledby="dashboard-goals-title"><div className="dashboard-insight-heading"><div><span className="dashboard-card-eyebrow">THIS MONTH</span><h2 id="dashboard-goals-title">Monthly goals</h2></div><span className="dashboard-insight-badge">{dashboardMonthlyGoals.filter((goal) => goal.done).length}/{dashboardMonthlyGoals.length}</span></div><ul className="dashboard-goals-list">{dashboardMonthlyGoals.map((goal) => <li key={goal.id}><label><input type="checkbox" checked={goal.done} onChange={() => setDashboardGoals((goals) => goals.map((item) => item.id === goal.id ? { ...item, done: !item.done } : item))} /><span className={goal.done ? 'is-done' : ''}>{goal.title}</span></label><button type="button" aria-label={'Remove goal: ' + goal.title} onClick={() => setDashboardGoals((goals) => goals.filter((item) => item.id !== goal.id))}>×</button></li>)}</ul><form className="dashboard-inline-add" onSubmit={addDashboardGoal}><input aria-label="New monthly goal" placeholder="Add a goal…" value={dashboardGoalDraft} onChange={(event) => setDashboardGoalDraft(event.target.value)} maxLength={90} /><button type="submit" aria-label="Add monthly goal">＋</button></form></section>
                <section className="dashboard-insight-card dashboard-tasks-card" id="dashboard-tasks" aria-labelledby="dashboard-tasks-title"><div className="dashboard-insight-heading"><div><span className="dashboard-card-eyebrow">ONE STEP AT A TIME</span><h2 id="dashboard-tasks-title">Focus tasks <small>({dashboardTasks.filter((task) => !task.done).length} open)</small></h2></div><button type="button" className="dashboard-small-link" onClick={() => document.getElementById('landing-files')?.scrollIntoView({ behavior: 'smooth' })}>My files ↗</button></div><form className="dashboard-task-form" onSubmit={addDashboardTask}><input aria-label="New focus task" placeholder="What would you like to do?" value={dashboardTaskDraft} onChange={(event) => setDashboardTaskDraft(event.target.value)} maxLength={100} /><input aria-label="Task due date" type="date" value={dashboardTaskDueDraft} onChange={(event) => setDashboardTaskDueDraft(event.target.value)} /><button type="submit" aria-label="Add task">＋</button></form>{dashboardTasks.length ? <ul className="dashboard-task-list">{[...dashboardTasks].sort((a, b) => Number(a.done) - Number(b.done) || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 5).map((task) => <li key={task.id}><label><input type="checkbox" checked={task.done} onChange={() => toggleDashboardTask(task.id)} /><span className={task.done ? 'is-done' : ''}>{task.title}<small>{task.done ? 'Completed' : task.dueDate ? 'Due ' + new Date(task.dueDate + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'In progress'}</small></span></label><button type="button" aria-label={'Delete task: ' + task.title} onClick={() => setDashboardTasks((items) => items.filter((item) => item.id !== task.id))}>×</button></li>)}</ul> : <div className="dashboard-task-empty"><span>✦</span><strong>Nothing on your task list yet</strong><small>Add one small next step to get started.</small></div>}</section>
              </div>
              <section className="dashboard-projects-card" aria-labelledby="dashboard-projects-title"><div className="dashboard-insight-heading"><div><span className="dashboard-card-eyebrow">KEEP YOUR WORK MOVING</span><h2 id="dashboard-projects-title">Last projects</h2></div><button type="button" className="dashboard-small-link" onClick={() => { setProjectFocusId(null); setProjectsPageOpen(true) }}>All projects ↗</button></div>{dashboardProjects.length ? <div className="dashboard-project-strip">{dashboardProjects.slice(0, 4).map((project, index) => <button type="button" className={'dashboard-project-tile dashboard-project-tile-' + index} key={project.id} onClick={() => { setProjectFocusId(project.id); setProjectsPageOpen(true) }}><span className="dashboard-project-tile-top"><i>▧</i><small>Edited {new Date(project.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small></span><strong>{project.title || 'Untitled project'}</strong><span>{project.description || 'Open this project and keep building your ideas.'}</span></button>)}</div> : <div className="dashboard-project-empty"><span>▧</span><div><strong>Your projects will show up here</strong><small>Create a project document to keep plans, notes, and resources together.</small></div><button type="button" onClick={() => { setProjectFocusId(null); setProjectsPageOpen(true) }}>Open Projects</button></div>}</section>
</section>}
            {sitePage !== 'dashboard' && <section className="landing-hero">
              <div className="landing-copy">
                <p className="landing-kicker"><span className="status-dot" /> Your space to think on paper</p>
                <h1>Think through ideas.<br /><span>See the whole picture.</span></h1>
                <p className="hero-description">Bring handwritten notes, diagrams, graphs, code, and project plans together. Start with a ready-made page, build an idea visually, then keep everything organized in one workspace.</p>
                <div className="landing-cta-row">
                  <button className="hero-new-file" onClick={() => addBoard(undefined, landingTemplate, landingPageSize)}>Start a new board <Icon name="next" size={17} /></button>
                  <button className="landing-open-file" onClick={() => documentInputRef.current?.click()}><ThemeIcon source={folderPng} size={17} /> Open a file</button>

                  <button type="button" className="landing-help-link" onClick={() => setQuickStartOpen(true)}>Read the Quick Start guide</button>
                </div>
                <div className="landing-value-points" aria-label="Why use OzooNotes">
                  <div className="landing-value-point"><strong>Think visually</strong><span>Mix writing, sketches, and examples.</span></div>
                  <div className="landing-value-point"><strong>Start with a template</strong><span>Get straight to notes, lessons, or code.</span></div>
                  <div className="landing-value-point"><strong>Saved on your device</strong><span>Export a copy when you need one.</span></div>
                </div>
                <div className="landing-quick-setup" aria-label="Board setup options">
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
            </section>}
            {sitePage === 'dashboard' && <div className="dashboard-decoration-row dashboard-decoration-middle">{renderDashboardDecorations('middle')}</div>}
            <section className="audience-starters" id="audience-starters" aria-labelledby="audience-title">
              <div className="landing-section-heading"><span>{landingAudience === 'student' ? 'STUDENT STARTERS' : landingAudience === 'teacher' ? 'TEACHER STARTERS' : 'BUSINESS STARTERS'}</span><h2 id="audience-title">Start with what you need.</h2></div>
              <div className="starter-card-grid" role="tabpanel" aria-label={landingAudience === 'student' ? 'Student board starters' : landingAudience === 'teacher' ? 'Teacher board starters' : 'Business board starters'}>
                {roleStarters[landingAudience].map((starter) => <button key={starter.title} type="button" className="starter-card" onClick={() => addBoard(starter.fileName, starter.template, landingPageSize)}><span className="starter-icon">{starter.icon === 'notes' ? <ThemeIcon source={notesPng} size={21} /> : <Icon name={starter.icon} size={21} />}</span><span className="starter-card-copy"><strong>{starter.title}</strong><small>{starter.description}</small></span><Icon name="next" size={17} /></button>)}
              </div>
            </section>
            <section className="landing-tools" id="landing-tools">
              <div className="landing-section-heading"><span>MAKE IT YOURS</span><h2>Simple tools. Room to explore.</h2></div>
              <div className="landing-feature-grid">
                <article className="landing-feature"><span className="feature-icon feature-draw"><Icon name="pen" /></span><h3>Draw and arrange</h3><p>Use the brush, pen, shapes, text, lines, and eraser. Move and organize what you create.</p></article>
                <article className="landing-feature"><span className="feature-icon feature-graph"><Icon name="graph" /></span><h3>Put ideas on a graph</h3><p>Plot equations or enter points, then add the graph to your board.</p></article>
                <article className="landing-feature"><span className="feature-icon feature-pages"><ThemeIcon source={downloadPng} size={23} /></span><h3>Keep it portable</h3><p>Work across pages, import images, and export as PDF, PNG, or SVG.</p></article>
                <article className="landing-feature"><span className="feature-icon feature-library"><Icon name="notes" /></span><h3>Find ideas again</h3><p>Group boards into notebooks, add tags, and search across titles and topics.</p></article>
                <article className="landing-feature"><span className="feature-icon feature-projects"><Icon name="duplicate" /></span><h3>Build a project story</h3><p>Combine rich text, images, videos, links, and OzooNotes boards in a project page.</p></article>
                <article className="landing-feature"><span className="feature-icon feature-code"><span aria-hidden="true">&lt;/&gt;</span></span><h3>Explore STEM and code</h3><p>Plot equations, work through calculus, simulate circuits, or write and run code.</p></article>
              </div>
            </section>
            <section className="landing-use-cases" id="landing-use-cases" aria-labelledby="landing-use-cases-title">
              <div className="landing-section-heading"><span>ONE WORKSPACE, MANY WAYS TO THINK</span><h2 id="landing-use-cases-title">Make space for the work you do.</h2><p>Choose a starting point, then shape the page around the way you learn, teach, or plan.</p></div>
              <div className="landing-use-grid">
                <article className="landing-use-card landing-use-study"><span className="landing-use-icon"><Icon name="study" /></span><small>FOR STUDY</small><h3>Turn class notes into clear ideas.</h3><p>Sketch a concept, add explanations, and keep revision pages grouped by subject.</p><button type="button" onClick={() => { setLandingAudience('student'); setLandingTemplate('Cornell notes'); document.getElementById('audience-starters')?.scrollIntoView({ behavior: 'smooth' }) }}>Explore student starters <Icon name="next" size={14} /></button></article>
                <article className="landing-use-card landing-use-teach"><span className="landing-use-icon"><Icon name="lesson" /></span><small>FOR TEACHING</small><h3>Make lessons easier to follow.</h3><p>Prepare visual explanations, class activities, and pages you can present or export.</p><button type="button" onClick={() => { setLandingAudience('teacher'); setLandingTemplate('Lesson plan'); document.getElementById('audience-starters')?.scrollIntoView({ behavior: 'smooth' }) }}>Explore teacher starters <Icon name="next" size={14} /></button></article>
                <article className="landing-use-card landing-use-stem"><span className="landing-use-icon"><Icon name="graph" /></span><small>FOR STEM & IDEAS</small><h3>See the pattern behind the problem.</h3><p>Move from a formula or circuit to a visual result, then keep your notes beside it.</p><button type="button" onClick={launchGraphSimulator}>Open graph simulator <Icon name="next" size={14} /></button></article>
              </div>
            </section>
            <section className="landing-how" id="landing-how" aria-labelledby="landing-how-title">
              <div className="landing-how-copy"><span className="landing-section-eyebrow">A SIMPLE PLACE TO BEGIN</span><h2 id="landing-how-title">From first thought to finished page.</h2><p>OzooNotes gives you a flexible canvas and a few useful ways to keep your work moving.</p><button className="hero-new-file" onClick={() => addBoard(undefined, landingTemplate, landingPageSize)}>Start a new board <Icon name="next" size={17} /></button></div>
              <ol className="landing-how-steps">
                <li><span>01</span><div><strong>Pick a starting point</strong><p>Choose a student or teacher workspace, paper size, and starter template.</p></div></li>
                <li><span>02</span><div><strong>Build it your way</strong><p>Write, draw, add media, plot an equation, or bring your ideas into a project.</p></div></li>
                <li><span>03</span><div><strong>Keep it easy to find</strong><p>Organize with notebooks and tags, then export or share when you need to.</p></div></li>
              </ol>
            </section>
            {sitePage === 'dashboard' && <section className="dashboard-shortcuts-panel" aria-label="Pinned shortcuts"><div className="dashboard-shortcuts-heading"><div><span className="dashboard-card-eyebrow">QUICK ACCESS</span><h2>Pinned shortcuts</h2></div><form onSubmit={addDashboardShortcut}><label className="sr-only" htmlFor="dashboard-shortcut-picker">Choose a shortcut</label><select id="dashboard-shortcut-picker" value={dashboardShortcutDraft} onChange={(event) => setDashboardShortcutDraft(event.target.value)}><option value="">Choose…</option><option value="project:projects">Projects</option><option value="roadmap:roadmaps">Road map</option><option value={'folder:' + encodeURIComponent('Inbox')}>Folder · Inbox</option>{notebooks.map((folder) => <option key={folder} value={'folder:' + encodeURIComponent(folder)}>Folder · {folder}</option>)}{[...new Set(recentFiles)].filter((name) => name && !name.includes(':')).map((name) => <option key={name} value={'file:' + encodeURIComponent(name)}>Note · {name}</option>)}</select><button type="submit" disabled={!dashboardShortcutDraft || dashboardShortcuts.some((shortcut) => shortcut.id === dashboardShortcutDraft)}>＋ Pin</button></form></div>{dashboardShortcuts.length ? <div className="dashboard-shortcuts-list">{dashboardShortcuts.map((shortcut) => <div className="dashboard-shortcut-item" key={shortcut.id}><button type="button" onClick={() => openDashboardShortcut(shortcut)}><span aria-hidden="true">{shortcut.kind === 'file' ? '▤' : shortcut.kind === 'folder' ? '▰' : shortcut.kind === 'project' ? '▧' : '⌖'}</span>{shortcut.label}<b>↗</b></button><button type="button" className="dashboard-shortcut-remove" aria-label={'Remove shortcut ' + shortcut.label} onClick={() => setDashboardShortcuts((current) => current.filter((item) => item.id !== shortcut.id))}>×</button></div>)}</div> : <p className="dashboard-shortcuts-empty">Pin a note, folder, project, or road map for one-click access.</p>}</section>}
{sitePage === 'dashboard' && <section className="dashboard-shared-activity" aria-labelledby="dashboard-shared-activity-title"><div className="dashboard-shared-activity-heading"><div><span className="dashboard-card-eyebrow">COLLABORATION</span><h2 id="dashboard-shared-activity-title">Shared work</h2></div><span className="dashboard-shared-activity-count">{cloudUser ? cloudBoards.length : '—'}</span></div>{cloudUser ? cloudBoards.length ? <div className="dashboard-shared-activity-list">{[...cloudBoards].sort((a,b) => (Date.parse(b.updatedAt ?? '') || 0) - (Date.parse(a.updatedAt ?? '') || 0)).slice(0,4).map((board) => <button type="button" key={board.id} onClick={() => { void loadCloudBoard(board) }}><span className="dashboard-shared-board-icon">☁</span><span className="dashboard-shared-board-copy"><strong>{board.name}</strong><small>{board.role === 'owner' ? 'Owned by you' : board.role === 'edit' ? 'Shared · can edit' : board.role === 'read' ? 'Shared · view only' : 'Shared workspace'}{board.updatedAt ? ' · Updated ' + new Date(board.updatedAt).toLocaleDateString(undefined,{month:'short',day:'numeric'}) : ''}</small></span><Icon name="next" size={14} /></button>)}</div> : <p className="dashboard-shared-activity-empty">Boards shared with you, and your recent cloud boards, will appear here.</p> : <div className="dashboard-shared-activity-empty"><p>Sign in to see your shared notes and recent cloud activity.</p><button type="button" onClick={() => navigatePage('signin')}>Sign in</button></div>}</section>}
<section className="landing-files" id="landing-files">
              <div className="landing-files-heading"><div><span>READY WHEN YOU ARE</span><h2>Your files, close at hand.</h2></div><div className="landing-files-actions"><div className="dashboard-file-view-switch" role="group" aria-label="File layout"><button type="button" aria-label="Grid view" aria-pressed={dashboardFileView === 'grid'} className={dashboardFileView === 'grid' ? 'active' : ''} onClick={() => setDashboardFileView('grid')}>▦</button><button type="button" aria-label="List view" aria-pressed={dashboardFileView === 'list'} className={dashboardFileView === 'list' ? 'active' : ''} onClick={() => setDashboardFileView('list')}>☷</button></div><button className="landing-create-file" type="button" onClick={() => addBoard()}><Icon name="addPage" size={16} /> Create a file</button></div></div>
              <div className="library-shortcuts" aria-label="Saved file quick views"><strong>Quick views</strong><button type="button" aria-pressed={tagFilter === 'active'} className={tagFilter === 'active' ? 'selected' : ''} onClick={() => setTagFilter(tagFilter === 'active' ? '' : 'active')}>◉ Active</button><button type="button" aria-pressed={tagFilter === 'favorite'} className={tagFilter === 'favorite' ? 'selected' : ''} onClick={() => setTagFilter(tagFilter === 'favorite' ? '' : 'favorite')}>★ Favorites</button><span className="para-shortcut-label">PARA notebooks</span>{['Projects', 'Areas', 'Resources', 'Archives'].map((book) => <button type="button" key={book} aria-pressed={notebookFilter === book} className={notebookFilter === book ? 'selected' : ''} onClick={() => { setNotebooks((current) => [...new Set([...current, book])]); setNotebookFilter(notebookFilter === book ? 'All notebooks' : book) }}>{book}</button>)}</div>
              <input ref={documentInputRef} className="image-file-input" type="file" accept=".ozoonotes,.doomnotes,.json,application/json,application/pdf,.pdf" aria-label="Open a OzooNotes or PDF file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openBoardFile(file); event.currentTarget.value = '' }} />
              <section className="scratchpad" aria-labelledby="scratchpad-title"><div className="scratchpad-heading"><div><span className="library-kicker">QUICK CAPTURE</span><h3 id="scratchpad-title">Scratchpad</h3><p>Catch a thought or task before you sort it into a notebook.</p></div><span className="scratchpad-count">{scratchItems.filter((item) => !item.done).length} open</span></div><form className="scratchpad-form" onSubmit={(event) => { event.preventDefault(); addScratchItem() }}><input aria-label="Quick note or task" placeholder="Add a thought or task…" value={scratchText} onChange={(event) => setScratchText(event.target.value)} /><button className="landing-new-small" type="submit">＋ Capture</button></form>{scratchItems.length > 0 && <ul className="scratchpad-list">{scratchItems.slice(0, 5).map((item) => <li key={item.id}><label><input type="checkbox" checked={item.done} onChange={() => setScratchItems((items) => items.map((current) => current.id === item.id ? { ...current, done: !current.done } : current))} /><span className={item.done ? 'scratch-done' : ''}>{item.text}</span></label><button type="button" aria-label={`Remove ${item.text}`} onClick={() => setScratchItems((items) => items.filter((current) => current.id !== item.id))}>×</button></li>)}</ul>}</section>
              <div className="library-controls">
                <input aria-label="Search files and tags" placeholder="Search files, tags, and notebooks…" value={fileSearch} onChange={(event) => setFileSearch(event.target.value)} />
                <select aria-label="Filter by notebook" value={notebookFilter} onChange={(event) => setNotebookFilter(event.target.value)}><option>All notebooks</option>{[...new Set(['Inbox', ...notebooks])].map((book) => <option key={book}>{book}</option>)}</select>
                <input aria-label="Filter by tag" placeholder="Filter by tag" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} />
              </div>
              {notebookFilter !== 'All notebooks' && <section className="folder-contents-panel"><div className="folder-contents-heading"><div><span className="library-kicker">FOLDER</span><h3>Inside {notebookFilter}</h3></div><button type="button" onClick={() => setFolderAddOpen((open) => !open)}>＋ Add workspace item</button></div>{folderAddOpen && <div className="folder-add-row"><select aria-label="Choose workspace item" value={folderToolDraft} onChange={(event) => setFolderToolDraft(event.target.value as FolderToolLink)}>{Object.entries(folderToolNames).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select><button type="button" onClick={addFolderTool}>Add</button></div>}<div className="folder-workspace-links">{(folderLinks[notebookFilter] ?? []).map((tool) => <div className="folder-workspace-link" key={tool}><button type="button" onClick={() => openFolderTool(tool)}>↗ &nbsp;{folderToolNames[tool]}</button><button type="button" onClick={() => removeFolderTool(notebookFilter, tool)}>×</button></div>)}</div><div className="folder-contents-actions"><p>Drop a note here from the list, or create one directly in this folder.</p><button type="button" className="landing-new-small" onClick={() => { if (notebookFilter === 'All notebooks') setNotebookFilter('Inbox'); addBoard(undefined, 'Blank', 'A4') }}>＋ New note in this folder</button></div></section>}

              {(() => { const files = [...new Set(recentFiles)].filter((name) => name && !name.includes(':')); const query = tagFilter.trim().replace(/^#/, '').toLowerCase(); const filtered = files.filter((name) => { let meta: { notebook?: string; tags?: string[]; dashboardColor?: string } = {}; try { meta = JSON.parse(localStorage.getItem(`doomnotes:${name}`) ?? '{}') } catch {} const noteText = ((meta as { pageStrokes?: { text?: string }[][] }).pageStrokes ?? []).flat().map((stroke) => stroke.text ?? '').join(' '); const haystack = `${name} ${meta.notebook ?? 'Inbox'} ${(meta.tags ?? []).join(' ')} ${noteText}`.toLowerCase(); const tags = (meta.tags ?? []).map((tag) => tag.toLowerCase().replace(/^#/, '')); const tagMatches = !query || (query === 'active' || query === 'favorite' ? tags.includes(query) : tags.some((tag) => tag.includes(query))); return haystack.includes(fileSearch.trim().toLowerCase()) && (notebookFilter === 'All notebooks' || (meta.notebook ?? 'Inbox') === notebookFilter) && tagMatches }); return filtered.length ? <div className={'landing-recent-list ' + (dashboardFileView === 'list' ? 'list-view' : 'grid-view')}>{filtered.map((name) => { let meta: { notebook?: string; tags?: string[]; dashboardColor?: string } = {}; try { meta = JSON.parse(localStorage.getItem(`doomnotes:${name}`) ?? '{}') } catch {} return <article className={'library-file-card ' + (selectedDashboardFile === name ? 'is-selected' : '')} key={name} draggable onDragStart={(event) => { event.dataTransfer.setData('application/x-ozoo-file', name); event.dataTransfer.effectAllowed = 'move' }} style={{ '--file-card-color': /^#[0-9a-f]{6}$/i.test(meta.dashboardColor ?? '') ? meta.dashboardColor! : dashboardAppearance.fileColor } as CSSProperties}><button className="library-file-open" onClick={() => openSavedFile(name)}><span className="recent-icon"><ThemeIcon source={notesPng} size={19} /></span><span>{name}<small>Saved in this browser</small></span><b>Open <Icon name="next" size={13} /></b></button><button type="button" className="library-file-select" aria-pressed={selectedDashboardFile === name} onClick={() => { setSelectedDashboardFile(name); setSelectedDashboardColor(/^#[0-9a-f]{6}$/i.test(meta.dashboardColor ?? '') ? meta.dashboardColor! : dashboardAppearance.fileColor); setSelectedDashboardNotebook(meta.notebook ?? 'Inbox') }}><span aria-hidden="true">◉</span> Select for color</button><button type="button" className="library-file-settings" onClick={() => openFileSettings(name)}><Icon name="settings" size={15} /> File settings</button>{Boolean(meta.tags?.length) && <div className="file-tag-list">{meta.tags?.map((tag) => <span key={tag}>#{tag.replace(/^#/, '')}</span>)}</div>}</article> })}</div> : <div className="library-no-results">{files.length ? 'No files match those filters.' : 'Your saved boards will appear here. Create one to get started, or open an OzooNotes file.'}</div> })()}{selectedDashboardFile && <aside className="dashboard-file-inspector" aria-label="Selected file options"><div className="dashboard-file-inspector-head"><div><span className="library-kicker">SELECTED NOTE</span><strong>{selectedDashboardFile}</strong></div><button type="button" aria-label="Close selected file options" onClick={() => setSelectedDashboardFile(null)}>×</button></div><p>Choose a card color to make this note easier to spot.</p>{(() => { let meta: { pages?: number; pageSize?: string; infinite?: boolean; savedAt?: string; notebook?: string } = {}; try { meta = JSON.parse(localStorage.getItem('doomnotes:' + selectedDashboardFile) ?? '{}') } catch {} const cloudCopy = cloudBoards.find((board) => board.name === selectedDashboardFile); const access = cloudCopy ? cloudCopy.role === 'owner' ? 'Cloud copy · owner' : cloudCopy.role === 'edit' ? 'Shared · can edit' : cloudCopy.role === 'read' ? 'Shared · view only' : 'Cloud copy' : 'Saved on this device'; return <dl className="dashboard-file-details"><div><dt>Last saved</dt><dd>{meta.savedAt ? new Date(meta.savedAt).toLocaleString() : 'Not saved yet'}</dd></div><div><dt>Page size</dt><dd>{meta.infinite || meta.pageSize === 'Infinite' ? 'Infinite board' : meta.pageSize || 'A4'}</dd></div><div><dt>Pages</dt><dd>{meta.pages ?? 1}</dd></div><div><dt>Folder</dt><dd>{meta.notebook || selectedDashboardNotebook}</dd></div><div><dt>Access</dt><dd>{access}</dd></div></dl> })()}<button type="button" className="dashboard-file-pin-action" aria-pressed={dashboardShortcuts.some((shortcut) => shortcut.id === 'file:' + encodeURIComponent(selectedDashboardFile))} onClick={() => { const id = 'file:' + encodeURIComponent(selectedDashboardFile); setDashboardShortcuts((current) => current.some((shortcut) => shortcut.id === id) ? current : [...current, { id, kind: 'file', label: selectedDashboardFile, target: selectedDashboardFile }]) }}>★ Pin shortcut</button><div className="dashboard-file-color-swatches">{['#dcecff','#f7dce0','#fff0b8','#d9f1df','#eadcf8','#f5e8dc'].map((color) => <button key={color} type="button" aria-label={'Set file color ' + color} aria-pressed={selectedDashboardColor === color} style={{ backgroundColor: color }} onClick={() => setDashboardFileColor(selectedDashboardFile, color)} />)}<label className="dashboard-custom-file-color" title="Choose custom color"><span>＋</span><input type="color" aria-label="Choose custom file color" value={selectedDashboardColor} onChange={(event) => setDashboardFileColor(selectedDashboardFile, event.target.value)} /></label></div><label className="dashboard-file-move">Folder<select value={selectedDashboardNotebook} onChange={(event) => { setSelectedDashboardNotebook(event.target.value); moveFileToNotebook(selectedDashboardFile, event.target.value) }}><option>Inbox</option>{notebooks.map((folder) => <option key={folder}>{folder}</option>)}</select></label><button type="button" className="dashboard-file-inspector-open" onClick={() => openSavedFile(selectedDashboardFile)}>Open note</button><button type="button" className="dashboard-file-inspector-settings" onClick={() => openFileSettings(selectedDashboardFile)}>More file settings</button></aside>}
              {!localOnly && cloudUser && <div className="landing-cloud-files"><h3>Cloud boards</h3>{cloudBoards.length ? <div className="landing-recent-list">{cloudBoards.map((board) => <button key={board.id} onClick={() => loadCloudBoard(board)}><span className="recent-icon"><Icon name="cloud" size={18} /></span><span>{board.ownerId && board.ownerId !== cloudUser.id ? `${board.ownerName || 'Student'} — ${board.name}` : board.name}<small>{board.ownerId && board.ownerId !== cloudUser.id ? `Student note · ${board.role === 'edit' ? 'edit access' : 'view access'}` : 'Saved on your server'}</small></span><b>Open <Icon name="next" size={13} /></b></button>)}</div> : <p className="empty-hint">No cloud boards yet.</p>}</div>}
            </section>
{sitePage === 'dashboard' && <div className="dashboard-decoration-row dashboard-decoration-bottom">{renderDashboardDecorations('bottom')}</div>}
<footer className="landing-footer">
            <div className="landing-brand"><img className="brand-mark" src={brandLogo} alt="OzooNotes" /></div>
            <span>Don’t Doomscroll, just OzooNotes</span>{sitePage === 'dashboard' && dashboardFooterNote && <span className="dashboard-footer-note">{dashboardFooterNote}</span>}
            <div className="landing-footer-socials">
              <a className="landing-footer-contact" href="/?page=contact" onClick={(event) => { event.preventDefault(); navigatePage('contact') }}>Contact</a>
              <a className="landing-footer-feedback" href="https://github.com/AMStudios6/ozoonotes/issues/new" target="_blank" rel="noreferrer">Feedback</a>
              <a className="landing-footer-instagram" href="https://www.instagram.com/ozoonotes/" target="_blank" rel="noreferrer" aria-label="OzooNotes on Instagram" title="OzooNotes on Instagram">
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" /><circle cx="17.5" cy="6.5" r="1.25" fill="currentColor" /></svg>
              </a>
              <a className="landing-footer-github" href="https://github.com/AMStudios6/ozoonotes" target="_blank" rel="noreferrer" aria-label="OzooNotes on GitHub" title="OzooNotes on GitHub"><svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 .9a11.1 11.1 0 0 0-3.51 21.63c.56.1.76-.24.76-.54v-2.08c-3.1.68-3.76-1.32-3.76-1.32-.51-1.3-1.24-1.65-1.24-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.62 1.22 3.26.93.1-.73.39-1.22.71-1.5-2.47-.28-5.07-1.24-5.07-5.5 0-1.22.44-2.22 1.16-3-.12-.28-.5-1.42.11-2.96 0 0 .95-.3 3.05 1.15a10.6 10.6 0 0 1 5.55 0c2.11-1.45 3.05-1.15 3.05-1.15.61 1.54.23 2.68.11 2.96.72.78 1.16 1.78 1.16 3 0 4.27-2.6 5.21-5.08 5.49.4.35.76 1.02.76 2.06v3.1c0 .3.2.65.77.54A11.1 11.1 0 0 0 12 .9Z" /></svg></a>
            </div>
          </footer>
          </div>
            {sitePage === 'dashboard' && dashboardDecorations.some((item) => item.position === 'right') && <aside className="dashboard-decoration-rail right" aria-label="Right dashboard decorations">{renderDashboardDecorations('right')}</aside>}
          </div>
        </section>
                {dashboardCustomizerOpen && sitePage === 'dashboard' && <div className="dashboard-editor-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDashboardCustomizerOpen(false) }}><section className="dashboard-editor-dialog" role="dialog" aria-modal="true" aria-labelledby="dashboard-editor-title"><button className="dashboard-editor-close" onClick={() => setDashboardCustomizerOpen(false)} aria-label="Close dashboard editor">×</button><p className="dashboard-kicker">MAKE IT YOURS</p><h2 id="dashboard-editor-title">Customize dashboard</h2><p className="dashboard-editor-intro">Personalize the workspace colors, then add banners and stickers. Preferences stay in this browser.</p><section className="dashboard-appearance-editor"><div><span className="library-kicker">WORKSPACE BACKGROUND</span><h3>Choose dashboard colors</h3></div><label>Style<select value={dashboardAppearance.backgroundMode} onChange={(event) => setDashboardAppearance((current) => ({ ...current, backgroundMode: event.target.value as 'solid' | 'gradient' }))}><option value="solid">Solid color</option><option value="gradient">Gradient</option></select></label><label>Background color<input type="color" value={dashboardAppearance.background} onChange={(event) => setDashboardAppearance((current) => ({ ...current, background: event.target.value }))} /></label>{dashboardAppearance.backgroundMode === 'gradient' && <><label>Second color<input type="color" value={dashboardAppearance.backgroundEnd} onChange={(event) => setDashboardAppearance((current) => ({ ...current, backgroundEnd: event.target.value }))} /></label><label>Gradient angle<select value={dashboardAppearance.gradientAngle} onChange={(event) => setDashboardAppearance((current) => ({ ...current, gradientAngle: Number(event.target.value) }))}>{[0,45,90,135,180,225,270,315].map((angle) => <option key={angle} value={angle}>{angle}°</option>)}</select></label></>}</section>
          <form className="dashboard-footer-note-form" onSubmit={(event) => { event.preventDefault(); setDashboardFooterNote(footerNoteDraft.trim().slice(0, 160)); setCustomizerMessage('Footer note saved.') }}><label>Optional short footer note<input value={footerNoteDraft} onChange={(event) => setFooterNoteDraft(event.target.value)} maxLength={160} placeholder="A short note shown at the bottom of your dashboard" /></label><button className="dashboard-editor-save-note">Save note</button><button type="button" className="dashboard-editor-clear-note" onClick={() => { setFooterNoteDraft(''); setDashboardFooterNote('') }}>Clear</button></form>
          <div className="dashboard-editor-forms">
            <form className="dashboard-editor-form" onSubmit={addDashboardBanner}><h3>✦ Add a banner</h3><label>Heading<input value={bannerTitle} onChange={(event) => setBannerTitle(event.target.value)} maxLength={80} placeholder="e.g. This week’s focus" /></label><label>Supporting text<input value={bannerSubtitle} onChange={(event) => setBannerSubtitle(event.target.value)} maxLength={140} placeholder="A short message or reminder" /></label><div className="dashboard-editor-form-row"><label>Banner color<input type="color" value={bannerColor} onChange={(event) => setBannerColor(event.target.value)} /></label><label>Placement<select value={bannerPosition} onChange={(event) => setBannerPosition(event.target.value as DecorationPosition)}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option><option value="left">Left side · vertical</option><option value="right">Right side · vertical</option></select></label></div><label>Optional link<input type="url" value={bannerUrl} onChange={(event) => setBannerUrl(event.target.value)} maxLength={500} placeholder="https://example.com" /></label><label className="dashboard-editor-upload">Optional banner image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void compressDashboardImage(file, 1500, 500).then(setBannerImage).then(() => setCustomizerMessage('Banner image ready.')).catch((error: Error) => setCustomizerMessage(error.message)); event.currentTarget.value = '' }} /></label>{bannerImage && <button className="dashboard-editor-clear-image" type="button" onClick={() => setBannerImage('')}>Remove selected image</button>}<button className="dashboard-form-submit">Add banner</button></form>
            <form className="dashboard-editor-form" onSubmit={addDashboardSticker}><h3>❋ Add a sticker</h3><label>Emoji<input value={stickerEmoji} onChange={(event) => setStickerEmoji(event.target.value)} maxLength={8} placeholder="✨" /></label><div className="dashboard-emoji-picks">{['✨','🌱','📚','💡','⭐','🎯','🪴','☀️'].map((emoji) => <button type="button" key={emoji} onClick={() => setStickerEmoji(emoji)} aria-label={'Choose ' + emoji + ' sticker'}>{emoji}</button>)}</div><label>Accessible description<input value={stickerAlt} onChange={(event) => setStickerAlt(event.target.value)} maxLength={70} placeholder="e.g. Study reminder" /></label><label>Optional link<input type="url" value={stickerUrl} onChange={(event) => setStickerUrl(event.target.value)} maxLength={500} placeholder="https://example.com" /></label><label>Optional sticker image<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void compressDashboardImage(file, 512, 512).then(setStickerImage).then(() => setCustomizerMessage('Sticker image ready.')).catch((error: Error) => setCustomizerMessage(error.message)); event.currentTarget.value = '' }} /></label>{stickerImage && <button className="dashboard-editor-clear-image" type="button" onClick={() => setStickerImage('')}>Remove selected image</button>}<label>Placement<select value={stickerPosition} onChange={(event) => setStickerPosition(event.target.value as DecorationPosition)}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option><option value="left">Left side · vertical</option><option value="right">Right side · vertical</option></select></label><button className="dashboard-form-submit">Add sticker</button></form>
          </div><div className="dashboard-editor-items-heading"><h3>Your decorations</h3><span>{dashboardDecorations.length}/24</span></div>{dashboardDecorations.length ? <ul className="dashboard-editor-items">{dashboardDecorations.map((item) => <li key={item.id}><span className="dashboard-editor-item-preview">{item.kind === 'banner' ? item.image ? <img src={item.image} alt="" /> : '▰' : item.image ? <img src={item.image} alt="" /> : item.emoji}</span><strong>{item.kind === 'banner' ? item.title || 'Image banner' : item.alt || 'Sticker'}</strong><select aria-label={'Placement for ' + (item.kind === 'banner' ? item.title || 'banner' : item.alt || 'sticker')} value={item.position} onChange={(event) => updateDecorationPosition(item.id, event.target.value as DecorationPosition)}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option><option value="left">Left side</option><option value="right">Right side</option></select><button onClick={() => removeDashboardDecoration(item.id)} aria-label="Remove decoration">Remove</button></li>)}</ul> : <p className="dashboard-editor-empty">No decorations yet. Add a banner or sticker above to personalize your workspace.</p>}{customizerMessage && <p className="dashboard-editor-message" role="status">{customizerMessage}</p>}</section></div>}
{newFileDialog}
        {renameDialog}
        {fileSettingsDialog}
        {quickStartDialog}
      {shortcutsDialog}
        {shortcutsDialog}
        {!localOnly && accountDialog}
      {!localOnly && profileDialog}
      </main>
    )
  }

  return (
    <main className={`app ${dark ? 'dark' : 'light'} ${presentationMode ? 'presentation-mode' : ''}`} data-theme={colorTheme}>
      <div className="window">
        <header className="window-top">
          <nav className="file-tabs" aria-label="Whiteboard files">
            {boards.map((board, index) => <div key={board.name} className={`file-tab ${index === activeBoard ? 'selected' : ''}`}>
              <button className="tab-open" title="Double-click to rename" onClick={() => activateBoard(index)} onDoubleClick={() => openRenameDialog(board.name)}>{board.name}</button>
              <button className="tab-rename" aria-label={`Rename ${board.name}`} title={`Rename ${board.name}`} onClick={(event) => { event.stopPropagation(); openRenameDialog(board.name) }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 5 5 5M4 20l4.2-.9L19 8.3a2.1 2.1 0 0 0-3-3L5.2 16.1 4 20Z" /></svg></button>
              <button className="tab-close" aria-label={`Close ${board.name}`} title={`Close ${board.name}`} onClick={() => closeBoard(index)}><Icon name="close" size={13} /></button>
            </div>)}
            <button className="add-file" onClick={() => addBoard()} aria-label="Create new file"><Icon name="addPage" size={18} /></button>
            {activeCanDownload && <button className="export-pdf" onClick={openExportDialog} title={infinitePage ? 'Choose PNG or SVG for infinite boards' : 'Choose pages and export format'}><ThemeIcon source={downloadPng} size={17} /> Export…</button>}
          </nav>
          <div className="more-features-wrap">
            <button className="more-features-trigger" aria-expanded={moreFeaturesOpen} aria-haspopup="true" onClick={() => setMoreFeaturesOpen((open) => !open)}><Icon name="settings" size={16} /> {timerRunning ? `More features · ${String(Math.floor(timerSeconds / 60)).padStart(2, '0')}:${String(timerSeconds % 60).padStart(2, '0')}` : 'More features'} <Icon name="chevronDown" size={12} /></button>
            {moreFeaturesOpen && <section className="more-features-panel" aria-label="More features">
              <div className="more-features-heading"><strong>More features</strong><button aria-label="Close more features" onClick={() => setMoreFeaturesOpen(false)}>×</button></div>
              {!localOnly && <div className="more-feature-section"><span className="more-feature-label">COLLABORATION</span><button className="feature-account account-button" onClick={() => { setMoreFeaturesOpen(false); void openShareManager() }}><Icon name="share" size={16} /><span>Share note access</span></button><p className="more-feature-hint">Invite an OzooNotes user by username and choose read, edit, or download access.</p>{!canEditActiveBoard && <p className="more-feature-hint">You have read-only access to this shared note.</p>}</div>}
              <div className="more-feature-section"><span className="more-feature-label">LAYERS</span>
                {([['writing', 'Writing & shapes'], ['text', 'Text'], ['images', 'Pictures']] as [LayerName, string][]).map(([layer, label]) => <div className="feature-layer-row" key={layer}><button className="feature-layer-visibility" aria-pressed={!hiddenLayers.includes(layer)} onClick={() => toggleLayerVisibility(layer)}><span>{hiddenLayers.includes(layer) ? '◌' : '◉'}</span><span>{label}</span><small>{hiddenLayers.includes(layer) ? 'Hidden' : 'Visible'}</small></button><button className="feature-layer-clear" title={`Delete ${label.toLowerCase()} from this page`} aria-label={`Delete ${label.toLowerCase()} from this page`} onClick={() => clearCurrentLayer(layer)}>×</button></div>)}
                <p className="more-feature-hint">Hide a layer to focus. Delete removes that layer’s objects from this page.</p>
              </div>
              <div className="more-feature-section theme-feature"><span className="more-feature-label">APPEARANCE</span><label className="theme-toggle theme-picker"><span>Color theme</span><select aria-label="Color scheme" value={colorTheme} onChange={(event) => setColorTheme(event.target.value as ColorTheme)}>{colorThemes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label>{!localOnly && <button className="account-button feature-account" onClick={() => setAccountOpen(true)}><Icon name="cloud" size={16} /> {cloudUser ? cloudUser.username : 'Sign in'}</button>}</div>
              <div className="more-feature-section screen-recording-section"><span className="more-feature-label">SCREEN RECORDING</span><p className="screen-recording-hint">Capture a screen, window, or tab. The video downloads to your device as a WebM file.</p>{screenRecordingState !== 'idle' && <div className="screen-recording-status"><span className={`recording-indicator ${screenRecordingState}`} /><strong>{screenRecordingState === 'paused' ? 'Paused' : 'Recording'}</strong><time>{String(Math.floor(screenRecordingSeconds / 60)).padStart(2, '0')}:{String(screenRecordingSeconds % 60).padStart(2, '0')}</time></div>}{screenRecordingError && <p className="screen-recording-error" role="alert">{screenRecordingError}</p>}<div className="screen-recording-actions">{screenRecordingState === 'idle' ? <button className="recording-start" onClick={() => { void startScreenRecording() }}><span className="recording-button-dot" /> Record screen</button> : <><button onClick={toggleScreenRecordingPause}>{screenRecordingState === 'paused' ? 'Resume' : 'Pause'}</button><button className="recording-stop" onClick={stopScreenRecording}>Stop & save</button></>}</div></div>
<div className="more-feature-section voice-recording-section"><span className="more-feature-label">VOICE RECORDING</span><p className="screen-recording-hint">Record spoken notes from your microphone. The audio downloads to your device.</p>{voiceRecordingState !== 'idle' && <div className="screen-recording-status"><span className={`recording-indicator ${voiceRecordingState}`} /><strong>{voiceRecordingState === 'paused' ? 'Paused' : 'Recording'}</strong><time>{String(Math.floor(voiceRecordingSeconds / 60)).padStart(2, '0')}:{String(voiceRecordingSeconds % 60).padStart(2, '0')}</time></div>}{voiceRecordingError && <p className="screen-recording-error" role="alert">{voiceRecordingError}</p>}<div className="screen-recording-actions">{voiceRecordingState === 'idle' ? <button className="recording-start" onClick={() => { void startVoiceRecording() }}><span className="recording-button-dot" /> Record voice</button> : <><button onClick={toggleVoiceRecordingPause}>{voiceRecordingState === 'paused' ? 'Resume' : 'Pause'}</button><button className="recording-stop" onClick={stopVoiceRecording}>Stop & save</button></>}</div></div>
              <div className="more-feature-section timer-section"><span className="more-feature-label">FOCUS TIMER</span><div className="timer-readout" aria-live="polite">{String(Math.floor(timerSeconds / 60)).padStart(2, '0')}:{String(timerSeconds % 60).padStart(2, '0')}</div><label className="timer-duration">Minutes<input type="number" min={1} max={240} value={timerMinutes} disabled={timerRunning} onChange={(event) => { const value = Math.max(1, Math.min(240, Number(event.target.value) || 1)); setTimerMinutes(value); setTimerSeconds(value * 60) }} /></label><div className="timer-actions"><button onClick={() => { if (!isProUser) { window.alert('The focus timer is included in Class Plus.'); return }; if (timerSeconds <= 0) setTimerSeconds(timerMinutes * 60); setTimerRunning((running) => !running) }}>{timerRunning ? 'Pause' : timerSeconds === 0 ? 'Start again' : 'Start'}</button><button onClick={() => { setTimerRunning(false); setTimerSeconds(timerMinutes * 60) }}>Reset</button></div></div>
            </section>}
          </div>
        </header>

        <section className="board-area">
          <div className="board-menu-wrap">
            <button className="menu-trigger" aria-label="Open drawing menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Icon name="menu" /></button>
            {menuOpen && <div className="board-menu" aria-label="Note menu">
              <section className="board-menu-group" aria-label="File">
                <p className="menu-title">File</p>
                <button onClick={() => { documentInputRef.current?.click(); setMenuOpen(false) }}><ThemeIcon source={folderPng} size={18} /> <span>Open a note file</span><kbd>Ctrl O</kbd></button>
                <button onClick={saveBoardToFile}><ThemeIcon source={downloadPng} size={18} /> <span>Save a copy</span></button>
                <button onClick={openExportDialog}><ThemeIcon source={downloadPng} size={18} /> <span>Export…</span><kbd>Ctrl Shift E</kbd></button>
                <details className="board-menu-expand"><summary>Special export options</summary>
                  <button onClick={() => { void copyPageForNotion() }}><Icon name="notes" size={17} /> <span>Copy page for Notion</span></button>
                  <button onClick={() => { exportObsidianNote(); setMenuOpen(false) }}><Icon name="notes" size={17} /> <span>Export for Obsidian</span></button>
                </details>
                {!localOnly && <button onClick={() => { setMenuOpen(false); openCloudSaveDialog() }}><Icon name="cloud" size={17} /> <span>Save to cloud</span></button>}
              </section>
              {!localOnly && <>
                <div className="menu-divider" />
                <section className="board-menu-group" aria-label="Collaboration">
                  <p className="menu-title">Collaboration</p>
                  <button onClick={() => { setMenuOpen(false); void openShareManager() }}><Icon name="share" size={17} /> <span>Live collaboration…</span></button>
                  <button onClick={() => { setMenuOpen(false); if (!isProUser) { window.alert('Comments are included in Class Plus.'); return }; if (!cloudUser) setAccountOpen(true); else { setCommentOpen(true); const id = cloudBoardIds[boards[activeBoard].name]; if (id) void loadComments(id).catch((error) => setCloudMessage(error.message)); else setCloudMessage('Save this note to the cloud first.') } }}><Icon name="notes" size={17} /> <span>Comments…</span></button>
                  <details className="board-menu-expand"><summary>Team tools</summary><button onClick={() => { setMenuOpen(false); if (!cloudUser) setAccountOpen(true); else { setTeamOpen(true); void apiRequest<{ teams: { id: number; name: string }[] }>('/api/teams').then(({ teams: result }) => setTeams(result)).catch((error) => setCloudMessage(error.message)) } }}><Icon name="diagram" size={17} /> <span>Manage teams…</span></button></details>
                </section>
              </>}
              <div className="menu-divider" />
              <section className="board-menu-group" aria-label="Page and canvas">
                <p className="menu-title">Page & canvas</p>
                <button onClick={() => { setMenuOpen(false); openRenameDialog() }}><Icon name="text" size={17} /> <span>Rename note…</span></button>
                <button onClick={() => { setLibraryName(''); setLibraryOpen(true); setMenuOpen(false) }}><Icon name="layer" size={17} /> <span>Libraries…</span></button>
                <button onClick={() => { setMenuOpen(false); openTitleDialog() }}><Icon name="notes" size={17} /> <span>Add a page title</span></button>
                <label className="menu-option"><input type="checkbox" checked={gridEnabled} onChange={(event) => setGridEnabled(event.target.checked)} /> Show grid</label>
                <label className="menu-option"><input type="checkbox" disabled={infinitePage} checked={showScale && !infinitePage} onChange={(event) => setShowScale(event.target.checked)} /> Show page scale</label>
                <button onClick={() => { setPresentationMode((active) => !active); setMenuOpen(false) }}><Icon name="next" size={17} /> <span>Presentation mode</span><kbd>Esc to exit</kbd></button>
                {showScale && !infinitePage && <label className="menu-option ruler-unit-option">Ruler units<select value={rulerUnit} onChange={(event) => setRulerUnit(event.target.value as RulerUnit)}><option value="mm">Millimeters (mm)</option><option value="cm">Centimeters (cm)</option><option value="in">Inches (in)</option></select></label>}
                <button disabled={!canEditActiveBoard || !strokes.length} onClick={() => { if (!window.confirm('Clear everything on this page? You can undo this action.')) return; editCurrentPage(() => []); setSelectedIndices([]); setMenuOpen(false) }}><Icon name="delete" size={17} /> <span>Clear this page</span></button>
              </section>
              <div className="menu-divider" />
              <section className="board-menu-group" aria-label="Find and help">
                <p className="menu-title">Find & help</p>
                <button onClick={() => { setFindQuery(''); setFindOpen(true); setMenuOpen(false) }}><Icon name="notes" size={17} /> <span>Find text in notes</span><kbd>Ctrl F</kbd></button>
                <button onClick={() => { setCommandQuery(''); setCommandPaletteOpen(true); setMenuOpen(false) }}><Icon name="shape" size={17} /> <span>Command palette</span><kbd>Ctrl /</kbd></button>
                <button onClick={() => { setQuickStartOpen(true); setMenuOpen(false) }}><ThemeIcon source={notesPng} size={18} /> <span>Quick Start guide</span></button>
                <button onClick={() => { setShortcutsOpen(true); setMenuOpen(false) }}><Icon name="settings" size={17} /> <span>Keyboard shortcuts</span></button>
              </section>
              <div className="menu-divider" />
              <section className="board-menu-group menu-footer-links" aria-label="About">
                <a className="board-menu-github" href="https://github.com/AMStudios6/ozoonotes" target="_blank" rel="noreferrer"><Icon name="share" size={17} /> <span>GitHub</span></a>
                {!localOnly && !cloudUser && <button onClick={() => { setAccountOpen(true); setMenuOpen(false) }}><Icon name="share" size={17} /> <span>Sign in or create account</span></button>}
              </section>
              {(saveNotice || cloudMessage) && <div className="save-notice">{saveNotice || cloudMessage}</div>}
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
              <button type="button" ref={brushToolRef} className={'tool-button drawing-tool-toggle ' + (drawingToolGroup.includes(activeTool) ? 'active' : '')} title="Click to use the last drawing tool; double-click for tool options" aria-label="Select the last drawing tool; double-click for drawing tools" aria-expanded={drawingToolsOpen} aria-controls="drawing-tool-menu" onContextMenu={(event) => event.preventDefault()} onClick={selectLastDrawingTool} onDoubleClick={toggleDrawingToolMenu}><span><Icon name={toolIcons[drawingToolGroup.includes(activeTool) ? activeTool : 'Brush']} /></span><small><Icon name="chevronDown" size={11} /></small></button>
              {drawingToolsOpen && <div id="drawing-tool-menu" className="drawing-tool-menu" role="group" aria-label="Drawing tools">{drawingToolGroup.map((tool) => <button key={tool} type="button" className={'drawing-tool-option ' + (activeTool === tool ? 'active' : '')} aria-pressed={activeTool === tool} onClick={() => { setActiveTool(tool); lastDrawingTool.current = tool; setDrawingToolsOpen(false); if (inkTools.includes(tool)) setShowSettingsPanel(true) }}><span><Icon name={toolIcons[tool]} size={18} /></span><span>{tool}</span></button>)}</div>}
            </div>
            {(['Hand', 'Select', 'Shape', 'Text', 'Line'] as Tool[]).map((tool) => <button key={tool} type="button" title={tool} aria-label={tool} className={'tool-button ' + (activeTool === tool ? 'active' : '')} onClick={() => { setDrawingToolsOpen(false); setActiveTool(tool) }}><span><Icon name={toolIcons[tool]} /></span></button>)}
            <button type="button" ref={settingsToggleRef} className="tool-button settings-toggle" title={showSettingsPanel ? 'Hide drawing settings' : 'Show drawing settings'} aria-label={showSettingsPanel ? 'Hide drawing settings' : 'Show drawing settings'} aria-expanded={showSettingsPanel} aria-controls="drawing-settings" onClick={() => setShowSettingsPanel((visible) => !visible)}><span><Icon name="settings" /></span></button>
          </div>
          <input ref={imageInputRef} className="image-file-input" type="file" accept="image/*" aria-label="Choose an image to import" onChange={(event) => { const file = event.target.files?.[0]; if (file) insertImageBlob(file); event.currentTarget.value = '' }} />
          <input ref={documentInputRef} className="image-file-input" type="file" accept=".ozoonotes,.doomnotes,.json,application/json,application/pdf,.pdf" aria-label="Open a OzooNotes or PDF file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void openBoardFile(file); event.currentTarget.value = '' }} />
                    {showSettingsPanel && <aside id="drawing-settings" ref={settingsPanelRef} className="stroke-panel" aria-label="Selection and drawing settings">
            {(inkTools.includes(activeTool) || activeTool === 'Eraser') && <><div className="settings-group"><label className="settings-heading" htmlFor="drawing-tool-choice">Brush & pen tool</label><select id="drawing-tool-choice" className="drawing-style-select" value={activeTool} onChange={(event) => { const tool = event.target.value as Tool; setActiveTool(tool); lastDrawingTool.current = tool }}><option value="Brush">Brush</option><option value="Pen">Pen</option><option value="Pencil">Pencil</option><option value="Marker">Marker</option><option value="Highlighter">Highlighter</option><option value="Eraser">Eraser</option></select></div>{inkTools.includes(activeTool) && <div className="settings-group"><label className="settings-heading" htmlFor="drawing-style">Brush & pen style</label><select id="drawing-style" className="drawing-style-select" value={drawingStyle} onChange={(event) => { const style = event.target.value as DrawingStyle; setDrawingStyle(style); changeSelection({ drawingStyle: style }) }}><option value="solid">Solid</option><option value="handwriting">Handwriting · smooth</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="calligraphy">Calligraphy</option></select></div>}</>}
            {inkTools.includes(activeTool) && <div className="settings-group"><div className="settings-heading">Color</div><div className="selection-colors">{penColors.concat(['#cf78e9','#d99c3d','#188c73','#e43141']).map((color) => <button key={color} type="button" aria-label={`Stroke color ${color}`} aria-pressed={activeColor.toLowerCase() === color.toLowerCase()} className={`selection-color ${activeColor.toLowerCase() === color.toLowerCase() ? 'chosen' : ''}`} style={{ backgroundColor: color }} onClick={() => { setActiveColor(color); setHexColorDraft(color); changeSelection({ color }) }} />)}</div>{recentStrokeColors.length > 0 && <div className="stroke-recent-colors"><span>Recent custom colors</span>{recentStrokeColors.map((color) => <button key={color} type="button" aria-label={`Recent stroke color ${color}`} title={color} className={`selection-color ${activeColor.toLowerCase() === color.toLowerCase() ? 'chosen' : ''}`} style={{ backgroundColor: color }} onClick={() => { setActiveColor(color); setHexColorDraft(color); changeSelection({ color }) }} />)}</div>}<div className="stroke-hex-controls"><input aria-label="Stroke color hex code" value={hexColorDraft} maxLength={7} spellCheck={false} placeholder="#8b5cf6" onChange={(event) => { const value = event.target.value.startsWith('#') ? event.target.value : `#${event.target.value}`; setHexColorDraft(value); if (/^#[0-9a-f]{6}$/i.test(value)) { setActiveColor(value); changeSelection({ color: value }) } }} onBlur={() => { if (/^#[0-9a-f]{6}$/i.test(hexColorDraft)) setRecentStrokeColors((colors) => [hexColorDraft.toLowerCase(), ...colors.filter((color) => color.toLowerCase() !== hexColorDraft.toLowerCase())].slice(0, 6)); else setHexColorDraft(activeColor) }} /><input type="color" aria-label="Choose a custom stroke color" value={/^#[0-9a-f]{6}$/i.test(hexColorDraft) ? hexColorDraft : activeColor} onChange={(event) => { const color = event.target.value; setHexColorDraft(color); setActiveColor(color); changeSelection({ color }); setRecentStrokeColors((colors) => [color, ...colors.filter((item) => item.toLowerCase() !== color.toLowerCase())].slice(0, 6)) }} /></div></div>}
            {!infinitePage && <div className="settings-group"><div className="settings-heading">Background</div><div className="settings-swatches">{pageColors.map((color) => <button key={color} type="button" aria-label={pageBackgroundLabel(color)} aria-pressed={isBackgroundChoiceSelected(pageBackground, color)} className={`settings-swatch ${isBackgroundChoiceSelected(pageBackground, color) ? 'chosen' : ''}`} style={pageBackgroundSwatchStyle(color)} onClick={() => setActiveBackground(color)} />)}</div></div>}
            <div className="settings-group opacity-group"><label className="settings-heading" htmlFor="stroke-width">Stroke width</label><input id="stroke-width" type="range" min="1" max="16" step="1" value={strokeWidth} onChange={(event) => { const width = Number(event.target.value); setStrokeWidth(width); changeSelection({ width }) }} /><div className="opacity-labels"><span>1</span><span>{strokeWidth}px</span><span>16</span></div><div className="stroke-sizes">{[['S',2],['M',4],['L',7],['XL',12]].map(([name,width]) => <button key={name} className={strokeWidth === width ? 'selected' : ''} onClick={() => { setStrokeWidth(width as number); changeSelection({ width: width as number }) }}>{name}</button>)}</div></div>
            <div className="selection-actions" aria-label="Object ordering and selection actions"><button title="Duplicate" aria-label="Duplicate" disabled={!selectedIndices.length} onClick={duplicateSelection}><Icon name="duplicate" size={16} /></button><button title="Send backward" aria-label="Send backward" disabled={!selectedIndices.length} onClick={() => moveSelectionLayer('back')}><Icon name="layer" size={16} /></button><button title="Bring forward" aria-label="Bring forward" disabled={!selectedIndices.length} onClick={() => moveSelectionLayer('front')}><Icon name="layer" size={16} /></button><button title="Delete" aria-label="Delete" disabled={!selectedIndices.length} onClick={deleteSelection}><Icon name="delete" size={16} /></button></div>
            {activeTool === 'Shape' && <div className="settings-group"><div className="settings-heading">Shape</div><div className="shape-options">{(['Rectangle', 'Ellipse', 'Triangle', 'Diamond', 'Arrow'] as ShapeKind[]).map((kind) => <button key={kind} className={`shape-option ${shapeKind === kind ? 'selected' : ''}`} aria-pressed={shapeKind === kind} onClick={() => setShapeKind(kind)}>{kind}</button>)}</div>{shapeKind !== 'Ellipse' && shapeKind !== 'Arrow' && <div className="shape-rounding"><label className="settings-heading" htmlFor="shape-rounding">Corner rounding <span>{shapeCornerRadius === 0 ? 'Sharp' : `${shapeCornerRadius}%`}</span></label><input id="shape-rounding" type="range" min="0" max="30" step="1" value={shapeCornerRadius} onChange={(event) => { const radius = Number(event.target.value); setShapeCornerRadius(radius); changeSelection({ cornerRadius: radius }) }} /><div className="opacity-labels"><span>Sharp</span><span>Rounded</span></div></div>}</div>}
            {inkTools.includes(activeTool) && <><div className="settings-group"><label className="settings-heading" htmlFor="stroke-smoothing">Smoothing <span>{strokeSmoothness}%</span></label><input id="stroke-smoothing" type="range" min="0" max="100" step="5" value={strokeSmoothness} onChange={(event) => { const smoothing = Number(event.target.value); setStrokeSmoothness(smoothing); changeSelection({ smoothing }) }} /><div className="opacity-labels"><span>Precise</span><span>Smooth</span></div></div><div className="settings-group"><span className="settings-heading">Stroke ends</span><div className="stroke-cap-options"><button type="button" aria-pressed={strokeCap === 'round'} className={strokeCap === 'round' ? 'selected' : ''} onClick={() => { setStrokeCap('round'); changeSelection({ strokeCap: 'round' }) }}><i className="cap-round" />Rounded</button><button type="button" aria-pressed={strokeCap === 'square'} className={strokeCap === 'square' ? 'selected' : ''} onClick={() => { setStrokeCap('square'); changeSelection({ strokeCap: 'square' }) }}><i className="cap-square" />Square</button></div></div></>}
            <div className="settings-group opacity-group"><label className="settings-heading" htmlFor="stroke-opacity">Opacity</label><input id="stroke-opacity" type="range" min="0" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /><div className="opacity-labels"><span>{opacity === 0 ? 0 : opacity}</span><span>100</span></div></div>
          </aside>}

          <div ref={workspaceRef} className={`workspace ${zoom > 100 ? 'zoomed' : ''} ${infinitePage ? 'infinite-workspace' : ''}`} onWheel={(event) => { if (infinitePage) { event.preventDefault(); setInfiniteCameraByPage((current) => ({ ...current, [cameraKey]: { x: (current[cameraKey]?.x ?? 0) + event.deltaX / (canvasWidth * zoom / 100), y: (current[cameraKey]?.y ?? 0) + event.deltaY / (canvasHeight * zoom / 100) } })) } }}>
            <div className={`paper ${orientation} ${infinitePage ? 'infinite' : ''} ${gridEnabled ? 'grid-enabled' : ''} ${showScale ? 'scale-enabled' : ''}`} style={{ zoom: zoom / 100, ...(infinitePage ? { width: '3600px', aspectRatio: '1 / 1', backgroundPosition: `${-cameraOffset.x * canvasWidth}px ${-cameraOffset.y * canvasHeight}px` } : { backgroundColor: resolvePageBackground(pageBackground, dark, colorTheme), aspectRatio: `${orientedPageMm[0]} / ${orientedPageMm[1]}`, transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }) }} aria-label={infinitePage ? 'Infinite whiteboard' : `${pageSize} ${orientation} page`}>
              {showScale && !infinitePage && <div className="rulers" aria-label={`Ruler in ${rulerUnit}`} aria-hidden="true"><div className="ruler-top">{rulerTicks(orientedPageMm[0], rulerUnit).map((tick, index) => <span key={index} style={{ left: `${tick.position}%` }}>{tick.label}</span>)}</div><div className="ruler-left">{rulerTicks(orientedPageMm[1], rulerUnit).map((tick, index) => <span key={index} style={{ top: `${tick.position}%` }}>{tick.label}</span>)}</div></div>}
              {textEditor && <textarea className="text-editor" autoFocus aria-label="Text to add to page" placeholder="Type here… (Enter to finish, Shift+Enter for a new line)" title="Press Enter to add text, or Shift+Enter to start a new line" value={textEditor.value} style={{ left: `${(textEditor.point.x - (infinitePage ? cameraOffset.x : 0)) * 100}%`, top: `${(textEditor.point.y - (infinitePage ? cameraOffset.y : 0)) * 100}%`, color: activeColor, fontSize: `${Math.max(8, strokeWidth * pageContentScale(pageSize) * 5)}px` }} onChange={(event) => setTextEditor((current) => current ? { ...current, value: event.target.value } : current)} onBlur={() => { if (!cancelTextRef.current) commitText(); cancelTextRef.current = false }} onKeyDown={(event) => { if (event.key === 'Escape') { cancelTextRef.current = true; setTextEditor(null) } else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur() } }} />}
              <canvas ref={canvasRef} className={`drawing-canvas ${activeTool === 'Hand' ? 'hand-cursor' : activeTool === 'Select' ? 'move-cursor' : activeTool === 'Eraser' ? 'erase-cursor' : ''}`} width={canvasWidth} height={canvasHeight} onClick={(event) => { if (activeTool === 'Text' && !textEditor) { setDrawingToolsOpen(false); openTextEditorAt(pointFromEvent(event)) } }} onPointerDown={startStroke} onPointerMove={continueStroke} onPointerUp={finishStroke} onPointerCancel={finishStroke} onPointerLeave={() => { if (!activeStroke.current) { setEraserHover(null); setErasePreviewIndices([]) } }} aria-label="Drawing canvas" />
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
          <div className={`tool-status autosave-${autoSaveStatus}`} role="status" title={autoSaveError || undefined} aria-label={autoSaveError ? `Auto-save error: ${autoSaveError}` : undefined}><span className="status-dot" />{autoSaveStatus === 'saving' ? 'Saving locally…' : autoSaveStatus === 'saved' ? 'Saved locally' : autoSaveStatus === 'error' ? 'Auto-save failed · hover for details' : 'Not saved yet'}{activeRemoteBoard && cloudSyncStatus !== 'idle' ? ` · ${cloudSyncStatus === 'syncing' ? 'Syncing…' : cloudSyncStatus === 'synced' ? 'Synced' : 'Sync failed'}` : ''}{selectedIndices.length ? ` · ${selectedIndices.length} selected` : ''} · {activeTool}</div>
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
      {findDialog}
      {commandPaletteDialog}
    </main>
  )
}

export default App



import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type WheelEvent, type CSSProperties, type FormEvent } from 'react'
import './App.css'
import './WorkspacePolish.css'
import notesPng from './assets/notes.png'
import downloadPng from './assets/download.png'
import folderPng from './assets/folder.png'
import StudentSpace from './StudentSpace'
import CppSimulator from './CppSimulator'
import CodeSimulator from './CodeSimulator'
import CircuitSimulator from './CircuitSimulator'
import CalculusSimulator from './CalculusSimulator'
import ProjectStudio from './ProjectsPage'
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
type CloudUser = { id: number; username: string; email?: string | null; displayName?: string; avatar?: string | null; hasPassword?: boolean; plan?: 'normal' | 'pro'; businessPlan?: boolean; accountType?: AccountType; isAdmin?: boolean }
type BoardState = { pages: number; pageSize?: PageSize; infinite?: boolean; orientation: 'portrait' | 'landscape'; pageOrientations?: ('portrait' | 'landscape')[]; pageBackground: string; gridEnabled?: boolean; showScale?: boolean; hiddenLayers?: LayerName[]; pageStrokes: Stroke[][] }
type EncryptedBoardState = { encrypted: 'doomnotes-aes-gcm'; version: 1; kdf: 'PBKDF2-SHA-256'; iterations: number; salt: string; iv: string; ciphertext: string }
type CloudBoard = { id: number; ownerId?: number; name: string; folderId: number | null; state: BoardState | EncryptedBoardState; role?: string; canDownload?: boolean; ownerName?: string }
type CloudComment = { id: number; username: string; body: string; createdAt: string }
type LibraryItem = { id: string; name: string; strokes: Stroke[] }
type Point = { x: number; y: number }
type Stroke = { tool: 'Brush' | 'Pencil' | 'Pen' | 'Marker' | 'Highlighter' | 'Shape' | 'Line' | 'Text' | 'Image' | 'Eraser'; color: string; width: number; opacity: number; points: Point[]; text?: string; shapeKind?: ShapeKind; cornerRadius?: number; imageData?: string; layer?: LayerName; drawingStyle?: DrawingStyle; smoothing?: number; strokeCap?: 'round' | 'square' }
type MoveSession = { indices: number[]; start: Point; originals: Stroke[]; preview: Stroke[] }
type SelectionBox = { start: Point; current: Point }
const penColors = ['#8b5cf6', '#18202a', '#e65353', '#ee8b33', '#48a879', '#378cdb', '#9762d5']
const pageColors = ['auto', 'white', '#19171e', '#fff9e8', '#e9f2ff', '#f3e9ff']
function themedCanvasBackground(theme: ColorTheme) {
  return theme === 'purple' ? '#08060d' : '#f8f5ff'
}
const colorThemes: { id: ColorTheme; name: string; dark: boolean }[] = [
  { id: 'purple', name: 'Purple & Black', dark: true },
  { id: 'white-purple', name: 'White & Purple', dark: false },
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
  return 'Page background ' + ba
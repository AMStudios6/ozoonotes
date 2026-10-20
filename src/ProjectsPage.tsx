import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent, type FormEvent, type CSSProperties } from 'react'
import './ProjectsPage.css'

type ProjectTheme = 'forest' | 'purple' | 'white-purple' | 'red-white' | 'red-black' | 'doom'
type AssetKind = 'image' | 'video' | 'link' | 'ozoonotes'
type ProjectAsset = {
  id: string
  kind: AssetKind
  name: string
  type?: string
  url?: string
  blob?: Blob
  addedAt: number
}
type ProjectDocument = {
  id: string
  title: string
  description: string
  bodyHtml: string
  assets: ProjectAsset[]
  appearance?: { paper: string; accent: string; font: string; size: number; width: number }
  createdAt: number
  updatedAt: number
}
type SaveState = 'loading' | 'saved' | 'saving' | 'error'

const databaseName = 'ozoo-project-documents'
const storeName = 'projects'

function createId() {
  return `project-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('This browser does not support local project storage.'))
      return
    }
    const request = indexedDB.open(databaseName, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open project storage.'))
    request.onblocked = () => reject(new Error('Project storage is busy in another tab. Close the other OzooNotes tab and try again.'))
  })
}

let databasePromise: Promise<IDBDatabase> | null = null
function getDatabase() {
  if (!databasePromise) databasePromise = openDatabase().catch((error) => { databasePromise = null; throw error })
  return databasePromise
}

async function readProjects(): Promise<ProjectDocument[]> {
  const db = await getDatabase()
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
    request.onsuccess = () => resolve((request.result as ProjectDocument[]).sort((a, b) => b.updatedAt - a.updatedAt))
    request.onerror = () => reject(request.error ?? new Error('Could not load projects.'))
  })
}

async function writeProject(project: ProjectDocument) {
  const db = await getDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(project)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not save this project.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Project save was cancelled.'))
  })
}

async function removeProject(id: string) {
  const db = await getDatabase()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).delete(id)
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not delete this project.'))
    transaction.onabort = () => reject(transaction.error ?? new Error('Project delete was cancelled.'))
  })
}

const safeTags = new Set(['P', 'DIV', 'BR', 'HR', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SUP', 'SUB', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'PRE', 'CODE', 'A', 'IMG', 'TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD'])
function sanitizeHtml(value: string) {
  const parsed = new DOMParser().parseFromString(value, 'text/html')
  const cleanNode = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? '')
    if (!(node instanceof HTMLElement)) return null
    if (!safeTags.has(node.tagName)) {
      const fragment = document.createDocumentFragment()
      ;[...node.childNodes].forEach((child) => { const clean = cleanNode(child); if (clean) fragment.append(clean) })
      return fragment
    }
    const clean = document.createElement(node.tagName.toLowerCase())
    if (node.tagName === 'SPAN') {
      const classes = []
      if (node.classList.contains('project-equation')) classes.push('project-equation')
      if (node.classList.contains('project-fraction')) classes.push('project-fraction')
      if (node.classList.contains('project-math-slot')) {
        classes.push('project-math-slot')
        clean.setAttribute('contenteditable', 'true')
        clean.setAttribute('tabindex', '0')
      }
      clean.className = classes.join(' ')
    }
    if (['SPAN', 'P', 'DIV'].includes(node.tagName)) {
      const style = node.style
      const color = style.color
      const background = style.backgroundColor
      const fontSize = style.fontSize
      const fontFamily = style.fontFamily
      const lineHeight = style.lineHeight
      const textAlign = style.textAlign
      const marginLeft = style.marginLeft
      if (color && CSS.supports('color', color)) clean.style.color = color
      if (background && CSS.supports('background-color', background)) clean.style.backgroundColor = background
      if (/^\d+(?:\.\d+)?(?:pt|px|em|rem|%)$/.test(fontSize)) clean.style.fontSize = fontSize
      if (/^[a-zA-Z0-9 ,'"-]{1,80}$/.test(fontFamily)) clean.style.fontFamily = fontFamily
      if (/^\d+(?:\.\d+)?$/.test(lineHeight)) clean.style.lineHeight = lineHeight
      if (['left', 'right', 'center', 'justify'].includes(textAlign)) clean.style.textAlign = textAlign
      if (/^\d+(?:\.\d+)?(?:px|em|rem|%)$/.test(marginLeft)) clean.style.marginLeft = marginLeft
      for (const property of ['padding', 'margin', 'width', 'height', 'border', 'border-radius', 'display', 'gap', 'align-items']) {
        const value = style.getPropertyValue(property)
        if (!value || /url\s*\(/i.test(value)) continue
        if (property === 'border' && /^(?:[1-4]px )?(?:solid|dashed|dotted) #[a-f0-9]{3,8}$/i.test(value)) clean.style.setProperty(property, value)
        else if (['display', 'align-items'].includes(property) && ['flex', 'block', 'inline-block', 'center', 'stretch'].includes(value)) clean.style.setProperty(property, value)
        else if (/^[\d.]+(?:px|em|rem|%)?(?: [\d.]+(?:px|em|rem|%)?){0,3}$/.test(value)) clean.style.setProperty(property, value)
      }
    }
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src') ?? ''
      if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(src) || /^https?:\/\//i.test(src)) {
        clean.setAttribute('src', src)
        clean.setAttribute('alt', (node.getAttribute('alt') ?? '').slice(0, 240))
      } else return null
    }
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? ''
      try {
        const url = new URL(href, window.location.href)
        if (['https:', 'http:', 'mailto:'].includes(url.protocol)) clean.setAttribute('href', url.href)
      } catch { /* Ignore malformed links pasted into the editor. */ }
      clean.setAttribute('target', '_blank')
      clean.setAttribute('rel', 'noreferrer')
    }
    ;[...node.childNodes].forEach((child) => { const safeChild = cleanNode(child); if (safeChild) clean.append(safeChild) })
    return clean
  }
  const result = document.createElement('div')
  ;[...parsed.body.childNodes].forEach((node) => { const clean = cleanNode(node); if (clean) result.append(clean) })
  return result.innerHTML
}

function RichTextEditor({ project, onChange, onAppearanceChange }: { project: ProjectDocument; onChange: (bodyHtml: string) => void; onAppearanceChange: (appearance: NonNullable<ProjectDocument['appearance']>) => void }) {
  const editorRef = useRef<HTMLDivElement>(null)
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedSelection = useRef<Range | null>(null)
  const [showMarks, setShowMarks] = useState(false)
  const [ribbonTab, setRibbonTab] = useState<'home' | 'insert' | 'math' | 'personalize'>('home')
  const [equationDraft, setEquationDraft] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [characterCount, setCharacterCount] = useState(0)
  const imageInput = useRef<HTMLInputElement>(null)
  const updateCounts = () => {
    const text = editorRef.current?.innerText ?? ''
    setWordCount(text.trim() ? text.trim().split(/\s+/).length : 0)
    setCharacterCount(text.length)
  }
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = sanitizeHtml(project.bodyHtml)
      updateCounts()
    }
    savedSelection.current = null
    return () => { if (pendingSave.current) clearTimeout(pendingSave.current) }
  }, [project.id])
  const queueSave = () => {
    if (pendingSave.current) clearTimeout(pendingSave.current)
    pendingSave.current = setTimeout(() => {
      if (editorRef.current) {
        onChange(sanitizeHtml(editorRef.current.innerHTML))
        updateCounts()
      }
      pendingSave.current = null
    }, 450)
  }
  const rememberSelection = () => {
    const selection = window.getSelection()
    if (selection?.rangeCount && editorRef.current?.contains(selection.anchorNode)) {
      savedSelection.current = selection.getRangeAt(0).cloneRange()
    }
  }
  const restoreSelection = () => {
    editorRef.current?.focus()
    const selection = window.getSelection()
    if (selection && savedSelection.current) {
      selection.removeAllRanges()
      selection.addRange(savedSelection.current)
    }
  }
  const runFormat = (command: string, value?: string, event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault()
    restoreSelection()
    if (command.startsWith('justify')) document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(command, false, value)
    rememberSelection()
    queueSave()
  }
  const applyInlineStyle = (property: string, value: string) => {
    restoreSelection()
    const selection = window.getSelection()
    if (!selection?.rangeCount || selection.isCollapsed || !editorRef.current?.contains(selection.anchorNode)) return
    const range = selection.getRangeAt(0)
    const span = document.createElement('span')
    span.style.setProperty(property, value)
    span.append(range.extractContents())
    range.insertNode(span)
    selection.removeAllRanges()
    const nextRange = document.createRange()
    nextRange.selectNodeContents(span)
    selection.addRange(nextRange)
    savedSelection.current = nextRange.cloneRange()
    queueSave()
  }
  const resizeSelection = (change: number) => {
    restoreSelection()
    const selection = window.getSelection()
    if (!selection?.rangeCount || selection.isCollapsed || !editorRef.current?.contains(selection.anchorNode)) return
    const parent = selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode?.parentElement
    const pixels = Number.parseFloat(parent ? window.getComputedStyle(parent).fontSize : '') || 14
    const points = Math.min(72, Math.max(8, Math.round(pixels * 0.75 + change)))
    applyInlineStyle('font-size', `${points}pt`)
  }
  const changeCase = (mode: string) => {
    restoreSelection()
    const selection = window.getSelection()
    if (!selection?.rangeCount || selection.isCollapsed) return
    const range = selection.getRangeAt(0)
    const replacement = mode === 'upper' ? selection.toString().toLocaleUpperCase() : selection.toString().toLocaleLowerCase()
    range.deleteContents()
    const text = document.createTextNode(replacement)
    range.insertNode(text)
    selection.removeAllRanges()
    const nextRange = document.createRange()
    nextRange.selectNode(text)
    selection.addRange(nextRange)
    savedSelection.current = nextRange.cloneRange()
    queueSave()
  }
  const pasteText = async (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    restoreSelection()
    try {
      const text = await navigator.clipboard.readText()
      document.execCommand('insertText', false, text)
      queueSave()
    } catch {
      window.alert('Clipboard access is blocked. Use Ctrl+V or ⌘V in the document instead.')
    }
  }
  const insertHtml = (html: string) => {
    restoreSelection()
    document.execCommand('insertHTML', false, html)
    rememberSelection()
    queueSave()
  }
  const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
  const insertEquation = (equation: string) => {
    if (!equation.trim()) return
    let markup = escapeHtml(equation.trim())
    const fraction = (numerator: string, denominator: string) => '<span class="project-equation project-fraction"><span class="project-math-slot">' + numerator + '</span><span class="project-math-slot">' + denominator + '</span></span>'
    markup = markup.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, (_match, numerator: string, denominator: string) => fraction(numerator, denominator))
    markup = markup.replace(/(?<![\w/])([A-Za-z0-9]+)\/([A-Za-z0-9]+)(?![\w/])/g, (_match, numerator: string, denominator: string) => fraction(numerator, denominator))
    markup = markup.replace(/([A-Za-z0-9]+)\^(?:\{([^{}]+)\}|([A-Za-z0-9]+))/g, (_match, base: string, grouped: string | undefined, simple: string | undefined) => base + '<sup>' + (grouped ?? simple) + '</sup>')
    markup = markup.replace(/([A-Za-z0-9]+)_(?:\{([^{}]+)\}|([A-Za-z0-9]+))/g, (_match, base: string, grouped: string | undefined, simple: string | undefined) => base + '<sub>' + (grouped ?? simple) + '</sub>')
    insertHtml('<span class="project-equation">' + markup + '</span>&nbsp;')
  }
  const insertFraction = () => insertHtml('<span class="project-equation project-fraction"><span class="project-math-slot"></span><span class="project-math-slot"></span></span>&nbsp;')
  const hasMathSyntax = (value: string) => /\\frac\{[^{}]+\}\{[^{}]+\}|\^[{]?[A-Za-z0-9]+|_[{]?[A-Za-z0-9]+|[A-Za-z0-9]+\/[A-Za-z0-9]+/.test(value)
  const insertTable = () => {
    const rows = Math.min(12, Math.max(1, Number(window.prompt('How many table rows?', '3')) || 0))
    const columns = Math.min(8, Math.max(1, Number(window.prompt('How many columns?', '3')) || 0))
    if (!rows || !columns) return
    const markup = `<table><tbody>${Array.from({ length: rows }, (_, row) => `<tr>${Array.from({ length: columns }, (_, col) => row === 0 ? `<th>Column ${col + 1}</th>` : '<td>&nbsp;</td>').join('')}</tr>`).join('')}</tbody></table><p><br></p>`
    insertHtml(markup)
  }
  const insertShape = () => {
    const label = window.prompt('Text for your shape or callout', 'Add a note')
    if (label === null) return
    const shape = window.prompt('Shape: rectangle, rounded, or circle', 'rounded')?.toLowerCase() ?? 'rounded'
    const radius = shape.includes('circle') ? '50px' : shape.includes('round') ? '16px' : '3px'
    insertHtml(`<div style="border: 2px solid #8057d8; border-radius: ${radius}; padding: 14px; margin: 10px 0; background-color: #f7f2ff; display: inline-block">${escapeHtml(label || ' ')}<br></div><p><br></p>`)
  }
  const insertSmartArt = () => {
    const steps = window.prompt('Enter process steps separated by commas', 'Plan, Build, Review')
    if (!steps) return
    insertHtml(`<ol>${steps.split(',').map((step) => `<li>${escapeHtml(step.trim())}</li>`).join('')}</ol><p><br></p>`)
  }
  const insertChart = () => {
    const values = window.prompt('Enter chart values as Label: number, Label: number', 'Idea: 4, Design: 7, Build: 5')
    if (!values) return
    const rows = values.split(',').map((item) => {
      const [label, raw = '0'] = item.split(':')
      const value = Number(raw.trim())
      return { label: (label ?? '').trim(), value: Number.isFinite(value) ? value : 0 }
    }).filter((item) => item.label).slice(0, 12)
    const max = Math.max(1, ...rows.map((row) => row.value))
    const chart = `<div style="border: 1px solid #c9c0d7; border-radius: 8px; padding: 12px; margin: 10px 0">${rows.map((row) => `<p style="margin: 5px 0">${escapeHtml(row.label)} <span style="display: inline-block; width: ${Math.max(2, Math.round(row.value / max * 70))}%; background-color: #8057d8; color: #ffffff; padding: 3px 6px">${row.value}</span></p>`).join('')}</div><p><br></p>`
    insertHtml(chart)
  }
  const insertSmartDate = () => insertHtml(`<span>${new Date().toLocaleString()}</span>`)
  const insertVideoLink = () => {
    const url = window.prompt('Paste a video URL')
    if (!url) return
    const safeUrl = /^(https?:\/\/)/i.test(url) ? url : `https://${url}`
    insertHtml(`<p><a href="${escapeHtml(safeUrl)}" target="_blank">▶ Watch video</a></p>`)
  }
  const insertHeaderFooter = (kind: 'Header' | 'Footer') => {
    const text = window.prompt(`${kind} text`, kind === 'Header' ? project.title : 'Project notes')
    if (text === null) return
    insertHtml(`<div style="border: 1px solid #c9c0d7; padding: 8px; margin: 8px 0; color: #66527f">${escapeHtml(kind.toUpperCase())}: ${escapeHtml(text)}</div>`)
  }
  const addImageFile = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 6 * 1024 * 1024) {
      window.alert('Choose an image smaller than 6 MB.')
      if (imageInput.current) imageInput.current.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      insertHtml(`<p><img src="${reader.result}" alt="${escapeHtml(file.name)}" /></p><p><br></p>`)
      if (imageInput.current) imageInput.current.value = ''
    }
    reader.readAsDataU
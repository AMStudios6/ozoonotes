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
    markup = markup.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, (_match, numerator: string, denominator: string) => `<span class="project-equation project-fraction"><span class="project-math-slot">${numerator}</span><span class="project-math-slot">${denominator}</span></span>`)
    markup = markup.replace(/(?<![\w/])([A-Za-z0-9]+)\/([A-Za-z0-9]+)(?![\w/])/g, (_match, numerator: string, denominator: string) => `<span class="project-equation project-fraction"><span class="project-math-slot">${numerator}</span><span class="project-math-slot">${denominator}</span></span>`)
    markup = markup.replace(/([A-Za-z0-9]+)\^(?:\{([^{}]+)\}|([A-Za-z0-9]+))/g, (_match, base: string, grouped: string | undefined, simple: string | undefined) => `${base}<sup>${grouped ?? simple}</sup>`)
    markup = markup.replace(/([A-Za-z0-9]+)_(?:\{([^{}]+)\}|([A-Za-z0-9]+))/g, (_match, base: string, grouped: string | undefined, simple: string | undefined) => `${base}<sub>${grouped ?? simple}</sub>`)
    insertHtml(`<span class="project-equation">${markup}</span>&nbsp;`)
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
    reader.readAsDataURL(file)
  }
  const insertOnlineImage = () => {
    const url = window.prompt('Paste an image URL')
    if (!url) return
    const safeUrl = /^(https?:\/\/)/i.test(url) ? url : `https://${url}`
    if (!/^https?:\/\//i.test(safeUrl)) return
    insertHtml(`<p><img src="${escapeHtml(safeUrl)}" alt="Online image" /></p>`)
  }
  const insertImageFromClipboard = async () => {
    try {
      const items = await navigator.clipboard.read()
      const item = items.find((clipboardItem) => clipboardItem.types.some((type) => type.startsWith('image/')))
      const type = item?.types.find((itemType) => itemType.startsWith('image/'))
      if (!item || !type) throw new Error('No image')
      addImageFile(new File([await item.getType(type)], 'Screenshot.png', { type }))
    } catch {
      window.alert('No screenshot image is available from the clipboard.')
    }
  }
  const addInlineLink = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const link = window.prompt('Paste a web address or email link')
    if (!link) { restoreSelection(); return }
    const normalized = /^(https?:|mailto:)/i.test(link) ? link : `https://${link}`
    runFormat('createLink', normalized)
  }
  const run = (command: string, value?: string) => (event: MouseEvent<HTMLButtonElement>) => runFormat(command, value, event)
  const chooseStyle = (property: string) => (event: ChangeEvent<HTMLSelectElement | HTMLInputElement>) => applyInlineStyle(property, event.target.value)
  const selectProps = {
    onMouseDown: rememberSelection,
    onKeyDown: rememberSelection,
    'aria-label': 'Document formatting',
  }
  return <div className="project-editor-wrap">
    <div className="project-ribbon-tabs" role="tablist" aria-label="Project document tools">
      <button type="button" role="tab" aria-selected={ribbonTab === 'home'} className={ribbonTab === 'home' ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => setRibbonTab('home')}>Home</button>
      <button type="button" role="tab" aria-selected={ribbonTab === 'insert'} className={ribbonTab === 'insert' ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => setRibbonTab('insert')}>Insert</button>
      <button type="button" role="tab" aria-selected={ribbonTab === 'math'} className={ribbonTab === 'math' ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => setRibbonTab('math')}>Math</button>
      <button type="button" role="tab" aria-selected={ribbonTab === 'personalize'} className={ribbonTab === 'personalize' ? 'active' : ''} onMouseDown={(event) => event.preventDefault()} onClick={() => setRibbonTab('personalize')}>Personalize</button>
    </div>
    <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden onChange={(event) => addImageFile(event.target.files?.[0])} />
    <div className="project-format-toolbar" role="toolbar" aria-label={ribbonTab === 'home' ? 'Text formatting' : ribbonTab === 'insert' ? 'Insert project content' : ribbonTab === 'math' ? 'Math tools' : 'Personalize project'}>
      {ribbonTab === 'home' ? <>
      <div className="project-ribbon-group project-clipboard-group" aria-label="Clipboard">
        <button type="button" title="Paste text from clipboard" aria-label="Paste" onMouseDown={(event) => void pasteText(event)}><span className="project-ribbon-symbol">▣</span><small>Paste</small></button>
        <div className="project-ribbon-stack"><button type="button" title="Cut" aria-label="Cut" onMouseDown={run('cut')}>✂ <small>Cut</small></button><button type="button" title="Copy" aria-label="Copy" onMouseDown={run('copy')}>▢ <small>Copy</small></button></div>
      </div>
      <span className="project-format-divider" />
      <div className="project-ribbon-group project-font-group" aria-label="Font">
        <select {...selectProps} className="project-font-select" defaultValue="Arial" title="Font family" onChange={chooseStyle('font-family')}>
          <option value="Arial">Arial</option><option value="Calibri">Calibri</option><option value="Georgia">Georgia</option><option value="Times New Roman">Times New Roman</option><option value="Verdana">Verdana</option><option value="Courier New">Courier New</option>
        </select>
        <select {...selectProps} className="project-size-select" defaultValue="11" title="Font size" onChange={chooseStyle('font-size')}>
          {['8','9','10','11','12','14','16','18','20','24','28','32','36','48','72'].map((size) => <option key={size} value={`${size}pt`}>{size}</option>)}
        </select>
        <button type="button" title="Increase font size" aria-label="Increase font size" onMouseDown={(event) => { event.preventDefault(); resizeSelection(2) }}>A<sup>+</sup></button>
        <button type="button" title="Decrease font size" aria-label="Decrease font size" onMouseDown={(event) => { event.preventDefault(); resizeSelection(-2) }}>A<sup>−</sup></button>
        <button type="button" title="Uppercase selected text" aria-label="Uppercase selected text" onMouseDown={(event) => { event.preventDefault(); changeCase('upper') }}>Aa</button>
        <button type="button" title="Clear formatting" aria-label="Clear formatting" onMouseDown={run('removeFormat')}>A<span className="project-clear-mark">×</span></button>
        <span className="project-format-divider" />
        <button type="button" title="Bold" aria-label="Bold" onMouseDown={run('bold')}><b>B</b></button>
        <button type="button" title="Italic" aria-label="Italic" onMouseDown={run('italic')}><i>I</i></button>
        <button type="button" title="Underline" aria-label="Underline" onMouseDown={run('underline')}><u>U</u></button>
        <button type="button" title="Strikethrough" aria-label="Strikethrough" onMouseDown={run('strikeThrough')}>ab̶</button>
        <button type="button" title="Subscript" aria-label="Subscript" onMouseDown={run('subscript')}>x₂</button>
        <button type="button" title="Superscript" aria-label="Superscript" onMouseDown={run('superscript')}>x²</button>
        <label className="project-color-control" title="Text color"><span>A</span><input aria-label="Text color" type="color" defaultValue="#202820" onMouseDown={rememberSelection} onChange={chooseStyle('color')} /></label>
        <label className="project-color-control project-highlight-control" title="Text highlight"><span>▰</span><input aria-label="Text highlight color" type="color" defaultValue="#fff176" onMouseDown={rememberSelection} onChange={chooseStyle('background-color')} /></label>
      </div>
      <span className="project-format-divider" />
      <div className="project-ribbon-group project-paragraph-group" aria-label="Paragraph">
        <select aria-label="Text style" title="Text style" defaultValue="P" onMouseDown={rememberSelection} onChange={(event) => { restoreSelection(); document.execCommand('formatBlock', false, event.target.value); rememberSelection(); queueSave() }}>
          <option value="P">Normal text</option><option value="H1">Title</option><option value="H2">Heading 1</option><option value="H3">Heading 2</option>
        </select>
        <button type="button" title="Undo" aria-label="Undo" onMouseDown={run('undo')}>↶</button>
        <button type="button" title="Redo" aria-label="Redo" onMouseDown={run('redo')}>↷</button>
        <button type="button" title="Bulleted list" aria-label="Bulleted list" onMouseDown={run('insertUnorderedList')}>• List</button>
        <button type="button" title="Numbered list" aria-label="Numbered list" onMouseDown={run('insertOrderedList')}>1. List</button>
        <button type="button" title="Add a checklist item" aria-label="Add a checklist item" onMouseDown={(event) => { event.preventDefault(); const task = window.prompt('What do you need to do?', 'New task'); if (task !== null) insertHtml(`<ul><li>☐ ${escapeHtml(task)}</li></ul><p><br></p>`) }}>☐ Task</button>
        <button type="button" title="Decrease indent" aria-label="Decrease indent" onMouseDown={run('outdent')}>⇤</button>
        <button type="button" title="Increase indent" aria-label="Increase indent" onMouseDown={run('indent')}>⇥</button>
        <span className="project-format-divider" />
        <button type="button" title="Align left" aria-label="Align left" onMouseDown={run('justifyLeft')}>☰</button>
        <button type="button" title="Center" aria-label="Center" onMouseDown={run('justifyCenter')}>≡</button>
        <button type="button" title="Align right" aria-label="Align right" onMouseDown={run('justifyRight')}>☷</button>
        <button type="button" title="Justify" aria-label="Justify" onMouseDown={run('justifyFull')}>▤</button>
        <select {...selectProps} className="project-line-spacing" defaultValue="1.5" title="Line spacing" onChange={(event) => applyInlineStyle('line-height', event.target.value)}>
          <option value="1">1.0</option><option value="1.15">1.15</option><option value="1.5">1.5</option><option value="2">2.0</option>
        </select>
        <button type="button" title="Toggle paragraph marks" aria-label="Toggle paragraph marks" aria-pressed={showMarks} onMouseDown={(event) => event.preventDefault()} onClick={() => setShowMarks((visible) => !visible)}>¶</button>
        <button type="button" title="Heading" aria-label="Heading" onMouseDown={run('formatBlock', 'h2')}>H₂</button>
        <button type="button" title="Quote" aria-label="Quote" onMouseDown={run('formatBlock', 'blockquote')}>❝</button>
        <button type="button" title="Add link to selected text" aria-label="Add link to selected text" onMouseDown={addInlineLink}>↗</button>
      </div>
      </> : ribbonTab === 'insert' ? <>
        <div className="project-ribbon-group project-insert-group" aria-label="Pages and tables">
          <button type="button" title="Insert cover page" onMouseDown={(event) => { event.preventDefault(); insertHtml(`<h1>${escapeHtml(project.title)}</h1><p>${escapeHtml(project.description)}</p><hr><p><br></p>`) }}>▤<small>Cover Page</small></button>
          <button type="button" title="Insert a blank page break" onMouseDown={(event) => { event.preventDefault(); insertHtml('<hr><p><br></p>') }}>▯<small>Blank Page</small></button>
          <button type="button" title="Insert a page break" onMouseDown={(event) => { event.preventDefault(); insertHtml('<hr><p><br></p>') }}>↵<small>Page Break</small></button>
          <button type="button" title="Insert a table" onMouseDown={(event) => { event.preventDefault(); insertTable() }}>▦<small>Table</small></button>
        </div>
        <span className="project-format-divider" />
        <div className="project-ribbon-group project-insert-group" aria-label="Illustrations">
          <button type="button" title="Insert a picture from your device" onMouseDown={(event) => { event.preventDefault(); imageInput.current?.click() }}>▧<small>Pictures</small></button>
          <button type="button" title="Insert an online picture" onMouseDown={(event) => { event.preventDefault(); insertOnlineImage() }}>🌐<small>Online Picture</small></button>
          <button type="button" title="Insert a screenshot from clipboard" onMouseDown={(event) => { event.preventDefault(); void insertImageFromClipboard() }}>▣<small>Screenshot</small></button>
          <button type="button" title="Insert a shape or callout" onMouseDown={(event) => { event.preventDefault(); insertShape() }}>◇<small>Shapes</small></button>
          <button type="button" title="Insert a process list" onMouseDown={(event) => { event.preventDefault(); insertSmartArt() }}>⟶<small>SmartArt</small></button>
          <button type="button" title="Insert a simple bar chart" onMouseDown={(event) => { event.preventDefault(); insertChart() }}>▥<small>Chart</small></button>
        </div>
        <span className="project-format-divider" />
        <div className="project-ribbon-group project-insert-group" aria-label="Links and text">
          <button type="button" title="Insert a code snippet" onMouseDown={(event) => { event.preventDefault(); const code = window.prompt('Paste or type a code snippet', '// Your code'); if (code !== null) insertHtml(`<pre><code>${escapeHtml(code)}</code></pre><p><br></p>`) }}>⌘<small>Code</small></button>
          <button type="button" title="Insert a divider" onMouseDown={(event) => { event.preventDefault(); insertHtml('<hr><p><br></p>') }}>―<small>Divider</small></button>
          <button type="button" title="Insert a video link" onMouseDown={(event) => { event.preventDefault(); insertVideoLink() }}>▶<small>Online Video</small></button>
          <button type="button" title="Link selected text" onMouseDown={addInlineLink}>↗<small>Hyperlink</small></button>
          <button type="button" title="Add a comment" onMouseDown={(event) => { event.preventDefault(); const note = window.prompt('Write a comment or review note'); if (note) insertHtml(`<blockquote><strong>Comment:</strong> ${escapeHtml(note)}</blockquote>`) }}>▤<small>Comment</small></button>
          <button type="button" title="Insert a text box" onMouseDown={(event) => { event.preventDefault(); insertShape() }}>▱<small>Text Box</small></button>
          <button type="button" title="Insert project title styling" onMouseDown={(event) => { event.preventDefault(); const text = window.prompt('Text for decorative title', project.title); if (text) insertHtml(`<h2 style="color: #8057d8; font-family: Georgia; text-align: center">${escapeHtml(text)}</h2>`) }}>A<small>WordArt</small></button>
          <button type="button" title="Insert date and time" onMouseDown={(event) => { event.preventDefault(); insertSmartDate() }}>◷<small>Date &amp; Time</small></button>
          <button type="button" title="Insert a project header" onMouseDown={(event) => { event.preventDefault(); insertHeaderFooter('Header') }}>↥<small>Header</small></button>
          <button type="button" title="Insert a project footer" onMouseDown={(event) => { event.preventDefault(); insertHeaderFooter('Footer') }}>↧<small>Footer</small></button>
          <button type="button" title="Insert a page number label" onMouseDown={(event) => { event.preventDefault(); insertHtml('<p style="text-align: right">Page 1</p>') }}>#<small>Page Number</small></button>
          <button type="button" title="Insert a signature line" onMouseDown={(event) => { event.preventDefault(); insertHtml('<p>Signature: ______________________________</p>') }}>✎<small>Signature</small></button>
        </div>
      </> : ribbonTab === 'personalize' ? <div className="project-personalize-panel"><span>Make this project yours</span><label>Paper color<select value={project.appearance?.paper ?? '#fffefa'} onChange={(event) => onAppearanceChange({ paper: event.target.value, accent: project.appearance?.accent ?? '#8057d8', font: project.appearance?.font ?? 'Arial', size: project.appearance?.size ?? 14, width: project.appearance?.width ?? 820 })}><option value="#fffefa">Warm white</option><option value="#ffffff">White</option><option value="#fff5d8">Cream</option><option value="#f0f6ff">Soft blue</option><option value="#f5efff">Lavender</option></select></label><label>Accent color<select value={project.appearance?.accent ?? '#8057d8'} onChange={(event) => onAppearanceChange({ paper: project.appearance?.paper ?? '#fffefa', accent: event.target.value, font: project.appearance?.font ?? 'Arial', size: project.appearance?.size ?? 14, width: project.appearance?.width ?? 820 })}><option value="#8057d8">Purple</option><option value="#207a6a">Teal</option><option value="#2969b0">Blue</option><option value="#b74760">Rose</option><option value="#a66318">Amber</option></select></label><label>Writing font<select value={project.appearance?.font ?? 'Arial'} onChange={(event) => onAppearanceChange({ paper: project.appearance?.paper ?? '#fffefa', accent: project.appearance?.accent ?? '#8057d8', font: event.target.value, size: project.appearance?.size ?? 14, width: project.appearance?.width ?? 820 })}><option>Arial</option><option>Georgia</option><option>Verdana</option><option>Times New Roman</option><option>Courier New</option></select></label><label>Text size<select value={project.appearance?.size ?? 14} onChange={(event) => onAppearanceChange({ paper: project.appearance?.paper ?? '#fffefa', accent: project.appearance?.accent ?? '#8057d8', font: project.appearance?.font ?? 'Arial', size: Number(event.target.value), width: project.appearance?.width ?? 820 })}>{[12,13,14,16,18,20].map((size) => <option key={size} value={size}>{size}px</option>)}</select></label><label>Page width<select value={project.appearance?.width ?? 820} onChange={(event) => onAppearanceChange({ paper: project.appearance?.paper ?? '#fffefa', accent: project.appearance?.accent ?? '#8057d8', font: project.appearance?.font ?? 'Arial', size: project.appearance?.size ?? 14, width: Number(event.target.value) })}><option value={680}>Compact</option><option value={820}>Comfortable</option><option value={960}>Wide</option></select></label><button type="button" onClick={() => onAppearanceChange({ paper: '#fffefa', accent: '#8057d8', font: 'Arial', size: 14, width: 820 })}>Reset</button></div> : <>
        <div className="project-math-entry">
          <label htmlFor="project-equation-input">Equation</label>
          <input id="project-equation-input" value={equationDraft} onChange={(event) => setEquationDraft(event.target.value)} onMouseDown={rememberSelection} onKeyDown={(event) => { if (event.key === 'Enter' || (event.key === ' ' && hasMathSyntax(equationDraft))) { event.preventDefault(); insertEquation(equationDraft); setEquationDraft('') } }} placeholder="Type an equation, e.g. 1/2 or x^2" />
          <button type="button" onMouseDown={(event) => { event.preventDefault(); insertEquation(equationDraft); setEquationDraft('') }}>Insert</button>
        </div>
        <span className="project-format-divider" />
        <div className="project-ribbon-group project-insert-group" aria-label="Equation structures">
          <button type="button" title="Insert a stacked fraction" aria-label="Insert a stacked fraction" onMouseDown={(event) => { event.preventDefault(); insertFraction() }}>□<small>Fraction</small></button>
          {[
            ['Power', 'xⁿ'], ['Subscript', 'xₙ'], ['Square root', '√(□)'],
            ['Integral', '∫ f(x) dx'], ['Summation', '∑'],
          ].map(([label, value]) => <button key={label} type="button" title={`Insert ${label.toLowerCase()} template`} onMouseDown={(event) => { event.preventDefault(); insertEquation(value) }}>{value}<small>{label}</small></button>)}
        </div>
        <span className="project-format-divider" />
        <div className="project-ribbon-group project-insert-group project-math-symbols" aria-label="Math symbols">
          {['±', '×', '÷', '≤', '≥', '≠', '≈', '∞', 'π', 'θ', 'α', 'β', 'Δ', '√', '∫', '∑', '→', '°'].map((symbol) => <button key={symbol} type="button" title={`Insert ${symbol}`} onMouseDown={(event) => { event.preventDefault(); insertEquation(symbol) }}>{symbol}</button>)}
        </div>
      </>}
    </div>
    <div
      ref={editorRef}
      className={`project-rich-editor ${showMarks ? 'project-show-marks' : ''}`}
      style={{ backgroundColor: project.appearance?.paper ?? '#fffefa', color: '#222222', fontFamily: project.appearance?.font ?? 'Arial', fontSize: `${project.appearance?.size ?? 14}px`, maxWidth: `${project.appearance?.width ?? 820}px`, marginInline: 'auto', width: '100%', '--project-accent': project.appearance?.accent ?? '#8057d8' } as CSSProperties}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={`Write in ${project.title}`}
      aria-multiline="true"
      data-placeholder="Start writing your project notes… Add headings, explanations, plans, and reflections."
      onInput={() => { rememberSelection(); updateCounts(); queueSave() }}
      onKeyUp={rememberSelection}
      onMouseUp={rememberSelection}
      onBlur={() => {
        if (pendingSave.current) clearTimeout(pendingSave.current)
        if (editorRef.current) { onChange(sanitizeHtml(editorRef.current.innerHTML)); updateCounts() }
        pendingSave.current = null
      }}
    />
    <div className="project-editor-status" aria-live="polite"><span>{wordCount.toLocaleString()} words</span><span>{characterCount.toLocaleString()} characters</span><span>About {Math.ceil(wordCount / 200)} min read</span></div>
  </div>
}

function ProjectAssetCard({ asset, onDelete }: { asset: ProjectAsset; onDelete: () => void }) {
  const [objectUrl, setObjectUrl] = useState('')
  useEffect(() => {
    if (!asset.blob) return
    const url = URL.createObjectURL(asset.blob)
    setObjectUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [asset.blob])
  const download = () => {
    if (!asset.blob) return
    const url = URL.createObjectURL(asset.blob)
    const link = document.createElement('a')
    link.href = url
    link.download = asset.name
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1500)
  }
  return <article className="project-asset-card">
    <div className="project-asset-preview">
      {asset.kind === 'image' && objectUrl ? <img src={objectUrl} alt={asset.name} /> : null}
      {asset.kind === 'video' && objectUrl ? <video src={objectUrl} controls preload="metadata" /> : null}
      {asset.kind === 'link' ? <a className="project-link-preview" href={asset.url} target="_blank" rel="noreferrer"><span>↗</span><small>OPEN LINK</small></a> : null}
      {asset.kind === 'ozoonotes' ? <div className="project-file-preview"><span>✎</span><small>OZOONOTES</small></div> : null}
    </div>
    <div className="project-asset-details"><span className="project-asset-kind">{asset.kind === 'ozoonotes' ? 'OzooNotes file' : asset.kind}</span><strong title={asset.name}>{asset.name}</strong>
      {asset.kind !== 'link' ? <button type="button" className="project-asset-action" onClick={download}>Download</button> : <a className="project-asset-action" href={asset.url} target="_blank" rel="noreferrer">Open link</a>}
    </div>
    <button type="button" className="project-asset-remove" aria-label={`Remove ${asset.name}`} title="Remove attachment" onClick={onDelete}>×</button>
  </article>
}

function ProjectStudio({ onBack, theme }: { onBack: () => void; theme: ProjectTheme }) {
  const [projects, setProjects] = useState<ProjectDocument[]>([])
  const projectsRef = useRef<ProjectDocument[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('loading')
  const [storageError, setStorageError] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkName, setLinkName] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [search, setSearch] = useState('')
  const [exportOpen, setExportOpen] = useState(false)
  const imageInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const noteInput = useRef<HTMLInputElement>(null)
  const pendingSaves = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const activeProject = projects.find((project) => project.id === activeId) ?? null

  useEffect(() => {
    let mounted = true
    readProjects().then((loaded) => {
      if (!mounted) return
      projectsRef.current = loaded
      setProjects(loaded)
      setActiveId(loaded[0]?.id ?? null)
      setSaveState('saved')
    }).catch((error) => {
      if (!mounted) return
      setStorageError(error instanceof Error ? error.message : 'Could not open local project storage.')
      setSaveState('error')
    })
    return () => { mounted = false }
  }, [])

  useEffect(() => () => {
    pendingSaves.current.forEach((timer) => clearTimeout(timer))
  }, [])

  const updateProject = (id: string, change: Partial<ProjectDocument>) => {
    const current = projectsRef.current
    const updated = current.find((project) => project.id === id)
    if (!updated) return
    const nextProject = { ...updated, ...change, updatedAt: Date.now() }
    const next = [nextProject, ...current.filter((project) => project.id !== id)].sort((a, b) => b.updatedAt - a.updatedAt)
    projectsRef.current = next
    setProjects(next)
    setSaveState('saving')
    const existing = pendingSaves.current.get(id)
    if (existing) clearTimeout(existing)
    pendingSaves.current.set(id, setTimeout(() => {
      writeProject(nextProject).then(() => setSaveState('saved')).catch((error) => {
        setStorageError(error instanceof Error ? error.message : 'Could not save this project.')
        setSaveState('error')
      }).finally(() => pendingSaves.current.delete(id))
    }, 300))
  }

  const createProject = () => {
    const now = Date.now()
    const project: ProjectDocument = { id: createId(), title: 'Untitled project', description: '', bodyHtml: '<p><br></p>', assets: [], createdAt: now, updatedAt: now }
    const next = [project, ...projectsRef.current]
    projectsRef.current = next
    setProjects(next)
    setActiveId(project.id)
    setSaveState('saving')
    writeProject(project).then(() => setSaveState('saved')).catch((error) => {
      setStorageError(error instanceof Error ? error.message : 'Could not save this project.')
      setSaveState('error')
    })
  }

  const deleteProject = async (project: ProjectDocument) => {
    if (!window.confirm(`Delete “${project.title}” and its attachments from this device?`)) return
    const pending = pendingSaves.current.get(project.id)
    if (pending) clearTimeout(pending)
    pendingSaves.current.delete(project.id)
    const next = projectsRef.current.filter((item) => item.id !== project.id)
    projectsRef.current = next
    setProjects(next)
    setActiveId(next[0]?.id ?? null)
    try { await removeProject(project.id); setSaveState('saved') }
    catch (error) { setStorageError(error instanceof Error ? error.message : 'Could not delete this project.'); setSaveState('error') }
  }

  const addFiles = async (event: ChangeEvent<HTMLInputElement>, kind: 'image' | 'video' | 'ozoonotes') => {
    const project = activeProject
    const files = [...(event.currentTarget.files ?? [])]
    event.currentTarget.value = ''
    if (!project || !files.length) return
    const assets: ProjectAsset[] = files.map((file) => ({
      id: createId(),
      kind,
      name: file.name,
      type: file.type,
      blob: file.slice(0, file.size, file.type || 'application/octet-stream'),
      addedAt: Date.now(),
    }))
    updateProject(project.id, { assets: [...project.assets, ...assets] })
  }

  const addLink = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeProject) return
    let url: URL
    try { url = new URL(/^(https?:|mailto:)/i.test(linkUrl) ? linkUrl : `https://${linkUrl}`) }
    catch { setStorageError('Enter a valid web address or email link.'); return }
    if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) { setStorageError('Only web and email links can be added.'); return }
    const asset: ProjectAsset = { id: createId(), kind: 'link', name: linkName.trim() || url.hostname || url.href, url: url.href, addedAt: Date.now() }
    updateProject(activeProject.id, { assets: [...activeProject.assets, asset] })
    setLinkName('')
    setLinkUrl('')
    setLinkOpen(false)
    setStorageError('')
  }

  const removeAsset = (assetId: string) => {
    if (!activeProject) return
    updateProject(activeProject.id, { assets: activeProject.assets.filter((asset) => asset.id !== assetId) })
  }

  const onFileInput = (kind: 'image' | 'video' | 'ozoonotes') => (event: ChangeEvent<HTMLInputElement>) => { void addFiles(event, kind) }
  const exportHtml = (project: ProjectDocument) => {
    const safeTitle = project.title.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
    const safeDescription = project.description.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
    const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)
    const attachedItems = project.assets.length ? `<section><h2>Project materials</h2><ul>${project.assets.map((asset) => `<li>${asset.kind === 'link' && asset.url ? `<a href="${escape(asset.url)}">${escape(asset.name)}</a>` : escape(asset.name)} — ${escape(asset.kind)}</li>`).join('')}</ul></section>` : ''
    const appearance = project.appearance
    const allowedFonts = ['Arial', 'Georgia', 'Verdana', 'Times New Roman', 'Courier New']
    const font = allowedFonts.includes(appearance?.font ?? '') ? appearance?.font : 'Arial'
    const safeColor = (color: string | undefined, fallback: string) => color && /^#[0-9a-f]{6}$/i.test(color) ? color : fallback
    const paper = safeColor(appearance?.paper, '#fffefa'), accent = safeColor(appearance?.accent, '#8057d8')
    const size = Math.max(12, Math.min(20, Number(appearance?.size) || 14)), width = Math.max(580, Math.min(960, Number(appearance?.width) || 820))
    return `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>body{font:${size}px ${font},sans-serif;max-width:${width}px;margin:50px auto;padding:24px;background:${paper};line-height:1.7;color:#222}h1,h2,h3{color:${accent}}h1{margin-bottom:4px}table{border-collapse:collapse}td,th{border:1px solid #999;padding:6px}img{max-width:100%;height:auto}blockquote{border-left:3px solid ${accent};padding-left:12px;color:#555}@media print{body{margin:18mm auto}}</style></head><body><h1>${safeTitle}</h1><p>${safeDescription}</p><hr>${sanitizeHtml(project.bodyHtml)}${attachedItems}</body></html>`
  }
  const downloadWord = () => {
    if (!activeProject) return
    const filename = (activeProject.title || 'OzooNotes project').replace(/[\\/:*?"<>|]+/g, '-')
    const blob = new Blob([exportHtml(activeProject)], { type: 'application/msword;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}.doc`
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1500)
    setExportOpen(false)
  }
  const printPdf = () => {
    if (!activeProject) return
    const printWindow = window.open('', '_blank')
    if (!printWindow) { setStorageError('Allow pop-ups to prepare the PDF export.'); return }
    printWindow.document.open()
    printWindow.document.write(exportHtml(activeProject))
    printWindow.document.close()
    window.setTimeout(() => { printWindow.focus(); printWindow.print() }, 350)
    setExportOpen(false)
  }
  const saveLabel = saveState === 'loading' ? 'Loading projects…' : saveState === 'saving' ? 'Saving on this device…' : saveState === 'error' ? 'Save issue' : 'Saved on this device'

  return <main className="project-studio" data-theme={theme}>
    <header className="project-topbar">
      <button type="button" className="project-back" onClick={onBack}>← <span>Home</span></button>
      <div className="project-brand"><img className="project-brand-logo" src={`${import.meta.env.BASE_URL}ozoo-logo.png`} alt="OzooNotes" /><div><strong>Projects</strong><small>Your work, all in one place</small></div></div>
      <div className="project-top-actions"><span className={`project-save-state ${saveState}`}><i />{saveLabel}</span><button type="button" className="project-primary" onClick={createProject}>＋ New project</button></div>
    </header>
    <div className="project-layout">
      <aside className="project-sidebar">
        <div className="project-sidebar-head"><div><span className="project-eyebrow">YOUR LIBRARY</span><h2>My projects <b>{projects.length}</b></h2></div><button type="button" className="project-add-icon" title="New project" aria-label="New project" onClick={createProject}>＋</button></div>
        <label className="project-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a project…" /></label>
        <div className="project-list">
          {saveState === 'loading' && <p className="project-empty-note">Loading your projects…</p>}
          {saveState !== 'loading' && projects.filter((project) => project.title.toLowerCase().includes(search.toLowerCase()) || project.description.toLowerCase().includes(search.toLowerCase())).map((project) => <button type="button" key={project.id} className={`project-list-item ${project.id === activeId ? 'active' : ''}`} onClick={() => { setActiveId(project.id); setLinkOpen(false) }}><span className="project-list-glyph">▧</span><span className="project-list-copy"><strong>{project.title || 'Untitled project'}</strong><small>{project.assets.length} attachment{project.assets.length === 1 ? '' : 's'} · Edited {new Date(project.updatedAt).toLocaleDateString()}</small></span><span className="project-list-arrow">›</span></button>)}
          {saveState !== 'loading' && !projects.length && <div className="project-empty-note"><span>✦</span><strong>Your project space starts here.</strong><p>Create a project document for research, plans, reflections, or work you want to keep together.</p><button type="button" onClick={createProject}>＋ Create your first project</button></div>}
          {projects.length > 0 && !projects.some((project) => project.title.toLowerCase().includes(search.toLowerCase()) || project.description.toLowerCase().includes(search.toLowerCase())) && <p className="project-empty-note">No projects match that search.</p>}
        </div>
        <div className="project-local-note"><span>🔒</span><p>Private to this browser profile. Project content and uploads stay on this device.</p></div>
      </aside>
      <section className="project-main">
        {activeProject ? <>
          <div className="project-document-head">
            <div className="project-title-fields"><span className="project-eyebrow">PROJECT DOCUMENT</span><input className="project-title-input" aria-label="Project title" value={activeProject.title} onChange={(event) => updateProject(activeProject.id, { title: event.target.value })} placeholder="Give this project a title" /><input className="project-description-input" aria-label="Project summary" value={activeProject.description} onChange={(event) => updateProject(activeProject.id, { description: event.target.value })} placeholder="Add a short summary or goal…" /></div>
            <div className="project-document-actions"><button type="button" className="project-export-button" onClick={() => setExportOpen(true)} aria-haspopup="dialog">⇧ Export</button><button type="button" className="project-delete-button" onClick={() => void deleteProject(activeProject)} title="Delete this project">Delete project</button></div>
          </div>
          <RichTextEditor key={activeProject.id} project={activeProject} onChange={(bodyHtml) => updateProject(activeProject.id, { bodyHtml })} onAppearanceChange={(appearance) => updateProject(activeProject.id, { appearance })} />
          <section className="project-attachments">
            <div className="project-attachments-heading"><div><span className="project-eyebrow">PROJECT MATERIALS</span><h2>Bring it all together</h2><p>Add supporting media, references, and an OzooNotes board file.</p></div><span className="project-material-count">{activeProject.assets.length} item{activeProject.assets.length === 1 ? '' : 's'}</span></div>
            <div className="project-asset-actions">
              <button type="button" onClick={() => imageInput.current?.click()}>▧ Add images</button>
              <button type="button" onClick={() => videoInput.current?.click()}>▶ Add videos</button>
              <button type="button" onClick={() => setLinkOpen((open) => !open)}>↗ Add link</button>
              <button type="button" onClick={() => noteInput.current?.click()}>✎ Attach OzooNotes file</button>
              <input ref={imageInput} type="file" accept="image/*" multiple hidden onChange={onFileInput('image')} />
              <input ref={videoInput} type="file" accept="video/*" multiple hidden onChange={onFileInput('video')} />
              <input ref={noteInput} type="file" accept=".ozoonotes,.ozoo,.json,application/vnd.ozoonotes+json" multiple hidden onChange={onFileInput('ozoonotes')} />
            </div>
            {linkOpen && <form className="project-link-form" onSubmit={addLink}><label>Link name<input value={linkName} onChange={(event) => setLinkName(event.target.value)} placeholder="Reference or article" /></label><label>Web address<input required value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://…" /></label><button type="submit" className="project-primary">Add to project</button></form>}
            {activeProject.assets.length ? <div className="project-assets-grid">{activeProject.assets.map((asset) => <ProjectAssetCard key={asset.id} asset={asset} onDelete={() => removeAsset(asset.id)} />)}</div> : <div className="project-assets-empty"><span>🖼️</span><p>Images, videos, links, and OzooNotes files you add will appear here.</p></div>}
          </section>
        </> : <div className="project-welcome"><div className="project-welcome-mark">✦</div><span className="project-eyebrow">A SPACE FOR YOUR WORK</span><h1>Make room for the whole project.</h1><p>Write the story behind your work, collect media and links, and attach the OzooNotes board that goes with it.</p><button type="button" className="project-primary" onClick={createProject}>＋ Start a project</button><div className="project-welcome-chips"><span>✍️ Notes</span><span>🖼️ Images</span><span>🎬 Videos</span><span>🔗 Links</span><span>📄 OzooNotes boards</span></div></div>}
      </section>
    </div>
    {exportOpen && activeProject && <div className="project-export-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setExportOpen(false) }}><section className="project-export-dialog" role="dialog" aria-modal="true" aria-labelledby="project-export-title"><button type="button" className="project-export-close" aria-label="Close export options" onClick={() => setExportOpen(false)}>×</button><span className="project-eyebrow">MAKE A COPY</span><h2 id="project-export-title">Export this project</h2><p>Your project stays saved and editable in OzooNotes. Choose a format only when you want to create a download.</p><button type="button" className="project-export-choice" onClick={printPdf}><span>PDF</span><strong>Print or save as PDF</strong><small>Opens your browser’s print dialog.</small></button><button type="button" className="project-export-choice" onClick={downloadWord}><span>DOC</span><strong>Download Word file</strong><small>Creates a Word-compatible .doc copy.</small></button></section></div>}
    {storageError && <div className="project-toast" role="status"><span>{storageError}</span><button type="button" aria-label="Dismiss" onClick={() => setStorageError('')}>×</button></div>}
  </main>
}

export default ProjectStudio

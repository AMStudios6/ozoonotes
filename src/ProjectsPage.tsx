import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent, type FormEvent } from 'react'
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

const safeTags = new Set(['P', 'DIV', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'BLOCKQUOTE', 'A'])
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

function RichTextEditor({ project, onChange }: { project: ProjectDocument; onChange: (bodyHtml: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null)
  const pendingSave = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = sanitizeHtml(project.bodyHtml)
    return () => { if (pendingSave.current) clearTimeout(pendingSave.current) }
  }, [project.id])
  const queueSave = () => {
    if (pendingSave.current) clearTimeout(pendingSave.current)
    pendingSave.current = setTimeout(() => {
      if (editorRef.current) onChange(sanitizeHtml(editorRef.current.innerHTML))
      pendingSave.current = null
    }, 450)
  }
  const runFormat = (command: string, value?: string, event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault()
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    queueSave()
  }
  const addInlineLink = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const link = window.prompt('Paste a web address or email link')
    if (!link) { editorRef.current?.focus(); return }
    const normalized = /^(https?:|mailto:)/i.test(link) ? link : `https://${link}`
    runFormat('createLink', normalized)
  }
  return <div className="project-editor-wrap">
    <div className="project-format-toolbar" role="toolbar" aria-label="Document formatting">
      <button type="button" title="Bold" aria-label="Bold" onMouseDown={(event) => runFormat('bold', undefined, event)}><b>B</b></button>
      <button type="button" title="Italic" aria-label="Italic" onMouseDown={(event) => runFormat('italic', undefined, event)}><i>I</i></button>
      <button type="button" title="Underline" aria-label="Underline" onMouseDown={(event) => runFormat('underline', undefined, event)}><u>U</u></button>
      <span className="project-format-divider" />
      <button type="button" title="Bulleted list" aria-label="Bulleted list" onMouseDown={(event) => runFormat('insertUnorderedList', undefined, event)}>• List</button>
      <button type="button" title="Numbered list" aria-label="Numbered list" onMouseDown={(event) => runFormat('insertOrderedList', undefined, event)}>1. List</button>
      <button type="button" title="Heading" aria-label="Heading" onMouseDown={(event) => runFormat('formatBlock', 'h2', event)}>H₂</button>
      <button type="button" title="Quote" aria-label="Quote" onMouseDown={(event) => runFormat('formatBlock', 'blockquote', event)}>❝</button>
      <button type="button" title="Add link to selected text" aria-label="Add link to selected text" onMouseDown={addInlineLink}>↗ Link</button>
    </div>
    <div
      ref={editorRef}
      className="project-rich-editor"
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={`Write in ${project.title}`}
      aria-multiline="true"
      data-placeholder="Start writing your project notes… Add headings, explanations, plans, and reflections."
      onInput={queueSave}
      onBlur={() => {
        if (pendingSave.current) clearTimeout(pendingSave.current)
        if (editorRef.current) onChange(sanitizeHtml(editorRef.current.innerHTML))
        pendingSave.current = null
      }}
    />
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
  const saveLabel = saveState === 'loading' ? 'Loading projects…' : saveState === 'saving' ? 'Saving on this device…' : saveState === 'error' ? 'Save issue' : 'Saved on this device'

  return <main className="project-studio" data-theme={theme}>
    <header className="project-topbar">
      <button type="button" className="project-back" onClick={onBack}>← <span>Home</span></button>
      <div className="project-brand"><span className="project-brand-mark">✦</span><div><strong>Projects</strong><small>Your work, all in one place</small></div></div>
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
            <button type="button" className="project-delete-button" onClick={() => void deleteProject(activeProject)} title="Delete this project">Delete project</button>
          </div>
          <RichTextEditor key={activeProject.id} project={activeProject} onChange={(bodyHtml) => updateProject(activeProject.id, { bodyHtml })} />
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
    {storageError && <div className="project-toast" role="status"><span>{storageError}</span><button type="button" aria-label="Dismiss" onClick={() => setStorageError('')}>×</button></div>}
  </main>
}

export default ProjectStudio

import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import './RoadmapsPage.css'

type BlockKind = 'step' | 'text' | 'image' | 'link' | 'video' | 'map'
type MapShape = 'rounded' | 'circle' | 'diamond' | 'pill' | 'hexagon'
type MapNode = { id: string; label: string; description: string; shape: MapShape; color: string; x: number; y: number }
type MapConnection = { id: string; from: string; to: string }
type RoadmapBlock = { id: string; kind: BlockKind; title?: string; body?: string; url?: string; mediaType?: string; nodes?: MapNode[]; connections?: MapConnection[] }
type Roadmap = { id: number; title: string; summary: string; category: string; tags: string[]; author: string; createdAt: string; updatedAt: string; isOwner: boolean; content: RoadmapBlock[]; nextUpdateAt: string | null }
type RoadmapCard = Omit<Roadmap, 'content' | 'nextUpdateAt'>
type RoadmapDraft = Pick<Roadmap, 'title' | 'summary' | 'category' | 'tags' | 'content'>
const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE || 'https://api.ozoonotes.com')
const blockNames: Record<BlockKind, string> = { step: 'Learning step', text: 'Text section', image: 'Image', link: 'Useful link', video: 'Video link', map: 'Concept map' }
const mapColors = ['#ffe49b', '#b8d8ff', '#baf0d1', '#d9c3ff', '#ffc4cd', '#ffd0a3', '#aee8e8', '#eeeeef']
const newBlock = (kind: BlockKind): RoadmapBlock => kind === 'map'
  ? { id: crypto.randomUUID(), kind, title: 'Concept map', nodes: [{ id: crypto.randomUUID(), label: 'Learning goal', description: 'The main idea or outcome for this roadmap.', shape: 'rounded', color: '#ffe49b', x: 500, y: 105 }, { id: crypto.randomUUID(), label: 'First concept', description: 'A foundational idea to explore first.', shape: 'rounded', color: '#b8d8ff', x: 285, y: 335 }, { id: crypto.randomUUID(), label: 'Next concept', description: 'Build on the first idea here.', shape: 'rounded', color: '#baf0d1', x: 715, y: 335 }], connections: [] }
  : { id: crypto.randomUUID(), kind, title: kind === 'step' ? 'New step' : '', body: '', url: '' }

function mapNodeStyle(node: MapNode) {
  return { left: `${node.x / 10}%`, top: `${node.y / 6}%`, '--map-node-color': node.color, '--map-node-shape': node.shape } as CSSProperties
}

function RoadmapMap({ block, editable, onChange }: { block: RoadmapBlock; editable: boolean; onChange?: (next: RoadmapBlock) => void }) {
  const nodes = block.nodes ?? []
  const connections = block.connections ?? []
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [connectMode, setConnectMode] = useState(false)
  const selected = nodes.find((node) => node.id === selectedNode) ?? null
  const updateNode = (id: string, patch: Partial<MapNode>) => onChange?.({ ...block, nodes: nodes.map((node) => node.id === id ? { ...node, ...patch } : node) })
  const moveNode = (id: string, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!editable || connectMode) return
    const bounds = event.currentTarget.parentElement?.getBoundingClientRect()
    if (!bounds) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (pointer: PointerEvent) => updateNode(id, { x: Math.max(90, Math.min(910, (pointer.clientX - bounds.left) / bounds.width * 1000)), y: Math.max(50, Math.min(550, (pointer.clientY - bounds.top) / bounds.height * 600)) })
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop, { once: true })
  }
  const addNode = () => {
    const node: MapNode = { id: crypto.randomUUID(), label: 'New idea', description: '', shape: 'rounded', color: mapColors[nodes.length % mapColors.length], x: 180 + Math.random() * 640, y: 180 + Math.random() * 280 }
    onChange?.({ ...block, nodes: [...nodes, node] })
    setSelectedNode(node.id)
  }
  const chooseNode = (id: string) => {
    if (connectMode && selectedNode && selectedNode !== id) {
      if (!connections.some((connection) => (connection.from === selectedNode && connection.to === id) || (connection.from === id && connection.to === selectedNode))) onChange?.({ ...block, connections: [...connections, { id: crypto.randomUUID(), from: selectedNode, to: id }] })
      setConnectMode(false)
      setSelectedNode(id)
      return
    }
    setSelectedNode(id)
  }
  return <div className={`roadmap-map-wrap ${editable ? 'is-editable' : ''}`}>
    {editable && <div className="roadmap-map-toolbar"><button type="button" onClick={addNode}>＋ Add object</button><button type="button" className={connectMode ? 'is-active' : ''} onClick={() => { setConnectMode((value) => !value); setSelectedNode(null) }}>{connectMode ? 'Choose another object…' : '↗ Connect objects'}</button><span>{connectMode ? 'Select two objects to link them.' : 'Drag objects to arrange your map.'}</span></div>}
    <div className="roadmap-map-canvas" aria-label="Roadmap concept map">
      <svg className="roadmap-map-lines" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">{connections.map((connection) => { const from = nodes.find((node) => node.id === connection.from); const to = nodes.find((node) => node.id === connection.to); return from && to ? <line key={connection.id} x1={from.x} y1={from.y} x2={to.x} y2={to.y} /> : null })}</svg>
      {nodes.map((node) => <button type="button" key={node.id} className={`roadmap-map-node shape-${node.shape} ${selectedNode === node.id ? 'is-selected' : ''} ${connectMode ? 'connect-ready' : ''}`} style={mapNodeStyle(node)} onPointerDown={(event) => moveNode(node.id, event)} onClick={() => chooseNode(node.id)} title={node.description || node.label}>{node.label}</button>)}
    </div>
    {!editable && selected && <div className="roadmap-map-description"><strong>{selected.label}</strong><p>{selected.description || 'No extra notes for this idea.'}</p></div>}
    {editable && selected && <div className="roadmap-node-settings"><div className="roadmap-node-fields"><label>Object label<input maxLength={40} value={selected.label} onChange={(event) => updateNode(selected.id, { label: event.target.value })} /></label><label>What does it represent?<textarea maxLength={500} rows={2} value={selected.description} onChange={(event) => updateNode(selected.id, { description: event.target.value })} placeholder="Add context or learning notes for this object." /></label><label>Shape<select value={selected.shape} onChange={(event) => updateNode(selected.id, { shape: event.target.value as MapShape })}><option value="rounded">Rounded rectangle</option><option value="circle">Circle</option><option value="diamond">Diamond</option><option value="pill">Pill</option><option value="hexagon">Hexagon</option></select></label></div><div className="roadmap-map-colors" aria-label="Object color">{mapColors.map((color) => <button type="button" key={color} aria-label={`Set object color ${color}`} aria-pressed={selected.color === color} style={{ backgroundColor: color }} onClick={() => updateNode(selected.id, { color })} />)}</div><div className="roadmap-node-actions"><button type="button" onClick={() => { onChange?.({ ...block, nodes: nodes.filter((node) => node.id !== selected.id), connections: connections.filter((connection) => connection.from !== selected.id && connection.to !== selected.id) }); setSelectedNode(null) }}>Remove object</button></div></div>}
    {editable && connections.length > 0 && <div className="roadmap-map-connection-list"><span>CONNECTIONS</span>{connections.map((connection) => <button type="button" key={connection.id} onClick={() => onChange?.({ ...block, connections: connections.filter((item) => item.id !== connection.id) })}>{nodes.find((node) => node.id === connection.from)?.label ?? 'Object'} ↔ {nodes.find((node) => node.id === connection.to)?.label ?? 'Object'} <b>×</b></button>)}</div>}
  </div>
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const data = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`)
  return data
}

function RoadmapBlockView({ block, index }: { block: RoadmapBlock; index: number }) {
  if (block.kind === 'map') return <section className="roadmap-map-block"><h3>{block.title || 'Concept map'}</h3><p>Explore the ideas and how they connect. Select an object to read its notes.</p><RoadmapMap block={block} editable={false} /></section>
  if (block.kind === 'image') return <figure className="roadmap-image-block"><img src={block.url} alt={block.title || `Roadmap illustration ${index + 1}`} /><figcaption>{block.title}</figcaption></figure>
  if (block.kind === 'link' || block.kind === 'video') return <a className="roadmap-link-block" href={block.url} target="_blank" rel="noreferrer"><span aria-hidden="true">{block.kind === 'video' ? '▶' : '↗'}</span><span><strong>{block.title || block.url}</strong><small>{block.url}</small></span></a>
  return <section className={`roadmap-content-block roadmap-block-${block.kind}`}>{block.kind === 'step' && <span className="roadmap-step-number">{index + 1}</span>}<div>{block.title && <h3>{block.title}</h3>}<p>{block.body}</p></div></section>
}

export default function RoadmapsPage({ theme, user, onBack, onSignIn }: { theme: string; user: { username: string } | null; onBack: () => void; onSignIn: () => void }) {
  const [roadmaps, setRoadmaps] = useState<RoadmapCard[]>([])
  const [allCategories, setAllCategories] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All topics')
  const [selected, setSelected] = useState<Roadmap | null>(null)
  const [draft, setDraft] = useState<RoadmapDraft>({ title: '', summary: '', category: 'General', tags: [], content: [newBlock('step')] })
  const [tagDraft, setTagDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      if (categoryFilter !== 'All topics') params.set('category', categoryFilter)
      const result = await request<{ roadmaps: RoadmapCard[]; categories: string[] }>(`/api/roadmaps${params.size ? `?${params}` : ''}`)
      setRoadmaps(result.roadmaps)
      setAllCategories(result.categories)
      setError('')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load roadmaps.') }
    finally { setLoading(false) }
  }
  useEffect(() => { const timer = window.setTimeout(() => { void refresh() }, 220); return () => window.clearTimeout(timer) }, [search, categoryFilter])
  const categories = useMemo(() => ['All topics', ...allCategories], [allCategories])
  const openRoadmap = async (id: number) => {
    setError(''); setNotice('')
    try { const result = await request<{ roadmap: Roadmap }>(`/api/roadmaps/${id}`); setSelected(result.roadmap); setEditing(false); setCreateOpen(false) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open that roadmap.') }
  }
  const startCreate = () => {
    if (!user) { onSignIn(); return }
    setSelected(null); setEditing(true); setCreateOpen(true); setError(''); setNotice('')
    setTagDraft('')
    setDraft({ title: '', summary: '', category: 'General', tags: [], content: [newBlock('step')] })
  }
  const editRoadmap = () => {
    if (!selected) return
    setDraft({ title: selected.title, summary: selected.summary, category: selected.category, tags: selected.tags, content: selected.content })
    setTagDraft(selected.tags.join(', ')); setEditing(true); setCreateOpen(false); setError(''); setNotice('')
  }
  const setBlock = (index: number, patch: Partial<RoadmapBlock>) => setDraft((current) => ({ ...current, content: current.content.map((block, blockIndex) => blockIndex === index ? { ...block, ...patch } : block) }))
  const addTag = () => {
    const tags = tagDraft.split(',').map((tag) => tag.trim()).filter(Boolean).slice(0, 12)
    setDraft((current) => ({ ...current, tags: [...new Set(tags)] }))
  }
  const saveRoadmap = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) { onSignIn(); return }
    setSaving(true); setError(''); setNotice('')
    try {
      const body = JSON.stringify(draft)
      const result = await request<{ roadmap: Roadmap }>(createOpen ? '/api/roadmaps' : `/api/roadmaps/${selected?.id}`, { method: createOpen ? 'POST' : 'PUT', body })
      setSelected(result.roadmap); setEditing(false); setCreateOpen(false); setNotice(createOpen ? 'Roadmap published for learners everywhere.' : 'Roadmap updated.')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save this roadmap.') }
    finally { setSaving(false) }
  }
  const loadImage = (index: number, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/') || file.size > 4 * 1024 * 1024) { setError('Choose an image under 4 MB.'); event.target.value = ''; return }
    const reader = new FileReader()
    reader.onload = () => setBlock(index, { url: String(reader.result), mediaType: file.type, title: file.name })
    reader.readAsDataURL(file)
  }
  const moveBlock = (index: number, offset: number) => setDraft((current) => {
    const content = [...current.content]
    const target = index + offset
    if (target < 0 || target >= content.length) return current
    ;[content[index], content[target]] = [content[target], content[index]]
    return { ...current, content }
  })

  return <main className="roadmap-studio" data-theme={theme}>
    <header className="roadmap-topbar"><button type="button" className="roadmap-back" onClick={onBack}>← <span>Dashboard</span></button><a className="roadmap-brand" href="/?page=dashboard" onClick={(event) => { event.preventDefault(); onBack() }}><span className="roadmap-brand-mark">⌁</span><span><strong>Roadmaps</strong><small>Learn together, step by step</small></span></a><div className="roadmap-top-right">{user ? <span className="roadmap-user">Signed in as <b>@{user.username}</b></span> : <button className="roadmap-signin" onClick={onSignIn}>Sign in to publish</button>}<button className="roadmap-primary" onClick={startCreate}>＋ Create roadmap</button></div></header>
    <div className="roadmap-layout">
      <aside className="roadmap-sidebar"><div className="roadmap-sidebar-heading"><span className="roadmap-eyebrow">COMMUNITY LIBRARY</span><h1>Find a path<br />to what’s next.</h1><p>Explore learning plans shared by people using OzooNotes around the world.</p></div><label className="roadmap-search"><span aria-hidden="true">⌕</span><input aria-label="Search roadmaps" placeholder="Search topics, skills, tags…" value={search} onChange={(event) => setSearch(event.target.value)} /><kbd>/</kbd></label><div className="roadmap-filter-heading">TOPICS</div><div className="roadmap-categories">{categories.map((category) => <button type="button" key={category} className={categoryFilter === category ? 'active' : ''} onClick={() => setCategoryFilter(category)}>{category}<span>{category === 'All topics' ? roadmaps.length : roadmaps.filter((roadmap) => roadmap.category === category).length}</span></button>)}</div><div className="roadmap-sidebar-note"><span>✦</span><p>Have a path that helped you learn? Share it so someone else can get started.</p><button onClick={startCreate}>Make a roadmap <b>→</b></button></div></aside>
      <section className="roadmap-main">
        {selected && !editing ? <>
          <button className="roadmap-small-back" onClick={() => { setSelected(null); setNotice('') }}>← All roadmaps</button>
          <div className="roadmap-detail-head"><div><span className="roadmap-category-pill">{selected.category}</span><h2>{selected.title}</h2><p>{selected.summary}</p><div className="roadmap-byline">Shared by <b>@{selected.author}</b><span>·</span> Updated {new Date(selected.updatedAt).toLocaleDateString()}</div></div>{selected.isOwner && <button className="roadmap-secondary" disabled={Boolean(selected.nextUpdateAt && Date.parse(selected.nextUpdateAt) > Date.now())} onClick={editRoadmap} title={selected.nextUpdateAt ? `Next update available ${new Date(selected.nextUpdateAt).toLocaleDateString()}` : ''}>Edit roadmap</button>}</div>
          {selected.tags.length > 0 && <div className="roadmap-tags">{selected.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
          <div className="roadmap-content">{selected.content.map((block, index) => <RoadmapBlockView key={block.id} block={block} index={index} />)}</div>
          {selected.isOwner && selected.nextUpdateAt && <p className="roadmap-edit-hint">You can make your next update {new Date(selected.nextUpdateAt).toLocaleDateString()}.</p>}
        </> : editing ? <>
          <button className="roadmap-small-back" onClick={() => { setEditing(false); setCreateOpen(false); setSelected(null) }}>← Browse roadmaps</button>
          <div className="roadmap-editor-heading"><span className="roadmap-eyebrow">{createOpen ? 'COMMUNITY CONTRIBUTION' : 'ROADMAP EDITOR'}</span><h2>{createOpen ? 'Build a roadmap to share.' : 'Update your roadmap.'}</h2><p>Lay out the learning journey in your own order. Add explanations, steps, images, and useful links.</p></div>
          <form className="roadmap-editor" onSubmit={(event) => { void saveRoadmap(event) }}>
            <div className="roadmap-form-grid"><label>Roadmap title<input required maxLength={120} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Learn Python from the ground up" /></label><label>Topic<input maxLength={60} value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} placeholder="Programming, Biology, Design…" /></label></div>
            <label>What will learners be able to do?<textarea required maxLength={500} rows={2} value={draft.summary} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} placeholder="A short overview of who this is for and where it leads." /></label>
            <label>Search tags<input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} onBlur={addTag} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addTag() } }} placeholder="beginner, self-study, algebra (comma separated)" /></label>
            <div className="roadmap-blocks-heading"><div><span className="roadmap-eyebrow">YOUR LEARNING PATH</span><strong>Arrange the content in any format</strong></div><div className="roadmap-add-blocks">{(['step', 'text', 'image', 'link', 'video', 'map'] as BlockKind[]).map((kind) => <button type="button" key={kind} onClick={() => setDraft((current) => ({ ...current, content: [...current.content, newBlock(kind)] }))}>＋ {blockNames[kind]}</button>)}</div></div>
            <div className="roadmap-block-editor-list">{draft.content.map((block, index) => <article className="roadmap-block-editor" key={block.id}><div className="roadmap-block-editor-top"><span>{block.kind === 'step' ? `STEP ${index + 1}` : blockNames[block.kind].toUpperCase()}</span><div><button type="button" aria-label="Move block up" disabled={index === 0} onClick={() => moveBlock(index, -1)}>↑</button><button type="button" aria-label="Move block down" disabled={index === draft.content.length - 1} onClick={() => moveBlock(index, 1)}>↓</button><button type="button" aria-label="Remove block" onClick={() => setDraft((current) => ({ ...current, content: current.content.filter((item) => item.id !== block.id) }))}>×</button></div></div>
              {(block.kind === 'step' || block.kind === 'text' || block.kind === 'image' || block.kind === 'link' || block.kind === 'video') && <label>{block.kind === 'step' ? 'Step title' : block.kind === 'text' ? 'Section heading (optional)' : block.kind === 'image' ? 'Image caption' : block.kind === 'link' ? 'Link title' : 'Video title'}<input value={block.title ?? ''} onChange={(event) => setBlock(index, { title: event.target.value })} placeholder={block.kind === 'step' ? 'What should learners do?' : 'Add a clear heading'} /></label>}
              {(block.kind === 'step' || block.kind === 'text') && <label>{block.kind === 'step' ? 'Instructions and notes' : 'Text'}<textarea rows={block.kind === 'step' ? 3 : 5} value={block.body ?? ''} onChange={(event) => setBlock(index, { body: event.target.value })} placeholder="Explain the idea, add examples, or describe the next action…" /></label>}
              {block.kind === 'image' && <div className="roadmap-image-input"><label className="roadmap-upload-image">＋ Upload image<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => loadImage(index, event)} /></label><span>PNG, JPG, WebP or GIF · up to 4 MB</span>{block.url && <img src={block.url} alt={block.title || 'Selected roadmap illustration'} />}</div>}
              {(block.kind === 'link' || block.kind === 'video') && <label>{block.kind === 'video' ? 'Video URL (YouTube or other link)' : 'Destination URL'}<input type="url" value={block.url ?? ''} onChange={(event) => setBlock(index, { url: event.target.value })} placeholder="https://…" /></label>}
              {block.kind === 'map' && <><label>Map title<input value={block.title ?? ''} onChange={(event) => setBlock(index, { title: event.target.value })} placeholder="Concept map" /></label><RoadmapMap block={block} editable onChange={(next) => setBlock(index, next)} /></>}
            </article>)}</div>
            {error && <p className="roadmap-alert" role="alert">{error}</p>}{notice && <p className="roadmap-success" role="status">{notice}</p>}
            <div className="roadmap-editor-actions"><button type="button" className="roadmap-secondary" onClick={() => { setEditing(false); setCreateOpen(false) }}>Cancel</button><button className="roadmap-primary" disabled={saving || draft.content.length === 0}>{saving ? 'Publishing…' : createOpen ? 'Publish roadmap' : 'Save update'}</button></div>
            {createOpen && <p className="roadmap-publish-note">Publishing makes this roadmap discoverable to everyone. You can update it once every 7 days.</p>}
          </form>
        </> : <>
          <div className="roadmap-list-heading"><div><span className="roadmap-eyebrow">OPEN LEARNING PATHS</span><h2>{search ? 'Search results' : 'Community roadmaps'}</h2><p>{roadmaps.length} {roadmaps.length === 1 ? 'roadmap' : 'roadmaps'} shared by learners around the world</p></div><button className="roadmap-primary" onClick={startCreate}>＋ Share your roadmap</button></div>
          {error && <p className="roadmap-alert" role="alert">{error}</p>}
          {loading ? <div className="roadmap-empty"><span className="roadmap-spinner" />Finding roadmaps…</div> : roadmaps.length ? <div className="roadmap-card-grid">{roadmaps.map((roadmap) => <button type="button" className="roadmap-card" key={roadmap.id} onClick={() => { void openRoadmap(roadmap.id) }}><div className="roadmap-card-top"><span className="roadmap-category-pill">{roadmap.category}</span><span className="roadmap-card-arrow">↗</span></div><h3>{roadmap.title}</h3><p>{roadmap.summary}</p><div className="roadmap-card-tags">{roadmap.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div><div className="roadmap-card-footer"><span>By <b>@{roadmap.author}</b></span><small>Updated {new Date(roadmap.updatedAt).toLocaleDateString()}</small></div></button>)}</div> : <div className="roadmap-empty"><span>⌁</span><h3>{search ? 'No matching roadmaps yet.' : 'The first path starts here.'}</h3><p>{search ? 'Try a broader search or another topic.' : 'Share a learning route you wish you had when you started.'}</p><button className="roadmap-primary" onClick={startCreate}>＋ Create the first roadmap</button></div>}
        </>}
      </section>
    </div>
  </main>
}

import { useEffect, useMemo, useState, type FormEvent } from 'react'
import './ResourcesPage.css'

type VideoItem = { id: string; title: string; description: string; kind: 'link' | 'upload'; url?: string; mediaType?: string; filename?: string; data?: string }
type Collection = { id: number; title: string; summary: string; category: string; tags: string[]; videos: VideoItem[]; author: string; createdAt: string; updatedAt: string; isOwner: boolean }
type Draft = Pick<Collection, 'title' | 'summary' | 'category' | 'tags' | 'videos'>
const API_BASE = import.meta.env.DEV ? '' : (import.meta.env.VITE_API_BASE || 'https://api.ozoonotes.com')
const emptyDraft = (): Draft => ({ title: '', summary: '', category: 'Learning', tags: [], videos: [] })

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers } })
  const data = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status})`)
  return data
}

function fileData(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('Could not read that video.'))
    reader.readAsDataURL(file)
  })
}

function embedUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.hostname === 'youtu.be') return `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`
    if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
      const id = url.searchParams.get('v') ?? url.pathname.match(/\/(?:embed|shorts)\/([^/?]+)/)?.[1]
      return id ? `https://www.youtube-nocookie.com/embed/${id}` : null
    }
    if (url.hostname === 'vimeo.com' || url.hostname === 'www.vimeo.com') {
      const id = url.pathname.match(/\/(\d+)/)?.[1]
      return id ? `https://player.vimeo.com/video/${id}` : null
    }
  } catch {}
  return null
}

function VideoPlayer({ collection, video }: { collection: Collection; video: VideoItem }) {
  if (video.kind === 'upload') return <video controls preload="metadata" src={`${API_BASE}/api/resources/${collection.id}/videos/${video.id}`} />
  const embed = video.url ? embedUrl(video.url) : null
  if (embed) return <iframe src={embed} title={video.title} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen />
  if (video.url && /\.(mp4|webm|ogg)(?:$|\?)/i.test(video.url)) return <video controls preload="metadata" src={video.url} />
  return <a className="resource-watch-link" href={video.url} target="_blank" rel="noreferrer"><span>▶</span><strong>Watch this video</strong><small>Opens in a new tab</small></a>
}

export default function ResourcesPage({ theme, user, onBack, onSignIn }: { theme: string; user: { username: string } | null; onBack: () => void; onSignIn: () => void }) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selected, setSelected] = useState<Collection | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editing, setEditing] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All topics')
  const [urlDraft, setUrlDraft] = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      if (category !== 'All topics') params.set('category', category)
      const result = await request<{ collections: Collection[]; categories: string[] }>(`/api/resources${params.size ? `?${params}` : ''}`)
      setCollections(result.collections); setCategories(['All topics', ...result.categories.filter((item) => item !== 'All topics')])
      if (selected) setSelected(result.collections.find((item) => item.id === selected.id) ?? null)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load shared resources.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [search, category])
  useEffect(() => {
    const id = Number(new URLSearchParams(window.location.search).get('collection'))
    if (!Number.isSafeInteger(id) || id < 1) return
    request<{ collection: Collection }>(`/api/resources/${id}`).then((result) => setSelected(result.collection)).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not open that collection.'))
  }, [])
  useEffect(() => { if (!error) return; const timer = window.setTimeout(() => setError(''), 6000); return () => window.clearTimeout(timer) }, [error])

  const videoCount = useMemo(() => collections.reduce((sum, item) => sum + item.videos.length, 0), [collections])
  const beginCreate = () => { if (!user) { onSignIn(); return }; setSelected(null); setDraft(emptyDraft()); setEditId(null); setEditing(true); setError(''); setNotice('') }
  const beginEdit = (item: Collection) => { setDraft({ title: item.title, summary: item.summary, category: item.category, tags: item.tags, videos: item.videos }); setEditId(item.id); setEditing(true); setError(''); setNotice('') }
  const addLink = () => {
    const url = urlDraft.trim()
    if (!url) return
    try { const parsed = new URL(url); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); setDraft((current) => ({ ...current, videos: [...current.videos, { id: crypto.randomUUID(), title: titleDraft.trim() || 'Video link', description: '', kind: 'link', url: parsed.toString() }] })); setUrlDraft(''); setTitleDraft('') }
    catch { setError('Paste a complete video link starting with https://') }
  }
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const allowed = ['video/mp4', 'video/webm', 'video/ogg']
    const currentBytes = draft.videos.reduce((total, item) => total + (item.data ? Math.floor(item.data.length * .75) : 0), 0)
    let newBytes = currentBytes
    try {
      const additions: VideoItem[] = []
      for (const file of Array.from(files)) {
        if (!allowed.includes(file.type)) throw new Error('Choose MP4, WebM, or Ogg video files.')
        if (file.size > 15 * 1024 * 1024) throw new Error(`${file.name} is over the 15 MB per-video limit.`)
        newBytes += file.size
        if (newBytes > 25 * 1024 * 1024) throw new Error('Uploads in one collection must total under 25 MB.')
        additions.push({ id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, ''), description: '', kind: 'upload', mediaType: file.type, filename: file.name, data: await fileData(file) })
      }
      setDraft((current) => ({ ...current, videos: [...current.videos, ...additions] }))
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not read that video.') }
  }
  const saveCollection = async (event: FormEvent) => {
    event.preventDefault()
    if (!user) { onSignIn(); return }
    if (!draft.videos.length) { setError('Add at least one video before publishing.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const payload = JSON.stringify(draft)
      const result = await request<{ collection: Collection }>(editId ? `/api/resources/${editId}` : '/api/resources', { method: editId ? 'PUT' : 'POST', body: payload })
      setSelected(result.collection); setEditing(false); setEditId(null); setNotice(editId ? 'Collection updated.' : 'Collection shared with everyone.')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not publish this collection.') }
    finally { setBusy(false) }
  }
  const deleteCollection = async (item: Collection) => {
    if (!window.confirm(`Delete “${item.title}” and its uploaded videos?`)) return
    try { await request(`/api/resources/${item.id}`, { method: 'DELETE' }); setSelected(null); setNotice('Collection deleted.'); await refresh() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not delete this collection.') }
  }

  return <main className="resources-page" data-theme={theme}>
    <header className="resources-topbar"><button type="button" className="resources-back" onClick={() => { const url = new URL(window.location.href); url.searchParams.delete('collection'); window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`); onBack() }}>← <span>Dashboard</span></button><a className="resources-brand" href="/?page=dashboard" onClick={(event) => { event.preventDefault(); const url = new URL(window.location.href); url.searchParams.delete('collection'); window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`); onBack() }}><span className="resources-brand-mark">▶</span><span><strong>Resources</strong><small>Learn from the community</small></span></a><div className="resources-top-actions">{user ? <span className="resources-user">Signed in as <b>@{user.username}</b></span> : <button className="resources-signin" type="button" onClick={onSignIn}>Sign in to publish</button>}<button className="resources-primary" type="button" onClick={beginCreate}>＋ Create collection</button></div></header>
    <div className="resources-layout"><aside className="resources-sidebar"><span className="resources-eyebrow">COMMUNITY LIBRARY</span><h1>Videos worth<br />passing along.</h1><p>Find helpful lessons, tutorials, talks, and playlists shared by OzooNotes learners.</p><label className="resources-search"><span>⌕</span><input aria-label="Search video collections" placeholder="Search topics and videos…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><span className="resources-filter-title">TOPICS</span><div className="resources-categories">{categories.map((item) => <button type="button" key={item} className={category === item ? 'active' : ''} onClick={() => setCategory(item)}>{item}<span>{item === 'All topics' ? collections.length : collections.filter((collection) => collection.category === item).length}</span></button>)}</div><div className="resources-sidebar-card"><span>✦</span><p>Found a video that helped you understand something? Make it easier for someone else to find.</p><button type="button" onClick={beginCreate}>Share a collection <b>→</b></button></div></aside>
      <section className="resources-main">{selected && !editing ? <><button className="resources-small-back" type="button" onClick={() => { setSelected(null); setNotice('') }}>← All collections</button><div className="resources-detail-heading"><div><span className="resources-topic-pill">{selected.category}</span><h2>{selected.title}</h2><p>{selected.summary}</p><div className="resources-byline">Shared by <b>@{selected.author}</b><span>·</span> {selected.videos.length} videos</div></div><div className="resources-detail-actions">{selected.isOwner && <><button type="button" onClick={() => beginEdit(selected)}>Edit collection</button><button type="button" className="danger" onClick={() => void deleteCollection(selected)}>Delete</button></>}<button type="button" onClick={() => { void navigator.clipboard?.writeText(`${window.location.origin}/?page=resources&collection=${selected.id}`); setNotice('Collection link copied.') }}>Share link</button></div></div>{selected.tags.length > 0 && <div className="resources-tags">{selected.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}<div className="resources-video-list">{selected.videos.map((video, index) => <article className="resources-video-card" key={video.id}><div className="resources-video-player"><VideoPlayer collection={selected} video={video} /></div><div className="resources-video-copy"><span>VIDEO {String(index + 1).padStart(2, '0')}</span><h3>{video.title}</h3>{video.description && <p>{video.description}</p>}</div></article>)}</div></> : editing ? <><button className="resources-small-back" type="button" onClick={() => { setEditing(false); setEditId(null); setSelected(null) }}>← Browse resources</button><div className="resources-editor-heading"><span className="resources-eyebrow">{editId ? 'COLLECTION EDITOR' : 'COMMUNITY CONTRIBUTION'}</span><h2>{editId ? 'Update your collection.' : 'Make a video collection.'}</h2><p>Group useful videos together and share your collection publicly with everyone.</p></div><form className="resources-editor" onSubmit={(event) => void saveCollection(event)}><div className="resources-form-grid"><label>Collection name<input required maxLength={120} value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="e.g. Algebra, made clearer" /></label><label>Topic<input maxLength={60} value={draft.category} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} placeholder="Math, science, art…" /></label></div><label>About this collection<textarea required maxLength={500} rows={3} value={draft.summary} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} placeholder="Who will find these videos helpful?" /></label><label>Search tags<input value={draft.tags.join(', ')} onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean).slice(0, 12) }))} placeholder="beginner, revision, tutorial (comma separated)" /></label><section className="resources-add-video"><div><strong>Add a video link</strong><small>YouTube, Vimeo, or a direct video URL</small></div><div className="resources-link-row"><input aria-label="Video title" value={titleDraft} onChange={(event) => setTitleDraft(event.target.value)} placeholder="Video title (optional)" /><input aria-label="Video URL" type="url" value={urlDraft} onChange={(event) => setUrlDraft(event.target.value)} placeholder="https://…" /><button type="button" onClick={addLink}>＋ Add link</button></div></section><label className="resources-upload"><input type="file" accept="video/mp4,video/webm,video/ogg" multiple onChange={(event) => { void addFiles(event.currentTarget.files); event.currentTarget.value = '' }} /><span>＋ Upload videos from your device</span><small>MP4, WebM, or Ogg · up to 15 MB each, 25 MB per collection</small></label><div className="resources-draft-videos">{draft.videos.map((video, index) => <article key={video.id}><span className="resources-draft-video-icon">{video.kind === 'upload' ? '▣' : '↗'}</span><label><small>VIDEO {index + 1} · {video.kind === 'upload' ? video.filename : 'LINK'}</small><input aria-label={`Video ${index + 1} title`} maxLength={140} value={video.title} onChange={(event) => setDraft((current) => ({ ...current, videos: current.videos.map((item) => item.id === video.id ? { ...item, title: event.target.value } : item) }))} /><textarea aria-label={`Video ${index + 1} note`} maxLength={500} rows={2} placeholder="Optional note" value={video.description} onChange={(event) => setDraft((current) => ({ ...current, videos: current.videos.map((item) => item.id === video.id ? { ...item, description: event.target.value } : item) }))} /></label><button type="button" aria-label={`Remove ${video.title}`} onClick={() => setDraft((current) => ({ ...current, videos: current.videos.filter((item) => item.id !== video.id) }))}>×</button></article>)}</div><div className="resources-editor-footer"><span>This collection will be public and searchable by everyone.</span><button type="button" onClick={() => { setEditing(false); setSelected(null) }}>Cancel</button><button type="submit" disabled={busy || !draft.videos.length}>{busy ? 'Publishing…' : editId ? 'Save changes' : 'Publish collection'}</button></div></form></> : <><div className="resources-list-heading"><div><span className="resources-eyebrow">OPEN LEARNING, SHARED</span><h2>Explore video collections</h2><p>Browse curated videos for classes, projects, and curious minds.</p></div><div className="resources-library-count"><strong>{collections.length}</strong><span>collections · {videoCount} videos</span></div></div>{loading ? <div className="resources-empty"><span className="resources-spinner" /><p>Loading the community library…</p></div> : collections.length ? <div className="resources-grid">{collections.map((item) => <button type="button" key={item.id} className="resources-collection-card" onClick={() => { setSelected(item); const url = new URL(window.location.href); url.searchParams.set('collection', String(item.id)); window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`) }}><div className="resources-card-art"><span>▶</span><small>{item.videos.length} {item.videos.length === 1 ? 'VIDEO' : 'VIDEOS'}</small><i /><i /><i /></div><div className="resources-card-meta"><span className="resources-topic-pill">{item.category}</span><span>BY @{item.author}</span></div><h3>{item.title}</h3><p>{item.summary}</p><div className="resources-card-footer">{item.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}<b>Open collection ↗</b></div></button>)}</div> : <div className="resources-empty"><span>▶</span><h3>{search || category !== 'All topics' ? 'No collections match' : 'The library is ready for its first collection'}</h3><p>{search || category !== 'All topics' ? 'Try another search or topic.' : 'Share a group of helpful videos so learners everywhere can find them.'}</p><button type="button" onClick={beginCreate}>＋ Create a collection</button></div>}</>}{error && <p className="resources-message error" role="alert">{error}</p>}{notice && <p className="resources-message" role="status">{notice}</p>}</section>
    </div>
  </main>
}

import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react'
import './StudentSpace.css'

type StudentProfile = { field: string; otherField: string; stage: string; otherStage: string; degree: string }
type StudyFolder = { id: string; parentId: string | null; name: string; kind: 'program' | 'year' | 'semester' | 'class' | 'subject' | 'custom' }
type StudyAttachment = { name: string; data: string; type: string }
type StudyNote = { id: string; parentId: string; title: string; body: string; images: { name: string; data: string }[]; files?: StudyAttachment[]; updatedAt: number }
const profileKey = 'ozoo:student-profile'
const foldersKey = 'ozoo:student-folders'
const notesKey = 'ozoo:student-notes'
const emptyProfile: StudentProfile = { field: 'Computer science', otherField: '', stage: 'High school', otherStage: '', degree: '' }

function readStorage<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback }
}
function readNotes(): StudyNote[] {
  const saved = readStorage<unknown>(notesKey, [])
  if (!Array.isArray(saved)) return []
  return saved.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object').map((item) => ({
    id: typeof item.id === 'string' ? item.id : newId(),
    parentId: typeof item.parentId === 'string' ? item.parentId : '',
    title: typeof item.title === 'string' && item.title.trim() ? item.title : 'Untitled note',
    body: typeof item.body === 'string' ? item.body : typeof item.content === 'string' ? item.content : '',
    images: Array.isArray(item.images) ? item.images.filter((image): image is { name: string; data: string } => Boolean(image) && typeof image === 'object' && typeof image.name === 'string' && typeof image.data === 'string') : [],
    files: Array.isArray(item.files) ? item.files.filter((file): file is StudyAttachment => Boolean(file) && typeof file === 'object' && typeof file.name === 'string' && typeof file.data === 'string').map((file) => ({ ...file, type: typeof file.type === 'string' ? file.type : 'application/octet-stream' })) : [],
    updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
  }))
}
function newId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}` }
function readFileData(file: File) { return new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read that file.')); reader.onerror = () => reject(new Error('Could not read that file.')); reader.readAsDataURL(file) }) }
async function compressImage(file: File): Promise<{ name: string; data: string }> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file.')
  const source = await readFileData(file)
  const image = new Image()
  image.src = source
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error(`Could not open ${file.name}.`)) })
  const scale = Math.min(1, 1400 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not prepare that image.')
  context.drawImage(image, 0, 0, canvas.width, canvas.height)
  return { name: file.name, data: canvas.toDataURL('image/jpeg', 0.78) }
}

export default function StudentSpace() {
  const [profile, setProfile] = useState<StudentProfile>(() => readStorage(profileKey, emptyProfile))
  const [folders, setFolders] = useState<StudyFolder[]>(() => readStorage(foldersKey, []))
  const [notes, setNotes] = useState<StudyNote[]>(readNotes)
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [folderDialog, setFolderDialog] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [folderKind, setFolderKind] = useState<StudyFolder['kind']>('program')
  const [noteDialog, setNoteDialog] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteBody, setNoteBody] = useState('')
  const [noteImages, setNoteImages] = useState<StudyNote['images']>([])
  const [noteFiles, setNoteFiles] = useState<StudyAttachment[]>([])
  const [message, setMessage] = useState('')

  useEffect(() => { try { localStorage.setItem(profileKey, JSON.stringify(profile)) } catch { setMessage('Could not save your profile in this browser.') } }, [profile])
  useEffect(() => { try { localStorage.setItem(foldersKey, JSON.stringify(folders)); setMessage('') } catch { setMessage('Browser storage is full. Remove some large images before adding more.') } }, [folders])
  useEffect(() => { try { localStorage.setItem(notesKey, JSON.stringify(notes)); setMessage('') } catch { setMessage('Browser storage is full. Remove some large images before adding more.') } }, [notes])

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) ?? null
  const childFolders = folders.filter((folder) => folder.parentId === selectedFolderId)
  const childNotes = notes.filter((note) => note.parentId === selectedFolderId)
  const breadcrumbs = useMemo(() => {
    const result: StudyFolder[] = []
    let cursor = selectedFolder
    while (cursor) { result.unshift(cursor); cursor = folders.find((folder) => folder.id === cursor?.parentId) ?? null }
    return result
  }, [folders, selectedFolder])

  const openNewFolder = (kind: StudyFolder['kind']) => { setFolderKind(kind); setFolderName(''); setFolderDialog(true) }
  const saveFolder = (event: FormEvent) => {
    event.preventDefault()
    const name = folderName.trim()
    if (!name) return
    const folder: StudyFolder = { id: newId(), parentId: folderKind === 'program' ? null : selectedFolderId, name, kind: folderKind }
    setFolders((current) => [...current, folder])
    setFolderDialog(false)
    if (folderKind === 'program') setSelectedFolderId(folder.id)
  }
  const openNewNote = (note?: StudyNote) => {
    if (note) setSelectedFolderId(note.parentId || null)
    setEditingNoteId(note?.id ?? null)
    setNoteTitle(note?.title ?? '')
    setNoteBody(note?.body ?? '')
    setNoteImages(note?.images ?? [])
    setNoteFiles(note?.files ?? [])
    setNoteDialog(true)
  }
  const saveNote = (event: FormEvent) => {
    event.preventDefault()
    const title = noteTitle.trim()
    if (!title || !selectedFolderId) return
    const note: StudyNote = { id: editingNoteId ?? newId(), parentId: selectedFolderId, title, body: noteBody.trim(), images: noteImages, files: noteFiles, updatedAt: Date.now() }
    setNotes((current) => editingNoteId ? current.map((item) => item.id === editingNoteId ? note : item) : [note, ...current])
    setNoteDialog(false)
  }
  const addImages = async (files: FileList | null) => {
    if (!files?.length) return
    try { const added = await Promise.all(Array.from(files).map(compressImage)); setNoteImages((current) => [...current, ...added]) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not add those images.') }
  }
  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return
    const added: StudyAttachment[] = []
    for (const file of Array.from(files)) {
      if (file.size > 1_500_000) { setMessage(`${file.name} is larger than 1.5 MB. Add a smaller file.`); continue }
      try { added.push({ name: file.name, data: await readFileData(file), type: file.type || 'application/octet-stream' }) }
      catch { setMessage(`Could not read ${file.name}. Try another file.`) }
    }
    if (added.length) setNoteFiles((current) => [...current, ...added])
  }
  const deleteNote = (id: string) => { setNotes((current) => current.filter((note) => note.id !== id)) }
  const renderFolderTree = (parentId: string | null, depth = 0): ReactNode => folders.filter((folder) => folder.parentId === parentId).map((folder) => <div className="study-tree-item" key={folder.id} style={{ '--depth': depth } as CSSProperties}><button className={selectedFolderId === folder.id ? 'selected' : ''} onClick={() => setSelectedFolderId(folder.id)}><span className="study-tree-icon">{folder.kind === 'subject' ? '▤' : folder.kind === 'program' ? '▣' : '▰'}</span><span>{folder.name}</span></button>{renderFolderTree(folder.id, depth + 1)}</div>)

  return <section className="student-space" aria-labelledby="student-space-title">
    <header className="student-space-header"><div><span>YOUR STUDY SPACE</span><h2 id="student-space-title">Organize your studies.</h2><p>Your profile, folders, notes, and images stay in this browser.</p></div><div className="study-profile-summary"><b>{profile.field === 'Other' ? profile.otherField || 'Student' : profile.field}</b><small>{profile.stage === 'Other' ? profile.otherStage || 'Study level' : profile.stage}{profile.degree ? ` · ${profile.degree}` : ''}</small></div></header>
    <div className="student-space-layout">
      <aside className="study-sidebar">
        <details className="study-profile" open><summary><span>Student profile</span><small>Edit</small></summary><div className="study-profile-fields">
          <label>Field<select value={profile.field} onChange={(event) => setProfile((current) => ({ ...current, field: event.target.value }))}>{['Computer science', 'Business / finance', 'Medical / health', 'Engineering', 'Math / sciences', 'Law', 'Education', 'Arts / humanities', 'Trades', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></label>
          {profile.field === 'Other' && <label>Your field<input value={profile.otherField} onChange={(event) => setProfile((current) => ({ ...current, otherField: event.target.value }))} placeholder="Add your field" /></label>}
          <label>What are you studying now?<select value={profile.stage} onChange={(event) => setProfile((current) => ({ ...current, stage: event.target.value }))}>{['High school', 'College', "Associate's degree", "Bachelor's degree", "Master's degree", 'PhD / doctorate', 'Professional degree', 'Certificate / diploma', 'Other'].map((item) => <option key={item}>{item}</option>)}</select></label>
          {profile.stage === 'Other' && <label>Study level<input value={profile.otherStage} onChange={(event) => setProfile((current) => ({ ...current, otherStage: event.target.value }))} placeholder="Add your current level" /></label>}
          <label>Degree or program name<input value={profile.degree} onChange={(event) => setProfile((current) => ({ ...current, degree: event.target.value }))} placeholder="e.g. Biology, MBA, Grade 11" /></label>
        </div></details>
        <div className="study-folders-heading"><span>Schools & programs</span><button title="Add a school or program folder" onClick={() => openNewFolder('program')}>＋</button></div>
        <nav className="study-folder-tree" aria-label="Study folders"><button className={!selectedFolderId ? 'selected' : ''} onClick={() => setSelectedFolderId(null)}><span className="study-tree-icon">⌂</span><span>All study folders</span></button>{renderFolderTree(null)}</nav>
        <div className="study-sidebar-hint">Open a folder to add school years, classes, semesters, subjects, and notes.</div>
      </aside>
      <main className="study-content">
        <div className="study-breadcrumbs"><button onClick={() => setSelectedFolderId(null)}>Study space</button>{breadcrumbs.map((folder) => <span key={folder.id}> / <button onClick={() => setSelectedFolderId(folder.id)}>{folder.name}</button></span>)}</div>
        <div className="study-content-heading"><div><h3>{selectedFolder?.name ?? 'Your study folders'}</h3><p>{selectedFolder ? `${selectedFolder.kind === 'program' ? 'School or program' : selectedFolder.kind} folder` : 'Start with a school, college, or degree folder. You choose the names and structure.'}</p></div><div className="study-content-actions">{selectedFolder && <button className="study-action-secondary" onClick={() => openNewFolder('custom')}>＋ Folder</button>}{selectedFolder && <button className="study-action-primary" onClick={() => openNewNote()}>＋ New note</button>}</div></div>
        {selectedFolder && <div className="study-folder-quick-add"><span>Add inside {selectedFolder.name}:</span>{(['year', 'semester', 'class', 'subject'] as const).map((kind) => <button key={kind} onClick={() => openNewFolder(kind)}>＋ {kind === 'year' ? 'Year' : kind[0].toUpperCase() + kind.slice(1)}</button>)}</div>}
        {childFolders.length || childNotes.length ? <div className="study-items-grid">{childFolders.map((folder) => <article className="study-item-card study-folder-card" key={folder.id}><button className="study-item-open" onClick={() => setSelectedFolderId(folder.id)}><span className="study-item-icon">{folder.kind === 'subject' ? '▤' : '▰'}</span><strong>{folder.name}</strong><small>{folder.kind} folder · {folders.filter((item) => item.parentId === folder.id).length} folders · {notes.filter((item) => item.parentId === folder.id).length} notes</small><span className="study-card-chevron">Open →</span></button></article>)}{childNotes.map((note) => <article className="study-item-card study-note-card" key={note.id}><button type="button" className="study-item-open" aria-label={`Open note ${note.title}`} onClick={() => openNewNote(note)}><span className="study-item-icon">✎</span><strong>{note.title}</strong><small>{note.body || 'No text yet'}{note.images.length + (note.files?.length ?? 0) > 0 ? ` · ${note.images.length + (note.files?.length ?? 0)} attachment${note.images.length + (note.files?.length ?? 0) === 1 ? '' : 's'}` : ''}</small>{note.images.length > 0 && <span className="study-note-thumbnails">{note.images.slice(0, 3).map((image) => <img key={image.name} src={image.data} alt={image.name} />)}</span>}<span className="study-card-chevron">Open →</span></button><button className="study-note-delete" aria-label={`Delete ${note.title}`} onClick={() => deleteNote(note.id)}>×</button></article>)}</div> : <div className="study-empty-state"><span>▤</span><strong>{selectedFolder ? 'This folder is ready for your study materials.' : 'Your study space is ready when you are.'}</strong><p>{selectedFolder ? 'Create a year, semester, class, or subject folder, or add a note here.' : 'Add your school or degree first, then organize it into subjects and notes.'}</p><button className="study-action-primary" onClick={() => openNewFolder(selectedFolder ? 'subject' : 'program')}>＋ {selectedFolder ? 'Add subject folder' : 'Add school or degree'}</button></div>}
        {message && <p className="study-storage-message" role="status">{message}</p>}
      </main>
    </div>
    {folderDialog && <div className="study-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setFolderDialog(false) }}><form className="study-dialog" onSubmit={saveFolder}><button type="button" className="study-dialog-close" aria-label="Close" onClick={() => setFolderDialog(false)}>×</button><span>STUDY FOLDER</span><h3>{folderKind === 'program' ? 'Add a school or degree' : 'Add a folder'}</h3><label>Folder type<select value={folderKind} onChange={(event) => setFolderKind(event.target.value as StudyFolder['kind'])}>{(selectedFolderId ? ['year', 'semester', 'class', 'subject', 'custom'] : ['program']).map((kind) => <option key={kind} value={kind}>{kind === 'program' ? 'School or degree' : kind[0].toUpperCase() + kind.slice(1)}</option>)}</select></label><label>Folder name<input autoFocus maxLength={100} required value={folderName} onChange={(event) => setFolderName(event.target.value)} placeholder={folderKind === 'program' ? 'e.g. Lincoln High School or MSc Biology' : folderKind === 'year' ? 'e.g. Year 2' : folderKind === 'semester' ? 'e.g. Fall semester' : folderKind === 'class' ? 'e.g. Class of 2028' : folderKind === 'subject' ? 'e.g. Anatomy' : 'Folder name'} /></label><footer><button type="button" onClick={() => setFolderDialog(false)}>Cancel</button><button type="submit">Create folder</button></footer></form></div>}
    {noteDialog && <div className="study-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setNoteDialog(false) }}><form className="study-dialog study-note-dialog" onSubmit={saveNote}><button type="button" className="study-dialog-close" aria-label="Close" onClick={() => setNoteDialog(false)}>×</button><span>NOTE IN {selectedFolder?.name.toUpperCase()}</span><h3>{editingNoteId ? 'Edit note' : 'New study note'}</h3><label>Title<input autoFocus maxLength={120} required value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Lecture notes, exam prep, lab…" /></label><label>Notes<textarea rows={8} value={noteBody} onChange={(event) => setNoteBody(event.target.value)} placeholder="Write notes, paste useful links, or make a study list…" /></label><label className="study-image-upload"><input type="file" accept="image/*" multiple onChange={(event) => { void addImages(event.currentTarget.files); event.currentTarget.value = '' }} /><span>＋ Add images</span><small>Images are resized to save browser storage.</small></label>{noteImages.length > 0 && <div className="study-attached-images">{noteImages.map((image, index) => <div key={`${image.name}-${index}`}><img src={image.data} alt={image.name} /><span>{image.name}</span><button type="button" aria-label={`Remove ${image.name}`} onClick={() => setNoteImages((items) => items.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div>}<label className="study-image-upload"><input type="file" accept=".pdf,.txt,.doc,.docx,.ppt,.pptx,application/pdf,text/plain" multiple onChange={(event) => { void addFiles(event.currentTarget.files); event.currentTarget.value = '' }} /><span>＋ Add documents</span><small>PDF, text, Word, or PowerPoint · up to 1.5 MB each</small></label>{noteFiles.length > 0 && <div className="study-file-attachments">{noteFiles.map((file, index) => <div key={`${file.name}-${index}`}><span>▧</span><a href={file.data} download={file.name} target="_blank" rel="noreferrer">{file.name}</a><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setNoteFiles((items) => items.filter((_, itemIndex) => itemIndex !== index))}>×</button></div>)}</div>}<footer><button type="button" onClick={() => setNoteDialog(false)}>Cancel</button><button type="submit">Save note</button></footer></form></div>}
  </section>
}


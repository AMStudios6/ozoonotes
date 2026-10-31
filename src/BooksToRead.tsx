import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { readCloudData, writeCloudData } from './cloudData'
import './BooksToRead.css'

type ReadingBook = { id: string; title: string; cover?: string; spine?: string; status: 'Want to read' | 'Reading' | 'Finished'; addedAt: number }
const DB_NAME = 'ozoonotes-bookshelf-v1'
const STORE = 'books'
function openBooksDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' }) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
function readBooks(db: IDBDatabase): Promise<ReadingBook[]> {
  return new Promise((resolve, reject) => { const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll(); request.onsuccess = () => resolve((request.result as ReadingBook[]).sort((a, b) => b.addedAt - a.addedAt)); request.onerror = () => reject(request.error) })
}
function saveBook(db: IDBDatabase, book: ReadingBook): Promise<void> {
  return new Promise((resolve, reject) => { const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(book); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) })
}
function deleteBook(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => { const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(id); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error) })
}
function replaceBooks(db: IDBDatabase, books: ReadingBook[]): Promise<void> {
  return new Promise((resolve, reject) => { const transaction = db.transaction(STORE, 'readwrite'); const store = transaction.objectStore(STORE); store.clear(); books.forEach((book) => store.put(book)); transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error) })
}
function imageData(file?: File): Promise<string | undefined> {
  if (!file) return Promise.resolve(undefined)
  return createImageBitmap(file).then((bitmap) => {
    const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d'); if (!context) throw new Error('Could not process that image.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close()
    return canvas.toDataURL('image/jpeg', .82)
  })
}
export default function BooksToRead({ theme, onBack, cloudEnabled = false }: { theme: string; onBack: () => void; cloudEnabled?: boolean }) {
  const [db, setDb] = useState<IDBDatabase | null>(null)
  const [books, setBooks] = useState<ReadingBook[]>([])
  const [showForm, setShowForm] = useState(false)
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<ReadingBook['status']>('Want to read')
  const [coverFile, setCoverFile] = useState<File>()
  const [spineFile, setSpineFile] = useState<File>()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All books')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const cloudVersion = useRef(0)
  const cloudReady = useRef(false)
  const cloudDirty = useRef(false)
  useEffect(() => {
    let active = true
    cloudReady.current = false
    openBooksDb().then(async (database) => { if (!active) { database.close(); return }; setDb(database); let savedBooks = await readBooks(database); if (cloudEnabled) { try { const remote = await readCloudData('ozoo:books-db'); if (remote?.value) { cloudVersion.current = remote.updatedAt; savedBooks = JSON.parse(remote.value) as ReadingBook[]; await replaceBooks(database, savedBooks) } else { const saved = await writeCloudData('ozoo:books-db', JSON.stringify(savedBooks)); cloudVersion.current = saved?.updatedAt ?? 0 } } catch { setMessage('Saved on this device · cloud backup will retry when connected.') } }; if (active) { setBooks(savedBooks); cloudReady.current = true } }).catch(() => setMessage('This browser could not open local book storage. Try a current version of Chrome, Edge, or Firefox.'))
    return () => { active = false }
  }, [cloudEnabled])
  const visibleBooks = useMemo(() => books.filter((book) => (filter === 'All books' || book.status === filter) && book.title.toLowerCase().includes(search.toLowerCase().trim())), [books, filter, search])
  const clearForm = () => { setTitle(''); setStatus('Want to read'); setCoverFile(undefined); setSpineFile(undefined); setShowForm(false); setMessage('') }
  const pushCloudBooks = async (next: ReadingBook[]) => { if (!cloudEnabled) return; cloudDirty.current = true; try { const saved = await writeCloudData('ozoo:books-db', JSON.stringify(next)); cloudVersion.current = saved?.updatedAt ?? cloudVersion.current; cloudDirty.current = false; setMessage('Saved to your account cloud.') } catch { setMessage('Saved on this device, but cloud backup failed. Check your connection and try again.') } }
  useEffect(() => { if (!db || !cloudEnabled) return; let active = true, polling = false; const poll = async () => { if (!cloudReady.current || cloudDirty.current || polling) return; polling = true; try { const remote = await readCloudData('ozoo:books-db'); if (!active || !remote || remote.deleted || remote.updatedAt <= cloudVersion.current || remote.value === null || cloudDirty.current) return; const incoming = JSON.parse(remote.value) as ReadingBook[]; await replaceBooks(db, incoming); if (active) { cloudVersion.current = remote.updatedAt; setBooks(incoming) } } catch { /* Keep local books and try again on the next interval. */ } finally { polling = false } }; const timer = setInterval(() => { void poll() }, 3000); return () => { active = false; clearInterval(timer) } }, [db, cloudEnabled])
  const addBook = async (event: FormEvent) => {
    event.preventDefault(); if (!db || !title.trim()) return
    setBusy(true); setMessage('')
    try {
      const book: ReadingBook = { id: crypto.randomUUID(), title: title.trim(), cover: await imageData(coverFile), spine: await imageData(spineFile), status, addedAt: Date.now() }
      await saveBook(db, book); const next = [book, ...books]; setBooks(next); await pushCloudBooks(next); clearForm()
    } catch { setMessage('Could not save this book. Try smaller photos or check your available device storage.') }
    finally { setBusy(false) }
  }
  const changeStatus = async (book: ReadingBook, next: ReadingBook['status']) => { if (!db) return; const updated = { ...book, status: next }; await saveBook(db, updated); const nextBooks = books.map((item) => item.id === book.id ? updated : item); setBooks(nextBooks); await pushCloudBooks(nextBooks) }
  const remove = async (book: ReadingBook) => { if (!db) return; await deleteBook(db, book.id); const next = books.filter((item) => item.id !== book.id); setBooks(next); await pushCloudBooks(next) }
  return <main className={`app ${theme === 'purple' ? 'dark' : 'light'}`} data-theme={theme}><div className="books-page">
    <header className="books-topbar"><button className="books-back" type="button" onClick={onBack}>← <span>Dashboard</span></button><div className="books-brand"><span className="books-brand-mark">▤</span><span>OzooNotes <i>·</i> Bookshelf</span></div><span className="books-local-label"><i /> {cloudEnabled ? 'Cloud backup on' : 'Saved on this device'}</span></header>
    <div className="books-content">
      <section className="books-intro"><div><span className="books-eyebrow">YOUR NEXT CHAPTER</span><h1>Books to read<span>.</span></h1><p>Keep the books you’re looking forward to in one cozy place.</p></div><div className="books-count"><strong>{books.length}</strong><span>{books.length === 1 ? 'book on your shelf' : 'books on your shelf'}</span></div></section>
      <section className="books-toolbar" aria-label="Bookshelf controls"><label className="books-search"><span aria-hidden="true">⌕</span><input aria-label="Search books" placeholder="Find a book…" value={search} onChange={(event) => setSearch(event.target.value)} /></label><div className="books-filters" role="group" aria-label="Filter books">{['All books', 'Want to read', 'Reading', 'Finished'].map((item) => <button type="button" key={item} className={filter === item ? 'selected' : ''} aria-pressed={filter === item} onClick={() => setFilter(item)}>{item}</button>)}</div></section>
      {visibleBooks.length ? <section className="bookshelf-grid" aria-label="Your books">{visibleBooks.map((book) => <article className="bookshelf-card" key={book.id}><div className="books-object"><div className="book-spine" style={book.spine ? { backgroundImage: `linear-gradient(#0002,#0002),url(${book.spine})` } : undefined}><span>{book.title}</span></div><div className="book-cover" style={book.cover ? { backgroundImage: `linear-gradient(#0002,#0002),url(${book.cover})` } : undefined}><span className="book-cover-title">{book.title}</span><span className="book-cover-caption">OZOONOTES · READING LIST</span></div></div><div className="bookshelf-meta"><strong title={book.title}>{book.title}</strong><button type="button" className="book-remove" aria-label={`Remove ${book.title}`} title="Remove book" onClick={() => void remove(book)}>×</button></div><div className="bookshelf-card-foot"><label className="sr-only" htmlFor={`status-${book.id}`}>Reading status for {book.title}</label><select id={`status-${book.id}`} value={book.status} onChange={(event) => void changeStatus(book, event.target.value as ReadingBook['status'])}><option>Want to read</option><option>Reading</option><option>Finished</option></select><span>{new Date(book.addedAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span></div></article>)}
      <button type="button" className="books-add-card" onClick={() => { setShowForm(true); setMessage('') }}><span className="books-add-plus">＋</span><strong>Add a book</strong><small>Add a cover and spine photo</small></button></section> : <section className="books-empty"><div className="books-empty-book">▤</div><h2>{search || filter !== 'All books' ? 'No books found' : 'Your shelf is ready'}</h2><p>{search || filter !== 'All books' ? 'Try a different search or filter.' : 'Add a book you’d love to read. A front cover and spine photo make your shelf feel like yours.'}</p><button type="button" onClick={() => setShowForm(true)}>＋ Add your first book</button></section>}
      <button type="button" className="books-add-bottom" onClick={() => { setShowForm(true); setMessage('') }}><span>＋</span> Add a book to your shelf</button>
      {message && <p className="books-message" role="status">{message}</p>}
    </div>
    {showForm && <div className="books-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) clearForm() }}><section className="books-modal" role="dialog" aria-modal="true" aria-labelledby="books-modal-title"><button type="button" className="books-modal-close" aria-label="Close" onClick={clearForm}>×</button><span className="books-eyebrow">ADD TO YOUR SHELF</span><h2 id="books-modal-title">A new book to look forward to</h2><p>Photos are resized and saved in this browser on this device.</p><form onSubmit={(event) => void addBook(event)}><label className="books-field">Book name<input autoFocus maxLength={100} required value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. The Hobbit" /></label><div className="books-photo-fields"><label className="books-photo-upload"><span className="books-photo-preview">{coverFile ? <img src={URL.createObjectURL(coverFile)} alt="Cover preview" /> : '▤'}</span><strong>Front cover photo</strong><small>{coverFile?.name || 'Choose a photo (optional)'}</small><input type="file" accept="image/*" onChange={(event) => setCoverFile(event.target.files?.[0])} /></label><label className="books-photo-upload"><span className="books-photo-preview spine-preview">{spineFile ? <img src={URL.createObjectURL(spineFile)} alt="Spine preview" /> : '▥'}</span><strong>Spine photo</strong><small>{spineFile?.name || 'Choose a side photo (optional)'}</small><input type="file" accept="image/*" onChange={(event) => setSpineFile(event.target.files?.[0])} /></label></div><label className="books-field">Reading status<select value={status} onChange={(event) => setStatus(event.target.value as ReadingBook['status'])}><option>Want to read</option><option>Reading</option><option>Finished</option></select></label>{message && <p className="books-message" role="alert">{message}</p>}<div className="books-modal-actions"><button type="button" onClick={clearForm}>Cancel</button><button type="submit" disabled={busy || !db}>{busy ? 'Saving…' : 'Add to bookshelf'}</button></div></form></section></div>}
  </div></main>
}

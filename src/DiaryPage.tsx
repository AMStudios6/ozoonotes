import { useEffect, useMemo, useRef, useState } from 'react'

type DiaryEntry = { date: string; body: string; prompt: string; photo?: string; photoCaption?: string; location?: string; mood?: string; updatedAt?: string }
type DiaryPageProps = { theme: string; onBack: () => void; cloudEnabled?: boolean }

const diaryPrompts = [
  'What is one small moment from today that you want to remember?',
  'What gave you energy today, and what would you like to make space for tomorrow?',
  'What is something you noticed today that you might usually pass by?',
  'Write about a person, place, or idea you felt grateful for today.',
  'What felt difficult today? What would you say to a friend in the same situation?',
  'What did you learn about yourself this week?',
]
const moods = ['Calm', 'Happy', 'Grateful', 'Tired', 'Anxious', 'Hopeful']
const todayKey = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
const dateFromKey = (key: string) => { const [year, month, day] = key.split('-').map(Number); return new Date(year, month - 1, day, 12) }
const keyFromDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const emptyEntry = (date: string): DiaryEntry => ({ date, body: '', prompt: diaryPrompts[Math.floor(Math.random() * diaryPrompts.length)] })
function readEntries(): Record<string, DiaryEntry> {
  try {
    const value = JSON.parse(localStorage.getItem('ozoo:diary:entries') ?? '{}') as Record<string, DiaryEntry>
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  } catch { return {} }
}
async function prepareDiaryPhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.')
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose an image smaller than 12 MB.')
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1100 / bitmap.width, 900 / bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext('2d')
  if (!context) { bitmap.close(); throw new Error('This browser could not prepare the photo.') }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((image) => image ? resolve(image) : reject(new Error('Could not prepare the photo.')), 'image/webp', .78))
  if (blob.size > 700 * 1024) throw new Error('That photo is still too large. Try a smaller image.')
  return await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Could not read the photo.')); reader.readAsDataURL(blob) })
}

export default function DiaryPage({ theme, onBack, cloudEnabled = false }: DiaryPageProps) {
  const today = useMemo(todayKey, [])
  const [entries, setEntries] = useState<Record<string, DiaryEntry>>(readEntries)
  const [selectedDate, setSelectedDate] = useState(today)
  const [draft, setDraft] = useState<DiaryEntry>(() => entries[today] ?? emptyEntry(today))
  const [saveState, setSaveState] = useState('Saved in this browser')
  const [dirty, setDirty] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const photoInput = useRef<HTMLInputElement>(null)
  const selectedDateObject = dateFromKey(selectedDate)
  const formattedDate = selectedDateObject.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const orderedEntries = Object.values(entries).filter((entry) => entry.body.trim() || entry.photo || entry.location || entry.mood).sort((a, b) => b.date.localeCompare(a.date))
  const streak = useMemo(() => {
    const writtenDates = new Set(orderedEntries.map((entry) => entry.date))
    let cursor = dateFromKey(today)
    if (!writtenDates.has(today)) cursor.setDate(cursor.getDate() - 1)
    let count = 0
    while (writtenDates.has(keyFromDate(cursor))) { count++; cursor.setDate(cursor.getDate() - 1) }
    return count
  }, [orderedEntries, today])
  const recentDays = Array.from({ length: 7 }, (_, index) => { const date = dateFromKey(selectedDate); date.setDate(date.getDate() - (6 - index)); return date })

  useEffect(() => {
    if (!dirty) return
    const timer = window.setTimeout(() => {
      const hasContent = Boolean(draft.body.trim() || draft.photo || draft.location?.trim() || draft.mood)
      if (!hasContent) {
        setEntries((current) => { const next = { ...current }; delete next[selectedDate]; return next })
      } else {
        setEntries((current) => ({ ...current, [selectedDate]: { ...draft, updatedAt: new Date().toISOString() } }))
      }
      setDirty(false)
      setSaveState('Saved in this browser')
    }, 700)
    setSaveState('Saving…')
    return () => window.clearTimeout(timer)
  }, [dirty, draft, selectedDate])

  useEffect(() => { try { localStorage.setItem('ozoo:diary:entries', JSON.stringify(entries)) } catch { setSaveState('Browser storage is full; this entry could not be saved') } }, [entries])

  const chooseDate = (date: string) => { setDirty(false); setSelectedDate(date); setDraft(entries[date] ?? emptyEntry(date)); setPhotoError('') }
  const changeDraft = (patch: Partial<DiaryEntry>) => { setDirty(true); setDraft((current) => ({ ...current, ...patch, date: selectedDate })) }
  const saveNow = () => {
    if (!draft.body.trim() && !draft.photo && !draft.location?.trim() && !draft.mood) { setSaveState('Write something or add a photo to save this day.'); return }
    const next = { ...draft, date: selectedDate, updatedAt: new Date().toISOString() }
    setEntries((current) => ({ ...current, [selectedDate]: next }))
    setDirty(false)
    try { localStorage.setItem('ozoo:diary:entries', JSON.stringify({ ...entries, [selectedDate]: next })); setSaveState('Saved in this browser') }
    catch { setSaveState('Browser storage is full; remove a photo or use a smaller one') }
  }
  const moveDate = (amount: number) => { const date = dateFromKey(selectedDate); date.setDate(date.getDate() + amount); chooseDate(keyFromDate(date)) }
  const setNewPrompt = () => { const options = diaryPrompts.filter((prompt) => prompt !== draft.prompt); changeDraft({ prompt: options[Math.floor(Math.random() * options.length)] }) }
  const handlePhoto = async (file?: File) => {
    if (!file) return
    setPhotoError('')
    try { changeDraft({ photo: await prepareDiaryPhoto(file), photoCaption: file.name.replace(/\.[^.]+$/, '') }) }
    catch (error) { setPhotoError(error instanceof Error ? error.message : 'Could not add this photo.') }
  }

  return <main className="app diary-app" data-theme={theme}><div className="diary-page-shell">
    <header className="diary-topbar"><button type="button" className="diary-back-button" onClick={onBack}>← <span>Dashboard</span></button><div className="diary-brand"><span className="diary-brand-icon">✎</span><span><strong>OzooNotes</strong><small>Personal diary</small></span></div><div className="diary-save-indicator"><i />{cloudEnabled ? 'Saved on device · cloud backup on' : saveState}</div></header>
    <div className="diary-content"><aside className="diary-date-rail"><div className="diary-date-rail-heading"><span>YOUR DAYS</span><label className="diary-date-picker">＋<input aria-label="Choose a diary date" type="date" value={selectedDate} max={today} onChange={(event) => event.target.value && chooseDate(event.target.value)} /></label></div><button type="button" className={'diary-date-item ' + (selectedDate === today ? 'active' : '')} onClick={() => chooseDate(today)}><strong>Today</strong><span>{dateFromKey(today).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>{entries[today]?.body && <i aria-label="Entry saved" />}</button>{orderedEntries.filter((entry) => entry.date !== today).slice(0, 18).map((entry) => <button type="button" key={entry.date} className={'diary-date-item ' + (selectedDate === entry.date ? 'active' : '')} onClick={() => chooseDate(entry.date)}><strong>{dateFromKey(entry.date).toLocaleDateString(undefined, { weekday: 'short' })}</strong><span>{dateFromKey(entry.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span><i aria-label="Entry saved" /></button>)}<p className="diary-privacy-note">Your diary is saved in this browser on this device.</p></aside>
    <section className="diary-main"><div className="diary-heading"><div><span className="diary-eyebrow">A LITTLE SPACE FOR YOU</span><h1>Dear diary<span>.</span></h1><p>Keep a moment from today, just as it was.</p></div><div className="diary-heading-date"><span>{selectedDate === today ? 'TODAY' : 'SELECTED DAY'}</span><strong>{selectedDateObject.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong></div></div>
      <div className="diary-book-shell"><div className="diary-book"><section className="diary-book-page diary-left-page"><div className="diary-page-date"><span className="diary-weather-mark">☀</span><div><strong>{formattedDate.split(',')[0]}</strong><small>{formattedDate.split(',').slice(1).join(',').trim()}</small></div><span className="diary-page-number">{String(selectedDateObject.getDate()).padStart(2,'0')}</span></div><button type="button" className={'diary-photo-frame ' + (draft.photo ? 'has-photo' : '')} onClick={() => photoInput.current?.click()} aria-label={draft.photo ? 'Change diary photo' : 'Add a photo to this diary page'}>{draft.photo ? <img src={draft.photo} alt={draft.photoCaption || 'Diary memory'} /> : <span><b>＋</b><strong>Add a photo</strong><small>Keep a picture of this moment</small></span>}</button><input ref={photoInput} className="diary-photo-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(event) => { void handlePhoto(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} />{photoError && <p className="diary-photo-error" role="alert">{photoError}</p>}{draft.photo && <div className="diary-photo-caption"><input aria-label="Photo caption" value={draft.photoCaption ?? ''} onChange={(event) => changeDraft({ photoCaption: event.target.value })} placeholder="Add a caption…" /><button type="button" onClick={() => changeDraft({ photo: undefined, photoCaption: '' })}>Remove photo</button></div>}<div className="diary-week-strip">{recentDays.map((date) => { const key=keyFromDate(date); return <button type="button" key={key} disabled={key>today} className={(key===selectedDate?'selected ':'')+(entries[key]?'has-entry':'')} onClick={() => chooseDate(key)} aria-label={date.toLocaleDateString()}><small>{date.toLocaleDateString(undefined,{weekday:'narrow'})}</small><span>{date.getDate()}</span></button>})}</div><div className="diary-streak"><span className="diary-streak-icon">✦</span><div><strong>{streak} day{streak===1?'':'s'} in a row</strong><small>{streak ? 'You made time for yourself. Keep it going.' : 'A small note is a lovely place to begin.'}</small></div></div></section>
      <div className="diary-book-spine" aria-hidden="true"><i/><i/><i/></div><section className="diary-book-page diary-right-page"><div className="diary-prompt-card"><div className="diary-prompt-meta"><span>✧ &nbsp;SAVOR THE MOMENT</span><span>{new Date().toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</span></div><p>{draft.prompt}</p><button type="button" onClick={setNewPrompt}>↻ &nbsp; Another prompt</button></div><label className="diary-writing-label" htmlFor="diary-entry-text">Your thoughts</label><textarea id="diary-entry-text" className="diary-entry-textarea" value={draft.body} onChange={(event) => changeDraft({ body: event.target.value })} placeholder="Write freely. This page is yours…" /><label className="diary-location"><span>⌖</span><input value={draft.location ?? ''} onChange={(event) => changeDraft({ location: event.target.value })} placeholder="Where are you right now…" /></label><div className="diary-mood-row"><span>Today felt</span>{moods.map((mood) => <button type="button" key={mood} aria-pressed={draft.mood===mood} className={draft.mood===mood?'selected':''} onClick={() => changeDraft({ mood: draft.mood===mood ? '' : mood })}>{mood}</button>)}</div><div className="diary-page-actions"><button type="button" className="diary-save-button" onClick={saveNow}>Save entry</button><div><button type="button" aria-label="Previous day" onClick={() => moveDate(-1)}>←</button><button type="button" aria-label="Next day" disabled={selectedDate>=today} onClick={() => moveDate(1)}>→</button></div></div></section></div><p className="diary-book-caption">One day at a time. {cloudEnabled ? 'Your diary syncs to your account cloud.' : 'Your diary is saved on this device.'}</p></div>
    </section></div></div></main>
}


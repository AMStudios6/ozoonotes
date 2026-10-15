import { useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import './CodeEditor.css'

export type EditorLanguage = 'cpp' | 'python' | 'java' | 'html' | 'css' | 'javascript'

const keywords: Record<EditorLanguage, Set<string>> = {
  cpp: new Set('alignas alignof auto bool break case catch char class const constexpr continue cout cin cerr default delete do double else enum explicit export extern false float for friend if inline int long namespace new nullptr operator private protected public return short signed sizeof static std string struct switch template this throw true try typedef typename union unsigned using virtual void volatile while'.split(' ')),
  python: new Set('and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield self'.split(' ')),
  java: new Set('abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null'.split(' ')),
  html: new Set('DOCTYPE html head body title meta link script style div main section header footer button input img form label p h1 h2 h3 ul li a span'.split(' ')),
  css: new Set('important media supports keyframes from to root hover focus active before after'.split(' ')),
  javascript: new Set('async await break case catch class const continue debugger default delete do else export extends finally for from function if import in instanceof let new of return super switch this throw try typeof var void while with yield true false null undefined NaN Infinity'.split(' ')),
}

const tokenPattern = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\x60(?:\\.|[^\x60\\])*\x60|<\/?[A-Za-z!][^>]*>|\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b|[{}()[\];,.])/g

function paint(code: string, language: EditorLanguage) {
  const nodes = []
  let cursor = 0
  for (const match of code.matchAll(tokenPattern)) {
    const token = match[0]
    const index = match.index ?? 0
    if (index > cursor) nodes.push(code.slice(cursor, index))
    let kind = ''
    if (token.startsWith('//') || token.startsWith('/*') || (language === 'python' && token.startsWith('#'))) kind = 'comment'
    else if (token.startsWith('"') || token.startsWith("'") || token.startsWith('\x60')) kind = 'string'
    else if (language === 'html' && token.startsWith('<')) kind = 'tag'
    else if (/^\d/.test(token)) kind = 'number'
    else if (keywords[language].has(token)) kind = 'keyword'
    else if (/^[{}()[\];,.]$/.test(token)) kind = 'punctuation'
    if (kind) nodes.push(<span className={'syntax-' + kind} key={index}>{token}</span>)
    else nodes.push(token)
    cursor = index + token.length
  }
  if (cursor < code.length) nodes.push(code.slice(cursor))
  return nodes.length ? nodes : ['\u200b']
}

export default function CodeEditor({ language, value, onChange, label }: {
  language: EditorLanguage
  value: string
  onChange: (value: string) => void
  label: string
}) {
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLPreElement>(null)

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const editor = event.currentTarget
    const start = editor.selectionStart
    const end = editor.selectionEnd
    const selected = value.slice(start, end)
    const before = value.slice(0, start)
    const after = value.slice(end)
    let insertion: string | null = null
    let cursor = start

    if (event.key === 'Tab') {
      event.preventDefault()
      insertion = '    '
      cursor = start + insertion.length
    } else if (event.key === 'Backspace' && start === end && before.length && after.length) {
      const pair = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '\x60': '\x60' } as Record<string, string>
      if (pair[before.at(-1)!] === after[0]) {
        event.preventDefault()
        onChange(before.slice(0, -1) + after.slice(1))
        requestAnimationFrame(() => editor.setSelectionRange(start - 1, start - 1))
        return
      }
    } else if (event.key === 'Enter') {
      const line = before.slice(before.lastIndexOf('\n') + 1)
      const indent = line.match(/^[\t ]*/)?.[0] ?? ''
      const opens = ['(', '[', '{'].includes(before.at(-1) ?? '')
      const closes = [')', ']', '}'].includes(after[0] ?? '')
      event.preventDefault()
      if (opens && closes && selected.length === 0) {
        insertion = '\n' + indent + '    \n' + indent
        cursor = start + 1 + indent.length + 4
      } else {
        insertion = '\n' + indent
        cursor = start + insertion.length
      }
    } else if (event.key.length === 1) {
      const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '\x60': '\x60' }
      if (selected.length > 0 && pairs[event.key]) {
        event.preventDefault()
        insertion = event.key + selected + pairs[event.key]
        cursor = start + insertion.length
      } else if (start === end && [')', ']', '}', '"', "'", '\x60'].includes(event.key) && after.startsWith(event.key)) {
        event.preventDefault()
        editor.setSelectionRange(start + 1, start + 1)
        return
      }
      if (pairs[event.key]) {
        event.preventDefault()
        insertion = event.key + pairs[event.key]
        cursor = start + 1
      }
    }

    if (insertion !== null) {
      onChange(before + insertion + after)
      requestAnimationFrame(() => editor.setSelectionRange(cursor, cursor))
    }
  }

  return <div className="syntax-editor-stack">
    <pre className="syntax-highlight" aria-hidden="true" ref={highlightRef}>{paint(value, language)}{value.endsWith('\n') ? '\u200b' : ''}</pre>
    <textarea
      ref={editorRef}
      aria-label={label}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={handleKeyDown}
      onScroll={(event) => {
        const preview = highlightRef.current
        if (preview) { preview.scrollTop = event.currentTarget.scrollTop; preview.scrollLeft = event.currentTarget.scrollLeft }
      }}
    />
  </div>

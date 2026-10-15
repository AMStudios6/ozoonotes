import { useEffect, useMemo, useRef, useState } from 'react'
import './CodeSimulator.css'

type CodeMode = 'python' | 'java' | 'web'
type StudioFile = { path: string; type: string; encoding: 'text' | 'data'; content: string }

const PY_START = 'print("Hello from Python!")\n'
const JAVA_START = 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Java!");\n    }\n}\n'
const HTML_START = '<main class="card">\n  <p class="eyebrow">YOUR WEB PROJECT</p>\n  <h1>Hello, world.</h1>\n  <p>Edit the HTML, CSS, and JavaScript tabs to build your page.</p>\n  <button id="hello">Try it</button>\n  <p id="message"></p>\n</main>'
const CSS_START = 'body {\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n  margin: 0;\n  background: #f1f5f1;\n  color: #18251c;\n  font-family: system-ui, sans-serif;\n}\n.card { max-width: 520px; padding: 40px; border-radius: 20px; background: white; box-shadow: 0 20px 60px #14221618; }\n.eyebrow { color: #25864a; font-size: 12px; letter-spacing: .15em; font-weight: 700; }\nbutton { border: 0; border-radius: 8px; padding: 10px 16px; background: #25864a; color: white; cursor: pointer; }'
const JS_START = 'document.querySelector("#hello").addEventListener("click", () => {\n  document.querySelector("#message").textContent = "Your JavaScript is running!";\n});'

function readCode(key: string, fallback: string) {
  try { return localStorage.getItem(key) || fallback } catch { return fallback }
}
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read ' + file.name))
    reader.readAsDataURL(file)
  })
}
function openStudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('ozoo-code-studio', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('projects')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function getSavedFiles(): Promise<StudioFile[]> {
  const db = await openStudioDb()
  return new Promise((resolve, reject) => {
    const request = db.transaction('projects', 'readonly').objectStore('projects').get('files')
    request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as StudioFile[] : [])
    request.onerror = () => reject(request.error)
  })
}
async function putSavedFiles(files: StudioFile[]) {
  const db = await openStudioDb()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('projects', 'readwrite')
    transaction.objectStore('projects').put(files, 'files')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
  })
}
function safePath(file: File) {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
  return relative.replace(/\\/g, '/').split('/').filter((part) => part && part !== '.' && part !== '..').join('/')
}

const EXEC_WORKER = [
  'self.onmessage = async (event) => {',
  '  const { mode, code, input, files } = event.data;',
  '  let output = "";',
  '  try {',
  '    if (mode === "python") {',
  '      self.postMessage({ type: "status", value: "Loading Python runtime…" });',
  '      const { loadPyodide } = await import("https://cdn.jsdelivr.net/pyodide/v0.28.2/full/pyodide.mjs");',
  '      const pyodide = await loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.28.2/full/" });',
  '      pyodide.setStdout({ batched: (line) => { output += line; } });',
  '      pyodide.setStderr({ batched: (line) => { output += line; } });',
  '      const inputLines = (input || "").split("\\n");',
  '      pyodide.setStdin({ stdin: () => inputLines.length ? inputLines.shift() : null });',
  '      for (const file of files.filter((item) => item.encoding === "text")) {',
  '        const path = "/home/pyodide/" + file.path;',
  '        const folder = path.slice(0, path.lastIndexOf("/"));',
  '        pyodide.FS.mkdirTree(folder); pyodide.FS.writeFile(path, file.content);',
  '      }',
  '      pyodide.runPython("import os, sys; os.chdir(\'/home/pyodide\'); sys.path.insert(0, \'/home/pyodide\')");',
  '      self.postMessage({ type: "status", value: "Running Python…" });',
  '      await pyodide.loadPackagesFromImports(code);',
  '      await pyodide.runPythonAsync(code);',
  '    } else {',
  '      self.postMessage({ type: "status", value: "Loading Java compiler…" });',
  '      const runtimeUrl = "https://teavm.org/playground/compiler.wasm-runtime.js";',
  '      const base = "https://teavm.org/playground/";',
  '      const { load } = await import(runtimeUrl);',
  '      const [compilerResponse, sdkResponse, runtimeLibResponse] = await Promise.all([fetch(base + "compiler.wasm"), fetch(base + "compile-classlib-teavm.bin"), fetch(base + "runtime-classlib-teavm.bin")]);',
  '      if (![compilerResponse, sdkResponse, runtimeLibResponse].every((response) => response.ok)) throw new Error("Could not load the browser Java compiler.");',
  '      const compilerModule = await load(new Uint8Array(await compilerResponse.arrayBuffer()));',
  '      const compiler = compilerModule.exports.createCompiler();',
  '      compiler.setSdk(new Int8Array(await sdkResponse.arrayBuffer()));',
  '      compiler.setTeaVMClasslib(new Int8Array(await runtimeLibResponse.arrayBuffer()));',
  '      const javaFiles = files.filter((file) => file.path.toLowerCase().endsWith(".java"));',
  '      const declared = code.match(/\\b(?:public\\s+)?class\\s+([A-Za-z_$][\\w$]*)/);',
  '      const packageName = code.match(/^\\s*package\\s+([\\w.]+)\\s*;/m);',
  '      const className = declared ? declared[1] : "Main";',
  '      const sourcePath = (packageName ? packageName[1].replace(/\\./g, "/") + "/" : "") + className + ".java";',
  '      compiler.addSourceFile(sourcePath, code);',
  '      for (const file of javaFiles) if (file.path.split("/").pop().toLowerCase() !== (className + ".java").toLowerCase()) compiler.addSourceFile(file.path, file.content);',
  '      const diagnostics = []; compiler.onDiagnostic((item) => diagnostics.push(item.fileName + ":" + item.lineNumber + " " + item.message));',
  '      self.postMessage({ type: "status", value: "Compiling Java…" });',
  '      const compiled = compiler.compile();',
  '      if (!compiled) { self.postMessage({ type: "result", ok: false, output: diagnostics.join("\\n") || "Java compilation failed." }); return; }',
  '      const mainClasses = compiler.detectMainClasses();',
  '      const mainClass = mainClasses[0] || className;',
  '      self.postMessage({ type: "status", value: "Building Java program…" });',
  '      if (!compiler.generateWebAssembly({ outputName: "app", mainClass })) { self.postMessage({ type: "result", ok: false, output: diagnostics.join("\\n") || "TeaVM could not build this Java program." }); return; }',
  '      const program = await load(compiler.getWebAssemblyOutputFile("app.wasm"));',
  '      const originalLog = console.log, originalError = console.error;',
  '      console.log = (...values) => { output += values.join(" ") + "\\n"; };',
  '      console.error = (...values) => { output += values.join(" ") + "\\n"; };',
  '      self.postMessage({ type: "status", value: "Running Java…" });',
  '      try { program.exports.main([]); } finally { console.log = originalLog; console.error = originalError; }',
  '    }',
  '    self.postMessage({ type: "result", ok: true, output: output || "(Program finished with no output.)" });',
  '  } catch (error) { self.postMessage({ type: "result", ok: false, output: (error && error.stack) || String(error) }); }',
  '};',
].join('\n')

export default function CodeSimulator({ initialLanguage = 'python', onBack }: { initialLanguage?: CodeMode; onBack: () => void }) {
  const [language, setLanguage] = useState<CodeMode>(initialLanguage)
  const [python, setPython] = useState(() => readCode('ozoo:python-code', PY_START))
  const [java, setJava] = useState(() => readCode('ozoo:java-code', JAVA_START))
  const [html, setHtml] = useState(() => readCode('ozoo:web-html', HTML_START))
  const [css, setCss] = useState(() => readCode('ozoo:web-css', CSS_START))
  const [javascript, setJavascript] = useState(() => readCode('ozoo:web-js', JS_START))
  const [webTab, setWebTab] = useState<'html' | 'css' | 'javascript'>('html')
  const [files, setFiles] = useState<StudioFile[]>([])
  const [filesReady, setFilesReady] = useState(false)
  const [notice, setNotice] = useState('')
  const [status, setStatus] = useState('Ready')
  const [output, setOutput] = useState('Run your program to see output here.')
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [previewKey, setPreviewKey] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { try { localStorage.setItem('ozoo:python-code', python) } catch {} }, [python])
  useEffect(() => { try { localStorage.setItem('ozoo:java-code', java) } catch {} }, [java])
  useEffect(() => { try { localStorage.setItem('ozoo:web-html', html) } catch {} }, [html])
  useEffect(() => { try { localStorage.setItem('ozoo:web-css', css) } catch {} }, [css])
  useEffect(() => { try { localStorage.setItem('ozoo:web-js', javascript) } catch {} }, [javascript])
  useEffect(() => {
    void getSavedFiles().then((saved) => setFiles(saved)).catch(() => setNotice('Local file storage is unavailable in this browser.'))
      .finally(() => setFilesReady(true))
  }, [])
  useEffect(() => {
    if (filesReady) void putSavedFiles(files).catch(() => setNotice('The browser could not save these project files. Check available storage.'))
  }, [files, filesReady])

  const importFiles = async (selected: FileList | null) => {
    if (!selected?.length) return
    let total = files.reduce((sum, file) => sum + file.content.length, 0)
    const next = new Map(files.map((file) => [file.path, file]))
    let imported = 0, skipped = 0
    for (const file of Array.from(selected)) {
      const path = safePath(file)
      if (!path || file.size > 12_000_000) { skipped++; continue }
      const textFile = /\\.(?:html?|css|m?js|json|xml|txt|py|pyi|java|jar|whl|csv|ts|md|svg|h|hh|hpp|hxx|cpp|cc|cxx|inc|tpp|ipp)$/i.test(path)
      let content = ''
      let encoding: 'text' | 'data' = 'text'
      if (textFile && !/\\.(?:jar|whl)$/i.test(path)) content = await file.text()
      else { content = await fileToDataUrl(file); encoding = 'data' }
      total += content.length
      if (total > 20_000_000) { skipped++; continue }
      next.set(path, { path, type: file.type || 'application/octet-stream', encoding, content })
      imported++
    }
    setFiles(Array.from(next.values()))
    setNotice(imported + ' project file' + (imported === 1 ? '' : 's') + ' saved on this device' + (skipped ? '; some files skipped.' : '.'))
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (folderInputRef.current) folderInputRef.current.value = ''
    const added = Array.from(selected)
    if (language === 'web') {
      for (const file of added) {
        const path = safePath(file).toLowerCase()
        if (path.endsWith('.html') || path.endsWith('.htm')) setHtml(await file.text())
        else if (path.endsWith('.css')) setCss(await file.text())
        else if (path.endsWith('.js') || path.endsWith('.mjs')) setJavascript(await file.text())
      }
    } else if (language === 'python') {
      const mainFile = added.find((file) => /(^|\\/)main\\.py$/i.test(safePath(file))) ?? added.find((file) => /\\.py$/i.test(file.name))
      if (mainFile) setPython(await mainFile.text())
    } else if (language === 'java') {
      const mainFile = added.find((file) => /(^|\\/)main\\.java$/i.test(safePath(file))) ?? added.find((file) => /\\.java$/i.test(file.name))
      if (mainFile) setJava(await mainFile.text())
    }
  }

  const removeFile = (path: string) => {
    setFiles((current) => current.filter((file) => file.path !== path))
    setNotice('Removed ' + path)
  }
  const resetCurrent = () => {
    if (language === 'python') setPython(PY_START)
    if (language === 'java') setJava(JAVA_START)
    if (language === 'web') { setHtml(HTML_START); setCss(CSS_START); setJavascript(JS_START) }
    setOutput('Starter code restored.')
    setStatus('Ready')
  }

  const runProgram = () => {
    if (language === 'web') { setPreviewKey((key) => key + 1); setStatus('Preview refreshed'); return }
    if (running) return
    setRunning(true); setOutput(''); setStatus('Starting runtime…')
    const workerUrl = URL.createObjectURL(new Blob([EXEC_WORKER], { type: 'text/javascript' }))
    const worker = new Worker(workerUrl, { type: 'module' })
    let timeout = window.setTimeout(() => {
      worker.terminate(); URL.revokeObjectURL(workerUrl)
      setOutput('The runtime took too long to start. Check your connection and retry.')
      setStatus('Runtime timeout'); setRunning(false)
    }, 180_000)
    worker.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'status') {
        setStatus(event.data.value)
        if (/^Running (Python|Java)/.test(event.data.value)) {
          window.clearTimeout(timeout)
          timeout = window.setTimeout(() => {
            worker.terminate(); URL.revokeObjectURL(workerUrl)
            setOutput('Stopped after 10 seconds. Check for an infinite loop.')
            setStatus('Stopped · time limit'); setRunning(false)
          }, 10_000)
        }
      }
      if (event.data.type === 'result') {
        window.clearTimeout(timeout); worker.terminate(); URL.revokeObjectURL(workerUrl)
        setOutput(event.data.output || '(Program finished with no output.)')
        setStatus(event.data.ok ? 'Finished' : 'Error'); setRunning(false)
      }
    }
    worker.onerror = (event) => {
      window.clearTimeout(timeout); worker.terminate(); URL.revokeObjectURL(workerUrl)
      setOutput(event.message || 'The browser could not start this language runtime.')
      setStatus('Error'); setRunning(false)
    }
    const source = language === 'python' ? python : java
    const safeFiles = files.map(({ path, type, encoding, content }) => ({ path, type, encoding, content }))
    worker.postMessage({ mode: language, code: source, input, files: safeFiles })
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.repeat) { event.preventDefault(); runProgram() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const previewDocument = useMemo(() => {
    const assetFiles = files.filter((file) => file.encoding === 'data' && file.type.startsWith('image/'))
    const replaceAsset = (value: string) => assetFiles.reduce((text, file) => {
      const base = file.path.split('/').pop() || file.path
      return text.split(file.path).join(file.content).split(base).join(file.content)
    }, value)
    let documentText = replaceAsset(html)
    const style = '<style>' + replaceAsset(css).replace(/<\\/style/gi, '<\\\\/style') + '</style>'
    const script = '<script>' + replaceAsset(javascript).replace(/<\\/script/gi, '<\\\\/script') + '<\\/script>'
    if (/<head[^>]*>/i.test(documentText)) documentText = documentText.replace(/<head([^>]*)>/i, '<head$1>' + style)
    else documentText = style + documentText
    if (/<\\/body>/i.test(documentText)) documentText = documentText.replace(/<\\/body>/i, script + '</body>')
    else documentText += script
    return documentText
  }, [html, css, javascript, files, previewKey])

  const currentCode = language === 'python' ? python : language === 'java' ? java : html
  const setCurrentCode = language === 'python' ? setPython : language === 'java' ? setJava : setHtml

  return <main className="studio-workspace">
    <header className="studio-topbar">
      <button className="studio-back" onClick={onBack} aria-label="Back to OzooNotes">← <span>Simulator</span></button>
      <div className="studio-brand"><span className="studio-brand-mark">&lt;/&gt;</span><span><strong>Code Studio</strong><small>Local coding workspace</small></span></div>
      <div className="studio-actions"><label className="studio-language-picker"><span className="sr-only">Language</span><select aria-label="Choose coding simulator" value={language} onChange={(event) => { setLanguage(event.target.value as CodeMode); setStatus('Ready'); setOutput('Run your program to see output here.') }}><option value="python">Python</option><option value="java">Java</option><option value="web">HTML · CSS · JavaScript</option></select></label><button className="studio-reset" onClick={resetCurrent}>Reset</button><button className="studio-run" onClick={runProgram} disabled={running}><span>{running ? '◌' : language === 'web' ? '↻' : '▶'}</span>{running ? status : language === 'web' ? 'Run preview' : 'Run code'}</button></div>
    </header>
    <section className="studio-heading"><div><p>SIMULATOR / {language === 'web' ? 'WEB STUDIO' : language.toUpperCase()}</p><h1>{language === 'web' ? 'Build a web page.' : language === 'python' ? 'Write Python.' : 'Write Java.'}</h1><span>Code and project files save in this browser on this device.</span></div><span className="studio-local-badge"><i /> Local execution</span></section>
    <section className={'studio-panels ' + (language === 'web' ? 'studio-web-layout' : '')}>
      <article className="studio-editor-panel">
        <div className="studio-panel-head"><span><i className="studio-file-dot" />{language === 'web' ? 'Web project' : language === 'python' ? 'main.py' : 'Main.java'}</span><div><span>UTF-8</span><span>{language === 'web' ? 'HTML / CSS / JS' : language.toUpperCase()}</span></div></div>
        <div className="studio-files-bar"><div><strong>Project files</strong><small>{files.length ? files.length + ' files stored on this device' : 'Add source files, libraries, or images'}</small></div><div className="studio-file-actions"><button onClick={() => fileInputRef.current?.click()}>Add files</button><button onClick={() => folderInputRef.current?.click()}>Add folder</button></div><input ref={fileInputRef} className="studio-hidden-input" type="file" multiple aria-label="Add project files" onChange={(event) => { void importFiles(event.currentTarget.files) }} /><input ref={(node) => { folderInputRef.current = node; if (node) node.setAttribute('webkitdirectory', '') }} className="studio-hidden-input" type="file" multiple aria-label="Add project folder" onChange={(event) => { void importFiles(event.currentTarget.files) }} /></div>
        {notice && <div className="studio-notice" role="status">{notice}</div>}
        {files.length > 0 && <div className="studio-file-list">{files.map((file) => <span key={file.path} title={file.path}>{file.path}<button type="button" aria-label={'Remove ' + file.path} onClick={() => removeFile(file.path)}>×</button></span>)}</div>}
        {language === 'web' ? <>
          <div className="studio-code-tabs">{(['html', 'css', 'javascript'] as const).map((tab) => <button key={tab} className={webTab === tab ? 'active' : ''} onClick={() => setWebTab(tab)}>{tab === 'javascript' ? 'JavaScript' : tab.toUpperCase()}</button>)}</div>
          <div className="studio-code-area"><div className="studio-gutter">{(webTab === 'html' ? html : webTab === 'css' ? css : javascript).split('\n').map((_, index) => <span key={index}>{index + 1}</span>)}</div><textarea aria-label={webTab + ' code'} spellCheck={false} autoCapitalize="off" autoCorrect="off" value={webTab === 'html' ? html : webTab === 'css' ? css : javascript} onChange={(event) => { if (webTab === 'html') setHtml(event.target.value); else if (webTab === 'css') setCss(event.target.value); else setJavascript(event.target.value) }} /></div>
        </> : <div className="studio-code-area"><div className="studio-gutter">{currentCode.split('\n').map((_, index) => <span key={index}>{index + 1}</span>)}</div><textarea aria-label={language + ' code editor'} spellCheck={false} autoCapitalize="off" autoCorrect="off" value={currentCode} onChange={(event) => setCurrentCode(event.target.value)} /></div>}
        <footer className="studio-editor-foot"><span>Ctrl + Enter to {language === 'web' ? 'refresh preview' : 'run'}</span><span>{currentCode.length} characters</span></footer>
      </article>
      <article className="studio-output-panel">
        {language === 'web' ? <><div className="studio-panel-head"><span>Live preview</span><span className="studio-preview-safe">Sandboxed preview</span></div><iframe key={previewKey} title="Web project preview" className="studio-preview" sandbox="allow-scripts" srcDoc={previewDocument} /></> : <>
          <div className="studio-panel-head studio-output-head"><div className="studio-output-tabs"><button className="active">Output</button>{language === 'python' && <button onClick={() => document.getElementById('studio-input')?.focus()}>Program input</button>}</div><span className="studio-status"><i className={running ? 'busy' : ''} />{status}</span></div>
          {language === 'python' && <div className="studio-input-pane"><label htmlFor="studio-input">Standard input</label><textarea id="studio-input" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Optional input read by input()…" /><small>Enter values here before you run the program.</small></div>}
          <pre className="studio-output" aria-live="polite">{output}</pre>
          <div className="studio-console-foot"><span>Browser-based {language === 'python' ? 'Python' : 'Java'} · source stays on device</span><span>Saved locally</span></div>
        </>}
      </article>
    </section>
    <footer className="studio-note"><span>First run loads the selected browser runtime. Uploaded files stay in this browser’s local storage.</span><a href={language === 'python' ? 'https://pyodide.org/' : language === 'java' ? 'https://github.com/konsoletyper/teavm-javac' : undefined} target="_blank" rel="noreferrer">{language === 'web' ? 'HTML/CSS/JavaScript preview runs in a sandbox' : 'Runtime details ↗'}</a></footer>
  </main>
}

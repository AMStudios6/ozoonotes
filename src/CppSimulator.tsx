import { useEffect, useState } from 'react'
import './CppSimulator.css'

const STARTER = [
  '#include <iostream>',
  '#include <string>',
  '',
  'int main() {',
  '    std::string name;',
  '    std::cout << "What is your name? ";',
  '    std::getline(std::cin, name);',
  '    std::cout << "Hello, " << name << "!\\n";',
  '    return 0;',
  '}',
].join('\n')

const WORKER_SOURCE = [
  'self.onmessage = async (event) => {',
  '  const { source, stdin } = event.data;',
  '  try {',
  '    self.postMessage({ type: "status", value: "Loading C++ compiler…" });',
  '    const { compile } = await import("https://cdn.jsdelivr.net/npm/browsercc@0.1.1/dist/index.js");',
  '    self.postMessage({ type: "status", value: "Compiling C++20…" });',
  '    const result = await compile({ source, fileName: "main.cpp", flags: ["-std=c++20"] });',
  '    if (!result.module) { self.postMessage({ type: "result", ok: false, output: result.compileOutput || "Compilation failed." }); return; }',
  '    self.postMessage({ type: "status", value: "Running program…" });',
  '    let output = ""; let input = new TextEncoder().encode(stdin || ""); let inputOffset = 0; let instance;',
  '    const decoder = new TextDecoder();',
  '    const wasi = new Proxy({}, { get(_target, name) { return (...args) => {',
  '      const memory = new DataView(instance.exports.memory.buffer);',
  '      const write32 = (at, value) => memory.setUint32(at, value >>> 0, true);',
  '      if (name === "proc_exit") throw new Error("Program exited with code " + args[0]);',
  '      if (name === "fd_write") { const [fd, iovs, count, written] = args; let total = 0; for (let i = 0; i < count; i++) { const ptr = memory.getUint32(iovs + i * 8, true); const len = memory.getUint32(iovs + i * 8 + 4, true); output += decoder.decode(new Uint8Array(instance.exports.memory.buffer, ptr, len), { stream: true }); total += len; } write32(written, total); return 0; }',
  '      if (name === "fd_read") { const [fd, iovs, count, readAt] = args; let total = 0; for (let i = 0; i < count && inputOffset < input.length; i++) { const ptr = memory.getUint32(iovs + i * 8, true); const len = memory.getUint32(iovs + i * 8 + 4, true); const take = Math.min(len, input.length - inputOffset); new Uint8Array(instance.exports.memory.buffer, ptr, take).set(input.subarray(inputOffset, inputOffset + take)); inputOffset += take; total += take; } write32(readAt, total); return 0; }',
  '      if (name === "args_sizes_get" || name === "environ_sizes_get") { write32(args[0], 0); write32(args[1], 0); return 0; }',
  '      if (name === "args_get" || name === "environ_get" || name === "fd_close" || name === "sched_yield") return 0;',
  '      if (name === "fd_seek") { memory.setBigInt64(args[2], 0n, true); return 0; }',
  '      if (name === "fd_fdstat_get") { new Uint8Array(instance.exports.memory.buffer, args[1], 24).fill(0); memory.setUint8(args[1], 2); return 0; }',
  '      if (name === "clock_time_get") { memory.setBigUint64(args[2], BigInt(Date.now()) * 1000000n, true); return 0; }',
  '      if (name === "random_get") { crypto.getRandomValues(new Uint8Array(instance.exports.memory.buffer, args[0], args[1])); return 0; }',
  '      if (name === "fd_prestat_get" || name === "fd_prestat_dir_name") return 8;',
  '      return 0;',
  '    }; } });',
  '    const instantiated = await WebAssembly.instantiate(result.module, { wasi_snapshot_preview1: wasi }); instance = instantiated.instance;',
  '    try { const start = instance.exports._start; if (start) start(); else if (instance.exports.main) instance.exports.main(); }',
  '    catch (error) { if (!String(error).startsWith("Error: Program exited with code 0")) throw error; }',
  '    self.postMessage({ type: "result", ok: true, output: output || "(Program finished with no output.)", diagnostics: result.compileOutput || "" });',
  '  } catch (error) { self.postMessage({ type: "result", ok: false, output: error instanceof Error ? error.message : String(error) }); }',
  '};',
].join('\n')

function loadCode() {
  try { return localStorage.getItem('ozoo:cpp-code') || STARTER } catch { return STARTER }
}
function loadInput() {
  try { return localStorage.getItem('ozoo:cpp-stdin') || 'Ada Lovelace' } catch { return 'Ada Lovelace' }
}

export default function CppSimulator({ onBack }: { onBack: () => void }) {
  const [code, setCode] = useState(loadCode)
  const [stdin, setStdin] = useState(loadInput)
  const [output, setOutput] = useState('Run your C++ program to see the output here.')
  const [status, setStatus] = useState('Ready')
  const [running, setRunning] = useState(false)
  const [activeTab, setActiveTab] = useState<'output' | 'input'>('output')

  useEffect(() => { try { localStorage.setItem('ozoo:cpp-code', code) } catch {} }, [code])
  useEffect(() => { try { localStorage.setItem('ozoo:cpp-stdin', stdin) } catch {} }, [stdin])

  const runCode = () => {
    if (running) return
    setRunning(true)
    setOutput('')
    setStatus('Starting compiler…')
    const workerUrl = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }))
    const worker = new Worker(workerUrl)
    let deadline = window.setTimeout(() => {
      worker.terminate()
      URL.revokeObjectURL(workerUrl)
      setOutput('The C++ compiler took too long to load. Check your connection and try again.')
      setStatus('Compiler timeout')
      setRunning(false)
    }, 180_000)
    worker.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'status') {
        setStatus(event.data.value)
        if (event.data.value === 'Running program…') {
          window.clearTimeout(deadline)
          deadline = window.setTimeout(() => {
            worker.terminate()
            URL.revokeObjectURL(workerUrl)
            setOutput('Run stopped after 10 seconds. Check for an infinite loop and try again.')
            setStatus('Stopped · time limit')
            setRunning(false)
          }, 10_000)
        }
      }
      if (event.data.type === 'result') {
        window.clearTimeout(deadline)
        worker.terminate()
        URL.revokeObjectURL(workerUrl)
        setOutput(event.data.output || (event.data.ok ? '(Program finished with no output.)' : 'Compilation or runtime error.'))
        setStatus(event.data.ok ? 'Finished' : 'Error')
        setRunning(false)
      }
    }
    worker.onerror = (event) => {
      window.clearTimeout(deadline)
      worker.terminate()
      URL.revokeObjectURL(workerUrl)
      setOutput(event.message || 'The browser could not start the C++ compiler.')
      setStatus('Error')
      setRunning(false)
    }
    worker.postMessage({ source: code, stdin })
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.repeat) {
        event.preventDefault()
        runCode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const resetCode = () => {
    setCode(STARTER)
    setOutput('Starter code restored. Run it to see the output.')
    setStatus('Ready')
  }

  return <main className="cpp-workspace">
    <header className="cpp-topbar">
      <button className="cpp-back" onClick={onBack} aria-label="Back to OzooNotes">← <span>Simulator</span></button>
      <div className="cpp-brand"><span className="cpp-brand-mark">&lt;/&gt;</span><span><strong>Code Studio</strong><small>C++ playground</small></span></div>
      <div className="cpp-top-actions"><span className="cpp-language">C++20</span><button className="cpp-reset" onClick={resetCode}>Reset code</button><button className="cpp-run" onClick={runCode} disabled={running}><span>{running ? '◌' : '▶'}</span>{running ? 'Running…' : 'Run code'}</button></div>
    </header>
    <section className="cpp-heading"><div><p>SIMULATOR / C++</p><h1>Write. Run. Understand.</h1><span>Your code is compiled and run in this browser. Drafts save automatically on this device.</span></div><span className="cpp-local-badge"><i /> Local execution</span></section>
    <section className="cpp-panels">
      <article className="cpp-editor-panel">
        <div className="cpp-panel-head"><span><i className="cpp-file-dot" /> main.cpp</span><div><span>UTF-8</span><span>C++</span></div></div>
        <div className="cpp-editor">
          <div className="cpp-gutter" aria-hidden="true">{code.split('\n').map((_, i) => <span key={i}>{i + 1}</span>)}</div>
          <textarea value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} autoCapitalize="off" autoCorrect="off" aria-label="C++ source code editor" />
        </div>
        <footer className="cpp-editor-foot"><span>Ctrl + Enter to run</span><span>{code.length} characters</span></footer>
      </article>
      <article className="cpp-console-panel">
        <div className="cpp-panel-head cpp-console-head"><div className="cpp-tabs"><button className={activeTab === 'output' ? 'active' : ''} onClick={() => setActiveTab('output')}>Output</button><button className={activeTab === 'input' ? 'active' : ''} onClick={() => setActiveTab('input')}>Program input</button></div><span className={'cpp-run-status ' + (running ? 'busy' : '')}><i />{status}</span></div>
        {activeTab === 'output' ? <pre className="cpp-output" aria-live="polite">{output}</pre> : <div className="cpp-input-wrap"><label htmlFor="cpp-stdin">Standard input (stdin)</label><textarea id="cpp-stdin" value={stdin} onChange={(event) => setStdin(event.target.value)} placeholder="Type input your program reads with cin or getline…" /><small>Input is provided to the program when you press Run.</small></div>}
        <div className="cpp-console-foot"><span>Browser-based C++20 · no account needed</span><span>Draft saved locally</span></div>
      </article>
    </section>
    <footer className="cpp-note"><span>First run loads the C++ compiler and standard library into your browser; this download can take a little while.</span><a href="https://github.com/BertalanD/browsercc" target="_blank" rel="noreferrer">Compiler details ↗</a></footer>
  </main>
}

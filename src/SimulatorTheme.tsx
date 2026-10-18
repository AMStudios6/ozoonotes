import { useEffect, useState } from 'react'

export type SimulatorTheme = 'purple' | 'white-purple'

export const simulatorThemes: { id: SimulatorTheme; name: string }[] = [
  { id: 'purple', name: 'Purple & Black' },
  { id: 'white-purple', name: 'White & Purple' },
]

function readTheme(): SimulatorTheme {
  try {
    const saved = localStorage.getItem('ozoo:color-theme') as SimulatorTheme | null
    return simulatorThemes.some((theme) => theme.id === saved) ? saved! : 'purple'
  } catch { return 'forest' }
}

export function useSimulatorTheme(): [SimulatorTheme, (theme: SimulatorTheme) => void] {
  const [theme, setTheme] = useState<SimulatorTheme>(readTheme)
  useEffect(() => {
    const syncTheme = (event: Event) => {
      const nextTheme = (event as CustomEvent<SimulatorTheme>).detail
      if (simulatorThemes.some((item) => item.id === nextTheme)) setTheme(nextTheme)
    }
    window.addEventListener('ozoo:color-theme-change', syncTheme)
    return () => window.removeEventListener('ozoo:color-theme-change', syncTheme)
  }, [])
  const updateTheme = (nextTheme: SimulatorTheme) => {
    setTheme(nextTheme)
    try { localStorage.setItem('ozoo:color-theme', nextTheme) } catch {}
    window.dispatchEvent(new CustomEvent<SimulatorTheme>('ozoo:color-theme-change', { detail: nextTheme }))
  }
  return [theme, updateTheme]
}

export function SimulatorThemePicker({ theme, onChange }: {
  theme: SimulatorTheme
  onChange: (theme: SimulatorTheme) => void
}) {
  return <label className="simulator-theme-picker"><span className="sr-only">Simulator theme</span><select aria-label="Simulator theme" value={theme} onChange={(event) => onChange(event.target.value as SimulatorTheme)}>{simulatorThemes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
}

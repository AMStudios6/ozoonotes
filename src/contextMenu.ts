type MenuAction = { label: string; run: () => void; disabled?: boolean; danger?: boolean; shortcut?: string }

const menuId = 'ozoo-custom-context-menu'
const styleId = 'ozoo-custom-context-menu-style'

function isEditable(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null
  return target.closest<HTMLElement>('input:not([type="checkbox"]):not([type="radio"]), textarea, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')
}

function visibleButton(selector: string): HTMLButtonElement | null {
  const button = document.querySelector<HTMLButtonElement>(selector)
  return button && !button.disabled && button.getClientRects().length ? button : null
}

function findButton(pattern: RegExp): HTMLButtonElement | null {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
    !button.disabled && button.getClientRects().length && [
      button.getAttribute('aria-label'), button.title, button.innerText,
    ].some((label) => !!label && pattern.test(label.trim())),
  ) ?? null
}

function dispatchShortcut(key: string, options: { ctrlKey?: boolean; shiftKey?: boolean } = {}) {
  const target = document.activeElement ?? document
  target.dispatchEvent(new KeyboardEvent('keydown', {
    key, bubbles: true, cancelable: true, ctrlKey: options.ctrlKey ?? false,
    shiftKey: options.shiftKey ?? false, metaKey: navigator.platform.toLowerCase().includes('mac'),
  }))
}

function selectedText() {
  const active = document.activeElement
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    return active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? 0)
  }
  return window.getSelection()?.toString() ?? ''
}

async function pasteInto(element: HTMLElement | null) {
  try {
    const text = await navigator.clipboard.readText()
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      const start = element.selectionStart ?? element.value.length
      const end = element.selectionEnd ?? start
      element.setRangeText(text, start, end, 'end')
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.focus()
    } else if (element?.isContentEditable) {
      element.focus()
      document.execCommand('insertText', false, text)
    } else {
      dispatchShortcut('v', { ctrlKey: true })
    }
  } catch {
    dispatchShortcut('v', { ctrlKey: true })
  }
}

function createMenuElement() {
  let style = document.getElementById(styleId) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = styleId
    style.textContent = '#ozoo-custom-context-menu{position:fixed;z-index:2147483000;min-width:204px;padding:6px;background:#17201b;color:#edf6ef;border:1px solid #3b5142;border-radius:10px;box-shadow:0 14px 38px #0007;font:500 13px/1.3 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;user-select:none}#ozoo-custom-context-menu[hidden]{display:none}#ozoo-custom-context-menu .ozoo-menu-heading{padding:7px 10px 6px;color:#9cb2a1;font-size:10px;font-weight:750;letter-spacing:.12em;text-transform:uppercase}#ozoo-custom-context-menu button{display:flex;width:100%;align-items:center;justify-content:space-between;gap:18px;padding:8px 10px;border:0;border-radius:6px;background:transparent;color:inherit;text-align:left;font:inherit;cursor:pointer}#ozoo-custom-context-menu button:hover,#ozoo-custom-context-menu button:focus-visible{outline:0;background:#284231;color:#8befa2}#ozoo-custom-context-menu button[disabled]{opacity:.42;cursor:default}#ozoo-custom-context-menu button.ozoo-danger:hover{background:#492a28;color:#ff9c90}#ozoo-custom-context-menu kbd{color:#a5b4aa;font:10px ui-monospace,monospace}#ozoo-custom-context-menu .ozoo-menu-divider{height:1px;margin:5px 4px;background:#334238}'
    document.head.append(style)
  }
  let menu = document.getElementById(menuId) as HTMLDivElement | null
  if (!menu) {
    menu = document.createElement('div')
    menu.id = menuId
    menu.setAttribute('role', 'menu')
    menu.setAttribute('aria-label', 'OzooNotes context menu')
    menu.hidden = true
    document.body.append(menu)
  }
  return menu
}

function makeActions(target: HTMLElement | null): MenuAction[] {
  const editable = isEditable(target)
  const undo = findButton(/^undo$/i)
  const redo = findButton(/^redo$/i)
  const actions: MenuAction[] = [
    { label: 'Undo', run: () => undo ? undo.click() : dispatchShortcut('z', { ctrlKey: true }), disabled: !undo && !editable, shortcut: 'Ctrl+Z' },
    { label: 'Redo', run: () => redo ? redo.click() : dispatchShortcut('y', { ctrlKey: true }), disabled: !redo && !editable, shortcut: 'Ctrl+Y' },
  ]
  if (editable) {
    const selection = selectedText()
    actions.push(
      { label: 'Cut', run: () => { if (selectedText()) document.execCommand('cut') }, disabled: !selection, shortcut: 'Ctrl+X' },
      { label: 'Copy', run: () => { if (selectedText()) document.execCommand('copy') }, disabled: !selection, shortcut: 'Ctrl+C' },
      { label: 'Paste', run: () => { void pasteInto(editable) }, shortcut: 'Ctrl+V' },
      { label: 'Select all', run: () => { editable.focus(); if ('select' in editable && typeof (editable as HTMLInputElement).select === 'function') (editable as HTMLInputElement).select(); else { const range = document.createRange(); range.selectNodeContents(editable); const currentSelection = window.getSelection(); currentSelection?.removeAllRanges(); currentSelection?.addRange(range) } }, shortcut: 'Ctrl+A' },
    )
  } else {
    const addPage = visibleButton('button[aria-label="Add page"]')
    const deleteSelection = findButton(/delete (selected|component|wire|selection)|delete$/i)
    const zoomIn = visibleButton('button[aria-label="Zoom in"]')
    const zoomOut = visibleButton('button[aria-label="Zoom out"]')
    const run = findButton(/^(▶\s*)?(simulate|run)(\s+code)?$/i)
    if (addPage) actions.push({ label: 'Add page', run: () => addPage.click() })
    if (deleteSelection) actions.push({ label: 'Delete selected', run: () => deleteSelection.click(), danger: true, shortcut: 'Del' })
    if (zoomIn) actions.push({ label: 'Zoom in', run: () => zoomIn.click(), shortcut: '+' })
    if (zoomOut) actions.push({ label: 'Zoom out', run: () => zoomOut.click(), shortcut: '−' })
    if (run) actions.push({ label: 'Run / simulate', run: () => run.click(), shortcut: 'Ctrl+↵' })
    actions.push({ label: 'Select all', run: () => { document.execCommand('selectAll') }, shortcut: 'Ctrl+A' })
  }
  if (target?.closest('.app')) {
    actions.push({
      label: 'Keyboard shortcuts',
      run: () => window.dispatchEvent(new CustomEvent('ozoo:open-shortcuts')),
      shortcut: '?',
    })
  }
  return actions
}

function renderMenu(menu: HTMLDivElement, target: HTMLElement | null, x: number, y: number) {
  const actions = makeActions(target)
  menu.replaceChildren()
  const heading = document.createElement('div')
  heading.className = 'ozoo-menu-heading'
  heading.textContent = target?.closest('.circuit-workspace') ? 'Circuit tools' : target?.closest('.graph-workspace') ? 'Graph tools' : target?.closest('.studio-workspace, .cpp-workspace') ? 'Code tools' : 'Page tools'
  menu.append(heading)
  const divider = document.createElement('div')
  divider.className = 'ozoo-menu-divider'
  divider.setAttribute('role', 'separator')
  actions.forEach((action, index) => {
    if (index === 2 && actions.length > 2) menu.append(divider)
    const button = document.createElement('button')
    button.type = 'button'
    button.setAttribute('role', 'menuitem')
    button.disabled = !!action.disabled
    if (action.danger) button.className = 'ozoo-danger'
    button.textContent = action.label
    if (action.shortcut) {
      const shortcut = document.createElement('kbd')
      shortcut.textContent = action.shortcut
      button.append(shortcut)
    }
    button.addEventListener('click', () => {
      menu.hidden = true
      action.run()
    })
    menu.append(button)
  })
  menu.hidden = false
  const bounds = menu.getBoundingClientRect()
  menu.style.left = Math.max(8, Math.min(x, innerWidth - bounds.width - 8)) + 'px'
  menu.style.top = Math.max(8, Math.min(y, innerHeight - bounds.height - 8)) + 'px'
  menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true })
}

export function installAppContextMenu() {
  const menu = createMenuElement()
  const hide = () => { menu.hidden = true }
  const onContextMenu = (event: MouseEvent) => {
    const eventTarget = event.target
    const target = eventTarget instanceof HTMLElement
      ? eventTarget
      : eventTarget instanceof SVGElement
        ? eventTarget.parentElement
        : null
    if (!target) return
    event.preventDefault()
    const bounds = target.getBoundingClientRect()
    const x = event.clientX || bounds.left + bounds.width / 2
    const y = event.clientY || bounds.top + bounds.height / 2
    renderMenu(menu, target, x, y)
  }
  const onPointerDown = (event: PointerEvent) => {
    if (!menu.contains(event.target as Node)) hide()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') hide()
    if (menu.hidden) return
    const buttons = [...menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      buttons[(current + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus()
    } else if (event.key === 'Tab') hide()
  }
  document.addEventListener('contextmenu', onContextMenu)
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeyDown)
  return () => {
    document.removeEventListener('contextmenu', onContextMenu)
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('keydown', onKeyDown)
    menu.remove()
    document.getElementById(styleId)?.remove()
  }
}

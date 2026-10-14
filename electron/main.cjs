const path = require('node:path')
const { app, BrowserWindow, dialog, session, shell } = require('electron')

let mainWindow
const hostedAppUrl = 'https://amstudios6.github.io/ozoonotes/'
const hostedAppOrigin = new URL(hostedAppUrl).origin

function openExternalUrl(rawUrl) {
  try {
    const url = new URL(rawUrl)
    if (url.protocol === 'https:' || url.protocol === 'http:') void shell.openExternal(url.href)
  } catch {
    // Ignore malformed links instead of passing them to the operating system.
  }
}

function configureDownloads() {
  session.defaultSession.on('will-download', (event, item, contents) => {
    if (contents !== mainWindow?.webContents) return

    const filename = item.getFilename() || 'OzooNotes-export'
    const extension = path.extname(filename).slice(1).toLowerCase()
    const filters = extension
      ? [{ name: `${extension.toUpperCase()} files`, extensions: [extension] }, { name: 'All files', extensions: ['*'] }]
      : [{ name: 'All files', extensions: ['*'] }]

    item.setSaveDialogOptions({
      title: 'Save OzooNotes file',
      defaultPath: path.join(app.getPath('documents'), filename),
      buttonLabel: 'Save',
      filters,
    })
  })
}

function createWindow() {
  const developmentUrl = 'http://127.0.0.1:5173'
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 760,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#111018',
    title: 'OzooNotes',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalUrl(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    let isAppNavigation = false
    try {
      const target = new URL(url)
      isAppNavigation = app.isPackaged
        ? target.origin === hostedAppOrigin && target.pathname.startsWith('/ozoonotes/')
        : target.origin === developmentUrl
    } catch {
      isAppNavigation = false
    }
    if (isAppNavigation) return
    event.preventDefault()
    openExternalUrl(url)
  })
  mainWindow.on('closed', () => { mainWindow = null })

  if (app.isPackaged) {
    // Fetch the current GitHub Pages build each time the desktop app opens.
    void session.defaultSession.clearCache().catch(() => {}).finally(() => {
      if (!mainWindow?.isDestroyed()) void mainWindow.loadURL(hostedAppUrl)
    })
  } else {
    void mainWindow.loadURL(developmentUrl)
  }
}

const hasSingleInstance = app.requestSingleInstanceLock()
if (!hasSingleInstance) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(() => {
    app.setAppUserModelId('com.amstudios.ozooonotes')
    configureDownloads()
    createWindow()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })

  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
}


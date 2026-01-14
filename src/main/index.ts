import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

// Notes persistence
interface Note {
  id: string
  title: string
  content: string
}

interface AppSettings {
  wpm: number
  adaptWordLength: boolean
  adaptPunctuation: boolean
  adaptComplexity: boolean
  trainingMode: boolean
}

// Default notes for first launch
const defaultNotes: Note[] = [
  {
    id: crypto.randomUUID(),
    title: 'Welcome to Readly',
    content:
      'Readly is a modern speed-reading environment designed for maximum retention. By using the Optimal Recognition Point technique, we highlight the character your eye naturally focuses on for fastest word recognition. This helps you read faster while maintaining comprehension. Try pasting an article or book chapter to experience rapid serial visual presentation at its finest.'
  },
  {
    id: crypto.randomUUID(),
    title: 'Chapter 1: The Signal',
    content:
      'The first signal arrived at 3:47 AM on a Tuesday, buried in the background radiation of a dying star. Dr. Elena Vasquez almost missed it. She had been running the same deep-space monitoring routine for eleven years, watching the same empty quadrant of sky, logging the same cosmic silence. But tonight, something was different. The waveform on her screen pulsed with an unmistakable rhythm. Not random. Not natural. Structured. She reached for her coffee with trembling hands, knocking it across her keyboard. She barely noticed. In forty years of SETI research, humanity had never received a verified extraterrestrial signal. Now she was staring at one, alone in a basement laboratory in New Mexico, while the rest of the world slept. The signal repeated every 73 seconds, a prime number that ruled out any natural phenomenon. Within its carrier wave, she detected layers of embedded data, compressed information dense enough to fill libraries. Her first instinct was to call Director Morrison. Her second instinct, the one she followed, was to keep listening. The signal was changing. Adapting. As if it knew someone was finally paying attention. Three hours later, when the sun rose over the desert, Elena had decoded the first fragment. It was a warning.'
  },
  {
    id: crypto.randomUUID(),
    title: 'Chapter 2: The Awakening',
    content:
      'Commander Jin Park had been in cryosleep for 847 years when the ship decided to wake him. The Meridian was an ark, built to carry twelve thousand colonists across the void between stars. Jin was not a colonist. He was a failsafe, one of six military officers frozen in a separate bay, to be revived only if something went catastrophically wrong. The revival chamber hissed as it equalized pressure. Jin gasped, lungs burning with recycled air that tasted like copper and regret. Emergency lights painted everything in shades of red. A synthetic voice spoke calmly in his ear. "Commander Park, you have been revived due to Protocol Seven. Ship integrity is at 34 percent. Crew casualties exceed acceptable parameters. Please report to the bridge." Jin pulled himself from the pod, muscles screaming after nearly a millennium of stillness. The corridor outside was damaged, hull panels buckled inward, scorch marks climbing the walls like black ivy. He found the first body twenty meters from his chamber. Then another. Then dozens more. Whatever had happened to the Meridian, it had happened fast, and it had been violent. On the bridge, he discovered the truth. The navigation display showed their position, impossibly far from their plotted course. They had not drifted. They had been moved. Taken. And through the main viewport, hanging in the darkness like a wound in space itself, Jin saw what had taken them. It was alive. It was waiting. And it was older than the stars.'
  }
]

function getDataPath(): string {
  const dataDir = join(app.getPath('userData'), 'data')
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true })
  }
  return dataDir
}

function initializeDefaultNotes(): void {
  const filePath = join(getDataPath(), 'notes.json')
  if (!existsSync(filePath)) {
    console.log('First launch: initializing default notes')
    writeFileSync(filePath, JSON.stringify(defaultNotes, null, 2), 'utf-8')
  }
}

function loadNotes(): Note[] {
  const filePath = join(getDataPath(), 'notes.json')
  try {
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Failed to load notes:', error)
  }
  return []
}

function saveNotes(notes: Note[]): boolean {
  const filePath = join(getDataPath(), 'notes.json')
  try {
    writeFileSync(filePath, JSON.stringify(notes, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error('Failed to save notes:', error)
    return false
  }
}

function loadSettings(): AppSettings | null {
  const filePath = join(getDataPath(), 'settings.json')
  try {
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Failed to load settings:', error)
  }
  return null
}

function saveSettings(settings: AppSettings): boolean {
  const filePath = join(getDataPath(), 'settings.json')
  try {
    writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error('Failed to save settings:', error)
    return false
  }
}

// IPC handlers
ipcMain.handle('notes:load', () => loadNotes())
ipcMain.handle('notes:save', (_, notes: Note[]) => saveNotes(notes))
ipcMain.handle('settings:load', () => loadSettings())
ipcMain.handle('settings:save', (_, settings: AppSettings) => saveSettings(settings))

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 16 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron.readly')

  // Initialize default notes on first launch
  initializeDefaultNotes()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

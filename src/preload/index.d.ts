import { ElectronAPI } from '@electron-toolkit/preload'

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

interface ReadlyAPI {
  loadNotes: () => Promise<Note[]>
  saveNotes: (notes: Note[]) => Promise<boolean>
  loadSettings: () => Promise<AppSettings | null>
  saveSettings: (settings: AppSettings) => Promise<boolean>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ReadlyAPI
  }
}

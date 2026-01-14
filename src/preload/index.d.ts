import { ElectronAPI } from '@electron-toolkit/preload'

interface Note {
  id: string
  title: string
  content: string
  folderId: string | null
  order: number
}

interface Folder {
  id: string
  name: string
  parentId: string | null
  collapsed: boolean
  order: number
}

interface AppData {
  folders: Folder[]
  notes: Note[]
}

interface AppSettings {
  wpm: number
  adaptWordLength: boolean
  adaptPunctuation: boolean
  adaptComplexity: boolean
  trainingMode: boolean
}

interface ReadlyAPI {
  loadData: () => Promise<AppData>
  saveData: (data: AppData) => Promise<boolean>
  loadSettings: () => Promise<AppSettings | null>
  saveSettings: (settings: AppSettings) => Promise<boolean>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: ReadlyAPI
  }
}

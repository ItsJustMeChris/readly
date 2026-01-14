import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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

const api = {
  loadData: (): Promise<AppData> => ipcRenderer.invoke('data:load'),
  saveData: (data: AppData): Promise<boolean> => ipcRenderer.invoke('data:save', data),
  loadSettings: (): Promise<AppSettings | null> => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: AppSettings): Promise<boolean> => ipcRenderer.invoke('settings:save', settings)
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

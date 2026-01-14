import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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

const api = {
  loadNotes: (): Promise<Note[]> => ipcRenderer.invoke('notes:load'),
  saveNotes: (notes: Note[]): Promise<boolean> => ipcRenderer.invoke('notes:save', notes),
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

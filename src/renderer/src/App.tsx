import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Plus,
  FolderPlus,
  ChevronDown,
  Folder,
  X,
  Trash2,
  RotateCcw,
  PanelLeft,
  Play,
  Pause,
  Settings,
  Sun,
  Check
} from 'lucide-react'
import MarkdownEditor from './components/MarkdownEditor'

// Helper to strip HTML tags and get plain text (preserves block element separation)
function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Add newlines after block elements to preserve visual separation
  const blockElements = doc.body.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, br, div')
  blockElements.forEach(el => {
    el.appendChild(document.createTextNode('\n'))
  })
  return doc.body.textContent || ''
}

// Strip markdown syntax from text
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')        // Headings
    .replace(/\*\*([^*]+)\*\*/g, '$1')  // Bold
    .replace(/\*([^*]+)\*/g, '$1')      // Italic
    .replace(/__([^_]+)__/g, '$1')      // Bold alt
    .replace(/_([^_]+)_/g, '$1')        // Italic alt
    .replace(/`([^`]+)`/g, '$1')        // Inline code
    .replace(/~~([^~]+)~~/g, '$1')      // Strikethrough
    .replace(/^\s*[-*+]\s+/gm, '')      // List items
    .replace(/^\s*\d+\.\s+/gm, '')      // Numbered lists
    .replace(/^\s*>\s*/gm, '')          // Blockquotes
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
    .trim()
}

// Get the first line of content as the title
function getFirstLine(content: string): string {
  const text = stripMarkdown(content).trim()
  const firstLine = text.split('\n')[0]?.trim() || ''
  return firstLine.slice(0, 100) // Limit length
}

interface Note {
  id: string
  title: string
  content: string
  folderId: string | null
  previousFolderId?: string | null  // Stores original location when trashed
  order: number
}

interface Folder {
  id: string
  name: string
  parentId: string | null
  collapsed: boolean
  order: number
}

// Special folder ID for trash - notes here are "soft deleted"
const TRASH_FOLDER_ID = '__trash__'

// ORP (Optimal Recognition Point) calculator
function getORP(word: string) {
  const len = word.length
  let index = 0
  if (len <= 1) index = 0
  else if (len <= 5) index = 1
  else if (len <= 9) index = 2
  else if (len <= 13) index = 3
  else index = 4

  return {
    prefix: word.substring(0, index),
    char: word.substring(index, index + 1),
    suffix: word.substring(index + 1)
  }
}

// Common words that should be displayed faster
const commonWords = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
  'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
  'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'under', 'again', 'further', 'then', 'once', 'here',
  'there', 'when', 'where', 'why', 'how', 'all', 'each', 'every',
  'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
  'and', 'but', 'if', 'or', 'because', 'until', 'while', 'although',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
  'this', 'that', 'these', 'those', 'am', 'its', 'my', 'your', 'his', 'her'
])

interface AdaptiveOptions {
  baseWpm: number
  adaptWordLength: boolean
  adaptPunctuation: boolean
  adaptComplexity: boolean
}

function calculateWordDelay(word: string, options: AdaptiveOptions): number {
  const baseMs = 60000 / options.baseWpm
  let delay = baseMs

  // Word length adaptation: longer words get more time
  if (options.adaptWordLength) {
    const cleanWord = word.replace(/[^\w]/g, '')
    const lengthPenalty = Math.max(0, cleanWord.length - 5) * 12
    delay += lengthPenalty
  }

  // Punctuation adaptation: pause at sentence/clause boundaries
  if (options.adaptPunctuation) {
    if (/[.!?]$/.test(word)) {
      delay += 150 // End of sentence
    } else if (/[,;:]$/.test(word)) {
      delay += 80 // Clause boundary
    } else if (/[-—]$/.test(word)) {
      delay += 50 // Dash pause
    }
  }

  // Complexity adaptation: uncommon words get more time
  if (options.adaptComplexity) {
    const cleanWord = word.replace(/[^\w]/g, '').toLowerCase()
    if (!commonWords.has(cleanWord)) {
      delay *= 1.2 // 20% more time for uncommon words
    }
  }

  return delay
}

// Theme definitions (open source themes only)
const themes = [
  { id: 'default', name: 'Midnight', description: 'Deep black with indigo accents' },
  { id: 'high-contrast', name: 'High Contrast', description: 'Maximum readability' },
  { id: 'charcoal', name: 'Charcoal', description: 'Soft charcoal grays' },
  { id: 'solarized-light', name: 'Solarized Light', description: 'Precision colors for light background' },
  { id: 'solarized-dark', name: 'Solarized Dark', description: 'Precision colors for dark background' },
  { id: 'gotham', name: 'Gotham', description: 'Dark city vibes' },
  { id: 'dracula', name: 'Dracula', description: 'Dark theme with vibrant colors' },
  { id: 'cobalt', name: 'Cobalt', description: 'Deep blue elegance' },
  { id: 'duotone-light', name: 'Duotone Light', description: 'Two-tone light palette' },
  { id: 'duotone-snow', name: 'Duotone Snow', description: 'Crisp winter whites' },
  { id: 'duotone-heat', name: 'Duotone Heat', description: 'Warm sunset tones' },
  { id: 'ayu', name: 'Ayu', description: 'Warm dark theme' },
  { id: 'ayu-mirage', name: 'Ayu Mirage', description: 'Muted dark blue palette' },
  { id: 'nord-light', name: 'Nord Light', description: 'Arctic light palette' },
  { id: 'nord', name: 'Nord', description: 'Arctic, north-bluish palette' },
  { id: 'lighthaus', name: 'Lighthaus', description: 'Focused dark theme' },
  { id: 'rose-pine', name: 'Rosé Pine', description: 'Soho vibes, dark' },
  { id: 'rose-pine-dawn', name: 'Rosé Pine Dawn', description: 'Soho vibes, light' },
  { id: 'tokyo-night', name: 'Tokyo Night', description: 'Neon city nights' },
  { id: 'tokyo-night-light', name: 'Tokyo Night Light', description: 'Bright Tokyo morning' },
  { id: 'atom', name: 'Atom', description: 'Classic editor dark' },
  { id: 'one-dark', name: 'One Dark', description: 'Atom One Dark theme' },
  { id: 'gruvbox', name: 'Gruvbox', description: 'Retro groove colors' },
  { id: 'catppuccin-latte', name: 'Catppuccin Latte', description: 'Soothing pastel light' },
  { id: 'catppuccin-macchiato', name: 'Catppuccin Macchiato', description: 'Soothing pastel dark' },
  { id: 'everforest-dark', name: 'Everforest Dark', description: 'Forest greens, dark' },
  { id: 'everforest-light', name: 'Everforest Light', description: 'Forest greens, light' },
] as const

type ThemeId = typeof themes[number]['id']

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [notes, setNotes] = useState<Note[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [activeNoteId, setActiveNoteId] = useState<string>('')
  const [isLoaded, setIsLoaded] = useState(false)
  const [draggedItem, setDraggedItem] = useState<{ id: string; type: 'note' | 'folder' } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; type: 'folder' | 'root' } | null>(null)
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [trashCollapsed, setTrashCollapsed] = useState(true)

  // Theme state
  const [theme, setTheme] = useState<ThemeId>('default')
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [themeSearch, setThemeSearch] = useState('')
  const [themeHighlightIndex, setThemeHighlightIndex] = useState(0)
  const themeMenuRef = useRef<HTMLDivElement>(null)
  const themeListRef = useRef<HTMLDivElement>(null)

  // Reader state
  const [readerOpen, setReaderOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [wpm, setWpm] = useState(300)
  const [words, setWords] = useState<string[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)
  const [controlsHovered, setControlsHovered] = useState(false)

  // Adaptive reading toggles
  const [adaptWordLength, setAdaptWordLength] = useState(true)
  const [adaptPunctuation, setAdaptPunctuation] = useState(true)
  const [adaptComplexity, setAdaptComplexity] = useState(false)
  const [trainingMode, setTrainingMode] = useState(false)
  const [trainingIncrement] = useState(10) // WPM increase per 50 words
  const startWpmRef = useRef(wpm)

  // Apply theme to document
  useEffect(() => {
    if (theme === 'default') {
      document.documentElement.removeAttribute('data-theme')
    } else {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }, [theme])

  const activeNote = notes.find((n) => n.id === activeNoteId)

  // Load data and settings on mount
  useEffect(() => {
    const loadAppData = async () => {
      // Check if API is available
      if (!window.api || typeof window.api.loadData !== 'function') {
        console.error('window.api not available:', window.api)
        setIsLoaded(true)
        return
      }

      try {
        const savedData = await window.api.loadData()
        const savedSettings = await window.api.loadSettings()

        if (savedData) {
          setNotes(savedData.notes || [])
          setFolders(savedData.folders || [])
          if (savedData.notes && savedData.notes.length > 0) {
            setActiveNoteId(savedData.notes[0].id)
          }
        }

        // Apply saved settings if available
        if (savedSettings) {
          setWpm(savedSettings.wpm)
          setAdaptWordLength(savedSettings.adaptWordLength)
          setAdaptPunctuation(savedSettings.adaptPunctuation)
          setAdaptComplexity(savedSettings.adaptComplexity)
          setTrainingMode(savedSettings.trainingMode)
          if (savedSettings.theme) setTheme(savedSettings.theme)
        }
      } catch (error) {
        console.error('Failed to load data:', error)
      }
      setIsLoaded(true)
    }
    loadAppData()
  }, [])

  // Save data when notes or folders change (debounced)
  const isInitialMount = useRef(true)
  useEffect(() => {
    if (!isLoaded || !window.api?.saveData) return
    // Skip saving on initial load
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    const timeoutId = setTimeout(() => {
      console.log('Saving data to disk...')
      window.api.saveData({ folders, notes }).then(() => {
        console.log('Data saved!')
      })
    }, 500)
    return () => clearTimeout(timeoutId)
  }, [notes, folders, isLoaded])

  // Save settings when they change
  useEffect(() => {
    if (!isLoaded || !window.api?.saveSettings) return
    const timeoutId = setTimeout(() => {
      window.api.saveSettings({
        wpm,
        adaptWordLength,
        adaptPunctuation,
        adaptComplexity,
        trainingMode,
        theme
      })
    }, 500)
    return () => clearTimeout(timeoutId)
  }, [wpm, adaptWordLength, adaptPunctuation, adaptComplexity, trainingMode, theme, isLoaded])

  // Close theme menu when clicking outside
  useEffect(() => {
    if (!themeMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(e.target as Node)) {
        setThemeMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [themeMenuOpen])

  // Get the next order value for items at a level
  const getNextOrder = (parentId: string | null, type: 'note' | 'folder') => {
    if (type === 'note') {
      const notesAtLevel = notes.filter(n => n.folderId === parentId)
      return notesAtLevel.length > 0 ? Math.max(...notesAtLevel.map(n => n.order)) + 1 : 0
    } else {
      const foldersAtLevel = folders.filter(f => f.parentId === parentId)
      return foldersAtLevel.length > 0 ? Math.max(...foldersAtLevel.map(f => f.order)) + 1 : 0
    }
  }

  const createNote = (folderId: string | null = null) => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: '',
      content: '',
      folderId,
      order: getNextOrder(folderId, 'note')
    }
    setNotes([newNote, ...notes])
    setActiveNoteId(newNote.id)
  }

  const updateNote = (id: string, updates: Partial<Note>) => {
    setNotes(notes.map((n) => (n.id === id ? { ...n, ...updates } : n)))
  }

  const deleteNote = (id: string) => {
    const note = notes.find((n) => n.id === id)
    if (!note) return

    // If note is already in trash, permanently delete it
    if (note.folderId === TRASH_FOLDER_ID) {
      const filtered = notes.filter((n) => n.id !== id)
      setNotes(filtered)
      if (activeNoteId === id) {
        // Select another note in trash, or first note overall, or none
        const trashNotes = filtered.filter((n) => n.folderId === TRASH_FOLDER_ID)
        if (trashNotes.length > 0) {
          setActiveNoteId(trashNotes[0].id)
        } else if (filtered.length > 0) {
          setActiveNoteId(filtered[0].id)
        } else {
          setActiveNoteId(null)
        }
      }
    } else {
      // Move note to trash (soft delete), storing original location
      setNotes(notes.map((n) => n.id === id ? { ...n, previousFolderId: n.folderId, folderId: TRASH_FOLDER_ID } : n))
      if (activeNoteId === id) {
        // Select another note not in trash
        const remaining = notes.filter((n) => n.id !== id && n.folderId !== TRASH_FOLDER_ID)
        setActiveNoteId(remaining.length > 0 ? remaining[0].id : null)
      }
    }
  }

  const createFolder = (parentId: string | null = null) => {
    const newFolder: Folder = {
      id: crypto.randomUUID(),
      name: 'New Folder',
      parentId,
      collapsed: false,
      order: getNextOrder(parentId, 'folder')
    }
    setFolders([...folders, newFolder])
    setEditingFolderId(newFolder.id)
  }

  const updateFolder = (id: string, updates: Partial<Folder>) => {
    setFolders(folders.map((f) => (f.id === id ? { ...f, ...updates } : f)))
  }

  const deleteFolder = (id: string) => {
    const folder = folders.find(f => f.id === id)
    const newParentId = folder?.parentId ?? null

    // Move child folders up to parent
    setFolders(folders
      .filter(f => f.id !== id)
      .map(f => f.parentId === id ? { ...f, parentId: newParentId } : f)
    )

    // Move child notes up to parent
    setNotes(notes.map(n =>
      n.folderId === id ? { ...n, folderId: newParentId } : n
    ))
  }

  const toggleFolderCollapse = (id: string) => {
    setFolders(folders.map(f =>
      f.id === id ? { ...f, collapsed: !f.collapsed } : f
    ))
  }

  const emptyTrash = () => {
    const filtered = notes.filter((n) => n.folderId !== TRASH_FOLDER_ID)
    setNotes(filtered)
    // If active note was in trash, select first remaining note
    const activeNote = notes.find((n) => n.id === activeNoteId)
    if (activeNote?.folderId === TRASH_FOLDER_ID) {
      setActiveNoteId(filtered.length > 0 ? filtered[0].id : null)
    }
  }

  const restoreNote = (id: string) => {
    const note = notes.find((n) => n.id === id)
    if (!note) return
    // Restore to previous folder if it still exists, otherwise root
    const targetFolderId = note.previousFolderId && folders.some((f) => f.id === note.previousFolderId)
      ? note.previousFolderId
      : null
    setNotes(notes.map((n) => n.id === id ? { ...n, folderId: targetFolderId, previousFolderId: undefined } : n))
  }

  // Check if a folder is a descendant of another folder
  const isDescendant = (potentialParentId: string, folderId: string): boolean => {
    let current = folders.find(f => f.id === folderId)
    while (current) {
      if (current.parentId === potentialParentId) return true
      current = folders.find(f => f.id === current?.parentId)
    }
    return false
  }

  const handleDragStart = (e: React.DragEvent, id: string, type: 'note' | 'folder') => {
    setDraggedItem({ id, type })
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDropOnFolder = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault()
    e.stopPropagation()
    if (!draggedItem) return

    if (draggedItem.type === 'note') {
      setNotes(notes.map(n =>
        n.id === draggedItem.id ? { ...n, folderId: targetFolderId, order: getNextOrder(targetFolderId, 'note') } : n
      ))
    } else {
      // Prevent dropping folder into itself or its descendants
      if (draggedItem.id === targetFolderId || isDescendant(draggedItem.id, targetFolderId)) return
      setFolders(folders.map(f =>
        f.id === draggedItem.id ? { ...f, parentId: targetFolderId, order: getNextOrder(targetFolderId, 'folder') } : f
      ))
    }
    setDraggedItem(null)
    setDropTarget(null)
  }

  const handleDropOnRoot = (e: React.DragEvent) => {
    e.preventDefault()
    if (!draggedItem) return

    if (draggedItem.type === 'note') {
      setNotes(notes.map(n =>
        n.id === draggedItem.id ? { ...n, folderId: null, order: getNextOrder(null, 'note') } : n
      ))
    } else {
      setFolders(folders.map(f =>
        f.id === draggedItem.id ? { ...f, parentId: null, order: getNextOrder(null, 'folder') } : f
      ))
    }
    setDraggedItem(null)
    setDropTarget(null)
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
    setDropTarget(null)
  }

  // Reader functions
  const openReader = () => {
    if (!activeNote?.content.trim()) return
    // Strip HTML tags to get plain text for the reader
    const plainText = stripHtml(activeNote.content)
    if (!plainText.trim()) return
    const wordList = plainText.trim().split(/\s+/)
    setWords(wordList)
    setCurrentIdx(0)
    setReaderOpen(true)
    setIsPlaying(false)
    startWpmRef.current = wpm // Store starting WPM for training mode
  }

  const closeReader = () => {
    setReaderOpen(false)
    setIsPlaying(false)
    if (timerRef.current) clearTimeout(timerRef.current)
  }

  const togglePlay = useCallback(() => {
    // If at the end, restart
    if (currentIdx >= words.length && words.length > 0) {
      setCurrentIdx(0)
      setIsPlaying(true)
      return
    }
    setIsPlaying((prev) => !prev)
  }, [currentIdx, words.length])

  const restart = () => {
    setCurrentIdx(0)
    setIsPlaying(false)
  }

  // Reader playback effect with adaptive timing
  useEffect(() => {
    if (!isPlaying || !readerOpen) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    if (currentIdx >= words.length) {
      setIsPlaying(false)
      return
    }

    // Training mode: gradually increase WPM every 50 words
    let effectiveWpm = wpm
    if (trainingMode) {
      const increments = Math.floor(currentIdx / 50)
      effectiveWpm = startWpmRef.current + increments * trainingIncrement
      // Cap at 800 WPM
      effectiveWpm = Math.min(effectiveWpm, 800)
    }

    const currentWord = words[currentIdx]
    const delay = calculateWordDelay(currentWord, {
      baseWpm: effectiveWpm,
      adaptWordLength,
      adaptPunctuation,
      adaptComplexity
    })

    timerRef.current = setTimeout(() => {
      setCurrentIdx((prev) => prev + 1)
    }, delay)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isPlaying, currentIdx, wpm, words, readerOpen, adaptWordLength, adaptPunctuation, adaptComplexity, trainingMode, trainingIncrement])

  // Keyboard shortcuts for reader
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!readerOpen) return
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.code === 'Escape') {
        closeReader()
      } else if (e.code === 'ArrowLeft') {
        setCurrentIdx((prev) => Math.max(0, prev - 1))
      } else if (e.code === 'ArrowRight') {
        setCurrentIdx((prev) => Math.min(words.length - 1, prev + 1))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [readerOpen, togglePlay, words.length])

  // Close settings when clicking outside
  useEffect(() => {
    if (!settingsOpen) return

    const handleClickOutside = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) {
        setSettingsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [settingsOpen])

  const currentWord = words[currentIdx] || ''
  const orp = getORP(currentWord)

  // Show loading state
  if (!isLoaded) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading notes...</div>
      </div>
    )
  }

  return (
    <div className="h-screen flex overflow-hidden select-none" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-72' : 'w-0'} flex flex-col backdrop-blur-2xl border-r transition-all duration-300 ease-out overflow-hidden shrink-0`}
        style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border)' }}
      >
        {/* Titlebar drag region */}
        <div
          className="h-12 shrink-0 flex items-center justify-end gap-3 px-4"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: 'var(--text-muted)' }}>
            Notes
          </h2>
          <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={() => createNote()}
              className="p-1.5 rounded-lg transition-all duration-200 cursor-pointer outline-none"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
              title="New Note"
            >
              <Plus size={14} strokeWidth={2.5} />
            </button>
            <button
              onClick={() => createFolder()}
              className="p-1.5 rounded-lg transition-all duration-200 cursor-pointer outline-none"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
              title="New Folder"
            >
              <FolderPlus size={14} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Folder tree and notes list */}
        <div
          className="flex-1 overflow-y-auto px-3 pb-3 scrollbar-thin"
          onDragOver={handleDragOver}
          onDrop={handleDropOnRoot}
        >
          {/* Render tree recursively */}
          {(() => {
            const renderItem = (parentId: string | null, depth: number = 0): React.ReactNode => {
              const childFolders = folders
                .filter(f => f.parentId === parentId)
                .sort((a, b) => a.order - b.order)
              const childNotes = notes
                .filter(n => n.folderId === parentId)
                .sort((a, b) => a.order - b.order)

              return (
                <>
                  {childFolders.map((folder) => (
                    <div key={folder.id} style={{ marginLeft: depth > 0 ? 12 : 0 }}>
                      {/* Folder item */}
                      <div
                        draggable
                        onDragStart={(e) => handleDragStart(e, folder.id, 'folder')}
                        onDragOver={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setDropTarget({ id: folder.id, type: 'folder' })
                        }}
                        onDragLeave={() => setDropTarget(null)}
                        onDrop={(e) => handleDropOnFolder(e, folder.id)}
                        onDragEnd={handleDragEnd}
                        className={`group relative flex items-center gap-2 px-2.5 py-2 mb-1 rounded-lg cursor-pointer transition-all duration-200 min-w-0 ${draggedItem?.id === folder.id ? 'opacity-40' : ''}`}
                        style={{
                          background: dropTarget?.id === folder.id ? 'var(--accent-subtle)' : undefined,
                          border: dropTarget?.id === folder.id ? '1px dashed var(--accent)' : '1px solid transparent'
                        }}
                        onMouseEnter={(e) => {
                          if (dropTarget?.id !== folder.id) e.currentTarget.style.background = 'var(--bg-hover)'
                        }}
                        onMouseLeave={(e) => {
                          if (dropTarget?.id !== folder.id) e.currentTarget.style.background = ''
                        }}
                      >
                        {/* Collapse toggle */}
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFolderCollapse(folder.id) }}
                          className="p-0.5 rounded transition-transform duration-200"
                          style={{ color: 'var(--text-muted)', transform: folder.collapsed ? 'rotate(-90deg)' : undefined }}
                        >
                          <ChevronDown size={12} strokeWidth={2} />
                        </button>
                        {/* Folder icon */}
                        <Folder size={14} strokeWidth={1.5} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                        {/* Folder name - editable */}
                        {editingFolderId === folder.id ? (
                          <input
                            type="text"
                            defaultValue={folder.name}
                            autoFocus
                            className="flex-1 min-w-0 bg-transparent text-[13px] font-medium outline-none"
                            style={{ color: 'var(--text-primary)' }}
                            onBlur={(e) => {
                              updateFolder(folder.id, { name: e.target.value || 'Untitled' })
                              setEditingFolderId(null)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                updateFolder(folder.id, { name: (e.target as HTMLInputElement).value || 'Untitled' })
                                setEditingFolderId(null)
                              } else if (e.key === 'Escape') {
                                setEditingFolderId(null)
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <span
                            className="flex-1 min-w-0 text-[13px] font-medium truncate"
                            style={{ color: 'var(--text-secondary)' }}
                            onDoubleClick={(e) => { e.stopPropagation(); setEditingFolderId(folder.id) }}
                          >
                            {folder.name}
                          </span>
                        )}
                        {/* Add note button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); createNote(folder.id) }}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all duration-150"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
                          title="Add note"
                        >
                          <Plus size={10} strokeWidth={2.5} />
                        </button>
                        {/* Add subfolder button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); createFolder(folder.id) }}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all duration-150"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
                          title="Add subfolder"
                        >
                          <FolderPlus size={10} strokeWidth={2} />
                        </button>
                        {/* Delete button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteFolder(folder.id) }}
                          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all duration-150"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
                          title="Delete folder"
                        >
                          <X size={10} strokeWidth={2.5} />
                        </button>
                      </div>
                      {/* Folder children */}
                      {!folder.collapsed && (
                        <div className="overflow-hidden">
                          {renderItem(folder.id, depth + 1)}
                        </div>
                      )}
                    </div>
                  ))}
                  {childNotes.map((note) => (
                    <div
                      key={note.id}
                      onClick={() => setActiveNoteId(note.id)}
                      draggable
                      onDragStart={(e) => handleDragStart(e, note.id, 'note')}
                      onDragOver={handleDragOver}
                      onDragEnd={handleDragEnd}
                      className={`group relative flex flex-col gap-1 p-3 mb-1 rounded-xl cursor-pointer transition-all duration-200 ${draggedItem?.id === note.id ? 'opacity-40 scale-[0.98]' : ''}`}
                      style={{
                        background: activeNoteId === note.id ? 'var(--accent-subtle)' : undefined,
                        marginLeft: depth > 0 ? 12 : 0
                      }}
                      onMouseEnter={(e) => {
                        if (activeNoteId !== note.id) e.currentTarget.style.background = 'var(--bg-hover)'
                      }}
                      onMouseLeave={(e) => {
                        if (activeNoteId !== note.id) e.currentTarget.style.background = ''
                      }}
                    >
                      <span
                        className="text-[13px] font-medium truncate pr-6"
                        style={{ color: activeNoteId === note.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                      >
                        {getFirstLine(note.content) || 'Untitled'}
                      </span>
                      <span className="text-[12px] truncate leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                        {(() => {
                          const text = stripMarkdown(note.content).trim()
                          const lines = text.split('\n').filter(l => l.trim())
                          const preview = lines.slice(1).join(' ').trim() || (lines[0] ? '' : 'Empty note')
                          return preview.slice(0, 60) + (preview.length > 60 ? '…' : '')
                        })()}
                      </span>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteNote(note.id) }}
                        className="absolute top-2.5 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer outline-none"
                        style={{ color: 'var(--text-muted)' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
                      >
                        <X size={12} strokeWidth={2.5} />
                      </button>
                    </div>
                  ))}
                </>
              )
            }
            return renderItem(null)
          })()}

          {/* Trash section */}
          {(() => {
            const trashNotes = notes.filter((n) => n.folderId === TRASH_FOLDER_ID)
            if (trashNotes.length === 0) return null
            return (
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                {/* Trash folder header */}
                <div
                  className="group flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer transition-all duration-200"
                  onClick={() => setTrashCollapsed(!trashCollapsed)}
                  style={{ background: dropTarget?.id === TRASH_FOLDER_ID ? 'var(--accent-subtle)' : undefined }}
                  onMouseEnter={(e) => { if (dropTarget?.id !== TRASH_FOLDER_ID) e.currentTarget.style.background = 'var(--bg-hover)' }}
                  onMouseLeave={(e) => { if (dropTarget?.id !== TRASH_FOLDER_ID) e.currentTarget.style.background = '' }}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (draggedItem?.type === 'note') {
                      setDropTarget({ id: TRASH_FOLDER_ID, type: 'folder' })
                    }
                  }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (draggedItem?.type === 'note') {
                      setNotes(notes.map((n) => n.id === draggedItem.id ? { ...n, folderId: TRASH_FOLDER_ID } : n))
                    }
                    setDraggedItem(null)
                    setDropTarget(null)
                  }}
                >
                  {/* Collapse toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setTrashCollapsed(!trashCollapsed) }}
                    className="p-0.5 rounded transition-all duration-150"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <ChevronDown
                      size={10}
                      strokeWidth={2.5}
                      style={{ transform: trashCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}
                    />
                  </button>
                  {/* Trash icon */}
                  <Trash2 size={14} strokeWidth={1.5} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  <span className="flex-1 text-[13px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                    Trash
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-md" style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)' }}>
                    {trashNotes.length}
                  </span>
                  {/* Empty trash button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); emptyTrash() }}
                    className="p-1 rounded opacity-0 group-hover:opacity-100 transition-all duration-150"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
                    title="Empty trash"
                  >
                    <X size={10} strokeWidth={2.5} />
                  </button>
                </div>
                {/* Trash contents */}
                {!trashCollapsed && (
                  <div className="mt-1">
                    {trashNotes.map((note) => (
                      <div
                        key={note.id}
                        onClick={() => setActiveNoteId(note.id)}
                        className={`group relative flex flex-col gap-1 p-3 mb-1 ml-3 rounded-xl cursor-pointer transition-all duration-200`}
                        style={{
                          background: activeNoteId === note.id ? 'var(--accent-subtle)' : undefined
                        }}
                        onMouseEnter={(e) => {
                          if (activeNoteId !== note.id) e.currentTarget.style.background = 'var(--bg-hover)'
                        }}
                        onMouseLeave={(e) => {
                          if (activeNoteId !== note.id) e.currentTarget.style.background = ''
                        }}
                      >
                        <span
                          className="text-[13px] font-medium truncate pr-16"
                          style={{ color: activeNoteId === note.id ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                        >
                          {getFirstLine(note.content) || 'Untitled'}
                        </span>
                        <span className="text-[12px] truncate leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                          {(() => {
                            const text = stripMarkdown(note.content).trim()
                            const lines = text.split('\n').filter(l => l.trim())
                            const preview = lines.slice(1).join(' ').trim() || (lines[0] ? '' : 'Empty note')
                            return preview.slice(0, 60) + (preview.length > 60 ? '…' : '')
                          })()}
                        </span>
                        {/* Restore button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); restoreNote(note.id) }}
                          className="absolute top-2.5 right-10 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer outline-none"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
                          title="Restore"
                        >
                          <RotateCcw size={12} strokeWidth={2} />
                        </button>
                        {/* Delete permanently button */}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteNote(note.id) }}
                          className="absolute top-2.5 right-2 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-150 cursor-pointer outline-none"
                          style={{ color: 'var(--text-muted)' }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = '#ef4444' }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
                          title="Delete permanently"
                        >
                          <Trash2 size={12} strokeWidth={2.5} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Bottom actions */}
        <div className="p-2 flex justify-start" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="relative" ref={themeMenuRef}>
            <button
              onClick={() => { setThemeMenuOpen(!themeMenuOpen); setThemeSearch('') }}
              className="p-1.5 rounded-lg transition-all duration-200 cursor-pointer outline-none"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
              title="Theme"
            >
              <Sun size={14} strokeWidth={2} />
            </button>
            {/* Theme selector dropdown */}
            {themeMenuOpen && (() => {
              const filteredThemes = themes.filter((t) =>
                themeSearch === '' ||
                t.name.toLowerCase().includes(themeSearch.toLowerCase()) ||
                t.description.toLowerCase().includes(themeSearch.toLowerCase())
              )
              return (
              <div className="absolute bottom-full left-0 mb-2 w-56 backdrop-blur-2xl rounded-xl p-2 shadow-2xl" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.15em] px-2 py-1.5 mb-1" style={{ color: 'var(--text-muted)' }}>
                  Theme
                </div>
                <div className="px-1 pb-2">
                  <input
                    type="text"
                    value={themeSearch}
                    onChange={(e) => { setThemeSearch(e.target.value); setThemeHighlightIndex(0) }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault()
                        setThemeHighlightIndex((i) => Math.min(i + 1, filteredThemes.length - 1))
                        const items = themeListRef.current?.children
                        if (items && items[themeHighlightIndex + 1]) {
                          items[themeHighlightIndex + 1].scrollIntoView({ block: 'nearest' })
                        }
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault()
                        setThemeHighlightIndex((i) => Math.max(i - 1, 0))
                        const items = themeListRef.current?.children
                        if (items && items[themeHighlightIndex - 1]) {
                          items[themeHighlightIndex - 1].scrollIntoView({ block: 'nearest' })
                        }
                      } else if (e.key === 'Enter' && filteredThemes[themeHighlightIndex]) {
                        e.preventDefault()
                        setTheme(filteredThemes[themeHighlightIndex].id)
                        setThemeMenuOpen(false)
                        setThemeSearch('')
                        setThemeHighlightIndex(0)
                      } else if (e.key === 'Escape') {
                        setThemeMenuOpen(false)
                        setThemeSearch('')
                        setThemeHighlightIndex(0)
                      }
                    }}
                    placeholder="Search themes..."
                    className="w-full px-2.5 py-1.5 rounded-lg text-[13px] outline-none"
                    style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    autoFocus
                  />
                </div>
                <div ref={themeListRef} className="max-h-64 overflow-y-auto scrollbar-thin">
                {filteredThemes.map((t, index) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTheme(t.id)
                      setThemeMenuOpen(false)
                      setThemeSearch('')
                      setThemeHighlightIndex(0)
                    }}
                    className="w-full flex flex-col gap-0.5 px-3 py-2 rounded-lg text-left transition-all duration-150 cursor-pointer"
                    style={{
                      background: index === themeHighlightIndex ? 'var(--bg-hover)' : theme === t.id ? 'var(--accent-subtle)' : undefined,
                      color: theme === t.id ? 'var(--text-primary)' : 'var(--text-secondary)'
                    }}
                    onMouseEnter={() => setThemeHighlightIndex(index)}
                  >
                    <span className="text-[13px] font-medium flex items-center gap-2">
                      {t.name}
                      {theme === t.id && (
                        <Check size={12} strokeWidth={3} />
                      )}
                    </span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{t.description}</span>
                  </button>
                ))}
                </div>
              </div>
              )
            })()}
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Unified titlebar/navbar */}
        <nav
          className={`h-12 shrink-0 flex items-center justify-between pr-4 border-b backdrop-blur-2xl transition-all duration-300 ${sidebarOpen ? 'pl-4' : 'pl-[88px]'}`}
          style={{ WebkitAppRegion: 'drag', background: 'var(--bg-secondary)', borderColor: 'var(--border)' } as React.CSSProperties}
        >
          <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg transition-all duration-200 cursor-pointer outline-none"
              style={{ color: 'var(--text-muted)' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              <PanelLeft size={16} strokeWidth={1.75} />
            </button>
          </div>

          <h1 className="absolute left-1/2 -translate-x-1/2 text-[13px] font-medium tracking-tight" style={{ color: 'var(--text-muted)' }}>
            {(activeNote && getFirstLine(activeNote.content)) || 'Readly'}
          </h1>

          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={openReader}
              disabled={!activeNote?.content.trim() || !stripHtml(activeNote?.content || '').trim()}
              className="px-3.5 py-1.5 rounded-lg text-[13px] font-medium shadow-lg disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 cursor-pointer outline-none"
              style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}
            >
              Reader
            </button>
          </div>
        </nav>

        {/* Editor */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeNote ? (
            <div className="flex-1 flex flex-col max-w-3xl w-full mx-auto px-8 py-10 overflow-y-auto">
              <MarkdownEditor
                key={activeNote.id}
                value={activeNote.content}
                onChange={(content) => updateNote(activeNote.id, { content })}
                placeholder="Start writing or paste your text here…"
              />
            </div>
          ) : null}
        </main>
      </div>

      {/* Reader Overlay */}
      {readerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
          {/* Reader topbar */}
          <nav
            className="h-12 shrink-0 flex items-center justify-between px-4 border-b backdrop-blur-2xl"
            style={{ WebkitAppRegion: 'drag', background: 'var(--bg-secondary)', borderColor: 'var(--border)' } as React.CSSProperties}
          >
            <div className="w-10" /> {/* Spacer for centering */}

            <span className="text-[13px] font-medium tracking-tight" style={{ color: 'var(--text-muted)' }}>
              {(activeNote && getFirstLine(activeNote.content)) || 'Reader'}
            </span>

            <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <button
                onClick={closeReader}
                className="p-2 rounded-lg transition-all duration-200 cursor-pointer outline-none"
                style={{ color: 'var(--text-muted)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
                title="Close reader"
              >
                <X size={16} strokeWidth={2} />
              </button>
            </div>
          </nav>

          {/* Word display area */}
          <div className="flex-1 flex items-center justify-center relative pointer-events-none">
            {/* ORP guide line */}
            <div className="absolute left-1/2 top-[30%] bottom-[30%] w-px" style={{ background: 'var(--accent-muted)', opacity: 0.3 }} />
            <div className="absolute left-1/2 -translate-x-1/2 top-[30%] w-1.5 h-3 rounded-b-full" style={{ background: 'var(--accent-muted)' }} />
            <div className="absolute left-1/2 -translate-x-1/2 bottom-[30%] w-1.5 h-3 rounded-t-full" style={{ background: 'var(--accent-muted)' }} />

            {/* Word container */}
            <div className="relative w-full max-w-5xl px-8">
              {currentWord ? (
                <div className="relative h-32 flex items-center justify-center font-mono text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight whitespace-nowrap">
                  {/* Prefix - positioned to the left of center */}
                  <span
                    className="absolute text-right whitespace-nowrap"
                    style={{
                      right: '50%',
                      marginRight: '0.5ch',
                      color: 'var(--text-faint)'
                    }}
                  >
                    {orp.prefix}
                  </span>

                  {/* ORP character - centered */}
                  <span className="relative" style={{ color: 'var(--accent)' }}>
                    {orp.char}
                  </span>

                  {/* Suffix - positioned to the right of center */}
                  <span
                    className="absolute text-left whitespace-nowrap"
                    style={{
                      left: '50%',
                      marginLeft: '0.5ch',
                      color: 'var(--text-faint)'
                    }}
                  >
                    {orp.suffix}
                  </span>
                </div>
              ) : (
                <div className="text-center text-sm uppercase tracking-[0.3em]" style={{ color: 'var(--text-muted)' }}>
                  {currentIdx >= words.length && words.length > 0
                    ? 'Finished — Press Space to restart'
                    : 'Press Space to begin'}
                </div>
              )}
            </div>
          </div>

          {/* Floating control bar - minimal */}
          <div
            className={`absolute bottom-8 left-1/2 -translate-x-1/2 pointer-events-auto transition-opacity duration-300 ${isPlaying && !controlsHovered && !settingsOpen ? 'opacity-0' : 'opacity-100'}`}
            onMouseEnter={() => setControlsHovered(true)}
            onMouseLeave={() => setControlsHovered(false)}
          >
            <div className="flex items-center gap-2 backdrop-blur-2xl rounded-full px-2 py-2 shadow-2xl" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className="p-2.5 rounded-full shadow-lg transition-all duration-200 active:scale-95 cursor-pointer outline-none"
                style={{ background: 'var(--accent)', color: 'var(--bg-primary)' }}
              >
                {isPlaying ? (
                  <Pause size={14} fill="currentColor" />
                ) : (
                  <Play size={14} fill="currentColor" />
                )}
              </button>

              {/* Seekable progress bar */}
              <input
                type="range"
                min="0"
                max={words.length - 1}
                value={currentIdx}
                onChange={(e) => setCurrentIdx(parseInt(e.target.value))}
                className="w-32 seek-bar outline-none"
              />

              {/* Progress text */}
              <span className="text-[11px] font-mono px-1 min-w-[3.5rem] text-center" style={{ color: 'var(--text-muted)' }}>
                {currentIdx + 1}/{words.length}
              </span>

              {/* Divider */}
              <div className="w-px h-5" style={{ background: 'var(--border)' }} />

              {/* Speed control */}
              <input
                type="range"
                min="100"
                max="800"
                value={wpm}
                onChange={(e) => setWpm(parseInt(e.target.value))}
                className="w-20 outline-none"
              />
              <span className="text-[11px] font-mono pr-1 min-w-[3rem]" style={{ color: 'var(--text-muted)' }}>{wpm}</span>

              {/* Divider */}
              <div className="w-px h-5" style={{ background: 'var(--border)' }} />

              {/* Settings button */}
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className="p-2 rounded-full transition-all duration-200 cursor-pointer outline-none"
                style={{
                  background: settingsOpen ? 'var(--accent-subtle)' : undefined,
                  color: settingsOpen ? 'var(--accent)' : 'var(--text-muted)'
                }}
                onMouseEnter={(e) => { if (!settingsOpen) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
                onMouseLeave={(e) => { if (!settingsOpen) { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' } }}
                title="Adaptive settings"
              >
                <Settings size={14} strokeWidth={2} />
              </button>
            </div>

            {/* Settings panel */}
            {settingsOpen && (
              <div ref={settingsRef} className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 backdrop-blur-2xl rounded-2xl p-4 shadow-2xl min-w-[280px]" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] mb-4" style={{ color: 'var(--text-muted)' }}>Adaptive Reading</h3>

                {/* Word Length Toggle */}
                <label className="flex items-center justify-between py-2.5 cursor-pointer group">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] transition-colors" style={{ color: 'var(--text-secondary)' }}>Word Length</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Longer words display longer</span>
                  </div>
                  <div className="relative w-10 h-6 rounded-full transition-colors duration-200" style={{ background: adaptWordLength ? 'var(--accent)' : 'var(--bg-hover)' }}>
                    <input
                      type="checkbox"
                      checked={adaptWordLength}
                      onChange={(e) => setAdaptWordLength(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`absolute top-1 w-4 h-4 rounded-full shadow transition-transform duration-200 ${adaptWordLength ? 'translate-x-5' : 'translate-x-1'}`} style={{ background: 'var(--text-primary)' }} />
                  </div>
                </label>

                {/* Punctuation Toggle */}
                <label className="flex items-center justify-between py-2.5 cursor-pointer group" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] transition-colors" style={{ color: 'var(--text-secondary)' }}>Punctuation Pauses</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Pause at sentences & clauses</span>
                  </div>
                  <div className="relative w-10 h-6 rounded-full transition-colors duration-200" style={{ background: adaptPunctuation ? 'var(--accent)' : 'var(--bg-hover)' }}>
                    <input
                      type="checkbox"
                      checked={adaptPunctuation}
                      onChange={(e) => setAdaptPunctuation(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`absolute top-1 w-4 h-4 rounded-full shadow transition-transform duration-200 ${adaptPunctuation ? 'translate-x-5' : 'translate-x-1'}`} style={{ background: 'var(--text-primary)' }} />
                  </div>
                </label>

                {/* Complexity Toggle */}
                <label className="flex items-center justify-between py-2.5 cursor-pointer group" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] transition-colors" style={{ color: 'var(--text-secondary)' }}>Word Complexity</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Uncommon words display longer</span>
                  </div>
                  <div className="relative w-10 h-6 rounded-full transition-colors duration-200" style={{ background: adaptComplexity ? 'var(--accent)' : 'var(--bg-hover)' }}>
                    <input
                      type="checkbox"
                      checked={adaptComplexity}
                      onChange={(e) => setAdaptComplexity(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`absolute top-1 w-4 h-4 rounded-full shadow transition-transform duration-200 ${adaptComplexity ? 'translate-x-5' : 'translate-x-1'}`} style={{ background: 'var(--text-primary)' }} />
                  </div>
                </label>

                {/* Training Mode Toggle */}
                <label className="flex items-center justify-between py-2.5 cursor-pointer group" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] transition-colors" style={{ color: 'var(--text-secondary)' }}>Training Mode</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Speed increases as you read</span>
                  </div>
                  <div className="relative w-10 h-6 rounded-full transition-colors duration-200" style={{ background: trainingMode ? 'var(--accent)' : 'var(--bg-hover)' }}>
                    <input
                      type="checkbox"
                      checked={trainingMode}
                      onChange={(e) => setTrainingMode(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`absolute top-1 w-4 h-4 rounded-full shadow transition-transform duration-200 ${trainingMode ? 'translate-x-5' : 'translate-x-1'}`} style={{ background: 'var(--text-primary)' }} />
                  </div>
                </label>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default App

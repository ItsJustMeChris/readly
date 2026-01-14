import { useState, useEffect, useCallback, useRef } from 'react'

interface Note {
  id: string
  title: string
  content: string
}

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

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [notes, setNotes] = useState<Note[]>([])
  const [activeNoteId, setActiveNoteId] = useState<string>('')
  const [isLoaded, setIsLoaded] = useState(false)
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null)

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

  const activeNote = notes.find((n) => n.id === activeNoteId)

  // Load notes and settings on mount
  useEffect(() => {
    const loadData = async () => {
      // Check if API is available
      if (!window.api || typeof window.api.loadNotes !== 'function') {
        console.error('window.api not available:', window.api)
        setIsLoaded(true)
        return
      }

      try {
        const savedNotes = await window.api.loadNotes()
        const savedSettings = await window.api.loadSettings()

        if (savedNotes && savedNotes.length > 0) {
          setNotes(savedNotes)
          setActiveNoteId(savedNotes[0].id)
        }

        // Apply saved settings if available
        if (savedSettings) {
          setWpm(savedSettings.wpm)
          setAdaptWordLength(savedSettings.adaptWordLength)
          setAdaptPunctuation(savedSettings.adaptPunctuation)
          setAdaptComplexity(savedSettings.adaptComplexity)
          setTrainingMode(savedSettings.trainingMode)
        }
      } catch (error) {
        console.error('Failed to load data:', error)
      }
      setIsLoaded(true)
    }
    loadData()
  }, [])

  // Save notes when they change (debounced)
  const isInitialMount = useRef(true)
  useEffect(() => {
    if (!isLoaded || !window.api?.saveNotes) return
    // Skip saving on initial load
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    const timeoutId = setTimeout(() => {
      console.log('Saving notes to disk...')
      window.api.saveNotes(notes).then(() => {
        console.log('Notes saved!')
      })
    }, 500)
    return () => clearTimeout(timeoutId)
  }, [notes, isLoaded])

  // Save settings when they change
  useEffect(() => {
    if (!isLoaded || !window.api?.saveSettings) return
    const timeoutId = setTimeout(() => {
      window.api.saveSettings({
        wpm,
        adaptWordLength,
        adaptPunctuation,
        adaptComplexity,
        trainingMode
      })
    }, 500)
    return () => clearTimeout(timeoutId)
  }, [wpm, adaptWordLength, adaptPunctuation, adaptComplexity, trainingMode, isLoaded])

  const createNote = () => {
    const newNote: Note = {
      id: crypto.randomUUID(),
      title: '',
      content: ''
    }
    setNotes([newNote, ...notes])
    setActiveNoteId(newNote.id)
  }

  const updateNote = (id: string, updates: Partial<Note>) => {
    setNotes(notes.map((n) => (n.id === id ? { ...n, ...updates } : n)))
  }

  const deleteNote = (id: string) => {
    const filtered = notes.filter((n) => n.id !== id)
    setNotes(filtered)
    if (activeNoteId === id && filtered.length > 0) {
      setActiveNoteId(filtered[0].id)
    }
  }

  const handleDragStart = (e: React.DragEvent, noteId: string) => {
    setDraggedNoteId(noteId)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, noteId: string) => {
    e.preventDefault()
    if (draggedNoteId && draggedNoteId !== noteId) {
      const draggedIndex = notes.findIndex((n) => n.id === draggedNoteId)
      const targetIndex = notes.findIndex((n) => n.id === noteId)
      const newNotes = [...notes]
      const [removed] = newNotes.splice(draggedIndex, 1)
      newNotes.splice(targetIndex, 0, removed)
      setNotes(newNotes)
    }
  }

  const handleDragEnd = () => {
    setDraggedNoteId(null)
  }

  // Reader functions
  const openReader = () => {
    if (!activeNote?.content.trim()) return
    const wordList = activeNote.content.trim().split(/\s+/)
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
      <div className="h-screen flex items-center justify-center bg-black text-white">
        <div className="text-white/40 text-sm">Loading notes...</div>
      </div>
    )
  }

  // Debug: show if no notes loaded
  if (notes.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-black text-white gap-4">
        <div className="text-white/60 text-sm">No notes found</div>
        <div className="text-white/30 text-xs">API available: {window.api ? 'yes' : 'no'}</div>
        <button
          onClick={createNote}
          className="px-4 py-2 bg-indigo-500 rounded-lg text-sm"
        >
          Create first note
        </button>
      </div>
    )
  }

  return (
    <div className="h-screen flex bg-black text-white overflow-hidden select-none">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-72' : 'w-0'} flex flex-col bg-black/80 backdrop-blur-2xl border-r border-white/[0.06] transition-all duration-300 ease-out overflow-hidden shrink-0`}
      >
        {/* Titlebar drag region */}
        <div
          className="h-12 shrink-0 flex items-center justify-end pr-4"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
            Notes
          </h2>
        </div>

        {/* Notes list */}
        <div className="flex-1 overflow-y-auto px-3 pb-3 scrollbar-thin">
          {notes.map((note) => (
            <div
              key={note.id}
              onClick={() => setActiveNoteId(note.id)}
              draggable
              onDragStart={(e) => handleDragStart(e, note.id)}
              onDragOver={(e) => handleDragOver(e, note.id)}
              onDragEnd={handleDragEnd}
              className={`group relative flex flex-col gap-1 p-3.5 mb-1.5 rounded-xl cursor-pointer transition-all duration-200 ${
                activeNoteId === note.id
                  ? 'bg-indigo-500/10'
                  : 'hover:bg-white/[0.04]'
              } ${draggedNoteId === note.id ? 'opacity-40 scale-[0.98]' : ''}`}
            >
              <span
                className={`text-[13px] font-medium truncate pr-6 ${activeNoteId === note.id ? 'text-indigo-300' : 'text-white/70'}`}
              >
                {note.title || 'Untitled'}
              </span>
              <span className="text-[12px] text-white/35 truncate leading-relaxed">
                {note.content.slice(0, 60) || 'Empty note'}
                {note.content.length > 60 ? '…' : ''}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteNote(note.id)
                }}
                className="absolute top-3 right-2.5 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-white/10 text-white/30 hover:text-white/70 transition-all duration-150 cursor-pointer outline-none"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {/* New note button */}
        <div className="p-3 border-t border-white/[0.06]">
          <button
            onClick={createNote}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.1] text-white/60 hover:text-white/90 text-[13px] font-medium transition-all duration-200 cursor-pointer outline-none"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Note
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Unified titlebar/navbar */}
        <nav
          className={`h-12 shrink-0 flex items-center justify-between pr-4 border-b border-white/[0.06] bg-black/60 backdrop-blur-2xl transition-all duration-300 ${sidebarOpen ? 'pl-4' : 'pl-[88px]'}`}
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-white/[0.08] text-white/50 hover:text-white/80 transition-all duration-200 cursor-pointer outline-none"
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
            </button>
          </div>

          <h1 className="absolute left-1/2 -translate-x-1/2 text-[13px] font-medium text-white/40 tracking-tight">
            {activeNote?.title || 'Readly'}
          </h1>

          <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              onClick={openReader}
              disabled={!activeNote?.content.trim()}
              className="px-3.5 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-[13px] font-medium shadow-lg shadow-indigo-500/20 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-indigo-500 transition-all duration-200 cursor-pointer outline-none"
            >
              Reader
            </button>
          </div>
        </nav>

        {/* Editor */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {activeNote ? (
            <div className="flex-1 flex flex-col max-w-3xl w-full mx-auto px-8 py-10 overflow-y-auto">
              <input
                type="text"
                value={activeNote.title}
                onChange={(e) => updateNote(activeNote.id, { title: e.target.value })}
                placeholder="Untitled"
                className="text-3xl font-semibold bg-transparent border-none outline-none mb-4 text-white placeholder-white/20 tracking-tight"
              />
              <textarea
                value={activeNote.content}
                onChange={(e) => updateNote(activeNote.id, { content: e.target.value })}
                placeholder="Start writing or paste your text here…"
                className="flex-1 text-[16px] leading-[1.85] bg-transparent border-none outline-none resize-none text-white/70 placeholder-white/25"
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-6">
              <div className="w-16 h-16 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white/30">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-white/40 text-[15px] mb-4">No note selected</p>
                <button
                  onClick={createNote}
                  className="px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] hover:border-white/[0.12] text-white/70 hover:text-white text-[13px] font-medium transition-all duration-200 cursor-pointer outline-none"
                >
                  Create a new note
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Reader Overlay */}
      {readerOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Ambient background */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/[0.03] blur-[150px] rounded-full" />
            <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-violet-500/[0.03] blur-[150px] rounded-full" />
          </div>

          {/* Reader topbar */}
          <nav
            className="h-12 shrink-0 flex items-center justify-between px-4 border-b border-white/[0.06] bg-black/60 backdrop-blur-2xl"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          >
            <div className="w-10" /> {/* Spacer for centering */}

            <span className="text-[13px] font-medium text-white/40 tracking-tight">
              {activeNote?.title || 'Reader'}
            </span>

            <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
              <button
                onClick={closeReader}
                className="p-2 rounded-lg hover:bg-white/[0.08] text-white/50 hover:text-white/80 transition-all duration-200 cursor-pointer outline-none"
                title="Close reader"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </nav>

          {/* Word display area */}
          <div className="flex-1 flex items-center justify-center relative pointer-events-none">
            {/* ORP guide line */}
            <div className="absolute left-1/2 top-[30%] bottom-[30%] w-px bg-indigo-500/20" />
            <div className="absolute left-1/2 -translate-x-1/2 top-[30%] w-1.5 h-3 bg-indigo-500/40 rounded-b-full" />
            <div className="absolute left-1/2 -translate-x-1/2 bottom-[30%] w-1.5 h-3 bg-indigo-500/40 rounded-t-full" />

            {/* Word container */}
            <div className="relative w-full max-w-5xl px-8">
              {currentWord ? (
                <div className="relative h-32 flex items-center justify-center font-mono text-5xl md:text-6xl lg:text-7xl font-medium tracking-tight whitespace-nowrap">
                  {/* Prefix - positioned to the left of center */}
                  <span
                    className="absolute text-white/20 text-right whitespace-nowrap"
                    style={{
                      right: '50%',
                      marginRight: '0.5ch'
                    }}
                  >
                    {orp.prefix}
                  </span>

                  {/* ORP character - centered */}
                  <span className="relative text-indigo-400 drop-shadow-[0_0_30px_rgba(129,140,248,0.5)]">
                    {orp.char}
                  </span>

                  {/* Suffix - positioned to the right of center */}
                  <span
                    className="absolute text-white/20 text-left whitespace-nowrap"
                    style={{
                      left: '50%',
                      marginLeft: '0.5ch'
                    }}
                  >
                    {orp.suffix}
                  </span>
                </div>
              ) : (
                <div className="text-center text-white/30 text-sm uppercase tracking-[0.3em]">
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
            <div className="flex items-center gap-2 bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-full px-2 py-2 shadow-2xl shadow-black/40">
              {/* Play/Pause */}
              <button
                onClick={togglePlay}
                className="p-2.5 rounded-full bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/25 transition-all duration-200 active:scale-95 cursor-pointer outline-none"
              >
                {isPlaying ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" rx="1" />
                    <rect x="14" y="4" width="4" height="16" rx="1" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
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
              <span className="text-[11px] text-white/40 font-mono px-1 min-w-[3.5rem] text-center">
                {currentIdx + 1}/{words.length}
              </span>

              {/* Divider */}
              <div className="w-px h-5 bg-white/[0.1]" />

              {/* Speed control */}
              <input
                type="range"
                min="100"
                max="800"
                value={wpm}
                onChange={(e) => setWpm(parseInt(e.target.value))}
                className="w-20 outline-none"
              />
              <span className="text-[11px] text-white/40 font-mono pr-1 min-w-[3rem]">{wpm}</span>

              {/* Divider */}
              <div className="w-px h-5 bg-white/[0.1]" />

              {/* Settings button */}
              <button
                onClick={() => setSettingsOpen(!settingsOpen)}
                className={`p-2 rounded-full transition-all duration-200 cursor-pointer outline-none ${settingsOpen ? 'bg-indigo-500/20 text-indigo-400' : 'hover:bg-white/[0.08] text-white/50 hover:text-white/80'}`}
                title="Adaptive settings"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            </div>

            {/* Settings panel */}
            {settingsOpen && (
              <div ref={settingsRef} className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 bg-black/95 backdrop-blur-2xl border border-white/[0.1] rounded-2xl p-4 shadow-2xl shadow-black/50 min-w-[280px]">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/40 mb-4">Adaptive Reading</h3>

                {/* Word Length Toggle */}
                <label className="flex items-center justify-between py-2.5 cursor-pointer group">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] text-white/80 group-hover:text-white transition-colors">Word Length</span>
                    <span className="text-[11px] text-white/35">Longer words display longer</span>
                  </div>
                  <div className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${adaptWordLength ? 'bg-indigo-500' : 'bg-white/10'}`}>
                    <input
                      type="checkbox"
                      checked={adaptWordLength}
                      onChange={(e) => setAdaptWordLength(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${adaptWordLength ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                </label>

                {/* Punctuation Toggle */}
                <label className="flex items-center justify-between py-2.5 cursor-pointer group border-t border-white/[0.06]">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] text-white/80 group-hover:text-white transition-colors">Punctuation Pauses</span>
                    <span className="text-[11px] text-white/35">Pause at sentences & clauses</span>
                  </div>
                  <div className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${adaptPunctuation ? 'bg-indigo-500' : 'bg-white/10'}`}>
                    <input
                      type="checkbox"
                      checked={adaptPunctuation}
                      onChange={(e) => setAdaptPunctuation(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${adaptPunctuation ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                </label>

                {/* Complexity Toggle */}
                <label className="flex items-center justify-between py-2.5 cursor-pointer group border-t border-white/[0.06]">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] text-white/80 group-hover:text-white transition-colors">Word Complexity</span>
                    <span className="text-[11px] text-white/35">Uncommon words display longer</span>
                  </div>
                  <div className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${adaptComplexity ? 'bg-indigo-500' : 'bg-white/10'}`}>
                    <input
                      type="checkbox"
                      checked={adaptComplexity}
                      onChange={(e) => setAdaptComplexity(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${adaptComplexity ? 'translate-x-5' : 'translate-x-1'}`} />
                  </div>
                </label>

                {/* Training Mode Toggle */}
                <label className="flex items-center justify-between py-2.5 cursor-pointer group border-t border-white/[0.06]">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[13px] text-white/80 group-hover:text-white transition-colors">Training Mode</span>
                    <span className="text-[11px] text-white/35">Speed increases as you read</span>
                  </div>
                  <div className={`relative w-10 h-6 rounded-full transition-colors duration-200 ${trainingMode ? 'bg-indigo-500' : 'bg-white/10'}`}>
                    <input
                      type="checkbox"
                      checked={trainingMode}
                      onChange={(e) => setTrainingMode(e.target.checked)}
                      className="sr-only"
                    />
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${trainingMode ? 'translate-x-5' : 'translate-x-1'}`} />
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

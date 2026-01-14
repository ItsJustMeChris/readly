import { useEffect, useRef } from 'react'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { common, createLowlight } from 'lowlight'
import { marked } from 'marked'

// Create lowlight instance with common languages
const lowlight = createLowlight(common)

// Configure marked for sync parsing
marked.use({ async: false })

// Check if text looks like markdown
function looksLikeMarkdown(text: string): boolean {
  const markdownPatterns = [
    /^#{1,6}\s+/m,           // Headings
    /\*\*[^*]+\*\*/,         // Bold
    /\*[^*]+\*/,             // Italic
    /`[^`]+`/,               // Inline code
    /```[\s\S]*```/,         // Code blocks
    /^\s*[-*+]\s+/m,         // Unordered lists
    /^\s*\d+\.\s+/m,         // Ordered lists
    /^\s*>/m,                // Blockquotes
    /\[.+\]\(.+\)/,          // Links
    /^---$/m,                // Horizontal rule
  ]
  return markdownPatterns.some(pattern => pattern.test(text))
}

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function MarkdownEditor({ value, onChange, placeholder }: MarkdownEditorProps) {
  const editorRef = useRef<Editor | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4, 5, 6],
        },
        codeBlock: false,
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Start writing...',
      }),
      Typography,
      CodeBlockLowlight.configure({
        lowlight,
        defaultLanguage: 'plaintext',
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      onChange(html)
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none outline-none min-h-full',
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain')

        // If it looks like markdown, parse and insert as HTML
        if (text && looksLikeMarkdown(text)) {
          event.preventDefault()
          const html = marked.parse(text) as string

          // Use the editor ref to insert content
          if (editorRef.current) {
            editorRef.current.chain().focus().insertContent(html).run()
          }

          return true
        }

        return false
      },
    },
  })

  // Store editor in ref for paste handler
  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // Sync external value changes (e.g., when switching notes)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, false)
    }
  }, [editor, value])

  return (
    <div className="tiptap-wrapper flex-1 flex flex-col min-h-0">
      <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
    </div>
  )
}

export default MarkdownEditor

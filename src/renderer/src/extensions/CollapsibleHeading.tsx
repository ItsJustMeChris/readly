import { mergeAttributes } from '@tiptap/core'
import Heading from '@tiptap/extension-heading'
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewContent, type NodeViewProps } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

// Plugin key for collapsible headings
const collapsibleHeadingsPluginKey = new PluginKey('collapsibleHeadings')

// React component for the collapsible heading
function CollapsibleHeadingComponent({ node, updateAttributes }: NodeViewProps) {
  const level = node.attrs.level as number
  const collapsed = node.attrs.collapsed as boolean
  const HeadingTag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'

  const toggleCollapse = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    updateAttributes({ collapsed: !collapsed })
  }

  return (
    <NodeViewWrapper className="collapsible-heading-wrapper" data-collapsed={collapsed ? 'true' : undefined}>
      <HeadingTag className="collapsible-heading">
        <span
          className="collapse-toggle"
          onClick={toggleCollapse}
          contentEditable={false}
          role="button"
          tabIndex={0}
          aria-label={collapsed ? 'Expand section' : 'Collapse section'}
        >
          {collapsed ? '▶' : '▼'}
        </span>
        <NodeViewContent as="span" className="heading-content" />
        {collapsed && <span className="collapsed-indicator">...</span>}
      </HeadingTag>
    </NodeViewWrapper>
  )
}

// Create the collapsible heading extension
export const CollapsibleHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: {
        default: false,
        parseHTML: element => element.getAttribute('data-collapsed') === 'true',
        renderHTML: attributes => {
          if (attributes.collapsed) {
            return { 'data-collapsed': 'true' }
          }
          return {}
        },
      },
    }
  },

  renderHTML({ node, HTMLAttributes }) {
    const hasLevel = this.options.levels.includes(node.attrs.level)
    const level = hasLevel ? node.attrs.level : this.options.levels[0]

    return [
      `h${level}`,
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        class: 'collapsible-heading',
      }),
      0,
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(CollapsibleHeadingComponent)
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: collapsibleHeadingsPluginKey,
        props: {
          decorations: (state) => {
            const decorations: Decoration[] = []
            const { doc } = state

            // Track which positions should be hidden
            const hiddenRanges: { from: number; to: number }[] = []

            // First pass: find all collapsed headings and their ranges
            doc.descendants((node, pos) => {
              if (node.type.name === 'heading' && node.attrs.collapsed) {
                const headingLevel = node.attrs.level
                const headingEnd = pos + node.nodeSize

                // Find the end of the collapsed section
                let sectionEnd = doc.content.size

                doc.nodesBetween(headingEnd, doc.content.size, (childNode, childPos) => {
                  // Stop at a heading of same or higher level (lower number)
                  if (childNode.type.name === 'heading' && childNode.attrs.level <= headingLevel) {
                    if (childPos < sectionEnd && childPos > headingEnd) {
                      sectionEnd = childPos
                    }
                    return false // Stop searching this branch
                  }
                  return true
                })

                // Add the range to hide
                if (sectionEnd > headingEnd) {
                  hiddenRanges.push({ from: headingEnd, to: sectionEnd })
                }
              }
              return true
            })

            // Second pass: create decorations for hidden content
            for (const range of hiddenRanges) {
              doc.nodesBetween(range.from, range.to, (node, pos) => {
                // Only decorate top-level block nodes within range
                if (pos >= range.from && pos < range.to && node.isBlock) {
                  // Don't hide headings that start exactly at the boundary
                  if (node.type.name === 'heading' && pos === range.to) {
                    return false
                  }

                  decorations.push(
                    Decoration.node(pos, pos + node.nodeSize, {
                      class: 'collapsed-content',
                    })
                  )
                  return false // Don't descend into children
                }
                return true
              })
            }

            return DecorationSet.create(doc, decorations)
          },
        },
      }),
    ]
  },
})

export default CollapsibleHeading

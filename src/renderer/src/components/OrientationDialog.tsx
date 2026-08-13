import { ModalShell } from './ModalShell'
import styles from '../App.module.css'

function renderInlineMarkdown(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part
  )
}

/** Renders the deliberately small Markdown subset used by bundled Help. */
function OrientationDocument({ markdown }: { markdown: string }): React.JSX.Element {
  const lines = markdown.split(/\r?\n/)
  const blocks: React.JSX.Element[] = []

  for (let index = 0; index < lines.length;) {
    const line = lines[index].trim()
    if (!line) { index++; continue }

    if (line.startsWith('# ')) {
      blocks.push(<h1 key={index}>{renderInlineMarkdown(line.slice(2))}</h1>)
      index++
      continue
    }
    if (line.startsWith('## ')) {
      blocks.push(<h2 key={index}>{renderInlineMarkdown(line.slice(3))}</h2>)
      index++
      continue
    }
    if (line.startsWith('### ')) {
      blocks.push(<h3 key={index}>{renderInlineMarkdown(line.slice(4))}</h3>)
      index++
      continue
    }
    if (line.startsWith('- ')) {
      const start = index
      const items: string[] = []
      while (index < lines.length && lines[index].trim().startsWith('- ')) {
        const itemLines = [lines[index].trim().slice(2)]
        index++
        while (index < lines.length) {
          const continuation = lines[index].trim()
          if (!continuation || continuation.startsWith('#') || continuation.startsWith('- ')) break
          itemLines.push(continuation)
          index++
        }
        items.push(itemLines.join(' '))
      }
      blocks.push(
        <ul key={start}>{items.map((item, itemIndex) =>
          <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
        )}</ul>
      )
      continue
    }

    const start = index
    const paragraph: string[] = []
    while (index < lines.length) {
      const candidate = lines[index].trim()
      if (!candidate || candidate.startsWith('#') || candidate.startsWith('- ')) break
      paragraph.push(candidate)
      index++
    }
    blocks.push(<p key={start}>{renderInlineMarkdown(paragraph.join(' '))}</p>)
  }

  return <div className={styles.orientationContent}>{blocks}</div>
}

interface Props {
  markdown: string
  onClose: () => void
}

export function OrientationDialog({ markdown, onClose }: Props): React.JSX.Element {
  return (
    <ModalShell
      overlayClassName={styles.orientationOverlay}
      dialogClassName={styles.orientationDialog}
      onClose={onClose}
      labelledBy="orientation-title"
    >
      <header className={styles.orientationHeader}>
        <span id="orientation-title">Chora Orientation</span>
        <button autoFocus onClick={onClose}>Close</button>
      </header>
      <OrientationDocument markdown={markdown} />
    </ModalShell>
  )
}

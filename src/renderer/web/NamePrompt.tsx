import { useState } from 'react'
import { ModalShell } from '@renderer/components/ModalShell'
import { ForwardActionButton } from '@renderer/components/ConfirmationDisc'
import { answerNamePrompt, editableName, toFileName, useNamePrompt } from './documentName'
import styles from './NamePrompt.module.css'

// Asks for the study's file name: from File › Rename…, and before the first
// download of an untitled study. Enter or the forward action confirms;
// Escape or a click outside cancels, as with every cancelable dialog.

const COPY = {
  'rename':     { title: 'Rename', detail: 'The file name used when this study is saved.' },
  'first-save': { title: 'Name this study', detail: 'Choose a file name before the first download.' }
} as const

function NameDialog({ purpose }: { purpose: keyof typeof COPY }): React.JSX.Element {
  const [draft, setDraft] = useState(() => (purpose === 'rename' ? editableName() : ''))
  const usable = toFileName(draft) !== null
  const confirm = (): void => { if (usable) answerNamePrompt(draft) }

  return (
    <ModalShell
      overlayClassName={styles.overlay}
      dialogClassName={styles.dialog}
      onClose={() => answerNamePrompt(null)}
      labelledBy="name-prompt-title"
    >
      <header className={styles.header}>
        <span id="name-prompt-title">{COPY[purpose].title}</span>
      </header>
      <div className={styles.content}>
        <p className={styles.detail}>{COPY[purpose].detail}</p>
        <div className={styles.field}>
          <input
            className={styles.input}
            value={draft}
            placeholder="Untitled"
            aria-label="File name"
            autoFocus
            onFocus={e => e.currentTarget.select()}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); confirm() }
            }}
          />
          <span className={styles.extension}>.chora</span>
        </div>
      </div>
      <footer className={styles.footer}>
        <ForwardActionButton label={purpose === 'rename' ? 'Rename' : 'Save'} onClick={confirm} disabled={!usable} />
      </footer>
    </ModalShell>
  )
}

export function NamePrompt(): React.JSX.Element | null {
  const request = useNamePrompt(s => s.request)
  return request ? <NameDialog key={request.purpose} purpose={request.purpose} /> : null
}

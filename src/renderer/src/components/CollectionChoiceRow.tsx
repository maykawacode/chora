import styles from './CollectionChoiceRow.module.css'

export type CollectionChoiceState = 'none' | 'all' | 'mixed'

interface Props {
  name: string
  color: string
  state: CollectionChoiceState
  count?: number
  disabled?: boolean
  onToggle: () => void
}

export function CollectionChoiceRow({
  name, color, state, count, disabled = false, onToggle
}: Props): React.JSX.Element {
  const background = state === 'all'
    ? color
    : state === 'mixed'
      ? `linear-gradient(90deg, ${color} 0 50%, transparent 50% 100%)`
      : 'transparent'
  const stateLabel = state === 'all' ? 'selected' : state === 'mixed' ? 'partly selected' : 'not selected'

  return (
    <button
      type="button"
      className={styles.row}
      disabled={disabled}
      aria-pressed={state === 'mixed' ? 'mixed' : state === 'all'}
      aria-label={`${name} — ${stateLabel}`}
      onClick={onToggle}
    >
      <span className={styles.swatch} style={{ background, borderColor: color }} />
      <span className={styles.name}>{name}</span>
      {count !== undefined && <span className={styles.count}>{count}</span>}
    </button>
  )
}

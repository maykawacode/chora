// ── CollectionsTab ───────────────────────────────────────────────────────────────────
//
// Left pane: scrollable list of collections with keyboard navigation.
// Right pane: detail editor (Name, Color, Definition).
//
// Membership is not edited here — it belongs to the element, and is set on the
// Elements tab alongside color and shape. This tab defines what a collection
// IS; the Elements tab says who is in it.
//
// Delete behavior:
//   - If any element belongs to the collection → confirmation overlay
//   - Otherwise → deletes immediately

import { useRef, useState, useEffect, KeyboardEvent } from 'react'
import { useAppStore } from '../../store/appStore'
import { history, SCORE_HISTORY_OWNER } from '../../store/history'
import { DEFAULT_COLLECTION_COLOR } from '../../lib/color'
import { useResizableSplitPane } from './useResizableSplitPane'
import styles from './DataTab.module.css'

export function CollectionsTab(): React.JSX.Element {
  const collections = useAppStore(s => s.collections)
  const elements    = useAppStore(s => s.elements)
  const selectedId  = useAppStore(s => s.selectedCollectionId)
  const addCollection    = useAppStore(s => s.addCollection)
  const updateCollection = useAppStore(s => s.updateCollection)
  const removeCollection = useAppStore(s => s.removeCollection)
  const selectCollection = useAppStore(s => s.selectCollection)
  const assignPaletteToUncoloredCollections = useAppStore(s => s.assignPaletteToUncoloredCollections)

  // Collections created before the palette existed all carry
  // DEFAULT_COLLECTION_COLOR, which makes a map colored by collection look like
  // a map with color switched off. Offer the one-shot fix only while there is
  // something to fix.
  const uncoloredCount = collections.filter(c => c.color === DEFAULT_COLLECTION_COLOR).length

  const selected = collections.find(c => c.id === selectedId) ?? null

  const [newName,         setNewName]         = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const addInputRef = useRef<HTMLInputElement>(null)
  const splitPane = useResizableSplitPane()

  useEffect(() => {
    if (confirmDeleteId !== null) window.api.setModalOpen(true)
  }, [confirmDeleteId])

  useEffect(() => {
    if (!confirmDeleteId) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setConfirmDeleteId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirmDeleteId])

  function handleAdd(): void {
    const name = newName.trim()
    if (!name) return
    addCollection(name)
    setNewName('')
    addInputRef.current?.focus()
  }

  // Deleting a collection drops it from every member's collectionIds, so warn
  // whenever anyone is in it. Membership is the only thing lost — nothing else
  // in the file points at a collection.
  function requestDelete(id: string): void {
    const hasMembers = elements.some(el => el.collectionIds.includes(id))
    if (hasMembers) setConfirmDeleteId(id)
    else removeCollection(id)
  }

  function handleListKeyDown(e: KeyboardEvent<HTMLUListElement>): void {
    if (!selectedId || collections.length === 0) return
    const idx = collections.findIndex(c => c.id === selectedId)
    if (e.key === 'ArrowDown' && idx < collections.length - 1) {
      selectCollection(collections[idx + 1].id); e.preventDefault()
    } else if (e.key === 'ArrowUp' && idx > 0) {
      selectCollection(collections[idx - 1].id); e.preventDefault()
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      requestDelete(selectedId)
    }
  }

  const confirmCollection = confirmDeleteId
    ? collections.find(c => c.id === confirmDeleteId)
    : null
  const confirmMemberCount = confirmDeleteId
    ? elements.filter(el => el.collectionIds.includes(confirmDeleteId)).length
    : 0

  return (
    <div className={styles.tab} ref={splitPane.containerRef} style={splitPane.containerStyle}>
      {/* ── List pane ── */}
      <div className={styles.listPane} style={splitPane.leftPaneStyle}>
        <div className={styles.listHeader}>Collections ({collections.length})</div>

        <div className={styles.listEditor}>
          {collections.length > 0 && (
            <ul
              className={styles.list}
              tabIndex={0}
              onKeyDown={handleListKeyDown}
              aria-label="Collections"
            >
              {collections.map(collection => (
                <li
                  key={collection.id}
                  className={`${styles.listItem} ${collection.id === selectedId ? styles.selected : ''}`}
                  onClick={() => selectCollection(collection.id)}
                >
                  <span
                    className={styles.collectionSwatch}
                    style={{ background: collection.color, borderColor: collection.color }}
                  />
                  <span className={styles.name}>{collection.name}</span>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.addRow}>
            <input
              ref={addInputRef}
              className={styles.addInput}
              placeholder="New collection…"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            />
          </div>

          {uncoloredCount > 0 && (
            <button type="button" className={styles.bulkBtn} onClick={assignPaletteToUncoloredCollections}>
              Assign colors to {uncoloredCount} uncolored {uncoloredCount === 1 ? 'collection' : 'collections'}
            </button>
          )}
        </div>
      </div>

      {/* ── Resize handle ── */}
      <div className={styles.resizeHandle} style={splitPane.dividerStyle} {...splitPane.dividerProps} />

      {/* ── Detail pane ── */}
      <div className={styles.detailPane} style={splitPane.rightPaneStyle}>
        <div className={styles.fieldRow}>
          <label className={styles.label}>Name</label>
          <input
            key={`name-${selected?.id ?? 'none'}`}
            className={styles.poleInput}
            defaultValue={selected?.name ?? ''}
            disabled={!selected}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') e.currentTarget.blur() }}
            onBlur={e => {
              const v = e.target.value.trim()
              if (selected && v && v !== selected.name) updateCollection(selected.id, { name: v })
            }}
          />
        </div>
        <div className={styles.fieldRow}>
          <label className={styles.label}>Color</label>
          <input
            type="color"
            className={styles.colorInput}
            value={selected?.color ?? DEFAULT_COLLECTION_COLOR}
            disabled={!selected}
            onFocus={() => history.begin(SCORE_HISTORY_OWNER)}
            onBlur={() => history.end(SCORE_HISTORY_OWNER)}
            onChange={e => {
              history.begin(SCORE_HISTORY_OWNER)
              if (selected) updateCollection(selected.id, { color: e.target.value })
            }}
          />
        </div>
        <textarea
          className={styles.description}
          placeholder="Definition…"
          value={selected?.definition ?? ''}
          disabled={!selected}
          onFocus={() => history.begin(SCORE_HISTORY_OWNER)}
          onBlur={() => history.end(SCORE_HISTORY_OWNER)}
          onChange={e => {
            history.begin(SCORE_HISTORY_OWNER)
            if (selected) updateCollection(selected.id, { definition: e.target.value })
          }}
        />
      </div>

      {/* ── Delete confirmation overlay ── */}
      {confirmCollection && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmBox}>
            <p>
              Delete <strong>{confirmCollection.name}</strong>?<br />
              It will be removed from {confirmMemberCount}{' '}
              {confirmMemberCount === 1 ? 'element' : 'elements'}.
            </p>
            <div className={styles.confirmButtons}>
              <button className={styles.confirmCancel} onClick={() => setConfirmDeleteId(null)}>Cancel</button>
              <button
                className={styles.confirmDelete}
                onClick={() => { removeCollection(confirmDeleteId!); setConfirmDeleteId(null) }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

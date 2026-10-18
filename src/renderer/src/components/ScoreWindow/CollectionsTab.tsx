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
//   - Every deletion follows the global confirmDeleteData preference

import { useAppStore } from '../../store/appStore'
import { historyField } from '../../store/historyBindings'
import { DEFAULT_COLLECTION_COLOR } from '../../lib/color'
import { paletteForUncolored } from '../../store/transforms'
import { ConfirmationDisc } from '../ConfirmationDisc'
import { AddRow, listKeys, selectAllOnEntry, useConfirmedDelete, useDataViewLayout, useSelectFirstOnOpen } from './dataList'
import { hostCapabilities } from '../../lib/host'
import styles from './DataTab.module.css'

export function CollectionsTab(): React.JSX.Element {
  const collections = useAppStore(s => s.collections)
  const elements    = useAppStore(s => s.elements)
  const selectedId  = useAppStore(s => s.selectedCollectionId)
  const addCollection    = useAppStore(s => s.addCollection)
  const updateCollection = useAppStore(s => s.updateCollection)
  const removeCollection = useAppStore(s => s.removeCollection)
  const selectCollection = useAppStore(s => s.selectCollection)
  const transform        = useAppStore(s => s.transform)

  // Collections created before the palette existed all carry
  // DEFAULT_COLLECTION_COLOR, which makes a map colored by collection look like
  // a map with color switched off. Offer the one-shot fix only while there is
  // something to fix.
  const uncoloredCount = collections.filter(c => c.color === DEFAULT_COLLECTION_COLOR).length

  const selected = collections.find(c => c.id === selectedId) ?? null
  useSelectFirstOnOpen(!!selected, collections[0]?.id, selectCollection)

  const { stacked, splitPane, className } = useDataViewLayout()

  // Deleting a collection drops it from every member's collectionIds.
  const deletion = useConfirmedDelete(ids => { for (const id of ids) removeCollection(id) })
  const confirmDeleteId = deletion.pendingIds[0] ?? null

  const confirmCollection = confirmDeleteId
    ? collections.find(c => c.id === confirmDeleteId)
    : null
  const confirmMemberCount = confirmDeleteId
    ? elements.filter(el => el.collectionIds.includes(confirmDeleteId)).length
    : 0

  return (
    <div className={className} ref={splitPane.containerRef} style={splitPane.containerStyle}>
      {/* ── List pane ── */}
      <div className={styles.listPane} style={splitPane.leftPaneStyle}>
        {/* The browser shows the count in Score's title instead. */}
        {hostCapabilities().scoreChrome && (
          <div className={styles.listHeader}>Collections ({collections.length})</div>
        )}

        <div className={styles.listEditor}>
          {collections.length > 0 && (
            <ul
              className={styles.list}
              tabIndex={0}
              onKeyDown={listKeys({
                ids: collections.map(c => c.id),
                currentId: selectedId,
                onStep: selectCollection,
                onDelete: () => selectedId && deletion.request([selectedId])
              })}
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
                  <span className={styles.name} title={stacked ? collection.name : undefined}>{collection.name}</span>
                </li>
              ))}
            </ul>
          )}

          <AddRow placeholder="New collection…" focusOnOpen={collections.length === 0} onAdd={addCollection} />

          {uncoloredCount > 0 && (
            <button type="button" className={styles.bulkBtn} onClick={() => transform(paletteForUncolored)}>
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
            {...(stacked ? selectAllOnEntry : {})}
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
            {...historyField(value => { if (selected) updateCollection(selected.id, { color: value }) })}
          />
        </div>
        <textarea
          className={styles.description}
          placeholder="Definition…"
          value={selected?.definition ?? ''}
          disabled={!selected}
          {...historyField(value => { if (selected) updateCollection(selected.id, { definition: value }) })}
        />
      </div>

      {/* ── Delete confirmation overlay ── */}
      {confirmCollection && (
        <ConfirmationDisc
          title={<>Delete <strong>{confirmCollection.name}</strong>?</>}
          detail={confirmMemberCount > 0
            ? <>Remove from {confirmMemberCount} {confirmMemberCount === 1 ? 'element' : 'elements'}.</>
            : 'This cannot be undone.'
          }
          actionLabel="Delete"
          onCancel={deletion.cancel}
          onAction={deletion.confirm}
        />
      )}
    </div>
  )
}

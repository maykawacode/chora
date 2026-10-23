import type { SessionMeta } from './types'

// Studies used to carry an Intent (sessionMeta.definition, plain text) beside
// their rich-text Notes. Notes is now the single study-level field, so a
// loaded or imported study's Intent becomes the first paragraph of its Notes,
// separated from any existing notes by a blank line, and the Intent is
// emptied. The field stays in the format for older files and spreadsheets.

const escapeHtml = (text: string): string => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

export function foldIntentIntoNotes(meta: SessionMeta): SessionMeta {
  const intent = meta.definition.trim()
  if (!intent) return meta.definition ? { ...meta, definition: '' } : meta
  const paragraph = `<div>${escapeHtml(intent).replace(/\r?\n/g, '<br>')}</div>`
  return {
    ...meta,
    definition: '',
    notes: meta.notes ? `${paragraph}<div><br></div>${meta.notes}` : paragraph
  }
}

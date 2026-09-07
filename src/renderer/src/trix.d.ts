// Trix ships no TypeScript types. NotesTab.tsx only uses it for its
// side-effecting custom-element registration (`import 'trix'`) and builds the
// `<trix-editor>`/`<trix-toolbar>` elements imperatively via the DOM, so no
// exported members need declaring here.
declare module 'trix'

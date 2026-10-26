// Text of the browser start page (StartPage.tsx), kept apart from its layout
// so it can be edited on its own. The title is the landing page's wordmark
// (App/site/) and the lead its privacy line; the reference text that used to
// follow lives in GETTING_STARTED.md. The name, tagline and credit are shared
// with About, in lib/identity.ts.

export const START_LEAD = [
  'Chora runs entirely in your browser and sends nothing to a server. It saves studies as files ' +
    'on your computer.'
]

// Longer than the desktop disc's Example, New and Existing: the page has room.
export const START_LABELS = {
  example: 'Explore example study',
  new: 'Start new study',
  open: 'Open existing study'
}

// The landing page sits one level up: the app is served from /chora/app/.
export const START_LINKS = [
  { label: 'About Chora', href: '../' },
  { label: 'Questions and feedback', href: 'https://github.com/maykawacode/chora/discussions' }
]

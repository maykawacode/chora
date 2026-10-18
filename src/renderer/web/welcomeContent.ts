// Text of the browser Welcome page (BrowserWelcome.tsx), kept apart from its
// layout so it can be edited on its own. Drafted from the introduction
// (Output/2026-09-08_chora-introduction-and-reference_v3.md) for the owner to
// revise. A paragraph is a string; a list item may lead with a bold term.

export interface WelcomeItem { term?: string; text: string }

export interface WelcomeSection {
  heading: string
  paragraphs?: string[]
  items?: WelcomeItem[]
  /** Items read as steps, numbered in order. */
  numbered?: boolean
  closing?: string
}

export const WELCOME_TITLE = 'Chora'
export const WELCOME_SUBTITLE = 'Spatial reasoning for qualitative data'

export const WELCOME_LEAD = [
  'Chora is a tool for comparing and clustering a set of items: insights, competitors, ideas, ' +
    'or anything else. It combines the versatility of a spreadsheet with the visual nature of ' +
    'Post-it notes.',
  'List what you are comparing and the qualities you compare them on, place each item between ' +
    'each quality’s two poles, and look at the result on live maps. Change anything and every map ' +
    'follows, so they always reflect your current thinking.'
]

export const ANIMATION_CAPTION = 'An animated walk-through will appear here.'

export const WELCOME_SECTIONS: WelcomeSection[] = [
  {
    heading: 'Fuzzy data, not so fuzzy thoughts',
    paragraphs: [
      'Rather than jumping to forced numerical metrics, Chora uses physical proximity to show ' +
        'relationships. It is especially good for things that are hard to pin down at first. The ' +
        'friction is deliberate: it helps you slow down and reflect.',
      'The meaning of a quality often becomes clear only after several things have been placed. ' +
        'Comparing vegetables on soft–crisp, you may find you are scoring two things at once: how a ' +
        'vegetable feels raw, and how it holds up cooked. Chora lets you rename, redefine or split ' +
        'that quality at any point, and the maps redraw as you go.',
      'Chora purposefully has no algorithmic or AI features that articulate relationships for you. ' +
        'It is a way to exercise your own judgement.'
    ]
  },
  {
    heading: 'The two maps',
    items: [
      { term: 'Cartesian map', text: 'Two qualities as its horizontal and vertical axes. Items with similar scores sit near each other, so clusters and outliers stand out.' },
      { term: 'Semantic map', text: 'Each item as a line across several qualities at once. Lines that follow similar paths describe similar items; where two lines separate shows what tells them apart.' }
    ],
    closing: 'Both are live: drag an item on a map and its score changes everywhere. Keep several maps open at once, and export any of them as an SVG.'
  },
  {
    heading: 'The parts',
    items: [
      { term: 'Elements', text: 'the things being compared, each with a name, definition, colour, shape and weight.' },
      { term: 'Dimensions', text: 'the paired qualities every element is compared on, each with two poles.' },
      { term: 'Scores', text: 'place an element between a dimension’s poles, set in Assess or by moving it on a map.' },
      { term: 'Collections', text: 'named groups; an element can belong to any number of them.' },
      { term: 'Conversions', text: 'turn a dimension into weights or colours, and back.' },
      { term: 'Notes', text: 'say what the study is for, and keep a running log of what you decide and why.' }
    ]
  },
  {
    heading: 'A simple starting sequence',
    numbered: true,
    items: [
      { text: 'Say what the study is for, in Notes.' },
      { text: 'List what you are comparing, in Elements.' },
      { text: 'Name the qualities you will compare them on, in Dimensions.' },
      { text: 'Add any groups worth tracking, in Collections.' },
      { text: 'Score each element, in Assess.' },
      { text: 'Open any number of maps from the Maps menu, and look at the result.' }
    ],
    closing: 'Return to any step at any time. Each icon in the strip on the left opens its view; ' +
      '⌘-click or right-click opens it beside the others.'
  },
  {
    heading: 'Your work stays with you',
    paragraphs: [
      'Chora runs entirely in your browser and sends nothing to a server. Studies are saved as ' +
        'files on your computer, so keep them wherever you keep your work.'
    ]
  },
  {
    heading: 'Where the technique comes from',
    paragraphs: [
      'In the mid-1950s the psychologist George Kelly argued that people make sense of the world ' +
        'through their own bipolar contrasts, drawn out by comparing specific things. His repertory ' +
        'grid asks how two of three items are alike and how the third differs.',
      'In 1957 Charles Osgood, George Suci and Percy Tannenbaum published The Measurement of Meaning, ' +
        'rating concepts on scales such as good–bad and strong–weak: the semantic differential. ' +
        'Together, the two techniques give Chora its two maps.'
    ]
  },
  {
    heading: 'The name',
    paragraphs: [
      'Chora takes its name from the Greek khora, meaning space or region. In Plato’s Timaeus it ' +
        'names the receptacle in which things take their position. The tool asks you not to measure ' +
        'things from outside, but to place them, and in placing them, to work out where they stand.'
    ]
  }
]

export const WELCOME_LINKS = [
  { label: 'Get Chora for Mac', href: 'https://github.com/maykawacode/chora/releases' },
  { label: 'Questions and feedback', href: 'https://github.com/maykawacode/chora/discussions' }
]

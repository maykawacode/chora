// Edit status-bar wording here. The nested property names describe when each
// message appears; changing message text does not require changing any rules.
export const STATUS_MESSAGES = {
  elements: {
    empty: 'Add an element to begin.',
    noSelection: 'Select an element to edit.',
    selected: 'Edit the selected element in the detail panel.'
  },

  dimensions: {
    empty: 'Add a dimension to begin.',
    noSelection: 'Select a dimension to edit.',
    selected: 'Edit the selected dimension in the detail panel.'
  },

  collections: {
    empty: 'Add a collection to begin. Collections are not required for drawing maps.',
    noSelection: 'Select a collection to edit.',
    selected: 'Edit the selected collection in the detail panel.'
  },

  assess: {
    noElements: '[WARNING] You need at least one element before assessing.',
    noDimensions: '[WARNING] you need at least one dimension before assessing.',
    noElementSelection: 'Choose an element to assess.',
    noDimensionSelection: 'Choose a dimension for the selected element.',
    ready: 'Move the score indicator, or use the arrow keys.'
  },

  conversions: {
    ready: 'Choose a source and destination, then apply the conversion.'
  }
} as const

import type { DimensionCategories } from './types'

export interface StarterDimension {
  label: string
  categories: DimensionCategories
}

// Ported from Archive/SuperCard/Default Semantic Pairs (MapTool Dictionary 1.0)
// CSV order: evaluative, potency, activity, utility, socialMeaning, aesthetics
export const STARTER_DIMENSIONS: StarterDimension[] = [
  { label: 'Abstract–Concrete',              categories: { evaluative: true,  potency: false, activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Accessible–Inaccessible',        categories: { evaluative: false, potency: false, activity: true,  utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Aggressive–Passive',             categories: { evaluative: false, potency: true,  activity: false, utility: false, socialMeaning: false, aesthetics: true  } },
  { label: 'Aggressive–Stagnant',            categories: { evaluative: false, potency: true,  activity: false, utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'Analysis–Synthesis',             categories: { evaluative: false, potency: false, activity: true,  utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Authoritative–Speculative',      categories: { evaluative: true,  potency: false, activity: false, utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'Boring–Exciting',                categories: { evaluative: false, potency: true,  activity: false, utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'Chaotic–Orderly',               categories: { evaluative: false, potency: true,  activity: false, utility: false, socialMeaning: false, aesthetics: true  } },
  { label: 'Clear–Obscure',                  categories: { evaluative: false, potency: true,  activity: false, utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'Conservative–Progressive',       categories: { evaluative: false, potency: false, activity: true,  utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'Consulting savvy–Technology savvy', categories: { evaluative: false, potency: false, activity: true, utility: true, socialMeaning: false, aesthetics: false } },
  { label: 'Decorative–Functional',          categories: { evaluative: true,  potency: false, activity: false, utility: false, socialMeaning: false, aesthetics: true  } },
  { label: 'Easy–Difficult',                 categories: { evaluative: false, potency: true,  activity: false, utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'Expensive–Cheap',                categories: { evaluative: true,  potency: false, activity: false, utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'Fast–Slow',                      categories: { evaluative: false, potency: true,  activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Full service–Niche products',    categories: { evaluative: true,  potency: false, activity: false, utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'Fuzzy–Sharp',                    categories: { evaluative: false, potency: true,  activity: false, utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'General–Specific',               categories: { evaluative: true,  potency: false, activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Generic–Tailored',               categories: { evaluative: false, potency: false, activity: true,  utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Hard–Soft',                      categories: { evaluative: false, potency: true,  activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'High–Low',                       categories: { evaluative: true,  potency: false, activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Hot–Cold',                       categories: { evaluative: false, potency: true,  activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Inaccurate–Accurate',            categories: { evaluative: true,  potency: false, activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Interesting–Boring',             categories: { evaluative: false, potency: true,  activity: false, utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'Large–Small',                    categories: { evaluative: true,  potency: false, activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Light–Dark',                     categories: { evaluative: true,  potency: false, activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Long–Short',                     categories: { evaluative: false, potency: true,  activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Luxury–Essential',               categories: { evaluative: false, potency: true,  activity: false, utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'Natural–Artificial',             categories: { evaluative: true,  potency: false, activity: false, utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'Novel–Ubiquitous',               categories: { evaluative: false, potency: true,  activity: false, utility: false, socialMeaning: false, aesthetics: true  } },
  { label: 'Objective–Subjective',           categories: { evaluative: true,  potency: false, activity: false, utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'Open–Closed',                    categories: { evaluative: true,  potency: false, activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Paper based–Electronic',         categories: { evaluative: true,  potency: false, activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Passive–Active',                 categories: { evaluative: false, potency: true,  activity: false, utility: false, socialMeaning: false, aesthetics: true  } },
  { label: 'Personal–Public',                categories: { evaluative: false, potency: false, activity: true,  utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'Portable–Stationary',            categories: { evaluative: true,  potency: false, activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Product–System',                 categories: { evaluative: true,  potency: false, activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Qualitative–Quantitative',       categories: { evaluative: false, potency: true,  activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Shared–Private',                 categories: { evaluative: false, potency: false, activity: true,  utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'Sloppy–Rigorous',               categories: { evaluative: false, potency: true,  activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Smart–Dumb',                     categories: { evaluative: false, potency: true,  activity: false, utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'Tall–Short',                     categories: { evaluative: true,  potency: false, activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Threat–NonThreat',               categories: { evaluative: false, potency: true,  activity: false, utility: false, socialMeaning: true,  aesthetics: false } },
  { label: 'Tight–Loose',                    categories: { evaluative: true,  potency: false, activity: false, utility: true,  socialMeaning: false, aesthetics: false } },
  { label: 'Unbiased–Biased',                categories: { evaluative: false, potency: true,  activity: false, utility: false, socialMeaning: true,  aesthetics: false } },
]

export type CategoryKey = 'all' | 'evaluative' | 'potency' | 'activity' | 'utility' | 'socialMeaning' | 'aesthetics'

export const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'all',          label: 'All' },
  { key: 'evaluative',   label: 'Evaluative' },
  { key: 'potency',      label: 'Potency' },
  { key: 'activity',     label: 'Activity' },
  { key: 'utility',      label: 'Utility' },
  { key: 'socialMeaning', label: 'Social Meaning' },
  { key: 'aesthetics',   label: 'Aesthetics' },
]

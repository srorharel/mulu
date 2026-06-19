// Public legal documents for the marketing site:
//   /legal/privacy  → privacy policy (מדיניות פרטיות)
//   /legal/terms    → terms of use   (תקנון ותנאי שימוש)
//
// SOURCE OF TRUTH: these mirror the CURRENT published versions from the app's
// `legal_documents` table (privacy_policy / consumer_terms, locale he), pulled
// verbatim into src/content/*.md so the public web copy matches the in-app copy.
// When the in-app documents are re-published, re-pull the .md files and rebuild.
// (The "last updated" date + entity details live inside the document text.)
//
// Rendered by src/components/Markdown.jsx (##, ###, - / *, > quote, **bold**, [link]).

import privacyHe from '../content/privacy.he.md?raw'
import termsHe from '../content/terms.he.md?raw'

export const LEGAL_DOCS = {
  privacy: {
    key: 'privacy',
    title: 'מדיניות פרטיות',
    updated: null, // date is in the document body ("עודכן לאחרונה: ...")
    body: privacyHe,
  },
  terms: {
    key: 'terms',
    title: 'תקנון ותנאי שימוש',
    updated: null,
    body: termsHe,
  },
}

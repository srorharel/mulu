import { LEGAL_DOCS } from '../lib/legal.js'
import { Markdown } from '../components/Markdown.jsx'
import { LegalLayout } from './LegalLayout.jsx'

// Renders a single legal document (privacy / terms) from src/lib/legal.js.
export function LegalPage({ docKey }) {
  const doc = LEGAL_DOCS[docKey]
  if (!doc) {
    return (
      <LegalLayout title="המסמך לא נמצא">
        <p className="leading-relaxed text-ink-soft">
          המסמך המבוקש אינו זמין. <a href="/" className="font-semibold text-primary-deep underline">חזרה לדף הבית</a>
        </p>
      </LegalLayout>
    )
  }
  return (
    <LegalLayout title={doc.title} updated={doc.updated}>
      <Markdown source={doc.body} />
    </LegalLayout>
  )
}

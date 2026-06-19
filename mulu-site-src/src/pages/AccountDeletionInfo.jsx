import { Smartphone, Mail, Check } from 'lucide-react'
import { LegalLayout } from './LegalLayout.jsx'

// Public account-deletion page (required by Apple + Google). The marketing site
// has no auth, so this is an instructions page: users delete in-app, or request
// deletion by email. The in-app flow runs the actual delete-account function.
const RETAINED = [
  'פרטים מזהים בהזמנות עוברים אנונימיזציה (הסרת שם, טלפון ופרטים אישיים).',
  'רשומות פיננסיות ותיעוד הזמנות נשמרים כנדרש לפי דין (חובות מס וחשבונאות, בדרך כלל כ-7 שנים).',
  'חשבוניות מס/קבלות נשמרות לתקופה הנדרשת בדין לשמירת מסמכי הנהלת חשבונות.',
]

export function AccountDeletionInfo() {
  return (
    <LegalLayout title="מחיקת חשבון ומידע">
      <div className="space-y-4 leading-relaxed text-ink-soft">
        <p>
          אתם יכולים למחוק בכל עת את חשבון MULU שלכם ואת המידע האישי המשויך אליו. ניתן לעשות זאת
          באחת משתי הדרכים הבאות:
        </p>

        <div className="rounded-2xl border border-line bg-white p-5 shadow-soft">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mist text-primary-deep">
              <Smartphone className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-ink">מתוך האפליקציה (מומלץ)</h2>
              <p className="mt-1">
                היכנסו לאפליקציית MULU, ועברו אל <strong className="font-bold text-ink">הגדרות ← מחיקת חשבון</strong>.
                אשרו את הפעולה, והחשבון יימחק.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5 shadow-soft">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-mist text-primary-deep">
              <Mail className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-lg font-extrabold text-ink">בקשה בדוא"ל</h2>
              <p className="mt-1">
                שלחו בקשת מחיקה לכתובת{' '}
                <a href="mailto:support@muluwash.com" className="font-semibold text-primary-deep underline underline-offset-2">
                  support@muluwash.com
                </a>{' '}
                מכתובת הדוא"ל הרשומה בחשבונכם. נטפל בבקשתכם בתוך זמן סביר ובהתאם להוראות הדין.
              </p>
            </div>
          </div>
        </div>

        <h2 className="mt-8 text-xl font-extrabold text-ink">מה קורה בעת המחיקה</h2>
        <ul className="space-y-2.5">
          {RETAINED.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary-deep">
                <Check className="h-3 w-3" strokeWidth={3.2} aria-hidden="true" />
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>

        <p className="mt-4 text-sm text-ink-mute">
          לפרטים נוספים על המידע שאנו אוספים ועל זכויותיכם, ראו את{' '}
          <a href="/legal/privacy" className="font-semibold text-primary-deep underline underline-offset-2">
            מדיניות הפרטיות
          </a>
          .
        </p>
      </div>
    </LegalLayout>
  )
}

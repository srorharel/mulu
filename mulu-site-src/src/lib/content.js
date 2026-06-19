// All site copy (Hebrew, RTL), recovered from the live brand build and kept in
// one place. The "MULU" wordmark is rendered as a styled component where it
// appears inline, so copy strings use the placeholder where needed.

export const BRAND = 'MULU'

export const nav = {
  links: [
    { href: '#how', label: 'איך זה עובד' },
    { href: '#services', label: 'שירותים' },
    { href: '#experience', label: 'החוויה' },
    { href: '#washers', label: 'הצטרפו כשוטפים' },
  ],
  cta: 'הורידו את האפליקציה',
}

export const hero = {
  badge: 'אלפי בעלי רכב בישראל כבר עברו אלינו',
  titleTop: 'הרכב שלכם מבריק שוב.',
  titleBottom: 'ואתם לא זזים.',
  sub: 'שוטף מאומת מגיע עד הרכב, בדיוק איפה שהוא חונה. בלי תורים, בלי נסיעות, רק רכב נוצץ.',
  // iosUrl / androidUrl: fill these in once the apps are live on the stores.
  // While empty, the store buttons render in a "coming soon / בקרוב" state.
  store: {
    iosTop: 'להורדה ב־', iosBottom: 'App Store', iosUrl: '',
    androidTop: 'זמין ב־', androidBottom: 'Google Play', androidUrl: '',
  },
  chips: ['שוטפים מאומתים', 'תיעוד בתמונות בכל עבודה', 'תשלום מאובטח באפליקציה'],
}

// App preview shown inside the phone mock (matches the original live site UI).
export const phone = {
  greeting: 'בוקר טוב, דנה',
  avatar: 'D',
  promoTitle: '30% הנחה',
  promoSub: 'שטיפה ראשונה',
  question: 'איפה החניתם את הרכב?',
  locationLabel: 'מיקום הרכב',
  address: 'רוטשילד 12, תל אביב',
  locationHint: 'הקש לכוונון המיקום',
  vehicleSectionLabel: 'רכב',
  plateCountry: 'IL',
  plate: '12-345-67',
  vehicle: 'טויוטה קורולה · 2021',
  confirm: 'האם זה הרכב שלך?',
  yes: 'כן, זה שלי',
  // Car-photos section — matches the real app order page (Home.jsx).
  photosTitle: 'תמונות הרכב שלך',
  photosSubtitle: 'נדרשות 4 תמונות, אחת מכל צד',
  photosCount: '4/4',
  orderBtn: 'הזמינו שטיפה',
  // Bottom nav — matches the real app (BottomNav.jsx): Home / History / Profile.
  tabs: ['בית', 'היסטוריה', 'פרופיל'],
  statusTitle: 'שוטף בדרך',
  statusMeta: '8 דק׳ מכאן',
}

export const howItWorks = {
  title: 'שלוש הקשות לרכב נקי',
  sub: 'הכל קורה באפליקציה, מההזמנה ועד הברק.',
  steps: [
    {
      n: '01',
      title: 'מסמנים מיקום',
      body: 'בבית, בעבודה או ברחוב, איפה שהרכב חונה. סימון אחד על המפה, ואנחנו מגיעים בדיוק לשם.',
      icon: 'pin',
    },
    {
      n: '02',
      title: 'מעלים 4 תמונות של הרכב',
      body: 'מצלמים את הרכב מ־4 זוויות, והשוטף מגיע מוכן עם הציוד שמתאים בדיוק לרכב שלכם.',
      icon: 'camera',
    },
    {
      n: '03',
      title: 'השוטף מגיע',
      body: 'שוטף מאומת יוצא לדרך, אתם עוקבים אחריו על המפה, והוא מצלם את הרכב לפני ואחרי מכל זווית.',
      icon: 'sparkles',
    },
  ],
}

export const whyTrust = {
  kicker: 'למה',
  title: 'בנוי על אמון',
  intro: 'כשמישהו מגיע לרכב שלכם, אתם צריכים לסמוך עליו במאה אחוז. ככה בנינו את',
  introTail: 'מהיום הראשון.',
  cards: [
    { title: 'תמונות לכל שטיפה', body: 'תמונות בהגעה, 4 בסיום. אתם מאשרים את התוצאה לפני שסוגרים את העבודה.', icon: 'camera' },
    { title: 'מעקב חי', body: 'רואים את השוטף מתקרב על המפה, ויודעים בדיוק מתי הוא ליד הרכב.', icon: 'map' },
    { title: 'שוטפים מדורגים', body: 'חמש דרגות איכות, שנקבעות מהדירוגים שאתם נותנים. ככל שהשוטף טוב יותר, כך הוא מרוויח יותר.', icon: 'star' },
    { title: 'התראות חכמות', body: 'עדכון בכל שלב: שוטף שובץ, יצא לדרך, הגיע, סיים. אתם אף פעם לא נשארים בחושך.', icon: 'bell' },
  ],
}

export const services = {
  title: 'באים אליכם, לאן שהרכב חונה',
  intro: 'שטיפה חיצונית מקצועית, ליד הבית, בעבודה או בכל מקום אחר. המחיר המלא מופיע באפליקציה לפני האישור.',
  items: [
    {
      tag: 'הכי פופולרי',
      title: 'ליד הבית',
      blurb: 'שוטפים לכם את הרכב בחניה או ברחוב.',
      cta: 'הזמינו שטיפה לבית',
      icon: 'home',
      bullets: ['קובעים שעה שנוחה לכם', 'השטיפה בחניה או ליד הבית', 'עדכונים בזמן אמת בכל שלב', 'תיעוד בתמונות לפני ואחרי'],
    },
    {
      tag: null,
      title: 'בעבודה',
      blurb: 'מזמינים מהמשרד ויורדים לרכב נקי.',
      cta: 'הזמינו שטיפה לעבודה',
      icon: 'briefcase',
      bullets: ['השוטף מגיע לחניון המשרד', 'בלי לבזבז את ההפסקה', 'מעקב הגעה בזמן אמת'],
    },
    {
      tag: null,
      title: 'בכל מקום אחר',
      blurb: 'חדר כושר, קניון, חוף. איפה שחניתם.',
      cta: 'הזמינו שטיפה בכל מקום',
      icon: 'globe',
      bullets: ['מסמנים מיקום בכל מקום', 'השוטף מגיע עם כל הציוד', 'שוטפים מאומתים בסביבה', 'אותה איכות, בכל מיקום'],
    },
  ],
}

export const forWashers = {
  kicker: 'לשוטפים',
  title: 'הזמן הפנוי שלכם שווה כסף',
  intro: 'מצטרפים כשוטפים עצמאיים. אנחנו מביאים את הלקוחות, אתם מביאים את הברק.',
  cards: [
    { title: 'תשלום על כל שטיפה', body: 'התשלום ננעל ברגע שמקבלים עבודה. כסף שאפשר לסמוך עליו.', icon: 'wallet' },
    { title: 'מטפסים בסולם הדרגות', body: 'חמש דרגות שנקבעות לפי הדירוגים שהלקוחות נותנים לכם. שירות טוב יותר, תשלום גבוה יותר.', icon: 'trending' },
    { title: 'עובדים מתי שרוצים', body: 'מתחברים כשנוח לכם. עבודות בסביבה שלכם מגיעות ישר לטלפון.', icon: 'clock' },
    { title: 'מוגנים בתיעוד', body: 'התמונות בהגעה ובסיום מגנות עליכם בכל עבודה.', icon: 'shield' },
  ],
  ladder: {
    title: 'סולם הדרגות',
    sub: 'דירוג גבוה יותר, דרגה גבוהה יותר. תשלום גבוה יותר לשטיפה.',
    caption: 'התשלום לשטיפה עולה מדרגה 1 לדרגה 5',
    // relative payout per rank (1..5)
    bars: [42, 56, 70, 85, 100],
  },
  cta: 'הצטרפו כשוטפים ב־',
}

export const timeline = {
  title: 'ככה נראית שטיפה עם',
  intro: 'בלי הפתעות. כל שלב מעודכן ומתועד בזמן אמת. כך נראית הזמנה אחת, מההתחלה ועד הברק.',
  steps: [
    { title: 'ההזמנה נקלטה', body: 'מחפשים לכם שוטף פנוי באזור.', icon: 'search', tone: 'mist' },
    { title: 'יואב קיבל את העבודה', body: 'שוטף מדורג, 3 ק״מ מכם.', icon: 'check', tone: 'mist' },
    { title: 'השוטף בדרך אליכם', body: 'מעקב חי על המפה, בלי לנחש מתי יגיע.', icon: 'map', tone: 'primary' },
    { title: 'השוטף הגיע — תמונות ״לפני״', body: 'תיעוד מכל זווית, עוד לפני שמתחילים.', icon: 'camera', tone: 'primary' },
    { title: 'השטיפה הסתיימה — תמונות ״אחרי״', body: 'אתם רואים את התוצאה ומאשרים באפליקציה.', icon: 'sparkles', tone: 'primary' },
    { title: 'דירגתם חמישה כוכבים', body: 'ויואב מטפס עוד שלב בסולם הדרגות.', icon: 'star', tone: 'shine' },
  ],
}

export const finalCta = {
  title: 'הרכב שלכם מתגעגע לניקיון',
  sub: 'מורידים את',
  subTail: 'ומזמינים שטיפה ראשונה בפחות מדקה.',
}

export const download = {
  title: 'הורידו את',
  sub: 'סורקים, מזמינים, והרכב מבריק. כל השאר עלינו.',
  comingSoon: 'בקרוב',
  comingSoonHint: 'אנחנו ממש לפני ההשקה — בקרוב ב־App Store וב־Google Play.',
}

export const footer = {
  tagline: 'אנחנו באים אליך.',
  links: [
    { href: '#how', label: 'איך זה עובד' },
    { href: '#services', label: 'שירותים' },
    { href: '#washers', label: 'לשוטפים' },
    { href: '/legal/terms', label: 'תנאי שימוש' },
    { href: '/legal/privacy', label: 'פרטיות' },
    { href: '/accessibility', label: 'הצהרת נגישות' },
  ],
}

// ── Auth landing (/auth/confirm) ─────────────────────────────────────────
// Copy for the token-hash email-verification + password-recovery page. Voice
// matches the Supabase email templates (warm, friendly, RTL Hebrew).
export const auth = {
  verifying: 'רגע, מאמתים את הקישור…',
  // Success states by flow type
  signup: {
    title: 'המייל אומת! 🎉',
    body: 'כתובת המייל שלך אומתה בהצלחה. אפשר לחזור לאפליקציית MULU ולהתחבר, והשטיפה הראשונה במרחק כמה הקשות.',
  },
  email_change: {
    title: 'הכתובת עודכנה!',
    body: 'כתובת המייל החדשה אומתה בהצלחה. אפשר לחזור לאפליקציה ולהמשיך כרגיל.',
  },
  recoveryDone: {
    title: 'הסיסמה עודכנה! 🎉',
    body: 'הסיסמה החדשה נשמרה. אפשר לחזור לאפליקציית MULU ולהתחבר איתה.',
  },
  // Recovery form
  reset: {
    title: 'בחירת סיסמה חדשה',
    body: 'כמעט שם. בחרו סיסמה חדשה לחשבון ה-MULU שלכם.',
    password: 'סיסמה חדשה',
    confirm: 'אימות הסיסמה',
    show: 'הצגת הסיסמה',
    hide: 'הסתרת הסיסמה',
    submit: 'שמירת הסיסמה',
    saving: 'שומרים…',
    tooShort: 'הסיסמה צריכה להכיל לפחות 8 תווים.',
    mismatch: 'הסיסמאות אינן תואמות.',
    failed: 'שמירת הסיסמה נכשלה. נסו שוב, או בקשו קישור חדש מהאפליקציה.',
  },
  // Error states
  invalid: {
    title: 'הקישור אינו תקף',
    body: 'ייתכן שהקישור פג תוקף או שכבר נעשה בו שימוש. אפשר לבקש קישור חדש מתוך אפליקציית MULU.',
  },
  configError: {
    title: 'תקלה זמנית',
    body: 'לא הצלחנו להשלים את הפעולה כרגע. נסו שוב מאוחר יותר, או פנו אלינו בכתובת support@muluwash.com.',
  },
  backHome: 'חזרה לדף הבית',
}

// ── Accessibility (נגישות) ──────────────────────────────────────────────
// Copy for the floating accessibility menu and the הצהרת נגישות page.
// NOTE: the coordinator fields below are PLACEHOLDERS — replace the bracketed
// values with the real accessibility-coordinator details before going live
// (legally required under תקנות שוויון זכויות לאנשים עם מוגבלות, התשע"ג-2013).
export const a11y = {
  menu: {
    button: 'תפריט נגישות',
    title: 'התאמות נגישות',
    intro: 'התאימו את האתר לצרכים שלכם. ההגדרות נשמרות במכשיר.',
    close: 'סגירת תפריט הנגישות',
    fontSize: 'גודל טקסט',
    increase: 'הגדלת טקסט',
    decrease: 'הקטנת טקסט',
    reset: 'איפוס הגדרות',
    statementLink: 'הצהרת הנגישות המלאה',
    options: {
      contrast: 'ניגודיות גבוהה',
      invert: 'היפוך צבעים',
      grayscale: 'גווני אפור',
      readableFont: 'גופן קריא',
      spacing: 'הגדלת ריווח',
      links: 'הדגשת קישורים',
      headings: 'הדגשת כותרות',
      noMotion: 'עצירת אנימציות',
      bigCursor: 'סמן גדול',
    },
  },
  statement: {
    title: 'הצהרת נגישות',
    updated: 'עודכן לאחרונה: [תאריך עדכון]',
    backHome: 'חזרה לדף הבית',
    intro: [
      'ב־MULU אנו רואים חשיבות עליונה במתן שירות שוויוני ונגיש לכלל הלקוחות, ובכלל זה אנשים עם מוגבלות. אנו משקיעים מאמצים ומשאבים רבים כדי שהאתר יהיה זמין, נוח וידידותי לשימוש עבור כולם.',
      'הנגשת האתר בוצעה בהתאם להוראות תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013, ובהתאם לתקן הישראלי ת"י 5568 ברמת AA, המבוסס על הנחיות הנגישות לתכני אינטרנט WCAG 2.0 ברמה AA של ארגון התקינה הבינלאומי W3C.',
    ],
    doneTitle: 'מה הונגש באתר',
    done: [
      'ניווט מלא באמצעות מקלדת בכל חלקי האתר.',
      'מבנה כותרות סמנטי, אזורי ניווט (landmarks) ותגיות ARIA לקוראי מסך.',
      'טקסט חלופי לתמונות ולאלמנטים גרפיים בעלי משמעות.',
      'ניגודיות צבעים תקינה בין הטקסט לרקע.',
      'סימון מצב מיקוד (focus) ברור לניווט במקלדת.',
      'התאמה לקוראי מסך נפוצים.',
      'כיבוד העדפת "צמצום תנועה" (reduced motion) של מערכת ההפעלה.',
    ],
    menuTitle: 'תפריט הנגישות באתר',
    menuIntro:
      'באתר מוצב תפריט נגישות, הנפתח בלחיצה על סמל הנגישות שבפינת המסך. התפריט מאפשר התאמות אישיות, וההגדרות נשמרות במכשיר שלכם:',
    menuFeatures: [
      'הגדלה והקטנה של גודל הטקסט.',
      'ניגודיות גבוהה, היפוך צבעים ותצוגה בגווני אפור.',
      'מעבר לגופן קריא והגדלת הריווח בין שורות ואותיות.',
      'הדגשת קישורים והדגשת כותרות.',
      'עצירת אנימציות ותנועה באתר.',
      'הגדלת סמן העכבר.',
    ],
    limitationsTitle: 'מגבלות ידועות',
    limitations:
      'חרף מאמצינו להנגיש את כלל הדפים והרכיבים, ייתכן שיימצאו חלקים או תכנים שטרם הונגשו במלואם, או תכני צד שלישי שאינם בשליטתנו המלאה (כגון חנויות האפליקציות). אנו ממשיכים לפעול לשיפור הנגישות באופן שוטף. אם נתקלתם ברכיב שאינו נגיש — נשמח שתפנו אלינו ונטפל בכך בהקדם.',
    contactTitle: 'פרטי רכז/ת הנגישות',
    contactIntro:
      'נתקלתם בבעיה או שיש לכם הצעה לשיפור הנגישות באתר? נשמח לשמוע. ניתן לפנות לרכז/ת הנגישות בארגון:',
    // ⬇️ REPLACE these placeholders with the real coordinator details before launch.
    coordinator: [
      { label: 'שם', value: '[שם רכז/ת הנגישות]' },
      { label: 'טלפון', value: '[מספר טלפון]' },
      { label: 'דוא"ל', value: '[כתובת דוא"ל]' },
      { label: 'כתובת', value: '[כתובת למשלוח דואר]' },
    ],
    responseNote: 'נשתדל להגיב לפנייתכם בתוך [מספר] ימי עסקים.',
  },
}

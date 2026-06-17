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
    { href: 'https://muluwash.com/legal/terms', label: 'תנאי שימוש' },
    { href: 'https://muluwash.com/legal/privacy', label: 'פרטיות' },
  ],
}

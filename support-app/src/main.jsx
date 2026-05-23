import React from 'react'
import ReactDOM from 'react-dom/client'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import './index.css'
import App from './App.jsx'

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      he: {
        translation: {
          login: { title: 'כניסה לצוות התמיכה', subtitle: 'רק נציגי תמיכה יכולים להיכנס', email: 'אימייל', password: 'סיסמה', submit: 'כניסה', submitting: 'נכנס...', agentsOnly: 'אפליקציה זו מיועדת לנציגי תמיכה בלבד.' },
          queue: { title: 'תור', unassigned: 'לא מוקצה', mine: 'שלי', others: 'אחרים', assigned: 'מוקצה', all: 'כולם', empty: 'אין שיחות', emptyDesc: 'אין שיחות פתוחות כרגע.', label: { mine: 'שלי', inTreatment: 'בטיפול', waiting: 'ממתין', general: 'כללי' } },
          chat: { resolve: 'סגור', release: 'החזר לתור', placeholder: 'הקלד הודעה...', send: 'שלח', attach: 'צרף תמונה', typing: '{{name}} מקליד...', closed: 'שיחה זו סגורה', empty: 'בחר שיחה מהתור', seen: 'נראה', agentBadge: 'תמיכה', waitingForAgent: 'ממתין לנציג...' },
          order: { title: 'פרטי הזמנה', noOrder: 'אין הזמנה', consumer: 'לקוח', washer: 'שוטף', status: 'סטטוס', total: 'סה"כ', created: 'נוצר', address: 'כתובת', addons: 'תוספות', wiperFluid: 'נוזל מגבים', tirePressure: 'לחץ צמיגים' },
          user: { title: 'פרטי משתמש', role: 'תפקיד', consumer: 'לקוח', washer: 'שוטף', phone: 'טלפון', recentOrders: 'הזמנות אחרונות' },
          settings: { title: 'הגדרות', displayName: 'שם תצוגה', language: 'שפה', save: 'שמור', saved: 'נשמר', canned: 'תגובות מוכנות', cannedEmpty: 'אין תגובות מוכנות.', addCanned: 'הוסף תגובה', shortcut: 'קיצור', bodyHe: 'טקסט (עברית)', bodyEn: 'טקסט (אנגלית)', deleteCanned: 'מחק' },
          status: { active: 'פעיל', away: 'לא זמין' },
          common: { loading: 'טוען...', error: 'שגיאה', cancel: 'ביטול', close: 'סגור', signOut: 'התנתקות', orderLinked: 'הזמנה #{{id}}', general: 'שאלה כללית', pending_agent: 'ממתין', assigned: 'בטיפול', resolved: 'נפתר', closed: 'סגור' },
          serviceLabels: { wash: 'שטיפת רכב', exterior: 'שטיפה חיצונית', interior: 'שטיפה פנימית', full: 'שטיפה מלאה' },
          canned: { insert: 'הכנס תגובה', search: 'חפש...' },
          approvals: {
            tabs: { title: 'אישורים' },
            empty: { title: 'הכל מאושר!', subtitle: 'אין עבודות שממתינות לאישור.' },
            row: { customer: 'לקוח', worker: 'עובד', submitted: 'הוגש {{time}}', vehicle: 'רכב', videoBefore: 'לפני', videoAfter: 'אחרי' },
            section: { arrival: 'תמונות הגעה', completion: 'תמונות סיום' },
            photoSlots: { front: 'חזית', back: 'אחורי', driver: 'נהג', passenger: 'נוסע' },
            actions: { approve: 'אשר', confirmTitle: 'לאשר את העבודה?', confirmMessage: 'הכנסות העובד יזוכו והעבודה תסומן כהושלמה.', confirmYes: 'כן, לאשר', confirmNo: 'לא עכשיו' },
            toasts: { approved: 'אושר' },
            location: { title: 'מיקום הגשה', notRecorded: 'מיקום לא נרשם', submittedAt: 'הוגש {{time}}', distance: 'מרחק {{distance}}מ׳ מכתובת העבודה' },
            error: { title: 'שגיאה בטעינת אישורים', retry: 'נסה שוב' },
          },
          orderActions: {
            cancel: { button: 'בטל הזמנה', confirmTitle: 'לבטל את ההזמנה?', confirmBody: 'ההזמנה תבוטל. העובד, אם הוקצה, יקבל הודעה.', confirmYes: 'כן, לבטל', confirmNo: 'אל תבטל' },
            complete: { button: 'סמן הושלם (עקיפה)', confirmTitle: 'להשלים בלי בדיקת וידאו?', confirmBody: 'זה עוקף את תהליך האישור הרגיל. העובד יקבל ₪60. השתמש רק למקרים חריגים.', confirmYes: 'כן, להשלים', confirmNo: 'אל תשלים' },
            toasts: { cancelled: 'ההזמנה בוטלה', completed: 'ההזמנה הושלמה' },
            error: 'הפעולה נכשלה. נסה שוב.',
          },
          support: {
            tickets: {
              title: 'פניות תמיכה',
              empty: 'אין פניות פתוחות',
              reason: { low_rating: 'דירוג נמוך (1★)' },
              status: { open: 'פתוחה', in_progress: 'בטיפול', resolved: 'טופלה' },
            },
          },
          washerVerifications: {
            tab: 'אימות שוטפים',
            empty: { title: 'אין בקשות ממתינות', subtitle: 'כל הגשות השוטפים נבדקו.' },
            error: { title: 'שגיאה בטעינת בקשות', retry: 'נסה שוב' },
            status: { pending_review: 'ממתין לבדיקה', approved: 'אושר', rejected: 'נדחה' },
            dealerNumber: 'מספר עוסק',
            idDoc: 'תעודת זהות',
            selfie: 'סלפי',
            selfieDoc: 'תמונה',
            license: 'רישיון עסק',
            licenseDoc: 'מסמך',
            rejectReason: 'סיבת דחייה',
            rejectReasonPlaceholder: 'פרט את הסיבה לדחייה...',
            actions: {
              approve: 'אשר',
              reject: 'דחה',
              confirmApprove: 'לאשר את הבקשה?',
              confirmReject: 'אשר דחייה',
              cancel: 'ביטול',
              yes: 'כן, אשר',
              no: 'לא עכשיו',
            },
          },
        },
      },
      en: {
        translation: {
          login: { title: 'Support Team Login', subtitle: 'Only support agents can sign in here', email: 'Email', password: 'Password', submit: 'Sign in', submitting: 'Signing in...', agentsOnly: 'This app is for support agents only.' },
          queue: { title: 'Queue', unassigned: 'Unassigned', mine: 'Mine', others: 'Others', assigned: 'Assigned', all: 'All', empty: 'No conversations', emptyDesc: 'No open conversations right now.', label: { mine: 'Mine', inTreatment: 'In treatment', waiting: 'Waiting', general: 'General' } },
          chat: { resolve: 'Resolve', release: 'Release to queue', placeholder: 'Type a message...', send: 'Send', attach: 'Attach image', typing: '{{name}} is typing...', closed: 'This conversation is closed', empty: 'Select a conversation from the queue', seen: 'Seen', agentBadge: 'Support', waitingForAgent: 'Waiting for agent...' },
          order: { title: 'Order details', noOrder: 'No order linked', consumer: 'Customer', washer: 'Washer', status: 'Status', total: 'Total', created: 'Created', address: 'Address', addons: 'Add-ons', wiperFluid: 'Wiper fluid', tirePressure: 'Tire pressure' },
          user: { title: 'User info', role: 'Role', consumer: 'Consumer', washer: 'Washer', phone: 'Phone', recentOrders: 'Recent orders' },
          settings: { title: 'Settings', displayName: 'Display name', language: 'Language', save: 'Save', saved: 'Saved', canned: 'Canned responses', cannedEmpty: 'No canned responses yet.', addCanned: 'Add response', shortcut: 'Shortcut', bodyHe: 'Text (Hebrew)', bodyEn: 'Text (English)', deleteCanned: 'Delete' },
          status: { active: 'Active', away: 'Away' },
          common: { loading: 'Loading...', error: 'Something went wrong', cancel: 'Cancel', close: 'Close', signOut: 'Sign out', orderLinked: 'Order #{{id}}', general: 'General question', pending_agent: 'Waiting', assigned: 'In progress', resolved: 'Resolved', closed: 'Closed' },
          serviceLabels: { wash: 'Car Wash', exterior: 'Exterior Wash', interior: 'Interior Wash', full: 'Full Wash' },
          canned: { insert: 'Insert response', search: 'Search...' },
          approvals: {
            tabs: { title: 'Approvals' },
            empty: { title: 'All caught up!', subtitle: 'No orders waiting for approval.' },
            row: { customer: 'Customer', worker: 'Worker', submitted: 'Submitted {{time}}', vehicle: 'Vehicle', videoBefore: 'Before', videoAfter: 'After' },
            section: { arrival: 'Arrival photos', completion: 'Completion photos' },
            photoSlots: { front: 'Front', back: 'Back', driver: 'Driver', passenger: 'Passenger' },
            actions: { approve: 'Approve', confirmTitle: 'Approve this job?', confirmMessage: "The worker's earnings will be credited and the order will be marked complete.", confirmYes: 'Yes, approve', confirmNo: 'Not yet' },
            toasts: { approved: 'Approved' },
            location: { title: 'Submission location', notRecorded: 'Location not recorded', submittedAt: 'Submitted {{time}}', distance: '{{distance}}m from job address' },
            error: { title: 'Failed to load approvals', retry: 'Retry' },
          },
          orderActions: {
            cancel: { button: 'Cancel order', confirmTitle: 'Cancel this order?', confirmBody: 'The order will be cancelled. The worker, if assigned, will be notified.', confirmYes: 'Yes, cancel', confirmNo: "Don't cancel" },
            complete: { button: 'Mark complete (override)', confirmTitle: 'Complete this order without video review?', confirmBody: 'This bypasses the normal approval flow. The worker will be paid 60₪. Use only for exceptions.', confirmYes: 'Yes, complete', confirmNo: "Don't complete" },
            toasts: { cancelled: 'Order cancelled', completed: 'Order completed' },
            error: 'Action failed. Try again.',
          },
          support: {
            tickets: {
              title: 'Support tickets',
              empty: 'No open tickets',
              reason: { low_rating: 'Low rating (1★)' },
              status: { open: 'Open', in_progress: 'In progress', resolved: 'Resolved' },
            },
          },
          washerVerifications: {
            tab: 'Washer Verifications',
            empty: { title: 'No pending verifications', subtitle: 'All washer applications have been reviewed.' },
            error: { title: 'Failed to load verifications', retry: 'Retry' },
            status: { pending_review: 'Pending review', approved: 'Approved', rejected: 'Rejected' },
            dealerNumber: 'Dealer number',
            idDoc: 'ID Document',
            selfie: 'Selfie',
            selfieDoc: 'Photo',
            license: 'Business License',
            licenseDoc: 'Document',
            rejectReason: 'Rejection reason',
            rejectReasonPlaceholder: 'Describe the reason for rejection...',
            actions: {
              approve: 'Approve',
              reject: 'Reject',
              confirmApprove: 'Approve this application?',
              confirmReject: 'Confirm rejection',
              cancel: 'Cancel',
              yes: 'Yes, approve',
              no: 'Not yet',
            },
          },
        },
      },
    },
    fallbackLng: 'he',
    supportedLngs: ['he', 'en'],
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'support_locale',
    },
    interpolation: { escapeValue: false },
  })

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

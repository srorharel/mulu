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
          queue: { title: 'תור', unassigned: 'לא מוקצה', mine: 'שלי', all: 'כולם', empty: 'אין שיחות', emptyDesc: 'אין שיחות פתוחות כרגע.' },
          chat: { resolve: 'סגור', release: 'החזר לתור', placeholder: 'הקלד הודעה...', send: 'שלח', attach: 'צרף תמונה', typing: '{{name}} מקליד...', closed: 'שיחה זו סגורה', empty: 'בחר שיחה מהתור', seen: 'נראה', agentBadge: 'תמיכה', waitingForAgent: 'ממתין לנציג...' },
          order: { title: 'פרטי הזמנה', noOrder: 'אין הזמנה', consumer: 'לקוח', washer: 'שוטף', status: 'סטטוס', total: 'סה"כ', created: 'נוצר', address: 'כתובת', addons: 'תוספות', wiperFluid: 'נוזל מגבים', tirePressure: 'לחץ צמיגים' },
          user: { title: 'פרטי משתמש', role: 'תפקיד', consumer: 'לקוח', washer: 'שוטף', phone: 'טלפון', recentOrders: 'הזמנות אחרונות' },
          settings: { title: 'הגדרות', displayName: 'שם תצוגה', language: 'שפה', save: 'שמור', saved: 'נשמר', canned: 'תגובות מוכנות', cannedEmpty: 'אין תגובות מוכנות.', addCanned: 'הוסף תגובה', shortcut: 'קיצור', bodyHe: 'טקסט (עברית)', bodyEn: 'טקסט (אנגלית)', deleteCanned: 'מחק' },
          status: { active: 'פעיל', away: 'לא זמין' },
          common: { loading: 'טוען...', error: 'שגיאה', cancel: 'ביטול', close: 'סגור', signOut: 'התנתקות', orderLinked: 'הזמנה #{{id}}', general: 'שאלה כללית', pending_agent: 'ממתין', assigned: 'בטיפול', resolved: 'נפתר', closed: 'סגור' },
          canned: { insert: 'הכנס תגובה', search: 'חפש...' },
        },
      },
      en: {
        translation: {
          login: { title: 'Support Team Login', subtitle: 'Only support agents can sign in here', email: 'Email', password: 'Password', submit: 'Sign in', submitting: 'Signing in...', agentsOnly: 'This app is for support agents only.' },
          queue: { title: 'Queue', unassigned: 'Unassigned', mine: 'Mine', all: 'All', empty: 'No conversations', emptyDesc: 'No open conversations right now.' },
          chat: { resolve: 'Resolve', release: 'Release to queue', placeholder: 'Type a message...', send: 'Send', attach: 'Attach image', typing: '{{name}} is typing...', closed: 'This conversation is closed', empty: 'Select a conversation from the queue', seen: 'Seen', agentBadge: 'Support', waitingForAgent: 'Waiting for agent...' },
          order: { title: 'Order details', noOrder: 'No order linked', consumer: 'Customer', washer: 'Washer', status: 'Status', total: 'Total', created: 'Created', address: 'Address', addons: 'Add-ons', wiperFluid: 'Wiper fluid', tirePressure: 'Tire pressure' },
          user: { title: 'User info', role: 'Role', consumer: 'Consumer', washer: 'Washer', phone: 'Phone', recentOrders: 'Recent orders' },
          settings: { title: 'Settings', displayName: 'Display name', language: 'Language', save: 'Save', saved: 'Saved', canned: 'Canned responses', cannedEmpty: 'No canned responses yet.', addCanned: 'Add response', shortcut: 'Shortcut', bodyHe: 'Text (Hebrew)', bodyEn: 'Text (English)', deleteCanned: 'Delete' },
          status: { active: 'Active', away: 'Away' },
          common: { loading: 'Loading...', error: 'Something went wrong', cancel: 'Cancel', close: 'Close', signOut: 'Sign out', orderLinked: 'Order #{{id}}', general: 'General question', pending_agent: 'Waiting', assigned: 'In progress', resolved: 'Resolved', closed: 'Closed' },
          canned: { insert: 'Insert response', search: 'Search...' },
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

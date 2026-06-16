// Admin console — internal, English-first. Strings here are NOT user-facing
// in the consumer/washer/agent products. They are not piped through the
// content_overrides system either; admin tooling owns its own copy.

export const resources = {
  en: {
    translation: {
      common: {
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        confirm: 'Confirm',
        loading: 'Loading…',
        error: 'Error',
        signOut: 'Sign out',
        signIn: 'Sign in',
        retry: 'Retry',
        search: 'Search',
        edit: 'Edit',
        send: 'Send',
        upload: 'Upload',
        restore: 'Restore default',
      },
      login: {
        title: 'Super-admin console',
        subtitle: 'Internal owner tools. Sign-in is restricted to super_admin accounts.',
        emailLabel: 'Email',
        passwordLabel: 'Password',
        submit: 'Sign in',
        submitting: 'Signing in…',
        blocked: 'This account is not a super_admin. Access denied.',
      },
      dashboard: {
        tabs: {
          jobs:       'Live Jobs',
          users:      'Users',
          chats:      'Chats',
          content:    'Content',
          branding:   'Branding',
          broadcasts: 'Broadcasts',
          design:     'Design Editor',
          config:     'Config',
          receipts:   'Receipts',
          history:    'History',
          appearance: 'Appearance',
        },
        groups: {
          operations:    'Operations',
          communication: 'Communication',
          content:       'Content & Branding',
          system:        'System',
        },
        empty: {
          title: 'Nothing to show yet',
          subtitle: 'This tab is set up, but its content arrives in a later phase.',
        },
      },
    },
  },
  he: {
    translation: {
      common: {
        save: 'שמירה',
        cancel: 'ביטול',
        delete: 'מחיקה',
        confirm: 'אישור',
        loading: 'טוען…',
        error: 'שגיאה',
        signOut: 'התנתקות',
        signIn: 'כניסה',
        retry: 'נסו שוב',
        search: 'חיפוש',
        edit: 'עריכה',
        send: 'שליחה',
        upload: 'העלאה',
        restore: 'שחזור לברירת מחדל',
      },
      login: {
        title: 'קונסולת מנהל-על',
        subtitle: 'כלי בעלים פנימיים. הגישה מוגבלת לחשבונות super_admin בלבד.',
        emailLabel: 'אימייל',
        passwordLabel: 'סיסמה',
        submit: 'כניסה',
        submitting: 'מתחבר…',
        blocked: 'חשבון זה אינו super_admin. הגישה נדחתה.',
      },
      dashboard: {
        tabs: {
          jobs:       'הזמנות חיות',
          users:      'משתמשים',
          chats:      'צ׳אטים',
          content:    'תוכן',
          branding:   'מיתוג',
          broadcasts: 'התראות',
          design:     'עורך עיצוב',
          config:     'הגדרות',
          receipts:   'קבלות',
          history:    'היסטוריה',
          appearance: 'מראה',
        },
        groups: {
          operations:    'תפעול',
          communication: 'תקשורת',
          content:       'תוכן ומיתוג',
          system:        'מערכת',
        },
        empty: {
          title: 'אין מה להציג עדיין',
          subtitle: 'הטאב מוכן, אך התוכן שלו יגיע בשלב מאוחר יותר.',
        },
      },
    },
  },
}

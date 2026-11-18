# Drive Search Bot (Convex + Firebase)

בוט חיפוש בדרייב: דף צ'אט שרץ על Convex, התחברות עם Google דרך Firebase, ו-Claude שעונה על בסיס הקבצים.
קורא Google Docs, Sheets, Slides, PDF (עד 4MB) וקבצי טקסט. רק חשבון הבעלים יכול להשתמש בו.

## הגדרה
- **Firebase:** Authentication ← Google מופעל. Authentication ← Settings ← Authorized domains ← להוסיף את דומיין ה-`.convex.site`.
- **Convex:** משתנה סביבה `ANTHROPIC_API_KEY`. אופציונלי: `ALLOWED_EMAIL` (ברירת מחדל: בעל הפרויקט).
- **פריסה:** כל push ל-`main` נפרס אוטומטית (GitHub Actions, secret בשם `CONVEX_DEPLOY_KEY`).
- בשאלה הראשונה הבוט יציג קישור להפעלת Drive API. לוחצים Enable פעם אחת.

# Drive Folder Search (Convex + Firebase)

אתר חיפוש מהיר בתיקייה אחת בדרייב (כולל תתי-תיקיות), עם כפתור הורדה לכל קובץ שנמצא.
התחברות עם Google דרך Firebase. רק חשבון הבעלים יכול להשתמש בו. בלי AI ובלי מפתחות בתשלום.

## הגדרה
- **התיקייה:** `convex/settings.ts` (או משתנה סביבה `FOLDER_ID` ב-Convex).
- **Firebase:** Authentication ← Google מופעל. Authorized domains כולל את דומיין ה-`.convex.site`.
- **פריסה:** כל push ל-`main` נפרס אוטומטית (GitHub Actions, secret בשם `CONVEX_DEPLOY_KEY`).
- בחיפוש הראשון האתר יציג קישור להפעלת Drive API. לוחצים Enable פעם אחת.

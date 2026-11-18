# Drive Search Bot

בוט חיפוש בדרייב: אתר צ'אט (Google Apps Script) ששואל את Claude, מחפש בדרייב ועונה על בסיס הקבצים.

## התקנה
1. פרויקט חדש ב-script.google.com.
2. הדבק את `Code.gs`, והוסף קובץ HTML בשם `Index` עם התוכן של `Index.html`.
3. ב-Project Settings ← Script properties הוסף `ANTHROPIC_API_KEY`.
4. Deploy ← Web app. Execute as: Me. Access: Only myself.

## הערה
תוכן נקרא רק ממסמכי Google Docs וקבצי טקסט. אל תעלה את מפתח ה-API לגיט.

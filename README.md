# Drive Search Bot (Convex)

בוט חיפוש בדרייב שרץ כולו על Convex: דף צ'אט, חיבור ל-Google Drive ו-Claude שעונה על בסיס הקבצים.
קורא Google Docs, Sheets, Slides, PDF (עד 4MB) וקבצי טקסט.

## התקנה חד-פעמית

### 1. פריסה ל-Convex (אוטומטית מגיט)
כל push ל-`main` נפרס אוטומטית ל-Convex דרך GitHub Actions.
הגדרה חד-פעמית, אפשר גם מהטלפון:
1. dashboard.convex.dev ← Create project.
2. בפרויקט: Settings ← URL & Deploy Key ← בפריסת **Production** ← Generate Production Deploy Key ← להעתיק.
3. בריפו ב-GitHub: Settings ← Secrets and variables ← Actions ← New repository secret.
   שם: `CONVEX_DEPLOY_KEY`, ערך: המפתח שהעתקת.
4. Actions ← Deploy to Convex ← Run workflow (או כל push ל-main).

כתובת האתר: `https://<שם-הפריסה>.convex.site` (ב-Settings ← URL & Deploy Key, בשורה HTTP Actions URL).

### 2. מפתח OAuth של Google
1. console.cloud.google.com ← פרויקט חדש.
2. APIs & Services ← Library ← **Google Drive API** ← Enable.
3. OAuth consent screen ← External ← למלא שם ואימייל ← ב-Audience להוסיף את עצמך כ-Test user ← ואז **Publish app** (אחרת החיבור פג כל 7 ימים).
4. Credentials ← Create credentials ← OAuth client ID ← Web application.
   ב-Authorized redirect URIs: `https://<שם-הפריסה>.convex.site/auth/callback`
5. לשמור את ה-Client ID וה-Client secret.

### 3. משתני סביבה ב-Convex
ב-dashboard.convex.dev ← Settings ← Environment Variables (בפריסת ה-Production):

| שם | ערך |
|---|---|
| `ANTHROPIC_API_KEY` | מפתח מ-console.anthropic.com |
| `GOOGLE_CLIENT_ID` | מסעיף 2 |
| `GOOGLE_CLIENT_SECRET` | מסעיף 2 |
| `APP_PASSWORD` | סיסמה שתבחר לאתר |

### 4. חיבור הדרייב
נכנסים לכתובת האתר, מקלידים את הסיסמה ולוחצים "חבר את הדרייב". Google יציג אזהרה שהאפליקציה לא מאומתת: Advanced ← Go to... ← Allow.

## אבטחה
- כל מי שיש לו את הסיסמה יכול לחפש בדרייב שלך. בחר סיסמה חזקה.
- אף מפתח לא נשמר בקוד או בגיט.

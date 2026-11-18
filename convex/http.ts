import { httpActionGeneric as httpAction, httpRouter } from "convex/server";
import { PAGE } from "./page";
import { FOLDER_ID as DEFAULT_FOLDER_ID } from "./settings";

const DEFAULT_ALLOWED_EMAIL = "ymalka82810@gmail.com";
const MAX_RESULTS = 30;
const MAX_FOLDERS = 5000; // תקרת תת-תיקיות שנסרקות
const PARENTS_PER_QUERY = 40; // כמה תיקיות בכל שאילתה לדרייב
const CONCURRENCY = 8;
const FOLDER_CACHE_MS = 15 * 60 * 1000;

const FOLDER_MIME = "application/vnd.google-apps.folder";
const DRIVE = "https://www.googleapis.com/drive/v3/files";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

class DriveError extends Error {
  constructor(public status: number, public body: string) {
    super(body);
  }
}

// בודק שהטוקן שייך לבעל הבוט ושיש לו הרשאת קריאה לדרייב
async function checkToken(accessToken: string) {
  const res = await fetch(
    `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!res.ok) return false;
  const info = (await res.json()) as { email?: string; scope?: string };
  const allowed = (process.env.ALLOWED_EMAIL ?? DEFAULT_ALLOWED_EMAIL).toLowerCase();
  return info.email?.toLowerCase() === allowed && String(info.scope).includes("drive.readonly");
}

const quote = (s: string) => `'${s.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

function chunks<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// מריץ משימות במקביל, עד CONCURRENCY בכל רגע
async function pool<T, R>(items: T[], fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

type DriveFile = { id: string; name: string; mimeType: string; webViewLink: string; modifiedTime: string };

async function driveList(token: string, q: string, fields: string, pageSize: number, pageToken?: string) {
  const url = new URL(DRIVE);
  url.search = new URLSearchParams({
    q,
    fields,
    pageSize: String(pageSize),
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
    ...(pageToken ? { pageToken } : {}),
  }).toString();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new DriveError(res.status, await res.text());
  return (await res.json()) as { files?: DriveFile[]; nextPageToken?: string };
}

// כל התיקיות בתוך תיקיית הבסיס (כולל תתי-תיקיות), עם מטמון קצר
const folderCache = new Map<string, { ids: string[]; at: number }>();

async function allFolders(token: string, rootId: string) {
  const cached = folderCache.get(rootId);
  if (cached && Date.now() - cached.at < FOLDER_CACHE_MS) return cached.ids;

  const ids = [rootId];
  let level = [rootId];
  while (level.length && ids.length < MAX_FOLDERS) {
    const found = await pool(chunks(level, PARENTS_PER_QUERY), async (group) => {
      const q = `mimeType = '${FOLDER_MIME}' and trashed = false and (${group.map((id) => `${quote(id)} in parents`).join(" or ")})`;
      const out: string[] = [];
      let pageToken: string | undefined;
      do {
        const page = await driveList(token, q, "nextPageToken, files(id)", 1000, pageToken);
        out.push(...(page.files ?? []).map((f) => f.id));
        pageToken = page.nextPageToken;
      } while (pageToken);
      return out;
    });
    level = found.flat().slice(0, MAX_FOLDERS - ids.length);
    ids.push(...level);
  }
  folderCache.set(rootId, { ids, at: Date.now() });
  return ids;
}

async function search(token: string, rootId: string, text: string) {
  const words = text.split(/\s+/).map((w) => w.trim()).filter(Boolean).slice(0, 6);
  if (!words.length) return [];
  const match = words.map((w) => `fullText contains ${quote(w)}`).join(" and ");

  const folders = await allFolders(token, rootId);
  const groups = await pool(chunks(folders, PARENTS_PER_QUERY), async (group) => {
    const q = `${match} and trashed = false and mimeType != '${FOLDER_MIME}' and (${group.map((id) => `${quote(id)} in parents`).join(" or ")})`;
    const page = await driveList(token, q, "files(id,name,mimeType,webViewLink,modifiedTime)", MAX_RESULTS);
    return page.files ?? [];
  });

  const seen = new Set<string>();
  return groups
    .flat()
    .filter((f) => !seen.has(f.id) && seen.add(f.id))
    .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
    .slice(0, MAX_RESULTS)
    .map((f) => ({ name: f.name, url: f.webViewLink, download: downloadUrl(f), modified: f.modifiedTime }));
}

// קישור הורדה ישיר. קבצי Google (מסמך, גיליון, מצגת) יורדים כ-PDF / Excel / PowerPoint
function downloadUrl(f: DriveFile) {
  const id = encodeURIComponent(f.id);
  switch (f.mimeType) {
    case "application/vnd.google-apps.document":
      return `https://docs.google.com/document/d/${id}/export?format=pdf`;
    case "application/vnd.google-apps.spreadsheet":
      return `https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
    case "application/vnd.google-apps.presentation":
      return `https://docs.google.com/presentation/d/${id}/export/pptx`;
    case "application/vnd.google-apps.drawing":
      return `https://docs.google.com/drawings/d/${id}/export/png`;
    default:
      return f.mimeType.startsWith("application/vnd.google-apps.")
        ? null
        : `https://drive.google.com/uc?export=download&id=${id}`;
  }
}

const http = httpRouter();

// דף האתר
http.route({
  path: "/",
  method: "GET",
  handler: httpAction(async () =>
    new Response(PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
  ),
});

// חיפוש בתיקייה
http.route({
  path: "/search",
  method: "POST",
  handler: httpAction(async (_ctx, req) => {
    try {
      const { accessToken, query } = (await req.json()) as { accessToken?: string; query?: string };
      if (!accessToken || !(await checkToken(accessToken))) {
        return json({ error: "צריך להתחבר מחדש עם Google", needsLogin: true }, 401);
      }
      if (!query?.trim()) return json({ error: "לא הוקלד מה לחפש" }, 400);
      const rootId = process.env.FOLDER_ID ?? DEFAULT_FOLDER_ID;
      const started = Date.now();
      const files = await search(accessToken, rootId, query);
      return json({ files, seconds: Math.round((Date.now() - started) / 100) / 10 });
    } catch (e) {
      if (e instanceof DriveError) {
        if (e.status === 401) return json({ error: "צריך להתחבר מחדש עם Google", needsLogin: true }, 401);
        const enableUrl = e.body.match(
          /https:\/\/console\.(?:developers|cloud)\.google\.com\/apis\/api\/drive\.googleapis\.com\/overview\?project=[\w-]+/,
        )?.[0];
        if (enableUrl) return json({ error: "צריך להפעיל את Drive פעם אחת", enableUrl }, 400);
        if (e.status === 404) return json({ error: "התיקייה לא נמצאה. בדוק את הקישור לתיקייה." }, 400);
        return json({ error: `שגיאה מהדרייב: ${e.body.slice(0, 300)}` }, 500);
      }
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }),
});

export default http;

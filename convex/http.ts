import { httpActionGeneric as httpAction, httpRouter } from "convex/server";
import { PAGE } from "./page";

const MODEL = "claude-sonnet-5-5";
const DEFAULT_ALLOWED_EMAIL = "ymalka82810@gmail.com";
const MAX_FILES = 5;
const MAX_TEXT = 6000;
const MAX_PDF_BYTES = 4 * 1024 * 1024;

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`חסר משתנה סביבה ב-Convex: ${name}`);
  return value;
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
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

async function claude(system: string, content: unknown, maxTokens: number) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content }],
    }),
  });
  const data = await res.json();
  if (!data.content) throw new Error(`שגיאה מ-Claude: ${JSON.stringify(data.error ?? data)}`);
  return (data.content as { type: string; text?: string }[])
    .map((b) => b.text ?? "")
    .join("");
}

type DriveFile = { id: string; name: string; mimeType: string; webViewLink: string; size?: string };

async function fileBlock(file: DriveFile, token: string): Promise<unknown | null> {
  const auth = { Authorization: `Bearer ${token}` };
  const base = `https://www.googleapis.com/drive/v3/files/${file.id}`;
  const exportAs: Record<string, string> = {
    "application/vnd.google-apps.document": "text/plain",
    "application/vnd.google-apps.spreadsheet": "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
  };
  try {
    if (exportAs[file.mimeType]) {
      const r = await fetch(`${base}/export?mimeType=${encodeURIComponent(exportAs[file.mimeType])}`, { headers: auth });
      if (!r.ok) return null;
      return { type: "text", text: `[${file.name}]\n${(await r.text()).slice(0, MAX_TEXT)}` };
    }
    if (file.mimeType === "application/pdf" && Number(file.size ?? 0) <= MAX_PDF_BYTES) {
      const r = await fetch(`${base}?alt=media`, { headers: auth });
      if (!r.ok) return null;
      return {
        type: "document",
        title: file.name,
        source: { type: "base64", media_type: "application/pdf", data: toBase64(new Uint8Array(await r.arrayBuffer())) },
      };
    }
    if (file.mimeType.startsWith("text/")) {
      const r = await fetch(`${base}?alt=media`, { headers: auth });
      if (!r.ok) return null;
      return { type: "text", text: `[${file.name}]\n${(await r.text()).slice(0, MAX_TEXT)}` };
    }
  } catch {
    return null;
  }
  return null;
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

// שאלה לבוט
http.route({
  path: "/ask",
  method: "POST",
  handler: httpAction(async (_ctx, req) => {
    try {
      const { accessToken, question } = (await req.json()) as { accessToken?: string; question?: string };
      if (!accessToken || !(await checkToken(accessToken))) {
        return json({ error: "צריך להתחבר מחדש עם Google", needsLogin: true }, 401);
      }
      if (!question?.trim()) return json({ error: "אין שאלה" }, 400);

      // 1. מילות חיפוש
      const kw = await claude(
        "Return only 1-4 short search keywords for Google Drive, in the same language as the question, separated by commas. No other text.",
        question,
        60,
      );
      const terms = kw
        .split(",")
        .map((s) => s.trim().replace(/['"\\]/g, ""))
        .filter(Boolean)
        .slice(0, 4);
      if (!terms.length) return json({ answer: "לא הצלחתי להבין מה לחפש.", files: [] });

      // 2. חיפוש בדרייב
      const q = `(${terms.map((t) => `fullText contains '${t}'`).join(" or ")}) and trashed = false`;
      const listUrl = new URL("https://www.googleapis.com/drive/v3/files");
      listUrl.search = new URLSearchParams({
        q,
        pageSize: String(MAX_FILES),
        fields: "files(id,name,mimeType,webViewLink,size)",
        includeItemsFromAllDrives: "true",
        supportsAllDrives: "true",
      }).toString();
      const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!listRes.ok) {
        const text = await listRes.text();
        if (listRes.status === 401) return json({ error: "צריך להתחבר מחדש עם Google", needsLogin: true }, 401);
        const enableUrl = text.match(/https:\/\/console\.(?:developers|cloud)\.google\.com\/apis\/api\/drive\.googleapis\.com\/overview\?project=[\w-]+/)?.[0];
        if (enableUrl) return json({ error: "צריך להפעיל את Drive פעם אחת", enableUrl }, 400);
        return json({ error: `שגיאה מהדרייב: ${text.slice(0, 300)}` }, 500);
      }
      const files = ((await listRes.json()).files ?? []) as DriveFile[];
      if (!files.length) return json({ answer: "לא נמצאו קבצים מתאימים.", files: [] });

      // 3. תשובה על בסיס הקבצים
      const blocks = (await Promise.all(files.map((f) => fileBlock(f, accessToken)))).filter(Boolean);
      const answer = await claude(
        "ענה בעברית, בקצרה, רק על סמך הקבצים שסופקו. ציין את שם הקובץ שממנו לקחת. אם התשובה לא בקבצים, אמור זאת.",
        [
          ...blocks,
          { type: "text", text: `קבצים שנמצאו: ${files.map((f) => f.name).join(", ")}\n\nשאלה: ${question}` },
        ],
        800,
      );

      return json({ answer, files: files.map((f) => ({ name: f.name, url: f.webViewLink })) });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }),
});

export default http;

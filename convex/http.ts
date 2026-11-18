import { httpActionGeneric as httpAction, httpRouter } from "convex/server";
import { refs } from "./google";
import { PAGE } from "./page";

const MODEL = "claude-sonnet-5-5";
const SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const MAX_FILES = 5;
const MAX_TEXT = 6000;
const MAX_PDF_BYTES = 4 * 1024 * 1024;

const env = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`חסר משתנה סביבה: ${name}`);
  return value;
};
const redirectUri = () => `${env("CONVEX_SITE_URL")}/auth/callback`;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
const html = (body: string, status = 200) =>
  new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });

function passwordOk(given: string | null) {
  const real = env("APP_PASSWORD");
  if (!given || given.length !== real.length) return false;
  let diff = 0;
  for (let i = 0; i < real.length; i++) diff |= real.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

async function accessToken(refreshToken: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("החיבור לדרייב פג. התחבר מחדש ל-Google.");
  return data.access_token as string;
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
http.route({ path: "/", method: "GET", handler: httpAction(async () => html(PAGE)) });

// התחברות ל-Google (פעם אחת)
http.route({
  path: "/auth/start",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    if (!passwordOk(new URL(req.url).searchParams.get("password"))) return html("סיסמה שגויה", 401);
    const state = crypto.randomUUID();
    await ctx.runMutation(refs.addState, { state });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: env("GOOGLE_CLIENT_ID"),
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    }).toString();
    return Response.redirect(url.toString(), 302);
  }),
});

http.route({
  path: "/auth/callback",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const params = new URL(req.url).searchParams;
    const state = params.get("state");
    const code = params.get("code");
    if (!state || !code || !(await ctx.runMutation(refs.consumeState, { state }))) {
      return html("ההתחברות נכשלה. נסה שוב מהאתר.", 400);
    }
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env("GOOGLE_CLIENT_ID"),
        client_secret: env("GOOGLE_CLIENT_SECRET"),
        redirect_uri: redirectUri(),
        grant_type: "authorization_code",
      }),
    });
    const data = await res.json();
    if (!data.refresh_token) return html("Google לא החזיר הרשאה. נסה שוב.", 400);
    await ctx.runMutation(refs.saveToken, { refreshToken: data.refresh_token });
    return html('<meta charset="utf-8"><p dir="rtl">הדרייב מחובר. <a href="/">חזרה לבוט</a></p>');
  }),
});

// שאלה לבוט
http.route({
  path: "/ask",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    try {
      const { password, question } = (await req.json()) as { password?: string; question?: string };
      if (!passwordOk(password ?? null)) return json({ error: "סיסמה שגויה" }, 401);
      if (!question?.trim()) return json({ error: "אין שאלה" }, 400);

      const refreshToken = await ctx.runQuery(refs.getToken, {});
      if (!refreshToken) return json({ error: "הדרייב עוד לא מחובר", needsAuth: true }, 400);
      const token = await accessToken(refreshToken);

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
      const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
      const files = ((await listRes.json()).files ?? []) as DriveFile[];
      if (!files.length) return json({ answer: "לא נמצאו קבצים מתאימים.", files: [] });

      // 3. תשובה על בסיס הקבצים
      const blocks = (await Promise.all(files.map((f) => fileBlock(f, token)))).filter(Boolean);
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

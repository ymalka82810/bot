import { FIREBASE_CONFIG } from "./firebaseConfig";

export const PAGE = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>חיפוש בדרייב</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #f5f5f5; }
    #app { max-width: 640px; margin: 0 auto; padding: 16px; }
    h1 { font-size: 20px; }
    #log { display: flex; flex-direction: column; gap: 10px; margin-bottom: 80px; }
    .msg { padding: 10px 14px; border-radius: 12px; line-height: 1.5; white-space: pre-wrap; }
    .me { background: #dbeafe; align-self: flex-start; }
    .bot { background: #fff; align-self: flex-end; }
    .files a, .msg a { display: block; font-size: 13px; margin-top: 4px; }
    #ask { position: fixed; bottom: 0; right: 0; left: 0; display: flex; gap: 8px;
           padding: 10px; background: #fff; border-top: 1px solid #ddd; }
    input { flex: 1; padding: 10px; font-size: 16px; border: 1px solid #ccc; border-radius: 8px; }
    button { padding: 10px 16px; font-size: 16px; border: 0; border-radius: 8px; background: #2563eb; color: #fff; }
    button:disabled { opacity: .5; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
<div id="app">
  <h1>חיפוש בדרייב</h1>
  <button id="login" class="hidden">התחבר עם Google</button>
  <div id="log"></div>
</div>
<form id="ask" class="hidden">
  <input id="q" placeholder="מה לחפש בדרייב?" autocomplete="off" required>
  <button id="b">שלח</button>
</form>
<script type="module">
  import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
  import { getAuth, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

  const auth = getAuth(initializeApp(${JSON.stringify(FIREBASE_CONFIG)}));
  const provider = new GoogleAuthProvider();
  provider.addScope("https://www.googleapis.com/auth/drive.readonly");

  const $ = (id) => document.getElementById(id);
  let token = null;
  try {
    const saved = JSON.parse(sessionStorage.getItem("drive-token") || "null");
    if (saved && saved.exp > Date.now()) token = saved.token;
  } catch (e) {}

  function show() {
    $("login").classList.toggle("hidden", !!token);
    $("ask").classList.toggle("hidden", !token);
  }
  show();

  $("login").addEventListener("click", async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      token = GoogleAuthProvider.credentialFromResult(result).accessToken;
      try { sessionStorage.setItem("drive-token", JSON.stringify({ token, exp: Date.now() + 50 * 60 * 1000 })); } catch (e) {}
      show();
    } catch (err) {
      add("ההתחברות נכשלה: " + err.message, "bot");
    }
  });

  function add(text, cls) {
    const d = document.createElement("div");
    d.className = "msg " + cls;
    d.textContent = text;
    $("log").appendChild(d);
    window.scrollTo(0, document.body.scrollHeight);
    return d;
  }

  function link(parent, href, text) {
    const a = document.createElement("a");
    a.href = href; a.target = "_blank"; a.textContent = text;
    parent.appendChild(a);
  }

  $("ask").addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = $("q").value.trim();
    if (!text) return;
    add(text, "me");
    $("q").value = "";
    $("b").disabled = true;
    const wait = add("מחפש...", "bot");
    try {
      const res = await fetch("/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token, question: text }),
      });
      const r = await res.json();
      if (r.error) {
        wait.textContent = r.error;
        if (r.enableUrl) {
          link(wait, r.enableUrl, "לחץ כאן ← Enable, ואז שאל שוב");
        }
        if (r.needsLogin) {
          token = null;
          try { sessionStorage.removeItem("drive-token"); } catch (e) {}
          show();
        }
      } else {
        wait.textContent = r.answer;
        if (r.files.length) {
          const box = document.createElement("div");
          box.className = "files";
          r.files.forEach((x) => link(box, x.url, x.name));
          wait.appendChild(box);
        }
      }
    } catch (err) {
      wait.textContent = "שגיאה: " + err.message;
    }
    $("b").disabled = false;
  });
</script>
</body>
</html>`;

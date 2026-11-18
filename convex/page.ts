import { FIREBASE_CONFIG } from "./firebaseConfig";

export const PAGE = `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>חיפוש בתיקייה</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; background: #f5f5f5; color: #111; }
    #app { max-width: 640px; margin: 0 auto; padding: 16px; }
    h1 { font-size: 20px; margin: 0 0 12px; }
    form { display: flex; gap: 8px; margin-bottom: 12px; }
    input { flex: 1; min-width: 0; padding: 12px; font-size: 16px; border: 1px solid #ccc; border-radius: 10px; }
    button, .dl { padding: 12px 16px; font-size: 16px; border: 0; border-radius: 10px;
                  background: #2563eb; color: #fff; text-decoration: none; white-space: nowrap; }
    button:disabled { opacity: .5; }
    #status { color: #555; font-size: 14px; margin: 8px 0; }
    #status a { display: inline-block; margin-top: 6px; }
    .file { display: flex; align-items: center; gap: 10px; background: #fff; border-radius: 10px;
            padding: 10px 12px; margin-bottom: 8px; }
    .info { flex: 1; min-width: 0; }
    .name { color: #111; text-decoration: none; font-weight: 600; display: block;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .date { color: #777; font-size: 12px; }
    .dl { padding: 8px 12px; font-size: 14px; }
    .hidden { display: none !important; }
  </style>
</head>
<body>
<div id="app">
  <h1>חיפוש בתיקייה</h1>
  <button id="login" class="hidden">התחבר עם Google</button>
  <form id="find" class="hidden">
    <input id="q" placeholder="שם קובץ או מילה מתוכו" autocomplete="off" required>
    <button id="b">חפש</button>
  </form>
  <div id="status"></div>
  <div id="results"></div>
</div>
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
    $("find").classList.toggle("hidden", !token);
  }
  show();

  $("login").addEventListener("click", async () => {
    try {
      const result = await signInWithPopup(auth, provider);
      token = GoogleAuthProvider.credentialFromResult(result).accessToken;
      try { sessionStorage.setItem("drive-token", JSON.stringify({ token, exp: Date.now() + 50 * 60 * 1000 })); } catch (e) {}
      $("status").textContent = "";
      show();
      $("q").focus();
    } catch (err) {
      $("status").textContent = "ההתחברות נכשלה: " + err.message;
    }
  });

  function fileRow(f) {
    const row = document.createElement("div");
    row.className = "file";
    const info = document.createElement("div");
    info.className = "info";
    const name = document.createElement("a");
    name.className = "name"; name.href = f.url; name.target = "_blank"; name.textContent = f.name;
    const date = document.createElement("div");
    date.className = "date";
    date.textContent = new Date(f.modified).toLocaleDateString("he-IL");
    info.append(name, date);
    row.appendChild(info);
    if (f.download) {
      const dl = document.createElement("a");
      dl.className = "dl"; dl.href = f.download; dl.target = "_blank"; dl.textContent = "הורדה";
      row.appendChild(dl);
    }
    return row;
  }

  $("find").addEventListener("submit", async (e) => {
    e.preventDefault();
    const query = $("q").value.trim();
    if (!query) return;
    $("b").disabled = true;
    $("results").innerHTML = "";
    $("status").textContent = "מחפש...";
    try {
      const res = await fetch("/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: token, query }),
      });
      const r = await res.json();
      if (r.error) {
        $("status").textContent = r.error;
        if (r.enableUrl) {
          const a = document.createElement("a");
          a.href = r.enableUrl; a.target = "_blank";
          a.textContent = "לחץ כאן ← Enable, ואז חפש שוב";
          $("status").append(document.createElement("br"), a);
        }
        if (r.needsLogin) {
          token = null;
          try { sessionStorage.removeItem("drive-token"); } catch (e) {}
          show();
        }
      } else if (!r.files.length) {
        $("status").textContent = "לא נמצאו קבצים (" + r.seconds + " שניות)";
      } else {
        $("status").textContent = "נמצאו " + r.files.length + " קבצים (" + r.seconds + " שניות)";
        r.files.forEach((f) => $("results").appendChild(fileRow(f)));
      }
    } catch (err) {
      $("status").textContent = "שגיאה: " + err.message;
    }
    $("b").disabled = false;
  });
</script>
</body>
</html>`;

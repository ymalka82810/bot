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
    .files a { display: block; font-size: 13px; margin-top: 4px; }
    form { display: flex; gap: 8px; }
    #ask { position: fixed; bottom: 0; right: 0; left: 0; padding: 10px; background: #fff; border-top: 1px solid #ddd; }
    input { flex: 1; padding: 10px; font-size: 16px; border: 1px solid #ccc; border-radius: 8px; }
    button { padding: 10px 16px; font-size: 16px; border: 0; border-radius: 8px; background: #2563eb; color: #fff; }
    button:disabled { opacity: .5; }
    .hidden { display: none; }
    #connect { display: inline-block; margin: 8px 0; }
  </style>
</head>
<body>
<div id="app">
  <h1>חיפוש בדרייב</h1>
  <form id="login">
    <input id="pw" type="password" placeholder="סיסמה" required>
    <button>כניסה</button>
  </form>
  <a id="connect" class="hidden" href="#">חבר את הדרייב (פעם אחת)</a>
  <div id="log"></div>
</div>
<form id="ask" class="hidden">
  <input id="q" placeholder="מה לחפש בדרייב?" autocomplete="off" required>
  <button id="b">שלח</button>
</form>
<script>
  const $ = (id) => document.getElementById(id);
  let password = '';
  try { password = localStorage.getItem('pw') || ''; } catch (e) {}

  function ready() {
    $('login').classList.add('hidden');
    $('ask').classList.remove('hidden');
    $('connect').href = '/auth/start?password=' + encodeURIComponent(password);
  }
  if (password) ready();

  $('login').addEventListener('submit', (e) => {
    e.preventDefault();
    password = $('pw').value;
    try { localStorage.setItem('pw', password); } catch (e) {}
    ready();
  });

  function add(text, cls) {
    const d = document.createElement('div');
    d.className = 'msg ' + cls;
    d.textContent = text;
    $('log').appendChild(d);
    window.scrollTo(0, document.body.scrollHeight);
    return d;
  }

  $('ask').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('q').value.trim();
    if (!text) return;
    add(text, 'me');
    $('q').value = '';
    $('b').disabled = true;
    const wait = add('מחפש...', 'bot');
    try {
      const res = await fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, question: text }),
      });
      const r = await res.json();
      if (r.error) {
        wait.textContent = 'שגיאה: ' + r.error;
        if (r.needsAuth) $('connect').classList.remove('hidden');
        if (res.status === 401) {
          try { localStorage.removeItem('pw'); } catch (e) {}
          $('login').classList.remove('hidden');
          $('ask').classList.add('hidden');
        }
      } else {
        wait.textContent = r.answer;
        if (r.files.length) {
          const box = document.createElement('div');
          box.className = 'files';
          r.files.forEach((x) => {
            const a = document.createElement('a');
            a.href = x.url; a.target = '_blank'; a.textContent = x.name;
            box.appendChild(a);
          });
          wait.appendChild(box);
        }
      }
    } catch (err) {
      wait.textContent = 'שגיאה: ' + err.message;
    }
    $('b').disabled = false;
  });
</script>
</body>
</html>`;

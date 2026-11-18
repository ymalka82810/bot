const MODEL = 'claude-sonnet-5-5';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index').setTitle('חיפוש בדרייב');
}

function callClaude_(system, user, maxTokens) {
  const key = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  const res = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system: system,
      messages: [{ role: 'user', content: user }]
    }),
    muteHttpExceptions: true
  });
  const data = JSON.parse(res.getContentText());
  if (!data.content) throw new Error(res.getContentText());
  return data.content[0].text;
}

function readText_(file) {
  try {
    const type = file.getMimeType();
    let text = '';
    if (type === MimeType.GOOGLE_DOCS) {
      text = DocumentApp.openById(file.getId()).getBody().getText();
    } else if (type.indexOf('text/') === 0) {
      text = file.getBlob().getDataAsString();
    }
    return text.slice(0, 4000);
  } catch (e) {
    return '';
  }
}

// נקרא מהאתר
function ask(question) {
  // 1. מילות חיפוש
  const kw = callClaude_(
    'Return only 1-4 short search keywords for Google Drive, in the same language as the question, separated by commas. No other text.',
    question, 60);
  const terms = kw.split(',')
    .map(function (s) { return s.trim().replace(/['"\\]/g, ''); })
    .filter(Boolean).slice(0, 4);
  if (!terms.length) return { answer: 'לא הצלחתי להבין מה לחפש.', files: [] };

  // 2. חיפוש בדרייב
  const q = '(' + terms.map(function (t) { return "fullText contains '" + t + "'"; }).join(' or ') +
    ') and trashed = false';
  const it = DriveApp.searchFiles(q);
  const files = [];
  while (it.hasNext() && files.length < 5) {
    const f = it.next();
    files.push({ name: f.getName(), url: f.getUrl(), text: readText_(f) });
  }
  if (!files.length) return { answer: 'לא נמצאו קבצים מתאימים.', files: [] };

  // 3. תשובה על בסיס הקבצים
  const context = files.map(function (f, i) {
    return '[' + (i + 1) + '] ' + f.name + '\n' + (f.text || '(אין תוכן טקסט זמין)');
  }).join('\n\n');
  const answer = callClaude_(
    'ענה בעברית, בקצרה, רק על סמך הקבצים שסופקו. ציין את שם הקובץ שממנו לקחת. אם התשובה לא בקבצים, אמור זאת.',
    'קבצים:\n' + context + '\n\nשאלה: ' + question, 700);

  return {
    answer: answer,
    files: files.map(function (f) { return { name: f.name, url: f.url }; })
  };
}

#!/usr/bin/env bash
# מעלה ומפרסם את הבוט ל-Google Apps Script בפקודה אחת.
set -e
command -v clasp >/dev/null || npm install -g @google/clasp
if [ ! -f .clasp.json ]; then
  clasp login
  clasp create --type webapp --title "Drive Search Bot" --rootDir .
fi
clasp push -f
clasp deploy --description "v$(date +%s)"
echo
echo "נשאר דבר אחד: script.google.com -> הפרויקט -> Project Settings -> Script properties"
echo "להוסיף ANTHROPIC_API_KEY עם המפתח שלך."
echo "את הכתובת של האתר רואים ב: Deploy -> Manage deployments"

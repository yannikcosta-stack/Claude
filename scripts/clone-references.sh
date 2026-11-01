#!/usr/bin/env bash
# Klont alle recherchierten Referenz-Projekte (flach) nach ./vendor/ – nicht Teil dieses Git-Repos.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p vendor

REPOS=(
  # Familien-Dashboard
  svenger87/kinboard
  sandydargoport/prism
  Brottuetchen/familienhub
  jherforth/HomeGlow
  caspii/dinkydash
  # ADHS / Gamification
  jp1337/momo
  kks0488/dailywave
  dohsimpson/HabitTrove
  super-productivity/super-productivity
  # Optional: Einkauf / Haushalt / Home Assistant
  TomBursch/kitchenowl
  donetick/donetick
  FamousWolf/week-planner-card
)

for r in "${REPOS[@]}"; do
  name="${r#*/}"
  if [ -d "vendor/$name" ]; then
    echo "✔ $name vorhanden – aktualisiere"
    git -C "vendor/$name" pull --ff-only -q || true
  else
    echo "⇣ $r"
    git clone --depth 1 -q "https://github.com/$r.git" "vendor/$name"
  fi
done
echo "Fertig. Projekte liegen in ./vendor/"

// Start im Container: Datenordner auf dem NAS gehört oft root.
// Einmal dem Benutzer „node“ (1000) übergeben, dann ohne root-Rechte weiterlaufen.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(process.env.DATA_DIR || '/data');
const UID = Number(process.env.PUID || 1000), GID = Number(process.env.PGID || 1000);

function chownTree(p) {
  try { fs.chownSync(p, UID, GID); } catch { return; }
  let st;
  try { st = fs.statSync(p); } catch { return; }
  if (st.isDirectory()) for (const f of fs.readdirSync(p)) chownTree(path.join(p, f));
}

if (typeof process.getuid === 'function' && process.getuid() === 0) {
  fs.mkdirSync(dir, { recursive: true });
  chownTree(dir);
  try {
    process.setgid(GID);
    process.setuid(UID);
  } catch (e) {
    console.warn('[start] Konnte root-Rechte nicht abgeben:', e.message);
  }
}

const { start } = await import('./index.js');
const { stop } = start();
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(0); });

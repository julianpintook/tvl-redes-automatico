// Restaurar datos desde una copia de seguridad (uso manual, nunca corre solo).
//
// 1) Bajar del repositorio privado "tvl-redes-respaldos" la carpeta "ultimo" (o la de una semana anterior,
//    desde el historial de Git).
// 2) Correr:  FIREBASE_SERVICE_ACCOUNT="$(cat cuenta.json)" node restaurar.mjs <carpeta> <coleccion> [--todo]
//    - Sin --todo, solo restaura los documentos que FALTAN (no pisa lo que existe).
//    - Con --todo, vuelve a dejar cada documento exactamente como estaba en la copia.
import fs from 'node:fs';
import admin from 'firebase-admin';

const [dir, col, mode] = process.argv.slice(2);
if (!dir || !col) {
  console.log('Uso: node restaurar.mjs <carpeta> <coleccion> [--todo]');
  process.exit(1);
}
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
const db = admin.firestore();

const revive = (v) => {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(revive);
  if ('__ts' in v) return admin.firestore.Timestamp.fromDate(new Date(v.__ts));
  if ('__geo' in v) return new admin.firestore.GeoPoint(v.__geo[0], v.__geo[1]);
  if ('__ref' in v) return db.doc(v.__ref);
  if ('__bytes' in v) return Buffer.from(v.__bytes, 'base64');
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)]));
};

let written = 0;
async function restore(ref, docs) {
  for (const [id, { data, sub }] of Object.entries(docs)) {
    const d = ref.doc(id);
    if (data && (mode === '--todo' || !(await d.get()).exists)) {
      await d.set(revive(data));
      written++;
    }
    for (const [c, subDocs] of Object.entries(sub || {})) await restore(d.collection(c), subDocs);
  }
}

const file = `${dir}/${col}.json`;
await restore(db.collection(col), JSON.parse(fs.readFileSync(file, 'utf8')));
console.log(`Listo: ${written} documento(s) restaurado(s) en "${col}".`);
await admin.app().delete();

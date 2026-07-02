import fs from "fs";
import path from "path";

const stagingDir = "content-staging";
const files = ["ogolne.json","historia_a.json","historia_b.json","geografia.json","tradycje_ludzie.json"];
const validCats = new Set(["ogolne","historia","geografia","tradycje","ludzie","wspolczesna"]);

let all = [];
for (const f of files) {
  const arr = JSON.parse(fs.readFileSync(path.join(stagingDir, f), "utf8"));
  all.push(...arr);
}

const ids = new Set();
const problems = [];
const seenDup = [];
for (const c of all) {
  if (!c.id) problems.push("нет id: " + JSON.stringify(c).slice(0,60));
  if (ids.has(c.id)) seenDup.push(c.id); else ids.add(c.id);
  if (!validCats.has(c.category)) problems.push(`${c.id}: плохая категория ${c.category}`);
  for (const field of ["q_ru","a_pl","a_ru"]) if (!c[field]) problems.push(`${c.id}: пустое ${field}`);
  if (!c.translit) problems.push(`${c.id}: нет translit`);
  if (c.personal === undefined) c.personal = false;
  if (!c.difficulty) c.difficulty = 2;
  if (!Array.isArray(c.tags)) c.tags = [];
}

// статистика по категориям
const byCat = {};
for (const c of all) byCat[c.category] = (byCat[c.category]||0)+1;

fs.mkdirSync("src/data", { recursive: true });
fs.writeFileSync("src/data/cards.json", JSON.stringify(all, null, 2) + "\n");

console.log("Всего карточек:", all.length);
console.log("По категориям:", JSON.stringify(byCat));
console.log("Дубли id:", seenDup.length ? seenDup.join(", ") : "нет");
console.log("Проблемы (" + problems.length + "):");
problems.slice(0,40).forEach(p => console.log("  - " + p));

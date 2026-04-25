import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dir, "../.env.local"), "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const h = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function get(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, { headers: h });
  return res.json();
}

console.log("=== courses table ===");
const courses = await get("/courses?select=place_id,name,photo_uri");
for (const c of courses) {
  console.log(`  ${c.place_id}: photo=${c.photo_uri ? "✓" : "✗ MISSING"} name="${c.name}"`);
}

console.log("\n=== tee_times: course_place_id per course ===");
const tt = await get("/tee_times?select=course_name,course_place_id,tee_datetime&order=tee_datetime.desc");
for (const t of tt) {
  console.log(`  "${t.course_name}" → place_id=${t.course_place_id ?? "NULL ⚠️"} (${t.tee_datetime.slice(0,10)})`);
}

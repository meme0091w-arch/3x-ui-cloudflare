import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["frontend", "worker"];
const malformed = [];
const walk = dir => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (["node_modules", ".git", "dist"].includes(name)) continue;
    if (/[{}]/.test(name)) malformed.push(full);
    if (statSync(full).isDirectory()) walk(full);
  }
};
roots.forEach(walk);
if (malformed.length) {
  console.error("Malformed directories found:\n" + malformed.join("\n"));
  process.exit(1);
}
console.log("Repository structure OK: no malformed source directories.");

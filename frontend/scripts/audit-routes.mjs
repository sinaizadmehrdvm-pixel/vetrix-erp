import { readFile } from "node:fs/promises";

const [app, sidebar, translations] = await Promise.all([
  readFile("src/App.jsx", "utf8"),
  readFile("src/components/Sidebar.jsx", "utf8"),
  readFile("src/localization/translations.js", "utf8"),
]);

const failures = [];
const lazyNames = [...app.matchAll(/const\s+(\w+)\s*=\s*lazy\(/g)].map((match) => match[1]);
const routedNames = new Set([...app.matchAll(/element=\{<(\w+)\s*\/>\}/g)].map((match) => match[1]));
for (const name of lazyNames) {
  if (name === "Login" || name === "InvoiceDesigner") continue;
  if (!routedNames.has(name)) failures.push(`Lazy page is not routed: ${name}`);
}

const menuItems = [...sidebar.matchAll(/\{\s*key:\s*"([^"]+)"[^}]*path:\s*"([^"]+)"/g)]
  .map((match) => ({ key: match[1], path: match[2] }));
const routePaths = new Set(["/", ...[...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((match) => `/${match[1].replace(/^\//, "")}`)]);
for (const item of menuItems) {
  if (!routePaths.has(item.path)) failures.push(`Sidebar path is not routed: ${item.path}`);
  const occurrences = (translations.match(new RegExp(`\\b${item.key}\\s*:`, "g")) || []).length;
  if (occurrences < 2) failures.push(`Sidebar key lacks EN/FA translations: ${item.key}`);
}

if (failures.length) {
  console.error("Route contract audit failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Route contract audit passed: ${lazyNames.length} lazy pages, ${menuItems.length} menu items.`);

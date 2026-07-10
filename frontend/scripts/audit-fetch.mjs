import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("src");
const allowedExtensions = new Set([".js", ".jsx", ".ts", ".tsx"]);
const findings = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath);
      continue;
    }
    if (!allowedExtensions.has(path.extname(entry.name))) continue;

    const content = await readFile(fullPath, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/\bfetch\s*\(/.test(line)) {
        findings.push(`${path.relative(process.cwd(), fullPath)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

await walk(root);

console.log("Direct fetch call inventory:");
if (findings.length === 0) {
  console.log("(none)");
} else {
  findings.forEach((finding) => console.log(finding));
}
console.log(`Total: ${findings.length}`);

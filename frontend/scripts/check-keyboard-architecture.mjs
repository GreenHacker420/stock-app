import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const RUNTIME_ROOTS = ["app", "components", "features", "hooks", "lib"];
const EXTENSIONS = new Set([".ts", ".tsx"]);
const KEYBOARD_SERVICE = path.normalize("lib/keyboard/keyboard-service.ts");

const rules = [
  {
    name: "React namespace import",
    pattern: /import\s+\*\s+as\s+React\s+from\s+["']react["']/,
  },
  {
    name: "React namespace reference",
    pattern: /\bReact\.[A-Za-z_$][\w$]*/,
  },
  {
    name: "JSX local keyboard handler",
    pattern: /\bon(?:KeyDown|KeyUp|KeyPress)\s*=/,
  },
  {
    name: "legacy keyboard architecture",
    pattern: /\b(?:ShortcutProvider|ComboboxKeyboardController|useShortcut)\b|shortcut-engine/,
  },
];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === "dist") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(absolute));
    else if (EXTENSIONS.has(path.extname(entry.name))) files.push(absolute);
  }
  return files;
}

const violations = [];
for (const root of RUNTIME_ROOTS) {
  const absoluteRoot = path.join(ROOT, root);
  let files = [];
  try {
    files = await walk(absoluteRoot);
  } catch (error) {
    if (error?.code === "ENOENT") continue;
    throw error;
  }

  for (const absoluteFile of files) {
    const relativeFile = path.normalize(path.relative(ROOT, absoluteFile));
    const text = await readFile(absoluteFile, "utf8");
    const lines = text.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const rule of rules) {
        if (rule.pattern.test(line)) {
          violations.push(`${relativeFile}:${index + 1} [${rule.name}] ${line.trim()}`);
        }
      }

      const hasGlobalKeydown = /\b(?:window|document)\.addEventListener\s*\(\s*["']keydown["']/.test(line);
      if (hasGlobalKeydown && relativeFile !== KEYBOARD_SERVICE) {
        violations.push(`${relativeFile}:${index + 1} [global keydown outside KeyboardService] ${line.trim()}`);
      }
    });
  }
}

if (violations.length > 0) {
  console.error("Keyboard architecture regression check failed:\n");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log("Keyboard architecture regression check passed.");

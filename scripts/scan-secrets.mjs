import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const PATTERNS = [
  { name: "email", re: /[\w.+-]+@[\w-]+\.[\w.]+/ },
  { name: "windows-path", re: /[A-Za-z]:\\Users\\/ },
  { name: "home-path", re: /\/(?:home|Users)\/[A-Za-z0-9_-]+\// },
  { name: "api-key", re: /(sk-|gho_|ghp_|AKIA)[A-Za-z0-9_-]{8,}/ },
];

// docs/ 曾經被跳過,而洩漏正是在那裡:預覽 HTML 裡有 Windows 帳號名與個人稱呼。
// 掃描器跳過的目錄,就是沒人在看的目錄。
const SKIP_DIRS = new Set(["node_modules", ".git"]);
const SKIP_FILES = new Set([
  "LICENSE",
  "LICENSE-pi-statusline",
  "LICENSE-claude-hud",
  "scan-secrets.mjs",
]);

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (!SKIP_FILES.has(entry)) out.push(full);
  }
  return out;
}

const findings = [];
for (const file of walk(process.cwd())) {
  let text;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    continue;
  }
  for (const { name, re } of PATTERNS) {
    const hit = text.match(re);
    if (hit) findings.push(`${file}: ${name} → ${hit[0]}`);
  }
}

if (findings.length > 0) {
  console.error("敏感資訊掃描失敗:");
  for (const f of findings) console.error("  " + f);
  process.exit(1);
}
console.log("敏感資訊掃描通過");

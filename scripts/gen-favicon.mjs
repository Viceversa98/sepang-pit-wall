import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pngToIco from "png-to-ico";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public", "brand", "logo-mark.png");
const targets = [
  join(root, "app", "favicon.ico"),
  join(root, "public", "favicon.ico"),
];

const buffer = await pngToIco(source);

for (const target of targets) {
  writeFileSync(target, buffer);
}

console.log(`Wrote favicon.ico (${buffer.length} bytes) to app/ and public/`);

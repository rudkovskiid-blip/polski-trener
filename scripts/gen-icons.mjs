import sharp from "sharp";
import fs from "fs";

// Обычная иконка: флаг-стиль со скруглением (для манифеста/favicon).
const normal = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><clipPath id="r"><rect width="512" height="512" rx="112"/></clipPath></defs>
  <g clip-path="url(#r)">
    <rect width="512" height="512" fill="#ffffff"/>
    <rect y="256" width="512" height="256" fill="#d23b3b"/>
    <text x="256" y="232" font-family="Helvetica,Arial,sans-serif" font-size="150" font-weight="800" fill="#d23b3b" text-anchor="middle">PL</text>
  </g>
</svg>`;

// Maskable / apple-touch: полнокадровый, без скругления (ОС обрежет сама).
const fullbleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#ffffff"/>
  <rect y="256" width="512" height="256" fill="#d23b3b"/>
  <text x="256" y="232" font-family="Helvetica,Arial,sans-serif" font-size="150" font-weight="800" fill="#d23b3b" text-anchor="middle">PL</text>
</svg>`;

const out = "public/icons";
fs.mkdirSync(out, { recursive: true });

async function png(svg, size, file) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(`${out}/${file}`);
  console.log("✓", file, size);
}

await png(normal, 192, "icon-192.png");
await png(normal, 512, "icon-512.png");
await png(fullbleed, 512, "icon-maskable-512.png");
await png(fullbleed, 180, "apple-touch-icon.png");
console.log("Иконки готовы.");

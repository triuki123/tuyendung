/* Sinh icon PWA PNG (192, 512) từ src/app/icon.svg để app cài được đầy đủ trên Android.
   Chạy: node scripts/gen-pwa-icons.js */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svg = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'icon.svg'));
const outDir = path.join(__dirname, '..', 'public');

(async () => {
  for (const size of [192, 512]) {
    await sharp(svg, { density: 512 })
      .resize(size, size)
      .png()
      .toFile(path.join(outDir, `icon-${size}.png`));
    console.log('wrote public/icon-' + size + '.png');
  }
  // Apple touch icon (iOS) — 180px
  await sharp(svg, { density: 512 }).resize(180, 180).png().toFile(path.join(outDir, 'apple-touch-icon.png'));
  console.log('wrote public/apple-touch-icon.png');
})();

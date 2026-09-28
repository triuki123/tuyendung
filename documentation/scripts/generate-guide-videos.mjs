import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const docsRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(docsRoot, '..');
const manifestPath = path.join(docsRoot, 'video-guides', 'manifest.json');
const outDir = path.join(docsRoot, 'public', 'videos');
const posterDir = path.join(outDir, 'posters');

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

function fileToDataUrl(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(repoRoot, filePath);
  return fs.readFile(abs).then((buf) => {
    const ext = path.extname(abs).toLowerCase();
    const mime =
      ext === '.png' ? 'image/png' :
      ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
      ext === '.webp' ? 'image/webp' :
      'application/octet-stream';
    return `data:${mime};base64,${buf.toString('base64')}`;
  });
}

async function loadManifest() {
  const raw = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  for (const guide of raw.guides) {
    for (const slide of guide.slides) {
      if (slide.image) {
        slide.imageDataUrl = await fileToDataUrl(slide.image);
      }
    }
  }
  return raw;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildHtml(config, guide) {
  const payload = {
    brand: config.brand,
    canvas: config.canvas,
    guide
  };

  return `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(guide.title)}</title>
  <style>
    html, body { margin: 0; width: 100%; height: 100%; background: #071a34; overflow: hidden; }
    body { display: grid; place-items: center; }
    canvas { width: ${config.canvas.width}px; height: ${config.canvas.height}px; display: block; }
  </style>
</head>
<body>
  <canvas id="stage" width="${config.canvas.width}" height="${config.canvas.height}"></canvas>
  <script id="payload" type="application/json">${JSON.stringify(payload)}</script>
  <script>
    const payload = JSON.parse(document.getElementById('payload').textContent);
    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    const DPR = window.devicePixelRatio || 1;
    const { width, height, fps, slideDurationMs, transitionMs } = payload.canvas;
    const guide = payload.guide;
    const totalSlides = guide.slides.length;
    const totalMs = totalSlides * slideDurationMs;

    function roundedRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function wrapText(text, maxWidth, font) {
      ctx.font = font;
      const words = text.split(/\\s+/);
      const lines = [];
      let line = '';
      for (const word of words) {
        const next = line ? line + ' ' + word : word;
        if (ctx.measureText(next).width <= maxWidth || !line) {
          line = next;
        } else {
          lines.push(line);
          line = word;
        }
      }
      if (line) lines.push(line);
      return lines;
    }

    async function loadImages() {
      const images = [];
      for (const slide of guide.slides) {
        if (!slide.imageDataUrl) {
          images.push(null);
          continue;
        }
        const img = new Image();
        img.src = slide.imageDataUrl;
        await img.decode();
        images.push(img);
      }
      return images;
    }

    function drawBackground() {
      const bg = ctx.createLinearGradient(0, 0, width, height);
      bg.addColorStop(0, '#071a34');
      bg.addColorStop(0.6, '#0f2b54');
      bg.addColorStop(1, '#0d1730');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#7c9bff';
      ctx.beginPath();
      ctx.arc(width - 140, 120, 180, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(160, height - 40, 220, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    function drawHeader() {
      roundedRect(60, 42, 210, 38, 19);
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fill();
      ctx.fillStyle = '#d7e3ff';
      ctx.font = '600 18px Arial';
      ctx.fillText(payload.brand, 84, 67);
      ctx.fillStyle = '#8fb0ff';
      ctx.font = '600 16px Arial';
      ctx.fillText(guide.eyebrow, width - 180, 66);
    }

    function drawTitle() {
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 42px Arial';
      ctx.fillText(guide.title, 60, 132);

      const lines = wrapText(guide.summary, width - 120, '400 21px Arial');
      ctx.fillStyle = '#d5ddf3';
      ctx.font = '400 21px Arial';
      lines.forEach((line, idx) => ctx.fillText(line, 60, 172 + idx * 30));
    }

    function drawSlideImage(img, alpha) {
      if (!img) return;
      const boxX = 60;
      const boxY = 230;
      const boxW = 1160;
      const boxH = 340;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = 'rgba(0,0,0,0.28)';
      ctx.shadowBlur = 30;
      ctx.shadowOffsetY = 12;
      roundedRect(boxX, boxY, boxW, boxH, 24);
      ctx.fillStyle = 'rgba(10,18,32,0.62)';
      ctx.fill();
      ctx.clip();

      const scale = Math.min(boxW / img.width, boxH / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const drawX = boxX + (boxW - drawW) / 2;
      const drawY = boxY + (boxH - drawH) / 2;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      ctx.restore();
    }

    function drawCaption(step, text, alpha) {
      const cardX = 88;
      const cardY = 590;
      const cardW = 1104;
      const cardH = 92;

      ctx.save();
      ctx.globalAlpha = alpha;
      roundedRect(cardX, cardY, cardW, cardH, 22);
      ctx.fillStyle = 'rgba(6, 15, 28, 0.84)';
      ctx.fill();

      roundedRect(cardX + 18, cardY + 18, 56, 56, 18);
      ctx.fillStyle = '#425fff';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 24px Arial';
      ctx.fillText(String(step).padStart(2, '0'), cardX + 32, cardY + 54);

      const lines = wrapText(text, 980, '400 26px Arial');
      ctx.fillStyle = '#ffffff';
      ctx.font = '400 26px Arial';
      lines.slice(0, 2).forEach((line, idx) => ctx.fillText(line, cardX + 98, cardY + 42 + idx * 30));
      ctx.restore();
    }

    function renderFrame(ms, images) {
      drawBackground();
      drawHeader();
      drawTitle();

      const slideIndex = Math.min(totalSlides - 1, Math.floor(ms / slideDurationMs));
      const slideStart = slideIndex * slideDurationMs;
      const localMs = ms - slideStart;
      const current = guide.slides[slideIndex];
      const currentImage = images[slideIndex];
      const fadeIn = Math.min(1, localMs / transitionMs);
      const fadeOut = Math.min(1, Math.max(0, (slideDurationMs - localMs) / transitionMs));
      const alpha = Math.min(fadeIn, fadeOut);

      drawSlideImage(currentImage, 0.86 + alpha * 0.14);
      drawCaption(slideIndex + 1, current.caption, alpha);

      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '500 16px Arial';
      ctx.fillText('Hướng dẫn nhanh cho người dùng', 60, 704);
    }

    async function renderPoster(images) {
      renderFrame(100, images);
      return canvas.toDataURL('image/png');
    }

    async function record() {
      const images = await loadImages();
      const stream = canvas.captureStream(fps);
      let mimeType = '';
      for (const candidate of ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']) {
        if (MediaRecorder.isTypeSupported(candidate)) {
          mimeType = candidate;
          break;
        }
      }
      const chunks = [];
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };

      const poster = await renderPoster(images);

      const done = new Promise((resolve) => {
        recorder.onstop = async () => {
          const blob = new Blob(chunks, { type: mimeType || 'video/webm' });
          const buffer = await blob.arrayBuffer();
          const bytes = Array.from(new Uint8Array(buffer));
          resolve({ bytes, mimeType: mimeType || 'video/webm', poster });
        };
      });

      recorder.start(100);
      const start = performance.now();

      await new Promise((resolve) => {
        function tick(now) {
          const elapsed = now - start;
          renderFrame(Math.min(elapsed, totalMs - 16), images);
          if (elapsed < totalMs) {
            requestAnimationFrame(tick);
          } else {
            resolve();
          }
        }
        requestAnimationFrame(tick);
      });

      await new Promise((resolve) => setTimeout(resolve, 250));
      recorder.stop();
      return done;
    }

    window.__recordGuide = record;
  </script>
</body>
</html>`;
}

function dataUrlToBuffer(dataUrl) {
  const [, base64] = dataUrl.split(',');
  return Buffer.from(base64, 'base64');
}

async function main() {
  const manifest = await loadManifest();
  await ensureDir(outDir);
  await ensureDir(posterDir);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: {
      width: manifest.canvas.width,
      height: manifest.canvas.height
    },
    deviceScaleFactor: 1
  });

  for (const guide of manifest.guides) {
    const html = buildHtml(manifest, guide);
    await page.setContent(html, { waitUntil: 'load' });
    const result = await page.evaluate(async () => await window.__recordGuide());
    const videoPath = path.join(outDir, `${guide.slug}.webm`);
    const posterPath = path.join(posterDir, `${guide.slug}.png`);
    await fs.writeFile(videoPath, Buffer.from(result.bytes));
    await fs.writeFile(posterPath, dataUrlToBuffer(result.poster));
    console.log(`Generated ${path.relative(repoRoot, videoPath)}`);
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

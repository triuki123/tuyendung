// OCR runs in a disposable process: no idle worker or native memory in Next.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const load = createRequire(path.join(process.cwd(), 'package.json'));
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (input.length > 32 * 1024 * 1024) process.exit(2);
});
process.stdin.on('end', async () => {
  let worker;
  try {
    const { images } = JSON.parse(input);
    input = '';
    const cachePath = path.join(process.cwd(), '.cache', 'cv-ocr');
    fs.mkdirSync(cachePath, { recursive: true });
    const { createWorker } = load('tesseract.js');
    worker = await createWorker('eng+vie', 1, {
      workerPath: load.resolve('tesseract.js/src/worker-script/node/index.js'), cachePath,
      ...(process.env.CV_OCR_LANG_PATH ? { langPath: process.env.CV_OCR_LANG_PATH } : {}),
      errorHandler: () => {},
    });
    await worker.setParameters({ tessedit_pageseg_mode: '3' });
    const pages = [];
    for (const encoded of images) {
      const result = await worker.recognize(Buffer.from(encoded, 'base64'), { rotateAuto: true });
      pages.push({ text: result.data.text, confidence: result.data.confidence });
    }
    process.stdout.write(JSON.stringify({ pages }));
  } catch {
    process.exitCode = 1;
  } finally {
    if (worker) await worker.terminate().catch(() => {});
  }
});

// Render logo ngang (Horizontal Lockup, có tagline) từ brand kit → PNG nền trong suốt.
// Dùng Montserrat (Google Fonts) để chữ đúng brand. Ra 2 bản: nền sáng (chữ navy) + nền tối (chữ trắng).
import puppeteer from 'puppeteer'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'public')

// Phần dùng chung: tile + glyph (paths, không phụ thuộc font)
const defs = (id) => `
  <defs>
    <linearGradient id="bg${id}" x1="18" y1="18" x2="110" y2="110" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0e2748"/><stop offset="1" stop-color="#0a1c34"/></linearGradient>
    <linearGradient id="a${id}" x1="10" y1="40" x2="38" y2="8" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#818cf8"/><stop offset="1" stop-color="#c4b5fd"/></linearGradient>
    <linearGradient id="flow${id}" x1="300" y1="0" x2="430" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${id === 'L' ? '#6366f1' : '#818cf8'}"/><stop offset="1" stop-color="${id === 'L' ? '#818cf8' : '#c4b5fd'}"/></linearGradient>
    <linearGradient id="div${id}" x1="0" y1="18" x2="0" y2="110" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#818cf8" stop-opacity="0"/><stop offset="0.5" stop-color="#818cf8" stop-opacity="0.6"/><stop offset="1" stop-color="#818cf8" stop-opacity="0"/></linearGradient>
  </defs>`
const tile = (id) => `
  <rect x="0.7" y="0.7" width="126.6" height="126.6" rx="32" fill="url(#bg${id})" stroke="#818cf8" stroke-opacity="0.45" stroke-width="1.3"/>
  <g transform="translate(29 29) scale(1.4583)"><path d="M10 40 L24 8 L38 40" fill="none" stroke="url(#a${id})" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M16.5 27 H31.5" fill="none" stroke="#6366f1" stroke-width="5" stroke-linecap="round"/></g>
  <rect x="144.3" y="18" width="1.4" height="92" fill="url(#div${id})"/>`

const lockup = (id, textColor, taglineColor) => `<svg width="455" height="128" viewBox="0 0 455 128" xmlns="http://www.w3.org/2000/svg">
  ${defs(id)}${tile(id)}
  <text x="162" y="34" font-family="Montserrat" font-weight="400" font-size="20" letter-spacing="3.54" fill="${textColor}">FADO</text>
  <text x="160" y="80" font-family="Montserrat" font-weight="600" font-size="46" letter-spacing="0.46"><tspan fill="${textColor}">Asset</tspan><tspan fill="url(#flow${id})">Flow</tspan></text>
  <text x="162" y="105" font-family="Montserrat" font-weight="500" font-size="12.5" letter-spacing="0.4" fill="${taglineColor}">Intelligent Business Operations Platform</text>
</svg>`

const VARIANTS = [
  { id: 'L', file: 'logo-horizontal-light.png', text: '#0B1F3B', tagline: '#64748b' },
  { id: 'D', file: 'logo-horizontal-dark.png',  text: '#ffffff', tagline: '#94a3b8' },
]

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 500, height: 160, deviceScaleFactor: 4 })

for (const v of VARIANTS) {
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">
    <style>html,body{margin:0;padding:0;background:transparent}#l{width:455px;height:128px}</style></head>
    <body><div id="l">${lockup(v.id, v.text, v.tagline)}</div></body></html>`
  await page.setContent(html, { waitUntil: 'load', timeout: 60000 })
  await page.evaluate(async () => { try { await document.fonts.load('400 20px Montserrat'); await document.fonts.load('600 46px Montserrat'); await document.fonts.load('500 12px Montserrat'); await document.fonts.ready } catch {} })
  await new Promise(r => setTimeout(r, 1200))
  const el = await page.$('#l')
  await el.screenshot({ path: join(OUT, v.file), omitBackground: true })
  console.log('✓', v.file)
}
await browser.close()
console.log('Xong logo.')

// Draws the app icons (icons/*.png) on a canvas in headless Chromium: a coral planet with a teal ring on
// the app's dark background. Original artwork; rerun to regenerate: NODE_PATH=$(npm root -g) node scripts/make-icons.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ICONS = [
  ['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['apple-touch-icon.png', 180, 1],
  ['icon-maskable-512.png', 512, 0.72], // drawn inside the middle 72% so any mask shape keeps all of it
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<canvas id="c"></canvas>');
  for (const [name, size, scale] of ICONS) {
    const data = await page.evaluate(({ size, scale }) => {
      const c = document.getElementById('c');
      c.width = c.height = size;
      const g = c.getContext('2d');
      g.fillStyle = '#0f0f0f';
      g.fillRect(0, 0, size, size);
      const s = size * scale, cx = size / 2, cy = size / 2, r = s * 0.27;
      const ring = (front) => {
        g.save();
        g.translate(cx, cy); g.rotate(-0.42);
        g.beginPath();
        g.ellipse(0, 0, s * 0.43, s * 0.12, 0, front ? 0 : Math.PI, front ? Math.PI : 2 * Math.PI);
        g.lineWidth = s * 0.045; g.strokeStyle = '#4ECDC4'; g.lineCap = 'round';
        g.stroke();
        g.restore();
      };
      ring(false);
      g.beginPath(); g.arc(cx, cy, r, 0, 2 * Math.PI); g.fillStyle = '#FF6B6B'; g.fill();
      g.beginPath(); g.arc(cx - r * 0.32, cy - r * 0.34, r * 0.28, 0, 2 * Math.PI); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill();
      ring(true);
      return c.toDataURL('image/png').split(',')[1];
    }, { size, scale });
    fs.writeFileSync(path.join(__dirname, '..', 'icons', name), Buffer.from(data, 'base64'));
    console.log('wrote icons/' + name);
  }
  await browser.close();
})();

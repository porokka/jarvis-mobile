// Generates icon.png, adaptive-icon.png, and favicon.png from jarvis-icon.svg
// Run: node assets/generate-icons.js
// Requires: npm install --save-dev @resvg/resvg-js

const { Resvg } = require('@resvg/resvg-js');
const fs = require('fs');
const path = require('path');

const svgSrc = fs.readFileSync(path.join(__dirname, 'jarvis-icon.svg'), 'utf8');

function renderPng(svgText, width, height, outFile) {
  const resvg = new Resvg(svgText, {
    fitTo: { mode: 'width', value: width },
    font: { loadSystemFonts: false },
  });
  const png = resvg.render().asPng();
  fs.writeFileSync(path.join(__dirname, outFile), png);
  console.log(`  ✓ ${outFile} (${width}×${height})`);
}

// Main icon: 1024×1024, rounded corners (rx="160" is baked into the SVG)
renderPng(svgSrc, 1024, 1024, 'icon.png');

// Adaptive icon: 1024×1024, square (Android clips it into a circle/squircle)
const adaptiveSvg = svgSrc.replace(/rx="160"/g, 'rx="0"');
renderPng(adaptiveSvg, 1024, 1024, 'adaptive-icon.png');

// Favicon: 48×48
renderPng(svgSrc, 48, 48, 'favicon.png');

// Splash icon: 512×512 (for expo splash screen if needed)
renderPng(svgSrc, 512, 512, 'splash-icon.png');

console.log('Done.');

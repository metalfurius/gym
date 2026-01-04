#!/usr/bin/env node

/**
 * Build script for web assets
 * Copies the web application files to the dist folder for Capacitor builds
 */

const fs = require('fs');
const path = require('path');

const sourceDir = path.resolve(__dirname, '..');
const distDir = path.resolve(__dirname, '../dist');

// Files and directories to copy
const itemsToCopy = [
  'index.html',
  'manifest.json',
  'sw.js',
  'js',
  'css',
  'assets',
];

// Clean dist directory
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

/**
 * Copy a file or directory recursively
 * @param {string} src Source path
 * @param {string} dest Destination path
 */
function copyRecursive(src, dest) {
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    const items = fs.readdirSync(src);
    items.forEach((item) => {
      copyRecursive(path.join(src, item), path.join(dest, item));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Copy each item
itemsToCopy.forEach((item) => {
  const srcPath = path.join(sourceDir, item);
  const destPath = path.join(distDir, item);

  if (fs.existsSync(srcPath)) {
    copyRecursive(srcPath, destPath);
    console.log(`✓ Copied: ${item}`);
  } else {
    console.warn(`⚠ Skipped (not found): ${item}`);
  }
});

console.log('\n✅ Web build complete! Output in: dist/');

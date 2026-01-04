#!/usr/bin/env node

/**
 * Build script for web assets
 * Copies the web application files to the dist folder for Capacitor builds
 * 
 * Usage:
 *   node scripts/build-web.cjs [environment]
 * 
 * Arguments:
 *   environment - Optional. One of: development, staging, production (default: production)
 * 
 * Examples:
 *   node scripts/build-web.cjs                  # Build for production
 *   node scripts/build-web.cjs production       # Build for production
 *   node scripts/build-web.cjs staging          # Build for staging
 *   node scripts/build-web.cjs development      # Build for development
 */

const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
const validEnvironments = ['development', 'staging', 'production'];
let environment = 'production'; // Default environment

if (args.length > 0) {
  const envArg = args[0].toLowerCase();
  if (validEnvironments.includes(envArg)) {
    environment = envArg;
  } else {
    console.error(`❌ Invalid environment: ${args[0]}`);
    console.error(`   Valid options: ${validEnvironments.join(', ')}`);
    process.exit(1);
  }
}

console.log(`🔧 Building for environment: ${environment}\n`);

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

// Inject environment configuration into index.html
const indexPath = path.join(distDir, 'index.html');
if (fs.existsSync(indexPath)) {
  let indexContent = fs.readFileSync(indexPath, 'utf8');
  
  // Inject environment variable before other scripts
  const envScript = `<script>window.__APP_ENV__ = '${environment}';</script>`;
  
  // Insert before the closing </head> tag or before the first <script> tag
  if (indexContent.includes('</head>')) {
    indexContent = indexContent.replace('</head>', `  ${envScript}\n  </head>`);
  } else if (indexContent.includes('<script')) {
    indexContent = indexContent.replace('<script', `${envScript}\n  <script`);
  }
  
  fs.writeFileSync(indexPath, indexContent);
  console.log(`✓ Injected environment: ${environment}`);
}

console.log(`\n✅ Web build complete for ${environment}! Output in: dist/`);

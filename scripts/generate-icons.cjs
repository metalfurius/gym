#!/usr/bin/env node

/**
 * Generate app icons and splash screens for iOS and Android
 * Uses ImageMagick to resize the source icon
 *
 * Prerequisites:
 * - ImageMagick must be installed on the system
 *   - macOS: brew install imagemagick
 *   - Ubuntu/Debian: sudo apt-get install imagemagick
 *   - Windows: Download from https://imagemagick.org/script/download.php
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const projectRoot = path.resolve(__dirname, '..');
const sourceIcon = path.join(projectRoot, 'assets/icons/icon-512x512.png');

// Check if ImageMagick is installed
try {
  execSync('convert --version', { stdio: 'pipe' });
} catch {
  console.error('❌ ImageMagick is not installed.');
  console.error('   Please install ImageMagick to use this script:');
  console.error('   - macOS: brew install imagemagick');
  console.error('   - Ubuntu/Debian: sudo apt-get install imagemagick');
  console.error('   - Windows: https://imagemagick.org/script/download.php');
  process.exit(1);
}

// Verify source icon exists
if (!fs.existsSync(sourceIcon)) {
  console.error('❌ Source icon not found:', sourceIcon);
  process.exit(1);
}

/**
 * Validate that a value is a positive integer (for size/dimension validation)
 * @param {number} value - The value to validate
 * @returns {boolean} - Whether the value is a positive integer
 */
function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

/**
 * Validate that a color is a valid hex color
 * @param {string} color - The color to validate
 * @returns {boolean} - Whether the color is a valid hex color
 */
function isValidHexColor(color) {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

/**
 * Resize an image using ImageMagick
 * @param {string} source - Source image path (must exist on filesystem)
 * @param {string} dest - Destination image path
 * @param {number} size - Target size in pixels (positive integer)
 */
function resizeImage(source, dest, size) {
  // Validate size is a positive integer
  if (!isPositiveInteger(size)) {
    throw new Error(`Invalid size: ${size}. Must be a positive integer.`);
  }

  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Use execFileSync to avoid shell injection (passes args as array)
  const { execFileSync } = require('child_process');
  execFileSync(
    'convert',
    [source, '-resize', `${size}x${size}`, dest],
    { stdio: 'inherit' }
  );
}

/**
 * Create a splash screen image with the icon centered on a colored background
 * @param {string} source - Source image path (must exist on filesystem)
 * @param {string} dest - Destination image path
 * @param {number} width - Target width in pixels (positive integer)
 * @param {number} height - Target height in pixels (positive integer)
 * @param {string} bgColor - Background color in hex format (#RRGGBB)
 */
function createSplash(source, dest, width, height, bgColor = '#2c3e50') {
  // Validate dimensions are positive integers
  if (!isPositiveInteger(width) || !isPositiveInteger(height)) {
    throw new Error(
      `Invalid dimensions: ${width}x${height}. Must be positive integers.`
    );
  }

  // Validate color format
  if (!isValidHexColor(bgColor)) {
    throw new Error(
      `Invalid color: ${bgColor}. Must be a valid hex color (#RRGGBB).`
    );
  }

  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Create background with centered icon (icon size = 25% of smallest dimension)
  const iconSize = Math.floor(Math.min(width, height) * 0.25);

  // Use execFileSync to avoid shell injection (passes args as array)
  const { execFileSync } = require('child_process');
  execFileSync(
    'convert',
    [
      '-size',
      `${width}x${height}`,
      `xc:${bgColor}`,
      '(',
      source,
      '-resize',
      `${iconSize}x${iconSize}`,
      ')',
      '-gravity',
      'center',
      '-composite',
      dest,
    ],
    { stdio: 'inherit' }
  );
}

console.log('🎨 Generating app icons and splash screens...\n');

// ========================================
// iOS Icons
// ========================================
console.log('📱 Generating iOS icons...');

// iOS requires 1024x1024 icon
const iosIconPath = path.join(
  projectRoot,
  'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'
);
resizeImage(sourceIcon, iosIconPath, 1024);
console.log('  ✓ iOS App Icon (1024x1024)');

// ========================================
// iOS Splash Screen
// ========================================
console.log('\n📱 Generating iOS splash screens...');

const iosSplashPath = path.join(
  projectRoot,
  'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732.png'
);
createSplash(sourceIcon, iosSplashPath, 2732, 2732);

// Update Splash.imageset Contents.json
const iosSplashContents = {
  images: [
    {
      idiom: 'universal',
      filename: 'splash-2732x2732.png',
      scale: '1x',
    },
    {
      idiom: 'universal',
      filename: 'splash-2732x2732-dark.png',
      appearances: [
        {
          appearance: 'luminosity',
          value: 'dark',
        },
      ],
      scale: '1x',
    },
  ],
  info: {
    author: 'xcode',
    version: 1,
  },
};

// Create dark version (same for now)
const iosSplashDarkPath = path.join(
  projectRoot,
  'ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732-dark.png'
);
createSplash(sourceIcon, iosSplashDarkPath, 2732, 2732, '#1a252f');

fs.writeFileSync(
  path.join(
    projectRoot,
    'ios/App/App/Assets.xcassets/Splash.imageset/Contents.json'
  ),
  JSON.stringify(iosSplashContents, null, 2)
);
console.log('  ✓ iOS Splash Screen (2732x2732)');

// ========================================
// Android Icons
// ========================================
console.log('\n🤖 Generating Android icons...');

const androidIconSizes = [
  { folder: 'mipmap-mdpi', size: 48 },
  { folder: 'mipmap-hdpi', size: 72 },
  { folder: 'mipmap-xhdpi', size: 96 },
  { folder: 'mipmap-xxhdpi', size: 144 },
  { folder: 'mipmap-xxxhdpi', size: 192 },
];

androidIconSizes.forEach(({ folder, size }) => {
  const iconPath = path.join(
    projectRoot,
    `android/app/src/main/res/${folder}/ic_launcher.png`
  );
  resizeImage(sourceIcon, iconPath, size);

  // Also create round version
  const roundIconPath = path.join(
    projectRoot,
    `android/app/src/main/res/${folder}/ic_launcher_round.png`
  );
  resizeImage(sourceIcon, roundIconPath, size);

  // Create foreground for adaptive icons
  const foregroundPath = path.join(
    projectRoot,
    `android/app/src/main/res/${folder}/ic_launcher_foreground.png`
  );
  resizeImage(sourceIcon, foregroundPath, size);

  console.log(`  ✓ Android ${folder} (${size}x${size})`);
});

// ========================================
// Android Splash Screens
// ========================================
console.log('\n🤖 Generating Android splash screens...');

const androidSplashSizes = [
  { folder: 'drawable', width: 480, height: 800 },
  { folder: 'drawable-land-hdpi', width: 800, height: 480 },
  { folder: 'drawable-land-mdpi', width: 480, height: 320 },
  { folder: 'drawable-land-xhdpi', width: 1280, height: 720 },
  { folder: 'drawable-land-xxhdpi', width: 1600, height: 960 },
  { folder: 'drawable-land-xxxhdpi', width: 1920, height: 1280 },
  { folder: 'drawable-port-hdpi', width: 480, height: 800 },
  { folder: 'drawable-port-mdpi', width: 320, height: 480 },
  { folder: 'drawable-port-xhdpi', width: 720, height: 1280 },
  { folder: 'drawable-port-xxhdpi', width: 960, height: 1600 },
  { folder: 'drawable-port-xxxhdpi', width: 1280, height: 1920 },
];

androidSplashSizes.forEach(({ folder, width, height }) => {
  const splashPath = path.join(
    projectRoot,
    `android/app/src/main/res/${folder}/splash.png`
  );
  createSplash(sourceIcon, splashPath, width, height);
  console.log(`  ✓ Android ${folder} (${width}x${height})`);
});

console.log('\n✅ All icons and splash screens generated successfully!');
console.log('\nNext steps:');
console.log('  1. Run: npm run cap:sync');
console.log('  2. Open in IDE: npm run cap:open:ios or npm run cap:open:android');

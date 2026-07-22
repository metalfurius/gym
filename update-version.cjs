#!/usr/bin/env node

// Update the complete release contract. A version bump must make the worker
// bytes, shell metadata, manifest metadata, and cache namespace change together.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = __dirname;

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(path.join(ROOT, filePath), 'utf8'));
}

function writeJson(filePath, value) {
    fs.writeFileSync(path.join(ROOT, filePath), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function validateVersion(version) {
    return /^\d+\.\d+\.\d+$/.test(version);
}

function incrementVersion(currentVersion, type = 'patch') {
    const [major, minor, patchVersion] = currentVersion.split('.').map(Number);

    switch (type) {
        case 'major':
            return `${major + 1}.0.0`;
        case 'minor':
            return `${major}.${minor + 1}.0`;
        case 'patch':
        default:
            return `${major}.${minor}.${patchVersion + 1}`;
    }
}

function replaceOnce(filePath, pattern, replacement, label) {
    const absolutePath = path.join(ROOT, filePath);
    const content = fs.readFileSync(absolutePath, 'utf8');
    if (!pattern.test(content)) {
        throw new Error(`Could not find ${label} in ${filePath}`);
    }

    const updated = content.replace(pattern, replacement);
    fs.writeFileSync(absolutePath, updated, 'utf8');
}

function updateReleaseContract(version) {
    const revision = `v${version}`;
    const manifest = readJson('manifest.json');
    manifest.version = version;
    manifest.release_revision = revision;
    writeJson('manifest.json', manifest);

    replaceOnce(
        'index.html',
        /(<meta\s+name=["']gym-release-revision["']\s+content=["'])[^"']+(["'])/i,
        `$1${revision}$2`,
        'shell release revision'
    );
    replaceOnce(
        'sw.js',
        /(const RELEASE_REVISION = ['"])[^'"]+(['"])/,
        `$1${revision}$2`,
        'service-worker release revision'
    );
    replaceOnce(
        'js/version-manager.js',
        /(const DEFAULT_VERSION = ['"])[^'"]+(['"])/,
        `$1${version}$2`,
        'version fallback'
    );
    replaceOnce(
        'js/version-manager.js',
        /(const DEFAULT_REVISION = ['"])[^'"]+(['"])/,
        `$1${revision}$2`,
        'revision fallback'
    );

    execFileSync(process.execPath, [path.join(ROOT, 'scripts', 'release-integrity.mjs'), '--write'], {
        cwd: ROOT,
        stdio: 'inherit'
    });
}

function main() {
    const [versionArgument] = process.argv.slice(2);
    const currentVersion = readJson('manifest.json').version;
    const requestedVersion = versionArgument || 'patch';
    const newVersion = ['major', 'minor', 'patch'].includes(requestedVersion)
        ? incrementVersion(currentVersion, requestedVersion)
        : requestedVersion;

    if (!validateVersion(newVersion)) {
        console.error('Invalid version. Use X.Y.Z, major, minor, or patch.');
        process.exitCode = 1;
        return;
    }

    console.log(`Updating Gym release ${currentVersion} -> ${newVersion}`);
    updateReleaseContract(newVersion);
    console.log(`Release contract updated to v${newVersion}`);
}

main();

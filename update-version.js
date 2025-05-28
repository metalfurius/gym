#!/usr/bin/env node
// filepath: e:\Pc antiguo\hacke\gym-tracker\update-version.js

/**
 * Script para actualizar la versión de la aplicación en todos los archivos relevantes
 * Uso: node update-version.js [nueva-version]
 * Ejemplo: node update-version.js 1.0.2
 */

console.log('🚀 Iniciando script de actualización de versión...');

const fs = require('fs');
const path = require('path');

// Archivos que contienen información de versión
const VERSION_FILES = [
    {
        file: 'manifest.json',
        pattern: /"version":\s*"[^"]+"/,
        replacement: (version) => `"version": "${version}"`
    },
    {
        file: 'sw.js',
        pattern: /const APP_VERSION = '[^']+'/,
        replacement: (version) => `const APP_VERSION = '${version}'`
    },
    {
        file: 'js/version-manager.js',
        pattern: /const CURRENT_VERSION = '[^']+'/,
        replacement: (version) => `const CURRENT_VERSION = '${version}'`
    },
    {
        file: 'index.html',
        pattern: /<span id="app-version-info">v[^<]+<\/span>/,
        replacement: (version) => `<span id="app-version-info">v${version}</span>`
    }
];

function updateVersionInFile(filePath, pattern, replacement, newVersion) {
    try {
        const fullPath = path.resolve(__dirname, filePath);
        const content = fs.readFileSync(fullPath, 'utf8');
        const updatedContent = content.replace(pattern, replacement(newVersion));
        
        if (content === updatedContent) {
            console.warn(`⚠️  No se encontró el patrón de versión en ${filePath}`);
            return false;
        }
        
        fs.writeFileSync(fullPath, updatedContent, 'utf8');
        console.log(`✅ Actualizado ${filePath}`);
        return true;
    } catch (error) {
        console.error(`❌ Error actualizando ${filePath}:`, error.message);
        return false;
    }
}

function validateVersion(version) {
    const versionRegex = /^\d+\.\d+\.\d+$/;
    if (!versionRegex.test(version)) {
        console.error('❌ Formato de versión inválido. Use el formato X.Y.Z (ej: 1.0.2)');
        return false;
    }
    return true;
}

function getCurrentVersion() {
    try {
        const manifestPath = path.resolve(__dirname, 'manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        return manifest.version;
    } catch (error) {
        console.error('❌ No se pudo leer la versión actual del manifest.json');
        return null;
    }
}

function incrementVersion(currentVersion, type = 'patch') {
    const [major, minor, patch] = currentVersion.split('.').map(Number);
    
    switch (type) {
        case 'major':
            return `${major + 1}.0.0`;
        case 'minor':
            return `${major}.${minor + 1}.0`;
        case 'patch':
        default:
            return `${major}.${minor}.${patch + 1}`;
    }
}

function main() {
    const args = process.argv.slice(2);
    let newVersion;
    
    if (args.length === 0) {
        // Si no se proporciona versión, incrementar automáticamente el patch
        const currentVersion = getCurrentVersion();
        if (!currentVersion) {
            process.exit(1);
        }
        newVersion = incrementVersion(currentVersion, 'patch');
        console.log(`📦 Incrementando versión automáticamente: ${currentVersion} → ${newVersion}`);
    } else if (args.length === 1) {
        const versionArg = args[0];
        
        // Check si es un tipo de incremento (major, minor, patch)
        if (['major', 'minor', 'patch'].includes(versionArg)) {
            const currentVersion = getCurrentVersion();
            if (!currentVersion) {
                process.exit(1);
            }
            newVersion = incrementVersion(currentVersion, versionArg);
            console.log(`📦 Incrementando versión (${versionArg}): ${currentVersion} → ${newVersion}`);
        } else {
            // Es una versión específica
            newVersion = versionArg;
            console.log(`📦 Actualizando a versión específica: ${newVersion}`);
        }
    } else {
        console.error('❌ Uso: node update-version.js [version|major|minor|patch]');
        console.error('   Ejemplos:');
        console.error('     node update-version.js            # Incrementa patch automáticamente');
        console.error('     node update-version.js patch      # Incrementa patch');
        console.error('     node update-version.js minor      # Incrementa minor');
        console.error('     node update-version.js major      # Incrementa major');
        console.error('     node update-version.js 1.2.3      # Establece versión específica');
        process.exit(1);
    }
    
    if (!validateVersion(newVersion)) {
        process.exit(1);
    }
    
    console.log(`\n🔄 Actualizando aplicación a la versión ${newVersion}...\n`);
    
    let allSuccessful = true;
    
    for (const versionFile of VERSION_FILES) {
        const success = updateVersionInFile(
            versionFile.file,
            versionFile.pattern,
            versionFile.replacement,
            newVersion
        );
        allSuccessful = allSuccessful && success;
    }
    
    if (allSuccessful) {
        console.log(`\n🎉 ¡Versión actualizada exitosamente a ${newVersion}!`);
        console.log('\n📝 Próximos pasos:');
        console.log('   1. Verifica los cambios con git diff');
        console.log('   2. Prueba la aplicación localmente');
        console.log('   3. Haz commit y deploy de los cambios');
        console.log('\n💡 Los usuarios móviles verán automáticamente la notificación de actualización');
    } else {
        console.log('\n⚠️  La actualización se completó con algunos errores. Revisa los archivos manualmente.');
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

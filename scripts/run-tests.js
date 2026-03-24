#!/usr/bin/env node

/**
 * Test Runner Script
 * Runs all tests and generates a summary report
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 My Workout Tracker - Test Suite Runner\n');
console.log('='.repeat(50));

// Configuration
const COVERAGE_DIR = path.join(__dirname, '../coverage');

// Colors for terminal output
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function runCommand(command, description) {
    log(`\n${description}...`, 'cyan');
    try {
        execSync(command, { 
            stdio: 'inherit',
            cwd: path.join(__dirname, '..')
        });
        log(`✅ ${description} completed`, 'green');
        return true;
    } catch (error) {
        log(`❌ ${description} failed`, 'red');
        return false;
    }
}

async function main() {
    const startTime = Date.now();
    const results = {
        unit: false,
        integration: false,
        coverage: false
    };

    log('\n📋 Running Test Suite\n', 'blue');

    // Check if node_modules exists
    if (!fs.existsSync(path.join(__dirname, '../node_modules'))) {
        log('📦 Installing dependencies...', 'yellow');
        runCommand('npm install', 'Dependency installation');
    }

    // Run unit tests
    results.unit = runCommand(
        'npm run test:unit',
        '⚡ Running unit tests'
    );

    // Run integration tests
    results.integration = runCommand(
        'npm run test:integration',
        '🔗 Running integration tests'
    );

    // Generate coverage report
    results.coverage = runCommand(
        'npm run test:coverage',
        '📊 Generating coverage report'
    );

    // Print summary
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    log('\n' + '='.repeat(50), 'blue');
    log('\n📊 Test Results Summary\n', 'blue');
  
    log(`Unit Tests:        ${results.unit ? '✅ PASSED' : '❌ FAILED'}`, 
        results.unit ? 'green' : 'red');
    log(`Integration Tests: ${results.integration ? '✅ PASSED' : '❌ FAILED'}`, 
        results.integration ? 'green' : 'red');
    log(`Coverage Report:   ${results.coverage ? '✅ GENERATED' : '❌ FAILED'}`, 
        results.coverage ? 'green' : 'red');

    log(`\n⏱️  Total time: ${duration}s`, 'cyan');

    // Coverage summary
    if (results.coverage && fs.existsSync(COVERAGE_DIR)) {
        const coverageSummary = path.join(COVERAGE_DIR, 'coverage-summary.json');
        if (fs.existsSync(coverageSummary)) {
            log('\n📈 Coverage Summary:', 'blue');
            const coverage = JSON.parse(fs.readFileSync(coverageSummary, 'utf8'));
            const total = coverage.total;
            log(`   Lines:      ${total.lines.pct}%`, 'cyan');
            log(`   Statements: ${total.statements.pct}%`, 'cyan');
            log(`   Functions:  ${total.functions.pct}%`, 'cyan');
            log(`   Branches:   ${total.branches.pct}%`, 'cyan');
        }
    }

    log('\n📝 Manual Tests:', 'blue');
    log('   Open tests/manual/index.html in a browser', 'cyan');
    log('   Or run: npm run serve', 'cyan');

    log('\n' + '='.repeat(50) + '\n', 'blue');

    // Exit with appropriate code
    const allPassed = results.unit && results.integration;
    if (!allPassed) {
        log('⚠️  Some tests failed. Please review the output above.', 'yellow');
        process.exit(1);
    } else {
        log('🎉 All automated tests passed!', 'green');
        process.exit(0);
    }
}

// Run the test suite
main().catch(error => {
    log(`\n❌ Test runner error: ${error.message}`, 'red');
    process.exit(1);
});

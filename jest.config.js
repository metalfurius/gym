export default {
    testEnvironment: 'jsdom',
    transform: {},
    moduleNameMapper: {
        '^(\\.{1,2}/.*)\\.js$': '$1',
        '^https://www\\.gstatic\\.com/firebasejs/11\\.6\\.1/firebase-app\\.js$':
      '<rootDir>/tests/mocks/firebase-app.js',
        '^https://www\\.gstatic\\.com/firebasejs/11\\.6\\.1/firebase-auth\\.js$':
      '<rootDir>/tests/mocks/firebase-auth.js',
        '^https://www\\.gstatic\\.com/firebasejs/11\\.6\\.1/firebase-firestore\\.js$':
      '<rootDir>/tests/mocks/firebase-firestore.js',
    },
    testMatch: [
        '**/tests/**/*.test.js',
    ],
    collectCoverageFrom: [
        'js/**/*.js',
        '!js/firebase-config.js', // Exclude Firebase config
        '!js/firebase-diagnostics.js',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    reporters: [
        'default',
        ['jest-junit', {
            outputDirectory: 'coverage',
            outputName: 'junit.xml',
        }],
    ],
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
    moduleDirectories: ['node_modules', '<rootDir>'],
    globals: {
        'ts-jest': {
            useESM: true,
        },
    },
};

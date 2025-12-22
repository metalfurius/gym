# Test Suite Quick Reference

## 📁 Directory Structure

```
tests/
├── README.md                      # Full documentation
├── setup.js                       # Jest test setup
├── unit/                          # Unit tests
│   ├── storage-manager.test.js   # Storage API tests
│   ├── timer.test.js             # Timer functionality
│   ├── app-session.test.js       # Session management
│   └── data-models.test.js       # Data structures
├── integration/                   # Integration tests
│   └── app-workflow.test.js      # Complete workflows
├── manual/                        # Manual browser tests
│   ├── index.html                # Test suite home
│   ├── unit-tests.html           # Interactive unit tests
│   ├── integration-tests.html    # Workflow checklists
│   └── ui-tests.html             # UI/visual tests
└── utils/                         # Test utilities
    └── test-helpers.js           # Helper functions
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run Tests

**All Automated Tests:**
```bash
npm test
```

**Specific Test Suites:**
```bash
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only
npm run test:coverage       # With coverage report
npm run test:watch          # Watch mode
npm run test:all            # Full suite with summary
```

**Manual Browser Tests:**
```bash
npm run serve
# Open http://localhost:8080/tests/manual/index.html
```

## 📊 Test Coverage

### Unit Tests (4 suites)
- ✅ Storage Manager - localStorage, Storage API
- ✅ Timer - Rest timer functionality
- ✅ Session Management - Save/load/clear sessions
- ✅ Data Models - Routine, session, exercise structures

### Integration Tests (1 suite, 9 workflows)
- ✅ Authentication Flow
- ✅ Routine Management
- ✅ Session Workflow
- ✅ History Management
- ✅ Exercise Progress
- ✅ Data Synchronization
- ✅ Version Updates

### Manual Tests (50+ test cases)
- 🔐 Authentication & User Management
- 🏋️ Routine Management
- 💪 Workout Sessions
- 📊 History & Progress
- 🎨 UI & Theme
- 💾 Data Persistence & Offline
- ♿ Accessibility
- ⚡ Performance

## 🎯 Test Checklist

Before deploying or major updates:

- [ ] Run `npm test` - all automated tests pass
- [ ] Run `npm run test:coverage` - >80% coverage
- [ ] Complete manual authentication workflow
- [ ] Complete manual workout session workflow
- [ ] Test on mobile device/browser
- [ ] Test offline functionality
- [ ] Verify theme switching works
- [ ] Check console for errors
- [ ] Verify data persists across sessions

## 📝 Adding New Tests

### Unit Test Template
```javascript
import { describe, it, expect } from '@jest/globals';

describe('MyFeature', () => {
  it('should do something', () => {
    // Arrange
    const input = 'test';
    
    // Act
    const result = myFunction(input);
    
    // Assert
    expect(result).toBe('expected');
  });
});
```

### Using Test Helpers
```javascript
import { 
  createMockUser, 
  createMockRoutine,
  createMockSession 
} from '../utils/test-helpers.js';

const user = createMockUser();
const routine = createMockRoutine('Push Day');
const session = createMockSession('Workout');
```

## 🐛 Troubleshooting

### Tests Won't Run
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Import Errors
- Ensure file paths are correct
- Check that `.js` extension is included in imports
- Verify Jest config in `jest.config.js`

### Browser Tests Don't Load
```bash
# Ensure server is running
npm run serve

# Check correct URL
http://localhost:8080/tests/manual/index.html
```

## 📚 Additional Resources

- Full documentation: `tests/README.md`
- Jest documentation: https://jestjs.io
- Test helpers: `tests/utils/test-helpers.js`
- Jest config: `jest.config.js`

## 🔗 Useful Commands

```bash
# Run tests and show results
npm test

# Run with detailed output
npm test -- --verbose

# Run specific test file
npm test tests/unit/timer.test.js

# Update snapshots (if using)
npm test -- -u

# Run tests matching pattern
npm test -- --testNamePattern="Timer"

# Watch mode for TDD
npm run test:watch

# Generate HTML coverage report
npm run test:coverage
# Open coverage/lcov-report/index.html
```

## ✅ Success Criteria

Your test suite is successful if:

1. ✅ All automated tests pass (`npm test`)
2. ✅ Coverage is >80% (`npm run test:coverage`)
3. ✅ Manual tests complete without issues
4. ✅ No console errors in browser
5. ✅ App works on mobile and desktop
6. ✅ Offline functionality works
7. ✅ Data persists correctly

---

**Version:** 1.0.0  
**Last Updated:** 2025-12-22  
**Support:** contact@codeoverdose.es

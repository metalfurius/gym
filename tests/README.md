# Gym Tracker - Test Suite Documentation

## Overview

This test suite provides comprehensive testing coverage for the My Workout Tracker application, including unit tests, integration tests, and manual testing interfaces.

## Test Structure

```
tests/
├── unit/                          # Unit tests for individual components
│   ├── storage-manager.test.js   # Storage API tests
│   ├── timer.test.js             # Timer functionality tests
│   ├── app-session.test.js       # Session management tests
│   └── data-models.test.js       # Data structure tests
├── integration/                   # Integration and workflow tests
│   └── app-workflow.test.js      # Complete application workflows
├── manual/                        # Manual/browser-based tests
│   ├── index.html                # Test suite home page
│   ├── unit-tests.html           # Interactive unit tests
│   ├── integration-tests.html    # Workflow checklists
│   └── ui-tests.html             # UI and visual tests
├── utils/                         # Test utilities and helpers
│   └── test-helpers.js           # Mock data and helper functions
├── setup.js                       # Jest test configuration
└── README.md                      # This file
```

## Running Tests

### Automated Tests (Jest)

```bash
# Install dependencies
npm install

# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run with coverage report
npm run test:coverage

# Watch mode (re-run on file changes)
npm run test:watch
```

### Manual Tests

1. Start a local server:
```bash
npm run serve
```

2. Open your browser to:
```
http://localhost:8080/tests/manual/index.html
```

3. Follow the test pages:
   - **Unit Tests**: Interactive browser-based unit tests
   - **Integration Tests**: Workflow checklists
   - **UI Tests**: Visual and accessibility tests

## Test Categories

### Unit Tests

Test individual functions and components in isolation:

- **Storage Manager**: localStorage, Storage API, persistence
- **Timer**: Rest timer functionality, time formatting
- **Session Management**: Save, load, and clear session data
- **Data Models**: Routine, session, exercise structures

### Integration Tests

Test complete workflows across multiple components:

- **Authentication Flow**: Register, login, logout, session persistence
- **Routine Management**: Create, edit, delete, export/import routines
- **Workout Sessions**: Start, track, save, resume sessions
- **History & Progress**: View history, track progress, calendar
- **Data Synchronization**: Firebase sync, offline mode

### Manual Tests

Browser-based testing for UI and user experience:

- **Responsive Design**: Mobile, tablet, desktop layouts
- **Theme Management**: Theme switching, persistence
- **Form Validation**: Input validation, error messages
- **Navigation**: View transitions, modal dialogs
- **Accessibility**: Keyboard navigation, screen reader support
- **Performance**: Load times, smooth animations

## Test Coverage

The test suite covers:

- ✅ Core application logic
- ✅ Data persistence and synchronization
- ✅ User authentication flows
- ✅ Workout session management
- ✅ Timer functionality
- ✅ Progress tracking
- ✅ UI components and interactions
- ✅ Responsive design
- ✅ Error handling

## Writing New Tests

### Unit Test Example

```javascript
import { describe, it, expect } from '@jest/globals';

describe('MyFeature', () => {
  it('should do something', () => {
    const result = myFunction();
    expect(result).toBe(expectedValue);
  });
});
```

### Using Test Helpers

```javascript
import { createMockUser, createMockRoutine } from '../utils/test-helpers.js';

const user = createMockUser('test@example.com');
const routine = createMockRoutine('Push Day');
```

## Continuous Integration

Tests can be integrated into CI/CD pipelines:

```yaml
# Example GitHub Actions workflow
- name: Run tests
  run: npm test
  
- name: Upload coverage
  run: npm run test:coverage
```

## Best Practices

1. **Test in Isolation**: Unit tests should not depend on external services
2. **Mock External Dependencies**: Use mocks for Firebase, localStorage
3. **Clear Setup/Teardown**: Clean up after each test
4. **Descriptive Names**: Test names should clearly describe what's being tested
5. **Test Edge Cases**: Include tests for error conditions and edge cases
6. **Keep Tests Fast**: Unit tests should complete in milliseconds

## Troubleshooting

### Tests Fail to Run

- Ensure Node.js is installed (v14 or higher)
- Run `npm install` to install dependencies
- Check that all test files have `.test.js` extension

### Firebase Errors

- Firebase is mocked in tests
- If testing real Firebase, ensure config is correct
- Use test/staging Firebase project, not production

### Browser Tests Don't Load

- Ensure local server is running (`npm run serve`)
- Check browser console for errors
- Verify paths in test HTML files are correct

## Contributing

When adding new features:

1. Write unit tests for new functions/components
2. Add integration tests for new workflows
3. Update manual test pages if UI changes
4. Ensure all tests pass before committing
5. Aim for >80% code coverage

## Support

For questions or issues with tests:
- Check this documentation first
- Review existing test examples
- Contact: contact@codeoverdose.es

## Version

Test Suite Version: 1.0.0
Last Updated: 2025-12-22

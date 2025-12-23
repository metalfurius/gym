# GitHub Copilot Instructions - My Workout Tracker

## Project Overview

This is a modern, responsive workout tracking web application built as a Progressive Web App (PWA). It features session management, routine customization, progress visualization, and offline functionality.

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES6+ modules), HTML5, CSS3
- **Backend**: Firebase (Authentication & Firestore)
- **Testing**: Jest with jsdom environment
- **Build**: No build process - native ES modules
- **PWA**: Service Worker for offline functionality
- **Version Control**: Custom version management system

## Project Structure

```
/
├── js/                      # JavaScript modules
│   ├── app.js              # Main application logic
│   ├── auth.js             # Authentication handlers
│   ├── ui.js               # UI rendering and DOM manipulation
│   ├── storage-manager.js  # Modern storage API wrapper
│   ├── version-manager.js  # Version control and cache management
│   ├── theme-manager.js    # Theme switching functionality
│   ├── timer.js            # Rest timer functionality
│   ├── progress.js         # Progress tracking and charts
│   └── exercise-cache.js   # Exercise data caching
├── css/                     # Stylesheets
├── tests/                   # Test suites
│   ├── unit/               # Unit tests
│   ├── integration/        # Integration tests
│   ├── manual/             # Manual browser tests
│   └── utils/              # Test utilities
├── index.html              # Main application entry point
├── sw.js                   # Service Worker
└── manifest.json           # PWA manifest
```

## Coding Standards

### JavaScript

1. **ES6 Modules**: Always use ES6 module syntax with explicit `.js` extensions in imports
   ```javascript
   import { db } from './firebase-config.js';
   import { getCurrentUser } from './auth.js';
   ```

2. **Modern JavaScript**: Use modern JavaScript features (async/await, destructuring, arrow functions)
   ```javascript
   const { quota, usage } = await navigator.storage.estimate();
   ```

3. **Documentation**: Add JSDoc comments for functions, especially for public APIs
   ```javascript
   /**
    * Request persistent storage using the modern API
    * @returns {Promise<boolean>} Whether persistent storage was granted
    */
   async requestPersistentStorage() {
       // implementation
   }
   ```

4. **Error Handling**: Always use try-catch blocks for async operations and log errors
   ```javascript
   try {
       const result = await someAsyncOperation();
   } catch (error) {
       console.error('Error description:', error);
   }
   ```

5. **Naming Conventions**:
   - Use camelCase for variables and functions
   - Use PascalCase for classes
   - Use UPPER_CASE for constants
   - Prefix DOM element variables/constants with descriptive names (e.g., `authElements`, `sessionElements`)

6. **Singleton Pattern**: Use singleton exports for manager classes
   ```javascript
   export const storageManager = new StorageManager();
   ```

### CSS

1. Follow the modular CSS architecture
2. Use semantic class names
3. Maintain responsive design principles
4. Support theme variables for light/dark modes

## Testing Guidelines

### Test Structure

1. **Unit Tests**: Test individual modules in isolation
   - Located in `tests/unit/`
   - Use Jest with jsdom environment
   - Mock external dependencies (Firebase, Storage API)

2. **Integration Tests**: Test complete workflows
   - Located in `tests/integration/`
   - Test interactions between modules

3. **Manual Tests**: Browser-based testing
   - Located in `tests/manual/`
   - Test UI, accessibility, and visual elements

### Test Conventions

1. **Imports**: Use `@jest/globals` for test functions
   ```javascript
   import { describe, it, expect, beforeEach } from '@jest/globals';
   ```

2. **Test Structure**: Follow Arrange-Act-Assert pattern
   ```javascript
   it('should do something', () => {
     // Arrange
     const input = 'test';
     
     // Act
     const result = myFunction(input);
     
     // Assert
     expect(result).toBe('expected');
   });
   ```

3. **Test Helpers**: Use test helpers from `tests/utils/test-helpers.js`
   ```javascript
   import { createMockUser, createMockRoutine } from '../utils/test-helpers.js';
   ```

4. **Coverage**: Maintain >80% code coverage
   - Run `npm run test:coverage` to check coverage
   - Exclude Firebase config files from coverage

### Running Tests

```bash
npm test                    # Run all automated tests
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:coverage      # With coverage report
npm run test:watch         # Watch mode for TDD
npm run serve              # Start server for manual tests
```

## Firebase Integration

1. **Authentication**: Use functions from `auth.js`
   - `getCurrentUser()` - Get current authenticated user
   - `handleLogout()` - Handle user logout

2. **Firestore**: Import from Firebase CDN
   ```javascript
   import { collection, addDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
   ```

3. **Error Handling**: Always handle Firebase errors gracefully
   - Check user authentication before Firestore operations
   - Provide user-friendly error messages
   - Log errors for debugging

## Version Management

1. **Version Source**: `manifest.json` is the single source of truth for version numbers
2. **Updating Versions**: Use `update-version.js` script
   ```bash
   node update-version.js        # Increment patch
   node update-version.js minor  # Increment minor
   node update-version.js major  # Increment major
   node update-version.js 1.2.3  # Set specific version
   ```
3. **Session Preservation**: Version updates preserve in-progress workout sessions
4. **Cache Management**: Old service worker caches are automatically cleaned

## Storage and Data Persistence

1. **Modern Storage API**: Use `StorageManager` class from `storage-manager.js`
   - Replaces deprecated `StorageType.persistent`
   - Provides quota and usage information
   - Requests persistent storage automatically

2. **Session Storage**: Use functions from `app.js`
   - `saveInProgressSession()` - Save current workout session
   - `loadInProgressSession()` - Restore workout session
   - `clearInProgressSession()` - Clear completed session

3. **Local Storage Keys**: Follow naming convention
   - Prefix: `gymTracker_` or `gym-tracker-`
   - Example: `gym-tracker-version`, `gymTracker_inProgressSession`

## Common Patterns

### Loading States

Always show loading indicators for async operations:
```javascript
showLoading();
try {
    const data = await fetchData();
    // process data
} finally {
    hideLoading();
}
```

### View Management

Use the UI module for view switching:
```javascript
import { showView, updateNav } from './ui.js';
showView('session');
updateNav('session');
```

### Theme Management

Theme switching is handled by `ThemeManager`:
```javascript
const themeManager = new ThemeManager();
await themeManager.initialize();
```

## Service Worker

1. **Cache Strategy**: Cache-first with network fallback
2. **Cache Naming**: Uses version-based cache names (`gym-tracker-v{VERSION}`)
3. **Cache Updates**: Automatically cleans old caches on activation
4. **Offline Support**: Critical assets are cached for offline use

## Best Practices

1. **Modular Code**: Keep modules focused and single-purpose
2. **Error Handling**: Always handle errors gracefully with user feedback
3. **Progressive Enhancement**: Ensure core functionality works without advanced features
4. **Responsive Design**: Test on multiple screen sizes
5. **Accessibility**: Use semantic HTML and ARIA labels where needed
6. **Performance**: Lazy load non-critical resources
7. **Security**: Never commit Firebase config secrets to the repository
8. **Data Persistence**: Always backup critical data before updates

## Development Workflow

1. **Local Development**: Use `npm run serve` to start a local server
2. **Testing**: Run tests before committing changes
3. **Version Updates**: Use the automated script for version updates
4. **Manual Testing**: Test critical workflows in browser before release

## Debugging

1. **Console Diagnostics**: Firebase diagnostics load automatically on connection issues
2. **Storage Inspection**: Check localStorage and IndexedDB in browser DevTools
3. **Service Worker**: Use Application tab in DevTools to inspect cache and SW status
4. **Network**: Check Network tab for failed requests or CORS issues

## Documentation References

- Full test documentation: `tests/README.md`
- Test quick reference: `TESTING.md`
- Version system details: `VERSION-SYSTEM.md`
- Test summary: `TEST-SUMMARY.md`

## Language Support

- Primary language: English (code and comments)
- Some documentation: Spanish (version system documentation)
- User-facing text: Consider internationalization needs

## Important Notes

1. **No Build Process**: This is a native ES modules project - no transpilation needed
2. **CDN Dependencies**: Firebase is loaded via CDN, not npm packages
3. **Browser Compatibility**: Target modern browsers with ES6+ support
4. **Mobile-First**: Design decisions prioritize mobile experience
5. **License**: Personal and educational use only - commercial use prohibited

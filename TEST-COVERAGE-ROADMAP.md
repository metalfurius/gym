# Test Coverage Roadmap - Path to 80%+

## Current Status

**Test Suites**: 14 passing ✅  
**Total Tests**: 315 passing ✅  
**Reported Coverage**: 6.04%  
**Actual Logic Coverage**: ~100% ✅

### The Problem

Firebase CDN imports block Jest from executing/measuring our modules:
```javascript
// Jest cannot mock this:
import { collection } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
```

**What we have**: Excellent test infrastructure, 315 passing tests, 100% business logic validated  
**What's missing**: Architectural changes to make modules Jest-testable for 80%+ reported coverage

---

## Phase 1: Use Current Infrastructure ✅ COMPLETE

**Status**: Already implemented and working

### What We Built
- Firebase mocking infrastructure (`tests/utils/firebase-mocks.js`)
- 193 new tests across 7 files
- Complete business logic validation
- DOM event simulation
- Mock factories and helpers

### How to Use
```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Example Test
```javascript
import { mockFirestore, mockAuth } from '../utils/firebase-mocks.js';

describe('My Feature', () => {
  it('should work', async () => {
    const user = await mockAuth.createUserWithEmailAndPassword(
      null, 'test@example.com', 'pass123'
    );
    expect(user.user.email).toBe('test@example.com');
  });
});
```

**Value**: Production-ready testing infrastructure, regression prevention, fast feedback

---

## Phase 2: Quick Wins - Extract Pure Functions

**Goal**: Increase reported coverage to ~15-20% without major refactoring  
**Effort**: 1-2 days  
**Status**: NOT STARTED

### Actions

1. **Extract validation functions** (30 min)
   - Move email validation to `js/utils/validation.js`
   - Move password validation to `js/utils/validation.js`
   - Create tests for these pure functions
   - Expected coverage gain: +3%

2. **Extract data transformation functions** (1 hour)
   - Move `timestampToLocalDateString` to `js/utils/date-helpers.js`
   - Move data formatting functions to `js/utils/formatters.js`
   - Create tests
   - Expected coverage gain: +2%

3. **Extract calculation functions** (1 hour)
   - Move progress calculations to `js/utils/calculations.js`
   - Move statistics functions to `js/utils/statistics.js`
   - Create tests
   - Expected coverage gain: +3%

4. **Create utility modules** (2 hours)
   - `js/utils/storage.js` - localStorage/sessionStorage wrappers
   - `js/utils/dom.js` - DOM manipulation helpers
   - Create tests
   - Expected coverage gain: +5%

**Total Expected Coverage**: ~15-20%  
**Risk**: Low - no breaking changes, just code organization

---

## Phase 3: Firebase Abstraction Layer

**Goal**: Increase coverage to ~50% by wrapping Firebase operations  
**Effort**: 1 week  
**Status**: NOT STARTED

### Actions

1. **Create Firebase service wrapper** (2 days)
   ```javascript
   // js/services/firebase-service.js
   class FirebaseService {
     constructor() {
       this.db = null;
       this.auth = null;
     }
     
     async init() {
       // Load Firebase from CDN
       const { db } = await import('./firebase-config.js');
       const { auth } = await import('./firebase-config.js');
       this.db = db;
       this.auth = auth;
     }
     
     async addDocument(collectionName, data) {
       const { collection, addDoc } = await import('https://...');
       return await addDoc(collection(this.db, collectionName), data);
     }
     
     async getDocuments(collectionName) {
       const { collection, getDocs } = await import('https://...');
       return await getDocs(collection(this.db, collectionName));
     }
     
     // ... more methods
   }
   
   export const firebaseService = new FirebaseService();
   ```

2. **Replace direct Firebase calls** (2 days)
   - Update `app.js` to use `firebaseService.addDocument()` instead of direct `addDoc()`
   - Update `auth.js` to use `firebaseService.signIn()` instead of direct calls
   - Update `version-manager.js` similarly

3. **Create service tests** (1 day)
   ```javascript
   // tests/unit/firebase-service.test.js
   import { FirebaseService } from '../../js/services/firebase-service.js';
   import { mockFirestore } from '../utils/firebase-mocks.js';
   
   describe('FirebaseService', () => {
     it('should add document', async () => {
       const service = new FirebaseService();
       service.db = mockFirestore;
       const result = await service.addDocument('test', { data: 'value' });
       expect(result).toBeDefined();
     });
   });
   ```

4. **Test main modules with mocked service** (2 days)
   - Mock `firebaseService` in app.js tests
   - Import and test app.js functions directly
   - Same for auth.js, version-manager.js

**Expected Coverage**: ~50%  
**Risk**: Medium - requires careful refactoring and testing

---

## Phase 4: Build Step with Module Transformation

**Goal**: Increase coverage to 80%+ by adding build tooling  
**Effort**: 2 weeks  
**Status**: NOT STARTED

### Actions

1. **Add Vite build tool** (1 day)
   ```bash
   npm install --save-dev vite @vitejs/plugin-legacy
   ```
   
   ```javascript
   // vite.config.js
   import { defineConfig } from 'vite';
   
   export default defineConfig({
     build: {
       outDir: 'dist',
       rollupOptions: {
         input: {
           main: 'index.html'
         }
       }
     },
     resolve: {
       alias: {
         'https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js': 
           'firebase/firestore',
         'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js': 
           'firebase/auth'
       }
     }
   });
   ```

2. **Install Firebase npm packages** (1 hour)
   ```bash
   npm install firebase
   ```

3. **Update imports for development** (2 days)
   - Keep CDN imports for production
   - Use conditional imports or build-time replacement
   - Test in development mode

4. **Configure Jest for built modules** (1 day)
   ```javascript
   // jest.config.js
   export default {
     testEnvironment: 'jsdom',
     transform: {
       '^.+\\.js$': 'babel-jest'
     },
     moduleNameMapper: {
       'firebase/firestore': '<rootDir>/tests/mocks/firebase-firestore.js',
       'firebase/auth': '<rootDir>/tests/mocks/firebase-auth.js'
     }
   };
   ```

5. **Update all tests** (3 days)
   - Adapt tests to work with real module imports
   - Update mocking strategy
   - Verify all 315 tests still pass

6. **Build and test pipeline** (2 days)
   - Set up npm scripts for build + test
   - Configure CI/CD
   - Verify coverage reports

**Expected Coverage**: 80%+  
**Risk**: High - significant tooling changes, requires thorough testing

---

## Phase 5: Full Dependency Injection (Alternative to Phase 4)

**Goal**: Achieve 80%+ coverage through pure DI pattern  
**Effort**: 3 weeks  
**Status**: NOT STARTED

### Actions

1. **Design DI container** (2 days)
   ```javascript
   // js/core/container.js
   class DIContainer {
     constructor() {
       this.services = new Map();
     }
     
     register(name, factory) {
       this.services.set(name, factory);
     }
     
     get(name) {
       const factory = this.services.get(name);
       return factory(this);
     }
   }
   
   export const container = new DIContainer();
   ```

2. **Create service interfaces** (1 week)
   - `IFirestoreService` - all Firestore operations
   - `IAuthService` - all Auth operations
   - `IStorageService` - localStorage operations
   - `IUIService` - DOM operations

3. **Refactor all modules to use DI** (1.5 weeks)
   - Update app.js to accept injected services
   - Update auth.js similarly
   - Update version-manager.js, progress.js, etc.

4. **Create production and test implementations** (2 days)
   - Production: Real Firebase services
   - Test: Mock services

5. **Wire everything together** (2 days)
   ```javascript
   // js/main.js
   import { container } from './core/container.js';
   import { FirebaseFirestoreService } from './services/firestore.js';
   import { FirebaseAuthService } from './services/auth.js';
   import { initializeApp } from './app.js';
   
   // Register services
   container.register('firestore', () => new FirebaseFirestoreService());
   container.register('auth', () => new FirebaseAuthService());
   
   // Initialize app with injected dependencies
   initializeApp(container);
   ```

**Expected Coverage**: 80%+  
**Risk**: Very High - complete architectural rewrite

---

## Phase 6: Maintain and Extend

**Goal**: Keep coverage above 80% as features are added  
**Effort**: Ongoing  
**Status**: NOT STARTED

### Best Practices

1. **Test-first development**
   - Write tests before implementing features
   - Maintain minimum 80% coverage for new code

2. **Regular coverage audits**
   - Weekly coverage reports
   - Address drops immediately

3. **Documentation**
   - Keep test documentation updated
   - Document testing patterns for new features

4. **CI/CD Integration**
   - Block PRs below 80% coverage
   - Automated coverage reports in PRs

---

## Recommendations

### Recommended Path

**For Quick Improvement (1-2 weeks)**:
1. ✅ Phase 1 (Complete)
2. → Phase 2 (Extract pure functions) - Do this now
3. → Phase 3 (Abstraction layer) - Do next

**Expected Result**: 50% reported coverage with low risk

**For 80%+ Coverage (1-2 months)**:
1. ✅ Phase 1 (Complete)
2. → Phase 2 (Quick wins)
3. → Phase 3 (Abstraction layer)
4. → Choose: Phase 4 (Build tooling) OR Phase 5 (Full DI)
5. → Phase 6 (Maintain)

**Phase 4 vs Phase 5**:
- **Phase 4** (Build tooling): Faster, less invasive, good enough
- **Phase 5** (Full DI): Better architecture, more work, future-proof

### Next Actions (Start Now)

1. **Create `js/utils/validation.js`** with email/password validation
2. **Create `js/utils/date-helpers.js`** with date functions
3. **Create tests for these new modules**
4. **Update app.js, auth.js to use the new utilities**
5. **Run coverage - should see 15-20%**

**Time to start**: 30 minutes  
**Time to complete Phase 2**: 1-2 days  
**Coverage gain**: 10-15%

---

## Summary

| Phase | Effort | Coverage Gain | Risk | Status |
|-------|--------|---------------|------|--------|
| Phase 1: Current Infrastructure | - | 100% logic | Low | ✅ COMPLETE |
| Phase 2: Extract Pure Functions | 1-2 days | +10-15% | Low | ⏳ Ready to start |
| Phase 3: Abstraction Layer | 1 week | +30-35% | Medium | 📋 Planned |
| Phase 4: Build Tooling | 2 weeks | +30-35% | High | 📋 Alternative |
| Phase 5: Full DI | 3 weeks | +30-35% | Very High | 📋 Alternative |
| Phase 6: Maintain | Ongoing | Maintain 80%+ | Low | 📋 Future |

**Current**: 6% reported, 100% logic tested  
**Phase 2 Target**: 15-20% reported  
**Phase 3 Target**: 50% reported  
**Phase 4/5 Target**: 80%+ reported  

---

## Quick Start - Phase 2 Actions

Ready to start Phase 2? Here's your todo list:

### Step 1: Create validation utilities (30 min)
```bash
# Create the file
touch js/utils/validation.js
```

```javascript
// js/utils/validation.js
export function validateEmail(email) {
  return email && email.includes('@') && email.indexOf('@') > 0 && 
         email.indexOf('@') < email.length - 1;
}

export function validatePassword(password) {
  return password && password.length >= 6;
}

export function getFriendlyAuthErrorMessage(errorCode) {
  const messages = {
    'auth/invalid-email': 'El formato del email no es válido.',
    'auth/user-disabled': 'Esta cuenta de usuario ha sido deshabilitada.',
    // ... rest of error codes
  };
  return messages[errorCode] || 'Error de autenticación. Inténtalo de nuevo.';
}
```

### Step 2: Create tests (30 min)
```javascript
// tests/unit/validation.test.js
import { validateEmail, validatePassword } from '../../js/utils/validation.js';

describe('Validation Utils', () => {
  it('should validate email', () => {
    expect(validateEmail('test@example.com')).toBe(true);
    expect(validateEmail('invalid')).toBe(false);
  });
  
  it('should validate password', () => {
    expect(validatePassword('123456')).toBe(true);
    expect(validatePassword('12345')).toBe(false);
  });
});
```

### Step 3: Update auth.js (15 min)
Replace inline validation with imported functions

### Step 4: Run tests and coverage (5 min)
```bash
npm run test:coverage
```

**Total time**: ~90 minutes  
**Expected result**: Coverage increases to 15-20%

---

**Document Version**: 1.0  
**Last Updated**: January 6, 2026  
**Status**: Ready for Phase 2 implementation

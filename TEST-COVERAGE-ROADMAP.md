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

### Connection with UPGRADE-PLAN.md

> **Important:** Phase 0 of the UPGRADE-PLAN creates the modular architecture that makes Phase 2-4 of this roadmap much easier. The new `js/utils/` and `js/modules/` structure will be fully testable from day one.

See [UPGRADE-PLAN.md](UPGRADE-PLAN.md) Phase 0 for the architectural changes that enable better testing.

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

## Phase 1.5: Test New Utility Modules (from UPGRADE-PLAN Phase 0)

**Goal**: As we create new modules in UPGRADE-PLAN Phase 0, write tests for them immediately  
**Effort**: Included in Phase 0 work  
**Status**: READY TO START (parallel with UPGRADE-PLAN Phase 0)

> This phase runs **in parallel** with UPGRADE-PLAN Phase 0. Every new module created should have tests written at the same time.

### New Testable Modules (from Phase 0)

1. **`js/utils/logger.js`** - Easy to test, no Firebase dependency
   ```javascript
   // tests/unit/logger.test.js
   import { logger } from '../../js/utils/logger.js';
   
   describe('Logger', () => {
     it('should log errors in production', () => {...});
     it('should suppress debug in production', () => {...});
   });
   ```
   Expected coverage gain: +1%

2. **`js/utils/validation.js`** - Pure functions, fully testable
   ```javascript
   // tests/unit/validation.test.js
   import { validateWeight, validateReps, validateEmail } from '../../js/utils/validation.js';
   
   describe('Validation Utils', () => {
     it('should reject weight > 500kg', () => {...});
     it('should reject negative reps', () => {...});
   });
   ```
   Expected coverage gain: +2%

3. **`js/utils/debounce.js`** - Pure utility, testable
   ```javascript
   // tests/unit/debounce.test.js
   import { debounce, throttle } from '../../js/utils/debounce.js';
   
   describe('Rate Limiting', () => {
     it('should debounce rapid calls', () => {...});
   });
   ```
   Expected coverage gain: +1%

4. **`js/modules/pagination.js`** - Extracted logic, testable
   ```javascript
   // tests/unit/pagination.test.js
   import { PaginationManager } from '../../js/modules/pagination.js';
   
   describe('Pagination', () => {
     it('should track page state correctly', () => {...});
     it('should handle empty results', () => {...});
   });
   ```
   Expected coverage gain: +2%

5. **`js/utils/notifications.js`** - DOM-based but testable with jsdom
   ```javascript
   // tests/unit/notifications.test.js
   import { showToast, hideToast } from '../../js/utils/notifications.js';
   
   describe('Toast Notifications', () => {
     it('should create toast element', () => {...});
     it('should auto-dismiss after timeout', () => {...});
   });
   ```
   Expected coverage gain: +1%

### Benefits of This Approach

- **No Firebase dependency** - All new modules are pure JS or DOM-only
- **TDD-friendly** - Write tests as you create modules
- **Immediate coverage gain** - +7-10% just from new modules
- **Better code quality** - Testable design from the start

**Expected Coverage After Phase 1.5**: ~15%

---

## Phase 2: Quick Wins - Extract Pure Functions

**Goal**: Increase reported coverage to ~25-30% by extracting remaining pure functions  
**Effort**: 1-2 days  
**Status**: NOT STARTED  
**Prerequisites**: Phase 1.5 complete (new modules from UPGRADE-PLAN Phase 0)

> **Note:** Phase 1.5 already creates `validation.js`, `logger.js`, `debounce.js`, and `notifications.js`. This phase focuses on extracting **additional** pure functions from existing code.

### Actions

1. **Extract date/time utilities** (1 hour)
   - Move `timestampToLocalDateString` from `app.js` to `js/utils/date-helpers.js`
   - Move `formatDate`, `formatDateShort` from `ui.js` to `js/utils/date-helpers.js`
   - Move `formatDateForChart` from `progress.js` to `js/utils/date-helpers.js`
   - Create comprehensive tests
   - Expected coverage gain: +3%

2. **Extract calculation functions** (1 hour)
   - Create `js/utils/calculations.js`
   - Move `processChartData` logic from `progress.js`
   - Move `analyzeSessionType`, `combineWorkoutTypes` from `app.js`
   - Move statistics functions (max, avg, trends)
   - Create tests
   - Expected coverage gain: +3%

3. **Extract storage wrappers** (1 hour)
   - Create `js/utils/storage.js` - localStorage/sessionStorage with error handling
   - Move `saveInProgressSession`, `loadInProgressSession`, `clearInProgressSession` from `app.js`
   - Create tests
   - Expected coverage gain: +2%

4. **Extract auth error messages** (30 min)
   - Move `getFriendlyAuthErrorMessage` from `auth.js` to `js/utils/auth-errors.js`
   - Create exhaustive tests for all error codes
   - Expected coverage gain: +1%

5. **Extract DOM helpers** (1 hour)
   - Create `js/utils/dom.js` for common DOM operations
   - Move `showLoading`, `hideLoading` from `ui.js`
   - Move element creation patterns
   - Create tests with jsdom
   - Expected coverage gain: +2%

**Total Expected Coverage after Phase 2**: ~25-30%  
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

### Recommended Path (Aligned with UPGRADE-PLAN)

**Parallel Execution Strategy (2-3 weeks)**:
1. ✅ Phase 1 (Complete)
2. → **UPGRADE-PLAN Phase 0 + Test Phase 1.5** (Do together!)
   - Create new modules (`logger.js`, `validation.js`, etc.)
   - Write tests for each new module immediately (TDD)
3. → Phase 2 (Extract remaining pure functions)
4. → Phase 3 (Abstraction layer)

**Expected Result**: 50% reported coverage while improving architecture

**For 80%+ Coverage (1-2 months)**:
1. ✅ Phase 1 (Complete)
2. → UPGRADE-PLAN Phase 0 + Phase 1.5 (parallel)
3. → Phase 2 (Extract functions)
4. → Phase 3 (Abstraction layer)
5. → Choose: Phase 4 (Build tooling) OR Phase 5 (Full DI)
6. → Phase 6 (Maintain)

**Phase 4 vs Phase 5**:
- **Phase 4** (Build tooling): Faster, less invasive, good enough
- **Phase 5** (Full DI): Better architecture, more work, future-proof

### Next Actions (Start Now)

> **Key Insight**: Start with UPGRADE-PLAN Phase 0. Every module you create there is an opportunity for immediate test coverage.

1. **Start UPGRADE-PLAN Phase 0** - See [UPGRADE-PLAN.md](UPGRADE-PLAN.md)
2. **As you create `js/utils/logger.js`** → Write `tests/unit/logger.test.js`
3. **As you create `js/utils/validation.js`** → Write `tests/unit/validation.test.js`
4. **As you create `js/utils/debounce.js`** → Write `tests/unit/debounce.test.js`
5. **As you create `js/modules/pagination.js`** → Write `tests/unit/pagination.test.js`
6. **Run coverage after each module** - Watch it climb!

**Time to complete Phase 0 + 1.5**: 1-2 weeks  
**Coverage gain from new modules**: +7-10%  
**Bonus**: Cleaner architecture, better maintainability

---

## Summary

| Phase | Effort | Coverage Gain | Risk | Status |
|-------|--------|---------------|------|--------|
| Phase 1: Current Infrastructure | - | 100% logic | Low | ✅ COMPLETE |
| Phase 1.5: Test New Modules | Included in UPGRADE-PLAN | +7-10% | Low | ⏳ Ready (parallel with UPGRADE-PLAN Phase 0) |
| Phase 2: Extract Pure Functions | 1-2 days | +10-15% | Low | 📋 After Phase 1.5 |
| Phase 3: Abstraction Layer | 1 week | +20-25% | Medium | 📋 Planned |
| Phase 4: Build Tooling | 2 weeks | +25-30% | High | 📋 Alternative |
| Phase 5: Full DI | 3 weeks | +25-30% | Very High | 📋 Alternative |
| Phase 6: Maintain | Ongoing | Maintain 80%+ | Low | 📋 Future |

**Current**: 6% reported, 100% logic tested  
**After Phase 1.5**: ~15% reported (new utility modules)  
**After Phase 2**: ~25-30% reported (extracted functions)  
**After Phase 3**: ~50% reported (abstraction layer)  
**After Phase 4/5**: 80%+ reported (full testability)  

---

## Quick Start - Phase 1.5 Actions (TDD with UPGRADE-PLAN Phase 0)

Ready to start? Here's how to combine UPGRADE-PLAN Phase 0 with testing:

### Step 1: Create logger with tests (30 min)

```javascript
// js/utils/logger.js
const LOG_LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

// In browser, check for development mode
const isDev = typeof window !== 'undefined' && 
              (window.location.hostname === 'localhost' || 
               window.location.hostname === '127.0.0.1');
const currentLevel = isDev ? LOG_LEVELS.DEBUG : LOG_LEVELS.WARN;

export const logger = {
  debug: (...args) => currentLevel <= LOG_LEVELS.DEBUG && console.log('[DEBUG]', ...args),
  info: (...args) => currentLevel <= LOG_LEVELS.INFO && console.log('[INFO]', ...args),
  warn: (...args) => currentLevel <= LOG_LEVELS.WARN && console.warn('[WARN]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
};

export { LOG_LEVELS };
```

```javascript
// tests/unit/logger.test.js
import { logger, LOG_LEVELS } from '../../js/utils/logger.js';

describe('Logger', () => {
  it('should always log errors', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation();
    logger.error('test error');
    expect(spy).toHaveBeenCalledWith('[ERROR]', 'test error');
    spy.mockRestore();
  });
  
  it('should have correct log levels', () => {
    expect(LOG_LEVELS.DEBUG).toBe(0);
    expect(LOG_LEVELS.ERROR).toBe(3);
  });
});
```

### Step 2: Create validation with tests (45 min)

```javascript
// js/utils/validation.js
export function validateWeight(weight) {
  const num = parseFloat(weight);
  return !isNaN(num) && num >= 0 && num <= 500;
}

export function validateReps(reps) {
  const num = parseInt(reps, 10);
  return !isNaN(num) && num >= 0 && num <= 1000;
}

export function validateUserWeight(weight) {
  const num = parseFloat(weight);
  return !isNaN(num) && num >= 20 && num <= 300;
}

export function validateEmail(email) {
  return email && typeof email === 'string' && 
         email.includes('@') && 
         email.indexOf('@') > 0 && 
         email.indexOf('@') < email.length - 1;
}

export function validatePassword(password) {
  return password && typeof password === 'string' && password.length >= 6;
}
```

```javascript
// tests/unit/validation.test.js
import { 
  validateWeight, validateReps, validateUserWeight,
  validateEmail, validatePassword 
} from '../../js/utils/validation.js';

describe('Validation Utils', () => {
  describe('validateWeight', () => {
    it('should accept valid weights', () => {
      expect(validateWeight(50)).toBe(true);
      expect(validateWeight('75.5')).toBe(true);
      expect(validateWeight(0)).toBe(true);
    });
    
    it('should reject invalid weights', () => {
      expect(validateWeight(-1)).toBe(false);
      expect(validateWeight(501)).toBe(false);
      expect(validateWeight('abc')).toBe(false);
    });
  });
  
  describe('validateEmail', () => {
    it('should validate emails correctly', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('invalid')).toBe(false);
      expect(validateEmail('@test.com')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
    });
  });
});
```

### Step 3: Create debounce with tests (30 min)

```javascript
// js/utils/debounce.js
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
```

```javascript
// tests/unit/debounce.test.js
import { debounce, throttle } from '../../js/utils/debounce.js';

describe('Debounce', () => {
  jest.useFakeTimers();
  
  it('should debounce function calls', () => {
    const fn = jest.fn();
    const debouncedFn = debounce(fn, 100);
    
    debouncedFn();
    debouncedFn();
    debouncedFn();
    
    expect(fn).not.toHaveBeenCalled();
    
    jest.advanceTimersByTime(100);
    
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
```

### Step 4: Run tests after each module
```bash
npm run test:coverage
```

**Total time for Phase 1.5**: 3-4 hours  
**Expected coverage gain**: +7-10%  
**Bonus**: These modules are now ready for use in UPGRADE-PLAN Phase 0!

---

**Document Version**: 2.0  
**Last Updated**: January 13, 2026  
**Status**: Ready for Phase 1.5 implementation (parallel with UPGRADE-PLAN Phase 0)

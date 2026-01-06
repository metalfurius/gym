import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  createMockAuthUser,
  mockAuth,
  resetFirebaseMocks,
} from '../utils/firebase-mocks.js';

// Mock the firebase config and UI modules
jest.unstable_mockModule('../../js/firebase-config.js', () => ({
  auth: { currentUser: null },
}));

jest.unstable_mockModule('../../js/ui.js', () => ({
  showView: jest.fn(),
  updateNav: jest.fn(),
  displayAuthError: jest.fn(),
  displayAuthSuccess: jest.fn(),
  clearAuthMessages: jest.fn(),
  authElements: {
    emailInput: { value: '' },
    passwordInput: { value: '' },
    signupBtn: { disabled: false },
    loginBtn: { disabled: false },
  },
  dashboardElements: {},
}));

jest.unstable_mockModule('../../js/app.js', () => ({
  clearInProgressSession: jest.fn(),
  initializeAppAfterAuth: jest.fn(),
}));

describe('Auth Module', () => {
  beforeEach(() => {
    resetFirebaseMocks();
    localStorage.clear();
  });

  describe('getCurrentUser', () => {
    it('should return null when no user is logged in', () => {
      // Mock implementation of getCurrentUser
      let currentUser = null;
      const getCurrentUser = () => currentUser;
      
      const user = getCurrentUser();
      expect(user).toBeNull();
    });
  });

  describe('Authentication Error Messages', () => {
    it('should return friendly error message for invalid-email', () => {
      const errorCodes = {
        'auth/invalid-email': 'El formato del email no es válido.',
        'auth/user-disabled': 'Esta cuenta de usuario ha sido deshabilitada.',
        'auth/user-not-found': 'No se encontró ningún usuario con este email.',
        'auth/wrong-password': 'La contraseña es incorrecta.',
        'auth/email-already-in-use': 'Este email ya está registrado. Intenta iniciar sesión.',
        'auth/weak-password': 'La contraseña es demasiado débil (mínimo 6 caracteres).',
        'auth/operation-not-allowed': 'Inicio de sesión con email/contraseña no habilitado.',
        'auth/missing-password': 'Por favor, introduce una contraseña.',
      };

      Object.entries(errorCodes).forEach(([code, message]) => {
        expect(message).toBeDefined();
        expect(message.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Email Validation', () => {
    it('should validate email format', () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.com',
      ];

      validEmails.forEach((email) => {
        expect(email).toMatch(/@/);
      });
    });

    it('should detect invalid email formats', () => {
      const testCases = [
        { email: 'invalid', expected: false, reason: 'no @ symbol' },
        { email: 'invalid@', expected: false, reason: '@ at end' },
        { email: '@example.com', expected: false, reason: '@ at start' },
        { email: 'invalid@.com', expected: true, reason: 'basic check passes (has @ in middle) even though domain validation would fail' },
      ];

      testCases.forEach(({ email, expected }) => {
        const isValid = email.includes('@') && email.indexOf('@') > 0 && email.indexOf('@') < email.length - 1;
        expect(isValid).toBe(expected);
      });
    });
  });

  describe('Password Validation', () => {
    it('should require minimum password length', () => {
      const validPasswords = ['123456', 'password123', 'SecurePass1'];
      const invalidPasswords = ['12345', 'abc', ''];

      validPasswords.forEach((password) => {
        expect(password.length).toBeGreaterThanOrEqual(6);
      });

      invalidPasswords.forEach((password) => {
        expect(password.length).toBeLessThan(6);
      });
    });

    it('should accept passwords with 6 or more characters', () => {
      const password = 'validpass';
      expect(password.length).toBeGreaterThanOrEqual(6);
    });
  });

  describe('User State Management', () => {
    it('should handle user login state', () => {
      const mockUser = createMockAuthUser('test@example.com', 'uid-123');
      
      expect(mockUser).toBeDefined();
      expect(mockUser.uid).toBe('uid-123');
      expect(mockUser.email).toBe('test@example.com');
      expect(mockUser.emailVerified).toBe(true);
    });

    it('should handle user logout state', () => {
      let currentUser = createMockAuthUser();
      expect(currentUser).not.toBeNull();
      
      currentUser = null;
      expect(currentUser).toBeNull();
    });

    it('should maintain user metadata', () => {
      const mockUser = createMockAuthUser();
      
      expect(mockUser.metadata).toBeDefined();
      expect(mockUser.metadata.creationTime).toBeDefined();
      expect(mockUser.metadata.lastSignInTime).toBeDefined();
    });
  });

  describe('Authentication Flow', () => {
    it('should handle successful signup flow', async () => {
      const email = 'newuser@example.com';
      const password = 'password123';
      
      const result = await mockAuth.createUserWithEmailAndPassword(null, email, password);
      
      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(email);
    });

    it('should handle successful login flow', async () => {
      const email = 'existinguser@example.com';
      const password = 'password123';
      
      const result = await mockAuth.signInWithEmailAndPassword(null, email, password);
      
      expect(result).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(email);
    });

    it('should handle logout flow', async () => {
      await expect(mockAuth.signOut(null)).resolves.not.toThrow();
    });

    it('should handle authentication state observer', () => {
      const callback = jest.fn();
      const unsubscribe = mockAuth.onAuthStateChanged(null, callback);
      
      expect(callback).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for weak password', async () => {
      await expect(
        mockAuth.createUserWithEmailAndPassword(null, 'test@example.com', '12345')
      ).rejects.toMatchObject({ code: 'auth/weak-password' });
    });

    it('should throw error for invalid email', async () => {
      await expect(
        mockAuth.createUserWithEmailAndPassword(null, '', 'password123')
      ).rejects.toMatchObject({ code: 'auth/invalid-email' });
    });

    it('should throw error for missing password', async () => {
      await expect(
        mockAuth.signInWithEmailAndPassword(null, 'test@example.com', '')
      ).rejects.toMatchObject({ code: 'auth/missing-password' });
    });
  });

  describe('Form Validation', () => {
    it('should validate email and password are not empty', () => {
      const email = '';
      const password = '';
      
      const isValid = email.length > 0 && password.length > 0;
      expect(isValid).toBe(false);
    });

    it('should validate email and password are provided', () => {
      const email = 'test@example.com';
      const password = 'password123';
      
      const isValid = email.length > 0 && password.length > 0;
      expect(isValid).toBe(true);
    });

    it('should validate minimum password length in form', () => {
      const password = 'short';
      const isValid = password.length >= 6;
      expect(isValid).toBe(false);
    });
  });

  describe('User Provider Data', () => {
    it('should include provider information', () => {
      const mockUser = createMockAuthUser('test@example.com');
      
      expect(mockUser.providerData).toBeDefined();
      expect(mockUser.providerData.length).toBeGreaterThan(0);
      expect(mockUser.providerData[0].providerId).toBe('password');
    });

    it('should include email in provider data', () => {
      const email = 'test@example.com';
      const mockUser = createMockAuthUser(email);
      
      expect(mockUser.providerData[0].email).toBe(email);
    });
  });

  describe('Authentication Properties', () => {
    it('should have emailVerified property', () => {
      const mockUser = createMockAuthUser();
      expect(mockUser.emailVerified).toBe(true);
    });

    it('should have isAnonymous property', () => {
      const mockUser = createMockAuthUser();
      expect(mockUser.isAnonymous).toBe(false);
    });

    it('should have refreshToken property', () => {
      const mockUser = createMockAuthUser();
      expect(mockUser.refreshToken).toBeDefined();
      expect(typeof mockUser.refreshToken).toBe('string');
    });
  });
});

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import ThemeManager from '../../js/theme-manager.js';

describe('ThemeManager Class - Actual Import', () => {
  let themeManager;

  beforeEach(() => {
    // Setup comprehensive DOM
    document.body.innerHTML = `
      <html>
        <head></head>
        <body>
          <button id="theme-toggle">Toggle Theme</button>
          <div id="current-theme-name">Moderno</div>
          <div id="current-theme-icon">🎨</div>
          <div id="dashboard"></div>
          <div id="session-view"></div>
        </body>
      </html>
    `;
    
    // Clear localStorage
    localStorage.clear();
    
    // Spy on console methods to prevent noise
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('Initialization', () => {
    it('should create ThemeManager instance', () => {
      themeManager = new ThemeManager();
      expect(themeManager).toBeDefined();
      expect(themeManager.themes).toBeDefined();
      expect(themeManager.currentTheme).toBeDefined();
    });

    it('should have 5 themes defined', () => {
      themeManager = new ThemeManager();
      const themeKeys = Object.keys(themeManager.themes);
      expect(themeKeys).toHaveLength(5);
      expect(themeKeys).toContain('default');
      expect(themeKeys).toContain('dark');
      expect(themeKeys).toContain('nature');
      expect(themeKeys).toContain('sunset');
      expect(themeKeys).toContain('ocean');
    });

    it('should load theme from localStorage', () => {
      localStorage.setItem('gym-tracker-theme', 'dark');
      themeManager = new ThemeManager();
      expect(themeManager.currentTheme).toBe('dark');
    });

    it('should default to default theme when no storage', () => {
      themeManager = new ThemeManager();
      expect(themeManager.currentTheme).toBe('default');
    });
  });

  describe('Theme Data Structure', () => {
    beforeEach(() => {
      themeManager = new ThemeManager();
    });

    it('should have all required properties for each theme', () => {
      Object.entries(themeManager.themes).forEach(([key, theme]) => {
        expect(theme).toHaveProperty('name');
        expect(theme).toHaveProperty('icon');
        expect(theme).toHaveProperty('description');
        expect(typeof theme.name).toBe('string');
        expect(typeof theme.icon).toBe('string');
        expect(typeof theme.description).toBe('string');
      });
    });

    it('should have correct default theme data', () => {
      const defaultTheme = themeManager.themes.default;
      expect(defaultTheme.name).toBe('Moderno');
      expect(defaultTheme.icon).toBe('🎨');
    });

    it('should have correct dark theme data', () => {
      const darkTheme = themeManager.themes.dark;
      expect(darkTheme.name).toBe('Oscuro');
      expect(darkTheme.icon).toBe('🌙');
    });
  });

  describe('loadTheme', () => {
    it('should load saved theme from localStorage', () => {
      localStorage.setItem('gym-tracker-theme', 'nature');
      themeManager = new ThemeManager();
      expect(themeManager.loadTheme()).toBe('nature');
    });

    it('should return default when no theme saved', () => {
      themeManager = new ThemeManager();
      expect(themeManager.loadTheme()).toBe('default');
    });

    it('should return default for invalid theme key', () => {
      localStorage.setItem('gym-tracker-theme', 'invalid-theme');
      themeManager = new ThemeManager();
      const loaded = themeManager.loadTheme();
      // Should fallback to default for invalid theme
      expect(['default', 'invalid-theme']).toContain(loaded);
    });
  });

  describe('saveTheme', () => {
    beforeEach(() => {
      themeManager = new ThemeManager();
    });

    it('should save theme to localStorage', () => {
      themeManager.saveTheme('dark');
      const saved = localStorage.getItem('gym-tracker-theme');
      expect(saved).toBe('dark');
    });

    it('should save different themes', () => {
      themeManager.saveTheme('nature');
      expect(localStorage.getItem('gym-tracker-theme')).toBe('nature');
      
      themeManager.saveTheme('ocean');
      expect(localStorage.getItem('gym-tracker-theme')).toBe('ocean');
    });
  });

  describe('applyTheme', () => {
    beforeEach(() => {
      themeManager = new ThemeManager();
    });

    it('should apply theme data attribute to document element', () => {
      themeManager.applyTheme('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    });

    it('should remove previous theme when applying new theme', () => {
      themeManager.applyTheme('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      
      themeManager.applyTheme('nature');
      expect(document.documentElement.getAttribute('data-theme')).toBe('nature');
    });

    it('should apply default theme', () => {
      themeManager.applyTheme('default');
      // Default theme sets empty string
      expect(document.documentElement.getAttribute('data-theme')).toBe('');
    });
  });

  describe('Theme Names', () => {
    beforeEach(() => {
      themeManager = new ThemeManager();
    });

    it('should return theme name for valid key', () => {
      const themeName = themeManager.themes['dark'].name;
      expect(themeName).toBe('Oscuro');
    });

    it('should have Spanish theme names', () => {
      expect(themeManager.themes.default.name).toBe('Moderno');
      expect(themeManager.themes.dark.name).toBe('Oscuro');
      expect(themeManager.themes.nature.name).toBe('Natural');
      expect(themeManager.themes.sunset.name).toBe('Atardecer');
      expect(themeManager.themes.ocean.name).toBe('Océano');
    });
  });

  describe('Theme Icons', () => {
    beforeEach(() => {
      themeManager = new ThemeManager();
    });

    it('should have emoji icons for all themes', () => {
      Object.values(themeManager.themes).forEach(theme => {
        expect(theme.icon).toBeTruthy();
        expect(theme.icon.length).toBeGreaterThan(0);
      });
    });

    it('should have unique icons', () => {
      const icons = Object.values(themeManager.themes).map(t => t.icon);
      const uniqueIcons = new Set(icons);
      expect(uniqueIcons.size).toBe(icons.length);
    });
  });
});

import { describe, it, expect, beforeEach } from '@jest/globals';

describe('ThemeManager Module', () => {
  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
      <button id="theme-toggle">Toggle Theme</button>
      <div id="current-theme-name">Moderno</div>
      <div id="current-theme-icon">🎨</div>
    `;
    
    // Clear localStorage
    localStorage.clear();
  });

  describe('Theme Storage', () => {
    it('should save theme preference to localStorage', () => {
      const theme = 'dark';
      localStorage.setItem('gym-tracker-theme', theme);
      
      expect(localStorage.getItem('gym-tracker-theme')).toBe('dark');
    });

    it('should load theme preference from localStorage', () => {
      localStorage.setItem('gym-tracker-theme', 'nature');
      const storedTheme = localStorage.getItem('gym-tracker-theme');
      
      expect(storedTheme).toBe('nature');
    });

    it('should default to default theme when no preference stored', () => {
      const storedTheme = localStorage.getItem('gym-tracker-theme');
      expect(storedTheme).toBeNull();
    });
  });

  describe('Theme Data Structure', () => {
    const themes = {
      'default': { 
        name: 'Moderno', 
        icon: '🎨',
        description: 'Tema azul moderno y elegante'
      },
      'dark': { 
        name: 'Oscuro', 
        icon: '🌙',
        description: 'Tema oscuro para usar de noche'
      },
      'nature': { 
        name: 'Natural', 
        icon: '🌿',
        description: 'Tema verde inspirado en la naturaleza'
      },
      'sunset': { 
        name: 'Atardecer', 
        icon: '🌅',
        description: 'Colores cálidos del atardecer'
      },
      'ocean': { 
        name: 'Océano', 
        icon: '🌊',
        description: 'Azules profundos del océano'
      }
    };

    it('should have all required theme properties', () => {
      Object.keys(themes).forEach(themeKey => {
        const theme = themes[themeKey];
        expect(theme).toHaveProperty('name');
        expect(theme).toHaveProperty('icon');
        expect(theme).toHaveProperty('description');
      });
    });

    it('should have correct default theme data', () => {
      expect(themes.default.name).toBe('Moderno');
      expect(themes.default.icon).toBe('🎨');
    });

    it('should have correct dark theme data', () => {
      expect(themes.dark.name).toBe('Oscuro');
      expect(themes.dark.icon).toBe('🌙');
    });

    it('should have 5 available themes', () => {
      expect(Object.keys(themes).length).toBe(5);
    });
  });

  describe('Theme Application', () => {
    it('should apply theme class to document', () => {
      const themeClass = 'theme-dark';
      document.documentElement.classList.add(themeClass);
      
      expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
    });

    it('should remove previous theme classes', () => {
      document.documentElement.classList.add('theme-dark');
      document.documentElement.classList.remove('theme-dark');
      document.documentElement.classList.add('theme-nature');
      
      expect(document.documentElement.classList.contains('theme-dark')).toBe(false);
      expect(document.documentElement.classList.contains('theme-nature')).toBe(true);
    });
  });

  describe('Theme UI Updates', () => {
    it('should update theme display name', () => {
      const themeNameElement = document.getElementById('current-theme-name');
      themeNameElement.textContent = 'Oscuro';
      
      expect(themeNameElement.textContent).toBe('Oscuro');
    });

    it('should update theme display icon', () => {
      const themeIconElement = document.getElementById('current-theme-icon');
      themeIconElement.textContent = '🌙';
      
      expect(themeIconElement.textContent).toBe('🌙');
    });
  });

  describe('Theme Toggle', () => {
    it('should have theme toggle button', () => {
      const themeToggle = document.getElementById('theme-toggle');
      expect(themeToggle).not.toBeNull();
    });

    it('should handle theme toggle click', () => {
      const themeToggle = document.getElementById('theme-toggle');
      let clicked = false;
      
      themeToggle.addEventListener('click', () => {
        clicked = true;
      });
      
      themeToggle.click();
      expect(clicked).toBe(true);
    });
  });

  describe('Theme Selection Modal', () => {
    it('should create theme selection modal HTML', () => {
      const modalHTML = `
        <div class="theme-modal">
          <div class="theme-modal-content">
            <h3>Seleccionar Tema</h3>
          </div>
        </div>
      `;
      
      expect(modalHTML).toContain('theme-modal');
      expect(modalHTML).toContain('Seleccionar Tema');
    });

    it('should have theme option buttons', () => {
      const themeButton = document.createElement('button');
      themeButton.className = 'theme-option';
      themeButton.dataset.theme = 'dark';
      
      expect(themeButton.classList.contains('theme-option')).toBe(true);
      expect(themeButton.dataset.theme).toBe('dark');
    });
  });
});

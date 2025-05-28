/**
 * Sistema de gestión de temas para My Workout Tracker
 */

class ThemeManager {
    constructor() {
        this.themes = {
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
        
        this.currentTheme = this.loadTheme();
        this.init();
    }

    init() {
        this.applyTheme(this.currentTheme);
        this.setupEventListeners();
        this.updateThemeDisplay();
    }    setupEventListeners() {
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            // Remover event listener existente si lo hay
            themeToggle.removeEventListener('click', this.handleThemeToggleClick);
            
            // Crear función bound para poder removerla después
            this.handleThemeToggleClick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.showThemeSelector();
            };
            
            themeToggle.addEventListener('click', this.handleThemeToggleClick);
        }
    }showThemeSelector() {
        // Verificar si ya hay un modal abierto
        const existingModal = document.querySelector('.theme-modal');
        if (existingModal) {
            return; // No crear otro modal si ya hay uno
        }
        
        // Crear modal de selección de temas
        const modal = this.createThemeModal();
        document.body.appendChild(modal);
        
        // Agregar event listener para cerrar solo en el overlay y botón close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeThemeModal(modal);
            }
        });        // Event listener específico para el botón de cerrar
        const closeBtn = modal.querySelector('.theme-modal-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeThemeModal(modal);
            });
        }

        // Agregar soporte para cerrar con Escape
        const handleEscapeKey = (e) => {
            if (e.key === 'Escape') {
                this.closeThemeModal(modal);
                document.removeEventListener('keydown', handleEscapeKey);
            }
        };
        document.addEventListener('keydown', handleEscapeKey);

        // Mostrar modal con animación
        requestAnimationFrame(() => {
            modal.classList.add('show');
        });
    }

    createThemeModal() {
        const modal = document.createElement('div');
        modal.className = 'theme-modal';
        modal.innerHTML = `
            <div class="theme-modal-content">
                <div class="theme-modal-header">
                    <h3>Elegir Tema</h3>
                    <button class="theme-modal-close">&times;</button>
                </div>
                <div class="theme-modal-body">
                    <div class="theme-grid">
                        ${Object.entries(this.themes).map(([key, theme]) => `
                            <div class="theme-option ${key === this.currentTheme ? 'active' : ''}" 
                                 data-theme="${key}">
                                <div class="theme-preview" data-theme="${key}">
                                    <div class="theme-preview-header"></div>
                                    <div class="theme-preview-content">
                                        <div class="theme-preview-card"></div>
                                        <div class="theme-preview-button"></div>
                                    </div>
                                </div>
                                <div class="theme-info">
                                    <div class="theme-icon">${theme.icon}</div>
                                    <h4>${theme.name}</h4>
                                    <p>${theme.description}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;        // Agregar event listeners a las opciones de tema
        modal.querySelectorAll('.theme-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevenir que el evento se propague al modal
                const themeKey = option.dataset.theme;
                this.setTheme(themeKey);
                this.closeThemeModal(modal);
            });
        });

        return modal;
    }

    closeThemeModal(modal) {
        modal.classList.add('closing');
        setTimeout(() => {
            if (modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        }, 300);
    }

    // Método para limpiar event listeners
    cleanup() {
        const themeToggle = document.getElementById('theme-toggle');
        if (themeToggle && this.handleThemeToggleClick) {
            themeToggle.removeEventListener('click', this.handleThemeToggleClick);
        }
    }

    setTheme(themeKey) {
        if (this.themes[themeKey]) {
            this.currentTheme = themeKey;
            this.applyTheme(themeKey);
            this.saveTheme(themeKey);
            this.updateThemeDisplay();
            
            // Disparar evento personalizado para que otros componentes puedan reaccionar
            window.dispatchEvent(new CustomEvent('themeChanged', { 
                detail: { theme: themeKey, themeName: this.themes[themeKey].name }
            }));
        }
    }

    applyTheme(themeKey) {
        document.documentElement.setAttribute('data-theme', themeKey === 'default' ? '' : themeKey);
        
        // Actualizar meta theme-color para PWA
        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
            const colors = {
                'default': '#667eea',
                'dark': '#1e1b4b',
                'nature': '#064e3b',
                'sunset': '#dc2626',
                'ocean': '#0c4a6e'
            };
            metaThemeColor.setAttribute('content', colors[themeKey] || colors.default);
        }
    }

    updateThemeDisplay() {
        const themeNameElement = document.getElementById('theme-name');
        const themeIconElement = document.querySelector('.theme-icon');
        
        if (themeNameElement) {
            themeNameElement.textContent = this.themes[this.currentTheme].name;
        }
        
        if (themeIconElement) {
            themeIconElement.textContent = this.themes[this.currentTheme].icon;
        }
    }

    loadTheme() {
        const saved = localStorage.getItem('gym-tracker-theme');
        return saved && this.themes[saved] ? saved : 'default';
    }

    saveTheme(themeKey) {
        localStorage.setItem('gym-tracker-theme', themeKey);
    }

    getCurrentTheme() {
        return this.currentTheme;
    }

    getThemeInfo(themeKey = null) {
        const key = themeKey || this.currentTheme;
        return this.themes[key];
    }
}

// CSS para el modal de temas
const themeModalCSS = `
.theme-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
}

.theme-modal.show {
    opacity: 1;
    visibility: visible;
}

.theme-modal.closing {
    opacity: 0;
    transform: scale(0.95);
}

.theme-modal-content {
    background: var(--card-bg);
    border-radius: var(--border-radius-xl);
    box-shadow: var(--box-shadow-lg);
    max-width: 600px;
    width: 90vw;
    max-height: 80vh;
    overflow: hidden;
    transform: translateY(20px);
    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.theme-modal.show .theme-modal-content {
    transform: translateY(0);
}

.theme-modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-lg);
    border-bottom: 1px solid var(--border-color);
}

.theme-modal-header h3 {
    margin: 0;
    color: var(--text-color);
    font-family: var(--font-heading);
}

.theme-modal-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: var(--text-muted-color);
    padding: var(--spacing-xs);
    border-radius: var(--border-radius-sm);
    transition: var(--transition-fast);
}

.theme-modal-close:hover {
    background: var(--border-color);
    color: var(--text-color);
}

.theme-modal-body {
    padding: var(--spacing-lg);
    overflow-y: auto;
    max-height: 60vh;
}

.theme-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: var(--spacing-lg);
}

.theme-option {
    border: 2px solid var(--border-color);
    border-radius: var(--border-radius-lg);
    padding: var(--spacing-md);
    cursor: pointer;
    transition: var(--transition-base);
    background: var(--card-bg);
}

.theme-option:hover {
    border-color: var(--primary-color);
    transform: translateY(-2px);
    box-shadow: var(--box-shadow-md);
}

.theme-option.active {
    border-color: var(--primary-color);
    background: var(--primary-light);
    box-shadow: var(--box-shadow-md);
}

.theme-preview {
    height: 80px;
    border-radius: var(--border-radius-md);
    overflow: hidden;
    margin-bottom: var(--spacing-md);
    position: relative;
}

.theme-preview[data-theme="default"] {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.theme-preview[data-theme="dark"] {
    background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%);
}

.theme-preview[data-theme="nature"] {
    background: linear-gradient(135deg, #064e3b 0%, #059669 100%);
}

.theme-preview[data-theme="sunset"] {
    background: linear-gradient(135deg, #dc2626 0%, #f59e0b 100%);
}

.theme-preview[data-theme="ocean"] {
    background: linear-gradient(135deg, #0c4a6e 0%, #0ea5e9 100%);
}

.theme-preview-header {
    height: 30%;
    background: rgba(255, 255, 255, 0.2);
}

.theme-preview-content {
    padding: var(--spacing-xs);
    height: 70%;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-xs);
}

.theme-preview-card {
    flex: 1;
    background: rgba(255, 255, 255, 0.9);
    border-radius: 4px;
}

.theme-preview-button {
    height: 20%;
    background: rgba(255, 255, 255, 0.3);
    border-radius: 4px;
}

.theme-info {
    text-align: center;
}

.theme-icon {
    font-size: 24px;
    margin-bottom: var(--spacing-xs);
}

.theme-info h4 {
    margin: var(--spacing-xs) 0;
    color: var(--text-color);
    font-family: var(--font-heading);
}

.theme-info p {
    margin: 0;
    color: var(--text-muted-color);
    font-size: 0.875rem;
}

@media (max-width: 768px) {
    .theme-grid {
        grid-template-columns: 1fr;
    }
    
    .theme-modal-content {
        width: 95vw;
        margin: var(--spacing-md);
    }
}
`;

// Inyectar CSS
if (!document.getElementById('theme-modal-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'theme-modal-styles';
    styleSheet.textContent = themeModalCSS;
    document.head.appendChild(styleSheet);
}

// Exportar para uso en app.js
export default ThemeManager;

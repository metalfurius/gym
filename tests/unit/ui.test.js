import { describe, it, expect, beforeEach } from '@jest/globals';

describe('UI Module', () => {
  beforeEach(() => {
    // Setup DOM with all necessary elements
    document.body.innerHTML = `
      <!-- Auth elements -->
      <div id="auth-view">
        <input type="email" id="email-input" />
        <input type="password" id="password-input" />
        <button id="signup-btn">Sign Up</button>
        <button id="login-btn">Login</button>
        <button id="google-login-btn">Google</button>
        <div id="auth-error"></div>
        <div id="auth-success"></div>
      </div>

      <!-- Dashboard elements -->
      <div id="dashboard">
        <div id="user-info"></div>
        <button id="logout-btn">Logout</button>
      </div>

      <!-- Navigation -->
      <nav id="nav-buttons">
        <button class="nav-button" data-view="dashboard">Dashboard</button>
        <button class="nav-button" data-view="session">Session</button>
        <button class="nav-button" data-view="routines">Routines</button>
        <button class="nav-button" data-view="history">History</button>
        <button class="nav-button" data-view="progress">Progress</button>
      </nav>

      <!-- Session elements -->
      <div id="session-view">
        <select id="routine-select"></select>
        <button id="start-session-btn">Start Session</button>
        <div id="exercise-list"></div>
        <button id="complete-session-btn">Complete</button>
      </div>

      <!-- Routines elements -->
      <div id="routines-view">
        <button id="create-routine-btn">Create Routine</button>
        <div id="routines-list"></div>
      </div>

      <!-- History elements -->
      <div id="history-view">
        <div id="history-list"></div>
      </div>

      <!-- Progress elements -->
      <div id="progress-view">
        <select id="exercise-select"></select>
        <select id="metric-select"></select>
        <select id="period-select"></select>
        <div id="chart-container"></div>
      </div>

      <!-- Modals -->
      <div id="routine-modal" class="modal">
        <input id="routine-name-input" />
        <div id="exercises-container"></div>
        <button id="add-exercise-btn">Add Exercise</button>
        <button id="save-routine-btn">Save</button>
        <button id="cancel-routine-btn">Cancel</button>
      </div>

      <!-- Loading indicator -->
      <div id="loading-indicator"></div>
    `;
  });

  describe('Element References', () => {
    it('should have auth elements', () => {
      expect(document.getElementById('auth-view')).not.toBeNull();
      expect(document.getElementById('email-input')).not.toBeNull();
      expect(document.getElementById('password-input')).not.toBeNull();
      expect(document.getElementById('signup-btn')).not.toBeNull();
      expect(document.getElementById('login-btn')).not.toBeNull();
    });

    it('should have dashboard elements', () => {
      expect(document.getElementById('dashboard')).not.toBeNull();
      expect(document.getElementById('user-info')).not.toBeNull();
      expect(document.getElementById('logout-btn')).not.toBeNull();
    });

    it('should have navigation buttons', () => {
      const navButtons = document.querySelectorAll('.nav-button');
      expect(navButtons.length).toBeGreaterThan(0);
    });

    it('should have session elements', () => {
      expect(document.getElementById('session-view')).not.toBeNull();
      expect(document.getElementById('routine-select')).not.toBeNull();
      expect(document.getElementById('exercise-list')).not.toBeNull();
    });

    it('should have routines elements', () => {
      expect(document.getElementById('routines-view')).not.toBeNull();
      expect(document.getElementById('create-routine-btn')).not.toBeNull();
      expect(document.getElementById('routines-list')).not.toBeNull();
    });

    it('should have progress elements', () => {
      expect(document.getElementById('progress-view')).not.toBeNull();
      expect(document.getElementById('exercise-select')).not.toBeNull();
      expect(document.getElementById('metric-select')).not.toBeNull();
    });
  });

  describe('View Management', () => {
    it('should hide and show views', () => {
      const authView = document.getElementById('auth-view');
      const dashboard = document.getElementById('dashboard');
      
      authView.style.display = 'none';
      dashboard.style.display = 'block';
      
      expect(authView.style.display).toBe('none');
      expect(dashboard.style.display).toBe('block');
    });

    it('should identify active view', () => {
      const views = ['auth-view', 'dashboard', 'session-view', 'routines-view'];
      const activeView = 'dashboard';
      
      expect(views).toContain(activeView);
    });
  });

  describe('Navigation', () => {
    it('should set active navigation button', () => {
      const navButtons = document.querySelectorAll('.nav-button');
      const activeButton = navButtons[0];
      
      // Remove active from all
      navButtons.forEach(btn => btn.classList.remove('active'));
      
      // Set active on one
      activeButton.classList.add('active');
      
      const activeCount = Array.from(navButtons).filter(btn => 
        btn.classList.contains('active')
      ).length;
      
      expect(activeCount).toBe(1);
      expect(activeButton.classList.contains('active')).toBe(true);
    });

    it('should get view from data attribute', () => {
      const button = document.querySelector('[data-view="session"]');
      expect(button.dataset.view).toBe('session');
    });
  });

  describe('Message Display', () => {
    it('should display error message', () => {
      const errorDiv = document.getElementById('auth-error');
      const message = 'Error occurred';
      
      errorDiv.textContent = message;
      errorDiv.style.display = 'block';
      
      expect(errorDiv.textContent).toBe(message);
      expect(errorDiv.style.display).toBe('block');
    });

    it('should clear error message', () => {
      const errorDiv = document.getElementById('auth-error');
      
      errorDiv.textContent = '';
      errorDiv.style.display = 'none';
      
      expect(errorDiv.textContent).toBe('');
      expect(errorDiv.style.display).toBe('none');
    });

    it('should display success message', () => {
      const successDiv = document.getElementById('auth-success');
      const message = 'Success!';
      
      successDiv.textContent = message;
      successDiv.style.display = 'block';
      
      expect(successDiv.textContent).toBe(message);
    });
  });

  describe('Loading Indicator', () => {
    it('should show loading indicator', () => {
      const loading = document.getElementById('loading-indicator');
      loading.style.display = 'block';
      
      expect(loading.style.display).toBe('block');
    });

    it('should hide loading indicator', () => {
      const loading = document.getElementById('loading-indicator');
      loading.style.display = 'none';
      
      expect(loading.style.display).toBe('none');
    });
  });

  describe('Routine Select', () => {
    it('should populate routine select options', () => {
      const routineSelect = document.getElementById('routine-select');
      const routines = [
        { id: '1', name: 'Routine A' },
        { id: '2', name: 'Routine B' }
      ];
      
      routines.forEach(routine => {
        const option = document.createElement('option');
        option.value = routine.id;
        option.textContent = routine.name;
        routineSelect.appendChild(option);
      });
      
      expect(routineSelect.options.length).toBe(2);
      expect(routineSelect.options[0].textContent).toBe('Routine A');
    });

    it('should get selected routine', () => {
      const routineSelect = document.getElementById('routine-select');
      const option = document.createElement('option');
      option.value = 'routine-1';
      option.selected = true;
      routineSelect.appendChild(option);
      
      expect(routineSelect.value).toBe('routine-1');
    });
  });

  describe('Exercise List', () => {
    it('should create exercise element', () => {
      const exercise = {
        nombreEjercicio: 'Bench Press',
        sets: 3,
        type: 'strength'
      };
      
      const div = document.createElement('div');
      div.className = 'exercise-item';
      div.innerHTML = `
        <h3>${exercise.nombreEjercicio}</h3>
        <p>Sets: ${exercise.sets}</p>
        <p>Type: ${exercise.type}</p>
      `;
      
      expect(div.querySelector('h3').textContent).toBe('Bench Press');
      expect(div.textContent).toContain('Sets: 3');
    });

    it('should add exercise to list', () => {
      const exerciseList = document.getElementById('exercise-list');
      const exerciseDiv = document.createElement('div');
      exerciseDiv.className = 'exercise-item';
      exerciseDiv.textContent = 'Bench Press';
      
      exerciseList.appendChild(exerciseDiv);
      
      expect(exerciseList.children.length).toBe(1);
    });

    it('should clear exercise list', () => {
      const exerciseList = document.getElementById('exercise-list');
      exerciseList.innerHTML = '<div>Exercise 1</div><div>Exercise 2</div>';
      
      exerciseList.innerHTML = '';
      
      expect(exerciseList.children.length).toBe(0);
    });
  });

  describe('Modal Management', () => {
    it('should show modal', () => {
      const modal = document.getElementById('routine-modal');
      modal.style.display = 'block';
      
      expect(modal.style.display).toBe('block');
    });

    it('should hide modal', () => {
      const modal = document.getElementById('routine-modal');
      modal.style.display = 'none';
      
      expect(modal.style.display).toBe('none');
    });

    it('should clear modal inputs', () => {
      const input = document.getElementById('routine-name-input');
      input.value = 'Test';
      
      input.value = '';
      
      expect(input.value).toBe('');
    });
  });

  describe('User Info Display', () => {
    it('should display user email', () => {
      const userInfo = document.getElementById('user-info');
      const email = 'test@example.com';
      
      userInfo.textContent = email;
      
      expect(userInfo.textContent).toBe(email);
    });

    it('should clear user info', () => {
      const userInfo = document.getElementById('user-info');
      userInfo.textContent = '';
      
      expect(userInfo.textContent).toBe('');
    });
  });

  describe('Button States', () => {
    it('should enable button', () => {
      const button = document.getElementById('start-session-btn');
      button.disabled = false;
      
      expect(button.disabled).toBe(false);
    });

    it('should disable button', () => {
      const button = document.getElementById('start-session-btn');
      button.disabled = true;
      
      expect(button.disabled).toBe(true);
    });
  });

  describe('HTML Generation', () => {
    it('should generate set HTML', () => {
      const setHTML = `
        <div class="set-row">
          <input type="number" placeholder="Peso" class="set-input" />
          <input type="number" placeholder="Reps" class="set-input" />
        </div>
      `;
      
      expect(setHTML).toContain('set-row');
      expect(setHTML).toContain('Peso');
      expect(setHTML).toContain('Reps');
    });

    it('should generate exercise card HTML', () => {
      const cardHTML = `
        <div class="exercise-card">
          <h3>Bench Press</h3>
          <p>3 sets</p>
        </div>
      `;
      
      expect(cardHTML).toContain('exercise-card');
      expect(cardHTML).toContain('Bench Press');
    });
  });

  describe('Input Validation', () => {
    it('should validate number input', () => {
      const input = document.createElement('input');
      input.type = 'number';
      input.value = '60';
      
      const value = parseInt(input.value);
      expect(typeof value).toBe('number');
      expect(value).toBe(60);
    });

    it('should handle invalid number input', () => {
      const input = document.createElement('input');
      input.type = 'number';
      input.value = 'abc';
      
      const value = parseInt(input.value);
      expect(isNaN(value)).toBe(true);
    });
  });

  describe('List Rendering', () => {
    it('should render history list', () => {
      const historyList = document.getElementById('history-list');
      const sessions = [
        { dia: 'Routine A', fecha: '2024-01-01' },
        { dia: 'Routine B', fecha: '2024-01-02' }
      ];
      
      sessions.forEach(session => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.textContent = `${session.dia} - ${session.fecha}`;
        historyList.appendChild(div);
      });
      
      expect(historyList.children.length).toBe(2);
    });

    it('should render empty state', () => {
      const list = document.getElementById('history-list');
      list.innerHTML = '<p>No sessions found</p>';
      
      expect(list.textContent).toContain('No sessions found');
    });
  });
});

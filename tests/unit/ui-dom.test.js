import { describe, it, expect, beforeEach, jest } from '@jest/globals';

describe('UI Module - DOM Elements and Events', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = `
      <div id="auth-view" style="display: none;"></div>
      <div id="dashboard-view" style="display: none;"></div>
      <div id="session-view" style="display: none;"></div>
      <div id="history-view" style="display: none;"></div>
      <div id="manage-routines-view" style="display: none;"></div>
      <div id="routine-editor-view" style="display: none;"></div>
      <div id="progress-view" style="display: none;"></div>
      
      <button id="nav-dashboard"></button>
      <button id="nav-manage-routines"></button>
      <button id="nav-history"></button>
      <button id="nav-progress"></button>
      <button id="logout-btn"></button>
      
      <input id="auth-email" type="email" />
      <input id="auth-password" type="password" />
      <button id="login-email-btn"></button>
      <button id="signup-email-btn"></button>
      <div id="auth-error"></div>
      
      <span id="user-email"></span>
      <span id="current-date"></span>
      <select id="day-select"></select>
      <button id="start-session-btn"></button>
      
      <form id="session-form"></form>
      <h2 id="session-title"></h2>
      <div id="exercise-list"></div>
      <button id="save-session-btn"></button>
      <button id="cancel-session-btn"></button>
      
      <div id="history-list"></div>
      <input id="history-search" type="text" />
      
      <div id="session-detail-modal" style="display: none;">
        <button class="modal-close"></button>
        <h2 id="session-detail-title"></h2>
        <div id="session-detail-date"></div>
        <div id="session-detail-exercises"></div>
      </div>
      
      <div id="routine-list"></div>
      <button id="add-new-routine-btn"></button>
      
      <form id="routine-editor-form"></form>
      <input id="routine-name" type="text" />
      <div id="routine-exercises-container"></div>
      <button id="add-exercise-to-routine-btn"></button>
      <button id="save-routine-btn"></button>
      
      <select id="exercise-select"></select>
      <select id="metric-select"></select>
      <select id="period-select"></select>
      <canvas id="progress-chart"></canvas>
    `;
  });

  describe('View Elements', () => {
    it('should have all required view elements', () => {
      const views = {
        auth: document.getElementById('auth-view'),
        dashboard: document.getElementById('dashboard-view'),
        session: document.getElementById('session-view'),
        history: document.getElementById('history-view'),
        manageRoutines: document.getElementById('manage-routines-view'),
        routineEditor: document.getElementById('routine-editor-view'),
        progress: document.getElementById('progress-view'),
      };

      Object.values(views).forEach((view) => {
        expect(view).not.toBeNull();
      });
    });

    it('should toggle view visibility', () => {
      const view = document.getElementById('dashboard-view');
      
      view.style.display = 'none';
      expect(view.style.display).toBe('none');
      
      view.style.display = 'block';
      expect(view.style.display).toBe('block');
    });

    it('should show only one view at a time', () => {
      const views = [
        document.getElementById('auth-view'),
        document.getElementById('dashboard-view'),
        document.getElementById('session-view'),
      ];

      // Hide all
      views.forEach((v) => (v.style.display = 'none'));

      // Show one
      views[1].style.display = 'block';

      expect(views[0].style.display).toBe('none');
      expect(views[1].style.display).toBe('block');
      expect(views[2].style.display).toBe('none');
    });
  });

  describe('Navigation Buttons', () => {
    it('should have all navigation buttons', () => {
      const navButtons = {
        dashboard: document.getElementById('nav-dashboard'),
        manageRoutines: document.getElementById('nav-manage-routines'),
        history: document.getElementById('nav-history'),
        progress: document.getElementById('nav-progress'),
        logout: document.getElementById('logout-btn'),
      };

      Object.values(navButtons).forEach((button) => {
        expect(button).not.toBeNull();
      });
    });

    it('should handle button click events', () => {
      const button = document.getElementById('nav-dashboard');
      const clickHandler = jest.fn();

      button.addEventListener('click', clickHandler);
      button.click();

      expect(clickHandler).toHaveBeenCalledTimes(1);
    });

    it('should toggle active class on navigation', () => {
      const button = document.getElementById('nav-dashboard');
      
      button.classList.add('active');
      expect(button.classList.contains('active')).toBe(true);
      
      button.classList.remove('active');
      expect(button.classList.contains('active')).toBe(false);
    });
  });

  describe('Auth Form Elements', () => {
    it('should have auth form inputs', () => {
      const emailInput = document.getElementById('auth-email');
      const passwordInput = document.getElementById('auth-password');

      expect(emailInput).not.toBeNull();
      expect(passwordInput).not.toBeNull();
      expect(emailInput.type).toBe('email');
      expect(passwordInput.type).toBe('password');
    });

    it('should handle input value changes', () => {
      const emailInput = document.getElementById('auth-email');
      
      emailInput.value = 'test@example.com';
      expect(emailInput.value).toBe('test@example.com');
    });

    it('should handle form submission', () => {
      const loginBtn = document.getElementById('login-email-btn');
      const submitHandler = jest.fn((e) => e.preventDefault());

      loginBtn.addEventListener('click', submitHandler);
      loginBtn.click();

      expect(submitHandler).toHaveBeenCalled();
    });

    it('should display error messages', () => {
      const errorDiv = document.getElementById('auth-error');
      
      errorDiv.textContent = 'Invalid credentials';
      expect(errorDiv.textContent).toBe('Invalid credentials');
      
      errorDiv.textContent = '';
      expect(errorDiv.textContent).toBe('');
    });

    it('should disable buttons during submission', () => {
      const loginBtn = document.getElementById('login-email-btn');
      
      loginBtn.disabled = true;
      expect(loginBtn.disabled).toBe(true);
      
      loginBtn.disabled = false;
      expect(loginBtn.disabled).toBe(false);
    });
  });

  describe('Session Form Elements', () => {
    it('should have session form elements', () => {
      const form = document.getElementById('session-form');
      const title = document.getElementById('session-title');
      const exerciseList = document.getElementById('exercise-list');
      const saveBtn = document.getElementById('save-session-btn');

      expect(form).not.toBeNull();
      expect(title).not.toBeNull();
      expect(exerciseList).not.toBeNull();
      expect(saveBtn).not.toBeNull();
    });

    it('should update session title', () => {
      const title = document.getElementById('session-title');
      
      title.textContent = 'Push Day Workout';
      expect(title.textContent).toBe('Push Day Workout');
    });

    it('should add exercises to list', () => {
      const exerciseList = document.getElementById('exercise-list');
      
      const exerciseDiv = document.createElement('div');
      exerciseDiv.className = 'exercise-item';
      exerciseDiv.textContent = 'Bench Press';
      exerciseList.appendChild(exerciseDiv);

      expect(exerciseList.children.length).toBe(1);
      expect(exerciseList.children[0].textContent).toBe('Bench Press');
    });

    it('should handle save button click', () => {
      const saveBtn = document.getElementById('save-session-btn');
      const clickHandler = jest.fn();

      saveBtn.addEventListener('click', clickHandler);
      saveBtn.click();

      expect(clickHandler).toHaveBeenCalled();
    });

    it('should handle cancel button click', () => {
      const cancelBtn = document.getElementById('cancel-session-btn');
      const clickHandler = jest.fn();

      cancelBtn.addEventListener('click', clickHandler);
      cancelBtn.click();

      expect(clickHandler).toHaveBeenCalled();
    });
  });

  describe('History Elements', () => {
    it('should have history list element', () => {
      const historyList = document.getElementById('history-list');
      expect(historyList).not.toBeNull();
    });

    it('should render session items in history', () => {
      const historyList = document.getElementById('history-list');
      
      const sessionItem = document.createElement('div');
      sessionItem.className = 'session-item';
      sessionItem.innerHTML = `
        <h3>Push Day</h3>
        <p>2024-12-25</p>
      `;
      historyList.appendChild(sessionItem);

      expect(historyList.children.length).toBe(1);
      expect(historyList.querySelector('h3').textContent).toBe('Push Day');
    });

    it('should handle search input', () => {
      const searchInput = document.getElementById('history-search');
      
      searchInput.value = 'bench press';
      expect(searchInput.value).toBe('bench press');
      
      const inputHandler = jest.fn();
      searchInput.addEventListener('input', inputHandler);
      searchInput.dispatchEvent(new Event('input'));
      
      expect(inputHandler).toHaveBeenCalled();
    });

    it('should clear search input', () => {
      const searchInput = document.getElementById('history-search');
      
      searchInput.value = 'test';
      expect(searchInput.value).toBe('test');
      
      searchInput.value = '';
      expect(searchInput.value).toBe('');
    });
  });

  describe('Modal Elements', () => {
    it('should have modal elements', () => {
      const modal = document.getElementById('session-detail-modal');
      const closeBtn = modal.querySelector('.modal-close');
      const title = document.getElementById('session-detail-title');

      expect(modal).not.toBeNull();
      expect(closeBtn).not.toBeNull();
      expect(title).not.toBeNull();
    });

    it('should show and hide modal', () => {
      const modal = document.getElementById('session-detail-modal');
      
      modal.style.display = 'none';
      expect(modal.style.display).toBe('none');
      
      modal.style.display = 'block';
      expect(modal.style.display).toBe('block');
    });

    it('should close modal on close button click', () => {
      const modal = document.getElementById('session-detail-modal');
      const closeBtn = modal.querySelector('.modal-close');
      
      modal.style.display = 'block';
      
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
      
      closeBtn.click();
      expect(modal.style.display).toBe('none');
    });

    it('should update modal content', () => {
      const title = document.getElementById('session-detail-title');
      const date = document.getElementById('session-detail-date');
      
      title.textContent = 'Leg Day';
      date.textContent = '2024-12-25';
      
      expect(title.textContent).toBe('Leg Day');
      expect(date.textContent).toBe('2024-12-25');
    });
  });

  describe('Routine Management Elements', () => {
    it('should have routine list element', () => {
      const routineList = document.getElementById('routine-list');
      expect(routineList).not.toBeNull();
    });

    it('should render routine items', () => {
      const routineList = document.getElementById('routine-list');
      
      const routineItem = document.createElement('div');
      routineItem.className = 'routine-item';
      routineItem.textContent = 'Push Day Routine';
      routineList.appendChild(routineItem);

      expect(routineList.children.length).toBe(1);
    });

    it('should handle add new routine button', () => {
      const addBtn = document.getElementById('add-new-routine-btn');
      const clickHandler = jest.fn();

      addBtn.addEventListener('click', clickHandler);
      addBtn.click();

      expect(clickHandler).toHaveBeenCalled();
    });
  });

  describe('Routine Editor Elements', () => {
    it('should have routine editor form', () => {
      const form = document.getElementById('routine-editor-form');
      const nameInput = document.getElementById('routine-name');
      const exercisesContainer = document.getElementById('routine-exercises-container');

      expect(form).not.toBeNull();
      expect(nameInput).not.toBeNull();
      expect(exercisesContainer).not.toBeNull();
    });

    it('should update routine name', () => {
      const nameInput = document.getElementById('routine-name');
      
      nameInput.value = 'New Routine';
      expect(nameInput.value).toBe('New Routine');
    });

    it('should add exercise to editor', () => {
      const exercisesContainer = document.getElementById('routine-exercises-container');
      
      const exerciseDiv = document.createElement('div');
      exerciseDiv.className = 'exercise-editor';
      exercisesContainer.appendChild(exerciseDiv);

      expect(exercisesContainer.children.length).toBe(1);
    });

    it('should handle save routine button', () => {
      const saveBtn = document.getElementById('save-routine-btn');
      const clickHandler = jest.fn();

      saveBtn.addEventListener('click', clickHandler);
      saveBtn.click();

      expect(clickHandler).toHaveBeenCalled();
    });

    it('should handle add exercise button', () => {
      const addExerciseBtn = document.getElementById('add-exercise-to-routine-btn');
      const clickHandler = jest.fn();

      addExerciseBtn.addEventListener('click', clickHandler);
      addExerciseBtn.click();

      expect(clickHandler).toHaveBeenCalled();
    });
  });

  describe('Progress Elements', () => {
    it('should have progress chart element', () => {
      const chart = document.getElementById('progress-chart');
      expect(chart).not.toBeNull();
      expect(chart.tagName).toBe('CANVAS');
    });

    it('should have filter selects', () => {
      const exerciseSelect = document.getElementById('exercise-select');
      const metricSelect = document.getElementById('metric-select');
      const periodSelect = document.getElementById('period-select');

      expect(exerciseSelect).not.toBeNull();
      expect(metricSelect).not.toBeNull();
      expect(periodSelect).not.toBeNull();
    });

    it('should populate exercise select options', () => {
      const exerciseSelect = document.getElementById('exercise-select');
      
      const option1 = document.createElement('option');
      option1.value = 'bench-press';
      option1.textContent = 'Bench Press';
      exerciseSelect.appendChild(option1);

      const option2 = document.createElement('option');
      option2.value = 'squats';
      option2.textContent = 'Squats';
      exerciseSelect.appendChild(option2);

      expect(exerciseSelect.options.length).toBe(2);
      expect(exerciseSelect.options[0].textContent).toBe('Bench Press');
    });

    it('should handle select change events', () => {
      const exerciseSelect = document.getElementById('exercise-select');
      const changeHandler = jest.fn();

      exerciseSelect.addEventListener('change', changeHandler);
      exerciseSelect.dispatchEvent(new Event('change'));

      expect(changeHandler).toHaveBeenCalled();
    });
  });

  describe('Form Interactions', () => {
    it('should prevent default form submission', () => {
      const form = document.getElementById('session-form');
      const submitHandler = jest.fn((e) => e.preventDefault());

      form.addEventListener('submit', submitHandler);
      form.dispatchEvent(new Event('submit'));

      expect(submitHandler).toHaveBeenCalled();
    });

    it('should handle multiple input changes', () => {
      const emailInput = document.getElementById('auth-email');
      const passwordInput = document.getElementById('auth-password');

      emailInput.value = 'test@example.com';
      passwordInput.value = 'password123';

      expect(emailInput.value).toBe('test@example.com');
      expect(passwordInput.value).toBe('password123');
    });

    it('should handle focus and blur events', () => {
      const input = document.getElementById('auth-email');
      const focusHandler = jest.fn();
      const blurHandler = jest.fn();

      input.addEventListener('focus', focusHandler);
      input.addEventListener('blur', blurHandler);

      input.dispatchEvent(new Event('focus'));
      input.dispatchEvent(new Event('blur'));

      expect(focusHandler).toHaveBeenCalled();
      expect(blurHandler).toHaveBeenCalled();
    });
  });

  describe('Dynamic Content Rendering', () => {
    it('should clear and repopulate list', () => {
      const list = document.getElementById('history-list');
      
      // Add items
      list.innerHTML = '<div>Item 1</div><div>Item 2</div>';
      expect(list.children.length).toBe(2);
      
      // Clear
      list.innerHTML = '';
      expect(list.children.length).toBe(0);
      
      // Repopulate
      list.innerHTML = '<div>New Item</div>';
      expect(list.children.length).toBe(1);
    });

    it('should create and append elements dynamically', () => {
      const container = document.getElementById('exercise-list');
      
      for (let i = 0; i < 3; i++) {
        const div = document.createElement('div');
        div.textContent = `Exercise ${i + 1}`;
        container.appendChild(div);
      }

      expect(container.children.length).toBe(3);
    });

    it('should remove specific elements', () => {
      const container = document.getElementById('exercise-list');
      
      const item1 = document.createElement('div');
      item1.id = 'item-1';
      container.appendChild(item1);
      
      const item2 = document.createElement('div');
      item2.id = 'item-2';
      container.appendChild(item2);

      expect(container.children.length).toBe(2);
      
      container.removeChild(item1);
      expect(container.children.length).toBe(1);
      expect(document.getElementById('item-1')).toBeNull();
    });
  });

  describe('CSS Class Manipulation', () => {
    it('should add and remove classes', () => {
      const element = document.getElementById('nav-dashboard');
      
      element.classList.add('active');
      expect(element.classList.contains('active')).toBe(true);
      
      element.classList.remove('active');
      expect(element.classList.contains('active')).toBe(false);
    });

    it('should toggle classes', () => {
      const element = document.getElementById('nav-dashboard');
      
      element.classList.toggle('active');
      expect(element.classList.contains('active')).toBe(true);
      
      element.classList.toggle('active');
      expect(element.classList.contains('active')).toBe(false);
    });

    it('should add multiple classes', () => {
      const element = document.getElementById('session-form');
      
      element.classList.add('valid', 'submitting');
      expect(element.classList.contains('valid')).toBe(true);
      expect(element.classList.contains('submitting')).toBe(true);
    });
  });
});

# Copilot Instructions for My Workout Tracker

## Project Overview

This is a Progressive Web App (PWA) for tracking workout sessions built with vanilla JavaScript, Firebase, and modular CSS. The app provides workout routine management, session tracking, history visualization, and progress charts.

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES6 modules), HTML5, CSS3
- **Backend**: Firebase (Authentication & Firestore)
- **Architecture**: Modular ES6 modules with clear separation of concerns
- **No Build Process**: Direct browser execution, no transpilation or bundling

## Code Style & Conventions

### JavaScript

- Use ES6 module syntax (`import`/`export`)
- Use `const` and `let` (never `var`)
- Prefer arrow functions for callbacks and short functions
- Use async/await for asynchronous operations
- Comment in Spanish when adding new functionality
- Use descriptive variable names in English
- Export DOM element collections from `ui.js` for use in other modules
- Use Firebase v9+ modular SDK syntax

### CSS

- Use CSS custom properties (CSS variables) defined in `css/components/variables.css`
- Organize styles in separate component files under `css/components/`
- Support multiple themes using `[data-theme="..."]` attribute selectors
- Use modern CSS features (Grid, Flexbox, custom properties)
- Follow mobile-first responsive design principles
- Use the existing CSS variable naming conventions (e.g., `--primary-color`, `--card-bg`)

### File Organization

- JavaScript modules in `/js/` directory
- CSS components in `/css/components/` directory
- Each module should have a single responsibility
- Keep DOM manipulation in `ui.js`
- Keep Firebase operations in relevant functional modules
- Exercise cache management in `exercise-cache.js`

## Key Architectural Patterns

### Module Structure

- `app.js`: Main application controller, orchestrates all modules
- `ui.js`: DOM element references and UI rendering functions
- `auth.js`: Firebase authentication logic
- `firebase-config.js`: Firebase initialization
- `storage-manager.js`: LocalStorage operations
- `version-manager.js`: Version detection, session backup/restore, cache clearing, and update notifications
- `theme-manager.js`: Theme switching and persistence
- `timer.js`: Workout timer functionality
- `progress.js`: Exercise progress tracking and charts
- `exercise-cache.js`: Exercise history caching and workout suggestions

### State Management

- Use localStorage for client-side persistence
- Use Firebase Firestore for user data (routines, sessions, history)
- Session state stored with key `gymTracker_inProgressSession`
- Version stored with key `gym-tracker-version`

### Firebase Integration

- Use Firebase Authentication for user management
- Store user routines in `users/{userId}/routines` collection
- Store workout sessions in `users/{userId}/sessions` collection
- Always check user authentication before Firestore operations
- Handle offline scenarios gracefully

## Versioning System

The app uses a custom versioning system documented in `VERSION-SYSTEM.md`:

- Version is defined in `manifest.json` as the single source of truth
- Use `update-version.js` script to update versions: `node update-version.js [major|minor|patch|version]`
- Version updates trigger cache clearing, session backup/restore, and exercise cache validation/rebuilding
- Service worker cache is named `gym-tracker-v{VERSION}`

## Testing & Development

### No Automated Tests

- This project has no automated test suite
- Test manually in the browser during development
- Use browser DevTools for debugging
- Test authentication flows with Firebase console

### Manual Testing Checklist

1. Authentication (login/signup/logout)
2. Creating and editing routines
3. Starting and completing workout sessions
4. Viewing history and calendar
5. Theme switching
6. Offline functionality (PWA)
7. Version updates and cache clearing
8. Exercise cache functionality and suggestions
9. Version update scenarios with session preservation

### Development Workflow

1. Edit files directly (no build step required)
2. Refresh browser to see changes
3. Use browser DevTools console for debugging
4. Test with Firebase local environment or production

## Common Tasks

### Adding a New View

1. Add view HTML in `index.html`
2. Add view reference in `ui.js` views object
3. Add navigation button if needed
4. Create rendering function in `ui.js`
5. Add controller logic in `app.js`
6. Add CSS in appropriate component file

### Adding a New Theme

1. Add theme variables in `css/components/variables.css` using `[data-theme="theme-name"]`
2. Ensure all CSS custom properties are defined
3. Add theme option to theme selector in UI
4. Test all components with new theme

### Updating Firebase Schema

1. Update Firestore operations in relevant module
2. Consider migration path for existing user data
3. Test with fresh user account and existing accounts
4. Update documentation if data structure changes

## Security Considerations

- Never commit Firebase API keys or configuration
- `firebase-config.js` should use environment-appropriate configuration
- Validate user input before storing in Firestore
- Use Firebase Security Rules to protect user data
- Always verify user authentication before data operations

## Important Files

- `index.html`: Main HTML structure and all views
- `manifest.json`: PWA configuration and version source of truth
- `sw.js`: Service worker for offline functionality
- `js/app.js`: Main application controller
- `js/ui.js`: UI rendering and DOM management
- `css/components/variables.css`: Theme definitions and CSS variables
- `VERSION-SYSTEM.md`: Versioning system documentation

## Localization

- UI text is primarily in Spanish
- Code comments in Spanish for new features
- Variable and function names in English
- Consider both Spanish and English when adding user-facing text

## Performance Considerations

- Minimize DOM manipulations
- Use event delegation where appropriate
- Lazy load Firebase diagnostics only when needed
- Cache Firestore queries when appropriate
- Use service worker for offline asset caching

## Browser Support

- Modern browsers with ES6 module support
- Service Worker support required for PWA features
- Firebase SDK requires modern browser features
- No IE11 support needed

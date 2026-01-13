/**
 * Scroll-to-top button module
 * Creates and manages a floating button that scrolls to the top of the page
 */

import { logger } from '../utils/logger.js';

let scrollToTopBtn = null;
let isInitialized = false;

/**
 * Creates the scroll-to-top button and appends it to the document
 */
function createButton() {
    if (scrollToTopBtn) {
        return scrollToTopBtn;
    }

    scrollToTopBtn = document.createElement('button');
    scrollToTopBtn.id = 'scroll-to-top-btn';
    scrollToTopBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 15l-6-6-6 6"/></svg>';
    scrollToTopBtn.setAttribute('aria-label', 'Volver arriba');
    scrollToTopBtn.title = 'Volver arriba';
    
    document.body.appendChild(scrollToTopBtn);
    
    return scrollToTopBtn;
}

/**
 * Shows or hides the scroll-to-top button based on scroll position
 */
function toggleScrollToTopBtn() {
    if (!scrollToTopBtn) return;
    
    // Show the button when user has scrolled down 200px or more
    if (window.scrollY > 200) {
        scrollToTopBtn.classList.add('visible');
    } else {
        scrollToTopBtn.classList.remove('visible');
    }
}

/**
 * Scrolls to the top of the page with smooth animation
 */
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}

/**
 * Initializes the scroll-to-top functionality
 * Creates the button and sets up event listeners
 */
export function initScrollToTop() {
    if (isInitialized) {
        logger.debug('Scroll-to-top already initialized');
        return;
    }

    // Create the button
    createButton();

    // Add click event to scroll to top
    scrollToTopBtn.addEventListener('click', scrollToTop);

    // Add scroll event to show/hide the button
    window.addEventListener('scroll', toggleScrollToTopBtn, { passive: true });

    // Initial check for button visibility
    toggleScrollToTopBtn();

    isInitialized = true;
    logger.debug('Scroll-to-top initialized');
}

/**
 * Cleans up scroll-to-top functionality
 * Removes button and event listeners
 */
export function destroyScrollToTop() {
    if (!isInitialized) return;

    window.removeEventListener('scroll', toggleScrollToTopBtn);
    
    if (scrollToTopBtn && scrollToTopBtn.parentNode) {
        scrollToTopBtn.parentNode.removeChild(scrollToTopBtn);
    }
    
    scrollToTopBtn = null;
    isInitialized = false;
    
    logger.debug('Scroll-to-top destroyed');
}

export default {
    init: initScrollToTop,
    destroy: destroyScrollToTop
};

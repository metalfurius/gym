// This is a diagnostic script to help identify blocked resources
// You can add this temporarily to your app.js or include it as a separate script

import { logger } from './utils/logger.js';

function checkFirebaseConnection() {
    logger.info('Checking Firebase connectivity...');
    
    // Simple fetch test to see if Firebase resources are blocked
    fetch('https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test: true }),
    })
    .then(response => {
        logger.info('Firebase connection test result:', response.status, response.statusText);
        if (response.status === 200) {
            logger.info('Firebase connection appears to be working.');
        } else {
            logger.warn('Firebase connection returned non-200 status:', response.status);
        }
    })
    .catch(error => {
        logger.error('Firebase connection test failed:', error);
        if (error.message && error.message.includes('ERR_BLOCKED_BY_CLIENT')) {
            logger.warn('Firebase connections appear to be blocked by a browser extension or content blocker.');
            // Add notification to user here
            const notificationContainer = document.createElement('div');
            notificationContainer.style.cssText = 'position:fixed; top:0; left:0; right:0; background-color:#fff4e5; border-bottom:1px solid #ff9800; padding:10px; text-align:center; z-index:9999;';
            notificationContainer.innerHTML = `
                <p>Detectamos que algunas conexiones están siendo bloqueadas. 
                Esto puede afectar el funcionamiento de la aplicación. Por favor, 
                considera deshabilitar bloqueadores de anuncios o contenido para este sitio.</p>
                <button style="background:#ff9800; border:none; color:white; padding:5px 10px; cursor:pointer; border-radius:3px;" 
                 onclick="this.parentNode.remove()">Entendido</button>
            `;
            document.body.prepend(notificationContainer);
        }
    });
}

// Run the check after the page has loaded
window.addEventListener('load', () => {
    // Wait a moment to not interfere with initial page load
    setTimeout(checkFirebaseConnection, 3000);
});

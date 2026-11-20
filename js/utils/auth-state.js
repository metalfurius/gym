// Read-only consumers can observe auth without importing the UI/bootstrap graph.
let currentUser = null;

export function getCurrentUser() { return currentUser; }
export function setCurrentUser(user) { currentUser = user || null; }

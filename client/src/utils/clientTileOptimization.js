/**
 * Client-side functions for tile optimization
 * These utility functions help reduce bandwidth and processing
 * by tracking which tiles the client has already seen.
 */

/**
 * Generates or retrieves a persistent client ID for tile tracking
 * @returns {string} Unique client identifier
 */
export function getClientId() {
  let clientId = localStorage.getItem('birdMapClientId');
  
  if (!clientId) {
    // Generate a new client ID if one doesn't exist
    clientId = `client_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    localStorage.setItem('birdMapClientId', clientId);
    console.log('Generated new bird map client ID');
  }
  
  return clientId;
}

/**
 * Appends client ID to a viewport URL
 * @param {string} baseUrl - The base viewport URL without clientId
 * @returns {string} URL with clientId parameter added
 */
export function appendClientId(baseUrl) {
  const clientId = getClientId();
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}clientId=${clientId}`;
}

/**
 * Resets the client ID (useful for debugging)
 * This will cause the server to send all tiles on the next request
 */
export function resetClientId() {
  localStorage.removeItem('birdMapClientId');
  console.log('Client ID reset. Will generate new ID on next fetch.');
}
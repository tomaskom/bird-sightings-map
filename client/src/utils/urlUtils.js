/**
 * Copyright (C) 2025 Michelle Tomasko
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 *
 * Project: bird-sightings-map
 * Description: Utilities for managing URL parameters in both standalone 
 * and embedded contexts. Handles parameter parsing, updates, and cross-frame 
 * communication for map state.
 * 
 * Key Features:
 * - Supports both direct URL manipulation and iframe message passing
 * - Handles map coordinates, zoom level, time range, and sighting type filters
 * - Includes fallback mechanisms and timeout handling for iframe communicationDescription: UI notification components for map interactions
 * 
 * Dependencies: same as BirdMap.jsx
 */

import { debug } from './debug';

/**
 * Gets map parameters from URL or parent frame
 * @returns {Promise<Object>} Map parameters (lat, lng, zoom, back, type)
 */
export const getMapParamsFromUrl = () => {
  return new Promise((resolve) => {
    // Check if we're in an iframe
    const isInIframe = window !== window.parent;

    // Santa Cruz coordinates and default view settings
    const defaultParams = {
      lat: 36.9741,
      lng: -122.0308,
      zoom: 12,
      back: '7',
      sightingType: 'recent'
    };

    // Handle standalone mode
    if (!isInIframe) {
      try {
        const params = new URLSearchParams(window.location.search);
        debug.debug('Parsing URL parameters directly:', Object.fromEntries(params));
        resolve({
          lat: parseFloat(params.get('lat')) || defaultParams.lat,
          lng: parseFloat(params.get('lng')) || defaultParams.lng,
          zoom: parseInt(params.get('zoom')) || defaultParams.zoom,
          back: params.get('back') || defaultParams.back,
          sightingType: params.get('type') || defaultParams.sightingType
        });
      } catch(error) {
        debug.error('Error parsing URL parameters:', error);
        resolve(defaultParams);
      }
      return;
    }

    // Handle embedded mode with parent frame communication
    let isResolved = false;
    const handleMessage = (event) => {
      debug.debug('Received message from parent:', event.origin, event.data);
      // Only accept messages from the authorized parent domain
      if (event.origin === 'https://www.michellestuff.com') {
        window.removeEventListener('message', handleMessage);
        if (isResolved) return;
        isResolved = true;
        try {
          const params = new URLSearchParams(event.data);
          debug.debug('Parsed iframe params:', Object.fromEntries(params));
          resolve({
            lat: parseFloat(params.get('lat')) || defaultParams.lat,
            lng: parseFloat(params.get('lng')) || defaultParams.lng,
            zoom: parseInt(params.get('zoom')) || defaultParams.zoom,
            back: params.get('back') || defaultParams.back,
            sightingType: params.get('type') || defaultParams.sightingType
          });
        } catch(error) {
          debug.error('Error parsing URL parameters from iframe:', error);
          resolve(defaultParams);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    debug.debug('Sending getUrlParams message to parent');
    window.parent.postMessage('getUrlParams', '*');

    // Fallback to defaults if parent frame doesn't respond
    setTimeout(() => {
      if (isResolved) return;
      isResolved = true;
      debug.debug('Timeout reached, using defaults');
      window.removeEventListener('message', handleMessage);
      resolve(defaultParams);
    }, 500);
  });
};

/**
 * Updates URL parameters in browser or notifies parent frame
 * @param {Object} params Parameters to update (lat, lng, zoom, back, type)
 */
export const updateUrlParams = (params) => {
  try {
    const isInIframe = window !== window.parent;

    if (!isInIframe) {
      // Update URL directly in standalone mode
      const url = new URL(window.location.href);
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          // Round coordinates to 6 decimal places for consistency
          let paramValue = (key === 'lat' || key === 'lng') 
            ? parseFloat(value.toFixed(6)) 
            : value.toString();
          url.searchParams.set(key, paramValue);
        }
      });
      debug.debug('Updating URL params directly:', Object.fromEntries(url.searchParams));
      window.history.pushState({ path: url.href }, '', url.toString());
      return;
    }

    // Format and send parameters to parent in embedded mode
    const formattedParams = {};
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) {
        if (key === 'lat' || key === 'lng') {
          formattedParams[key] = parseFloat(value.toFixed(6));
        } else {
          formattedParams[key] = value;
        }
      }
    });
    
    debug.debug('Sending parameters to parent:', formattedParams);
    window.parent.postMessage({
      type: 'updateUrlParams',
      params: formattedParams
    }, 'https://www.michellestuff.com');
  } catch (error) {
    debug.error('Error sending parameters to parent:', error);
  }
};

/**
 * Converts a params object to a URL search string
 * @param {Object} params Parameters to serialize
 * @returns {string} URL-encoded parameter string
 */
export const constructSearchParams = (params) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      searchParams.set(key, value.toString());
    }
  });
  return searchParams.toString();
};
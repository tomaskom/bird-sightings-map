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
* Description: Map utility functions for handling markers, icons, viewport
* calculations, and geographic computations.
*
* Dependencies: leaflet, debug.js
*/

import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { debug } from './debug';

/**
 * Default Leaflet icon configuration for single bird sightings
 * @type {L.Icon}
 */
export const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

/**
 * Custom div icon for locations with multiple bird sightings
 * @type {L.DivIcon}
 */
export const MultipleIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #3B82F6; color: white; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border: 2px solid white;">+</div>`,
  iconSize: [30, 30],
  iconAnchor: [15, 15]
});

/**
 * Sets the default marker icon for Leaflet
 */
export const initializeMapIcons = () => {
  debug.debug('Initializing map icons');
  L.Marker.prototype.options.icon = DefaultIcon;
};

/**
 * Cache for country data including bounds and last fetch time
 * @type {Map<string, {bounds: Object, timestamp: number}>}
 */
const countryCache = new Map();

/**
 * Time-to-live for cached country data (7 days)
 * @type {number}
 */
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

/**
 * Rate limiter for Nominatim API calls (1 request per second)
 * @type {number}
 */
let lastNominatimCall = 0;

/**
 * Ensures minimum delay between Nominatim API calls
 * @returns {Promise<void>}
 */
const respectRateLimit = async () => {
  const now = Date.now();
  const timeSinceLastCall = now - lastNominatimCall;
  if (timeSinceLastCall < 1000) {
    await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLastCall));
  }
  lastNominatimCall = Date.now();
};

/**
 * Get country code and bounds for a location
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<{countryCode: string, bounds: Object}>} Country information
 */
export const getCountryInfo = async (lat, lng) => {
  debug.debug('Getting country info for coordinates:', { lat, lng });
  
  await respectRateLimit();
  
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?` +
      `format=json&lat=${lat}&lon=${lng}`,
      {
        headers: {
          'User-Agent': 'BirdSightingsMap/1.0'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    debug.debug('Nominatim response:', data);

    if (!data.address?.country_code) {
      throw new Error('No country code in response');
    }

    return {
      countryCode: data.address.country_code.toUpperCase(),
      bounds: data.boundingbox ? {
        minX: parseFloat(data.boundingbox[2]),
        maxX: parseFloat(data.boundingbox[3]),
        minY: parseFloat(data.boundingbox[0]),
        maxY: parseFloat(data.boundingbox[1])
      } : null
    };
  } catch (error) {
    debug.error('Error getting country info:', error);
    throw error;
  }
};

/**
 * Checks if a point is within a bounding box
 * @param {number} lat - Latitude to check
 * @param {number} lng - Longitude to check
 * @param {Object} bounds - Bounding box to check against
 * @returns {boolean} Whether the point is within the bounds
 */
export const isWithinBounds = (lat, lng, bounds) => {
  if (!bounds) return false;
  
  return lat >= bounds.minY && 
         lat <= bounds.maxY && 
         lng >= bounds.minX && 
         lng <= bounds.maxX;
};

/**
 * Gets cached country data if available and not expired
 * @param {string} countryCode - ISO country code
 * @returns {Object|null} Cached country data or null if not available
 */
export const getCachedCountry = (countryCode) => {
  const cached = countryCache.get(countryCode);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    debug.debug('Using cached country data for:', countryCode);
    return cached;
  }
  return null;
};

/**
 * Updates the country cache with new data
 * @param {string} countryCode - ISO country code
 * @param {Object} bounds - Country boundary data
 */
export const updateCountryCache = (countryCode, bounds) => {
  debug.debug('Updating country cache for:', countryCode);
  countryCache.set(countryCode, {
    bounds,
    timestamp: Date.now()
  });
};

/**
 * Calculates the appropriate radius based on current viewport bounds
 * @param {L.LatLngBounds} bounds - Current map viewport bounds
 * @returns {number} Calculated radius in kilometers, capped at 25km
 */
export const calculateViewportRadius = (bounds) => {
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
         
  const xDistance = calculateDistance(ne.lat, ne.lng, ne.lat, sw.lng);
  const yDistance = calculateDistance(ne.lat, ne.lng, sw.lat, ne.lng);
  const currentRadius = Math.min(Math.max(xDistance, yDistance) / 2, 25);
      
  debug.debug('Calculated viewport distances:', { 
    xDistance, 
    yDistance, 
    currentRadius 
  });

  return currentRadius;
};

/**
 * Determines if new data should be fetched based on map movement and parameter changes
 * @param {Object} lastFetchParams - Previous fetch parameters
 * @param {Object} currentParams - Current fetch parameters
 * @param {Object} lastFetchLocation - Previous fetch location coordinates
 * @param {Object} currentLocation - Current location coordinates
 * @returns {boolean} Whether new data should be fetched
 */
export const shouldFetchNewData = (
  lastFetchParams,
  currentParams,
  lastFetchLocation,
  currentLocation
) => {
  // If no previous fetch, always fetch
  if (!lastFetchParams) {
    debug.debug('No previous fetch params, fetching data');
    return true;
  }

  // Check if core parameters changed
  const paramsChanged = 
    lastFetchParams.back !== currentParams.back || 
    lastFetchParams.species !== currentParams.species ||
    lastFetchParams.country !== currentParams.country;

  if (paramsChanged) {
    debug.debug('Fetch parameters changed:', {
      oldParams: lastFetchParams,
      newParams: currentParams
    });
    return true;
  }

  // Check if radius changed significantly
  const radiusChanged = Math.abs(lastFetchParams.radius - currentParams.radius) > 1;
  if (radiusChanged) {
    debug.debug('Viewport radius changed significantly');
    return true;
  }

  // Check distance moved if we have previous location
  if (lastFetchLocation) {
    const distance = calculateDistance(
      lastFetchLocation.lat,
      lastFetchLocation.lng,
      currentLocation.lat,
      currentLocation.lng
    );
    const sensitivityThreshold = currentParams.radius * 0.80;
    
    debug.debug('Checking movement threshold:', {
      distance,
      sensitivityThreshold,
      shouldFetch: distance >= sensitivityThreshold
    });
    
    return distance >= sensitivityThreshold;
  }

  return true;
};

/**
 * Formats coordinates to fixed precision
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Object} Formatted coordinates with 4 decimal places
 */
export const formatCoordinates = (lat, lng) => ({
  lat: Number(lat.toFixed(4)),
  lng: Number(lng.toFixed(4))
});

/**
 * Calculates the distance between two geographic coordinates using the Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Export cache for testing
export const _countryCache = countryCache;
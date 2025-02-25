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
 * Description: Utility functions for region detection, boundary checking,
 * and managing region-specific data.
 */

import { debug } from './debug';
import { fetchLocationDetails } from './dataUtils';
// Import the region boundaries - we'll update the path after the script is run
import { REGION_BOUNDARIES } from '../../data/regionBoundaries.js';

// Cache for region boundaries with longer TTL (30 days)
// Used as fallback when region isn't in pre-loaded data
const boundaryCache = new Map();
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

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
 * Gets cached region for coordinates if available
 * @param {string} countryCode - ISO country code
 * @returns {Object|null} Cached region data or null if not available
 */
export const getCachedBoundary = (countryCode) => {
  const cached = boundaryCache.get(countryCode);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    debug.debug('Using cached boundary data for:', countryCode);
    return cached.bounds;
  }
  return null;
};

/**
 * Updates the region boundary cache with new data
 * @param {string} countryCode - ISO country code
 * @param {Object} bounds - Country boundary data
 */
export const updateBoundaryCache = (countryCode, bounds) => {
  debug.debug('Updating boundary cache for:', countryCode);
  boundaryCache.set(countryCode, {
    bounds,
    timestamp: Date.now()
  });
};

/**
 * Finds region and subregion for coordinates using static boundary data
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Object|null} Region information or null if not found
 */
export const findRegionForCoordinates = (lat, lng) => {
  debug.debug('Finding region for coordinates:', { lat, lng });
  
  // Check each country in the static boundary data
  for (const [countryCode, country] of Object.entries(REGION_BOUNDARIES)) {
    if (isWithinBounds(lat, lng, country.bounds)) {
      debug.debug('Found country match:', countryCode);
      
      // Found country, now check subregions
      let matchedSubregion = null;
      
      for (const [subregionCode, subregion] of Object.entries(country.subregions)) {
        if (isWithinBounds(lat, lng, subregion.bounds)) {
          debug.debug('Found subregion match:', subregionCode);
          matchedSubregion = {
            code: subregionCode,
            name: subregion.name
          };
          break;
        }
      }
      
      return {
        country: {
          code: countryCode,
          name: country.name
        },
        subregion: matchedSubregion
      };
    }
  }
  
  debug.debug('No region match found in static boundary data');
  return null;
};

/**
 * Determines region for coordinates with fallback to API
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<Object>} Region information
 */
export const getRegionForCoordinates = async (lat, lng) => {
  // First try to find region in static boundary data
  const regionMatch = findRegionForCoordinates(lat, lng);
  
  if (regionMatch) {
    debug.info('Found region in static boundary data:', regionMatch);
    return regionMatch;
  }
  
  // If not found, fall back to Nominatim via fetchLocationDetails
  debug.debug('No static region match, falling back to Nominatim');
  try {
    const locationDetails = await fetchLocationDetails(lat, lng);
    
    if (locationDetails.countryCode) {
      debug.info('Got country from Nominatim:', locationDetails.countryCode);
      
      // Update cache with bounds from Nominatim if available
      if (locationDetails.bounds) {
        updateBoundaryCache(locationDetails.countryCode, locationDetails.bounds);
      }
      
      return {
        country: {
          code: locationDetails.countryCode,
          name: locationDetails.address?.country || locationDetails.countryCode
        },
        subregion: null // Nominatim doesn't reliably provide eBird subregion codes
      };
    }
  } catch (error) {
    debug.error('Error getting location details:', error);
  }
  
  debug.warn('Could not determine region for coordinates');
  return null;
};
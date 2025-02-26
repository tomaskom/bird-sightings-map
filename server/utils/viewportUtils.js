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
 * Description: Utilities for processing map viewports and calculating parameters
 * 
 * Dependencies: debug.js
 */

const { debug } = require('./debug');

/**
 * Calculates the center point of a viewport
 * @param {Object} viewport - Viewport bounds
 * @returns {Object} Center coordinates {lat, lng}
 */
function calculateViewportCenter(viewport) {
  const centerLat = (parseFloat(viewport.minLat) + parseFloat(viewport.maxLat)) / 2;
  const centerLng = (parseFloat(viewport.minLng) + parseFloat(viewport.maxLng)) / 2;
  
  debug.debug('Calculated viewport center:', { lat: centerLat, lng: centerLng });
  return { lat: centerLat, lng: centerLng };
}

/**
 * Calculates the appropriate radius in km to cover the viewport
 * Uses the Haversine formula to calculate distance
 * @param {Object} viewport - Viewport bounds
 * @returns {number} Radius in kilometers
 */
function calculateViewportRadius(viewport) {
  const center = calculateViewportCenter(viewport);
  
  // Earth's radius in kilometers
  const R = 6371;
  
  // Calculate distances to all four corners
  const distances = [
    haversineDistance(center.lat, center.lng, parseFloat(viewport.minLat), parseFloat(viewport.minLng), R),
    haversineDistance(center.lat, center.lng, parseFloat(viewport.minLat), parseFloat(viewport.maxLng), R),
    haversineDistance(center.lat, center.lng, parseFloat(viewport.maxLat), parseFloat(viewport.minLng), R),
    haversineDistance(center.lat, center.lng, parseFloat(viewport.maxLat), parseFloat(viewport.maxLng), R)
  ];
  
  // Use the maximum distance as radius, add a small buffer
  const radius = Math.max(...distances) * 1.05;
  debug.debug(`Calculated viewport radius: ${radius.toFixed(2)}km`);
  
  // Cap at 25km to avoid excessive data
  return Math.min(radius, 25);
}

/**
 * Calculates distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of first point
 * @param {number} lng1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lng2 - Longitude of second point
 * @param {number} r - Earth's radius
 * @returns {number} Distance in same units as radius
 */
function haversineDistance(lat1, lng1, lat2, lng2, r) {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLng/2) * Math.sin(dLng/2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return r * c;
}

/**
 * Validates viewport parameters
 * @param {Object} viewport - Viewport parameters
 * @returns {boolean} True if valid, false otherwise 
 */
function isValidViewport(viewport) {
  if (!viewport) return false;
  
  // Check if all required parameters exist
  const requiredParams = ['minLat', 'maxLat', 'minLng', 'maxLng'];
  for (const param of requiredParams) {
    if (viewport[param] === undefined || viewport[param] === null) {
      debug.debug(`Invalid viewport: missing ${param}`);
      return false;
    }
  }
  
  // Convert to numbers and check if they're valid
  const minLat = parseFloat(viewport.minLat);
  const maxLat = parseFloat(viewport.maxLat);
  const minLng = parseFloat(viewport.minLng);
  const maxLng = parseFloat(viewport.maxLng);
  
  if (isNaN(minLat) || isNaN(maxLat) || isNaN(minLng) || isNaN(maxLng)) {
    debug.debug('Invalid viewport: coordinates are not numbers');
    return false;
  }
  
  // Check if latitude is within valid range (-90 to 90)
  if (minLat < -90 || maxLat > 90) {
    debug.debug('Invalid viewport: latitude out of range');
    return false;
  }
  
  // Check if longitude is within valid range (-180 to 180)
  if (minLng < -180 || maxLng > 180) {
    debug.debug('Invalid viewport: longitude out of range');
    return false;
  }
  
  // Check if min is less than max
  if (minLat > maxLat || minLng > maxLng) {
    debug.debug('Invalid viewport: min greater than max');
    return false;
  }
  
  return true;
}

module.exports = {
  calculateViewportCenter,
  calculateViewportRadius,
  haversineDistance,
  isValidViewport
};
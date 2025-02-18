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
* calculations, and geographic distance computations.
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
  html: `
    <div style="
      background-color: #3B82F6; 
      color: white; 
      border-radius: 50%; 
      width: 30px; 
      height: 30px; 
      display: flex; 
      align-items: center; 
      justify-content: center; 
      border: 2px solid white;
    ">+</div>
  `,
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
  const paramsChanged = !lastFetchParams || 
    lastFetchParams.back !== currentParams.back || 
    lastFetchParams.sightingType !== currentParams.sightingType;

  const radiusChanged = lastFetchParams && 
    Math.abs(lastFetchParams.radius - currentParams.radius) > 1;

  if (paramsChanged || radiusChanged) {
    return true;
  }

  if (lastFetchLocation) {
    const distance = calculateDistance(
      lastFetchLocation.lat,
      lastFetchLocation.lng,
      currentLocation.lat,
      currentLocation.lng
    );
    const sensitivityThreshold = currentParams.radius * 0.80;
    
    debug.debug('Checking fetch threshold:', {
      distance,
      sensitivityThreshold,
      shouldSkip: distance < sensitivityThreshold
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
  const distance = R * c;
  
  debug.debug('Calculated distance:', { 
    from: { lat1, lon1 }, 
    to: { lat2, lon2 }, 
    distance 
  });
  
  return distance;
};

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
 * Description: UI notification components for map interactions
 * 
 * Dependencies: same as BirdMap.jsx
 */
import L from 'leaflet';
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';
import { debug } from './debug';

// Icon for single bird sightings
export const DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

// Create a special icon for locations with multiple birds
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

// Initialize map icons
export const initializeMapIcons = () => {
  debug.debug('Initializing map icons');
  L.Marker.prototype.options.icon = DefaultIcon;
};

// Calculate viewport distances and radius
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

// Check if we should fetch new data based on movement and parameters
export const shouldFetchNewData = (
  lastFetchParams,
  currentParams,
  lastFetchLocation,
  currentLocation
) => {
  // Check if parameters have changed
  const paramsChanged = !lastFetchParams || 
    lastFetchParams.back !== currentParams.back || 
    lastFetchParams.sightingType !== currentParams.sightingType;

  // Check if radius has changed significantly (more than 1 km)
  const radiusChanged = lastFetchParams && 
    Math.abs(lastFetchParams.radius - currentParams.radius) > 1;

  // If basic params changed, we should fetch
  if (paramsChanged || radiusChanged) {
    return true;
  }

  // Check if we should skip fetching based on distance
  if (lastFetchLocation) {
    const distance = calculateDistance(
      lastFetchLocation.lat,
      lastFetchLocation.lng,
      currentLocation.lat,
      currentLocation.lng
    );
    // Calculate sensitivity threshold as 80% of current viewport radius
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

// Format coordinates to fixed precision
export const formatCoordinates = (lat, lng) => ({
  lat: Number(lat.toFixed(4)),
  lng: Number(lng.toFixed(4))
});


// Calculate distance between two geographic coordinates
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

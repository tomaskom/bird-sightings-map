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
* Description: Data processing utilities for bird sightings, handling API
* interactions, photo fetching, and location-based data grouping.
* 
* Dependencies: lodash, debug.js
*/

import _ from 'lodash';
import { debug } from './debug';


/**
 * Fetches bird photos from the BirdWeather API for given species
 * @param {string[]} uniqueSpecies - Array of unique species identifiers
 * @returns {Promise<Object>} Object mapping species to their photo URLs
 */
export const fetchBirdPhotos = async (uniqueSpecies) => {
  try {
    const photoResponse = await fetch('https://app.birdweather.com/api/v1/species/lookup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        species: uniqueSpecies,
        fields: ['imageUrl', 'thumbnailUrl']
      })
    });
    
    if (photoResponse.ok) {
      const photoData = await photoResponse.json();
      debug.debug('Retrieved photos for species:', Object.keys(photoData.species).length);
      return photoData.species;
    }
    return {};
  } catch (error) {
    debug.error('Error fetching species photos:', error);
    return {};
  }
};

/**
 * Processes raw bird sightings data and groups it by location
 * @param {Object[]} sightings - Array of raw bird sighting records
 * @returns {Object[]} Array of location objects with grouped bird sightings
 */
export const processBirdSightings = async (sightings) => {
  const validSightings = sightings.filter(sighting => sighting.obsValid === true);
  const groupedByLocation = _.groupBy(validSightings, sighting => 
    `${sighting.lat},${sighting.lng}`
  );

  debug.debug('Processing sightings:', { 
    total: sightings.length,
    valid: validSightings.length,
    locations: Object.keys(groupedByLocation).length
  });

  // Extract unique species for photo fetching
  const uniqueSpecies = [...new Set(validSightings
    .map(sighting => `${sighting.sciName}_${sighting.comName}`))];
  
  // Fetch photos for all species in one batch
  const speciesPhotos = await fetchBirdPhotos(uniqueSpecies);

  return Object.entries(groupedByLocation).map(([locationKey, sightings]) => {
    const [lat, lng] = locationKey.split(',').map(Number);
    const birdsBySpecies = _.groupBy(sightings, 'comName');
    
    const birds = Object.entries(birdsBySpecies).map(([comName, speciesSightings]) => {
      const baseData = {
        ...speciesSightings[0],
        subIds: speciesSightings.map(s => s.subId)
      };

      // Add photo URLs if available
      const speciesKey = `${baseData.sciName}_${baseData.comName}`;
      const photoData = speciesPhotos[speciesKey];
      if (photoData) {
        baseData.thumbnailUrl = photoData.thumbnailUrl;
        baseData.fullPhotoUrl = photoData.imageUrl;
      }

      return baseData;
    });
    
    return {
      lat,
      lng,
      birds
    };
  });
};

/**
 * Fetches species list for a specific region from the server
 * @param {string} regionCode - eBird region code (e.g., "US-CA")
 * @returns {Promise<Array<TaxonomyEntry>>} List of species for the region
 */
export const fetchRegionSpecies = async (regionCode) => {
  debug.debug('Fetching species for region:', regionCode);
  
  try {
    const response = await fetch(
      `${import.meta.env.VITE_API_URL}/api/region-species/${regionCode}`
    );

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    debug.debug('Received region species data:', {
      region: regionCode,
      count: data.length
    });

    // Transform to taxonomy entry format
    return data.map(species => ({
      speciesCode: species.speciesCode,
      commonName: species.comName,
      scientificName: species.sciName,
      category: 'species',
      taxonOrder: species.taxonOrder || 0
    }));
  } catch (error) {
    debug.error('Error fetching region species:', error);
    throw error;
  }
};


/**
 * Builds the API URL for fetching bird sightings based on viewport coordinates
 * @param {Object} viewport - Viewport parameters
 * @param {number} viewport.minLat - Minimum latitude
 * @param {number} viewport.maxLat - Maximum latitude
 * @param {number} viewport.minLng - Minimum longitude
 * @param {number} viewport.maxLng - Maximum longitude
 * @param {string} viewport.back - Number of days to look back
 * @returns {string} Formatted API URL with query parameters
 */
export const buildViewportApiUrl = (viewport) => {
  const searchParams = new URLSearchParams({
    minLat: viewport.minLat.toString(),
    maxLat: viewport.maxLat.toString(),
    minLng: viewport.minLng.toString(),
    maxLng: viewport.maxLng.toString(),
    back: viewport.back.toString()
  });

  return `${import.meta.env.VITE_API_URL}/api/birds/viewport?${searchParams}`;
};

/**
 * Builds API URL for forward geocoding
 * @param {string} query - Search query for location
 * @returns {string} Formatted API URL
 */
export const buildForwardGeocodeUrl = (query) => {
  return `${import.meta.env.VITE_API_URL}/api/forward-geocode?q=${encodeURIComponent(query)}`;
};

/**
 * Builds API URL for reverse geocoding
 * @param {number} lat - Latitude coordinate
 * @param {number} lng - Longitude coordinate
 * @returns {string} Formatted API URL
 */
export const buildReverseGeocodeUrl = (lat, lng) => {
  return `${import.meta.env.VITE_API_URL}/api/reverse-geocode?lat=${lat}&lon=${lng}`;
};

/**
* Fetches location details with retry logic
* @param {number} lat - Latitude coordinate
* @param {number} lng - Longitude coordinate
* @param {number} [retries=2] - Number of retries on rate limit
* @returns {Promise<Object>} Location details
*/
export const fetchLocationDetails = async (lat, lng, retries = 2) => {
 debug.debug('Getting country info for coordinates:', { lat, lng });
 
 try {
   const response = await fetch(buildReverseGeocodeUrl(lat, lng));
   
   if (response.status === 429 && retries > 0) {
     debug.debug('Rate limited, retrying after delay...', { retriesLeft: retries });
     await new Promise(resolve => setTimeout(resolve, 1100)); // Wait just over 1 second
     return fetchLocationDetails(lat, lng, retries - 1);
   }
   
   if (!response.ok) {
     throw new Error(`HTTP error! status: ${response.status}`);
   }
   
   const data = await response.json();
 
   if (data.found) {
     return {
       countryCode: data.address.country_code.toUpperCase(),
       bounds: data.boundingbox ? {
         minX: parseFloat(data.boundingbox[2]),
         maxX: parseFloat(data.boundingbox[3]), 
         minY: parseFloat(data.boundingbox[0]),
         maxY: parseFloat(data.boundingbox[1])
       } : null
     };
   }
   
   // Return a default response when location not found
   return {
     countryCode: 'UNKNOWN',
     bounds: null
   };
 } catch (error) {
   debug.error('Error getting country info:', error);
   // Return a default response on error
   return {
     countryCode: 'UNKNOWN',
     bounds: null
   };
 }
};


/**
 * Searches for a location using forward geocoding
 * @param {string} query - Search query
 * @returns {Promise<Object>} Location data
 */
export const searchLocation = async (query) => {
  debug.debug('Searching location:', query);
  
  try {
    const response = await fetch(buildForwardGeocodeUrl(query));
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    debug.error('Error searching location:', error);
    throw error;
  }
};
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


// In-memory cache for bird photos
const photoCache = {
  // Cache data - mapping of species keys to photo data
  data: {},
  
  // Cache expiration times - mapping of species keys to expiration timestamps
  expires: {},
  
  // Cache TTL in milliseconds (24 hours)
  TTL: 24 * 60 * 60 * 1000,
  
  // Get a photo from cache if available and not expired
  get(speciesKey) {
    const now = Date.now();
    if (this.data[speciesKey] && this.expires[speciesKey] > now) {
      return this.data[speciesKey];
    }
    return null;
  },
  
  // Store a photo in cache with expiration
  set(speciesKey, photoData) {
    this.data[speciesKey] = photoData;
    this.expires[speciesKey] = Date.now() + this.TTL;
  },
  
  // Store photos for multiple species
  setMultiple(photosObj) {
    Object.entries(photosObj).forEach(([key, data]) => {
      this.set(key, data);
    });
  },
  
  // Check which species are missing from cache
  getMissingSpecies(speciesKeys) {
    const now = Date.now();
    return speciesKeys.filter(key => 
      !this.data[key] || this.expires[key] <= now
    );
  }
};

// Initialize photo cache from localStorage on load
try {
  const savedCache = localStorage.getItem('birdPhotoCache');
  if (savedCache) {
    const parsed = JSON.parse(savedCache);
    photoCache.data = parsed.data || {};
    photoCache.expires = parsed.expires || {};
    
    // Clean expired entries
    const now = Date.now();
    Object.keys(photoCache.expires).forEach(key => {
      if (photoCache.expires[key] <= now) {
        delete photoCache.data[key];
        delete photoCache.expires[key];
      }
    });
    
    debug.debug('Loaded photo cache from localStorage:', Object.keys(photoCache.data).length);
  }
} catch (error) {
  debug.error('Error loading photo cache from localStorage:', error);
}

// Save cache to localStorage periodically
setInterval(() => {
  try {
    const cacheData = {
      data: photoCache.data,
      expires: photoCache.expires
    };
    localStorage.setItem('birdPhotoCache', JSON.stringify(cacheData));
    debug.debug('Saved photo cache to localStorage:', Object.keys(photoCache.data).length);
  } catch (error) {
    debug.error('Error saving photo cache to localStorage:', error);
  }
}, 60000); // Save every minute

/**
 * Fetches bird photos from the BirdWeather API for given species
 * Uses a cache to avoid redundant API calls
 * @param {string[]} uniqueSpecies - Array of unique species identifiers
 * @returns {Promise<Object>} Object mapping species to their photo URLs
 */
export const fetchBirdPhotos = async (uniqueSpecies) => {
  if (!uniqueSpecies || uniqueSpecies.length === 0) {
    return {};
  }
  
  // First check which species are missing from the cache
  const missingSpecies = photoCache.getMissingSpecies(uniqueSpecies);
  
  // If all species are in cache, return from cache immediately
  if (missingSpecies.length === 0) {
    debug.debug('All species photos found in cache:', uniqueSpecies.length);
    const result = {};
    uniqueSpecies.forEach(species => {
      result[species] = photoCache.get(species);
    });
    return result;
  }
  
  // Create result combining cached and newly fetched photos
  const result = {};
  
  // Add cached photos to result
  const cachedSpecies = uniqueSpecies.filter(s => !missingSpecies.includes(s));
  cachedSpecies.forEach(species => {
    result[species] = photoCache.get(species);
  });
  
  debug.debug('Using cached photos for species:', cachedSpecies.length);
  
  // Fetch missing photos
  if (missingSpecies.length > 0) {
    try {
      debug.debug('Fetching photos for missing species:', missingSpecies.length);
      const photoResponse = await fetch('https://app.birdweather.com/api/v1/species/lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          species: missingSpecies,
          fields: ['imageUrl', 'thumbnailUrl']
        })
      });
      
      if (photoResponse.ok) {
        const photoData = await photoResponse.json();
        debug.debug('Retrieved photos for species:', Object.keys(photoData.species).length);
        
        // Update the cache with new photos
        photoCache.setMultiple(photoData.species);
        
        // Add newly fetched photos to result
        Object.entries(photoData.species).forEach(([key, data]) => {
          result[key] = data;
        });
      }
    } catch (error) {
      debug.error('Error fetching species photos:', error);
    }
  }
  
  return result;
};

/**
 * Event bus for photo updates
 */
const photoUpdateEvents = {
  listeners: new Map(),
  
  // Register a listener for a specific species
  subscribe(speciesKey, callback) {
    if (!this.listeners.has(speciesKey)) {
      this.listeners.set(speciesKey, new Set());
    }
    this.listeners.get(speciesKey).add(callback);
    return () => this.unsubscribe(speciesKey, callback);
  },
  
  // Remove a listener
  unsubscribe(speciesKey, callback) {
    if (this.listeners.has(speciesKey)) {
      this.listeners.get(speciesKey).delete(callback);
    }
  },
  
  // Notify listeners of a photo update
  notify(speciesKey, photoData) {
    if (this.listeners.has(speciesKey)) {
      this.listeners.get(speciesKey).forEach(callback => {
        try {
          callback(photoData);
        } catch (error) {
          debug.error('Error in photo update listener:', error);
        }
      });
    }
  }
};

/**
 * Processes bird sightings data that has been already compressed by the server
 * Groups it by location for display on the map
 * @param {Object[]} sightings - Array of server-compressed bird sighting records
 * @param {Object} options - Processing options
 * @param {boolean} options.deferPhotos - Whether to defer photo loading (default: true)
 * @returns {Object[]} Array of location objects with grouped bird sightings
 */
export const processBirdSightings = async (sightings, options = {}) => {
  const startTime = Date.now();
  const { deferPhotos = true } = options;
  
  // Filter valid sightings
  const validSightings = sightings.filter(sighting => sighting.obsValid === true);
  
  // Group birds by location (they're already compressed by species on the server)
  const groupedByLocation = _.groupBy(validSightings, sighting => 
    `${sighting.lat},${sighting.lng}`
  );

  debug.debug('Processing sightings:', { 
    total: sightings.length,
    valid: validSightings.length,
    locations: Object.keys(groupedByLocation).length
  });

  // Extract unique species
  const uniqueSpecies = [...new Set(validSightings
    .map(sighting => `${sighting.sciName}_${sighting.comName}`))];
  
  // Prepare result locations with birds, initially without photos
  const locationsWithBirds = Object.entries(groupedByLocation).map(([locationKey, locationBirds]) => {
    const [lat, lng] = locationKey.split(',').map(Number);
    
    // Create birds array with updateable photo properties
    const birds = locationBirds.map(bird => {
      const speciesKey = `${bird.sciName}_${bird.comName}`;
      // Create a new object without mutating the original
      return { 
        ...bird,
        // Add method to update photos later
        _photoUpdateId: Math.random().toString(36).substr(2, 9),
        _speciesKey: speciesKey
      };
    });
    
    return {
      lat,
      lng,
      birds
    };
  });
  
  // For immediate photo loading (for the first load or if deferPhotos=false)
  // Try to get photos from cache first
  const initialPhotos = {};
  uniqueSpecies.forEach(species => {
    const cached = photoCache.get(species);
    if (cached) {
      initialPhotos[species] = cached;
    }
  });
  
  // Apply cached photos to birds
  if (Object.keys(initialPhotos).length > 0) {
    locationsWithBirds.forEach(location => {
      location.birds.forEach(bird => {
        if (initialPhotos[bird._speciesKey]) {
          const photoData = initialPhotos[bird._speciesKey];
          bird.thumbnailUrl = photoData.thumbnailUrl;
          bird.fullPhotoUrl = photoData.imageUrl;
        }
      });
    });
    
    debug.debug('Applied cached photos to birds:', Object.keys(initialPhotos).length);
  }
  
  // Start loading missing photos in the background if we're deferring
  const missingSpecies = photoCache.getMissingSpecies(uniqueSpecies);
  
  if (missingSpecies.length > 0) {
    if (deferPhotos) {
      // Load photos in the background after returning the initial data
      setTimeout(async () => {
        try {
          debug.debug('Loading photos in background for species:', missingSpecies.length);
          const photoData = await fetchBirdPhotos(missingSpecies);
          
          // Apply photos to birds by notifying listeners
          Object.keys(photoData).forEach(speciesKey => {
            if (photoData[speciesKey]) {
              photoUpdateEvents.notify(speciesKey, photoData[speciesKey]);
            }
          });
          
          debug.debug('Background photo loading complete:', Object.keys(photoData).length);
        } catch (error) {
          debug.error('Error loading photos in background:', error);
        }
      }, 10);
    } else {
      // Load photos before returning if not deferring
      debug.debug('Loading photos immediately for species:', missingSpecies.length);
      const photoData = await fetchBirdPhotos(missingSpecies);
      
      // Apply photos to birds
      locationsWithBirds.forEach(location => {
        location.birds.forEach(bird => {
          if (photoData[bird._speciesKey]) {
            bird.thumbnailUrl = photoData[bird._speciesKey].thumbnailUrl;
            bird.fullPhotoUrl = photoData[bird._speciesKey].imageUrl;
          }
        });
      });
    }
  }
  
  debug.debug(`Processed bird sightings in ${Date.now() - startTime}ms`);
  return locationsWithBirds;
};

/**
 * Subscribes to photo updates for a bird marker
 * @param {Object} bird - Bird object with _speciesKey
 * @param {Function} onUpdate - Callback when photo is updated
 * @returns {Function} Unsubscribe function
 */
export const subscribeToPhotoUpdates = (bird, onUpdate) => {
  if (!bird || !bird._speciesKey) return () => {};
  
  return photoUpdateEvents.subscribe(bird._speciesKey, (photoData) => {
    // Check if photoData exists before trying to access properties
    if (photoData) {
      onUpdate({
        thumbnailUrl: photoData.thumbnailUrl || null,
        fullPhotoUrl: photoData.imageUrl || null
      });
    }
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
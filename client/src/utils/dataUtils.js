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
 * @param {Object} speciesPhotos - Mapping of species to their photo URLs
 * @returns {Object[]} Array of location objects with grouped bird sightings
 */
export const processBirdSightings = (sightings, speciesPhotos) => {
  const validSightings = sightings.filter(sighting => sighting.obsValid === true);
  const groupedByLocation = _.groupBy(validSightings, sighting => 
    `${sighting.lat},${sighting.lng}`
  );

  debug.debug('Processing sightings:', { 
    total: sightings.length,
    valid: validSightings.length,
    locations: Object.keys(groupedByLocation).length
  });

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
 * Builds the API URL for fetching bird sightings
 * @param {Object} params - Search parameters
 * @param {number} params.lat - Latitude
 * @param {number} params.lng - Longitude
 * @param {number} params.radius - Search radius in kilometers
 * @param {string} params.species - Species code, or 'rare' or 'recent'
 * @param {number} params.back - Number of days to look back
 * @returns {string} Formatted API URL with query parameters
 */
export const buildApiUrl = (params) => {
  const searchParams = new URLSearchParams({
    lat: params.lat.toString(),
    lng: params.lng.toString(),
    dist: (params.radius + 0.3).toFixed(1),
    species: params.species,
    back: params.back.toString()
  });

  return `${import.meta.env.VITE_API_URL}/api/birds?${searchParams}`;
};
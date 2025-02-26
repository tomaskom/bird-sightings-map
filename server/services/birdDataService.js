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
 * Description: Service for fetching and caching bird sighting data
 * 
 * Dependencies: debug.js, viewportUtils.js, cacheManager.js, node-fetch
 */

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { debug } = require('../utils/debug');
const { calculateViewportCenter, calculateViewportRadius } = require('../utils/viewportUtils');
const { generateCacheKey, getCache, setCache } = require('../utils/cacheManager');

/**
 * Fetches bird data for a given viewport
 * Checks cache first, falls back to eBird API
 * Fetches both recent and notable (rare) birds
 * @param {Object} viewport - Viewport parameters
 * @returns {Promise<Object>} Combined bird sighting data with type markers
 */
async function getBirdDataForViewport(viewport) {
  const startTime = Date.now();
  const cacheKey = generateCacheKey(viewport);
  
  // Check cache first
  const cachedData = getCache(cacheKey);
  if (cachedData) {
    debug.info(`Serving ${cachedData.length} bird sightings from cache in ${Date.now() - startTime}ms`);
    return cachedData;
  }
  
  // Cache miss, fetch from eBird API
  debug.info('Cache miss, fetching from eBird API');
  
  // Calculate center and radius from viewport
  const center = calculateViewportCenter(viewport);
  const radius = calculateViewportRadius(viewport);
  
  // Prepare parameters for eBird API
  const params = {
    lat: center.lat,
    lng: center.lng,
    dist: radius,
    back: viewport.back
  };
  
  try {
    // Fetch both regular and notable birds
    const [recentBirds, notableBirds] = await Promise.all([
      fetchBirdData({ ...params, species: 'recent' }),
      fetchBirdData({ ...params, species: 'rare' })
    ]);
    
    debug.debug('Received data from eBird:', {
      recentCount: recentBirds.length,
      notableCount: notableBirds.length
    });
    
    // Mark each record with its type for client-side filtering
    const recentBirdsMarked = recentBirds.map(bird => ({ ...bird, isNotable: false }));
    const notableBirdsMarked = notableBirds.map(bird => ({ ...bird, isNotable: true }));
    
    // Combine and deduplicate (rare birds often appear in both lists)
    const combinedData = combineAndDeduplicate(recentBirdsMarked, notableBirdsMarked);
    
    // Cache the results
    setCache(cacheKey, combinedData);
    
    debug.info(`Fetched and cached ${combinedData.length} bird sightings in ${Date.now() - startTime}ms`);
    return combinedData;
  } catch (error) {
    debug.error('Error fetching bird data:', error);
    throw error;
  }
}

/**
 * Combines and deduplicates bird lists, preserving notable status
 * @param {Array} recentBirds - Recent bird sightings
 * @param {Array} notableBirds - Notable bird sightings
 * @returns {Array} Combined list with duplicates removed
 */
function combineAndDeduplicate(recentBirds, notableBirds) {
  // Create a map of existing records by unique ID
  const birdMap = new Map();
  
  // Add all recent birds to the map
  recentBirds.forEach(bird => {
    const key = `${bird.speciesCode}-${bird.lat}-${bird.lng}-${bird.obsDt}`;
    birdMap.set(key, bird);
  });
  
  // Add or update notable birds
  notableBirds.forEach(bird => {
    const key = `${bird.speciesCode}-${bird.lat}-${bird.lng}-${bird.obsDt}`;
    if (birdMap.has(key)) {
      // If record exists, ensure it's marked as notable
      birdMap.get(key).isNotable = true;
    } else {
      birdMap.set(key, bird);
    }
  });
  
  return Array.from(birdMap.values());
}

/**
 * Fetches bird data from eBird API
 * @param {Object} params - API parameters
 * @returns {Promise<Array>} Bird sighting data
 */
async function fetchBirdData(params) {
  const { lat, lng, dist, species = 'recent', back = '7' } = params;
  const baseUrl = 'https://api.ebird.org/v2/data/obs/geo';

  let endpoint;
  if (species === 'rare') {
    endpoint = 'recent/notable';
  } else {
    endpoint = 'recent';
    if (species !== 'recent') {
      endpoint = `recent/${species}`;
    }
  }

  const url = `${baseUrl}/${endpoint}?lat=${lat}&lng=${lng}&dist=${dist}&detail=simple&hotspot=false&back=${back}`;

  debug.debug('Fetching from eBird API:', {
    endpoint,
    species,
    coordinates: { lat, lng },
    distance: dist,
    lookback: back
  });

  const response = await fetch(url, {
    headers: {
      'x-ebirdapitoken': process.env.EBIRD_API_KEY
    }
  });

  debug.info('eBird API response status:', response.status);

  if (!response.ok) {
    const errorText = await response.text();
    debug.error('eBird API error:', errorText);
    throw new Error('eBird API request failed');
  }

  const responseText = await response.text();
  
  try {
    const data = JSON.parse(responseText);
    debug.info('Successfully parsed bird records:', data.length);
    return data;
  } catch (error) {
    debug.error('Failed to parse eBird response:', error);
    throw new Error('Invalid response format from eBird API');
  }
}

module.exports = {
  getBirdDataForViewport
};
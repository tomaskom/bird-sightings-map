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
const { isValidViewport } = require('../utils/viewportUtils');
const { 
  getTilesForViewport,
  getTileCenter,
  getTileCache,
  setTileCache,
  getMissingTiles
} = require('../utils/cacheManager');

// Maximum number of parallel API requests to make
const MAX_PARALLEL_REQUESTS = 8;

// Get setting for radius buffer from environment or use default (1.1)
// This is a multiplier for the tile radius to ensure we get all data at tile boundaries
const RADIUS_BUFFER = parseFloat(process.env.TILE_RADIUS_BUFFER || 1.1);


/**
 * Fetches bird data for a given viewport
 * @param {Object} viewport - Viewport parameters
 * @returns {Promise<Array>} Combined bird sighting data with type markers
 */
async function getBirdDataForViewport(viewport) {
  const startTime = Date.now();
  
  try {
    const birdData = await getBirdDataFromTiles(viewport);
    debug.info(`Processed viewport request with ${birdData.length} bird sightings in ${Date.now() - startTime}ms`);
    return birdData;
  } catch (error) {
    debug.error('Error fetching bird data for viewport:', error);
    throw error;
  }
}

/**
 * Gets bird data using tile-based caching
 * @param {Object} viewport - Viewport parameters
 * @returns {Promise<Array>} Combined bird sighting data
 */
async function getBirdDataFromTiles(viewport) {
  const startTime = Date.now();
  
  // Get all tile IDs for this viewport
  const tileIds = getTilesForViewport(viewport);
  debug.info(`Viewport requires ${tileIds.length} tiles`);
  
  // Check which tiles we need to fetch (not in cache)
  const missingTileIds = getMissingTiles(tileIds);
  
  // If there are no missing tiles, we can skip fetching
  if (missingTileIds.length === 0) {
    debug.info('🎉 All tiles in cache - no API requests needed!');
  } else {
    debug.info(`Need to fetch ${missingTileIds.length} missing tiles`);
    
    // Sort tiles - prioritize center tiles over edge tiles
    // This ensures the most important data is fetched first
    const viewportCenter = {
      lat: (parseFloat(viewport.minLat) + parseFloat(viewport.maxLat)) / 2,
      lng: (parseFloat(viewport.minLng) + parseFloat(viewport.maxLng)) / 2
    };
    
    // Calculate distance from center for each tile
    const tilesWithDistance = missingTileIds.map(tileId => {
      const center = getTileCenter(tileId);
      const distance = Math.sqrt(
        Math.pow(center.lat - viewportCenter.lat, 2) + 
        Math.pow(center.lng - viewportCenter.lng, 2)
      );
      return { tileId, distance };
    });
    
    // Sort by distance from center
    tilesWithDistance.sort((a, b) => a.distance - b.distance);
    
    // Extract sorted tile IDs
    const sortedMissingTileIds = tilesWithDistance.map(tile => tile.tileId);
    
    // Process in batches, starting with the center tiles
    const batches = [];
    for (let i = 0; i < sortedMissingTileIds.length; i += MAX_PARALLEL_REQUESTS) {
      batches.push(sortedMissingTileIds.slice(i, i + MAX_PARALLEL_REQUESTS));
    }
    
    // If we have many batches, limit to the most essential ones
    // for the initial view (we'll fetch the rest later if needed)
    const maxInitialBatches = 3; // Only fetch the first 3 batches immediately
    const initialBatches = batches.length > maxInitialBatches ? 
      batches.slice(0, maxInitialBatches) : batches;
    
    // Fetch initial batches
    for (let i = 0; i < initialBatches.length; i++) {
      const batch = initialBatches[i];
      debug.info(`Fetching batch ${i+1}/${initialBatches.length} (${batch.length} tiles)`);
      
      // Process batch in parallel
      await Promise.all(batch.map(fetchTileData));
    }
    
    // If there are remaining batches, fetch them in the background
    if (batches.length > maxInitialBatches) {
      debug.info(`Fetching ${batches.length - maxInitialBatches} remaining batches in background`);
      
      // We don't await this promise - it runs in the background while we return data
      (async () => {
        for (let i = maxInitialBatches; i < batches.length; i++) {
          const batch = batches[i];
          debug.info(`Background fetching batch ${i+1}/${batches.length} (${batch.length} tiles)`);
          
          // Process batch in parallel
          await Promise.all(batch.map(fetchTileData));
        }
        debug.info(`Background tile fetching complete - all ${missingTileIds.length} tiles now in cache`);
      })();
    }
  }
  
  // Collect data from all tiles (now available in cache)
  const tileDataPromises = tileIds.map(tileId => getTileCache(tileId));
  const tileData = await Promise.all(tileDataPromises);
  
  // Collect all bird observations from all tiles
  const allBirds = [];
  for (const tileObservations of tileData) {
    if (tileObservations && tileObservations.length > 0) {
      allBirds.push(...tileObservations);
    }
  }
  
  // Now deduplicate at the viewport level only
  const startDedupeTime = Date.now();
  
  // Use a map to deduplicate based on a unique key
  const uniqueBirds = new Map();
  for (const bird of allBirds) {
    const key = `${bird.speciesCode}-${bird.lat}-${bird.lng}-${bird.obsDt}`;
    
    // For duplicates, prefer the one marked as notable
    if (!uniqueBirds.has(key) || (bird.isNotable && !uniqueBirds.get(key).isNotable)) {
      uniqueBirds.set(key, bird);
    }
  }
  
  // Convert back to array
  const finalData = Array.from(uniqueBirds.values());
  
  const dupsRemoved = allBirds.length - finalData.length;
  debug.info(`Deduplicated ${allBirds.length} observations into ${finalData.length} unique records (${dupsRemoved} duplicates removed) in ${Date.now() - startDedupeTime}ms`);
  debug.info(`Completed tile-based retrieval in ${Date.now() - startTime}ms`);
  
  return finalData;
}

/**
 * Fetches data for a single tile and stores it in cache
 * @param {string} tileId - Tile ID
 * @returns {Promise<Array>} Bird sighting data for the tile
 */
async function fetchTileData(tileId) {
  const tileStartTime = Date.now();
  
  try {
    // Get the tile center coordinates
    const tileCenter = getTileCenter(tileId);
    
    // Using a fixed radius per tile based on the tile size
    // We add a buffer to ensure we get all data at the tile boundaries
    // This creates some overlap between adjacent tiles, but we handle deduplication later
    const tileSizeKm = parseFloat(process.env.TILE_SIZE_KM || 2);
    
    // Diagonal of a square tile is sqrt(2) * side length
    // We use this as the base radius to ensure we cover the whole tile
    const diagonalKm = Math.sqrt(2) * tileSizeKm;
    
    // Add buffer to ensure we don't miss data at tile boundaries
    const radius = diagonalKm * RADIUS_BUFFER;
    
    // Prepare parameters for eBird API
    const params = {
      lat: tileCenter.lat,
      lng: tileCenter.lng,
      dist: radius,
      back: tileCenter.back
    };
    
    debug.info(`Fetching tile ${tileId} with center (${tileCenter.lat.toFixed(4)}, ${tileCenter.lng.toFixed(4)}), radius ${radius.toFixed(2)}km, days back ${tileCenter.back}`);
    
    // Fetch both regular and notable birds
    const [recentBirds, notableBirds] = await Promise.all([
      fetchBirdData({ ...params, species: 'recent' }),
      fetchBirdData({ ...params, species: 'rare' })
    ]);
    
    debug.debug(`Tile ${tileId} raw data:`, {
      recentCount: recentBirds.length,
      notableCount: notableBirds.length
    });
    
    // Mark each record with its type for client-side filtering
    const recentBirdsMarked = recentBirds.map(bird => ({ ...bird, isNotable: false }));
    const notableBirdsMarked = notableBirds.map(bird => ({ ...bird, isNotable: true }));
    
    // Combine and deduplicate (rare birds often appear in both lists)
    const combinedData = combineAndDeduplicate(recentBirdsMarked, notableBirdsMarked);
    
    // Cache the tile data
    setTileCache(tileId, combinedData);
    
    debug.info(`Tile ${tileId} complete: ${combinedData.length} birds in ${Date.now() - tileStartTime}ms`);
    return combinedData;
  } catch (error) {
    debug.error(`Error fetching tile ${tileId}:`, error);
    // Store empty array in cache to avoid repeated failed requests
    setTileCache(tileId, []);
    return [];
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
    coordinates: { lat: lat.toFixed(4), lng: lng.toFixed(4) },
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
    throw new Error(`eBird API request failed with status ${response.status}`);
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
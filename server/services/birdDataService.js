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
 * Dependencies: debug.js, viewportUtils.js, cacheManager.js, serverConstants.js, node-fetch
 */

const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { debug } = require('../utils/debug');
const { isValidViewport } = require('../utils/viewportUtils');
const constants = require('../utils/serverConstants');
const { 
  getTilesForViewport,
  getTileCenter,
  getTileCache,
  setTileCache,
  getMissingTiles,
  tileCache
} = require('../utils/cacheManager');

// API request settings from constants
const MAX_PARALLEL_REQUESTS = constants.API.MAX_PARALLEL_REQUESTS;
const MAX_INITIAL_BATCHES = constants.API.MAX_INITIAL_BATCHES;

// Rate limiting protection
let consecutiveSlowResponses = 0;
let lastRequestTime = 0;
let MIN_REQUEST_GAP_MS = 100; // Minimum gap between requests

// Tile settings from constants
const RADIUS_BUFFER = constants.TILES.RADIUS_BUFFER;


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
  
  // Reset the superset search flag at the start of each viewport fetch
  // This is needed because the flag is module-level in cacheManager
  const resetSupersetSearch = require('../utils/cacheManager').resetSupersetSearch;
  if (resetSupersetSearch) resetSupersetSearch();
  
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
    const initialBatches = batches.length > MAX_INITIAL_BATCHES ? 
      batches.slice(0, MAX_INITIAL_BATCHES) : batches;
    
    // Fetch initial batches
    for (let i = 0; i < initialBatches.length; i++) {
      const batch = initialBatches[i];
      debug.info(`Fetching batch ${i+1}/${initialBatches.length} (${batch.length} tiles)`);
      
      // Process batch in parallel
      await Promise.all(batch.map(fetchTileData));
    }
    
    // If there are remaining batches, fetch them in the background
    if (batches.length > MAX_INITIAL_BATCHES) {
      debug.info(`Fetching ${batches.length - MAX_INITIAL_BATCHES} remaining batches in background`);
      
      // We don't await this promise - it runs in the background while we return data
      (async () => {
        for (let i = MAX_INITIAL_BATCHES; i < batches.length; i++) {
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
  
  // Now deduplicate at the viewport level and update the cache
  const startDedupeTime = Date.now();
  
  // First, create a record of which birds came from which tiles
  const tileToRecords = new Map(); // Map tileId -> array of bird records
  tileIds.forEach((tileId, index) => {
    if (tileData[index] && tileData[index].length > 0) {
      tileToRecords.set(tileId, tileData[index]);
    }
  });
  
  // Use a map to deduplicate based on a unique key
  const uniqueBirds = new Map();
  const birdKeyToTiles = new Map(); // Tracks which tiles contain each duplicate bird
  
  for (const bird of allBirds) {
    const key = `${bird.speciesCode}-${bird.lat}-${bird.lng}-${bird.obsDt}`;
    
    // For duplicates, prefer the one marked as notable
    if (!uniqueBirds.has(key) || (bird.isNotable && !uniqueBirds.get(key).isNotable)) {
      uniqueBirds.set(key, bird);
    }
    
    // Keep track of all tiles that contain this bird
    if (!birdKeyToTiles.has(key)) {
      birdKeyToTiles.set(key, new Set());
    }
    
    // Find which tiles contain this bird
    for (const [tileId, birds] of tileToRecords.entries()) {
      if (birds.includes(bird)) {
        birdKeyToTiles.get(key).add(tileId);
      }
    }
  }
  
  // Convert back to array
  const finalData = Array.from(uniqueBirds.values());
  
  const dupsRemoved = allBirds.length - finalData.length;
  debug.info(`Deduplicated ${allBirds.length} observations into ${finalData.length} unique records (${dupsRemoved} duplicates removed) in ${Date.now() - startDedupeTime}ms`);
  
  // Update the cache entries to mark duplicates that can be removed
  // Only do this optimization if we have significant duplicates
  if (dupsRemoved > 10) {
    const dedupeUpdateStartTime = Date.now();
    
    try {
      // Update each tile in the cache with optimized data
      for (const tileId of tileIds) {
        const tileEntry = tileCache.get(tileId);
        
        if (tileEntry && !tileEntry.isDeduplicated && tileEntry.data.length > 0) {
          // Count how many birds should be kept from this tile based on deduplication
          let keepCount = 0;
          let duplicatesRemoved = 0;
          
          const optimizedData = tileEntry.data.filter(bird => {
            // Create the bird's unique key
            const key = `${bird.speciesCode}-${bird.lat}-${bird.lng}-${bird.obsDt}`;
            
            // Check if this bird appears in multiple tiles
            const appearances = birdKeyToTiles.get(key);
            
            if (!appearances || appearances.size <= 1) {
              // This bird only appears in one tile, always keep it
              keepCount++;
              return true;
            }
            
            // For birds that appear in multiple tiles, only keep in the first tile
            // (arbitrary but consistent selection)
            const tilesWithBird = Array.from(appearances).sort();
            const shouldKeep = tilesWithBird[0] === tileId;
            
            if (shouldKeep) {
              keepCount++;
              return true;
            } else {
              duplicatesRemoved++;
              return false;
            }
          });
          
          // Only update if we found duplicates to remove
          if (duplicatesRemoved > 0) {
            debug.info(`Optimized tile ${tileId}: removed ${duplicatesRemoved} duplicate birds, keeping ${keepCount}`);
            tileEntry.data = optimizedData;
            tileEntry.isDeduplicated = true;
            tileEntry.viewportDeduplicationSaved = duplicatesRemoved;
          }
        }
      }
      
      debug.info(`Viewport deduplication cache update completed in ${Date.now() - dedupeUpdateStartTime}ms`);
    } catch (error) {
      // Log but don't fail if the optimization step has an error
      debug.error('Error updating cache with deduplicated data:', error);
    }
  }
  
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
    const tileSizeKm = constants.TILES.SIZE_KM;
    
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
    
    // First, compress each dataset separately (without marking notable yet)
    const compressedRecent = compressBirdData(recentBirds);
    const compressedNotable = compressBirdData(notableBirds);
    
    // Create a map of the notable birds by their location+species key
    const notableMap = new Map();
    compressedNotable.forEach(bird => {
      const key = `${bird.speciesCode}-${bird.lat}-${bird.lng}`;
      notableMap.set(key, true);
    });
    
    // Now mark each recent bird as notable if it exists in the notable list
    const markedRecent = compressedRecent.map(bird => {
      const key = `${bird.speciesCode}-${bird.lat}-${bird.lng}`;
      return {
        ...bird,
        isNotable: notableMap.has(key)
      };
    });
    
    // Mark all notable birds as notable (they're guaranteed to be notable)
    const markedNotable = compressedNotable.map(bird => ({
      ...bird,
      isNotable: true
    }));
    
    // Combine both lists - use a standard deduplication to avoid duplicates
    const combinedData = deduplicateBirdsByLocation([...markedRecent, ...markedNotable]);
    
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
 * Compresses bird data from a single source by species and location
 * Leverages the fact that records are sorted by date (most recent first)
 * @param {Array} birds - Bird sightings (sorted by date)
 * @returns {Array} Compressed list with one entry per species/location
 */
function compressBirdData(birds) {
  // Create a map to group birds by species+location
  const birdMap = new Map();
  
  // Process all birds (already sorted by date)
  for (const bird of birds) {
    // Create a key based on species and location only (not date)
    const key = `${bird.speciesCode}-${bird.lat}-${bird.lng}`;
    
    if (!birdMap.has(key)) {
      // First sighting of this species at this location
      // Since records are sorted by date (most recent first),
      // this will always be the most recent observation for this group
      const compressedBird = { ...bird };
      compressedBird.subIds = bird.subId ? [bird.subId] : [];
      // Remove the single subId property
      delete compressedBird.subId;
      birdMap.set(key, compressedBird);
    } else {
      // We already have this species at this location
      const existingBird = birdMap.get(key);
      
      // Add subId to the list if it exists and isn't already included
      if (bird.subId && !existingBird.subIds.includes(bird.subId)) {
        existingBird.subIds.push(bird.subId);
      }
      
      // No need to compare dates since we know the first record we processed
      // for each key is the most recent one (due to sorted input)
    }
  }
  
  // Convert map back to array
  return Array.from(birdMap.values());
}

/**
 * Deduplicates a combined list of birds ensuring no duplicates by species+location
 * Preserves notable status properly
 * @param {Array} birds - Combined list of birds (both notable and regular)
 * @returns {Array} Deduplicated list with correct notable status
 */
function deduplicateBirdsByLocation(birds) {
  // Create a map to deduplicate by species+location
  const birdMap = new Map();
  
  // Process all birds
  for (const bird of birds) {
    // Create a key based on species and location only
    const key = `${bird.speciesCode}-${bird.lat}-${bird.lng}`;
    
    if (!birdMap.has(key)) {
      // First time seeing this species at this location
      birdMap.set(key, bird);
    } else {
      // We already have this species at this location
      const existingBird = birdMap.get(key);
      
      // Preserve the notable status (true wins over false)
      existingBird.isNotable = existingBird.isNotable || bird.isNotable;
      
      // Merge the subIds lists
      if (bird.subIds) {
        for (const subId of bird.subIds) {
          if (!existingBird.subIds.includes(subId)) {
            existingBird.subIds.push(subId);
          }
        }
      }
    }
  }
  
  const result = Array.from(birdMap.values());
  
  debug.info(`Deduplicated combined data, resulting in ${result.length} unique species-location pairs`);
  
  return result;
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

  const requestStartTime = Date.now();
  let response;
  
  // Enforce minimum gap between API requests to avoid rate limiting
  const currentTime = Date.now();
  const timeSinceLastRequest = currentTime - lastRequestTime;
  
  if (timeSinceLastRequest < MIN_REQUEST_GAP_MS) {
    const waitTime = MIN_REQUEST_GAP_MS - timeSinceLastRequest;
    debug.info(`Waiting ${waitTime}ms before API request to prevent rate limiting`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
  
  try {
    response = await fetch(url, {
      headers: {
        'x-ebirdapitoken': process.env.EBIRD_API_KEY
      }
    });
    
    const requestDuration = Date.now() - requestStartTime;
    
    // Log detailed API response information
    debug.info('eBird API response details:', {
      url: url,
      status: response.status,
      statusText: response.statusText,
      duration: `${requestDuration}ms`,
      headers: {
        'x-rate-limit-remaining': response.headers.get('x-rate-limit-remaining'),
        'x-rate-limit-reset': response.headers.get('x-rate-limit-reset'),
        'x-rate-limit': response.headers.get('x-rate-limit'),
        'retry-after': response.headers.get('retry-after')
      }
    });
    
    // Check for rate limiting indicators
    if (requestDuration > 2000) {
      consecutiveSlowResponses++;
      debug.warn(`eBird API request took ${requestDuration}ms - may indicate throttling (${consecutiveSlowResponses} consecutive slow responses)`);
      
      // If we're getting multiple slow responses, start adding delays
      if (consecutiveSlowResponses >= 3) {
        const backoffDelay = Math.min(500 * Math.pow(1.5, consecutiveSlowResponses - 3), 10000);
        debug.warn(`Applying rate limit backoff: ${backoffDelay}ms delay for future requests`);
        MIN_REQUEST_GAP_MS = backoffDelay;
      }
    } else {
      // Reset counter if we get a fast response
      if (consecutiveSlowResponses > 0) {
        consecutiveSlowResponses = Math.max(0, consecutiveSlowResponses - 1);
      }
    }
    
    // Check rate limit headers if available
    const rateLimit = response.headers.get('x-rate-limit');
    const rateLimitRemaining = response.headers.get('x-rate-limit-remaining');
    
    if (rateLimit && rateLimitRemaining) {
      const remainingPercent = (parseInt(rateLimitRemaining) / parseInt(rateLimit)) * 100;
      if (remainingPercent < 20) {
        debug.warn(`Rate limit approaching: ${rateLimitRemaining}/${rateLimit} (${remainingPercent.toFixed(1)}% remaining)`);
        MIN_REQUEST_GAP_MS = Math.max(MIN_REQUEST_GAP_MS, 500);
      }
    }
  } catch (error) {
    debug.error('eBird API network error:', error.message);
    throw new Error(`eBird API request failed with network error: ${error.message}`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    debug.error('eBird API error response:', {
      status: response.status,
      text: errorText,
      headers: {
        'x-rate-limit-remaining': response.headers.get('x-rate-limit-remaining'),
        'x-rate-limit-reset': response.headers.get('x-rate-limit-reset'),
        'retry-after': response.headers.get('retry-after')
      }
    });
    
    if (response.status === 429) {
      debug.error('RATE LIMITING DETECTED: eBird API returned 429 Too Many Requests');
    }
    
    throw new Error(`eBird API request failed with status ${response.status}: ${errorText}`);
  }

  const responseText = await response.text();
  
  try {
    const data = JSON.parse(responseText);
    
    // More detailed success logging
    debug.info('eBird API success:', {
      count: data.length,
      firstFew: data.length > 0 ? data.slice(0, 3).map(b => `${b.comName || 'Unknown'} at ${b.lat},${b.lng}`) : [],
      hasMore: data.length > 3
    });
    
    // Log the actual coordinates range found in the data
    if (data.length > 0) {
      const lats = data.map(b => parseFloat(b.lat));
      const lngs = data.map(b => parseFloat(b.lng));
      debug.info('Data coordinates range:', {
        lat: {
          min: Math.min(...lats).toFixed(4),
          max: Math.max(...lats).toFixed(4)
        },
        lng: {
          min: Math.min(...lngs).toFixed(4),
          max: Math.max(...lngs).toFixed(4)
        },
        requestedCenter: { lat: lat.toFixed(4), lng: lng.toFixed(4) },
        requestedRadius: dist
      });
    }
    return data;
  } catch (error) {
    debug.error('Failed to parse eBird response:', error);
    throw new Error('Invalid response format from eBird API');
  }
}

module.exports = {
  getBirdDataForViewport
};
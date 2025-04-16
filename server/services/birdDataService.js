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
const cacheManager = require('../utils/cacheManager');
const { 
  getTilesForViewport,
  getTileCenter,
  getTileCache,
  setTileCache,
  getMissingTiles,
  markTilesAsSeen,
  releaseTiles,
  getClientMissingTiles,
  tileCache,
  activeClientTiles,
  incrementApiRequestCount,
  getTileBoundaries,
  clipDataToTileBoundaries
} = cacheManager;

// Make cacheManager accessible through constants for API request tracking
constants.cacheManager = cacheManager;

// API request settings from constants
const MAX_PARALLEL_REQUESTS = constants.API.MAX_PARALLEL_REQUESTS;
const MAX_BACK_DAYS = constants.API.MAX_BACK_DAYS;
const MAX_INITIAL_BATCHES = constants.API.MAX_INITIAL_BATCHES;

// Rate limiting protection
let consecutiveSlowResponses = 0;
let lastRequestTime = 0;
let MIN_REQUEST_GAP_MS = 0; // Minimum gap between requests

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
 * @param {Object} viewport - Viewport parameters with optional clientId
 * @returns {Promise<Array>} Combined bird sighting data
 */
async function getBirdDataFromTiles(viewport) {
  const startTime = Date.now();
  const clientId = viewport.clientId;
  
  try {
    // Get all tile IDs for this viewport (now without back value in IDs)
    const tileIds = getTilesForViewport(viewport);
    debug.info(`Viewport requires ${tileIds.length} tiles`);
    
    // Always use maximum back value (14 days)
    // Client will filter for fewer days if needed
    const backValue = MAX_BACK_DAYS;
    debug.info(`Using maximum back value (${MAX_BACK_DAYS}) for all requests, client will filter as needed`);
    
    // Check which tiles we need to fetch (not in cache)
    const missingTiles = getMissingTiles(tileIds, viewport);
  
  // If there are no missing tiles, we can skip fetching
  if (missingTiles.length === 0) {
    debug.info('🎉 All tiles in cache - no API requests needed!');
  } else {
    debug.info(`Need to fetch ${missingTiles.length} missing tiles`);
    
    // Sort tiles - prioritize center tiles over edge tiles
    // This ensures the most important data is fetched first
    const viewportCenter = {
      lat: (parseFloat(viewport.minLat) + parseFloat(viewport.maxLat)) / 2,
      lng: (parseFloat(viewport.minLng) + parseFloat(viewport.maxLng)) / 2
    };
    
    // Calculate distance from center for each tile
    const tilesWithDistance = missingTiles.map(tile => {
      const center = getTileCenter(tile.tileId);
      const distance = Math.sqrt(
        Math.pow(center.lat - viewportCenter.lat, 2) + 
        Math.pow(center.lng - viewportCenter.lng, 2)
      );
      return { ...tile, distance };
    });
    
    // Sort by distance from center
    tilesWithDistance.sort((a, b) => a.distance - b.distance);
    
    // Process in batches, starting with the center tiles
    const batches = [];
    for (let i = 0; i < tilesWithDistance.length; i += MAX_PARALLEL_REQUESTS) {
      batches.push(tilesWithDistance.slice(i, i + MAX_PARALLEL_REQUESTS));
    }
    
    // TESTING: Fetch all batches synchronously to test performance impact
    // By using all batches as initial batches, we effectively disable background loading
    const initialBatches = batches;
    
    // Fetch initial batches
    for (let i = 0; i < initialBatches.length; i++) {
      const batch = initialBatches[i];
      debug.info(`Fetching batch ${i+1}/${initialBatches.length} (${batch.length} tiles)`);
      
      // Process batch in parallel
      await Promise.all(batch.map(tile => fetchTileData(tile.tileId)));
    }
    
    // Track API requests
    incrementApiRequestCount(missingTiles.length);
    
    // TESTING: We're now loading all tiles synchronously, so there are no remaining batches
    // This block of background fetching code is disabled for performance testing
    debug.info(`All ${batches.length} batches fetched synchronously - no background fetching needed`);
  }
  
  // Get the tiles that this client doesn't already have
  let clientTilesToReturn = tileIds;
  
  if (clientId && activeClientTiles) {
    try {
      clientTilesToReturn = getClientMissingTiles(clientId, tileIds);
      debug.info(`Client ${clientId} needs ${clientTilesToReturn.length}/${tileIds.length} tiles`);
    } catch (error) {
      debug.error('Error getting client missing tiles:', error);
      // Fall back to returning all tiles if there's an error
      clientTilesToReturn = tileIds;
      debug.info('Falling back to returning all tiles due to error');
    }
  } else {
    debug.info('No client ID provided or client tracking not available, returning all tiles in viewport');
  }
  
  // Collect data only for tiles the client needs
  // IMPORTANT: Don't mark tiles as seen yet - only do that after successfully sending to client
  const tileDataPromises = clientTilesToReturn.map(tileId => {
    // Get the tile data from cache
    return getTileCache(tileId);
  });
  
  const tileData = await Promise.all(tileDataPromises);
  
  // Collect all bird observations from the filtered tiles
  // Add tile ID to each observation for client-side tracking
  const allBirds = [];
  for (let i = 0; i < tileData.length; i++) {
    const tileId = clientTilesToReturn[i];
    const tileObservations = tileData[i];
    
    if (tileObservations && tileObservations.length > 0) {
      // Add tile ID to each observation
      const birdsWithTileId = tileObservations.map(bird => ({
        ...bird,
        _tileId: tileId // Add private field for tile tracking
      }));
      allBirds.push(...birdsWithTileId);
    }
  }
  
  // No deduplication needed for cached tiles - they were already deduplicated when loaded
  // We'll only count for logging purposes
  const startDedupeTime = Date.now();
  const finalData = allBirds;
  
  debug.info(`Skipping deduplication for ${finalData.length} observations from ${clientTilesToReturn.length} tiles in ${Date.now() - startDedupeTime}ms`);
  debug.info(`Completed tile-based retrieval in ${Date.now() - startTime}ms`);
  
  // NOW mark the tiles as seen by this client - AFTER we've collected the data
  // This ensures we don't mark tiles as seen until we're ready to return them to the client
  if (clientId && activeClientTiles && clientTilesToReturn.length > 0) {
    try {
      debug.info(`== DETAILED MARK TILES DEBUG ==`);
      debug.info(`Preparing to mark ${clientTilesToReturn.length} tiles as seen by client ${clientId}`);
      
      // Log the active client tiles before marking
      if (activeClientTiles.has(clientId)) {
        const beforeCount = activeClientTiles.get(clientId).tiles.size;
        debug.info(`BEFORE: Client ${clientId} has ${beforeCount} active tiles`);
      } else {
        debug.info(`BEFORE: Client ${clientId} has no entry in activeClientTiles`);
      }
      
      // Mark tiles as seen by this client using our dedicated function
      markTilesAsSeen(clientId, clientTilesToReturn);
      
      // Log the active client tiles after marking
      if (activeClientTiles.has(clientId)) {
        const afterCount = activeClientTiles.get(clientId).tiles.size;
        debug.info(`AFTER: Client ${clientId} has ${afterCount} active tiles`);
        
        // Check if our sample tile was added
        if (clientTilesToReturn.length > 0) {
          const sampleTile = clientTilesToReturn[0];
          const hasTile = activeClientTiles.get(clientId).tiles.has(sampleTile);
          debug.info(`Sample tile ${sampleTile} in client tiles: ${hasTile}`);
        }
      } else {
        debug.info(`AFTER: Client ${clientId} still has no entry in activeClientTiles`);
      }
      
      debug.info(`== END DETAILED MARK TILES DEBUG ==`);
    } catch (error) {
      debug.error('Error marking client tiles as seen:', error);
    }
  }
  
  debug.info(`Returning ${finalData.length} bird observations to client for ${clientTilesToReturn.length} tiles`);
  return finalData;
  
  } catch (error) {
    debug.error('Error in getBirdDataFromTiles:', error);
    // Return an empty array as fallback
    return [];
  }
}

/**
 * Fetches data for a single tile and stores it in cache
 * @param {string} tileId - Tile ID (format: tileY:tileX)
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
    
    // Prepare parameters for eBird API - always use MAX_BACK_DAYS
    const params = {
      lat: tileCenter.lat,
      lng: tileCenter.lng,
      dist: radius,
      back: MAX_BACK_DAYS
    };
    
    debug.info(`Fetching tile ${tileId} with center (${tileCenter.lat.toFixed(4)}, ${tileCenter.lng.toFixed(4)}), radius ${radius.toFixed(2)}km, days back ${MAX_BACK_DAYS}`);
    
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
    let combinedData = deduplicateBirdsByLocation([...markedRecent, ...markedNotable]);
    
    // Get exact tile boundaries
    const tileBounds = getTileBoundaries(tileId);
    
    // Clip data to exact tile boundaries to prevent overlap
    const clippedData = clipDataToTileBoundaries(combinedData, tileBounds);
    
    if (clippedData.length < combinedData.length) {
      debug.info(`Clipped ${combinedData.length - clippedData.length} bird observations outside tile boundaries`);
      combinedData = clippedData;
    }
    
    // Cache the clipped tile data
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
    if (requestDuration > 5000) {
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
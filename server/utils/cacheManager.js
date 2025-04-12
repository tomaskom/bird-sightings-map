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
 * Description: In-memory cache manager for bird sighting data with tile-based caching
 * 
 * Dependencies: debug.js, serverConstants.js
 */

const { debug } = require('./debug');
const constants = require('./serverConstants');

// Convert cache TTL and cleanup interval from minutes to milliseconds
const CACHE_TTL = constants.CACHE.TTL_MINUTES * 60 * 1000;
const CLEANUP_INTERVAL = constants.CACHE.CLEANUP_INTERVAL_MINUTES * 60 * 1000;

// Get tile settings from constants
const TILE_SIZE_KM = constants.TILES.SIZE_KM;
const VIEWPORT_BUFFER = constants.TILES.VIEWPORT_BUFFER;
const MAX_LATITUDE = constants.GEO.MAX_LATITUDE;

// In-memory cache store for tile-based caching
// Map from coordinate key (tileY:tileX) to tile entry with maximum back data
const tileCache = new Map();

// Client tracking system - Maps from clientId to set of active tiles
const activeClientTiles = new Map(); // clientId -> { tiles: Set, lastActive: timestamp }

// Maximum number of days to look back - limiting this improves performance dramatically
const MAX_BACK_DAYS = 14;

// Timeout for stale client data (5 minutes)
const STALE_CLIENT_TIMEOUT = 5 * 60 * 1000;

// Cache statistics counters
let cacheHits = 0;
let cacheMisses = 0;
let apiRequestCount = 0;

// Valid back values from client configuration with a maximum of 14 days
const VALID_BACK_VALUES = [1, 3, 7, MAX_BACK_DAYS]; // Maximum back days is 14

/**
 * Converts a coordinate to a tile ID based on configured tile size
 * This now returns only the coordinate part - no back value in the ID
 * @param {number} lat - Latitude coordinate
 * @param {number} lng - Longitude coordinate
 * @param {string} [back] - Days to look back (for logging only, not used in ID)
 * @returns {string} Tile ID in format "tileY:tileX"
 */
function getTileId(lat, lng, back) {
  // Convert to numbers to ensure correct calculation
  lat = parseFloat(lat);
  lng = parseFloat(lng);
  
  // Handle latitude clamping to avoid pole issues
  lat = Math.max(Math.min(lat, MAX_LATITUDE), -MAX_LATITUDE);
  
  // Approximate conversion (at equator): 1 degree latitude ≈ 111km
  const latKmPerDegree = 111;
  const tileSizeInLatDegrees = TILE_SIZE_KM / latKmPerDegree;
  
  // Longitude degrees per km varies with latitude
  // cos(lat) accounts for the narrowing of longitude lines as we move away from equator
  const lngKmPerDegree = 111 * Math.cos(lat * Math.PI / 180);
  const tileSizeInLngDegrees = lngKmPerDegree === 0 ? 
    TILE_SIZE_KM / 1 : // Fallback for extreme latitudes
    TILE_SIZE_KM / lngKmPerDegree;
  
  // Calculate tile indices
  const tileY = Math.floor(lat / tileSizeInLatDegrees);
  const tileX = Math.floor(lng / tileSizeInLngDegrees);
  
  debug.tile(`Calculated tile for (${lat.toFixed(4)}, ${lng.toFixed(4)}): [${tileY}, ${tileX}]${back ? `, back=${back}` : ''}`);
  
  // Return coordinate-only ID (no back value)
  return `${tileY}:${tileX}`;
}

/**
 * Calculates the center coordinates for a tile
 * @param {string} tileId - The tile ID in format "tileY:tileX"
 * @param {string} [back] - Optional back value for return value
 * @returns {Object} Center coordinates {lat, lng, back}
 */
function getTileCenter(tileId, back) {
  const [tileY, tileX] = tileId.split(':');
  
  const y = parseInt(tileY, 10);
  const x = parseInt(tileX, 10);
  
  // Convert back to coordinates
  // First, calculate the top-left (northwest) corner of the tile
  const latKmPerDegree = 111;
  const tileSizeInLatDegrees = TILE_SIZE_KM / latKmPerDegree;
  
  // For longitude, we need a reference latitude to calculate the scale factor
  // We use the latitude of the center of the tile as a reference
  const tileTopLat = y * tileSizeInLatDegrees;
  const tileBottomLat = (y + 1) * tileSizeInLatDegrees;
  const centerLat = (tileTopLat + tileBottomLat) / 2;
  
  // Now calculate longitude degrees based on this latitude
  const lngKmPerDegree = 111 * Math.cos(centerLat * Math.PI / 180);
  const tileSizeInLngDegrees = lngKmPerDegree === 0 ? 
    TILE_SIZE_KM / 1 : // Fallback for extreme latitudes
    TILE_SIZE_KM / lngKmPerDegree;
  
  const tileLeftLng = x * tileSizeInLngDegrees;
  const tileRightLng = (x + 1) * tileSizeInLngDegrees;
  const centerLng = (tileLeftLng + tileRightLng) / 2;
  
  debug.tile(`Tile ${tileId} center: (${centerLat.toFixed(4)}, ${centerLng.toFixed(4)})`);
  
  return { 
    lat: centerLat, 
    lng: centerLng,
    back // Will be undefined if not provided
  };
}

/**
 * Gets the tile IDs that cover a given viewport with buffer
 * @param {Object} viewport - Viewport parameters
 * @param {number} viewport.minLat - Minimum latitude
 * @param {number} viewport.maxLat - Maximum latitude
 * @param {number} viewport.minLng - Minimum longitude
 * @param {number} viewport.maxLng - Maximum longitude
 * @param {string} viewport.back - Days to look back (for metadata only)
 * @returns {string[]} Array of tile IDs
 */
function getTilesForViewport(viewport) {
  const tiles = new Set();
  
  // Convert to numbers
  const minLat = parseFloat(viewport.minLat);
  const maxLat = parseFloat(viewport.maxLat);
  const minLng = parseFloat(viewport.minLng);
  const maxLng = parseFloat(viewport.maxLng);
  const back = viewport.back;
  
  // Add buffer around viewport edges (configured percentage of viewport size on each side)
  // This helps ensure we capture all relevant tiles
  const latBuffer = (maxLat - minLat) * VIEWPORT_BUFFER;
  const lngBuffer = (maxLng - minLng) * VIEWPORT_BUFFER;
  
  const bufferedViewport = {
    minLat: Math.max(minLat - latBuffer, -MAX_LATITUDE),
    maxLat: Math.min(maxLat + latBuffer, MAX_LATITUDE),
    minLng: minLng - lngBuffer,
    maxLng: maxLng + lngBuffer
  };
  
  debug.info(`Viewport with buffer: minLat=${bufferedViewport.minLat.toFixed(4)}, maxLat=${bufferedViewport.maxLat.toFixed(4)}, minLng=${bufferedViewport.minLng.toFixed(4)}, maxLng=${bufferedViewport.maxLng.toFixed(4)}, back=${back}`);
  
  // Get tiles for the corners and edges (back value not included in IDs anymore)
  const nwTile = getTileId(bufferedViewport.maxLat, bufferedViewport.minLng);
  const neTile = getTileId(bufferedViewport.maxLat, bufferedViewport.maxLng);
  const swTile = getTileId(bufferedViewport.minLat, bufferedViewport.minLng);
  const seTile = getTileId(bufferedViewport.minLat, bufferedViewport.maxLng);
  
  // Parse tile coordinates
  const [nwLat, nwLng] = nwTile.split(':').map(Number);
  const [neLat, neLng] = neTile.split(':').map(Number);
  const [swLat, swLng] = swTile.split(':').map(Number);
  const [seLat, seLng] = seTile.split(':').map(Number);
  
  // Find min/max tile coordinates
  const minTileLat = Math.min(nwLat, neLat, swLat, seLat);
  const maxTileLat = Math.max(nwLat, neLat, swLat, seLat);
  const minTileLng = Math.min(nwLng, neLng, swLng, seLng);
  const maxTileLng = Math.max(nwLng, neLng, swLng, seLng);
  
  debug.tile(`Tile coordinate ranges: lat=[${minTileLat}, ${maxTileLat}], lng=[${minTileLng}, ${maxTileLng}]`);
  
  // Generate all tile IDs within the viewport
  for (let tileLat = minTileLat; tileLat <= maxTileLat; tileLat++) {
    for (let tileLng = minTileLng; tileLng <= maxTileLng; tileLng++) {
      const tileId = `${tileLat}:${tileLng}`;
      tiles.add(tileId);
    }
  }
  
  const tilesArray = Array.from(tiles);
  debug.tile(`Generated ${tilesArray.length} tiles for viewport: [${tilesArray.slice(0, 3).join(', ')}${tilesArray.length > 3 ? '...' : ''}]`);
  return tilesArray;
}


/**
 * Stores data in tile cache with expiration and calculates cutoff indices for different back values
 * @param {string} tileId - Tile ID (tileY:tileX)
 * @param {Array} data - Bird sighting data to cache 
 * @param {number} backValue - Number of days back this data represents
 */
function setTileCache(tileId, data, backValue) {
  // Ensure backValue is a number and limit to maximum days
  let backNum = parseInt(backValue, 10);
  
  // Enforce maximum back value
  if (backNum > MAX_BACK_DAYS) {
    debug.warn(`Requested back=${backNum} exceeds maximum ${MAX_BACK_DAYS}, limiting to ${MAX_BACK_DAYS}`);
    backNum = MAX_BACK_DAYS;
  }
  
  // First ensure data is sorted by date (most recent first)
  // This is critical for our cutoff index calculation
  const sortedData = [...data].sort((a, b) => 
    new Date(b.obsDt) - new Date(a.obsDt)
  );
  
  // Get or create cache entry
  let cacheEntry = tileCache.get(tileId);
  const now = Date.now();
  
  // Create a new entry if:
  // 1. No entry exists
  // 2. Existing entry is expired
  // 3. Existing entry has a smaller back value than the new one
  if (!cacheEntry || now > cacheEntry.expires || backNum > cacheEntry.maxBack) {
    // Calculate cutoff dates for all valid back values
    const cutoffDates = {};
    const now = new Date();
    
    VALID_BACK_VALUES.forEach(days => {
      if (days <= backNum) {
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - days);
        cutoffDates[days] = cutoff;
      }
    });
    
    // Create new entry (or completely replace old one)
    cacheEntry = {
      data: sortedData,
      maxBack: backNum,
      timestamp: now,
      expires: now + CACHE_TTL,
      cutoffDates: cutoffDates,
      backValueIndices: {}, // Will be calculated below
      isDeduplicated: false,
      viewportDeduplicationSaved: 0
    };
  } else {
    // If we already have data with a larger back value, log and return
    if (cacheEntry.maxBack >= backNum) {
      debug.cache(`Existing cache entry for ${tileId} already has back=${cacheEntry.maxBack} which covers requested back=${backNum}`);
      return;
    }
    
    // Otherwise update cache entry with new data
    cacheEntry.data = sortedData;
    cacheEntry.maxBack = backNum;
    cacheEntry.timestamp = now;
    cacheEntry.expires = now + CACHE_TTL;
    
    // Update cutoff dates for the new back value
    VALID_BACK_VALUES.forEach(days => {
      if (days <= backNum && !cacheEntry.cutoffDates[days]) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        cacheEntry.cutoffDates[days] = cutoff;
      }
    });
    
    cacheEntry.isDeduplicated = false;
    cacheEntry.viewportDeduplicationSaved = 0;
  }
  
  // Calculate cutoff indices for all valid back values
  // This is the key optimization - we pre-compute where in the array each back value's data ends
  const backValueIndices = {};
  
  // Go through each valid back value
  VALID_BACK_VALUES.forEach(days => {
    if (days <= backNum) {
      const cutoffDate = cacheEntry.cutoffDates[days];
      
      // Find the index where data for this back value ends
      // Since data is sorted most recent first, we can scan until we hit the cutoff
      let index = -1;
      for (let i = 0; i < sortedData.length; i++) {
        const obsDt = new Date(sortedData[i].obsDt);
        if (obsDt < cutoffDate) {
          // We found the cutoff point
          index = i - 1;
          break;
        }
      }
      
      // If we never hit the cutoff, all data is within this back period
      if (index === -1) {
        index = sortedData.length - 1;
      }
      
      backValueIndices[days] = index;
      debug.cache(`Back=${days} days has ${index + 1} records (cutoff index: ${index})`);
    }
  });
  
  cacheEntry.backValueIndices = backValueIndices;
  
  // Store in the cache
  tileCache.set(tileId, cacheEntry);
  
  debug.cache(`Tile cache updated: ${tileId}, max back=${backNum}, entries: ${sortedData.length}, expires in ${CACHE_TTL/1000/60} minutes`);
}

/**
 * Retrieves data from tile cache if available and not expired
 * Filters the data based on the requested back value
 * @param {string} tileId - Tile ID (tileY:tileX)
 * @param {number} backValue - Number of days to look back
 * @returns {Array|null} Cached data filtered for the requested back value, or null if not found/expired
 */
function getTileCache(tileId, backValue) {
  // Ensure backValue is a number and limit to maximum days
  let requestedBackNum = parseInt(backValue, 10);
  
  // Enforce maximum back value
  if (requestedBackNum > MAX_BACK_DAYS) {
    debug.debug(`Requested back=${requestedBackNum} exceeds maximum ${MAX_BACK_DAYS}, using ${MAX_BACK_DAYS}`);
    requestedBackNum = MAX_BACK_DAYS;
  }
  
  // Get the cache entry
  const cacheEntry = tileCache.get(tileId);
  
  // No entry or expired entry
  if (!cacheEntry || Date.now() > cacheEntry.expires) {
    debug.cache(`No valid cache entry found for tile ${tileId}`);
    cacheMisses++;
    
    // Clean up expired entry if it exists
    if (cacheEntry && Date.now() > cacheEntry.expires) {
      debug.cache(`Removing expired entry: ${tileId}`);
      tileCache.delete(tileId);
    }
    
    return null;
  }
  
  // Check if this entry's maxBack covers the requested back value
  if (cacheEntry.maxBack < requestedBackNum) {
    debug.cache(`Cache entry for ${tileId} has maxBack=${cacheEntry.maxBack}, which is less than requested back=${requestedBackNum}`);
    cacheMisses++;
    return null;
  }
  
  // We have a cache entry with sufficient back data - filter it
  // Find the pre-calculated index for this back value
  const backIndex = cacheEntry.backValueIndices[requestedBackNum];
  
  // If we don't have a pre-calculated index for this specific back value
  // (which shouldn't happen if using standard back values), find the closest smaller one
  if (backIndex === undefined) {
    debug.cache(`No pre-calculated index for back=${requestedBackNum}, finding closest smaller back value`);
    
    // Find closest smaller back value that we have an index for
    const availableBackValues = Object.keys(cacheEntry.backValueIndices)
      .map(Number)
      .filter(b => b < requestedBackNum)
      .sort((a, b) => b - a); // Sort descending to get closest smaller
    
    if (availableBackValues.length > 0) {
      const closestBack = availableBackValues[0];
      debug.cache(`Using closest available back=${closestBack} instead of requested back=${requestedBackNum}`);
      
      // Use the index for the closest smaller back value
      const closestIndex = cacheEntry.backValueIndices[closestBack];
      const filteredData = cacheEntry.data.slice(0, closestIndex + 1);
      debug.cache(`Returning ${filteredData.length} records using closest back value index`);
      return filteredData;
    }
    
    // If we have no smaller back values (shouldn't happen with standard values),
    // we need to filter manually
    debug.cache(`No smaller back values available, filtering manually`);
    
    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - requestedBackNum);
    
    // Filter the data
    const filteredData = cacheEntry.data.filter(bird => {
      const obsDt = new Date(bird.obsDt);
      return obsDt >= cutoffDate;
    });
    
    debug.cache(`Manually filtered to ${filteredData.length} records for back=${requestedBackNum}`);
    return filteredData;
  }
  
  // Simple and fast - just slice the array to the pre-calculated index
  const filteredData = cacheEntry.data.slice(0, backIndex + 1);
  
  // Track cache hit
  cacheHits++;
  
  debug.cache(`Tile cache hit: ${tileId}, returning ${filteredData.length} records for back=${requestedBackNum} from maxBack=${cacheEntry.maxBack} tile (from cache index ${backIndex})`);
  return filteredData;
}

/**
 * Gets missing tiles from the provided list
 * This is a compatibility wrapper for the new markAndIdentifyMissingTiles function
 * @param {string[]} tileIds - List of tile IDs (tileY:tileX format)
 * @param {Object} viewport - Viewport with back value
 * @returns {Array<{tileId: string, backValue: number}>} List of missing tiles with their required back values
 */
function getMissingTiles(tileIds, viewport) {
  // Create a temporary client ID for this request
  const tempClientId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  
  // ALWAYS use MAX_BACK_DAYS for fetching tiles
  // This ensures we have the maximum data available in the cache
  const backNum = MAX_BACK_DAYS;
  
  debug.info(`Using maximum back value (${MAX_BACK_DAYS}) for tile fetching regardless of client request (${viewport.back})`);
  
  // Use the new function to identify missing tiles
  const missingTileIds = markAndIdentifyMissingTiles(tempClientId, tileIds);
  
  // Convert to the expected format - ALWAYS using MAX_BACK_DAYS
  const missingTiles = missingTileIds.map(tileId => ({
    tileId,
    backValue: backNum
  }));
  
  debug.cache(`Found ${missingTiles.length} tiles to fetch out of ${tileIds.length} total with back=${backNum}`);
  return missingTiles;
}

/**
 * Merges bird data from multiple tiles, removing duplicates
 * @param {Array[]} tileDataArray - Array of bird data arrays from different tiles
 * @returns {Array} Merged and deduplicated bird data
 */
function mergeTileData(tileDataArray) {
  // Skip merge if there's only one tile
  if (tileDataArray.length === 0) return [];
  if (tileDataArray.length === 1 && tileDataArray[0]) return tileDataArray[0];
  
  const startTime = Date.now();
  
  // First, filter out any null/undefined arrays and count total records
  const validArrays = [];
  let totalInput = 0;
  
  for (const arr of tileDataArray) {
    if (arr && arr.length > 0) {
      validArrays.push(arr);
      totalInput += arr.length;
    }
  }
  
  // If after filtering, we only have one array, return it directly
  if (validArrays.length === 0) return [];
  if (validArrays.length === 1) return validArrays[0];
  
  // Fast path: for smaller datasets, use the simple approach
  if (totalInput < 1000) {
    // Create a map using a unique key for each bird record
    const birdMap = new Map();
    
    // Add all birds to the map, preserving notable status
    for (const tileData of validArrays) {
      for (const bird of tileData) {
        // Create a unique key for each bird sighting
        const key = `${bird.speciesCode}-${bird.lat}-${bird.lng}-${bird.obsDt}`;
        
        if (birdMap.has(key)) {
          // For birds that appear in multiple tiles, only preserve notable status
          // if it's in the same region as where it was first seen
          // This prevents birds from being marked notable when they're only notable in specific areas
          const existingBird = birdMap.get(key);
          
          // If this record has the exact same coordinates as the existing one,
          // it's the same observation, so we can safely update the notable status
          // (Different tiles might categorize the same observation differently based on region)
          if (bird.lat === existingBird.lat && bird.lng === existingBird.lng) {
            existingBird.isNotable = existingBird.isNotable || bird.isNotable;
          }
          
          // Otherwise, we leave it as is - we don't propagate notable status
          // from one region to another
        } else {
          birdMap.set(key, bird);
        }
      }
    }
    
    // Convert map back to array
    const mergedData = Array.from(birdMap.values());
    const duplicatesRemoved = totalInput - mergedData.length;
    
    debug.perf(`Merged ${mergedData.length} records from ${validArrays.length} tiles (${duplicatesRemoved} duplicates removed) in ${Date.now() - startTime}ms`);
    return mergedData;
  }
  
  // Optimized path for larger datasets
  // Use a faster approach for large datasets by sorting and then deduplicating
  
  // Flatten all arrays and add index to track source
  const allBirds = [];
  for (let i = 0; i < validArrays.length; i++) {
    for (const bird of validArrays[i]) {
      allBirds.push({
        bird,
        key: `${bird.speciesCode}-${bird.lat}-${bird.lng}-${bird.obsDt}`
      });
    }
  }
  
  // Sort by key
  allBirds.sort((a, b) => a.key.localeCompare(b.key));
  
  // Deduplicate while preserving notable status
  const mergedData = [];
  let currentKey = null;
  let currentBird = null;
  
  for (const item of allBirds) {
    if (item.key !== currentKey) {
      // New unique bird
      if (currentBird) {
        mergedData.push(currentBird);
      }
      currentKey = item.key;
      currentBird = item.bird;
    } else if (item.bird.isNotable && currentBird) {
      // Same bird, but this one is notable, so update status
      currentBird.isNotable = true;
    }
  }
  
  // Add the last bird
  if (currentBird) {
    mergedData.push(currentBird);
  }
  
  const duplicatesRemoved = totalInput - mergedData.length;
  
  debug.perf(`Merged ${mergedData.length} records from ${validArrays.length} tiles (${duplicatesRemoved} duplicates removed) in ${Date.now() - startTime}ms`);
  
  return mergedData;
}

/**
 * Clears all expired entries from the cache
 * @returns {number} Number of entries removed
 */
function clearExpired() {
  let removed = 0;
  const now = Date.now();
  
  // Clear expired tile cache entries
  for (const [key, entry] of tileCache.entries()) {
    if (now > entry.expires) {
      tileCache.delete(key);
      removed++;
    }
  }
  
  // Log details about remaining entries
  if (removed > 0 || Math.random() < 0.1) { // Only log details occasionally or when we removed entries
    // Count statistics for the remaining entries
    const backCounts = {};
    
    for (const entry of tileCache.values()) {
      const back = entry.maxBack;
      backCounts[back] = (backCounts[back] || 0) + 1;
    }
    
    debug.info(`Cleared ${removed} expired cache entries (${tileCache.size} tile entries remaining)`);
    debug.info(`Remaining entries by max back value: ${JSON.stringify(backCounts)}`);
  } else {
    debug.cache(`No expired entries found during cleanup check`);
  }
  
  return removed;
}

/**
 * Clears all caches completely
 * @returns {Object} Number of entries removed
 */
function clearAll() {
  const tileSize = tileCache.size;
  
  tileCache.clear();
  
  debug.info(`Cleared all caches (${tileSize} tile entries removed)`);
  return {
    tileEntries: tileSize,
    total: tileSize
  };
}

/**
 * Gets cache statistics
 * @returns {Object} Cache statistics
 */
function getStats() {
  const now = Date.now();
  let tileExpired = 0;
  let tileTotalSize = 0;
  let oldestTimestamp = now;
  let newestTimestamp = 0;
  let totalBirdRecords = 0;
  let maxBirdsInTile = 0;
  let emptyTiles = 0;
  let totalOriginalBirds = 0; // For compression stats
  let totalCompressedBirds = 0; // For compression stats
  
  // Track species and locations
  const speciesStats = new Map(); // Track species frequency
  const locationStats = new Map(); // Track location frequency (by lat/lng rounded to 2 decimal places)
  
  const ageDistribution = {
    lessThan1Hour: 0,
    lessThan3Hours: 0,
    lessThan6Hours: 0,
    lessThan12Hours: 0,
    lessThan24Hours: 0,
    moreThan24Hours: 0
  };
  const sizeDistribution = {
    empty: 0,        // 0 birds
    small: 0,        // 1-10 birds
    medium: 0,       // 11-50 birds
    large: 0,        // 51-200 birds
    veryLarge: 0     // >200 birds
  };
  // Track birds by back period
  const birdsByBack = {};
  // Track geographic distribution (simplified)
  const tileCoordinates = [];
  
  // Analyze tile cache
  for (const [key, entry] of tileCache.entries()) {
    // Check if expired
    if (now > entry.expires) {
      tileExpired++;
    }
    
    // Very rough estimation of memory usage
    const entrySize = key.length + JSON.stringify(entry.data).length;
    tileTotalSize += entrySize;
    
    // Track timestamps
    if (entry.timestamp < oldestTimestamp) {
      oldestTimestamp = entry.timestamp;
    }
    if (entry.timestamp > newestTimestamp) {
      newestTimestamp = entry.timestamp;
    }
    
    // Track age distribution
    const ageHours = (now - entry.timestamp) / (1000 * 60 * 60);
    if (ageHours < 1) ageDistribution.lessThan1Hour++;
    else if (ageHours < 3) ageDistribution.lessThan3Hours++;
    else if (ageHours < 6) ageDistribution.lessThan6Hours++;
    else if (ageHours < 12) ageDistribution.lessThan12Hours++;
    else if (ageHours < 24) ageDistribution.lessThan24Hours++;
    else ageDistribution.moreThan24Hours++;
    
    // Count birds in tile
    const birdCount = entry.data ? entry.data.length : 0;
    totalBirdRecords += birdCount;
    totalCompressedBirds += birdCount;
    
    // Count original birds via subIds (to measure compression)
    // Also track species and location stats
    if (entry.data) {
      for (const bird of entry.data) {
        // Count for compression stats
        if (bird.subIds) {
          totalOriginalBirds += bird.subIds.length;
        }
        
        // Track species stats
        if (bird.speciesCode) {
          const speciesData = speciesStats.get(bird.speciesCode) || {
            count: 0,
            comName: bird.comName || 'Unknown',
            isNotable: bird.isNotable || false,
            locations: new Set()
          };
          
          speciesData.count += bird.subIds ? bird.subIds.length : 1;
          
          // If any observation of this species is notable, mark the species as notable
          speciesData.isNotable = speciesData.isNotable || bird.isNotable;
          
          // Add location to this species' observed locations
          if (bird.lat && bird.lng) {
            const locationKey = `${parseFloat(bird.lat).toFixed(2)},${parseFloat(bird.lng).toFixed(2)}`;
            speciesData.locations.add(locationKey);
          }
          
          speciesStats.set(bird.speciesCode, speciesData);
        }
        
        // Track location stats
        if (bird.lat && bird.lng) {
          // Round to 2 decimal places for location grouping
          const locationKey = `${parseFloat(bird.lat).toFixed(2)},${parseFloat(bird.lng).toFixed(2)}`;
          
          const locationData = locationStats.get(locationKey) || {
            count: 0,
            species: new Set(),
            notable: 0,
            lat: parseFloat(bird.lat),
            lng: parseFloat(bird.lng)
          };
          
          locationData.count += bird.subIds ? bird.subIds.length : 1;
          locationData.species.add(bird.speciesCode);
          
          if (bird.isNotable) {
            locationData.notable += bird.subIds ? bird.subIds.length : 1;
          }
          
          locationStats.set(locationKey, locationData);
        }
      }
    }
    
    if (birdCount > maxBirdsInTile) {
      maxBirdsInTile = birdCount;
    }
    
    if (birdCount === 0) {
      emptyTiles++;
      sizeDistribution.empty++;
    } else if (birdCount <= 10) {
      sizeDistribution.small++;
    } else if (birdCount <= 50) {
      sizeDistribution.medium++;
    } else if (birdCount <= 200) {
      sizeDistribution.large++;
    } else {
      sizeDistribution.veryLarge++;
    }
    
    // Track back period stats
    const [tileY, tileX, back] = key.split(':');
    if (!birdsByBack[back]) {
      birdsByBack[back] = { count: 0, tiles: 0, birds: 0 };
    }
    birdsByBack[back].count++;
    birdsByBack[back].birds += birdCount;
    
    // Store coordinates for geographic distribution (simplified)
    if (tileCache.size <= 100) { // Only if reasonable number of tiles
      tileCoordinates.push({ 
        lat: parseFloat(tileY), 
        lng: parseFloat(tileX),
        count: birdCount
      });
    }
  }
  
  // Calculate averages and percentages
  const avgBirdsPerTile = tileCache.size > 0 ? totalBirdRecords / tileCache.size : 0;
  const avgSizePerTile = tileCache.size > 0 ? tileTotalSize / tileCache.size : 0;
  const hitRatio = {
    byAge: {
      fresh: (ageDistribution.lessThan1Hour + ageDistribution.lessThan3Hours) / 
             (tileCache.size || 1),
      stale: (ageDistribution.lessThan24Hours + ageDistribution.moreThan24Hours) / 
             (tileCache.size || 1)
    }
  };
  
  // Calculate compression stats
  const compressionRatio = totalOriginalBirds > 0 
    ? (1 - (totalCompressedBirds / totalOriginalBirds)) * 100 
    : 0;
    
  // Calculate average subIds per bird
  const avgSubIdsPerBird = totalCompressedBirds > 0 
    ? totalOriginalBirds / totalCompressedBirds 
    : 0;

  // Process species data for return - convert Set to array and sort by count
  const topSpecies = Array.from(speciesStats.entries())
    .map(([code, data]) => ({
      speciesCode: code,
      comName: data.comName,
      count: data.count,
      isNotable: data.isNotable,
      locationCount: data.locations.size
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20); // Limit to top 20 species

  // Get total species count and notable count
  const totalSpeciesCount = speciesStats.size;
  const notableSpeciesCount = Array.from(speciesStats.values())
    .filter(species => species.isNotable).length;

  // Process location data for return - convert Set to array and sort by count
  const topLocations = Array.from(locationStats.entries())
    .map(([key, data]) => ({
      locationKey: key,
      lat: data.lat,
      lng: data.lng,
      count: data.count,
      speciesCount: data.species.size,
      notableCount: data.notable
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20); // Limit to top 20 locations

  return {
    totalEntries: tileCache.size,
    tileCache: {
      totalEntries: tileCache.size,
      expiredEntries: tileExpired,
      validEntries: tileCache.size - tileExpired,
      approximateSizeBytes: tileTotalSize,
      tileSizeKm: TILE_SIZE_KM,
      emptyTiles: emptyTiles,
      emptyTilePercentage: tileCache.size > 0 ? (emptyTiles / tileCache.size) * 100 : 0
    },
    birdStats: {
      totalBirdRecords,
      averageBirdsPerTile: avgBirdsPerTile,
      maxBirdsInTile,
      birdRecordDensity: totalBirdRecords / (tileCache.size || 1)
    },
    compressionStats: {
      totalOriginalBirds,
      totalCompressedBirds,
      compressionRatio: compressionRatio.toFixed(2) + '%',
      avgSubIdsPerBird: avgSubIdsPerBird.toFixed(2),
      totalMemorySavings: compressionRatio.toFixed(2) + '%'
    },
    viewportDeduplicationStats: {
      // Calculate total duplication savings from viewport deduplication
      totalRecordsSaved: Array.from(tileCache.values())
        .reduce((sum, entry) => sum + (entry.viewportDeduplicationSaved || 0), 0),
      tilesWithSavedDuplicates: Array.from(tileCache.values())
        .filter(entry => entry.viewportDeduplicationSaved > 0).length,
      avgSavedPerTile: Array.from(tileCache.values())
        .filter(entry => entry.viewportDeduplicationSaved > 0)
        .reduce((sum, entry) => sum + entry.viewportDeduplicationSaved, 0) / 
        Math.max(1, Array.from(tileCache.values()).filter(entry => entry.viewportDeduplicationSaved > 0).length)
    },
    memoryStats: {
      totalSizeBytes: tileTotalSize,
      averageSizePerTile: avgSizePerTile,
      sizeInMB: tileTotalSize / (1024 * 1024)
    },
    ageStats: {
      oldestEntryAge: (now - oldestTimestamp) / 1000, // in seconds
      newestEntryAge: (now - newestTimestamp) / 1000, // in seconds
      ageDistribution
    },
    distributionStats: {
      sizeDistribution,
      birdsByBack,
      tileCoordinates: tileCoordinates.length > 0 ? tileCoordinates : null
    },
    speciesStats: {
      totalSpecies: totalSpeciesCount,
      notableSpecies: notableSpeciesCount,
      topSpecies: topSpecies
    },
    locationStats: {
      totalLocations: locationStats.size,
      topLocations: topLocations
    },
    performanceStats: {
      hitRatio
    },
    cacheConfig: {
      ttlMinutes: CACHE_TTL / 60000,
      cleanupIntervalMinutes: CLEANUP_INTERVAL / 60000,
      tileSizeKm: TILE_SIZE_KM,
      radiusBuffer: parseFloat(process.env.TILE_RADIUS_BUFFER || 1.05)
    },
    metricsStats: {
      cacheHits,
      cacheMisses,
      apiRequestCount,
      cacheHitRatio: cacheHits + cacheMisses > 0 ? (cacheHits / (cacheHits + cacheMisses) * 100).toFixed(2) + '%' : '0%',
      apiRequestsPerHour: process.uptime() > 0 ? (apiRequestCount / (process.uptime() / 3600)).toFixed(2) : 0
    },
    systemInfo: {
      nodeVersion: process.version,
      timestamp: now,
      uptime: process.uptime()
    }
  };
}

/**
 * Gets the exact boundary coordinates for a tile
 * @param {string} tileId - The tile ID in format "tileY:tileX"
 * @returns {Object} - Boundary coordinates {minLat, maxLat, minLng, maxLng}
 */
function getTileBoundaries(tileId) {
  const [tileY, tileX] = tileId.split(':').map(Number);
  
  // Convert tile indices to coordinates
  const latKmPerDegree = 111;
  const tileSizeInLatDegrees = TILE_SIZE_KM / latKmPerDegree;
  
  const minLat = tileY * tileSizeInLatDegrees;
  const maxLat = (tileY + 1) * tileSizeInLatDegrees;
  
  // Calculate longitude degrees (varies with latitude)
  const centerLat = (minLat + maxLat) / 2;
  const lngKmPerDegree = 111 * Math.cos(centerLat * Math.PI / 180);
  const tileSizeInLngDegrees = lngKmPerDegree === 0 ? 
    TILE_SIZE_KM / 1 : // Fallback for extreme latitudes
    TILE_SIZE_KM / lngKmPerDegree;
  
  const minLng = tileX * tileSizeInLngDegrees;
  const maxLng = (tileX + 1) * tileSizeInLngDegrees;
  
  return { minLat, maxLat, minLng, maxLng };
}

/**
 * Clips bird data to the exact boundaries of a tile
 * Uses consistent boundary rules (include lower bound, exclude upper bound)
 * @param {Array} data - Bird observation data to clip
 * @param {Object} tileBounds - Tile boundaries
 * @returns {Array} - Clipped data that falls within the tile
 */
function clipDataToTileBoundaries(data, tileBounds) {
  const { minLat, maxLat, minLng, maxLng } = tileBounds;
  
  return data.filter(bird => {
    // For points exactly on the boundary, we need consistent rules:
    // - Include lower bounds (>=)
    // - Exclude upper bounds (<)
    // This ensures a point on the boundary belongs to exactly one tile
    return (
      bird.lat >= minLat && 
      bird.lat < maxLat && 
      bird.lng >= minLng && 
      bird.lng < maxLng
    );
  });
}

/**
 * Marks tiles as active for a client and identifies which tiles are missing from cache
 * @param {string} clientId - Unique identifier for the client
 * @param {string[]} tileIds - List of tile IDs to check
 * @returns {string[]} List of tile IDs that need to be fetched
 */
function markAndIdentifyMissingTiles(clientId, tileIds) {
  // Ensure client entry exists
  if (!activeClientTiles.has(clientId)) {
    activeClientTiles.set(clientId, { 
      tiles: new Set(), 
      lastActive: Date.now() 
    });
  } else {
    // Update last active timestamp
    activeClientTiles.get(clientId).lastActive = Date.now();
  }
  
  const clientActiveTiles = activeClientTiles.get(clientId).tiles;
  const missingTiles = [];
  
  // Process each tile in one pass
  for (const tileId of tileIds) {
    // Mark as active
    clientActiveTiles.add(tileId);
    
    // Check if in cache (don't check expiration)
    if (!tileCache.has(tileId)) {
      cacheMisses++;
      missingTiles.push(tileId);
    } else {
      cacheHits++;
    }
  }
  
  return missingTiles;
}

/**
 * Releases tiles from active state for a client
 * @param {string} clientId - Unique identifier for the client
 * @param {string[]} tileIds - List of tile IDs to release
 */
function releaseTiles(clientId, tileIds) {
  const clientData = activeClientTiles.get(clientId);
  if (!clientData) return;
  
  const clientActiveTiles = clientData.tiles;
  tileIds.forEach(id => clientActiveTiles.delete(id));
  
  // Update last active timestamp
  clientData.lastActive = Date.now();
}

/**
 * Checks if a tile is currently marked active by any client
 * @param {string} tileId - Tile ID to check
 * @returns {boolean} - True if any client has marked this tile as active
 */
function isTileActive(tileId) {
  for (const clientData of activeClientTiles.values()) {
    if (clientData.tiles.has(tileId)) return true;
  }
  return false;
}

/**
 * Cleans up stale client entries
 * @returns {number} - Number of clients removed
 */
function cleanupStaleClients() {
  const now = Date.now();
  let removed = 0;
  
  for (const [clientId, clientData] of activeClientTiles.entries()) {
    if (now - clientData.lastActive > STALE_CLIENT_TIMEOUT) {
      activeClientTiles.delete(clientId);
      removed++;
    }
  }
  
  if (removed > 0) {
    debug.info(`Cleaned up ${removed} stale client entries`);
  }
  
  return removed;
}

/**
 * Modified clearExpired to check for active tiles
 * Only clears tiles that are expired AND not currently active
 */
function clearExpired() {
  let removed = 0;
  const now = Date.now();
  
  // First clean up stale clients
  cleanupStaleClients();
  
  // Then clear expired tile cache entries that aren't active
  for (const [key, entry] of tileCache.entries()) {
    if (now > entry.expires && !isTileActive(key)) {
      tileCache.delete(key);
      removed++;
    }
  }
  
  // Log details about remaining entries
  if (removed > 0 || Math.random() < 0.1) { // Only log details occasionally or when we removed entries
    // Count statistics for the remaining entries
    const backCounts = {};
    
    for (const entry of tileCache.values()) {
      const back = entry.maxBack;
      backCounts[back] = (backCounts[back] || 0) + 1;
    }
    
    debug.info(`Cleared ${removed} expired cache entries (${tileCache.size} tile entries remaining)`);
    debug.info(`Remaining entries by max back value: ${JSON.stringify(backCounts)}`);
  } else {
    debug.cache(`No expired entries found during cleanup check`);
  }
  
  return removed;
}

// Start periodic cleanup
const cleanupInterval = setInterval(clearExpired, CLEANUP_INTERVAL);

// Ensure we don't prevent Node process from exiting
cleanupInterval.unref();

/**
 * Increments the API request counter
 * @param {number} count - Number of API requests to add
 */
function incrementApiRequestCount(count = 1) {
  apiRequestCount += count;
  debug.cache(`API request count increased by ${count} to ${apiRequestCount}`);
}

module.exports = {
  // Tile-based caching
  getTileId,
  getTileCenter,
  getTilesForViewport,
  setTileCache,
  getTileCache,
  getMissingTiles,
  
  // New improved cache functions
  getTileBoundaries,
  clipDataToTileBoundaries,
  markAndIdentifyMissingTiles,
  releaseTiles,
  isTileActive,
  
  // Cache internals
  tileCache,
  
  // Back value configuration
  VALID_BACK_VALUES,
  MAX_BACK_DAYS,
  
  // Cache metrics
  incrementApiRequestCount,
  
  // Cache management
  clearExpired,
  cleanupStaleClients,
  clearAll,
  getStats
};
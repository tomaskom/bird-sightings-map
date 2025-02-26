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
 * Dependencies: debug.js
 */

const { debug } = require('./debug');

// Get cache TTL from environment variable or use default (4 hours)
const CACHE_TTL = (parseInt(process.env.CACHE_TTL_MINUTES, 10) || 240) * 60 * 1000;

// Get cleanup interval from environment variable or use default (15 minutes)
const CLEANUP_INTERVAL = (parseInt(process.env.CACHE_CLEANUP_INTERVAL_MINUTES, 10) || 15) * 60 * 1000;

// Get tile size from environment variable or use default (2km)
const TILE_SIZE_KM = parseFloat(process.env.TILE_SIZE_KM || 2);

// In-memory cache store for viewport-based caching (legacy)
const viewportCache = new Map();

// In-memory cache store for tile-based caching
const tileCache = new Map();

// Latitude limits to avoid issues near poles
const MAX_LATITUDE = 85; // Avoid extreme polar regions

/**
 * Converts a coordinate to a tile ID based on configured tile size
 * @param {number} lat - Latitude coordinate
 * @param {number} lng - Longitude coordinate
 * @param {string} back - Days to look back (part of the tile identity)
 * @returns {string} Tile ID in format "lat:lng:back"
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
  
  debug.tile(`Calculated tile for (${lat.toFixed(4)}, ${lng.toFixed(4)}): [${tileY}, ${tileX}]`);
  
  return `${tileY}:${tileX}:${back}`;
}

/**
 * Calculates the center coordinates for a tile
 * @param {string} tileId - The tile ID in format "lat:lng:back"
 * @returns {Object} Center coordinates {lat, lng, back}
 */
function getTileCenter(tileId) {
  const [tileY, tileX, back] = tileId.split(':');
  
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
    back
  };
}

/**
 * Gets the tile IDs that cover a given viewport with buffer
 * @param {Object} viewport - Viewport parameters
 * @param {number} viewport.minLat - Minimum latitude
 * @param {number} viewport.maxLat - Maximum latitude
 * @param {number} viewport.minLng - Minimum longitude
 * @param {number} viewport.maxLng - Maximum longitude
 * @param {string} viewport.back - Days to look back
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
  
  // Add smaller buffer around viewport edges (10% of viewport size on each side)
  // The buffer should be smaller to reduce the number of tiles
  const latBuffer = (maxLat - minLat) * 0.1;
  const lngBuffer = (maxLng - minLng) * 0.1;
  
  const bufferedViewport = {
    minLat: Math.max(minLat - latBuffer, -MAX_LATITUDE),
    maxLat: Math.min(maxLat + latBuffer, MAX_LATITUDE),
    minLng: minLng - lngBuffer,
    maxLng: maxLng + lngBuffer,
    back
  };
  
  debug.info(`Viewport with buffer: minLat=${bufferedViewport.minLat.toFixed(4)}, maxLat=${bufferedViewport.maxLat.toFixed(4)}, minLng=${bufferedViewport.minLng.toFixed(4)}, maxLng=${bufferedViewport.maxLng.toFixed(4)}`);
  
  // Get tiles for the corners and edges
  const nwTile = getTileId(bufferedViewport.maxLat, bufferedViewport.minLng, back);
  const neTile = getTileId(bufferedViewport.maxLat, bufferedViewport.maxLng, back);
  const swTile = getTileId(bufferedViewport.minLat, bufferedViewport.minLng, back);
  const seTile = getTileId(bufferedViewport.minLat, bufferedViewport.maxLng, back);
  
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
      const tileId = `${tileLat}:${tileLng}:${back}`;
      tiles.add(tileId);
    }
  }
  
  const tilesArray = Array.from(tiles);
  debug.tile(`Generated ${tilesArray.length} tiles for viewport: [${tilesArray.slice(0, 3).join(', ')}${tilesArray.length > 3 ? '...' : ''}]`);
  return tilesArray;
}

/**
 * Generates a viewport cache key (legacy method)
 * @param {Object} viewport - Viewport parameters
 * @param {number} viewport.minLat - Minimum latitude
 * @param {number} viewport.maxLat - Maximum latitude
 * @param {number} viewport.minLng - Minimum longitude
 * @param {number} viewport.maxLng - Maximum longitude
 * @param {string} viewport.back - Days to look back
 * @returns {string} Cache key
 */
function generateCacheKey(viewport) {
  // Round coordinates to reduce minor variations
  const precision = 3;
  const roundedViewport = {
    minLat: parseFloat(viewport.minLat).toFixed(precision),
    maxLat: parseFloat(viewport.maxLat).toFixed(precision),
    minLng: parseFloat(viewport.minLng).toFixed(precision),
    maxLng: parseFloat(viewport.maxLng).toFixed(precision),
    back: viewport.back
  };
  
  return JSON.stringify(roundedViewport);
}

/**
 * Stores data in viewport cache with expiration (legacy method)
 * @param {string} key - Cache key
 * @param {Array} data - Bird sighting data to cache
 */
function setCache(key, data) {
  const cacheEntry = {
    data,
    timestamp: Date.now(),
    expires: Date.now() + CACHE_TTL
  };
  
  viewportCache.set(key, cacheEntry);
  debug.info(`🔵 Cache set: ${key}, entries: ${data.length}, expires in ${CACHE_TTL/1000/60} minutes`);
}

/**
 * Retrieves data from viewport cache if available and not expired (legacy method)
 * @param {string} key - Cache key
 * @returns {Array|null} Cached data or null if not found/expired
 */
function getCache(key) {
  if (!viewportCache.has(key)) {
    debug.info(`🔴 Cache miss: ${key}`);
    return null;
  }
  
  const cacheEntry = viewportCache.get(key);
  
  // Check if expired
  if (Date.now() > cacheEntry.expires) {
    debug.info(`🟠 Cache expired: ${key}`);
    viewportCache.delete(key);
    return null;
  }
  
  debug.info(`🟢 Cache hit: ${key}, age: ${(Date.now() - cacheEntry.timestamp)/1000} seconds, entries: ${cacheEntry.data.length}`);
  return cacheEntry.data;
}

/**
 * Stores data in tile cache with expiration
 * @param {string} tileId - Tile ID
 * @param {Array} data - Bird sighting data to cache
 */
function setTileCache(tileId, data) {
  const cacheEntry = {
    data,
    timestamp: Date.now(),
    expires: Date.now() + CACHE_TTL
  };
  
  tileCache.set(tileId, cacheEntry);
  debug.cache(`Tile cache set: ${tileId}, entries: ${data.length}, expires in ${CACHE_TTL/1000/60} minutes`);
}

/**
 * Retrieves data from tile cache if available and not expired
 * @param {string} tileId - Tile ID
 * @returns {Array|null} Cached data or null if not found/expired
 */
function getTileCache(tileId) {
  if (!tileCache.has(tileId)) {
    debug.cache(`Tile cache miss: ${tileId}`);
    return null;
  }
  
  const cacheEntry = tileCache.get(tileId);
  
  // Check if expired
  if (Date.now() > cacheEntry.expires) {
    debug.cache(`Tile cache expired: ${tileId}`);
    tileCache.delete(tileId);
    return null;
  }
  
  debug.cache(`Tile cache hit: ${tileId}, age: ${(Date.now() - cacheEntry.timestamp)/1000} seconds, entries: ${cacheEntry.data.length}`);
  return cacheEntry.data;
}

/**
 * Gets missing tile IDs from the provided list (tiles that aren't in cache)
 * @param {string[]} tileIds - List of tile IDs to check
 * @returns {string[]} List of missing tile IDs
 */
function getMissingTiles(tileIds) {
  const missingTiles = [];
  
  for (const tileId of tileIds) {
    if (!getTileCache(tileId)) {
      missingTiles.push(tileId);
    }
  }
  
  debug.cache(`Found ${missingTiles.length} missing tiles out of ${tileIds.length} total`);
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
 * Clears all expired entries from both caches
 * @returns {number} Number of entries removed
 */
function clearExpired() {
  let removed = 0;
  const now = Date.now();
  
  // Clear expired viewport cache entries
  for (const [key, entry] of viewportCache.entries()) {
    if (now > entry.expires) {
      viewportCache.delete(key);
      removed++;
    }
  }
  
  // Clear expired tile cache entries
  for (const [key, entry] of tileCache.entries()) {
    if (now > entry.expires) {
      tileCache.delete(key);
      removed++;
    }
  }
  
  debug.info(`Cleared ${removed} expired cache entries (${viewportCache.size} viewport, ${tileCache.size} tile entries remaining)`);
  return removed;
}

/**
 * Clears all caches completely
 * @returns {Object} Number of entries removed by cache type
 */
function clearAll() {
  const viewportSize = viewportCache.size;
  const tileSize = tileCache.size;
  
  viewportCache.clear();
  tileCache.clear();
  
  debug.info(`Cleared all caches (${viewportSize} viewport, ${tileSize} tile entries removed)`);
  return {
    viewportEntries: viewportSize,
    tileEntries: tileSize,
    total: viewportSize + tileSize
  };
}

/**
 * Gets cache statistics
 * @returns {Object} Cache statistics
 */
function getStats() {
  const now = Date.now();
  let viewportExpired = 0;
  let tileExpired = 0;
  let viewportTotalSize = 0;
  let tileTotalSize = 0;
  let oldestTimestamp = now;
  
  // Analyze viewport cache
  for (const [key, entry] of viewportCache.entries()) {
    if (now > entry.expires) {
      viewportExpired++;
    }
    
    // Very rough estimation of memory usage
    viewportTotalSize += key.length + JSON.stringify(entry.data).length;
    
    if (entry.timestamp < oldestTimestamp) {
      oldestTimestamp = entry.timestamp;
    }
  }
  
  // Analyze tile cache
  for (const [key, entry] of tileCache.entries()) {
    if (now > entry.expires) {
      tileExpired++;
    }
    
    // Very rough estimation of memory usage
    tileTotalSize += key.length + JSON.stringify(entry.data).length;
    
    if (entry.timestamp < oldestTimestamp) {
      oldestTimestamp = entry.timestamp;
    }
  }
  
  return {
    totalEntries: viewportCache.size + tileCache.size,
    viewportCache: {
      totalEntries: viewportCache.size,
      expiredEntries: viewportExpired,
      validEntries: viewportCache.size - viewportExpired,
      approximateSizeBytes: viewportTotalSize
    },
    tileCache: {
      totalEntries: tileCache.size,
      expiredEntries: tileExpired,
      validEntries: tileCache.size - tileExpired,
      approximateSizeBytes: tileTotalSize,
      tileSizeKm: TILE_SIZE_KM
    },
    oldestEntryAge: (now - oldestTimestamp) / 1000, // in seconds
    totalSizeBytes: viewportTotalSize + tileTotalSize,
    cacheConfig: {
      ttlMinutes: CACHE_TTL / 60000,
      cleanupIntervalMinutes: CLEANUP_INTERVAL / 60000,
      tileSizeKm: TILE_SIZE_KM
    }
  };
}

// Start periodic cleanup
const cleanupInterval = setInterval(clearExpired, CLEANUP_INTERVAL);

// Ensure we don't prevent Node process from exiting
cleanupInterval.unref();

module.exports = {
  // Tile-based caching
  getTileId,
  getTileCenter,
  getTilesForViewport,
  setTileCache,
  getTileCache,
  getMissingTiles,
  
  // Legacy viewport-based caching
  generateCacheKey,
  setCache,
  getCache,
  
  // Cache management
  clearExpired,
  clearAll,
  getStats
};
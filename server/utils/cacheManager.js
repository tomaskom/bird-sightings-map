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
// Primary map: tileY:tileX -> Map of back values to entries
const tileCache = new Map();

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
  
  // Add buffer around viewport edges (configured percentage of viewport size on each side)
  // This helps ensure we capture all relevant tiles
  const latBuffer = (maxLat - minLat) * VIEWPORT_BUFFER;
  const lngBuffer = (maxLng - minLng) * VIEWPORT_BUFFER;
  
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
 * Stores data in tile cache with expiration
 * @param {string} tileId - Tile ID
 * @param {Array} data - Bird sighting data to cache
 */
function setTileCache(tileId, data) {
  const [tileY, tileX, back] = tileId.split(':');
  const backNum = parseInt(back, 10);
  const tileCoord = `${tileY}:${tileX}`;
  
  // First ensure data is sorted by date (most recent first)
  // This should already be the case, but we'll ensure it
  const sortedData = [...data].sort((a, b) => 
    new Date(b.obsDt) - new Date(a.obsDt)
  );
  
  const cacheEntry = {
    data: sortedData,
    timestamp: Date.now(),
    expires: Date.now() + CACHE_TTL,
    back: backNum,  // Store the back value explicitly
    isDeduplicated: false, // Flag to track whether this tile has been deduplicated
    viewportDeduplicationSaved: 0, // Track viewport deduplication memory savings
    // Pre-calculate cutoff dates for common back values
    cutoffDates: {}
  };
  
  // Calculate common cutoff dates once (to speed up filtering)
  [1, 3, 7, 14, 30].forEach(days => {
    if (days <= backNum) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      cacheEntry.cutoffDates[days] = cutoff;
    }
  });
  
  // Store in the main cache
  tileCache.set(tileId, cacheEntry);
  
  // Update the coordinate index if it exists for this coordinate
  if (tileCoordIndex.has(tileCoord)) {
    const coordEntries = tileCoordIndex.get(tileCoord);
    
    // Remove any existing entry with the same back value
    const existingIndex = coordEntries.findIndex(([back, _]) => back === backNum);
    if (existingIndex !== -1) {
      coordEntries.splice(existingIndex, 1);
    }
    
    // Add the new entry
    coordEntries.push([backNum, tileId]);
    
    // Re-sort by back value
    coordEntries.sort((a, b) => a[0] - b[0]);
    
    debug.cache(`Updated coordinate index for ${tileCoord}, now has ${coordEntries.length} entries`);
  }
  
  debug.cache(`Tile cache set: ${tileId}, entries: ${sortedData.length}, expires in ${CACHE_TTL/1000/60} minutes`);
}

/**
 * Retrieves data from tile cache if available and not expired
 * Handles back parameter filtering using the most appropriate cache entry
 * @param {string} tileId - Tile ID
 * @returns {Array|null} Cached data or null if not found/expired
 */
// Track if we've checked for supersets and found none in this viewport fetch
// This helps avoid repeated futile superset searches
let hasSupersetSearchFailed = false;

// Index of tiles by coordinate to speed up lookup
// Maps tileY:tileX → Array of [backValue, tileId] pairs sorted by backValue
const tileCoordIndex = new Map();

function getTileCache(tileId) {
  // Parse the tile ID to get components
  const [tileY, tileX, requestedBack] = tileId.split(':');
  const requestedBackNum = parseInt(requestedBack, 10);
  const tileCoord = `${tileY}:${tileX}`;
  
  // Check if we have any cached entries for this tile coordinate
  // This is much faster than searching the entire cache
  if (!tileCoordIndex.has(tileCoord)) {
    // First time seeing this coordinate - rebuild the index entry for it
    const coordEntries = [];
    
    // Scan cache for matching tiles (only done once per coordinate)
    for (const [cachedTileId, cacheEntry] of tileCache.entries()) {
      const [cachedY, cachedX, cachedBack] = cachedTileId.split(':');
      
      if (cachedY === tileY && cachedX === tileX) {
        const cachedBackNum = cacheEntry.back || parseInt(cachedBack, 10);
        
        // Check if entry is still valid
        if (Date.now() <= cacheEntry.expires) {
          coordEntries.push([cachedBackNum, cachedTileId]);
        } else {
          debug.cache(`Removing expired entry during index build: ${cachedTileId}`);
          tileCache.delete(cachedTileId);
        }
      }
    }
    
    // Sort entries by back value (ascending)
    coordEntries.sort((a, b) => a[0] - b[0]);
    
    // Store in the index
    tileCoordIndex.set(tileCoord, coordEntries);
    
    debug.cache(`Built tile coordinate index for ${tileCoord} with ${coordEntries.length} entries`);
  }
  
  // Get all entries for this tile coordinate
  const coordEntries = tileCoordIndex.get(tileCoord);
  
  if (coordEntries.length === 0) {
    debug.cache(`No cache entries found for tile coordinate ${tileCoord}`);
    return null;
  }
  
  // First check for exact match
  const exactMatch = coordEntries.find(([backValue, _]) => backValue === requestedBackNum);
  
  if (exactMatch) {
    const exactTileId = exactMatch[1];
    const cacheEntry = tileCache.get(exactTileId);
    
    debug.cache(`Tile cache hit: ${exactTileId}, age: ${(Date.now() - cacheEntry.timestamp)/1000} seconds, entries: ${cacheEntry.data.length}`);
    return cacheEntry.data;
  }
  
  // Skip superset check if we've already failed to find a superset in this viewport fetch
  if (hasSupersetSearchFailed) {
    debug.cache(`Skipping superset search for ${tileId} (previously failed in this viewport)`);
    return null;
  }
  
  // No exact match, find the smallest back value that's larger than requested
  // Since the array is sorted, we can find it efficiently
  const supersetMatch = coordEntries.find(([backValue, _]) => backValue > requestedBackNum);
  
  if (supersetMatch) {
    const supersetTileId = supersetMatch[1];
    const supersetEntry = tileCache.get(supersetTileId);
    
    debug.cache(`Found superset tile ${supersetTileId} for requested tile ${tileId}`);
    
    // Calculate cutoff date based on requested back value
    let cutoffDate;
    
    // Use pre-calculated cutoff dates if available
    if (supersetEntry.cutoffDates && supersetEntry.cutoffDates[requestedBackNum]) {
      cutoffDate = supersetEntry.cutoffDates[requestedBackNum];
      debug.cache(`Using pre-calculated cutoff date for back=${requestedBackNum}`);
    } else {
      cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - requestedBackNum);
      debug.cache(`Calculated cutoff date for back=${requestedBackNum}`);
    }
    
    // Filter the data by observation date
    const filteredData = supersetEntry.data.filter(bird => {
      const obsDt = new Date(bird.obsDt);
      return obsDt >= cutoffDate;
    });
    
    debug.cache(`Filtered superset data from ${supersetEntry.data.length} to ${filteredData.length} records`);
    
    return filteredData;
  }
  
  // No suitable cache entry found - mark that we've failed to find a superset
  debug.cache(`No suitable superset found for tile ${tileId}, skipping future superset searches in this viewport fetch`);
  hasSupersetSearchFailed = true;
  return null;
}

/**
 * Gets missing tile IDs from the provided list (tiles that aren't in cache)
 * Takes into account our new caching strategy with back parameter
 * @param {string[]} tileIds - List of tile IDs to check
 * @returns {string[]} List of missing tile IDs
 */
function getMissingTiles(tileIds) {
  const missingTiles = [];
  const tilesToFetch = new Map(); // Map to track which tiles we need to fetch
  
  for (const tileId of tileIds) {
    // Check if we can get data for this tile (either exact or filtered from superset)
    if (!getTileCache(tileId)) {
      const [tileY, tileX, back] = tileId.split(':');
      const backNum = parseInt(back, 10);
      
      // Check if we already plan to fetch a larger back value for this tile
      const tileCoord = `${tileY}:${tileX}`;
      
      if (tilesToFetch.has(tileCoord) && tilesToFetch.get(tileCoord) >= backNum) {
        // We already plan to fetch this tile with a larger back value
        debug.cache(`Tile ${tileId} will be covered by planned fetch with larger back value`);
      } else {
        // Add or update this tile in our fetch plan
        tilesToFetch.set(tileCoord, backNum);
        missingTiles.push(tileId);
      }
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
  
  debug.info(`Cleared ${removed} expired cache entries (${tileCache.size} tile entries remaining)`);
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
    systemInfo: {
      nodeVersion: process.version,
      timestamp: now,
      uptime: process.uptime()
    }
  };
}

// Start periodic cleanup
const cleanupInterval = setInterval(clearExpired, CLEANUP_INTERVAL);

// Ensure we don't prevent Node process from exiting
cleanupInterval.unref();

/**
 * Resets the superset search failed flag
 * This should be called at the start of each viewport fetch
 */
function resetSupersetSearch() {
  hasSupersetSearchFailed = false;
  debug.cache('Reset superset search failed flag');
  
  // Optionally clear coordinate index to force rebuild
  // This keeps the index fresh and removes stale entries
  if (tileCoordIndex.size > 100) {
    debug.cache(`Clearing large coordinate index (${tileCoordIndex.size} entries)`);
    tileCoordIndex.clear();
  }
}

// tileCache is already defined above, so no need to redeclare it

module.exports = {
  // Tile-based caching
  getTileId,
  getTileCenter,
  getTilesForViewport,
  setTileCache,
  getTileCache,
  getMissingTiles,
  
  // Cache internals (used for cross-tile deduplication)
  tileCache,
  
  // Cache management
  resetSupersetSearch,
  clearExpired,
  clearAll,
  getStats
};
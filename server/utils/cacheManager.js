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
 * Description: In-memory cache manager for bird sighting data
 * 
 * Dependencies: debug.js
 */

const { debug } = require('./debug');

// Get cache TTL from environment variable or use default (4 hours)
const CACHE_TTL = (parseInt(process.env.CACHE_TTL_MINUTES, 10) || 240) * 60 * 1000;

// Get cleanup interval from environment variable or use default (15 minutes)
const CLEANUP_INTERVAL = (parseInt(process.env.CACHE_CLEANUP_INTERVAL_MINUTES, 10) || 15) * 60 * 1000;

// In-memory cache store
const cache = new Map();

/**
 * Generates a cache key for viewport + query parameters
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
 * Stores data in cache with expiration
 * @param {string} key - Cache key
 * @param {Array} data - Bird sighting data to cache
 */
function setCache(key, data) {
  const cacheEntry = {
    data,
    timestamp: Date.now(),
    expires: Date.now() + CACHE_TTL
  };
  
  cache.set(key, cacheEntry);
  debug.info(`🔵 Cache set: ${key}, entries: ${data.length}, expires in ${CACHE_TTL/1000/60} minutes`);
}

/**
 * Retrieves data from cache if available and not expired
 * @param {string} key - Cache key
 * @returns {Array|null} Cached data or null if not found/expired
 */
function getCache(key) {
  if (!cache.has(key)) {
    debug.info(`🔴 Cache miss: ${key}`);
    return null;
  }
  
  const cacheEntry = cache.get(key);
  
  // Check if expired
  if (Date.now() > cacheEntry.expires) {
    debug.info(`🟠 Cache expired: ${key}`);
    cache.delete(key);
    return null;
  }
  
  debug.info(`🟢 Cache hit: ${key}, age: ${(Date.now() - cacheEntry.timestamp)/1000} seconds, entries: ${cacheEntry.data.length}`);
  return cacheEntry.data;
}

/**
 * Clears all expired entries from cache
 * @returns {number} Number of entries removed
 */
function clearExpired() {
  let removed = 0;
  const now = Date.now();
  
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expires) {
      cache.delete(key);
      removed++;
    }
  }
  
  debug.info(`Cleared ${removed} expired cache entries, ${cache.size} remaining`);
  return removed;
}

/**
 * Clears the entire cache
 * @returns {number} Number of entries removed
 */
function clearAll() {
  const size = cache.size;
  cache.clear();
  debug.info(`Cleared entire cache, removed ${size} entries`);
  return size;
}

/**
 * Gets cache statistics
 * @returns {Object} Cache statistics
 */
function getStats() {
  const now = Date.now();
  let expired = 0;
  let totalSize = 0;
  let oldestTimestamp = now;
  
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expires) {
      expired++;
    }
    
    // Very rough estimation of memory usage
    totalSize += key.length + JSON.stringify(entry.data).length;
    
    if (entry.timestamp < oldestTimestamp) {
      oldestTimestamp = entry.timestamp;
    }
  }
  
  return {
    totalEntries: cache.size,
    expiredEntries: expired,
    validEntries: cache.size - expired,
    approximateSizeBytes: totalSize,
    oldestEntryAge: (now - oldestTimestamp) / 1000, // in seconds
    cacheConfig: {
      ttlMinutes: CACHE_TTL / 60000,
      cleanupIntervalMinutes: CLEANUP_INTERVAL / 60000
    }
  };
}

// Start periodic cleanup
const cleanupInterval = setInterval(clearExpired, CLEANUP_INTERVAL);

// Ensure we don't prevent Node process from exiting
cleanupInterval.unref();

module.exports = {
  generateCacheKey,
  setCache,
  getCache,
  clearExpired,
  clearAll,
  getStats
};
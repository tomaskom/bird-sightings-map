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
 * Description: Test client for tile caching API
 */

require('dotenv').config();
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

// Server URL - default to localhost:3000
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

/**
 * Makes API calls to test tile caching functionality
 */
async function testTileCaching() {
  console.log('==== Testing Tile-Based Caching ====');
  console.log(`Server URL: ${SERVER_URL}`);
  
  // Sample viewports to test
  const viewports = [
    // Santa Cruz, CA area
    { 
      name: 'Santa Cruz',
      minLat: 36.9455, 
      maxLat: 37.0135, 
      minLng: -122.0933, 
      maxLng: -121.9845, 
      back: '7'
    },
    // New York City area
    { 
      name: 'New York City',
      minLat: 40.6892, 
      maxLat: 40.8336, 
      minLng: -74.0272, 
      maxLng: -73.9010,
      back: '7'
    },
    // Small area - should require fewer tiles
    { 
      name: 'Small area',
      minLat: 37.0000, 
      maxLat: 37.0200, 
      minLng: -122.0200, 
      maxLng: -122.0000,
      back: '7'
    }
  ];
  
  // Test tile debug endpoint first
  for (const viewport of viewports) {
    console.log(`\n=== Testing viewport: ${viewport.name} ===`);
    await debugTiles(viewport);
  }
  
  // Clear cache before testing
  await clearCache();
  
  // Now test actual data fetching - first call should populate cache
  console.log('\n=== Testing data fetching (cold cache) ===');
  const testViewport = viewports[0]; // Use Santa Cruz viewport
  await fetchBirdData(testViewport);
  
  // Second call should use cache
  console.log('\n=== Testing data fetching (warm cache) ===');
  await fetchBirdData(testViewport);
  
  // Get cache stats at the end
  await getCacheStats();
}

/**
 * Tests the tile debug endpoint
 * @param {Object} viewport - Viewport parameters
 */
async function debugTiles(viewport) {
  try {
    const queryParams = new URLSearchParams({
      minLat: viewport.minLat,
      maxLat: viewport.maxLat,
      minLng: viewport.minLng,
      maxLng: viewport.maxLng,
      back: viewport.back
    });
    
    const url = `${SERVER_URL}/api/admin/tile-debug?${queryParams}`;
    console.log(`Fetching tile debug for viewport: ${url}`);
    
    const startTime = Date.now();
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Received response in ${Date.now() - startTime}ms`);
    console.log(`Tile count: ${data.tileCount}`);
    console.log(`Cache hits: ${data.cacheHits}`);
    console.log(`Config:`, data.config);
    console.log(`Corner tiles:`, {
      northWest: data.corners.northWest.tileId,
      northEast: data.corners.northEast.tileId,
      southWest: data.corners.southWest.tileId,
      southEast: data.corners.southEast.tileId
    });
  } catch (error) {
    console.error('Error debugging tiles:', error);
  }
}

/**
 * Fetches bird data for a viewport
 * @param {Object} viewport - Viewport parameters
 */
async function fetchBirdData(viewport) {
  try {
    const queryParams = new URLSearchParams({
      minLat: viewport.minLat,
      maxLat: viewport.maxLat,
      minLng: viewport.minLng,
      maxLng: viewport.maxLng,
      back: viewport.back
    });
    
    const url = `${SERVER_URL}/api/birds/viewport?${queryParams}`;
    console.log(`Fetching bird data for viewport: ${url}`);
    
    const startTime = Date.now();
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Received ${data.length} bird sightings in ${Date.now() - startTime}ms`);
    
    // Display first few bird records
    console.log('First few birds:');
    data.slice(0, 3).forEach((bird, index) => {
      console.log(`  ${index+1}. ${bird.comName} (${bird.speciesCode}) at [${bird.lat}, ${bird.lng}]`);
    });
    
  } catch (error) {
    console.error('Error fetching bird data:', error);
  }
}

/**
 * Gets cache statistics
 */
async function getCacheStats() {
  try {
    console.log('\n=== Cache Statistics ===');
    const url = `${SERVER_URL}/api/admin/cache-stats`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const stats = await response.json();
    console.log('Total entries:', stats.totalEntries);
    console.log('Viewport cache:', stats.viewportCache.totalEntries, 'entries');
    console.log('Tile cache:', stats.tileCache.totalEntries, 'entries');
    console.log('Tile size:', stats.cacheConfig.tileSizeKm, 'km');
    console.log('Approx. memory usage:', Math.round(stats.totalSizeBytes / 1024), 'KB');
    
  } catch (error) {
    console.error('Error getting cache stats:', error);
  }
}

/**
 * Clears expired cache entries
 */
async function clearCache() {
  try {
    console.log('\n=== Clearing Cache ===');
    const url = `${SERVER_URL}/api/admin/clear-expired-cache`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const result = await response.json();
    console.log(`Cleared ${result.removed} cache entries`);
    
  } catch (error) {
    console.error('Error clearing cache:', error);
  }
}

// Run the tests
testTileCaching().catch(console.error);
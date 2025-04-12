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
  
  // Generate a unique client ID for this test run
  const clientId = `test_client_${Date.now()}`;
  console.log(`Client ID: ${clientId}`);
  
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
  
  // Set up the SSE connection for tile updates
  console.log('\n=== Setting up SSE connection for tile updates ===');
  setupTileUpdatesListener(clientId);
  
  // Now test actual data fetching - first call should populate cache
  console.log('\n=== Testing data fetching (cold cache) ===');
  const testViewport = viewports[0]; // Use Santa Cruz viewport
  await fetchBirdData({...testViewport, clientId});
  
  // Wait a bit for background tiles to load
  console.log('\nWaiting 10 seconds for background tiles to load...');
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // Second call should use cache
  console.log('\n=== Testing data fetching (warm cache) ===');
  await fetchBirdData({...testViewport, clientId});
  
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
    
    // Add clientId if provided
    if (viewport.clientId) {
      queryParams.append('clientId', viewport.clientId);
    }
    
    const url = `${SERVER_URL}/api/birds/viewport?${queryParams}`;
    console.log(`Fetching bird data for viewport: ${url}`);
    
    const startTime = Date.now();
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }
    
    const responseData = await response.json();
    
    // The structure is now different with the new API response format
    const { birds, metadata } = responseData;
    
    console.log(`Received ${birds.length} bird sightings in ${Date.now() - startTime}ms`);
    
    // Log metadata about background loading
    if (metadata && metadata.hasBackgroundLoading) {
      console.log(`Background loading in progress: ${metadata.pendingTileCount} pending tiles`);
    }
    
    // Display first few bird records
    console.log('First few birds:');
    birds.slice(0, 3).forEach((bird, index) => {
      console.log(`  ${index+1}. ${bird.comName} (${bird.speciesCode}) at [${bird.lat}, ${bird.lng}]`);
    });
    
    return responseData;
  } catch (error) {
    console.error('Error fetching bird data:', error);
    return null;
  }
}

/**
 * Sets up an SSE connection to listen for tile updates
 * @param {string} clientId - Client ID for the SSE connection
 */
function setupTileUpdatesListener(clientId) {
  try {
    // We're not using a real EventSource here since this is Node.js
    // Instead, we'll manually set up a streaming connection
    const url = `${SERVER_URL}/api/birds/tile-updates?clientId=${clientId}`;
    console.log(`Setting up SSE connection: ${url}`);
    
    // Make a request to the SSE endpoint
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        console.log('SSE connection established');
        
        // Process the streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        function processEvents() {
          reader.read().then(({ done, value }) => {
            if (done) {
              console.log('SSE connection closed');
              return;
            }
            
            // Decode and append to buffer
            buffer += decoder.decode(value, { stream: true });
            
            // Process complete events in buffer
            const events = buffer.split('\n\n');
            buffer = events.pop() || ''; // Keep the last incomplete event in the buffer
            
            for (const event of events) {
              if (event.startsWith('data: ')) {
                const data = event.slice(6); // Remove 'data: ' prefix
                try {
                  const parsedData = JSON.parse(data);
                  handleTileUpdate(parsedData);
                } catch (e) {
                  console.error('Error parsing SSE data:', e);
                }
              }
            }
            
            // Continue reading
            processEvents();
          }).catch(err => {
            console.error('Error reading SSE stream:', err);
          });
        }
        
        processEvents();
      })
      .catch(error => {
        console.error('Error setting up SSE connection:', error);
      });
  } catch (error) {
    console.error('Error setting up tile updates listener:', error);
  }
}

/**
 * Handles a tile update event
 * @param {Object} data - Tile update data
 */
function handleTileUpdate(data) {
  if (data.type === 'connected') {
    console.log('SSE connected:', data.message);
    return;
  }
  
  if (data.type === 'tileUpdate') {
    console.log('\n=== Received Tile Update ===');
    console.log(`Completed Tiles: ${data.data.completedTileIds.length}`);
    
    if (data.data.isComplete) {
      console.log('All background tiles completed!');
    } else {
      console.log(`Batch ${data.data.batchNumber}/${data.data.totalBatches} completed`);
      console.log(`Remaining tiles: ${data.data.remainingTileIds.length}`);
    }
    
    // Here in a real client you would refresh the map with the new data
    console.log('Would update map display with new data here...');
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
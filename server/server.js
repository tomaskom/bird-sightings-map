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
 * Project: birds-sightings-map
 * Description: Map for eBird records of bird sightings
 * 
 * Dependencies:
 * - OpenStreetMap data © OpenStreetMap contributors (ODbL)
 * - Leaflet © 2010-2024 Vladimir Agafonkin (BSD-2-Clause)
 * - eBird data provided by Cornell Lab of Ornithology
 * - Photos provided by BirdWeather
 */

require('dotenv').config();
const rateLimit = require('express-rate-limit');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { debug } = require('./utils/debug');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const { getBirdDataForViewport } = require('./services/birdDataService');
const { isValidViewport } = require('./utils/viewportUtils');
const { 
  getStats, 
  clearExpired,
  getTilesForViewport,
  getTileCenter,
  getTileId,
  getTileCache
} = require('./utils/cacheManager');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Verify environment on startup
debug.info('Server initializing with config:', {
  apiKey: process.env.EBIRD_API_KEY ? 'Present' : 'Missing',
  origins: process.env.ALLOWED_ORIGINS,
  port: port,
  cacheTtl: process.env.CACHE_TTL_MINUTES || '240 (default)'
});

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS.split(',');
debug.debug('Configuring CORS with origins:', allowedOrigins);

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET'],
  credentials: true
}));

// Static file serving
app.use(express.static(path.join(__dirname, '../client/dist')));

// Nominatim rate limiter (1 request per second)
const geocodeLimiter = rateLimit({
  windowMs: 1000,
  max: 2,
  message: { error: 'Too many location searches, please wait a moment' }
});

// Simple admin endpoint authentication middleware
const adminAuth = (req, res, next) => {
  const apiKey = req.query.key || req.headers['x-api-key'];
  const envApiKey = process.env.ADMIN_API_KEY;
  
  // If no API key is set in env, only allow from localhost
  if (!envApiKey) {
    const ip = req.ip || req.connection.remoteAddress;
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
      return next();
    }
    debug.warn('Admin access attempt without API key from:', ip);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Check the provided API key
  if (apiKey === envApiKey) {
    return next();
  }
  
  debug.warn('Invalid admin API key attempt');
  return res.status(401).json({ error: 'Unauthorized' });
};

// Nominatim configuration
const NOMINATIM_CONFIG = {
  headers: {
    'User-Agent': 'BirdSightingsMap/1.0 tomaskom@gmail.com'
  }
};

/**
 * Fetches location data from Nominatim forward geocoding API
 * @param {string} query - Search query for location
 * @returns {Promise<Object>} Location data if found
 * @throws {Error} If the API request fails
 */
const fetchForwardGeocoding = async (query) => {
  debug.debug('Forward geocoding request:', query);
  
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.append('format', 'json');
  url.searchParams.append('q', query);

  try {
    const response = await fetch(url, NOMINATIM_CONFIG);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data && data.length > 0) {
      const firstResult = data[0];
      return {
        found: true,
        lat: parseFloat(firstResult.lat),
        lon: parseFloat(firstResult.lon),
        displayName: firstResult.display_name
      };
    }

    return {
      found: false,
      message: 'No location found'
    };
  } catch (error) {
    debug.error('Forward Geocoding API request failed:', error);
    throw new Error(`Failed to fetch forward geocoding data: ${error.message}`);
  }
};

/**
 * Fetches location details from Nominatim reverse geocoding API
 * @param {number} lat - Latitude coordinate
 * @param {number} lon - Longitude coordinate
 * @returns {Promise<Object>} Location details if found
 * @throws {Error} If the API request fails
 */
const fetchReverseGeocoding = async (lat, lon) => {
  debug.debug('Reverse geocoding request:', { lat, lon });
  
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.append('format', 'json');
  url.searchParams.append('lat', lat.toString());
  url.searchParams.append('lon', lon.toString());

  try {
    const response = await fetch(url, NOMINATIM_CONFIG);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    // Ensure a consistent response structure
    if (data && data.display_name) {
      return {
        found: true,
        displayName: data.display_name,
        address: data.address || {},
        lat: parseFloat(lat),
        lon: parseFloat(lon),
        boundingbox: data.boundingbox || null
      };
    }

    return {
      found: false,
      message: 'No location details found',
      lat: parseFloat(lat),
      lon: parseFloat(lon)
    };
  } catch (error) {
    debug.error('Reverse Geocoding API request failed:', error);
    throw new Error(`Failed to fetch reverse geocoding data: ${error.message}`);
  }
};

/**
 * Fetch bird sightings from eBird API
 * @param {Object} query Request query parameters
 * @returns {Promise<Object>} Bird sighting data
 */
const fetchBirdData = async (query) => {
  const { lat, lng, dist, species = 'recent', back = '7' } = query;
  const baseUrl = 'https://api.ebird.org/v2/data/obs/geo';

  let endpoint;
  let speciesParam = '';

  if (species === 'rare') {
    endpoint = 'recent/notable';
  } else {
    endpoint = 'recent';
    if (species !== 'recent') {
      endpoint = `recent/${species}`;
    }
  }

  const url = `${baseUrl}/${endpoint}?lat=${lat}&lng=${lng}&dist=${dist}&detail=simple&hotspot=false&back=${back}`;

  debug.debug('Constructing eBird request:', {
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
  debug.debug('eBird raw response:', responseText);

  try {
    const data = JSON.parse(responseText);
    debug.info('Successfully parsed bird records:', data.length);
    return data;
  } catch (error) {
    debug.error('Failed to parse eBird response:', error);
    throw new Error('Invalid response format from eBird API');
  }
};

/**
 * Fetches region species list from eBird API
 * @param {string} regionCode - eBird region code (e.g., "US-CA")
 * @returns {Promise<Object[]>} Region species data
 * @throws {Error} If API request fails
 */
const fetchRegionSpecies = async (regionCode) => {
  const baseUrl = 'https://api.ebird.org/v2/product/spplist';
  const url = `${baseUrl}/${regionCode}`;

  debug.debug('Constructing region species request:', {
    endpoint: baseUrl,
    region: regionCode
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
  debug.debug('eBird raw response:', responseText);

  try {
    const data = JSON.parse(responseText);
    debug.info('Successfully parsed species records:', data.length);
    return data;
  } catch (error) {
    debug.error('Failed to parse eBird response:', error);
    throw new Error('Invalid response format from eBird API');
  }
};

/**
 * Fetches subregions for a parent region from eBird API
 * @param {string} parentRegionCode - Parent eBird region code (e.g., "US")
 * @param {string} regionType - Type of subregion (e.g., "subnational1")
 * @returns {Promise<Object[]>} Subregion data with codes and names
 * @throws {Error} If API request fails
 */
const fetchSubregions = async (parentRegionCode, regionType = 'subnational1') => {
  const baseUrl = 'https://api.ebird.org/v2/ref/region/list';
  const url = `${baseUrl}/${regionType}/${parentRegionCode}`;

  debug.debug('Constructing subregion request:', {
    endpoint: baseUrl,
    parentRegion: parentRegionCode,
    regionType: regionType
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
  debug.debug('eBird raw response:', responseText);

  try {
    const data = JSON.parse(responseText);
    debug.info('Successfully parsed subregion records:', data.length);
    return data;
  } catch (error) {
    debug.error('Failed to parse eBird response:', error);
    throw new Error('Invalid response format from eBird API');
  }
};

/**
 * Fetches region information including boundaries from eBird API
 * @param {string} regionCode - eBird region code
 * @returns {Promise<Object>} Region information with name and boundaries
 * @throws {Error} If API request fails
 */
const fetchRegionInfo = async (regionCode) => {
  const baseUrl = 'https://api.ebird.org/v2/ref/region/info';
  const url = `${baseUrl}/${regionCode}`;

  debug.debug('Constructing region info request:', {
    endpoint: baseUrl,
    region: regionCode
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
  debug.debug('eBird raw response:', responseText);

  try {
    const data = JSON.parse(responseText);
    debug.info('Successfully parsed region info');
    return data;
  } catch (error) {
    debug.error('Failed to parse eBird response:', error);
    throw new Error('Invalid response format from eBird API');
  }
};


// API Routes
app.get('/api/birds', async (req, res) => {
  debug.info('Received bird sighting request:', req.query);

  try {
    const data = await fetchBirdData(req.query);
    res.json(data);
  } catch (error) {
    debug.error('Error handling bird request:', error.message);
    res.status(500).json({ error: 'Failed to fetch bird data' });
  }
});


app.get('/api/region-species/:regionCode', async (req, res) => {
  const { regionCode } = req.params;
  debug.info('Received region species request:', regionCode);

  try {
    const data = await fetchRegionSpecies(regionCode);
    res.json(data);
  } catch (error) {
    debug.error('Error handling region species request:', error.message);
    res.status(500).json({ error: 'Failed to fetch region species data' });
  }
});

app.get('/api/subregions/:parentRegionCode', async (req, res) => {
  const { parentRegionCode } = req.params;
  const { type = 'subnational1' } = req.query;
  debug.info('Received subregions request:', { parentRegionCode, type });

  try {
    const data = await fetchSubregions(parentRegionCode, type);
    res.json(data);
  } catch (error) {
    debug.error('Error handling subregions request:', error.message);
    res.status(500).json({ error: 'Failed to fetch subregions data' });
  }
});

app.get('/api/region-info/:regionCode', async (req, res) => {
  const { regionCode } = req.params;
  debug.info('Received region info request:', regionCode);

  try {
    const data = await fetchRegionInfo(regionCode);
    res.json(data);
  } catch (error) {
    debug.error('Error handling region info request:', error.message);
    res.status(500).json({ error: 'Failed to fetch region info' });
  }
});

app.get('/api/forward-geocode', geocodeLimiter, async (req, res) => {
  const { q } = req.query;
  debug.info('Received forward geocoding request:', { query: q });

  if (!q || typeof q !== 'string') {
    debug.warn('Invalid forward geocoding query received');
    return res.status(400).json({ 
      found: false,
      error: 'Invalid search query' 
    });
  }

  try {
    const data = await fetchForwardGeocoding(q);
    res.json(data);
  } catch (error) {
    debug.error('Error handling forward geocoding request:', error);
    res.status(500).json({ 
      found: false,
      error: 'Failed to geocode location',
      details: error.message 
    });
  }
});

app.get('/api/reverse-geocode', geocodeLimiter, async (req, res) => {
  const { lat, lon } = req.query;
  debug.info('Reverse geocode request received:', { lat, lon });

  if (!lat || !lon || isNaN(parseFloat(lat)) || isNaN(parseFloat(lon))) {
    debug.warn('Invalid coordinates received:', { lat, lon });
    return res.status(400).json({ 
      found: false,
      error: 'Invalid coordinates' 
    });
  }

  try {
    const data = await fetchReverseGeocoding(lat, lon);
    res.json(data);
  } catch (error) {
    debug.error('Reverse geocoding error:', error);
    res.status(500).json({ 
      found: false,
      error: 'Failed to reverse geocode location',
      details: error.message 
    });
  }
});

/**
 * Handles bird sighting requests based on viewport coordinates
 * Calculates appropriate radius and uses caching for efficiency
 * Returns both regular and rare birds to allow client-side filtering
 * @route GET /api/birds/viewport
 */
app.get('/api/birds/viewport', async (req, res) => {
  debug.info('Received viewport-based bird sighting request:', req.query);
  
  try {
    const { minLat, maxLat, minLng, maxLng, back = '7' } = req.query;
    
    // Create viewport object
    const viewport = {
      minLat,
      maxLat,
      minLng,
      maxLng,
      back
    };
    
    // Validate viewport parameters
    if (!isValidViewport(viewport)) {
      return res.status(400).json({ error: 'Invalid viewport parameters' });
    }
    
    // Get bird data for this viewport (both regular and rare)
    const data = await getBirdDataForViewport(viewport);
    res.json(data);
  } catch (error) {
    debug.error('Error handling viewport bird request:', error.message);
    res.status(500).json({ error: 'Failed to fetch bird data' });
  }
});

/**
 * API endpoint for cache statistics (admin use)
 * @route GET /api/admin/cache-stats
 */
app.get('/api/admin/cache-stats', adminAuth, (req, res) => {
  const stats = getStats();
  debug.info('Cache stats requested:', stats);
  res.json(stats);
});

/**
 * API endpoint for manually clearing expired cache entries
 * @route GET /api/admin/clear-expired-cache
 */
app.get('/api/admin/clear-expired-cache', adminAuth, (req, res) => {
  const removed = clearExpired();
  debug.info(`Manually cleared ${removed} expired cache entries`);
  res.json({ success: true, removed });
});

/**
 * API endpoint to debug tile calculations for a given viewport
 * @route GET /api/admin/tile-debug
 */
app.get('/api/admin/tile-debug', adminAuth, (req, res) => {
  const { minLat, maxLat, minLng, maxLng, back = '7' } = req.query;
  
  debug.tile('Tile debug request:', { minLat, maxLat, minLng, maxLng, back });
  
  if (!minLat || !maxLat || !minLng || !maxLng || 
      isNaN(parseFloat(minLat)) || isNaN(parseFloat(maxLat)) || 
      isNaN(parseFloat(minLng)) || isNaN(parseFloat(maxLng))) {
    debug.warn('Invalid viewport parameters for tile debug');
    return res.status(400).json({ error: 'Invalid viewport parameters' });
  }
  
  const viewport = {
    minLat: parseFloat(minLat),
    maxLat: parseFloat(maxLat),
    minLng: parseFloat(minLng),
    maxLng: parseFloat(maxLng),
    back
  };
  
  try {
    const startTime = Date.now();
    
    const tileIds = getTilesForViewport(viewport);
    debug.tile(`Generated ${tileIds.length} tiles for viewport`);
    
    const cacheHits = tileIds.filter(id => getTileCache(id)).length;
    debug.cache(`${cacheHits}/${tileIds.length} tiles are in cache`);
    
    const tileCenters = tileIds.map(id => ({
      tileId: id,
      center: getTileCenter(id),
      inCache: !!getTileCache(id)
    }));
    
    // Calculate the corners of the viewport and their tiles
    const corners = {
      northWest: {
        lat: viewport.maxLat, 
        lng: viewport.minLng,
        tileId: getTileId(viewport.maxLat, viewport.minLng, viewport.back)
      },
      northEast: {
        lat: viewport.maxLat, 
        lng: viewport.maxLng,
        tileId: getTileId(viewport.maxLat, viewport.maxLng, viewport.back)
      },
      southWest: {
        lat: viewport.minLat, 
        lng: viewport.minLng,
        tileId: getTileId(viewport.minLat, viewport.minLng, viewport.back)
      },
      southEast: {
        lat: viewport.minLat, 
        lng: viewport.maxLng,
        tileId: getTileId(viewport.minLat, viewport.maxLng, viewport.back)
      }
    };
    
    // Get configuration
    const tileSizeKm = parseFloat(process.env.TILE_SIZE_KM || 2);
    const radiusBuffer = parseFloat(process.env.TILE_RADIUS_BUFFER || 1.1);
    const useTileCaching = process.env.USE_TILE_CACHING !== 'false';
    
    debug.perf(`Tile debug processing completed in ${Date.now() - startTime}ms`);
    
    const result = {
      viewport,
      config: {
        tileSizeKm,
        radiusBuffer,
        useTileCaching,
        maxLatitude: 85 // Limit used to avoid pole issues
      },
      corners,
      tileCount: tileIds.length,
      cacheHits,
      tiles: tileCenters
    };
    
    debug.response('Sending tile debug response');
    res.json(result);
  } catch (error) {
    debug.error('Error in tile debug endpoint:', error);
    res.status(500).json({ error: 'Error processing tile debug request' });
  }
});

// Handle React routing
app.get('*', (req, res) => {
  debug.debug('Serving React app for path:', req.path);
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Start server
app.listen(port, () => {
  debug.info(`Server running on port ${port}`);
  debug.info('Debug level:', process.env.SERVER_DEBUG_LEVEL);
});
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
const path = require('path');
const express = require('express');
const cors = require('cors');
const { debug } = require('./utils/debug');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Verify environment on startup
debug.info('Server initializing with config:', {
  apiKey: process.env.EBIRD_API_KEY ? 'Present' : 'Missing',
  origins: process.env.ALLOWED_ORIGINS,
  port: port
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

/**
 * Fetch bird sightings from eBird API
 * @param {Object} query Request query parameters
 * @returns {Promise<Object>} Bird sighting data
 */
const fetchBirdData = async (query) => {
  const { lat, lng, dist, type = 'recent', back = '7' } = query;
  const baseUrl = 'https://api.ebird.org/v2/data/obs/geo';
  const endpoint = type === 'rare' ? 'recent/notable' : 'recent';
  const url = `${baseUrl}/${endpoint}?lat=${lat}&lng=${lng}&dist=${dist}&detail=simple&hotspot=false&back=${back}`;
  
  debug.debug('Constructing eBird request:', {
    endpoint,
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
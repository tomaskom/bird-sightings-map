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
 * Project: rare-birds
 * Description: Map for eBird records of rare bird sightings
 * 
 * Dependencies:
 * - OpenStreetMap data © OpenStreetMap contributors (ODbL)
 * - Leaflet © 2010-2024 Vladimir Agafonkin (BSD-2-Clause)
 * - eBird data provided by Cornell Lab of Ornithology
 */

const path = require('path');
const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();
console.log('API Key loaded:', process.env.EBIRD_API_KEY ? 'Yes' : 'No');

const app = express();

// Enable CORS for development
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS.split(','),
  methods: ['GET'],
  credentials: true
}));

// Serve static files from the React app build directory
app.use(express.static(path.join(__dirname, '../client/dist')));

// Bird sightings endpoint
app.get('/api/birds', async (req, res) => {
  const { lat, lng } = req.query;
  
  console.log('Received request for lat:', lat, 'lng:', lng);
  
  try {
    const url = `https://api.ebird.org/v2/data/obs/geo/recent/notable?lat=${lat}&lng=${lng}&detail=simple&dist=25&hotspot=false&back=7&maxResults=100`;
    console.log('Fetching from eBird URL:', url);

    const response = await fetch(
      url,
      {
        headers: {
          'x-ebirdapitoken': process.env.EBIRD_API_KEY
        }
      }
    );
    
    console.log('eBird API response status:', response.status);
    const responseText = await response.text();
    // console.log('eBird response:', responseText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('eBird API error:', errorText);
      throw new Error('eBird API request failed');
    }
    
   // const data = await response.json();
    const data = JSON.parse(responseText);
    res.json(data);
  } catch (error) {
    console.error('Error fetching bird data:', error.message);
    if (error.response) {
      console.error('Response:', await error.response.text());
    }
    res.status(500).json({ error: 'Failed to fetch bird data' });
  }
});

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

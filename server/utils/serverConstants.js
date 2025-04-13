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
 * Description: Server-side constants and configuration values
 */

const serverConstants = {
  // Cache settings
  CACHE: {
    // How long cached data remains valid (in minutes)
    TTL_MINUTES: parseInt(process.env.CACHE_TTL_MINUTES, 10) || 240,
    
    // How often to check and clear expired cache entries (in minutes)
    CLEANUP_INTERVAL_MINUTES: parseInt(process.env.CACHE_CLEANUP_INTERVAL_MINUTES, 10) || 15
  },

  // Tile-based caching settings
  TILES: {
    // Size of each tile in kilometers
    SIZE_KM: parseFloat(process.env.TILE_SIZE_KM) || 2,
    
    // Buffer multiplier for tile radius to ensure data at boundaries
    RADIUS_BUFFER: parseFloat(process.env.TILE_RADIUS_BUFFER) || 1.1,
    
    // Buffer percentage for viewport edges when determining tiles to fetch (0.1 = 10%)
    VIEWPORT_BUFFER: parseFloat(process.env.TILE_VIEWPORT_BUFFER) || 0.1
  },

  // API request settings
  API: {
    // Maximum number of parallel API requests
    MAX_PARALLEL_REQUESTS: parseInt(process.env.MAX_PARALLEL_REQUESTS, 10) || 1,
    
    // Maximum initial batches to fetch immediately (remaining batches fetch in background)
    // Set to a very high number to force fetching all tiles synchronously (no background loading)
    MAX_INITIAL_BATCHES: parseInt(process.env.MAX_INITIAL_BATCHES, 10) || 1000
  },

  // Geographic constraints
  GEO: {
    // Maximum latitude to avoid issues near poles
    MAX_LATITUDE: 85,
    
    // Earth's radius in kilometers for distance calculations
    EARTH_RADIUS_KM: 6371
  }
};

module.exports = serverConstants;
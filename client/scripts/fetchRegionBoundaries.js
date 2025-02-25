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
 * Description: Utility script to fetch all region and subregion boundary data 
 * from eBird API and store it in a static JSON file for efficient lookup
 * 
 * Run with: node fetchRegionBoundaries.js
 */
import * as dotenv from 'dotenv';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

// Setup ESM compatible __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Configuration
const OUTPUT_FILE = path.join(__dirname, '../data/region_boundaries.json');
const DATA_DIR = path.join(__dirname, '../data');
const EBIRD_API_KEY = process.env.EBIRD_API_KEY;

// List of country codes to fetch (can be extended)
// Using a smaller set for testing - add more countries as needed
const COUNTRIES = [
  'US', 'CA', 'MX', 'GB', 'ES', 'FR', 'DE', 'IT', 'AU', 'NZ',
  'ZA', 'BR', 'AR', 'CL', 'PE', 'CO', 'EC', 'JP', 'KR', 'CN'
];

/**
 * Sleeps for the specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetches data from eBird API with rate limiting
 * @param {string} url - API endpoint URL
 * @returns {Promise<Object>} - API response data
 */
const fetchWithRateLimit = async (url) => {
  try {
    console.log(`Fetching ${url}`);
    const response = await fetch(url, {
      headers: {
        'x-ebirdapitoken': EBIRD_API_KEY
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Sleep to respect rate limits
    await sleep(1000);
    
    return data;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error.message);
    throw error;
  }
};

/**
 * Fetches all subregions for a parent region
 * @param {string} parentCode - Parent region code
 * @returns {Promise<Array<Object>>} - List of subregions
 */
const fetchSubregions = async (parentCode) => {
  const url = `https://api.ebird.org/v2/ref/region/list/subnational1/${parentCode}`;
  return fetchWithRateLimit(url);
};

/**
 * Fetches region information including boundaries
 * @param {string} regionCode - Region code
 * @returns {Promise<Object>} - Region information
 */
const fetchRegionInfo = async (regionCode) => {
  const url = `https://api.ebird.org/v2/ref/region/info/${regionCode}`;
  return fetchWithRateLimit(url);
};

/**
 * Main function to fetch all boundaries
 */
const fetchAllBoundaries = async () => {
  try {
    console.log('Starting boundary data collection');
    
    // Ensure data directory exists
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
    
    const allRegions = {};
    
    // Process each country
    for (const country of COUNTRIES) {
      console.log(`\nProcessing country: ${country}`);
      
      try {
        // Get country info
        const countryInfo = await fetchRegionInfo(country);
        allRegions[country] = {
          name: countryInfo.result,
          bounds: countryInfo.bounds,
          subregions: {}
        };
        
        // Get all subregions
        const subregions = await fetchSubregions(country);
        console.log(`Found ${subregions.length} subregions for ${country}`);
        
        // Get info for each subregion
        for (const subregion of subregions) {
          try {
            const subregionInfo = await fetchRegionInfo(subregion.code);
            allRegions[country].subregions[subregion.code] = {
              name: subregion.name,
              bounds: subregionInfo.bounds
            };
            console.log(`Added ${subregion.code} (${subregion.name})`);
          } catch (error) {
            console.error(`Error fetching info for ${subregion.code}:`, error.message);
          }
        }
      } catch (error) {
        console.error(`Error processing country ${country}:`, error.message);
      }
    }
    
    // Write data to file
    console.log('\nWriting data to file...');
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(allRegions, null, 2));
    console.log(`Data written to ${OUTPUT_FILE}`);
    
    // Create a module export file for use in client code
    const moduleContent = `/**
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
 * Description: Region boundary data for eBird regions
 */

// Exported eBird region boundary data
// Generated by fetchRegionBoundaries.js
export const REGION_BOUNDARIES = ${JSON.stringify(allRegions)};
`;
    
    await fs.writeFile(path.join(DATA_DIR, 'regionBoundaries.js'), moduleContent);
    console.log(`Module export file created`);
    
  } catch (error) {
    console.error('Error in main process:', error);
  }
};

// Run the script
try {
  await fetchAllBoundaries();
  console.log('Script completed');
} catch (err) {
  console.error('Script failed:', err);
  process.exit(1);
}
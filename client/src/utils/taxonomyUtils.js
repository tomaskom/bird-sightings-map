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
 * Description: Utility functions for working with bird taxonomy data
 */

import { debug } from './debug';
import { TAXONOMY_DATA } from './taxonomyData';

/**
 * Lookup map
 */
const taxonomyMap = new Map(
    TAXONOMY_DATA.map(entry => [entry.speciesCode, entry])
);

debug.info('Initialized taxonomy map with entries:', taxonomyMap.size);

/**
 * @typedef {Object} TaxonomyEntry
 * @property {number} taxonOrder - Taxonomic sort order
 * @property {string} category - Type of entry (species, hybrid, etc)
 * @property {string} speciesCode - Code for API calls
 * @property {string} commonName - Common name for display
 * @property {string} scientificName - Scientific name for display
 * @property {string} speciesGroup - Group for categorization
 */

/**
 * Cache for region-specific species lists with TTL
 * @type {Object.<string, {entries: TaxonomyEntry[], timestamp: number}>}
 */
const regionSpeciesCache = {};

/**
 * Time-to-live for cached species data (24 hours)
 * @type {number}
 */
const CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * Processes raw species codes from eBird API into full taxonomy entries
 * @param {string[]} speciesCodes - Array of species codes from eBird
 * @returns {TaxonomyEntry[]} Processed taxonomy entries
 */
const processSpeciesCodes = (speciesCodes) => {
  if (!Array.isArray(speciesCodes)) {
    debug.error('Invalid species codes format:', speciesCodes);
    return [];
  }

  debug.debug('Processing species codes:', { 
    totalCodes: speciesCodes.length,
    sampleCodes: speciesCodes.slice(0, 3)
  });
  
  const processed = speciesCodes
    .map(code => {
      const entry = taxonomyMap.get(code);
      if (!entry) {
        debug.warn('Species code not found in taxonomy:', code);
      }
      return entry;
    })
    .filter(entry => entry !== undefined)
    .sort((a, b) => a.taxonOrder - b.taxonOrder);

  debug.info('Processed species results:', {
    inputCount: speciesCodes.length,
    matchedCount: processed.length,
    firstFew: processed.slice(0, 3)
  });

  return processed;
};

/**
 * Gets cached species data for a region if available
 * @param {string} regionCode - Region code to get data for
 * @returns {TaxonomyEntry[]|null} Cached species data or null if not available
 */
export const getCachedSpecies = (regionCode) => {
    debug.debug('Getting cached species for region:', regionCode);
    const cached = regionSpeciesCache[regionCode];
    if (cached && Date.now() - cached.timestamp <= CACHE_TTL) {
        debug.debug('Found valid cached species data:', {
            count: cached.entries.length,
            age: Date.now() - cached.timestamp
        });
        return cached.entries;
    }
    return null;
};

/**
 * Fetches species list for a region from eBird API
 * @param {string} regionCode - Region code to fetch species for
 * @returns {Promise<TaxonomyEntry[]>} Processed species list
 * @throws {Error} If API call fails
 */
export const fetchRegionSpecies = async (regionCode) => {
    debug.debug('Fetching species for region:', regionCode);
    
    const response = await fetch(`${import.meta.env.VITE_API_URL}/api/region-species/${regionCode}`);
    
    if (!response.ok) {
      debug.error('Failed to fetch region species:', response.status);
      throw new Error(`Failed to fetch species for region ${regionCode}`);
    }
    
    const speciesCodes = await response.json();
    debug.info('Received species codes:', { 
      count: speciesCodes.length,
      sample: speciesCodes.slice(0, 3)
    });
    
    const species = processSpeciesCodes(speciesCodes);
    debug.info('Processed into taxonomy entries:', { 
      count: species.length,
      sample: species.slice(0, 3).map(s => ({
        code: s.speciesCode,
        name: s.commonName
      }))
    });
    
    return species;
  };

/**
 * Filters species by name, matching substrings in common names
 * @param {string} searchTerm - Search term to filter by
 * @param {string} regionCode - Current region code to filter against 
 * @returns {TaxonomyEntry[]} Filtered list of taxonomy entries
 */
export const filterSpeciesByName = (searchTerm, regionCode) => {
    debug.debug('Filtering species:', { searchTerm, regionCode });

    if (!searchTerm) return [];

    const cached = getCachedSpecies(regionCode);
    if (!cached) {
        debug.warn('No valid cache found for region:', regionCode);
        return [];
    }

    const normalizedTerm = searchTerm.toLowerCase();
    return cached.filter(entry =>
        entry.commonName.toLowerCase().includes(normalizedTerm)
    );
};

/**
 * Updates the cache with species for a specific region
 * @param {string} regionCode - Region code to update cache for
 * @param {TaxonomyEntry[]} species - List of species in the region
 */
export const updateRegionCache = (regionCode, species) => {
  if (!Array.isArray(species)) {
    debug.error('Invalid species data for cache:', species);
    return;
  }
  
  debug.debug('Updating region cache:', { 
    regionCode, 
    speciesCount: species.length,
    sample: species.slice(0, 3).map(s => s.commonName)
  });
  
  regionSpeciesCache[regionCode] = {
    entries: species,
    timestamp: Date.now()
  };
  
  debug.info('Cache updated, current regions:', Object.keys(regionSpeciesCache));
};

/**
 * Clears cached species data for a region
 * @param {string} regionCode - Region code to clear from cache
 */
export const clearRegionCache = (regionCode) => {
    debug.debug('Clearing region cache:', regionCode);
    delete regionSpeciesCache[regionCode];
};

/**
 * Checks if species data is cached and valid for a region
 * @param {string} regionCode - Region code to check
 * @returns {boolean} Whether the region has valid cached data
 */
export const isRegionCached = (regionCode) => {
    const cached = regionSpeciesCache[regionCode];
    return cached && Date.now() - cached.timestamp <= CACHE_TTL;
};

// Export cache for testing purposes only
export const _regionSpeciesCache = regionSpeciesCache;
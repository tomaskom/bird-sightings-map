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
 * Cache for region-specific species lists
 * @type {Object.<string, TaxonomyEntry[]>}
 */
const regionSpeciesCache = {};

/**
 * Filters species by name, matching substrings in common names
 * @param {string} searchTerm - Search term to filter by
 * @param {string} regionCode - Current region code to filter against 
 * @returns {TaxonomyEntry[]} Filtered list of taxonomy entries
 */
export const filterSpeciesByName = (searchTerm, regionCode) => {
  debug.debug('Filtering species:', { searchTerm, regionCode });
  
  if (!searchTerm) return [];
  
  const normalizedTerm = searchTerm.toLowerCase();
  const regionalSpecies = regionSpeciesCache[regionCode];
  
  if (!regionalSpecies) {
    debug.warn('No species cache found for region:', regionCode);
    return [];
  }
  
  return regionalSpecies.filter(entry =>
    entry.commonName.toLowerCase().includes(normalizedTerm)
  );
};

/**
 * Updates the cache with species for a specific region
 * @param {string} regionCode - Region code to update cache for
 * @param {TaxonomyEntry[]} species - List of species in the region
 */
export const updateRegionCache = (regionCode, species) => {
  debug.debug('Updating region cache:', { regionCode, speciesCount: species.length });
  regionSpeciesCache[regionCode] = species;
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
 * Checks if species data is cached for a region
 * @param {string} regionCode - Region code to check
 * @returns {boolean} Whether the region has cached data
 */
export const isRegionCached = (regionCode) => {
  return !!regionSpeciesCache[regionCode];
};

// Export cache for testing purposes only
export const _regionSpeciesCache = regionSpeciesCache;
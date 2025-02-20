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
 * Description: Build script to process eBird taxonomy CSV and generate TypeScript data file
 * 
 * Dependencies:
 * - csv-parse/sync
 * - fs/promises
 * - path
 * - url
 */

import { parse } from 'csv-parse/sync';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { debug } from './build-debug.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Represents a processed taxonomy entry
 * @typedef {Object} TaxonomyEntry
 * @property {number} taxonOrder - Numeric order in taxonomy
 * @property {string} category - Type of entry (species, hybrid, etc)
 * @property {string} speciesCode - eBird species code
 * @property {string} commonName - Common name in English
 * @property {string} scientificName - Scientific binomial name
 */

/**
 * Processes raw CSV data into structured taxonomy entries
 * @param {string} csvData - Raw CSV content
 * @returns {TaxonomyEntry[]} Array of processed taxonomy entries
 * @throws {Error} If CSV parsing fails
 */
function processCsvData(csvData) {
  const records = parse(csvData, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  debug.debug('First record structure:', records[0]);
  
  return records.map((record, index) => ({
    taxonOrder: index + 1,
    category: record.CATEGORY || '',
    speciesCode: record.SPECIES_CODE || '',
    commonName: record.PRIMARY_COM_NAME || '',
    scientificName: record.SCI_NAME || ''
  }));
}

/**
 * Generates TypeScript type definitions for taxonomy data
 * @returns {string} TypeScript interface definition
 */
function generateTypeDefinition() {
  const definition = `interface TaxonomyEntry {
  taxonOrder: number;    // For sorting/display
  category: string;      // Type of entry (species, hybrid, etc)
  speciesCode: string;   // For API calls
  commonName: string;    // For search/display
  scientificName: string;// For display
}

export type { TaxonomyEntry };
`;
  debug.debug('Generated type definition');
  return definition;
}

/**
 * Main build process for taxonomy data
 * @returns {Promise<void>}
 */
async function buildTaxonomyData() {
  try {
    debug.info('Starting taxonomy build process...');
    
    // Read CSV file
    const csvPath = path.join(path.dirname(__dirname), 'data', 'ebird_taxonomy.csv');
    const csvData = await readFile(csvPath, 'utf-8');
    debug.debug('Read CSV file from:', csvPath);
    
    // Process data
    const taxonomyData = processCsvData(csvData);
    debug.debug(`Processed ${taxonomyData.length} taxonomy entries`);
    
    // Generate output files
    const outputDir = path.join(path.dirname(__dirname), 'src', 'utils');
    
    // Write type definitions
    await writeFile(
      path.join(outputDir, 'taxonomyTypes.ts'),
      generateTypeDefinition(),
      'utf-8'
    );
    debug.info('Generated taxonomyTypes.ts');
    
    // Write data file
    await writeFile(
      path.join(outputDir, 'taxonomyData.ts'),
      `import type { TaxonomyEntry } from './taxonomyTypes';

export const TAXONOMY_DATA: TaxonomyEntry[] = ${JSON.stringify(taxonomyData, null, 2)};`,
      'utf-8'
    );
    debug.info('Generated taxonomyData.ts');
    
    debug.info('Taxonomy build completed successfully');
  } catch (error) {
    debug.error('Error building taxonomy data:', error);
    process.exit(1);
  }
}

buildTaxonomyData();
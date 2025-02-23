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
* Description: Utilities for generating map attribution text and links,
* handling both internal and external links with appropriate HTML attributes.
*
* Dependencies: none
*/

/**
* OpenStreetMap tile server URL template
* @type {string}
*/
export const MAP_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

/**
* Options for "days back" dropdown selector
* @type {Array<{value: string, label: string}>}
*/
export const DAYS_BACK_OPTIONS = [
    { value: "1", label: "1" },
    { value: "3", label: "3" },
    { value: "7", label: "7" },
    { value: "14", label: "14" },
    { value: "30", label: "30" }
   ];
   
   /**
   * Available sighting types for filtering bird observations
   * @enum {string}
   */
   export const SPECIES_CODES = {
    ALL: 'recent',
    RARE: 'rare'
   };
   
   /**
   * Default parameters for initializing the map view
   * @type {Object}
   * @property {string} species - Species code or special filter
   * @property {string} back - Number of days to look back
   * @property {number} zoom - Initial map zoom level
   */
   export const DEFAULT_MAP_PARAMS = {
    lat: 36.9741,  // Santa Cruz, CA lat and lng
    lng: -122.0308,
    species: SPECIES_CODES.ALL,
    back: "7",
    zoom: 12
   };

   export const REGION_BUFFER_DISTANCE = 25;
   
   /** 
   * Mock species list with taxonomy order
   * @constant
   * @type {Array<{speciesCode: string, comName: string, sciName: string, taxonOrder: number}>}
   */
  export const MOCK_SPECIES = [
    { speciesCode: 'grhowl', comName: 'Great Horned Owl', sciName: 'Bubo virginianus', taxonOrder: 177 },
    { speciesCode: 'brdowl', comName: 'Barred Owl', sciName: 'Strix varia', taxonOrder: 178 },
    { speciesCode: 'screec1', comName: 'Eastern Screech-Owl', sciName: 'Megascops asio', taxonOrder: 175 },
    { speciesCode: 'dowwoo', comName: 'Downy Woodpecker', sciName: 'Dryobates pubescens', taxonOrder: 207 },
    { speciesCode: 'haiwoo', comName: 'Hairy Woodpecker', sciName: 'Dryobates villosus', taxonOrder: 208 },
    { speciesCode: 'norfli', comName: 'Northern Flicker', sciName: 'Colaptes auratus', taxonOrder: 209 },
    { speciesCode: 'pilwoo', comName: 'Pileated Woodpecker', sciName: 'Dryocopus pileatus', taxonOrder: 210 },
    { speciesCode: 'rebwoo', comName: 'Red-bellied Woodpecker', sciName: 'Melanerpes carolinus', taxonOrder: 205 },
    { speciesCode: 'blujay', comName: 'Blue Jay', sciName: 'Cyanocitta cristata', taxonOrder: 477 },
    { speciesCode: 'stejay', comName: "Steller's Jay", sciName: 'Cyanocitta stelleri', taxonOrder: 478 },
    { speciesCode: 'easblu', comName: 'Eastern Bluebird', sciName: 'Sialia sialis', taxonOrder: 637 },
    { speciesCode: 'wesblu', comName: 'Western Bluebird', sciName: 'Sialia mexicana', taxonOrder: 638 },
    { speciesCode: 'mtnblu', comName: 'Mountain Bluebird', sciName: 'Sialia currucoides', taxonOrder: 639 },
    { speciesCode: 'daejun', comName: 'Dark-eyed Junco', sciName: 'Junco hyemalis', taxonOrder: 892 }
  ].sort((a, b) => a.taxonOrder - b.taxonOrder); // Sort by taxonomy order

  
/**
* Configuration object defining attribution links and metadata
* @type {Object.<string, {url: string, text: string, internal?: boolean}>}
*/
export const attributionLinks = {
    map: { url: 'https://www.openstreetmap.org/copyright', text: 'OpenStreetMap' },
    data: { url: 'https://ebird.org', text: 'eBird' },
    photos: { url: 'https://birdweather.com', text: 'BirdWeather' },
    author: { url: 'https://michellestuff.com', text: 'Michelle Tomasko', internal: true },
    license: { url: 'https://www.gnu.org/licenses/gpl-3.0.en.html', text: 'GPL v3' }
   };
   
   /**
   * Creates an HTML anchor tag string with appropriate attributes
   * @param {string} url - The URL to link to
   * @param {string} text - The visible text of the link
   * @param {boolean} [isExternal=true] - Whether the link is external
   * @returns {string} HTML anchor tag string
   */
   export const makeLink = (url, text, isExternal = true) => {
    const externalAttrs = 'target="_blank" rel="noopener noreferrer"';
    return `<a href="${url}"${isExternal ? ` ${externalAttrs}` : ''}>${text}</a>`;
   };
   
   /**
   * Generates the complete attribution string for the map
   * Combines all attribution links with appropriate formatting
   * @returns {string} Formatted HTML string containing all attributions
   */
   export const generateAttribution = () => Object.entries(attributionLinks)
    .map(([key, { url, text, internal = false }]) => {
      const link = makeLink(url, text, !internal);
      switch (key) {
        case 'map': return `&copy; ${link} contributors`;
        case 'data': return `Data: ${link}`;
        case 'photos': return `Photos: ${link}`;
        case 'author': return `&copy; ${link}`;
        case 'license': return `Licensed under ${link}`;
      }
    })
    .join(' | ');

/**
* Gets the display name for a species code
* @param {string} speciesCode - The species code to look up
* @param {Object} speciesCodes - Object containing special species codes (ALL, RARE)
* @returns {string} The display name for the species code
*/
export const getSpeciesDisplayName = (speciesCode, speciesCodes) => {
switch (speciesCode) {
  case speciesCodes.ALL:
    return 'All Birds';
  case speciesCodes.RARE:
    return 'Rare Birds';
  default:
    const species = MOCK_SPECIES.find(s => s.speciesCode === speciesCode);
    return species ? species.comName : '';
}
};


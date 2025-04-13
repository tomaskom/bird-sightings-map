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
* Description: Constants for map configuration, URLs, and attribution links
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
    { value: "14", label: "14" }
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
* @property {number} lat - Default latitude
* @property {number} lng - Default longitude
* @property {string} species - Species code or special filter
* @property {string} back - Number of days to look back
* @property {number} zoom - Initial map zoom level
*/
export const DEFAULT_MAP_PARAMS = {
    lat: 36.9741,  // Santa Cruz, CA lat and lng
    lng: -122.0308,
    species: SPECIES_CODES.ALL,
    back: "7",
    zoom: 13
};

/**
* Distance in kilometers to buffer region boundaries
* @type {number}
*/
export const REGION_BUFFER_DISTANCE = 25;

/**
* Map zoom constraints to prevent excessive data loading
* @type {Object}
* @property {number} MIN_ZOOM - Minimum zoom level (smaller number = more zoomed out)
* @property {number} MAX_ZOOM - Maximum zoom level (larger number = more zoomed in)
* @property {number} MAX_VIEWPORT_KM - Maximum viewport dimension in kilometers
*/
export const MAP_ZOOM_CONSTRAINTS = {
  MIN_ZOOM: 10, // Prevents zooming out too far (limit ~50km viewport)
  MAX_ZOOM: 18,
  MAX_VIEWPORT_KM: 50
};

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
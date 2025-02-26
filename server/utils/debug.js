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
* Description: Debug utility that provides conditional console logging based on
* environment-configured debug levels. Supports error, warn, info, and debug levels.
* 
* Dependencies: none
*/

/** @constant {number} DEBUG_LEVEL - Current debug level from environment, defaults to 0 */
const DEBUG_LEVEL = parseInt(process.env.SERVER_DEBUG_LEVEL || '0');

/**
 * Format date to a more readable format for logs
 * @param {Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Debug utility object with leveled logging functions
 * @type {Object}
 * @property {Function} error - Logs error messages when debug level >= 1
 * @property {Function} warn - Logs warning messages when debug level >= 2
 * @property {Function} info - Logs info messages when debug level >= 3
 * @property {Function} debug - Logs debug messages when debug level >= 4
 */
const debug = {
  error: (...args) => DEBUG_LEVEL >= 1 && console.error(formatDate(new Date()), '❌ [ERROR]', ...args),
  warn: (...args) => DEBUG_LEVEL >= 2 && console.warn(formatDate(new Date()), '⚠️ [WARN]', ...args),
  info: (...args) => DEBUG_LEVEL >= 3 && console.info(formatDate(new Date()), 'ℹ️ [INFO]', ...args),
  debug: (...args) => DEBUG_LEVEL >= 4 && console.log(formatDate(new Date()), '🔍 [DEBUG]', ...args),
  
  // Shorthand for common debug situations
  request: (...args) => DEBUG_LEVEL >= 3 && console.info(formatDate(new Date()), '📥 [REQUEST]', ...args),
  response: (...args) => DEBUG_LEVEL >= 3 && console.info(formatDate(new Date()), '📤 [RESPONSE]', ...args),
  
  // Performance timing logs
  perf: (...args) => DEBUG_LEVEL >= 3 && console.info(formatDate(new Date()), '⏱️ [PERF]', ...args),
  
  // Cache-specific debug
  cache: (...args) => DEBUG_LEVEL >= 3 && console.info(formatDate(new Date()), '📦 [CACHE]', ...args),
  
  // Tile-specific debug
  tile: (...args) => DEBUG_LEVEL >= 3 && console.info(formatDate(new Date()), '🧩 [TILE]', ...args),
};

module.exports = { debug };
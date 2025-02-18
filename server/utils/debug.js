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
 * Debug utility object with leveled logging functions
 * @type {Object}
 * @property {Function} error - Logs error messages when debug level >= 1
 * @property {Function} warn - Logs warning messages when debug level >= 2
 * @property {Function} info - Logs info messages when debug level >= 3
 * @property {Function} debug - Logs debug messages when debug level >= 4
 */
const debug = {
  error: (...args) => DEBUG_LEVEL >= 1 && console.error(new Date(), '[ERROR]', ...args),
  warn: (...args) => DEBUG_LEVEL >= 2 && console.warn(new Date(), '[WARN]', ...args),
  info: (...args) => DEBUG_LEVEL >= 3 && console.info(new Date(), '[INFO]', ...args),
  debug: (...args) => DEBUG_LEVEL >= 4 && console.log(new Date(), '[DEBUG]', ...args)
};

module.exports = { debug };
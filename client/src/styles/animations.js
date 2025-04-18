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
 * Description: Defines keyframe animations used throughout the bird sightings map
 * application for notifications and loading indicators.
 * 
 * Dependencies: none
 */

/**
 * Collection of CSS keyframe animations
 * @constant
 */
export const ANIMATIONS = {
    // Animation for notification messages - fades in quickly, stays visible, then fades out
    fadeInOut: `
      @keyframes fadeInOut {
        0% { opacity: 0; }
        10% { opacity: 1; }
        80% { opacity: 1; }
        100% { opacity: 0; }
      }
    `,
    // Continuous rotation animation for loading spinners
    spin: `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `
};
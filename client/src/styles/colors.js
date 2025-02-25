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
 * Description: Defines the color palette and theme colors used throughout the
 * bird sightings map application, including text, backgrounds, overlays and shadows.
 * 
 * Dependencies: none
 */

/**
 * Application color theme constants
 * @constant
 */
export const COLORS = {
    // Brand colors
    primary: '#FD7014',
    primaryLight: '#FD8F47',
    
    // Base UI colors
    background: '#DAD9D9',
    border: '#E2E8F0',
    
    // Text color hierarchy
    text: {
        primary: 'black',
        light: 'white',
        secondary: '#4B5563',
        tertiary: '#6B7280'
    },
    
    // Interactive elements
    link: '#3B82F6',
    
    // Modal colors
    modal: {
        background: 'rgba(0, 0, 0, 0.8)',
    },
    
    // Overlay effects
    overlay: {
        background: 'rgba(0, 0, 0, 0.5)',
        spinner: 'rgba(253, 112, 20, 0.8)'
    },
    
    // Shadow effects
    shadow: {
        dark: 'rgba(0, 0, 0, 0.7)'
    },
    
    // Species search component
    speciesSearch: {
        visibleSpeciesBackground: 'rgba(253, 112, 20, 0.1)',
        visibleSpeciesHeader: 'rgba(253, 112, 20, 0.15)'
    }
};

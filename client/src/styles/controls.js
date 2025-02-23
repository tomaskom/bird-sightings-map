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
* Description: Defines styles for map control elements including buttons,
* selects, and inputs. Handles both active and inactive states.
* 
* Dependencies: colors.js
*/

import { COLORS } from './colors';

/**
* Styles for control buttons with active/inactive states
* @constant
*/
export const CONTROL_BUTTON_STYLES = {
   // Base button properties
   base: {
       width: '34px',
       height: '34px',
       cursor: 'pointer',
       display: 'flex',
       alignItems: 'center',
       justifyContent: 'center',
       color: COLORS.text.light,
   },
   // Highlighted state
   active: {
       backgroundColor: COLORS.primaryLight
   },
   // Default state
   inactive: {
       backgroundColor: COLORS.primary
   }
};

/**
* Styles for map control elements
* @constant
*/
export const MAP_CONTROL_STYLES = {
    // Dropdown select styling
    select: {
        padding: '0.5rem 1rem',
        backgroundColor: COLORS.primary,
        color: COLORS.text.light,
        borderRadius: '0.375rem',
        cursor: 'pointer',
        fontSize: '1rem'
    },
    // Disabled select state
    selectDisabled: {
        backgroundColor: COLORS.primaryLight,
        cursor: 'not-allowed'
    },
    // Text input styling
    input: {
        padding: '0.5rem',
        border: '1px solid ' + COLORS.border,
        borderRadius: '0.375rem',
        backgroundColor: 'white',
        color: COLORS.text.primary,
        fontSize: '1rem'
    },
    // Disabled input state
    inputDisabled: {
        backgroundColor: COLORS.background,
        cursor: 'not-allowed'
    },
    // Standard button styling
    button: {
        padding: '0.5rem 1rem',
        backgroundColor: COLORS.primary,
        color: COLORS.text.light,
        borderRadius: '0.375rem',
        cursor: 'pointer',
        whiteSpace: 'nowrap'
    }
};


/**
 * Styles for species search component
 * @constant
 */
export const SPECIES_SEARCH_STYLES = {
    // Container for the entire search component
    container: {
        position: 'relative',
        width: '100%',
        minWidth: '250px',
        maxWidth: '250px',
        zIndex: 1001
    },
    // Dropdown menu container
    dropdown: {
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: 0,
        right: 0,
        backgroundColor: 'white',
        border: '1px solid ' + COLORS.border,
        borderRadius: '0.375rem',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        maxHeight: '300px',
        overflowY: 'auto',
        zIndex: 1001,
        width: '100%'
    },
    // Search input field
    searchInput: {
        ...MAP_CONTROL_STYLES.input,
        width: '100%',
        paddingRight: '.1rem' // Space for clear button
    },
    // Clear button for search input
    clearButton: {
        position: 'absolute',
        right: '0.1rem',
        top: '50%',
        transform: 'translateY(-50%)',
        cursor: 'pointer',
        color: COLORS.text.secondary,
        padding: '0.25rem',
        borderRadius: '20%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    },
    // Section for pinned options (All Birds, Rare Birds)
    pinnedSection: {
        borderBottom: '1px solid ' + COLORS.border,
        padding: '0.25rem 0'
    },
    // Individual pinned option
    pinnedOption: {
        padding: '0.5rem 1rem',
        cursor: 'pointer',
        color: COLORS.text.primary,
        fontSize: '1rem',
        '&:hover': {
            backgroundColor: COLORS.background
        }
    },
    // Species list section
    speciesList: {
        padding: '0.25rem 0'
    },
    // Individual species option
    speciesOption: {
        padding: '0.5rem 1rem',
        cursor: 'pointer',
        borderBottom: '1px solid ' + COLORS.border,
        '&:last-child': {
            borderBottom: 'none'
        },
        '&:hover': {
            backgroundColor: COLORS.background
        }
    },
    // Species common name text
    commonName: {
        color: COLORS.text.primary,
        fontSize: '1rem',
        fontWeight: 'normal'
    },
    // Species scientific name text
    scientificName: {
        color: COLORS.text.secondary,
        fontSize: '0.875rem',
        fontStyle: 'italic'
    },
    // No results message
    noResults: {
        padding: '0.75rem 1rem',
        color: COLORS.text.secondary,
        textAlign: 'center',
        fontSize: '0.875rem'
    },
    // Loading indicator
    loading: {
        padding: '0.75rem 1rem',
        color: COLORS.text.secondary,
        textAlign: 'center',
        fontSize: '0.875rem'
    }
};
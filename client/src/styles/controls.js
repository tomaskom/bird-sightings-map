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
 * selects, inputs, and species search components. Handles both active and 
 * inactive states.
 * 
 * Dependencies: colors.js
 */

import { COLORS } from './colors';

/**
 * Shared base styles for common UI elements
 * @constant
 */
const BASE_STYLES = {
    borderRadius: '0.375rem',
    padding: {
        default: '0.5rem 1rem',
        compact: '0.5rem',
        tiny: '0.25rem 0'
    },
    fontSize: {
        normal: '1rem',
        small: '0.875rem'
    },
    interactive: {
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
    },
    disabled: {
        cursor: 'not-allowed',
        backgroundColor: COLORS.background
    },
    border: `1px solid ${COLORS.border}`,
    hoverBackground: {
        backgroundColor: COLORS.background
    }
};

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
        border: COLORS.primary
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
   // Standard button styling
   button: {
       padding: '0.5rem 1rem',
       backgroundColor: COLORS.primary,
       color: COLORS.text.light,
       borderRadius: '0.375rem',
       cursor: 'pointer',
       whiteSpace: 'nowrap',
       border: COLORS.primary
   }
};

/**
 * Styles for species search component
 * @constant
 */
export const SPECIES_SEARCH_STYLES = {
    container: {
        position: 'relative',
        width: '100%',
        minWidth: '220px',
        maxWidth: '220px',
        zIndex: 1001
    },
    inputWrapper: {
        position: 'relative'
    },
    dropdown: {
        position: 'absolute',
        top: 'calc(100% + 4px)',
        left: 0,
        right: 0,
        backgroundColor: 'white',
        border: BASE_STYLES.border,
        borderRadius: BASE_STYLES.borderRadius,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        maxHeight: '300px',
        overflowY: 'auto',
        zIndex: 1001,
        width: '100%'
    },
    searchInput: {
        ...MAP_CONTROL_STYLES.input,
        width: '100%',
        paddingRight: '.1rem'
    },
    searchInputSelected: {
        fontStyle: 'italic',
        color: COLORS.text.secondary
    },
    searchInputNormal: {
        fontStyle: 'normal',
        color: COLORS.text.primary
    },
    inputIndicator: {
        position: 'absolute',
        right: '1px',
        top: '50%',
        transform: 'translateY(-50%)',
        ...BASE_STYLES.interactive,
        backgroundColor: COLORS.primary,
        color: COLORS.text.light,
        width: '24px',
        height: '24px',
        borderRadius: '25%',
        fontSize: '16px',
        lineHeight: '1',
        fontWeight: 'bold'
    },
    inputIndicatorDisabled: {
        pointerEvents: 'none'
    },
    pinnedSection: {
        borderBottom: BASE_STYLES.border,
        padding: BASE_STYLES.padding.tiny,
        backgroundColor: 'white'
    },
    pinnedOption: {
        padding: BASE_STYLES.padding.default,
        cursor: BASE_STYLES.interactive.cursor,
        color: COLORS.text.primary,
        fontSize: BASE_STYLES.fontSize.normal,
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        '&:hover': BASE_STYLES.hoverBackground
    },
    checkmark: {
        marginRight: '8px',
        width: '20px',
        display: 'inline-block',
        color: COLORS.primary,
        fontSize: '16px'
    },
    speciesList: {
        padding: BASE_STYLES.padding.tiny
    },
    speciesOption: {
        padding: BASE_STYLES.padding.default,
        cursor: BASE_STYLES.interactive.cursor,
        borderBottom: BASE_STYLES.border,
        '&:last-child': {
            borderBottom: 'none'
        },
        '&:hover': BASE_STYLES.hoverBackground
    },
    commonName: {
        color: COLORS.text.primary,
        fontSize: BASE_STYLES.fontSize.normal,
        fontWeight: 'normal',
        display: 'flex',
        alignItems: 'center'
    },
    scientificName: {
        color: COLORS.text.secondary,
        fontSize: BASE_STYLES.fontSize.small,
        fontStyle: 'italic'
    },
    noResults: {
        padding: '0.75rem 1rem',
        color: COLORS.text.secondary,
        textAlign: 'center',
        fontSize: BASE_STYLES.fontSize.small
    }
};
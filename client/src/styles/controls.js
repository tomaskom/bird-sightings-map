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
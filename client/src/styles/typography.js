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
* Description: Typography styles for the bird sightings map interface,
* defining text styles for headers, bird names, dates, and links.
* 
* Dependencies: colors.js
*/

import { COLORS } from './colors';

/**
* Typography styles for various text elements
* @constant
*/
export const TYPOGRAPHY_STYLES = {
   // Popup header styling
   popupHeader: {
     fontWeight: 'bold',
     marginBottom: '-0.25rem',
     padding: '0'
   },
   // Bird species name styling
   birdName: {
     fontWeight: 'bold'
   },
   // Observation date text styling
   observationDate: {
     fontSize: '0.9em',
     color: COLORS.text.secondary,
     margin: '0.25rem'
   },
   // Checklist container text styling
   checklistText: {
     fontSize: '0.8em',
     color: COLORS.text.tertiary,
     wordBreak: 'break-all'
   },
   // Checklist link styling
   checklistLink: {
     color: COLORS.link,
     textDecoration: 'underline'
   }
};
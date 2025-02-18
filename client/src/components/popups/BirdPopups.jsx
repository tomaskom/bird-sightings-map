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
* Description: React components for map popups showing bird sighting details.
* Includes photo modals, observation details, and interaction handling for
* smooth map interactions.
* 
* Dependencies: react, react-leaflet, utils/debug, styles/layout,
* styles/typography, styles/colors
*/

import React, { useState, memo, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import { debug } from '../../utils/debug';
import { LAYOUT_STYLES, POPUP_LAYOUT_STYLES } from '../../styles/layout';
import { TYPOGRAPHY_STYLES } from '../../styles/typography';
import { COLORS } from '../../styles/colors';

/**
* Main popup content component for bird sightings
* @component
* @param {Object} props
* @param {Array} props.birds - Array of bird sighting data
*/
export const BirdPopupContent = memo(({ birds }) => {
 const [selectedPhoto, setSelectedPhoto] = useState(null);
 debug.debug('Rendering popup content for birds:', birds.length);

 return (
   <>
     {selectedPhoto && (
       <PhotoModal
         photoUrl={selectedPhoto}
         onClose={() => setSelectedPhoto(null)}
       />
     )}
     <div style={POPUP_LAYOUT_STYLES.contentContainer}>
       <PopupHeader birdCount={birds.length} />
       {birds.map((bird, birdIndex) => (
         <BirdEntry
           key={`${bird.speciesCode}-${birdIndex}`}
           bird={bird}
           isLast={birdIndex === birds.length - 1}
           onPhotoClick={() => setSelectedPhoto(bird.fullPhotoUrl)}
         />
       ))}
     </div>
   </>
 );
});

/**
* Modal component for displaying full-size bird photos
* @component
*/
const PhotoModal = ({ photoUrl, onClose }) => (
 <div style={POPUP_LAYOUT_STYLES.photoModal} onClick={onClose}>
   <img
     src={photoUrl}
     alt="Full size bird"
     style={POPUP_LAYOUT_STYLES.modalImage}
   />
 </div>
);

/**
* Header component showing bird count
* @component
*/
const PopupHeader = ({ birdCount }) => (
 <h3 style={TYPOGRAPHY_STYLES.popupHeader}>
   {birdCount} {birdCount === 1 ? 'Bird' : 'Birds'} at this location
 </h3>
);

/**
* Individual bird entry component
* @component
*/
const BirdEntry = ({ bird, isLast, onPhotoClick }) => (
 <div
   style={{
     borderBottom: isLast ? 'none' : '1px solid' + COLORS.border,
     ...POPUP_LAYOUT_STYLES.birdEntry
   }}
 >
   <h4 style={TYPOGRAPHY_STYLES.birdName}>{bird.comName}</h4>
   {bird.thumbnailUrl && (
     <BirdThumbnail
       bird={bird}
       onClick={onPhotoClick}
     />
   )}
   <ObservationDetails bird={bird} />
 </div>
);

/**
* Thumbnail component for bird photos
* @component
*/
const BirdThumbnail = ({ bird, onClick }) => (
 <img
   src={bird.thumbnailUrl}
   alt={bird.comName}
   style={LAYOUT_STYLES.thumbnail}
   onClick={onClick}
 />
);

/**
* Component displaying observation date and checklist links
* @component
*/
const ObservationDetails = ({ bird }) => (
 <>
   <p style={TYPOGRAPHY_STYLES.observationDate}>
     Last Observed: {new Date(bird.obsDt).toLocaleDateString()}
   </p>
   <p style={TYPOGRAPHY_STYLES.checklistText}>
     Checklists: {bird.subIds.map((subId, index) => (
       <React.Fragment key={subId}>
         <a
           href={`https://ebird.org/checklist/${subId}`}
           target="_blank"
           rel="noopener noreferrer"
           style={TYPOGRAPHY_STYLES.checklistLink}
         >
           {subId}
         </a>
         {index < bird.subIds.length - 1 ? ', ' : ''}
       </React.Fragment>
     ))}
   </p>
 </>
);

/**
* Component that handles map interactions during popup events
* @component
* @returns {null}
*/
export const PopupInteractionHandler = () => {
 const map = useMap();

 useEffect(() => {
   const handlePopupOpen = () => {
     debug.debug('Popup opened, temporarily disabling map drag');
     if (map.dragging) {
       map.dragging.disable();
       setTimeout(() => {
         map.dragging.enable();
         debug.debug('Map drag re-enabled');
       }, 300);
     }
   };

   map.on('popupopen', handlePopupOpen);
   return () => {
     debug.debug('Cleaning up popup interaction handler');
     map.off('popupopen', handlePopupOpen);
   };
 }, [map]);

 return null;
};
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
 * Description: UI notification components for map interactions
 * 
 * Dependencies: same as BirdMap.jsx
 */
import React, { useState, memo, useEffect } from 'react';
import { Popup, useMap } from 'react-leaflet';
import { debug } from '../../utils/debug';

// Memoized popup content component
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
      <div style={{ 
        maxHeight: '225px', 
        overflowY: 'auto',
        transform: 'translateZ(0)'
      }}>
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

const PhotoModal = ({ photoUrl, onClose }) => (
  <div 
    style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 2000,
      cursor: 'pointer'
    }} 
    onClick={onClose}
  >
    <img 
      src={photoUrl} 
      alt="Full size bird" 
      style={{
        maxWidth: '90%',
        maxHeight: '90%',
        objectFit: 'contain'
      }}
    />
  </div>
);

const PopupHeader = ({ birdCount }) => (
  <h3 style={{ 
    fontWeight: 'bold', 
    marginBottom: '-0.25rem',
    padding: '0',
  }}>
    {birdCount} {birdCount === 1 ? 'Bird' : 'Birds'} at this location
  </h3>
);

const BirdEntry = ({ bird, isLast, onPhotoClick }) => (
  <div 
    style={{ 
      borderBottom: isLast ? 'none' : '1px solid #e2e8f0',
      padding: '0',
      paddingTop: '0.25rem',
      paddingBottom: '0.25rem'
    }}
  >
    <h4 style={{ fontWeight: 'bold' }}>{bird.comName}</h4>
    {bird.thumbnailUrl && (
      <BirdThumbnail 
        bird={bird}
        onClick={onPhotoClick}
      />
    )}
    <ObservationDetails bird={bird} />
  </div>
);

const BirdThumbnail = ({ bird, onClick }) => (
  <img
    src={bird.thumbnailUrl}
    alt={bird.comName}
    style={{
      width: '100px',
      height: '75px',
      objectFit: 'cover',
      cursor: 'pointer',
      marginBottom: '0.25rem',
      borderRadius: '4px'
    }}
    onClick={onClick}
  />
);

const ObservationDetails = ({ bird }) => (
  <>
    <p style={{ 
      fontSize: '0.9em', 
      color: '#4B5563', 
      margin: '0.25rem' 
    }}>
      Last Observed: {new Date(bird.obsDt).toLocaleDateString()}
    </p>
    <p style={{ 
      fontSize: '0.8em', 
      color: '#6B7280', 
      wordBreak: 'break-all' 
    }}>
      Checklists: {bird.subIds.map((subId, index) => (
        <React.Fragment key={subId}>
          <a 
            href={`https://ebird.org/checklist/${subId}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ 
              color: '#3B82F6', 
              textDecoration: 'underline' 
            }}
          >
            {subId}
          </a>
          {index < bird.subIds.length - 1 ? ', ' : ''}
        </React.Fragment>
      ))}
    </p>
  </>
);

// Handler for popup interactions
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
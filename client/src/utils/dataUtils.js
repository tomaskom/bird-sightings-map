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
import _ from 'lodash';
import { debug } from './debug';

export const fetchBirdPhotos = async (uniqueSpecies) => {
  try {
    const photoResponse = await fetch('https://app.birdweather.com/api/v1/species/lookup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        species: uniqueSpecies,
        fields: ['imageUrl', 'thumbnailUrl']
      })
    });
    
    if (photoResponse.ok) {
      const photoData = await photoResponse.json();
      debug.debug('Retrieved photos for species:', Object.keys(photoData.species).length);
      return photoData.species;
    }
    return {};
  } catch (error) {
    debug.error('Error fetching species photos:', error);
    return {};
  }
};

export const processBirdSightings = (sightings, speciesPhotos) => {
  const validSightings = sightings.filter(sighting => sighting.obsValid === true);
  const groupedByLocation = _.groupBy(validSightings, sighting => 
    `${sighting.lat},${sighting.lng}`
  );

  debug.debug('Processing sightings:', { 
    total: sightings.length,
    valid: validSightings.length,
    locations: Object.keys(groupedByLocation).length
  });

  return Object.entries(groupedByLocation).map(([locationKey, sightings]) => {
    const [lat, lng] = locationKey.split(',').map(Number);
    const birdsBySpecies = _.groupBy(sightings, 'comName');
    
    const birds = Object.entries(birdsBySpecies).map(([comName, speciesSightings]) => {
      const baseData = {
        ...speciesSightings[0],
        subIds: speciesSightings.map(s => s.subId)
      };

      // Add photo URLs if available
      const speciesKey = `${baseData.sciName}_${baseData.comName}`;
      const photoData = speciesPhotos[speciesKey];
      if (photoData) {
        baseData.thumbnailUrl = photoData.thumbnailUrl;
        baseData.fullPhotoUrl = photoData.imageUrl;
      }

      return baseData;
    });
    
    return {
      lat,
      lng,
      birds
    };
  });
};

export const buildApiUrl = (params) => {
  const searchParams = new URLSearchParams({
    lat: params.lat.toString(),
    lng: params.lng.toString(),
    dist: (params.radius + 0.3).toFixed(1),
    type: params.type,
    back: params.back.toString()
  });

  return `${import.meta.env.VITE_API_URL}/api/birds?${searchParams}`;
};
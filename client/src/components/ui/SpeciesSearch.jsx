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
 * Description: Species search component for filtering bird sightings
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { debounce } from 'lodash';
import { debug } from '../../utils/debug';
import { SPECIES_SEARCH_STYLES } from '../../styles/controls';
import { SPECIES_CODES } from '../../utils/mapconstants';
import { filterSpeciesByName, isRegionCached, updateRegionCache } from '../../utils/taxonomyUtils';
import { fetchRegionSpecies } from '../../utils/dataUtils';

/**
 * Species search component with typeahead and region-aware filtering
 * @param {Object} props Component properties
 * @param {Function} props.onSpeciesSelect Callback when species is selected
 * @param {string} props.currentRegion Current map region code
 * @param {boolean} props.disabled Whether the search is disabled
 * @param {string} [props.initialValue=''] Initial search value
 * @returns {React.ReactElement} Species search component
 */
const SpeciesSearch = ({ onSpeciesSelect, currentRegion, disabled, initialValue = '' }) => {
    const [searchTerm, setSearchTerm] = useState(initialValue);
    const [isOpen, setIsOpen] = useState(false);
    const [filteredSpecies, setFilteredSpecies] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasRegionalData, setHasRegionalData] = useState(false);
    const [isLoadingRegion, setIsLoadingRegion] = useState(false);
    const dropdownRef = useRef(null);

    /**
     * Fetches and caches species data for a region
     */
    const loadRegionData = useCallback(async (region) => {
        debug.debug('Loading region data for:', region);
        setIsLoadingRegion(true);

        try {
            const speciesData = await fetchRegionSpecies(region);
            debug.debug('Received region species data:', {
                region,
                speciesCount: speciesData.length
            });

            updateRegionCache(region, speciesData);
            setHasRegionalData(true);
        } catch (error) {
            debug.error('Error loading region data:', error);
            setHasRegionalData(false);
        } finally {
            setIsLoadingRegion(false);
        }
    }, []);

    // Check if region data is available when region changes
    useEffect(() => {
        debug.debug('SpeciesSearch region effect:', {
            currentRegion,
            hasRegionalData,
            disabled,
            isLoadingRegion
        });

        if (currentRegion) {
            const hasData = isRegionCached(currentRegion);
            debug.debug('Checking region cache:', {
                region: currentRegion,
                hasData,
                cacheHit: hasData ? 'yes' : 'no'
            });

            if (!hasData && !isLoadingRegion) {
                loadRegionData(currentRegion);
            } else {
                setHasRegionalData(hasData);
            }
        } else {
            debug.warn('SpeciesSearch: No region provided');
            setHasRegionalData(false);
        }
    }, [currentRegion, loadRegionData, isLoadingRegion]);

    // Debounced search handler
    const debouncedSearch = useCallback(
        debounce((term) => {
            debug.debug('Searching species with term:', term);
            setIsLoading(true);
            try {
                const results = filterSpeciesByName(term, currentRegion);
                debug.debug('Species search results:', {
                    searchTerm: term,
                    resultCount: results.length,
                    results: results.slice(0, 3) // Log first 3 for brevity
                });
                setFilteredSpecies(results);
            } catch (error) {
                debug.error('Error filtering species:', error);
                setFilteredSpecies([]);
            } finally {
                setIsLoading(false);
            }
        }, 300),
        [currentRegion]
    );

    // Handle input changes
    const handleInputChange = (e) => {
        const value = e.target.value;
        debug.debug('SpeciesSearch input change:', {
            value,
            isOpen,
            hasRegionalData
        });

        setSearchTerm(value);
        if (value.trim()) {
            debouncedSearch(value);
            setIsOpen(true);
        } else {
            debug.debug('Clearing filtered species - empty input');
            setFilteredSpecies([]);
        }
    };

    // Handle species selection
    const handleSelect = (species) => {
        debug.debug('SpeciesSearch selection:', {
            species,
            searchTerm,
            isOpen
        });

        // For "All Birds" (recent) and "Rare Birds", use their types as species codes
        const speciesCode = species.type || species.speciesCode;
        setSearchTerm(species.commonName || '');
        setIsOpen(false);
        onSpeciesSelect(species);
    };

    // Handle clicks outside dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                debug.debug('SpeciesSearch click outside - closing dropdown');
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Clear search input
    const handleClear = () => {
        debug.debug('SpeciesSearch clear triggered');
        setSearchTerm('');
        setFilteredSpecies([]);
        setIsOpen(false);
    };

    const getPlaceholderText = () => {
        if (isLoadingRegion) {
            return "Loading species for region...";
        }
        if (!currentRegion) {
            return "Detecting region...";
        }
        if (hasRegionalData) {
            return "Search species...";
        }
        return "Loading species data...";
    };

    debug.debug('SpeciesSearch render state:', {
        searchTerm,
        isOpen,
        hasRegionalData,
        isLoading,
        isLoadingRegion,
        filteredSpeciesCount: filteredSpecies.length,
        disabled
    });

    return (
        <div ref={dropdownRef} style={SPECIES_SEARCH_STYLES.container}>
            <div style={{ position: 'relative' }}>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={handleInputChange}
                    onFocus={() => {
                        debug.debug('SpeciesSearch input focus - opening dropdown');
                        setIsOpen(true);
                    }}
                    placeholder={getPlaceholderText()}
                    disabled={disabled || isLoadingRegion || !hasRegionalData}
                    style={SPECIES_SEARCH_STYLES.searchInput}
                />
                {searchTerm && (
                    <button
                        onClick={handleClear}
                        style={SPECIES_SEARCH_STYLES.clearButton}
                        aria-label="Clear search"
                    >
                        ×
                    </button>
                )}
            </div>

            {isOpen && (
                <div style={SPECIES_SEARCH_STYLES.dropdown}>
                    <div style={SPECIES_SEARCH_STYLES.pinnedSection}>
                        <div
                            style={SPECIES_SEARCH_STYLES.pinnedOption}
                            onClick={() => {
                                debug.debug('Selected All Birds option');
                                handleSelect({
                                    type: SPECIES_CODES.ALL,
                                    commonName: 'All Birds'
                                });
                            }}
                            role="option"
                            aria-selected={searchTerm === 'All Birds'}
                        >
                            All Birds
                        </div>
                        <div
                            style={SPECIES_SEARCH_STYLES.pinnedOption}
                            onClick={() => {
                                debug.debug('Selected Rare Birds option');
                                handleSelect({
                                    type: SPECIES_CODES.RARE,
                                    commonName: 'Rare Birds'
                                });
                            }}
                            role="option"
                            aria-selected={searchTerm === 'Rare Birds'}
                        >
                            Rare Birds
                        </div>
                    </div>

                    {searchTerm && (
                        <div style={SPECIES_SEARCH_STYLES.speciesList} role="listbox">
                            {!hasRegionalData ? (
                                <div style={SPECIES_SEARCH_STYLES.loading}>
                                    Loading regional species data...
                                </div>
                            ) : isLoading ? (
                                <div style={SPECIES_SEARCH_STYLES.loading}>
                                    Searching species...
                                </div>
                            ) : filteredSpecies.length > 0 ? (
                                filteredSpecies.map((species) => (
                                    <div
                                        key={species.speciesCode}
                                        style={SPECIES_SEARCH_STYLES.speciesOption}
                                        onClick={() => handleSelect(species)}
                                        role="option"
                                        aria-selected={false}
                                    >
                                        <div style={SPECIES_SEARCH_STYLES.commonName}>
                                            {species.commonName}
                                        </div>
                                        <div style={SPECIES_SEARCH_STYLES.scientificName}>
                                            {species.scientificName}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={SPECIES_SEARCH_STYLES.noResults}>
                                    No species found
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default SpeciesSearch;
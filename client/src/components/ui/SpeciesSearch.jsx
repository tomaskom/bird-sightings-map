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

const SpeciesSearch = ({
    onSpeciesSelect,
    disabled,
    initialValue,
    allSpeciesCode,
    rareSpeciesCode,
    regionSpecies = [],
    currentCountry,
    speciesLoading
}) => {
    debug.debug('SpeciesSearch render:', {
        speciesCount: regionSpecies?.length,
        hasSpecies: !!regionSpecies?.length,
        currentCountry,
        initialValue,
        disabled
    });

    const [searchTerm, setSearchTerm] = useState(initialValue);
    const [isOpen, setIsOpen] = useState(false);
    const [filteredSpecies, setFilteredSpecies] = useState([]);
    const dropdownRef = useRef(null);

    const searchSpecies = (term) => {
        // If no term or it's one of our special terms, show all species
        if (!term?.trim() || term === 'All Birds' || term === 'Rare Birds') {
            debug.debug('No search term or special term, showing all species:', {
                term,
                speciesCount: regionSpecies?.length
            });
            return regionSpecies || [];
        }
    
        // If no species list available, return empty
        if (!regionSpecies?.length) {
            debug.debug('No species list available');
            return [];
        }
    
        const normalizedTerm = term.toLowerCase();
        const results = regionSpecies.filter(species =>
            species.commonName?.toLowerCase().includes(normalizedTerm) ||
            species.scientificName?.toLowerCase().includes(normalizedTerm)
        );
    
        debug.debug('Search results:', {
            term: normalizedTerm,
            totalSpecies: regionSpecies.length,
            matchCount: results.length,
            sampleMatches: results.slice(0, 3).map(s => s.commonName)
        });
    
        return results;
    };

    // Debounced search handler
    const debouncedSearch = useCallback(
        debounce((term) => {
            debug.debug('Searching species with term:', term);
            const results = searchSpecies(term);
            debug.debug('Species search results:', {
                searchTerm: term,
                resultCount: results.length,
                country: currentCountry
            });
            setFilteredSpecies(results);
        }, 300),
        [regionSpecies, currentCountry]
    );

    // Handle input changes
    const handleInputChange = (e) => {
        const value = e.target.value;
        setSearchTerm(value);
        debouncedSearch(value);
    };

    const handleSelect = (species) => {
        debug.debug('SpeciesSearch selection:', species);
        const selection = species.type ? {
            type: species.type,
            commonName: species.commonName
        } : {
            speciesCode: species.speciesCode,
            commonName: species.commonName,
            scientificName: species.scientificName
        };

        setSearchTerm(selection.commonName || '');
        setIsOpen(false);
        onSpeciesSelect(selection);
    };

    // Update search term when initial value changes
    useEffect(() => {
        setSearchTerm(initialValue);
    }, [initialValue]);

    // Update filtered species when region species change
    useEffect(() => {
        debug.debug('Region species updated in SpeciesSearch:', {
            count: regionSpecies?.length,
            searchTerm,
            currentCountry
        });
    
        if (searchTerm) {
            debouncedSearch(searchTerm);
        } else {
            setFilteredSpecies(regionSpecies || []);
        }
    }, [regionSpecies, debouncedSearch, searchTerm]);

    // Handle clicks outside dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Clear search input
    const handleClear = () => {
        setSearchTerm('');
        setFilteredSpecies(regionSpecies);
        setIsOpen(true);
    };

    return (
        <div ref={dropdownRef} style={SPECIES_SEARCH_STYLES.container}>
            <div style={{ position: 'relative' }}>
                <input
                    type="text"
                    value={searchTerm}
                    onChange={handleInputChange}
                    onFocus={() => setIsOpen(true)}
                    placeholder={
                        speciesLoading ? "Loading species..." :
                        !currentCountry ? "Select location first" :
                        "Select Species"
                    }
                    disabled={disabled || speciesLoading || !currentCountry}
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
                <div style={{
                    ...SPECIES_SEARCH_STYLES.dropdown,
                    maxHeight: '300px',
                    overflowY: 'auto'
                }}>
                    <div style={SPECIES_SEARCH_STYLES.pinnedSection}>
                        <div
                            style={SPECIES_SEARCH_STYLES.pinnedOption}
                            onClick={() => handleSelect({
                                type: allSpeciesCode,
                                commonName: 'All Birds'
                            })}
                            role="option"
                            aria-selected={searchTerm === 'All Birds'}
                        >
                            All Birds
                        </div>
                        <div
                            style={SPECIES_SEARCH_STYLES.pinnedOption}
                            onClick={() => handleSelect({
                                type: rareSpeciesCode,
                                commonName: 'Rare Birds'
                            })}
                            role="option"
                            aria-selected={searchTerm === 'Rare Birds'}
                        >
                            Rare Birds
                        </div>
                    </div>

                    <div style={SPECIES_SEARCH_STYLES.speciesList} role="listbox">
                        {filteredSpecies?.length > 0 ? (
                            filteredSpecies.map((species) => {
                                debug.debug('Rendering species item:', {
                                    code: species.speciesCode,
                                    name: species.commonName
                                });
                                return (
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
                                );
                            })
                        ) : (
                            <div style={SPECIES_SEARCH_STYLES.noResults}>
                                {speciesLoading ? "Loading species..." :
                                !regionSpecies?.length ? "No species list available" :
                                "No matching species found"}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SpeciesSearch;
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
import { COLORS } from '../../styles/colors';
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
    const [isSearching, setIsSearching] = useState(false);
    const currentSelectionRef = useRef(initialValue);
    const dropdownRef = useRef(null);

    // Style for selected state
    const getInputStyle = () => ({
        ...SPECIES_SEARCH_STYLES.searchInput,
        ...(searchTerm && !isSearching ? {
            fontStyle: 'italic',
            color: '#666',
        } : {
            fontStyle: 'normal',
            color: COLORS.text.primary,
        }),
    });

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
        setIsSearching(true);
        debouncedSearch(value);
        setIsOpen(true);
    };

    const handleSelect = (species) => {
        debug.debug('SpeciesSearch selection:', {
            species,
            currentSearchTerm: searchTerm,
            isSearching
        });
        
        const selection = species.type ? {
            type: species.type,
            commonName: species.commonName
        } : {
            speciesCode: species.speciesCode,
            commonName: species.commonName,
            scientificName: species.scientificName
        };

        const newSearchTerm = selection.commonName || '';
        currentSelectionRef.current = newSearchTerm;
        setSearchTerm(newSearchTerm);
        setIsSearching(false);
        setIsOpen(false);
        
        if (!species.type) {
            setFilteredSpecies([species]);
        }
        
        onSpeciesSelect(selection);
    };

    // Initialize with species name if code is provided
    useEffect(() => {
        if (initialValue && regionSpecies?.length) {
            // If it's not a special type (All Birds/Rare Birds), look up the species
            if (initialValue !== 'All Birds' && initialValue !== 'Rare Birds') {
                const matchingSpecies = regionSpecies.find(
                    species => species.commonName === initialValue
                );
                if (matchingSpecies) {
                    setSearchTerm(matchingSpecies.commonName);
                    currentSelectionRef.current = matchingSpecies.commonName;
                    setFilteredSpecies([matchingSpecies]);
                }
            } else {
                setSearchTerm(initialValue);
                currentSelectionRef.current = initialValue;
            }
        }
    }, [initialValue, regionSpecies]);

    // Handle blur event
    const handleBlur = (e) => {
        // Use setTimeout to allow click events to complete
        setTimeout(() => {
            // Only revert if we're in search mode and haven't selected anything
            if (!isSearching || dropdownRef.current?.contains(document.activeElement)) {
                return;
            }
            
            debug.debug('Handling blur - reverting to:', {
                currentSelection: currentSelectionRef.current,
                currentSearchTerm: searchTerm,
                isSearching
            });
            
            setSearchTerm(currentSelectionRef.current);
            setIsSearching(false);
            setIsOpen(false);
            
            if (currentSelectionRef.current && 
                currentSelectionRef.current !== 'All Birds' && 
                currentSelectionRef.current !== 'Rare Birds') {
                const matchingSpecies = regionSpecies?.find(
                    species => species.commonName === currentSelectionRef.current
                );
                if (matchingSpecies) {
                    setFilteredSpecies([matchingSpecies]);
                }
            }
        }, 200);
    };

    // Handle escape key
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            setSearchTerm(currentSelectionRef.current);
            setIsSearching(false);
            setIsOpen(false);
        }
    };

    return (
        <div ref={dropdownRef} style={SPECIES_SEARCH_STYLES.container}>
            <div style={{ position: 'relative' }}>
                <input
                    type="text"
                    value={searchTerm || ''}
                    onChange={handleInputChange}
                    onFocus={() => {
                        setIsOpen(true);
                        if (searchTerm && !isSearching) {
                            setSearchTerm('');
                            setIsSearching(true);
                            setFilteredSpecies(regionSpecies || []);  // Show all species
                        }
                    }}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    onClick={() => {
                        if (searchTerm && !isSearching) {
                            setSearchTerm('');
                            setIsSearching(true);
                            setFilteredSpecies(regionSpecies || []);  // Show all species
                        }
                    }}
                    placeholder={
                        speciesLoading ? "Loading species..." :
                        !currentCountry ? "Select location first" :
                        "Select Species"
                    }
                    disabled={disabled || speciesLoading || !currentCountry}
                    style={getInputStyle()}
                />
                {/* Dropdown arrow - only show when not searching */}
                {!isSearching && (
                    <div style={{
                        position: 'absolute',
                        right: '8px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        pointerEvents: 'none',
                        backgroundColor: COLORS.primary,
                        color: COLORS.text.light,
                        width: '24px',
                        height: '24px',
                        borderRadius: '25%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '16px',
                        lineHeight: '1',
                        fontWeight: 'bold'
                    }}>
                        ▾
                    </div>
                )}
                {searchTerm && isSearching && (
                    <button
                        onClick={() => {
                            setSearchTerm('');
                            debouncedSearch('');
                            setIsOpen(true);
                        }}
                        style={SPECIES_SEARCH_STYLES.clearButton}
                        aria-label="Clear search"
                    >
                        X
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
                                        aria-selected={searchTerm === species.commonName}
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
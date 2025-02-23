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

const SpeciesSearch = ({
    onSpeciesSelect,
    disabled,
    speciesCode,
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
        speciesCode,
        disabled
    });

    // Function to get display name from code
    const getDisplayName = useCallback((code) => {
        if (code === allSpeciesCode) return 'All Birds';
        if (code === rareSpeciesCode) return 'Rare Birds';
        const species = regionSpecies.find(s => s.speciesCode === code);
        return species ? species.commonName : '';
    }, [regionSpecies, allSpeciesCode, rareSpeciesCode]);

    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [filteredSpecies, setFilteredSpecies] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const currentSelectionRef = useRef('');
    const dropdownRef = useRef(null);

    // Initialize or update display name when code or species list changes
    useEffect(() => {
        const displayName = getDisplayName(speciesCode);
        debug.debug('Updating display name:', { speciesCode, displayName });
        if (displayName) {
            setSearchTerm(displayName);
            currentSelectionRef.current = displayName;
            if (speciesCode && !speciesCode.includes('recent') && !speciesCode.includes('rare')) {
                const matchingSpecies = regionSpecies.find(s => s.speciesCode === speciesCode);
                if (matchingSpecies) {
                    setFilteredSpecies([matchingSpecies]);
                }
            }
        }
    }, [speciesCode, regionSpecies, getDisplayName]);

    const searchSpecies = (term) => {
        if (!term?.trim() || term === 'All Birds' || term === 'Rare Birds') {
            return regionSpecies || [];
        }
    
        if (!regionSpecies?.length) {
            return [];
        }
    
        const normalizedTerm = term.toLowerCase();
        const results = regionSpecies.filter(species =>
            species.commonName?.toLowerCase().includes(normalizedTerm) ||
            species.scientificName?.toLowerCase().includes(normalizedTerm)
        );
    
        return results;
    };

    const debouncedSearch = useCallback(
        debounce((term) => {
            const results = searchSpecies(term);
            setFilteredSpecies(results);
        }, 300),
        [regionSpecies]
    );

    const handleInputChange = (e) => {
        const value = e.target.value;
        setSearchTerm(value);
        setIsSearching(true);
        debouncedSearch(value);
        setIsOpen(true);
    };

    const handleSelect = (species) => {
        const selection = species.type ? {
            type: species.type,
            commonName: species.commonName
        } : {
            speciesCode: species.speciesCode,
            commonName: species.commonName,
            scientificName: species.scientificName
        };

        currentSelectionRef.current = selection.commonName;
        setSearchTerm(selection.commonName);
        setIsSearching(false);
        setIsOpen(false);
        
        if (!species.type) {
            setFilteredSpecies([species]);
        }
        
        onSpeciesSelect(selection);
    };

    const handleBlur = (e) => {
        setTimeout(() => {
            if (!isSearching || dropdownRef.current?.contains(document.activeElement)) {
                return;
            }
            
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

    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            setSearchTerm(currentSelectionRef.current);
            setIsSearching(false);
            setIsOpen(false);
        }
    };

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
                            setFilteredSpecies(regionSpecies || []);
                        }
                    }}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    onClick={() => {
                        if (searchTerm && !isSearching) {
                            setSearchTerm('');
                            setIsSearching(true);
                            setFilteredSpecies(regionSpecies || []);
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
                            aria-selected={currentSelectionRef.current === 'All Birds'}
                        >
                            <span style={{ marginRight: '8px', width: '16px', display: 'inline-block' }}>
                                {currentSelectionRef.current === 'All Birds' ? '✓' : ''}
                            </span>
                            All Birds
                        </div>
                        <div
                            style={SPECIES_SEARCH_STYLES.pinnedOption}
                            onClick={() => handleSelect({
                                type: rareSpeciesCode,
                                commonName: 'Rare Birds'
                            })}
                            role="option"
                            aria-selected={currentSelectionRef.current === 'Rare Birds'}
                        >
                            <span style={{ marginRight: '8px', width: '16px', display: 'inline-block' }}>
                                {currentSelectionRef.current === 'Rare Birds' ? '✓' : ''}
                            </span>
                            Rare Birds
                        </div>
                    </div>

                    <div style={SPECIES_SEARCH_STYLES.speciesList} role="listbox">
                        {filteredSpecies?.length > 0 ? (
                            filteredSpecies.map((species) => (
                                <div
                                    key={species.speciesCode}
                                    style={SPECIES_SEARCH_STYLES.speciesOption}
                                    onClick={() => handleSelect(species)}
                                    role="option"
                                    aria-selected={currentSelectionRef.current === species.commonName}
                                >
                                    <div style={SPECIES_SEARCH_STYLES.commonName}>
                                        <span style={{ marginRight: '8px', width: '16px', display: 'inline-block' }}>
                                            {currentSelectionRef.current === species.commonName ? '✓' : ''}
                                        </span>
                                        {species.commonName}
                                    </div>
                                    <div style={SPECIES_SEARCH_STYLES.scientificName}>
                                        {species.scientificName}
                                    </div>
                                </div>
                            ))
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
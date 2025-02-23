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
import { SPECIES_CODES, MOCK_SPECIES } from '../../utils/mapconstants';


/**
 * Species search component with typeahead filtering
 * @param {Object} props Component properties
 * @param {Function} props.onSpeciesSelect Callback when species is selected
 * @param {boolean} props.disabled Whether the search is disabled
 * @param {string} props.initialValue Initial search value
 * @param {string} props.allSpeciesCode Code for "All Birds" option
 * @param {string} props.rareSpeciesCode Code for "Rare Birds" option
 * @returns {React.ReactElement} Species search component
 */
const SpeciesSearch = ({
    onSpeciesSelect,
    disabled,
    initialValue,
    allSpeciesCode,
    rareSpeciesCode
  }) => {
    const [searchTerm, setSearchTerm] = useState(initialValue);
    const [isOpen, setIsOpen] = useState(false);
    const [filteredSpecies, setFilteredSpecies] = useState(MOCK_SPECIES);
    const dropdownRef = useRef(null);

    // Search through mock species
    const searchSpecies = (term) => {
        if (!term.trim()) {
            return MOCK_SPECIES;
        }
        const normalizedTerm = term.toLowerCase();
        return MOCK_SPECIES.filter(species => 
            species.comName.toLowerCase().includes(normalizedTerm) ||
            species.sciName.toLowerCase().includes(normalizedTerm)
        );
    };

    // Debounced search handler
    const debouncedSearch = useCallback(
        debounce((term) => {
            debug.debug('Searching species with term:', term);
            const results = searchSpecies(term);
            debug.debug('Species search results:', {
                searchTerm: term,
                resultCount: results.length
            });
            setFilteredSpecies(results);
        }, 300),
        []
    );

    // Handle input changes
    const handleInputChange = (e) => {
        const value = e.target.value;
        setSearchTerm(value);
        debouncedSearch(value);
    };

    // Handle species selection
    const handleSelect = (species) => {
        debug.debug('SpeciesSearch selection:', species);
        const selection = species.type ? {
            type: species.type,
            commonName: species.commonName
        } : {
            speciesCode: species.speciesCode,
            commonName: species.comName,
            scientificName: species.sciName
        };
        
        setSearchTerm(selection.commonName || '');
        setIsOpen(false);
        onSpeciesSelect(selection);
    };

    useEffect(() => {
        setSearchTerm(initialValue);
      }, [initialValue]);

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
        setFilteredSpecies(MOCK_SPECIES);
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
                    placeholder="Select Species"
                    disabled={disabled}
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
                                type: SPECIES_CODES.ALL,
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
                                type: SPECIES_CODES.RARE,
                                commonName: 'Rare Birds'
                            })}
                            role="option"
                            aria-selected={searchTerm === 'Rare Birds'}
                        >
                            Rare Birds
                        </div>
                    </div>

                    <div style={SPECIES_SEARCH_STYLES.speciesList} role="listbox">
                        {filteredSpecies.length > 0 ? (
                            filteredSpecies.map((species) => (
                                <div
                                    key={species.speciesCode}
                                    style={SPECIES_SEARCH_STYLES.speciesOption}
                                    onClick={() => handleSelect(species)}
                                    role="option"
                                    aria-selected={false}
                                >
                                    <div style={SPECIES_SEARCH_STYLES.commonName}>
                                        {species.comName}
                                    </div>
                                    <div style={SPECIES_SEARCH_STYLES.scientificName}>
                                        {species.sciName}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div style={SPECIES_SEARCH_STYLES.noResults}>
                                No species found
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SpeciesSearch;
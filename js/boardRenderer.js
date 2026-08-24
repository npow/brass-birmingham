// ============================================================================
// Brass: Birmingham - Board Renderer (SVG)
// Enhanced with atmospheric textures, styled connections, and SVG industry icons
// ============================================================================

class BoardRenderer {
    constructor(svgElement) {
        this.svg = svgElement;
        this.ns = 'http://www.w3.org/2000/svg';
        this.citySlotSize = 22;
        this.cityPadding = 6;
        this.tooltip = null;
    }

    render(gameState) {
        this.svg.innerHTML = '';
        this.state = gameState;
        this.drawBackground();
        this.drawRegionWashes();
        this.drawConnections();
        this.drawBreweryFarms();
        this.drawMerchants();
        this.drawCities();
        this.drawBuiltLinks();
    }

    update(gameState) {
        this.state = gameState;
        this.updateIndustrySlots();
        this.updateLinks();
        this.updateMerchantBeer();
    }

    // ========================================================================
    // Drawing helpers
    // ========================================================================

    createElement(tag, attrs = {}) {
        const el = document.createElementNS(this.ns, tag);
        for (const [key, val] of Object.entries(attrs)) {
            el.setAttribute(key, val);
        }
        return el;
    }

    createGroup(attrs = {}) {
        return this.createElement('g', attrs);
    }

    // ========================================================================
    // SVG Industry Icons
    // ========================================================================

    getIndustryIcon(type, size = 14) {
        return IndustryIcons.renderElement(type, size, 'silhouette');
    }

    // ========================================================================
    // Background with atmospheric texture
    // ========================================================================

    drawBackground() {
        const defs = this.createElement('defs');

        // Parchment grain — sepia-tinted fractal noise at low alpha
        const grainFilter = this.createElement('filter', {
            id: 'parchmentGrain', x: '0%', y: '0%', width: '100%', height: '100%',
        });
        grainFilter.appendChild(this.createElement('feTurbulence', {
            type: 'fractalNoise', baseFrequency: '0.9', numOctaves: '2',
            stitchTiles: 'stitch', result: 'noise',
        }));
        grainFilter.appendChild(this.createElement('feColorMatrix', {
            in: 'noise', type: 'matrix',
            values: '0 0 0 0 0.42  0 0 0 0 0.34  0 0 0 0 0.20  0 0 0 0.55 0',
        }));
        defs.appendChild(grainFilter);

        // Inner shadow for city cards
        const cardShadow = this.createElement('filter', {
            id: 'cardShadow', x: '-20%', y: '-20%', width: '140%', height: '140%',
        });
        cardShadow.appendChild(this.createElement('feDropShadow', {
            dx: '0', dy: '1.5', stdDeviation: '1.5',
            'flood-color': '#3a2a14', 'flood-opacity': '0.45',
        }));
        defs.appendChild(cardShadow);

        // Aged parchment base
        const bgGrad = this.createElement('radialGradient', { id: 'boardBg', cx: '50%', cy: '45%', r: '75%' });
        bgGrad.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': '#f2e7cb' }));
        bgGrad.appendChild(this.createElement('stop', { offset: '45%', 'stop-color': '#e4d2ac' }));
        bgGrad.appendChild(this.createElement('stop', { offset: '78%', 'stop-color': '#c9b088' }));
        bgGrad.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': '#a98e64' }));
        defs.appendChild(bgGrad);

        // Region wash gradients (soft watercolor tints under city clusters)
        for (const [regionId, colors] of Object.entries(REGION_COLORS)) {
            const grad = this.createElement('radialGradient', { id: `wash_${regionId}`, cx: '50%', cy: '50%', r: '50%' });
            grad.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': colors.fill, 'stop-opacity': '0.32' }));
            grad.appendChild(this.createElement('stop', { offset: '60%', 'stop-color': colors.fill, 'stop-opacity': '0.14' }));
            grad.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': colors.fill, 'stop-opacity': '0' }));
            defs.appendChild(grad);
        }

        // Aged-edge vignette gradient
        const vignetteGrad = this.createElement('radialGradient', { id: 'boardVignette', cx: '50%', cy: '48%', r: '72%' });
        vignetteGrad.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': '#3a2a14', 'stop-opacity': '0' }));
        vignetteGrad.appendChild(this.createElement('stop', { offset: '62%', 'stop-color': '#3a2a14', 'stop-opacity': '0' }));
        vignetteGrad.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': '#3a2a14', 'stop-opacity': '0.42' }));
        defs.appendChild(vignetteGrad);

        this.svg.appendChild(defs);

        // Parchment board base + grain + aged edges
        const board = this.createGroup({ 'pointer-events': 'none' });
        board.appendChild(this.createElement('rect', {
            x: 0, y: 0, width: 900, height: 850,
            fill: 'url(#boardBg)',
        }));
        board.appendChild(this.createElement('rect', {
            x: 0, y: 0, width: 900, height: 850,
            filter: 'url(#parchmentGrain)', opacity: '0.5',
        }));
        board.appendChild(this.createElement('rect', {
            x: 0, y: 0, width: 900, height: 850,
            fill: 'url(#boardVignette)',
        }));
        this.svg.appendChild(board);

        // Double-rule frame
        this.svg.appendChild(this.createElement('rect', {
            x: 5, y: 5, width: 890, height: 840,
            fill: 'none', stroke: '#6b5238', 'stroke-width': 2.5, rx: 6, ry: 6,
        }));
        this.svg.appendChild(this.createElement('rect', {
            x: 11, y: 11, width: 878, height: 828,
            fill: 'none', stroke: '#8a6f4d', 'stroke-width': 0.75,
        }));

        // Title cartouche
        const titleGroup = this.createGroup({ transform: 'translate(450, 838)' });
        const titleText = this.createElement('text', {
            'text-anchor': 'middle',
            'font-family': 'Cinzel, serif',
            'font-size': '10',
            fill: '#7c6244',
            'letter-spacing': '5',
        });
        titleText.textContent = 'BRASS · BIRMINGHAM';
        titleGroup.appendChild(titleText);
        this.svg.appendChild(titleGroup);
    }

    // ========================================================================
    // Region washes — watercolor-style tints beneath each city cluster
    // ========================================================================

    drawRegionWashes() {
        const g = this.createGroup({ id: 'region-washes-layer', 'pointer-events': 'none' });
        for (const city of Object.values(CITIES)) {
            g.appendChild(this.createElement('ellipse', {
                cx: city.x, cy: city.y + 6,
                rx: 96, ry: 66,
                fill: `url(#wash_${city.region})`,
            }));
        }
        this.svg.appendChild(g);
    }

    // ========================================================================
    // Connections — blue canal waterways, dark rail lines
    // ========================================================================

    drawConnections() {
        const connGroup = this.createGroup({ id: 'connections-layer' });
        const era = this.state ? this.state.era : ERA.CANAL;

        for (const conn of CONNECTIONS) {
            const pos1 = getLocationPosition(conn.cities[0]);
            const pos2 = getLocationPosition(conn.cities[1]);
            if (!pos1 || !pos2) continue;

            // Get line segments (handle via-brewery routing)
            const segments = [];
            if (conn.viaBrewery) {
                const brewPos = getLocationPosition(conn.viaBrewery);
                if (brewPos) {
                    segments.push({ x1: pos1.x, y1: pos1.y, x2: brewPos.x, y2: brewPos.y });
                    segments.push({ x1: brewPos.x, y1: brewPos.y, x2: pos2.x, y2: pos2.y });
                }
            } else {
                segments.push({ x1: pos1.x, y1: pos1.y, x2: pos2.x, y2: pos2.y });
            }

            // Both printed path types stay visible like on the physical board;
            // the type closed for the current era is drawn faint.
            const canalDim = era === ERA.RAIL ? 0.35 : 1;
            const railDim = era === ERA.CANAL ? 0.55 : 1;

            for (const seg of segments) {
                if (conn.canal) {
                    // Canal: blue waterway band with darker channel centre
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#7ba7bd',
                        'stroke-width': 7,
                        'stroke-linecap': 'round',
                        'stroke-opacity': String(0.40 * canalDim),
                        class: 'connection-line',
                        'pointer-events': 'none',
                        'data-connection': conn.id,
                    }));
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#4a7d9d',
                        'stroke-width': 2.4,
                        'stroke-linecap': 'round',
                        'stroke-opacity': String(0.85 * canalDim),
                        class: 'connection-line',
                        'pointer-events': 'none',
                        'data-connection': conn.id,
                    }));
                }
                if (conn.rail) {
                    // Rail: dashed dark permanent-way line
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#4e483f',
                        'stroke-width': 2.6,
                        'stroke-linecap': 'butt',
                        'stroke-dasharray': '7 6',
                        'stroke-opacity': String(0.72 * railDim),
                        class: 'connection-line',
                        'pointer-events': 'none',
                        'data-connection': conn.id,
                    }));
                }
                // Wide invisible hit area for selection
                connGroup.appendChild(this.createElement('line', {
                    ...seg,
                    stroke: 'transparent',
                    'stroke-width': 12,
                    class: 'connection-line',
                    'data-connection': conn.id,
                }));
            }
        }

        this.svg.appendChild(connGroup);
    }


    // ========================================================================
    // Cities with enhanced styling
    // ========================================================================

    // Returns a slot border color for a given industry type
    // Returns a slot border color for a given industry type (ivory/ink tones)
    getSlotBorderColor(type) {
        const slotColors = {
            [INDUSTRY_TYPES.COTTON_MILL]: '#c9bd9c',
            [INDUSTRY_TYPES.COAL_MINE]: '#8f887a',
            [INDUSTRY_TYPES.IRON_WORKS]: '#c98d4a',
            [INDUSTRY_TYPES.MANUFACTURER]: '#b09a5e',
            [INDUSTRY_TYPES.POTTERY]: '#bf7a62',
            [INDUSTRY_TYPES.BREWERY]: '#cfa94e',
        };
        return slotColors[type] || 'rgba(255,255,255,0.25)';
    }


    drawCities() {
        const cityGroup = this.createGroup({ id: 'cities-layer' });

        for (const [cityId, city] of Object.entries(CITIES)) {
            const g = this.createGroup({
                class: 'city-group',
                'data-city': cityId,
                transform: `translate(${city.x}, ${city.y})`
            });

            const slotsPerRow = Math.min(city.slots.length, 4);
            const rows = Math.ceil(city.slots.length / slotsPerRow);
            const cityWidth = slotsPerRow * (this.citySlotSize + 4) + this.cityPadding * 2;
            const cityHeight = rows * (this.citySlotSize + 4) + 27 + this.cityPadding;

            const regionColors = REGION_COLORS[city.region] || REGION_COLORS.birmingham;

            // City card — parchment panel with region-coloured border
            g.appendChild(this.createElement('rect', {
                x: -cityWidth / 2,
                y: -15,
                width: cityWidth,
                height: cityHeight,
                rx: 7, ry: 7,
                class: 'city-bg',
                fill: '#f7edd3',
                stroke: regionColors.border,
                'stroke-width': 1.25,
                filter: 'url(#cardShadow)',
            }));

            // Region colour strip along the top of the card
            g.appendChild(this.createElement('rect', {
                x: -cityWidth / 2 + 1.5,
                y: 2.5,
                width: cityWidth - 3,
                height: 2.5,
                rx: 1.25, ry: 1.25,
                fill: regionColors.fill,
                opacity: 0.75,
            }));

            // Dark banner ribbon with the city name
            g.appendChild(this.createElement('rect', {
                x: -cityWidth / 2 - 2,
                y: -18,
                width: cityWidth + 4,
                height: 16,
                rx: 4, ry: 4,
                fill: '#33291e',
                stroke: '#1f1810',
                'stroke-width': 0.75,
                class: 'city-label-bg',
            }));

            const nameText = this.createElement('text', {
                x: 0, y: -6.5,
                class: 'city-label',
                'font-size': city.name.length > 12 ? '8.5' : '9.5',
                'font-weight': '700',
                'letter-spacing': '0.6',
                fill: '#f0e4c8',
            });
            nameText.textContent = city.name;
            g.appendChild(nameText);

            // Industry slots
            const slotStartX = -(slotsPerRow * (this.citySlotSize + 4) - 4) / 2;
            const slotStartY = 10;

            city.slots.forEach((slotTypes, idx) => {
                const row = Math.floor(idx / slotsPerRow);
                const col = idx % slotsPerRow;
                const sx = slotStartX + col * (this.citySlotSize + 4);
                const sy = slotStartY + row * (this.citySlotSize + 4);

                const slotGroup = this.createGroup({
                    class: 'industry-slot',
                    'data-city': cityId,
                    'data-slot': idx,
                });

                const typeArr = Array.isArray(slotTypes) ? slotTypes : [slotTypes];
                const slotBorderColor = this.getSlotBorderColor(typeArr[0]);

                // Charcoal slot square
                slotGroup.appendChild(this.createElement('rect', {
                    x: sx, y: sy,
                    width: this.citySlotSize, height: this.citySlotSize,
                    rx: 3, ry: 3,
                    fill: '#3b342a',
                    'fill-opacity': '0.95',
                    stroke: slotBorderColor,
                    'stroke-width': typeArr.length > 1 ? '0.75' : '1',
                    'stroke-opacity': typeArr.length > 1 ? '0.55' : '0.85',
                }));

                const boardKey = `${cityId}_${idx}`;
                const builtTile = this.state ? this.state.boardIndustries[boardKey] : null;

                if (builtTile) {
                    this.drawBuiltIndustryTile(slotGroup, sx, sy, builtTile);
                } else if (typeArr.length === 1) {
                    const iconG = this.getIndustryIcon(typeArr[0], 13);
                    iconG.setAttribute('transform', `translate(${sx + this.citySlotSize / 2}, ${sy + this.citySlotSize / 2})`);
                    iconG.setAttribute('opacity', '0.55');
                    slotGroup.appendChild(iconG);
                } else {
                    const typeStr = typeArr.map(t => {
                        const d = INDUSTRY_DISPLAY[t];
                        return d ? d.shortName[0] : '?';
                    }).join('/');

                    const iconText = this.createElement('text', {
                        x: sx + this.citySlotSize / 2,
                        y: sy + this.citySlotSize / 2,
                        class: 'slot-icon',
                        'font-size': '7.5',
                        fill: 'rgba(240,228,200,0.65)',
                        'dominant-baseline': 'central',
                    });
                    iconText.textContent = typeStr;
                    slotGroup.appendChild(iconText);
                }

                g.appendChild(slotGroup);
            });

            cityGroup.appendChild(g);
        }

        this.svg.appendChild(cityGroup);
    }


    drawBuiltIndustryTile(parent, x, y, tile) {
        const s = this.citySlotSize;
        const playerColor = this.state.players[tile.playerId].color;

        // Drop shadow
        parent.appendChild(this.createElement('rect', {
            x: x + 1, y: y + 2,
            width: s, height: s,
            rx: 3, ry: 3,
            fill: 'rgba(26,18,8,0.45)',
        }));

        // Tile body in the owner's colour
        parent.appendChild(this.createElement('rect', {
            x, y,
            width: s, height: s,
            rx: 3, ry: 3,
            fill: playerColor,
            stroke: 'rgba(20,14,6,0.65)',
            'stroke-width': 1,
            class: 'built-tile' + (tile.flipped ? ' flipped' : ''),
        }));

        // Black top band (both faces of every physical tile carry it)
        const bandH = 12;
        parent.appendChild(this.createElement('path', {
            d: `M${x},${y + 3} Q${x},${y} ${x + 3},${y} L${x + s - 3},${y} Q${x + s},${y} ${x + s},${y + 3} L${x + s},${y + bandH} L${x},${y + bandH} Z`,
            fill: tile.flipped ? '#241c14' : '#17130e',
        }));

        // Level numeral inside the black band
        const levelText = this.createElement('text', {
            x: x + 4.5, y: y + 9.5,
            'font-size': '9',
            fill: '#e8dcbc',
            'font-weight': '700',
            'font-family': 'Cinzel, serif',
        });
        levelText.textContent = tile.tileData.level;
        parent.appendChild(levelText);

        // Industry icon centred on the coloured field
        const iconG = this.getIndustryIcon(tile.type, 11);
        iconG.setAttribute('transform', `translate(${x + s / 2}, ${y + bandH + (s - bandH) / 2 - 2})`);
        iconG.setAttribute('opacity', '0.85');
        parent.appendChild(iconG);

        if (!tile.flipped) {
            // Resource cubes along the bottom edge
            const cubeSize = 4;
            for (let i = 0; i < tile.resourceCubes; i++) {
                const cx = x + s - 4 - (i % 4) * (cubeSize + 1);
                const cy = y + s - 4;
                let topColor = '#777', sideColor = '#444';
                if (tile.type === INDUSTRY_TYPES.COAL_MINE) { topColor = '#4a4a4a'; sideColor = '#1a1a1a'; }
                else if (tile.type === INDUSTRY_TYPES.IRON_WORKS) { topColor = '#e89030'; sideColor = '#a05800'; }
                else if (tile.type === INDUSTRY_TYPES.BREWERY) { topColor = '#e0c860'; sideColor = '#a08010'; }

                const half = cubeSize / 2;
                parent.appendChild(this.createElement('polygon', {
                    points: `${cx - half + 0.5},${cy + half} ${cx + half},${cy + half} ${cx + half + 1},${cy + half + 1.2} ${cx - half + 1.5},${cy + half + 1.2}`,
                    fill: sideColor,
                    class: 'resource-cube',
                }));
                parent.appendChild(this.createElement('rect', {
                    x: cx - half, y: cy - half,
                    width: cubeSize, height: cubeSize,
                    rx: 0.8, ry: 0.8,
                    fill: topColor,
                    stroke: 'rgba(255,255,255,0.35)',
                    'stroke-width': 0.5,
                    class: 'resource-cube',
                }));
            }
        } else {
            // Flipped face: VP shield bottom-left, income arrow bottom-right
            parent.appendChild(this.createElement('rect', {
                x: x + 2, y: y + s - 10.5,
                width: 13, height: 8.5,
                rx: 2, ry: 2,
                fill: '#241c14',
                stroke: '#c9a84c',
                'stroke-width': 0.75,
            }));
            const vpText = this.createElement('text', {
                x: x + 8.5, y: y + s - 4.2,
                'text-anchor': 'middle',
                'font-size': '7',
                fill: '#e7c766',
                'font-weight': '800',
            });
            vpText.textContent = tile.tileData.vp;
            parent.appendChild(vpText);

            const incText = this.createElement('text', {
                x: x + s - 3, y: y + s - 4,
                'text-anchor': 'end',
                'font-size': '6.5',
                fill: 'rgba(255,255,255,0.85)',
                'font-weight': '600',
            });
            incText.textContent = '+' + tile.tileData.income;
            parent.appendChild(incText);
        }
    }


    // ========================================================================
    // Merchants
    // ========================================================================

    drawMerchants() {
        const merchantGroup = this.createGroup({ id: 'merchants-layer' });

        for (const [merchId, merch] of Object.entries(MERCHANTS)) {
            if (this.state && merch.minPlayers > this.state.numPlayers) continue;

            const g = this.createGroup({
                class: 'merchant-group',
                'data-merchant': merchId,
                transform: `translate(${merch.x}, ${merch.y})`
            });

            const w = 66;
            const h = 34 + merch.slots * 13;

            // Merchant building — tan block with a dark roof line
            g.appendChild(this.createElement('rect', {
                x: -w / 2 - 1, y: -15,
                width: w + 2, height: 8,
                rx: 3, ry: 3,
                fill: '#5a432c',
                filter: 'url(#cardShadow)',
            }));
            g.appendChild(this.createElement('rect', {
                x: -w / 2, y: -9,
                width: w, height: h,
                rx: 4, ry: 4,
                fill: '#cbb28a',
                stroke: '#6a5138',
                'stroke-width': 1.25,
                class: 'merchant-bg',
            }));

            // Name
            const nameText = this.createElement('text', {
                x: 0, y: 2.5,
                class: 'merchant-label',
                'font-size': '8.5',
                'font-weight': '700',
                fill: '#33261a',
            });
            nameText.textContent = merch.name;
            g.appendChild(nameText);

            // Merchant slots with beer barrel spaces
            for (let i = 0; i < merch.slots; i++) {
                const cy = 12 + i * 13;
                g.appendChild(this.createElement('circle', {
                    cx: -18, cy,
                    r: 4.5,
                    fill: 'none',
                    stroke: '#6a5138',
                    'stroke-width': 0.9,
                    class: 'merchant-slot',
                }));

                if (this.state) {
                    const matchingTiles = this.state.merchantTiles.filter(t => t.location === merchId);
                    if (matchingTiles[i]) {
                        const mt = matchingTiles[i];
                        const isBlank = mt.buys === 'blank';
                        if (mt.hasBeer) {
                            g.appendChild(this.createElement('circle', {
                                cx: -18, cy,
                                r: 3.6,
                                fill: '#d9b23c',
                                stroke: '#8a6a20',
                                'stroke-width': 0.75,
                            }));
                            g.appendChild(this.createElement('circle', {
                                cx: -19.5, cy: cy - 1.5,
                                r: 1,
                                fill: 'rgba(255,255,255,0.55)',
                            }));
                        }

                        const buyText = this.createElement('text', {
                            x: -9, y: cy + 2.7,
                            'text-anchor': 'start',
                            'font-size': '7.5',
                            fill: isBlank ? '#8a7458' : '#4a3820',
                            'letter-spacing': '0.3',
                        });
                        buyText.textContent = isBlank ? '\u2014 blank \u2014' :
                            (mt.buys === 'any' ? 'Buys: Any' : 'Buys: ' + INDUSTRY_DISPLAY[mt.buys].shortName);
                        g.appendChild(buyText);
                    }
                }
            }

            // Beer bonus glyph
            const bonusText = this.createElement('text', {
                x: 0, y: h - 4,
                'text-anchor': 'middle',
                'font-size': '7',
                'font-weight': '700',
                fill: '#6a4a1e',
            });
            let bonusStr = '';
            if (merch.bonusType === 'vp') bonusStr = `+${merch.bonusAmount} VP`;
            else if (merch.bonusType === 'money') bonusStr = `+£${merch.bonusAmount}`;
            else if (merch.bonusType === 'income') bonusStr = `+${merch.bonusAmount} income`;
            else if (merch.bonusType === 'develop') bonusStr = `Free Develop`;
            bonusText.textContent = bonusStr;
            g.appendChild(bonusText);

            merchantGroup.appendChild(g);
        }

        this.svg.appendChild(merchantGroup);
    }


    // ========================================================================
    // Brewery Farms
    // ========================================================================

    drawBreweryFarms() {
        const farmGroup = this.createGroup({ id: 'brewery-farms-layer' });

        for (const [farmId, farm] of Object.entries(BREWERY_FARMS)) {
            const g = this.createGroup({
                class: 'brewery-farm',
                'data-farm': farmId,
                transform: `translate(${farm.x}, ${farm.y})`
            });

            // Farmstead — small tan block with dark roof
            g.appendChild(this.createElement('rect', {
                x: -16, y: -17,
                width: 32, height: 7,
                rx: 2.5, ry: 2.5,
                fill: '#5a432c',
                filter: 'url(#cardShadow)',
            }));
            g.appendChild(this.createElement('rect', {
                x: -14, y: -11,
                width: 28, height: 28,
                rx: 4, ry: 4,
                class: 'brewery-farm-bg',
                fill: '#cbb28a',
                stroke: '#6a5138',
                'stroke-width': 1.25,
            }));

            const builtTile = this.state ? this.state.breweryFarmTiles[farmId] : null;
            if (builtTile) {
                this.drawBuiltIndustryTile(g, -11, -8, builtTile);
            } else {
                const iconG = this.getIndustryIcon(INDUSTRY_TYPES.BREWERY, 13);
                iconG.setAttribute('transform', 'translate(0, 3)');
                iconG.setAttribute('opacity', '0.5');
                g.appendChild(iconG);
            }

            farmGroup.appendChild(g);
        }

        this.svg.appendChild(farmGroup);
    }


    // ========================================================================
    // Built Links with enhanced styling
    // ========================================================================

    drawBuiltLinks() {
        const linkGroup = this.createGroup({ id: 'built-links-layer' });

        if (!this.state) return;

        for (const [connId, link] of Object.entries(this.state.boardLinks)) {
            const conn = CONNECTIONS.find(c => c.id === connId);
            if (!conn) continue;

            const pos1 = getLocationPosition(conn.cities[0]);
            const pos2 = getLocationPosition(conn.cities[1]);
            if (!pos1 || !pos2) continue;

            const playerColor = this.state.players[link.playerId].color;

            const drawBuiltSegment = (seg) => {
                if (link.type === 'canal') {
                    // Built canal: blue waterway carrying the owner's colour
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#7ba7bd',
                        'stroke-width': 9,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.55',
                        class: 'connection-line built',
                    }));
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#4a7d9d',
                        'stroke-width': 5.5,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.85',
                        class: 'connection-line built',
                    }));
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: playerColor,
                        'stroke-width': 2.2,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.95',
                        class: 'connection-line built',
                    }));
                } else {
                    // Built rail: dark permanent way in the owner's colour
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#3a332a',
                        'stroke-width': 7,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.9',
                        class: 'connection-line built',
                    }));
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: playerColor,
                        'stroke-width': 3.6,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.95',
                        class: 'connection-line built',
                    }));
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: 'rgba(20,14,8,0.45)',
                        'stroke-width': 5,
                        'stroke-linecap': 'butt',
                        'stroke-dasharray': '1.5 6',
                        class: 'connection-line built',
                    }));
                }
            };

            if (conn.viaBrewery) {
                const brewPos = getLocationPosition(conn.viaBrewery);
                if (brewPos) {
                    drawBuiltSegment({ x1: pos1.x, y1: pos1.y, x2: brewPos.x, y2: brewPos.y });
                    drawBuiltSegment({ x1: brewPos.x, y1: brewPos.y, x2: pos2.x, y2: pos2.y });
                }
            } else {
                drawBuiltSegment({ x1: pos1.x, y1: pos1.y, x2: pos2.x, y2: pos2.y });
            }

            // Owner badge at the midpoint
            const midX = (pos1.x + pos2.x) / 2;
            const midY = (pos1.y + pos2.y) / 2;

            linkGroup.appendChild(this.createElement('circle', {
                cx: midX, cy: midY, r: 5.5,
                fill: playerColor,
                stroke: '#241a10',
                'stroke-width': 1,
            }));
            const typeIcon = this.createElement('text', {
                x: midX, y: midY + 2.8,
                'text-anchor': 'middle',
                'font-size': '7',
                'font-weight': '700',
                fill: '#fff',
                'pointer-events': 'none',
            });
            typeIcon.textContent = link.type === 'canal' ? '~' : '\u2261';
            linkGroup.appendChild(typeIcon);
        }

        this.svg.appendChild(linkGroup);
    }


    // ========================================================================
    // Highlighting for valid placements
    // ========================================================================

    highlightSlots(validSlots) {
        this.clearHighlights();
        for (const slot of validSlots) {
            // Farm breweries are standalone board locations, not city slots
            if (isBreweryFarm(slot.cityId)) {
                const farmEl = this.svg.querySelector(`.brewery-farm[data-farm="${slot.cityId}"]`);
                if (farmEl) farmEl.classList.add('highlight-slot');
                continue;
            }
            const el = this.svg.querySelector(
                `.industry-slot[data-city="${slot.cityId}"][data-slot="${slot.slotIndex}"]`
            );
            if (el) {
                el.classList.add('highlight-slot');
            }
        }
    }

    highlightConnections(validConnections) {
        this.clearHighlights();
        for (const connId of validConnections) {
            const els = this.svg.querySelectorAll(`[data-connection="${connId}"]`);
            els.forEach(el => el.classList.add('highlight'));
        }
    }

    clearHighlights() {
        this.svg.querySelectorAll('.highlight-slot').forEach(el =>
            el.classList.remove('highlight-slot'));
        this.svg.querySelectorAll('.highlight').forEach(el =>
            el.classList.remove('highlight'));
    }

    // ========================================================================
    // Update methods
    // ========================================================================

    updateIndustrySlots() {
        const oldCities = this.svg.querySelector('#cities-layer');
        if (oldCities) oldCities.remove();
        this.drawCities();
    }

    updateLinks() {
        const oldLinks = this.svg.querySelector('#built-links-layer');
        if (oldLinks) oldLinks.remove();
        this.drawBuiltLinks();
    }

    updateMerchantBeer() {
        const oldMerchants = this.svg.querySelector('#merchants-layer');
        if (oldMerchants) oldMerchants.remove();
        this.drawMerchants();
    }

    fullUpdate(gameState) {
        this.state = gameState;
        // Remove all dynamic layers first, then re-add in the correct draw order so
        // that built links always render on top of cities, merchants, and brewery farms.
        // Connections are redrawn too: their era dimming depends on this.state.era.
        this.svg.querySelector('#connections-layer')?.remove();
        this.svg.querySelector('#brewery-farms-layer')?.remove();
        this.svg.querySelector('#merchants-layer')?.remove();
        this.svg.querySelector('#cities-layer')?.remove();
        this.svg.querySelector('#built-links-layer')?.remove();

        this.drawConnections();
        this.drawBreweryFarms();
        this.drawMerchants();
        this.drawCities();
        this.drawBuiltLinks();
    }
}

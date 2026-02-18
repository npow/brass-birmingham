// ============================================================================
// Brass: Birmingham - Board Renderer (SVG)
// ============================================================================

class BoardRenderer {
    constructor(svgElement) {
        this.svg = svgElement;
        this.ns = 'http://www.w3.org/2000/svg';
        this.citySlotSize = 18;
        this.cityPadding = 6;
        this.tooltip = null;
    }

    render(gameState) {
        this.svg.innerHTML = '';
        this.state = gameState;
        this.drawBackground();
        this.drawConnections();
        this.drawBreweryFarms();
        this.drawMerchants();
        this.drawCities();
        this.drawBuiltLinks();
    }

    update(gameState) {
        this.state = gameState;
        // Update dynamic elements
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
    // Background
    // ========================================================================

    drawBackground() {
        // Board background with gradient
        const defs = this.createElement('defs');

        // Background gradient
        const bgGrad = this.createElement('radialGradient', { id: 'boardBg', cx: '50%', cy: '50%', r: '70%' });
        bgGrad.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': '#3a3525' }));
        bgGrad.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': '#2a2a1f' }));
        defs.appendChild(bgGrad);

        // Region background patterns
        for (const [regionId, colors] of Object.entries(REGION_COLORS)) {
            const grad = this.createElement('radialGradient', { id: `region_${regionId}`, cx: '50%', cy: '50%', r: '60%' });
            grad.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': colors.fill, 'stop-opacity': '0.25' }));
            grad.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': colors.fill, 'stop-opacity': '0.08' }));
            defs.appendChild(grad);
        }

        this.svg.appendChild(defs);

        // Main board rect
        this.svg.appendChild(this.createElement('rect', {
            x: 0, y: 0, width: 900, height: 850,
            fill: 'url(#boardBg)',
            rx: 8, ry: 8,
        }));

        // Decorative border
        this.svg.appendChild(this.createElement('rect', {
            x: 2, y: 2, width: 896, height: 846,
            fill: 'none',
            stroke: '#4a3c2e',
            'stroke-width': 1.5,
            rx: 7, ry: 7,
        }));

        // Title
        const titleGroup = this.createGroup({ transform: 'translate(450, 830)' });
        const titleText = this.createElement('text', {
            'text-anchor': 'middle',
            'font-family': 'Cinzel, serif',
            'font-size': '12',
            fill: '#6a5a48',
            'letter-spacing': '4',
        });
        titleText.textContent = 'BRASS: BIRMINGHAM';
        titleGroup.appendChild(titleText);
        this.svg.appendChild(titleGroup);
    }

    // ========================================================================
    // Connections
    // ========================================================================

    drawConnections() {
        const connGroup = this.createGroup({ id: 'connections-layer' });

        for (const conn of CONNECTIONS) {
            const pos1 = getLocationPosition(conn.cities[0]);
            const pos2 = getLocationPosition(conn.cities[1]);
            if (!pos1 || !pos2) continue;

            const isCanal = conn.canal;
            const isRail = conn.rail;

            // Determine visual style
            let strokeColor, dashArray, opacity;
            if (isCanal && isRail) {
                strokeColor = '#4488aa';
                dashArray = 'none';
                opacity = '0.45';
            } else if (isCanal) {
                strokeColor = '#4488aa';
                dashArray = 'none';
                opacity = '0.5';
            } else {
                strokeColor = '#888';
                dashArray = '6 3';
                opacity = '0.35';
            }

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

            for (const seg of segments) {
                const line = this.createElement('line', {
                    ...seg,
                    stroke: strokeColor,
                    'stroke-width': 3,
                    'stroke-linecap': 'round',
                    'stroke-opacity': opacity,
                    'stroke-dasharray': dashArray,
                    'data-connection': conn.id,
                    class: 'connection-line',
                });
                connGroup.appendChild(line);
            }

            // Small indicator dot at midpoint showing connection type
            if (!conn.viaBrewery) {
                const midX = (pos1.x + pos2.x) / 2;
                const midY = (pos1.y + pos2.y) / 2;
                if (isCanal && isRail) {
                    // Dual indicator: small circle
                    connGroup.appendChild(this.createElement('circle', {
                        cx: midX, cy: midY, r: 2,
                        fill: '#4488aa', opacity: '0.4',
                    }));
                }
            }
        }

        this.svg.appendChild(connGroup);
    }

    // ========================================================================
    // Cities
    // ========================================================================

    drawCities() {
        const cityGroup = this.createGroup({ id: 'cities-layer' });

        for (const [cityId, city] of Object.entries(CITIES)) {
            const g = this.createGroup({
                class: 'city-group',
                'data-city': cityId,
                transform: `translate(${city.x}, ${city.y})`
            });

            // Calculate city dimensions based on slot count
            const slotsPerRow = Math.min(city.slots.length, 4);
            const rows = Math.ceil(city.slots.length / slotsPerRow);
            const cityWidth = slotsPerRow * (this.citySlotSize + 3) + this.cityPadding * 2;
            const cityHeight = rows * (this.citySlotSize + 3) + 20 + this.cityPadding;

            // Region background
            const regionColors = REGION_COLORS[city.region] || REGION_COLORS.birmingham;
            g.appendChild(this.createElement('rect', {
                x: -cityWidth / 2,
                y: -12,
                width: cityWidth,
                height: cityHeight,
                class: 'city-bg',
                fill: regionColors.fill,
                'fill-opacity': '0.3',
                stroke: regionColors.border,
            }));

            // City name
            const nameText = this.createElement('text', {
                x: 0, y: 2,
                class: 'city-label',
                'font-size': city.name.length > 12 ? '7' : '9',
            });
            nameText.textContent = city.name;
            g.appendChild(nameText);

            // Industry slots
            const slotStartX = -(slotsPerRow * (this.citySlotSize + 3) - 3) / 2;
            const slotStartY = 8;

            city.slots.forEach((slotTypes, idx) => {
                const row = Math.floor(idx / slotsPerRow);
                const col = idx % slotsPerRow;
                const sx = slotStartX + col * (this.citySlotSize + 3);
                const sy = slotStartY + row * (this.citySlotSize + 3);

                const slotGroup = this.createGroup({
                    class: 'industry-slot',
                    'data-city': cityId,
                    'data-slot': idx,
                });

                // Slot background
                slotGroup.appendChild(this.createElement('rect', {
                    x: sx, y: sy,
                    width: this.citySlotSize, height: this.citySlotSize,
                    class: 'slot-bg',
                }));

                // Show allowed types as small icons
                const boardKey = `${cityId}_${idx}`;
                const builtTile = this.state ? this.state.boardIndustries[boardKey] : null;

                if (builtTile) {
                    this.drawBuiltIndustryTile(slotGroup, sx, sy, builtTile);
                } else {
                    // Show slot type indicators
                    const typeArr = Array.isArray(slotTypes) ? slotTypes : [slotTypes];
                    const typeStr = typeArr.map(t => {
                        const d = INDUSTRY_DISPLAY[t];
                        return d ? d.shortName[0] : '?';
                    }).join('/');

                    const iconText = this.createElement('text', {
                        x: sx + this.citySlotSize / 2,
                        y: sy + this.citySlotSize / 2,
                        class: 'slot-icon',
                        'font-size': typeArr.length > 1 ? '6' : '8',
                        fill: 'rgba(255,255,255,0.4)',
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
        const display = INDUSTRY_DISPLAY[tile.type];
        const playerColor = this.state.players[tile.playerId].color;

        // Tile background with player color
        parent.appendChild(this.createElement('rect', {
            x, y, width: s, height: s,
            rx: 3, ry: 3,
            fill: tile.flipped ? '#2a3a2a' : playerColor,
            stroke: tile.flipped ? '#4a8a4a' : playerColor,
            'stroke-width': tile.flipped ? 1.5 : 1,
            opacity: tile.flipped ? 0.9 : 1,
            class: 'built-tile' + (tile.flipped ? ' flipped' : ''),
        }));

        // Level number
        const levelText = this.createElement('text', {
            x: x + 4, y: y + 7,
            'font-size': '6',
            fill: tile.flipped ? '#8aca8a' : 'white',
            'font-weight': '600',
        });
        levelText.textContent = tile.tileData.level;
        parent.appendChild(levelText);

        // Industry type abbreviation
        const typeText = this.createElement('text', {
            x: x + s / 2, y: y + s / 2 + 1,
            'text-anchor': 'middle',
            'dominant-baseline': 'central',
            'font-size': '7',
            fill: tile.flipped ? '#ccc' : 'white',
            'font-weight': '600',
        });
        typeText.textContent = display.shortName.substring(0, 3);
        parent.appendChild(typeText);

        // VP if flipped
        if (tile.flipped) {
            const vpText = this.createElement('text', {
                x: x + s - 3, y: y + s - 3,
                'text-anchor': 'end',
                'font-size': '6',
                fill: '#c9a84c',
                'font-weight': '700',
            });
            vpText.textContent = tile.tileData.vp;
            parent.appendChild(vpText);
        }

        // Resource cubes
        if (!tile.flipped && tile.resourceCubes > 0) {
            const cubeSize = 4;
            for (let i = 0; i < tile.resourceCubes; i++) {
                const cx = x + s - 5 - (i % 3) * 5;
                const cy = y + s - 5 - Math.floor(i / 3) * 5;
                let cubeColor = '#666';
                if (tile.type === INDUSTRY_TYPES.COAL_MINE) cubeColor = '#2c2c2c';
                else if (tile.type === INDUSTRY_TYPES.IRON_WORKS) cubeColor = '#d4760a';
                else if (tile.type === INDUSTRY_TYPES.BREWERY) cubeColor = '#c9a84c';

                parent.appendChild(this.createElement('rect', {
                    x: cx - cubeSize / 2, y: cy - cubeSize / 2,
                    width: cubeSize, height: cubeSize,
                    rx: 1, ry: 1,
                    fill: cubeColor,
                    stroke: 'rgba(255,255,255,0.3)',
                    'stroke-width': 0.5,
                    class: 'resource-cube',
                }));
            }
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

            const w = 60;
            const h = 30 + merch.slots * 12;

            // Background
            g.appendChild(this.createElement('rect', {
                x: -w / 2, y: -12,
                width: w, height: h,
                class: 'merchant-bg',
            }));

            // Name
            const nameText = this.createElement('text', {
                x: 0, y: 0,
                class: 'merchant-label',
                'font-size': '8',
            });
            nameText.textContent = merch.name;
            g.appendChild(nameText);

            // Merchant slots
            for (let i = 0; i < merch.slots; i++) {
                g.appendChild(this.createElement('rect', {
                    x: -20, y: 5 + i * 14,
                    width: 40, height: 11,
                    class: 'merchant-slot',
                }));

                // Show what this merchant buys if we have tile data
                if (this.state) {
                    const matchingTiles = this.state.merchantTiles.filter(t => t.location === merchId);
                    if (matchingTiles[i]) {
                        const mt = matchingTiles[i];
                        const buyText = this.createElement('text', {
                            x: 0, y: 13 + i * 14,
                            'text-anchor': 'middle',
                            'font-size': '6',
                            fill: mt.bonusClaimed ? '#555' : '#b87333',
                        });
                        buyText.textContent = mt.buys ?
                            INDUSTRY_DISPLAY[mt.buys].shortName :
                            'Any';
                        g.appendChild(buyText);

                        // Beer indicator
                        if (mt.hasBeer) {
                            g.appendChild(this.createElement('circle', {
                                cx: 14, cy: 11 + i * 14,
                                r: 3,
                                fill: '#c9a84c',
                                stroke: '#a08030',
                                'stroke-width': 0.5,
                            }));
                        }
                    }
                }
            }

            // Bonus indicator
            const bonusText = this.createElement('text', {
                x: 0, y: h - 8,
                'text-anchor': 'middle',
                'font-size': '6',
                fill: '#888',
            });
            let bonusStr = '';
            if (merch.bonusType === 'vp') bonusStr = `+${merch.bonusAmount} VP`;
            else if (merch.bonusType === 'money') bonusStr = `+£${merch.bonusAmount}`;
            else if (merch.bonusType === 'income') bonusStr = `+${merch.bonusAmount} Inc`;
            else if (merch.bonusType === 'develop') bonusStr = `Free Dev`;
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

            g.appendChild(this.createElement('rect', {
                x: -12, y: -12,
                width: 24, height: 24,
                class: 'brewery-farm-bg',
            }));

            // Check if built
            const builtTile = this.state ? this.state.breweryFarmTiles[farmId] : null;
            if (builtTile) {
                this.drawBuiltIndustryTile(g, -9, -9, builtTile);
            } else {
                const icon = this.createElement('text', {
                    x: 0, y: 2,
                    'text-anchor': 'middle',
                    'dominant-baseline': 'central',
                    'font-size': '10',
                    fill: 'rgba(212,168,67,0.4)',
                });
                icon.textContent = '🍺';
                g.appendChild(icon);
            }

            farmGroup.appendChild(g);
        }

        this.svg.appendChild(farmGroup);
    }

    // ========================================================================
    // Built Links
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

            if (conn.viaBrewery) {
                const brewPos = getLocationPosition(conn.viaBrewery);
                if (brewPos) {
                    linkGroup.appendChild(this.createElement('line', {
                        x1: pos1.x, y1: pos1.y,
                        x2: brewPos.x, y2: brewPos.y,
                        stroke: playerColor,
                        'stroke-width': 5,
                        'stroke-linecap': 'round',
                        class: 'connection-line built',
                    }));
                    linkGroup.appendChild(this.createElement('line', {
                        x1: brewPos.x, y1: brewPos.y,
                        x2: pos2.x, y2: pos2.y,
                        stroke: playerColor,
                        'stroke-width': 5,
                        'stroke-linecap': 'round',
                        class: 'connection-line built',
                    }));
                }
            } else {
                linkGroup.appendChild(this.createElement('line', {
                    x1: pos1.x, y1: pos1.y,
                    x2: pos2.x, y2: pos2.y,
                    stroke: playerColor,
                    'stroke-width': 5,
                    'stroke-linecap': 'round',
                    class: 'connection-line built',
                }));
            }

            // Link type indicator at midpoint
            const midX = (pos1.x + pos2.x) / 2;
            const midY = (pos1.y + pos2.y) / 2;
            const typeIcon = this.createElement('text', {
                x: midX, y: midY + 3,
                'text-anchor': 'middle',
                'font-size': '8',
                fill: 'white',
                'pointer-events': 'none',
            });
            typeIcon.textContent = link.type === 'canal' ? '⛵' : '🚂';
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
        // Re-render cities layer
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
        this.updateIndustrySlots();
        this.updateLinks();
        this.updateMerchantBeer();

        // Update brewery farms
        const oldFarms = this.svg.querySelector('#brewery-farms-layer');
        if (oldFarms) oldFarms.remove();
        this.drawBreweryFarms();
    }
}

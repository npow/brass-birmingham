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
        const g = this.createGroup();
        const half = size / 2;
        const s = size;

        switch (type) {
            case INDUSTRY_TYPES.COTTON_MILL: {
                // Factory silhouette: building with chimney
                const path = this.createElement('path', {
                    d: `M${-half+1},${half-1} L${-half+1},${-half+3} L${-half+3},${-half+3} L${-half+3},${-half+1} L${-half+5},${-half+1} L${-half+5},${-half+5} L${-half+7},${-half+5} L${-half+7},${-half+1} L${half-1},${-half+1} L${half-1},${half-1} Z`,
                    fill: 'rgba(255,255,255,0.7)',
                    stroke: 'none',
                });
                g.appendChild(path);
                break;
            }
            case INDUSTRY_TYPES.COAL_MINE: {
                // Diamond/gem shape
                const diamond = this.createElement('polygon', {
                    points: `0,${-half+1} ${half-2},0 0,${half-1} ${-half+2},0`,
                    fill: 'rgba(255,255,255,0.7)',
                    stroke: 'none',
                });
                g.appendChild(diamond);
                break;
            }
            case INDUSTRY_TYPES.IRON_WORKS: {
                // Gear/cog shape
                const r = half - 2;
                const teeth = 6;
                let points = '';
                for (let i = 0; i < teeth * 2; i++) {
                    const angle = (i * Math.PI) / teeth - Math.PI / 2;
                    const rad = i % 2 === 0 ? r : r * 0.65;
                    points += `${Math.cos(angle) * rad},${Math.sin(angle) * rad} `;
                }
                const gear = this.createElement('polygon', {
                    points: points.trim(),
                    fill: 'rgba(255,255,255,0.7)',
                    stroke: 'none',
                });
                g.appendChild(gear);
                // Center hole
                g.appendChild(this.createElement('circle', {
                    cx: 0, cy: 0, r: r * 0.25,
                    fill: 'rgba(0,0,0,0.5)',
                }));
                break;
            }
            case INDUSTRY_TYPES.MANUFACTURER: {
                // Crate/box shape
                const bw = s * 0.6;
                const bh = s * 0.5;
                g.appendChild(this.createElement('rect', {
                    x: -bw/2, y: -bh/2,
                    width: bw, height: bh,
                    rx: 1, ry: 1,
                    fill: 'rgba(255,255,255,0.7)',
                    stroke: 'none',
                }));
                // Cross lines on box
                g.appendChild(this.createElement('line', {
                    x1: -bw/2, y1: 0, x2: bw/2, y2: 0,
                    stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 0.8,
                }));
                g.appendChild(this.createElement('line', {
                    x1: 0, y1: -bh/2, x2: 0, y2: bh/2,
                    stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 0.8,
                }));
                break;
            }
            case INDUSTRY_TYPES.POTTERY: {
                // Vase shape
                const path = this.createElement('path', {
                    d: `M${-2},${-half+1} L${2},${-half+1} L${3},${-half+3} L${half-2},${1} L${half-3},${half-1} L${-half+3},${half-1} L${-half+2},${1} L${-3},${-half+3} Z`,
                    fill: 'rgba(255,255,255,0.7)',
                    stroke: 'none',
                });
                g.appendChild(path);
                break;
            }
            case INDUSTRY_TYPES.BREWERY: {
                // Barrel shape
                const bw = s * 0.55;
                const bh = s * 0.6;
                g.appendChild(this.createElement('ellipse', {
                    cx: 0, cy: 0,
                    rx: bw/2, ry: bh/2,
                    fill: 'rgba(255,255,255,0.7)',
                    stroke: 'none',
                }));
                // Barrel bands
                g.appendChild(this.createElement('line', {
                    x1: -bw/2+1, y1: -bh/6, x2: bw/2-1, y2: -bh/6,
                    stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 0.8,
                }));
                g.appendChild(this.createElement('line', {
                    x1: -bw/2+1, y1: bh/6, x2: bw/2-1, y2: bh/6,
                    stroke: 'rgba(0,0,0,0.3)', 'stroke-width': 0.8,
                }));
                break;
            }
            default: {
                g.appendChild(this.createElement('circle', {
                    cx: 0, cy: 0, r: half - 2,
                    fill: 'rgba(255,255,255,0.3)',
                }));
            }
        }
        return g;
    }

    // ========================================================================
    // Background with atmospheric texture
    // ========================================================================

    drawBackground() {
        const defs = this.createElement('defs');

        // Parchment noise texture filter
        const noiseFilter = this.createElement('filter', {
            id: 'parchmentNoise', x: '0%', y: '0%', width: '100%', height: '100%'
        });
        const turbulence = this.createElement('feTurbulence', {
            type: 'fractalNoise',
            baseFrequency: '0.65',
            numOctaves: '4',
            stitchTiles: 'stitch',
            result: 'noise',
        });
        noiseFilter.appendChild(turbulence);
        const colorMatrix = this.createElement('feColorMatrix', {
            type: 'saturate', values: '0', in: 'noise', result: 'grayNoise',
        });
        noiseFilter.appendChild(colorMatrix);
        const blend = this.createElement('feBlend', {
            in: 'SourceGraphic', in2: 'grayNoise', mode: 'multiply',
        });
        noiseFilter.appendChild(blend);
        defs.appendChild(noiseFilter);

        // Vignette filter
        const vignetteFilter = this.createElement('filter', {
            id: 'vignette', x: '-10%', y: '-10%', width: '120%', height: '120%',
        });
        const floodVig = this.createElement('feFlood', {
            'flood-color': 'black', 'flood-opacity': '0.4', result: 'flood',
        });
        vignetteFilter.appendChild(floodVig);
        const vigComp = this.createElement('feComposite', {
            in: 'flood', in2: 'SourceGraphic', operator: 'in', result: 'mask',
        });
        vignetteFilter.appendChild(vigComp);
        const vigGauss = this.createElement('feGaussianBlur', {
            in: 'mask', stdDeviation: '80', result: 'blurred',
        });
        vignetteFilter.appendChild(vigGauss);
        const vigBlend = this.createElement('feBlend', {
            in: 'SourceGraphic', in2: 'blurred', mode: 'multiply',
        });
        vignetteFilter.appendChild(vigBlend);
        defs.appendChild(vignetteFilter);

        // Inner shadow for city depth
        const innerShadow = this.createElement('filter', {
            id: 'innerShadow', x: '-10%', y: '-10%', width: '120%', height: '120%',
        });
        innerShadow.appendChild(this.createElement('feGaussianBlur', {
            in: 'SourceAlpha', stdDeviation: '2', result: 'blur',
        }));
        innerShadow.appendChild(this.createElement('feOffset', {
            dx: '0', dy: '1', result: 'offsetBlur',
        }));
        const isFlood = this.createElement('feFlood', {
            'flood-color': 'black', 'flood-opacity': '0.4', result: 'color',
        });
        innerShadow.appendChild(isFlood);
        innerShadow.appendChild(this.createElement('feComposite', {
            in: 'color', in2: 'offsetBlur', operator: 'in', result: 'shadow',
        }));
        innerShadow.appendChild(this.createElement('feComposite', {
            in: 'shadow', in2: 'SourceGraphic', operator: 'over',
        }));
        defs.appendChild(innerShadow);

        // Background gradient - richer aged paper tones
        const bgGrad = this.createElement('radialGradient', { id: 'boardBg', cx: '50%', cy: '45%', r: '70%' });
        bgGrad.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': '#42392a' }));
        bgGrad.appendChild(this.createElement('stop', { offset: '60%', 'stop-color': '#33301f' }));
        bgGrad.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': '#22201a' }));
        defs.appendChild(bgGrad);

        // Region background patterns
        for (const [regionId, colors] of Object.entries(REGION_COLORS)) {
            const grad = this.createElement('radialGradient', { id: `region_${regionId}`, cx: '50%', cy: '50%', r: '60%' });
            grad.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': colors.fill, 'stop-opacity': '0.25' }));
            grad.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': colors.fill, 'stop-opacity': '0.08' }));
            defs.appendChild(grad);
        }

        this.svg.appendChild(defs);

        // Main board rect with texture
        const bgGroup = this.createGroup({ filter: 'url(#parchmentNoise)' });
        bgGroup.appendChild(this.createElement('rect', {
            x: 0, y: 0, width: 900, height: 850,
            fill: 'url(#boardBg)',
            rx: 8, ry: 8,
        }));
        this.svg.appendChild(bgGroup);

        // Vignette overlay
        this.svg.appendChild(this.createElement('rect', {
            x: 0, y: 0, width: 900, height: 850,
            fill: 'url(#boardBg)',
            rx: 8, ry: 8,
            opacity: '0.3',
            filter: 'url(#vignette)',
        }));

        // Decorative double-border frame
        this.svg.appendChild(this.createElement('rect', {
            x: 4, y: 4, width: 892, height: 842,
            fill: 'none',
            stroke: '#5a4a38',
            'stroke-width': 1,
            rx: 7, ry: 7,
        }));
        this.svg.appendChild(this.createElement('rect', {
            x: 8, y: 8, width: 884, height: 834,
            fill: 'none',
            stroke: '#3a2c20',
            'stroke-width': 0.5,
            rx: 5, ry: 5,
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
    // Connections with enhanced canal/rail styling
    // ========================================================================

    drawConnections() {
        const connGroup = this.createGroup({ id: 'connections-layer' });

        for (const conn of CONNECTIONS) {
            const pos1 = getLocationPosition(conn.cities[0]);
            const pos2 = getLocationPosition(conn.cities[1]);
            if (!pos1 || !pos2) continue;

            const isCanal = conn.canal;
            const isRail = conn.rail;
            const era = this.state ? this.state.era : ERA.CANAL;

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
                if (isCanal && (era === ERA.CANAL || (isCanal && isRail))) {
                    // Canal: double-line blue water effect
                    // Outer thick translucent line
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#3070a0',
                        'stroke-width': 6,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.25',
                        'data-connection': conn.id,
                        class: 'connection-line',
                    }));
                    // Inner bright center
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#5599cc',
                        'stroke-width': 2,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.6',
                        'data-connection': conn.id,
                        class: 'connection-line',
                        'pointer-events': 'none',
                    }));
                } else if (isRail) {
                    // Rail: parallel lines with tie marks
                    // Main rail line
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#777',
                        'stroke-width': 4,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.3',
                        'data-connection': conn.id,
                        class: 'connection-line',
                    }));
                    // Track pattern (ties)
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#999',
                        'stroke-width': 2,
                        'stroke-linecap': 'butt',
                        'stroke-dasharray': '2 6',
                        'stroke-opacity': '0.5',
                        'data-connection': conn.id,
                        class: 'connection-line',
                        'pointer-events': 'none',
                    }));
                }
            }

            // Dual connection indicator
            if (!conn.viaBrewery && isCanal && isRail) {
                const midX = (pos1.x + pos2.x) / 2;
                const midY = (pos1.y + pos2.y) / 2;
                connGroup.appendChild(this.createElement('circle', {
                    cx: midX, cy: midY, r: 2.5,
                    fill: '#5599cc', opacity: '0.4',
                    stroke: '#777', 'stroke-width': 0.5,
                }));
            }
        }

        this.svg.appendChild(connGroup);
    }

    // ========================================================================
    // Cities with enhanced styling
    // ========================================================================

    drawCities() {
        const cityGroup = this.createGroup({ id: 'cities-layer' });

        for (const [cityId, city] of Object.entries(CITIES)) {
            const g = this.createGroup({
                class: 'city-group',
                'data-city': cityId,
                transform: `translate(${city.x}, ${city.y})`
            });

            // Calculate city dimensions
            const slotsPerRow = Math.min(city.slots.length, 4);
            const rows = Math.ceil(city.slots.length / slotsPerRow);
            const cityWidth = slotsPerRow * (this.citySlotSize + 3) + this.cityPadding * 2;
            const cityHeight = rows * (this.citySlotSize + 3) + 22 + this.cityPadding;

            // Region background with increased opacity and shadow
            const regionColors = REGION_COLORS[city.region] || REGION_COLORS.birmingham;
            g.appendChild(this.createElement('rect', {
                x: -cityWidth / 2,
                y: -14,
                width: cityWidth,
                height: cityHeight,
                class: 'city-bg',
                fill: regionColors.fill,
                'fill-opacity': '0.5',
                stroke: regionColors.border,
                filter: 'url(#innerShadow)',
            }));

            // Dark backing rect behind city name for readability
            const nameLen = city.name.length;
            const nameWidth = nameLen * 5 + 10;
            g.appendChild(this.createElement('rect', {
                x: -nameWidth / 2,
                y: -12,
                width: nameWidth,
                height: 14,
                fill: 'rgba(0,0,0,0.65)',
                rx: 3, ry: 3,
                class: 'city-label-bg',
            }));

            // City name
            const nameText = this.createElement('text', {
                x: 0, y: 0,
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

                const boardKey = `${cityId}_${idx}`;
                const builtTile = this.state ? this.state.boardIndustries[boardKey] : null;

                if (builtTile) {
                    this.drawBuiltIndustryTile(slotGroup, sx, sy, builtTile);
                } else {
                    // Show slot type indicators with SVG icons
                    const typeArr = Array.isArray(slotTypes) ? slotTypes : [slotTypes];

                    if (typeArr.length === 1) {
                        // Single type: show icon
                        const iconG = this.getIndustryIcon(typeArr[0], 12);
                        iconG.setAttribute('transform', `translate(${sx + this.citySlotSize/2}, ${sy + this.citySlotSize/2})`);
                        iconG.setAttribute('opacity', '0.35');
                        slotGroup.appendChild(iconG);
                    } else {
                        // Multiple types: show abbreviations
                        const typeStr = typeArr.map(t => {
                            const d = INDUSTRY_DISPLAY[t];
                            return d ? d.shortName[0] : '?';
                        }).join('/');

                        const iconText = this.createElement('text', {
                            x: sx + this.citySlotSize / 2,
                            y: sy + this.citySlotSize / 2,
                            class: 'slot-icon',
                            'font-size': '6',
                            fill: 'rgba(255,255,255,0.35)',
                        });
                        iconText.textContent = typeStr;
                        slotGroup.appendChild(iconText);
                    }
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

        // Player color strip at top
        if (!tile.flipped) {
            parent.appendChild(this.createElement('rect', {
                x: x, y: y, width: s, height: 4,
                rx: 3, ry: 0,
                fill: playerColor,
                opacity: 0.8,
            }));
        }

        // Level number
        const levelText = this.createElement('text', {
            x: x + 4, y: y + 8,
            'font-size': '7',
            fill: tile.flipped ? '#8aca8a' : 'white',
            'font-weight': '600',
        });
        levelText.textContent = tile.tileData.level;
        parent.appendChild(levelText);

        // Industry SVG icon in center
        const iconG = this.getIndustryIcon(tile.type, 10);
        iconG.setAttribute('transform', `translate(${x + s/2}, ${y + s/2 + 1})`);
        if (tile.flipped) {
            iconG.setAttribute('opacity', '0.7');
        }
        parent.appendChild(iconG);

        // VP badge if flipped
        if (tile.flipped) {
            // VP badge circle
            parent.appendChild(this.createElement('circle', {
                cx: x + s - 4, cy: y + s - 4, r: 5,
                fill: '#c9a84c',
                stroke: '#a08030',
                'stroke-width': 0.5,
            }));
            const vpText = this.createElement('text', {
                x: x + s - 4, y: y + s - 2,
                'text-anchor': 'middle',
                'font-size': '6',
                fill: '#1a1510',
                'font-weight': '700',
            });
            vpText.textContent = tile.tileData.vp;
            parent.appendChild(vpText);
        }

        // Resource cubes
        if (!tile.flipped && tile.resourceCubes > 0) {
            const cubeSize = 5;
            for (let i = 0; i < tile.resourceCubes; i++) {
                const cx = x + s - 5 - (i % 3) * 6;
                const cy = y + s - 5 - Math.floor(i / 3) * 6;
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
                x: -14, y: -14,
                width: 28, height: 28,
                class: 'brewery-farm-bg',
            }));

            const builtTile = this.state ? this.state.breweryFarmTiles[farmId] : null;
            if (builtTile) {
                this.drawBuiltIndustryTile(g, -11, -11, builtTile);
            } else {
                // Show brewery icon
                const iconG = this.getIndustryIcon(INDUSTRY_TYPES.BREWERY, 14);
                iconG.setAttribute('transform', 'translate(0, 0)');
                iconG.setAttribute('opacity', '0.4');
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
                    // Canal built: player color with water effect
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: playerColor,
                        'stroke-width': 7,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.4',
                        class: 'connection-line built',
                    }));
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: playerColor,
                        'stroke-width': 3,
                        'stroke-linecap': 'round',
                        class: 'connection-line built',
                    }));
                } else {
                    // Rail built: player color with track pattern
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: playerColor,
                        'stroke-width': 5,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.5',
                        class: 'connection-line built',
                    }));
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: playerColor,
                        'stroke-width': 2,
                        'stroke-linecap': 'butt',
                        'stroke-dasharray': '2 5',
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

            // Link type indicator at midpoint
            const midX = (pos1.x + pos2.x) / 2;
            const midY = (pos1.y + pos2.y) / 2;

            // Small colored circle with type indicator
            linkGroup.appendChild(this.createElement('circle', {
                cx: midX, cy: midY, r: 6,
                fill: playerColor,
                stroke: 'rgba(255,255,255,0.3)',
                'stroke-width': 0.5,
            }));
            const typeIcon = this.createElement('text', {
                x: midX, y: midY + 3,
                'text-anchor': 'middle',
                'font-size': '7',
                fill: 'white',
                'pointer-events': 'none',
            });
            typeIcon.textContent = link.type === 'canal' ? '~' : '#';
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

        const oldFarms = this.svg.querySelector('#brewery-farms-layer');
        if (oldFarms) oldFarms.remove();
        this.drawBreweryFarms();
    }
}

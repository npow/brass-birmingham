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
        return IndustryIcons.renderElement(type, size, 'silhouette');
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

        // Background gradient - warm sepia/parchment aged map tones
        const bgGrad = this.createElement('radialGradient', { id: 'boardBg', cx: '50%', cy: '45%', r: '70%' });
        bgGrad.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': '#4a3f2a' }));
        bgGrad.appendChild(this.createElement('stop', { offset: '55%', 'stop-color': '#38321e' }));
        bgGrad.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': '#26220e' }));
        defs.appendChild(bgGrad);

        // Flipped tile gradient (green-tinted for sold/depleted)
        const tileFlipped = this.createElement('linearGradient', { id: 'tileFlippedBg', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
        tileFlipped.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': '#2a4a2a' }));
        tileFlipped.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': '#1a3a1a' }));
        defs.appendChild(tileFlipped);

        // Diagonal hatch overlay pattern for flipped ("sold") tiles
        const hatchPattern = this.createElement('pattern', {
            id: 'tileFlippedHatch', patternUnits: 'userSpaceOnUse', width: '5', height: '5',
            patternTransform: 'rotate(45)',
        });
        hatchPattern.appendChild(this.createElement('line', {
            x1: '0', y1: '0', x2: '0', y2: '5',
            stroke: 'rgba(255,255,255,0.12)', 'stroke-width': '2',
        }));
        defs.appendChild(hatchPattern);

        // Glow filter for built tiles
        const glowFilter = this.createElement('filter', {
            id: 'tileGlow', x: '-30%', y: '-30%', width: '160%', height: '160%',
        });
        glowFilter.appendChild(this.createElement('feGaussianBlur', {
            in: 'SourceGraphic', stdDeviation: '2.5', result: 'coloredBlur',
        }));
        const glowMerge = this.createElement('feMerge');
        glowMerge.appendChild(this.createElement('feMergeNode', { in: 'coloredBlur' }));
        glowMerge.appendChild(this.createElement('feMergeNode', { in: 'SourceGraphic' }));
        glowFilter.appendChild(glowMerge);
        defs.appendChild(glowFilter);

        // Region background patterns — richer contrast
        for (const [regionId, colors] of Object.entries(REGION_COLORS)) {
            const grad = this.createElement('radialGradient', { id: `region_${regionId}`, cx: '50%', cy: '50%', r: '60%' });
            grad.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': colors.fill, 'stop-opacity': '0.38' }));
            grad.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': colors.fill, 'stop-opacity': '0.12' }));
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
                if (isCanal && era === ERA.CANAL) {
                    // Canal: vibrant blue water with glow
                    // Outer thick translucent glow
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#4499cc',
                        'stroke-width': 8,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.22',
                        'data-connection': conn.id,
                        class: 'connection-line',
                    }));
                    // Mid layer for contrast
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#3388bb',
                        'stroke-width': 4,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.45',
                        'data-connection': conn.id,
                        class: 'connection-line',
                        'pointer-events': 'none',
                    }));
                    // Inner bright center
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#66bbee',
                        'stroke-width': 3,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.7',
                        'data-connection': conn.id,
                        class: 'connection-line',
                        'pointer-events': 'none',
                    }));
                } else if (isRail && era === ERA.RAIL) {
                    // Rail: dark ballast bed with visible tie marks
                    // Outer thick dark ballast
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#555',
                        'stroke-width': 5,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.55',
                        'data-connection': conn.id,
                        class: 'connection-line',
                    }));
                    // Rail sleepers/ties — dotted dark line
                    connGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#888',
                        'stroke-width': 2,
                        'stroke-linecap': 'butt',
                        'stroke-dasharray': '3 7',
                        'stroke-opacity': '0.65',
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

    // Returns a slot border color for a given industry type
    getSlotBorderColor(type) {
        const slotColors = {
            [INDUSTRY_TYPES.COTTON_MILL]: '#b8c5a0',
            [INDUSTRY_TYPES.COAL_MINE]: '#6a6a6a',
            [INDUSTRY_TYPES.IRON_WORKS]: '#c87820',
            [INDUSTRY_TYPES.MANUFACTURER]: '#9a7a30',
            [INDUSTRY_TYPES.POTTERY]: '#b05040',
            [INDUSTRY_TYPES.BREWERY]: '#c8a030',
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

            // Calculate city dimensions
            const slotsPerRow = Math.min(city.slots.length, 4);
            const rows = Math.ceil(city.slots.length / slotsPerRow);
            const cityWidth = slotsPerRow * (this.citySlotSize + 4) + this.cityPadding * 2;
            const cityHeight = rows * (this.citySlotSize + 4) + 26 + this.cityPadding;

            const regionColors = REGION_COLORS[city.region] || REGION_COLORS.birmingham;

            // Outer glow ring — larger rounded rect for a distinctive "city node" look
            g.appendChild(this.createElement('rect', {
                x: -cityWidth / 2 - 3,
                y: -17,
                width: cityWidth + 6,
                height: cityHeight + 6,
                rx: 10, ry: 10,
                fill: 'none',
                stroke: regionColors.border,
                'stroke-width': 2.5,
                'stroke-opacity': '0.6',
                filter: 'url(#innerShadow)',
            }));

            // City body — rounded shape (rounder rx/ry)
            g.appendChild(this.createElement('rect', {
                x: -cityWidth / 2,
                y: -14,
                width: cityWidth,
                height: cityHeight,
                rx: 8, ry: 8,
                class: 'city-bg',
                fill: regionColors.fill,
                'fill-opacity': '0.55',
                stroke: regionColors.border,
                'stroke-width': '2',
                filter: 'url(#innerShadow)',
            }));

            // Beveled paper-cut highlight along the top edge
            g.appendChild(this.createElement('path', {
                d: `M${-cityWidth / 2 + 8},${-13} Q${-cityWidth / 2},${-13} ${-cityWidth / 2},${-5}`,
                fill: 'none',
                stroke: 'rgba(255,255,255,0.25)',
                'stroke-width': 1,
                'stroke-linecap': 'round',
            }));

            // Dark backing rect behind city name for readability
            const nameLen = city.name.length;
            const nameWidth = Math.max(nameLen * 6.5 + 12, cityWidth - 4);
            g.appendChild(this.createElement('rect', {
                x: -nameWidth / 2,
                y: -13,
                width: nameWidth,
                height: 16,
                fill: 'rgba(0,0,0,0.72)',
                rx: 5, ry: 5,
                class: 'city-label-bg',
            }));

            // City name — larger and more readable
            const nameText = this.createElement('text', {
                x: 0, y: -2,
                class: 'city-label',
                'font-size': city.name.length > 12 ? '8.5' : '10',
                'font-weight': '700',
                'letter-spacing': '0.5',
                fill: '#f0e0c0',
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

                // Slot border color based on primary type
                const slotBorderColor = this.getSlotBorderColor(typeArr[0]);

                // Slot background with industry-type colored border
                slotGroup.appendChild(this.createElement('rect', {
                    x: sx, y: sy,
                    width: this.citySlotSize, height: this.citySlotSize,
                    rx: 4, ry: 4,
                    fill: 'rgba(0,0,0,0.5)',
                    stroke: slotBorderColor,
                    'stroke-width': '1.5',
                    'stroke-opacity': typeArr.length > 1 ? '0.5' : '0.7',
                }));

                const boardKey = `${cityId}_${idx}`;
                const builtTile = this.state ? this.state.boardIndustries[boardKey] : null;

                if (builtTile) {
                    this.drawBuiltIndustryTile(slotGroup, sx, sy, builtTile);
                } else {
                    // Show slot type indicators with SVG icons
                    if (typeArr.length === 1) {
                        // Single type: show icon
                        const iconG = this.getIndustryIcon(typeArr[0], 13);
                        iconG.setAttribute('transform', `translate(${sx + this.citySlotSize/2}, ${sy + this.citySlotSize/2})`);
                        iconG.setAttribute('opacity', '0.45');
                        slotGroup.appendChild(iconG);
                    } else {
                        // Multiple types: show abbreviations with better contrast
                        const typeStr = typeArr.map(t => {
                            const d = INDUSTRY_DISPLAY[t];
                            return d ? d.shortName[0] : '?';
                        }).join('/');

                        const iconText = this.createElement('text', {
                            x: sx + this.citySlotSize / 2,
                            y: sy + this.citySlotSize / 2,
                            class: 'slot-icon',
                            'font-size': '7',
                            fill: 'rgba(255,255,255,0.5)',
                            'dominant-baseline': 'central',
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

        // Outer glow for player color — makes tiles visually prominent
        parent.appendChild(this.createElement('rect', {
            x: x - 2, y: y - 2,
            width: s + 4, height: s + 4,
            rx: 6, ry: 6,
            fill: 'none',
            stroke: playerColor,
            'stroke-width': 2,
            'stroke-opacity': tile.flipped ? '0.3' : '0.55',
            filter: `drop-shadow(0 0 3px ${playerColor})`,
        }));

        // Tile background with player color
        parent.appendChild(this.createElement('rect', {
            x, y, width: s, height: s,
            rx: 4, ry: 4,
            fill: tile.flipped
                ? 'url(#tileFlippedBg)'
                : playerColor,
            stroke: tile.flipped ? '#5aaa5a' : 'rgba(255,255,255,0.25)',
            'stroke-width': tile.flipped ? 1.5 : 1,
            opacity: tile.flipped ? 0.92 : 1,
            class: 'built-tile' + (tile.flipped ? ' flipped' : ''),
        }));

        // Shine highlight at top of tile
        parent.appendChild(this.createElement('rect', {
            x: x + 2, y: y + 2,
            width: s - 4, height: 4,
            rx: 2, ry: 2,
            fill: 'rgba(255,255,255,0.2)',
        }));

        // Diagonal hatch overlay for sold/flipped tiles — makes the state
        // change readable at a glance, not just a color swap.
        if (tile.flipped) {
            parent.appendChild(this.createElement('rect', {
                x, y, width: s, height: s,
                rx: 4, ry: 4,
                fill: 'url(#tileFlippedHatch)',
            }));
        }

        // Level number — larger and bolder
        const levelText = this.createElement('text', {
            x: x + 4, y: y + 10,
            'font-size': '9',
            fill: tile.flipped ? '#9aea9a' : 'white',
            'font-weight': '800',
            'font-family': 'Cinzel, serif',
        });
        levelText.textContent = tile.tileData.level;
        parent.appendChild(levelText);

        // Level pips — small progress dots under the level number (capped
        // at 4 for legibility at this tile size).
        const pipCount = Math.min(tile.tileData.level, 4);
        const pipTrack = Math.min(4, Math.max(pipCount, 2));
        for (let i = 0; i < pipTrack; i++) {
            parent.appendChild(this.createElement('circle', {
                cx: x + 4 + i * 3.5, cy: y + 13,
                r: 1,
                fill: i < pipCount ? (tile.flipped ? '#9aea9a' : 'rgba(255,255,255,0.9)') : 'rgba(255,255,255,0.25)',
            }));
        }

        // Industry SVG icon in center — larger
        const iconG = this.getIndustryIcon(tile.type, 12);
        iconG.setAttribute('transform', `translate(${x + s/2}, ${y + s/2 + 2})`);
        if (tile.flipped) {
            iconG.setAttribute('opacity', '0.8');
        }
        parent.appendChild(iconG);

        // VP badge if flipped — bigger, clearer, with a small burst ring
        if (tile.flipped) {
            parent.appendChild(this.createElement('circle', {
                cx: x + s - 5, cy: y + s - 5, r: 7.5,
                fill: 'none',
                stroke: '#c9a84c',
                'stroke-width': 0.75,
                'stroke-opacity': 0.5,
            }));
            parent.appendChild(this.createElement('circle', {
                cx: x + s - 5, cy: y + s - 5, r: 6,
                fill: '#c9a84c',
                stroke: '#8a6020',
                'stroke-width': 1,
                filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))',
            }));
            const vpText = this.createElement('text', {
                x: x + s - 5, y: y + s - 2,
                'text-anchor': 'middle',
                'font-size': '7',
                fill: '#1a1510',
                'font-weight': '800',
            });
            vpText.textContent = tile.tileData.vp;
            parent.appendChild(vpText);
        }

        // Resource cubes — 2-face isometric-style block (top face + shaded
        // side face) instead of a flat square.
        if (!tile.flipped && tile.resourceCubes > 0) {
            const cubeSize = 5;
            for (let i = 0; i < tile.resourceCubes; i++) {
                const cx = x + s - 5 - (i % 3) * 6;
                const cy = y + s - 5 - Math.floor(i / 3) * 6;
                let topColor = '#777';
                let sideColor = '#444';
                if (tile.type === INDUSTRY_TYPES.COAL_MINE) { topColor = '#4a4a4a'; sideColor = '#1a1a1a'; }
                else if (tile.type === INDUSTRY_TYPES.IRON_WORKS) { topColor = '#e89030'; sideColor = '#a05800'; }
                else if (tile.type === INDUSTRY_TYPES.BREWERY) { topColor = '#e0c860'; sideColor = '#a08010'; }

                const half = cubeSize / 2;
                // Side face (shaded, offset down-right to suggest depth)
                parent.appendChild(this.createElement('polygon', {
                    points: `${cx - half + 1},${cy + half} ${cx + half},${cy + half} ${cx + half + 1},${cy + half + 1.5} ${cx - half + 2},${cy + half + 1.5}`,
                    fill: sideColor,
                    class: 'resource-cube',
                }));
                // Top face
                parent.appendChild(this.createElement('rect', {
                    x: cx - half, y: cy - half,
                    width: cubeSize, height: cubeSize,
                    rx: 1, ry: 1,
                    fill: topColor,
                    stroke: 'rgba(255,255,255,0.4)',
                    'stroke-width': 0.5,
                    class: 'resource-cube',
                    filter: `drop-shadow(0 1px 1px ${sideColor})`,
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
                        const isBlank = mt.buys === 'blank';
                        const buyText = this.createElement('text', {
                            x: 0, y: 13 + i * 14,
                            'text-anchor': 'middle',
                            'font-size': '6',
                            fill: isBlank ? '#555' : '#b87333',
                        });
                        buyText.textContent = isBlank ? '—' :
                            (mt.buys === 'any' ? 'Any' : INDUSTRY_DISPLAY[mt.buys].shortName);
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
                    // Built canal: solid thick blue with player color overlay
                    // Outer blue glow (water base)
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#4499cc',
                        'stroke-width': 10,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.3',
                        class: 'connection-line built',
                    }));
                    // Mid blue layer
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#3388bb',
                        'stroke-width': 6,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.5',
                        class: 'connection-line built',
                    }));
                    // Player color overlay — bright center
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: playerColor,
                        'stroke-width': 3,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.85',
                        class: 'connection-line built',
                    }));
                } else {
                    // Built rail: dark with player color, with tie pattern
                    // Outer dark ballast bed
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: '#333',
                        'stroke-width': 7,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.7',
                        class: 'connection-line built',
                    }));
                    // Player color rail line
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: playerColor,
                        'stroke-width': 4,
                        'stroke-linecap': 'round',
                        'stroke-opacity': '0.75',
                        class: 'connection-line built',
                    }));
                    // Tie/sleeper pattern over player color
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg,
                        stroke: 'rgba(0,0,0,0.5)',
                        'stroke-width': 3,
                        'stroke-linecap': 'butt',
                        'stroke-dasharray': '3 8',
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
        this.svg.querySelector('#brewery-farms-layer')?.remove();
        this.svg.querySelector('#merchants-layer')?.remove();
        this.svg.querySelector('#cities-layer')?.remove();
        this.svg.querySelector('#built-links-layer')?.remove();

        this.drawBreweryFarms();
        this.drawMerchants();
        this.drawCities();
        this.drawBuiltLinks();
    }
}

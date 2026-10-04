// ============================================================================
// Brass: Birmingham - Board Renderer (SVG)
// ============================================================================
// The board is drawn as a painted relief map of the Midlands at night rather
// than a flat diagram: a procedurally generated terrain raster underneath,
// rivers and canals cut through it, towns sitting on dark plinths with
// region-coloured name banners, and a numbered score track running the
// perimeter of an ornate frame.
//
// DOM contract consumed by uiManager.js — do not rename:
//   .city-group[data-city]          .industry-slot[data-city][data-slot]
//   .connection-line[data-connection]  .brewery-farm[data-farm]
//   .merchant-group[data-merchant]  .highlight-slot / .highlight
//   layer ids: #connections-layer #brewery-farms-layer #merchants-layer
//              #cities-layer #built-links-layer
// Public API: render, update, fullUpdate, highlightSlots,
//             highlightConnections, clearHighlights
// ============================================================================

class BoardRenderer {
    constructor(svgElement) {
        this.svg = svgElement;
        this.ns = 'http://www.w3.org/2000/svg';
        this.citySlotSize = 22;   // slot width, in board units
        this.citySlotH = 22;      // slot height (differs on a real board image)
        this.citySlotGap = 4;
        this.cityPadding = 6;
        this.tooltip = null;

        // Content box (city/merchant coordinates live in here) and the margin
        // the frame + score track occupy. Matches the SVG viewBox in index.html.
        this.W = 900;
        this.H = 850;
        this.M = 46;

        // Optional user-supplied board image (see js/boardAssets.js) and the
        // location layout that goes with it. Null means "draw the board".
        this.assetURL = null;
        this.layout = null;
        this.assetProbed = false;
        this.calibrating = /[?&]calibrate=1/.test(location.search);

        // Pan / zoom state, expressed as the SVG viewBox.
        this.homeView = { x: -this.M, y: -this.M, w: this.W + this.M * 2, h: this.H + this.M * 2 };
        this.view = { ...this.homeView };
        this.minScale = 1;
        this.maxScale = 6;
        this._viewBound = false;
    }

    // ========================================================================
    // Pan and zoom
    // ========================================================================

    applyView() {
        const v = this.view;
        this.svg.setAttribute('viewBox', `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${v.h.toFixed(2)}`);
    }

    clampView() {
        const h = this.homeView, v = this.view;
        const minW = h.w / this.maxScale, maxW = h.w / this.minScale;
        v.w = Math.min(maxW, Math.max(minW, v.w));
        v.h = v.w * (h.h / h.w);
        // Keep the board covering the frame; never pan into empty space.
        v.x = Math.min(h.x + h.w - v.w, Math.max(h.x, v.x));
        v.y = Math.min(h.y + h.h - v.h, Math.max(h.y, v.y));
    }

    zoomAt(clientX, clientY, factor) {
        const r = this.svg.getBoundingClientRect();
        // Pointer position as a fraction of the rendered board.
        const fx = (clientX - r.left) / r.width;
        const fy = (clientY - r.top) / r.height;
        const v = this.view;
        const bx = v.x + fx * v.w, by = v.y + fy * v.h;   // board point under cursor
        v.w /= factor;
        v.h /= factor;
        this.clampView();
        // Put the same board point back under the cursor.
        v.x = bx - fx * v.w;
        v.y = by - fy * v.h;
        this.clampView();
        this.applyView();
    }

    resetView() {
        this.view = { ...this.homeView };
        this.applyView();
    }

    enableViewControls() {
        if (this._viewBound) return;
        this._viewBound = true;

        this.svg.addEventListener('wheel', (e) => {
            e.preventDefault();
            this.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15);
        }, { passive: false });

        let pan = null, moved = false;
        this.svg.addEventListener('pointerdown', (e) => {
            if (this.calibrating || e.button !== 0) return;
            pan = { x: e.clientX, y: e.clientY, vx: this.view.x, vy: this.view.y };
            moved = false;
        });
        this.svg.addEventListener('pointermove', (e) => {
            if (!pan) return;
            const r = this.svg.getBoundingClientRect();
            const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
            if (!moved && Math.hypot(dx, dy) < 5) return;   // still a click, not a drag
            if (!moved) { moved = true; this.svg.style.cursor = 'grabbing'; }
            this.view.x = pan.vx - dx * (this.view.w / r.width);
            this.view.y = pan.vy - dy * (this.view.h / r.height);
            this.clampView();
            this.applyView();
        });
        const endPan = () => {
            if (moved) {
                // Swallow the click that follows a drag so panning never
                // selects a slot underneath the cursor.
                this.svg.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                }, { capture: true, once: true });
            }
            pan = null;
            this.svg.style.cursor = '';
        };
        this.svg.addEventListener('pointerup', endPan);
        this.svg.addEventListener('pointercancel', endPan);
        this.svg.addEventListener('pointerleave', endPan);

        window.addEventListener('keydown', (e) => {
            if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
            if (e.key === '+' || e.key === '=') this.zoomAt(innerWidth / 2, innerHeight / 2, 1.3);
            else if (e.key === '-' || e.key === '_') this.zoomAt(innerWidth / 2, innerHeight / 2, 1 / 1.3);
            else if (e.key === '0') this.resetView();
        });
    }

    // Where a location sits, in board coordinates. A calibrated or measured
    // layout overrides the hand-authored positions in gameData.js.
    pos(locationId) {
        const l = this.layout && this.layout[locationId];
        if (l) return { x: l[0] * this.W, y: l[1] * this.H };
        return getLocationPosition(locationId) || { x: 0, y: 0 };
    }

    render(gameState) {
        this.svg.innerHTML = '';
        this.state = gameState;
        this.buildDefs();
        if (this.assetURL) {
            this.drawBoardImage();
        } else {
            this.drawTerrain();
            this.drawRegionWashes();
            this.drawRivers();
            this.drawTownGlow();
            this.drawVignette();
            this.drawFrame();
        }
        this.drawConnections();
        this.drawBreweryFarms();
        this.drawMerchants();
        this.drawCities();
        this.drawBuiltLinks();
        this.probeAsset();
        this.enableViewControls();
        this.applyView();
        if (this.calibrating) this.enableCalibration();
    }

    // Looks once for a locally supplied board image; redraws if one turns up.
    probeAsset() {
        if (this.assetProbed || typeof BoardAssets === 'undefined') return;
        this.assetProbed = true;
        Promise.all([
            BoardAssets.resolve(),
            BoardAssets.probeTiles(),
            BoardAssets.probeCards(),
        ]).then(([url]) => {
            const layout = BoardAssets.layoutFor(!!url);
            if (!url && !layout) return;
            this.assetURL = url;
            this.layout = layout;
            // Printed industry spaces are larger than the slots we draw on our
            // own board, so match them when sitting on real artwork.
            if (url) {
                // Measured off the printed board: spaces are ~38.8 x 36.3
                // board units on a ~40 unit pitch.
                this.citySlotSize = 39;
                this.citySlotH = 36;
                this.citySlotGap = 2.6;   // measured pitch is ~41.6 units
                this.cityPadding = 2;
            }
            this.render(this.state);
            // Hand, mat and markets render outside this class; let them know
            // artwork turned up so they can redraw with it.
            window.dispatchEvent(new CustomEvent('boardassets:ready'));
        });
    }

    // The supplied image *is* the board, frame and score track included, so it
    // fills the content box and only the surround is painted behind it.
    drawBoardImage() {
        const g = this.createGroup({ id: 'terrain-layer', 'pointer-events': 'none' });
        g.appendChild(this.createElement('rect', {
            x: -this.M, y: -this.M,
            width: this.W + this.M * 2, height: this.H + this.M * 2,
            fill: '#15181f',
        }));
        g.appendChild(this.createElement('image', {
            x: 0, y: 0, width: this.W, height: this.H,
            href: this.assetURL, preserveAspectRatio: 'none',
        }));
        this.svg.appendChild(g);
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

    text(content, attrs = {}) {
        const el = this.createElement('text', attrs);
        el.textContent = content;
        return el;
    }

    getIndustryIcon(type, size = 14, variant = 'silhouette') {
        return IndustryIcons.renderElement(type, size, variant);
    }

    // ========================================================================
    // Defs — gradients and the one filter the board uses
    // ========================================================================

    buildDefs() {
        const defs = this.createElement('defs');

        // Ink grain, applied to a single full-board rect (never per element —
        // 30+ filtered groups stutter badly on redraw).
        const grain = this.createElement('filter', {
            id: 'boardGrain', x: '0%', y: '0%', width: '100%', height: '100%',
        });
        grain.appendChild(this.createElement('feTurbulence', {
            type: 'fractalNoise', baseFrequency: '0.75', numOctaves: '3',
            stitchTiles: 'stitch', result: 'noise',
        }));
        grain.appendChild(this.createElement('feColorMatrix', {
            in: 'noise', type: 'matrix',
            values: '0 0 0 0 0.78  0 0 0 0 0.72  0 0 0 0 0.58  0 0 0 0.30 0',
        }));
        defs.appendChild(grain);

        // Contact shadow for a placed tile: soft, close, slightly down-right,
        // the way a cardboard chip sits on a board under room light.
        const tileShadow = this.createElement('filter', {
            id: 'tileShadow', x: '-35%', y: '-35%', width: '180%', height: '180%',
        });
        tileShadow.appendChild(this.createElement('feDropShadow', {
            dx: '0.7', dy: '1.4', stdDeviation: '1.1',
            'flood-color': '#05070c', 'flood-opacity': '0.62',
        }));
        defs.appendChild(tileShadow);

        // Region washes — painted county tints over the relief.
        for (const [regionId, colors] of Object.entries(REGION_COLORS)) {
            const grad = this.createElement('radialGradient', {
                id: `wash_${regionId}`, cx: '50%', cy: '50%', r: '50%',
            });
            grad.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': colors.fill, 'stop-opacity': '0.12' }));
            grad.appendChild(this.createElement('stop', { offset: '58%', 'stop-color': colors.fill, 'stop-opacity': '0.05' }));
            grad.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': colors.fill, 'stop-opacity': '0' }));
            defs.appendChild(grad);
        }

        // Warm furnace light pooling over each town.
        const lamp = this.createElement('radialGradient', { id: 'townGlow', cx: '50%', cy: '50%', r: '50%' });
        lamp.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': '#ffb15a', 'stop-opacity': '0.30' }));
        lamp.appendChild(this.createElement('stop', { offset: '45%', 'stop-color': '#e07a28', 'stop-opacity': '0.12' }));
        lamp.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': '#c05a18', 'stop-opacity': '0' }));
        defs.appendChild(lamp);

        // Edge darkening.
        const vign = this.createElement('radialGradient', { id: 'boardVignette', cx: '50%', cy: '46%', r: '70%' });
        vign.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': '#05070b', 'stop-opacity': '0' }));
        vign.appendChild(this.createElement('stop', { offset: '58%', 'stop-color': '#05070b', 'stop-opacity': '0.08' }));
        vign.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': '#05070b', 'stop-opacity': '0.62' }));
        defs.appendChild(vign);

        // Brass frame bevel.
        const frameGrad = this.createElement('linearGradient', { id: 'frameBrass', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
        frameGrad.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': '#6a5a38' }));
        frameGrad.appendChild(this.createElement('stop', { offset: '18%', 'stop-color': '#3a3222' }));
        frameGrad.appendChild(this.createElement('stop', { offset: '82%', 'stop-color': '#2c261a' }));
        frameGrad.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': '#564a2e' }));
        defs.appendChild(frameGrad);

        // Town plinth — slate stone, lit from above.
        const plinth = this.createElement('linearGradient', { id: 'cityPlinth', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
        plinth.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': '#2a3140', 'stop-opacity': '0.96' }));
        plinth.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': '#161b25', 'stop-opacity': '0.96' }));
        defs.appendChild(plinth);

        // Merchant building — weathered sandstone.
        const stone = this.createElement('linearGradient', { id: 'merchantStone', x1: '0%', y1: '0%', x2: '0%', y2: '100%' });
        stone.appendChild(this.createElement('stop', { offset: '0%', 'stop-color': '#4a4133' }));
        stone.appendChild(this.createElement('stop', { offset: '100%', 'stop-color': '#2b2620' }));
        defs.appendChild(stone);

        this.svg.appendChild(defs);
    }

    // ========================================================================
    // Terrain — procedural relief raster, generated once and cached
    // ========================================================================

    // Builds a painted hill-shaded relief as a PNG data URL. Rendered at half
    // resolution and upscaled by the <image>; the softness reads as brushwork
    // and keeps generation under ~100ms.
    makeTerrainDataURL() {
        if (BoardRenderer._terrainURL) return BoardRenderer._terrainURL;

        const TW = 496, TH = 471; // half of the full board incl. margin
        const canvas = document.createElement('canvas');
        canvas.width = TW;
        canvas.height = TH;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(TW, TH);
        const d = img.data;

        const hash = (x, y) => {
            let h = (x * 374761393 + y * 668265263) | 0;
            h = Math.imul(h ^ (h >>> 13), 1274126177);
            return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
        };
        const smooth = (t) => t * t * (3 - 2 * t);
        const vnoise = (x, y) => {
            const xi = Math.floor(x), yi = Math.floor(y);
            const xf = x - xi, yf = y - yi;
            const u = smooth(xf), v = smooth(yf);
            const a = hash(xi, yi), b = hash(xi + 1, yi);
            const c = hash(xi, yi + 1), e = hash(xi + 1, yi + 1);
            return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + e * u) * v;
        };
        const fbm = (x, y) => {
            let sum = 0, amp = 0.5, f = 1;
            for (let o = 0; o < 5; o++) {
                sum += vnoise(x * f, y * f) * amp;
                f *= 2.03;
                amp *= 0.5;
            }
            return sum;
        };

        // Height field first, so hill-shading can read neighbouring samples.
        const H = new Float32Array(TW * TH);
        for (let y = 0; y < TH; y++) {
            for (let x = 0; x < TW; x++) {
                // Gentle NE-to-SW tilt: Pennine edge high in the north-east,
                // Severn vale low in the south-west.
                const tilt = (x / TW) * 0.10 + ((TH - y) / TH) * 0.12;
                H[y * TW + x] = fbm(x / 56, y / 56) * 0.92 + tilt;
            }
        }

        // Elevation ramp: cold slate valleys up through moor brown.
        const ramp = [
            [0.00, 28, 34, 45],
            [0.32, 34, 40, 52],
            [0.50, 41, 46, 56],
            [0.66, 49, 51, 55],
            [0.82, 58, 56, 51],
            [1.00, 68, 64, 56],
        ];
        const sample = (t) => {
            t = t < 0 ? 0 : t > 1 ? 1 : t;
            for (let i = 1; i < ramp.length; i++) {
                if (t <= ramp[i][0]) {
                    const a = ramp[i - 1], b = ramp[i];
                    const k = (t - a[0]) / (b[0] - a[0]);
                    return [
                        a[1] + (b[1] - a[1]) * k,
                        a[2] + (b[2] - a[2]) * k,
                        a[3] + (b[3] - a[3]) * k,
                    ];
                }
            }
            const l = ramp[ramp.length - 1];
            return [l[1], l[2], l[3]];
        };

        // Industrial haze over the Black Country / Birmingham basin.
        const smogX = 0.46 * TW, smogY = 0.56 * TH, smogR = 0.34 * TW;

        for (let y = 0; y < TH; y++) {
            for (let x = 0; x < TW; x++) {
                const i = y * TW + x;
                const h = H[i];
                let [r, g, b] = sample((h - 0.18) / 0.72);

                // Lambert hill-shade, light from the north-west.
                const xl = x > 0 ? H[i - 1] : h;
                const xr = x < TW - 1 ? H[i + 1] : h;
                const yu = y > 0 ? H[i - TW] : h;
                const yd = y < TH - 1 ? H[i + TW] : h;
                const shade = 1 + ((xl - xr) + (yu - yd)) * 1.4;
                const s = shade < 0.74 ? 0.74 : shade > 1.26 ? 1.26 : shade;
                r *= s; g *= s; b *= s;

                // Warm soot wash toward the industrial centre.
                const dx = (x - smogX) / smogR, dy = (y - smogY) / smogR;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 1) {
                    const k = (1 - dist) * 0.13;
                    r = r * (1 - k) + 86 * k;
                    g = g * (1 - k) + 66 * k;
                    b = b * (1 - k) + 48 * k;
                }

                const o = i * 4;
                d[o] = r < 0 ? 0 : r > 255 ? 255 : r;
                d[o + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
                d[o + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
                d[o + 3] = 255;
            }
        }

        ctx.putImageData(img, 0, 0);
        BoardRenderer._terrainURL = canvas.toDataURL('image/png');
        return BoardRenderer._terrainURL;
    }

    drawTerrain() {
        const g = this.createGroup({ id: 'terrain-layer', 'pointer-events': 'none' });
        const x = -this.M, y = -this.M;
        const w = this.W + this.M * 2, h = this.H + this.M * 2;

        g.appendChild(this.createElement('rect', { x, y, width: w, height: h, fill: '#1b212c' }));
        g.appendChild(this.createElement('image', {
            x, y, width: w, height: h,
            href: this.makeTerrainDataURL(),
            preserveAspectRatio: 'none',
            opacity: '0.96',
        }));
        // Single grain pass over the whole board.
        g.appendChild(this.createElement('rect', {
            x, y, width: w, height: h,
            filter: 'url(#boardGrain)', opacity: '0.22',
            style: 'mix-blend-mode:overlay',
        }));

        this.svg.appendChild(g);
    }

    drawRegionWashes() {
        const g = this.createGroup({ id: 'region-washes-layer', 'pointer-events': 'none' });
        for (const cityId of Object.keys(CITIES)) {
            const city = this.pos(cityId);
            g.appendChild(this.createElement('ellipse', {
                cx: city.x, cy: city.y + 4,
                rx: 102, ry: 70,
                fill: `url(#wash_${city.region})`,
            }));
        }
        this.svg.appendChild(g);
    }

    // Severn, Trent and Avon, drawn as painted water rather than lines.
    drawRivers() {
        const g = this.createGroup({ id: 'rivers-layer', 'pointer-events': 'none' });

        const rivers = [
            // Severn: down the western edge through Shrewsbury to Gloucester.
            'M70,250 C95,330 70,400 110,470 C150,540 120,610 150,680 C175,745 120,790 95,860',
            // Trent: across the north-east, Stoke toward Nottingham.
            'M330,120 C420,150 470,120 560,165 C650,210 720,175 820,215',
            // Tame/Avon: south-east out of the Birmingham basin.
            'M560,560 C640,600 690,660 760,700 C820,735 860,780 905,800',
            // Stour, a short western tributary.
            'M250,560 C290,610 300,660 285,715',
        ];

        // Deliberately desaturated: rivers are landscape, and must not be
        // mistaken for the blue canal links players actually build on.
        for (const d of rivers) {
            g.appendChild(this.createElement('path', {
                d, fill: 'none', stroke: '#141c26',
                'stroke-width': 11, 'stroke-linecap': 'round', 'stroke-opacity': '0.5',
            }));
            g.appendChild(this.createElement('path', {
                d, fill: 'none', stroke: '#2b3a46',
                'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-opacity': '0.65',
            }));
            g.appendChild(this.createElement('path', {
                d, fill: 'none', stroke: '#495d68',
                'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-opacity': '0.4',
            }));
        }

        this.svg.appendChild(g);
    }

    drawTownGlow() {
        const g = this.createGroup({ id: 'town-glow-layer', 'pointer-events': 'none' });
        for (const cityId of Object.keys(CITIES)) {
            const city = this.pos(cityId);
            g.appendChild(this.createElement('circle', {
                cx: city.x, cy: city.y, r: 74, fill: 'url(#townGlow)',
            }));
        }
        this.svg.appendChild(g);
    }

    drawVignette() {
        this.svg.appendChild(this.createElement('rect', {
            x: -this.M, y: -this.M,
            width: this.W + this.M * 2, height: this.H + this.M * 2,
            fill: 'url(#boardVignette)', 'pointer-events': 'none',
        }));
    }

    // ========================================================================
    // Frame and perimeter score track
    // ========================================================================

    // Maps t in [0,1) onto the score-track rectangle, returning the point, the
    // inward normal, and the rotation that keeps numerals facing the board.
    perimeterPoint(t, x0, y0, x1, y1) {
        const w = x1 - x0, h = y1 - y0;
        let dist = t * 2 * (w + h);
        if (dist < w) return { x: x0 + dist, y: y0, nx: 0, ny: 1, rot: 0 };
        dist -= w;
        if (dist < h) return { x: x1, y: y0 + dist, nx: -1, ny: 0, rot: 90 };
        dist -= h;
        if (dist < w) return { x: x1 - dist, y: y1, nx: 0, ny: -1, rot: 180 };
        dist -= w;
        return { x: x0, y: y1 - dist, nx: 1, ny: 0, rot: 270 };
    }

    drawFrame() {
        const g = this.createGroup({ id: 'frame-layer', 'pointer-events': 'none' });
        const M = this.M;
        const ox = -M, oy = -M, ow = this.W + M * 2, oh = this.H + M * 2;

        // Brass band carrying the track, as an even-odd ring so its two edges
        // are exact and the ticks can be positioned against them.
        const bOut = 2, bIn = M - 14;                       // insets from the board edge
        const ring = `M${ox + bOut},${oy + bOut} H${ox + ow - bOut} V${oy + oh - bOut} H${ox + bOut} Z ` +
                     `M${ox + bIn},${oy + bIn} H${ox + ow - bIn} V${oy + oh - bIn} H${ox + bIn} Z`;
        g.appendChild(this.createElement('path', {
            d: ring, fill: 'url(#frameBrass)', 'fill-rule': 'evenodd',
        }));
        // Rules either side of the band.
        for (const [inset, width, color, op] of [
            [bOut, 1.6, '#8a7647', 0.85],
            [bIn, 1.2, '#8a7647', 0.7],
            [M - 4, 2.4, '#14181f', 1],
        ]) {
            g.appendChild(this.createElement('rect', {
                x: ox + inset, y: oy + inset,
                width: ow - inset * 2, height: oh - inset * 2,
                fill: 'none', stroke: color, 'stroke-width': width, 'stroke-opacity': op,
            }));
        }

        // Score track: 0–99 around the perimeter, a tick per point, numerals
        // every fifth. Ticks hang off the outer half of the band, numerals sit
        // on the inner half, so the two never overlap.
        const mid = (bOut + bIn) / 2;
        const tx0 = ox + mid, ty0 = oy + mid;
        const tx1 = ox + ow - mid, ty1 = oy + oh - mid;
        for (let i = 0; i < 100; i++) {
            const p = this.perimeterPoint(i / 100, tx0, ty0, tx1, ty1);
            const major = i % 5 === 0;
            g.appendChild(this.createElement('line', {
                x1: p.x - p.nx * 13, y1: p.y - p.ny * 13,
                x2: p.x - p.nx * (major ? 4 : 7), y2: p.y - p.ny * (major ? 4 : 7),
                stroke: major ? '#d8bc72' : '#9a8a5e',
                'stroke-width': major ? 1.2 : 0.7,
                'stroke-opacity': major ? 0.95 : 0.5,
            }));
            if (major) {
                const lx = p.x + p.nx * 5.5, ly = p.y + p.ny * 5.5;
                g.appendChild(this.text(String(i), {
                    x: 0, y: 0,
                    transform: `translate(${lx}, ${ly}) rotate(${p.rot})`,
                    'text-anchor': 'middle', 'dominant-baseline': 'central',
                    'font-family': 'Cinzel, serif', 'font-size': '9',
                    'font-weight': '600', fill: '#e8d3a0', 'fill-opacity': '0.92',
                }));
            }
        }

        // Corner rosettes.
        for (const [cx, cy] of [[ox + M / 2, oy + M / 2], [ox + ow - M / 2, oy + M / 2],
                                [ox + M / 2, oy + oh - M / 2], [ox + ow - M / 2, oy + oh - M / 2]]) {
            g.appendChild(this.createElement('circle', {
                cx, cy, r: 8, fill: '#1d2029', stroke: '#c9a84c',
                'stroke-width': 1.1, 'stroke-opacity': 0.75,
            }));
            g.appendChild(this.createElement('circle', {
                cx, cy, r: 3.4, fill: '#c9a84c', 'fill-opacity': 0.55,
            }));
        }

        // Title cartouche along the bottom rail.
        const cart = this.createGroup({ transform: `translate(${this.W / 2}, ${this.H + M / 2})` });
        cart.appendChild(this.createElement('rect', {
            x: -132, y: -11, width: 264, height: 22, rx: 3, ry: 3,
            fill: '#191d25', stroke: '#c9a84c', 'stroke-width': 0.9, 'stroke-opacity': 0.7,
        }));
        cart.appendChild(this.text('BRASS · BIRMINGHAM', {
            x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            'font-family': 'Cinzel, serif', 'font-size': '11',
            'letter-spacing': '4.5', fill: '#e2c98c',
        }));
        g.appendChild(cart);

        // Era legend along the top rail.
        const era = this.state ? this.state.era : ERA.CANAL;
        const eraLabel = era === ERA.RAIL ? 'RAIL ERA · 1830–1870' : 'CANAL ERA · 1770–1830';
        const top = this.createGroup({ transform: `translate(${this.W / 2}, ${-M / 2})` });
        top.appendChild(this.createElement('rect', {
            x: -104, y: -10, width: 208, height: 20, rx: 3, ry: 3,
            fill: '#191d25', stroke: '#c9a84c', 'stroke-width': 0.9, 'stroke-opacity': 0.7,
        }));
        top.appendChild(this.text(eraLabel, {
            x: 0, y: 1, 'text-anchor': 'middle', 'dominant-baseline': 'central',
            'font-family': 'Cinzel, serif', 'font-size': '9.5',
            'letter-spacing': '2.6', fill: '#e2c98c',
        }));
        g.appendChild(top);

        this.svg.appendChild(g);
    }

    // ========================================================================
    // Connections — canal waterways and permanent way
    // ========================================================================

    drawConnections() {
        const connGroup = this.createGroup({ id: 'connections-layer' });
        const era = this.state ? this.state.era : ERA.CANAL;

        for (const conn of CONNECTIONS) {
            const pos1 = this.pos(conn.cities[0]);
            const pos2 = this.pos(conn.cities[1]);
            if (!pos1 || !pos2) continue;

            const segments = [];
            if (conn.viaBrewery) {
                const brewPos = this.pos(conn.viaBrewery);
                if (brewPos) {
                    segments.push({ x1: pos1.x, y1: pos1.y, x2: brewPos.x, y2: brewPos.y });
                    segments.push({ x1: brewPos.x, y1: brewPos.y, x2: pos2.x, y2: pos2.y });
                }
            } else {
                segments.push({ x1: pos1.x, y1: pos1.y, x2: pos2.x, y2: pos2.y });
            }

            // Both printed path types stay visible like on the physical board;
            // the type closed for the current era is drawn faint.
            const canalDim = era === ERA.RAIL ? 0.3 : 1;
            const railDim = era === ERA.CANAL ? 0.45 : 1;

            // A board image already prints every canal and rail route, so in
            // that mode we lay down only the invisible hit lines. They carry
            // class "connection-line", so .highlight still paints them gold
            // when the Network action is choosing a link.
            const printed = !this.assetURL;

            for (const seg of segments) {
                if (printed && conn.canal) {
                    connGroup.appendChild(this.createElement('line', {
                        ...seg, stroke: '#2f4d63', 'stroke-width': 7,
                        'stroke-linecap': 'round', 'stroke-opacity': String(0.65 * canalDim),
                        class: 'connection-line', 'pointer-events': 'none',
                        'data-connection': conn.id,
                    }));
                    connGroup.appendChild(this.createElement('line', {
                        ...seg, stroke: '#5f93b2', 'stroke-width': 2.2,
                        'stroke-linecap': 'round', 'stroke-opacity': String(0.7 * canalDim),
                        class: 'connection-line', 'pointer-events': 'none',
                        'data-connection': conn.id,
                    }));
                }
                if (printed && conn.rail) {
                    // Ballast bed with sleeper ties laid over it.
                    connGroup.appendChild(this.createElement('line', {
                        ...seg, stroke: '#2a2621', 'stroke-width': 4.4,
                        'stroke-linecap': 'round', 'stroke-opacity': String(0.7 * railDim),
                        class: 'connection-line', 'pointer-events': 'none',
                        'data-connection': conn.id,
                    }));
                    connGroup.appendChild(this.createElement('line', {
                        ...seg, stroke: '#9d8e74', 'stroke-width': 4.4,
                        'stroke-linecap': 'butt', 'stroke-dasharray': '1.4 5',
                        'stroke-opacity': String(0.5 * railDim),
                        class: 'connection-line', 'pointer-events': 'none',
                        'data-connection': conn.id,
                    }));
                }
                // Wide invisible hit area for selection.
                connGroup.appendChild(this.createElement('line', {
                    ...seg, stroke: 'transparent', 'stroke-width': 13,
                    class: 'connection-line', 'data-connection': conn.id,
                }));
            }
        }

        this.svg.appendChild(connGroup);
    }

    // ========================================================================
    // Cities
    // ========================================================================

    getSlotBorderColor(type) {
        const slotColors = {
            [INDUSTRY_TYPES.COTTON_MILL]: '#8fa9bd',
            [INDUSTRY_TYPES.COAL_MINE]: '#8d8d8d',
            [INDUSTRY_TYPES.IRON_WORKS]: '#d08a45',
            [INDUSTRY_TYPES.MANUFACTURER]: '#c0a066',
            [INDUSTRY_TYPES.POTTERY]: '#cf7a62',
            [INDUSTRY_TYPES.BREWERY]: '#d9b14e',
        };
        return slotColors[type] || 'rgba(255,255,255,0.3)';
    }

    // Region-coloured ribbon with notched tails, as printed on the board.
    makeBanner(name, width, y, regionColors) {
        const g = this.createGroup();
        const h = 15;
        const half = width / 2;
        const tail = 6;

        g.appendChild(this.createElement('path', {
            d: `M${-half - tail},${y + h / 2} L${-half},${y} L${half},${y} ` +
               `L${half + tail},${y + h / 2} L${half},${y + h} L${-half},${y + h} Z`,
            fill: regionColors.fill,
            stroke: regionColors.border,
            'stroke-width': 0.9,
            class: 'city-label-bg',
        }));
        g.appendChild(this.createElement('path', {
            d: `M${-half},${y + 1.4} L${half},${y + 1.4}`,
            stroke: 'rgba(255,255,255,0.28)', 'stroke-width': 0.8, fill: 'none',
        }));
        g.appendChild(this.text(name.toUpperCase(), {
            x: 0, y: y + h / 2 + 0.4,
            class: 'city-label',
            'font-size': name.length > 13 ? '7' : '8',
            'dominant-baseline': 'central',
        }));
        return g;
    }

    drawCities() {
        const cityGroup = this.createGroup({ id: 'cities-layer' });
        const S = this.citySlotSize;
        const SH = this.citySlotH;
        const GAP = this.citySlotGap;
        const pad = this.cityPadding;

        for (const [cityId, city] of Object.entries(CITIES)) {
            const g = this.createGroup({
                class: 'city-group',
                'data-city': cityId,
                transform: `translate(${this.pos(cityId).x}, ${this.pos(cityId).y})`,
            });

            const slotsPerRow = Math.min(city.slots.length, 4);
            const rows = Math.ceil(city.slots.length / slotsPerRow);
            const slotsW = slotsPerRow * (S + GAP) - GAP;
            const slotsH = rows * (SH + GAP) - GAP;
            const plateW = slotsW + pad * 2;
            const plateH = slotsH + pad * 2;
            const px = -plateW / 2, py = -plateH / 2;

            const regionColors = REGION_COLORS[city.region] || REGION_COLORS.birmingham;

            // With a board image the printed map already shows the town, its
            // name and its industry spaces, so we drop our own plinth and
            // banner and let the artwork through.
            const overlay = !!this.assetURL;

            if (!overlay) {
                // Cast shadow, then the slate plinth the town sits on.
                g.appendChild(this.createElement('rect', {
                    x: px + 1.5, y: py + 3, width: plateW, height: plateH,
                    rx: 5, ry: 5, fill: 'rgba(6,8,12,0.5)',
                }));
                g.appendChild(this.createElement('rect', {
                    x: px, y: py, width: plateW, height: plateH,
                    rx: 5, ry: 5,
                    class: 'city-bg',
                    fill: 'url(#cityPlinth)',
                    stroke: regionColors.border,
                    'stroke-width': 1.1,
                }));
                // Top bevel highlight.
                g.appendChild(this.createElement('path', {
                    d: `M${px + 2},${py + 1} L${px + plateW - 2},${py + 1}`,
                    stroke: 'rgba(255,255,255,0.14)', 'stroke-width': 1, fill: 'none',
                }));
            }
            // In overlay mode there is deliberately no city-wide plate: the
            // individual slots are the only hit targets, so hovering never
            // outlines empty map around a town.

            // Industry slots. On a real board the spaces are not always a
            // single row — Coalbrookdale prints one over two, Birmingham two
            // over two — so their centres come from the measured layout.
            const slotStartX = -slotsW / 2;
            const slotStartY = -slotsH / 2;
            const printedSlots = overlay && typeof BoardAssets !== 'undefined'
                ? BoardAssets.slotPositions(cityId, this.layout) : null;
            const anchor = this.pos(cityId);

            city.slots.forEach((slotTypes, idx) => {
                const row = Math.floor(idx / slotsPerRow);
                const col = idx % slotsPerRow;
                let sx = slotStartX + col * (S + GAP);
                let sy = slotStartY + row * (SH + GAP);
                if (printedSlots && printedSlots[idx]) {
                    // Positions are absolute; the group is already translated.
                    sx = printedSlots[idx][0] * this.W - anchor.x - S / 2;
                    sy = printedSlots[idx][1] * this.H - anchor.y - SH / 2;
                }

                const slotGroup = this.createGroup({
                    class: 'industry-slot',
                    'data-city': cityId,
                    'data-slot': idx,
                });

                const typeArr = Array.isArray(slotTypes) ? slotTypes : [slotTypes];
                const boardKey = `${cityId}_${idx}`;
                const builtTile = this.state ? this.state.boardIndustries[boardKey] : null;

                // Recessed printed space. Over a board image this is only a
                // faint outline, so the printed industry space reads through.
                slotGroup.appendChild(this.createElement('rect', {
                    x: sx, y: sy, width: S, height: SH, rx: 3, ry: 3,
                    fill: overlay ? 'rgba(0,0,0,0.10)' : '#11151d',
                    'fill-opacity': overlay ? '1' : '0.92',
                    stroke: this.getSlotBorderColor(typeArr[0]),
                    'stroke-width': typeArr.length > 1 ? '0.7' : '0.9',
                    'stroke-opacity': overlay ? '0.3' : (typeArr.length > 1 ? '0.45' : '0.7'),
                }));

                if (builtTile) {
                    this.drawBuiltIndustryTile(slotGroup, sx, sy, builtTile);
                } else if (overlay) {
                    // Printed artwork already says what may be built here.
                } else if (typeArr.length === 1) {
                    const iconG = this.getIndustryIcon(typeArr[0], 14);
                    iconG.setAttribute('transform', `translate(${sx + S / 2}, ${sy + SH / 2})`);
                    iconG.setAttribute('opacity', '0.72');
                    slotGroup.appendChild(iconG);
                } else {
                    // Two permitted industries: show both, split on the diagonal,
                    // rather than the old "C/G" text code.
                    slotGroup.appendChild(this.createElement('path', {
                        d: `M${sx + S - 2},${sy + 2} L${sx + 2},${sy + SH - 2}`,
                        stroke: 'rgba(255,255,255,0.16)', 'stroke-width': 0.6, fill: 'none',
                    }));
                    const a = this.getIndustryIcon(typeArr[0], 10);
                    a.setAttribute('transform', `translate(${sx + S * 0.31}, ${sy + SH * 0.32})`);
                    a.setAttribute('opacity', '0.7');
                    slotGroup.appendChild(a);
                    const b = this.getIndustryIcon(typeArr[1], 10);
                    b.setAttribute('transform', `translate(${sx + S * 0.69}, ${sy + SH * 0.68})`);
                    b.setAttribute('opacity', '0.7');
                    slotGroup.appendChild(b);
                }

                g.appendChild(slotGroup);
            });

            // Name banner beneath the town — only when we are drawing the map
            // ourselves; a board image prints its own.
            if (!overlay) {
                g.appendChild(this.makeBanner(city.name, Math.max(plateW - 8, 52), plateH / 2 + 2, regionColors));
            }

            cityGroup.appendChild(g);
        }

        this.svg.appendChild(cityGroup);
    }

    drawBuiltIndustryTile(parent, x, y, tile) {
        const s = this.citySlotSize;
        const sh = this.citySlotH;
        const playerColor = this.state.players[tile.playerId].color;

        // Real chip artwork, when the tile set has been supplied locally.
        const art = (typeof BoardAssets !== 'undefined' && BoardAssets.tilesReady())
            ? BoardAssets.tileUrl(tile.type, tile.tileData.level, tile.flipped)
            : null;
        // Nobody places a tile perfectly square. A small, stable rotation per
        // tile is what stops a grid of them reading as flat UI rectangles.
        const g = this.placedTileGroup(parent, x, y, s, sh, tile);

        if (art) {
            g.appendChild(this.createElement('image', {
                x, y, width: s, height: sh, href: art,
                preserveAspectRatio: 'none',
                class: 'built-tile' + (tile.flipped ? ' flipped' : ''),
            }));
            // Only one colour set exists locally, so ownership is carried by a
            // ring in the player's colour rather than by the chip itself.
            g.appendChild(this.createElement('rect', {
                x: x + 0.6, y: y + 0.6, width: s - 1.2, height: sh - 1.2,
                rx: 2.5, ry: 2.5, fill: 'none',
                stroke: playerColor, 'stroke-width': 2.2, 'stroke-opacity': 0.95,
            }));
            // Lit top-left edge gives the chip its thickness.
            g.appendChild(this.createElement('path', {
                d: `M${x + 1.4},${y + sh - 1.4} L${x + 1.4},${y + 1.4} L${x + s - 1.4},${y + 1.4}`,
                fill: 'none', stroke: 'rgba(255,255,255,0.22)', 'stroke-width': 1,
            }));
            if (!tile.flipped) this.drawResourceCubes(g, x, y, tile);
            return;
        }

        parent = g;
        parent.appendChild(this.createElement('rect', {
            x, y, width: s, height: s, rx: 3, ry: 3,
            fill: playerColor,
            stroke: 'rgba(10,8,4,0.75)', 'stroke-width': 1,
            class: 'built-tile' + (tile.flipped ? ' flipped' : ''),
        }));
        // Bevel: lit top edge, shadowed bottom edge.
        parent.appendChild(this.createElement('path', {
            d: `M${x + 2},${y + 1} L${x + s - 2},${y + 1}`,
            stroke: 'rgba(255,255,255,0.35)', 'stroke-width': 1, fill: 'none',
        }));
        parent.appendChild(this.createElement('path', {
            d: `M${x + 2},${y + s - 1} L${x + s - 2},${y + s - 1}`,
            stroke: 'rgba(0,0,0,0.35)', 'stroke-width': 1, fill: 'none',
        }));

        // Black top band (both faces of every physical tile carry it).
        const bandH = 11;
        parent.appendChild(this.createElement('path', {
            d: `M${x},${y + 3} Q${x},${y} ${x + 3},${y} L${x + s - 3},${y} Q${x + s},${y} ${x + s},${y + 3} L${x + s},${y + bandH} L${x},${y + bandH} Z`,
            fill: tile.flipped ? '#241c14' : '#14110c',
        }));
        parent.appendChild(this.text(tile.tileData.level, {
            x: x + 4.2, y: y + 8.6,
            'font-size': '8.5', fill: '#e8dcbc',
            'font-weight': '700', 'font-family': 'Cinzel, serif',
        }));

        const iconG = this.getIndustryIcon(tile.type, 12);
        iconG.setAttribute('transform', `translate(${x + s / 2}, ${y + bandH + (s - bandH) / 2 - 1})`);
        iconG.setAttribute('opacity', '0.9');
        parent.appendChild(iconG);

        if (!tile.flipped) {
            this.drawResourceCubes(parent, x, y, tile);
        } else {
            parent.appendChild(this.createElement('rect', {
                x: x + 2, y: y + s - 10.5, width: 13, height: 8.5,
                rx: 2, ry: 2, fill: '#241c14',
                stroke: '#c9a84c', 'stroke-width': 0.75,
            }));
            parent.appendChild(this.text(tile.tileData.vp, {
                x: x + 8.5, y: y + s - 4.2, 'text-anchor': 'middle',
                'font-size': '7', fill: '#e7c766', 'font-weight': '800',
            }));
            parent.appendChild(this.text('+' + tile.tileData.income, {
                x: x + s - 3, y: y + s - 4, 'text-anchor': 'end',
                'font-size': '6.5', fill: 'rgba(255,255,255,0.85)', 'font-weight': '600',
            }));
        }
    }

    // Wraps a placed tile in a group carrying its contact shadow and a small
    // deterministic rotation, so the same tile always sits the same way.
    placedTileGroup(parent, x, y, s, sh, tile) {
        let h = 2166136261;
        const key = `${tile.playerId}|${tile.type}|${x}|${y}`;
        for (let i = 0; i < key.length; i++) {
            h ^= key.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        const angle = (((h >>> 0) % 1000) / 1000 - 0.5) * 7;   // about -3.5..3.5 deg
        const g = this.createGroup({
            transform: `rotate(${angle.toFixed(2)} ${(x + s / 2).toFixed(1)} ${(y + sh / 2).toFixed(1)})`,
            filter: 'url(#tileShadow)',
        });
        parent.appendChild(g);
        return g;
    }

    drawResourceCubes(parent, x, y, tile) {
        const s = this.citySlotSize;
        const sh = this.citySlotH;
        {
            // Wooden cubes, drawn in projection: a lit top face, a shaded
            // left face and a darker right face, so they sit ON the tile.
            const u = Math.max(3.2, s * 0.15);     // cube edge
            const d = u * 0.45;                    // apparent height
            const palette = {
                [INDUSTRY_TYPES.COAL_MINE]:  ['#4f4f4f', '#2e2e2e', '#1b1b1b'],
                [INDUSTRY_TYPES.IRON_WORKS]: ['#f0983a', '#c06e1c', '#8d4e0e'],
                [INDUSTRY_TYPES.BREWERY]:    ['#e8cf6a', '#b99a2c', '#866c16'],
            };
            const [top, left, right] = palette[tile.type] || ['#8a8a8a', '#5f5f5f', '#444'];

            for (let i = 0; i < tile.resourceCubes; i++) {
                const cx = x + s - 3 - (i % 4) * (u + 1.4);
                const cy = y + sh - 3;
                const g2 = this.createGroup({ class: 'resource-cube' });
                // top face (a squashed diamond)
                g2.appendChild(this.createElement('polygon', {
                    points: `${cx},${cy - u} ${cx + u / 2},${cy - u + d / 2} ${cx},${cy - u + d} ${cx - u / 2},${cy - u + d / 2}`,
                    fill: top,
                }));
                // left face
                g2.appendChild(this.createElement('polygon', {
                    points: `${cx - u / 2},${cy - u + d / 2} ${cx},${cy - u + d} ${cx},${cy} ${cx - u / 2},${cy - d / 2}`,
                    fill: left,
                }));
                // right face
                g2.appendChild(this.createElement('polygon', {
                    points: `${cx + u / 2},${cy - u + d / 2} ${cx},${cy - u + d} ${cx},${cy} ${cx + u / 2},${cy - d / 2}`,
                    fill: right,
                }));
                parent.appendChild(g2);
            }
        }
    }

    // ========================================================================
    // Merchants
    // ========================================================================

    // A beer barrel, drawn end-on in a merchant's beer space.
    drawBarrel(parent, cx, cy, filled) {
        if (filled) {
            parent.appendChild(this.createElement('ellipse', {
                cx, cy, rx: 4.6, ry: 4.2,
                fill: '#b5840c', stroke: '#5d4206', 'stroke-width': 0.8,
            }));
            parent.appendChild(this.createElement('path', {
                d: `M${cx - 4.3},${cy - 1.4} L${cx + 4.3},${cy - 1.4} M${cx - 4.3},${cy + 1.4} L${cx + 4.3},${cy + 1.4}`,
                stroke: 'rgba(40,26,4,0.55)', 'stroke-width': 0.7, fill: 'none',
            }));
            parent.appendChild(this.createElement('ellipse', {
                cx: cx - 1.4, cy: cy - 1.9, rx: 1.2, ry: 0.8,
                fill: 'rgba(255,245,210,0.5)',
            }));
        } else {
            parent.appendChild(this.createElement('ellipse', {
                cx, cy, rx: 4.6, ry: 4.2,
                fill: 'rgba(0,0,0,0.3)',
                stroke: 'rgba(201,168,76,0.4)',
                'stroke-width': 0.8, 'stroke-dasharray': '1.6 1.6',
                class: 'merchant-slot',
            }));
        }
    }

    drawMerchants() {
        const merchantGroup = this.createGroup({ id: 'merchants-layer' });

        for (const [merchId, merch] of Object.entries(MERCHANTS)) {
            if (this.state && merch.minPlayers > this.state.numPlayers) continue;

            const g = this.createGroup({
                class: 'merchant-group',
                'data-merchant': merchId,
                transform: `translate(${this.pos(merchId).x}, ${this.pos(merchId).y})`,
            });

            const w = 74;
            const h = 26 + merch.slots * 16;
            const x0 = -w / 2;

            if (this.assetURL) {
                // The merchant building is printed on the board. Draw one hit
                // area per printed trading space, plus the beer barrels, which
                // are game state the artwork cannot show.
                const S = this.citySlotSize, SH = this.citySlotH;
                const anchor = this.pos(merchId);
                const spaces = BoardAssets.slotPositions(merchId, this.layout)
                    || [[anchor.x / this.W, anchor.y / this.H]];
                const tiles = this.state
                    ? this.state.merchantTiles.filter(t => t.location === merchId) : [];
                spaces.forEach((sp, i) => {
                    const cx = sp[0] * this.W - anchor.x, cy = sp[1] * this.H - anchor.y;
                    g.appendChild(this.createElement('rect', {
                        x: cx - S / 2, y: cy - SH / 2, width: S, height: SH,
                        rx: 3, ry: 3, class: 'merchant-bg',
                        fill: 'rgba(0,0,0,0.10)',
                        stroke: 'rgba(217,177,78,0.3)', 'stroke-width': 0.9,
                    }));
                    if (tiles[i] && tiles[i].hasBeer) {
                        this.drawBarrel(g, cx - S / 2 + 6, cy - SH / 2 + 6, true);
                    }
                });
                merchantGroup.appendChild(g);
                continue;
            }

            // Warehouse: shadow, stone body, slate roof.
            g.appendChild(this.createElement('rect', {
                x: x0 + 1.5, y: -13, width: w, height: h + 2,
                rx: 4, ry: 4, fill: 'rgba(4,6,10,0.5)',
            }));
            g.appendChild(this.createElement('rect', {
                x: x0, y: -9, width: w, height: h,
                rx: 4, ry: 4, class: 'merchant-bg',
                fill: 'url(#merchantStone)',
                stroke: '#8a7647', 'stroke-width': 1.1,
            }));
            g.appendChild(this.createElement('path', {
                d: `M${x0 - 2},${-9} L${x0 + 6},${-17} L${x0 + w - 6},${-17} L${x0 + w + 2},${-9} Z`,
                fill: '#2a2620', stroke: '#8a7647', 'stroke-width': 0.9,
            }));

            g.appendChild(this.text(merch.name.toUpperCase(), {
                x: 0, y: -1, class: 'merchant-label',
                'font-size': merch.name.length > 10 ? '7' : '8',
                'dominant-baseline': 'central',
            }));
            g.appendChild(this.createElement('path', {
                d: `M${x0 + 6},${4} L${x0 + w - 6},${4}`,
                stroke: 'rgba(201,168,76,0.4)', 'stroke-width': 0.7, fill: 'none',
            }));

            // One row per trading space: barrel + the goods it buys, as an icon.
            for (let i = 0; i < merch.slots; i++) {
                const cy = 14 + i * 16;
                const matching = this.state
                    ? this.state.merchantTiles.filter(t => t.location === merchId)
                    : [];
                const mt = matching[i];

                this.drawBarrel(g, x0 + 12, cy, !!(mt && mt.hasBeer));

                if (!mt) continue;
                if (mt.buys === 'blank') {
                    g.appendChild(this.text('—', {
                        x: x0 + 34, y: cy, 'dominant-baseline': 'central',
                        'font-size': '9', fill: 'rgba(230,220,195,0.35)',
                    }));
                } else if (mt.buys === 'any') {
                    g.appendChild(this.text('ANY', {
                        x: x0 + 34, y: cy, 'dominant-baseline': 'central',
                        'font-family': 'Cinzel, serif', 'font-size': '8',
                        'letter-spacing': '1', fill: '#e2c98c',
                    }));
                } else {
                    const icon = this.getIndustryIcon(mt.buys, 15);
                    icon.setAttribute('transform', `translate(${x0 + 32}, ${cy})`);
                    icon.setAttribute('opacity', '0.85');
                    g.appendChild(icon);
                    g.appendChild(this.text(INDUSTRY_DISPLAY[mt.buys].shortName, {
                        x: x0 + 43, y: cy, 'dominant-baseline': 'central',
                        'font-size': '6.5', fill: 'rgba(235,225,200,0.75)',
                    }));
                }
            }

            // Beer bonus, on a small brass plate at the foot.
            let bonusStr = '';
            if (merch.bonusType === 'vp') bonusStr = `+${merch.bonusAmount} VP`;
            else if (merch.bonusType === 'money') bonusStr = `+£${merch.bonusAmount}`;
            else if (merch.bonusType === 'income') bonusStr = `+${merch.bonusAmount} INCOME`;
            else if (merch.bonusType === 'develop') bonusStr = 'FREE DEVELOP';
            if (bonusStr) {
                g.appendChild(this.createElement('rect', {
                    x: x0 + 7, y: h - 20, width: w - 14, height: 12,
                    rx: 2, ry: 2, fill: '#14181f',
                    stroke: 'rgba(201,168,76,0.45)', 'stroke-width': 0.7,
                }));
                g.appendChild(this.text(bonusStr, {
                    x: 0, y: h - 14, 'text-anchor': 'middle', 'dominant-baseline': 'central',
                    'font-family': 'Cinzel, serif', 'font-size': '7',
                    'letter-spacing': '0.6', fill: '#e2c98c',
                }));
            }

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
                transform: `translate(${this.pos(farmId).x}, ${this.pos(farmId).y})`,
            });

            const overlay = !!this.assetURL;
            const S = this.citySlotSize, SH = this.citySlotH;

            if (overlay) {
                // The printed board already shows the brewery space; draw only
                // an invisible hit area over it.
                g.appendChild(this.createElement('rect', {
                    x: -S / 2, y: -SH / 2, width: S, height: SH,
                    rx: 3, ry: 3, class: 'brewery-farm-bg',
                    fill: 'rgba(0,0,0,0.10)',
                    stroke: 'rgba(217,177,78,0.3)', 'stroke-width': 0.9,
                }));
            } else {
                g.appendChild(this.createElement('rect', {
                    x: -15.5, y: -12, width: 32, height: 32,
                    rx: 4, ry: 4, fill: 'rgba(4,6,10,0.5)',
                }));
                g.appendChild(this.createElement('rect', {
                    x: -17, y: -14, width: 32, height: 32,
                    rx: 4, ry: 4, class: 'brewery-farm-bg',
                    fill: 'url(#merchantStone)',
                    stroke: '#8a7647', 'stroke-width': 1.1,
                }));
                // Barn roof.
                g.appendChild(this.createElement('path', {
                    d: 'M-19,-14 L-11,-21 L9,-21 L17,-14 Z',
                    fill: '#2a2620', stroke: '#8a7647', 'stroke-width': 0.9,
                }));
            }

            const builtTile = this.state ? this.state.breweryFarmTiles[farmId] : null;
            if (builtTile) {
                if (overlay) this.drawBuiltIndustryTile(g, -S / 2, -SH / 2, builtTile);
                else this.drawBuiltIndustryTile(g, -12, -9, builtTile);
            } else if (!overlay) {
                const iconG = this.getIndustryIcon(INDUSTRY_TYPES.BREWERY, 17);
                iconG.setAttribute('transform', 'translate(-1, 2)');
                iconG.setAttribute('opacity', '0.55');
                g.appendChild(iconG);
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

            const pos1 = this.pos(conn.cities[0]);
            const pos2 = this.pos(conn.cities[1]);
            if (!pos1 || !pos2) continue;

            const playerColor = this.state.players[link.playerId].color;

            // On a real board a link is a small tile laid along the printed
            // route, not a stripe painted over it.
            const linkArt = (this.assetURL && typeof BoardAssets !== 'undefined'
                && BoardAssets.tilesReady()) ? BoardAssets.linkUrl(link.type) : null;
            if (linkArt) {
                const mids = [];
                if (conn.viaBrewery) {
                    const bp = this.pos(conn.viaBrewery);
                    if (bp) {
                        mids.push([pos1, bp]);
                        mids.push([bp, pos2]);
                    }
                } else {
                    mids.push([pos1, pos2]);
                }
                for (const [a, b] of mids) {
                    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                    const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
                    // 297x126 art; keep that ratio at roughly a city-slot's width.
                    const w = this.citySlotSize * 1.05, h = w * (126 / 297);
                    const g = this.createGroup({
                        transform: `rotate(${angle.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)})`,
                        filter: 'url(#tileShadow)',
                        class: 'connection-line built',
                    });
                    g.appendChild(this.createElement('image', {
                        x: mx - w / 2, y: my - h / 2, width: w, height: h,
                        href: linkArt, preserveAspectRatio: 'none',
                    }));
                    g.appendChild(this.createElement('rect', {
                        x: mx - w / 2 + 0.5, y: my - h / 2 + 0.5,
                        width: w - 1, height: h - 1, rx: 1.5, ry: 1.5,
                        fill: 'none', stroke: playerColor,
                        'stroke-width': 1.8, 'stroke-opacity': 0.95,
                    }));
                    linkGroup.appendChild(g);
                }
                continue;
            }

            const drawBuiltSegment = (seg) => {
                if (link.type === 'canal') {
                    // Dug canal: dark cut, lit water, owner's colour as towpath.
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg, stroke: '#1d3242', 'stroke-width': 10,
                        'stroke-linecap': 'round', 'stroke-opacity': '0.9',
                        class: 'connection-line built',
                    }));
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg, stroke: '#3f6c8a', 'stroke-width': 6.5,
                        'stroke-linecap': 'round', 'stroke-opacity': '0.95',
                        class: 'connection-line built',
                    }));
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg, stroke: '#8fc0da', 'stroke-width': 1.8,
                        'stroke-linecap': 'round', 'stroke-opacity': '0.45',
                        class: 'connection-line built',
                    }));
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg, stroke: playerColor, 'stroke-width': 2.4,
                        'stroke-linecap': 'round', 'stroke-opacity': '0.95',
                        'stroke-dasharray': '7 4',
                        class: 'connection-line built',
                    }));
                } else {
                    // Laid rail: ballast, owner's colour, sleeper ties, rail head.
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg, stroke: '#241f1a', 'stroke-width': 9,
                        'stroke-linecap': 'round', 'stroke-opacity': '0.92',
                        class: 'connection-line built',
                    }));
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg, stroke: playerColor, 'stroke-width': 5.2,
                        'stroke-linecap': 'round', 'stroke-opacity': '0.95',
                        class: 'connection-line built',
                    }));
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg, stroke: 'rgba(18,14,8,0.6)', 'stroke-width': 5.2,
                        'stroke-linecap': 'butt', 'stroke-dasharray': '1.6 4.5',
                        class: 'connection-line built',
                    }));
                    linkGroup.appendChild(this.createElement('line', {
                        ...seg, stroke: 'rgba(222,212,188,0.55)', 'stroke-width': 0.9,
                        'stroke-linecap': 'round',
                        class: 'connection-line built',
                    }));
                }
            };

            if (conn.viaBrewery) {
                const brewPos = this.pos(conn.viaBrewery);
                if (brewPos) {
                    drawBuiltSegment({ x1: pos1.x, y1: pos1.y, x2: brewPos.x, y2: brewPos.y });
                    drawBuiltSegment({ x1: brewPos.x, y1: brewPos.y, x2: pos2.x, y2: pos2.y });
                }
            } else {
                drawBuiltSegment({ x1: pos1.x, y1: pos1.y, x2: pos2.x, y2: pos2.y });
            }

            // Owner badge at the midpoint.
            const midX = (pos1.x + pos2.x) / 2;
            const midY = (pos1.y + pos2.y) / 2;

            linkGroup.appendChild(this.createElement('circle', {
                cx: midX, cy: midY + 1, r: 6, fill: 'rgba(4,6,10,0.5)',
            }));
            linkGroup.appendChild(this.createElement('circle', {
                cx: midX, cy: midY, r: 6, fill: playerColor,
                stroke: '#14110c', 'stroke-width': 1,
            }));
            linkGroup.appendChild(this.text(link.type === 'canal' ? '≈' : '≡', {
                x: midX, y: midY + 0.4, 'text-anchor': 'middle',
                'dominant-baseline': 'central', 'font-size': '7.5',
                'font-weight': '700', fill: '#fff', 'pointer-events': 'none',
            }));
        }

        this.svg.appendChild(linkGroup);
    }

    // ========================================================================
    // Calibration mode (?calibrate=1)
    // ========================================================================
    // Drag any town, merchant or brewery onto its printed space. Positions are
    // stored normalised, so they hold for any board image at any resolution.
    //   drag  reposition      c  dump JSON to the console
    //   r     reset to defaults

    enableCalibration() {
        if (this._calibBound) { this.drawCalibrationHud(); return; }
        this._calibBound = true;

        const toBoard = (evt) => {
            const pt = this.svg.createSVGPoint();
            pt.x = evt.clientX;
            pt.y = evt.clientY;
            return pt.matrixTransform(this.svg.getScreenCTM().inverse());
        };

        let dragging = null;

        this.svg.addEventListener('pointerdown', (e) => {
            const node = e.target.closest('.city-group, .merchant-group, .brewery-farm');
            if (!node) return;
            const id = node.dataset.city || node.dataset.merchant || node.dataset.farm;
            if (!id) return;
            e.preventDefault();
            e.stopPropagation();
            dragging = { node, id };
            node.style.opacity = '0.75';
            this.svg.setPointerCapture(e.pointerId);
        }, true);

        this.svg.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const p = toBoard(e);
            dragging.node.setAttribute('transform', `translate(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`);
        }, true);

        const finish = (e) => {
            if (!dragging) return;
            const p = toBoard(e);
            this.layout = this.layout || {};
            this.layout[dragging.id] = [
                +(p.x / this.W).toFixed(4),
                +(p.y / this.H).toFixed(4),
            ];
            BoardAssets.saveLayout(this.layout);
            dragging.node.style.opacity = '';
            dragging = null;
            // Redraw so links and washes follow the moved location.
            this.fullUpdate(this.state);
            this.drawCalibrationHud();
        };
        this.svg.addEventListener('pointerup', finish, true);
        this.svg.addEventListener('pointercancel', finish, true);

        window.addEventListener('keydown', (e) => {
            if (e.key === 'c') {
                const out = this.layout || BoardAssets.OFFICIAL_LAYOUT;
                console.log('[board] calibrated layout:\n' + JSON.stringify(out, null, 4));
            } else if (e.key === 'r') {
                BoardAssets.clearLayout();
                this.layout = BoardAssets.layoutFor(!!this.assetURL);
                this.render(this.state);
            }
        });

        this.drawCalibrationHud();
    }

    drawCalibrationHud() {
        this.svg.querySelector('#calibrate-hud')?.remove();
        const g = this.createGroup({ id: 'calibrate-hud', 'pointer-events': 'none' });
        const moved = this.layout ? Object.keys(this.layout).length : 0;
        g.appendChild(this.createElement('rect', {
            x: 6, y: 6, width: 300, height: 40, rx: 4, ry: 4,
            fill: 'rgba(10,12,16,0.85)', stroke: '#c9a84c', 'stroke-width': 1,
        }));
        g.appendChild(this.text('CALIBRATION \u2014 drag locations into place', {
            x: 16, y: 22, 'font-family': 'Cinzel, serif', 'font-size': '11', fill: '#e8d3a0',
        }));
        g.appendChild(this.text(`saved automatically \u00B7 ${moved} placed \u00B7 c = dump JSON \u00B7 r = reset`, {
            x: 16, y: 37, 'font-size': '9.5', fill: 'rgba(235,225,200,0.75)',
        }));
        this.svg.appendChild(g);
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
        // The frame carries the era legend, so it is refreshed alongside them.
        this.svg.querySelector('#frame-layer')?.remove();
        this.svg.querySelector('#connections-layer')?.remove();
        this.svg.querySelector('#brewery-farms-layer')?.remove();
        this.svg.querySelector('#merchants-layer')?.remove();
        this.svg.querySelector('#cities-layer')?.remove();
        this.svg.querySelector('#built-links-layer')?.remove();

        // The frame carries the era legend, so it is refreshed with the rest —
        // but only when we are drawing the board ourselves; an image prints its own.
        if (!this.assetURL) this.drawFrame();
        this.drawConnections();
        this.drawBreweryFarms();
        this.drawMerchants();
        this.drawCities();
        this.drawBuiltLinks();
    }
}

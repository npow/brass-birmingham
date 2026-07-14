// ============================================================================
// Brass: Birmingham - Shared Industry Icon Shapes
// ============================================================================
// Single source of truth for industry-type SVG shapes, consumed by both the
// board renderer (DOM <g> nodes, small silhouettes tinted by player color)
// and the hand/card UI (markup strings, full-color detail icons).
// ============================================================================

const IndustryIcons = (() => {
    const SVG_NS = 'http://www.w3.org/2000/svg';

    // Full-color palette used for the 'full' (card) variant.
    const PALETTE = {
        [INDUSTRY_TYPES.COTTON_MILL]:  { fill: '#e8d9c0', stroke: '#8a7a68' },
        [INDUSTRY_TYPES.COAL_MINE]:    { fill: '#5a5a5a', stroke: '#888' },
        [INDUSTRY_TYPES.IRON_WORKS]:   { fill: '#d4760a', stroke: '#a05808', center: '#2d2519' },
        [INDUSTRY_TYPES.MANUFACTURER]: { fill: '#b8925a', stroke: '#6a5010' },
        [INDUSTRY_TYPES.POTTERY]:      { fill: '#c0453a', stroke: '#8a2a20' },
        [INDUSTRY_TYPES.BREWERY]:      { fill: '#d4a017', stroke: '#a08010' },
    };

    // Returns a flat array of { tag, attrs } SVG primitive descriptors for the
    // given industry type, centered on (0,0), sized to fit within `size`.
    // variant: 'silhouette' (muted, single-tone — for board tiles/empty slots)
    //          'full' (colored, detailed — for hand cards)
    function getPrimitives(type, size, variant = 'silhouette') {
        const half = size / 2;
        const s = size;
        const silhouette = variant !== 'full';
        const c = PALETTE[type] || { fill: '#888', stroke: '#555' };

        const mainFill = silhouette ? 'rgba(255,255,255,0.7)' : c.fill;
        const mainStroke = silhouette ? 'none' : c.stroke;
        const strokeWidth = silhouette ? 0 : 1;
        const detailStroke = silhouette ? 'rgba(0,0,0,0.3)' : c.stroke;

        switch (type) {
            case INDUSTRY_TYPES.COTTON_MILL:
                return [{
                    tag: 'path',
                    attrs: {
                        d: `M${-half + 1},${half - 1} L${-half + 1},${-half + 3} L${-half + 3},${-half + 3} L${-half + 3},${-half + 1} L${-half + 5},${-half + 1} L${-half + 5},${-half + 5} L${-half + 7},${-half + 5} L${-half + 7},${-half + 1} L${half - 1},${-half + 1} L${half - 1},${half - 1} Z`,
                        fill: mainFill, stroke: mainStroke, 'stroke-width': strokeWidth,
                    },
                }];

            case INDUSTRY_TYPES.COAL_MINE:
                return [{
                    tag: 'polygon',
                    attrs: {
                        points: `0,${-half + 1} ${half - 2},0 0,${half - 1} ${-half + 2},0`,
                        fill: mainFill, stroke: mainStroke, 'stroke-width': strokeWidth,
                    },
                }];

            case INDUSTRY_TYPES.IRON_WORKS: {
                const r = half - 2;
                const teeth = 6;
                let points = '';
                for (let i = 0; i < teeth * 2; i++) {
                    const angle = (i * Math.PI) / teeth - Math.PI / 2;
                    const rad = i % 2 === 0 ? r : r * 0.65;
                    points += `${Math.cos(angle) * rad},${Math.sin(angle) * rad} `;
                }
                return [
                    { tag: 'polygon', attrs: { points: points.trim(), fill: mainFill, stroke: mainStroke, 'stroke-width': strokeWidth } },
                    { tag: 'circle', attrs: { cx: 0, cy: 0, r: r * 0.25, fill: silhouette ? 'rgba(0,0,0,0.5)' : c.center } },
                ];
            }

            case INDUSTRY_TYPES.MANUFACTURER: {
                const bw = s * 0.6;
                const bh = s * 0.5;
                return [
                    { tag: 'rect', attrs: { x: -bw / 2, y: -bh / 2, width: bw, height: bh, rx: 1, ry: 1, fill: mainFill, stroke: mainStroke, 'stroke-width': strokeWidth } },
                    { tag: 'line', attrs: { x1: -bw / 2, y1: 0, x2: bw / 2, y2: 0, stroke: detailStroke, 'stroke-width': 0.8 } },
                    { tag: 'line', attrs: { x1: 0, y1: -bh / 2, x2: 0, y2: bh / 2, stroke: detailStroke, 'stroke-width': 0.8 } },
                ];
            }

            case INDUSTRY_TYPES.POTTERY:
                return [{
                    tag: 'path',
                    attrs: {
                        d: `M${-2},${-half + 1} L${2},${-half + 1} L${3},${-half + 3} L${half - 2},${1} L${half - 3},${half - 1} L${-half + 3},${half - 1} L${-half + 2},${1} L${-3},${-half + 3} Z`,
                        fill: mainFill, stroke: mainStroke, 'stroke-width': strokeWidth,
                    },
                }];

            case INDUSTRY_TYPES.BREWERY: {
                const bw = s * 0.55;
                const bh = s * 0.6;
                return [
                    { tag: 'ellipse', attrs: { cx: 0, cy: 0, rx: bw / 2, ry: bh / 2, fill: mainFill, stroke: mainStroke, 'stroke-width': strokeWidth } },
                    { tag: 'line', attrs: { x1: -bw / 2 + 1, y1: -bh / 6, x2: bw / 2 - 1, y2: -bh / 6, stroke: detailStroke, 'stroke-width': 0.8 } },
                    { tag: 'line', attrs: { x1: -bw / 2 + 1, y1: bh / 6, x2: bw / 2 - 1, y2: bh / 6, stroke: detailStroke, 'stroke-width': 0.8 } },
                ];
            }

            default:
                return [{ tag: 'circle', attrs: { cx: 0, cy: 0, r: half - 2, fill: silhouette ? 'rgba(255,255,255,0.3)' : '#888' } }];
        }
    }

    // DOM-node renderer for boardRenderer.js — returns a <g> element.
    function renderElement(type, size = 14, variant = 'silhouette') {
        const g = document.createElementNS(SVG_NS, 'g');
        for (const prim of getPrimitives(type, size, variant)) {
            const el = document.createElementNS(SVG_NS, prim.tag);
            for (const [key, val] of Object.entries(prim.attrs)) {
                el.setAttribute(key, val);
            }
            g.appendChild(el);
        }
        return g;
    }

    // Markup-string renderer for uiManager.js hand cards — returns a standalone <svg>.
    function renderMarkup(type, size = 30, variant = 'full') {
        const half = size / 2;
        const attrsToStr = (attrs) => Object.entries(attrs).map(([k, v]) => `${k}="${v}"`).join(' ');
        const inner = getPrimitives(type, size, variant).map(p => `<${p.tag} ${attrsToStr(p.attrs)}/>`).join('');
        return `<svg viewBox="${-half} ${-half} ${size} ${size}" class="card-svg-icon">${inner}</svg>`;
    }

    return { getPrimitives, renderElement, renderMarkup };
})();

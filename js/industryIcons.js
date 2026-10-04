// ============================================================================
// Brass: Birmingham - Shared Industry Icon Shapes
// ============================================================================
// Single source of truth for industry-type SVG shapes, consumed by both the
// board renderer (DOM <g> nodes, small silhouettes tinted by player color)
// and the hand/card UI (markup strings, full-color detail icons).
//
// Each industry is drawn as a period building rather than an abstract glyph:
// a spinning mill, a pithead winding gear, a blast furnace, a sawtooth-roofed
// workshop, a bottle kiln, a cask. Shapes are authored in a normalised
// -0.5..0.5 box and multiplied by `size`, so they stay true at 9px on a board
// tile and at 30px on a hand card.
// ============================================================================

const IndustryIcons = (() => {
    const SVG_NS = 'http://www.w3.org/2000/svg';

    // Full-color palette used for the 'full' (card) variant. Hand cards are
    // cream stock, so every fill here has to stay legible against parchment.
    const PALETTE = {
        [INDUSTRY_TYPES.COTTON_MILL]:  { body: '#7a94a8', dark: '#3b5566', trim: '#d6e2ea', glow: null },
        [INDUSTRY_TYPES.COAL_MINE]:    { body: '#6a6a6a', dark: '#2b2b2b', trim: '#c2c2c2', glow: null },
        [INDUSTRY_TYPES.IRON_WORKS]:   { body: '#b06f38', dark: '#5c3715', trim: '#eab077', glow: '#ff9427' },
        [INDUSTRY_TYPES.MANUFACTURER]: { body: '#a5804a', dark: '#574010', trim: '#e3c88f', glow: null },
        [INDUSTRY_TYPES.POTTERY]:      { body: '#bd5742', dark: '#7a2d20', trim: '#edab91', glow: '#ffb347' },
        [INDUSTRY_TYPES.BREWERY]:      { body: '#b5840c', dark: '#684a06', trim: '#ebce75', glow: null },
    };

    // Three tones per variant: the lit face, the shadowed detail, and the
    // highlight used for window bars / hoops / smoke.
    function getTones(type, variant) {
        if (variant === 'full') {
            const c = PALETTE[type] || { body: '#888', dark: '#555', trim: '#ccc', glow: null };
            return { ...c, outline: c.dark, outlineWidth: 1 };
        }
        if (variant === 'silhouette-dark') {
            return {
                body: 'rgba(45,32,18,0.82)',
                dark: 'rgba(252,246,232,0.42)',
                trim: 'rgba(45,32,18,1)',
                glow: 'rgba(186,104,26,0.95)',
                outline: 'none',
                outlineWidth: 0,
            };
        }
        return {
            body: 'rgba(255,250,240,0.82)',
            dark: 'rgba(16,12,6,0.45)',
            trim: 'rgba(255,255,255,0.96)',
            glow: 'rgba(255,186,88,0.95)',
            outline: 'none',
            outlineWidth: 0,
        };
    }

    // Returns a flat array of { tag, attrs } SVG primitive descriptors for the
    // given industry type, centered on (0,0), sized to fit within `size`.
    // variant: 'silhouette' (light single-tone — for dark board slots/tiles)
    //          'silhouette-dark' (ink single-tone — for tan/parchment backings)
    //          'full' (colored, detailed — for hand cards)
    function getPrimitives(type, size, variant = 'silhouette') {
        const t = getTones(type, variant);
        const u = (n) => +(n * size).toFixed(2);
        const sw = Math.max(0.4, size * 0.045);
        const hair = Math.max(0.3, size * 0.03);
        // Below ~15px the fine detail turns to mush, so small icons render as
        // clean silhouettes and only the card-sized ones get windows/hoops.
        const detail = size >= 15;

        const body = (d, extra = {}) => ({
            tag: 'path',
            attrs: {
                d,
                fill: t.body,
                stroke: t.outline,
                'stroke-width': t.outlineWidth,
                'stroke-linejoin': 'round',
                ...extra,
            },
        });
        const ink = (d, w = hair) => ({
            tag: 'path',
            attrs: { d, fill: 'none', stroke: t.dark, 'stroke-width': w, 'stroke-linecap': 'round' },
        });
        const inkFill = (d) => ({ tag: 'path', attrs: { d, fill: t.dark } });

        switch (type) {
            // Spinning mill: tall windowed block, low pitched roof, stack with smoke.
            case INDUSTRY_TYPES.COTTON_MILL: {
                const out = [];
                // chimney + cap
                out.push(body(`M${u(-0.46)},${u(0.44)} L${u(-0.44)},${u(-0.40)} L${u(-0.30)},${u(-0.40)} L${u(-0.28)},${u(0.44)} Z`));
                out.push(body(`M${u(-0.48)},${u(-0.40)} L${u(-0.26)},${u(-0.40)} L${u(-0.26)},${u(-0.47)} L${u(-0.48)},${u(-0.47)} Z`));
                // mill block + roof
                out.push(body(`M${u(-0.20)},${u(0.44)} L${u(-0.20)},${u(-0.16)} L${u(0.13)},${u(-0.34)} L${u(0.46)},${u(-0.16)} L${u(0.46)},${u(0.44)} Z`));
                if (detail) {
                    // two storeys of windows
                    for (const wy of [-0.02, 0.18]) {
                        for (const wx of [-0.11, 0.06, 0.23]) {
                            out.push({
                                tag: 'rect',
                                attrs: {
                                    x: u(wx), y: u(wy), width: u(0.10), height: u(0.13),
                                    fill: t.dark, rx: u(0.012), ry: u(0.012),
                                },
                            });
                        }
                    }
                    // roof line + smoke
                    out.push(ink(`M${u(-0.20)},${u(-0.16)} L${u(0.46)},${u(-0.16)}`));
                    out.push({
                        tag: 'path',
                        attrs: {
                            d: `M${u(-0.37)},${u(-0.50)} q${u(-0.10)},${u(-0.10)} ${u(0.02)},${u(-0.15)} q${u(0.12)},${u(-0.05)} ${u(0.06)},${u(-0.14)}`,
                            fill: 'none', stroke: t.trim, 'stroke-width': hair, 'stroke-opacity': 0.5,
                            'stroke-linecap': 'round',
                        },
                    });
                }
                return out;
            }

            // Pithead: winding wheel on an A-frame headstock beside an engine house.
            case INDUSTRY_TYPES.COAL_MINE: {
                const out = [];
                // engine house
                out.push(body(`M${u(-0.48)},${u(0.44)} L${u(-0.48)},${u(0.04)} L${u(-0.14)},${u(0.04)} L${u(-0.14)},${u(0.44)} Z`));
                out.push(body(`M${u(-0.50)},${u(0.04)} L${u(-0.31)},${u(-0.08)} L${u(-0.12)},${u(0.04)} Z`));
                // headstock legs
                out.push({
                    tag: 'path',
                    attrs: {
                        d: `M${u(0.18)},${u(-0.12)} L${u(-0.04)},${u(0.44)} M${u(0.18)},${u(-0.12)} L${u(0.42)},${u(0.44)}`,
                        fill: 'none', stroke: t.body, 'stroke-width': sw * 1.1, 'stroke-linecap': 'round',
                    },
                });
                // winding wheel
                out.push({
                    tag: 'circle',
                    attrs: {
                        cx: u(0.19), cy: u(-0.26), r: u(0.17),
                        fill: 'none', stroke: t.body, 'stroke-width': sw * 1.2,
                    },
                });
                if (detail) {
                    out.push(ink(`M${u(0.06)},${u(0.20)} L${u(0.33)},${u(0.20)}`, sw * 0.7));
                    out.push(ink(`M${u(0.08)},${u(-0.35)} L${u(0.30)},${u(-0.17)} M${u(0.30)},${u(-0.35)} L${u(0.08)},${u(-0.17)}`));
                    out.push({
                        tag: 'rect',
                        attrs: { x: u(-0.40), y: u(0.16), width: u(0.12), height: u(0.16), fill: t.dark },
                    });
                }
                return out;
            }

            // Blast furnace: battered stack, charging platform, glowing tap arch.
            case INDUSTRY_TYPES.IRON_WORKS: {
                const out = [];
                out.push(body(`M${u(-0.26)},${u(0.44)} L${u(-0.15)},${u(-0.28)} L${u(0.15)},${u(-0.28)} L${u(0.26)},${u(0.44)} Z`));
                out.push(body(`M${u(-0.21)},${u(-0.28)} L${u(-0.21)},${u(-0.40)} L${u(0.21)},${u(-0.40)} L${u(0.21)},${u(-0.28)} Z`));
                // side flue / downcomer
                out.push({
                    tag: 'path',
                    attrs: {
                        d: `M${u(0.21)},${u(-0.34)} q${u(0.22)},${u(0.02)} ${u(0.22)},${u(0.26)} L${u(0.43)},${u(0.44)}`,
                        fill: 'none', stroke: t.body, 'stroke-width': sw * 1.3, 'stroke-linecap': 'round',
                    },
                });
                // tap arch, lit
                out.push({
                    tag: 'path',
                    attrs: {
                        d: `M${u(-0.11)},${u(0.44)} L${u(-0.11)},${u(0.22)} q${u(0.11)},${u(-0.13)} ${u(0.22)},${u(0)} L${u(0.11)},${u(0.44)} Z`,
                        fill: t.glow || t.dark,
                    },
                });
                if (detail) {
                    out.push(ink(`M${u(-0.19)},${u(-0.06)} L${u(0.19)},${u(-0.06)}`));
                    out.push(ink(`M${u(-0.23)},${u(0.20)} L${u(0.23)},${u(0.20)}`));
                }
                return out;
            }

            // Workshop under a north-light sawtooth roof.
            case INDUSTRY_TYPES.MANUFACTURER: {
                const out = [];
                const teeth = [-0.46, -0.15, 0.16];
                let roof = '';
                for (const x of teeth) {
                    roof += `M${u(x)},${u(-0.08)} L${u(x)},${u(-0.30)} L${u(x + 0.30)},${u(-0.08)} Z `;
                }
                out.push(body(`M${u(-0.46)},${u(0.44)} L${u(-0.46)},${u(-0.08)} L${u(0.46)},${u(-0.08)} L${u(0.46)},${u(0.44)} Z`));
                out.push(body(roof.trim()));
                if (detail) {
                    // glazing on the north face of each tooth
                    let glaze = '';
                    for (const x of teeth) glaze += `M${u(x + 0.03)},${u(-0.11)} L${u(x + 0.03)},${u(-0.26)} `;
                    out.push(ink(glaze.trim(), sw * 0.8));
                    out.push(inkFill(`M${u(-0.09)},${u(0.44)} L${u(-0.09)},${u(0.14)} L${u(0.09)},${u(0.14)} L${u(0.09)},${u(0.44)} Z`));
                    out.push(ink(`M${u(-0.46)},${u(0.06)} L${u(-0.16)},${u(0.06)} M${u(0.16)},${u(0.06)} L${u(0.46)},${u(0.06)}`));
                }
                return out;
            }

            // Bottle oven: the Potteries' signature hovel kiln.
            case INDUSTRY_TYPES.POTTERY: {
                const out = [];
                out.push(body(
                    `M${u(-0.33)},${u(0.45)} C${u(-0.40)},${u(0.12)} ${u(-0.29)},${u(-0.12)} ${u(-0.12)},${u(-0.26)} ` +
                    `L${u(-0.10)},${u(-0.40)} L${u(0.10)},${u(-0.40)} L${u(0.12)},${u(-0.26)} ` +
                    `C${u(0.29)},${u(-0.12)} ${u(0.40)},${u(0.12)} ${u(0.33)},${u(0.45)} Z`
                ));
                // stoke-hole mouth, lit
                out.push({
                    tag: 'path',
                    attrs: {
                        d: `M${u(-0.10)},${u(0.45)} L${u(-0.10)},${u(0.28)} q${u(0.10)},${u(-0.11)} ${u(0.20)},${u(0)} L${u(0.10)},${u(0.45)} Z`,
                        fill: t.glow || t.dark,
                    },
                });
                if (detail) {
                    // iron banding hoops
                    out.push(ink(`M${u(-0.32)},${u(0.24)} L${u(0.32)},${u(0.24)}`));
                    out.push(ink(`M${u(-0.28)},${u(0.06)} L${u(0.28)},${u(0.06)}`));
                    out.push(ink(`M${u(-0.19)},${u(-0.12)} L${u(0.19)},${u(-0.12)}`));
                    out.push(ink(`M${u(-0.11)},${u(-0.28)} L${u(0.11)},${u(-0.28)}`));
                }
                return out;
            }

            // Cask on its side, hooped.
            case INDUSTRY_TYPES.BREWERY: {
                const out = [];
                out.push(body(
                    `M${u(-0.26)},${u(-0.36)} C${u(-0.44)},${u(-0.12)} ${u(-0.44)},${u(0.12)} ${u(-0.26)},${u(0.36)} ` +
                    `L${u(0.26)},${u(0.36)} C${u(0.44)},${u(0.12)} ${u(0.44)},${u(-0.12)} ${u(0.26)},${u(-0.36)} Z`
                ));
                if (detail) {
                    out.push(ink(`M${u(-0.38)},${u(-0.17)} L${u(0.38)},${u(-0.17)}`, sw * 0.8));
                    out.push(ink(`M${u(-0.38)},${u(0.17)} L${u(0.38)},${u(0.17)}`, sw * 0.8));
                    out.push(ink(`M${u(-0.07)},${u(-0.34)} L${u(-0.07)},${u(0.34)}`, hair * 0.8));
                    out.push(ink(`M${u(0.07)},${u(-0.34)} L${u(0.07)},${u(0.34)}`, hair * 0.8));
                    // bung
                    out.push({ tag: 'circle', attrs: { cx: 0, cy: 0, r: u(0.06), fill: t.dark } });
                }
                return out;
            }

            default:
                return [{ tag: 'circle', attrs: { cx: 0, cy: 0, r: u(0.38), fill: t.body } }];
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

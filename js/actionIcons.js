// ============================================================================
// Brass: Birmingham - Action Icons
// ============================================================================
// Engraved period icons for the seven actions, in the same two-tone language
// as the industry illustrations: a solid lit form plus darker incised detail.
// Authored on a 24x24 grid and drawn in currentColor, so they take the tone of
// whatever button they sit in (including the dimmed disabled state).
// ============================================================================

const ActionIcons = (() => {

    // `fill` carries the lit form, `ink` the incised lines.
    const wrap = (inner) =>
        `<svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${inner}</svg>`;

    const F = 'fill="currentColor"';
    const S = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

    const ICONS = {
        // Build — a mill going up behind its scaffold.
        build: `
            <path ${F} d="M6 21V9.6l5.2-2.9L16.4 9.6V21Z" opacity="0.9"/>
            <path ${F} d="M4.2 7.2h2.1V21H4.2Z" opacity="0.55"/>
            <path ${S} stroke-width="1.1" d="M3 10.2h4.6M3 14.4h4.6M3 18.6h4.6"/>
            <path ${S} stroke-width="1.1" opacity="0.75" d="M8.6 12h2.1M12.6 12h2.1M8.6 16h2.1M12.6 16h2.1"/>
            <path ${F} d="M18.1 4.3h1.9V21h-1.9Z" opacity="0.75"/>
            <path ${F} d="M17.5 3.1h3.1v1.5h-3.1Z"/>`,

        // Network — a canal bridge carrying a track over the water.
        network: `
            <path ${S} stroke-width="1.6" d="M2 9.4h20"/>
            <path ${S} stroke-width="1.1" d="M5 9.4v3M9.4 9.4v3M14.6 9.4v3M19 9.4v3"/>
            <path ${S} stroke-width="1.5" d="M2 15.2q3.2-2.6 5.6 0t5.6 0q3.2-2.6 5.6 0t3.2 0" opacity="0.8"/>
            <path ${S} stroke-width="1.5" d="M2 19.2q3.2-2.6 5.6 0t5.6 0q3.2-2.6 5.6 0t3.2 0" opacity="0.55"/>
            <path ${F} d="M3.4 4.4h17.2v1.5H3.4Z" opacity="0.85"/>
            <path ${S} stroke-width="1.1" d="M6.2 5.9v3.5M12 5.9v3.5M17.8 5.9v3.5" opacity="0.7"/>`,

        // Develop — an anvil, where lower tiles are burned off with iron.
        develop: `
            <path ${F} d="M3.4 9.1h13.1q3.1 0 3.1 2.5-2.4 0-3.4 1.6-1.4 2.2-4.5 2.2H8.8q-3.3 0-4.3-2.1Z"/>
            <path ${F} d="M9.6 15.4h4.3l-.7 2.6h2.6V20H7.7v-2h2.6Z" opacity="0.85"/>
            <path ${S} stroke-width="1.3" opacity="0.8" d="M15.4 6.6 17.9 4M18.6 7.3 21.4 6"/>`,

        // Sell — a crate heading out under a merchant's arrow.
        sell: `
            <path ${F} d="M4.6 10.4h11.2v9.2H4.6Z" opacity="0.9"/>
            <path ${S} stroke-width="1.1" d="M4.6 13.1h11.2M4.6 16.8h11.2M10.2 10.4v9.2" opacity="0.75"/>
            <path ${F} d="M4.1 9h12.2v1.6H4.1Z"/>
            <path ${S} stroke-width="1.7" d="M15.4 5.6h4.2"/>
            <path ${F} d="M18.6 3.1 22.4 5.6 18.6 8.1Z"/>`,

        // Loan — coin stack with the shilling mark.
        loan: `
            <ellipse ${F} cx="12" cy="6.4" rx="7.4" ry="2.8"/>
            <path ${F} d="M4.6 6.4v3.4q0 2.8 7.4 2.8t7.4-2.8V6.4q0 2.8-7.4 2.8T4.6 6.4Z" opacity="0.85"/>
            <path ${F} d="M4.6 11.6V15q0 2.8 7.4 2.8T19.4 15v-3.4q0 2.8-7.4 2.8t-7.4-2.8Z" opacity="0.7"/>
            <path ${S} stroke-width="1.3" d="M10.7 4.4q2.6-.8 2.6.5t-2.6 1.3 2.6 1.1" opacity="0.85"/>`,

        // Scout — a spyglass, for going looking through the deck.
        scout: `
            <path ${F} d="M2.6 13.9 8 11.6l1.8 4.2-5.4 2.3q-1.1.5-1.6-.7l-.9-2.1q-.5-1.2.7-1.4Z"/>
            <path ${F} d="M8.6 11.3 15 8.5l2.4 5.6-6.4 2.8Z" opacity="0.85"/>
            <path ${F} d="M15.6 8.2l4.4-1.9q1.2-.5 1.7.7l1.1 2.6q.5 1.2-.7 1.7l-4.4 1.9Z" opacity="0.7"/>
            <path ${S} stroke-width="1.1" d="M8.3 10.9 10.1 15.1" opacity="0.8"/>`,

        // Pass — an hourglass running out.
        pass: `
            <path ${F} d="M5.4 3h13.2v1.8H5.4ZM5.4 19.2h13.2V21H5.4Z"/>
            <path ${S} stroke-width="1.5" d="M7.2 4.8v2.4q0 3 4.8 4.8-4.8 1.8-4.8 4.8v2.4M16.8 4.8v2.4q0 3-4.8 4.8 4.8 1.8 4.8 4.8v2.4"/>
            <path ${F} d="M9.6 16.2q2.4-1.5 4.8 0 .9.6 0 1.4H9.6q-.9-.8 0-1.4Z" opacity="0.9"/>
            <path ${F} d="M11 9.4h2v2.2h-2Z" opacity="0.7"/>`,
    };

    function markup(action) {
        const body = ICONS[action];
        return body ? wrap(body) : '';
    }

    // Fills every .action-pip placeholder from its button's data-action.
    function mount(root = document) {
        root.querySelectorAll('.action-btn[data-action]').forEach((btn) => {
            const pip = btn.querySelector('.action-pip');
            if (!pip || pip.dataset.filled) return;
            const svg = markup(btn.dataset.action);
            if (!svg) return;
            pip.innerHTML = svg;
            pip.dataset.filled = '1';
        });
    }

    return { markup, mount };
})();

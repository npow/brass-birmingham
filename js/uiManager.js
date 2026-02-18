// ============================================================================
// Brass: Birmingham - UI Manager
// ============================================================================

class UIManager {
    constructor() {
        this.state = null;
        this.logic = null;
        this.renderer = null;
        this.selectedAction = null;
        this.selectedCard = null;
        this.actionStep = 0; // Multi-step action tracking
        this.pendingData = {}; // Data accumulated during multi-step actions
    }

    init(gameState, gameLogic, boardRenderer) {
        this.state = gameState;
        this.logic = gameLogic;
        this.renderer = boardRenderer;

        this.bindEvents();
        this.refresh();
    }

    // ========================================================================
    // Event Binding
    // ========================================================================

    bindEvents() {
        // Action buttons
        document.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const action = btn.dataset.action;
                this.onActionSelected(action);
            });
        });

        // Modal close
        document.getElementById('modal-close').addEventListener('click', () => this.closeModal());

        // Board click events (delegated)
        document.getElementById('game-board').addEventListener('click', (e) => {
            this.onBoardClick(e);
        });
    }

    // ========================================================================
    // Refresh UI
    // ========================================================================

    refresh() {
        this.updateTopBar();
        this.updatePlayerPanels();
        this.updateHand();
        this.updateActionButtons();
        this.updatePlayerMat();
        this.updateMarkets();
        this.renderer.fullUpdate(this.state);
    }

    updateTopBar() {
        const player = this.state.currentPlayer;
        document.getElementById('era-label').textContent =
            this.state.era === ERA.CANAL ? 'Canal Era' : 'Rail Era';
        document.getElementById('round-label').textContent =
            `Round ${this.state.round} | Deck: ${this.state.drawDeck.length}`;

        const playerLabel = document.getElementById('current-player-label');
        playerLabel.textContent = `${player.name}'s Turn`;
        playerLabel.style.backgroundColor = player.color;
        playerLabel.style.color = player.colorName === 'White' ? '#1a1510' : 'white';

        const actionsLeft = this.state.actionsPerTurn - this.state.actionsThisTurn;
        document.getElementById('actions-remaining-label').textContent =
            `${actionsLeft} action${actionsLeft !== 1 ? 's' : ''} left`;

        // Market prices
        const coalPrice = this.state.getCoalPrice();
        const ironPrice = this.state.getIronPrice();
        document.getElementById('coal-price').textContent =
            coalPrice === Infinity ? 'Empty' : `£${coalPrice}`;
        document.getElementById('iron-price').textContent =
            ironPrice === Infinity ? 'Empty' : `£${ironPrice}`;
    }

    updatePlayerPanels() {
        const container = document.getElementById('player-panels');
        container.innerHTML = '';

        for (const player of this.state.players) {
            const panel = document.createElement('div');
            panel.className = `player-panel${player.id === this.state.currentPlayerId ? ' active' : ''}`;

            panel.innerHTML = `
                <div class="player-panel-header">
                    <span class="player-panel-name" style="color: ${player.color}">${player.name}</span>
                    <span class="player-panel-vp">${player.vp} VP</span>
                </div>
                <div class="player-panel-stats">
                    <span class="player-panel-stat" title="Money">£${player.money}</span>
                    <span class="player-panel-stat" title="Income">Inc: ${player.income}</span>
                    <span class="player-panel-stat" title="Cards">${player.hand.length} cards</span>
                    <span class="player-panel-stat" title="Links">
                        ${this.state.era === ERA.CANAL ? player.linksRemaining.canal : player.linksRemaining.rail} links
                    </span>
                </div>
            `;
            container.appendChild(panel);
        }
    }

    updateHand() {
        const container = document.getElementById('player-hand');
        container.innerHTML = '';

        const player = this.state.currentPlayer;

        player.hand.forEach((card, idx) => {
            const cardEl = document.createElement('div');
            cardEl.className = 'card';
            cardEl.dataset.index = idx;

            if (card.type === CARD_TYPES.LOCATION) {
                cardEl.classList.add('location-card');
                const city = CITIES[card.location];
                const regionColor = city ? REGION_COLORS[city.region]?.fill : '#4a4a4a';
                cardEl.style.borderTopColor = regionColor;

                cardEl.innerHTML = `
                    <div class="card-type">Location</div>
                    <div class="card-icon">📍</div>
                    <div class="card-name">${card.name}</div>
                `;
            } else if (card.type === CARD_TYPES.INDUSTRY) {
                cardEl.classList.add('industry-card');
                const display = INDUSTRY_DISPLAY[card.industryType];
                cardEl.innerHTML = `
                    <div class="card-type">Industry</div>
                    <div class="card-icon">${display.icon}</div>
                    <div class="card-name">${display.name}</div>
                `;
            } else if (card.type === CARD_TYPES.WILD_LOCATION) {
                cardEl.classList.add('wild-card');
                cardEl.innerHTML = `
                    <div class="card-type">Wild</div>
                    <div class="card-icon">🌟</div>
                    <div class="card-name">Location</div>
                `;
            } else if (card.type === CARD_TYPES.WILD_INDUSTRY) {
                cardEl.classList.add('wild-card');
                cardEl.innerHTML = `
                    <div class="card-type">Wild</div>
                    <div class="card-icon">⭐</div>
                    <div class="card-name">Industry</div>
                `;
            }

            if (this.selectedCard === idx) {
                cardEl.classList.add('selected');
            }

            // Highlight valid cards when waiting for card selection
            if (this.actionStep > 0 && this.selectedAction) {
                cardEl.style.boxShadow = '0 0 8px rgba(201,168,76,0.5)';
                cardEl.style.cursor = 'pointer';
            }

            cardEl.addEventListener('click', () => this.onCardClicked(idx));
            container.appendChild(cardEl);
        });
    }

    updateActionButtons() {
        const playerId = this.state.currentPlayerId;

        document.querySelectorAll('.action-btn').forEach(btn => {
            const action = btn.dataset.action;
            const canDo = this.logic.canPerformAction(action, playerId);
            btn.disabled = !canDo;
            btn.classList.toggle('active', this.selectedAction === action);
        });
    }

    updatePlayerMat() {
        const container = document.getElementById('player-mat');
        container.innerHTML = '';

        const remaining = this.state.getRemainingTiles(this.state.currentPlayerId);

        for (const [type, data] of Object.entries(remaining)) {
            const display = INDUSTRY_DISPLAY[type];
            const div = document.createElement('div');
            div.className = 'mat-industry';

            let tilesHtml = '';
            const allTiles = this.state.currentPlayer.industryTiles[type];
            allTiles.forEach(tile => {
                const cls = tile.used ? 'mat-tile used' : 'mat-tile available';
                tilesHtml += `<div class="${cls}" title="${display.name} Lv${tile.level} - Cost: £${tile.cost}">${tile.level}</div>`;
            });

            div.innerHTML = `
                <div class="mat-industry-label">${display.shortName} (${data.count})</div>
                <div class="mat-tiles">${tilesHtml}</div>
            `;
            container.appendChild(div);
        }
    }

    updateMarkets() {
        // Coal market
        const coalTrack = document.getElementById('coal-track');
        coalTrack.innerHTML = '';
        for (let i = 0; i < COAL_MARKET_PRICES.length; i++) {
            const filled = i >= (COAL_MARKET_PRICES.length - this.state.coalMarket);
            const space = document.createElement('div');
            space.className = `market-space${filled ? ' filled coal' : ''}`;
            space.title = `£${COAL_MARKET_PRICES[i]}`;
            if (!filled) space.textContent = COAL_MARKET_PRICES[i];
            coalTrack.appendChild(space);
        }

        // Iron market
        const ironTrack = document.getElementById('iron-track');
        ironTrack.innerHTML = '';
        for (let i = 0; i < IRON_MARKET_PRICES.length; i++) {
            const filled = i >= (IRON_MARKET_PRICES.length - this.state.ironMarket);
            const space = document.createElement('div');
            space.className = `market-space${filled ? ' filled iron' : ''}`;
            space.title = `£${IRON_MARKET_PRICES[i]}`;
            if (!filled) space.textContent = IRON_MARKET_PRICES[i];
            ironTrack.appendChild(space);
        }
    }

    // ========================================================================
    // Card Selection
    // ========================================================================

    onCardClicked(index) {
        if (this.selectedCard === index) {
            this.selectedCard = null;
        } else {
            this.selectedCard = index;
        }
        this.updateHand();

        // If we have an action selected and this was a card selection step
        if (this.selectedAction && this.actionStep > 0) {
            this.processActionStep();
        }
    }

    // ========================================================================
    // Action Selection
    // ========================================================================

    onActionSelected(action) {
        if (this.selectedAction === action) {
            this.cancelAction();
            return;
        }

        this.selectedAction = action;
        this.actionStep = 0;
        this.pendingData = {};
        this.selectedCard = null;

        this.updateActionButtons();
        this.startAction(action);
    }

    cancelAction() {
        this.selectedAction = null;
        this.actionStep = 0;
        this.pendingData = {};
        this.selectedCard = null;
        this.renderer.clearHighlights();
        this.updateActionButtons();
        this.updateHand();
        this.closeModal();
    }

    // ========================================================================
    // Action Execution
    // ========================================================================

    startAction(action) {
        const playerId = this.state.currentPlayerId;

        switch (action) {
            case ACTIONS.BUILD:
                this.startBuild(playerId);
                break;
            case ACTIONS.NETWORK:
                this.startNetwork(playerId);
                break;
            case ACTIONS.DEVELOP:
                this.startDevelop(playerId);
                break;
            case ACTIONS.SELL:
                this.startSell(playerId);
                break;
            case ACTIONS.LOAN:
                this.startLoan(playerId);
                break;
            case ACTIONS.SCOUT:
                this.startScout(playerId);
                break;
            case ACTIONS.PASS:
                this.startPass(playerId);
                break;
        }
    }

    // ========================================================================
    // BUILD
    // ========================================================================

    startBuild(playerId) {
        const targets = this.logic.getValidBuildTargets(playerId);
        if (targets.length === 0) {
            this.showToast('No valid build targets available', 'warning');
            this.cancelAction();
            return;
        }

        // Show modal to select what to build
        this.showBuildModal(playerId, targets);
    }

    showBuildModal(playerId, targets) {
        // Group targets by city
        const byCity = {};
        for (const t of targets) {
            if (!byCity[t.cityId]) byCity[t.cityId] = [];
            byCity[t.cityId].push(t);
        }

        let html = '<div class="choice-list">';
        for (const [cityId, cityTargets] of Object.entries(byCity)) {
            const cityName = CITIES[cityId].name;
            for (const target of cityTargets) {
                const display = INDUSTRY_DISPLAY[target.industryType];
                html += `
                    <div class="choice-item" data-city="${target.cityId}"
                         data-slot="${target.slotIndex}" data-type="${target.industryType}">
                        <div class="choice-item-icon">${display.icon}</div>
                        <div class="choice-item-text">
                            <div class="choice-item-name">${display.name} Lv${target.tileData.level}</div>
                            <div class="choice-item-detail">${cityName} (Slot ${target.slotIndex + 1})</div>
                        </div>
                        <div class="choice-item-cost">£${target.cost.total}
                            ${target.cost.coal > 0 ? ` + ${target.cost.coal} coal` : ''}
                            ${target.cost.iron > 0 ? ` + ${target.cost.iron} iron` : ''}
                        </div>
                    </div>
                `;
            }
        }
        html += '</div>';

        this.showModal('Build Industry', html, () => {});

        // Bind click events
        document.querySelectorAll('#modal-body .choice-item').forEach(item => {
            item.addEventListener('click', () => {
                const cityId = item.dataset.city;
                const slotIndex = parseInt(item.dataset.slot);
                const indType = item.dataset.type;
                this.pendingData = { cityId, slotIndex, industryType: indType };
                this.closeModal();
                this.showToast('Select a card to discard', 'info');
                this.actionStep = 1; // Wait for card selection
            });
        });
    }

    // ========================================================================
    // NETWORK
    // ========================================================================

    startNetwork(playerId) {
        const targets = this.logic.getValidNetworkTargets(playerId);
        if (targets.length === 0) {
            this.showToast('No valid network targets', 'warning');
            this.cancelAction();
            return;
        }

        // Highlight valid connections on board
        this.renderer.highlightConnections(targets.map(t => t.connectionId));

        // Show modal
        let html = '<div class="choice-list">';
        for (const target of targets) {
            const city1 = CITIES[target.cities[0]]?.name || MERCHANTS[target.cities[0]]?.name || target.cities[0];
            const city2 = CITIES[target.cities[1]]?.name || MERCHANTS[target.cities[1]]?.name || target.cities[1];
            html += `
                <div class="choice-item" data-conn="${target.connectionId}">
                    <div class="choice-item-icon">${target.type === 'canal' ? '⛵' : '🚂'}</div>
                    <div class="choice-item-text">
                        <div class="choice-item-name">${city1} — ${city2}</div>
                        <div class="choice-item-detail">${target.type}</div>
                    </div>
                    <div class="choice-item-cost">£${target.cost}</div>
                </div>
            `;
        }
        html += '</div>';

        this.showModal('Build Link', html, () => {});

        document.querySelectorAll('#modal-body .choice-item').forEach(item => {
            item.addEventListener('click', () => {
                this.pendingData = { connectionId: item.dataset.conn };
                this.closeModal();
                this.showToast('Select a card to discard', 'info');
                this.actionStep = 1;
            });
        });
    }

    // ========================================================================
    // DEVELOP
    // ========================================================================

    startDevelop(playerId) {
        const types = this.logic.getDevelopableTypes(playerId);
        if (types.length === 0) {
            this.showToast('Nothing to develop', 'warning');
            this.cancelAction();
            return;
        }

        let html = '<p style="margin-bottom:12px;color:var(--text-secondary);font-size:13px;">Remove 1-2 tiles from your mat to access higher levels. Costs 1 iron per tile.</p>';
        html += '<div class="choice-list">';
        for (const t of types) {
            const display = INDUSTRY_DISPLAY[t.type];
            html += `
                <div class="choice-item" data-type="${t.type}">
                    <div class="choice-item-icon">${display.icon}</div>
                    <div class="choice-item-text">
                        <div class="choice-item-name">${display.name} Lv${t.level}</div>
                        <div class="choice-item-detail">Remove this tile</div>
                    </div>
                </div>
            `;
        }
        html += '</div>';

        this.showModal('Develop (Select 1st tile)', html, () => {});

        document.querySelectorAll('#modal-body .choice-item').forEach(item => {
            item.addEventListener('click', () => {
                const type1 = item.dataset.type;
                this.pendingData.industryType1 = type1;

                // Ask if they want to develop a second tile
                this.showDevelopSecondChoice(playerId, type1);
            });
        });
    }

    showDevelopSecondChoice(playerId, firstType) {
        const types = this.logic.getDevelopableTypes(playerId);
        // Filter: the first tile is now "pending removal", so get what's next
        // For simplicity, show all developable types again
        const remainingTypes = types.filter(t => {
            // If it's the same type as first, check if there are more tiles
            if (t.type === firstType) {
                const remaining = this.state.getRemainingTiles(playerId);
                return remaining[t.type].count > 1; // Need at least 2
            }
            return true;
        });

        // Check if player can afford iron for 2 tiles
        const ironSources = this.state.findIronSource(playerId);
        const canAffordTwo = ironSources.length >= 2;

        if (!canAffordTwo || remainingTypes.length === 0) {
            // Just develop one tile
            this.closeModal();
            this.showToast('Select a card to discard', 'info');
            this.actionStep = 1;
            return;
        }

        let html = '<p style="margin-bottom:12px;color:var(--text-secondary);font-size:13px;">Optionally develop a second tile (costs another iron).</p>';
        html += '<div class="choice-list">';
        html += '<div class="choice-item" data-type="none"><div class="choice-item-text"><div class="choice-item-name">Done (develop 1 tile only)</div></div></div>';

        for (const t of remainingTypes) {
            const display = INDUSTRY_DISPLAY[t.type];
            html += `
                <div class="choice-item" data-type="${t.type}">
                    <div class="choice-item-icon">${display.icon}</div>
                    <div class="choice-item-text">
                        <div class="choice-item-name">${display.name} Lv${t.level}</div>
                    </div>
                </div>
            `;
        }
        html += '</div>';

        this.showModal('Develop (Optional 2nd tile)', html, () => {});

        document.querySelectorAll('#modal-body .choice-item').forEach(item => {
            item.addEventListener('click', () => {
                const type2 = item.dataset.type;
                this.pendingData.industryType2 = type2 === 'none' ? null : type2;
                this.closeModal();
                this.showToast('Select a card to discard', 'info');
                this.actionStep = 1;
            });
        });
    }

    // ========================================================================
    // SELL
    // ========================================================================

    startSell(playerId) {
        const targets = this.logic.getValidSellTargets(playerId);
        if (targets.length === 0) {
            this.showToast('Nothing to sell', 'warning');
            this.cancelAction();
            return;
        }

        let html = '<p style="margin-bottom:12px;color:var(--text-secondary);font-size:13px;">Select industries to sell (you may sell multiple in one action).</p>';
        html += '<div class="choice-list">';
        for (const target of targets) {
            const display = INDUSTRY_DISPLAY[target.tile.type];
            const cityName = CITIES[target.cityId]?.name || target.cityId;
            html += `
                <div class="choice-item" data-key="${target.key}" data-selected="false">
                    <div class="choice-item-icon">${display.icon}</div>
                    <div class="choice-item-text">
                        <div class="choice-item-name">${display.name} Lv${target.tile.tileData.level}</div>
                        <div class="choice-item-detail">${cityName} | VP: ${target.tile.tileData.vp} | Income: +${target.tile.tileData.income}
                        ${target.beerNeeded > 0 ? ` | Beer: ${target.beerNeeded}` : ''}</div>
                    </div>
                </div>
            `;
        }
        html += '</div>';

        const footer = '<button class="modal-btn modal-btn-primary" id="confirm-sell">Sell Selected</button>';
        this.showModal('Sell Goods', html, null, footer);

        // Toggle selection
        const selectedKeys = new Set();
        document.querySelectorAll('#modal-body .choice-item').forEach(item => {
            item.addEventListener('click', () => {
                const key = item.dataset.key;
                if (selectedKeys.has(key)) {
                    selectedKeys.delete(key);
                    item.style.borderColor = '';
                } else {
                    selectedKeys.add(key);
                    item.style.borderColor = 'var(--accent-gold)';
                }
            });
        });

        document.getElementById('confirm-sell').addEventListener('click', () => {
            if (selectedKeys.size === 0) {
                this.showToast('Select at least one industry to sell', 'warning');
                return;
            }
            this.pendingData.tileKeys = [...selectedKeys];
            this.closeModal();
            this.showToast('Select a card to discard', 'info');
            this.actionStep = 1;
        });
    }

    // ========================================================================
    // LOAN
    // ========================================================================

    startLoan(playerId) {
        this.showToast(`Select a card to discard for £${LOAN_AMOUNT} loan`, 'info');
        this.actionStep = 1;
    }

    // ========================================================================
    // SCOUT
    // ========================================================================

    startScout(playerId) {
        this.pendingData.scoutCards = [];
        this.showToast('Select 3 cards to discard for Scout', 'info');
        this.actionStep = 1;
    }

    // ========================================================================
    // PASS
    // ========================================================================

    startPass(playerId) {
        this.showToast('Select a card to discard', 'info');
        this.actionStep = 1;
    }

    // ========================================================================
    // Process multi-step action
    // ========================================================================

    processActionStep() {
        if (this.selectedCard === null) return;

        const playerId = this.state.currentPlayerId;
        const cardIndex = this.selectedCard;

        switch (this.selectedAction) {
            case ACTIONS.BUILD: {
                const result = this.logic.executeBuild(
                    playerId,
                    this.pendingData.cityId,
                    this.pendingData.slotIndex,
                    this.pendingData.industryType,
                    cardIndex
                );
                this.completeAction(result);
                break;
            }

            case ACTIONS.NETWORK: {
                const result = this.logic.executeNetwork(
                    playerId,
                    this.pendingData.connectionId,
                    cardIndex
                );
                this.completeAction(result);
                break;
            }

            case ACTIONS.DEVELOP: {
                const result = this.logic.executeDevelop(
                    playerId,
                    this.pendingData.industryType1,
                    this.pendingData.industryType2,
                    cardIndex
                );
                this.completeAction(result);
                break;
            }

            case ACTIONS.SELL: {
                const result = this.logic.executeSell(
                    playerId,
                    this.pendingData.tileKeys,
                    cardIndex
                );
                this.completeAction(result);
                break;
            }

            case ACTIONS.LOAN: {
                const result = this.logic.executeLoan(playerId, cardIndex);
                this.completeAction(result);
                break;
            }

            case ACTIONS.SCOUT: {
                // Accumulate 3 cards
                if (!this.pendingData.scoutCards) this.pendingData.scoutCards = [];
                this.pendingData.scoutCards.push(cardIndex);

                if (this.pendingData.scoutCards.length >= 3) {
                    const result = this.logic.executeScout(playerId, this.pendingData.scoutCards);
                    this.completeAction(result);
                } else {
                    this.selectedCard = null;
                    this.showToast(`Select ${3 - this.pendingData.scoutCards.length} more card(s)`, 'info');
                    this.updateHand();
                }
                break;
            }

            case ACTIONS.PASS: {
                const result = this.logic.executePass(playerId, cardIndex);
                this.completeAction(result);
                break;
            }
        }
    }

    completeAction(result) {
        if (result.success) {
            this.showToast(result.message, 'success');
        } else {
            this.showToast(result.message, 'error');
            this.cancelAction();
            return;
        }

        // Advance turn
        this.selectedAction = null;
        this.actionStep = 0;
        this.pendingData = {};
        this.selectedCard = null;
        this.renderer.clearHighlights();

        const turnResult = this.state.advanceTurn();

        if (turnResult === 'endCanalEra') {
            const scores = this.state.endCanalEra();
            this.showScoring('Canal Era Complete', scores);
        } else if (turnResult === 'endGame') {
            const scores = this.state.endGame();
            this.showGameOver(scores);
        }

        this.refresh();
    }

    // ========================================================================
    // Board Click Handler
    // ========================================================================

    onBoardClick(e) {
        const target = e.target.closest('.industry-slot, .connection-line, .brewery-farm, .merchant-group');
        if (!target) return;

        // Handle click based on current action
        if (this.selectedAction === ACTIONS.BUILD) {
            const slot = target.closest('.industry-slot');
            if (slot) {
                const cityId = slot.dataset.city;
                const slotIndex = parseInt(slot.dataset.slot);
                // If this is a valid target, select it
                // TODO: Direct board-click build selection
            }
        }

        if (this.selectedAction === ACTIONS.NETWORK) {
            const line = target.closest('.connection-line');
            if (line && line.classList.contains('highlight')) {
                const connId = line.dataset.connection;
                this.pendingData = { connectionId: connId };
                this.renderer.clearHighlights();
                this.showToast('Select a card to discard', 'info');
                this.actionStep = 1;
            }
        }
    }

    // ========================================================================
    // Modal
    // ========================================================================

    showModal(title, bodyHtml, onClose, footerHtml = '') {
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').innerHTML = bodyHtml;
        document.getElementById('modal-footer').innerHTML = footerHtml;
        document.getElementById('modal-overlay').classList.remove('hidden');
    }

    closeModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
    }

    // ========================================================================
    // Toast
    // ========================================================================

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100px)';
            toast.style.transition = 'all 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ========================================================================
    // Scoring Display
    // ========================================================================

    showScoring(title, scores) {
        const overlay = document.getElementById('scoring-overlay');
        document.getElementById('scoring-title').textContent = title;

        let html = '<table class="scoring-table"><thead><tr><th>Player</th><th>Link VP</th><th>Industry VP</th><th>Total VP</th></tr></thead><tbody>';
        for (const s of scores) {
            const player = this.state.players[s.playerId];
            html += `<tr>
                <td style="color:${player.color}">${player.name}</td>
                <td>${s.linkVP}</td>
                <td>${s.industryVP}</td>
                <td class="total-row">${s.totalVP}</td>
            </tr>`;
        }
        html += '</tbody></table>';

        document.getElementById('scoring-details').innerHTML = html;
        overlay.classList.remove('hidden');

        document.getElementById('scoring-continue-btn').onclick = () => {
            overlay.classList.add('hidden');
            this.refresh();
        };
    }

    showGameOver(scores) {
        const overlay = document.getElementById('gameover-overlay');

        // Sort by VP
        const sorted = [...this.state.players].sort((a, b) => b.vp - a.vp);

        let html = '<table class="scoring-table"><thead><tr><th>Rank</th><th>Player</th><th>VP</th><th>Income</th><th>Money</th></tr></thead><tbody>';
        sorted.forEach((p, i) => {
            html += `<tr${i === 0 ? ' class="total-row"' : ''}>
                <td>${i + 1}</td>
                <td style="color:${p.color}">${p.name}</td>
                <td>${p.vp}</td>
                <td>${p.income}</td>
                <td>£${p.money}</td>
            </tr>`;
        });
        html += '</tbody></table>';

        document.getElementById('final-scores').innerHTML = html;
        overlay.classList.remove('hidden');

        document.getElementById('new-game-btn').onclick = () => {
            overlay.classList.add('hidden');
            document.getElementById('game-screen').classList.remove('active');
            document.getElementById('setup-screen').classList.add('active');
        };
    }
}

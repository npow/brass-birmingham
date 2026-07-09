// ============================================================================
// Brass: Birmingham - AI Opponent
// ============================================================================
// Stateless decision engine. Reads GameState/GameLogic (never mutates them)
// and returns a decision shaped to drop directly into UIManager's existing
// action pipeline: { action, pendingData, cardIndex }.
// ============================================================================

const AIPlayer = (() => {

    // Scoring weights — tunable constants, converting every candidate move
    // onto one VP-equivalent scalar so different action types can be compared.
    const VP_WEIGHT = 1.0;
    const MONEY_WEIGHT = 0.12;
    const BASE_INCOME_WEIGHT = 0.35;
    const FLEX_WEIGHT = 0.8;

    // ------------------------------------------------------------------
    // Shared helpers
    // ------------------------------------------------------------------

    function estimateRoundsRemaining(state) {
        const proxy = state.drawDeck.length / state.numPlayers;
        return Math.max(1, Math.min(10, proxy));
    }

    function incomeWeight(state) {
        return BASE_INCOME_WEIGHT * (estimateRoundsRemaining(state) / 5);
    }

    function vpEquivalent(state, { vp = 0, income = 0, money = 0, flex = 0 } = {}) {
        return vp * VP_WEIGHT + income * incomeWeight(state) + money * MONEY_WEIGHT + flex * FLEX_WEIGHT;
    }

    // How useful is a card still likely to be? Used for Scout/discard choices.
    function cardUsefulness(state, logic, playerId, card) {
        if (card.type === CARD_TYPES.WILD_LOCATION || card.type === CARD_TYPES.WILD_INDUSTRY) {
            return 5; // never volunteer a wild unless forced
        }
        if (card.type === CARD_TYPES.LOCATION) {
            const city = CITIES[card.location];
            if (!city) return 0;
            // Useful if any slot at this location could still take one of the
            // player's remaining tile types.
            const remaining = state.getRemainingTiles(playerId);
            for (const slotTypes of city.slots) {
                const allowed = Array.isArray(slotTypes) ? slotTypes : [slotTypes];
                for (const t of allowed) {
                    if (remaining[t] && remaining[t].count > 0) return 2;
                }
            }
            return 0;
        }
        if (card.type === CARD_TYPES.INDUSTRY) {
            const remaining = state.getRemainingTiles(playerId);
            const has = card.industryTypes.some(t => remaining[t] && remaining[t].count > 0);
            return has ? 1.5 : 0;
        }
        return 0.5;
    }

    // Prefer a non-wild matching card over a wild one when both are legal.
    function pickCardIndex(logic, playerId, action, target, player) {
        const validIndices = logic.getValidCardsForAction(playerId, action, target);
        if (validIndices.length === 0) return null;
        const nonWild = validIndices.find(idx => {
            const c = player.hand[idx];
            return c.type !== CARD_TYPES.WILD_LOCATION && c.type !== CARD_TYPES.WILD_INDUSTRY;
        });
        return nonWild !== undefined ? nonWild : validIndices[0];
    }

    function estimateFlipProbability(state, logic, playerId, cand) {
        const { industryType, cityId } = cand;
        let base;
        if (industryType === INDUSTRY_TYPES.COAL_MINE || industryType === INDUSTRY_TYPES.IRON_WORKS) {
            base = 0.7;
        } else if (industryType === INDUSTRY_TYPES.BREWERY) {
            base = 0.5;
        } else {
            // Sellable industries
            base = 0.6;
            const connected = state.getConnectedLocations(cityId);
            const hasReachableMerchant = state.merchantTiles.some(mt =>
                connected.has(mt.location) && state.merchantTileAccepts(mt, industryType)
            );
            if (hasReachableMerchant) base += 0.2;
            if (estimateRoundsRemaining(state) < 2) base -= 0.3;
        }
        return Math.max(0.1, Math.min(1, base));
    }

    function playerOwnsLinkTouching(state, playerId, cityId) {
        for (const conn of CONNECTIONS) {
            const link = state.boardLinks[conn.id];
            if (link && link.playerId === playerId && conn.cities.includes(cityId)) return true;
        }
        return false;
    }

    function countNewUnbuiltNeighborConnections(state, cityId) {
        let count = 0;
        for (const conn of CONNECTIONS) {
            if (state.boardLinks[conn.id]) continue;
            if (conn.cities.includes(cityId)) count++;
        }
        return count;
    }

    // ------------------------------------------------------------------
    // BUILD
    // ------------------------------------------------------------------

    function scoreBuildCandidate(state, logic, playerId, cand) {
        const { tileData, cost, cityId, industryType } = cand;
        const flipProb = estimateFlipProbability(state, logic, playerId, cand);
        const ownsAdjacentLink = playerOwnsLinkTouching(state, playerId, cityId);
        const linkSelfValue = ownsAdjacentLink ? tileData.linkVP * flipProb * 0.5 : 0;
        const isResourceType = industryType === INDUSTRY_TYPES.COAL_MINE || industryType === INDUSTRY_TYPES.IRON_WORKS;
        const resourceSelfSufficiency = isResourceType ? 0.15 * (tileData.resourceCubes || 0) : 0;
        const networkExpansion = 0.1 * countNewUnbuiltNeighborConnections(state, cityId);

        const score = vpEquivalent(state, {
            vp: tileData.vp * flipProb + linkSelfValue,
            income: tileData.income * flipProb,
            money: -cost.total,
        }) + resourceSelfSufficiency + networkExpansion;

        return score;
    }

    function bestBuild(state, logic, playerId) {
        const targets = logic.getValidBuildTargets(playerId);
        if (targets.length === 0) return null;

        let best = null;
        let bestScore = -Infinity;
        for (const cand of targets) {
            const score = scoreBuildCandidate(state, logic, playerId, cand);
            if (score > bestScore) {
                bestScore = score;
                best = cand;
            }
        }
        if (!best) return null;

        const player = state.players[playerId];
        const target = { cityId: best.cityId, slotIndex: best.slotIndex, industryType: best.industryType };
        const cardIndex = pickCardIndex(logic, playerId, ACTIONS.BUILD, target, player);
        if (cardIndex === null) return null;

        return {
            action: ACTIONS.BUILD,
            pendingData: target,
            cardIndex,
            score: bestScore,
        };
    }

    // ------------------------------------------------------------------
    // NETWORK
    // ------------------------------------------------------------------

    function countHandCardsNewlyInNetwork(state, logic, playerId, cand) {
        const player = state.players[playerId];
        let count = 0;
        for (const card of player.hand) {
            if (card.type === CARD_TYPES.LOCATION) {
                if (!state.isInNetwork(playerId, card.location) && cand.cities.includes(card.location)) count++;
            } else if (card.type === CARD_TYPES.INDUSTRY) {
                // Industry cards benefit from any network growth, credit lightly
                count += 0.25;
            }
        }
        return count;
    }

    function connectsToNewMerchant(state, cand) {
        return cand.cities.some(c => isMerchantLocation(c));
    }

    function scoreNetworkCandidate(state, logic, playerId, cand) {
        const accessGain = countHandCardsNewlyInNetwork(state, logic, playerId, cand);
        const merchantGain = connectsToNewMerchant(state, cand) ? 1.5 : 0;
        const hasIndustry = Object.values(state.boardIndustries).some(t => t.playerId === playerId);
        const player = state.players[playerId];
        const linksBuilt = 14 - player.linksRemaining[cand.type];
        const overNetworkingPenalty = (!hasIndustry && linksBuilt >= 1) ? 1.0 : 0;
        // Keeping options open has standalone value even with no immediate hand
        // synergy — without it, industry cards (network-gated) go unplayable.
        // Taper off once a player already has a modest network.
        const explorationBonus = Math.max(0, 1.6 - linksBuilt * 0.3);

        return vpEquivalent(state, { vp: accessGain * 1.0 + merchantGain, money: -cand.cost })
            + explorationBonus - overNetworkingPenalty;
    }

    function bestNetwork(state, logic, playerId) {
        const targets = logic.getValidNetworkTargets(playerId);
        if (targets.length === 0) return null;

        let best = null;
        let bestScore = -Infinity;
        for (const cand of targets) {
            const score = scoreNetworkCandidate(state, logic, playerId, cand);
            if (score > bestScore) {
                bestScore = score;
                best = cand;
            }
        }
        if (!best) return null;

        const player = state.players[playerId];
        const cardIndex = pickCardIndex(logic, playerId, ACTIONS.NETWORK, null, player);
        if (cardIndex === null) return null;

        return {
            action: ACTIONS.NETWORK,
            pendingData: { connectionId: best.connectionId },
            cardIndex,
            score: bestScore,
        };
    }

    // ------------------------------------------------------------------
    // DEVELOP
    // ------------------------------------------------------------------

    function scoreDevelopPlan(state, logic, playerId) {
        const types = logic.getDevelopableTypes(playerId);
        const ironSources = state.findIronSource(playerId);
        if (types.length === 0 || ironSources.length === 0) return null;

        const player = state.players[playerId];
        if (!ironSources[0].free && ironSources[0].price > player.money) return null;

        const scored = types.map(t => ({
            t,
            urgency: t.tile.railEra === false ? 2.0 : 0.5,
            unlockValue: 0.3 * t.level,
        })).sort((a, b) => (b.urgency + b.unlockValue) - (a.urgency + a.unlockValue));

        const first = scored[0];
        const remaining = state.getRemainingTiles(playerId);
        const canDoSecondSameType = remaining[first.t.type].count > 1;
        const twoSourceCost = ironSources.slice(0, 2).reduce((sum, s) => sum + (s.free ? 0 : s.price), 0);
        const canAffordSecond = ironSources.length >= 2 && twoSourceCost <= player.money;

        let second = null;
        if (canAffordSecond) {
            second = scored.slice(1).find(s => s.t.type !== first.t.type || canDoSecondSameType);
        }

        const ironCost = ironSources.slice(0, second ? 2 : 1).reduce((sum, s) => sum + (s.free ? 0 : s.price), 0);

        const score = vpEquivalent(state, {
            vp: (first.urgency + first.unlockValue) + (second ? second.urgency + second.unlockValue : 0),
            money: -ironCost,
        });

        const cardIndex = pickCardIndex(logic, playerId, ACTIONS.DEVELOP, null, player);
        if (cardIndex === null) return null;

        return {
            action: ACTIONS.DEVELOP,
            pendingData: { industryType1: first.t.type, industryType2: second ? second.t.type : null },
            cardIndex,
            score,
        };
    }

    // ------------------------------------------------------------------
    // SELL
    // ------------------------------------------------------------------

    // Value of the best merchant beer bonus this sale could claim (only
    // merchants with a barrel remaining grant bonuses).
    function bestMerchantBeerBonus(state, target) {
        let best = 0;
        for (const i of target.merchantIndices) {
            const mt = state.merchantTiles[i];
            if (!mt.hasBeer) continue;
            const merchData = MERCHANTS[mt.location];
            if (!merchData) continue;
            let value = 0;
            switch (merchData.bonusType) {
                case 'vp': value = merchData.bonusAmount * VP_WEIGHT; break;
                case 'money': value = merchData.bonusAmount * MONEY_WEIGHT; break;
                case 'income': value = merchData.bonusAmount * incomeWeight(state); break;
                case 'develop': value = merchData.bonusAmount * 0.5; break;
            }
            if (value > best) best = value;
        }
        return best;
    }

    function scoreSellPlan(state, logic, playerId) {
        const targets = logic.getValidSellTargets(playerId);
        if (targets.length === 0) return null;

        const ranked = targets.map(t => {
            const bonus = bestMerchantBeerBonus(state, t);
            const tileValue = t.tile.tileData.vp + t.tile.tileData.income * 0.3;
            return { t, tileValue, bonus };
        }).sort((a, b) => (b.bonus - a.bonus) || (b.tileValue - a.tileValue));

        // Drink merchant beer whenever it's on offer: the bonus is free and
        // it spares brewery barrels for other sales.
        const sellPlan = ranked.map(r => ({ key: r.t.key, useMerchantBeer: r.t.merchantBeerAvailable }));
        const totalVP = ranked.reduce((s, r) => s + r.t.tile.tileData.vp, 0);
        const totalIncome = ranked.reduce((s, r) => s + r.t.tile.tileData.income, 0);
        const totalBonus = ranked.reduce((s, r) => s + r.bonus, 0);

        const player = state.players[playerId];
        const cardIndex = pickCardIndex(logic, playerId, ACTIONS.SELL, null, player);
        if (cardIndex === null) return null;

        return {
            action: ACTIONS.SELL,
            pendingData: { sellPlan },
            cardIndex,
            score: vpEquivalent(state, { vp: totalVP, income: totalIncome }) + totalBonus,
        };
    }

    // ------------------------------------------------------------------
    // LOAN
    // ------------------------------------------------------------------

    function cheapestAffordableBuildOrNetworkCost(state, logic, playerId) {
        let cheapest = Infinity;
        for (const t of logic.getValidBuildTargets(playerId)) {
            if (t.cost.total < cheapest) cheapest = t.cost.total;
        }
        for (const t of logic.getValidNetworkTargets(playerId)) {
            if (t.cost < cheapest) cheapest = t.cost;
        }
        return cheapest;
    }

    function scoreLoanResult(state, logic, playerId) {
        if (!state.canTakeLoan(playerId)) return null;
        const player = state.players[playerId];
        const incomeLevel = state.getIncomeLevel(playerId);
        const cheapest = cheapestAffordableBuildOrNetworkCost(state, logic, playerId);
        // Loan is a safety valve, not a scoring play — money sitting unspent has
        // no direct end-game value, so only credit a small flexibility premium
        // for the raw cash, and let cashCrunchBonus carry the real signal for
        // when a loan is actually needed to afford the next move.
        const cashCrunchBonus = (player.money < cheapest) ? 4.0 : 0;
        const alreadyFlushPenalty = player.money > cheapest * 2.5 ? 2.5 : 0;
        const incomeFloorPenalty = incomeLevel <= (MIN_INCOME + 5) ? 2.5 : 0;

        const score = vpEquivalent(state, { money: LOAN_AMOUNT * 0.25, income: -LOAN_INCOME_PENALTY })
            + cashCrunchBonus - incomeFloorPenalty - alreadyFlushPenalty;

        const cardIndex = pickCardIndex(logic, playerId, ACTIONS.LOAN, null, player);
        if (cardIndex === null) return null;

        return {
            action: ACTIONS.LOAN,
            pendingData: {},
            cardIndex,
            score,
        };
    }

    // ------------------------------------------------------------------
    // SCOUT
    // ------------------------------------------------------------------

    function scoreScoutPlan(state, logic, playerId) {
        if (!logic.canScout(playerId)) return null;
        const player = state.players[playerId];
        const hand = player.hand;

        const usefulness = hand.map((card, idx) => ({ idx, score: cardUsefulness(state, logic, playerId, card) }))
            .sort((a, b) => a.score - b.score);

        const discardIdxs = usefulness.slice(0, 3).map(u => u.idx);
        const deadCount = usefulness.slice(0, 3).filter(u => u.score <= 0).length;
        const score = vpEquivalent(state, { flex: deadCount * 1.2 - (3 - deadCount) * 0.6 });

        return {
            action: ACTIONS.SCOUT,
            pendingData: { scoutCards: [discardIdxs[0], discardIdxs[1]] },
            cardIndex: discardIdxs[2],
            score,
        };
    }

    // ------------------------------------------------------------------
    // PASS
    // ------------------------------------------------------------------

    function scorePassResult(state, logic, playerId) {
        const player = state.players[playerId];
        const cardIndex = pickCardIndex(logic, playerId, ACTIONS.PASS, null, player);
        return {
            action: ACTIONS.PASS,
            pendingData: {},
            cardIndex: cardIndex === null ? 0 : cardIndex,
            score: -0.5,
        };
    }

    // ------------------------------------------------------------------
    // Difficulty perturbation
    // ------------------------------------------------------------------

    function applyDifficulty(state, logic, playerId, results, difficulty) {
        if (difficulty === 'easy') {
            for (const r of results) r.score += (Math.random() - 0.5) * 4;
            if (Math.random() < 0.15 && results.length > 0) {
                return results[Math.floor(Math.random() * results.length)];
            }
        } else if (difficulty === 'hard') {
            for (const r of results) {
                if (r.action === ACTIONS.BUILD) {
                    r.score += denialBonus(state, playerId, r);
                }
            }
        } else {
            // normal
            for (const r of results) r.score += (Math.random() - 0.5) * 1.2;
        }
        return null;
    }

    function denialBonus(state, playerId, decision) {
        const { cityId, industryType } = decision.pendingData;
        let bonus = 0;
        for (const p of state.players) {
            if (p.id === playerId) continue;
            for (const card of p.hand) {
                if (card.type === CARD_TYPES.LOCATION && card.location === cityId) bonus += 0.6;
                if (card.type === CARD_TYPES.INDUSTRY && card.industryTypes.includes(industryType)) bonus += 0.3;
            }
        }
        return bonus;
    }

    // ------------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------------

    function chooseAction(state, logic, playerId, difficulty = 'normal') {
        const results = [];

        if (logic.canPerformAction(ACTIONS.BUILD, playerId)) {
            const r = bestBuild(state, logic, playerId);
            if (r) results.push(r);
        }
        if (logic.canPerformAction(ACTIONS.NETWORK, playerId)) {
            const r = bestNetwork(state, logic, playerId);
            if (r) results.push(r);
        }
        if (logic.canPerformAction(ACTIONS.DEVELOP, playerId)) {
            const r = scoreDevelopPlan(state, logic, playerId);
            if (r) results.push(r);
        }
        if (logic.canPerformAction(ACTIONS.SELL, playerId)) {
            const r = scoreSellPlan(state, logic, playerId);
            if (r) results.push(r);
        }
        const loanResult = scoreLoanResult(state, logic, playerId);
        if (loanResult) results.push(loanResult);

        if (logic.canPerformAction(ACTIONS.SCOUT, playerId)) {
            const r = scoreScoutPlan(state, logic, playerId);
            if (r) results.push(r);
        }
        results.push(scorePassResult(state, logic, playerId));

        if (results.length === 0) {
            // Should not happen (Pass is always available), but guard anyway.
            return { action: ACTIONS.PASS, pendingData: {}, cardIndex: 0 };
        }

        const forced = applyDifficulty(state, logic, playerId, results, difficulty);
        if (forced) return forced;

        results.sort((a, b) => b.score - a.score);
        return results[0];
    }

    return { chooseAction };
})();

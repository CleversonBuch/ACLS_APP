/**
 * monteCarloEngine.js
 * Motor profissional de simulação Monte Carlo para previsão de Top 5 em seletivas.
 *
 * Implementa:
 *  - Laplace Smoothing para força do jogador
 *  - Peso por volume de jogos (credibilidade)
 *  - Calibração anti-superconfiança (P_calibrada)
 *  - Ajuste por progresso do campeonato (P_final)
 *  - Momentum (últimos resultados)
 *  - Força do adversário (qualidade das vitórias)
 *  - Volatilidade (inconsistência)
 *  - 2000 simulações mínimas
 */

const SIMULATIONS = 2000;

/**
 * Calcula as chances de cada jogador terminar no Top 5.
 *
 * @param {Array}  standings       - Ranking atual da seletiva (cada item: { id, wins, losses, points })
 * @param {Array}  matches         - Todos os confrontos da seletiva (completed + pending)
 * @param {Object} activeSelective - Objeto da seletiva ativa (config, playerIds, etc.)
 * @returns {{ [playerId: string]: number }} - Mapa playerId → chance 0-100
 */
export function computeTop5Chances(standings, matches, activeSelective) {
    if (!activeSelective || matches.length === 0 || standings.length === 0) return {};

    const config = activeSelective.config || {};
    const ptsWin = config.pointsPerWin ?? 3;
    const ptsLoss = config.pointsPerLoss ?? 0;

    const completedMatches = matches.filter(m => m.status === 'completed' && m.winnerId);
    const pendingMatches = matches.filter(m => m.status !== 'completed' && m.player1Id && m.player2Id);

    // ── Caso trivial: sem jogos pendentes ──
    if (pendingMatches.length === 0) {
        const chances = {};
        standings.forEach(s => { chances[s.id] = 0; });
        standings.slice(0, 5).forEach(s => { chances[s.id] = 100; });
        return chances;
    }

    // ── ETAPA 2: Força de cada jogador ──
    const playerStrength = {};
    standings.forEach(s => {
        const j = s.wins + s.losses; // jogos disputados
        const forçaBase = (s.wins + 1) / (j + 2); // Laplace smoothing
        const pesoJogos = Math.min(1, j / 6);
        playerStrength[s.id] = forçaBase * (0.7 + 0.3 * pesoJogos);
    });

    // ── MELHORIA: Força do adversário (qualidade das vitórias) ──
    // Soma a força inicial dos adversários derrotados, normaliza
    const opponentBonus = {};
    standings.forEach(s => { opponentBonus[s.id] = 0; });
    completedMatches.forEach(m => {
        const loserId = m.winnerId === m.player1Id ? m.player2Id : m.player1Id;
        if (opponentBonus[m.winnerId] !== undefined && playerStrength[loserId] !== undefined) {
            opponentBonus[m.winnerId] += playerStrength[loserId];
        }
    });
    // Normalizar: max bonus = 0.1 (adicional à força base)
    const maxBonus = Math.max(...Object.values(opponentBonus), 0.001);
    const strengthWithBonus = {};
    standings.forEach(s => {
        strengthWithBonus[s.id] = playerStrength[s.id] + (opponentBonus[s.id] / maxBonus) * 0.1;
    });

    // ── MELHORIA: Momentum (últimas 2 partidas) ──
    // +5% se venceu as últimas 2 e -3% se perdeu as últimas 2
    const momentumFactor = {};
    standings.forEach(s => { momentumFactor[s.id] = 0; });
    standings.forEach(s => {
        const playerMatches = completedMatches
            .filter(m => m.player1Id === s.id || m.player2Id === s.id)
            .sort((a, b) => (b.round || 0) - (a.round || 0))
            .slice(0, 2);

        if (playerMatches.length >= 2) {
            const allWins = playerMatches.every(m => m.winnerId === s.id);
            const allLosses = playerMatches.every(m => m.winnerId !== s.id);
            if (allWins) momentumFactor[s.id] = 0.05;
            else if (allLosses) momentumFactor[s.id] = -0.03;
        }
    });

    // ── MELHORIA: Volatilidade ──
    // Jogadores com winrate entre 40%-60% têm variação aleatória extra na simulação
    const volatility = {};
    standings.forEach(s => {
        const total = s.wins + s.losses;
        if (total > 0) {
            const wr = s.wins / total;
            // Mais perto de 50% → mais volátil
            volatility[s.id] = 1 - Math.abs(wr - 0.5) * 2;
        } else {
            volatility[s.id] = 1; // Sem histórico = máxima incerteza
        }
    });

    // ── Força final combinada (antes de multiplicar pelo progresso) ──
    const finalStrength = {};
    standings.forEach(s => {
        const raw = (strengthWithBonus[s.id] || playerStrength[s.id]) + momentumFactor[s.id];
        // Clamp entre 0.05 e 0.95 para evitar extremos
        finalStrength[s.id] = Math.max(0.05, Math.min(0.95, raw));
    });

    // ── ETAPA 5: Ajuste por progresso do campeonato ──
    const totalMatchCount = completedMatches.length + pendingMatches.length;
    const progresso = totalMatchCount > 0 ? completedMatches.length / totalMatchCount : 0;

    // ── SIMULAÇÃO ──
    const chances = {};
    standings.forEach(s => { chances[s.id] = 0; });

    for (let i = 0; i < SIMULATIONS; i++) {
        const simPoints = {};
        standings.forEach(s => { simPoints[s.id] = s.points; });

        pendingMatches.forEach(pm => {
            const strA = finalStrength[pm.player1Id] ?? 0.5;
            const strB = finalStrength[pm.player2Id] ?? 0.5;

            // ── ETAPA 3: Probabilidade de confronto ──
            const p_base = strA / (strA + strB);

            // ── ETAPA 4: Calibração anti-superconfiança ──
            const p_calibrada = p_base * 0.9 + 0.1 * 0.5;

            // ── ETAPA 5: Ajuste por progresso ──
            let p_final = p_calibrada * progresso + 0.5 * (1 - progresso);

            // ── Volatilidade: ruído aleatório para jogadores inconsistentes ──
            const vol = (volatility[pm.player1Id] || 0) * 0.05;
            p_final = Math.max(0.02, Math.min(0.98, p_final + (Math.random() - 0.5) * vol));

            const winner = Math.random() < p_final ? pm.player1Id : pm.player2Id;
            const loser = winner === pm.player1Id ? pm.player2Id : pm.player1Id;
            simPoints[winner] += ptsWin;
            simPoints[loser] += ptsLoss;
        });

        // ── ETAPA 7: Ranking por pontuação final ──
        const simResult = standings
            .map(s => ({ id: s.id, pts: simPoints[s.id] }))
            .sort((a, b) => b.pts - a.pts);

        // Registrar Top 5
        for (let rank = 0; rank < 5 && rank < simResult.length; rank++) {
            chances[simResult[rank].id]++;
        }
    }

    // ── ETAPA 8: Converter contagens em percentuais ──
    Object.keys(chances).forEach(id => {
        chances[id] = Math.round((chances[id] / SIMULATIONS) * 100);
    });

    return chances;
}

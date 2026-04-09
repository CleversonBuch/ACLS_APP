/**
 * monteCarloEngine.js
 * Motor profissional de simulação Monte Carlo para previsão de Top 5 em seletivas.
 *
 * Implementa:
 *  - Laplace Smoothing para força do jogador
 *  - Peso por volume de jogos (credibilidade)
 *  - Calibração anti-superconfiança (P_calibrada) — reforçada para underdogs
 *  - Ajuste por progresso do campeonato (P_final)
 *  - Momentum (últimos resultados)
 *  - Força do adversário (qualidade das vitórias)
 *  - Volatilidade (inconsistência)
 *  - Pré-check matemático (impossível vs apenas improvável)
 *  - Ranking com desempates corretos (pontos → vitórias → derrotas)
 *  - Floor de 1% para cenários matematicamente possíveis
 *  - 5000 simulações para resolução fina de underdogs
 */

const SIMULATIONS = 5000;

/**
 * Verifica se o jogador PODE matematicamente terminar no Top 5
 * vencendo TODOS os seus jogos restantes.
 */
function canMathematicallyReachTop5(player, standings, pendingMatches, ptsWin) {
    const remainingForPlayer = pendingMatches.filter(m =>
        m.player1Id === player.id || m.player2Id === player.id
    ).length;
    const maxPoints = (player.points || 0) + remainingForPlayer * ptsWin;
    // Quantos jogadores TÊM mais pontos atuais que o máximo possível dela?
    // Esses já são intransponíveis mesmo no melhor cenário.
    const intransponiveis = standings.filter(s => s.id !== player.id && (s.points || 0) > maxPoints).length;
    return intransponiveis < 5;
}

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
    const opponentBonus = {};
    standings.forEach(s => { opponentBonus[s.id] = 0; });
    completedMatches.forEach(m => {
        const loserId = m.winnerId === m.player1Id ? m.player2Id : m.player1Id;
        if (opponentBonus[m.winnerId] !== undefined && playerStrength[loserId] !== undefined) {
            opponentBonus[m.winnerId] += playerStrength[loserId];
        }
    });
    const maxBonus = Math.max(...Object.values(opponentBonus), 0.001);
    const strengthWithBonus = {};
    standings.forEach(s => {
        strengthWithBonus[s.id] = playerStrength[s.id] + (opponentBonus[s.id] / maxBonus) * 0.1;
    });

    // ── MELHORIA: Momentum (últimas 2 partidas) ──
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
    const volatility = {};
    standings.forEach(s => {
        const total = s.wins + s.losses;
        if (total > 0) {
            const wr = s.wins / total;
            volatility[s.id] = 1 - Math.abs(wr - 0.5) * 2;
        } else {
            volatility[s.id] = 1;
        }
    });

    // ── Força final combinada ──
    const finalStrength = {};
    standings.forEach(s => {
        const raw = (strengthWithBonus[s.id] || playerStrength[s.id]) + momentumFactor[s.id];
        finalStrength[s.id] = Math.max(0.05, Math.min(0.95, raw));
    });

    // ── ETAPA 5: Ajuste por progresso do campeonato ──
    const totalMatchCount = completedMatches.length + pendingMatches.length;
    const progresso = totalMatchCount > 0 ? completedMatches.length / totalMatchCount : 0;

    // ── Pré-calcular matriz de Confronto Direto (Head-to-Head) ──
    const h2hWins = {};
    standings.forEach(s => { h2hWins[s.id] = {}; });
    completedMatches.forEach(m => {
        if (m.winnerId) {
            const loserId = m.winnerId === m.player1Id ? m.player2Id : m.player1Id;
            if (h2hWins[m.winnerId] && h2hWins[loserId]) {
                h2hWins[m.winnerId][loserId] = true;
            }
        }
    });

    // ── Pré-calcular dados de cada confronto pendente ──
    const pendingMatchesData = pendingMatches.map(pm => {
        let strA = finalStrength[pm.player1Id] ?? 0.5;
        let strB = finalStrength[pm.player2Id] ?? 0.5;

        if (h2hWins[pm.player1Id]?.[pm.player2Id]) {
            strA *= 1.05;
            strB *= 0.95;
        } else if (h2hWins[pm.player2Id]?.[pm.player1Id]) {
            strB *= 1.05;
            strA *= 0.95;
        }

        const p_base = strA / (strA + strB);

        // ── ETAPA 4: Calibração anti-superconfiança (REFORÇADA) ──
        // Era 0.9/0.1 → puxa mais para 0.5 (20% peso na incerteza)
        const p_calibrada = p_base * 0.8 + 0.2 * 0.5;

        // ── ETAPA 5: Ajuste por progresso ──
        const p_final_base = p_calibrada * progresso + 0.5 * (1 - progresso);

        const vol = (volatility[pm.player1Id] || 0) * 0.05;

        return {
            p1: pm.player1Id,
            p2: pm.player2Id,
            p_final_base,
            vol
        };
    });

    // ── SIMULAÇÃO MONTE CARLO ──
    const chances = {};
    standings.forEach(s => { chances[s.id] = 0; });

    for (let i = 0; i < SIMULATIONS; i++) {
        // Estado simulado: pontos + vitórias + derrotas (para desempates corretos)
        const simPoints = {};
        const simWins = {};
        const simLosses = {};
        standings.forEach(s => {
            simPoints[s.id] = s.points;
            simWins[s.id] = s.wins || 0;
            simLosses[s.id] = s.losses || 0;
        });

        pendingMatchesData.forEach(pm => {
            let p_final = Math.max(0.02, Math.min(0.98, pm.p_final_base + (Math.random() - 0.5) * pm.vol));

            const winner = Math.random() < p_final ? pm.p1 : pm.p2;
            const loser = winner === pm.p1 ? pm.p2 : pm.p1;
            simPoints[winner] += ptsWin;
            simPoints[loser] += ptsLoss;
            simWins[winner] += 1;
            simLosses[loser] += 1;
        });

        // ── ETAPA 7: Ranking com desempates corretos ──
        // Critérios: pontos → mais vitórias → menos derrotas
        const simResult = standings
            .map(s => ({
                id: s.id,
                pts: simPoints[s.id],
                w: simWins[s.id],
                l: simLosses[s.id]
            }))
            .sort((a, b) => {
                if (b.pts !== a.pts) return b.pts - a.pts;
                if (b.w !== a.w) return b.w - a.w;
                return a.l - b.l;
            });

        // Registrar Top 5
        for (let rank = 0; rank < 5 && rank < simResult.length; rank++) {
            chances[simResult[rank].id]++;
        }
    }

    // ── ETAPA 8: Converter contagens em percentuais ──
    Object.keys(chances).forEach(id => {
        chances[id] = Math.round((chances[id] / SIMULATIONS) * 100);
    });

    // ── ETAPA 9: Floor matemático ──
    // Se chance virou 0% mas o jogador AINDA pode matematicamente classificar,
    // mostra 1% para sinalizar que existe caminho (não é impossível, é improvável).
    standings.forEach(s => {
        if (chances[s.id] === 0 && canMathematicallyReachTop5(s, standings, pendingMatches, ptsWin)) {
            chances[s.id] = 1;
        }
    });

    return chances;
}

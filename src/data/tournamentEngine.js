// ============================================
// LigaPro Sinuca – Tournament Engine
// ============================================

// ============================================
// Shuffle Helper
// ============================================
function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ============================================
// Single Elimination (Adaptive Bracket)
// ============================================
export function generateEliminationBracket(selectiveId, playerIds) {
    const shuffled = shuffle(playerIds);
    const n = shuffled.length;
    if (n === 0) return { matches: [], totalRounds: 0, bracketSize: 0 };

    const allMatches = [];

    // We don't pad to a power of 2 anymore. 
    // Round 1 takes all players. 
    // Real matches: Math.floor(n / 2)
    // If n is odd, 1 player gets a BYE in Round 1.
    const numFirstRoundMatches = Math.floor(n / 2);
    const hasOddBye = n % 2 !== 0;

    // Calculate total rounds dynamically based on how winners halve
    let totalRounds = 1;
    let currentPlayers = n;
    while (currentPlayers > 1) {
        currentPlayers = Math.ceil(currentPlayers / 2);
        if (currentPlayers > 1) totalRounds++;
    }

    // ── Round 1 ──
    const round1Matches = [];
    let playerIndex = 0;
    let bracketPos = 0;

    // Real matches
    for (let i = 0; i < numFirstRoundMatches; i++) {
        const p1 = shuffled[playerIndex++];
        const p2 = shuffled[playerIndex++];
        round1Matches.push({
            selectiveId,
            round: 1,
            bracketPosition: bracketPos++,
            player1Id: p1,
            player2Id: p2,
        });
    }

    // The odd man out gets a BYE
    if (hasOddBye) {
        const p1 = shuffled[playerIndex++];
        round1Matches.push({
            selectiveId,
            round: 1,
            bracketPosition: bracketPos++,
            player1Id: p1,
            player2Id: null,      // No opponent
            status: 'completed',  // Auto-completed
            winnerId: p1,         // Advances automatically
            score1: 1,
            score2: 0,
        });
    }
    allMatches.push(...round1Matches);

    // ── Rounds 2+ ──
    let prevRoundMatches = round1Matches;

    for (let round = 2; round <= totalRounds; round++) {
        const roundMatches = [];
        const numMatchesThisRound = Math.ceil(prevRoundMatches.length / 2);
        let currentPos = 0;

        for (let i = 0; i < prevRoundMatches.length; i += 2) {
            const feederA = prevRoundMatches[i];
            const feederB = prevRoundMatches[i + 1]; // Might be undefined if prevRoundMatches.length is odd

            const p1 = feederA?.winnerId || null;
            let p2 = null;

            let status = 'pending';
            let winnerId = null;
            let expectedOpponentIsMissing = false;

            if (feederB) {
                // There is a feeder match B, if it's already completed (e.g. was a BYE in lower round), p2 gets its winner
                p2 = feederB.winnerId || null;
            } else {
                // There is NO feeder match B. This means the bracket implies a BYE in this upper round.
                // The winner of Feeder A will automatically advance.
                expectedOpponentIsMissing = true;
            }

            // If we already know both players (or one player and the other slot doesn't exist)
            if (expectedOpponentIsMissing) {
                if (p1) {
                    status = 'completed';
                    winnerId = p1;
                }
                // If p1 is not yet known, it will be auto-completed when feeder A finishes (handled in Matches.jsx logic)
            }

            const match = {
                selectiveId,
                round: round,
                bracketPosition: currentPos++,
                player1Id: p1,
                player2Id: p2,
            };

            // Pre-complete if it's a structural BYE and we already have p1 from a previous BYE
            if (expectedOpponentIsMissing && p1) {
                match.status = 'completed';
                match.winnerId = p1;
                match.score1 = 1;
                match.score2 = 0;
            }

            roundMatches.push(match);
        }
        allMatches.push(...roundMatches);
        prevRoundMatches = roundMatches;
    }

    return {
        matches: allMatches,
        totalRounds,
        bracketSize: n // Represents total players dynamically now, not padded power of 2
    };
}

// ============================================
// Round Robin (Todos contra Todos)
// ============================================
export function generateRoundRobin(selectiveId, playerIds, numRounds = 1) {
    const players = [...playerIds];
    const matches = [];

    // If odd number, add a BYE
    if (players.length % 2 !== 0) {
        players.push(null);
    }

    const n = players.length;
    const totalRoundsInCycle = n - 1;

    for (let cycle = 0; cycle < numRounds; cycle++) {
        const rotatingPlayers = [...players];

        for (let round = 0; round < totalRoundsInCycle; round++) {
            const roundNumber = cycle * totalRoundsInCycle + round + 1;

            for (let i = 0; i < n / 2; i++) {
                const p1 = rotatingPlayers[i];
                const p2 = rotatingPlayers[n - 1 - i];

                if (p1 && p2) {
                    const match = {
                        selectiveId,
                        round: roundNumber,
                        player1Id: p1,
                        player2Id: p2
                    };
                    matches.push(match);
                }
            }

            // Rotate: fix first player, rotate others
            const last = rotatingPlayers.pop();
            rotatingPlayers.splice(1, 0, last);
        }
    }

    return { matches, totalRounds: totalRoundsInCycle * numRounds };
}

// ============================================
// Swiss System
// ============================================
export function generateSwissRound(selectiveId, playerIds, rankings, roundNumber, previousMatches = []) {
    // Sort players by current score/ranking
    const sorted = [...playerIds].sort((a, b) => {
        const aRank = rankings.findIndex(r => r.id === a);
        const bRank = rankings.findIndex(r => r.id === b);
        return (aRank === -1 ? 999 : aRank) - (bRank === -1 ? 999 : bRank);
    });

    // Track previous opponents to avoid rematches
    const playedAgainst = {};
    previousMatches.forEach(m => {
        if (!playedAgainst[m.player1Id]) playedAgainst[m.player1Id] = new Set();
        if (!playedAgainst[m.player2Id]) playedAgainst[m.player2Id] = new Set();
        playedAgainst[m.player1Id].add(m.player2Id);
        playedAgainst[m.player2Id].add(m.player1Id);
    });

    const matched = new Set();
    const matches = [];

    for (let i = 0; i < sorted.length; i++) {
        if (matched.has(sorted[i])) continue;

        for (let j = i + 1; j < sorted.length; j++) {
            if (matched.has(sorted[j])) continue;

            // Avoid rematch if possible
            const prevOpps = playedAgainst[sorted[i]];
            if (prevOpps && prevOpps.has(sorted[j])) continue;

            const match = {
                selectiveId,
                round: roundNumber,
                player1Id: sorted[i],
                player2Id: sorted[j]
            };
            matches.push(match);
            matched.add(sorted[i]);
            matched.add(sorted[j]);
            break;
        }
    }

    // Handle any remaining unmatched players (pair them even if rematch)
    const unmatched = sorted.filter(id => !matched.has(id));
    for (let i = 0; i < unmatched.length - 1; i += 2) {
        const match = {
            selectiveId,
            round: roundNumber,
            player1Id: unmatched[i],
            player2Id: unmatched[i + 1]
        };
        matches.push(match);
    }

    return { matches };
}

// ============================================
// Generate Matches for Selective
// ============================================
export function generateMatchesForSelective(selective) {
    const { id, mode, playerIds, config } = selective;

    switch (mode) {
        case 'elimination':
            return generateEliminationBracket(id, playerIds);

        case 'round-robin':
            return generateRoundRobin(id, playerIds, config?.rounds || 1);

        case 'swiss':
            // Swiss generates one round at a time
            return generateSwissRound(id, playerIds, [], 1);

        default:
            return { matches: [] };
    }
}

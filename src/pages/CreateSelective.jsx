import React, { useState, useEffect } from 'react';
import { getPlayers, createSelective, getSelectives, createMatch } from '../data/db.js';
import { generateMatchesForSelective } from '../data/tournamentEngine.js';
import { useNavigate } from 'react-router-dom';
import { Zap, Check, Trophy, Flag } from 'lucide-react';

// Event type selector removed. Event defaults to 'seletiva'.

const MODES = [
    {
        id: 'elimination',
        icon: '🏆',
        title: 'Eliminatória',
        desc: 'Quem perde, está fora. Último em pé vence.',
    },
    {
        id: 'round-robin',
        icon: '🔄',
        title: 'Todos contra Todos',
        desc: 'Cada jogador enfrenta todos os demais.',
    },
    {
        id: 'swiss',
        icon: '🧠',
        title: 'Sistema Suíço',
        desc: 'Pares por ranking. Evita rematches.',
    },
];

export default function CreateSelective() {
    const navigate = useNavigate();
    const [players, setPlayers] = useState([]);
    const [eventType] = useState('seletiva');
    const [mode, setMode] = useState('round-robin');
    const [name, setName] = useState('');
    const [selectedPlayers, setSelectedPlayers] = useState([]);
    const [config, setConfig] = useState({
        rounds: 1,
        pointsPerWin: 3,
        pointsPerLoss: 0,
        tiebreaker: 'head-to-head',
    });
    const [created, setCreated] = useState(false);

    useEffect(() => {
        async function init() {
            const p = await getPlayers();
            setPlayers(p);
            const s = await getSelectives();
            setName(`Seletiva #${s.length + 1}`);
        }
        init();
    }, []);

    // handleEventTypeChange removed.
    function togglePlayer(id) {
        setSelectedPlayers(prev =>
            prev.includes(id)
                ? prev.filter(pid => pid !== id)
                : [...prev, id]
        );
    }

    function selectAll() {
        if (selectedPlayers.length === players.length) {
            setSelectedPlayers([]);
        } else {
            setSelectedPlayers(players.map(p => p.id));
        }
    }

    async function handleGenerate() {
        if (selectedPlayers.length < 2) {
            alert('Selecione pelo menos 2 jogadores!');
            return;
        }
        if (!name.trim()) {
            alert('Dê um nome à seletiva!');
            return;
        }

        const selective = await createSelective({
            name,
            mode,
            eventType,
            playerIds: selectedPlayers,
            config,
        });

        const { matches } = generateMatchesForSelective(selective);
        for (const match of matches) {
            await createMatch(match);
        }

        setCreated(true);

        setTimeout(() => {
            navigate('/confrontos');
        }, 1200);
    }

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Novo Evento</h1>
                    <p className="page-subtitle">Configure e gere os confrontos automaticamente</p>
                </div>
            </div>

            {created ? (
                <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--green-400)' }}>
                        Seletiva Criada!
                    </h2>
                    <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
                        Redirecionando para os confrontos...
                    </p>
                </div>
            ) : (
                <>
                    {/* Event Type selector removed */}
                    {/* Name */}
                    <div className="card" style={{ marginBottom: 20 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Nome do Evento</label>
                            <input
                                className="form-input"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Ex: Seletiva Janeiro 2026"
                            />
                        </div>
                    </div>

                    {/* Mode Selector */}
                    <div className="card" style={{ marginBottom: 20 }}>
                        <h3 className="card-title" style={{ marginBottom: 16 }}>Modo de Torneio</h3>
                        <div className="mode-selector">
                            {MODES.map(m => (
                                <div
                                    key={m.id}
                                    className={`mode-option ${mode === m.id ? 'selected' : ''}`}
                                    onClick={() => setMode(m.id)}
                                >
                                    <div className="mode-option-icon">{m.icon}</div>
                                    <div className="mode-option-title">{m.title}</div>
                                    <div className="mode-option-desc">{m.desc}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Config */}
                    <div className="card" style={{ marginBottom: 20 }}>
                        <h3 className="card-title" style={{ marginBottom: 16 }}>Configurações</h3>
                        <div className="form-row">
                            {mode === 'round-robin' && (
                                <div className="form-group">
                                    <label className="form-label">Número de Rodadas (Turnos)</label>
                                    <input
                                        className="form-input"
                                        type="number"
                                        min={1}
                                        max={5}
                                        value={config.rounds}
                                        onChange={e => setConfig({ ...config, rounds: parseInt(e.target.value) || 1 })}
                                    />
                                </div>
                            )}
                            <div className="form-group">
                                <label className="form-label">Pontos por Vitória</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    min={0}
                                    value={config.pointsPerWin}
                                    onChange={e => setConfig({ ...config, pointsPerWin: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Pontos por Derrota</label>
                                <input
                                    className="form-input"
                                    type="number"
                                    min={0}
                                    value={config.pointsPerLoss}
                                    onChange={e => setConfig({ ...config, pointsPerLoss: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Critério de Desempate</label>
                                <select
                                    className="form-select"
                                    value={config.tiebreaker}
                                    onChange={e => setConfig({ ...config, tiebreaker: e.target.value })}
                                >
                                    <option value="head-to-head">Confronto Direto</option>
                                    <option value="win-rate">Aproveitamento</option>
                                    <option value="wins">Mais Vitórias</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Player Selection */}
                    <div className="card" style={{ marginBottom: 20 }}>
                        <div className="card-header">
                            <h3 className="card-title">Selecionar Jogadores</h3>
                            <button className="btn btn-secondary btn-sm" onClick={selectAll}>
                                {selectedPlayers.length === players.length ? 'Desmarcar Todos' : 'Selecionar Todos'}
                            </button>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
                            {selectedPlayers.length} de {players.length} selecionados
                        </div>
                        {players.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                                {players.map(player => (
                                    <label key={player.id} className="form-checkbox">
                                        <input
                                            type="checkbox"
                                            checked={selectedPlayers.includes(player.id)}
                                            onChange={() => togglePlayer(player.id)}
                                        />
                                        <span style={{ fontWeight: 500 }}>{player.name}</span>
                                        {player.nickname && (
                                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>({player.nickname})</span>
                                        )}
                                    </label>
                                ))}
                            </div>
                        ) : (
                            <div className="empty-state">
                                <div className="empty-state-desc">Nenhum jogador cadastrado. Vá para a página de Jogadores primeiro.</div>
                            </div>
                        )}
                    </div>

                    {/* Generate Button */}
                    <button
                        className="btn btn-gold btn-lg btn-block"
                        onClick={handleGenerate}
                        disabled={selectedPlayers.length < 2}
                        style={{ opacity: selectedPlayers.length < 2 ? 0.5 : 1 }}
                    >
                        <Zap size={20} /> Gerar Confrontos Automaticamente
                    </button>
                </>
            )}
        </div>
    );
}

import React, { useState, useEffect } from 'react';
import { createSelective, getSelectives } from '../data/db.js';
import { useNavigate } from 'react-router-dom';
import { Zap, Check } from 'lucide-react';

export default function CreateEtapa() {
    const navigate = useNavigate();
    const [name, setName] = useState('');
    const [created, setCreated] = useState(false);

    useEffect(() => {
        // Default name
        const count = getSelectives().filter(s => s.eventType === 'etapa').length + 1;
        setName(`Etapa #${count}`);
    }, []);

    function handleGenerate() {
        if (!name.trim()) {
            alert('Dê um nome à Etapa!');
            return;
        }

        const selective = createSelective({
            name,
            mode: 'team-vs-team', // Or similar dummy identifier since matches are manual
            eventType: 'etapa',
            playerIds: [], // Players are selected per confrontation wizard
            config: {}, // Assuming points logic is external in Etapas mode
            teamConfronts: [] // Starts empty
        });

        setCreated(true);

        setTimeout(() => {
            navigate('/etapas');
        }, 1200);
    }

    return (
        <div className="animate-fade-in">
            <div className="page-header">
                <div>
                    <h1 className="page-title">Nova Etapa Oficial</h1>
                    <p className="page-subtitle">Configure o evento contra equipes externas</p>
                </div>
            </div>

            {created ? (
                <div className="card" style={{ textAlign: 'center', padding: 48 }}>
                    <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
                    <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--green-400)' }}>
                        Etapa Criada!
                    </h2>
                    <p style={{ color: 'var(--text-muted)', marginTop: 8 }}>
                        Redirecionando para os confrontos...
                    </p>
                </div>
            ) : (
                <>
                    {/* Name */}
                    <div className="card" style={{ marginBottom: 20 }}>
                        <div className="form-group" style={{ marginBottom: 0 }}>
                            <label className="form-label">Nome da Etapa</label>
                            <input
                                className="form-input"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="Ex: Etapa Janeiro 2026"
                            />
                        </div>
                    </div>

                    <div className="card" style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                            <div style={{ fontSize: 24 }}>🏆</div>
                            <div>
                                <h3 className="card-title" style={{ marginBottom: 8 }}>Sobre Etapas</h3>
                                <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                    As etapas são eventos onde a sua equipe disputa contra outras num formato de confrontos iterativos 5 contra 5.
                                </p>
                                <ul style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12, paddingLeft: 20 }}>
                                    <li>Múltiplos confrontos podem ser adicionados dentro da Etapa.</li>
                                    <li>Um confronto se encerra quando uma equipe alcança 3 vitórias.</li>
                                    <li>Sua equipe é eliminada ao acumular 2 derrotas.</li>
                                    <li>As vitórias individuais contam para o Ranking.</li>
                                </ul>
                            </div>
                        </div>
                    </div>

                    {/* Generate Button */}
                    <button
                        className="btn btn-gold btn-lg btn-block"
                        onClick={handleGenerate}
                    >
                        <Zap size={20} /> Iniciar Etapa
                    </button>

                    <button
                        className="btn btn-secondary btn-lg btn-block"
                        style={{ marginTop: 12 }}
                        onClick={() => navigate(-1)}
                    >
                        Cancelar
                    </button>
                </>
            )}
        </div>
    );
}

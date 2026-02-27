import React from 'react';
import { HelpCircle, XCircle } from 'lucide-react';

export default function TiebreakerHelpModal({ isOpen, onClose, isElo = false }) {
    if (!isOpen) return null;

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 500 }}>
                <div className="modal-header">
                    <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green-400)' }}>
                        <HelpCircle size={20} /> Como funciona o Ranking?
                    </h3>
                    <button className="modal-close" onClick={onClose}>
                        <XCircle size={20} />
                    </button>
                </div>
                <div className="modal-body" style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {isElo ? (
                        <>
                            <p style={{ marginBottom: 16 }}><strong>Sistema Rating ELO internacional.</strong></p>
                            <p>Vitórias rendem ELO (máximo de +32), mas o quanto você ganha depende da força do adversário.</p>
                            <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                                <li>Derrotar um líder rende <strong>muito ELO</strong>!</li>
                                <li>Perder para um novato tira <strong>muito ELO</strong>!</li>
                                <li>Vencer alguém com pontuação parecida rende um valor médio.</li>
                            </ul>
                        </>
                    ) : (
                        <>
                            <p style={{ marginBottom: 12 }}>A classificação é definida com base na seguinte <strong>ordem de critérios de desempate</strong>:</p>
                            <ol style={{ paddingLeft: 20, color: 'var(--text-primary)' }}>
                                <li style={{ marginBottom: 8 }}><strong>Mais Pontos</strong><br /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Vitória vale 3 pontos, derrota vale 0. É o critério principal.</span></li>
                                <li style={{ marginBottom: 8 }}><strong>Confronto Direto</strong><br /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Se dois jogadores empatarem em pontos, quem venceu quem leva a vantagem.</span></li>
                                <li style={{ marginBottom: 8 }}><strong>Qualidade de Vitórias (Sonneborn-Berger)</strong><br /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Desempata 3 ou mais jogadores. Soma os pontos de todos os oponentes que o jogador derrotou. Vencer oponentes mais "fortes" dá vantagem.</span></li>
                                <li style={{ marginBottom: 8 }}><strong>Mais Vitórias</strong><br /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Quem tiver mais vitórias totais fica na frente.</span></li>
                                <li><strong>Menos Derrotas</strong><br /><span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Em cenários raros onde até a quantidade de vitórias empata, quem perdeu menos assume a liderança.</span></li>
                            </ol>
                        </>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="btn btn-primary" onClick={onClose} style={{ width: '100%' }}>
                        Entendi
                    </button>
                </div>
            </div>
        </div>
    );
}

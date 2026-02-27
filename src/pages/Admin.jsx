import React, { useState } from 'react';
import { Shield, ShieldAlert, ShieldCheck, LogOut } from 'lucide-react';
import { useAdmin } from '../contexts/AdminContext.jsx';

export default function Admin() {
    const { isAdmin, login, logout } = useAdmin();
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = (e) => {
        e.preventDefault();
        setError('');

        const success = login(password);
        if (success) {
            setPassword('');
        } else {
            setError('Senha incorreta.');
        }
    };

    return (
        <div style={{ padding: '20px', maxWidth: '400px', margin: '0 auto' }}>
            <div className="card" style={{ textAlign: 'center' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', marginBottom: '20px', color: 'var(--text-color)' }}>
                    Administração {isAdmin ? <ShieldCheck color="var(--success-color)" /> : <ShieldAlert color="var(--danger-color)" />}
                </h2>

                {isAdmin ? (
                    <div>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
                            Você está no Modo Administrador. A edição de dados está liberada em todo o sistema.
                        </p>
                        <button className="btn btn-danger" onClick={logout} style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                            <LogOut size={20} />
                            Sair do Modo Admin
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleLogin}>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
                            Digite a senha para liberar a edição de dados no sistema.Visitantes comuns não precisam fazer login.
                        </p>
                        <div className="input-field">
                            <input
                                type="password"
                                placeholder="Senha de Administrador"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '12px',
                                    borderRadius: '8px',
                                    border: '1px solid var(--border-color)',
                                    backgroundColor: 'var(--bg-color)',
                                    color: 'var(--text-color)',
                                    marginBottom: '10px'
                                }}
                            />
                        </div>
                        {error && <p style={{ color: 'var(--danger-color)', marginBottom: '10px', fontSize: '14px' }}>{error}</p>}
                        <button type="submit" className="btn btn-primary" style={{ width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                            <Shield size={20} />
                            Entrar
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
}

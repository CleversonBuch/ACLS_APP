import React, { createContext, useContext, useState, useEffect } from 'react';

const AdminContext = createContext();

export function AdminProvider({ children }) {
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('acls_is_admin');
        if (stored === 'true') {
            setIsAdmin(true);
        }
    }, []);

    const login = (password) => {
        // Password check (defined in .env or hardcoded temporarily if needed)
        const correctPassword = import.meta.env.VITE_ADMIN_PASSWORD || '2580';

        if (password === correctPassword) {
            setIsAdmin(true);
            localStorage.setItem('acls_is_admin', 'true');
            return true;
        }
        return false;
    };

    const logout = () => {
        setIsAdmin(false);
        localStorage.removeItem('acls_is_admin');
    };

    return (
        <AdminContext.Provider value={{ isAdmin, login, logout }}>
            {children}
        </AdminContext.Provider>
    );
}

export function useAdmin() {
    return useContext(AdminContext);
}

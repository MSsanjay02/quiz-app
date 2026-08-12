import { createContext, useContext, useState, ReactNode } from "react";

type Admin = { id: string; email: string; name?: string | null };

type AuthCtx = {
  admin: Admin | null;
  token: string | null;
  login: (token: string, admin: Admin) => void;
  logout: () => void;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(localStorage.getItem("qb_admin_token"));
  const [admin, setAdmin] = useState<Admin | null>(() => {
    const raw = localStorage.getItem("qb_admin");
    return raw ? JSON.parse(raw) : null;
  });

  function login(newToken: string, newAdmin: Admin) {
    localStorage.setItem("qb_admin_token", newToken);
    localStorage.setItem("qb_admin", JSON.stringify(newAdmin));
    setToken(newToken);
    setAdmin(newAdmin);
  }

  function logout() {
    localStorage.removeItem("qb_admin_token");
    localStorage.removeItem("qb_admin");
    setToken(null);
    setAdmin(null);
  }

  return <Ctx.Provider value={{ admin, token, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

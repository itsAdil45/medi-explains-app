import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearToken, setToken } from "./client";

type User = Record<string, any> | null;
type Session = { access_token: string; user: NonNullable<User> };

type AuthContextValue = {
  user: User;
  loading: boolean;
  login: (email: string, password: string) => Promise<NonNullable<User>>;
  logout: () => void;
  setUser: (u: User) => void;
  applySession: (t: Session) => Promise<NonNullable<User>>;
};

const AuthCtx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  // Shared by every login path (password, phone-call OTP, ...) - each just
  // needs to obtain a Token the normal way and hand it here.
  // Async here (unlike the web version) because setToken now writes to
  // AsyncStorage instead of localStorage - see client.ts.
  async function applySession(t: Session) {
    await setToken(t.access_token);
    setUser(t.user);
    return t.user;
  }

  async function login(email: string, password: string) {
    return applySession(await api.login(email, password));
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthCtx.Provider value={{ user, loading, login, logout, setUser, applySession }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};

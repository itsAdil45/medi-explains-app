import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  api,
  clearToken,
  loadActiveClinicId,
  setActiveClinicId,
  setToken,
} from "./client";

type User = Record<string, any> | null;
type Clinic = Record<string, any>;
type Session = { access_token: string; user: NonNullable<User> };

type AuthContextValue = {
  user: User;
  loading: boolean;
  login: (email: string, password: string) => Promise<NonNullable<User>>;
  logout: () => void;
  setUser: (u: User) => void;
  applySession: (t: Session) => Promise<NonNullable<User>>;
  clinics: Clinic[];
  activeClinic: Clinic | null;
  activeClinicId: string | null;
  clinicsReady: boolean;
  switchClinic: (id: string | number | null) => void;
  refreshClinics: () => Promise<void>;
};

const AuthCtx = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(null);
  const [loading, setLoading] = useState(true);
  // Staff only: the clinics they work at (admins: every clinic in the
  // organization) and the one they're working in right now. Patients pick a
  // clinic per booking instead, so they never get an active clinic.
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [activeClinicId, setActive] = useState<string | null>(null);
  const [clinicsReady, setClinicsReady] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => clearToken())
      .finally(() => setLoading(false));
  }, []);

  const refreshClinics = useCallback(async () => {
    if (!user) {
      // Also runs on startup before /users/me has answered - leave the
      // saved clinic alone (logout clears it), or every launch would reset
      // the switcher to the first clinic.
      setClinics([]);
      setClinicsReady(true);
      return;
    }
    if (user.role === "patient") {
      setClinics([]);
      setActiveClinicId(null);
      setActive(null);
      setClinicsReady(true);
      return;
    }
    try {
      const list = (await api.listClinics()) as Clinic[];
      setClinics(list);
      const usable = list.filter((c) => c.is_active);
      // AsyncStorage is async, so read the saved id here instead of in useState.
      const stored = await loadActiveClinicId();
      const pick = usable.find((c) => String(c.id) === stored) || usable[0];
      const id = pick ? String(pick.id) : null;
      setActiveClinicId(id);
      setActive(id);
    } catch {
      setClinics([]);
    } finally {
      setClinicsReady(true);
    }
  }, [user]);

  useEffect(() => {
    setClinicsReady(false);
    refreshClinics();
  }, [user?.id, refreshClinics]);

  function switchClinic(id: string | number | null) {
    setActiveClinicId(id == null ? null : String(id));
    setActive(id ? String(id) : null);
  }

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
    setClinics([]);
    setActive(null);
  }

  const activeClinic =
    clinics.find((c) => String(c.id) === activeClinicId) || null;

  return (
    <AuthCtx.Provider
      value={{
        user,
        loading,
        login,
        logout,
        setUser,
        applySession,
        clinics,
        activeClinic,
        activeClinicId,
        clinicsReady,
        switchClinic,
        refreshClinics,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};

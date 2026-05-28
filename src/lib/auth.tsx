import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "gerente" | "funcionario";

interface AuthState {
  session: Session | null;
  user: User | null;
  role: AppRole | null;
  empresaId: string | null;
  nome: string;
  loading: boolean;
  profileLoaded: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [nome, setNome] = useState("");
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const lastLoadedUid = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async (uid: string) => {
      if (lastLoadedUid.current === uid) return;
      lastLoadedUid.current = uid;
      try {
        const [{ data: profile }, { data: roles }] = await Promise.all([
          supabase.from("profiles").select("nome, empresa_id").eq("id", uid).maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", uid),
        ]);
        if (cancelled) return;
        setNome(profile?.nome ?? "");
        setEmpresaId(profile?.empresa_id ?? null);
        const r = roles?.[0]?.role as AppRole | undefined;
        setRole(r ?? null);
      } catch (e) {
        console.error("loadProfile error", e);
      }
    };

    // Set up listener FIRST (sync state updates only)
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        // defer DB read to avoid deadlock inside callback
        setTimeout(() => { void loadProfile(s.user.id); }, 0);
      } else {
        lastLoadedUid.current = null;
        setRole(null);
        setEmpresaId(null);
        setNome("");
      }
    });

    // Then restore existing session — don't block loading on profile fetch
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (cancelled) return;
      setSession(s);
      if (s?.user) {
        void loadProfile(s.user.id);
      }
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });

    // Safety net: never stay loading more than 4s
    const safety = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 4000);

    return () => {
      cancelled = true;
      clearTimeout(safety);
      sub.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, role, empresaId, nome, loading, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

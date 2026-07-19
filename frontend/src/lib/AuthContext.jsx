import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from './supabaseClient';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const sessionRef = useRef(null);
  const isMountedRef = useRef(true);

  const loadProfile = useCallback(async (currentSession) => {
    if (!currentSession) {
      if (isMountedRef.current) {
        setProfile(null);
        setLoading(false);
      }
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', currentSession.user.id)
      .single();
    if (isMountedRef.current) {
      setProfile(data ?? null);
      setLoading(false);
    }
  }, []);

  // A component that writes to its own profiles row directly (e.g. a
  // Settings page's "Save Profile") does so completely outside this
  // context, so without an explicit re-fetch the in-memory `profile` object
  // stays stale until the next real auth event or a hard reload -- even
  // though the write itself succeeded. That looked exactly like "my change
  // didn't save" the moment someone navigated away and back. Settings pages
  // call this after a successful save so the rest of the app picks up the
  // new value immediately.
  const refreshProfile = useCallback(() => loadProfile(sessionRef.current), [loadProfile]);

  useEffect(() => {
    isMountedRef.current = true;

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      sessionRef.current = currentSession;
      setSession(currentSession);
      loadProfile(currentSession);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, currentSession) => {
      sessionRef.current = currentSession;
      setSession(currentSession);

      // A silent background token refresh (fired automatically by Supabase,
      // including right when a backgrounded tab regains focus) isn't an
      // identity change -- treating it like one flips `loading` true, which
      // makes ProtectedRoute swap <Outlet/> for a spinner and unmount the
      // entire authenticated subtree, wiping every page's state (an active
      // Jitsi call included) for no reason. Only real identity transitions
      // need the full reload treatment.
      if (event === 'TOKEN_REFRESHED') return;

      setLoading(true);
      loadProfile(currentSession);
    });

    return () => {
      isMountedRef.current = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile]);

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

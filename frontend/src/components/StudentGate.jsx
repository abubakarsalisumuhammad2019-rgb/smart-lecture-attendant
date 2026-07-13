import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';

// Students must finish onboarding (course enrollment + face enrollment)
// before reaching the normal student area.
export function StudentGate() {
  const { profile } = useAuth();

  if (!profile.onboarding_complete) {
    return <Navigate to="/student/onboarding" replace />;
  }

  return <Outlet />;
}

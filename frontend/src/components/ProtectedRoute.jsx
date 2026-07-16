import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { PageLoader } from './PageLoader';

const HOME_BY_ROLE = { admin: '/dashboard', lecturer: '/lecturer', student: '/student' };

export function ProtectedRoute({ allowedRoles }) {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return <PageLoader label="" />;
  }

  if (!session || !profile) {
    return <Navigate to="/Signin" replace />;
  }

  if (profile.status === 'suspended') {
    return <Navigate to="/Signin" replace />;
  }

  if (profile.status === 'pending') {
    return <Navigate to="/pending-approval" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return <Navigate to={HOME_BY_ROLE[profile.role] ?? '/'} replace />;
  }

  return <Outlet />;
}

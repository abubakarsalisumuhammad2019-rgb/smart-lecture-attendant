import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import { AuthProvider } from './lib/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminLayout } from './components/AdminLayout';
import { LecturerLayout } from './components/LecturerLayout';
import Front from './frontpage';
import Dashboard from './dashboard';
import Addstudent from './Addstudent';
import Enrolled from './Enrolled';
import Signin from './signin';
import PendingApproval from './pages/PendingApproval';
import Lectures from './admin/Lectures';
import LectureImport from './admin/LectureImport';
import Courses from './admin/Courses';
import Users from './admin/Users';
import SemesterSettings from './admin/SemesterSettings';
import LecturerDashboard from './lecturer/Dashboard';
import LectureRoster from './lecturer/LectureRoster';
import MyCourses from './lecturer/MyCourses';
import LecturerSettings from './lecturer/LecturerSettings';

function ComingSoon({ label }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-split p-4">
      <div className="bg-white rounded-2xl shadow-md p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">{label}</h1>
        <p className="text-sm text-gray-600">This part of the app is coming in a later phase.</p>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Navigate to="/Signin" replace />} />
          <Route path="/kiosk" element={<Front />} />
          <Route path="/Signin" element={<Signin />} />
          <Route path="/pending-approval" element={<PendingApproval />} />

          {/* Admin */}
          <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
            <Route element={<AdminLayout />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/Addstudent" element={<Addstudent />} />
              <Route path="/Enrolled" element={<Enrolled />} />
              <Route path="/admin" element={<Navigate to="/admin/lectures" replace />} />
              <Route path="/admin/lectures" element={<Lectures />} />
              <Route path="/admin/lectures/import" element={<LectureImport />} />
              <Route path="/admin/courses" element={<Courses />} />
              <Route path="/admin/users" element={<Users />} />
              <Route path="/admin/settings" element={<SemesterSettings />} />
            </Route>
          </Route>

          {/* Lecturer */}
          <Route element={<ProtectedRoute allowedRoles={['lecturer']} />}>
            <Route element={<LecturerLayout />}>
              <Route path="/lecturer" element={<Navigate to="/lecturer/dashboard" replace />} />
              <Route path="/lecturer/dashboard" element={<LecturerDashboard />} />
              <Route path="/lecturer/lectures/:lectureId/roster" element={<LectureRoster />} />
              <Route path="/lecturer/courses" element={<MyCourses />} />
              <Route path="/lecturer/settings" element={<LecturerSettings />} />
            </Route>
          </Route>

          {/* Student (Phase 3) */}
          <Route element={<ProtectedRoute allowedRoles={['student']} />}>
            <Route path="/student" element={<ComingSoon label="Student Panel" />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;

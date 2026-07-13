import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';
import { AuthProvider } from './lib/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminLayout } from './components/AdminLayout';
import { LecturerLayout } from './components/LecturerLayout';
import { StudentLayout } from './components/StudentLayout';
import { StudentGate } from './components/StudentGate';
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
import LecturerMyCourses from './lecturer/MyCourses';
import LecturerSettings from './lecturer/LecturerSettings';
import StudentOnboarding from './student/Onboarding';
import StudentDashboard from './student/Dashboard';
import StudentMyCourses from './student/MyCourses';
import StudentSettings from './student/Settings';
import JoinLecture from './student/JoinLecture';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public */}
          <Route path="/" element={<Navigate to="/Signin" replace />} />
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
              <Route path="/lecturer/courses" element={<LecturerMyCourses />} />
              <Route path="/lecturer/settings" element={<LecturerSettings />} />
            </Route>
          </Route>

          {/* Student */}
          <Route element={<ProtectedRoute allowedRoles={['student']} />}>
            <Route path="/student/onboarding" element={<StudentOnboarding />} />
            <Route element={<StudentGate />}>
              <Route element={<StudentLayout />}>
                <Route path="/student" element={<Navigate to="/student/dashboard" replace />} />
                <Route path="/student/dashboard" element={<StudentDashboard />} />
                <Route path="/student/courses" element={<StudentMyCourses />} />
                <Route path="/student/settings" element={<StudentSettings />} />
                <Route path="/student/lectures/:lectureId/join" element={<JoinLecture />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;

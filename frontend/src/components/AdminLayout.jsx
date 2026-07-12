import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { FaHome, FaFileAlt, FaUser, FaBook, FaLayerGroup, FaUsers, FaCog } from 'react-icons/fa';
import { Sidebar } from './Sidebar';

const items = [
  { to: '/dashboard', icon: FaHome, label: 'Home', iconClass: 'text-purple-600' },
  { to: '/Addstudent', icon: FaUser, label: 'Enroll Face', iconClass: 'text-black' },
  { to: '/Enrolled', icon: FaFileAlt, label: 'Enrolled', iconClass: 'text-red-500' },
  { to: '/admin/lectures', icon: FaBook, label: 'Lectures', iconClass: 'text-indigo-600' },
  { to: '/admin/courses', icon: FaLayerGroup, label: 'Courses', iconClass: 'text-teal-600' },
  { to: '/admin/users', icon: FaUsers, label: 'Users', iconClass: 'text-orange-500' },
  { to: '/admin/settings', icon: FaCog, label: 'Settings', iconClass: 'text-gray-500' },
];

export function AdminLayout() {
  const location = useLocation();

  return (
    <div className="min-h-screen p-4 bg-split">
      <div className="flex flex-col lg:flex-row gap-6">
        <Sidebar title="Admin Page" items={items} />
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { FaBars, FaHome, FaLayerGroup, FaCog } from 'react-icons/fa';
import { Sidebar } from './Sidebar';

const items = [
  { to: '/student/dashboard', icon: FaHome, label: 'Dashboard', iconClass: 'text-purple-600' },
  { to: '/student/courses', icon: FaLayerGroup, label: 'My Courses', iconClass: 'text-teal-600' },
  { to: '/student/settings', icon: FaCog, label: 'Settings', iconClass: 'text-gray-500' },
];

export function StudentLayout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen p-4 bg-split">
      <div className="lg:hidden flex items-center justify-between mb-4">
        <button
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          className="p-2.5 rounded-xl bg-white shadow-md text-gray-700"
        >
          <FaBars size={18} />
        </button>
        <span className="text-white font-semibold">Student Page</span>
        <span className="w-9" />
      </div>
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        <Sidebar
          title="Student Page"
          items={items}
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
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

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import { FaDownload } from 'react-icons/fa';
import { supabase } from '../lib/supabaseClient';

export function Sidebar({ title, items }) {
  const location = useLocation();

  return (
    <div className="w-full lg:w-64 bg-white shadow-lg rounded-2xl p-4 flex flex-col justify-between min-h-[90vh]">
      <div>
        <h2 className="text-xl font-semibold text-center mb-6">{title}</h2>
        <div className="flex flex-col gap-2">
          {items.map(({ to, icon: Icon, label, iconClass }) => {
            const isActive = location.pathname.toLowerCase() === to.toLowerCase();
            return (
              <Link key={to} to={to}>
                <motion.button
                  whileHover={{ x: 3 }}
                  whileTap={{ scale: 0.98 }}
                  className={`flex items-center space-x-2 w-full text-left py-2 px-4 rounded-xl transition-colors duration-150 ${
                    isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-100'
                  }`}
                >
                  <Icon className={isActive ? 'text-blue-600' : iconClass} />
                  <span>{label}</span>
                </motion.button>
              </Link>
            );
          })}
        </div>
      </div>
      <Link to="/Signin">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => supabase.auth.signOut()}
          className="w-full py-2 rounded-xl bg-[#1E2A78] text-white shadow-md flex items-center justify-center space-x-2 hover:bg-[#16239D] transition-colors duration-150"
        >
          <FaDownload />
          <span>LogOut</span>
        </motion.button>
      </Link>
    </div>
  );
}

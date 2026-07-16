import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { FaDownload, FaTimes } from 'react-icons/fa';
import { supabase } from '../lib/supabaseClient';

// On desktop this renders as a normal in-flow column. Below the lg breakpoint
// it becomes a fixed slide-in drawer (~half the viewport width, capped so it
// doesn't get absurdly wide on tablets) with a backdrop that closes it on
// click -- isOpen/onClose are lifted to the parent Layout so a menu-bar
// button rendered above the flex row can toggle the same drawer.
export function Sidebar({ title, items, isOpen, onClose }) {
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    onClose?.();
    // Only re-run when the route actually changes -- onClose is a fresh
    // arrow function each render and isn't a real dependency here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const handleLogout = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    window.location.href = '/Signin';
  };

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
          />
        )}
      </AnimatePresence>

      <div
        className={`fixed inset-y-0 left-0 z-50 w-full sm:w-1/2 max-w-xs overflow-y-auto bg-white shadow-lg p-4 flex flex-col justify-between transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:static lg:z-auto lg:w-64 lg:max-w-none lg:translate-x-0 lg:rounded-2xl lg:shadow-lg lg:min-h-[90vh]`}
      >
        <div>
          <div className="flex items-center justify-between mb-6 lg:justify-center lg:relative">
            <h2 className="text-xl font-semibold">{title}</h2>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="lg:hidden p-1 text-gray-400 hover:text-gray-600"
            >
              <FaTimes size={18} />
            </button>
          </div>
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
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleLogout}
          disabled={signingOut}
          className="w-full py-2 rounded-xl bg-[#1E2A78] text-white shadow-md flex items-center justify-center space-x-2 hover:bg-[#16239D] transition-colors duration-150 disabled:opacity-50"
        >
          <FaDownload />
          <span>{signingOut ? 'Logging out…' : 'LogOut'}</span>
        </motion.button>
      </div>
    </>
  );
}

import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabaseClient';

const KEYS = ['active_academic_session', 'active_semester', 'facilitation_start', 'facilitation_end'];

export default function SemesterSettings() {
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('app_settings').select('*');
      const map = Object.fromEntries((data || []).map((row) => [row.key, row.value]));
      setValues(map);
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    for (const key of KEYS) {
      const { error } = await supabase.from('app_settings').update({ value: values[key] ?? '' }).eq('key', key);
      if (error) {
        setMessage(error.message);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    setMessage('Settings saved.');
  };

  if (loading) {
    return <p className="text-white">Loading…</p>;
  }

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <p>Pages / Settings</p>
          <h1 className="text-lg font-semibold">Semester Settings</h1>
        </div>
      </div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 text-blue-700 text-sm rounded-xl px-4 py-2 mb-4"
        >
          {message}
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="bg-white rounded-[1.1rem] shadow-md p-4 sm:p-6 w-full"
      >
        <h2 className="text-gray-900 font-semibold mb-4">Active Session</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Active Academic Session</label>
            <input
              value={values.active_academic_session || ''}
              onChange={(e) => setValues({ ...values, active_academic_session: e.target.value })}
              className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full"
              placeholder="e.g. 2025_2026"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Active Semester</label>
            <input
              value={values.active_semester || ''}
              onChange={(e) => setValues({ ...values, active_semester: e.target.value })}
              className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full"
              placeholder="first / second"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Facilitation Start</label>
            <input
              type="date"
              value={values.facilitation_start || ''}
              onChange={(e) => setValues({ ...values, facilitation_start: e.target.value })}
              className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Facilitation End</label>
            <input
              type="date"
              value={values.facilitation_end || ''}
              onChange={(e) => setValues({ ...values, facilitation_end: e.target.value })}
              className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full"
            />
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 mt-6 flex flex-col sm:flex-row sm:justify-end">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSave}
            disabled={saving}
            className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2.5 font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Settings'}
          </motion.button>
        </div>
      </motion.div>
    </>
  );
}

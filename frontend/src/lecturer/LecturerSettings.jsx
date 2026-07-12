import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { DEPARTMENTS_BY_FACULTY, getFacultyForDepartment } from '../lib/departments';

export default function LecturerSettings() {
  const { profile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [department, setDepartment] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');

  const [newPassword, setNewPassword] = useState('');
  const [retypePassword, setRetypePassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState('');

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setDepartment(profile.department || '');
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileMessage('');

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        department,
        faculty: getFacultyForDepartment(department),
      })
      .eq('id', profile.id);

    setSavingProfile(false);
    setProfileMessage(error ? error.message : 'Profile updated.');
  };

  const handleChangePassword = async () => {
    setPasswordMessage('');
    if (!newPassword || newPassword.length < 6) {
      setPasswordMessage('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== retypePassword) {
      setPasswordMessage('Passwords do not match.');
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);

    if (error) {
      setPasswordMessage(error.message);
      return;
    }
    setPasswordMessage('Password changed.');
    setNewPassword('');
    setRetypePassword('');
  };

  if (!profile) {
    return <p className="text-white">Loading…</p>;
  }

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <p>Pages / Settings</p>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="bg-white rounded-[1.1rem] shadow-md p-4 sm:p-6 w-full mb-6"
      >
        <h2 className="text-gray-900 font-semibold mb-4">Profile</h2>

        {profileMessage && (
          <div className="bg-blue-50 text-blue-700 text-sm rounded-xl px-4 py-2 mb-4">{profileMessage}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Full Name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Email</label>
            <input value={profile.email} disabled className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full bg-gray-100 text-gray-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Department</label>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full bg-white"
            >
              <option value="">Select department</option>
              {Object.entries(DEPARTMENTS_BY_FACULTY).map(([faculty, departments]) => (
                <optgroup key={faculty} label={faculty}>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Faculty</label>
            <input
              value={getFacultyForDepartment(department)}
              disabled
              className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full bg-gray-100 text-gray-500"
              placeholder="Auto-set from department"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Account Status</label>
            <div className="h-11 flex items-center">
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                profile.status === 'active' ? 'bg-green-100 text-green-700' :
                profile.status === 'pending' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
              }`}>
                {profile.status}
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 mt-6 flex flex-col sm:flex-row sm:justify-end">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSaveProfile}
            disabled={savingProfile}
            className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2.5 font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {savingProfile ? 'Saving…' : 'Save Profile'}
          </motion.button>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut', delay: 0.05 }}
        className="bg-white rounded-[1.1rem] shadow-md p-4 sm:p-6 w-full"
      >
        <h2 className="text-gray-900 font-semibold mb-1">Change Password</h2>
        <p className="text-xs text-gray-400 mb-4">
          If an admin bulk-imported your account, change the default password here.
        </p>

        {passwordMessage && (
          <div className="bg-blue-50 text-blue-700 text-sm rounded-xl px-4 py-2 mb-4">{passwordMessage}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Retype Password</label>
            <input
              type="password"
              value={retypePassword}
              onChange={(e) => setRetypePassword(e.target.value)}
              className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full"
            />
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 mt-6 flex flex-col sm:flex-row sm:justify-end">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleChangePassword}
            disabled={savingPassword}
            className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2.5 font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {savingPassword ? 'Saving…' : 'Change Password'}
          </motion.button>
        </div>
      </motion.div>
    </>
  );
}

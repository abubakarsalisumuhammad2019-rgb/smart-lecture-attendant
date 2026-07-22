import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { PageLoader } from '../components/PageLoader';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { PasswordInput } from '../shared/PasswordInput';

export default function LecturerSettings() {
  const { profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [retypePassword, setRetypePassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setPhone(profile.phone || '');
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    setSavingProfile(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: fullName.trim(),
        phone: phone.trim(),
      })
      .eq('id', profile.id);

    setSavingProfile(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    await refreshProfile();
    toast.success('Profile updated.');
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== retypePassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Password changed.');
    setNewPassword('');
    setRetypePassword('');
  };

  if (!profile) {
    return <PageLoader />;
  }

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <Breadcrumbs items={[{ label: "Settings" }]} />
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
            <label className="text-sm font-medium text-gray-700">Phone Number</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 08012345678"
              className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Email</label>
            <input value={profile.email} disabled className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full bg-gray-100 text-gray-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Department</label>
            <input value={profile.department || ''} disabled className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full bg-gray-100 text-gray-500" />
            <p className="text-[11px] text-gray-400">Contact an admin to change your department.</p>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Faculty</label>
            <input
              value={profile.faculty || ''}
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">New Password</label>
            <PasswordInput
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Retype Password</label>
            <PasswordInput
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

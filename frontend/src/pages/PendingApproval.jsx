import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function PendingApproval() {
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    window.location.href = '/Signin';
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-split p-4">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-3">Awaiting Approval</h1>
        <p className="text-sm text-gray-600 mb-6">
          Your lecturer account has been created and is waiting for an admin to
          approve it and assign your courses. You'll be able to sign in normally
          once that's done.
        </p>
        <button
          onClick={handleSignOut}
          disabled={signingOut}
          className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2 font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
        >
          {signingOut ? 'Signing out…' : 'Sign Out'}
        </button>
      </div>
    </div>
  );
}

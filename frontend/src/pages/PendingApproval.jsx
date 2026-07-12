import React from 'react';
import { supabase } from '../lib/supabaseClient';

export default function PendingApproval() {
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
          onClick={() => supabase.auth.signOut().then(() => { window.location.href = '/Signin'; })}
          className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2 font-bold text-white transition-all hover:opacity-90"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}

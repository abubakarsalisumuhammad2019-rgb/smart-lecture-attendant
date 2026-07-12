import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getFunctionErrorMessage } from '../lib/functionError';

export function CancelModal({ lecture, onClose, onCancelled }) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('A cancellation reason is required.');
      return;
    }

    setSubmitting(true);
    setError('');

    const { error: fnError } = await supabase.functions.invoke('zoom-update-meeting', {
      body: { lecture_id: lecture.id, action: 'cancel', cancel_reason: reason.trim() },
    });

    setSubmitting(false);

    if (fnError) {
      setError(await getFunctionErrorMessage(fnError, 'Failed to cancel.'));
      return;
    }

    onCancelled();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-1">Cancel Lecture</h2>
        <p className="text-sm text-gray-500 mb-4">{lecture.topic}</p>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-3 mb-4">{error}</div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-gray-700">Reason</label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none"
            placeholder="e.g. Facilitator unavailable, rescheduling next week"
          />
        </div>

        <div className="border-t border-gray-100 pt-3 mt-4 flex justify-end gap-3">
          <button onClick={onClose} className="text-gray-600 px-4 py-2 rounded-xl hover:bg-gray-100">Back</button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-xl bg-red-500 px-6 py-2 font-bold text-white hover:bg-red-600 disabled:opacity-50"
          >
            {submitting ? 'Cancelling…' : 'Cancel Lecture'}
          </button>
        </div>
      </div>
    </div>
  );
}

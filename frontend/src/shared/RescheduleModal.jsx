import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getFunctionErrorMessage } from '../lib/functionError';

function toLocalInputValue(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function RescheduleModal({ lecture, onClose, onRescheduled }) {
  const [startTime, setStartTime] = useState(toLocalInputValue(lecture.start_time));
  const [endTime, setEndTime] = useState(toLocalInputValue(lecture.end_time));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!startTime || !endTime) {
      setError('Both start and end time are required.');
      return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMinutes = Math.round((end - start) / 60000);

    if (durationMinutes <= 0) {
      setError('End time must be after the start time.');
      return;
    }

    setSubmitting(true);
    setError('');

    const { error: fnError } = await supabase.functions.invoke('update-lecture-schedule', {
      body: {
        lecture_id: lecture.id,
        action: 'reschedule',
        start_time: start.toISOString(),
        duration_minutes: durationMinutes,
      },
    });

    setSubmitting(false);

    if (fnError) {
      setError(await getFunctionErrorMessage(fnError, 'Failed to reschedule.'));
      return;
    }

    onRescheduled();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold mb-1">Reschedule Lecture</h2>
        <p className="text-sm text-gray-500 mb-4">{lecture.topic}</p>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-3 mb-4">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">New start time</label>
            <input type="datetime-local" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">New end time</label>
            <input type="datetime-local" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm" />
          </div>
        </div>

        <div className="border-t border-gray-100 pt-3 mt-4 flex justify-end gap-3">
          <button onClick={onClose} className="text-gray-600 px-4 py-2 rounded-xl hover:bg-gray-100">Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2 font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Rescheduling…' : 'Reschedule'}
          </button>
        </div>
      </div>
    </div>
  );
}

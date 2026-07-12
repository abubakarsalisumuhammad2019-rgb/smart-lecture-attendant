import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { LectureForm } from './LectureForm';
import { RescheduleModal } from './RescheduleModal';
import { CancelModal } from './CancelModal';

export default function Lectures() {
  const [lectures, setLectures] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState('');
  const [reschedulingLecture, setReschedulingLecture] = useState(null);
  const [cancelingLecture, setCancelingLecture] = useState(null);

  const loadData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('lectures')
      .select('*, courses(course_code, course_title), profiles(full_name)')
      .order('start_time', { ascending: false });
    setLectures(data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <p>Pages / Lectures</p>
          <h1 className="text-lg font-semibold">Lectures</h1>
        </div>
        <div className="flex gap-3">
          <Link to="/admin/lectures/import" className="rounded-xl bg-white text-blue-700 px-5 py-2 font-bold hover:bg-gray-100">
            Bulk Import
          </Link>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-2 font-bold text-white hover:opacity-90"
          >
            + New Lecture
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className="bg-blue-50 text-blue-700 text-sm rounded-xl px-4 py-2 mb-4">{actionMessage}</div>
      )}

      {showForm && (
        <LectureForm
          onClose={() => setShowForm(false)}
          onCreated={() => { setShowForm(false); loadData(); }}
        />
      )}

      {reschedulingLecture && (
        <RescheduleModal
          lecture={reschedulingLecture}
          onClose={() => setReschedulingLecture(null)}
          onRescheduled={() => {
            setReschedulingLecture(null);
            setActionMessage('Lecture rescheduled.');
            loadData();
          }}
        />
      )}

      {cancelingLecture && (
        <CancelModal
          lecture={cancelingLecture}
          onClose={() => setCancelingLecture(null)}
          onCancelled={() => {
            setCancelingLecture(null);
            setActionMessage('Lecture cancelled.');
            loadData();
          }}
        />
      )}

      <div className="bg-white rounded-[1.1rem] shadow-md p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto border-separate border-spacing-y-2 text-sm text-gray-900">
            <thead>
              <tr className="bg-[#F7F7F7] text-gray-900">
                <th className="text-left px-4 py-3 rounded-l-lg">Topic</th>
                <th className="text-left px-4 py-3">Course</th>
                <th className="text-left px-4 py-3">Facilitator</th>
                <th className="text-left px-4 py-3">Start</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 rounded-r-lg">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="6" className="text-center py-4 text-gray-500">Loading...</td></tr>
              ) : lectures.length > 0 ? (
                lectures.map((lecture) => (
                  <tr key={lecture.id} className="hover:bg-[#f0f4f8]">
                    <td className="px-4 py-3">{lecture.topic}</td>
                    <td className="px-4 py-3">{lecture.courses?.course_code}</td>
                    <td className="px-4 py-3">{lecture.profiles?.full_name}</td>
                    <td className="px-4 py-3">{new Date(lecture.start_time).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span className={
                        lecture.status === 'cancelled' ? 'text-red-500' :
                        lecture.status === 'rescheduled' ? 'text-orange-500' :
                        lecture.status === 'completed' ? 'text-gray-400' : 'text-green-600'
                      }>
                        {lecture.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lecture.status !== 'cancelled' && (
                        <div className="flex gap-2">
                          <button onClick={() => setReschedulingLecture(lecture)} className="text-blue-600 hover:underline text-xs">Reschedule</button>
                          <button onClick={() => setCancelingLecture(lecture)} className="text-red-500 hover:underline text-xs">Cancel</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="6" className="text-center py-4 text-gray-500">No lectures yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

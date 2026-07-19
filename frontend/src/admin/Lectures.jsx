import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { LectureForm } from '../shared/LectureForm';
import { RescheduleModal } from '../shared/RescheduleModal';
import { CancelModal } from '../shared/CancelModal';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { RowActionsMenu } from '../shared/RowActionsMenu';
import { Breadcrumbs } from '../components/Breadcrumbs';
import { getFunctionErrorMessage } from '../lib/functionError';

export default function Lectures() {
  const [lectures, setLectures] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState('');
  const [reschedulingLecture, setReschedulingLecture] = useState(null);
  const [cancelingLecture, setCancelingLecture] = useState(null);
  const [endingLecture, setEndingLecture] = useState(null);
  const [ending, setEnding] = useState(false);
  const [reopeningId, setReopeningId] = useState(null);

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

  const handleConfirmEnd = async () => {
    setEnding(true);

    const { error } = await supabase.functions.invoke('update-lecture-schedule', {
      body: { lecture_id: endingLecture.id, action: 'end' },
    });

    setEnding(false);

    if (error) {
      setActionMessage(await getFunctionErrorMessage(error, 'Failed to end the meeting.'));
      setEndingLecture(null);
      return;
    }

    setEndingLecture(null);
    setActionMessage("Meeting ended. Students can't join until it's reopened.");
    loadData();
  };

  const handleReopen = async (lectureId) => {
    setReopeningId(lectureId);
    setActionMessage('');

    const { error } = await supabase.functions.invoke('update-lecture-schedule', {
      body: { lecture_id: lectureId, action: 'reopen' },
    });

    setReopeningId(null);

    if (error) {
      setActionMessage(await getFunctionErrorMessage(error, 'Failed to reopen the meeting.'));
      return;
    }

    setActionMessage('Meeting reopened.');
    loadData();
  };

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <Breadcrumbs items={[{ label: "Lectures" }]} />
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

      <ConfirmDialog
        isOpen={!!endingLecture}
        title="End this meeting?"
        message="Students won't be able to join until it's reopened."
        confirmLabel="End Meeting"
        danger
        submitting={ending}
        onConfirm={handleConfirmEnd}
        onClose={() => setEndingLecture(null)}
      />

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
                <th className="text-left px-4 py-3">Meeting</th>
                <th className="text-left px-4 py-3 rounded-r-lg">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="text-center py-4 text-gray-500">Loading...</td></tr>
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
                      {lecture.meeting_web_url ? (
                        <span className="text-green-600">Ready</span>
                      ) : (
                        <span className="text-orange-500">Pending setup</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <RowActionsMenu
                        items={[
                          { label: 'Roster', to: `/admin/lectures/${lecture.id}/roster` },
                          lecture.status !== 'cancelled' &&
                            lecture.status !== 'completed' && {
                              label: 'Reschedule',
                              onClick: () => setReschedulingLecture(lecture),
                            },
                          lecture.status !== 'cancelled' &&
                            lecture.status !== 'completed' && {
                              label: 'Cancel',
                              danger: true,
                              onClick: () => setCancelingLecture(lecture),
                            },
                          lecture.status !== 'cancelled' &&
                            lecture.status !== 'completed' && {
                              label: 'End Meeting',
                              danger: true,
                              onClick: () => setEndingLecture(lecture),
                            },
                          lecture.status === 'completed' && {
                            label: reopeningId === lecture.id ? 'Reopening…' : 'Reopen Meeting',
                            disabled: reopeningId === lecture.id,
                            onClick: () => handleReopen(lecture.id),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="7" className="text-center py-4 text-gray-500">No lectures yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

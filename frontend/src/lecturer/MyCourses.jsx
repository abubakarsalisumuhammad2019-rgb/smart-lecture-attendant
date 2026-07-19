import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { Breadcrumbs } from '../components/Breadcrumbs';

export default function MyCourses() {
  const { profile } = useAuth();
  const [courses, setCourses] = useState([]);
  const [enrollmentCounts, setEnrollmentCounts] = useState({});
  const [activeSession, setActiveSession] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!profile?.id) return;
      setLoading(true);

      const { data: settingsRows } = await supabase.from('app_settings').select('*');
      const settingsMap = Object.fromEntries((settingsRows || []).map((s) => [s.key, s.value]));
      const session = settingsMap.active_academic_session || '';
      setActiveSession(session);

      const { data: assignments } = await supabase
        .from('lecturer_courses')
        .select('course_id, courses(id, course_code, course_title, credit_units, level, academic_session, semester)')
        .eq('lecturer_id', profile.id)
        .eq('academic_session', session);

      const myCourses = (assignments || []).map((a) => a.courses).filter(Boolean);
      setCourses(myCourses);

      if (myCourses.length > 0) {
        const { data: enrollments } = await supabase
          .from('enrollments')
          .select('course_id')
          .in('course_id', myCourses.map((c) => c.id));
        const counts = {};
        for (const row of enrollments || []) {
          counts[row.course_id] = (counts[row.course_id] || 0) + 1;
        }
        setEnrollmentCounts(counts);
      } else {
        setEnrollmentCounts({});
      }

      setLoading(false);
    };
    load();
  }, [profile?.id]);

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <Breadcrumbs items={[{ label: "My Courses" }]} />
          <h1 className="text-lg font-semibold">My Courses</h1>
        </div>
      </div>

      <p className="text-xs text-gray-300 mb-4">
        Courses assigned to you for {activeSession || 'the active session'}. An admin assigns courses from Users.
      </p>

      <div className="bg-white rounded-[1.1rem] shadow-md p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto border-separate border-spacing-y-2 text-sm text-gray-900">
            <thead>
              <tr className="bg-[#F7F7F7]">
                <th className="text-left px-4 py-2 rounded-l-lg">Code</th>
                <th className="text-left px-4 py-2">Title</th>
                <th className="text-left px-4 py-2">Units</th>
                <th className="text-left px-4 py-2">Level</th>
                <th className="text-left px-4 py-2 rounded-r-lg">Enrolled Students</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="text-center py-4 text-gray-500">Loading…</td></tr>
              ) : courses.length > 0 ? courses.map((c) => (
                <tr key={c.id} className="hover:bg-[#f0f4f8] transition-colors duration-200">
                  <td className="px-4 py-2">{c.course_code}</td>
                  <td className="px-4 py-2">{c.course_title}</td>
                  <td className="px-4 py-2">{c.credit_units ?? '-'}</td>
                  <td className="px-4 py-2">{c.level ?? '-'}</td>
                  <td className="px-4 py-2">{enrollmentCounts[c.id] || 0}</td>
                </tr>
              )) : (
                <tr><td colSpan="5" className="text-center py-4 text-gray-500">No courses assigned yet. Ask an admin to assign one from Users.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { Breadcrumbs } from '../components/Breadcrumbs';

export default function MyCourses() {
  const { profile } = useAuth();
  const [courses, setCourses] = useState([]);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [activeSession, setActiveSession] = useState('');
  const [activeSemester, setActiveSemester] = useState('');
  const [maxCreditUnits, setMaxCreditUnits] = useState(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [checkedCourseIds, setCheckedCourseIds] = useState(new Set());
  const [capMessage, setCapMessage] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [enrollMessage, setEnrollMessage] = useState('');
  const [enrollError, setEnrollError] = useState(false);

  const enrolledUnits = courses.reduce((sum, c) => sum + (c.credit_units || 0), 0);

  const load = async () => {
    if (!profile?.id) return;
    setLoading(true);

    const { data: settingsRows } = await supabase.from('app_settings').select('*');
    const settingsMap = Object.fromEntries((settingsRows || []).map((s) => [s.key, s.value]));
    const session = settingsMap.active_academic_session || '';
    const semester = settingsMap.active_semester || '';
    setActiveSession(session);
    setActiveSemester(semester);
    setMaxCreditUnits(settingsMap.max_credit_units ? Number(settingsMap.max_credit_units) : null);

    const [{ data: enrollments }, { data: allCourses }] = await Promise.all([
      supabase
        .from('enrollments')
        .select('course_id, source, courses(id, course_code, course_title, credit_units, level)')
        .eq('student_id', profile.id)
        .eq('academic_session', session),
      supabase
        .from('courses')
        .select('*')
        .eq('academic_session', session)
        .eq('semester', semester)
        .order('course_code'),
    ]);

    const enrolledCourses = (enrollments || []).map((e) => ({ ...e.courses, source: e.source })).filter((c) => c.id);

    const enrolledIds = new Set(enrolledCourses.map((c) => c.id));
    setAvailableCourses((allCourses || []).filter((c) => !enrolledIds.has(c.id)));

    // Attendance summary per course -- "attended" out of every past,
    // non-cancelled lecture for that course this session. Only lectures that
    // have already started count; a lecture scheduled for next week isn't
    // something the student could have attended yet.
    const attendanceSummary = {};
    if (enrolledCourses.length > 0) {
      const { data: pastLectures } = await supabase
        .from('lectures')
        .select('id, course_id')
        .in('course_id', [...enrolledIds])
        .eq('academic_session', session)
        .neq('status', 'cancelled')
        .lt('start_time', new Date().toISOString());

      const lectureIds = (pastLectures || []).map((l) => l.id);
      let attendedLectureIds = new Set();
      if (lectureIds.length > 0) {
        const { data: attendanceRows } = await supabase
          .from('lecture_attendance')
          .select('lecture_id')
          .eq('student_id', profile.id)
          .eq('status', 'attended')
          .in('lecture_id', lectureIds);
        attendedLectureIds = new Set((attendanceRows || []).map((a) => a.lecture_id));
      }

      for (const l of pastLectures || []) {
        const summary = attendanceSummary[l.course_id] || { total: 0, attended: 0 };
        summary.total += 1;
        if (attendedLectureIds.has(l.id)) summary.attended += 1;
        attendanceSummary[l.course_id] = summary;
      }
    }

    setCourses(enrolledCourses.map((c) => ({ ...c, attendance: attendanceSummary[c.id] || { total: 0, attended: 0 } })));

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const filteredAvailable = availableCourses.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.course_code.toLowerCase().includes(q) || c.course_title.toLowerCase().includes(q);
  });

  const selectedUnits = [...checkedCourseIds].reduce((sum, id) => {
    const course = availableCourses.find((c) => c.id === id);
    return sum + (course?.credit_units || 0);
  }, 0);
  const totalUnits = enrolledUnits + selectedUnits;

  const toggleCourse = (courseId) => {
    setCapMessage('');
    setCheckedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
        return next;
      }
      const course = availableCourses.find((c) => c.id === courseId);
      const wouldBeUnits = enrolledUnits + [...prev].reduce((sum, id) => {
        const c = availableCourses.find((ac) => ac.id === id);
        return sum + (c?.credit_units || 0);
      }, 0) + (course?.credit_units || 0);
      if (maxCreditUnits && wouldBeUnits > maxCreditUnits) {
        setCapMessage(`You've reached the ${maxCreditUnits}-unit maximum for this semester. Deselect a course to add a different one.`);
        return prev;
      }
      next.add(courseId);
      return next;
    });
  };

  const handleEnrollMore = async () => {
    if (checkedCourseIds.size === 0) return;
    setEnrolling(true);
    setEnrollMessage('');

    const rows = [...checkedCourseIds].map((courseId) => {
      const course = availableCourses.find((c) => c.id === courseId);
      return {
        student_id: profile.id,
        course_id: courseId,
        course_code: course.course_code,
        semester: course.semester,
        academic_session: course.academic_session,
        source: 'manual_student',
      };
    });

    const { error } = await supabase.from('enrollments').insert(rows);
    setEnrolling(false);
    setEnrollError(!!error);

    if (error) {
      setEnrollMessage(error.message);
      return;
    }

    setEnrollMessage(`Enrolled in ${rows.length} more course${rows.length === 1 ? '' : 's'}.`);
    setCheckedCourseIds(new Set());
    load();
  };

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <Breadcrumbs items={[{ label: "My Courses" }]} />
          <h1 className="text-lg font-semibold">My Courses</h1>
        </div>
      </div>

      <p className="text-xs text-gray-300 mb-4">
        Courses you're enrolled in for {activeSession || 'the active session'}.
      </p>

      <div className="bg-white rounded-[1.1rem] shadow-md p-4 mb-6">
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto border-separate border-spacing-y-2 text-sm text-gray-900">
            <thead>
              <tr className="bg-[#F7F7F7]">
                <th className="text-left px-4 py-2 rounded-l-lg">Code</th>
                <th className="text-left px-4 py-2">Title</th>
                <th className="text-left px-4 py-2">Units</th>
                <th className="text-left px-4 py-2">Level</th>
                <th className="text-left px-4 py-2 rounded-r-lg">Attendance</th>
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
                  <td className="px-4 py-2">
                    {c.attendance.total > 0 ? (
                      <div className="flex items-center gap-2 min-w-[110px]">
                        <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600"
                            style={{ width: `${Math.round((c.attendance.attended / c.attendance.total) * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {c.attendance.attended}/{c.attendance.total}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">No lectures yet</span>
                    )}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="5" className="text-center py-4 text-gray-500">No courses enrolled yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!loading && maxCreditUnits && (
          <p className="text-xs text-gray-400 mt-3">{enrolledUnits} of {maxCreditUnits} units used this semester.</p>
        )}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
        className="bg-white rounded-[1.1rem] shadow-md p-4 sm:p-6 w-full"
      >
        <h2 className="text-gray-900 font-semibold mb-1">Enroll More Courses</h2>
        <p className="text-xs text-gray-400 mb-4">
          Didn't register everything during onboarding? Add the rest of your {activeSemester || 'semester'} courses here.
        </p>

        {enrollMessage && (
          <div className={`text-sm rounded-xl px-4 py-2 mb-4 ${enrollError ? 'bg-red-50 border border-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
            {enrollMessage}
          </div>
        )}

        {capMessage && (
          <div className="bg-orange-50 border border-orange-100 text-orange-700 text-sm rounded-xl px-3 py-3 mb-3">{capMessage}</div>
        )}

        {!loading && availableCourses.length === 0 ? (
          <p className="text-sm text-gray-500">You're enrolled in all available courses for this session.</p>
        ) : (
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by code or title…"
              className="h-10 px-3 border border-gray-200 rounded-xl text-sm w-full mb-3"
            />

            <div className="border border-gray-100 rounded-xl max-h-64 overflow-y-auto mb-4">
              {loading ? (
                <p className="text-sm text-gray-500 p-4">Loading courses…</p>
              ) : filteredAvailable.length === 0 ? (
                <p className="text-sm text-gray-500 p-4">No courses match your search.</p>
              ) : (
                filteredAvailable.map((c) => {
                  const isChecked = checkedCourseIds.has(c.id);
                  const wouldExceedCap = !isChecked && maxCreditUnits && totalUnits + (c.credit_units || 0) > maxCreditUnits;
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 px-4 py-2 border-b border-gray-50 last:border-0 ${wouldExceedCap ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={wouldExceedCap}
                        onChange={() => toggleCourse(c.id)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-gray-800">
                        <span className="font-semibold">{c.course_code}</span> - {c.course_title}
                        {c.credit_units ? <span className="text-gray-400"> ({c.credit_units} units)</span> : null}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <p className="text-xs text-gray-400 mb-4">
              {checkedCourseIds.size} course{checkedCourseIds.size === 1 ? '' : 's'} selected
              {maxCreditUnits ? ` · ${totalUnits} of ${maxCreditUnits} units used` : ''}.
            </p>

            <div className="flex justify-end">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleEnrollMore}
                disabled={enrolling || checkedCourseIds.size === 0}
                className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2.5 font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {enrolling ? 'Enrolling…' : 'Enroll Selected'}
              </motion.button>
            </div>
          </>
        )}
      </motion.div>
    </>
  );
}

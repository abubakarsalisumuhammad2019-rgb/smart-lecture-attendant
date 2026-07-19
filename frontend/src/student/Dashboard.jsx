import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { FaLayerGroup, FaCalendarCheck, FaBook } from 'react-icons/fa';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { Breadcrumbs } from '../components/Breadcrumbs';

const COLOR_MAP = {
  teal: 'bg-teal-100 text-teal-600',
  green: 'bg-green-100 text-green-600',
  indigo: 'bg-indigo-100 text-indigo-600',
};

function StatCard({ icon: Icon, color, label, value, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.25, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      className="bg-white rounded-[1.1rem] p-4 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between"
    >
      <div className="flex flex-col space-y-1">
        <div className={`w-9 h-9 flex items-center justify-center rounded-md ${COLOR_MAP[color]}`}>
          <Icon className="text-lg" />
        </div>
        <p className="text-xs font-semibold text-gray-600">TOTAL</p>
        <p className="text-gray-700 text-md font-semibold mt-1">{label}</p>
      </div>
      <h3 className="text-4xl font-bold text-gray-800 px-4">{value}</h3>
    </motion.div>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const [lectures, setLectures] = useState([]);
  const [courseCount, setCourseCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!profile?.id) return;
      setLoading(true);

      const { data: settingsRows } = await supabase.from('app_settings').select('*');
      const settingsMap = Object.fromEntries((settingsRows || []).map((s) => [s.key, s.value]));
      const activeSession = settingsMap.active_academic_session || '';

      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('course_id')
        .eq('student_id', profile.id)
        .eq('academic_session', activeSession);

      const courseIds = (enrollments || []).map((e) => e.course_id);
      setCourseCount(courseIds.length);

      if (courseIds.length > 0) {
        const { data: lecturesData } = await supabase
          .from('lectures')
          .select('*, courses(course_code, course_title)')
          .in('course_id', courseIds)
          .order('start_time', { ascending: false });
        setLectures(lecturesData || []);
      } else {
        setLectures([]);
      }

      setLoading(false);
    };
    load();
  }, [profile?.id]);

  const now = new Date();
  const upcoming = lectures.filter(
    (l) => (l.status === 'scheduled' || l.status === 'rescheduled') && new Date(l.start_time) >= now
  );
  const nextUp = [...upcoming].sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
  const previousMeetings = lectures
    .filter((l) => l.status !== 'cancelled' && new Date(l.end_time) < now)
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
    .slice(0, 3);

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <Breadcrumbs items={[{ label: "Dashboard" }]} />
          <h1 className="text-lg font-semibold">Dashboard</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard index={0} icon={FaLayerGroup} color="teal" label="Enrolled Courses" value={courseCount} />
        <StatCard index={1} icon={FaCalendarCheck} color="green" label="Upcoming Lectures" value={upcoming.length} />
        <StatCard index={2} icon={FaBook} color="indigo" label="Total Lectures" value={lectures.length} />
      </div>

      {!loading && nextUp && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="bg-white rounded-[1.1rem] shadow-md p-4 sm:p-6 mb-6"
        >
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Next Up</p>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-gray-900 font-semibold">{nextUp.topic}</h2>
              <p className="text-sm text-gray-500">
                {nextUp.courses?.course_code} &middot; {new Date(nextUp.start_time).toLocaleString()}
              </p>
            </div>
            {nextUp.meeting_web_url ? (
              <Link
                to={`/student/lectures/${nextUp.id}/join`}
                className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-2 font-bold text-white hover:opacity-90 text-center"
              >
                Join
              </Link>
            ) : (
              <span className="text-sm text-orange-500 font-medium">Meeting not set up yet</span>
            )}
          </div>
        </motion.div>
      )}

      {!loading && previousMeetings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut', delay: 0.05 }}
          className="bg-white rounded-[1.1rem] shadow-md p-4 sm:p-6 mb-6"
        >
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Previous Meetings</p>
          <div className="flex flex-col divide-y divide-gray-100">
            {previousMeetings.map((lecture) => (
              <div key={lecture.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <div>
                  <h3 className="text-gray-900 font-medium text-sm">{lecture.topic}</h3>
                  <p className="text-xs text-gray-500">
                    {lecture.courses?.course_code} &middot; {new Date(lecture.start_time).toLocaleString()}
                  </p>
                </div>
                <Link to={`/student/lectures/${lecture.id}/join`} className="text-blue-600 hover:underline text-xs shrink-0">
                  View Details
                </Link>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="bg-white rounded-[1.1rem] shadow-md p-4"
      >
        <h2 className="text-gray-800 ml-2 text-md font-bold mb-4">My Lectures</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto border-separate border-spacing-y-2 text-sm text-gray-900">
            <thead>
              <tr className="bg-[#F7F7F7] text-gray-900">
                <th className="text-left px-4 py-3 rounded-l-lg">Topic</th>
                <th className="text-left px-4 py-3">Course</th>
                <th className="text-left px-4 py-3">Start</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 rounded-r-lg">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="5" className="text-center py-4 text-gray-500">Loading...</td></tr>
              ) : lectures.length > 0 ? (
                lectures.map((lecture) => (
                  <tr key={lecture.id} className="hover:bg-[#f0f4f8]">
                    <td className="px-4 py-3">{lecture.topic}</td>
                    <td className="px-4 py-3">{lecture.courses?.course_code}</td>
                    <td className="px-4 py-3">{new Date(lecture.start_time).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          lecture.status === 'cancelled' ? 'text-red-500' :
                          lecture.status === 'rescheduled' ? 'text-orange-500' :
                          lecture.status === 'completed' ? 'text-gray-400' : 'text-green-600'
                        }
                      >
                        {lecture.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lecture.status !== 'cancelled' && lecture.meeting_web_url ? (
                        <Link to={`/student/lectures/${lecture.id}/join`} className="text-blue-600 hover:underline text-xs">
                          Join
                        </Link>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan="5" className="text-center py-4 text-gray-500">No lectures yet for your enrolled courses.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>
    </>
  );
}

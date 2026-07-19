import "./App.css";
import { FaUserGraduate, FaChalkboardTeacher, FaLayerGroup, FaBook } from "react-icons/fa";
import { motion } from "motion/react";
import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import { Breadcrumbs } from './components/Breadcrumbs';

const COLOR_MAP = {
  green: 'bg-green-100 text-green-600',
  blue: 'bg-blue-100 text-blue-600',
  teal: 'bg-teal-100 text-teal-600',
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

const Dashboard = () => {
  const [counts, setCounts] = useState({ students: 0, lecturers: 0, courses: 0, lectures: 0 });
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [studentsRes, lecturersRes, coursesRes, lecturesRes, upcomingRes] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'student'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'lecturer'),
        supabase.from('courses').select('id', { count: 'exact', head: true }),
        supabase.from('lectures').select('id', { count: 'exact', head: true }),
        supabase
          .from('lectures')
          .select('*, courses(course_code), profiles(full_name)')
          .eq('status', 'scheduled')
          .gte('start_time', new Date().toISOString())
          .order('start_time', { ascending: true })
          .limit(5),
      ]);

      setCounts({
        students: studentsRes.count || 0,
        lecturers: lecturersRes.count || 0,
        courses: coursesRes.count || 0,
        lectures: lecturesRes.count || 0,
      });
      setUpcoming(upcomingRes.data || []);
      setLoading(false);
    };

    load();
  }, []);

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <Breadcrumbs items={[{ label: "Dashboard" }]} />
          <h1 className="text-lg font-semibold">Dashboard</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard index={0} icon={FaUserGraduate} color="green" label="Students" value={counts.students} />
        <StatCard index={1} icon={FaChalkboardTeacher} color="blue" label="Lecturers" value={counts.lecturers} />
        <StatCard index={2} icon={FaLayerGroup} color="teal" label="Courses" value={counts.courses} />
        <StatCard index={3} icon={FaBook} color="indigo" label="Lectures" value={counts.lectures} />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.3 }}
        className="bg-white rounded-[1.1rem] shadow-md p-4"
      >
        <h1 className="text-gray-800 ml-2 text-md font-bold mb-4">Upcoming Lectures</h1>
        {loading ? (
          <p className="text-gray-500 text-sm px-2">Loading…</p>
        ) : upcoming.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto border-separate border-spacing-y-2 text-sm text-gray-900">
              <thead>
                <tr className="bg-[#F7F7F7] text-gray-900">
                  <th className="text-left px-4 py-3 rounded-l-lg">Topic</th>
                  <th className="text-left px-4 py-3">Course</th>
                  <th className="text-left px-4 py-3">Facilitator</th>
                  <th className="text-left px-4 py-3 rounded-r-lg">Start</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((lecture) => (
                  <tr key={lecture.id} className="hover:bg-[#f0f4f8] transition-colors duration-200">
                    <td className="px-4 py-3">{lecture.topic}</td>
                    <td className="px-4 py-3">{lecture.courses?.course_code}</td>
                    <td className="px-4 py-3">{lecture.profiles?.full_name}</td>
                    <td className="px-4 py-3">{new Date(lecture.start_time).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm px-2 py-4">No upcoming lectures scheduled.</p>
        )}
      </motion.div>

      {/* Footer */}
      <div className="text-center text-sm text-gray-500 mt-6">
        © 2025, made with ❤️ by <span className="font-semibold text-gray-700">National Open University</span> for a better web.
      </div>
    </>
  );
};

export default Dashboard;

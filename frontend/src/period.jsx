import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FaHome, FaFileAlt, FaUser, FaDownload, FaClock } from 'react-icons/fa';
import { FaJava, FaPython, FaNetworkWired, FaBrain, FaReact } from "react-icons/fa";
import { supabase } from "./lib/supabaseClient";

const Period = () => {
  const [attendanceData, setAttendanceData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const fetchAttendanceData = async () => {
      try {
        const { data, error } = await supabase
          .from('periodwise_attendance_logs')
          .select('*')
          .order('recognized_at', { ascending: false });
        if (error) throw error;
        setAttendanceData(data);
      } catch (error) {
        console.error("Error fetching attendance data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAttendanceData();
  }, []);

  const periods = [
    { name: 'Java', icon: <FaJava className="text-3xl text-orange-600" />, time: '9:00 AM' },
    { name: 'Python', icon: <FaPython className="text-3xl text-blue-500" />, time: '10:00 AM' },
    { name: 'Network', icon: <FaNetworkWired className="text-3xl text-green-600" />, time: '11:30 AM' },
    { name: 'AI/ML', icon: <FaBrain className="text-3xl text-purple-700" />, time: '12:30 PM' },
    { name: 'React', icon: <FaReact className="text-3xl text-cyan-500" />, time: '6:30 PM' }
  ];

  const filteredData = filter
    ? attendanceData.filter((log) => log.period === filter)
    : attendanceData;

  return (
    <div className="min-h-screen p-4 bg-split relative">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar */}
        <div className="w-full lg:w-64 bg-white shadow-xl rounded-2xl p-4 flex flex-col justify-between min-h-[90vh]">
          <div>
            <h2 className="text-xl font-semibold text-center mb-6">Admin Page</h2>
            <div className="flex flex-col gap-5">
              <Link to="/dashboard">
                <button className="flex items-center space-x-2 w-full text-left py-2 px-4 rounded-xl hover:bg-gray-100">
                  <FaHome className="text-purple-600" />
                  <span>Home</span>
                </button>
              </Link>
              <Link to="/Addstudent">
                <button className="flex items-center space-x-2 w-full text-left py-2 px-4 rounded-xl hover:bg-gray-100">
                  <FaUser className="text-black" />
                  <span>Add Students</span>
                </button>
              </Link>
              <Link to="/Enrolled">
                <button className="flex items-center space-x-2 w-full text-left py-2 px-4 rounded-xl hover:bg-gray-100 bg-gray-50">
                  <FaFileAlt className="text-red-500" />
                  <span>Enrolled</span>
                </button>
              </Link>
              <Link to="/Period">
                              <button className="flex items-center space-x-2 w-full text-left py-2 px-4 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-all duration-300">
                                <FaClock className="text-green-500" />
                                <span>Period Wise</span>
                              </button>
                            </Link>
            </div>
          </div>
          <Link to='/signin'>
            <button onClick={() => supabase.auth.signOut()} className="w-full py-2 rounded-xl bg-[#1E2A78] text-white shadow-md flex items-center justify-center space-x-2 hover:bg-[#16239D]">
              <FaDownload />
              <span>LogOut</span>
            </button>
          </Link>
        </div>

        {/* Main Content */}
        <div className="flex-1">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
            <div>
              <p>Pages / Period Wise</p>
              <h1 className="text-lg font-semibold">Student Attendance Period Wise</h1>
            </div>
          </div>

          <div className="bg-white rounded-[1.1rem] shadow-md p-4">
            <h1 className="text-gray-900 ml-2 font-bold">Periods</h1>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mt-5">
              {periods.map((period, index) => {
                const count = attendanceData.filter(log => log.period === period.name).length;
                return (
                  <div key={index} className="p-5 rounded-2xl bg-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {period.icon}
                      <div>
                        <h2 className="font-semibold text-2xl">{period.name}</h2>
                        <h1>{period.time}</h1>
                      </div>
                    </div>
                    <h2 className="text-5xl font-bold">{count}</h2>
                  </div>
                );
              })}
            </div>

            {/* Filter Dropdown */}
            <div className="mt-5 space-y-4">
              <div className="flex items-center space-x-2">
                <label htmlFor="courseFilter" className="text-sm font-medium text-gray-700">
                  Filter by Course:
                </label>
                <select
                  id="courseFilter"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">All</option>
                  {periods.map((p) => (
                    <option key={p.name} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>

              {/* Attendance Table */}
              <table className="min-w-full table-auto border-separate border-spacing-y-2 text-sm text-gray-900">
                <thead>
                  <tr className="bg-[#F7F7F7] text-gray-900">
                    <th className="text-left px-4 py-3 rounded-l-lg">Name</th>
                    <th className="text-left px-4 py-3">USN</th>
                    <th className="text-left px-4 py-3">Subject</th>
                    <th className="text-left px-4 py-3">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan="4" className="text-center py-4 text-gray-500">Loading attendance data...</td>
                    </tr>
                  ) : filteredData.length > 0 ? (
                    filteredData.map((log, index) => (
                      <tr key={index} className="hover:bg-gray-100 rounded-xl">
                        <td className="px-4 py-2 rounded-l-xl">{log.name}</td>
                        <td className="px-4 py-2">{log.usn}</td>
                        <td className="px-4 py-2">{log.period}</td>
                        <td className="px-4 py-2">{new Date(log.recognized_at).toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="text-center py-4 text-gray-500">No attendance records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Period;

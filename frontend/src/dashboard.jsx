import "./App.css";
import { FaHome, FaFileAlt, FaUser, FaDownload } from 'react-icons/fa';
import { FaUserGraduate, FaClipboardList, FaUsers, FaClock } from "react-icons/fa";
import { Link } from 'react-router-dom';
import axios from 'axios';
import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';

const Dashboard = () => {
    const [attendance, setAttendance] = useState([]);
    const [students, setStudents] = useState([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(4);
    const [selectedCourse, setSelectedCourse] = useState("All");

    const today = new Date().toISOString().split('T')[0];

    const presentToday = attendance.filter((student) => {
        const attendedDate = new Date(student.recognized_at).toISOString().split('T')[0];
        return attendedDate === today;
    });

    const handleManualAttendance = async () => {
        const name = document.querySelector('input[name="manual_name"]').value;
        const usn = document.querySelector('input[name="manual_usn"]').value;
        const course = document.querySelector('input[name="manual_course"]').value;
        const recognizedAtInput = document.querySelector('input[name="recognizedAt"]').value;

        if (!usn) {
            alert("USN is required");
            return;
        }

        const matchedStudent = students.find((s) => s.usn === usn);

        if (!matchedStudent && (!name || !course)) {
            alert("Student not found, and insufficient manual data provided");
            return;
        }

        try {
            const { error } = await supabase.from('attendance_logs').insert({
                usn,
                name: matchedStudent ? matchedStudent.name : name,
                course: matchedStudent ? matchedStudent.course : course,
                recognized_at: recognizedAtInput ? new Date(recognizedAtInput).toISOString() : undefined
            });

            if (!error) {
                alert("Attendance logged successfully");
            } else if (error.code === '23505') {
                alert("Attendance already recorded for today");
            } else {
                alert(error.message || "Something went wrong");
            }
        } catch (err) {
            alert(err.message || "Something went wrong");
        }
    };

    const totalStudents = students.length;
    const absentStudents = totalStudents - presentToday.length;

    useEffect(() => {
        const fetchAttendance = async () => {
            try {
                const { data, error } = await supabase.from('attendance_logs').select('*').order('recognized_at', { ascending: false });
                if (error) throw error;
                setAttendance(data);
            } catch (err) {
                console.error("Error fetching attendance:", err);
            }
        };

        const fetchStudents = async () => {
            try {
                const { data, error } = await supabase.from('students').select('*').order('enrolled_at', { ascending: false });
                if (error) throw error;
                setStudents(data);
            } catch (err) {
                console.error("Error fetching students:", err);
            }
        };

        fetchAttendance();
        fetchStudents();
    }, []);

    const courseList = ["All", ...new Set(attendance.map((student) => student.course))];

    const filteredAttendance = selectedCourse === "All"
        ? attendance
        : attendance.filter((student) => student.course === selectedCourse);

    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentAttendance = filteredAttendance.slice(indexOfFirstItem, indexOfLastItem);

    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    return (
        <div className="min-h-screen p-4 bg-split">
            <div className="flex flex-col lg:flex-row gap-6">

                <div className="w-full lg:w-64 bg-white shadow-xl rounded-2xl p-4 flex flex-col justify-between min-h-[90vh]">
                    <div>
                        <h2 className="text-xl mt-5 font-bold text-center  mb-6">Admin Page</h2>
                        <div className="flex flex-col gap-5">
                                      <Link to="/dashboard">
                                        <button className="flex items-center space-x-2 w-full text-left py-2 px-4 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-all duration-300">
                                          <FaHome className="text-purple-600" />
                                          <span>Home</span>
                                        </button>
                                      </Link>
                                      <Link to="/Addstudent">
                                        <button className="flex items-center space-x-2 w-full text-left py-2 px-4 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-all duration-300">
                                          <FaUser className="text-black" />
                                          <span>Add Students</span>
                                        </button>
                                      </Link>
                                      <Link to="/Enrolled">
                                        <button className="flex items-center space-x-2 w-full text-left py-2 px-4 rounded-xl hover:bg-gray-100 active:bg-gray-200 transition-all duration-300">
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
                        <button onClick={() => supabase.auth.signOut()} className="w-full py-2 rounded-xl bg-[#1E2A78] text-white shadow-md flex items-center justify-center space-x-2 hover:bg-[#16239D] active:bg-[#0f1c77] transition-all duration-300">
                            <FaDownload />
                            <span>LogOut</span>
                        </button>
                    </Link>
                </div>

                <div className="flex-1">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
                        <div>
                            <p>Pages / Dashboard</p>
                            <h1 className="text-lg font-semibold">Dashboard</h1>
                        </div>
                    </div>

                    {/* Stats Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                        {/* Total Students */}
                        <div className="bg-white rounded-[1.1rem] p-4 shadow-sm space-y-2.5 flex items-center justify-between">
                            <div className="flex flex-col space-y-1">
                                <div className="w-9 h-9 bg-green-100 text-green-600 flex items-center justify-center rounded-md">
                                    <FaUserGraduate className="text-lg" />
                                </div>
                                <p className="text-xs font-semibold text-gray-600">TOTAL</p>
                                <p className="text-green-600 text-md font-semibold mt-1">Students in the class</p>
                            </div>
                            <h3 className="text-5xl font-bold text-gray-800 px-6">{totalStudents}</h3>
                        </div>

                        {/* Present Today */}
                        <div className="bg-white rounded-[1.1rem] p-4 shadow-sm space-y-2.5 flex items-center justify-between">
                            <div className="flex flex-col space-y-1">
                                <div className="w-9 h-9 bg-blue-100 text-blue-600 flex items-center justify-center rounded-md">
                                    <FaClipboardList className="text-lg" />
                                </div>
                                <p className="text-xs font-semibold text-gray-600">TOTAL</p>
                                <p className="text-blue-600 text-md font-semibold mt-1">Students Present Today</p>
                            </div>
                            <p className="text-5xl font-bold text-gray-800 px-6">{presentToday.length}</p>
                        </div>

                        {/* Absent Today */}
                        <div className="bg-white rounded-[1.1rem] p-4 shadow-sm space-y-2.5 flex items-center justify-between">
                            <div className="flex flex-col space-y-1">
                                <div className="w-9 h-9 bg-red-100 text-red-600 flex items-center justify-center rounded-md">
                                    <FaUsers className="text-lg" />
                                </div>
                                <p className="text-xs font-semibold text-gray-600">TOTAL</p>
                                <p className="text-red-600 text-md font-semibold mt-1">Students Absent Today</p>
                            </div>
                            <h3 className="text-5xl font-bold text-gray-800 px-6">{absentStudents}</h3>
                        </div>
                    </div>

                    <div className="w-full flex flex-row gap-5">
                       
                        <div className="bg-white w-1/2 rounded-[1.1rem] shadow-md p-4">
                            <h1 className="text-gray-800 ml-2 text-md font-bold mb-2">Logs of Student Attendance</h1>
                            <div className="flex justify-end mb-2">
                                <label htmlFor="filter" className="text-sm text-gray-700 mr-2 font-semibold">Sort by Course:</label>
                                <select
                                    id="filter"
                                    value={selectedCourse}
                                    onChange={(e) => {
                                        setSelectedCourse(e.target.value);
                                        setCurrentPage(1); 
                                    }}
                                    className="border px-3 py-1 rounded-md text-sm"
                                >
                                    {courseList.map((course, idx) => (
                                        <option key={idx} value={course}>{course}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="overflow-x-auto mt-2">
                                <table className="min-w-full table-auto border-separate border-spacing-y-2 text-sm text-gray-900">
                                    <thead>
                                        <tr className="bg-[#F7F7F7] text-gray-900">
                                            <th className="text-left px-4 py-3 rounded-l-lg">Name</th>
                                            <th className="text-left px-4 py-3">USN</th>
                                            <th className="text-left px-4 py-3">Course</th>
                                            <th className="text-left px-4 py-3 rounded-r-lg">Timings</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {currentAttendance.length > 0 ? (
                                            currentAttendance.map((student, index) => (
                                                <tr key={index} className="hover:bg-[#f0f4f8] transition-colors duration-200 rounded-lg">
                                                    <td className="px-4 py-3">{student.name}</td>
                                                    <td className="px-4 py-3">{student.usn}</td>
                                                    <td className="px-4 py-3">{student.course}</td>
                                                    <td className="px-4 py-3">{new Date(student.recognized_at).toLocaleString()}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan="4" className="text-center text-gray-400">No attendance logs available</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                       
                        <div className="bg-white w-1/2 h-[14.5rem] rounded-[1.1rem] shadow-md p-5">
                            <h1 className="text-gray-800 text-md font-semibold">Add Attendance Manually</h1>
                            <div className="grid grid-cols-2 gap-2 mt-5">
                                <input type="text" name="manual_name" className="w-full placeholder:text-gray-700 rounded-xl bg-[#F7F7F7] px-4 py-2" placeholder="Enter the student's name" />
                                <input type="text" name="manual_usn" className="w-full placeholder:text-gray-700 rounded-xl bg-[#F7F7F7] px-4 py-2" placeholder="Enter the student's Usn" />
                                <input type="text" name="manual_course" className="w-full placeholder:text-gray-700 rounded-xl bg-[#F7F7F7] px-4 py-2" placeholder="Enter the student's Course" />
                                <input type="datetime-local" name="recognizedAt" className="w-full placeholder:text-gray-700 rounded-xl bg-[#F7F7F7] px-4 py-2" />
                            </div>
                            <button onClick={handleManualAttendance} className="w-[12rem] mt-4 rounded-xl p-2 bg-gradient-to-r from-blue-700 to-blue-600 font-bold text-white transition-all hover:opacity-90 hover:shadow-lg">
                                Mark Attendance
                            </button>
                        </div>
                    </div>

                    {/* Pagination */}
                    <div className="text-center text-gray-600 mt-4">
                        <span
                            onClick={() => currentPage > 1 && paginate(currentPage - 1)}
                            className={`mr-2 cursor-pointer hover:underline ${currentPage === 1 ? 'cursor-not-allowed text-gray-300' : ''}`}
                        >
                            Prev
                        </span>
                        <span className="font-semibold">Page {currentPage}</span>
                        <span
                            onClick={() => indexOfLastItem < filteredAttendance.length && paginate(currentPage + 1)}
                            className={`ml-2 cursor-pointer hover:underline ${indexOfLastItem >= filteredAttendance.length ? 'cursor-not-allowed text-gray-300' : ''}`}
                        >
                            Next
                        </span>
                    </div>

                    {/* Footer */}
                    <div className="text-center text-sm text-gray-500 mt-6">
                        © 2025, made with ❤️ by <span className="font-semibold text-gray-700">National Open University</span> for a better web.
                        <div className="text-right text-xs underline mt-1 cursor-pointer">Follow me</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;

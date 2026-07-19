import "./App.css";
import React, { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import { Breadcrumbs } from './components/Breadcrumbs';

const Enrolled = () => {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState('');
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'student')
          .order('created_at', { ascending: false });
        if (error) throw error;
        setStudents(data || []);
      } catch (err) {
        console.error("Error fetching students:", err);
      }
    };

    fetchStudents();
  }, []);

  const handleSearchChange = (e) => {
    const query = e.target.value.toLowerCase();
    setSearch(query);

    if (!query) {
      setFilteredSuggestions([]);
    } else {
      const suggestions = students.filter((student) => {
        const nameMatch = student.full_name?.toLowerCase().includes(query);
        const matricMatch = student.matric_number?.toLowerCase().includes(query);
        return nameMatch || matricMatch;
      });
      setFilteredSuggestions(suggestions);
    }
  };

  const handleSuggestionClick = (student) => {
    setSelectedStudent(student);
    setSearch('');
    setFilteredSuggestions([]);
  };

  const closeModal = () => setSelectedStudent(null);

  return (
    <>
      {selectedStudent && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <div className="bg-white rounded-xl p-6 w-96 shadow-lg relative">
            <button onClick={closeModal} className="absolute top-2 right-3 text-xl text-gray-600 hover:text-black">
              &times;
            </button>
            <h2 className="text-lg font-semibold mb-4">Student Details</h2>
            <div className="space-y-2 text-sm text-gray-800">
              <p><strong>Name:</strong> {selectedStudent.full_name}</p>
              <p><strong>Matric Number:</strong> {selectedStudent.matric_number}</p>
              <p><strong>Programme:</strong> {selectedStudent.programme}</p>
              <p><strong>Department:</strong> {selectedStudent.department}</p>
              <p><strong>Phone:</strong> {selectedStudent.phone}</p>
              <p><strong>Face Enrolled:</strong> {selectedStudent.face_enrolled ? 'Yes' : 'No'}</p>
              <p><strong>Joined At:</strong> {new Date(selectedStudent.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <Breadcrumbs items={[{ label: "Enrolled" }]} />
          <h1 className="text-lg font-semibold">Enrolled Students</h1>
        </div>
        <div className="relative">
          <input
            type="text"
            placeholder="Search Student Here"
            value={search}
            onChange={handleSearchChange}
            className="text-gray-900 placeholder:text-gray-700 rounded-xl bg-[#F7F7F7] px-4 py-2 focus:ring-2 focus:ring-blue-500 w-80"
          />
          {filteredSuggestions.length > 0 && (
            <div className="absolute w-full mt-1 bg-white shadow-lg rounded-lg max-h-60 overflow-auto z-10">
              <ul className="text-sm text-gray-800">
                {filteredSuggestions.map((student) => (
                  <li
                    key={student.id}
                    className="py-2 px-4 hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleSuggestionClick(student)}
                  >
                    {student.full_name} ({student.matric_number})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Students Table */}
      <div className="bg-white rounded-[1.1rem] shadow-md p-4">
        <h1 className="text-gray-900 ml-2 font-bold">List of Enrolled Students</h1>
        <div className="overflow-x-auto mt-5">
          <table className="min-w-full table-auto border-separate border-spacing-y-2 text-sm text-gray-900">
            <thead>
              <tr className="bg-[#F7F7F7] text-gray-900">
                <th className="text-left px-4 py-3 rounded-l-lg">Name</th>
                <th className="text-left px-4 py-3">Matric Number</th>
                <th className="text-left px-4 py-3">Programme</th>
                <th className="text-left px-4 py-3">Department</th>
                <th className="text-left px-4 py-3">Phone</th>
                <th className="text-left px-4 py-3 rounded-r-lg">Face Enrolled</th>
              </tr>
            </thead>
            <tbody>
              {students.length > 0 ? (
                students.map((student) => (
                  <tr key={student.id} className="hover:bg-[#f0f4f8] transition duration-200">
                    <td className="px-4 py-3">{student.full_name}</td>
                    <td className="px-4 py-3">{student.matric_number}</td>
                    <td className="px-4 py-3">{student.programme}</td>
                    <td className="px-4 py-3">{student.department}</td>
                    <td className="px-4 py-3">{student.phone}</td>
                    <td className="px-4 py-3 rounded-r-lg">{student.face_enrolled ? 'Yes' : 'No'}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="text-center py-4 text-gray-500">No students enrolled.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default Enrolled;

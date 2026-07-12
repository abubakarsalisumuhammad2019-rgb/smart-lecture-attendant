import React, { useEffect, useState } from 'react';
import Papa from 'papaparse';
import { motion } from 'motion/react';
import { supabase } from '../lib/supabaseClient';
import { deriveLevelFromCode } from '../lib/courseHelpers';

const LEVELS = [100, 200, 300, 400, 500, 600];

export default function Courses() {
  const [courses, setCourses] = useState([]);
  const [activeSession, setActiveSession] = useState('');
  const [activeSemester, setActiveSemester] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [newCourse, setNewCourse] = useState({ course_code: '', course_title: '', credit_units: '', programme: '', level: '' });
  const [levelTouched, setLevelTouched] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [settingsRes, coursesRes] = await Promise.all([
      supabase.from('app_settings').select('*'),
      supabase.from('courses').select('*').order('academic_session', { ascending: false }).order('course_code'),
    ]);
    const map = Object.fromEntries((settingsRes.data || []).map((row) => [row.key, row.value]));
    setActiveSession(map.active_academic_session || '');
    setActiveSemester(map.active_semester || '');
    setCourses(coursesRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCourseCodeChange = (value) => {
    setNewCourse((c) => ({
      ...c,
      course_code: value,
      // Auto-fill level from the code unless the admin has manually picked one.
      level: levelTouched ? c.level : (deriveLevelFromCode(value) ?? ''),
    }));
  };

  const handleAddCourse = async () => {
    if (!newCourse.course_code.trim() || !newCourse.course_title.trim()) {
      setMessage('Course code and title are required.');
      return;
    }
    const { error } = await supabase.from('courses').insert({
      course_code: newCourse.course_code.trim().toUpperCase(),
      course_title: newCourse.course_title.trim(),
      credit_units: newCourse.credit_units ? Number(newCourse.credit_units) : null,
      programme: newCourse.programme || null,
      level: newCourse.level ? Number(newCourse.level) : null,
      semester: activeSemester,
      academic_session: activeSession,
    });
    if (error) {
      setMessage(error.code === '23505' ? 'That course code already exists for the active session/semester.' : error.message);
    } else {
      setMessage('Course added.');
      setNewCourse({ course_code: '', course_title: '', credit_units: '', programme: '', level: '' });
      setLevelTouched(false);
      load();
    }
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async ({ data }) => {
        setImporting(true);
        setImportResults(null);

        const existingCodes = new Set(courses.filter((c) => c.academic_session === activeSession && c.semester === activeSemester).map((c) => c.course_code));
        const seenInBatch = new Set();
        const results = { created: 0, skipped: 0, failed: [] };

        for (const row of data) {
          const code = row.course_code?.trim()?.toUpperCase();
          const title = row.course_title?.trim();
          if (!code || !title) {
            results.failed.push({ code: code || '(blank)', reason: 'missing course_code or course_title' });
            continue;
          }
          if (existingCodes.has(code) || seenInBatch.has(code)) {
            results.skipped += 1;
            continue;
          }
          seenInBatch.add(code);

          const { error } = await supabase.from('courses').insert({
            course_code: code,
            course_title: title,
            credit_units: row.credit_units ? Number(row.credit_units) : null,
            programme: row.programme || null,
            level: row.level ? Number(row.level) : deriveLevelFromCode(code),
            semester: activeSemester,
            academic_session: activeSession,
          });

          if (error) {
            results.failed.push({ code, reason: error.message });
          } else {
            results.created += 1;
          }
        }

        setImportResults(results);
        setImporting(false);
        load();
      },
    });

    e.target.value = '';
  };

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <p>Pages / Courses</p>
          <h1 className="text-lg font-semibold">Courses</h1>
        </div>
      </div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 text-blue-700 text-sm rounded-xl px-4 py-2 mb-4"
        >
          {message}
        </motion.div>
      )}

      <div className="bg-white rounded-[1.1rem] shadow-md p-4 sm:p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
          <h2 className="text-gray-900 font-semibold">Add a Course</h2>
          <label className="text-sm font-medium text-blue-600 hover:underline cursor-pointer w-full sm:w-auto text-center sm:text-left whitespace-nowrap">
            {importing ? 'Importing…' : 'Bulk import from CSV'}
            <input type="file" accept=".csv" onChange={handleImportFile} disabled={importing} className="hidden" />
          </label>
        </div>

        {importResults && (
          <div className="mb-4 text-sm bg-gray-50 rounded-xl p-3">
            <p className="font-medium text-gray-700">{importResults.created} created, {importResults.skipped} already existed (skipped).</p>
            {importResults.failed.length > 0 && (
              <ul className="mt-1 text-red-500 text-xs list-disc list-inside">
                {importResults.failed.map((f, idx) => (
                  <li key={idx}>{f.code}: {f.reason}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="text-xs text-gray-400 mb-4">
          CSV columns: course_code, course_title, credit_units, programme, level (level is auto-derived from the code if omitted).
        </p>

        <div className="grid grid-cols-1 gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Course Code *</label>
              <input
                value={newCourse.course_code}
                onChange={(e) => handleCourseCodeChange(e.target.value)}
                placeholder="e.g. CIT 403"
                className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Credit Units</label>
              <input
                value={newCourse.credit_units}
                onChange={(e) => setNewCourse({ ...newCourse, credit_units: e.target.value })}
                placeholder="e.g. 2"
                type="number"
                className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Course Title *</label>
            <input
              value={newCourse.course_title}
              onChange={(e) => setNewCourse({ ...newCourse, course_title: e.target.value })}
              placeholder="e.g. Database Design and Management"
              className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Programme</label>
            <input
              value={newCourse.programme}
              onChange={(e) => setNewCourse({ ...newCourse, programme: e.target.value })}
              placeholder="e.g. BSc Computer Science"
              className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Level</label>
            <select
              value={newCourse.level}
              onChange={(e) => { setLevelTouched(true); setNewCourse({ ...newCourse, level: e.target.value }); }}
              className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm"
            >
              <option value="">Select level</option>
              {LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>{lvl} Level</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Academic Session</label>
              <input value={activeSession} disabled className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm bg-gray-100 text-gray-500" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Semester</label>
              <input value={activeSemester} disabled className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm bg-gray-100 text-gray-500" />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 -mt-2">Change session / semester in Admin → Settings.</p>

          <button
            onClick={handleAddCourse}
            className="h-11 rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-4 font-bold text-white hover:opacity-90 transition-opacity w-full sm:w-auto sm:self-end"
          >
            + Add Course
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[1.1rem] shadow-md p-4 sm:p-6">
        <h2 className="text-gray-900 font-semibold mb-4">All Courses</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto border-separate border-spacing-y-2 text-sm text-gray-900">
            <thead>
              <tr className="bg-[#F7F7F7]">
                <th className="text-left px-4 py-2 rounded-l-lg">Code</th>
                <th className="text-left px-4 py-2">Title</th>
                <th className="text-left px-4 py-2">Units</th>
                <th className="text-left px-4 py-2">Programme</th>
                <th className="text-left px-4 py-2">Level</th>
                <th className="text-left px-4 py-2">Session</th>
                <th className="text-left px-4 py-2 rounded-r-lg">Semester</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" className="text-center py-4 text-gray-500">Loading…</td></tr>
              ) : courses.length > 0 ? courses.map((c) => (
                <tr key={c.id} className="hover:bg-[#f0f4f8] transition-colors duration-200">
                  <td className="px-4 py-2">{c.course_code}</td>
                  <td className="px-4 py-2">{c.course_title}</td>
                  <td className="px-4 py-2">{c.credit_units ?? '—'}</td>
                  <td className="px-4 py-2">{c.programme ?? '—'}</td>
                  <td className="px-4 py-2">{c.level ?? '—'}</td>
                  <td className="px-4 py-2">{c.academic_session}</td>
                  <td className="px-4 py-2">{c.semester}</td>
                </tr>
              )) : (
                <tr><td colSpan="7" className="text-center py-4 text-gray-500">No courses yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

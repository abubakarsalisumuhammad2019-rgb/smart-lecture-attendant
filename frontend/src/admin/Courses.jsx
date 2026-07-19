import { motion } from "motion/react";
import Papa from "papaparse";
import { useEffect, useState } from "react";
import { deriveLevelFromCode } from "../lib/courseHelpers";
import { supabase } from "../lib/supabaseClient";
import { CourseForm } from "../shared/CourseForm";
import { Breadcrumbs } from "../components/Breadcrumbs";

export default function Courses() {
  const [courses, setCourses] = useState([]);
  const [activeSession, setActiveSession] = useState("");
  const [activeSemester, setActiveSemester] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    const [settingsRes, coursesRes] = await Promise.all([
      supabase.from("app_settings").select("*"),
      supabase
        .from("courses")
        .select("*")
        .order("academic_session", { ascending: false })
        .order("course_code"),
    ]);
    const map = Object.fromEntries(
      (settingsRes.data || []).map((row) => [row.key, row.value]),
    );
    setActiveSession(map.active_academic_session || "");
    setActiveSemester(map.active_semester || "");
    setCourses(coursesRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Guards against the same race CourseForm had: activeSession/activeSemester
    // are fetched once on mount, so importing before that resolves (or if
    // no active session is configured at all) would silently write rows
    // with a blank academic_session, breaking the facilitator-assignment
    // check in create-lecture later.
    if (!activeSession || !activeSemester) {
      setMessage("Active academic session/semester isn't set. Configure it in Admin → Settings first.");
      e.target.value = "";
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async ({ data }) => {
        setImporting(true);
        setImportResults(null);

        const existingCodes = new Set(
          courses
            .filter(
              (c) =>
                c.academic_session === activeSession &&
                c.semester === activeSemester,
            )
            .map((c) => c.course_code),
        );
        const seenInBatch = new Set();
        const results = { created: 0, skipped: 0, failed: [] };

        for (const row of data) {
          const code = row.course_code?.trim()?.toUpperCase();
          const title = row.course_title?.trim();
          if (!code || !title) {
            results.failed.push({
              code: code || "(blank)",
              reason: "missing course_code or course_title",
            });
            continue;
          }
          if (existingCodes.has(code) || seenInBatch.has(code)) {
            results.skipped += 1;
            continue;
          }
          seenInBatch.add(code);

          const { error } = await supabase.from("courses").insert({
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

    e.target.value = "";
  };

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <Breadcrumbs items={[{ label: "Courses" }]} />
          <h1 className="text-lg font-semibold">Courses</h1>
        </div>
        <div className="flex gap-3">
          <label className="rounded-xl bg-white text-blue-700 px-5 py-2 font-bold hover:bg-gray-100 cursor-pointer whitespace-nowrap">
            {importing ? "Importing…" : "Bulk Import"}
            <input
              type="file"
              accept=".csv"
              onChange={handleImportFile}
              disabled={importing}
              className="hidden"
            />
          </label>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-2 font-bold text-white hover:opacity-90"
          >
            + New Course
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md px-4 py-2 mb-4">
        <p className="text-xs text-gray-400">
          Bulk import CSV columns: course_code, course_title, credit_units,
          programme, level (level is auto-derived from the code if omitted).
        </p>
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

      {importResults && (
        <div className="mb-4 text-sm bg-white rounded-xl shadow-md p-4">
          <p className="font-medium text-gray-700">
            {importResults.created} created, {importResults.skipped} already
            existed (skipped).
          </p>
          {importResults.failed.length > 0 && (
            <ul className="mt-1 text-red-500 text-xs list-disc list-inside">
              {importResults.failed.map((f, idx) => (
                <li key={idx}>
                  {f.code}: {f.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showForm && (
        <CourseForm
          onClose={() => setShowForm(false)}
          onCreated={() => {
            setShowForm(false);
            setMessage("Course added.");
            load();
          }}
        />
      )}

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
                <tr>
                  <td colSpan="7" className="text-center py-4 text-gray-500">
                    Loading…
                  </td>
                </tr>
              ) : courses.length > 0 ? (
                courses.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-[#f0f4f8] transition-colors duration-200"
                  >
                    <td className="px-4 py-2">{c.course_code}</td>
                    <td className="px-4 py-2">{c.course_title}</td>
                    <td className="px-4 py-2">{c.credit_units ?? ""}</td>
                    <td className="px-4 py-2">{c.programme ?? ""}</td>
                    <td className="px-4 py-2">{c.level ?? ""}</td>
                    <td className="px-4 py-2">{c.academic_session}</td>
                    <td className="px-4 py-2">{c.semester}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="text-center py-4 text-gray-500">
                    No courses yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

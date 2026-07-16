import { useEffect, useState } from "react";
import { deriveLevelFromCode } from "../lib/courseHelpers";
import { getAllProgrammes } from "../lib/programmes";
import { supabase } from "../lib/supabaseClient";

const LEVELS = [100, 200, 300, 400, 500, 600];
const PROGRAMMES = getAllProgrammes();

// Admin-only: creates a course under the active session/semester.
export function CourseForm({ onClose, onCreated }) {
  const [courseCode, setCourseCode] = useState("");
  const [courseTitle, setCourseTitle] = useState("");
  const [creditUnits, setCreditUnits] = useState("");
  const [programme, setProgramme] = useState("");
  const [level, setLevel] = useState("");
  const [levelTouched, setLevelTouched] = useState(false);
  const [activeSession, setActiveSession] = useState("");
  const [activeSemester, setActiveSemester] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("app_settings").select("*");
      const map = Object.fromEntries((data || []).map((row) => [row.key, row.value]));
      setActiveSession(map.active_academic_session || "");
      setActiveSemester(map.active_semester || "");
    };
    load();
  }, []);

  const handleCourseCodeChange = (value) => {
    setCourseCode(value);
    if (!levelTouched) {
      setLevel(deriveLevelFromCode(value) ?? "");
    }
  };

  const handleSubmit = async () => {
    if (!courseCode.trim() || !courseTitle.trim()) {
      setError("Course code and title are required.");
      return;
    }

    setSubmitting(true);
    setError("");

    const { error: insertErr } = await supabase.from("courses").insert({
      course_code: courseCode.trim().toUpperCase(),
      course_title: courseTitle.trim(),
      credit_units: creditUnits ? Number(creditUnits) : null,
      programme: programme || null,
      level: level ? Number(level) : null,
      semester: activeSemester,
      academic_session: activeSession,
    });

    setSubmitting(false);

    if (insertErr) {
      setError(
        insertErr.code === "23505"
          ? "That course code already exists for the active session/semester."
          : insertErr.message,
      );
      return;
    }

    onCreated();
  };

  const inputClass =
    "h-11 px-3 border border-gray-200 rounded-xl text-sm w-full text-gray-900 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">New Course</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Add a course to the active session and semester.
          </p>
        </div>

        <div className="px-6 py-5 overflow-y-auto scrollbar-hide">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-3 mb-4">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Course Code *</label>
                <input
                  value={courseCode}
                  onChange={(e) => handleCourseCodeChange(e.target.value)}
                  placeholder="e.g. CIT 403"
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Credit Units</label>
                <input
                  value={creditUnits}
                  onChange={(e) => setCreditUnits(e.target.value)}
                  placeholder="e.g. 2"
                  type="number"
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">Course Title *</label>
              <input
                value={courseTitle}
                onChange={(e) => setCourseTitle(e.target.value)}
                placeholder="e.g. Database Design and Management"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Programme</label>
                <select
                  value={programme}
                  onChange={(e) => setProgramme(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Select programme</option>
                  {PROGRAMMES.map((prog) => (
                    <option key={prog} value={prog}>
                      {prog}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Level</label>
                <select
                  value={level}
                  onChange={(e) => {
                    setLevelTouched(true);
                    setLevel(e.target.value);
                  }}
                  className={inputClass}
                >
                  <option value="">Select level</option>
                  {LEVELS.map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {lvl} Level
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-gray-100">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Active Period
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Session</label>
                  <input
                    value={activeSession}
                    disabled
                    className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-500"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Semester</label>
                  <input
                    value={activeSemester}
                    disabled
                    className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-500"
                  />
                </div>
              </div>
              <p className="text-[11px] text-gray-400 mt-2">
                Change session / semester in Admin → Settings.
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/60">
          <button
            onClick={onClose}
            className="text-gray-600 px-4 py-2 rounded-xl hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2 font-bold text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create Course"}
          </button>
        </div>
      </div>
    </div>
  );
}

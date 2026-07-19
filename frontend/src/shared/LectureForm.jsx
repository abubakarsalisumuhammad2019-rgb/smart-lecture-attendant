import { useEffect, useState } from "react";
import { getFunctionErrorMessage } from "../lib/functionError";
import { supabase } from "../lib/supabaseClient";

function addHours(datetimeLocalValue, hours) {
  if (!datetimeLocalValue) return "";
  const d = new Date(datetimeLocalValue);
  d.setHours(d.getHours() + hours);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Admin-only: schedules a lecture (course + facilitator + time). This does
// NOT create the meeting itself -- the facilitator sets that up later from
// their own dashboard (see lecturer/Dashboard.jsx "Set up Meeting").
export function LectureForm({ onClose, onCreated }) {
  const [facilitators, setFacilitators] = useState([]);
  const [facilitatorId, setFacilitatorId] = useState("");
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [endTimeTouched, setEndTimeTouched] = useState(false);
  const [activeSession, setActiveSession] = useState("");
  const [activeSemester, setActiveSemester] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const [facilitatorsRes, settingsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name")
          .eq("role", "lecturer")
          .eq("status", "active")
          .order("full_name"),
        supabase.from("app_settings").select("*"),
      ]);
      setFacilitators(facilitatorsRes.data || []);
      const map = Object.fromEntries(
        (settingsRes.data || []).map((row) => [row.key, row.value]),
      );
      setActiveSession(map.active_academic_session || "");
      setActiveSemester(map.active_semester || "");
    };
    load();
  }, []);

  const handleFacilitatorChange = async (id) => {
    setFacilitatorId(id);
    setCourseId("");
    if (!id) {
      setCourses([]);
      return;
    }
    const { data } = await supabase
      .from("lecturer_courses")
      .select("course_id, courses(id, course_code, course_title)")
      .eq("lecturer_id", id);
    setCourses((data || []).map((row) => row.courses).filter(Boolean));
  };

  const handleStartTimeChange = (value) => {
    setStartTime(value);
    if (!endTimeTouched) {
      setEndTime(addHours(value, 2));
    }
  };

  const handleSubmit = async () => {
    if (!facilitatorId || !courseId || !startTime || !endTime) {
      setError("All fields are required.");
      return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMinutes = Math.round((end - start) / 60000);

    if (durationMinutes <= 0) {
      setError("End time must be after the start time.");
      return;
    }

    const selectedCourse = courses.find((c) => c.id === courseId);
    const topic = selectedCourse
      ? `${selectedCourse.course_code}  ${selectedCourse.course_title}`
      : "";

    setSubmitting(true);
    setError("");

    const { error: fnError } = await supabase.functions.invoke(
      "create-lecture",
      {
        body: {
          course_id: courseId,
          facilitator_id: facilitatorId,
          topic,
          start_time: start.toISOString(),
          duration_minutes: durationMinutes,
        },
      },
    );

    setSubmitting(false);

    if (fnError) {
      setError(
        await getFunctionErrorMessage(fnError, "Failed to create lecture."),
      );
      return;
    }

    onCreated();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-4">New Lecture</h2>

        {error && (
          <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-3 mb-4">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">
              Facilitator
            </label>
            <select
              value={facilitatorId}
              onChange={(e) => handleFacilitatorChange(e.target.value)}
              className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm"
            >
              <option value="">Select facilitator</option>
              {facilitators.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700">Course</label>
            <select
              value={courseId}
              onChange={(e) => setCourseId(e.target.value)}
              disabled={!facilitatorId}
              className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm disabled:bg-gray-100"
            >
              <option value="">Select course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.course_code} {c.course_title}
                </option>
              ))}
            </select>
            {facilitatorId && courses.length === 0 && (
              <p className="text-xs text-gray-400">
                This lecturer has no assigned courses yet assign one from Users
                first.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Start time
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => handleStartTimeChange(e.target.value)}
                className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                End time
              </label>
              <input
                type="datetime-local"
                value={endTime}
                onChange={(e) => {
                  setEndTimeTouched(true);
                  setEndTime(e.target.value);
                }}
                className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm"
              />
              <p className="text-[11px] text-gray-400">
                Auto-set to +2h from start
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Session
              </label>
              <input
                value={activeSession}
                disabled
                className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm bg-gray-100 text-gray-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-gray-700">
                Semester
              </label>
              <input
                value={activeSemester}
                disabled
                className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm bg-gray-100 text-gray-500"
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 -mt-2">
            Change session / semester in Admin → Settings.
          </p>
        </div>

        <div className="border-t border-gray-100 pt-3 mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="text-gray-600 px-4 py-2 rounded-xl hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2 font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create Lecture"}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

function formatTime(iso) {
  return iso
    ? new Date(iso).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
}

const STATUS_STYLES = {
  attended: "text-green-600",
  registered: "text-blue-500",
  no_show: "text-red-500",
};

export default function LectureRoster() {
  const { lectureId } = useParams();
  const [lecture, setLecture] = useState(null);
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    setLoading(true);

    const { data: lectureRow } = await supabase
      .from("lectures")
      .select("*, courses(id, course_code, course_title)")
      .eq("id", lectureId)
      .single();
    setLecture(lectureRow || null);

    if (lectureRow) {
      const [{ data: enrollments }, { data: attendance }] = await Promise.all([
        supabase
          .from("enrollments")
          .select("student_id, profiles(id, full_name, matric_number)")
          .eq("course_id", lectureRow.course_id)
          .eq("academic_session", lectureRow.academic_session),
        supabase
          .from("lecture_attendance")
          .select("*")
          .eq("lecture_id", lectureId),
      ]);

      const attendanceByStudent = Object.fromEntries(
        (attendance || []).map((a) => [a.student_id, a]),
      );
      const merged = (enrollments || [])
        .filter((e) => e.profiles)
        .map((e) => ({
          student: e.profiles,
          attendance: attendanceByStudent[e.student_id] || null,
        }))
        .sort((a, b) =>
          (a.student.full_name || "").localeCompare(b.student.full_name || ""),
        );

      setRoster(merged);
    } else {
      setRoster([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId]);

  const handleMark = async (studentId, status) => {
    setSavingId(studentId);
    setMessage("");

    const { error } = await supabase
      .from("lecture_attendance")
      .upsert(
        { lecture_id: lectureId, student_id: studentId, status },
        { onConflict: "lecture_id,student_id" },
      );

    setSavingId(null);

    if (error) {
      setMessage(error.message);
      return;
    }

    load();
  };

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <p>Pages / Dashboard / Roster</p>
          <h1 className="text-lg font-semibold">
            {lecture?.topic || "Roster"}
          </h1>
        </div>
        <Link
          to="/lecturer/dashboard"
          className="rounded-xl bg-white text-blue-700 px-5 py-2 font-bold hover:bg-gray-100"
        >
          Back to Dashboard
        </Link>
      </div>

      {message && (
        <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-2 mb-4">
          {message}
        </div>
      )}

      <div className="bg-white rounded-[1.1rem] shadow-md p-4">
        <p className="text-xs text-gray-400 mb-4">
          Attendance updates automatically from Zoom join/leave events. Use the
          manual override below only when face verification failed for a
          legitimate reason (e.g. bad lighting/camera).
        </p>
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto border-separate border-spacing-y-2 text-sm text-gray-900">
            <thead>
              <tr className="bg-[#F7F7F7] text-gray-900">
                <th className="text-left px-4 py-3 rounded-l-lg">Student</th>
                <th className="text-left px-4 py-3">Matric No.</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">First Joined</th>
                <th className="text-left px-4 py-3">Last Left</th>
                <th className="text-left px-4 py-3 rounded-r-lg">
                  Manual Override
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="text-center py-4 text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : roster.length > 0 ? (
                roster.map(({ student, attendance }) => (
                  <tr key={student.id} className="hover:bg-[#f0f4f8]">
                    <td className="px-4 py-3">{student.full_name}</td>
                    <td className="px-4 py-3">{student.matric_number || ""}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          STATUS_STYLES[attendance?.status] || "text-gray-400"
                        }
                      >
                        {attendance?.status || "not registered"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {formatTime(attendance?.first_joined_at)}
                    </td>
                    <td className="px-4 py-3">
                      {formatTime(attendance?.last_left_at)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          disabled={savingId === student.id}
                          onClick={() => handleMark(student.id, "attended")}
                          className="text-green-600 hover:underline text-xs disabled:opacity-50"
                        >
                          Mark attended
                        </button>
                        <button
                          disabled={savingId === student.id}
                          onClick={() => handleMark(student.id, "no_show")}
                          className="text-red-500 hover:underline text-xs disabled:opacity-50"
                        >
                          Mark no-show
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="text-center py-4 text-gray-500">
                    No students enrolled in this course yet.
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

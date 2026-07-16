import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { FaLayerGroup, FaBook, FaCalendarCheck, FaVideo } from "react-icons/fa";
import { useAuth } from "../lib/AuthContext";
import { getFunctionErrorMessage } from "../lib/functionError";
import { supabase } from "../lib/supabaseClient";
import { CancelModal } from "../shared/CancelModal";
import { RescheduleModal } from "../shared/RescheduleModal";

const COLOR_MAP = {
  teal: "bg-teal-100 text-teal-600",
  indigo: "bg-indigo-100 text-indigo-600",
  green: "bg-green-100 text-green-600",
  orange: "bg-orange-100 text-orange-600",
};

function StatCard({ icon: Icon, color, label, value, index }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.25, ease: "easeOut" }}
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
  const [counts, setCounts] = useState({ courses: 0, upcoming: 0, zoomPending: 0 });
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");
  const [settingUpId, setSettingUpId] = useState(null);
  const [reschedulingLecture, setReschedulingLecture] = useState(null);
  const [cancelingLecture, setCancelingLecture] = useState(null);

  const loadData = async () => {
    setLoading(true);

    const { data: settingsRows } = await supabase.from("app_settings").select("*");
    const settingsMap = Object.fromEntries((settingsRows || []).map((s) => [s.key, s.value]));
    const activeSession = settingsMap.active_academic_session || "";

    const [lecturesRes, coursesCountRes, hostSecretsRes] = await Promise.all([
      supabase
        .from("lectures")
        .select("*, courses(course_code, course_title), profiles(full_name)")
        .eq("facilitator_id", profile.id)
        .order("start_time", { ascending: false }),
      supabase
        .from("lecturer_courses")
        .select("id", { count: "exact", head: true })
        .eq("lecturer_id", profile.id)
        .eq("academic_session", activeSession),
      // RLS scopes this to the lecturer's own lectures already -- the real
      // Zoom "start as host" link, as opposed to meeting_web_url (join_url),
      // which just drops anyone -- lecturer included -- into the attendee
      // waiting room since every meeting is created under one shared
      // institutional Zoom account, not the lecturer's own.
      supabase.from("lecture_host_secrets").select("lecture_id, meeting_start_url"),
    ]);

    const hostUrlByLectureId = Object.fromEntries(
      (hostSecretsRes.data || []).map((h) => [h.lecture_id, h.meeting_start_url]),
    );
    const allLectures = (lecturesRes.data || []).map((l) => ({
      ...l,
      host_start_url: hostUrlByLectureId[l.id] || null,
    }));
    const now = new Date();
    const upcoming = allLectures.filter(
      (l) => (l.status === "scheduled" || l.status === "rescheduled") && new Date(l.start_time) >= now
    );
    const zoomPending = allLectures.filter((l) => !l.meeting_web_url && l.status !== "cancelled");

    setLectures(allLectures);
    setCounts({
      courses: coursesCountRes.count || 0,
      upcoming: upcoming.length,
      zoomPending: zoomPending.length,
    });
    setLoading(false);
  };

  useEffect(() => {
    if (profile?.id) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const handleSetUpZoom = async (lectureId) => {
    setSettingUpId(lectureId);
    setActionMessage("");

    const { error } = await supabase.functions.invoke("zoom-create-meeting", {
      body: { lecture_id: lectureId },
    });

    setSettingUpId(null);

    if (error) {
      setActionMessage(await getFunctionErrorMessage(error, "Failed to set up Zoom."));
      return;
    }

    setActionMessage("Zoom session created.");
    loadData();
  };

  const now = new Date();
  const nextUp = lectures
    .filter((l) => (l.status === "scheduled" || l.status === "rescheduled") && new Date(l.start_time) >= now)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <p>Pages / Dashboard</p>
          <h1 className="text-lg font-semibold">Dashboard</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard index={0} icon={FaLayerGroup} color="teal" label="Assigned Courses" value={counts.courses} />
        <StatCard index={1} icon={FaCalendarCheck} color="green" label="Upcoming Lectures" value={counts.upcoming} />
        <StatCard index={2} icon={FaVideo} color="orange" label="Zoom Pending Setup" value={counts.zoomPending} />
      </div>

      {actionMessage && (
        <div className="bg-blue-50 text-blue-700 text-sm rounded-xl px-4 py-2 mb-4">{actionMessage}</div>
      )}

      {!loading && nextUp && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="bg-white rounded-[1.1rem] shadow-md p-4 sm:p-6 mb-6"
        >
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Next Up</p>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-gray-900 font-semibold">{nextUp.topic}</h2>
                {nextUp.status === "rescheduled" && (
                  <span className="text-[11px] font-medium text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">
                    rescheduled
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-1">
                {nextUp.courses?.course_code} &middot; {new Date(nextUp.start_time).toLocaleString()}
              </p>
              <div className="flex flex-wrap gap-3">
                <Link to={`/lecturer/lectures/${nextUp.id}/roster`} className="text-blue-600 hover:underline text-xs">
                  Roster
                </Link>
                <button onClick={() => setReschedulingLecture(nextUp)} className="text-blue-600 hover:underline text-xs">
                  Reschedule
                </button>
                <button onClick={() => setCancelingLecture(nextUp)} className="text-red-500 hover:underline text-xs">
                  Cancel
                </button>
              </div>
            </div>
            {nextUp.meeting_web_url ? (
              <a
                href={nextUp.host_start_url || nextUp.meeting_web_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-2 font-bold text-white hover:opacity-90 text-center"
              >
                {nextUp.host_start_url ? "Start Meeting" : "Join Zoom"}
              </a>
            ) : (
              <button
                onClick={() => handleSetUpZoom(nextUp.id)}
                disabled={settingUpId === nextUp.id}
                className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-2 font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {settingUpId === nextUp.id ? "Setting up…" : "Set up Zoom"}
              </button>
            )}
          </div>
        </motion.div>
      )}

      {reschedulingLecture && (
        <RescheduleModal
          lecture={reschedulingLecture}
          onClose={() => setReschedulingLecture(null)}
          onRescheduled={() => {
            setReschedulingLecture(null);
            setActionMessage("Lecture rescheduled.");
            loadData();
          }}
        />
      )}

      {cancelingLecture && (
        <CancelModal
          lecture={cancelingLecture}
          onClose={() => setCancelingLecture(null)}
          onCancelled={() => {
            setCancelingLecture(null);
            setActionMessage("Lecture cancelled.");
            loadData();
          }}
        />
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
                <th className="text-left px-4 py-3">Zoom</th>
                <th className="text-left px-4 py-3 rounded-r-lg">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="text-center py-4 text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : lectures.length > 0 ? (
                lectures.map((lecture) => (
                  <tr key={lecture.id} className="hover:bg-[#f0f4f8]">
                    <td className="px-4 py-3">{lecture.topic}</td>
                    <td className="px-4 py-3">{lecture.courses?.course_code}</td>
                    <td className="px-4 py-3">{new Date(lecture.start_time).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          lecture.status === "cancelled"
                            ? "text-red-500"
                            : lecture.status === "rescheduled"
                              ? "text-orange-500"
                              : lecture.status === "completed"
                                ? "text-gray-400"
                                : "text-green-600"
                        }
                      >
                        {lecture.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lecture.meeting_web_url ? (
                        <span className="text-green-600">Ready</span>
                      ) : (
                        <span className="text-orange-500">Not set up</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {!lecture.meeting_web_url && lecture.status !== "cancelled" && (
                          <button
                            onClick={() => handleSetUpZoom(lecture.id)}
                            disabled={settingUpId === lecture.id}
                            className="text-blue-600 hover:underline text-xs disabled:opacity-50"
                          >
                            {settingUpId === lecture.id ? "Setting up…" : "Set up Zoom"}
                          </button>
                        )}
                        {lecture.meeting_web_url && lecture.status !== "cancelled" && (
                          <a
                            href={lecture.host_start_url || lecture.meeting_web_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline text-xs"
                          >
                            {lecture.host_start_url ? "Start" : "Join"}
                          </a>
                        )}
                        <Link to={`/lecturer/lectures/${lecture.id}/roster`} className="text-blue-600 hover:underline text-xs">
                          Roster
                        </Link>
                        {lecture.status !== "cancelled" && (
                          <>
                            <button onClick={() => setReschedulingLecture(lecture)} className="text-blue-600 hover:underline text-xs">
                              Reschedule
                            </button>
                            <button onClick={() => setCancelingLecture(lecture)} className="text-red-500 hover:underline text-xs">
                              Cancel
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="text-center py-4 text-gray-500">
                    No lectures yet. Ask an admin to schedule one for you.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      <div className="text-center text-sm text-gray-500 mt-6">
        © 2025, made with ❤️ by <span className="font-semibold text-gray-700">National Open University</span> for a better web.
      </div>
    </>
  );
}

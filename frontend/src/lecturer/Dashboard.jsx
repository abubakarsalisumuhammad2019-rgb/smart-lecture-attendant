import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { FaLayerGroup, FaBook, FaCalendarCheck, FaVideo } from "react-icons/fa";
import { FiHelpCircle } from "react-icons/fi";
import { useAuth } from "../lib/AuthContext";
import { getFunctionErrorMessage } from "../lib/functionError";
import { getMeetingAvailability } from "../lib/lectureTiming";
import { supabase } from "../lib/supabaseClient";
import { CancelModal } from "../shared/CancelModal";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { RescheduleModal } from "../shared/RescheduleModal";
import { RowActionsMenu } from "../shared/RowActionsMenu";
import { Breadcrumbs } from "../components/Breadcrumbs";

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
  const [counts, setCounts] = useState({ courses: 0, upcoming: 0, meetingPending: 0 });
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState("");
  const [settingUpId, setSettingUpId] = useState(null);
  const [reschedulingLecture, setReschedulingLecture] = useState(null);
  const [cancelingLecture, setCancelingLecture] = useState(null);
  const [joinWindowMinutes, setJoinWindowMinutes] = useState(0);
  const [endingLecture, setEndingLecture] = useState(null);
  const [ending, setEnding] = useState(false);
  const [reopeningId, setReopeningId] = useState(null);

  const loadData = async () => {
    setLoading(true);

    const { data: settingsRows } = await supabase.from("app_settings").select("*");
    const settingsMap = Object.fromEntries((settingsRows || []).map((s) => [s.key, s.value]));
    const activeSession = settingsMap.active_academic_session || "";
    setJoinWindowMinutes(
      settingsMap.join_window_minutes ? Number(settingsMap.join_window_minutes) : 0,
    );

    const [lecturesRes, coursesCountRes] = await Promise.all([
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
    ]);

    const allLectures = lecturesRes.data || [];
    const now = new Date();
    const upcoming = allLectures.filter(
      (l) => (l.status === "scheduled" || l.status === "rescheduled") && new Date(l.start_time) >= now
    );
    const meetingPending = allLectures.filter((l) => !l.meeting_web_url && l.status !== "cancelled");

    setLectures(allLectures);
    setCounts({
      courses: coursesCountRes.count || 0,
      upcoming: upcoming.length,
      meetingPending: meetingPending.length,
    });
    setLoading(false);
  };

  useEffect(() => {
    if (profile?.id) loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const handleSetUpMeeting = async (lectureId) => {
    setSettingUpId(lectureId);
    setActionMessage("");

    const { error } = await supabase.functions.invoke("jitsi-create-meeting", {
      body: { lecture_id: lectureId },
    });

    setSettingUpId(null);

    if (error) {
      setActionMessage(await getFunctionErrorMessage(error, "Failed to set up the meeting."));
      return;
    }

    setActionMessage("Meeting created.");
    loadData();
  };

  const handleConfirmEnd = async () => {
    setEnding(true);

    const { error } = await supabase.functions.invoke("update-lecture-schedule", {
      body: { lecture_id: endingLecture.id, action: "end" },
    });

    setEnding(false);

    if (error) {
      setActionMessage(await getFunctionErrorMessage(error, "Failed to end the meeting."));
      setEndingLecture(null);
      return;
    }

    setEndingLecture(null);
    setActionMessage("Meeting ended. Students can't join until it's reopened.");
    loadData();
  };

  const handleReopen = async (lectureId) => {
    setReopeningId(lectureId);
    setActionMessage("");

    const { error } = await supabase.functions.invoke("update-lecture-schedule", {
      body: { lecture_id: lectureId, action: "reopen" },
    });

    setReopeningId(null);

    if (error) {
      setActionMessage(await getFunctionErrorMessage(error, "Failed to reopen the meeting."));
      return;
    }

    setActionMessage("Meeting reopened.");
    loadData();
  };

  const now = new Date();
  const nextUp = lectures
    .filter((l) => (l.status === "scheduled" || l.status === "rescheduled") && new Date(l.start_time) >= now)
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time))[0];
  const nextUpAvailability = nextUp ? getMeetingAvailability(nextUp, joinWindowMinutes) : null;
  const previousMeetings = lectures
    .filter((l) => l.status !== "cancelled" && new Date(l.end_time) < now)
    .sort((a, b) => new Date(b.start_time) - new Date(a.start_time))
    .slice(0, 3);

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <Breadcrumbs items={[{ label: "Dashboard" }]} />
          <h1 className="text-lg font-semibold">Dashboard</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard index={0} icon={FaLayerGroup} color="teal" label="Assigned Courses" value={counts.courses} />
        <StatCard index={1} icon={FaCalendarCheck} color="green" label="Upcoming Lectures" value={counts.upcoming} />
        <StatCard index={2} icon={FaVideo} color="orange" label="Meeting Pending Setup" value={counts.meetingPending} />
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
                <button onClick={() => setEndingLecture(nextUp)} className="text-red-500 hover:underline text-xs">
                  End Meeting
                </button>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              {nextUp.meeting_web_url ? (
                nextUpAvailability.state === "open" ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={nextUp.meeting_web_url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-2 font-bold text-white hover:opacity-90 text-center"
                    >
                      Join Meeting
                    </a>
                    <div className="group relative">
                      <FiHelpCircle size={16} className="text-gray-400 hover:text-gray-600 cursor-help" />
                      <div className="hidden group-hover:block absolute right-0 top-full mt-2 w-56 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg z-10">
                        First time in this meeting? Sign in with any free Google, GitHub, or Facebook account when the tab opens to start it as host.
                      </div>
                    </div>
                  </div>
                ) : (
                  <span className="rounded-xl bg-gray-100 text-gray-500 px-5 py-2 font-bold text-center text-sm">
                    {nextUpAvailability.state === "too-early"
                      ? `Opens ${nextUpAvailability.opensAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
                      : "Meeting ended"}
                  </span>
                )
              ) : (
                <button
                  onClick={() => handleSetUpMeeting(nextUp.id)}
                  disabled={settingUpId === nextUp.id}
                  className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-5 py-2 font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {settingUpId === nextUp.id ? "Setting up…" : "Set up Meeting"}
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {!loading && previousMeetings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut", delay: 0.05 }}
          className="bg-white rounded-[1.1rem] shadow-md p-4 sm:p-6 mb-6"
        >
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Previous Meetings</p>
          <div className="flex flex-col divide-y divide-gray-100">
            {previousMeetings.map((lecture) => (
              <div key={lecture.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 py-3 first:pt-0 last:pb-0">
                <div>
                  <h3 className="text-gray-900 font-medium text-sm">{lecture.topic}</h3>
                  <p className="text-xs text-gray-500">
                    {lecture.courses?.course_code} &middot; {new Date(lecture.start_time).toLocaleString()}
                  </p>
                </div>
                <Link to={`/lecturer/lectures/${lecture.id}/roster`} className="text-blue-600 hover:underline text-xs shrink-0">
                  View Roster
                </Link>
              </div>
            ))}
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

      <ConfirmDialog
        isOpen={!!endingLecture}
        title="End this meeting?"
        message="Students won't be able to join until it's reopened."
        confirmLabel="End Meeting"
        danger
        submitting={ending}
        onConfirm={handleConfirmEnd}
        onClose={() => setEndingLecture(null)}
      />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="bg-white rounded-[1.1rem] shadow-md p-4"
      >
        <div className="flex items-center gap-2 ml-2 mb-4">
          <h2 className="text-gray-800 text-md font-bold">My Lectures</h2>
          <div className="group relative flex items-center">
            <FiHelpCircle size={14} className="text-gray-400 hover:text-gray-600 cursor-help" />
            <div className="hidden group-hover:block absolute left-0 top-full mt-2 w-64 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg z-10">
              Joining a meeting for the first time? Sign in with any free Google, GitHub, or Facebook account on the Jitsi screen to start it as host. Otherwise it will sit on "waiting for a moderator" for everyone.
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto border-separate border-spacing-y-2 text-sm text-gray-900">
            <thead>
              <tr className="bg-[#F7F7F7] text-gray-900">
                <th className="text-left px-4 py-3 rounded-l-lg">Topic</th>
                <th className="text-left px-4 py-3">Course</th>
                <th className="text-left px-4 py-3">Start</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Meeting</th>
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
                lectures.map((lecture) => {
                  const rowAvailability = getMeetingAvailability(lecture, joinWindowMinutes);
                  return (
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
                      <div className="flex items-center gap-2">
                        {!lecture.meeting_web_url &&
                          lecture.status !== "cancelled" &&
                          lecture.status !== "completed" && (
                            <button
                              onClick={() => handleSetUpMeeting(lecture.id)}
                              disabled={settingUpId === lecture.id}
                              className="text-blue-600 hover:underline text-xs disabled:opacity-50"
                            >
                              {settingUpId === lecture.id ? "Setting up…" : "Set up Meeting"}
                            </button>
                          )}
                        {lecture.meeting_web_url && rowAvailability.state === "open" && (
                          <a
                            href={lecture.meeting_web_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:underline text-xs"
                          >
                            Join
                          </a>
                        )}
                        {lecture.meeting_web_url && rowAvailability.state === "too-early" && (
                          <span className="text-gray-400 text-xs">
                            Opens {rowAvailability.opensAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                          </span>
                        )}
                        {lecture.meeting_web_url && rowAvailability.state === "ended" && (
                          <span className="text-gray-400 text-xs">Meeting ended</span>
                        )}
                        <RowActionsMenu
                          items={[
                            { label: "Roster", to: `/lecturer/lectures/${lecture.id}/roster` },
                            lecture.status !== "cancelled" &&
                              lecture.status !== "completed" && {
                                label: "Reschedule",
                                onClick: () => setReschedulingLecture(lecture),
                              },
                            lecture.status !== "cancelled" &&
                              lecture.status !== "completed" && {
                                label: "Cancel",
                                danger: true,
                                onClick: () => setCancelingLecture(lecture),
                              },
                            lecture.status !== "cancelled" &&
                              lecture.status !== "completed" && {
                                label: "End Meeting",
                                danger: true,
                                onClick: () => setEndingLecture(lecture),
                              },
                            lecture.status === "completed" && {
                              label: reopeningId === lecture.id ? "Reopening…" : "Reopen Meeting",
                              disabled: reopeningId === lecture.id,
                              onClick: () => handleReopen(lecture.id),
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                  );
                })
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

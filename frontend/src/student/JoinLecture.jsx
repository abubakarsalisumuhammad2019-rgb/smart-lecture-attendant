import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { PageLoader } from "../components/PageLoader";
import { useAuth } from "../lib/AuthContext";
import { getFunctionErrorMessage } from "../lib/functionError";
import { supabase } from "../lib/supabaseClient";
import { WebcamCapture } from "../shared/WebcamCapture";

const FAILURE_MESSAGES = {
  not_enrolled: "This face hasn't been enrolled yet. Finish onboarding first.",
  no_face_detected:
    "No face detected -- make sure your face is clearly visible and try again.",
  multiple_faces_detected:
    "More than one face detected -- make sure you're alone in frame and try again.",
};

export default function JoinLecture() {
  const { lectureId } = useParams();
  const { profile } = useAuth();
  const zoomSession = useOutletContext();
  const captureRef = useRef(null);

  const [lecture, setLecture] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [minAttendanceMinutes, setMinAttendanceMinutes] = useState(null);
  // 'verify' | 'attending' | 'ended'. Driven by zoomSession.activeLectureId
  // when live (shared across the whole student session, survives navigating
  // away and back), but a *fresh* mount has no memory of whether a session
  // already ran and ended before this mount even existed -- e.g. the Zoom
  // window got closed while the student was on the Dashboard, then they
  // click back into Join. load() below seeds 'ended' directly from the
  // server's lecture_attendance row for exactly that case; the sync effect
  // only has to handle a transition that happens *while this is mounted*.
  const [phase, setPhase] = useState("verify");
  const [metMinimum, setMetMinimum] = useState(false);
  const wasTrackingRef = useRef(false);

  useEffect(() => {
    const load = async () => {
      const [
        { data: lectureRow },
        { data: settingRow },
        { data: attendanceRow },
      ] = await Promise.all([
        supabase
          .from("lectures")
          .select("*, courses(course_code, course_title)")
          .eq("id", lectureId)
          .single(),
        supabase
          .from("app_settings")
          .select("value")
          .eq("key", "min_attendance_minutes")
          .maybeSingle(),
        supabase
          .from("lecture_attendance")
          .select("total_duration_seconds, last_joined_at, last_left_at")
          .eq("lecture_id", lectureId)
          .eq("student_id", profile.id)
          .maybeSingle(),
      ]);

      setLecture(lectureRow || null);
      const minMinutes = settingRow?.value ? Number(settingRow.value) : null;
      setMinAttendanceMinutes(minMinutes);

      // If the shared tracker already knows about this lecture (e.g. we
      // navigated here from Dashboard while already attending), it's already
      // live and authoritative -- the sync effect below will pick that up.
      // Otherwise, this is a fresh mount with no memory of what happened
      // before it existed, so work out the right starting phase from the
      // server's own record of this student's attendance for this lecture.
      if (zoomSession.activeLectureId !== lectureId) {
        const stillActive =
          attendanceRow?.last_joined_at &&
          (!attendanceRow.last_left_at ||
            new Date(attendanceRow.last_left_at) <
              new Date(attendanceRow.last_joined_at));
        if (stillActive) {
          zoomSession.resumeFromServer(lectureId, {
            lastJoinedAt: attendanceRow.last_joined_at,
            totalDurationSeconds: attendanceRow.total_duration_seconds || 0,
            minAttendanceMinutes: minMinutes,
            courseCode: lectureRow?.courses?.course_code,
            topic: lectureRow?.topic,
          });
        } else if (attendanceRow?.last_joined_at) {
          // They joined this exact lecture at some point (this visit or an
          // earlier one) and it's not currently active -- show the ended
          // state instead of bouncing back to the verify screen.
          wasTrackingRef.current = false;
          setPhase("ended");
          setMetMinimum(
            minMinutes
              ? (attendanceRow.total_duration_seconds || 0) >= minMinutes * 60
              : false,
          );
        }
      }

      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId]);

  // Catches a session starting or ending *while this component is mounted*
  // (fresh join, a resume that just kicked in, auto-detected window close,
  // or the manual "I've left" action). The "already ended before this mount"
  // case is handled directly in load() above instead, since wasTrackingRef
  // is a plain ref and doesn't carry any memory across an unmount/remount.
  useEffect(() => {
    if (zoomSession.activeLectureId === lectureId) {
      wasTrackingRef.current = true;
      setPhase("attending");
    } else if (wasTrackingRef.current) {
      wasTrackingRef.current = false;
      setPhase("ended");
      setMetMinimum(zoomSession.metMinimum);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomSession.activeLectureId, lectureId]);

  const handleVerifyAndJoin = async () => {
    setError("");

    const image = captureRef.current?.capture();
    if (!image) {
      setError(
        "Could not capture from the camera. Check camera permissions and try again.",
      );
      return;
    }

    // Must happen synchronously in this click handler (before any await) to
    // still count as a user-gesture-triggered request in most browsers --
    // this is what lets the minimum-duration notification reach the student
    // even while their focus is on the separate Zoom tab, not this one.
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      Notification.requestPermission().catch(() => {});
    }

    setVerifying(true);

    const { data: verifyResult, error: verifyFnError } =
      await supabase.functions.invoke("face-verify", {
        body: { matric_number: profile.matric_number, image },
      });

    if (verifyFnError) {
      setVerifying(false);
      setError(
        await getFunctionErrorMessage(
          verifyFnError,
          "Could not reach the face verification service. Try again in a moment.",
        ),
      );
      return;
    }

    if (!verifyResult.verified) {
      setVerifying(false);
      setError(
        FAILURE_MESSAGES[verifyResult.reason] ||
          "Face didn't match -- try again with better lighting.",
      );
      return;
    }

    const zoomWindow = window.open(lecture.meeting_web_url, "_blank");
    setVerifying(false);

    if (!zoomWindow) {
      setError(
        "Could not open the meeting window -- check your popup blocker and try again.",
      );
      return;
    }

    zoomSession.startSession(lectureId, zoomWindow, {
      minAttendanceMinutes,
      courseCode: lecture?.courses?.course_code,
      topic: lecture?.topic,
    });
  };

  if (loading) {
    return <PageLoader />;
  }

  if (!lecture) {
    return <p className="text-white">Lecture not found.</p>;
  }

  const liveElapsedSeconds = zoomSession.liveElapsedSeconds();

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <p>Pages / Dashboard / Join</p>
          <h1 className="text-lg font-semibold">{lecture.topic}</h1>
        </div>
        <Link
          to="/student/dashboard"
          className="rounded-xl bg-white text-blue-700 px-5 py-2 font-bold hover:bg-gray-100"
        >
          Back to Dashboard
        </Link>
      </div>

      <div className="bg-white rounded-[1.1rem] shadow-md p-4 sm:p-6">
        {lecture.status === "cancelled" ? (
          <p className="text-sm text-red-500">
            This lecture has been cancelled.
          </p>
        ) : !lecture.meeting_web_url ? (
          <p className="text-sm text-orange-500">
            The facilitator hasn't set up the Zoom session for this lecture yet.
            Check back closer to the start time.
          </p>
        ) : phase !== "verify" ? (
          <div className="text-center py-8">
            {phase === "ended" ? (
              <>
                <p className="text-sm font-semibold text-gray-900 mb-2">
                  Attendance recorded.
                </p>
                <p className="text-sm text-gray-500 mb-3">
                  The meeting window was closed -- your session has ended.
                </p>
                {minAttendanceMinutes &&
                  (metMinimum ? (
                    <p className="text-sm font-semibold text-green-600">
                      ✓ Minimum attendance met ({minAttendanceMinutes} min)
                    </p>
                  ) : (
                    <p className="text-sm text-orange-500">
                      Below the {minAttendanceMinutes}-minute minimum -- you may
                      not be credited as attended.
                    </p>
                  ))}
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-900 mb-2">
                  You're marked as attending.
                </p>
                <p className="text-sm text-gray-500 mb-3">
                  Keep the Zoom window open. Attendance stops being tracked once
                  you close it.
                </p>
                {minAttendanceMinutes &&
                  (zoomSession.metMinimum ? (
                    <p className="text-sm font-semibold text-green-600">
                      ✓ Minimum attendance met ({minAttendanceMinutes} min)
                    </p>
                  ) : (
                    <div className="max-w-xs mx-auto">
                      <p className="text-xs text-gray-400 mb-1">
                        {Math.floor(liveElapsedSeconds / 60)} of{" "}
                        {minAttendanceMinutes} min
                      </p>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 transition-all duration-500"
                          style={{
                            width: `${Math.min(100, (liveElapsedSeconds / (minAttendanceMinutes * 60)) * 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                <button
                  onClick={zoomSession.endSession}
                  className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  I've left the meeting
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Face verification confirms your attendance before joining. Make
              sure you're clearly visible and alone in frame.
            </p>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-3 mb-4">
                {error}
              </div>
            )}

            <div className="flex flex-col lg:flex-row gap-4">
              <div className="w-full lg:w-2/3">
                <WebcamCapture
                  ref={captureRef}
                  className="w-full aspect-video bg-black rounded-2xl shadow-2xl overflow-hidden"
                />
              </div>
              <div className="w-full lg:w-1/2 flex flex-col justify-center items-center text-center gap-4">
                <button
                  onClick={handleVerifyAndJoin}
                  disabled={verifying}
                  className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-8 py-3 font-bold text-white transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50"
                >
                  {verifying ? "Verifying…" : "Verify & Join"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { FiCheck, FiHelpCircle } from "react-icons/fi";
import { Link, useParams } from "react-router-dom";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { PageLoader } from "../components/PageLoader";
import { useAuth } from "../lib/AuthContext";
import { getFunctionErrorMessage } from "../lib/functionError";
import { getMeetingAvailability } from "../lib/lectureTiming";
import { supabase } from "../lib/supabaseClient";
import { WebcamCapture } from "../shared/WebcamCapture";

const FAILURE_MESSAGES = {
  not_enrolled: "This face hasn't been enrolled yet. Finish onboarding first.",
  no_face_detected:
    "No face detected. Make sure your face is clearly visible and try again.",
  multiple_faces_detected:
    "More than one face detected. Make sure you're alone in frame and try again.",
};

// A disconnect (backgrounding the tab, a dropped connection) can end the
// Jitsi session without the student actually intending to leave -- browsers
// throttle/suspend WebRTC media on hidden tabs, which can genuinely drop the
// call while the student's still just switched away for a bit, not gone.
// Treat a "left" within this window as reconnectable without re-running
// face-verify -- both for UX and because every forced re-verification hits
// the self-hosted face-recognition API (a free-tier Render service, cold
// starts and limited monthly hours). Generous on purpose: a short window
// turns "stepped away for ten minutes" into a hard "ended" state.
const RECONNECT_GRACE_PERIOD_MS = 20 * 60 * 1000;

// How often to silently retry connecting while waiting for the facilitator
// -- a lobby-locked room fails the connection attempt outright rather than
// just leaving us waiting inside it, so we have to reconnect ourselves.
const FACILITATOR_RETRY_MS = 6000;

// A student who's verified but still waiting for the facilitator has no
// server-side attendance row yet (crediting only starts once a peer is
// confirmed -- see beginCrediting below), so there's nothing for the normal
// hasOpenSession/recentlyDisconnected resume logic to key off of. This local
// flag is purely a "let them skip re-verification" UX nicety, not an
// attendance record -- it can't grant credit, it only decides whether a
// reload goes back to the camera or straight back to the waiting screen.
const pendingJoinKey = (lectureId) => `lecture_pending_join_${lectureId}`;

// meet.jit.si's embed script -- loaded once and reused; a Jitsi room needs no
// API key or account, it's just a name that springs into existence when
// someone joins it.
function loadJitsiScript() {
  if (window.JitsiMeetExternalAPI) return Promise.resolve();

  const existing = document.querySelector(
    'script[src="https://meet.jit.si/external_api.js"]',
  );
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Failed to load the meeting script.")),
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () =>
      reject(new Error("Failed to load the meeting script."));
    document.body.appendChild(script);
  });
}

// Circular ring showing progress toward the minimum attendance duration --
// a checkmark once met, otherwise "elapsed/minimum" minutes in the center.
function AttendanceRing({ elapsedSeconds, minMinutes, met }) {
  const size = 44;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const fraction = Math.min(1, Math.max(0, elapsedSeconds / (minMinutes * 60)));
  const offset = circumference * (1 - fraction);

  return (
    <div className="flex items-center gap-2 shrink-0">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="#e5e7eb"
            strokeWidth={strokeWidth}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={met ? "#16a34a" : "#2563eb"}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {met ? (
            <FiCheck className="text-green-600" size={16} />
          ) : (
            <span className="text-[9px] font-semibold text-gray-600 leading-none text-center">
              {Math.floor(elapsedSeconds / 60)}/{minMinutes}
            </span>
          )}
        </div>
      </div>
      <div className="group relative flex items-center">
        <FiHelpCircle
          size={14}
          className="text-gray-400 hover:text-gray-600 cursor-help"
        />
        <div className="hidden group-hover:block absolute right-0 top-full mt-2 w-52 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg z-10">
          Progress toward the {minMinutes}-minute minimum attendance duration
          for this lecture.
        </div>
      </div>
    </div>
  );
}

export default function JoinLecture() {
  const { lectureId } = useParams();
  const { profile } = useAuth();
  const captureRef = useRef(null);
  const meetingContainerRef = useRef(null);
  const jitsiApiRef = useRef(null);
  const hasJoinedRef = useRef(false);
  const hasLeftRef = useRef(false);
  const sessionStartRef = useRef(null);
  const accumulatedSecondsRef = useRef(0);
  const notifiedRef = useRef(false);
  // True only while resuming a session the server still shows as open (no
  // "left" recorded yet) -- tells the videoConferenceJoined handler this
  // reconnect is a continuation, not a new session, so it doesn't reset the
  // elapsed-time clock or overwrite the server's original last_joined_at.
  const resumingOpenSessionRef = useRef(false);
  const tickIntervalRef = useRef(null);
  const thresholdTimerRef = useRef(null);
  // True once we've *confirmed* someone else is actually in the room, not
  // merely that our own connection succeeded. A room with no moderator
  // present yet still lets the student's side connect (Jitsi shows its own
  // "waiting for a moderator" screen) -- videoConferenceJoined firing alone
  // doesn't mean the lecture has actually started, and crediting attendance
  // off it alone let students bank minutes while genuinely alone in an
  // unstarted room. See the participant-count check below.
  const attendanceStartedRef = useRef(false);

  const [lecture, setLecture] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [minAttendanceMinutes, setMinAttendanceMinutes] = useState(null);
  const [joinWindowMinutes, setJoinWindowMinutes] = useState(0);
  // 'verify' | 'attending' | 'ended'. Real join/leave events from the
  // embedded Jitsi call drive this, not a self-report -- see the effect
  // below.
  const [phase, setPhase] = useState("verify");
  const [metMinimum, setMetMinimum] = useState(false);
  const [meetingError, setMeetingError] = useState("");
  // True while connected but not yet credited -- see attendanceStartedRef.
  const [waitingForFacilitator, setWaitingForFacilitator] = useState(false);
  const [, setTick] = useState(0);

  useEffect(() => {
    const load = async () => {
      const [
        { data: lectureRow },
        { data: settingRows },
        { data: attendanceRow },
      ] = await Promise.all([
        supabase
          .from("lectures")
          .select("*, courses(course_code, course_title)")
          .eq("id", lectureId)
          .single(),
        supabase
          .from("app_settings")
          .select("key, value")
          .in("key", ["min_attendance_minutes", "join_window_minutes"]),
        supabase
          .from("lecture_attendance")
          .select("total_duration_seconds, last_joined_at, last_left_at")
          .eq("lecture_id", lectureId)
          .eq("student_id", profile?.id)
          .maybeSingle(),
      ]);

      setLecture(lectureRow || null);
      const settingsMap = Object.fromEntries(
        (settingRows || []).map((row) => [row.key, row.value]),
      );
      const minMinutes = settingsMap.min_attendance_minutes
        ? Number(settingsMap.min_attendance_minutes)
        : null;
      setMinAttendanceMinutes(minMinutes);
      setJoinWindowMinutes(
        settingsMap.join_window_minutes
          ? Number(settingsMap.join_window_minutes)
          : 0,
      );

      // A real page reload drops the actual Jitsi connection too, not just
      // our own component state -- there's no "resuming" the same call, only
      // rejoining it. So this just decides whether to skip straight back
      // into a fresh embed (no re-verification) or show the final state.
      const hasOpenSession =
        attendanceRow?.last_joined_at &&
        (!attendanceRow.last_left_at ||
          new Date(attendanceRow.last_left_at) <
            new Date(attendanceRow.last_joined_at));

      const recentlyDisconnected =
        attendanceRow?.last_left_at &&
        Date.now() - new Date(attendanceRow.last_left_at).getTime() <
          RECONNECT_GRACE_PERIOD_MS;

      if (hasOpenSession) {
        // The server never saw a "left" for the previous session -- this is
        // the SAME session continuing, not a new one. Folding the gap since
        // the original last_joined_at into accumulatedSecondsRef (rather
        // than resetting it to just total_duration_seconds, which is still
        // whatever it was at the *last* "left" event -- 0 for a first join)
        // is what keeps the live timer from visibly restarting at zero
        // after leaving and coming back. The embed reconnecting won't send
        // another "joined" (see videoConferenceJoined below), so the
        // server's own last_joined_at -- and therefore the eventual real
        // "left" event's duration math -- stays anchored to the true start.
        const gapSeconds = Math.max(
          0,
          Math.round(
            (Date.now() - new Date(attendanceRow.last_joined_at).getTime()) /
              1000,
          ),
        );
        accumulatedSecondsRef.current =
          (attendanceRow.total_duration_seconds || 0) + gapSeconds;
        sessionStartRef.current = Date.now();
        resumingOpenSessionRef.current = true;
        // A last_joined_at only ever gets written once attendance was
        // genuinely confirmed (see the participant-count check below), so
        // an open session here is a real one, not a stuck-alone-in-a-room one.
        attendanceStartedRef.current = true;
        notifiedRef.current = minMinutes
          ? accumulatedSecondsRef.current >= minMinutes * 60
          : false;
        setMetMinimum(notifiedRef.current);
        setWaitingForFacilitator(false);
        setPhase("attending");
      } else if (recentlyDisconnected) {
        // Actually closed out (a real "left" was recorded) but recently --
        // total_duration_seconds already reflects everything up to that
        // point, so this really is a fresh session on top of it.
        accumulatedSecondsRef.current =
          attendanceRow.total_duration_seconds || 0;
        resumingOpenSessionRef.current = false;
        attendanceStartedRef.current = false;
        notifiedRef.current = minMinutes
          ? accumulatedSecondsRef.current >= minMinutes * 60
          : false;
        setMetMinimum(notifiedRef.current);
        // Rejoining still needs a fresh peer-confirmation (attendanceStartedRef
        // is false above), so show the waiting screen from the first render
        // instead of the real "attending" view flashing briefly first.
        setWaitingForFacilitator(true);
        setPhase("attending");
      } else {
        const pendingJoinAt = Number(
          localStorage.getItem(pendingJoinKey(lectureId)) || 0,
        );
        const recentlyAttemptedJoin =
          pendingJoinAt && Date.now() - pendingJoinAt < RECONNECT_GRACE_PERIOD_MS;

        if (recentlyAttemptedJoin) {
          // Verified and was waiting for the facilitator when the page got
          // reloaded -- no server-side attendance row exists yet to resume
          // from (see pendingJoinKey above), but there's no reason to send
          // them back through face-verify either. Go straight back to the
          // waiting screen and let it reconnect on its own.
          accumulatedSecondsRef.current = 0;
          resumingOpenSessionRef.current = false;
          attendanceStartedRef.current = false;
          notifiedRef.current = false;
          setMetMinimum(false);
          setWaitingForFacilitator(true);
          setPhase("attending");
        } else if (attendanceRow?.last_joined_at) {
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
  }, [lectureId, profile?.id]);

  const recordAttendanceEvent = (eventType) => {
    supabase.functions
      .invoke("record-attendance-event", {
        body: { lecture_id: lectureId, event_type: eventType },
      })
      .then(({ error: fnError }) => {
        // The server independently re-checks the lecture's status/join
        // window (see record-attendance-event) -- a stale client that
        // slipped past the UI's own check (e.g. left the verify screen open
        // past the window before clicking) can still get rejected here.
        // Surface it rather than silently leaving the UI showing "attending"
        // with nothing actually being recorded.
        if (fnError && eventType === "joined") {
          setMeetingError(
            "Could not record your attendance. This lecture is outside its joinable window.",
          );
        }
      })
      .catch((err) => console.error("Failed to record attendance event:", err));
  };

  const clearTimers = () => {
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    if (thresholdTimerRef.current) clearTimeout(thresholdTimerRef.current);
    tickIntervalRef.current = null;
    thresholdTimerRef.current = null;
  };

  const notifyAttendanceMet = () => {
    setMetMinimum(true);
    toast.success(
      `You've met the ${minAttendanceMinutes}-minute minimum for ${lecture?.courses?.course_code || "this lecture"}. You're marked as attended.`,
    );
    if (
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification("Attendance marked", {
          body: `You've met the minimum attendance duration for ${lecture?.topic || "your lecture"}.`,
        });
      } catch {
        // Notification constructor can throw in some mobile browser contexts -- non-fatal.
      }
    }
  };

  const scheduleThresholdCheck = () => {
    if (thresholdTimerRef.current) {
      clearTimeout(thresholdTimerRef.current);
      thresholdTimerRef.current = null;
    }
    if (!minAttendanceMinutes || notifiedRef.current) return;

    const neededSeconds =
      minAttendanceMinutes * 60 - accumulatedSecondsRef.current;
    if (neededSeconds <= 0) {
      notifiedRef.current = true;
      notifyAttendanceMet();
      return;
    }
    thresholdTimerRef.current = setTimeout(() => {
      notifiedRef.current = true;
      notifyAttendanceMet();
    }, neededSeconds * 1000);
  };

  // Embeds the Jitsi meeting directly in the page once verification passes
  // (or a reload resumes a session already in progress) -- join/leave are
  // real events fired by the Jitsi client itself, not something a student
  // can fake by clicking a button.
  useEffect(() => {
    if (phase !== "attending" || !lecture?.jitsi_room_name) return;

    let cancelled = false;
    let retryTimeout = null;
    hasJoinedRef.current = false;
    hasLeftRef.current = false;

    // Pulled out of the loadJitsiScript().then() so a failed connection
    // attempt (room still lobby-locked, no moderator yet) can quietly retry
    // by calling this again, instead of surfacing an error and exposing the
    // raw embed underneath. The student asked to wait exactly once, is on
    // the waiting screen, and stays there until the facilitator shows up or
    // they navigate away themselves -- not bounced around while we retry.
    const connect = () => {
      if (cancelled) return;

      const api = new window.JitsiMeetExternalAPI("meet.jit.si", {
        roomName: lecture.jitsi_room_name,
        parentNode: meetingContainerRef.current,
        width: "100%",
        height: "100%",
        userInfo: { displayName: profile.full_name },
        // Identity's already established by face-verify, so Jitsi's own
        // prejoin gate (camera/mic check + a manual "Join meeting" click)
        // is redundant -- skip straight into the call. Both config keys
        // are passed since deployed meet.jit.si versions differ on which
        // one they read.
        configOverwrite: {
          prejoinPageEnabled: false,
          prejoinConfig: { enabled: false },
        },
      });

      jitsiApiRef.current = api;

      // Starts the clock for real -- called once we've *confirmed* someone
      // else is in the room, not merely that our own connection succeeded.
      const beginCrediting = () => {
        if (attendanceStartedRef.current) return;
        attendanceStartedRef.current = true;
        setWaitingForFacilitator(false);
        localStorage.removeItem(pendingJoinKey(lectureId));
        if (!resumingOpenSessionRef.current) {
          sessionStartRef.current = Date.now();
          recordAttendanceEvent("joined");
        }
        resumingOpenSessionRef.current = false;
        scheduleThresholdCheck();
        tickIntervalRef.current = setInterval(
          () => setTick((t) => t + 1),
          5000,
        );
      };

      api.addListener("videoConferenceJoined", () => {
        hasJoinedRef.current = true;
        hasLeftRef.current = false;

        if (attendanceStartedRef.current) {
          // Resuming an already-confirmed session -- just get the live
          // ticker running again for this mount, nothing else to check.
          beginCrediting();
          return;
        }

        // Our own connection succeeding only means we're in the room --
        // Jitsi still shows its own "waiting for a moderator" screen (and
        // keeps the student sitting there, connected but alone) until
        // someone else actually arrives. Checking the participant count
        // right away catches the facilitator having gotten there first;
        // the participantJoined listener below catches them arriving later.
        try {
          Promise.resolve(api.getNumberOfParticipants())
            .then((count) => {
              if (count >= 2) beginCrediting();
            })
            .catch(() => {});
        } catch {
          // Method unavailable in this Jitsi version -- fall back to
          // participantJoined alone.
        }
      });

      api.addListener("participantJoined", () => {
        if (!attendanceStartedRef.current) beginCrediting();
      });

      api.addListener("videoConferenceLeft", () => {
        clearTimers();
        // Jitsi fires this even when the call never actually connected --
        // e.g. the room is still lobby-locked because the facilitator
        // hasn't signed in as moderator yet (conference.connectionError.
        // membersOnly), or the student was alone in an unstarted room the
        // whole time. Recording a "left" -- or having ever started the
        // clock -- for a session that never had a confirmed facilitator
        // present corrupted the server's own view of what happened, and
        // let a student bank attendance minutes just by waiting alone.
        if (!attendanceStartedRef.current) {
          api.dispose();
          if (jitsiApiRef.current === api) jitsiApiRef.current = null;
          if (!cancelled) {
            retryTimeout = setTimeout(connect, FACILITATOR_RETRY_MS);
          }
          return;
        }
        hasLeftRef.current = true;
        if (sessionStartRef.current) {
          accumulatedSecondsRef.current += Math.max(
            0,
            Math.round((Date.now() - sessionStartRef.current) / 1000),
          );
          sessionStartRef.current = null;
        }
        recordAttendanceEvent("left");
        setPhase("ended");
      });
    };

    loadJitsiScript()
      .then(() => {
        if (!cancelled) connect();
      })
      .catch(() => {
        setMeetingError(
          "Could not load the meeting. Check your connection and try again.",
        );
      });

    return () => {
      cancelled = true;
      if (retryTimeout) clearTimeout(retryTimeout);
      clearTimers();
      // Navigating away mid-lecture never fires Jitsi's own
      // videoConferenceLeft -- close out attendance here too. Only if the
      // clock had actually started (attendanceStartedRef) -- otherwise
      // there's nothing genuine to record, same reasoning as above.
      if (attendanceStartedRef.current && !hasLeftRef.current) {
        if (sessionStartRef.current) {
          accumulatedSecondsRef.current += Math.max(
            0,
            Math.round((Date.now() - sessionStartRef.current) / 1000),
          );
          sessionStartRef.current = null;
        }
        recordAttendanceEvent("left");
      }
      jitsiApiRef.current?.dispose();
      jitsiApiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, lecture?.jitsi_room_name]);

  const handleVerifyAndJoin = async () => {
    setError("");

    // Re-check right at click time, not just at render time -- a student can
    // sit on this screen unattended (nothing re-renders it while idle) long
    // enough for the join window to close underneath them.
    const freshAvailability = getMeetingAvailability(lecture, joinWindowMinutes);
    if (freshAvailability.state !== "open") {
      setError(
        freshAvailability.state === "too-early"
          ? "This lecture hasn't started yet. Check back closer to the start time."
          : "This lecture is no longer open for joining.",
      );
      return;
    }

    const image = captureRef.current?.capture();
    if (!image) {
      setError(
        "Could not capture from the camera. Check camera permissions and try again.",
      );
      return;
    }

    // Must happen synchronously in this click handler (before any await) to
    // still count as a user-gesture-triggered request in most browsers.
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
          "Face didn't match. Try again with better lighting.",
      );
      return;
    }

    setVerifying(false);
    accumulatedSecondsRef.current = 0;
    notifiedRef.current = false;
    resumingOpenSessionRef.current = false;
    attendanceStartedRef.current = false;
    setMetMinimum(false);
    localStorage.setItem(pendingJoinKey(lectureId), String(Date.now()));
    // Set before the phase change, not inside the Jitsi-loading effect, so
    // the waiting screen is what the very first render after this shows --
    // otherwise there's a brief flash of the real "attending" view first.
    setWaitingForFacilitator(true);
    setPhase("attending");
  };

  if (loading) {
    return <PageLoader />;
  }

  if (!lecture) {
    return <p className="text-white">Lecture not found.</p>;
  }

  // Only gates the pre-join screen (phase "verify") -- once a session is
  // already live or has already ended, the phase-based branches below take
  // over. availability re-evaluates against the real clock on every render,
  // and phase "attending" re-renders every 5s via the ticker; gating on it
  // unconditionally would tear a student out of a live call the instant
  // end_time passes, which is explicitly not what ending a meeting should do
  // (see CLAUDE.md's Meeting Integration section).
  const availability = getMeetingAvailability(lecture, joinWindowMinutes);

  const liveElapsedSeconds =
    accumulatedSecondsRef.current +
    (sessionStartRef.current
      ? Math.floor((Date.now() - sessionStartRef.current) / 1000)
      : 0);

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <Breadcrumbs
            items={[
              { label: "Dashboard", to: "/student/dashboard" },
              { label: "Join" },
            ]}
          />
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
        {phase === "verify" && availability.state === "cancelled" ? (
          <p className="text-sm text-red-500">
            This lecture has been cancelled.
          </p>
        ) : phase === "verify" && availability.state === "ended" ? (
          <p className="text-sm text-red-500">This lecture has ended.</p>
        ) : phase === "verify" && availability.state === "too-early" ? (
          <p className="text-sm text-orange-500">
            This lecture hasn't started yet. You can join starting{" "}
            {availability.opensAt.toLocaleString([], {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            .
          </p>
        ) : !lecture.meeting_web_url ? (
          <p className="text-sm text-orange-500">
            The facilitator hasn't set up the meeting for this lecture yet.
            Check back closer to the start time.
          </p>
        ) : phase === "ended" ? (
          <div className="text-center py-8">
            <p className="text-sm font-semibold text-gray-900 mb-2">
              Attendance recorded.
            </p>
            <p className="text-sm text-gray-500 mb-3">
              Your attendance session has ended.
            </p>
            {minAttendanceMinutes &&
              (metMinimum ? (
                <p className="text-sm font-semibold text-green-600">
                  ✓ Minimum attendance met ({minAttendanceMinutes} min)
                </p>
              ) : (
                <p className="text-sm text-orange-500">
                  Below the {minAttendanceMinutes}-minute minimum, you may not
                  be credited as attended.
                </p>
              ))}
          </div>
        ) : phase === "attending" ? (
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              {waitingForFacilitator ? (
                <p className="text-sm text-orange-500">
                  Waiting for the facilitator to join, your attendance session
                  hasn't started yet, so it's fine to wait here.
                </p>
              ) : (
                <p className="text-sm text-gray-500">
                  You're marked as attending. Leaving this page ends your
                  attendance session, so stay here until the lecture is done.
                </p>
              )}
              {!waitingForFacilitator && minAttendanceMinutes && (
                <AttendanceRing
                  elapsedSeconds={liveElapsedSeconds}
                  minMinutes={minAttendanceMinutes}
                  met={metMinimum}
                />
              )}
            </div>
            {meetingError && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-3 mb-4">
                {meetingError}
              </div>
            )}
            <div className="relative w-full aspect-video rounded-2xl shadow-2xl overflow-hidden">
              <div ref={meetingContainerRef} className="absolute inset-0 bg-black" />
              {waitingForFacilitator && (
                <div className="absolute inset-0 bg-gray-900 flex flex-col items-center justify-center gap-3 z-10">
                  <div className="w-8 h-8 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                  <p className="text-white text-sm px-8 text-center">
                    Waiting for the facilitator to join the meeting…
                  </p>
                  <p className="text-gray-400 text-xs px-8 text-center max-w-xs">
                    This page will update on its own once they're in. No
                    need to do anything here.
                  </p>
                </div>
              )}
            </div>
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

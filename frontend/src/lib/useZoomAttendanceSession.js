import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from './supabaseClient';

// Owned by StudentLayout (mounted for the student's whole session, not by
// JoinLecture itself) so that an open Zoom window keeps being tracked no
// matter where the student navigates in the app -- StudentLayout's <Outlet>
// remounts JoinLecture on every route change (it's keyed by pathname for the
// page-transition animation), so state that lived inside JoinLecture used to
// get wiped the moment a student clicked "Back to Dashboard" and came back,
// firing a premature "left" event even though the Zoom window was still open.
//
// Only a genuine full page reload (not in-app navigation) loses this state --
// JoinLecture recovers from that specific case separately, by checking the
// server's last_joined_at/last_left_at on mount (see resumeFromServer below).
export function useZoomAttendanceSession() {
  const [activeLectureId, setActiveLectureId] = useState(null);
  const [metMinimum, setMetMinimum] = useState(false);
  const [, setTick] = useState(0);

  const lectureIdRef = useRef(null);
  const zoomWindowRef = useRef(null);
  const pollRef = useRef(null);
  const tickIntervalRef = useRef(null);
  const thresholdTimerRef = useRef(null);
  const accumulatedSecondsRef = useRef(0);
  const sessionStartRef = useRef(null);
  const notifiedRef = useRef(false);
  const minMinutesRef = useRef(null);
  const labelRef = useRef({ courseCode: null, topic: null });

  const sendEvent = async (lectureId, eventType) => {
    try {
      await supabase.functions.invoke('record-attendance-event', {
        body: { lecture_id: lectureId, event_type: eventType },
      });
    } catch {
      // Best-effort -- the lecturer's manual-override roster is the backstop
      // if a client-reported event never makes it to the server.
    }
  };

  const notifyAttendanceMet = () => {
    setMetMinimum(true);
    const minMinutes = minMinutesRef.current;
    const { courseCode, topic } = labelRef.current;
    toast.success(
      `You've met the ${minMinutes}-minute minimum for ${courseCode || 'this lecture'} -- you're marked as attended.`,
    );
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        new Notification('Attendance marked', {
          body: `You've met the minimum attendance duration for ${topic || 'your lecture'}.`,
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
    const minMinutes = minMinutesRef.current;
    if (!minMinutes || notifiedRef.current) return;

    const neededSeconds = minMinutes * 60 - accumulatedSecondsRef.current;
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

  const clearTimers = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    if (thresholdTimerRef.current) clearTimeout(thresholdTimerRef.current);
    pollRef.current = null;
    tickIntervalRef.current = null;
    thresholdTimerRef.current = null;
  };

  // Reads lectureIdRef (not React state) so this is safe to call from a
  // setInterval/setTimeout closure created on a much earlier render.
  const endSession = () => {
    const lectureId = lectureIdRef.current;
    if (!lectureId) return;

    clearTimers();
    if (sessionStartRef.current) {
      accumulatedSecondsRef.current += Math.max(0, Math.round((Date.now() - sessionStartRef.current) / 1000));
      sessionStartRef.current = null;
    }
    lectureIdRef.current = null;
    zoomWindowRef.current = null;
    setActiveLectureId(null);
    sendEvent(lectureId, 'left');
  };

  const startSession = (lectureId, zoomWindow, { minAttendanceMinutes, courseCode, topic } = {}) => {
    clearTimers();
    lectureIdRef.current = lectureId;
    zoomWindowRef.current = zoomWindow;
    minMinutesRef.current = minAttendanceMinutes ?? null;
    labelRef.current = { courseCode, topic };
    accumulatedSecondsRef.current = 0;
    sessionStartRef.current = Date.now();
    notifiedRef.current = false;
    setMetMinimum(false);
    setActiveLectureId(lectureId);
    sendEvent(lectureId, 'joined');

    scheduleThresholdCheck();
    tickIntervalRef.current = setInterval(() => setTick((t) => t + 1), 5000);
    pollRef.current = setInterval(() => {
      if (zoomWindowRef.current?.closed) {
        endSession();
      }
    }, 2000);
  };

  // Resumes tracking after a real page reload wiped this hook's own state,
  // but the server still shows an open session for this lecture. There's no
  // real window handle to reattach to after a reload, so this can't
  // auto-detect closure -- the manual "I've left the meeting" action
  // (JoinLecture calling endSession()) is the only way to close it out.
  const resumeFromServer = (
    lectureId,
    { lastJoinedAt, totalDurationSeconds, minAttendanceMinutes, courseCode, topic },
  ) => {
    clearTimers();
    lectureIdRef.current = lectureId;
    zoomWindowRef.current = null;
    minMinutesRef.current = minAttendanceMinutes ?? null;
    labelRef.current = { courseCode, topic };
    accumulatedSecondsRef.current = totalDurationSeconds || 0;
    sessionStartRef.current = new Date(lastJoinedAt).getTime();
    notifiedRef.current = minAttendanceMinutes
      ? accumulatedSecondsRef.current >= minAttendanceMinutes * 60
      : false;
    setMetMinimum(notifiedRef.current);
    setActiveLectureId(lectureId);

    scheduleThresholdCheck();
    tickIntervalRef.current = setInterval(() => setTick((t) => t + 1), 5000);
  };

  const liveElapsedSeconds = () =>
    accumulatedSecondsRef.current +
    (sessionStartRef.current ? Math.floor((Date.now() - sessionStartRef.current) / 1000) : 0);

  return {
    activeLectureId,
    metMinimum,
    hasWindow: () => !!zoomWindowRef.current,
    liveElapsedSeconds,
    startSession,
    endSession,
    resumeFromServer,
  };
}

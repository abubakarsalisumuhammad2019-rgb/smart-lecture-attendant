// Shared join-availability logic for lecture meetings, used by both the
// student join page and the lecturer dashboard so the "can this be joined
// right now" rule only lives in one place.
export function getMeetingAvailability(lecture, joinWindowMinutes) {
  if (!lecture) return { state: "unknown" };
  if (lecture.status === "cancelled") return { state: "cancelled" };
  if (lecture.status === "completed") return { state: "ended" };

  const now = Date.now();
  const end = new Date(lecture.end_time).getTime();
  if (now > end) return { state: "ended" };

  const opensAt = new Date(
    new Date(lecture.start_time).getTime() - joinWindowMinutes * 60_000
  );
  if (now < opensAt.getTime()) return { state: "too-early", opensAt };

  return { state: "open" };
}

import Papa from "papaparse";
import { useState } from "react";
import { deriveLevelFromCode } from "../lib/courseHelpers";
import { getFunctionErrorMessage } from "../lib/functionError";
import { supabase } from "../lib/supabaseClient";

const REQUIRED_HELP =
  "CSV columns: course_code, course_title, credit_units, programme, level, facilitator_email, facilitator_name, start_time, end_time. " +
  "Courses and lecturers that don't exist yet are created automatically (course_title / facilitator_name are only required for rows introducing a new one). " +
  "Re-importing a course_code or email that already exists updates its stored details (title/units/programme/level, or name/faculty/department) to match this CSV. " +
  "The lecture's displayed topic is derived from the course automatically. This only schedules the lectures -- each facilitator sets up their own Zoom session from their lecture list. " +
  "New lecturer accounts are created with the default password 123456 and no email confirmation needed -- lecturers should change it after signing in.";

// Matches admin/Users.jsx's own bulk-lecturer-import convention -- a known,
// shared default (rather than an unrecoverable random password) so an admin
// can actually log in as a freshly bulk-imported lecturer to test/verify.
const DEFAULT_BULK_PASSWORD = "123456";

export default function LectureImport() {
  const [rows, setRows] = useState([]);
  const [settings, setSettings] = useState({
    active_academic_session: "",
    active_semester: "",
  });
  const [importing, setImporting] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [results, setResults] = useState([]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async ({ data }) => {
        const { data: settingsRows } = await supabase
          .from("app_settings")
          .select("*");
        const settingsMap = Object.fromEntries(
          (settingsRows || []).map((s) => [s.key, s.value]),
        );
        const academicSession = settingsMap.active_academic_session || "";
        const semester = settingsMap.active_semester || "";
        setSettings({
          active_academic_session: academicSession,
          active_semester: semester,
        });

        const { data: courses } = await supabase
          .from("courses")
          .select("*")
          .eq("academic_session", academicSession)
          .eq("semester", semester);

        const { data: lecturers } = await supabase
          .from("profiles")
          .select("id, email, full_name")
          .eq("role", "lecturer");

        const resolved = data.map((row) => {
          const courseCode = row.course_code?.trim();
          const facilitatorEmail = row.facilitator_email?.trim();
          const existingCourse = courses?.find(
            (c) => c.course_code === courseCode,
          );
          const existingLecturer = lecturers?.find(
            (l) => l.email === facilitatorEmail,
          );

          const needsNewCourse = courseCode && !existingCourse;
          const needsNewLecturer = facilitatorEmail && !existingLecturer;

          const courseOk = Boolean(
            existingCourse || (needsNewCourse && row.course_title?.trim()),
          );
          const facilitatorOk = Boolean(
            existingLecturer ||
            (needsNewLecturer && row.facilitator_name?.trim()),
          );
          const validTimes =
            row.start_time &&
            row.end_time &&
            new Date(row.end_time) > new Date(row.start_time);

          return {
            ...row,
            course_code: courseCode,
            facilitator_email: facilitatorEmail,
            existingCourseId: existingCourse?.id || null,
            existingCourseTitle: existingCourse?.course_title || null,
            existingLecturerId: existingLecturer?.id || null,
            needsNewCourse,
            needsNewLecturer,
            matched: courseOk && facilitatorOk && validTimes,
            reason: !courseOk
              ? "course_code / course_title missing or invalid"
              : !facilitatorOk
                ? "facilitator_email / facilitator_name missing or invalid"
                : !validTimes
                  ? "start_time / end_time missing or end_time not after start_time"
                  : "",
          };
        });

        setRows(resolved);
        setResults([]);
      },
    });
  };

  const handleImport = async () => {
    setImporting(true);
    setResults([]);
    const toImport = rows.filter((r) => r.matched);

    // Phase A: create missing courses (deduped by course_code); update
    // existing ones so a re-imported CSV refreshes stale title/units/etc.
    setProgressMessage("Creating/updating courses…");
    const courseIdByCode = {};
    const courseTitleByCode = {};
    const seenCourseCodes = new Set();
    for (const row of toImport) {
      if (!row.existingCourseId || seenCourseCodes.has(row.course_code)) continue;
      seenCourseCodes.add(row.course_code);
      courseIdByCode[row.course_code] = row.existingCourseId;
      courseTitleByCode[row.course_code] = row.existingCourseTitle;

      if (!row.course_title?.trim()) continue;
      const { data } = await supabase
        .from("courses")
        .update({
          course_title: row.course_title.trim(),
          credit_units: row.credit_units ? Number(row.credit_units) : null,
          programme: row.programme || null,
          level: row.level ? Number(row.level) : deriveLevelFromCode(row.course_code),
        })
        .eq("id", row.existingCourseId)
        .select()
        .single();
      if (data) courseTitleByCode[row.course_code] = data.course_title;
    }
    const newCourseCodes = [
      ...new Set(
        toImport
          .filter((r) => r.needsNewCourse && !courseIdByCode[r.course_code])
          .map((r) => r.course_code),
      ),
    ];
    for (const code of newCourseCodes) {
      const sourceRow = toImport.find((r) => r.course_code === code);
      const { data, error } = await supabase
        .from("courses")
        .insert({
          course_code: code,
          course_title: sourceRow.course_title.trim(),
          credit_units: sourceRow.credit_units
            ? Number(sourceRow.credit_units)
            : null,
          programme: sourceRow.programme || null,
          level: sourceRow.level
            ? Number(sourceRow.level)
            : deriveLevelFromCode(code),
          semester: settings.active_semester,
          academic_session: settings.active_academic_session,
        })
        .select()
        .single();
      if (!error) {
        courseIdByCode[code] = data.id;
        courseTitleByCode[code] = data.course_title;
      }
    }

    // Phase B: invite missing lecturers (deduped by email); update existing
    // ones so a re-imported CSV refreshes stale name/faculty/department.
    setProgressMessage("Creating/updating lecturers…");
    const lecturerIdByEmail = {};
    const seenLecturerEmails = new Set();
    for (const row of toImport) {
      if (!row.existingLecturerId || seenLecturerEmails.has(row.facilitator_email)) continue;
      seenLecturerEmails.add(row.facilitator_email);
      lecturerIdByEmail[row.facilitator_email] = row.existingLecturerId;

      if (!row.facilitator_name?.trim()) continue;
      await supabase
        .from("profiles")
        .update({
          full_name: row.facilitator_name.trim(),
          faculty: row.facilitator_faculty || null,
          department: row.facilitator_department || null,
        })
        .eq("id", row.existingLecturerId);
    }
    const newLecturerEmails = [
      ...new Set(
        toImport
          .filter(
            (r) =>
              r.needsNewLecturer && !lecturerIdByEmail[r.facilitator_email],
          )
          .map((r) => r.facilitator_email),
      ),
    ];
    for (const email of newLecturerEmails) {
      const sourceRow = toImport.find((r) => r.facilitator_email === email);
      const { data, error } = await supabase.functions.invoke(
        "admin-invite-user",
        {
          body: {
            email,
            role: "lecturer",
            full_name: sourceRow.facilitator_name.trim(),
            faculty: sourceRow.facilitator_faculty || null,
            department: sourceRow.facilitator_department || null,
            password: DEFAULT_BULK_PASSWORD,
          },
        },
      );
      if (!error && data?.user?.id) lecturerIdByEmail[email] = data.user.id;
    }

    // Phase C: assign lecturer <-> course pairs (deduped)
    setProgressMessage("Assigning courses to lecturers…");
    const seenPairs = new Set();
    for (const row of toImport) {
      const courseId = courseIdByCode[row.course_code];
      const lecturerId = lecturerIdByEmail[row.facilitator_email];
      if (!courseId || !lecturerId) continue;
      const pairKey = `${lecturerId}:${courseId}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      await supabase.from("lecturer_courses").insert({
        lecturer_id: lecturerId,
        course_id: courseId,
        academic_session: settings.active_academic_session,
      });
    }

    // Phase D: create the lectures themselves
    setProgressMessage("Creating lectures…");
    const outcomes = [];
    const concurrency = 3;
    for (let i = 0; i < toImport.length; i += concurrency) {
      const batch = toImport.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (row) => {
          const courseId = courseIdByCode[row.course_code];
          const facilitatorId = lecturerIdByEmail[row.facilitator_email];
          if (!courseId || !facilitatorId) {
            return {
              row,
              ok: false,
              error: "Course or lecturer could not be resolved/created",
            };
          }
          const durationMinutes = Math.round(
            (new Date(row.end_time) - new Date(row.start_time)) / 60000,
          );
          const topic =
            `${row.course_code}  ${courseTitleByCode[row.course_code] || ""}`.trim();
          const { error } = await supabase.functions.invoke("create-lecture", {
            body: {
              course_id: courseId,
              facilitator_id: facilitatorId,
              topic,
              start_time: new Date(row.start_time).toISOString(),
              duration_minutes: durationMinutes,
            },
          });
          return {
            row,
            ok: !error,
            error: error ? await getFunctionErrorMessage(error) : null,
          };
        }),
      );
      outcomes.push(...batchResults);
    }

    setResults(outcomes);
    setProgressMessage("");
    setImporting(false);
  };

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <p>Pages / Lectures / Bulk Import</p>
          <h1 className="text-lg font-semibold">Bulk Import Lectures</h1>
        </div>
      </div>

      <div className="bg-white rounded-[1.1rem] shadow-md p-4">
        <p className="text-sm text-gray-600 mb-4">{REQUIRED_HELP}</p>
        <input
          type="file"
          accept=".csv"
          onChange={handleFile}
          className="mb-4"
        />

        {rows.length > 0 && (
          <>
            <div className="overflow-x-auto mb-4">
              <table className="min-w-full table-auto border-separate border-spacing-y-2 text-sm text-gray-900">
                <thead>
                  <tr className="bg-[#F7F7F7]">
                    <th className="text-left px-4 py-2 rounded-l-lg">Course</th>
                    <th className="text-left px-4 py-2">Start</th>
                    <th className="text-left px-4 py-2">Facilitator</th>
                    <th className="text-left px-4 py-2 rounded-r-lg">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, idx) => (
                    <tr key={idx}>
                      <td className="px-4 py-2">
                        {row.course_code}{" "}
                        {row.needsNewCourse && (
                          <span className="text-blue-500 text-xs">(new)</span>
                        )}
                      </td>
                      <td className="px-4 py-2">{row.start_time}</td>
                      <td className="px-4 py-2">
                        {row.facilitator_email}{" "}
                        {row.needsNewLecturer && (
                          <span className="text-blue-500 text-xs">(new)</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {row.matched ? (
                          <span className="text-green-600">Ready</span>
                        ) : (
                          <span className="text-red-500" title={row.reason}>
                            Blocked: {row.reason}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={handleImport}
              disabled={importing || rows.every((r) => !r.matched)}
              className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2 font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {importing
                ? progressMessage || "Importing…"
                : `Import ${rows.filter((r) => r.matched).length} lectures`}
            </button>
          </>
        )}

        {results.length > 0 && (
          <div className="mt-4 text-sm">
            <p className="font-semibold mb-2">
              {results.filter((r) => r.ok).length} of {results.length} imported
              successfully.
            </p>
            {results
              .filter((r) => !r.ok)
              .map((r, idx) => (
                <p key={idx} className="text-red-500">
                  {r.row.course_code}: {r.error}
                </p>
              ))}
          </div>
        )}
      </div>
    </>
  );
}

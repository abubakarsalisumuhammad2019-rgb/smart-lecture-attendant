import Papa from "papaparse";
import { useEffect, useState } from "react";
import { FiDownload } from "react-icons/fi";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { deriveLevelFromCode } from "../lib/courseHelpers";
import { getFunctionErrorMessage } from "../lib/functionError";
import { supabase } from "../lib/supabaseClient";

// Matches admin/Users.jsx's own bulk-lecturer-import convention -- a known,
// shared default (rather than an unrecoverable random password) so an admin
// can actually log in as a freshly bulk-imported lecturer to test/verify.
const DEFAULT_BULK_PASSWORD = "123456";

// Sequential, single-row round trips were the actual reason large imports
// looked "stuck" -- ~800 unique courses/lecturers/assignments awaited one at
// a time, several minutes with no visible progress, before lecture creation
// (the slowest phase, one row each) even started. Concurrency-limited
// batching everywhere cuts that dramatically and gives real progress ticks.
const CONCURRENCY = 5;

const TEMPLATE_HEADERS = [
  "course_code",
  "course_title",
  "credit_units",
  "programme",
  "level",
  "facilitator_email",
  "facilitator_name",
  "facilitator_faculty",
  "facilitator_department",
  "start_time",
  "end_time",
];
const TEMPLATE_EXAMPLE_ROW = [
  "CIT 403",
  "Software Engineering",
  "3",
  "Computer Science",
  "400",
  "dr.jane.doe@noun.edu.ng",
  "Dr. Jane Doe",
  "Faculty of Science and Technology",
  "Computer Science",
  "2026-08-03T09:00:00",
  "2026-08-03T11:00:00",
];

function csvCell(value) {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadTemplate() {
  const csv = [TEMPLATE_HEADERS, TEMPLATE_EXAMPLE_ROW]
    .map((row) => row.map(csvCell).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lecture-bulk-import-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

// Runs `worker` over `items` with at most CONCURRENCY in flight at once,
// instead of one-at-a-time -- the difference between ~3 minutes and ~15
// seconds for a few hundred unique courses/lecturers.
async function runWithConcurrency(items, worker) {
  let index = 0;
  async function next() {
    while (index < items.length) {
      const item = items[index++];
      await worker(item);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) || 1 }, next),
  );
}

export default function LectureImport() {
  const [rows, setRows] = useState([]);
  const [settings, setSettings] = useState({
    active_academic_session: "",
    active_semester: "",
  });
  const [importing, setImporting] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState([]);
  const [issues, setIssues] = useState([]);
  const [importError, setImportError] = useState("");

  // Guards against the most common way this looked "broken": a reload/tab
  // close mid-import silently kills it with nothing saved past that point.
  // Doesn't cover in-app navigation (SPA route changes don't fire this), but
  // the much shorter run time below makes that far less tempting to begin with.
  useEffect(() => {
    if (!importing) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [importing]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setResults([]);
    setIssues([]);
    setImportError("");

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
    setIssues([]);
    setImportError("");
    const toImport = rows.filter((r) => r.matched);
    const phaseIssues = [];

    try {
      const existingCourseRows = uniqueBy(
        toImport.filter((r) => r.existingCourseId),
        (r) => r.course_code,
      );
      const newCourseRows = uniqueBy(
        toImport.filter((r) => r.needsNewCourse),
        (r) => r.course_code,
      );
      const existingLecturerRows = uniqueBy(
        toImport.filter((r) => r.existingLecturerId),
        (r) => r.facilitator_email,
      );
      const newLecturerRows = uniqueBy(
        toImport.filter((r) => r.needsNewLecturer),
        (r) => r.facilitator_email,
      );
      // Deduped by the CSV's own source keys (facilitator_email + course_code)
      // rather than DB-resolved ids, so the exact pair count is known upfront
      // -- no need to guess a total before Phase A/B run and correct it
      // after, which previously let the displayed "done" count drift past
      // "total" once corrected mid-import.
      const uniquePairs = uniqueBy(
        toImport,
        (r) => `${r.facilitator_email}:${r.course_code}`,
      );

      const totalWork =
        existingCourseRows.length +
        newCourseRows.length +
        existingLecturerRows.length +
        newLecturerRows.length +
        uniquePairs.length +
        toImport.length; // lecture creation
      let done = 0;
      setProgress({ done: 0, total: totalWork });
      const bump = () =>
        setProgress((p) => ({ ...p, done: Math.min(++done, totalWork) }));

      // Phase A: create missing courses (deduped by course_code); update
      // existing ones so a re-imported CSV refreshes stale title/units/etc.
      setProgressMessage("Creating/updating courses…");
      const courseIdByCode = {};
      const courseTitleByCode = {};
      for (const row of existingCourseRows) {
        courseIdByCode[row.course_code] = row.existingCourseId;
        courseTitleByCode[row.course_code] = row.existingCourseTitle;
      }

      await runWithConcurrency(
        existingCourseRows.filter((r) => r.course_title?.trim()),
        async (row) => {
          const { data, error } = await supabase
            .from("courses")
            .update({
              course_title: row.course_title.trim(),
              credit_units: row.credit_units ? Number(row.credit_units) : null,
              programme: row.programme || null,
              level: row.level
                ? Number(row.level)
                : deriveLevelFromCode(row.course_code),
            })
            .eq("id", row.existingCourseId)
            .select()
            .single();
          if (data) courseTitleByCode[row.course_code] = data.course_title;
          if (error)
            phaseIssues.push({
              phase: "course update",
              item: row.course_code,
              error: error.message,
            });
          bump();
        },
      );

      await runWithConcurrency(newCourseRows, async (row) => {
        const { data, error } = await supabase
          .from("courses")
          .insert({
            course_code: row.course_code,
            course_title: row.course_title.trim(),
            credit_units: row.credit_units ? Number(row.credit_units) : null,
            programme: row.programme || null,
            level: row.level
              ? Number(row.level)
              : deriveLevelFromCode(row.course_code),
            semester: settings.active_semester,
            academic_session: settings.active_academic_session,
          })
          .select()
          .single();
        if (!error) {
          courseIdByCode[row.course_code] = data.id;
          courseTitleByCode[row.course_code] = data.course_title;
        } else {
          phaseIssues.push({
            phase: "course create",
            item: row.course_code,
            error: error.message,
          });
        }
        bump();
      });

      // Phase B: invite missing lecturers (deduped by email); update existing
      // ones so a re-imported CSV refreshes stale name/faculty/department.
      setProgressMessage("Creating/updating lecturers…");
      const lecturerIdByEmail = {};
      for (const row of existingLecturerRows) {
        lecturerIdByEmail[row.facilitator_email] = row.existingLecturerId;
      }

      await runWithConcurrency(
        existingLecturerRows.filter((r) => r.facilitator_name?.trim()),
        async (row) => {
          const { error } = await supabase
            .from("profiles")
            .update({
              full_name: row.facilitator_name.trim(),
              faculty: row.facilitator_faculty || null,
              department: row.facilitator_department || null,
            })
            .eq("id", row.existingLecturerId);
          if (error)
            phaseIssues.push({
              phase: "lecturer update",
              item: row.facilitator_email,
              error: error.message,
            });
          bump();
        },
      );

      await runWithConcurrency(newLecturerRows, async (row) => {
        const { data, error } = await supabase.functions.invoke(
          "admin-invite-user",
          {
            body: {
              email: row.facilitator_email,
              role: "lecturer",
              full_name: row.facilitator_name.trim(),
              faculty: row.facilitator_faculty || null,
              department: row.facilitator_department || null,
              password: DEFAULT_BULK_PASSWORD,
            },
          },
        );
        if (!error && data?.user?.id) {
          lecturerIdByEmail[row.facilitator_email] = data.user.id;
        } else if (error) {
          phaseIssues.push({
            phase: "lecturer invite",
            item: row.facilitator_email,
            error: await getFunctionErrorMessage(error),
          });
        }
        bump();
      });

      // Phase C: assign lecturer <-> course pairs (deduped)
      setProgressMessage("Assigning courses to lecturers…");
      await runWithConcurrency(uniquePairs, async (row) => {
        const courseId = courseIdByCode[row.course_code];
        const lecturerId = lecturerIdByEmail[row.facilitator_email];
        if (courseId && lecturerId) {
          // Expected to fail silently for pairs already assigned in an
          // earlier import -- unique constraint, not a real error worth
          // surfacing.
          await supabase.from("lecturer_courses").insert({
            lecturer_id: lecturerId,
            course_id: courseId,
            academic_session: settings.active_academic_session,
          });
        }
        bump();
      });

      // Phase D: create the lectures themselves
      setProgressMessage("Creating lectures…");
      const outcomes = [];
      await runWithConcurrency(toImport, async (row) => {
        const courseId = courseIdByCode[row.course_code];
        const facilitatorId = lecturerIdByEmail[row.facilitator_email];
        if (!courseId || !facilitatorId) {
          outcomes.push({
            row,
            ok: false,
            error: "Course or lecturer could not be resolved/created",
          });
          bump();
          return;
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
        outcomes.push({
          row,
          ok: !error,
          error: error ? await getFunctionErrorMessage(error) : null,
        });
        bump();
      });

      setResults(outcomes);
      setIssues(phaseIssues);
    } catch (err) {
      setImportError(
        err?.message ||
          "Import failed unexpectedly. Check your connection and try again.",
      );
    } finally {
      setProgressMessage("");
      setImporting(false);
    }
  };

  const matchedCount = rows.filter((r) => r.matched).length;

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <Breadcrumbs
            items={[
              { label: "Lectures", to: "/admin/lectures" },
              { label: "Bulk Import" },
            ]}
          />
          <h1 className="text-lg font-semibold">Bulk Import Lectures</h1>
        </div>
      </div>

      <div className="bg-white rounded-[1.1rem] shadow-md p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <input type="file" accept=".csv" onChange={handleFile} />
          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline shrink-0"
          >
            <FiDownload size={14} /> Download template
          </button>
        </div>

        {rows.length > 0 && (
          <div className="sticky top-0 z-10 bg-white pb-3 mb-3 border-b border-gray-100">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleImport}
                disabled={importing || matchedCount === 0}
                className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2 font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {importing
                  ? progressMessage || "Importing…"
                  : `Import ${matchedCount} lectures`}
              </button>
              {importing && progress.total > 0 && (
                <span className="text-xs text-gray-500">
                  {progress.done} / {progress.total}
                </span>
              )}
            </div>
            {importing && progress.total > 0 && (
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2 max-w-md">
                <div
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (progress.done / progress.total) * 100)}%`,
                  }}
                />
              </div>
            )}

            {importError && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-3 mt-3">
                {importError}
              </div>
            )}

            {(results.length > 0 || issues.length > 0) && (
              <div className="mt-3 text-sm">
                {results.length > 0 && (
                  <p className="font-semibold mb-1">
                    {results.filter((r) => r.ok).length} of {results.length}{" "}
                    lectures imported successfully.
                  </p>
                )}
                {issues.length > 0 && (
                  <p className="text-orange-500 mb-1">
                    {issues.length} course/lecturer setup issue(s), lectures
                    depending on these may have failed too.
                  </p>
                )}
                <div className="max-h-40 overflow-y-auto">
                  {results
                    .filter((r) => !r.ok)
                    .map((r, idx) => (
                      <p key={`r-${idx}`} className="text-red-500">
                        {r.row.course_code}: {r.error}
                      </p>
                    ))}
                  {issues.map((i, idx) => (
                    <p key={`i-${idx}`} className="text-orange-500">
                      [{i.phase}] {i.item}: {i.error}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto">
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
        )}
      </div>
    </>
  );
}

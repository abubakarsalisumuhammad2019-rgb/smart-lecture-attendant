import { motion } from "motion/react";
import Papa from "papaparse";
import { useEffect, useMemo, useState } from "react";
import { getFunctionErrorMessage } from "../lib/functionError";
import { supabase } from "../lib/supabaseClient";

// Supabase Auth's default minimum password length is 6 -- "12345" would be
// rejected outright, so bulk-created accounts get this instead. Lecturers can
// (and should) change it after their first sign-in.
const DEFAULT_BULK_PASSWORD = "123456";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("student");
  const [inviteFullName, setInviteFullName] = useState("");

  const [showBulkImport, setShowBulkImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);

  const [assigningFor, setAssigningFor] = useState(null);
  const [assignCourseId, setAssignCourseId] = useState("");

  const loadData = async () => {
    setLoading(true);
    const [usersRes, coursesRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("courses").select("*").order("course_code"),
    ]);
    setUsers(usersRes.data || []);
    setCourses(coursesRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (
        query &&
        !u.full_name?.toLowerCase().includes(query) &&
        !u.email?.toLowerCase().includes(query)
      )
        return false;
      return true;
    });
  }, [users, search, roleFilter, statusFilter]);

  const updateUser = async (id, patch) => {
    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", id);
    if (error) {
      setMessage(error.message);
    } else {
      loadData();
    }
  };

  const handleInvite = async () => {
    if (!inviteEmail) {
      setMessage("Email is required.");
      return;
    }
    const { error } = await supabase.functions.invoke("admin-invite-user", {
      body: { email: inviteEmail, role: inviteRole, full_name: inviteFullName },
    });
    if (error) {
      setMessage(await getFunctionErrorMessage(error));
    } else {
      setMessage(`Invited ${inviteEmail}.`);
      setInviteEmail("");
      setInviteFullName("");
      setShowInvite(false);
      loadData();
    }
  };

  const handleBulkImportLecturers = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async ({ data }) => {
        setImporting(true);
        setImportResults(null);
        const existingEmails = new Set(users.map((u) => u.email));
        const results = { created: 0, skipped: 0, failed: [] };

        for (const row of data) {
          const email = row.email?.trim();
          const fullName = row.full_name?.trim();
          if (!email || !fullName) {
            results.failed.push({
              email: email || "(blank)",
              reason: "missing email or full_name",
            });
            continue;
          }
          if (existingEmails.has(email)) {
            results.skipped += 1;
            continue;
          }

          const { error } = await supabase.functions.invoke(
            "admin-invite-user",
            {
              body: {
                email,
                role: "lecturer",
                full_name: fullName,
                password: DEFAULT_BULK_PASSWORD,
                department: row.department || null,
                faculty: row.faculty || null,
              },
            },
          );

          if (error) {
            results.failed.push({
              email,
              reason: await getFunctionErrorMessage(error),
            });
          } else {
            results.created += 1;
            existingEmails.add(email);
          }
        }

        setImportResults(results);
        setImporting(false);
        loadData();
      },
    });

    e.target.value = "";
  };

  const handleAssign = async () => {
    if (!assigningFor || !assignCourseId) return;
    const { data: sessionSetting } = await supabase
      .from("app_settings")
      .select("*")
      .eq("key", "active_academic_session")
      .maybeSingle();
    const { error } = await supabase.from("lecturer_courses").insert({
      lecturer_id: assigningFor,
      course_id: assignCourseId,
      academic_session: sessionSetting?.value || "",
    });
    if (error) {
      setMessage(
        error.code === "23505"
          ? "This lecturer is already assigned to that course."
          : error.message,
      );
    } else {
      setMessage("Course assigned.");
    }
    setAssigningFor(null);
    setAssignCourseId("");
  };

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <p>Pages / Users</p>
          <h1 className="text-lg font-semibold">Users</h1>
        </div>
      </div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-50 text-blue-700 text-sm rounded-xl px-4 py-2 mb-4"
        >
          {message}
        </motion.div>
      )}

      {/* Filter toolbar */}
      <div className="bg-white rounded-[1.1rem] shadow-md p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="h-11 px-3 border border-gray-200 rounded-xl text-sm"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-11 px-3 border border-gray-200 rounded-xl text-sm"
          >
            <option value="all">All roles</option>
            <option value="student">Student</option>
            <option value="lecturer">Lecturer</option>
            <option value="admin">Admin</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-11 px-3 border border-gray-200 rounded-xl text-sm"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowInvite(true)}
            className="h-11 whitespace-nowrap rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-4 font-bold text-white text-sm hover:opacity-90"
          >
            + Invite
          </button>
          <button
            onClick={() => setShowBulkImport(true)}
            className="h-11 whitespace-nowrap rounded-xl bg-white border border-blue-600 px-4 font-bold text-blue-600 text-sm hover:bg-blue-50"
          >
            Bulk Import Lecturers
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[1.1rem] shadow-md p-4">
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto border-separate border-spacing-y-2 text-sm text-gray-900">
            <thead>
              <tr className="bg-[#F7F7F7]">
                <th className="text-left px-4 py-3 rounded-l-lg">Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 rounded-r-lg">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="5" className="text-center py-4 text-gray-500">
                    Loading...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-4 text-gray-500">
                    No users match these filters.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((u) => (
                  <tr
                    key={u.id}
                    className="hover:bg-[#f0f4f8] transition-colors duration-200"
                  >
                    <td className="px-4 py-3">{u.full_name}</td>
                    <td className="px-4 py-3">{u.email}</td>
                    <td className="px-4 py-3 capitalize">{u.role}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          u.status === "active"
                            ? "text-green-600"
                            : u.status === "pending"
                              ? "text-orange-500"
                              : "text-red-500"
                        }
                      >
                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2 text-xs">
                        {u.status === "pending" && (
                          <button
                            onClick={() =>
                              updateUser(u.id, { status: "active" })
                            }
                            className="text-green-600 hover:underline"
                          >
                            Approve
                          </button>
                        )}
                        {u.status === "active" && (
                          <button
                            onClick={() =>
                              updateUser(u.id, { status: "suspended" })
                            }
                            className="text-red-500 hover:underline"
                          >
                            Suspend
                          </button>
                        )}
                        {u.status === "suspended" && (
                          <button
                            onClick={() =>
                              updateUser(u.id, { status: "active" })
                            }
                            className="text-green-600 hover:underline"
                          >
                            Reactivate
                          </button>
                        )}
                        {u.role === "lecturer" && (
                          <button
                            onClick={() => setAssigningFor(u.id)}
                            className="text-indigo-600 hover:underline"
                          >
                            Assign Course
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showInvite && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Invite a User</h2>
            <div className="flex flex-col gap-3">
              <input
                value={inviteFullName}
                onChange={(e) => setInviteFullName(e.target.value)}
                placeholder="Full name"
                className="h-11 px-3 border border-gray-200 rounded-xl text-sm"
              />
              <input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="Email"
                className="h-11 px-3 border border-gray-200 rounded-xl text-sm"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="h-11 px-3 border border-gray-200 rounded-xl text-sm"
              >
                <option value="student">Student</option>
                <option value="lecturer">Lecturer</option>
              </select>
            </div>
            <div className="border-t border-gray-100 pt-3 mt-4 flex justify-end gap-3">
              <button
                onClick={() => setShowInvite(false)}
                className="text-gray-600 px-4 py-2 rounded-xl hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleInvite}
                className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2 font-bold text-white hover:opacity-90"
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkImport && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-2">
              Bulk Import Lecturers
            </h2>
            <p className="text-xs text-gray-500 mb-1">
              CSV columns: email, full_name, department, faculty.
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Each account is created with the default password{" "}
              <code className="bg-gray-100 px-1 rounded">
                {DEFAULT_BULK_PASSWORD}
              </code>{" "}
              and no email confirmation needed lecturers should change it after
              signing in.
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleBulkImportLecturers}
              disabled={importing}
              className="mb-4"
            />

            {importing && <p className="text-sm text-gray-500">Importing…</p>}

            {importResults && (
              <div className="text-sm bg-gray-50 rounded-xl p-3 mb-4">
                <p className="font-medium text-gray-700">
                  {importResults.created} created, {importResults.skipped}{" "}
                  already existed (skipped).
                </p>
                {importResults.failed.length > 0 && (
                  <ul className="mt-1 text-red-500 text-xs list-disc list-inside">
                    {importResults.failed.map((f, idx) => (
                      <li key={idx}>
                        {f.email}: {f.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="border-t border-gray-100 pt-3 flex justify-end">
              <button
                onClick={() => {
                  setShowBulkImport(false);
                  setImportResults(null);
                }}
                className="text-gray-600 px-4 py-2 rounded-xl hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {assigningFor && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-lg font-semibold mb-4">Assign Course</h2>
            <select
              value={assignCourseId}
              onChange={(e) => setAssignCourseId(e.target.value)}
              className="w-full h-11 px-3 border border-gray-200 rounded-xl text-sm mb-4"
            >
              <option value="">Select a course</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.course_code} {c.course_title}
                </option>
              ))}
            </select>
            <div className="border-t border-gray-100 pt-3 flex justify-end gap-3">
              <button
                onClick={() => setAssigningFor(null)}
                className="text-gray-600 px-4 py-2 rounded-xl hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAssign}
                className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2 font-bold text-white hover:opacity-90"
              >
                Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

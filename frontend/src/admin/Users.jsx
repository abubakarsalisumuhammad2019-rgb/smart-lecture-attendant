import Papa from "papaparse";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { getFunctionErrorMessage } from "../lib/functionError";
import { supabase } from "../lib/supabaseClient";
import { DEPARTMENTS_BY_FACULTY, getFacultyForDepartment } from "../lib/departments";
import { getProgrammesForDepartment } from "../lib/programmes";
import { deriveNounEmail } from "../lib/nounEmail";
import { ConfirmDialog } from "../shared/ConfirmDialog";
import { Breadcrumbs } from "../components/Breadcrumbs";

// Supabase Auth's default minimum password length is 6 -- "12345" would be
// rejected outright, so bulk-created accounts get this instead. Lecturers can
// (and should) change it after their first sign-in.
const DEFAULT_BULK_PASSWORD = "123456";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("student");
  const [inviteFullName, setInviteFullName] = useState("");
  const [inviteMatricNumber, setInviteMatricNumber] = useState("");
  const [inviting, setInviting] = useState(false);

  const [showBulkImport, setShowBulkImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);

  const [assigningFor, setAssigningFor] = useState(null);
  const [assignCourseId, setAssignCourseId] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [statusUpdatingId, setStatusUpdatingId] = useState(null);
  const [confirmingSuspendId, setConfirmingSuspendId] = useState(null);

  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({
    full_name: "",
    matric_number: "",
    phone: "",
    department: "",
    programme: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);

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

  const updateUser = async (id, patch, successMessage) => {
    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", id);
    if (error) {
      toast.error(error.message);
    } else {
      if (successMessage) toast.success(successMessage);
      loadData();
    }
  };

  const handleStatusChange = async (id, status, successMessage) => {
    setStatusUpdatingId(id);
    await updateUser(id, { status }, successMessage);
    setStatusUpdatingId(null);
  };

  const handleConfirmSuspend = async () => {
    await handleStatusChange(confirmingSuspendId, "suspended", "User suspended.");
    setConfirmingSuspendId(null);
  };

  const handleInvite = async () => {
    if (inviteRole === "student" && !inviteMatricNumber) {
      toast.error("Matric Number is required.");
      return;
    }
    if (inviteRole === "lecturer" && !inviteEmail) {
      toast.error("Email is required.");
      return;
    }

    setInviting(true);
    const invitedEmail = inviteRole === "student" ? deriveNounEmail(inviteMatricNumber) : inviteEmail;
    const { data, error } = await supabase.functions.invoke("admin-invite-user", {
      body: {
        email: invitedEmail,
        role: inviteRole,
        full_name: inviteFullName,
        matric_number: inviteRole === "student" ? inviteMatricNumber : undefined,
      },
    });
    setInviting(false);
    if (error) {
      toast.error(await getFunctionErrorMessage(error));
    } else if (data?.email_warning) {
      // Account was created either way, but the password email couldn't be
      // delivered -- the edge function hands the password back in this case
      // so it isn't otherwise unrecoverable.
      toast.error(
        `Account created for ${invitedEmail}, but the password email failed to send. Their password is: ${data.password}`,
        { duration: 15000 },
      );
      setInviteEmail("");
      setInviteFullName("");
      setInviteMatricNumber("");
      setShowInvite(false);
      loadData();
    } else {
      toast.success(`Account created. Their password was emailed to ${invitedEmail}.`);
      setInviteEmail("");
      setInviteFullName("");
      setInviteMatricNumber("");
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
    setAssigning(true);
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
    setAssigning(false);
    if (error) {
      toast.error(
        error.code === "23505"
          ? "This lecturer is already assigned to that course."
          : error.message,
      );
    } else {
      toast.success("Course assigned.");
    }
    setAssigningFor(null);
    setAssignCourseId("");
  };

  const openEdit = (u) => {
    setEditingUser(u);
    setEditForm({
      full_name: u.full_name || "",
      matric_number: u.matric_number || "",
      phone: u.phone || "",
      department: u.department || "",
      programme: u.programme || "",
    });
  };

  const handleEditDepartmentChange = (value) => {
    setEditForm((prev) => ({ ...prev, department: value, programme: "" }));
  };

  const handleSaveEdit = async () => {
    if (!editingUser) return;
    setSavingEdit(true);

    const patch = {
      full_name: editForm.full_name.trim(),
      phone: editForm.phone.trim(),
    };
    if (editingUser.role === "student") {
      patch.matric_number = editForm.matric_number.trim();
    }
    if (editingUser.role === "student" || editingUser.role === "lecturer") {
      patch.department = editForm.department;
      patch.faculty = getFacultyForDepartment(editForm.department);
    }
    if (editingUser.role === "student") {
      patch.programme = editForm.programme;
    }

    const { error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("id", editingUser.id);

    setSavingEdit(false);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success("User updated.");
      setEditingUser(null);
      loadData();
    }
  };

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <Breadcrumbs items={[{ label: "Users" }]} />
          <h1 className="text-lg font-semibold">Users</h1>
        </div>
      </div>

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
        <div className="flex flex-wrap gap-2 justify-end">
          <button
            onClick={() => setShowInvite(true)}
            className="h-11 whitespace-nowrap rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-4 font-bold text-white text-sm hover:opacity-90"
          >
            + Invite User
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
                            onClick={() => handleStatusChange(u.id, "active", "User approved.")}
                            disabled={statusUpdatingId === u.id}
                            className="text-green-600 hover:underline disabled:opacity-50"
                          >
                            {statusUpdatingId === u.id ? "Approving…" : "Approve"}
                          </button>
                        )}
                        {u.status === "active" && (
                          <button
                            onClick={() => setConfirmingSuspendId(u.id)}
                            disabled={statusUpdatingId === u.id}
                            className="text-red-500 hover:underline disabled:opacity-50"
                          >
                            {statusUpdatingId === u.id ? "Suspending…" : "Suspend"}
                          </button>
                        )}
                        {u.status === "suspended" && (
                          <button
                            onClick={() => handleStatusChange(u.id, "active", "User reactivated.")}
                            disabled={statusUpdatingId === u.id}
                            className="text-green-600 hover:underline disabled:opacity-50"
                          >
                            {statusUpdatingId === u.id ? "Reactivating…" : "Reactivate"}
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
                        <button
                          onClick={() => openEdit(u)}
                          className="text-gray-600 hover:underline"
                        >
                          Edit
                        </button>
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
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="h-11 px-3 border border-gray-200 rounded-xl text-sm"
              >
                <option value="student">Student</option>
                <option value="lecturer">Lecturer</option>
              </select>
              {inviteRole === "student" ? (
                <>
                  <input
                    value={inviteMatricNumber}
                    onChange={(e) => setInviteMatricNumber(e.target.value)}
                    placeholder="Matric number, e.g. NOU/2024/12345"
                    className="h-11 px-3 border border-gray-200 rounded-xl text-sm"
                  />
                  <input
                    value={inviteMatricNumber ? deriveNounEmail(inviteMatricNumber) : ""}
                    disabled
                    placeholder="NOUN email (auto-generated)"
                    className="h-11 px-3 border border-gray-200 rounded-xl text-sm bg-gray-100 text-gray-500"
                  />
                </>
              ) : (
                <input
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Email"
                  className="h-11 px-3 border border-gray-200 rounded-xl text-sm"
                />
              )}
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
                disabled={inviting}
                className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2 font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {inviting ? "Sending…" : "Send Invite"}
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
                disabled={assigning}
                className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2 font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {assigning ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold mb-1">Edit User</h2>
            <p className="text-xs text-gray-400 mb-4">
              {editingUser.email} · <span className="capitalize">{editingUser.role}</span>
            </p>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Full Name</label>
                <input
                  value={editForm.full_name}
                  onChange={(e) => setEditForm((p) => ({ ...p, full_name: e.target.value }))}
                  className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Phone Number</label>
                <input
                  value={editForm.phone}
                  onChange={(e) => setEditForm((p) => ({ ...p, phone: e.target.value }))}
                  className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full"
                />
              </div>

              {editingUser.role === "student" && (
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Matric Number</label>
                  <input
                    value={editForm.matric_number}
                    onChange={(e) => setEditForm((p) => ({ ...p, matric_number: e.target.value }))}
                    className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full"
                  />
                </div>
              )}

              {(editingUser.role === "student" || editingUser.role === "lecturer") && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Department</label>
                    <select
                      value={editForm.department}
                      onChange={(e) => handleEditDepartmentChange(e.target.value)}
                      className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full bg-white"
                    >
                      <option value="">Select department</option>
                      {Object.entries(DEPARTMENTS_BY_FACULTY).map(([faculty, departments]) => (
                        <optgroup key={faculty} label={faculty}>
                          {departments.map((dept) => (
                            <option key={dept} value={dept}>{dept}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {editingUser.role === "student" && (
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-gray-700">Programme</label>
                      <select
                        value={editForm.programme}
                        onChange={(e) => setEditForm((p) => ({ ...p, programme: e.target.value }))}
                        disabled={!editForm.department}
                        className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full bg-white disabled:bg-gray-100"
                      >
                        <option value="">{editForm.department ? 'Select programme' : 'Select a department first'}</option>
                        {getProgrammesForDepartment(editForm.department).map((prog) => (
                          <option key={prog} value={prog}>{prog}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Faculty</label>
                    <input
                      value={getFacultyForDepartment(editForm.department)}
                      disabled
                      className="h-11 px-3 border border-gray-200 rounded-xl text-sm w-full bg-gray-100 text-gray-500"
                      placeholder="Auto-set from department"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-gray-100 pt-3 mt-4 flex justify-end gap-3">
              <button
                onClick={() => setEditingUser(null)}
                className="text-gray-600 px-4 py-2 rounded-xl hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2 font-bold text-white hover:opacity-90 disabled:opacity-50"
              >
                {savingEdit ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={!!confirmingSuspendId}
        title="Suspend this user?"
        message="They won't be able to sign in until reactivated."
        confirmLabel="Suspend"
        danger
        submitting={statusUpdatingId === confirmingSuspendId}
        onConfirm={handleConfirmSuspend}
        onClose={() => setConfirmingSuspendId(null)}
      />
    </>
  );
}

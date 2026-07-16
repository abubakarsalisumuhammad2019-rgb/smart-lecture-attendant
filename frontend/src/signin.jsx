import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import toast from "react-hot-toast";
import { supabase } from "./lib/supabaseClient";
import { DEPARTMENTS_BY_FACULTY, getFacultyForDepartment } from "./lib/departments";
import { getProgrammesForDepartment } from "./lib/programmes";
import { deriveNounEmail } from "./lib/nounEmail";

const HOME_BY_ROLE = { admin: "/dashboard", lecturer: "/lecturer", student: "/student" };

const EMPTY_FORM = {
  full_name: "",
  email: "",
  password: "",
  retype: "",
  matric_number: "",
  programme: "",
  department: "",
};

const Signin = ({ classname }) => {
  const [authMode, setAuthMode] = useState("login");
  const [signupStep, setSignupStep] = useState(1);
  const [signupRole, setSignupRole] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [signingIn, setSigningIn] = useState(false);
  const [signingUp, setSigningUp] = useState(false);

  const updateForm = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  // Programme options depend on the chosen department, so switching department
  // clears any previously selected programme that no longer applies.
  const handleStudentDepartmentChange = (value) => {
    setForm((f) => ({ ...f, department: value, programme: "" }));
  };

  const switchMode = (mode) => {
    setAuthMode(mode);
    setSignupStep(1);
    setSignupRole(null);
    setForm(EMPTY_FORM);
  };

  const handleSelectRole = (role) => {
    setSignupRole(role);
    setSignupStep(2);
  };

  const handleSignup = async () => {
    if (form.password !== form.retype) {
      toast.error("Passwords do not match!");
      return;
    }
    if (!form.full_name || !form.password) {
      toast.error("Please fill in all required fields.");
      return;
    }
    if (signupRole === "student" && !form.matric_number) {
      toast.error("Matric Number is required.");
      return;
    }
    if (signupRole === "lecturer" && !form.email) {
      toast.error("Email is required.");
      return;
    }
    if (signupRole === "lecturer" && !form.department) {
      toast.error("Department is required.");
      return;
    }

    const metadata = { full_name: form.full_name, role: signupRole };
    let signupEmail = form.email;
    if (signupRole === "student") {
      metadata.matric_number = form.matric_number;
      metadata.programme = form.programme;
      metadata.department = form.department;
      metadata.faculty = getFacultyForDepartment(form.department);
      signupEmail = deriveNounEmail(form.matric_number);
    } else if (signupRole === "lecturer") {
      metadata.department = form.department;
      metadata.faculty = getFacultyForDepartment(form.department);
    }

    setSigningUp(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: signupEmail,
        password: form.password,
        options: { data: metadata },
      });

      if (!error) {
        toast.success(
          signupRole === "lecturer"
            ? "Signup successful! Check your email to confirm your account. An admin will need to approve your account before you can sign in."
            : "Signup successful! Check your email to confirm your account before signing in.",
        );
        switchMode("login");
      } else if (/already (registered|exists)/i.test(error.message)) {
        toast.error("Email already registered");
      } else {
        toast.error(error.message);
      }
    } catch (err) {
      toast.error("Something went wrong!");
      console.error(err);
    } finally {
      setSigningUp(false);
    }
  };

  const handleSignin = async () => {
    const emailOrUsername = document.querySelector("#signin-email").value;
    const password = document.querySelector("#signin-password").value;

    setSigningIn(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailOrUsername,
        password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, status")
        .eq("id", data.user.id)
        .single();

      if (!profile) {
        window.location.href = "/dashboard";
        return;
      }

      if (profile.status === "suspended") {
        toast.error("Your account has been suspended. Contact an administrator.");
        await supabase.auth.signOut();
        return;
      }

      if (profile.status === "pending") {
        window.location.href = "/pending-approval";
        return;
      }

      window.location.href = HOME_BY_ROLE[profile.role] || "/dashboard";
    } catch (err) {
      toast.error("Signin failed!");
      console.error(err);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col md:max-w-none md:flex-row md:pr-10">
      <div className="max-w-[50rem] rounded-3xl bg-gradient-to-t from-blue-700 via-blue-700 to-blue-600 px-4 py-10 text-white sm:px-10 md:m-6 md:mr-8">
        <p className="mb-20 font-bold tracking-wider">University Admin Panel</p>
        <p className="mb-4 text-3xl font-bold md:text-4xl md:leading-snug">
          Welcome to <br />
          <span className="text-yellow-300">National Open University</span>
        </p>
        <p className="mb-28 font-semibold leading-relaxed text-gray-200">
          Admin Pannel
        </p>
        <div className="bg-blue-600/80 rounded-2xl px-6 py-8">
          <p className="mb-3 text-gray-200">
            "An Admin Panel for the Attendance Management System, designed to
            efficiently track and manage student data."
          </p>
          <div className="flex items-center">
            <p className="">
              <strong className="block text-yellow-300 font-medium">
                Department Of Computer Science
              </strong>
              <span className="text-xs text-gray-200">
                {" "}
                Guide : ABUBAKAR SALISU MUHAMMAD{" "}
              </span>
            </p>
          </div>
        </div>
      </div>
      <div className="w-full flex items-center justify-center py-10">
        <div className="w-full max-w-md px-4">
          <h2 className="mb-2 text-3xl font-bold">
            {authMode === "login" ? "Admin Login" : "Create Account"}
          </h2>
          <p className="mb-1 font-medium text-gray-500">Select Mode</p>

          <div className="mb-6 flex flex-col gap-y-2 gap-x-4 sm:flex-row">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`relative flex-1 sm:w-56 items-center justify-center rounded-xl px-4 py-3 font-medium cursor-pointer transition-colors ${
                authMode === "login"
                  ? "bg-blue-200 text-blue-800"
                  : "bg-gray-50 text-gray-700 hover:bg-gray-100"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`relative flex-1 sm:w-56 items-center justify-center rounded-xl px-4 py-3 font-medium cursor-pointer transition-colors ${
                authMode === "signup"
                  ? "bg-blue-200 text-blue-800"
                  : "bg-gray-50 text-gray-700 hover:bg-gray-100"
              }`}
            >
              Signup
            </button>
          </div>

          {authMode === "login" ? (
            <>
              <p className="mb-1 font-medium text-gray-500">Email</p>
              <div className="mb-4">
                <input
                  type="text"
                  id="signin-email"
                  className="w-full rounded-md border-2 border-gray-300 px-4 py-2"
                  placeholder="Enter your email"
                  required
                />
              </div>
              <p className="mb-1 font-medium text-gray-500">Password</p>
              <div className="mb-4">
                <input
                  type="password"
                  id="signin-password"
                  className="w-full rounded-md border-2 border-gray-300 px-4 py-2"
                  placeholder="Enter your password"
                  required
                />
              </div>
              <button
                onClick={handleSignin}
                disabled={signingIn}
                className="w-full rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-8 py-3 font-bold text-white transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50"
              >
                {signingIn ? "Signing in…" : "Sign In"}
              </button>
            </>
          ) : (
            <AnimatePresence mode="wait">
              {signupStep === 1 ? (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                >
                  <p className="mb-3 font-medium text-gray-500">I am a...</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => handleSelectRole("student")}
                      className="rounded-xl border border-gray-200 bg-white px-6 py-8 text-center font-semibold text-gray-700 shadow-sm transition-all hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5"
                    >
                      Student
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectRole("lecturer")}
                      className="rounded-xl border border-gray-200 bg-white px-6 py-8 text-center font-semibold text-gray-700 shadow-sm transition-all hover:border-blue-400 hover:shadow-md hover:-translate-y-0.5"
                    >
                      Lecturer
                    </button>
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                >
                  <button
                    type="button"
                    onClick={() => setSignupStep(1)}
                    className="mb-4 text-sm text-blue-600 hover:underline"
                  >
                    &larr; Change role ({signupRole === "student" ? "Student" : "Lecturer"})
                  </button>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 mb-4">
                    <div>
                      <p className="mb-1 font-medium text-gray-500 text-sm">Full Name</p>
                      <input
                        value={form.full_name}
                        onChange={(e) => updateForm("full_name", e.target.value)}
                        className="w-full rounded-md border-2 border-gray-300 px-4 py-2"
                        placeholder="Enter your full name"
                      />
                    </div>
                    {signupRole === "lecturer" && (
                      <div>
                        <p className="mb-1 font-medium text-gray-500 text-sm">Email</p>
                        <input
                          type="email"
                          value={form.email}
                          onChange={(e) => updateForm("email", e.target.value)}
                          className="w-full rounded-md border-2 border-gray-300 px-4 py-2"
                          placeholder="Enter your email"
                        />
                      </div>
                    )}

                    {signupRole === "student" ? (
                      <>
                        <div>
                          <p className="mb-1 font-medium text-gray-500 text-sm">Matric Number</p>
                          <input
                            value={form.matric_number}
                            onChange={(e) => updateForm("matric_number", e.target.value)}
                            className="w-full rounded-md border-2 border-gray-300 px-4 py-2"
                            placeholder="e.g. NOU/2024/12345"
                          />
                        </div>
                        <div>
                          <p className="mb-1 font-medium text-gray-500 text-sm">Your NOUN Email</p>
                          <input
                            value={form.matric_number ? deriveNounEmail(form.matric_number) : ""}
                            disabled
                            className="w-full rounded-md border-2 border-gray-200 bg-gray-100 px-4 py-2 text-gray-500"
                            placeholder="Auto-generated from matric number"
                          />
                        </div>
                        <div>
                          <p className="mb-1 font-medium text-gray-500 text-sm">Department</p>
                          <select
                            value={form.department}
                            onChange={(e) => handleStudentDepartmentChange(e.target.value)}
                            className="w-full rounded-md border-2 border-gray-300 px-4 py-2 bg-white"
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
                        <div className="sm:col-span-2">
                          <p className="mb-1 font-medium text-gray-500 text-sm">Programme</p>
                          <select
                            value={form.programme}
                            onChange={(e) => updateForm("programme", e.target.value)}
                            disabled={!form.department}
                            className="w-full rounded-md border-2 border-gray-300 px-4 py-2 bg-white disabled:bg-gray-100"
                          >
                            <option value="">{form.department ? "Select programme" : "Select a department first"}</option>
                            {getProgrammesForDepartment(form.department).map((prog) => (
                              <option key={prog} value={prog}>{prog}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="mb-1 font-medium text-gray-500 text-sm">Department</p>
                          <select
                            value={form.department}
                            onChange={(e) => updateForm("department", e.target.value)}
                            className="w-full rounded-md border-2 border-gray-300 px-4 py-2 bg-white"
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
                        <div>
                          <p className="mb-1 font-medium text-gray-500 text-sm">Faculty</p>
                          <input
                            value={getFacultyForDepartment(form.department)}
                            disabled
                            className="w-full rounded-md border-2 border-gray-200 bg-gray-100 px-4 py-2 text-gray-500"
                            placeholder="Auto-set from department"
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <p className="mb-1 font-medium text-gray-500 text-sm">Password</p>
                      <input
                        type="password"
                        value={form.password}
                        onChange={(e) => updateForm("password", e.target.value)}
                        className="w-full rounded-md border-2 border-gray-300 px-4 py-2"
                        placeholder="Enter your password"
                      />
                    </div>
                    <div>
                      <p className="mb-1 font-medium text-gray-500 text-sm">Retype Password</p>
                      <input
                        type="password"
                        value={form.retype}
                        onChange={(e) => updateForm("retype", e.target.value)}
                        className="w-full rounded-md border-2 border-gray-300 px-4 py-2"
                        placeholder="Retype your password"
                      />
                    </div>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSignup}
                    disabled={signingUp}
                    className="w-full rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-8 py-3 font-bold text-white transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50"
                  >
                    {signingUp ? "Signing up…" : "Sign Up"}
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
};

export default Signin;

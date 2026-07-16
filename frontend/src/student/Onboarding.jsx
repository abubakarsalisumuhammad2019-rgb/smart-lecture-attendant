import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { getFunctionErrorMessage } from '../lib/functionError';
import { extractCourseCodesFromSlip } from '../lib/slipParser';
import { WebcamCapture } from '../shared/WebcamCapture';

export default function Onboarding() {
  const { profile } = useAuth();
  const captureRef = useRef(null);

  const [step, setStep] = useState('courses');

  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [checkedCourseIds, setCheckedCourseIds] = useState(new Set());
  const [slipMatchedIds, setSlipMatchedIds] = useState(new Set());
  const [slipStatus, setSlipStatus] = useState('');
  const [slipMessage, setSlipMessage] = useState('');
  const [search, setSearch] = useState('');
  const [enrolling, setEnrolling] = useState(false);
  const [enrollError, setEnrollError] = useState('');
  const [maxCreditUnits, setMaxCreditUnits] = useState(null);
  const [capMessage, setCapMessage] = useState('');

  const [enrollingFace, setEnrollingFace] = useState(false);
  const [faceError, setFaceError] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data: settingsRows } = await supabase.from('app_settings').select('*');
      const settingsMap = Object.fromEntries((settingsRows || []).map((s) => [s.key, s.value]));
      const session = settingsMap.active_academic_session || '';
      const semester = settingsMap.active_semester || '';
      setMaxCreditUnits(settingsMap.max_credit_units ? Number(settingsMap.max_credit_units) : null);

      const { data } = await supabase
        .from('courses')
        .select('*')
        .eq('academic_session', session)
        .eq('semester', semester)
        .order('course_code');

      setCourses(data || []);
      setLoadingCourses(false);
    };
    load();
  }, []);

  if (profile.onboarding_complete) {
    return <Navigate to="/student/dashboard" replace />;
  }

  const filteredCourses = courses.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return c.course_code.toLowerCase().includes(q) || c.course_title.toLowerCase().includes(q);
  });

  const unitsOf = (courseId) => courses.find((c) => c.id === courseId)?.credit_units || 0;
  const selectedUnits = [...checkedCourseIds].reduce((sum, id) => sum + unitsOf(id), 0);

  const toggleCourse = (courseId) => {
    setCapMessage('');
    setCheckedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(courseId)) {
        next.delete(courseId);
        return next;
      }
      const course = courses.find((c) => c.id === courseId);
      const wouldBeUnits = [...prev].reduce((sum, id) => sum + unitsOf(id), 0) + (course?.credit_units || 0);
      if (maxCreditUnits && wouldBeUnits > maxCreditUnits) {
        setCapMessage(`You've reached the ${maxCreditUnits}-unit maximum for this semester -- deselect a course to add a different one.`);
        return prev;
      }
      next.add(courseId);
      return next;
    });
  };

  const handleSlipUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSlipStatus('parsing');
    setSlipMessage('');
    setCapMessage('');

    try {
      const codes = await extractCourseCodesFromSlip(file);
      const matched = courses.filter((c) => codes.includes(c.course_code));

      if (matched.length === 0) {
        setSlipStatus('error');
        setSlipMessage("Couldn't find any course codes in this file (likely a scanned image) -- select your courses manually below.");
      } else {
        let runningUnits = 0;
        const accepted = [];
        const skipped = [];
        for (const c of matched) {
          const nextUnits = runningUnits + (c.credit_units || 0);
          if (maxCreditUnits && nextUnits > maxCreditUnits) {
            skipped.push(c);
          } else {
            runningUnits = nextUnits;
            accepted.push(c);
          }
        }

        setCheckedCourseIds((prev) => new Set([...prev, ...accepted.map((c) => c.id)]));
        setSlipMatchedIds(new Set(accepted.map((c) => c.id)));
        setSlipStatus('parsed');
        const skippedNote = skipped.length > 0
          ? ` ${skipped.length} course${skipped.length === 1 ? '' : 's'} (${skipped.map((c) => c.course_code).join(', ')}) skipped -- adding them would exceed the ${maxCreditUnits}-unit semester maximum.`
          : '';
        setSlipMessage(`Matched ${matched.length} course${matched.length === 1 ? '' : 's'} from your slip -- review the pre-ticked list below and confirm.${skippedNote}`);
      }
    } catch (err) {
      setSlipStatus('error');
      setSlipMessage("Couldn't read this PDF -- select your courses manually below.");
    }

    e.target.value = '';
  };

  const handleConfirmEnrollment = async () => {
    if (checkedCourseIds.size === 0) {
      setEnrollError('Select at least one course.');
      return;
    }

    setEnrolling(true);
    setEnrollError('');

    const rows = [...checkedCourseIds].map((courseId) => {
      const course = courses.find((c) => c.id === courseId);
      return {
        student_id: profile.id,
        course_id: courseId,
        course_code: course.course_code,
        semester: course.semester,
        academic_session: course.academic_session,
        source: slipMatchedIds.has(courseId) ? 'slip_upload' : 'manual_student',
      };
    });

    const { error } = await supabase.from('enrollments').insert(rows);
    setEnrolling(false);

    if (error) {
      setEnrollError(error.message);
      return;
    }

    setStep('face');
  };

  const handleEnrollFace = async () => {
    setFaceError('');
    const image = captureRef.current?.capture();
    if (!image) {
      setFaceError('Could not capture from the camera. Check camera permissions and try again.');
      return;
    }

    setEnrollingFace(true);

    const { error: fnError } = await supabase.functions.invoke('face-enroll', {
      body: { matric_number: profile.matric_number, image },
    });

    if (fnError) {
      setEnrollingFace(false);
      setFaceError(await getFunctionErrorMessage(fnError, 'Could not enroll your face -- try again.'));
      return;
    }

    const { error } = await supabase
      .from('profiles')
      .update({
        face_enrolled: true,
        face_enrolled_at: new Date().toISOString(),
        onboarding_complete: true,
      })
      .eq('id', profile.id);

    setEnrollingFace(false);

    if (error) {
      setFaceError(error.message);
      return;
    }

    // Hard redirect so AuthContext re-fetches the profile with
    // onboarding_complete: true -- otherwise StudentGate would still see the
    // stale in-memory value and bounce back here.
    window.location.href = '/student/dashboard';
  };

  return (
    <div className="min-h-screen bg-split flex items-center justify-center p-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-md p-6 sm:p-8">
        <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
          Step {step === 'courses' ? '1' : '2'} of 2
        </p>
        <h1 className="text-xl font-bold text-gray-900 mb-6">
          {step === 'courses' ? 'Confirm your courses' : 'Enroll your face'}
        </h1>

        {step === 'courses' ? (
          <>
            <div className="mb-5">
              <label className="text-sm font-medium text-gray-700 block mb-1">Upload your course registration slip (PDF)</label>
              <input type="file" accept="application/pdf" onChange={handleSlipUpload} disabled={slipStatus === 'parsing'} className="text-sm" />
              {slipStatus === 'parsing' && <p className="text-xs text-gray-400 mt-1">Reading your slip…</p>}
              {slipMessage && (
                <p className={`text-xs mt-1 ${slipStatus === 'error' ? 'text-orange-500' : 'text-green-600'}`}>{slipMessage}</p>
              )}
            </div>

            <div className="mb-3">
              <label className="text-sm font-medium text-gray-700 block mb-1">Or select your courses manually</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by code or title…"
                className="h-10 px-3 border border-gray-200 rounded-xl text-sm w-full"
              />
            </div>

            {enrollError && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-3 mb-3">{enrollError}</div>
            )}

            {capMessage && (
              <div className="bg-orange-50 border border-orange-100 text-orange-700 text-sm rounded-xl px-3 py-3 mb-3">{capMessage}</div>
            )}

            <div className="border border-gray-100 rounded-xl max-h-64 overflow-y-auto mb-4">
              {loadingCourses ? (
                <p className="text-sm text-gray-500 p-4">Loading courses…</p>
              ) : filteredCourses.length === 0 ? (
                <p className="text-sm text-gray-500 p-4">No courses match your search.</p>
              ) : (
                filteredCourses.map((c) => {
                  const isChecked = checkedCourseIds.has(c.id);
                  const wouldExceedCap = !isChecked && maxCreditUnits && selectedUnits + (c.credit_units || 0) > maxCreditUnits;
                  return (
                    <label
                      key={c.id}
                      className={`flex items-center gap-3 px-4 py-2 border-b border-gray-50 last:border-0 ${wouldExceedCap ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-gray-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={wouldExceedCap}
                        onChange={() => toggleCourse(c.id)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm text-gray-800">
                        <span className="font-semibold">{c.course_code}</span> - {c.course_title}
                        {c.credit_units ? <span className="text-gray-400"> ({c.credit_units} units)</span> : null}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <p className="text-xs text-gray-400 mb-4">
              {checkedCourseIds.size} course{checkedCourseIds.size === 1 ? '' : 's'} selected
              {maxCreditUnits ? ` -- ${selectedUnits} of ${maxCreditUnits} units used` : ''}.
            </p>

            <button
              onClick={handleConfirmEnrollment}
              disabled={enrolling}
              className="w-full rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-8 py-3 font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
            >
              {enrolling ? 'Saving…' : 'Confirm Enrollment'}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              This is how you'll verify attendance before joining a lecture. Make sure you're clearly visible and alone in frame.
            </p>

            {faceError && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-3 mb-4">{faceError}</div>
            )}

            <div className="flex flex-col lg:flex-row gap-4">
              <div className="w-full lg:w-1/2">
                <WebcamCapture ref={captureRef} className="w-full aspect-video bg-black rounded-2xl shadow-2xl overflow-hidden" />
              </div>
              <div className="w-full lg:w-1/2 flex flex-col justify-center items-center text-center gap-4">
                <button
                  onClick={handleEnrollFace}
                  disabled={enrollingFace}
                  className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-8 py-3 font-bold text-white transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50"
                >
                  {enrollingFace ? 'Enrolling…' : 'Enroll Face'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

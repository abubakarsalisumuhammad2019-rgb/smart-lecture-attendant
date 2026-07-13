import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/AuthContext';
import { FACE_API_URL } from '../lib/faceApi';
import { getFunctionErrorMessage } from '../lib/functionError';
import { WebcamCapture } from '../shared/WebcamCapture';

const FAILURE_MESSAGES = {
  not_enrolled: "This face hasn't been enrolled yet. Finish onboarding first.",
  no_face_detected: "No face detected -- make sure your face is clearly visible and try again.",
  multiple_faces_detected: "More than one face detected -- make sure you're alone in frame and try again.",
};

export default function JoinLecture() {
  const { lectureId } = useParams();
  const { profile } = useAuth();
  const captureRef = useRef(null);

  const [lecture, setLecture] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('lectures')
        .select('*, courses(course_code, course_title)')
        .eq('id', lectureId)
        .single();
      setLecture(data || null);
      setLoading(false);
    };
    load();
  }, [lectureId]);

  const handleVerifyAndJoin = async () => {
    setError('');
    const image = captureRef.current?.capture();
    if (!image) {
      setError('Could not capture from the camera. Check camera permissions and try again.');
      return;
    }

    setVerifying(true);

    let verifyResult;
    try {
      const res = await fetch(`${FACE_API_URL}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matric_number: profile.matric_number, image }),
      });
      verifyResult = await res.json();
    } catch (err) {
      setVerifying(false);
      setError('Could not reach the face verification service. Try again in a moment.');
      return;
    }

    if (!verifyResult.verified) {
      setVerifying(false);
      setError(FAILURE_MESSAGES[verifyResult.reason] || "Face didn't match -- try again with better lighting.");
      return;
    }

    const { data, error: fnError } = await supabase.functions.invoke('zoom-register-participant', {
      body: { lecture_id: lectureId, face_verification_confidence: verifyResult.confidence },
    });

    setVerifying(false);

    if (fnError) {
      setError(await getFunctionErrorMessage(fnError, 'Failed to register for this lecture.'));
      return;
    }

    window.location.href = data.personal_join_url;
  };

  if (loading) {
    return <p className="text-white">Loading…</p>;
  }

  if (!lecture) {
    return <p className="text-white">Lecture not found.</p>;
  }

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center text-white mb-6 gap-4">
        <div>
          <p>Pages / Dashboard / Join</p>
          <h1 className="text-lg font-semibold">{lecture.topic}</h1>
        </div>
        <Link to="/student/dashboard" className="rounded-xl bg-white text-blue-700 px-5 py-2 font-bold hover:bg-gray-100">
          Back to Dashboard
        </Link>
      </div>

      <div className="bg-white rounded-[1.1rem] shadow-md p-4 sm:p-6">
        {lecture.status === 'cancelled' ? (
          <p className="text-sm text-red-500">This lecture has been cancelled.</p>
        ) : !lecture.meeting_web_url ? (
          <p className="text-sm text-orange-500">
            The facilitator hasn't set up the Zoom session for this lecture yet. Check back closer to the start time.
          </p>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              Face verification confirms your attendance before joining. Make sure you're clearly visible and alone in frame.
            </p>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-3 py-3 mb-4">{error}</div>
            )}

            <div className="flex flex-col lg:flex-row gap-4">
              <div className="w-full lg:w-1/2">
                <WebcamCapture ref={captureRef} className="w-full aspect-video bg-black rounded-2xl shadow-2xl overflow-hidden" />
              </div>
              <div className="w-full lg:w-1/2 flex flex-col justify-center items-center text-center gap-4">
                <button
                  onClick={handleVerifyAndJoin}
                  disabled={verifying}
                  className="w-full sm:w-auto rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-8 py-3 font-bold text-white transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-50"
                >
                  {verifying ? 'Verifying…' : 'Verify & Join'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}

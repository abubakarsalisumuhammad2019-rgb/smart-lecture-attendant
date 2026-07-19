import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import "./App.css";
import { getFunctionErrorMessage } from "./lib/functionError";
import { supabase } from "./lib/supabaseClient";

const Addstudent = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [matricInput, setMatricInput] = useState("");
  const [foundStudent, setFoundStudent] = useState(null);
  const [lookupMessage, setLookupMessage] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [enrollingFace, setEnrollingFace] = useState(false);

  useEffect(() => {
    const getCameraStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing webcam: ", err);
      }
    };

    getCameraStream();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach((track) => track.stop());
      }
    };
  }, []);

  const handleLookup = async () => {
    if (!matricInput.trim()) {
      setLookupMessage("Enter a Matric Number to look up.");
      return;
    }

    setLookingUp(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("role", "student")
      .eq("matric_number", matricInput.trim())
      .maybeSingle();
    setLookingUp(false);

    if (error || !data) {
      setFoundStudent(null);
      setLookupMessage(
        "No student account found with this Matric Number. Create their account first from Users → Invite, then come back here to enroll their face.",
      );
      return;
    }

    setFoundStudent(data);
    setLookupMessage("");
  };

  const captureAndSend = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (!foundStudent) {
      toast.error("Look up a student by Matric Number first.");
      return;
    }

    if (video && canvas) {
      setEnrollingFace(true);
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageData = canvas.toDataURL("image/jpeg");

      const { error: fnError } = await supabase.functions.invoke(
        "face-enroll",
        {
          body: { matric_number: foundStudent.matric_number, image: imageData },
        },
      );

      if (fnError) {
        setEnrollingFace(false);
        toast.error(
          await getFunctionErrorMessage(fnError, "Failed to enroll face."),
        );
        return;
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          face_enrolled: true,
          face_enrolled_at: new Date().toISOString(),
        })
        .eq("id", foundStudent.id);

      if (error) {
        console.error("Face enrollment status update failed:", error.message);
      }

      setEnrollingFace(false);
      toast.success("Face enrolled successfully!");
      setFoundStudent({ ...foundStudent, face_enrolled: true });
    }
  };

  return (
    <>
      <div className="bg-white rounded-[1.1rem] shadow-md p-4">
        <h1 className="text-gray-900 font-semibold mb-4 ml-2">
          Enroll a Student's Face
        </h1>
        <p className="text-sm text-gray-500 ml-2 mb-4">
          Face enrollment is attached to an existing student account. Look the
          student up by Matric Number first, if they don't have an account yet,
          invite them from the Users page before coming back here.
        </p>

        <div className="w-full grid gap-3 grid-cols-[1fr_auto] mt-5 p-5">
          <input
            type="text"
            value={matricInput}
            onChange={(e) => setMatricInput(e.target.value)}
            className="placeholder:text-gray-700 rounded-xl bg-[#F7F7F7] px-4 py-2"
            placeholder="Enter the student's Matric Number"
          />
          <button
            onClick={handleLookup}
            disabled={lookingUp}
            className="rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-6 py-2 font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
          >
            {lookingUp ? "Looking up…" : "Look Up"}
          </button>
        </div>

        {lookupMessage && (
          <p className="text-sm text-red-500 ml-5 -mt-3 mb-3">
            {lookupMessage}
          </p>
        )}

        {foundStudent && (
          <div className="ml-5 mb-3 text-sm text-gray-700">
            <p>
              <strong>Name:</strong> {foundStudent.full_name}
            </p>
            <p>
              <strong>Face already enrolled:</strong>{" "}
              {foundStudent.face_enrolled
                ? "Yes (re-enrolling will overwrite)"
                : "No"}
            </p>
          </div>
        )}

        {/* Camera & Button */}
        <div className="flex flex-col lg:flex-row w-full gap-4 mt-6">
          <div className="w-full lg:w-1/2 h-[53vh] bg-white/20 backdrop-blur-lg border border-gray-50 rounded-2xl p-2 flex justify-center items-center overflow-hidden">
            <div className="w-full h-full bg-black rounded-2xl shadow-2xl overflow-hidden">
              <video
                ref={videoRef}
                autoPlay
                muted
                className="w-full h-full object-cover"
              />
              <canvas
                ref={canvasRef}
                width="640"
                height="480"
                className="hidden"
              ></canvas>
            </div>
          </div>
          <div className="w-full lg:w-1/2 flex flex-col justify-start mt-5 items-center text-center">
            <h1 className="text-gray-800 font-bold text-[1.5rem] mb-4">
              Please place your face properly
            </h1>
            <button
              onClick={captureAndSend}
              disabled={!foundStudent || enrollingFace}
              className="w-sm rounded-xl bg-gradient-to-r from-blue-700 to-blue-600 px-8 py-3 font-bold text-white transition-all hover:opacity-90 hover:shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {enrollingFace ? "Enrolling…" : "Enroll Face"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Addstudent;

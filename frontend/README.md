# Smart Lecture Attendant

A three-role (admin / lecturer / student) lecture scheduling and attendance
app for NOUN, built with React + Vite and Supabase. This README has two
parts: how to get the project running on your machine, and a step-by-step
guide to actually using the system once it's up.

---

## Part 1 - Running Locally

The backend for this project (the Supabase database, edge functions, and the
face-recognition service in `python-face-api/`) is already built and
deployed. Running the app locally just means connecting the frontend to
what's already live, there is no infrastructure to create.

### Prerequisites

- Node.js 18+ and npm
- The project's Supabase URL and anon key (ask the project owner if you do
  not already have these)

### 1. Clone and install

```bash
git clone <this-repo-url>
cd smart-lecture-attendant-2/frontend
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and fill in the project's Supabase values:

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=<the-project-supabase-anon-public-key>
```

Both values are in the Supabase project's dashboard under
**Project Settings -> API**.

### 3. Run it

```bash
npm run dev      # starts the Vite dev server (prints the local URL)
npm run build    # production build, output in dist/
npm run lint     # eslint
npm run preview  # serve the production build locally
```

---

## Part 2 - Manual Testing Guide

This walks through testing every role end-to-end. Follow it in order, later
steps depend on data created in earlier ones (a lecturer needs a course
assigned before they can be given a lecture, a student needs a course to
exist before they can enroll).

Budget about 30-40 minutes for a full pass across all three roles.

### Before you start

- **To test from a clean slate, run the database reset script first.**
  `supabase/scripts/reset_database.sql` deletes every course, lecturer,
  student, lecture, enrollment, and attendance record, keeping only admin
  accounts and `app_settings` (so your active session/semester and other
  configured values survive the reset). To run it: open the Supabase
  dashboard for this project -> **SQL Editor** -> **New query** -> paste the
  full contents of that file -> **Run**. It runs as a single transaction and
  ends by printing counts so you can confirm everything but the admin
  account(s) and settings is now empty. Safe to re-run any time you want a
  fresh start.
- **Jitsi requires a free Google/GitHub/Facebook sign-in the first time a
  lecturer opens a meeting**, or everyone sees "waiting for a moderator"
  forever. This is a one-time per-lecturer thing, do it the first time you
  test "Join Meeting" as a lecturer.
- **To see the full student experience (attendance, waiting screen, etc.)
  you need two browser sessions open at once**: one signed in as the
  lecturer, one as the student (e.g., one normal window plus one incognito
  window, or two different browsers). A student joining alone will correctly
  sit on "waiting for the facilitator" forever, since nothing else is in the
  room, that's not a bug, see the Known Behaviors section.
- Camera permission will be requested for face verification (student) and
  face enrollment (student onboarding, and admin's "Enroll Face" page),
  allow it.

### Part A - Admin

1. **Sign in** with the admin account.
2. **Settings** (sidebar -> Settings): confirm `Active Academic Session` and
   `Active Semester` are set to something (e.g. `2026_2` / `second`), course
   and lecture creation both depend on these being non-empty. Also note
   `Minimum Attendance Duration` and `Join Window Before Start` here; you can
   leave both at their defaults.
3. **Create a course** (Courses -> + New Course): give it a code (e.g. `CIT
   403`), a title, and pick a programme/level. It should appear in the table
   immediately.
4. **Create a lecturer account.** Two ways:
   - **Users -> + Invite User** -> role Lecturer, fill name + email -> Send
     Invite. This sends a **magic-link email**, so you won't be able to sign
     in with this account unless you also check the Supabase Auth logs for
     the link. For manual testing, prefer the next option instead.
   - **Have the lecturer self-register**: open the app in a second
     browser/incognito window -> Signup -> "I am a... Lecturer" -> fill the
     form with a real password you'll remember -> Sign Up. This account lands
     in **pending** status (needs your approval, next step). This is the
     easier path for manual testing since you set the password yourself.
5. **Approve the lecturer** (Users page): find them (status "pending"),
   click **Approve**.
6. **Assign the course to the lecturer** (Users page, same row): click
   **Assign Course** -> pick the course you made in step 3 -> Assign.
7. **Create a lecture** (Lectures -> + New Lecture): pick the lecturer (its
   course dropdown only populates *after* you pick the lecturer, and only
   shows courses assigned to them, if it's empty, go back to step 6), pick
   the course, set a start time. Leave it within the next hour or two if you
   want to test joining it live today (see the Join Window note below).
8. **Reschedule** it (row action menu) -> confirm the status updates to
   "rescheduled" without a page reload.
9. **Cancel** it, either the same lecture or a second one you create, and
   confirm it shows "cancelled" with your reason recorded.
10. **User management sanity check**: suspend a user, confirm their status
    flips and they'd be blocked from signing in; reactivate them.

### Part B - Lecturer

Sign in as the lecturer account from Part A.

1. **Dashboard**: confirm the lecture you were assigned shows under "Next
   Up" (if it's upcoming) and in the "My Lectures" table. If you've since
   created/ended earlier lectures, check the **Previous Meetings** card for
   the last 3 past ones.
2. **Set up Meeting** on the lecture (button in the table or the Next Up
   card). This just generates a Jitsi room reference, no external call.
3. **Join Meeting**: opens a new tab straight to `meet.jit.si`. **The first
   time, click Jitsi's own "Sign in" prompt** (any free Google/GitHub/
   Facebook account), this is what makes you the room's moderator. Without
   it, nobody (including a student who joins later) will get past "waiting
   for a moderator."
   - The join button is time-gated: it only becomes active within the
     configured Join Window before `start_time`, and stops working once
     `end_time` passes or the meeting is manually ended. If you don't want
     to wait, either create the lecture with a start time a few minutes out,
     or lower "Join Window Before Start" in Admin -> Settings temporarily.
4. **Reschedule** and **Cancel** from this page too (via the row's "..."
   actions menu, same modals as admin, scoped to your own lectures).
5. **End Meeting**: click it on a scheduled lecture -> confirm dialog -> the
   row flips to "completed" and a **Reopen Meeting** button appears in its
   place. Click Reopen to confirm it flips back to "scheduled" and becomes
   joinable again immediately (no reload needed).
6. **Roster** (menu item on the lecture row): confirms you can see
   per-student attendance status once students have joined (Part C covers
   generating that data).
7. **My Courses** and **Settings** pages: confirm they load and show your
   assigned course / profile info respectively. Try changing your phone
   number and saving, then navigate to Dashboard and back, it should still
   show the value you just saved.

### Part C - Student

Open a **second browser session** (incognito window or a different browser)
so the lecturer's tab from Part B stays signed in, you'll need both open at
once for the actual meeting-join test.

1. **Register**: Signup -> "I am a... Student" -> fill in name, a matric
   number (anything like `2026/12345` works), department/programme,
   password. Click Sign Up.
   - **You will land back on the Login screen, not straight into onboarding,
     this is expected** (see Known Behaviors below). Your NOUN email is
     auto-derived from your matric number and shown on the form before you
     submit, that's what you sign in with, e.g. `2026/12345@noun.edu.ng`.
2. **Sign in** with that derived email and the password you just set. You
   should land on the onboarding wizard.
3. **Onboarding, step 1 (courses)**: either upload a PDF course registration
   slip (only works if the PDF has real extractable text containing course
   codes, a scanned image won't match anything, and that's handled
   gracefully, not a crash) or just tick the course you created in Part A
   manually from the list below the upload box. Click Confirm Enrollment.
4. **Onboarding, step 2 (face)**: let the camera preview show your face,
   click Enroll Face. You're redirected to the dashboard.
5. **Dashboard**: confirm the lecture from Part A shows under "Next Up" (if
   upcoming) or **Previous Meetings** (if already past). Check **My
   Courses** and **Settings** pages load correctly too.
6. **Join the lecture** (only works once you're inside its join window, see
   Part B step 3's note): click Join on the dashboard or via the lecture row
   -> **Verify & Join** -> let the camera capture your face.
   - If the **lecturer's tab isn't also connected to the same meeting right
     now**, you'll correctly sit on "Waiting for the facilitator to join..."
     indefinitely, that's the real presence check working, not a hang.
     Switch to the lecturer's tab and click **Join Meeting** there (make
     sure you did the one-time Jitsi sign-in from Part B step 3 first).
   - Once both sides are in the room, the student's screen should switch
     from the waiting overlay to the live embed within a few seconds, and
     the circular attendance-progress ring should start ticking up.
   - Reloading the student's tab at any point (while waiting, or while
     actively attending) should resume correctly rather than bouncing back
     to the camera/verify screen.
7. **Let it run past the configured minimum attendance duration** (Admin ->
   Settings -> "Minimum Attendance Duration," a couple of minutes by
   default), then close the student's tab or navigate away. Check the
   lecturer's **Roster** page (Part B step 6), the student should show as
   "attended" with a real recorded duration.
8. Optionally, go back to the **admin** account and check **Users** and
   **Lectures** pages reflect everything consistently from that view too.

### Known behaviors (not bugs, worth knowing before you report something as broken)

- **Signup doesn't automatically sign you in.** `supabase.auth.signUp()`
  succeeds and the account is immediately usable, but the app shows "check
  your email to confirm" and switches back to the Login tab rather than
  redirecting you in. Just sign in manually right after with the same
  email/password.
- **A student joining a meeting completely alone stays on "Waiting for the
  facilitator" forever**, and is never credited with attendance. This is
  intentional, attendance only starts once a second real participant is
  confirmed in the room, specifically so nobody can bank attendance minutes
  by sitting alone in an unstarted meeting.
- **`meet.jit.si`'s free tier disconnects embedded calls after 5 minutes**
  ("Embedding meet.jit.si is only meant for demo purposes"). This is a hard
  platform limit, not something in our control, it's why the default
  minimum attendance duration is set low (2 minutes) rather than something
  more realistic like 15, so a full test run fits inside the 5-minute
  window. Documented further in `CLAUDE.md`.
- **"+ Invite User" (Users page) sends a magic-link email**, which won't
  arrive anywhere useful without real email delivery configured. For manual
  testing, prefer self-registration (lecturer or student) so you control the
  password directly. "Bulk Import Lecturers" (also on the Users page) is the
  one admin-side path that sets a real, known password (`123456`) directly,
  useful if you need several lecturer accounts at once.
- **Push notifications, TMA deadlines, and offline PWA support are not
  implemented** in this build, despite being mentioned in the original
  project planning doc (`CLAUDE.md`), the project scope narrowed during
  development to focus on the calendar, attendance, and meeting-lifecycle
  features that are actually built.

### If something looks broken

Check the browser console (F12) for errors first, and note the exact page,
role, and action. Most of the tricky state this app manages (who's "waiting"
versus "attending," what time-window a lecture is in) is timing-sensitive,
so if something looks wrong, a reload of that one page is a reasonable first
thing to try before assuming it's a real bug.

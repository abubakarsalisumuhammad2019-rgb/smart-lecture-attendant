# Zoom Server-to-Server OAuth setup

This is the manual prerequisite blocking real lecture creation (`zoom-create-meeting` /
`zoom-update-meeting` currently fail at the Zoom API call until this is done). None of
this can be done via an API/tool — it's all clicks in the Zoom Marketplace and the
Supabase dashboard.

## 1. Zoom account requirements

You need a Zoom account with **admin privileges** to create Marketplace apps. A
**Licensed (Pro or higher)** account is strongly recommended for the account that
will host lectures — Zoom's **Basic (free)** plan caps group meetings (3+
participants) at **40 minutes**, which will cut off most lectures mid-session.

## 2. Create the Server-to-Server OAuth app

1. Go to the [Zoom App Marketplace](https://marketplace.zoom.us/) and sign in with
   the admin account.
2. Click **Develop** (top right) → **Build App**.
3. Choose **Server-to-Server OAuth** as the app type, give it a name (e.g.
   "Smart Lecture Attendant"), and create it.

## 3. Copy the credentials

On the app's **App Credentials** page, copy three values — you'll need them for
Supabase in step 6:
- **Account ID** → `ZOOM_ACCOUNT_ID`
- **Client ID** → `ZOOM_CLIENT_ID`
- **Client Secret** → `ZOOM_CLIENT_SECRET`

## 4. Add scopes

On the app's **Scopes** tab, click **Add Scopes** and add:
- `meeting:write:meeting:admin` (or `meeting:write:admin` on older scope sets) —
  create/update/delete meetings on behalf of a user
- `meeting:read:meeting:admin` (or `meeting:read:admin`) — read meeting details
- `user:read:user:admin` (or `user:read:admin`) — look up the host user

(Zoom has migrated scope naming over time — if the exact names above aren't offered,
search "meeting" and "user" in the scope picker and add the write/read admin-level
ones that appear; the granular names change but the underlying permissions are the
same.)

You do **not** need registrant or webhook scopes yet — those are for Phase 3
(student join/leave tracking), not needed for Admin/Lecturer lecture creation.

## 5. Activate the app

On the **Activation** tab, click **Activate your app**. Server-to-Server OAuth apps
activate immediately (no Zoom review process, unlike public marketplace apps).

## 6. Pick the host user

All lectures are created under **one institutional Zoom user** — lecturers don't
need their own Zoom accounts. Use that user's Zoom **email address** as
`ZOOM_MEETING_HOST_USER_ID` (Zoom's API accepts either an email or an internal user
ID interchangeably here — email is simplest). This should be a Licensed user on the
account (see step 1).

## 7. Set the secrets in Supabase

Go to your Supabase project dashboard → **Edge Functions** → **Manage secrets**
(or **Settings → Edge Functions**), and add:

| Secret name | Value |
|---|---|
| `ZOOM_ACCOUNT_ID` | from step 3 |
| `ZOOM_CLIENT_ID` | from step 3 |
| `ZOOM_CLIENT_SECRET` | from step 3 |
| `ZOOM_MEETING_HOST_USER_ID` | the host email from step 6 |

These are read by `supabase/functions/*/​_shared/zoom.ts` at request time — no
redeploy needed after setting them, they take effect on the next Edge Function
invocation.

## 8. Verify it's working

Once the secrets are set, create a lecture from the admin panel (Lectures → + New
Lecture). If it succeeds, a real Zoom meeting now exists — check the host account's
**Meetings** list at zoom.us to confirm. If it fails, the error banner will now show
the actual reason (Zoom's error message is surfaced directly), most commonly:
- `Invalid Client Id or Client Secret` — re-check step 3
- `User does not exist` — the host email in step 6 doesn't match a real user on
  this Zoom account
- A scope-related 4xx — go back to step 4 and confirm the meeting write scope was
  actually added and saved

## Later (Phase 3): webhooks for join/leave tracking

Not needed yet. When Phase 3 is built, you'll additionally need to add an **Event
Subscription** (Feature tab) pointed at the deployed `zoom-webhook` Edge Function
URL, subscribed to `Meeting Participant/Host Joined` and `Meeting Participant/Host
Left`, plus a `ZOOM_WEBHOOK_SECRET_TOKEN` secret for verifying the webhook
signature. This doc will get a follow-up section when that phase starts.

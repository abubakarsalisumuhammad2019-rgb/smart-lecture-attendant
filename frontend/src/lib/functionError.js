// supabase-js's functions.invoke() returns a generic "non-2xx status code" message
// on error.message when an Edge Function responds with an error -- the actual JSON
// body our functions return (e.g. { error: "facilitator_not_assigned_to_course" })
// is only reachable via error.context (the raw Response object). This unwraps it.
export async function getFunctionErrorMessage(error, fallback = 'Something went wrong') {
  if (!error) return fallback;

  if (error.context && typeof error.context.json === 'function') {
    try {
      const body = await error.context.json();
      if (body?.detail) return `${body.error}: ${body.detail}`;
      if (body?.error) return body.error;
    } catch {
      // context wasn't valid JSON -- fall through to the generic message
    }
  }

  return error.message || fallback;
}

// Basic Auth is on only when both env vars are set in the Vercel dashboard.
// This is not real security: a city rollout needs the city's SSO.
export const authEnabled = () => !!process.env.ADMIN_USER && !!process.env.ADMIN_PASSWORD;

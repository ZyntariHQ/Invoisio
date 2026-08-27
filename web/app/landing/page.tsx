import { redirect } from 'next/navigation';

// The landing page moved to the root route (`/`). Keep this path as a
// redirect so existing deep links and bookmarks to `/landing` keep working.
export default function LandingRedirect() {
  redirect('/');
}

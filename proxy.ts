import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware() {
    return NextResponse.next();
  },
  {
    pages: {
      signIn: '/login',
    },
  }
);

export const config = {
  matcher: [
    /*
     * Protect everything except:
     * - /login, /register (auth pages, must be reachable while signed out)
     * - /api/auth/*, /api/register (NextAuth's own routes + account creation)
     * - /api/cron/* (auto NAV fetch, called by Vercel cron, not a logged-in user)
     * - static assets
     */
    '/((?!login|register|api/auth|api/register|api/cron|_next/static|_next/image|favicon.ico).*)',
  ],
};

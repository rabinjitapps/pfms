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
     * - /login (sign in page)
     * - /api/auth/* (NextAuth's own routes)
     * - /api/cron/* (auto NAV fetch, called by Vercel cron, not a logged-in user)
     * - static assets
     */
    '/((?!login|api/auth|api/cron|_next/static|_next/image|favicon.ico).*)',
  ],
};

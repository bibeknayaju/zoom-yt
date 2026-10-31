import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/api/webhooks(.*)",
  "/api/zoom-youtube/autopilot(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  // Prevent any access to sign-up: automatically redirect to sign-in
  if (request.nextUrl.pathname.startsWith("/sign-up")) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }
  if (!isPublicRoute(request)) {
    const { userId } = await auth();
    if (!userId) {
      // If an API route is hit while signed out, return a clear 401 JSON response
      // rather than letting Clerk rewrite to an internal 404 HTML page.
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return NextResponse.json({ success: false, error: "Unauthorized. Please sign in." }, { status: 401 });
      }
      await auth.protect();
    }
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};

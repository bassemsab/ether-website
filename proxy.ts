import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { defaultLocale, isLocale } from "./lib/i18n/config";

const PUBLIC_FILE = /\.(.*)$/;

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  const segments = pathname.split("/").filter(Boolean);
  const locale = segments[0];

  if (locale && isLocale(locale)) {
    const response = NextResponse.next();
    response.cookies.set("NEXT_LOCALE", locale, { path: "/" });
    return response;
  }

  const redirectURL = new URL(
    `/${defaultLocale}${pathname.startsWith("/") ? pathname : `/${pathname}`}`,
    request.url,
  );
  const response = NextResponse.redirect(redirectURL);
  response.cookies.set("NEXT_LOCALE", defaultLocale, { path: "/" });
  return response;
}

export const config = {
  matcher: "/((?!_next|api|.+\\..+).*)",
};

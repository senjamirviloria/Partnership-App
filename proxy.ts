import { NextResponse, type NextRequest } from "next/server";

function isLocalHost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname === "::1";
}

function isHttps(request: NextRequest) {
  return request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:";
}

export function proxy(request: NextRequest) {
  if (!isLocalHost(request.nextUrl.hostname) && !isHttps(request)) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    return NextResponse.redirect(url, 308);
  }

  const response = NextResponse.next();
  if (isHttps(request)) {
    response.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

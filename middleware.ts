import { auth } from "@/auth";

export default auth((req) => {
  if (req.auth) {
    return;
  }

  const { pathname } = req.nextUrl;

  // APIはログインページへ転送せず，呼び出し側が判定できる401を返す．
  if (pathname.startsWith("/api/")) {
    return Response.json(
      { error: "ログインが必要です" },
      { status: 401 },
    );
  }

  if (pathname !== "/login") {
    return Response.redirect(new URL("/login", req.nextUrl.origin));
  }
});

export const config = {
  // NextAuth自身のAPIと静的ファイル以外を認証対象にする．
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico).*)"],
};

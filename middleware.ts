import { auth } from "@/auth";

export default auth((req) => {
  // ログインしてなくて、かつ今ログインページにいない場合はログインへ飛ばす
  if (!req.auth && req.nextUrl.pathname !== "/login") {
    const newUrl = new URL("/login", req.nextUrl.origin);
    return Response.redirect(newUrl);
  }
});

export const config = {
  // 認証を適用する範囲（基本全部、ただし静的ファイルとかは除く）
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      name: "Password",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // .env.localに書いたパスワードと一致するかチェック
        if (credentials?.password === process.env.ADMIN_PASSWORD) {
          return { id: "admin", name: "たくちゃん" };
        }
        return null;
      },
    }),
  ],
  // ログインページをカスタムで作る指定
  pages: {
    signIn: "/login",
  },
});
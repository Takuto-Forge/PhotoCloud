"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await signIn("credentials", {
      password,
      callbackUrl: "/", // ログイン成功後にトップへ
    });
  };

  return (
    // bg-white dark:bg-black で背景を白から黒へ切り替え
    <main className="min-h-screen flex items-center justify-center bg-white dark:bg-black transition-colors duration-300">
      {/* フォームの背景もダークモード時は少し明るい黒（gray-900）にするよ */}
      <form 
        onSubmit={handleSubmit} 
        className="bg-white dark:bg-gray-900 p-8 rounded-xl shadow-md w-80 border border-gray-100 dark:border-gray-800"
      >
        {/* text-black dark:text-white で文字色を切り替え */}
        <h1 className="text-xl font-bold mb-6 text-center text-black dark:text-white">
          Photo Cloud ログイン
        </h1>
        
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="パスワードを入力"
          // text-black で入力中の ⚫︎ をハッキリした黒に。dark:text-white でダークモード時は白にするよ
          // bg-gray-50 dark:bg-black で入力欄自体の色も調整
          className="w-full border border-gray-300 dark:border-gray-700 p-3 rounded-lg mb-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-black dark:text-white bg-gray-50 dark:bg-black"
        />
        
        <button 
          type="submit" 
          className="w-full bg-black dark:bg-white text-white dark:text-black font-bold py-3 rounded-lg hover:opacity-80 transition-opacity"
        >
          ログイン
        </button>
      </form>
    </main>
  );
}
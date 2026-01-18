"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolder, setCurrentFolder] = useState("root");
  const [folders, setFolders] = useState<string[]>(["root"]);
  const [newFolderName, setNewFolderName] = useState("");

  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "";

  const extractFolders = (photoKeys: string[]) => {
    const folderSet = new Set<string>(["root"]);
    photoKeys.forEach(key => {
      if (key.includes("/")) {
        folderSet.add(key.split("/")[0]);
      }
    });
    setFolders(Array.from(folderSet));
  };

  const fetchPhotos = async () => {
    setLoading(true);
    const res = await fetch("/api/photos");
    const data = await res.json();
    if (data.photos) {
      setPhotos(data.photos);
      extractFolders(data.photos); // フォルダリストを更新
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPhotos();
  }, []);

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: JSON.stringify({ 
          filename: file.name, 
          contentType: file.type,
          folder: currentFolder // ★今いるフォルダ情報を送る
        }),
      });
      const { url } = await res.json();
      await fetch(url, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
      
      setFile(null);
      fetchPhotos();
    } catch (error) {
      console.error(error);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    if (!confirm("本当に消しちゃう？")) return;
    try {
      const res = await fetch("/api/photos/delete", {
        method: "POST",
        body: JSON.stringify({ filename }),
      });
      if (res.ok) fetchPhotos();
    } catch (error) {
      alert("消せなかったよ…");
    }
  };

  return (
    <main className="min-h-screen bg-white dark:bg-black text-black dark:text-white transition-colors duration-300">
      <nav className="sticky top-0 z-20 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-black/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold font-mono tracking-tighter">PhotoCloud</h1>
          <button onClick={() => signOut()} className="text-sm font-semibold text-red-500">ログアウト</button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* フォルダ操作エリア */}
        <div className="mb-6 flex flex-wrap gap-2 items-center">
          {folders.map(f => (
            <button
              key={f}
              onClick={() => setCurrentFolder(f)}
              className={`px-4 py-1 rounded-full text-sm border transition ${
                currentFolder === f 
                ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white" 
                : "border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-900"
              }`}
            >
              {f === "root" ? "すべて" : f}
            </button>
          ))}
          
          <div className="flex gap-2 items-center ml-auto border-l pl-4 border-gray-200 dark:border-gray-800">
            <input 
              type="text" 
              placeholder="新規フォルダ" 
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="border rounded-lg px-3 py-1 text-sm dark:bg-gray-900 dark:border-gray-700 outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button 
              onClick={() => {
                if(newFolderName) {
                  const name = newFolderName.trim();
                  if(!folders.includes(name)) setFolders([...folders, name]);
                  setCurrentFolder(name);
                  setNewFolderName("");
                }
              }}
              className="text-sm bg-blue-500 text-white px-3 py-1 rounded-lg font-bold"
            >
              作成
            </button>
          </div>
        </div>

        {/* アップロードエリア */}
        <div className="mb-10 p-6 border border-gray-200 dark:border-gray-800 rounded-lg bg-gray-50/50 dark:bg-gray-900/50">
          <p className="text-xs font-semibold mb-2 text-gray-500 uppercase">
            現在の保存先: <span className="text-blue-500">{currentFolder}</span>
          </p>
          <div className="flex flex-col gap-4 md:flex-row">
            <input 
              type="file" 
              onChange={(e) => setFile(e.target.files?.[0] || null)} 
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-gray-800 dark:file:text-gray-300" 
            />
            <button 
              onClick={handleUpload} 
              disabled={!file || uploading}
              className="bg-blue-500 text-white font-bold py-2 px-8 rounded-lg disabled:opacity-50 whitespace-nowrap"
            >
              {uploading ? "Sharing..." : "Share"}
            </button>
          </div>
        </div>

        {/* ギャラリー */}
        <div className="grid grid-cols-3 gap-1 md:gap-4">
          {loading ? (
            [...Array(6)].map((_, i) => (
              <div key={i} className="aspect-square bg-gray-200 dark:bg-gray-800 animate-pulse rounded-sm" />
            ))
          ) : (
            photos
              .filter(photo => {
                if (currentFolder === "root") return true;
                return photo.startsWith(`${currentFolder}/`);
              })
              .map((photo) => (
                <div key={photo} className="relative group aspect-square overflow-hidden cursor-pointer bg-gray-100 dark:bg-gray-900">
                  <img 
                    src={`${publicUrl}/${photo}`} 
                    alt="" 
                    className="w-full h-full object-cover" 
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                     <button onClick={() => handleDelete(photo)} className="bg-white/90 dark:bg-black/90 text-red-500 p-2 rounded-full transform scale-90 hover:scale-100 transition">
                       <TrashIcon />
                     </button>
                  </div>
                </div>
              ))
          )}
        </div>
        {!loading && photos.filter(p => currentFolder === "root" || p.startsWith(`${currentFolder}/`)).length === 0 && (
          <p className="text-center py-20 text-gray-500">まだ写真がありません</p>
        )}
      </div>
    </main>
  );
}

function TrashIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1-1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>;
}
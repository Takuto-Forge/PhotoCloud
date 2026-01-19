"use client";

import { useState, useEffect } from "react";
import { signOut } from "next-auth/react";

export default function Home() {
  // ステートを単一のfileから配列(files)に変更
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  // プログレス表示用（今何枚目かを出すと家族に親切！）
  const [uploadStatus, setUploadStatus] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolder, setCurrentFolder] = useState("root");
  const [folders, setFolders] = useState<string[]>(["root"]);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFolderPassword, setNewFolderPassword] = useState(""); // ★追加
  const [isPrivateConfig, setIsPrivateConfig] = useState(false); // ★追加
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [memo, setMemo] = useState("");
  const [savingMemo, setSavingMemo] = useState(false);

  // ★ 追加：まとめて削除用のステート
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedFilesForDelete, setSelectedFilesForDelete] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);

  // ★ 追加：プライベートフォルダ用のステート
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");

  const [showNewPassword, setShowNewPassword] = useState(false); // 新規作成用
  const [showUnlockPassword, setShowUnlockPassword] = useState(false); // ロック解除用

  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "";

  // --- フォルダ名の表示用ヘルパー ---
  const getDisplayName = (folder: string) => {
    if (folder === "root") return "すべて";
    if (folder.startsWith("private_")) {
      // private_パスワード_フォルダ名 の「フォルダ名」だけ抜粋
      return folder.split("_").slice(2).join("_");
    }
    return folder;
  };

  // 判別用のヘルパー関数（コンポーネントの外か、中に配置してね）
  const isVideo = (filename: string) => {
    const videoExtensions = [".mp4", ".webm", ".ogg", ".mov"];
    return videoExtensions.some(ext => filename.toLowerCase().endsWith(ext));
  };

  // ★ 追加：一括削除の関数
  const handleBatchDelete = async () => {
    if (selectedFilesForDelete.length === 0) return;
    if (!confirm(`${selectedFilesForDelete.length}件のデータを本当に消しちゃう？`)) return;

    setDeleting(true);
    try {
      for (const filename of selectedFilesForDelete) {
        await fetch("/api/photos/delete", {
          method: "POST",
          body: JSON.stringify({ filename }),
        });
      }
      setSelectedFilesForDelete([]);
      setIsDeleteMode(false);
      fetchPhotos();
    } catch (error) {
      alert("一部消せなかったよ…");
    } finally {
      setDeleting(false);
    }
  };

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

  const fetchMemo = async () => {
    const res = await fetch("/api/memo");
    const data = await res.json();
    setMemo(data.memo || "");
  };

  const saveMemo = async () => {
    setSavingMemo(true);
    await fetch("/api/memo", {
      method: "POST",
      body: JSON.stringify({ text: memo }),
    });
    setSavingMemo(false);
    alert("メモを更新したよ！");
  };

  useEffect(() => {
    fetchPhotos();
    fetchMemo();
  }, []);

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploading(true);
    
    try {
      // 選択されたファイルの数だけループを回すよ
      for (let i = 0; i < files.length; i++) {
        const currentFile = files[i];
        setUploadStatus(`${i + 1} / ${files.length} 個目をアップ中...`);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: JSON.stringify({ 
            filename: currentFile.name, 
            contentType: currentFile.type,
            folder: currentFolder 
          }),
        });
        
        const { url } = await res.json();
        await fetch(url, { 
          method: "PUT", 
          body: currentFile, 
          headers: { "Content-Type": currentFile.type } 
        });
      }
      
      setFiles([]); // 終わったら空にする
      setUploadStatus("完了！");
      setTimeout(() => setUploadStatus(""), 3000); // 3秒後にメッセージを消す
      fetchPhotos();
    } catch (error) {
      console.error(error);
      setUploadStatus("一部失敗しちゃったかも…");
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

  // ★ 修正：フォルダを切り替えた時の挙動を整理
  const handleFolderChange = (folderName: string) => {
    setCurrentFolder(folderName);
    setIsDeleteMode(false);
    setSelectedFilesForDelete([]);
    
    if (folderName.startsWith("private_")) {
      setIsUnlocked(false); // 秘密フォルダなら一旦ロック
      setPasswordInput("");
    } else {
      setIsUnlocked(true);  // 通常フォルダならアンロック状態
    }
  };

  // --- フォルダ作成ロジックの修正 ---
  const createFolder = () => {
    if (!newFolderName) return;
    let folderPath = newFolderName;
    
    if (isPrivateConfig) {
      if (!newFolderPassword) {
        alert("パスワードを決めてね！");
        return;
      }
      // フォルダ名にパスワードを隠し持つスタイル
      folderPath = `private_${newFolderPassword}_${newFolderName}`;
    }

    if (!folders.includes(folderPath)) {
      setFolders([...folders, folderPath]);
      setNewFolderName("");
      setNewFolderPassword("");
      setIsPrivateConfig(false);
    }
  };

  // --- ロック解除ロジックの修正 ---
  const unlockFolder = () => {
    // フォルダ名: private_password123_myfolder
    const expectedPassword = currentFolder.split("_")[1];
    if (passwordInput === expectedPassword) {
      setIsUnlocked(true);
      setPasswordInput("");
    } else {
      alert("パスワードが違うみたい…");
    }
  };

  return (
    <main className="min-h-screen bg-white dark:bg-black text-black dark:text-white transition-colors duration-300">
      {/* ナビゲーション */}
      <nav className="sticky top-0 z-20 border-b border-gray-200 dark:border-gray-800 bg-white/80 dark:bg-black/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold font-mono tracking-tighter cursor-pointer" onClick={() => handleFolderChange("root")}>PhotoCloud</h1>
          <button onClick={() => signOut()} className="text-sm font-semibold text-red-500">ログアウト</button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">

        {/* メモ機能エリア */}
        <div className="mb-8 p-6 bg-yellow-50 dark:bg-yellow-900/10 rounded-2xl border border-yellow-200 dark:border-yellow-900/30">
          <p className="text-xs font-bold text-yellow-600 dark:text-yellow-500 uppercase mb-3 tracking-widest flex items-center gap-2">
            <span>📝 Family Memo</span>
          </p>
          <textarea 
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="家族への伝言や、思い出の記録をここに残してね..."
            className="w-full h-24 bg-transparent border-none outline-none text-sm resize-none text-gray-700 dark:text-gray-300 placeholder:text-yellow-600/30"
          />
          <div className="flex justify-end mt-2">
            <button 
              onClick={saveMemo}
              className="text-[10px] font-bold bg-yellow-400 text-yellow-900 px-4 py-1.5 rounded-full hover:bg-yellow-500 transition active:scale-95 shadow-sm"
            >
              {savingMemo ? "保存中..." : "メモを更新する"}
            </button>
          </div>
        </div>
        
        {/* 1. フォルダ作成・管理エリア */}
        <div className="mb-8 p-6 bg-gray-50 dark:bg-gray-900/50 rounded-2xl border border-gray-200 dark:border-gray-800">
          <p className="text-xs font-bold text-gray-400 uppercase mb-4 tracking-widest">Folders</p>
          
          {/* フォルダ一覧 */}
          <div className="flex flex-wrap gap-2 mb-6">
            {folders.map(f => (
              <button
                key={f}
                onClick={() => handleFolderChange(f)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                  currentFolder === f 
                  ? "bg-black text-white dark:bg-white dark:text-black border-black dark:border-white shadow-lg scale-105" 
                  : "bg-white dark:bg-black border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-500"
                }`}
              >
                {f.startsWith("private_") ? `🔒 ${getDisplayName(f)}` : getDisplayName(f)}
              </button>
            ))}
          </div>

          {/* 新規フォルダ作成フォーム */}
          <div className="pt-4 border-t border-gray-200 dark:border-gray-800 space-y-3">
            <div className="flex gap-2">
              <input 
                placeholder="新しいフォルダの名前..." 
                value={newFolderName} 
                onChange={(e) => setNewFolderName(e.target.value)}
                className="flex-1 bg-white dark:bg-black border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition" 
              />
              <button 
                onClick={createFolder} 
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-xl font-bold text-sm transition active:scale-95"
              >
                作成
              </button>
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer w-fit hover:text-gray-700 dark:hover:text-gray-300 transition">
                <input 
                  type="checkbox" 
                  checked={isPrivateConfig} 
                  onChange={(e) => setIsPrivateConfig(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-700 text-blue-500 focus:ring-blue-500"
                />
                秘密のフォルダにする（フォルダごとにパスワードを設定）
              </label>
              
              {isPrivateConfig && (
                <div className="relative animate-in slide-in-from-top-1 duration-200">
                  <input 
                    type={showNewPassword ? "text" : "password"} 
                    placeholder="このフォルダ専用のパスワードを入力" 
                    value={newFolderPassword}
                    onChange={(e) => setNewFolderPassword(e.target.value)}
                    className="w-full bg-blue-50/30 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button 
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500 transition"
                  >
                    {showNewPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>

        {/* 2. メイン表示エリア（ロック or コンテンツ） */}
        {currentFolder.startsWith("private_") && !isUnlocked ? (
          /* --- ロック画面 --- */
          <div className="flex flex-col items-center justify-center py-20 bg-gray-50/50 dark:bg-gray-900/30 rounded-3xl border-2 border-dashed border-gray-200 dark:border-gray-800 animate-in fade-in zoom-in-95 duration-300">
            <div className="text-5xl mb-6">🔐</div>
            <h2 className="text-xl font-bold mb-2">秘密のフォルダ</h2>
            <p className="text-gray-500 text-sm mb-6">「{getDisplayName(currentFolder)}」を開くにはパスワードが必要です</p>
            <div className="flex flex-col sm:flex-row gap-2 w-full max-w-xs px-4 sm:px-0">
              <div className="relative flex-1">
                <input 
                  type={showUnlockPassword ? "text" : "password"} 
                  placeholder="Password" 
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && unlockFolder()}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-2 pr-10 dark:bg-black outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
                <button 
                  type="button"
                  onClick={() => setShowUnlockPassword(!showUnlockPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-500 transition"
                >
                  {showUnlockPassword ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
              <button 
                onClick={unlockFolder}
                className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-xl font-bold transition active:scale-95"
              >
                開く
              </button>
            </div>
          </div>
        ) : (
          /* --- 通常コンテンツ（アップロード ＆ ギャラリー） --- */
          <div className="animate-in fade-in duration-500">
            
            {/* まとめて削除バー */}
            <div className="mb-6 flex justify-between items-center">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                {photos.filter(photo => currentFolder === "root" || photo.startsWith(`${currentFolder}/`)).length} Items
              </p>
              <div className="flex gap-2">
                {!isDeleteMode ? (
                  <button 
                    onClick={() => setIsDeleteMode(true)}
                    className="text-xs font-bold bg-gray-100 dark:bg-gray-900 px-4 py-2 rounded-full border border-gray-200 dark:border-gray-800 hover:bg-gray-200 transition"
                  >
                    選択して削除
                  </button>
                ) : (
                  <>
                    <button 
                      onClick={() => { setIsDeleteMode(false); setSelectedFilesForDelete([]); }}
                      className="text-xs font-bold px-4 py-2 rounded-full text-gray-500 hover:text-gray-700"
                    >
                      キャンセル
                    </button>
                    <button 
                      onClick={handleBatchDelete}
                      disabled={selectedFilesForDelete.length === 0 || deleting}
                      className="text-xs font-bold bg-red-500 text-white px-4 py-2 rounded-full hover:bg-red-600 disabled:opacity-30 transition shadow-lg shadow-red-500/20"
                    >
                      {deleting ? "削除中..." : `${selectedFilesForDelete.length}件を削除`}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* アップロードエリア */}
            <div className="mb-10 p-6 border border-gray-200 dark:border-gray-800 rounded-2xl bg-white dark:bg-gray-900 shadow-sm">
              <p className="text-[10px] font-black text-blue-500 uppercase mb-4 tracking-[0.2em]">Upload to: {getDisplayName(currentFolder)}</p>
              <div className="flex flex-col gap-4 md:flex-row items-center">
                <input 
                  type="file" 
                  multiple 
                  onChange={(e) => setFiles(e.target.files ? Array.from(e.target.files) : [])} 
                  className="flex-1 text-sm text-gray-500 file:mr-4 file:py-2 file:px-6 file:rounded-full file:border-0 file:text-xs file:font-bold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 dark:file:bg-gray-800 dark:file:text-gray-300 cursor-pointer w-full" 
                />
                <button 
                  onClick={handleUpload} 
                  disabled={files.length === 0 || uploading}
                  className={`w-full md:w-auto px-10 py-2.5 rounded-full font-bold transition-all duration-300 ${
                    files.length > 0 && !uploading
                      ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30 scale-105" 
                      : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600 cursor-not-allowed"
                  }`}
                >
                  {uploading ? uploadStatus : `Share (${files.length})`}
                </button>
              </div>
            </div>

            {/* ギャラリー表示 */}
            <div className="grid grid-cols-3 gap-1 md:gap-4">
              {loading ? (
                [...Array(9)].map((_, i) => (
                  <div key={i} className="aspect-square bg-gray-100 dark:bg-gray-900 animate-pulse rounded-lg" />
                ))
              ) : (
                photos
                  .filter(photo => currentFolder === "root" || photo.startsWith(`${currentFolder}/`))
                  .map((photo) => {
                    const isSelected = selectedFilesForDelete.includes(photo);
                    return (
                      <div 
                        key={photo} 
                        onClick={() => {
                          if (isDeleteMode) {
                            setSelectedFilesForDelete(prev => 
                              isSelected ? prev.filter(p => p !== photo) : [...prev, photo]
                            );
                          } else {
                            setSelectedPhoto(photo);
                          }
                        }}
                        className={`relative group aspect-square overflow-hidden cursor-pointer bg-gray-100 dark:bg-gray-900 rounded-lg border-2 transition-all duration-300 ${
                          isSelected ? "border-blue-500 scale-95 z-10" : "border-transparent hover:scale-[1.02]"
                        }`}
                      >
                        {isVideo(photo) ? (
                          <div className="relative w-full h-full">
                            <video src={`${publicUrl}/${photo}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition">
                              <PlayIcon />
                            </div>
                          </div>
                        ) : (
                          <img src={`${publicUrl}/${photo}`} alt="" className="w-full h-full object-cover" />
                        )}
                        
                        {isDeleteMode && (
                          <div className={`absolute top-2 right-2 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                            isSelected ? "bg-blue-500 border-blue-500 text-white" : "bg-black/30 border-white text-transparent"
                          }`}>
                            <span className="text-xs font-bold">✓</span>
                          </div>
                        )}
                      </div>
                    );
                  })
              )}
            </div>
          </div>
        )}

        {/* 拡大表示モーダル */}
        {selectedPhoto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 animate-in fade-in duration-300">
            <div className="absolute inset-0" onClick={() => setSelectedPhoto(null)} />
            <div className="relative max-w-full max-h-full flex flex-col items-center animate-in zoom-in-95 duration-300">
              {isVideo(selectedPhoto) ? (
                <video src={`${publicUrl}/${selectedPhoto}`} controls autoPlay className="max-w-full max-h-[80vh] rounded-lg shadow-2xl" />
              ) : (
                <img src={`${publicUrl}/${selectedPhoto}`} className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl" alt="拡大" />
              )}
              <div className="mt-8 flex gap-4">
                <button onClick={() => setSelectedPhoto(null)} className="px-8 py-2 bg-white/10 text-white rounded-full hover:bg-white/20 transition backdrop-blur-md">閉じる</button>
                <button 
                  onClick={() => { handleDelete(selectedPhoto); setSelectedPhoto(null); }}
                  className="px-8 py-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition flex items-center gap-2 font-bold shadow-lg shadow-red-500/20"
                >
                  <TrashIcon /> 削除
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// --- アイコンコンポーネント (コンポーネントの外側、ファイルの最後に貼ってね) ---
function PlayIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white/90 drop-shadow-md" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}

function TrashIcon() {
  return <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1-1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>;
}

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );
}
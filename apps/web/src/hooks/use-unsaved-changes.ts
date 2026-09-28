// Hook guard perubahan belum tersimpan — cegah navigasi & reload
// - beforeunload: cegah tutup tab/refresh browser
// - useBlocker (react-router): cegah navigasi SPA antar halaman
import { useCallback, useEffect, useRef } from "react";
import { useBlocker } from "react-router";

export function useUnsavedChanges(hasChanges: boolean, enabled = true) {
  // Nilai terkini via ref — blocker function tidak menjadi stale closure
  const stateRef = useRef({ hasChanges, enabled });
  stateRef.current = { hasChanges, enabled };

  // Flag: izinkan SATU navigasi berikutnya tanpa konfirmasi.
  // Dipakai saat submit sukses → navigate() dipanggil sebelum re-render,
  // jadi hasChanges masih true padahal data sudah tersimpan.
  const skipNextRef = useRef(false);

  // Reload / tutup tab — browser menampilkan dialog bawaannya sendiri
  useEffect(() => {
    if (!enabled || !hasChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Chrome butuh returnValue eksplisit agar dialog muncul
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [enabled, hasChanges]);

  const blocker = useBlocker(
    () => !skipNextRef.current && stateRef.current.enabled && stateRef.current.hasChanges,
  );

  // Navigasi SPA — konfirmasi sederhana lalu proceed()/reset()
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    const leave = window.confirm("Buang perubahan?");
    if (leave) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker]);

  /** Izinkan navigasi berikutnya tanpa konfirmasi (mis. setelah submit sukses) */
  const allowNext = useCallback(() => {
    skipNextRef.current = true;
  }, []);

  return { blocker, allowNext };
}

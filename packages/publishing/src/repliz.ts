// Repliz API client — bridge publish sebelum akses API native platform disetujui.
//
// Implementasi dipecah ke ./repliz/* (account, oauth, schedule, comment,
// content, chat, automation, report, research, addon) supaya tiap modul
// mudah dibaca. File ini tetap sebagai entry point ("./repliz") agar semua
// import existing — baik di package ini maupun "@sahabatkreator/publishing" —
// tidak perlu diubah.
// Docs lengkap: https://docs.repliz.com/api/introduction.html

export * from "./repliz/index";

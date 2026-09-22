# Sahabat Kreator — Modal render function

Deploy terpisah dari monorepo TS (Modal butuh akun & CLI sendiri).

```bash
pipx install modal                          # atau venv; pip polos sering tolak PEP 668
modal token new                             # sekali, login via browser

# sekali: token Bearer untuk auth antara worker ↔ function. Nilai yang sama
# jadi MODAL_TOKEN di env server SahabatKreator.
modal secret create sk-render-auth MODAL_TOKEN=$(python -c "import secrets;print(secrets.token_urlsafe(32))")

cd apps/render-modal
modal deploy src/sk_render.py               # → URL function, jadi MODAL_RENDER_URL
```

Verifikasi (URL dari output deploy):

```bash
curl -H "Authorization: Bearer <MODAL_TOKEN>" https://<workspace>--sahabatkreator-render-web.modal.run/health
# {"status":"ok"}
```

Endpoint: `POST /render` (pipeline sync, fase 1) + `GET /health` (smoke test).

## Kenapa terpisah

Server prod 2 core / 4 GB RAM sudah over-allocated: postgres 1g + app 1g +
worker 1.5g = 3.5g dari 4g RAM, 3.0 cpu dari 2 core. FFmpeg 1080p butuh
0.5–1.5 GB → OOM killer akan bunuh **Postgres** (oom_score tertinggi karena
shared memory), bukan FFmpeg-nya. Lihat `docs/rfc-video-render.md` §11.

Modal: per-second billing, scale-to-zero. Render 5 menit @ 1 core/2GiB ≈ $0.005;
free tier Starter $30/bln ≈ ±5.700 render/bulan.

## Pipeline

Fetch R2 → probe voiceover (master) → replace/mix audio → resize → whisper
transcribe → burn subtitle → upload R2. Server SahabatKreator tidak pernah
menyentuh byte video besar.

## Yang tidak ada di sini

- metadata device/GPS palsu
- visual randomization sub-persepsi (brightness/pitch jitter)
- SEI / encoder fingerprint removal

Alasan: ketiganya evasion (ToS violation Meta/TikTok/YouTube/LinkedIn — bisa
revoke API app SahabatKreator). RFC §2.

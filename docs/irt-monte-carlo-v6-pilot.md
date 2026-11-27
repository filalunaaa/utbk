# IRT Monte Carlo v6 — Pilot Ketergantungan Lokal

Tanggal: 28 November 2026  
Branch: `audit/power-analysis-monte-carlo`  
Status: **runner disiapkan; hasil pilot belum dijalankan atau divalidasi.**

## Tujuan

Membangun jalur eksekusi kecil dan terpisah untuk mengamati distribusi null diagnostik `pairwise_leave_two_out_posterior_predictive_covariance_adjustment` pada data 2PL unidimensional yang memenuhi independensi lokal bersyarat.

Statistik ini **bukan Yen Q3**, bukan Z-score, dan belum merupakan uji signifikansi. Pilot hanya menguji perilaku null pada konfigurasi simulasi yang dinyatakan; ia tidak mengukur power atau false-positive rate independen.

## Perubahan implementasi

- `runLocalDependenceNullValidation(options)` sekarang menerima `repetitions` dan `examinees`, dengan default 100 dan 500.
- API engine mengekspos fungsi pilot agar dapat dipanggil runner Node.js tanpa UI browser.
- `scripts/run-local-dependence-null-pilot.js` menyediakan seed deterministik, validasi schema/dimensi, dan ekspor JSON.
- `.github/workflows/irt-local-dependence-pilot.yml` menyediakan workflow manual `workflow_dispatch`, default 20 replikasi × 500 peserta, dan mengunggah artefak.
- Parameter 20 butir ditahan tetap sepanjang replikasi dalam satu eksekusi; theta dan respons peserta dibangkitkan ulang.

## Menjalankan pilot

Di GitHub Actions, pilih workflow **IRT Local-Dependence Null Pilot**, lalu jalankan manual. Mulai dengan 20 replikasi dan 500 peserta. Setelah pemeriksaan hasil serta runtime, jumlah replikasi dapat dinaikkan.

Secara lokal:

```bash
SIM_SEED=20261128 SIM_REPS=20 SIM_N=500 node scripts/run-local-dependence-null-pilot.js
```

Artefak: `artifacts/pytago-local-dependence-null-pilot-v1.json`.

## Interpretasi yang diizinkan

- Laporkan jumlah replikasi berhasil/gagal dan tingkat konvergensi.
- Laporkan rerata, simpangan baku, serta kuantil empiris statistik maksimum absolut.
- Perlakukan kuantil sebagai kandidat deskriptif untuk perencanaan kalibrasi, bukan cutoff produksi.
- Jangan menyebut proporsi null yang melewati cutoff sebagai false-positive rate kecuali cutoff ditetapkan pada kumpulan kalibrasi terpisah dan dievaluasi pada kumpulan validasi independen.

## Tahap berikutnya

1. Jalankan pilot kecil dan periksa stabilitas, waktu eksekusi, kegagalan konvergensi, serta distribusi statistik.
2. Tambahkan alternatif local-dependence yang dikendalikan (misalnya cluster/testlet) dengan bank butir yang sama.
3. Tentukan statistik dan desain sebelum kalibrasi besar.
4. Gunakan kumpulan kalibrasi dan validasi independen; laporkan Wilson CI/MCSE serta ketidakpastian cutoff.
5. Pisahkan analisis multidimensionalitas dan 3PL ke eksperimen yang sesuai dengan hipotesis/statistik masing-masing.

Belum ada perubahan pada estimator produksi atau klaim validasi. PR tetap terbuka dan `main` tidak diubah.

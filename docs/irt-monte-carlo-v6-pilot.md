# IRT Monte Carlo v6 — Pilot Ketergantungan Lokal

Tanggal: 28 November 2026  
Branch: `audit/power-analysis-monte-carlo`  
Status: **pilot testlet 20 replikasi berhasil; validasi lanjutan 200 replikasi per kondisi dijadwalkan melalui push workflow.**

## Tujuan

Mengembangkan diagnostik eksploratif `pairwise_leave_two_out_posterior_predictive_covariance_adjustment` untuk memeriksa perilakunya pada:
1. Null: data 2PL unidimensional dengan conditional local independence.
2. Alternatif: efek testlet bersama dalam kelompok empat butir, yang sengaja dihilangkan dari model 2PL unidimensional yang diestimasi.

Statistik ini **bukan Yen Q3**, bukan Z-score, dan belum merupakan uji signifikansi tervalidasi.

## Desain tahap 2

- Bank 20 parameter butir dibangkitkan satu kali dan dipertahankan tetap pada seluruh kondisi.
- Setiap replikasi membangkitkan ulang kemampuan peserta dan respons.
- Alternatif testlet menggunakan efek acak per peserta dan kelompok butir: (u_{person,testlet}\sim N(0,1)), ditambahkan ke prediktor linear dengan loading `tau`.
- Kelompok terdiri dari lima testlet, masing-masing empat butir.
- Nilai default `tau=0.35` dan `tau=0.70`; `tau=0` adalah null.
- Model estimasi tetap MML-EM 2PL unidimensional, sehingga efek testlet merupakan misspecification yang disengaja.
- Replikasi null untuk kalibrasi dipisahkan dari replikasi null untuk validasi. Kandidat cutoff adalah kuantil empiris 95% dari maksimum absolut statistik pada kalibrasi.
- False-positive rate null dan detection rate alternatif dihitung terhadap cutoff tersebut, dengan Wilson 95% CI untuk detection rate kondisional.

## Menjalankan

Workflow **IRT Local-Dependence Null Pilot** sekarang menjalankan runner testlet:

```bash
SIM_SEED=20261128 SIM_REPS=200 SIM_N=500 SIM_STRENGTHS=0.35,0.70 node scripts/run-local-dependence-testlet-pilot.js
```

Pilot awal memakai 20 replikasi per kondisi dan menunjukkan 20% false-positive pada validasi null (4/20; Wilson 95% CI 8,1–41,6%), dengan detection 40% pada tau=0,35 (8/20; CI 21,9–61,3%) dan 65% pada tau=0,70 (13/20; CI 43,3–81,9%). Semua fit konvergen. Angka ini sangat tidak presisi dan cutoff dari hanya 20 replikasi kalibrasi belum stabil. Default workflow dinaikkan menjadi 200 replikasi per kondisi: 200 kalibrasi null, 200 validasi null, dan 200 untuk setiap kekuatan alternatif (800 fit total). Artefak:
`artifacts/pytago-local-dependence-testlet-pilot-v1.json`.

## Interpretasi dan batasan

- Pilot 20 replikasi hanya uji kelayakan alur dan arah sensitivitas, bukan estimasi final. Eksperimen 200 replikasi memperbaiki resolusi, tetapi tetap merupakan validasi menengah; kalibrasi cutoff masih memiliki ketidakpastian Monte Carlo.
- Cutoff empiris dari 20 replikasi memiliki resolusi ekor yang rendah; jangan gunakan untuk keputusan peserta atau produksi.
- Wilson CI yang dilaporkan hanya menggambarkan ketidakpastian binomial bersyarat pada cutoff yang terpilih; belum memasukkan ketidakpastian cutoff.
- Alternatif testlet ini hanya satu bentuk local dependence. Ia tidak mewakili semua pola dependensi, multidimensionalitas, atau 3PL.
- Statistik tetap eksploratif dan tidak boleh diberi label Q3, Z-score, atau uji signifikansi standar.

## Tahap berikutnya

1. Periksa hasil eksperimen 200 replikasi: konvergensi, runtime, false-positive validation, dan pola detection menurut `tau`.
2. Jika pilot stabil, naikkan replikasi kalibrasi dan validasi secara terpisah (misalnya ratusan hingga ribuan).
3. Uji variasi ukuran testlet, jumlah butir per testlet, dan struktur dependensi.
4. Laporkan ketidakpastian cutoff melalui bootstrap/outer simulation atau beberapa kalibrasi independen.
5. Pertahankan eksperimen 3PL dan multidimensionalitas sebagai studi terpisah dengan statistik yang sesuai.

Tidak ada perubahan pada estimator produksi. Branch audit tetap terpisah; `main` tidak diubah.

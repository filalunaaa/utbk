# IRT Monte Carlo v6 — Pilot Ketergantungan Lokal

Tanggal: 28 November 2026  
Branch: `audit/power-analysis-monte-carlo`  
Status: **null pilot awal berhasil; eksperimen testlet alternatif ditambahkan dan menunggu hasil Actions.**

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
SIM_SEED=20261128 SIM_REPS=20 SIM_N=500 SIM_STRENGTHS=0.35,0.70 node scripts/run-local-dependence-testlet-pilot.js
```

Setiap kondisi menggunakan 20 replikasi secara default: 20 kalibrasi null, 20 validasi null, dan 20 untuk masing-masing kekuatan alternatif. Artefak:
`artifacts/pytago-local-dependence-testlet-pilot-v1.json`.

## Interpretasi dan batasan

- Dengan 20 replikasi per kondisi, kuantil 95% dan error rates sangat kasar. Ini hanya uji kelayakan alur dan arah sensitivitas, bukan estimasi final.
- Cutoff empiris dari 20 replikasi memiliki resolusi ekor yang rendah; jangan gunakan untuk keputusan peserta atau produksi.
- Wilson CI yang dilaporkan hanya menggambarkan ketidakpastian binomial bersyarat pada cutoff yang terpilih; belum memasukkan ketidakpastian cutoff.
- Alternatif testlet ini hanya satu bentuk local dependence. Ia tidak mewakili semua pola dependensi, multidimensionalitas, atau 3PL.
- Statistik tetap eksploratif dan tidak boleh diberi label Q3, Z-score, atau uji signifikansi standar.

## Tahap berikutnya

1. Periksa konvergensi, runtime, false-positive validation, dan pola detection menurut `tau`.
2. Jika pilot stabil, naikkan replikasi kalibrasi dan validasi secara terpisah (misalnya ratusan hingga ribuan).
3. Uji variasi ukuran testlet, jumlah butir per testlet, dan struktur dependensi.
4. Laporkan ketidakpastian cutoff melalui bootstrap/outer simulation atau beberapa kalibrasi independen.
5. Pertahankan eksperimen 3PL dan multidimensionalitas sebagai studi terpisah dengan statistik yang sesuai.

Tidak ada perubahan pada estimator produksi. Branch audit tetap terpisah; `main` tidak diubah.

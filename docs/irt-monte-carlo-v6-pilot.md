# IRT Monte Carlo v6 — Pilot Ketergantungan Lokal

Tanggal audit: 28 November 2026  
Branch: `audit/power-analysis-monte-carlo`  
Run tervalidasi: [GitHub Actions #46106103821](https://github.com/filalunaaa/utbk/actions/runs/46106103821)  
Artefak: `pytago-local-dependence-testlet-pilot-v1.json`  
Status: **eksperimen 800 fit berhasil; hasil masih eksploratif dan belum layak untuk keputusan produksi.**

## Tujuan

Mengevaluasi diagnostik eksploratif `pairwise_leave_two_out_posterior_predictive_covariance_adjustment` pada:
1. Null: data 2PL unidimensional dengan conditional local independence.
2. Alternatif: efek testlet bersama dalam kelompok empat butir, yang sengaja dihilangkan dari model 2PL unidimensional yang diestimasi.

Statistik ini **bukan Yen Q3**, bukan Z-score, dan belum merupakan uji signifikansi tervalidasi.

## Desain

- Bank 20 parameter butir dibangkitkan satu kali dan dipertahankan tetap pada seluruh kondisi.
- Setiap replikasi membangkitkan ulang kemampuan peserta dan respons.
- Alternatif testlet menggunakan efek acak per peserta dan kelompok butir: (u_{person,testlet} \sim N(0,1)), ditambahkan ke prediktor linear dengan loading `tau`.
- Kelompok terdiri dari lima testlet, masing-masing empat butir.
- Kekuatan alternatif: `tau=0.35` dan `tau=0.70`; `tau=0` adalah null.
- Model estimasi adalah MML-EM 2PL unidimensional, sehingga efek testlet merupakan misspecification yang disengaja.
- Kalibrasi null dipisahkan dari validasi null independen.
- Cutoff adalah kuantil empiris 95% dari maksimum absolut statistik pada replikasi kalibrasi null.
- Setiap kondisi berisi 200 replikasi; total 800 fit.

## Hasil run 800 fit

| Kondisi | Exceedance | Rate | Wilson 95% CI |
|---|---:|---:|---:|
| Null kalibrasi (in-sample) | 10/200 | 5,0% | — |
| Null validasi independen | 8/200 | 4,0% | 2,04–7,69% |
| Testlet tau=0.35 | 13/200 | 6,5% | 3,84–10,80% |
| Testlet tau=0.70 | 83/200 | 41,5% | 34,89–48,43% |

- Ukuran sampel: 500 peserta; 20 butir; 5 testlet × 4 butir.
- Cutoff empiris: **0,1674049519**.
- Semua 800 fit tercatat konvergen.
- Kalibrasi null 5% adalah proporsi pada sampel yang juga dipakai membentuk cutoff, bukan estimasi false-positive independen.
- Validasi null independen menghasilkan 4,0%. Interval Wilson hanya mencerminkan ketidakpastian binomial bersyarat pada cutoff terpilih; belum mencakup ketidakpastian estimasi cutoff.

## Interpretasi

1. Pada generator dan bank tetap ini, diagnostik memiliki false-positive validation sebesar 4% pada 200 replikasi independen.
2. Alternatif `tau=0.35` hanya terdeteksi 6,5%; sensitivitas terhadap efek testlet lemah pada kekuatan ini.
3. Alternatif `tau=0.70` terdeteksi 41,5%; ada respons terhadap dependensi yang lebih kuat, tetapi detection rate masih jauh dari 100%.
4. Hasil ini tidak dapat digeneralisasi ke seluruh pola local dependence, bank soal, ukuran sampel, atau populasi peserta.
5. Konvergensi numerik tidak membuktikan validitas diagnostik atau kalibrasi inferensial.

## Batasan penting

- Statistik yang diuji adalah `pairwise_leave_two_out_posterior_predictive_covariance_adjustment`, **bukan Yen Q3**. Jangan menyebut hasil ini sebagai validasi Q3.
- Cutoff ditaksir dari 200 replikasi kalibrasi; ketidakpastiannya belum dimasukkan ke interval hasil validasi.
- Hanya satu ukuran sampel, satu bank butir, dan satu struktur testlet yang diuji.
- Hasil bersumber dari data sintetis; belum ada bukti validitas pada respons peserta Pytago.
- Belum ada perubahan pada estimator atau alur penilaian produksi.

## Langkah penelitian berikutnya

1. Implementasikan Yen Q3 secara eksplisit dengan definisi residual dan centering yang terdokumentasi; simpan matriks pasangan lengkap.
2. Bandingkan raw Q3 dan centered Q3 pada null fixed-bank sebelum memilih statistik dan mengkalibrasi cutoff.
3. Uji beberapa struktur local dependence (ukuran testlet dan subset item) serta beberapa ukuran sampel.
4. Tingkatkan replikasi kalibrasi dan validasi setelah definisi statistik dibekukan; ukur ketidakpastian cutoff dengan outer calibration/ bootstrap.
5. Pertahankan eksperimen 3PL dan multidimensionalitas sebagai studi terpisah dengan statistik yang sesuai.

**Keputusan:** pertahankan hasil ini sebagai pilot eksploratif. Jangan gunakan cutoff 0,1674 untuk keputusan peserta atau produksi, dan jangan merge PR #1 sebelum audit statistik serta validasi lanjutan selesai.

# Audit Statistik Monte Carlo IRT Pytago — v5

Tanggal audit: 28 November 2026  
Branch: `audit/power-analysis-monte-carlo`  
Run yang diaudit: [GitHub Actions #3](https://github.com/filalunaaa/utbk/actions/runs/46020925524)  
Artefak: `pytago-irt-model-fit-monte-carlo-v5.json`  
Status: **berhasil secara komputasi; belum layak dijadikan validasi inferensial atau klaim power final.**

## 1. Ringkasan eksekusi

- Schema: `pytago.irt.model-fit-monte-carlo.v5`
- 2.700 estimasi MML-EM 2PL, 27 kondisi, 100 replikasi per kondisi.
- N = 500, 1.000, 2.000; 20 butir.
- Seluruh 2.700 estimasi tercatat konvergen.
- Artefak berhasil diunggah. Keberhasilan workflow hanya membuktikan runner selesai dan file terbentuk; bukan validitas statistik desain.

## 2. Hasil null dan ketidakpastian

| N | Cutoff Max |Q3| | False positive validasi | Wilson 95% |
|---:|---:|---:|---:|---:|
| 500 | 0,4138 | 4/100 = 4% | 1,57%–9,84% |
| 1.000 | 0,4047 | 2/100 = 2% | 0,55%–7,00% |
| 2.000 | 0,3649 | 13/100 = 13% | 7,76%–20,98% |

Interpretasi:
- Estimasi 13% pada N=2.000 adalah sinyal yang perlu diselidiki, bukan bukti final bahwa tingkat false positive populasi pasti 13%. Interval Wilson cukup lebar dan tidak memasukkan ketidakpastian cutoff yang diestimasi dari hanya 100 replikasi kalibrasi.
- Pada N=500 dan N=1.000, interval juga lebar; 100 validasi belum memberi presisi tinggi untuk membedakan tingkat 2–5%.
- Cutoff 95% dihitung dari hanya 100 nilai kalibrasi. Kuantil empiris ekor 95% sangat sensitif terhadap beberapa observasi ekstrem. Interval Wilson untuk validasi tidak mencakup ketidakpastian tahap kalibrasi.

## 3. Temuan metodologis utama

### A. Parameter bank soal berubah di setiap replikasi

`generateScenario()` mengambil ulang diskriminasi dan kesukaran butir pada setiap replikasi. Ini berlaku untuk kalibrasi null, validasi null, dan setiap alternatif.

Konsekuensi:
- Distribusi statistik mencampur variasi sampling peserta dan variasi komposisi bank soal.
- Validasi null tidak memakai bank butir yang sama dengan kalibrasi null.
- Hasil antar-N dan antar-kondisi sulit ditafsirkan sebagai efek ukuran sampel atau besar misspecification saja.

Perbaikan:
- Untuk eksperimen utama, tetapkan satu bank butir 20 item untuk setiap replikasi/seed blok, lalu gunakan bank yang sama pada null kalibrasi, null validasi, dan semua kondisi alternatif yang dibandingkan.
- Laporkan dua estimand secara terpisah bila dibutuhkan: (1) conditional/fixed-bank performance; (2) random-item-bank generalization dengan banyak bank independen sebagai outer replication.

### B. Statistik yang digunakan adalah korelasi residual mentah, bukan Q3 terkoreksi

Kode menghitung korelasi Pearson antara residual `Y_ij - P_ij(EAP)`, lalu mengambil `max(abs(correlation))`. Skor EAP dihitung dari respons yang sama.

Q3 Yen secara konvensional memerlukan perhatian pada bias negatif akibat estimasi kemampuan dari respons yang sama; pendekatan Q3 terkoreksi/centered (misalnya mengurangkan rerata korelasi residual antarbutir) perlu dievaluasi. Mengambil maksimum nilai absolut dari korelasi mentah dapat membuat pergeseran baseline residual memengaruhi statistik dan cutoff.

Perbaikan:
- Simpan matriks Q3 lengkap per replikasi.
- Laporkan rerata Q3 mentah dan distribusinya.
- Evaluasi Q3 terkoreksi/centered, misalnya (Q3^*_{ij}=Q3_{ij}-\overline{Q3}), dengan definisi mean yang eksplisit.
- Bandingkan kalibrasi null untuk raw dan centered statistic. Jangan mengganti statistik tanpa menjalankan ulang seluruh kalibrasi dan validasi.

### C. Q3 bukan penguji umum untuk 3PL

Q3 dirancang sebagai diagnostik residual/local dependence. Data 3PL dapat menyimpang dari model 2PL pada kurva respons tanpa harus menghasilkan ketergantungan residual antarbutir yang kuat. Karena itu, detection rate Q3 untuk 3PL bukan ukuran power yang tepat untuk mendeteksi keberadaan parameter guessing.

Di v5, hasil 3PL:
- c=.05: 4%, 0%, 0% untuk N=500, 1.000, 2.000.
- c=.15: 0% pada ketiga N.
- c=.25: 0% pada ketiga N.

Ini tidak membuktikan Q3 gagal sebagai diagnostik local dependence; ini menunjukkan alternatif 3PL bukan alternatif yang tepat untuk klaim power Q3.

Perbaikan:
- Keluarkan 3PL dari daftar alternatif power Q3.
- Jika Pytago ingin menguji 3PL-vs-2PL, buat analisis terpisah dengan statistik item-fit/kurva respons atau perbandingan model yang sesuai, lalu kalibrasikan statistik itu di bawah null 2PL.
- Tetap boleh menyimpan 3PL sebagai stress-test deskriptif, tetapi labeli bukan power Q3.

### D. Alternatif 2D lebih relevan, tetapi desainnya masih terbatas

Hasil deteksi Q3 untuk 2D:

| Loading sekunder | N=500 | N=1.000 | N=2.000 |
|---:|---:|---:|---:|
| 0,25 | 5% | 2% | 22% |
| 0,45 | 22% | 10% | 49% |
| 0,70 | 68% | 55% | 92% |

Pola umum meningkat pada loading lebih kuat dan N lebih besar, tetapi tidak sepenuhnya monoton antar-N pada semua tingkat loading. Ini perlu dibaca sebagai bukti awal pada generator tertentu, bukan power universal.

Generator memberi loading sekunder bertanda acak (+/-) per butir. Pola ini adalah satu konfigurasi multidimensional tertentu; struktur loading yang seimbang, terkelompok, atau hanya pada subset butir dapat menghasilkan perilaku yang berbeda. Perlu beberapa struktur 2D yang ditentukan eksplisit.

### E. Rasch/1PL tidak menguji hipotesis Q3

Keputusan v5 untuk menaruh 1PL sebagai benchmark dan bukan misspecification power adalah tepat. Restriksi diskriminasi sama adalah hipotesis tentang homogenitas parameter a, bukan local dependence. Jangan menafsirkan exceedance Q3 sebagai power membedakan 1PL dari 2PL.

### F. Semua konvergen bukan berarti estimasi/diagnostik valid

Konvergensi numerik MML-EM tidak membuktikan identifikasi, kecocokan model, kalibrasi statistik, atau validitas diagnostik. Tambahkan pemeriksaan parameter boundary, stabilitas solusi, serta pemeriksaan distribusi statistik dan residual.

## 4. Pembacaan hasil v5 yang masih boleh dilakukan

- Workflow dan pipeline artefak berhasil.
- Di generator ini, Q3 menunjukkan sensitivitas yang meningkat untuk multidimensionalitas yang lebih kuat.
- Deteksi 3PL rendah tidak dapat dianggap kegagalan Q3 karena 3PL bukan target local-dependence yang tepat.
- Null validation N=2.000 menunjukkan kemungkinan kalibrasi yang tidak stabil/pergeseran distribusi dan wajib direplikasi dengan desain fixed-bank serta jumlah replikasi lebih besar.

## 5. Rencana v6 yang direkomendasikan

1. **Pisahkan estimand fixed-bank dan random-bank.** Jadikan fixed-bank eksperimen utama; gunakan outer replication untuk generalisasi bank.
2. **Perbaiki statistik residual.** Simpan Q3 matrix, bandingkan raw Q3 dengan centered Q3, dan pilih statistik sebelum menjalankan validasi independen.
3. **Kalibrasi dan validasi null lebih kuat.** Pilot minimal 500–1.000 replikasi kalibrasi dan 1.000 validasi per N/statistik terpilih; untuk laporan final, tentukan ukuran replikasi berdasarkan presisi CI yang diinginkan. Laporkan ketidakpastian cutoff (misalnya outer bootstrap/ulang kalibrasi), bukan hanya Wilson CI validasi.
4. **Alternatif Q3 yang relevan.** Gunakan local dependence langsung dengan pasangan/cluster butir yang memiliki residual dependence terinduksi, serta beberapa struktur multidimensionalitas yang ditentukan eksplisit.
5. **Pisahkan eksperimen 3PL.** Buat statistik dan kalibrasi khusus untuk item-fit/kurva respons 3PL-vs-2PL.
6. **Pelaporan.** Tampilkan detection rate, false-positive rate, Wilson CI, MCSE, convergence, parameter boundary, dan definisi denominator; jangan beri label power jika alternatif tidak menguji konstruk yang diukur statistik.
7. **Reproducibility.** Catat seed, parameter bank, generator version, estimator version, definisi Q3, dan hash/commit sumber di artefak.

## 6. Keputusan

**Jangan merge PR #1 dan jangan menggunakan v5 untuk mengklaim bahwa diagnostik Q3 Pytago sudah tervalidasi.** Pertahankan v5 sebagai baseline eksploratif yang berhasil dijalankan. Implementasikan v6 pada branch audit, lakukan pilot diagnostik yang lebih kecil untuk memeriksa distribusi statistik, lalu jalankan Monte Carlo final setelah definisi statistik dan desain dibekukan.

Dokumen ini adalah audit atas artefak dan kode v5; bukan hasil eksperimen v6.

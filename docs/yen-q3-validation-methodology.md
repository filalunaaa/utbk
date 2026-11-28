# Yen Q3 — Implementasi dan Validasi Sintetis

Status: implementasi tersedia; validasi Monte Carlo otomatis sedang dijalankan melalui GitHub Actions.  
Branch: `audit/power-analysis-monte-carlo`

## Definisi implementasi

Untuk peserta (r) dan butir (j), residual dihitung sebagai:

[
e_{rj}=X_{rj}-P_j(hat\theta_r)
]

dengan (X_{rj}\in\{0,1\}), probabilitas butir berasal dari parameter 2PL hasil MML-EM, dan (hat\theta_r) adalah EAP berdasarkan posterior model 2PL unidimensional dengan prior kuadratur (N(0,1)).

Raw Yen Q3 untuk pasangan butir (j,k) adalah korelasi Pearson lintas peserta:

[
Q3_{jk}=\operatorname{cor}_r(e_{rj},e_{rk})
]

Versi adjusted/centered menggunakan grand mean seluruh pasangan off-diagonal:

[
Q3^{*}_{jk}=Q3_{jk}-\overline{Q3}
]

Implementasi menyimpan setiap pasangan, jumlah observasi valid, mean raw Q3, mean adjusted Q3, dan maksimum nilai absolut untuk kedua versi.

## Perbedaan dari diagnostik sebelumnya

`pairwise_leave_two_out_posterior_predictive_covariance_adjustment` bukan Yen Q3. Statistik tersebut mengoreksi kovarians respons dengan kovarians prediktif posterior dan memakai standardisasi khusus. Implementasi baru ini secara eksplisit menghitung korelasi residual antarbutir.

## Desain validasi otomatis

Runner `scripts/run-yen-q3-testlet-validation.js` melakukan:
- fixed bank 20 butir dan N peserta per replikasi;
- kalibrasi cutoff maksimum absolut raw Q3 dan adjusted Q3 secara terpisah pada null;
- validasi false-positive pada replikasi null independen;
- alternatif testlet lima kelompok berisi empat butir dengan `tau=0.35` dan `tau=0.70`;
- pelaporan convergence, exceedance, Wilson 95% CI, dan ringkasan distribusi;
- ekspor artefak `pytago-yen-q3-testlet-validation-v1.json`.

GitHub Actions menjalankan 100 replikasi per kondisi secara default untuk studi Q3. Jumlah replikasi dan ukuran sampel dapat diubah melalui workflow dispatch.

## Batas interpretasi

- EAP dihitung dari respons peserta yang sama dengan respons yang dipakai membentuk residual. Estimasi kemampuan ini dapat memengaruhi korelasi residual dan distribusi null finite-sample.
- Centering menggeser semua Q3 dengan grand mean, tetapi tidak menghasilkan uji inferensial per pasangan dan tidak menghapus seluruh bias akibat estimasi theta.
- Cutoff maksimum absolut adalah cutoff empiris spesifik terhadap bank butir, N, generator, estimator, dan sampel kalibrasi.
- Simulasi testlet hanya satu pola alternatif local dependence.
- Hasil sintetis tidak membuktikan validitas pada data peserta nyata.
- Tidak ada cutoff yang boleh dipakai dalam keputusan peserta atau produksi sebelum replikasi lebih besar, sensitivitas desain, pemeriksaan independen, dan validasi empiris selesai.

## Kriteria sebelum rekomendasi produksi

1. Pastikan kalibrasi dan validasi null independen konsisten, termasuk ketidakpastian cutoff.
2. Bandingkan raw dan adjusted Q3 pada beberapa N dan beberapa bank butir.
3. Uji pola local dependence yang berbeda: ukuran testlet, pasangan terisolasi, dan kelompok yang tumpang tindih.
4. Bandingkan hasil dengan implementasi rujukan independen atau paket IRT tervalidasi, setelah menyamakan definisi residual, estimator theta, dan centering.
5. Audit false-positive, detection rate, stabilitas ranking pasangan, dan konvergensi.
6. Pisahkan diagnostik eksploratif dari keputusan operasional dan jangan mengubah estimator produksi hanya berdasarkan pilot sintetis.

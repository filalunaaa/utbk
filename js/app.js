// Tampilkan shortcut Koleksi Soal hanya pada perangkat Android.
if (/Android/i.test(navigator.userAgent)) document.documentElement.classList.add('perangkat-android');

// Simpan & baca statistik di localStorage
const Penyimpanan = {
  KEY: 'utbk_testing_stats',
  kosong() { return { total: 0, benar: 0, mapel: {}, topik: {} }; },
  ambil() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || this.kosong(); }
    catch (e) { return this.kosong(); }
  },
  simpan(data) {
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); } catch (e) {}
  },
  catat(soal, skor) {
    if (!AkunApp.sesi()) return;
    const d = this.ambil();
    d.total++;
    d.benar = bulatSkor((d.benar || 0) + skor);
    // Mapel tetap dihitung untuk semua soal, tetapi statistik topik hanya
    // menerima soal yang benar-benar terhubung ke taksonomi resmi.
    const agregasi = [['mapel', soal.mataPelajaran]];
    const topikTax = topikTaxById(soal.topikId) || topikTaxById(soal.subtopikId) ||
      cariTopikTax(soal.mataPelajaran, soal.topik);
    if (topikTax && topikTax.topik && topikTax.topik.nama) {
      agregasi.push(['topik', topikTax.topik.nama]);
    }
    agregasi.forEach(([k, nama]) => {
      if (!nama) return;
      d[k][nama] = d[k][nama] || { total: 0, benar: 0 };
      d[k][nama].total++;
      d[k][nama].benar = bulatSkor((d[k][nama].benar || 0) + skor);
    });
    this.simpan(d);
  },
  reset() {
    try { localStorage.removeItem(this.KEY); } catch (e) {}
  }
};

// Catat pilihan jawaban yang dipilih murid, per soal (untuk analisis pengecoh)
const PilihanStat = {
  KEY: 'utbk_pilihan_stat',
  ambil() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || {}; }
    catch (e) { return {}; }
  },
  simpan(d) {
    try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (e) {}
  },
  catat(soal, pilihan) {
    if (!AkunApp.sesi() || adaIsian(soal)) return; // soal isian tidak punya pilihan untuk dianalisis
    const d = this.ambil();
    const k = String(soal.id);
    d[k] = d[k] || { total: 0, pilih: [0, 0, 0, 0, 0] };
    d[k].total++;
    [].concat(pilihan).forEach((p) => { d[k].pilih[p]++; });
    this.simpan(d);
  },
  hapusSoal(id) {
    const d = this.ambil();
    delete d[String(id)];
    this.simpan(d);
  },
  reset() {
    try { localStorage.removeItem(this.KEY); } catch (e) {}
  }
};

// ADMIN: akun ini terdaftar di tabel admin_users (hanya mengatur tampilan; izin sebenarnya dijaga RLS di server)
// modeAdmin: form dan daftar bank sedang mengelola soal bawaan, bukan bank pribadi
let ADMIN = false;
let modeAdmin = false;

// Riwayat pengerjaan: tiap soal yang dijawab dicatat (untuk melihat kembali per topik beserta pembahasannya)
const Riwayat = {
  KEY: 'utbk_riwayat',
  MAKS: 600, // simpan 600 catatan terbaru saja agar penyimpanan browser tidak penuh
  ambil() {
    try { const a = JSON.parse(localStorage.getItem(this.KEY)); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  },
  simpan(a) {
    try { localStorage.setItem(this.KEY, JSON.stringify(a)); } catch (e) {}
  },
  catat(soal, jawaban, skor) {
    if (!AkunApp.sesi()) return;
    const a = this.ambil();
    a.push({ id: String(soal.id), topik: soal.topik, mapel: soal.mataPelajaran,
      j: jawaban === undefined ? null : jawaban, b: skor === 1, sc: skor, t: Date.now() });
    this.simpan(a.slice(-this.MAKS));
  },
  reset() {
    try { localStorage.removeItem(this.KEY); } catch (e) {}
  }
};

// Riwayat sesi: setiap latihan/try out yang selesai disimpan sebagai satu catatan (ringkasan + hasil tiap soal)
const RiwayatSesi = {
  KEY: 'utbk_riwayat_sesi',
  MAKS: 60, // 60 sesi terbaru
  ambil() {
    try { const a = JSON.parse(localStorage.getItem(this.KEY)); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  },
  simpan(a) {
    try { localStorage.setItem(this.KEY, JSON.stringify(a)); } catch (e) {}
  },
  catat(e) {
    if (!AkunApp.sesi()) return;
    const a = this.ambil();
    a.push(e);
    this.simpan(a.slice(-this.MAKS));
  },
  reset() {
    try { localStorage.removeItem(this.KEY); } catch (e) {}
  }
};

// Bank soal buatan pengajar (disimpan di localStorage browser)
const BankSoal = {
  KEY: 'utbk_bank_custom',
  ambil() {
    if (modeAdmin) return SOAL;
    try { return JSON.parse(localStorage.getItem(this.KEY)) || []; }
    catch (e) { return []; }
  },
  // Mengembalikan false jika penyimpanan browser penuh
  simpan(list) {
    if (modeAdmin) { SOAL = list; DefaultSoal.kirim(); return true; }
    try { localStorage.setItem(this.KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }
};

// Folder untuk mengelompokkan soal di bank (disimpan di localStorage browser)
const BankFolder = {
  KEY: 'utbk_bank_folder',
  ambil() {
    if (modeAdmin) return []; // soal bawaan tidak memakai folder
    try { return JSON.parse(localStorage.getItem(this.KEY)) || []; }
    catch (e) { return []; }
  },
  simpan(list) {
    if (modeAdmin) return true;
    try { localStorage.setItem(this.KEY, JSON.stringify(list)); return true; }
    catch (e) { return false; }
  }
};

// Bank soal bawaan. Backslash LaTeX ditulis dobel (\\frac), indeks jawaban: A=0 ... E=4
const SOAL_BAWAAN = [
  { id: 1, mataPelajaran: "PK", topik: "Aljabar", tingkatKesulitan: "mudah",
    soal: "Jika $x + y = 10$ dan $xy = 21$, maka nilai $x^2 + y^2$ adalah ...",
    opsi: ["$42$", "$49$", "$58$", "$64$", "$79$"], jawaban: 2,
    pembahasan: "$x^2 + y^2 = (x+y)^2 - 2xy = 100 - 42 = 58$." },
  { id: 2, mataPelajaran: "PK", topik: "Persen", tingkatKesulitan: "mudah",
    soal: "Jika $\\frac{3}{5}$ dari suatu bilangan adalah $24$, maka 25% dari bilangan tersebut adalah ...",
    opsi: ["$6$", "$8$", "$10$", "$12$", "$15$"], jawaban: 2,
    pembahasan: "Bilangan $= 24 \\times \\frac{5}{3} = 40$, sehingga $25\\% \\times 40 = 10$." },
  { id: 3, mataPelajaran: "PK", topik: "Deret", tingkatKesulitan: "sulit",
    soal: "Nilai dari $\\frac{1}{1\\cdot 2}+\\frac{1}{2\\cdot 3}+\\dots+\\frac{1}{9\\cdot 10}$ adalah ...",
    opsi: ["$\\frac{8}{9}$", "$\\frac{9}{10}$", "$\\frac{10}{11}$", "$\\frac{11}{12}$", "$1$"], jawaban: 1,
    pembahasan: "Pecah tiap suku jadi selisih, lalu saling habis (teleskopik): $$\\sum_{k=1}^{9}\\left(\\frac{1}{k}-\\frac{1}{k+1}\\right)=1-\\frac{1}{10}=\\frac{9}{10}$$" },
  { id: 4, mataPelajaran: "PK", topik: "Geometri", tingkatKesulitan: "sedang",
    soal: "Sebuah persegi panjang memiliki luas $48$ dan keliling $28$. Panjang diagonalnya adalah ...",
    opsi: ["$8$", "$9$", "$10$", "$12$", "$14$"], jawaban: 2,
    pembahasan: "$p + l = 14$ dan $pl = 48$, jadi $p^2 + l^2 = 14^2 - 2\\cdot 48 = 100$. Diagonal $= \\sqrt{100} = 10$." },
  { id: 5, mataPelajaran: "PK", topik: "Peluang", tingkatKesulitan: "sedang",
    soal: "Dua dadu dilempar bersamaan. Peluang munculnya jumlah mata dadu $8$ adalah ...",
    opsi: ["$\\frac{1}{9}$", "$\\frac{5}{36}$", "$\\frac{1}{6}$", "$\\frac{7}{36}$", "$\\frac{1}{4}$"], jawaban: 1,
    pembahasan: "Pasangan berjumlah 8: $(2,6),(3,5),(4,4),(5,3),(6,2)$, yaitu 5 dari $36$ kemungkinan, jadi peluangnya $\\frac{5}{36}$." },
  { id: 6, mataPelajaran: "PM", topik: "Barisan dan Deret", tingkatKesulitan: "sedang",
    soal: "Pada barisan aritmetika, $U_3 = 11$ dan $U_7 = 27$. Nilai $U_{10}$ adalah ...",
    opsi: ["$31$", "$35$", "$37$", "$39$", "$43$"], jawaban: 3,
    pembahasan: "Beda $b = \\frac{27-11}{7-3} = 4$, lalu $a = 11 - 2\\cdot 4 = 3$. Jadi $U_{10} = 3 + 9\\cdot 4 = 39$." },
  { id: 7, mataPelajaran: "PM", topik: "Fungsi", tingkatKesulitan: "mudah",
    soal: "Jika $f(x) = 2x + 3$, maka $f^{-1}(7)$ adalah ...",
    opsi: ["$1$", "$2$", "$3$", "$4$", "$5$"], jawaban: 1,
    pembahasan: "$f^{-1}(7) = a$ berarti $f(a) = 7$, yaitu $2a + 3 = 7$, sehingga $a = 2$." },
  { id: 8, mataPelajaran: "PM", topik: "Persamaan Kuadrat", tingkatKesulitan: "sedang",
    soal: "Akar-akar persamaan $x^2 - 5x + 6 = 0$ adalah $\\alpha$ dan $\\beta$. Nilai $\\alpha^2 + \\beta^2$ adalah ...",
    opsi: ["$11$", "$12$", "$13$", "$14$", "$15$"], jawaban: 2,
    pembahasan: "$\\alpha + \\beta = 5$ dan $\\alpha\\beta = 6$, maka $\\alpha^2 + \\beta^2 = 25 - 12 = 13$." },
  { id: 9, mataPelajaran: "PM", topik: "Logaritma", tingkatKesulitan: "sulit",
    soal: "Jika $\\log_2 3 = a$, maka $\\log_6 24$ adalah ...",
    opsi: ["$\\frac{a+3}{a+1}$", "$\\frac{a+2}{a+1}$", "$\\frac{3a+1}{a+1}$", "$\\frac{a+3}{a}$", "$\\frac{2a+3}{a+1}$"], jawaban: 0,
    pembahasan: "$\\log_6 24 = \\frac{\\log_2 24}{\\log_2 6}$. Karena $24 = 8\\cdot 3$ dan $6 = 2\\cdot 3$, hasilnya $\\frac{3 + a}{1 + a}$." },
  { id: 10, mataPelajaran: "PM", topik: "Trigonometri", tingkatKesulitan: "mudah",
    soal: "Nilai dari $\\sin 30^\\circ + \\cos 60^\\circ + \\tan 45^\\circ$ adalah ...",
    opsi: ["$1$", "$\\frac{3}{2}$", "$2$", "$\\frac{5}{2}$", "$3$"], jawaban: 2,
    pembahasan: "$\\frac{1}{2} + \\frac{1}{2} + 1 = 2$." },
  { id: 11, mataPelajaran: "PK", topik: "Perbandingan", tingkatKesulitan: "mudah",
    soal: "Perbandingan uang Andi dan Budi adalah $3 : 5$. Jika jumlah uang keduanya Rp240.000, selisih uang mereka adalah ...",
    opsi: ["Rp30.000", "Rp45.000", "Rp60.000", "Rp75.000", "Rp90.000"], jawaban: 2,
    pembahasan: "Total bagian $= 3 + 5 = 8$, sehingga satu bagian $= \\frac{240.000}{8} = 30.000$. Uang Andi $= 3 \\times 30.000 = 90.000$ dan uang Budi $= 5 \\times 30.000 = 150.000$. Selisihnya $150.000 - 90.000 = 60.000$." },
  { id: 12, mataPelajaran: "PK", topik: "Statistika", tingkatKesulitan: "mudah",
    soal: "Rata-rata lima bilangan adalah $12$. Jika satu bilangan dikeluarkan, rata-rata empat bilangan sisanya menjadi $10$. Bilangan yang dikeluarkan adalah ...",
    opsi: ["$16$", "$18$", "$20$", "$22$", "$24$"], jawaban: 2,
    pembahasan: "Jumlah lima bilangan $= 5 \\times 12 = 60$. Jumlah empat bilangan sisa $= 4 \\times 10 = 40$. Bilangan yang dikeluarkan $= 60 - 40 = 20$." },
  { id: 13, mataPelajaran: "PM", topik: "Bangun Ruang", tingkatKesulitan: "mudah",
    soal: "Volume kubus dengan panjang rusuk $6$ cm adalah ...",
    opsi: ["$36 \\text{ cm}^3$", "$108 \\text{ cm}^3$", "$180 \\text{ cm}^3$", "$216 \\text{ cm}^3$", "$432 \\text{ cm}^3$"], jawaban: 3,
    pembahasan: "$V = s^3 = 6^3 = 216 \\text{ cm}^3$." },
  { id: 14, mataPelajaran: "PM", topik: "Bangun Ruang", tingkatKesulitan: "sedang",
    soal: "Sebuah tabung memiliki jari-jari $7$ cm dan tinggi $10$ cm. Jika $\\pi = \\frac{22}{7}$, volume tabung tersebut adalah ...",
    opsi: ["$770 \\text{ cm}^3$", "$1.100 \\text{ cm}^3$", "$1.540 \\text{ cm}^3$", "$2.200 \\text{ cm}^3$", "$3.080 \\text{ cm}^3$"], jawaban: 2,
    pembahasan: "$V = \\pi r^2 t = \\frac{22}{7} \\times 7^2 \\times 10 = 22 \\times 7 \\times 10 = 1.540 \\text{ cm}^3$." },
  { id: 15, mataPelajaran: "PM", topik: "Turunan", tingkatKesulitan: "mudah",
    soal: "Jika $f(x) = x^3 - 3x^2 + 2$, maka nilai $f'(3)$ adalah ...",
    opsi: ["$0$", "$3$", "$6$", "$9$", "$12$"], jawaban: 3,
    pembahasan: "$f'(x) = 3x^2 - 6x$, sehingga $f'(3) = 27 - 18 = 9$." },
  { id: 16, mataPelajaran: "PM", topik: "Turunan", tingkatKesulitan: "sulit",
    soal: "Nilai maksimum fungsi $f(x) = x^3 - 3x$ pada interval $-2 \\le x \\le 2$ adalah ...",
    opsi: ["$-2$", "$0$", "$2$", "$4$", "$8$"], jawaban: 2,
    pembahasan: "$f'(x) = 3x^2 - 3 = 0$ memberi $x = \\pm 1$. Nilai di titik kritis dan ujung interval: $f(-2) = -2$, $f(-1) = 2$, $f(1) = -2$, $f(2) = 2$. Jadi nilai maksimumnya $2$." },
  { id: 17, mataPelajaran: "PM", topik: "Integral", tingkatKesulitan: "mudah",
    soal: "Nilai dari $\\int_0^2 (3x^2 + 1)\\, dx$ adalah ...",
    opsi: ["$6$", "$8$", "$10$", "$12$", "$14$"], jawaban: 2,
    pembahasan: "$\\int_0^2 (3x^2 + 1)\\, dx = \\left[x^3 + x\\right]_0^2 = (8 + 2) - 0 = 10$." },
  { id: 18, mataPelajaran: "PM", topik: "Limit", tingkatKesulitan: "mudah",
    soal: "Nilai dari $\\lim_{x \\to 2} \\frac{x^2 - 4}{x - 2}$ adalah ...",
    opsi: ["$0$", "$2$", "$4$", "$\\infty$", "$\\frac{1}{4}$"], jawaban: 2,
    pembahasan: "Untuk $x \\neq 2$, $\\frac{x^2 - 4}{x - 2} = \\frac{(x-2)(x+2)}{x-2} = x + 2$. Jadi limitnya $2 + 2 = 4$." },
  { id: 19, mataPelajaran: "PK", topik: "Peluang", tingkatKesulitan: "mudah",
    soal: "Dua koin dilempar bersamaan satu kali. Peluang muncul paling sedikit satu gambar (G) adalah ...",
    opsi: ["$\\frac{1}{4}$", "$\\frac{1}{2}$", "$\\frac{3}{4}$", "$1$", "$\\frac{1}{8}$"], jawaban: 2,
    pembahasan: "Ruang sampel: AA, AG, GA, GG (4 kejadian). Yang memuat paling sedikit satu gambar: AG, GA, GG (3 kejadian). Peluangnya $\\frac{3}{4}$." },
  { id: 20, mataPelajaran: "PK", topik: "Persen", tingkatKesulitan: "sedang",
    soal: "Harga sebuah barang naik $20\\%$, kemudian turun $20\\%$ dari harga barunya. Perubahan harga terhadap harga awal adalah ...",
    opsi: ["Tetap sama", "Turun 4%", "Naik 4%", "Turun 20%", "Naik 2%"], jawaban: 1,
    pembahasan: "Misalkan harga awal $100$. Setelah naik $20\\%$ menjadi $120$. Setelah turun $20\\%$ dari $120$ menjadi $120 \\times 0.8 = 96$. Jadi harga turun $100 - 96 = 4$, yaitu turun $4\\%$." },
  { id: 21, mataPelajaran: "PK", topik: "Barisan dan Deret", tingkatKesulitan: "mudah",
    soal: "Jumlah semua bilangan asli dari $1$ sampai $50$ adalah ...",
    opsi: ["$1.225$", "$1.250$", "$1.275$", "$1.300$", "$1.325$"], jawaban: 2,
    pembahasan: "$1 + 2 + \\dots + 50 = \\frac{50 \\times 51}{2} = 1.275$." },
  { id: 22, mataPelajaran: "PK", topik: "Aljabar", tingkatKesulitan: "mudah",
    soal: "Nilai $x$ yang memenuhi $2x - 5 = 3x + 1$ adalah ...",
    opsi: ["$-6$", "$-3$", "$3$", "$6$", "$9$"], jawaban: 0,
    pembahasan: "$2x - 3x = 1 + 5$, sehingga $-x = 6$ dan $x = -6$." },
  { id: 23, mataPelajaran: "PK", topik: "Aljabar", tingkatKesulitan: "sulit",
    soal: "Jika $x + \\frac{1}{x} = 3$, maka nilai $x^2 + \\frac{1}{x^2}$ adalah ...",
    opsi: ["$3$", "$5$", "$7$", "$9$", "$11$"], jawaban: 2,
    pembahasan: "$\\left(x + \\frac{1}{x}\\right)^2 = x^2 + 2 + \\frac{1}{x^2} = 9$, sehingga $x^2 + \\frac{1}{x^2} = 9 - 2 = 7$." },
  { id: 24, mataPelajaran: "PM", topik: "Persamaan Kuadrat", tingkatKesulitan: "mudah",
    soal: "Nilai minimum fungsi $f(x) = x^2 - 4x + 7$ adalah ...",
    opsi: ["$1$", "$2$", "$3$", "$4$", "$7$"], jawaban: 2,
    pembahasan: "Nilai minimum terjadi di $x = \\frac{-b}{2a} = 2$. Maka $f(2) = 4 - 8 + 7 = 3$." },
  { id: 25, mataPelajaran: "PM", topik: "Trigonometri", tingkatKesulitan: "mudah",
    soal: "Nilai dari $\\cos 60^\\circ + \\sin 90^\\circ$ adalah ...",
    opsi: ["$\\frac{1}{2}$", "$1$", "$\\frac{3}{2}$", "$2$", "$\\frac{5}{2}$"], jawaban: 2,
    pembahasan: "$\\cos 60^\\circ = \\frac{1}{2}$ dan $\\sin 90^\\circ = 1$, sehingga hasilnya $\\frac{1}{2} + 1 = \\frac{3}{2}$." },
  { id: 26, mataPelajaran: "PM", topik: "Logaritma", tingkatKesulitan: "mudah",
    soal: "Nilai dari $\\log_3 81$ adalah ...",
    opsi: ["$2$", "$3$", "$4$", "$5$", "$9$"], jawaban: 2,
    pembahasan: "$81 = 3^4$, sehingga $\\log_3 81 = 4$." },
  { id: 27, mataPelajaran: "PM", topik: "Geometri", tingkatKesulitan: "mudah",
    soal: "Luas lingkaran dengan jari-jari $10$ cm, jika $\\pi = 3.14$, adalah ...",
    opsi: ["$62.8 \\text{ cm}^2$", "$157 \\text{ cm}^2$", "$314 \\text{ cm}^2$", "$628 \\text{ cm}^2$", "$100 \\text{ cm}^2$"], jawaban: 2,
    pembahasan: "$L = \\pi r^2 = 3.14 \\times 10^2 = 314 \\text{ cm}^2$." },
  { id: 28, mataPelajaran: "PK", topik: "Geometri", tingkatKesulitan: "mudah",
    soal: "Sebuah segitiga siku-siku memiliki sisi siku-siku $6$ cm dan $8$ cm. Panjang sisi miringnya adalah ...",
    opsi: ["$7$ cm", "$9$ cm", "$10$ cm", "$12$ cm", "$14$ cm"], jawaban: 2,
    pembahasan: "$c = \\sqrt{6^2 + 8^2} = \\sqrt{100} = 10$ cm." },
  { id: 29, mataPelajaran: "PK", topik: "Peluang", tingkatKesulitan: "sedang",
    soal: "Dua dadu dilempar bersamaan. Peluang munculnya jumlah mata dadu paling sedikit $10$ adalah ...",
    opsi: ["$\\frac{1}{12}$", "$\\frac{1}{9}$", "$\\frac{1}{6}$", "$\\frac{1}{4}$", "$\\frac{5}{36}$"], jawaban: 2,
    pembahasan: "Pasangan dengan jumlah $\\ge 10$: $(4,6), (5,5), (5,6), (6,4), (6,5), (6,6)$, ada $6$ dari $36$ kemungkinan. Peluangnya $\\frac{6}{36} = \\frac{1}{6}$." },
  { id: 30, mataPelajaran: "PK", topik: "Statistika", tingkatKesulitan: "sedang",
    soal: "Median dari data $3, 9, 4, 7, 1, 8$ adalah ...",
    opsi: ["$4$", "$5$", "$5.5$", "$6$", "$7$"], jawaban: 2,
    pembahasan: "Urutan data: $1, 3, 4, 7, 8, 9$. Dua data tengah adalah $4$ dan $7$, sehingga median $= \\frac{4 + 7}{2} = 5.5$." },
  { id: 31, mataPelajaran: "PM", topik: "Himpunan", tingkatKesulitan: "mudah",
    soal: "<p>Diketahui himpunan $K$, $L$, dan $M$ sebagai berikut.</p><p>$K = \\{x \\mid 2 \\le x < 10,\\ x \\text{ bilangan genap}\\}$</p><p>$L = \\{x \\mid x < 5,\\ x \\text{ bilangan asli}\\}$</p><p>$M = \\{x \\mid x \\text{ faktor dari } 12\\}$</p><p>Anggota himpunan $(K \\cap M) \\cup L$ adalah ....</p>",
    opsi: ["$\\{1,2,3,4\\}$", "$\\{2,4,6,8\\}$", "$\\{1,2,3,4,6\\}$", "$\\{1,2,3,4,6,12\\}$", "$\\{1,2,3,4,6,8\\}$"], jawaban: 2,
    pembahasan: "<p>$K=\\{2,4,6,8\\}$, $L=\\{1,2,3,4\\}$, dan $M=\\{1,2,3,4,6,12\\}$.</p><p>Irisan $K \\cap M=\\{2,4,6\\}$, sehingga $(K \\cap M) \\cup L=\\{1,2,3,4,6\\}$.</p>" },
  { id: 32, mataPelajaran: "PK", topik: "Aljabar", tingkatKesulitan: "sedang",
    soal: "<p>Suatu operasi bilangan didefinisikan sebagai $x \\odot y = \\frac{x^2 - y^2 + xy}{2}$ untuk setiap bilangan real positif $x$ dan $y$, serta $x > y$.</p><p>Jika $x \\odot 2 = 10$, tentukan Benar atau Salah untuk setiap pernyataan berikut terkait dengan informasi yang diberikan!</p><ul><li>$x$ adalah bilangan prima.</li><li>$x$ merupakan faktor dari 15.</li><li>Nilai $x \\odot 2$ lebih dari 4.</li></ul>",
    opsi: ["Benar, Benar, Salah", "Salah, Salah, Benar", "Benar, Salah, Benar", "Salah, Benar, Benar", "Semua benar"], jawaban: 1,
    pembahasan: "<p>$\\frac{x^2 - 4 + 2x}{2} = 10 \\Rightarrow x^2 + 2x - 24 = 0 \\Rightarrow (x+6)(x-4) = 0$.</p><p>Karena $x$ positif, $x = 4$ (memenuhi $x > 2$).</p><p>Pernyataan 1: 4 bukan bilangan prima (Salah).</p><p>Pernyataan 2: 4 bukan faktor dari 15 (Salah).</p><p>Pernyataan 3: $x \\odot 2 = 10 > 4$ (Benar).</p>" },
  { id: 33, mataPelajaran: "PM", topik: "Eksponen", tingkatKesulitan: "sedang",
    soal: "<p>Jika nilai $b = 27$, maka bentuk sederhana dari $\\frac{\\left(a^3 \\times b^{5/3}\\right)^6}{81 \\times a^5}$ adalah ....</p>",
    opsi: ["$\\frac{a^{23}}{3^{12}}$", "$\\frac{3^{26}}{a^{13}}$", "$3^{4}a^{13}$", "$3^{13}a^{26}$", "$3^{26}a^{13}$"], jawaban: 4,
    pembahasan: "<p>$b^{5/3} = 27^{5/3} = 3^5$.</p><p>Pembilang: $(a^3 \\cdot 3^5)^6 = a^{18} \\cdot 3^{30}$.</p><p>Penyebut: $81a^5 = 3^4 a^5$.</p><p>Hasilnya $3^{30-4}\\, a^{18-5} = 3^{26}a^{13}$.</p>" },
  { id: 34, mataPelajaran: "PM", topik: "Program Linear", tingkatKesulitan: "sedang",
    soal: "<p>Bu Ratih ingin memberikan hadiah untuk murid-muridnya di sekolah. Ia akan membeli donat dan es cokelat di Toko ER. Toko tersebut menyediakan dua menu paket sebagai berikut.</p><table><thead><tr><th>Paket A</th><th>Paket B</th></tr></thead><tbody><tr><td>3 donat dan 4 es cokelat</td><td>3 donat dan 2 es cokelat</td></tr></tbody></table><p>Agar semua muridnya mendapat bagian, Bu Ratih harus membeli minimal 30 donat dan 20 es cokelat. Jika banyak Paket A yang dipesan dinyatakan dengan $a$ dan banyak Paket B yang dipesan dinyatakan dengan $b$, maka model matematika yang menggambarkan ilustrasi tersebut adalah ....</p>",
    opsi: ["$a + b \\ge 10;\\ a + 2b \\ge 10;\\ a, b \\ge 0$", "$a + b \\ge 10;\\ 2a + b \\ge 10;\\ a, b \\ge 0$", "$a - b \\ge 10;\\ 2a + b \\le 10;\\ a, b \\ge 0$", "$a + b \\le 0;\\ 2a + b \\ge 10;\\ a, b \\ge 0$", "$a + b \\le 0;\\ 2a + b \\ge 10;\\ a, b \\ge 0$"], jawaban: 1,
    pembahasan: "<p>Donat: $3a + 3b \\ge 30 \\Rightarrow a + b \\ge 10$.</p><p>Es cokelat: $4a + 2b \\ge 20 \\Rightarrow 2a + b \\ge 10$.</p><p>Banyak paket tidak mungkin negatif, sehingga $a, b \\ge 0$.</p>" },
  { id: 35, mataPelajaran: "PK", topik: "Sistem Persamaan Linear", tingkatKesulitan: "sedang",
    soal: "<p>Sebuah toko kue menawarkan paket hampers kue kering lebaran. Setiap paket terdiri dari beberapa jenis kue kering, yaitu nastar, kastengel, dan palm cheese, dengan komposisi dan harga sebagai berikut.</p><table><thead><tr><th>Paket</th><th>Harga</th><th>Isi</th></tr></thead><tbody><tr><td>Paket Raya</td><td>Rp184.000,00</td><td>1 nastar, 1 kastengel, dan 2 palm cheese</td></tr><tr><td>Paket Fitri</td><td>Rp136.000,00</td><td>1 nastar, 1 kastengel, dan 1 palm cheese</td></tr><tr><td>Paket Ketupat</td><td>Rp128.000,00</td><td>2 nastar dan 1 kastengel</td></tr></tbody></table><p>Jika ibu ingin membeli 1 Paket Ketupat dan ingin menambah 1 kastengel dan 1 palm cheese dengan harga satuan, maka harga yang harus dibayar ibu adalah ....</p>",
    opsi: ["Rp128.000,00", "Rp224.000,00", "Rp184.000,00", "Rp264.000,00", "Rp216.000,00"], jawaban: 1,
    pembahasan: "<p>Misalkan harga nastar $n$, kastengel $k$, palm cheese $p$.</p><p>Paket Raya dikurangi Paket Fitri: $p = 48.000$.</p><p>Dari Paket Fitri, $n + k = 88.000$.</p><p>Dari Paket Ketupat, $2n + k = 128.000$, sehingga $n = 40.000$ dan $k = 48.000$.</p><p>Harga yang dibayar: $128.000 + 48.000 + 48.000 = 224.000$.</p>" },
  { id: 36, mataPelajaran: "PK", topik: "Fungsi", tingkatKesulitan: "mudah",
    soal: "<p>Hubungan antara jarak tempuh dan jumlah bahan bakar yang dibutuhkan sebuah mobil dinyatakan secara linear sebagai berikut.</p><p>$y = 0{,}08x + 2$</p><p>Dengan $x$ menyatakan jarak tempuh (dalam km) dan $y$ menyatakan jumlah bahan bakar (dalam liter). Jika jumlah bahan bakar yang digunakan adalah 10 liter, maka jarak tempuh mobil tersebut adalah ... km</p>",
    opsi: ["90", "95", "100", "110", "120"], jawaban: 2,
    pembahasan: "$10 = 0{,}08x + 2 \\Rightarrow 0{,}08x = 8 \\Rightarrow x = 100$." },
  { id: 37, mataPelajaran: "PK", topik: "Fungsi", tingkatKesulitan: "mudah",
    soal: "<p>Tarif parkir di sebuah gedung dinyatakan sebagai fungsi:</p><p>$P(t) = 3.000 + 2.000t$</p><p>dengan $t$ lama parkir (dalam jam) dan $P(t)$ dalam rupiah.</p><p>Pilihlah semua pernyataan yang benar terkait dengan informasi di atas! Jawaban benar lebih dari satu.</p>",
    opsi: ["Fungsi tersebut merupakan fungsi linear.", "Biaya awal parkir sebesar Rp2.000,00.", "Setiap tambahan 1 jam parkir, menambah biaya Rp2.000,00.", "Jika parkir selama 3 jam, maka biaya parkirnya Rp6.000,00.", "Grafik fungsi tersebut membentuk sebuah kurva."], jawaban: [0, 2],
    pembahasan: "<p>A benar: bentuknya $at + b$, yaitu fungsi linear.</p><p>B salah: biaya awal ($t = 0$) adalah Rp3.000,00.</p><p>C benar: koefisien $t$ adalah 2.000.</p><p>D salah: $P(3) = 3.000 + 6.000 = 9.000$.</p><p>E salah: grafik fungsi linear berupa garis lurus.</p>" },
  { id: 38, mataPelajaran: "PM", topik: "Persamaan Kuadrat", tingkatKesulitan: "sulit",
    soal: "<p>Diberikan fungsi parabola $f(x) = x^2 - 6x + c$ menyinggung garis $y = -2x + 3$. Tentukan Tepat atau Tidak Tepat untuk setiap pernyataan berikut terkait dengan fungsi kuadrat dan garis tersebut!</p><ul><li>Nilai $c$ sama dengan 4.</li><li>Parabola menyinggung garis di titik $(2, -1)$.</li><li>Jika parabola memotong sumbu X di titik $(a, 0)$ dan $(b, 0)$, maka nilai $a + b$ sama dengan 7.</li></ul>",
    opsi: ["Tepat, Tepat, Tidak Tepat", "Tidak Tepat, Tidak Tepat, Tepat", "Tidak Tepat, Tepat, Tidak Tepat", "Tepat, Tidak Tepat, Tepat", "Semua tepat"], jawaban: 2,
    pembahasan: "<p>Samakan: $x^2 - 6x + c = -2x + 3 \\Rightarrow x^2 - 4x + (c - 3) = 0$.</p><p>Menyinggung berarti $D = 0$: $16 - 4(c - 3) = 0 \\Rightarrow c = 7$ (pernyataan 1 tidak tepat).</p><p>Titik singgung di $x = 2$, $y = -2(2) + 3 = -1$, yaitu $(2, -1)$ (pernyataan 2 tepat).</p><p>Untuk $x^2 - 6x + 7 = 0$, $a + b = 6$, bukan 7 (pernyataan 3 tidak tepat).</p>" },
  { id: 39, mataPelajaran: "PM", topik: "Fungsi", tingkatKesulitan: "sedang",
    soal: "<p>Diketahui fungsi $f(x) = x - 2$ dan $g(x) = x^2 - 3x + 6$.</p><p>Jika $(g \\circ f)(x) = 10$, maka pilihlah semua nilai $x$ yang memenuhi! Jawaban benar lebih dari satu.</p>",
    opsi: ["1", "2", "3", "6", "7"], jawaban: [0, 3],
    pembahasan: "<p>$(g \\circ f)(x) = (x-2)^2 - 3(x-2) + 6 = x^2 - 7x + 16$.</p><p>Dari $x^2 - 7x + 16 = 10$ diperoleh $x^2 - 7x + 6 = 0$, yaitu $(x-1)(x-6) = 0$, jadi $x = 1$ atau $x = 6$.</p>" },
  { id: 40, mataPelajaran: "PK", topik: "Fungsi", tingkatKesulitan: "sedang",
    soal: "<p>Diberikan fungsi $f(x) = ax + b$ dengan $a \\neq 0$. Berapakah nilai $f^{-1}(2)$?</p><p>Putuskan apakah dengan tambahan informasi pernyataan (1) dan pernyataan (2) berikut cukup untuk menjawab pertanyaan tersebut!</p><p>(1) Grafik fungsi $f(x)$ memotong garis $x = 2$ di titik $(2, 8)$.</p><p>(2) Nilai dari $f^{-1}(0)$ sama dengan $-1$.</p>",
    opsi: ["Pernyataan (1) SAJA cukup untuk menjawab pertanyaan, tetapi pernyataan (2) SAJA tidak cukup.", "Pernyataan (2) SAJA cukup untuk menjawab pertanyaan, tetapi pernyataan (1) SAJA tidak cukup.", "DUA pernyataan BERSAMA-SAMA cukup untuk menjawab pertanyaan, tetapi SATU pernyataan SAJA tidak cukup.", "Pernyataan (1) SAJA cukup untuk menjawab pertanyaan dan pernyataan (2) SAJA cukup.", "Pernyataan (1) dan pernyataan (2) tidak cukup untuk menjawab pertanyaan."], jawaban: 2,
    pembahasan: "<p>(1) memberi $2a + b = 8$, satu persamaan untuk dua variabel, belum cukup.</p><p>(2) memberi $f(-1) = 0$, yaitu $-a + b = 0$, belum cukup.</p><p>Bersama-sama: $a = b = \\frac{8}{3}$.</p><p>Maka $f^{-1}(2)$ memenuhi $\\frac{8}{3}x + \\frac{8}{3} = 2$, yaitu $x = -\\frac{1}{4}$.</p><p>Jadi kedua pernyataan bersama-sama cukup.</p>" },
  { id: 41, mataPelajaran: "PK", topik: "Barisan dan Deret", tingkatKesulitan: "mudah",
    soal: "<p>Pada bulan Januari, seorang penjual sayuran menjual wortel sebanyak 80 kg, pada bulan Februari sebanyak 95 kg, pada bulan Maret sebanyak 110 kg, dan selalu menunjukkan pertambahan dengan pola yang sama untuk satu tahun. Banyaknya wortel yang terjual pada bulan kedelapan adalah ....</p>",
    opsi: ["185 kg", "155 kg", "170 kg", "140 kg", "125 kg"], jawaban: 0,
    pembahasan: "<p>Barisan aritmetika dengan $a = 80$ dan beda $b = 15$.</p><p>$U_8 = 80 + 7 \\times 15 = 185$ kg.</p>" },
  { id: 42, mataPelajaran: "PM", topik: "Barisan dan Deret", tingkatKesulitan: "sedang",
    soal: "<p>Seorang mahasiswa akan mengamati suatu jenis virus. Pada pukul 10.00 mulai diamati terdapat 8 virus. Setiap 3 jam virus akan membelah diri menjadi dua. Diketahui bahwa:</p><ul><li>Jumlah virus dianggap stabil jika jumlahnya lebih dari 64.</li><li>Jumlahnya dianggap terlalu padat jika sama dengan atau melebihi 1.024, sehingga perlu dimusnahkan sebagian.</li></ul><p>Pada pukul berapa jumlah virus berada dalam kondisi yang stabil tetapi belum perlu dimusnahkan sebagian? Pilihlah semua jawaban benar! Jawaban benar lebih dari satu.</p>",
    opsi: ["19.00", "22.00", "01.00", "04.00", "07.00"], jawaban: [1, 2, 3],
    pembahasan: "<p>Setelah $t$ jam (kelipatan 3), jumlah virus $= 8 \\cdot 2^{t/3}$.</p><p>Stabil: $8 \\cdot 2^{t/3} > 64 \\Rightarrow t > 9$.</p><p>Belum padat: $8 \\cdot 2^{t/3} < 1.024 \\Rightarrow t < 21$.</p><p>Jadi $t = 12, 15, 18$ jam, yaitu pukul 22.00, 01.00, dan 04.00.</p><p>Pukul 19.00 ($t = 9$) jumlahnya tepat 64 sehingga belum stabil, dan pukul 07.00 ($t = 21$) jumlahnya 1.024 sehingga sudah terlalu padat.</p>" },
  { id: 43, mataPelajaran: "PM", topik: "Trigonometri", tingkatKesulitan: "sedang",
    soal: "<p>Diberikan segitiga siku-siku sebagai berikut.</p><img src=\"data:image/jpeg;base64,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\" alt=\"Gambar soal\" style=\"display:block;margin:14px auto;width:70%\"><p>Jika $\\tan \\beta = \\sqrt{3}$, maka tentukan Benar atau Salah untuk setiap pernyataan berikut!</p><ul><li>$\\sin \\beta = \\frac{1}{2}\\sqrt{3}$</li><li>$\\tan \\alpha = \\frac{1}{2}\\sqrt{3}$</li><li>$\\cos \\alpha = \\frac{1}{3}\\sqrt{3}$</li></ul>",
    opsi: ["Salah, Benar, Benar", "Salah, Benar, Salah", "Salah, Salah, Benar", "Benar, Salah, Salah", "Semua salah"], jawaban: 3,
    pembahasan: "<p>$\\tan \\beta = \\sqrt{3}$ berarti $\\beta = 60^\\circ$, sehingga $\\sin \\beta = \\frac{1}{2}\\sqrt{3}$ (Benar).</p><p>Dengan $AB = 1$ dan $BC = 2$: $AD = \\sqrt{3}$, $AC = 3$, $DC = \\sqrt{9 + 3} = 2\\sqrt{3}$.</p><p>Maka $\\tan \\alpha = \\frac{AD}{AC} = \\frac{1}{3}\\sqrt{3}$ dan $\\cos \\alpha = \\frac{AC}{DC} = \\frac{1}{2}\\sqrt{3}$, sehingga pernyataan 2 dan 3 Salah.</p>" },
  { id: 44, mataPelajaran: "PK", topik: "Geometri", tingkatKesulitan: "sedang",
    soal: "<p>Diberikan sebuah segitiga sama kaki sebagai berikut.</p><img src=\"data:image/jpeg;base64,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\" alt=\"Gambar soal\" style=\"display:block;margin:14px auto;width:70%\"><p>Apakah luas segitiga tersebut lebih dari 12?</p><p>Putuskan apakah dengan tambahan informasi pernyataan (1) dan pernyataan (2) berikut cukup untuk menjawab pertanyaan tersebut!</p><p>(1) Keliling segitiga adalah 18 dan tinggi sama dengan 3.</p><p>(2) Jika setengah alas segitiga sama dengan 4, maka jumlah alas dan tingginya sama dengan 11.</p>",
    opsi: ["Pernyataan (1) SAJA cukup untuk menjawab pertanyaan, tetapi pernyataan (2) SAJA tidak cukup.", "Pernyataan (2) SAJA cukup untuk menjawab pertanyaan, tetapi pernyataan (1) SAJA tidak cukup.", "DUA pernyataan BERSAMA-SAMA cukup untuk menjawab pertanyaan, tetapi SATU pernyataan SAJA tidak cukup.", "Pernyataan (1) SAJA cukup untuk menjawab pertanyaan dan pernyataan (2) SAJA cukup.", "Pernyataan (1) dan pernyataan (2) tidak cukup untuk menjawab pertanyaan."], jawaban: 3,
    pembahasan: "<p>(1) Sisi sama kaki $s$: $2s + a = 18$ dan $s^2 = 3^2 + \\left(\\frac{a}{2}\\right)^2$.</p><p>Dengan $s = \\frac{18 - a}{2}$ diperoleh $(18 - a)^2 = 36 + a^2$, jadi $a = 8$ dan luas $= \\frac{1}{2} \\cdot 8 \\cdot 3 = 12$, tidak lebih dari 12.</p><p>Cukup.</p><p>(2) Setengah alas 4 berarti $a = 8$, dan $a + t = 11$ berarti $t = 3$.</p><p>Luas $= 12$, tidak lebih dari 12.</p><p>Cukup.</p><p>Jadi masing-masing pernyataan saja sudah cukup.</p>" },
  { id: 45, mataPelajaran: "PM", topik: "Geometri", tingkatKesulitan: "sedang",
    soal: "<p>Perhatikan gambar berikut!</p><img src=\"data:image/jpeg;base64,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\" alt=\"Gambar soal\" style=\"display:block;margin:14px auto;width:70%\"><p>Diketahui $BC$ sejajar $AD$, dengan $AD > BC$ dan $\\angle ADC = 60^\\circ$.</p><p>Pilihlah semua pernyataan yang benar terkait dengan sudut-sudut dalam trapesium tersebut! Jawaban benar lebih dari satu.</p>",
    opsi: ["$\\angle ABD = 30^\\circ$", "$\\angle ADB = 45^\\circ$", "$\\angle BDC = 15^\\circ$", "$\\angle BCD = 100^\\circ$", "$\\angle ABC = \\angle BAD$"], jawaban: [1, 2, 4],
    pembahasan: "<p>Trapesium siku-siku di $A$ dan $B$, dengan $\\angle DBC = 45^\\circ$.</p><p>Maka $\\angle ABD = 90^\\circ - 45^\\circ = 45^\\circ$ (A salah) dan $\\angle ADB = 45^\\circ$ (B benar).</p><p>$\\angle BDC = 60^\\circ - 45^\\circ = 15^\\circ$ (C benar).</p><p>Karena $BC \\parallel AD$, $\\angle BCD = 180^\\circ - 60^\\circ = 120^\\circ$ (D salah).</p><p>$\\angle ABC = \\angle BAD = 90^\\circ$ (E benar).</p>" },
  { id: 46, mataPelajaran: "PK", topik: "Geometri", tingkatKesulitan: "sedang",
    soal: "<p>Kakak akan membuat sebuah kerajinan yang akan ditempeli foto di bagian tengahnya seperti gambar berikut. Ukuran foto tersebut adalah 15 cm × 10 cm.</p><img src=\"data:image/jpeg;base64,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\" alt=\"Gambar soal\" style=\"display:block;margin:14px auto;width:70%\"><p>Agar lebih menarik, ia akan menambahkan pita berwarna di sekeliling kerajinan tersebut. Jika di sekeliling foto juga akan dihias menggunakan pita, maka panjang pita yang dibutuhkan kakak untuk menghias kerajinan tersebut adalah ... cm.</p>",
    opsi: ["90", "78", "66", "60", "45"], jawaban: 1,
    pembahasan: "<p>Lebar kerajinan $= 3 + 15 + 3 = 21$ cm, sehingga busur atas adalah setengah lingkaran berjari-jari $10{,}5$ cm.</p><p>Panjang busur $= \\frac{1}{2} \\cdot \\frac{22}{7} \\cdot 21 = 33$ cm.</p><p>Keliling kerajinan $= 12 + 12 + 21 + 33 = 78$ cm.</p>" },
  { id: 47, mataPelajaran: "PK", topik: "Bangun Ruang", tingkatKesulitan: "sedang",
    soal: "<p>Sebuah ruangan toko berbentuk balok dengan ukuran 10 m × 6 m × 4 m. Di dekat pintu masuk akan dipasang sekat dan digunakan sebagai fitting room dengan ukuran 2 m × 2 m seperti gambar berikut.</p><img src=\"data:image/jpeg;base64,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\" alt=\"Gambar soal\" style=\"display:block;margin:14px auto;width:80%\"><p>Fitting room (termasuk pintunya) akan diperbarui warna catnya di bagian dalam saja (bukan dinding bagian luar toko). Jika biaya untuk memperbarui warna cat adalah Rp10.000,00/m$^2$, maka biaya total yang diperlukan sama dengan ....</p>",
    opsi: ["Rp240.000,00", "Rp360.000,00", "Rp420.000,00", "Rp480.000,00", "Rp640.000,00"], jawaban: 1,
    pembahasan: "<p>Bagian dalam fitting room: 4 dinding $= 4 \\times (2 \\times 4) = 32$ m$^2$ dan langit-langit $= 2 \\times 2 = 4$ m$^2$, total $36$ m$^2$.</p><p>Biaya $= 36 \\times 10.000 = 360.000$.</p>" },
  { id: 48, mataPelajaran: "PM", topik: "Bangun Ruang", tingkatKesulitan: "sulit",
    soal: "<p>Diketahui kubus $ABCD.EFGH$ dengan volume 64. Jika $X$ titik tengah $CG$ dan $Y$ titik tengah $HB$, maka tentukan Benar atau Salah untuk setiap pernyataan berikut terkait dengan informasi yang diberikan!</p><ul><li>Panjang rusuk kubus lebih dari 4.</li><li>Jarak titik $X$ dan $Y$ sama dengan $2\\sqrt{2}$.</li><li>Jika sudut yang dibentuk oleh garis $XY$ dan $AG$ adalah $\\theta$, maka $\\sin \\theta = \\frac{1}{3}\\sqrt{3}$.</li></ul>",
    opsi: ["Benar, Salah, Benar", "Salah, Benar, Benar", "Benar, Benar, Salah", "Semua benar", "Semua salah"], jawaban: 1,
    pembahasan: "<p>Rusuk $= \\sqrt[3]{64} = 4$ (pernyataan 1 salah).</p><p>Dengan $A(0,0,0)$, $B(4,0,0)$, $C(4,4,0)$, $G(4,4,4)$, $H(0,4,4)$: $X(4,4,2)$ dan $Y(2,2,2)$.</p><p>$XY = \\sqrt{4 + 4 + 0} = 2\\sqrt{2}$ (benar).</p><p>Vektor $XY = (-2,-2,0)$ dan $AG = (4,4,4)$: $\\cos\\theta = \\frac{16}{2\\sqrt{2} \\cdot 4\\sqrt{3}} = \\frac{2}{\\sqrt{6}}$, sehingga $\\sin\\theta = \\sqrt{1 - \\frac{4}{6}} = \\frac{1}{3}\\sqrt{3}$ (benar).</p>" },
  { id: 49, mataPelajaran: "PM", topik: "Transformasi Geometri", tingkatKesulitan: "sulit",
    soal: "<p>Diberikan matriks transformasi $T_1 = \\begin{pmatrix} 1 & p-4 \\\\ p+1 & -5 \\end{pmatrix}$. Titik $A(1,-1)$ dilakukan transformasi $T_1$ menghasilkan titik $A'(4,7)$. Titik $B(x,y)$ ditransformasikan dengan matriks $T_1$ menghasilkan $B'(-6,-10)$.</p><p>Pilihlah semua pernyataan berikut yang benar! Jawaban benar lebih dari satu.</p>",
    opsi: ["Nilai $p$ sama dengan $-1$.", "Koordinat titik $B$ adalah $(0, 2)$.", "Nilai dari $x - y$ lebih dari nol.", "Hasil transformasi titik $(-2, 4)$ oleh $T_1$ adalah $(-14, -24)$.", "Jika $T_2$ adalah transformasi pencerminan terhadap sumbu-$y$, maka bayangan titik $B$ oleh transformasi $T_2 \\circ T_1$ adalah $(6, -10)$."], jawaban: [1, 3, 4],
    pembahasan: "<p>Dari $A \\to A'$: $1 \\cdot 1 + (p-4)(-1) = 4 \\Rightarrow p = 1$, sehingga $T_1 = \\begin{pmatrix} 1 & -3 \\\\ 2 & -5 \\end{pmatrix}$ (A salah).</p><p>Untuk $B$: $x - 3y = -6$ dan $2x - 5y = -10$, diperoleh $y = 2$, $x = 0$, jadi $B(0,2)$ (B benar).</p><p>$x - y = -2$, tidak lebih dari nol (C salah).</p><p>$T_1(-2,4) = (-2-12,\\ -4-20) = (-14,-24)$ (D benar).</p><p>$T_1(B) = (-6,-10)$, lalu dicerminkan terhadap sumbu-$y$ menjadi $(6,-10)$ (E benar).</p>" },
  { id: 50, mataPelajaran: "PM", topik: "Transformasi Geometri", tingkatKesulitan: "sedang",
    soal: "<p>Sebuah titik dengan koordinat $(x, 2)$ dirotasi sebesar $270^\\circ$ berlawanan arah jarum jam dengan pusat $O(0, 0)$ menghasilkan titik dengan koordinat $(2, y)$. Nilai dari $x^2 + y^2 + 2xy$ sama dengan ....</p>",
    opsi: ["0", "1", "2", "3", "4"], jawaban: 0,
    pembahasan: "<p>Rotasi $270^\\circ$ berlawanan arah jarum jam: $(x, y) \\to (y, -x)$.</p><p>Jadi $(x, 2) \\to (2, -x)$, sehingga $y = -x$.</p><p>Maka $x^2 + y^2 + 2xy = (x + y)^2 = 0$.</p>" },
  { id: 51, mataPelajaran: "PK", topik: "Statistika", tingkatKesulitan: "mudah",
    soal: "<p>Hasil panen 3 jenis buah (dalam kg) di suatu perkebunan selama satu semester pada tahun 2025 ditunjukkan pada diagram berikut.</p><img src=\"data:image/jpeg;base64,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\" alt=\"Gambar soal\" style=\"display:block;margin:14px auto;width:100%\"><p>Pada bulan apakah buah A diprediksi sedang musim di antara buah yang lainnya (memiliki hasil panen yang paling banyak)?</p><p>Pilihlah semua jawaban benar! Jawaban benar lebih dari satu.</p>",
    opsi: ["Januari", "Februari", "Maret", "April", "Mei"], jawaban: [1, 2],
    pembahasan: "<p>Buah A paling banyak pada Februari (A 550, B 500, C 100) dan Maret (A 500, B 350, C 350).</p><p>Januari dan April bukan, karena Januari B tertinggi (400) dan April C tertinggi (500).</p><p>Mei juga bukan, karena C tertinggi (600).</p>" },
  { id: 52, mataPelajaran: "PK", topik: "Perbandingan", tingkatKesulitan: "sulit",
    soal: "<p>Suatu perusahaan menyiapkan sebanyak 2.000 paket bingkisan lebaran untuk para karyawannya. Perusahaan menyediakan 3 paket bingkisan, yaitu Paket 1, Paket 2, dan Paket 3. Rasio banyaknya tiap paket, yaitu P<sub>1</sub> : P<sub>2</sub> : P<sub>3</sub> = 8 : 9 : 8. Untuk penyaluran bingkisan Paket 2 ke setiap divisi adalah sebagai berikut.</p><table><thead><tr><th>Divisi</th><th>Persentase</th></tr></thead><tbody><tr><td>Divisi A</td><td>25%</td></tr><tr><td>Divisi B</td><td>40%</td></tr><tr><td>Divisi C</td><td>35%</td></tr></tbody></table><p>Pada saat pengemasan bingkisan, ternyata terdapat kesalahan pencatatan sehingga ada 20 Paket 3 yang tercatat sebagai Paket 2. Tentukan Benar atau Salah untuk setiap pernyataan berikut terkait dengan informasi yang diberikan tersebut setelah koreksi data!</p><ul><li>Banyaknya Paket 3 yang disiapkan adalah 660 paket.</li><li>Paket 2 yang diterima Divisi B sebanyak 280 paket.</li><li>Banyaknya Paket 2 yang diterima Divisi C adalah 235 paket.</li></ul>",
    opsi: ["Benar, Salah, Benar", "Salah, Salah, Benar", "Semua benar", "Salah, Benar, Salah", "Benar, Benar, Salah"], jawaban: 4,
    pembahasan: "<p>Satu bagian $= \\frac{2.000}{25} = 80$, sehingga semula $P_1 = 640$, $P_2 = 720$, $P_3 = 640$.</p><p>Setelah koreksi, 20 paket dipindahkan dari Paket 2 ke Paket 3: $P_2 = 700$ dan $P_3 = 660$ (pernyataan 1 benar).</p><p>Divisi B: $40\\% \\times 700 = 280$ (benar).</p><p>Divisi C: $35\\% \\times 700 = 245$, bukan 235 (salah).</p>" },
  { id: 53, mataPelajaran: "PK", topik: "Statistika", tingkatKesulitan: "sedang",
    soal: "<p>Diberikan data sebagai berikut.</p><p>$7, 16, 8, 13, A, 11, 10, 12, 15, 8$</p><p>Jika rata-rata data tersebut adalah 11 dan mediannya sama dengan $B$, maka nilai $A + B$ adalah ...</p>",
    opsi: ["10", "10,5", "20", "20,5", "25"], jawaban: 3,
    pembahasan: "<p>Jumlah 10 data $= 10 \\times 11 = 110$.</p><p>Jumlah 9 data yang diketahui $= 100$, jadi $A = 10$.</p><p>Data terurut: $7, 8, 8, 10, 10, 11, 12, 13, 15, 16$, median $= \\frac{10 + 11}{2} = 10{,}5 = B$.</p><p>Maka $A + B = 20{,}5$.</p>" },
  { id: 54, mataPelajaran: "PM", topik: "Kaidah Pencacahan", tingkatKesulitan: "sedang",
    soal: "<p>Enam pengurus OSIS di SMA Bahagia akan melakukan foto bersama untuk buku tahunan. Pengurus OSIS tersebut terdiri atas 2 siswa laki-laki dan 4 siswa perempuan (2 siswa memakai hijab dan 2 siswa lainnya tidak). Ketentuan barisan sesi foto tersebut adalah sebagai berikut.</p><ul><li>Dua siswa laki-laki selalu berada di ujung barisan (paling kanan dan paling kiri).</li><li>Siswa perempuan yang memakai hijab selalu berdampingan.</li><li>Siswa perempuan yang tidak memakai hijab selalu berdampingan.</li></ul><p>Banyak kemungkinan susunan foto tersebut adalah ...</p>",
    opsi: ["8", "16", "18", "24", "36"], jawaban: 1,
    pembahasan: "<p>Dua siswa laki-laki di ujung: $2! = 2$ cara.</p><p>Empat posisi tengah diisi dua pasang yang saling berdampingan: urutan dua blok (hijab dan tidak hijab) $2!$, susunan dalam blok hijab $2!$, dan dalam blok tidak hijab $2!$, yaitu $2 \\times 2 \\times 2 = 8$ cara.</p><p>Total $2 \\times 8 = 16$.</p>" },
  { id: 55, mataPelajaran: "PM", topik: "Peluang", tingkatKesulitan: "sedang",
    soal: "<p>Sebuah kotak pensil berisi 3 spidol merah, 3 spidol hitam, dan 4 spidol biru. Dari dalam kotak pensil akan diambil 3 spidol sekaligus secara acak. Jika peluang terambil 2 spidol biru dan 1 spidol merah adalah $\\frac{a}{b}$, maka nilai $a + \\frac{b}{5}$ sama dengan ...</p>",
    opsi: ["5", "6", "7", "10", "20"], jawaban: 2,
    pembahasan: "<p>Banyak cara mengambil 3 dari 10 spidol: $\\binom{10}{3} = 120$.</p><p>Cara mengambil 2 biru dan 1 merah: $\\binom{4}{2} \\cdot \\binom{3}{1} = 6 \\times 3 = 18$.</p><p>Peluang $= \\frac{18}{120} = \\frac{3}{20}$, jadi $a = 3$ dan $b = 20$.</p><p>Nilai $a + \\frac{b}{5} = 3 + 4 = 7$.</p>" },
  {"id":56,"tipe":"isian","mataPelajaran":"PK","topik":"Aljabar","tingkatKesulitan":"sedang","soal":"<p>Jika $3x + 5 = 29$, maka nilai dari $x^2 - 4x$ adalah ...</p>","opsi":[],"jawaban":32,"pembahasan":"<p>Dari $3x + 5 = 29$ diperoleh $3x = 24$, sehingga $x = 8$.</p><p>Maka $x^2 - 4x = 8^2 - 4 \\cdot 8 = 64 - 32 = 32$.</p>"},
  {"id":57,"tipe":"isian","mataPelajaran":"PM","topik":"Barisan dan Deret","tingkatKesulitan":"sedang","soal":"<p>Pada barisan aritmetika, suku ke-3 adalah $11$ dan suku ke-7 adalah $27$. Suku ke-10 barisan tersebut adalah ...</p>","opsi":[],"jawaban":39,"pembahasan":"<p>$U_7 - U_3 = 4b = 16$, sehingga beda $b = 4$.</p><p>Suku pertama $a = U_3 - 2b = 11 - 8 = 3$.</p><p>Maka $U_{10} = a + 9b = 3 + 36 = 39$.</p>"},
  {"id":58,"tipe":"kompleks","mataPelajaran":"PK","topik":"Fungsi","tingkatKesulitan":"sedang","soal":"<p>Diberikan fungsi $f(x) = x^2 - 4x + 3$.</p><p>Pilihlah semua pernyataan yang benar!</p>","opsi":["$f(0) = 3$","Grafik $f$ memotong sumbu X di $x = 1$ dan $x = 3$","Nilai minimum $f(x)$ adalah $-1$","Sumbu simetri grafik $f$ adalah $x = -2$","$f(x) > 0$ untuk semua bilangan real $x$"],"jawaban":[0,1,2],"pembahasan":"<p>A benar: $f(0) = 3$.</p><p>B benar: $f(x) = (x-1)(x-3)$, sehingga memotong sumbu X di $x = 1$ dan $x = 3$.</p><p>C benar dan D salah: sumbu simetri $x = -\\frac{b}{2a} = 2$, dan nilai minimumnya $f(2) = 4 - 8 + 3 = -1$.</p><p>E salah: karena $f(2) = -1 < 0$.</p>"},
  {"id":59,"tipe":"kompleks","mataPelajaran":"PK","topik":"Persen","tingkatKesulitan":"sedang","soal":"<p>Harga sebuah barang adalah Rp200.000. Toko memberi diskon 20%, lalu diskon tambahan 10% dari harga setelah diskon pertama.</p><p>Pilihlah semua pernyataan yang benar!</p>","opsi":["Harga setelah diskon pertama adalah Rp160.000.","Diskon tambahan bernilai Rp20.000.","Harga akhir barang adalah Rp144.000.","Total potongan harga sama dengan 28% dari harga awal.","Total potongan harga sama dengan 30% dari harga awal."],"jawaban":[0,2,3],"pembahasan":"<p>Setelah diskon 20%, harga menjadi $0{,}8 \\times 200.000 = 160.000$ (A benar).</p><p>Diskon tambahan $10\\% \\times 160.000 = 16.000$, bukan 20.000 (B salah).</p><p>Harga akhir $160.000 - 16.000 = 144.000$ (C benar).</p><p>Total potongan $200.000 - 144.000 = 56.000$, yaitu $\\frac{56.000}{200.000} \\times 100\\% = 28\\%$ (D benar, E salah).</p>"}
];

// ---------- Soal bawaan dari server (Supabase: tabel soal_default) ----------
// SOAL_BAWAAN di atas hanya cadangan (dipakai bila server tidak terjangkau dan belum ada cache).
// Sumber utama: tabel soal_default, yang hanya bisa diubah admin (lihat supabase_soal_default.sql).
let SOAL = (() => {
  try {
    const c = JSON.parse(localStorage.getItem('utbk_soal_default'));
    if (c && Array.isArray(c.soal)) return c.soal;
  } catch (e) {}
  return SOAL_BAWAAN.map((s) => ({ ...s, id: String(s.id) }));
})();
// JSON dengan urutan kunci tetap, supaya perbandingan tidak terkecoh urutan kunci jsonb
function kanon(o) {
  if (Array.isArray(o)) return '[' + o.map(kanon).join(',') + ']';
  if (o && typeof o === 'object') {
    return '{' + Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => JSON.stringify(k) + ':' + kanon(o[k])).join(',') + '}';
  }
  return JSON.stringify(o);
}
const sinId = (s) => { const { id, folderId, ...d } = s; return d; };
function statusAdmin(teks, err) {
  ['pesan-admin', 'pesan-form', 'pesan-bank'].forEach((k) => {
    const p = $(k);
    if (!p) return;
    p.textContent = teks;
    p.className = 'pesan ' + (err ? 'err' : 'ok');
  });
}
const DefaultSoal = {
  urutan: {},            // id -> urutan di server
  asli: {},              // id -> isi terakhir yang ada di server (bentuk kanonik)
  antrean: Promise.resolve(),
  muatTerbatas: false,
  jumlahMuatTerbatas: 0,
  simpanCache() {
    // Jangan menimpa cache lengkap dengan subset yang sedang dibuka admin.
    if (this.muatTerbatas) return;
    try { localStorage.setItem('utbk_soal_default', JSON.stringify({ soal: SOAL })); } catch (e) {}
  },
  async hitung() {
    const token = await tokenAktif();
    const headers = { apikey: SB_KEY, Prefer: 'count=exact', Range: '0-0', 'Range-Unit': 'items' };
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = await fetch(SB_URL + '/rest/v1/soal_default?select=id', { method: 'HEAD', headers });
    if (!r.ok) throw new Error('Jumlah soal dari server tidak dapat diperiksa.');
    const rentang = r.headers.get('content-range') || '';
    const teksTotal = rentang.split('/').pop();
    const total = Number(teksTotal);
    if (!teksTotal || teksTotal === '*' || !Number.isFinite(total)) throw new Error('Server tidak mengirim jumlah soal yang valid.');
    return total;
  },
  // Muat hanya N soal yang paling baru ditambahkan (urutan tertinggi).
  async muatTerbaru(jumlah) {
    const n = Math.max(0, Math.floor(Number(jumlah) || 0));
    const halaman = n ? await rest(
      `soal_default?select=id,urutan,data&order=urutan.desc,id.desc&limit=${n}`
    ) : [];
    if (!Array.isArray(halaman)) throw new Error('Respons server soal_default tidak valid.');
    const terbaru = halaman.reverse();
    this.urutan = {};
    this.asli = {};
    SOAL = terbaru.map((r) => {
      const s = { ...r.data, id: String(r.id) };
      this.urutan[s.id] = r.urutan;
      this.asli[s.id] = kanon(sinId(s));
      return s;
    });
    this.muatTerbatas = true;
    this.jumlahMuatTerbatas = n;
  },
 // Ambil semua soal bawaan dari server secara bertahap
  async muat() {
    const semua = [];
    const ukuranHalaman = 500;
    let offset = 0;

    while (true) {
      const halaman = await rest(
        `soal_default?select=id,urutan,data&order=urutan.asc,id.asc&limit=${ukuranHalaman}&offset=${offset}`
      );

      if (!Array.isArray(halaman)) {
        throw new Error('Respons server soal_default tidak valid.');
      }

      semua.push(...halaman);

      if (halaman.length < ukuranHalaman) break;

      offset += halaman.length;
    }

    this.urutan = {};
    this.asli = {};
    this.muatTerbatas = false;
    this.jumlahMuatTerbatas = 0;

    SOAL = semua.map((r) => {
      const s = { ...r.data, id: String(r.id) };
      this.urutan[s.id] = r.urutan;
      this.asli[s.id] = kanon(sinId(s));
      return s;
    });

    this.simpanCache();
  },

  // Kirim perubahan (tambah/ubah/hapus) ke server, satu per satu agar berurutan
  kirim() {
    statusAdmin('Menyimpan ke server...', false);
    this.antrean = this.antrean.then(() => this._kirim()).then(
      () => statusAdmin('Tersimpan di server. Pengguna lain akan melihatnya saat membuka ulang aplikasi.', false),
      (e) => statusAdmin('Gagal menyimpan ke server: ' + e.message + ' (coba lagi, atau klik "Muat ulang dari server").', true)
    );
  },
  async _kirim() {
    const ada = new Set(SOAL.map((s) => s.id));
    const hapus = Object.keys(this.asli).filter((id) => !ada.has(id));
    let u = Math.max(0, ...Object.values(this.urutan));
    const naik = [];
    SOAL.forEach((s) => {
      const d = sinId(s);
      const k = kanon(d);
      if (this.asli[s.id] === k) return;
      if (!(s.id in this.urutan)) this.urutan[s.id] = ++u;
      naik.push({ id: s.id, urutan: this.urutan[s.id], data: d, diperbarui_pada: new Date().toISOString(), _k: k });
    });
    if (naik.length) {
      await rest('soal_default?on_conflict=id', {
        method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
        body: naik.map(({ _k, ...baris }) => baris)
      });
      naik.forEach((b) => (this.asli[b.id] = b._k));
    }
    if (hapus.length) {
      const daftar = hapus.map((id) => '"' + id.replace(/"/g, '') + '"').join(',');
      await rest('soal_default?id=in.(' + encodeURIComponent(daftar) + ')', { method: 'DELETE', prefer: 'return=minimal' });
      hapus.forEach((id) => { delete this.asli[id]; delete this.urutan[id]; });
    }
    this.simpanCache();
  }
};
// Muat soal bawaan terbaru dan segarkan tampilan (dipakai semua pengguna saat aplikasi dibuka)
async function segarkanSoalBawaan(paksa = false) {
  const sedangLogin = /access_token=/.test(location.hash) || sessionStorage.getItem('pytago_google_login_pending') === '1';
  if (modeAdmin || (!paksa && (AkunApp.sesi() || sedangLogin))) return;
  try { await DefaultSoal.muat(); }
  catch (e) { console.warn('Soal bawaan dari server tidak terambil, memakai cache/cadangan:', e); return; }
  buatDatalist();
  renderPilihSumber();
  renderBeranda();
  renderSemuaBank();
}

// ---------- Akun & sinkronisasi (Supabase) ----------
const SB_URL = 'https://umgmagvfbmtjpzprhdnj.supabase.co';
const SB_KEY = 'sb_publishable_8x2rSfCmbAWYr1oxE4I8vQ_hDVt928p';
// Data yang ikut disimpan ke akun: kunci lokal -> kunci di tabel data_pengguna
const SYNC = {
  utbk_testing_stats: 'statistik',
  utbk_bank_custom: 'bank_soal',
  utbk_bank_folder: 'bank_folder',
  utbk_pilihan_stat: 'pilihan_stat',
  utbk_pengaturan: 'pengaturan',
  pytago_koleksi_soal: 'koleksi_soal'
};
// Riwayat dikirim terpisah: kalau server menolaknya, data lain tetap tersinkron
const SYNC_OPSIONAL = { utbk_riwayat: 'riwayat', utbk_riwayat_sesi: 'riwayat_sesi', utbk_onboarding: 'onboarding', utbk_avatar: 'avatar' };
// Semua data milik akun yang tersimpan di browser ini. Harus dibersihkan saat keluar atau ganti akun,
// kalau tidak, data akun sebelumnya tercampur ke akun berikutnya.
// ---------- Avatar profil ----------
const AVATAR_DI_AKUN = false; // ubah ke true setelah kolom "avatar" ditambahkan di tabel profiles (lihat catatan)
const AVATAR_PRESET = [
  { id: 'a1', bg: '#dbeafe', kulit: '#f1c9a5', rambut: 'pendek', warnaRambut: '#1f2937', baju: '#2563eb' },
  { id: 'a2', bg: '#fde68a', kulit: '#c68c63', rambut: 'keriting', warnaRambut: '#111827', baju: '#0f172a', aksesori: 'kacamata' },
  { id: 'a3', bg: '#fbcfe8', kulit: '#f1c9a5', rambut: 'bob', warnaRambut: '#3b2a24', baju: '#be185d', aksesori: 'headphone' },
  { id: 'a4', bg: '#bbf7d0', kulit: '#8d5a3c', rambut: 'pendek', warnaRambut: '#111827', baju: '#0f766e', aksesori: 'topi' },
  { id: 'a5', bg: '#e9d5ff', kulit: '#f1c9a5', rambut: 'hijab', warnaRambut: '#7c3aed', baju: '#4c1d95' },
  { id: 'a6', bg: '#fed7aa', kulit: '#d9a074', rambut: 'cepol', warnaRambut: '#1f2937', baju: '#9a3412', aksesori: 'kacamata' },
  { id: 'a7', bg: '#c7d2fe', kulit: '#e6b894', rambut: 'beanie', warnaRambut: '#1e293b', baju: '#475569' },
  { id: 'a8', bg: '#99f6e4', kulit: '#8d5a3c', rambut: 'hijab', warnaRambut: '#115e59', baju: '#134e4a', aksesori: 'kacamata' }
];
function svgAvatar(a) {
  const k = a.kulit, r = a.warnaRambut, h = a.rambut;
  let belakang = '', depan = '';
  if (h === 'keriting') belakang = `<circle cx="50" cy="38" r="25" fill="${r}"/>`;
  if (h === 'bob') belakang = `<path d="M30 48c-2-20 6-32 20-32s22 12 20 32c0 10-2 18-4 24H34c-2-6-4-14-4-24z" fill="${r}"/>`;
  if (h === 'cepol') belakang = `<circle cx="50" cy="17" r="8" fill="${r}"/>`;
  if (h === 'hijab') belakang = `<path d="M24 54c-2-26 10-38 26-38s28 12 26 38c0 12-4 20-8 26H32c-4-6-8-14-8-26z" fill="${r}"/>`;
  if (h === 'pendek' || h === 'cepol') depan = `<path d="M33 44c-1-16 8-25 17-25s18 9 17 25c-3-7-8-11-17-11s-14 4-17 11z" fill="${r}"/>`;
  if (h === 'keriting') depan = `<path d="M33 42c0-12 7-18 17-18s17 6 17 18c-4-6-9-9-17-9s-13 3-17 9z" fill="${r}"/>`;
  if (h === 'bob') depan = `<path d="M33 42c4-8 10-11 17-11s13 3 17 11c-6-3-11-5-17-5s-11 2-17 5z" fill="${r}"/>`;
  if (h === 'beanie') depan = `<path d="M33 44c0-4 1-6 3-8h28c2 2 3 4 3 8-4-3-9-4-17-4s-13 1-17 4z" fill="#3b2a24"/><path d="M33 38c0-14 8-21 17-21s17 7 17 21z" fill="${r}"/><rect x="31" y="35" width="38" height="7" rx="3.5" fill="#f8fafc"/>`;
  const wajah = h === 'hijab'
    ? `<ellipse cx="50" cy="49" rx="14" ry="16" fill="${k}"/>`
    : `<rect x="44" y="60" width="12" height="14" rx="5" fill="${k}"/><ellipse cx="50" cy="46" rx="17" ry="19" fill="${k}"/>`;
  const mata = `<circle cx="43.5" cy="48" r="1.9" fill="#1f2937"/><circle cx="56.5" cy="48" r="1.9" fill="#1f2937"/><path d="M45 56.5q5 4 10 0" fill="none" stroke="#1f2937" stroke-width="1.8" stroke-linecap="round"/>`;
  let aks = '';
  if (a.aksesori === 'kacamata') aks = `<g fill="none" stroke="#1f2937" stroke-width="1.8"><circle cx="43.5" cy="48" r="6.5"/><circle cx="56.5" cy="48" r="6.5"/><path d="M50 48h0"/></g>`;
  if (a.aksesori === 'headphone') aks = `<path d="M31 46c0-18 8-26 19-26s19 8 19 26" fill="none" stroke="#1f2937" stroke-width="4" stroke-linecap="round"/><rect x="27" y="43" width="7" height="14" rx="3.5" fill="#1f2937"/><rect x="66" y="43" width="7" height="14" rx="3.5" fill="#1f2937"/>`;
  if (a.aksesori === 'topi') aks = `<path d="M32 40c0-13 8-20 18-20s18 7 18 20z" fill="#1f2937"/><path d="M30 40h40c0 2-3 3-6 3H36c-3 0-6-1-6-3z" fill="#334155"/>`;
  const baju = h === 'hijab'
    ? `<path d="M10 100c0-24 18-30 40-30s40 6 40 30z" fill="${a.baju}"/><path d="M22 100c0-14 10-22 28-22s28 8 28 22z" fill="${r}"/>`
    : `<path d="M10 100c0-24 18-30 40-30s40 6 40 30z" fill="${a.baju}"/>`;
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect width="100" height="100" fill="${a.bg}"/>${belakang}${baju}${wajah}${mata}${depan}${aks}</svg>`;
}

function avatarTersimpan() {
  try {
    const a = JSON.parse(localStorage.getItem('utbk_avatar'));
    if (a && a.tipe === 'preset' && AVATAR_PRESET.some((x) => x.id === a.id)) return a;
    if (a && a.tipe === 'foto' && /^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(a.data || '')) return a;
  } catch (e) {}
  return null;
}
function avatarIsi(nama) {
  const a = avatarTersimpan();
  if (a && a.tipe === 'preset') return svgAvatar(AVATAR_PRESET.find((x) => x.id === a.id));
  if (a && a.tipe === 'foto') return `<img src="${a.data}" alt="">`;
  return esc((nama || '?').charAt(0).toUpperCase());
}
async function simpanAvatar(a) {
  // Saat sudah masuk, "tanpa avatar" disimpan sebagai penanda supaya ikut tersinkron ke akun (kalau dihapus saja, avatar lama dari akun muncul lagi)
  try { if (a) localStorage.setItem('utbk_avatar', JSON.stringify(a)); else if (AkunApp.sesi()) localStorage.setItem('utbk_avatar', JSON.stringify({ tipe: 'kosong' })); else localStorage.removeItem('utbk_avatar'); }
  catch (e) { return false; }
  const prev = $('pf-av-prev');
  if (prev) prev.innerHTML = avatarIsi($('pf-nama') ? $('pf-nama').value.trim() : '');
  document.querySelectorAll('.pilih-av').forEach((b) => b.classList.toggle('aktif', !!a && a.tipe === 'preset' && b.dataset.av === a.id));
  renderSalam();
  if (AVATAR_DI_AKUN && AkunApp.sesi()) { try { await pushProfil(); } catch (e) {} }
  if (AkunApp.sesi()) sinkron().catch(() => {}); // simpan ke akun sekarang, jangan menunggu logout
  return true;
}
function pilihanAvatarHTML() {
  const a = avatarTersimpan();
  return `<p class="label">Foto profil</p>
    <div class="av-baris"><div class="avatar" id="pf-av-prev">${avatarIsi((ProfilApp.ambil() || {}).nama)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-kecil" type="button" data-av-galeri="1">Pilih dari galeri</button>
        <button class="btn btn-secondary btn-kecil" type="button" data-av-hapus="1">Pakai inisial</button>
      </div></div>
    <div class="pilih-avatar">${AVATAR_PRESET.map((x) => `<button type="button" class="pilih-av${a && a.tipe === 'preset' && a.id === x.id ? ' aktif' : ''}" data-av="${x.id}" aria-label="Avatar ${x.id.slice(1)}">${svgAvatar(x)}</button>`).join('')}</div>
    <input type="file" id="pf-foto" accept="image/*" hidden>
    <p class="pesan" id="pesan-avatar"></p>`;
}
// Foto dari galeri dipotong persegi dan dikecilkan ke 256 px supaya ringan disimpan
function ubahFotoJadiAvatar(file) {
  return new Promise((ok, gagal) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const sisi = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas');
      c.width = c.height = 256;
      c.getContext('2d').drawImage(img, (img.naturalWidth - sisi) / 2, (img.naturalHeight - sisi) / 2, sisi, sisi, 0, 0, 256, 256);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); gagal(new Error('Format foto tidak didukung. Coba JPG atau PNG.')); };
    img.src = url;
  });
}

const KUNCI_DATA_AKUN = [...Object.keys(SYNC), ...Object.keys(SYNC_OPSIONAL), 'utbk_profil', 'utbk_avatar', 'utbk_sesi_dimigrasi', 'utbk_onboarding_lokal', 'utbk_sesi_aktif'];
function bersihkanDataAkunLokal() {
  KUNCI_DATA_AKUN.concat('utbk_pemilik').forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} });
  terakhirDikirim = {};
  DETIK_PER_SOAL = PengaturanApp.ambil().waktuPerSoal;
}
let terakhirDikirim = {}; // isi terakhir yang sudah dikirim, supaya tidak mengirim ulang yang sama
const AkunApp = {
  KEY: 'utbk_sesi',
  sesi() { try { return JSON.parse(localStorage.getItem(this.KEY)) || null; } catch (e) { return null; } },
  simpan(s) { try { localStorage.setItem(this.KEY, JSON.stringify(s)); } catch (e) {} },
  hapus() { try { localStorage.removeItem(this.KEY); } catch (e) {} }
};
function simpanSesiDariRespon(j, email) {
  AkunApp.simpan({
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (j.expires_in || 3600) * 1000,
    user_id: j.user.id,
    email
  });
}
async function authReq(path, body, token) {
  const headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(SB_URL + '/auth/v1/' + path, { method: 'POST', headers, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.msg || j.error_description || j.message || 'Permintaan gagal');
  return j;
}
// Token yang masih berlaku; diperbarui otomatis kalau hampir habis
async function tokenAktif() {
  const s = AkunApp.sesi();
  if (!s) return null;
  if (Date.now() < s.expires_at - 60000) return s.access_token;
  const j = await authReq('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
  simpanSesiDariRespon(j, s.email);
  return j.access_token;
}
async function rest(path, opts = {}) {
  const token = await tokenAktif();
  const headers = { apikey: SB_KEY, 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  if (opts.prefer) headers.Prefer = opts.prefer;
  if (opts.range) headers.Range = opts.range;
  if (opts.rangeUnit) headers['Range-Unit'] = opts.rangeUnit;
  const r = await fetch(SB_URL + '/rest/v1/' + path, {
    method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const t = await r.text();
  if (!r.ok) {
    let msg = t;
    try { msg = JSON.parse(t).message || t; } catch (e) {}
    throw new Error(msg);
  }
  return t ? JSON.parse(t) : null;
}
async function restSemua(path, ukuran = 1000) {
  const hasil = [];
  for (let mulai = 0; ; mulai += ukuran) {
    const halaman = await rest(path, { range: `${mulai}-${mulai + ukuran - 1}`, rangeUnit: 'items' });
    if (Array.isArray(halaman)) hasil.push(...halaman);
    if (!Array.isArray(halaman) || halaman.length < ukuran) break;
  }
  return hasil;
}
// Ambil profil dari akun dan simpan di perangkat ini. Mengembalikan false kalau belum ada di akun.
async function pullProfil() {
  const uid = AkunApp.sesi().user_id;
  const rows = await rest(`profiles?id=eq.${uid}&select=*`);
  if (!rows || !rows.length) return false;
  const r = rows[0];
  ProfilApp.simpan({
    nama: r.nama || '', tanggalLahir: r.tanggal_lahir || '', statusPendidikan: r.status_pendidikan || '',
    sekolah: r.sekolah || '', jurusan: r.jurusan || '', perguruanTinggiNpsn: r.perguruan_tinggi_npsn || '',
    programStudiId: r.program_studi_id == null ? '' : String(r.program_studi_id), target: r.target || '', kota: r.kota || '',
    tanggalUjian: r.tanggal_ujian || '', username: r.username || '', deskripsi: r.deskripsi || '',
    publik: !!r.publik, tampilkanStatistik: !!r.tampilkan_statistik
  });
  if (AVATAR_DI_AKUN && r.avatar) { try { localStorage.setItem('utbk_avatar', r.avatar); } catch (e) {} }
  return true;
}
// Kirim profil ke akun
async function pushProfil() {
  const s = AkunApp.sesi();
  const p = ProfilApp.ambil();
  if (!s || !p) return;
  await rest('profiles?on_conflict=id', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    body: {
      id: s.user_id, username: p.username || null, nama: p.nama,
      tanggal_lahir: p.tanggalLahir || null, status_pendidikan: p.statusPendidikan || null,
      sekolah: p.sekolah || null, jurusan: p.jurusan || null,
      perguruan_tinggi_npsn: p.perguruanTinggiNpsn || null,
      program_studi_id: p.programStudiId ? Number(p.programStudiId) : null,
      target: p.target || null,
      kota: p.kota || null, tanggal_ujian: p.tanggalUjian || null, deskripsi: p.deskripsi || null,
      publik: !!p.publik, tampilkan_statistik: !!p.tampilkanStatistik,
      ...(AVATAR_DI_AKUN ? { avatar: localStorage.getItem('utbk_avatar') } : {}),
      diperbarui_pada: new Date().toISOString()
    }
  });
}
// Ambil data (statistik, bank soal, dll) dari akun
async function pullData() {
  const s = AkunApp.sesi();
  const rows = await rest(`data_pengguna?user_id=eq.${s.user_id}&select=kunci,nilai`);
  const balik = Object.fromEntries(Object.entries({ ...SYNC, ...SYNC_OPSIONAL }).map(([lokal, kunci]) => [kunci, lokal]));
  (rows || []).forEach((r) => {
    const lokal = balik[r.kunci];
    if (!lokal) return;
    const raw = JSON.stringify(r.nilai);
    localStorage.setItem(lokal, raw);
    terakhirDikirim[lokal] = raw;
  });
  migrasiPresisiSkor();
  await sinkronInti();
  await sinkronOpsional();
}
// Kirim hanya data yang berubah sejak terakhir dikirim
async function sinkronInti() {
  const s = AkunApp.sesi();
  if (!s) return;
  const rows = [];
  const kirim = [];
  Object.entries(SYNC).forEach(([lokal, kunci]) => {
    const raw = localStorage.getItem(lokal);
    if (raw === null || raw === terakhirDikirim[lokal]) return;
    try {
      rows.push({ user_id: s.user_id, kunci, nilai: JSON.parse(raw), diperbarui_pada: new Date().toISOString() });
      kirim.push([lokal, raw]);
    } catch (e) {}
  });
  if (!rows.length) return;
  await rest('data_pengguna?on_conflict=user_id,kunci', {
    method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal', body: rows
  });
  kirim.forEach(([lokal, raw]) => (terakhirDikirim[lokal] = raw));
}
const opsionalGagal = new Set();
async function sinkronOpsional() {
  const s = AkunApp.sesi();
  if (!s) return;
  // Tiap data opsional dikirim sendiri-sendiri, supaya kalau satu ditolak server yang lain tetap tersinkron
  for (const [lokal, kunci] of Object.entries(SYNC_OPSIONAL)) {
    if (opsionalGagal.has(lokal)) continue;
    const raw = localStorage.getItem(lokal);
    if (raw === null || raw === terakhirDikirim[lokal]) continue;
    try {
      await rest('data_pengguna?on_conflict=user_id,kunci', {
        method: 'POST', prefer: 'resolution=merge-duplicates,return=minimal',
        body: [{ user_id: s.user_id, kunci, nilai: JSON.parse(raw), diperbarui_pada: new Date().toISOString() }]
      });
      terakhirDikirim[lokal] = raw;
    } catch (e) {
      opsionalGagal.add(lokal);
      console.warn(kunci + ' tidak ikut tersinkron ke akun (tetap tersimpan di perangkat ini):', e);
    }
  }
}
async function sinkron() {
  try { await sinkronInti(); }
  finally { await sinkronOpsional(); }
}
// Dipanggil setelah masuk atau saat aplikasi dibuka dalam keadaan sudah masuk
async function mulaiSesi() {
  if (!AkunApp.sesi()) return;
    $('nav-laporan-admin').hidden = false;
  if (window.obMemuat) window.obMemuat(); // tahan dashboard sampai status onboarding jelas
  // Kalau data di browser ini milik akun lain, bersihkan dulu sebelum mengambil data akun yang baru masuk
  const uid = AkunApp.sesi().user_id;
  const pemilik = localStorage.getItem('utbk_pemilik');
  if (pemilik && pemilik !== uid) bersihkanDataAkunLokal();
  try { localStorage.setItem('utbk_pemilik', uid); } catch (e) {}
  try {
  const a = await rest(`admin_users?user_id=eq.${uid}&select=user_id`);
  ADMIN = !!(a && a.length);
} catch (e) {
  ADMIN = false;
}

tampilkanPanelAdmin();
  try {
    await pullData();
    const adaProfil = await pullProfil();
    if (!adaProfil && ProfilApp.ambil()) await pushProfil();
    await sinkron();
  } catch (e) {
    console.warn('Sinkronisasi gagal:', e);
  }

// Admin tidak memuat seluruh bank saat login. Soal terbaru baru diambil
// setelah admin menentukan jumlah yang ingin ditampilkan.
if (!ADMIN) await segarkanSoalBawaan(true);
  renderSemuaBank();
  renderBeranda();
  renderSalam();
  if (window.cekOnboarding) await window.cekOnboarding(); // pengguna baru diarahkan ke onboarding
}

// Pengaturan aplikasi (disimpan di localStorage browser)
const PengaturanApp = {
  KEY: 'utbk_pengaturan',
  ambil() {
    try { return { waktuPerSoal: 120, ...(JSON.parse(localStorage.getItem(this.KEY)) || {}) }; }
    catch (e) { return { waktuPerSoal: 120 }; }
  },
  simpan(p) {
    try { localStorage.setItem(this.KEY, JSON.stringify(p)); } catch (e) {}
  }
};
// Profil pengguna (disimpan di localStorage browser)
const ProfilApp = {
  KEY: 'utbk_profil',
  ambil() {
    try { return JSON.parse(localStorage.getItem(this.KEY)) || null; }
    catch (e) { return null; }
  },
  simpan(p) {
    try { localStorage.setItem(this.KEY, JSON.stringify(p)); return true; }
    catch (e) { return false; }
  }
};
let DETIK_PER_SOAL = PengaturanApp.ambil().waktuPerSoal; // batas waktu Mode Ngebut per soal
// Jumlah soal yang dipilih di halaman atur latihan ('semua' = semua soal yang cocok)
function jumlahDipilih(n) {
  const pilihJumlah = $('pilih-jumlah');
  const nilaiJumlah = pilihJumlah ? pilihJumlah.value : '5';
  if (nilaiJumlah === 'semua') return n;
  const j = Number(nilaiJumlah) || 5;
  return Math.min(n, j);
}
const HURUF = ['A', 'B', 'C', 'D', 'E'];
// Nilai internal tetap PK/PM (agar data lama dan data akun tidak rusak); hanya tampilannya memakai nama lengkap
const NAMA_MAPEL = { PK: 'Pengetahuan Kuantitatif', PM: 'Penalaran Matematika' };
const namaMapel = (v) => NAMA_MAPEL[v] || v;
// Soal "pilih semua yang benar": jawaban berupa array indeks, contoh [0, 2]
// Tiga tipe soal: 'pg' (satu jawaban), 'kompleks' (centang semua yang benar, jawaban array), 'isian' (bilangan cacah)
const tipeSoal = (s) => (s.tipe === 'isian' ? 'isian' : Array.isArray(s.jawaban) ? 'kompleks' : 'pg');
const adaIsian = (s) => tipeSoal(s) === 'isian';
const adaGanda = (s) => tipeSoal(s) === 'kompleks';
const kunciHuruf = (s) => (adaIsian(s) ? String(s.jawaban) : adaGanda(s) ? s.jawaban.map((k) => HURUF[k]).join(', ') : HURUF[s.jawaban]);
// Kunci dari sumber lama/Supabase kadang tersimpan sebagai string (mis. "2"),
// sedangkan indeks pilihan dari antarmuka berupa number. Samakan tipenya sebelum dibandingkan.
const indeksAngka = (v) => v !== null && v !== undefined && String(v).trim() !== '' && Number.isInteger(Number(v)) ? Number(v) : NaN;
const kunciOpsi = (s, k) => (adaIsian(s) ? false : adaGanda(s)
  ? Array.isArray(s.jawaban) && s.jawaban.some((x) => indeksAngka(x) === k)
  : indeksAngka(s.jawaban) === k);
const dipilih = (s, j, k) => (adaIsian(s) ? false : adaGanda(s)
  ? Array.isArray(j) && j.some((x) => indeksAngka(x) === k)
  : indeksAngka(j) === k);
const skorJawaban = (s, j) => {
  if (j === null || j === undefined) return 0;
  if (adaIsian(s)) return Number(j) === Number(s.jawaban) ? 1 : 0;
  if (!adaGanda(s)) return indeksAngka(j) === indeksAngka(s.jawaban) ? 1 : 0;
  if (!Array.isArray(j) || !Array.isArray(s.jawaban) || !s.jawaban.length) return 0;
  const pilihan = j.map(indeksAngka);
  const kunci = s.jawaban.map(indeksAngka).filter(Number.isInteger);
  if (pilihan.some((k) => !Number.isInteger(k) || !kunci.includes(k))) return 0;
  return Math.min(1, new Set(pilihan).size / kunci.length);
};
const jawabBenar = (s, j) => skorJawaban(s, j) === 1;
const bulatSkor = (v) => Math.round((Number(v) || 0) * 1000) / 1000;
const tambahSkor = (a, b) => bulatSkor((Number(a) || 0) + (Number(b) || 0));
const angkaSkor = (v) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(bulatSkor(v));
function migrasiPresisiSkor() {
  const normStat = (d) => { if (!d || typeof d !== 'object') return d; if ('benar' in d) d.benar = bulatSkor(d.benar); ['mapel','topik'].forEach((k) => { if (d[k] && typeof d[k] === 'object') Object.values(d[k]).forEach((x) => { if (x && typeof x === 'object' && 'benar' in x) x.benar = bulatSkor(x.benar); }); }); return d; };
  const normList = (list) => { if (!Array.isArray(list)) return list; list.forEach((r) => { if (r && r.sc !== undefined) r.sc = bulatSkor(r.sc); }); return list; };
  try { const d = JSON.parse(localStorage.getItem('utbk_testing_stats') || 'null'); if (d) localStorage.setItem('utbk_testing_stats', JSON.stringify(normStat(d))); } catch (e) {}
  try { const d = JSON.parse(localStorage.getItem('utbk_riwayat') || 'null'); if (Array.isArray(d)) localStorage.setItem('utbk_riwayat', JSON.stringify(normList(d))); } catch (e) {}
  try { const d = JSON.parse(localStorage.getItem('utbk_riwayat_sesi') || 'null'); if (Array.isArray(d)) { d.forEach((x) => { if (!x || typeof x !== 'object') return; if (x.b !== undefined) x.b = bulatSkor(x.b); if (Array.isArray(x.item)) normList(x.item); }); localStorage.setItem('utbk_riwayat_sesi', JSON.stringify(d)); } } catch (e) {}
}
migrasiPresisiSkor();
const teksJawabanmu = (s, j) => (j === null || j === undefined || (Array.isArray(j) && !j.length) ? 'Tidak dijawab'
  : adaIsian(s) ? String(j) : Array.isArray(j) ? j.map((k) => HURUF[k]).join(', ') : HURUF[j]);
// Tampilan pilihan (atau kotak jawaban untuk soal isian) yang dipakai di review, riwayat, dan bank soal.
// j = jawaban pengguna; kalau tidak diberikan (undefined) hanya kunci yang ditandai.
function opsiReviewHTML(s, j) {
  if (adaIsian(s)) {
    if (j === undefined) return `<div class="isian-review"><div class="kunci"><span class="muted">Kunci jawaban (bilangan cacah)</span><strong>${esc(s.jawaban)}</strong></div></div>`;
    const kosong = j === null;
    return `<div class="isian-review">
      <div class="jawab ${kosong ? '' : jawabBenar(s, j) ? 'benar' : 'salah'}"><span class="muted">Jawaban Anda</span><strong>${kosong ? 'Tidak dijawab' : esc(j)}</strong></div>
      <div class="kunci"><span class="muted">Kunci jawaban</span><strong>${esc(s.jawaban)}</strong></div></div>`;
  }
  return s.opsi.map((o, x) => {
    let kelas = 'opsi';
    if (kunciOpsi(s, x)) kelas += ' benar';
    else if (dipilih(s, j, x)) kelas += ' salah';
    return `<div class="${kelas}">${adaGanda(s) ? '<span class="cek"></span>' : ''}<span class="huruf">${HURUF[x]}</span>${isiOpsi(o)}</div>`;
  }).join('');
}
const $ = (id) => document.getElementById(id);
let sesi = null;
const KUNCI_SESI_AKTIF = 'utbk_sesi_aktif';

// Simpan snapshot sesi agar refresh/penutupan tab tidak menghapus progres pengerjaan.
function simpanSesiAktif() {
  if (!AkunApp.sesi() || !sesi || !sesi.aktif) return;
  const data = {
    mode: sesi.mode, soal: sesi.soal, sumberSoal: sesi.sumberSoal,
    aktif: true, i: sesi.i, mulai: sesi.mulai, statAwal: sesi.statAwal,
    jawab: sesi.jawab, kunci: sesi.kunci, sisa: sesi.sisa,
    disimpanPada: Date.now()
  };
  try { localStorage.setItem(KUNCI_SESI_AKTIF, JSON.stringify(data)); }
  catch (e) { console.warn('Progres sesi belum dapat disimpan di perangkat:', e); }
}
function hapusSesiAktif() {
  try { localStorage.removeItem(KUNCI_SESI_AKTIF); } catch (e) {}
}
function jalankanTimerSesi() {
  if (!sesi || sesi.mode !== 'tryout') return;
  const tik = () => {
    $('timer').innerHTML = `<svg class="timer-clock" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="13" r="8.5"></circle><path d="M9 2.5h6M12 4.5V2.5"></path><path class="timer-clock-minute" d="M12 13V8"></path><path class="timer-clock-hand" d="M12 13V7"></path><circle class="timer-clock-pin" cx="12" cy="13" r="1"></circle></svg><span class="timer-value">${format(sesi.sisa)}</span>`;
    const pw = PengaturanApp.ambil().peringatanWaktu !== false;
    $('timer').classList.toggle('habis', pw && sesi.sisa <= 30);
    $('timer').classList.toggle('hampir', pw && sesi.sisa > 30 && sesi.sisa <= 120);
    if (pw && sesi.sisa === 30) peringatanWaktu30();
  };
  tik();
  sesi.timer = setInterval(() => {
    if (!sesi || !sesi.aktif) return;
    sesi.sisa = Math.max(0, sesi.sisa - 1);
    tik();
    if (sesi.sisa <= 0) selesai();
    else if (sesi.sisa % 5 === 0) simpanSesiAktif();
  }, 1000);
}
function pulihkanSesiAktif() {
  let data;
  try { data = JSON.parse(localStorage.getItem(KUNCI_SESI_AKTIF) || 'null'); } catch (e) {}
  if (!data || !data.aktif || !Array.isArray(data.soal) || !data.soal.length ||
      !Array.isArray(data.jawab) || !Array.isArray(data.kunci) ||
      data.jawab.length !== data.soal.length || data.kunci.length !== data.soal.length) {
    hapusSesiAktif();
    return false;
  }
  const sekarang = Date.now();
  const sisa = Number(data.sisa);
  sesi = {
    ...data,
    i: Math.min(Math.max(Number(data.i) || 0, 0), data.soal.length - 1),
    sisa: data.mode === 'tryout'
      ? Math.max(0, (Number.isFinite(sisa) ? sisa : data.soal.length * DETIK_PER_SOAL) -
          Math.floor(Math.max(0, sekarang - (Number(data.disimpanPada) || sekarang)) / 1000))
      : sisa,
    timer: null, aktif: true
  };
  $('timer').hidden = sesi.mode !== 'tryout';
  tampil('kuis');
  $('ex-detail').open = window.innerWidth >= 900;
  renderSoal();
  if (sesi.mode === 'tryout') {
    if (sesi.sisa <= 0) selesai();
    else jalankanTimerSesi();
  }
  return true;
}
let editId = null;           // id soal bank yang sedang diedit (null = soal baru)
let filterAktif = 'semua';   // filter daftar bank: 'semua' | 'none' | id folder
let editorAktif = null;      // editor (area) yang terakhir dipakai
let rentangTersimpan = null; // posisi kursor terakhir di editor, untuk sisip gambar
let gambarTerpilih = null;   // gambar di editor yang sedang diatur posisinya
let barTerpilih = null;      // bar pengatur gambar yang sedang tampil

// Soal untuk latihan sesuai sumber yang dipilih di menu
function sumberSoal() {
  const v = nilai('sumber');
  const custom = BankSoal.ambil();
  if (v === 'bawaan') return SOAL;
  if (v === 'bank') return custom;
  if (v === 'g:none') return custom.filter((s) => !s.folderId);
  if (v.startsWith('f:')) { const id = v.slice(2); return custom.filter((s) => s.folderId === id); }
  // Mode admin: BankSoal.ambil() mengembalikan SOAL itu sendiri, jadi gabungan harus unik agar soal tidak ganda
  return [...new Set([...SOAL, ...custom])];
}

// ---------- Helper ----------
const antreanMathJax = new Set();
let pendengarMathJax = false;
async function rumus(el) {
  if (!el) return;
  // Grafik berbasis data-ng-graph harus dirender setelah HTML konten masuk ke DOM.
  if (window.NalarineGraph && typeof window.NalarineGraph.renderAll === 'function') {
    window.NalarineGraph.renderAll(el);
  }
  if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
    try {
      // Tunggu MathJax selesai inisialisasi agar render tidak mendahului startup.
      if (window.MathJax.startup && window.MathJax.startup.promise) {
        await window.MathJax.startup.promise;
      }
      if (window.MathJax.typesetClear) window.MathJax.typesetClear([el]);
      await window.MathJax.typesetPromise([el]);
    } catch (err) {
      console.warn('MathJax gagal merender konten:', err);
    }
  } else {
    antreanMathJax.add(el);
    const skripMathJax = document.getElementById('MathJax-script');
    if (skripMathJax && !pendengarMathJax) {
      pendengarMathJax = true;
      skripMathJax.addEventListener('load', async () => {
        const target = [...antreanMathJax].filter((node) => node.isConnected);
        antreanMathJax.clear();
        if (target.length && window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
          try {
            if (window.MathJax.startup && window.MathJax.startup.promise) await window.MathJax.startup.promise;
            await window.MathJax.typesetPromise(target);
          } catch (err) {
            console.warn('MathJax gagal merender antrean:', err);
          }
        }
      }, { once: true });
    }
  }
  if (window.NalarineGraph) window.NalarineGraph.renderAll(el);
}
function acak(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function format(detik) {
  const m = Math.floor(detik / 60), s = detik % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
// Escape teks biasa (untuk nama topik dan nama folder)
function esc(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Pembersih HTML: hanya tag dan gaya aman yang dibolehkan (karena konten dibuat dari editor)
const TAG_BOLEH = ['B', 'STRONG', 'I', 'EM', 'U', 'S', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI', 'SPAN', 'IMG', 'SUB', 'SUP', 'FONT', 'H3', 'H4', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD'];
const TAG_BUANG = ['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'LINK', 'META', 'TEXTAREA', 'INPUT', 'BUTTON'];
const GAYA_BOLEH = ['float', 'margin', 'width', 'display', 'text-align', 'vertical-align', 'padding-left', 'font-size', 'font-weight', 'font-style', 'text-decoration', 'list-style-type'];
function bersihkan(node) {
  Array.from(node.childNodes).forEach((ch) => {
    if (ch.nodeType === 3) return;                  // teks biasa, biarkan
    if (ch.nodeType !== 1) { ch.remove(); return; } // komentar dll.
    const tag = ch.tagName;
    if (TAG_BUANG.includes(tag)) { ch.remove(); return; }
    bersihkan(ch);
    if (!TAG_BOLEH.includes(tag)) {                 // tag tidak dikenal: ambil isinya saja
      while (ch.firstChild) ch.parentNode.insertBefore(ch.firstChild, ch);
      ch.remove();
      return;
    }
    if (tag === 'IMG' && !(ch.getAttribute('src') || '').startsWith('data:image/')) { ch.remove(); return; }
    const gaya = ch.getAttribute('style');
    const size = ch.getAttribute('size');
    const src = ch.getAttribute('src'), alt = ch.getAttribute('alt');
    [...ch.attributes].forEach((a) => ch.removeAttribute(a.name));
    if (tag === 'IMG') { ch.setAttribute('src', src); ch.setAttribute('alt', alt || 'Gambar'); }
    if (tag === 'FONT' && size) ch.setAttribute('size', size);
    if (gaya) {
      const tmp = document.createElement('span');
      tmp.setAttribute('style', gaya);
      GAYA_BOLEH.forEach((p) => {
        const v = tmp.style.getPropertyValue(p);
        if (v) ch.style.setProperty(p, v);
      });
    }
  });
}
function sanitize(html) {
  const t = document.createElement('template');
  t.innerHTML = html;
  bersihkan(t.content);
  const div = document.createElement('div');
  div.appendChild(t.content.cloneNode(true));
  return div.innerHTML;
}
// Konten soal/pembahasan yang sudah dibersihkan, plus gambar lama dan grafik opsional.
function konten(html, gambarLama, alt, grafik, visual) {
  return `<div class="konten">${sanitize(html)}${gambarLama && gambarLama.startsWith('data:image/') ? `<img class="gambar-soal" src="${gambarLama}" alt="${esc(alt)}">` : ''}${visualHTML(visual, grafik)}</div>`;
}
function grafikHTML(g) {
  return window.NalarineGraph && g ? window.NalarineGraph.graphHTML(g) : '';
}
// Kompatibilitas visual lama dari generator soal tryout.
function visualHTML(v, grafik) {
  if (!v || typeof v !== 'object') return grafikHTML(grafik);
  if (v.jenis === 'tabel' && Array.isArray(v.kolom) && Array.isArray(v.baris)) {
    const head = v.kolom.map(x => '<th scope="col">' + esc(x) + '</th>').join('');
    const rows = v.baris.map(row => '<tr>' + (Array.isArray(row) ? row : []).map(x => '<td>' + esc(x) + '</td>').join('') + '</tr>').join('');
    return '<figure class="ng-visualisasi ng-visual-card ng-table-visual">' +
      (v.judul ? '<figcaption class="ng-visual-title">' + esc(v.judul) + '</figcaption>' : '') +
      '<div class="ng-table-wrap"><table class="ng-data-table"><thead><tr>' + head +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></figure>' + grafikHTML(grafik);
  }
  if (v.jenis === 'grafik_garis' && !grafik && window.NalarineGraph) {
    const categories = Array.isArray(v.sumbu_x) ? v.sumbu_x : [];
    const datasets = Array.isArray(v.seri) ? v.seri.map(x => ({ nama: x.nama || 'Data', nilai: Array.isArray(x.data) ? x.data : [] })) : [];
    const converted = { versi: 1, jenis: 'line', judul: v.judul || 'Grafik garis',
      sumbuX: v.label_sumbu_x || 'Kategori', sumbuY: v.sumbu_y || 'Nilai',
      kategori: categories, datasets };
    return grafikHTML(converted);
  }
  return grafikHTML(grafik);
}
// Isi satu pilihan jawaban (teks atau gambar)
function isiOpsi(html) {
  return `<div class="opsi-isi konten">${sanitize(html)}</div>`;
}
// ---------- Daftar paket Tryout dari Supabase ----------
async function renderDaftarTryout() {
  const wadah = $('daftar-paket-tryout');
  if (!wadah) return;
  wadah.innerHTML = '<div class="card tryout-empty"><span class="muted">Memuat paket tryout...</span></div>';
  if (!AkunApp.sesi()) {
    wadah.innerHTML = '<div class="card tryout-empty"><h3>Masuk untuk melihat paket</h3><p class="muted">Silakan masuk ke akun Pytago terlebih dahulu agar daftar paket tryout dapat dimuat.</p></div>';
    return;
  }
  try {
    const paket = await rest('tryout_paket?select=id,nama,deskripsi,kategori,durasi_menit,jumlah_soal,status,dibuat_pada&order=dibuat_pada.desc');
    if (!Array.isArray(paket) || !paket.length) {
      wadah.innerHTML = '<div class="card tryout-empty"><h3>Belum ada paket yang tersedia</h3><p class="muted">Paket tryout yang sudah diterbitkan akan muncul di sini.</p></div>';
      return;
    }
    wadah.innerHTML = paket.map((p) => {
      const status = p.status === 'published'
        ? '<span class="tryout-status terbit">Tersedia</span>'
        : (ADMIN ? '<span class="tryout-status draft">Draft · hanya admin</span>' : '');
      const kodeKategori = String(p.kategori || '').toUpperCase();
      const kategoriNama = ({ PK: 'Pengetahuan Kuantitatif', PM: 'Penalaran Matematika' })[kodeKategori] || String(p.kategori || 'Campuran');
      const kategori = esc(kategoriNama);
      // Kedua paket awal PM dan PK ditetapkan pada level sedang.
      const tingkat = 'sedang';
      const labelTingkat = tingkat === 'sulit' ? 'Sulit' : tingkat === 'mudah' ? 'Mudah' : 'Sedang';
      const namaPaket = String(p.nama || 'Tryout');
      const nomorPaket = namaPaket.match(/\d+/)?.[0] || '';
      const deskripsiPaket = 'Paket Tryout ' + kategoriNama + (nomorPaket ? ' ' + nomorPaket : '');
      return `<article class="card tryout-paket tingkat-${tingkat}" data-paket-id="${esc(p.id)}" data-paket-nama="${esc(p.nama || "Paket Tryout")}" data-paket-durasi="${Number(p.durasi_menit) || 20}" data-paket-jumlah="${Number(p.jumlah_soal) || 0}" role="group" aria-label="Paket ${esc(p.nama || "Tryout")}">
        <div class="tryout-paket-strip" aria-hidden="true"></div>
        <div class="tryout-paket-atas"><span class="tryout-paket-kategori">${kategori}</span><span class="tryout-difficulty ${tingkat}">${labelTingkat}</span>${status}</div>
        <h3>${esc(namaPaket)}</h3>
        <p class="tryout-paket-deskripsi">${esc(deskripsiPaket)}</p>
        <div class="tryout-paket-meta">
          <span><strong>${Number(p.jumlah_soal) || 0}</strong><small>Soal</small></span>
          <span><strong>${Number(p.durasi_menit) || 0}</strong><small>Menit</small></span>
        </div>
        <div class="tryout-paket-actions">
          ${ADMIN ? `<button type="button" class="btn btn-secondary btn-kecil" data-aksi-paket="kelola">Edit &amp; pratinjau soal</button>` : ''}
          <button type="button" class="btn btn-primary btn-kecil" data-aksi-paket="mulai">${ADMIN ? 'Uji paket' : 'Mulai tryout'}</button>
        </div>
      </article>`;
    }).join('');
    aktifkanInteraksiKartuTryout();
  } catch (e) {
    console.error('Gagal memuat paket tryout:', e);
    wadah.innerHTML = '<div class="card tryout-empty"><h3>Paket belum dapat dimuat</h3><p class="muted">Terjadi kendala saat mengambil daftar paket. Coba muat ulang halaman.</p></div>';
  }
}

async function bukaPengelolaSoalPaket(paketId, nama) {
  if (!ADMIN) return;
  paketSoalAktif = { id: String(paketId), nama: String(nama || 'Paket Tryout') };
  let el = $('pengelola-soal-paket');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pengelola-soal-paket';
    el.className = 'editor-soal-live';
    el.hidden = true;
    el.innerHTML = `
      <section class="editor-soal-live-panel pengelola-paket-panel" role="dialog" aria-modal="true" aria-labelledby="psp-judul">
        <header class="esl-head"><div><span class="esl-eyebrow">PENGELOLA TRYOUT</span><h2 id="psp-judul">Soal dalam paket</h2><p id="psp-meta" class="muted"></p></div><button type="button" class="btn btn-secondary btn-kecil" data-psp-tutup>Tutup</button></header>
        <div id="psp-list" class="psp-list" aria-live="polite"><p class="muted">Memuat soal...</p></div>
        <footer class="esl-actions"><button type="button" class="btn btn-secondary" data-psp-tutup>Tutup</button></footer>
      </section>`;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      if (e.target === el || e.target.closest('[data-psp-tutup]')) tutupPengelolaSoalPaket();
      const b = e.target.closest('[data-aksi-soal-paket]');
      if (!b) return;
      const row = daftarSoalPaketAktif.find(x => String(x.id) === b.dataset.id);
      if (!row) return;
      if (b.dataset.aksiSoalPaket === 'pratinjau') pratinjauSoalPaket(row);
      if (b.dataset.aksiSoalPaket === 'edit') bukaEditorSoalPaket(row);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !el.hidden) tutupPengelolaSoalPaket();
    });
  }
  $('psp-judul').textContent = paketSoalAktif.nama;
  $('psp-meta').textContent = 'Mengambil daftar soal dari paket ini…';
  $('psp-list').innerHTML = '<p class="muted">Memuat soal…</p>';
  el.hidden = false;
  document.body.classList.add('esl-terbuka');
  try {
    const rows = await rest('tryout_soal?select=id,paket_id,nomor_soal,kategori,tipe_soal,data&paket_id=eq.' + encodeURIComponent(paketSoalAktif.id) + '&order=nomor_soal.asc');
    if (!Array.isArray(rows)) throw new Error('Respons daftar soal tidak valid.');
    daftarSoalPaketAktif = rows;
    renderDaftarSoalPaket();
  } catch (err) {
    console.error('Gagal mengambil soal paket:', err);
    $('psp-meta').textContent = 'Daftar soal belum berhasil dimuat.';
    $('psp-list').innerHTML = '<div class="psp-error"><p>Terjadi kendala saat mengambil soal paket.</p><button type="button" class="btn btn-secondary btn-kecil" id="psp-retry">Coba lagi</button></div>';
    $('psp-retry').addEventListener('click', () => bukaPengelolaSoalPaket(paketSoalAktif.id, paketSoalAktif.nama));
  }
}
function normalisasiSoalPaket(row) {
  const raw = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
  const tipeMentah = String(raw.tipe || row.tipe_soal || 'pg').toLowerCase();
  return {
    ...raw, id: String(row.id),
    mataPelajaran: raw.mataPelajaran || row.kategori || 'PK',
    topik: raw.topik || (row.kategori === 'PM' ? 'Tryout PM' : 'Tryout PK'),
    tipe: ['isian','isian_bilangan_cacah'].includes(tipeMentah) ? 'isian' : (tipeMentah === 'pg_kompleks' ? 'kompleks' : tipeMentah)
  };
}
function renderDaftarSoalPaket() {
  const list = $('psp-list');
  if (!list) return;
  $('psp-meta').textContent = daftarSoalPaketAktif.length + ' soal · Perubahan disimpan langsung ke paket';
  if (!daftarSoalPaketAktif.length) {
    list.innerHTML = '<div class="tryout-empty"><h3>Belum ada soal</h3><p class="muted">Paket ini belum memiliki soal.</p></div>';
    return;
  }
  list.innerHTML = daftarSoalPaketAktif.map(row => {
    const s = normalisasiSoalPaket(row);
    return `<article class="psp-item">
      <div class="psp-item-info"><span class="psp-nomor">Soal ${Number(row.nomor_soal) || 0}</span><strong>${esc(namaMapel(s.mataPelajaran))} · ${esc(tipeSoal(s))}</strong><p>${esc(previewTeks(s.soal))}</p></div>
      <div class="psp-item-actions"><button type="button" class="btn btn-secondary btn-kecil" data-aksi-soal-paket="pratinjau" data-id="${esc(row.id)}">Pratinjau</button><button type="button" class="btn btn-primary btn-kecil" data-aksi-soal-paket="edit" data-id="${esc(row.id)}">Edit soal</button></div>
    </article>`;
  }).join('');
}
function tutupPengelolaSoalPaket() {
  const el = $('pengelola-soal-paket');
  if (el) el.hidden = true;
  document.body.classList.remove('esl-terbuka');
}
function pratinjauSoalPaket(row) {
  if (!ADMIN) return;
  const s = normalisasiSoalPaket(row);
  let el = $('pratinjau-soal-paket');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pratinjau-soal-paket';
    el.className = 'editor-soal-live';
    el.hidden = true;
    el.innerHTML = `
      <section class="editor-soal-live-panel" role="dialog" aria-modal="true" aria-labelledby="pspv-judul">
        <header class="esl-head"><div><span class="esl-eyebrow">PRATINJAU TRYOUT</span><h2 id="pspv-judul">Pratinjau soal</h2><p id="pspv-meta" class="muted"></p></div><button type="button" class="btn btn-secondary btn-kecil" data-pspv-tutup>Tutup</button></header>
        <div id="pspv-konten" class="pratinjau-soal-konten"></div>
        <footer class="esl-actions"><button type="button" class="btn btn-secondary" data-pspv-tutup>Kembali ke daftar</button><button type="button" class="btn btn-primary" id="pspv-edit">Edit soal</button></footer>
      </section>`;
    document.body.appendChild(el);
    el.addEventListener('click', e => {
      if (e.target === el || e.target.closest('[data-pspv-tutup]')) {
        el.hidden = true;
        document.body.classList.remove('esl-terbuka');
      }
    });
    $('pspv-edit').addEventListener('click', () => {
      const row = daftarSoalPaketAktif.find(x => String(x.id) === el.dataset.soalId);
      el.hidden = true;
      if (row) bukaEditorSoalPaket(row);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !el.hidden) {
        el.hidden = true;
        document.body.classList.remove('esl-terbuka');
      }
    });
  }
  el.dataset.soalId = String(row.id);
  $('pspv-meta').textContent = 'Soal ' + row.nomor_soal + ' · ' + namaMapel(s.mataPelajaran) + ' · ' + tipeSoal(s);
  const isian = adaIsian(s);
  $('pspv-konten').innerHTML = `
    <div class="rev-body">
      <div><p class="rev-sub">Pertanyaan</p><div class="teks-soal">${konten(s.soal, s.gambarSoal, 'Gambar soal', s.grafik, s.visual)}</div></div>
      <div><p class="rev-sub">${isian ? 'Kunci jawaban' : 'Pilihan jawaban'}</p>${isian ? '<div class="isian-review"><div class="kunci"><span class="muted">Kunci bilangan cacah</span><strong>' + esc(s.jawaban) + '</strong></div></div>' : '<div class="opsi-list">' + opsiReviewHTML(s, undefined) + '</div>'}<p class="rev-ket"><span>Jawaban benar: <b>${esc(kunciHuruf(s))}</b></span></p></div>
      <div class="feedback rev-pembahasan"><strong>Pembahasan</strong><div>${konten(s.pembahasan, s.gambarPembahasan, 'Gambar pembahasan')}</div></div>
    </div>`;
  el.hidden = false;
  document.body.classList.add('esl-terbuka');
  rumus(el);
}
function bukaEditorSoalPaket(row) {
  if (!ADMIN) return;
  soalPaketTarget = { row, soal: normalisasiSoalPaket(row) };
  soalLaporanTarget = null;
  soalEditorTarget = null;
  bukaEditorSoalLive();
}
function konfirmasiMulaiTryout(nama, menit, admin) {
  return new Promise((resolve) => {
    const lama = document.getElementById('modal-konfirmasi-tryout');
    if (lama) lama.remove();
    const modal = document.createElement('div');
    modal.id = 'modal-konfirmasi-tryout';
    modal.className = 'konfirmasi-tryout';
    modal.innerHTML = `
      <section class="konfirmasi-tryout-panel" role="dialog" aria-modal="true" aria-labelledby="kty-judul" aria-describedby="kty-deskripsi">
        <div class="kty-ikon" aria-hidden="true"><span>▶</span></div>
        <span class="kty-eyebrow">PERSIAPAN TRYOUT</span>
        <h2 id="kty-judul">Mulai tryout sekarang?</h2>
        <p class="kty-nama"></p>
        <div class="kty-info"><span>Durasi</span><strong>${menit} menit</strong></div>
        <p id="kty-deskripsi" class="kty-deskripsi">${admin ? 'Paket akan dibuka dalam mode simulasi admin.' : 'Pastikan kamu sudah siap. Waktu akan mulai dihitung setelah tryout dibuka.'}</p>
        <div class="kty-actions">
          <button type="button" class="btn btn-secondary" data-kty-batal>Belum</button>
          <button type="button" class="btn btn-primary" data-kty-mulai>Mulai tryout</button>
        </div>
      </section>`;
    modal.querySelector('.kty-nama').textContent = nama;
    document.body.appendChild(modal);
    document.body.classList.add('kty-terbuka');
    let selesai = false;
    const tutup = (hasil) => {
      if (selesai) return;
      selesai = true;
      document.removeEventListener('keydown', tombolKeyboard);
      modal.remove();
      document.body.classList.remove('kty-terbuka');
      resolve(hasil);
    };
    const tombolKeyboard = (e) => {
      if (e.key === 'Escape') tutup(false);
    };
    modal.querySelector('[data-kty-batal]').addEventListener('click', () => tutup(false));
    modal.querySelector('[data-kty-mulai]').addEventListener('click', () => tutup(true));
    modal.addEventListener('click', (e) => { if (e.target === modal) tutup(false); });
    document.addEventListener('keydown', tombolKeyboard);
    modal.querySelector('[data-kty-mulai]').focus();
  });
}

async function mulaiTryoutPaket(id, nama, durasi) {
  if (!AkunApp.sesi()) return alert('Silakan masuk terlebih dahulu untuk mengikuti Tryout.');
  const menit = Math.max(1, Number(durasi) || 20);
  if (!(await konfirmasiMulaiTryout(nama, menit, ADMIN))) return;
  try {
    const rows = await rest('tryout_soal?select=id,nomor_soal,kategori,tipe_soal,data&paket_id=eq.' + encodeURIComponent(id) + '&order=nomor_soal.asc');
    if (!Array.isArray(rows) || !rows.length) throw new Error('Soal dalam paket belum tersedia.');
    const soal = rows.map((r) => {
      // Kolom data lama tersimpan sebagai JSON string di sebagian paket, bukan object JSON langsung.
      const dataSoal = typeof r.data === 'string' ? JSON.parse(r.data) : (r.data || {});
      const tipeMentah = String(dataSoal.tipe || r.tipe_soal || 'pg').toLowerCase();
      const tipeNormal = ['isian', 'isian_bilangan_cacah'].includes(tipeMentah) ? 'isian' : (tipeMentah === 'pg_kompleks' ? 'kompleks' : tipeMentah);
      return {
        ...dataSoal,
        id: String(r.id),
        mataPelajaran: dataSoal.mataPelajaran || r.kategori || 'PK',
        topik: dataSoal.topik || (r.kategori === 'PM' ? 'Tryout PM' : 'Tryout PK'),
        tipe: tipeNormal,
        sumber: 'tryout-paket'
      };
    });
    if (sesi && sesi.aktif) {
      if (!confirm('Sesi sebelumnya masih aktif. Akhiri sesi tersebut dan mulai Tryout ini?')) return;
      clearInterval(sesi.timer);
      sesi.aktif = false;
    }
    sesi = {
      mode: 'tryout',
      soal,
      sumberSoal: soal.map(() => 'personal'),
      aktif: true,
      i: 0,
      mulai: Date.now(),
      timer: null,
      statAwal: JSON.parse(JSON.stringify(Penyimpanan.ambil())),
      jawab: soal.map(() => null),
      kunci: soal.map(() => false),
      sisa: menit * 60,
      sisaAwal: menit * 60,
      durasiMaks: menit * 60,
      paketTryoutId: id,
      paketTryoutNama: nama
    };
    simpanSesiAktif();
    $('timer').hidden = false;
    jalankanTimerSesi();
    tampil('kuis');
    $('ex-detail').open = window.innerWidth >= 900;
    renderSoal();
  } catch (err) {
    console.error('Gagal memulai paket Tryout:', err);
    alert('Paket Tryout belum dapat dimulai: ' + (err.message || 'Terjadi kesalahan.'));
  }
}
function aktifkanInteraksiKartuTryout() {
  const wadah = $('daftar-paket-tryout');
  if (!wadah || wadah.dataset.interaksiTryout === '1') return;
  wadah.dataset.interaksiTryout = '1';
  wadah.addEventListener('click', (e) => {
    const aksi = e.target.closest('[data-aksi-paket]');
    if (!aksi) return;
    e.preventDefault();
    e.stopPropagation();
    const kartu = aksi.closest('.tryout-paket[data-paket-id]');
    if (!kartu) return;
    if (aksi.dataset.aksiPaket === 'kelola') bukaPengelolaSoalPaket(kartu.dataset.paketId, kartu.dataset.paketNama || 'Paket Tryout');
    if (aksi.dataset.aksiPaket === 'mulai') mulaiTryoutPaket(kartu.dataset.paketId, kartu.dataset.paketNama || 'Paket Tryout', kartu.dataset.paketDurasi);
  });
}

function tampil(id) {
  terapkanAksesTamu();
  if (!AkunApp.sesi() && !['setup', 'tryout', 'kuis', 'hasil', 'review'].includes(id)) id = 'setup';
  const aktif = ({
    materi: 'materi',
    statistik: 'statistik',
    riwayatdetail: 'statistik',
    koleksi: 'koleksi',
    bank: 'bank',
    'laporan-admin': 'laporan-admin',
    pengaturan: 'pengaturan',
    setup: 'setup',
    tryout: 'tryout',
    kuis: 'setup',
    hasil: 'setup',
    review: 'setup',
    rekomendasi: 'rekomendasi',
    profil: 'profil',
    publik: 'profil'
  })[id] || 'menu';
  document.querySelectorAll('.halaman').forEach((h) => (h.hidden = h.id !== id));
  document.body.dataset.hal = id;
  if (id === 'tryout') renderDaftarTryout();
  const tombolProfil = $('btn-profil');
  if (tombolProfil) tombolProfil.hidden = id === 'kuis';
  if (id === 'menu') renderBeranda();
  if (id === 'koleksi') renderKoleksiSoal();
  if (id === 'setup') {
    if (!AkunApp.sesi()) {
      const latihan = document.querySelector('input[name="mode"][value="latihan"]');
      if (latihan) latihan.checked = true;
      const bawaan = document.querySelector('input[name="sumber"][value="bawaan"]');
      if (bawaan) bawaan.checked = true;
      renderPilihSumber();
    }
    if (!window._dariMateri) window._subAktif = null;
    window._dariMateri = false;
    terapkanDefaultSetup();
    syncBlokWaktu();
    hitungSoal();
  }
  if (AkunApp.sesi()) sinkron().catch(() => {});
  document.querySelectorAll('.nav-link').forEach((a) => a.classList.toggle('aktif', a.dataset.hal === aktif));
  window.scrollTo(0, 0);
}
const nilai = (name) => { const el = document.querySelector(`input[name="${name}"]:checked, select[name="${name}"]`); return el ? el.value : ''; };
const centang = (wadah) => [...document.querySelectorAll(`#${wadah} input:checked`)].map((i) => i.value);

// ---------- Hak akses pengguna tamu ----------
// Pengunjung tanpa sesi hanya dapat mengerjakan latihan dari bank soal bawaan.
function terapkanAksesTamu() {
  const tamu = !AkunApp.sesi();
  document.body.classList.toggle('mode-tamu', tamu);
  const nav = document.querySelector('.side-nav');
  if (nav) nav.hidden = tamu;
  const navBawah = document.querySelector('.bottomnav');
  if (navBawah) navBawah.hidden = tamu;
  const tryout = document.querySelector('input[name="mode"][value="tryout"]');
  if (tryout) {
    const label = tryout.closest('label');
    if (label) label.hidden = tamu;
    if (tamu) {
      const latihan = document.querySelector('input[name="mode"][value="latihan"]');
      if (latihan) latihan.checked = true;
    }
  }
  let notice = $('guest-notice');
  if (!notice) {
    notice = document.createElement('aside');
    notice.id = 'guest-notice';
    notice.className = 'guest-notice';
    notice.innerHTML = '<div><strong>Mode tamu</strong><p>Kamu bisa mencoba latihan dan melihat pembahasan. Progres, riwayat, statistik, serta fitur akun tersedia setelah masuk.</p></div><button type="button" class="btn btn-primary btn-kecil" id="guest-login">Masuk</button>';
    const setup = $('setup');
    if (setup) setup.insertBefore(notice, setup.firstChild);
    notice.querySelector('#guest-login').addEventListener('click', () => aksiAkun('google'));
  }
  notice.hidden = !tamu;
}

// ---------- Menu & filter ----------
// Pilihan sumber soal: semua, bawaan, bank saya, lalu tiap folder
function renderPilihSumber() {
  const tamu = !AkunApp.sesi();
  const cur = document.querySelector('input[name="sumber"]:checked')?.value || (tamu ? 'bawaan' : 'semua');
  const folders = tamu ? [] : BankFolder.ambil();
  const adaTanpa = !tamu && BankSoal.ambil().some((s) => !s.folderId);
  const dasar = tamu ? [['bawaan', 'Soal bawaan']] : [['semua', 'Semua soal'], ['bawaan', 'Soal bawaan'], ['bank', 'Bank saya']];
  const fol = folders.map((f) => ['f:' + f.id, f.nama]).concat(adaTanpa ? [['g:none', 'Belum dikelompokkan']] : []);
  const ada = (v) => dasar.some((o) => o[0] === v) || fol.some((o) => o[0] === v);
  const val = tamu ? 'bawaan' : (ada(cur) ? cur : 'semua');
  const radio = (v, t, lbl) => `<label class="chip"><input type="radio" name="sumber" value="${esc(v)}" ${v === val ? 'checked' : ''}><span>${esc(lbl || t)}</span></label>`;
  const ikFolder = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
  const ikPanah = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
  let html = `<div class="pilihan seg-r" role="radiogroup" aria-label="Sumber soal">${dasar.map(([v, t]) => radio(v, t)).join('')}</div>`;
  if (fol.length) {
    html += `<div class="fcombo" id="fcombo">
        <button type="button" class="fcombo-btn" id="fcombo-btn" aria-haspopup="listbox" aria-expanded="false">${ikFolder}<span class="fc-teks">Semua folder</span>${ikPanah}</button>
        <div class="fcombo-pop" id="fcombo-pop" hidden>
          <input class="input" type="search" id="fcombo-cari" placeholder="Cari nama folder..." autocomplete="off" aria-label="Cari folder">
          <ul class="fcombo-list" id="fcombo-list" role="listbox" aria-label="Folder">
            <li><button type="button" role="option" data-fv="bank">Semua folder</button></li>
            ${fol.map(([v, t]) => `<li><button type="button" role="option" data-fv="${esc(v)}" data-nama="${esc(t.toLowerCase())}">${esc(t)}</button></li>`).join('')}
          </ul>
          <p class="fcombo-nihil" id="fcombo-nihil" hidden>Tidak ada folder yang cocok.</p>
        </div>
      </div>
      <div class="flt-aktif" id="folder-aktif" hidden><span class="flt-tag">Folder aktif: <b></b><button type="button" id="folder-hapus" aria-label="Hapus filter folder">&times;</button></span></div>
      <div class="sr-only">${fol.map(([v, t]) => radio(v, t, 'Folder: ' + t)).join('')}</div>`;
  }
  $('pilih-sumber').innerHTML = html;
  buatTopik();
  sinkronFolderUI();
}
function pilihSumberNilai(v) {
  const r = document.querySelector(`input[name="sumber"][value="${CSS.escape(v)}"]`);
  if (!r) return;
  r.checked = true;
  r.dispatchEvent(new Event('change', { bubbles: true }));
}
function tutupFolderPop() {
  const pop = $('fcombo-pop'), b = $('fcombo-btn');
  if (pop) pop.hidden = true;
  if (b) b.setAttribute('aria-expanded', 'false');
}
// Menyamakan tampilan dropdown folder, penanda folder aktif, dan tombol reset dengan pilihan sebenarnya
function sinkronFolderUI() {
  const i = document.querySelector('input[name="sumber"]:checked');
  const v = i ? i.value : 'semua', folderAktif = /^(f|g):/.test(v);
  const btn = $('fcombo-btn');
  if (btn) {
    const nama = folderAktif && i && i.nextElementSibling ? i.nextElementSibling.textContent.replace(/^Folder: /, '') : '';
    btn.classList.toggle('aktif', folderAktif);
    btn.querySelector('.fc-teks').innerHTML = folderAktif ? esc(nama) : 'Semua folder';
    const bar = $('folder-aktif');
    bar.hidden = !folderAktif;
    if (folderAktif) bar.querySelector('b').textContent = nama;
    document.querySelectorAll('#fcombo-list button').forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.fv === v || (b.dataset.fv === 'bank' && !folderAktif && v === 'bank')));
    });
  }
  const wadah = $('flt-setup');
  if (!wadah) return;
  const m = document.querySelector('input[name="mapel"]:checked');
  const mv = m ? m.value : 'semua';
  const tag = [];
  if (/^(f|g):/.test(v)) tag.push(['Folder', i.nextElementSibling.textContent.replace(/^Folder: /, '')]);
  else if (v !== 'semua') tag.push(['Sumber', i && i.nextElementSibling ? i.nextElementSibling.textContent : v]);
  if (mv !== 'semua') tag.push(['Mata pelajaran', m.nextElementSibling.textContent]);
  wadah.hidden = !tag.length;
  wadah.innerHTML = tag.length ? `<span>Filter aktif:</span>${tag.map(([a, b]) => `<span class="flt-tag">${esc(a)}: ${esc(b)}</span>`).join('')}<button type="button" class="flt-reset" id="flt-reset-setup">Reset filter</button>` : '';
}
$('pilih-sumber').addEventListener('click', (e) => {
  const b = e.target.closest('#fcombo-btn'), o = e.target.closest('[data-fv]');
  if (b) {
    const pop = $('fcombo-pop'), buka = pop.hidden;
    pop.hidden = !buka;
    b.setAttribute('aria-expanded', String(buka));
    if (buka) { const c = $('fcombo-cari'); c.value = ''; filterFolderList(''); c.focus(); }
    return;
  }
  if (o) { pilihSumberNilai(o.dataset.fv); tutupFolderPop(); return; }
  if (e.target.closest('#folder-hapus')) pilihSumberNilai('bank');
});
function filterFolderList(q) {
  q = q.trim().toLowerCase();
  let ada = 0;
  document.querySelectorAll('#fcombo-list li').forEach((li) => {
    const b = li.querySelector('button'), ok = b.dataset.fv === 'bank' ? !q : (b.dataset.nama || '').includes(q);
    li.hidden = !ok; if (ok) ada++;
  });
  $('fcombo-nihil').hidden = ada > 0;
}
$('pilih-sumber').addEventListener('input', (e) => { if (e.target.id === 'fcombo-cari') filterFolderList(e.target.value); });
$('pilih-sumber').addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('fcombo-pop') && !$('fcombo-pop').hidden) { tutupFolderPop(); $('fcombo-btn').focus(); }
});
document.addEventListener('click', (e) => { if ($('fcombo-pop') && !$('fcombo-pop').hidden && !e.target.closest('#fcombo')) tutupFolderPop(); });
document.addEventListener('click', (e) => {
  if (!e.target.closest('#flt-reset-setup')) return;
  ['sumber', 'mapel'].forEach((nm) => { const r = document.querySelector(`input[name="${nm}"][value="semua"]`); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } });
});
// Subtopik satu soal (bisa lebih dari satu), dari subtopikId / subtopikIds
function idSub(s) { return [...new Set([s.subtopikId, ...(s.subtopikIds || [])].filter(Boolean))]; }
const topikDipilih = () => [...document.querySelectorAll('#pilih-topik input[data-tp]:checked')].map((i) => i.value);
const subDikecualikan = () => new Set([...document.querySelectorAll('#pilih-topik input[data-sub]:not(:checked)')].map((i) => i.dataset.sub));
function lolosSub(s, ex) { const ids = idSub(s); return !ex.size || !ids.length || ids.some((id) => !ex.has(id)); }
function labelSub(blok) {
  const t = blok.querySelector('[data-sb]');
  if (!t) return;
  const a = [...blok.querySelectorAll('input[data-sub]')], c = a.filter((i) => i.checked).length;
  t.textContent = c === a.length ? `${a.length} subtopik` : `${c} dari ${a.length} subtopik`;
}
function ringkasTopik() {
  const t = document.querySelectorAll('#pilih-topik input[data-tp]'), subs = [...document.querySelectorAll('#pilih-topik input[data-sub]')];
  const sebagian = subs.some((i) => !i.checked && i.closest('.tp-blok').querySelector('input[data-tp]').checked);
  return `${topikDipilih().length} dari ${t.length}` + (sebagian ? ` · ${subs.filter((i) => i.checked).length} dari ${subs.length} subtopik` : '');
}
// Daftar topik dibangun dari taksonomi (sama dengan Jelajahi Materi), bukan dari soal yang ada,
// supaya hierarki tetap tampil walau sumber soal masih kosong atau belum termuat.
function buatTopik() {
  const mapel = nilai('mapel');
  const soalPilih = sumberSoal().filter((s) => (mapel === 'semua' || s.mataPelajaran === mapel) && (modeAdmin || s.status !== 'draf'));
  const jTopik = {}, jSub = {};
  soalPilih.forEach((s) => {
    const n = namaTopikResmi(s);
    jTopik[n] = (jTopik[n] || 0) + 1;
    idSub(s).forEach((id) => { jSub[id] = (jSub[id] || 0) + 1; });
  });
  const dikenal = new Set(), grup = [];
  Object.keys(TAKSONOMI).forEach((k) => TAKSONOMI[k].rumpun.forEach((r) => {
    r.topik.forEach((tp) => dikenal.add(tp.nama));
    if (mapel !== 'semua' && k !== namaMapelTaksonomi(mapel)) return;
    const topik = r.topik.filter((tp) => !(r.sembunyiKosong && !jTopik[tp.nama]));
    if (topik.length) grup.push({ kunci: k + '|' + r.id, nama: r.nama, mapel: k, topik });
  }));
  const lain = Object.keys(jTopik).filter((n) => !dikenal.has(n)).sort((x, y) => x.localeCompare(y));
  // Topik di luar taksonomi hanya ditampilkan kepada admin untuk audit/pemetaan, bukan sebagai filter latihan pengguna.
  if (modeAdmin && lain.length) grup.push({ kunci: '_lain', nama: 'Belum dipetakan ke taksonomi', mapel: '', topik: lain.map((n) => ({ nama: n, sub: [] })) });
  const blok = (tp) => {
    const n = jTopik[tp.nama] || 0, subs = tp.sub || [];
    return `<div class="tp-blok${n ? '' : ' nol'}">
      <label class="chip pv-chip"><input type="checkbox" value="${esc(tp.nama)}" data-tp checked><span>${esc(tp.nama)}</span><em>${n} soal</em></label>
      ${subs.length ? `<button type="button" class="sb-toggle" data-sb aria-expanded="false">${subs.length} subtopik</button>
      <div class="sb-isi" hidden>${subs.map((sb) => `<label class="chip sb-chip${jSub[sb.id] ? '' : ' nol'}"><input type="checkbox" data-sub="${esc(sb.id)}" checked><span>${esc(sb.nama)}</span><em>${jSub[sb.id] || 0}</em></label>`).join('')}</div>` : ''}
    </div>`;
  };
  const html = grup.map((g) => {
    const totalSoal = g.topik.reduce((t, tp) => t + (jTopik[tp.nama] || 0), 0);
    const jmlSub = g.topik.reduce((t, tp) => t + (tp.sub || []).length, 0);
    const kodeMapel = g.mapel === 'Pengetahuan Kuantitatif' ? 'PK' : g.mapel === 'Penalaran Matematika' ? 'PM' : g.mapel;
    const labelMapel = document.documentElement.classList.contains('perangkat-android') ? kodeMapel : g.mapel;
    const tag = g.mapel ? `<span class="pv-tag">${esc(labelMapel)}</span>` : '';
    const bukaGrup = window._pvBuka && window._pvBuka.has(g.kunci);
    return `<div class="pv-grup${bukaGrup ? '' : ' tutup'}" data-kunci="${esc(g.kunci)}">
      <div class="pv-head">
        <button type="button" class="pv-judul" data-buka aria-expanded="${bukaGrup}"><span class="pv-panah">${bukaGrup ? '&#9662;' : '&#9656;'}</span><span class="pv-dot"></span>${esc(g.nama)}${tag}</button>
        <span class="pv-jml">${g.topik.length} topik${jmlSub ? ' · ' + jmlSub + ' subtopik' : ''} · ${totalSoal} soal</span>
        <span class="pv-aksi"><button type="button" class="tp-link" data-pv="pilih">Semua</button><button type="button" class="tp-link" data-pv="kosong">Kosong</button></span>
      </div>
      <div class="pv-isi">${g.topik.map(blok).join('')}</div>
    </div>`;
  }).join('');
  const catatan = soalPilih.length ? '' : '<p class="tp-catatan muted">Belum ada soal pada sumber ini. Struktur materi tetap ditampilkan; tambahkan soal lewat Bank Soal.</p>';
  $('pilih-topik').innerHTML = catatan + html;
  hitungSoal();
}
// Saat PK/PM berubah, bangun ulang topik sesuai kunci taksonomi (nama lengkap).
document.querySelectorAll('input[name="mapel"]').forEach((i) => i.addEventListener('change', () => {
  buatTopik();
  sinkronFolderUI();
}));
// Aksi di dalam pemilih: pilih/kosongkan per rumpun, buka subtopik, buka/tutup rumpun
$('pilih-topik').addEventListener('click', (e) => {
  const aksi = e.target.closest('[data-pv]');
  if (aksi) {
    const v = aksi.dataset.pv === 'pilih';
    aksi.closest('.pv-grup').querySelectorAll('.tp-blok:not([hidden])').forEach((b) => { b.querySelectorAll('input').forEach((i) => (i.checked = v)); labelSub(b); });
    $('pilih-topik').dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  const sb = e.target.closest('[data-sb]');
  if (sb) {
    const b = sb.closest('.tp-blok'), buka = !b.classList.contains('buka');
    b.classList.toggle('buka', buka);
    b.querySelector('.sb-isi').hidden = !buka;
    sb.setAttribute('aria-expanded', String(buka));
    return;
  }
  const bk = e.target.closest('[data-buka]');
  if (bk) {
    const g = bk.closest('.pv-grup');
    g.classList.toggle('tutup');
    const tutup = g.classList.contains('tutup');
    bk.setAttribute('aria-expanded', String(!tutup));
    bk.querySelector('.pv-panah').innerHTML = tutup ? '&#9656;' : '&#9662;';
    window._pvBuka = window._pvBuka || new Set();
    if (tutup) window._pvBuka.delete(g.dataset.kunci); else window._pvBuka.add(g.dataset.kunci);
  }
});
// Topik dan subtopiknya selalu sinkron: centang topik = semua subtopik ikut, hapus semua subtopik = topik ikut terhapus
$('pilih-topik').addEventListener('change', (e) => {
  const t = e.target, b = t.closest('.tp-blok');
  if (!b) return;
  const subs = [...b.querySelectorAll('input[data-sub]')];
  if (t.matches('[data-tp]')) subs.forEach((i) => (i.checked = t.checked));
  else if (t.matches('[data-sub]')) b.querySelector('input[data-tp]').checked = subs.some((i) => i.checked);
  labelSub(b);
});
function soalTerfilter() {
  const mapel = nilai('mapel'), topik = topikDipilih(), level = nilai('level') || 'semua', ex = subDikecualikan();
  return sumberSoal().filter((s) =>
    (mapel === 'semua' || s.mataPelajaran === mapel) && topik.includes(namaTopikResmi(s)) && lolosSub(s, ex) && (level === 'semua' || level === s.tingkatKesulitan) && (modeAdmin || s.status !== 'draf') && (!window._subAktif || s.subtopikId === window._subAktif || (s.subtopikIds || []).includes(window._subAktif)));
}
function ringkasSesi() {
  const teks = (nm) => { const i = document.querySelector(`input[name="${nm}"]:checked`); return i && i.nextElementSibling ? i.nextElementSibling.textContent : '-'; };
  const n = soalTerfilter().length, jml = jumlahDipilih(n), mode = nilai('mode');
  const wEl = $('pilih-waktu');
  const waktu = wEl ? Number(wEl.value) : DETIK_PER_SOAL;
  const lv = ({ semua: 'Semua tingkat', mudah: 'Mudah', sedang: 'Sedang', sulit: 'Sulit' })[nilai('level')] || 'Semua tingkat';
  const b = (a, v) => `<div class="ringkas-baris"><span>${a}</span><b>${v}</b></div>`;
  $('ringkas-sesi').innerHTML = b('Sumber', esc(teks('sumber'))) + b('Mata pelajaran', esc(teks('mapel'))) +
    b('Mode', mode === 'tryout' ? `Ngebut · ${waktu} dtk/soal` : 'Santai') + b('Jumlah soal', n ? jml : 0) +
    b('Topik', ringkasTopik()) + b('Kesulitan', esc(lv)) +
    (mode === 'tryout' && n ? b('Estimasi durasi', `± ${Math.ceil((jml * waktu) / 60)} menit`) : '');
  sinkronFolderUI();
}
function hitungSoal() {
  const n = soalTerfilter().length;
  const sumber = nilai('sumber');
  $('info-soal').textContent = n
    ? `${n} soal cocok dengan filter. Sesi ini mengambil ${jumlahDipilih(n)} soal acak.`
    : (sumber !== 'semua' && sumber !== 'bawaan' && !BankSoal.ambil().length
      ? 'Bank soal kamu masih kosong. Buat soal dulu di menu Bank Soal.'
      : 'Belum ada soal yang cocok dengan filter. Ubah sumber, topik, atau kesulitan.');
  $('btn-mulai').disabled = n === 0;
  ringkasSesi();
}

// ---------- Sesi soal ----------
function mulai() {
  if (!AkunApp.sesi()) {
    const latihan = document.querySelector('input[name="mode"][value="latihan"]');
    if (latihan) latihan.checked = true;
    const bawaan = document.querySelector('input[name="sumber"][value="bawaan"]');
    if (bawaan) bawaan.checked = true;
    if (nilai('mode') !== 'latihan') return tampilkanToast('Mode tamu hanya dapat menggunakan fitur Latihan.');
  }
  migrasiSesiLama();
 const soal = acak(soalTerfilter()).slice(0, jumlahDipilih(Infinity));
const sumberSoalSesi = soal.map((s) =>
  SOAL.includes(s) ? 'bawaan' : 'personal'
);
  sesi = {
  mode: nilai('mode'), soal, sumberSoal: sumberSoalSesi,
aktif: true, i: 0, mulai: Date.now(), timer: null,
    statAwal: JSON.parse(JSON.stringify(Penyimpanan.ambil())), // untuk membandingkan sebelum dan sesudah sesi
    jawab: soal.map(() => null), kunci: soal.map(() => false),
    sisa: soal.length * DETIK_PER_SOAL
  };
  $('timer').hidden = sesi.mode !== 'tryout';
  rekamKonfigTerakhir();
  simpanSesiAktif();
  if (sesi.mode === 'tryout') jalankanTimerSesi();
  tampil('kuis');
  $('ex-detail').open = window.innerWidth >= 900;
  renderSoal();
}


/* Koleksi Soal: tersimpan per akun dan disinkronkan melalui data_pengguna. */
const KoleksiSoal = {
 KEY:'pytago_koleksi_soal',
 ambil(){try{const d=JSON.parse(localStorage.getItem(this.KEY));return Array.isArray(d)?d:[];}catch(e){return[];}},
 simpan(d){if(!AkunApp.sesi())return false;try{localStorage.setItem(this.KEY,JSON.stringify(d));sinkron().catch(()=>{});return true;}catch(e){return false;}},
 ada(id){return this.ambil().some(x=>String(x.id)===String(id));},
 toggle(s){if(!AkunApp.sesi()){alert('Masuk dengan Google untuk menyimpan soal.');return false;}const d=this.ambil(),id=String(s.id);if(d.some(x=>String(x.id)===id)){this.simpan(d.filter(x=>String(x.id)!==id));tampilkanToast('Soal dihapus dari koleksi.');}else{d.unshift({id,soal:JSON.parse(JSON.stringify(s)),status:'belum',disimpanPada:Date.now()});this.simpan(d);tampilkanToast('Soal disimpan ke Koleksi Soal.');}renderTombolKoleksi();return true;}
};
function renderTombolKoleksi(){const b=$('btn-koleksi-soal');if(!b||!sesi||!sesi.soal||!sesi.soal[sesi.i])return;const ok=KoleksiSoal.ada(sesi.soal[sesi.i].id);b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4z"/></svg><span>'+(ok?'Tersimpan':'Simpan soal')+'</span>';b.classList.toggle('is-saved',ok);b.setAttribute('aria-pressed',String(ok));}
const FILTER_KOLEKSI={mapel:'',topik:'',subtopik:''};
function subtopikKoleksi(s){const ids=idSub(s),out=[];for(const k of Object.keys(TAKSONOMI))for(const r of TAKSONOMI[k].rumpun)for(const tp of r.topik)for(const sb of (tp.sub||[]))if(ids.includes(sb.id))out.push({id:sb.id,nama:sb.nama});return out;}
function renderKoleksiSoal(){
 const el=$('isi-koleksi-soal');if(!el)return;
 if(!AkunApp.sesi()){el.innerHTML='<div class="card koleksi-empty"><p>Masuk untuk menyimpan koleksi soal.</p><button class="btn btn-primary" id="koleksi-masuk" type="button">Masuk dengan Google</button></div>';const b=$('koleksi-masuk');if(b)b.onclick=()=>aksiAkun('google');return;}
 const d=KoleksiSoal.ambil(),c={belum:0,proses:0,kuasai:0};d.forEach(x=>c[x.status||'belum']++);
 const maps=[...new Set(d.map(x=>(x.soal||{}).mataPelajaran).filter(Boolean))].sort();
 if(!maps.includes(FILTER_KOLEKSI.mapel))FILTER_KOLEKSI.mapel='';
 const dm=d.filter(x=>!FILTER_KOLEKSI.mapel||(x.soal||{}).mataPelajaran===FILTER_KOLEKSI.mapel);
 const tops=[...new Set(dm.map(x=>namaTopikResmi(x.soal||{})).filter(Boolean))].sort();
 if(!tops.includes(FILTER_KOLEKSI.topik))FILTER_KOLEKSI.topik='';
 const dt=dm.filter(x=>!FILTER_KOLEKSI.topik||namaTopikResmi(x.soal||{})===FILTER_KOLEKSI.topik);
 const subs=[];dt.forEach(x=>subtopikKoleksi(x.soal||{}).forEach(sb=>{if(!subs.some(y=>y.id===sb.id))subs.push(sb)}));
 if(!subs.some(x=>x.id===FILTER_KOLEKSI.subtopik))FILTER_KOLEKSI.subtopik='';
 const tampil=d.filter(x=>{const s=x.soal||{};return(!FILTER_KOLEKSI.mapel||s.mataPelajaran===FILTER_KOLEKSI.mapel)&&(!FILTER_KOLEKSI.topik||namaTopikResmi(s)===FILTER_KOLEKSI.topik)&&(!FILTER_KOLEKSI.subtopik||idSub(s).includes(FILTER_KOLEKSI.subtopik));});
 const cards=tampil.map(x=>{const s=x.soal||{},st=x.status||'belum';return `<article class="card koleksi-item"><div class="koleksi-meta"><span class="pill-mapel">${esc(s.mataPelajaran||'Soal')}</span><span class="muted">${esc(namaTopikResmi(s)||'Tanpa topik')}</span>${subtopikKoleksi(s).map(sb=>`<span class="muted koleksi-subtopik">${esc(sb.nama)}</span>`).join('')}</div><div class="koleksi-teks">${konten(s.soal||'Konten soal tidak tersedia.',s.gambarSoal,'Gambar soal',s.grafik)}</div><div class="koleksi-kunci"><b>Kunci jawaban: ${esc(kunciHuruf(s))}</b>${!adaIsian(s)&&Array.isArray(s.opsi)?`<div class="koleksi-kunci-isi">${(adaGanda(s)?s.jawaban:[s.jawaban]).map(k=>{const n=indeksAngka(k);return Number.isInteger(n)&&s.opsi[n]!==undefined?`<div class="koleksi-opsi"><b>${HURUF[n]}.&#x20;</b><span class="koleksi-opsi-isi">${sanitize(s.opsi[n])}</span></div>`:''}).join('')}</div>`:''}</div><details class="koleksi-pembahasan"><summary>Lihat pembahasan</summary><div class="feedback">${konten(s.pembahasan||'Pembahasan belum tersedia.',s.gambarPembahasan,'Gambar pembahasan',s.grafikPembahasan)}</div></details><div class="koleksi-actions"><label>Status<select class="input" data-koleksi-status="${esc(x.id)}"><option value="belum" ${st==='belum'?'selected':''}>Belum dipelajari</option><option value="proses" ${st==='proses'?'selected':''}>Sedang dipelajari</option><option value="kuasai" ${st==='kuasai'?'selected':''}>Dikuasai</option></select></label><button
  class="btn btn-secondary btn-kecil koleksi-hapus-icon"
  type="button"
  data-koleksi-hapus="${esc(x.id)}"
  title="Hapus dari koleksi"
  aria-label="Hapus dari koleksi"
>
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6"/>
  </svg>
</button></div></article>`;}).join('');
 const opts=(a,v,ph,key=x=>x,label=x=>x)=>'<option value="">'+ph+'</option>'+a.map(x=>'<option value="'+esc(key(x))+'" '+(key(x)===v?'selected':'')+'>'+esc(label(x))+'</option>').join('');
 el.innerHTML=`<div class="koleksi-ringkas"><div><b>${d.length}</b><span>Total soal</span></div><div><b>${c.belum}</b><span>Belum dipelajari</span></div><div><b>${c.proses}</b><span>Sedang dipelajari</span></div><div><b>${c.kuasai}</b><span>Dikuasai</span></div></div>${d.length?`<div class="koleksi-filter"><label>Mapel<select class="input" data-koleksi-filter="mapel">${opts(maps,FILTER_KOLEKSI.mapel,'Semua mapel',x=>x,namaMapel)}</select></label><label>Topik<select class="input" data-koleksi-filter="topik" ${!tops.length?'disabled':''}>${opts(tops,FILTER_KOLEKSI.topik,'Semua topik')}</select></label><label>Subtopik<select class="input" data-koleksi-filter="subtopik" ${!subs.length?'disabled':''}>${opts(subs,FILTER_KOLEKSI.subtopik,'Semua subtopik',x=>x.id,x=>x.nama)}</select></label><button type="button" class="btn btn-secondary btn-kecil" data-koleksi-filter-reset>Reset filter</button></div><p class="koleksi-filter-hasil muted">Menampilkan ${tampil.length} dari ${d.length} soal</p>${tampil.length?'<div class="koleksi-list">'+cards+'</div>':'<div class="card koleksi-empty"><h3>Tidak ada soal yang cocok</h3><p class="muted">Coba ubah atau reset filter.</p></div>'}`:'<div class="card koleksi-empty"><h3>Belum ada soal tersimpan</h3><p class="muted">Tekan Simpan soal saat latihan.</p></div>'}`;
 rumus(el);
}
$('isi-koleksi-soal').addEventListener('change',e=>{const f=e.target.closest('[data-koleksi-filter]');if(f){FILTER_KOLEKSI[f.dataset.koleksiFilter]=f.value;if(f.dataset.koleksiFilter==='mapel'){FILTER_KOLEKSI.topik='';FILTER_KOLEKSI.subtopik='';}if(f.dataset.koleksiFilter==='topik')FILTER_KOLEKSI.subtopik='';renderKoleksiSoal();return;}const b=e.target.closest('[data-koleksi-status]');if(!b)return;const d=KoleksiSoal.ambil(),x=d.find(v=>String(v.id)===b.dataset.koleksiStatus);if(x){x.status=b.value;KoleksiSoal.simpan(d);renderKoleksiSoal();}});
$('isi-koleksi-soal').addEventListener('click', e => {
  if (e.target.closest('[data-koleksi-filter-reset]')) {
    FILTER_KOLEKSI.mapel = '';
    FILTER_KOLEKSI.topik = '';
    FILTER_KOLEKSI.subtopik = '';
    renderKoleksiSoal();
    return;
  }

  const b = e.target.closest('[data-koleksi-hapus]');
  if (!b) return;
konfirmUjian(
  'Yakin ga nihh hapus dari koleksi soal?',
  'Tindakan ini gabisa dibatalin loh.',
  [
    {
      label: 'Gajadi deh',
      kelas: 'btn-primary'
    },
    {
      label: 'Hapus aja',
      kelas: 'btn-bahaya',
      fn: () => {
        KoleksiSoal.simpan(
          KoleksiSoal.ambil().filter(
            x => String(x.id) !== b.dataset.koleksiHapus
          )
        );

        renderKoleksiSoal();
        tampilkanToast('Soal dihapus dari koleksi.');
      }
    }
  ]
);    
});
function renderSoal() {
  const { soal, jawab, kunci, i, mode } = sesi;
  const s = soal[i];
  $('bar').style.width = ((i + 1) / soal.length) * 100 + '%';
  $('info-nomor').textContent = `Soal ${i + 1} dari ${soal.length} (${namaMapel(s.mataPelajaran)}, ${s.topik || (sesi.paketTryoutId ? 'Paket Tryout' : 'Tanpa topik')})${adaGanda(s) ? ' · centang semua yang benar' : adaIsian(s) ? ' · isian bilangan cacah' : ''}`;
  renderTombolEditSoal(s);
  const evaluasiAktif = mode === 'latihan' && kunci[i];
  $('teks-soal').innerHTML = konten(s.soal, s.gambarSoal, 'Gambar soal', s.grafik, s.visual);
  if (adaIsian(s)) {
    const j = jawab[i];
    const kelasIsi = evaluasiAktif ? (jawabBenar(s, j) ? ' benar' : ' salah') : '';
    $('opsi-list').innerHTML = `<div class="isian">
      <input id="inp-isian" aria-label="Jawaban Anda (bilangan cacah)" class="input isian-input${kelasIsi}" type="text" inputmode="numeric" autocomplete="off" maxlength="12"
        placeholder="Contoh: 24" value="${j === null || j === undefined ? '' : esc(j)}" ${evaluasiAktif ? 'disabled' : ''}>
      <p class="muted" style="margin:4px 0 0;font-size:.8rem">Angka bulat, tanpa koma atau minus.</p></div>`;
  } else {
    $('opsi-list').innerHTML = s.opsi.map((o, k) => {
      let kelas = 'opsi';
      if (evaluasiAktif) {
        const skorAkhir = skorJawaban(s, jawab[i]);
        if (kunciOpsi(s, k)) {
          kelas += skorAkhir > 0 && skorAkhir < 1 && dipilih(s, jawab[i], k) ? ' parsial' : ' benar';
        } else if (dipilih(s, jawab[i], k)) kelas += ' salah';
      } else if (dipilih(s, jawab[i], k)) kelas += ' terpilih';
      return `<div class="${kelas}" data-k="${k}">${adaGanda(s) ? '<span class="cek"></span>' : ''}<span class="huruf">${HURUF[k]}</span>${isiOpsi(o)}</div>`;
    }).join('');
  }

  renderTombolKoleksi();
  const tombolLapor = $('btn-laporkan-soal');
  if (tombolLapor) tombolLapor.hidden = !AkunApp.sesi();
  const fb = $('feedback');
  fb.hidden = !evaluasiAktif;
  if (evaluasiAktif) {
    const benar = jawabBenar(s, jawab[i]);
    const skor = skorJawaban(s, jawab[i]);
    fb.className = 'feedback ' + (skor === 1 ? 'benar' : skor > 0 ? 'parsial' : 'salah');
    if (skor > 0 && skor < 1) {
      fb.style.setProperty('background-color', '#fff7d6', 'important');
      fb.style.setProperty('border-color', '#b7791f', 'important');
      fb.style.setProperty('color', '#704b12', 'important');
    } else {
      fb.style.removeProperty('background-color');
      fb.style.removeProperty('border-color');
      fb.style.removeProperty('color');
    }
    const status = skor === 1 ? 'Benar!' : skor > 0 ? `Kurang lengkap (${Math.round(skor * 100)}%).` : 'Kurang tepat.';
    fb.innerHTML = `<strong>${status} ${skor < 1 ? 'Jawaban yang benar: ' + kunciHuruf(s) : ''}</strong><div>${konten(s.pembahasan, s.gambarPembahasan, 'Gambar pembahasan')}</div>`;
  }

  $('btn-prev').disabled = i === 0;
  const btn = $('btn-aksi');
  if (mode === 'latihan' && !kunci[i]) {
    btn.textContent = 'Jawab';
    btn.disabled = jawab[i] === null;
  } else {
    btn.textContent = i === soal.length - 1 ? 'Selesai' : 'Lanjut';
    btn.disabled = false;
  }
  renderUjianUI();
  simpanSesiAktif();
  rumus($('kuis'));
}


// ---------- Laporan soal ----------
let konteksLaporanSoal = null;
function buatModalLaporanSoal() {
  if ($('modal-laporan-soal')) return;

  const el = document.createElement('div');
  el.id = 'modal-laporan-soal';
  el.className = 'editor-soal-live';
  el.hidden = true;

  el.innerHTML = `
    <section class="editor-soal-live-panel" role="dialog" aria-modal="true" aria-labelledby="lapor-judul">
      <header class="esl-head">
        <div>
          <span class="esl-eyebrow">LAPORAN PENGGUNA</span>
          <h2 id="lapor-judul">Laporkan Soal</h2>
          <p id="lapor-meta" class="muted"></p>
        </div>
        <button type="button" class="btn btn-secondary btn-kecil" data-lapor-tutup>Tutup</button>
      </header>

      <form id="form-laporan-soal">
        <label class="esl-label" for="lapor-kategori">Apa masalah yang kamu temukan?</label>
        <select id="lapor-kategori" class="input" required>
          <option value="">Pilih kategori laporan</option>
          <option value="soal_salah">Soal atau pertanyaan salah</option>
          <option value="opsi_tidak_sesuai">Pilihan jawaban tidak sesuai pembahasan</option>
          <option value="kunci_jawaban_salah">Kunci jawaban salah</option>
          <option value="pembahasan_salah">Pembahasan salah</option>
          <option value="gambar_bermasalah">Gambar bermasalah</option>
          <option value="lainnya">Lainnya</option>
        </select>

        <label class="esl-label" for="lapor-deskripsi">Keterangan tambahan (opsional)</label>
        <textarea id="lapor-deskripsi" class="input esl-area" rows="4"
          maxlength="2000" placeholder="Jelaskan bagian yang menurutmu bermasalah..."></textarea>

        <p id="lapor-pesan" class="esl-pesan" role="status" aria-live="polite"></p>

        <footer class="esl-actions">
          <button type="button" class="btn btn-secondary" data-lapor-tutup>Batal</button>
          <button type="submit" class="btn btn-primary" id="lapor-kirim">Kirim laporan</button>
        </footer>
      </form>
    </section>
  `;

  document.body.appendChild(el);

  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-lapor-tutup]')) {
      el.hidden = true;
    }
  });

  $('form-laporan-soal')?.addEventListener('submit', kirimLaporanSoal);
}
function tampilkanToast(teks) {
  const lama = document.getElementById('notifikasi-pytago');
  if (lama) lama.remove();

  const toast = document.createElement('div');
  toast.id = 'notifikasi-pytago';
  toast.className = 'toast-neon';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = teks;

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}
function bukaModalLaporanSoal(soalArg, sumberArg, nomorArg) {
  const s = soalArg || (sesi && sesi.aktif ? sesi.soal[sesi.i] : null);
  if (!s) return;

  const akun = AkunApp.sesi();
  if (!akun) {
    alert('Silakan masuk ke akun Pytago terlebih dahulu untuk melaporkan soal.');
    return;
  }

  konteksLaporanSoal = {
    soal: s,
    sumber: sumberArg || (sesi && sesi.aktif && sesi.soal[sesi.i] === s ? sesi.sumberSoal[sesi.i] : (Object.prototype.hasOwnProperty.call(DefaultSoal.urutan, String(s.id)) ? 'bawaan' : 'personal')),
    nomor: nomorArg || (sesi && sesi.aktif && sesi.soal[sesi.i] === s ? sesi.i + 1 : null)
  };
  buatModalLaporanSoal();
  $('lapor-meta').textContent = `${konteksLaporanSoal.nomor ? 'Soal ' + konteksLaporanSoal.nomor + ' · ' : ''}${namaMapel(s.mataPelajaran)} · ${s.topik}`;

  $('lapor-kategori').value = '';
  $('lapor-deskripsi').value = '';
  $('lapor-pesan').textContent = '';

  $('modal-laporan-soal').hidden = false;
  $('lapor-kategori').focus();
}

async function kirimLaporanSoal(e) {
  e.preventDefault();

  const akun = AkunApp.sesi();
  if (!akun || !konteksLaporanSoal || !konteksLaporanSoal.soal) return;

  const s = konteksLaporanSoal.soal;
  const kategori = $('lapor-kategori').value;
  const deskripsi = $('lapor-deskripsi').value.trim();
  const tombol = $('lapor-kirim');
  const pesan = $('lapor-pesan');

  if (!kategori) {
    pesan.textContent = 'Pilih kategori laporan terlebih dahulu.';
    return;
  }

  tombol.disabled = true;
  pesan.textContent = 'Mengirim laporan...';

  try {
   
await rest('laporan_soal', {
  method: 'POST',
  prefer: 'return=minimal',
  body: {
    user_id: akun.user_id,
    question_id: String(s.id),
    question_title: `${namaMapel(s.mataPelajaran)} · ${s.topik}`,
    question_source: konteksLaporanSoal.sumber,
    category: kategori,
    description: deskripsi || null,
    status: 'baru'
  }
});

    $('modal-laporan-soal').hidden = true;
    tampilkanToast('✓ Berhasil dikirim. Thx a lot udah bantu ningkatin kualitas soal kami!');
  } catch (err) {
    pesan.textContent = 'Gagal mengirim laporan: ' + err.message;
  } finally {
    tombol.disabled = false;
  }
}

// Hubungkan tombol dengan formulir laporan.
$('btn-laporkan-soal').addEventListener('click', bukaModalLaporanSoal);
$('btn-koleksi-soal').addEventListener('click', () => { if(sesi&&sesi.aktif) KoleksiSoal.toggle(sesi.soal[sesi.i]); });


// ---------- Edit soal langsung saat latihan (admin) ----------

let editorSoalLiveFokus = null;
let soalLaporanTarget = null;
let soalEditorTarget = null;
function buatEditorSoalLive() {
  if ($('editor-soal-live')) return;
  const el = document.createElement('div');
  el.id = 'editor-soal-live';
  el.className = 'editor-soal-live';
  el.hidden = true;
  el.innerHTML = '<section class="editor-soal-live-panel" role="dialog" aria-modal="true" aria-labelledby="esl-judul">' +
    '<header class="esl-head"><div><span class="esl-eyebrow">PANEL ADMIN</span><h2 id="esl-judul">Edit soal aktif</h2><p id="esl-meta" class="muted"></p></div><button type="button" class="btn btn-secondary btn-kecil" data-esl-tutup aria-label="Tutup editor">Tutup</button></header>' +
    '<form id="esl-form" novalidate><label class="esl-label">Pertanyaan</label><div id="esl-soal-editor"></div>' +
    '<div class="esl-live-preview"><div class="esl-label">Pratinjau pertanyaan</div><div id="esl-soal-preview" class="teks-soal"></div></div>' +
    '<div id="esl-grafik-editor"></div>' +
    '<div id="esl-opsi-wrap"></div><div id="esl-kunci-wrap"></div>' +
    '<label class="esl-label">Pembahasan</label><div id="esl-pembahasan-editor"></div>' +
    '<div class="esl-live-preview"><div class="esl-label">Pratinjau pembahasan</div><div id="esl-pembahasan-preview" class="feedback"></div></div>' +
    '<p class="esl-hint">Format HTML dan LaTeX tetap didukung. Periksa kembali kunci dan pembahasan sebelum menyimpan.</p>' +
    '<p id="esl-pesan" class="esl-pesan" role="status" aria-live="polite"></p>' +
    '<footer class="esl-actions"><button type="button" class="btn btn-secondary" data-esl-batal>Batal</button><button type="submit" class="btn btn-primary" id="esl-simpan">Simpan untuk semua pengguna</button></footer></form></section>';
  document.body.appendChild(el);
  el.addEventListener('click', (e) => {
    if (e.target === el || e.target.closest('[data-esl-tutup],[data-esl-batal]')) tutupEditorSoalLive();
  });
  // Delegasi input pada wadah permanen agar tetap bekerja meski buatEditor()
  // membuat ulang elemen .editor-area setiap kali editor dibuka.
  el.addEventListener('input', (e) => {
    if (e.target.matches('#esl-soal-editor .editor-area, #esl-pembahasan-editor .editor-area')) {
      renderEditorSoalLivePreview();
    }
  });
  el.querySelector('#esl-form').addEventListener('submit', simpanEditorSoalLive);
  buatEditor('esl-soal-editor', 'Tulis pertanyaan di sini...', false);
  buatEditor('esl-pembahasan-editor', 'Tulis pembahasan di sini...', false);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !el.hidden) tutupEditorSoalLive();
  });
}
// Render pratinjau editor secara berurutan agar MathJax tidak saling bertabrakan.
function renderEditorSoalLivePreview() {
  const token = (renderEditorSoalLivePreview.token || 0) + 1;
  renderEditorSoalLivePreview.token = token;
  const jalankan = async () => {
    // Lewati antrean lama yang belum mulai; cukup render isi editor paling baru.
    if (token !== renderEditorSoalLivePreview.token) return;
    const soal = $('esl-soal-preview'), pembahasan = $('esl-pembahasan-preview');
    const areaSoal = $('esl-soal-editor')?.querySelector('.editor-area');
    const areaPembahasan = $('esl-pembahasan-editor')?.querySelector('.editor-area');
    if (!areaSoal || !areaPembahasan) return;

    // MathJax harus melepas referensi hasil render lama sebelum innerHTML diganti.
    if (window.MathJax && typeof window.MathJax.typesetClear === 'function') {
      window.MathJax.typesetClear([soal, pembahasan].filter(Boolean));
    }

    const visualLama = (soalPaketTarget && soalPaketTarget.soal.visual) || (soalLaporanTarget && soalLaporanTarget.visual) || (soalEditorTarget && soalEditorTarget.visual) || null;
    if (soal) soal.innerHTML = konten(areaSoal.innerHTML, null, 'Gambar soal', window.NalarineGraph ? window.NalarineGraph.getEditorValue() : null, visualLama);
    if (pembahasan) pembahasan.innerHTML = konten(areaPembahasan.innerHTML);

    const root = $('editor-soal-live');
    if (root && window.NalarineGraph) window.NalarineGraph.renderAll(root);

    if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
      try {
        if (window.MathJax.startup && window.MathJax.startup.promise) await window.MathJax.startup.promise;
        // Jika ada ketikan baru selama MathJax startup, jangan render snapshot lama.
        if (token !== renderEditorSoalLivePreview.token) return;
        await window.MathJax.typesetPromise([soal, pembahasan].filter(Boolean));
      } catch (err) {
        console.warn('MathJax gagal merender pratinjau editor:', err);
      }
    } else if (root) {
      antreanMathJax.add(root);
    }
  };

  const antrean = renderEditorSoalLivePreview.antrean || Promise.resolve();
  renderEditorSoalLivePreview.antrean = antrean.catch(() => {}).then(jalankan);
}
function renderTombolEditSoal(s) {
  const baris = document.querySelector('#kuis .baris-info');
  if (!baris) return;
  let btn = $('btn-edit-soal-aktif');
  const boleh = !!(ADMIN && s && Object.prototype.hasOwnProperty.call(DefaultSoal.urutan, String(s.id)));
  if (!boleh) { if (btn) btn.remove(); return; }
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'btn-edit-soal-aktif';
    btn.className = 'btn btn-secondary btn-kecil esl-trigger';
    btn.textContent = 'Edit soal';
    btn.addEventListener('click', bukaEditorSoalLive);
    baris.appendChild(btn);
  }
}
function tutupPratinjauLaporanSoal() {
  const el = $('pratinjau-laporan-soal');
  if (!el) return;
  el.hidden = true;
  document.body.classList.remove('esl-terbuka');
}

function bukaPratinjauSoalDariLaporan(id) {
  if (!ADMIN) return;
  const s = SOAL.find((item) => String(item.id) === String(id));
  if (!s || !Object.prototype.hasOwnProperty.call(DefaultSoal.urutan, String(id))) {
    alert('Soal bawaan tidak ditemukan. Muat ulang bank soal terlebih dahulu.');
    return;
  }

  let el = $('pratinjau-laporan-soal');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pratinjau-laporan-soal';
    el.className = 'editor-soal-live';
    el.hidden = true;
    el.innerHTML = `
      <section class="editor-soal-live-panel" role="dialog" aria-modal="true" aria-labelledby="pls-judul">
        <header class="esl-head">
          <div><span class="esl-eyebrow">PRATINJAU SOAL</span><h2 id="pls-judul">Pratinjau soal</h2><p id="pls-meta" class="muted"></p></div>
          <button type="button" class="btn btn-secondary btn-kecil" data-pls-tutup>Tutup</button>
        </header>
        <div id="pls-konten" class="pratinjau-soal-konten"></div>
        <footer class="esl-actions">
          <button type="button" class="btn btn-secondary" data-pls-tutup>Tutup</button>
          <button type="button" class="btn btn-primary" id="pls-edit">Edit soal</button>
        </footer>
      </section>`;
    document.body.appendChild(el);
    el.addEventListener('click', (event) => {
      if (event.target === el || event.target.closest('[data-pls-tutup]')) tutupPratinjauLaporanSoal();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !el.hidden) tutupPratinjauLaporanSoal();
    });
    $('pls-edit').addEventListener('click', () => {
      const soalId = el.dataset.soalId;
      tutupPratinjauLaporanSoal();
      bukaEditorSoalDariLaporan(soalId);
    });
  }

  el.dataset.soalId = String(s.id);
  $('pls-meta').textContent = `${s.id} · ${namaMapel(s.mataPelajaran)} · ${s.topik} · ${tipeSoal(s)}`;
  const isian = adaIsian(s);
  const pilihan = isian
    ? '<p class="muted">Soal ini menggunakan isian bilangan cacah, bukan pilihan ganda.</p>'
    : `<div class="opsi-list">${opsiReviewHTML(s, undefined)}</div>`;
  $('pls-konten').innerHTML = `
    <div class="rev-body">
      <div><p class="rev-sub">Pertanyaan</p><div class="teks-soal">${konten(s.soal, s.gambarSoal, 'Gambar soal', s.grafik)}</div></div>
      <div><p class="rev-sub">${isian ? 'Format jawaban' : 'Pilihan jawaban'}</p>${pilihan}<p class="rev-ket"><span>${isian ? 'Kunci jawaban (bilangan cacah)' : 'Kunci jawaban'}: <b>${esc(kunciHuruf(s))}</b></span></p></div>
      <div class="feedback rev-pembahasan"><strong>Pembahasan</strong><div>${konten(s.pembahasan, s.gambarPembahasan, 'Gambar pembahasan')}</div></div>
    </div>`;
  el.hidden = false;
  document.body.classList.add('esl-terbuka');
  rumus(el);
}

function bukaEditorSoalDariLaporan(id) {
  if (!ADMIN) return;

  const soal = SOAL.find((s) => String(s.id) === String(id));

  if (!soal || !Object.prototype.hasOwnProperty.call(DefaultSoal.urutan, String(id))) {
    alert('Soal bawaan tidak ditemukan. Muat ulang bank soal terlebih dahulu.');
    return;
  }

  soalLaporanTarget = soal;
  bukaEditorSoalLive();
}

function bukaEditorSoalLive() {
  if (!ADMIN) return;

  const s = soalPaketTarget ? soalPaketTarget.soal : (soalLaporanTarget || soalEditorTarget ||
    (sesi && sesi.aktif ? sesi.soal[sesi.i] : null));

  if (!s || (!soalPaketTarget && !Object.prototype.hasOwnProperty.call(DefaultSoal.urutan, String(s.id)))) return;

  buatEditorSoalLive();
  editorSoalLiveFokus = document.activeElement;

  const el = $('editor-soal-live');

  $('esl-meta').textContent = String(s.id) + ' · ' + namaMapel(s.mataPelajaran) + ' · ' + s.topik + ' · ' + tipeSoal(s);
  buatEditor('esl-soal-editor', 'Tulis pertanyaan di sini...', false);
  buatEditor('esl-pembahasan-editor', 'Tulis pembahasan di sini...', false);
  const areaSoalLive = $('esl-soal-editor').querySelector('.editor-area');
  const areaPembahasanLive = $('esl-pembahasan-editor').querySelector('.editor-area');
  // Pasang listener langsung pada instance editor yang baru dibuat.
  // Instance ini selalu diganti oleh buatEditor() setiap kali modal dibuka.
  areaSoalLive.addEventListener('input', renderEditorSoalLivePreview);
  areaPembahasanLive.addEventListener('input', renderEditorSoalLivePreview);
  areaSoalLive.innerHTML = s.soal || '';
  areaPembahasanLive.innerHTML = s.pembahasan || '';
  if (window.NalarineGraph) {
    window.NalarineGraph.initEditor($('esl-grafik-editor'));
    window.NalarineGraph.setEditorValue(s.grafik || null);
  }
  renderEditorSoalLivePreview();

  const tipe = tipeSoal(s);
  const jumlahOpsi = tipe === 'kompleks'
    ? Math.max(4, Math.min(5, (s.opsi || []).length || 5))
    : 5;

  $('esl-opsi-wrap').dataset.jumlah = String(jumlahOpsi);

  $('esl-opsi-wrap').innerHTML = tipe === 'isian'
    ? '<p class="esl-hint">Soal isian bilangan cacah tidak menggunakan opsi.</p>'
    : '<div class="esl-label">Pilihan jawaban</div>' +
      Array.from({ length: jumlahOpsi }, (_, i) =>
        '<label class="esl-label">Opsi ' + HURUF[i] + '</label><div class="esl-opsi-editor" id="esl-opsi-' + i + '"></div>'
      ).join('');

  if (tipe !== 'isian') {
    Array.from({length: jumlahOpsi}, (_, i) => {
      const id = 'esl-opsi-' + i;
      buatEditor(id, 'Tulis opsi ' + HURUF[i] + '...', true);
      $(id).querySelector('.editor-area').innerHTML = (s.opsi || [])[i] || '';
    });
  }

  if (tipe === 'pg') {
    $('esl-kunci-wrap').innerHTML =
      '<label class="esl-label" for="esl-kunci-pg">Kunci jawaban</label><select class="input" id="esl-kunci-pg">' +
      HURUF.map((h, i) =>
        '<option value="' + i + '" ' + (Number(s.jawaban) === i ? 'selected' : '') + '>' + h + '</option>'
      ).join('') + '</select>';
  } else if (tipe === 'kompleks') {
    $('esl-kunci-wrap').innerHTML =
      '<fieldset class="esl-fieldset"><legend class="esl-label">Kunci jawaban — pilih semua yang benar</legend><div class="esl-kunci-grid">' +
      HURUF.slice(0, jumlahOpsi).map((h, i) =>
        '<label><input type="checkbox" data-esl-kunci value="' + i + '" ' +
        ((Array.isArray(s.jawaban) && s.jawaban.includes(i)) ? 'checked' : '') + '> ' + h + '</label>'
      ).join('') + '</div></fieldset>';
  } else {
    $('esl-kunci-wrap').innerHTML =
      '<label class="esl-label" for="esl-kunci-isian">Kunci jawaban (bilangan cacah)</label>' +
      '<input class="input" id="esl-kunci-isian" type="number" min="0" step="1" value="' +
      Number(s.jawaban) + '">';
  }

  $('esl-pesan').textContent = '';
  $('esl-simpan').disabled = false;
  el.hidden = false;
  document.body.classList.add('esl-terbuka');
  $('esl-soal-editor').querySelector('.editor-area').focus();
}
function tutupEditorSoalLive() {
  const el = $('editor-soal-live');

  soalLaporanTarget = null;
  soalEditorTarget = null;
  soalPaketTarget = null;

  if (!el) return;

  el.hidden = true;
  document.body.classList.remove('esl-terbuka');

  if (editorSoalLiveFokus && editorSoalLiveFokus.focus) {
    editorSoalLiveFokus.focus();
  }
}
async function simpanEditorSoalLive(e) {
  e.preventDefault();
  if (!ADMIN) return;

  const tombol = $('esl-simpan');
  const pesan = $('esl-pesan');
  const lama = soalPaketTarget ? soalPaketTarget.soal : (soalLaporanTarget || soalEditorTarget ||
    (sesi && sesi.aktif ? sesi.soal[sesi.i] : null));

  if (!lama) {
    pesan.textContent = 'Soal yang akan disimpan tidak ditemukan. Tutup editor lalu buka kembali dari laporan.';
    return;
  }

  const tipe = tipeSoal(lama);
  const soal = $('esl-soal-editor').querySelector('.editor-area').innerHTML.trim();
  const pembahasan = $('esl-pembahasan-editor').querySelector('.editor-area').innerHTML.trim();
  if (!soal || !pembahasan) {
    pesan.textContent = 'Pertanyaan dan pembahasan wajib diisi.';
    return;
  }

  const jumlahOpsi = Number($('esl-opsi-wrap').dataset.jumlah || 5);
  const opsi = tipe === 'isian' ? [] : Array.from(
    { length: jumlahOpsi },
    (_, i) => $('esl-opsi-' + i).querySelector('.editor-area').innerHTML.trim()
  );
  if (tipe !== 'isian' && opsi.some((x) => !x)) {
    pesan.textContent = 'Semua opsi harus diisi.';
    return;
  }

  let jawaban;
  if (tipe === 'pg') jawaban = Number($('esl-kunci-pg').value);
  else if (tipe === 'kompleks') {
    jawaban = [...document.querySelectorAll('[data-esl-kunci]:checked')]
      .map((x) => Number(x.value)).sort((a, b) => a - b);
  } else jawaban = Number($('esl-kunci-isian').value);

  if (tipe === 'kompleks' && !jawaban.length) {
    pesan.textContent = 'Pilih minimal satu opsi yang benar.';
    return;
  }
  if (tipe === 'isian' && (!Number.isSafeInteger(jawaban) || jawaban < 0)) {
    pesan.textContent = 'Kunci isian harus bilangan cacah.';
    return;
  }

  const id = String(lama.id);
  const data = {
    ...sinId(lama),
    soal: sanitize(soal),
    opsi: opsi.map(sanitize),
    jawaban,
    pembahasan: sanitize(pembahasan),
    grafik: window.NalarineGraph ? window.NalarineGraph.getEditorValue() : (lama.grafik || null)
  };

  tombol.disabled = true;
  pesan.textContent = 'Menyimpan perubahan ke server...';

  // Tahap 1: simpan ke database. Jika tahap ini gagal, jangan ubah status laporan.
  try {
    const hasilSimpan = soalPaketTarget
      ? await rest('tryout_soal?id=eq.' + encodeURIComponent(id) + '&paket_id=eq.' + encodeURIComponent(soalPaketTarget.row.paket_id), {
          method: 'PATCH', prefer: 'return=representation', body: { data }
        })
      : await rest('soal_default?id=eq.' + encodeURIComponent(id), {
          method: 'PATCH', prefer: 'return=representation',
          body: { data, diperbarui_pada: new Date().toISOString() }
        });
    if (!Array.isArray(hasilSimpan) || !hasilSimpan.length) {
      throw new Error('Server tidak mengonfirmasi perubahan. Periksa hak akses admin.');
    }
  } catch (err) {
    console.error('Gagal menyimpan soal ke database:', err);
    pesan.textContent = 'Gagal menyimpan ke database: ' +
      (err && err.message ? err.message : 'Periksa koneksi dan izin admin.');
    tombol.disabled = false;
    return;
  }

  // Database sudah mengonfirmasi penyimpanan. Semua pembaruan tampilan/cache
  // dipisahkan agar kegagalan render tidak keliru dilaporkan sebagai gagal simpan.
  Object.assign(lama, data, { id });
  if (sesi && Array.isArray(sesi.soal)) {
    const diSesi = sesi.soal.find((x) => String(x.id) === id);
    if (diSesi) Object.assign(diSesi, data, { id });
  }
  const diBank = SOAL.find((x) => String(x.id) === id);
  if (diBank) Object.assign(diBank, data, { id });

  let catatanTampilan = '';
  if (soalPaketTarget) {
    soalPaketTarget.row.data = data;
    daftarSoalPaketAktif = daftarSoalPaketAktif.map(row => String(row.id) === id ? soalPaketTarget.row : row);
    renderDaftarSoalPaket();
  } else {
    try {
      DefaultSoal.asli[id] = kanon(sinId(lama));
      DefaultSoal.simpanCache();
    } catch (err) {
      console.warn('Cache soal gagal diperbarui:', err);
      catatanTampilan = ' Cache lokal perlu dimuat ulang.';
    }
  }

  if (soalLaporanTarget) {
    try {
      await rest(
        'laporan_soal?question_id=eq.' + encodeURIComponent(id) + '&status=neq.selesai',
        {
          method: 'PATCH',
          prefer: 'return=representation',
          body: { status: 'selesai' }
        }
      );
      soalLaporanTarget = null;
      await muatLaporanAdmin();
    } catch (err) {
      console.error('Soal tersimpan, tetapi pembaruan status laporan gagal:', err);
      pesan.textContent = 'Soal berhasil disimpan, tetapi status laporan belum berhasil diperbarui: ' +
        (err && err.message ? err.message : 'Kesalahan tidak diketahui.');
      tombol.disabled = false;
      return;
    }
  }

  pesan.textContent = 'Soal berhasil disimpan untuk semua pengguna.' + catatanTampilan;
  try {
    if (sesi && sesi.aktif) renderSoal();
    if ($('review') && !$('review').hidden) renderReviewIsi();
    if ($('riwayat-detail') && !$('riwayat-detail').hidden) renderDetailSesi();
  } catch (err) {
    console.error('Soal sudah tersimpan; pembaruan tampilan gagal:', err);
    pesan.textContent = 'Soal berhasil disimpan untuk semua pengguna. Pratinjau tampilan perlu dimuat ulang.';
  }

  setTimeout(tutupEditorSoalLive, 900);
}
let lastPollSoalAt = Date.now() - 60000;
async function pantauPerubahanSoalAktif() {
  if (ADMIN || !Object.keys(DefaultSoal.urutan).length) return;
  try {
    // Ambil semua perubahan sejak pemeriksaan sukses terakhir, dengan overlap 30 detik.
    // Jika koneksi putus, batas waktu tidak maju sehingga perubahan lama tetap akan terambil.
    const sejak = new Date(lastPollSoalAt - 30000).toISOString();
    const rows = await rest('soal_default?select=id,data,diperbarui_pada&diperbarui_pada=gt.' + encodeURIComponent(sejak) + '&order=diperbarui_pada.asc');
    lastPollSoalAt = Date.now();
    if (!Array.isArray(rows) || !rows.length) return;
    let cacheBerubah = false, soalAktifBerubah = false;
    rows.forEach((row) => {
      const id = String(row.id);
      const dataBaru = row.data;
      if (!dataBaru) return;
      const indeks = SOAL.findIndex(x => String(x.id) === id);
      if (indeks < 0 || kanon(dataBaru) === kanon(sinId(SOAL[indeks]))) return;
      const sesiIndeks = sesi && sesi.aktif ? sesi.soal.findIndex(x => String(x.id) === id) : -1;
      const soalSesi = sesiIndeks >= 0 ? sesi.soal[sesiIndeks] : null;
      const terkunci = !!(soalSesi && sesi.mode === 'latihan' && sesi.kunci[sesiIndeks]);
      if (terkunci && SOAL[indeks] === soalSesi) {
        // Jawaban yang sudah dinilai tetap memakai snapshot lama; sesi berikutnya memakai versi baru.
        SOAL[indeks] = { ...SOAL[indeks], ...dataBaru, id };
      } else {
        Object.assign(SOAL[indeks], dataBaru, { id });
      }
      if (soalSesi && !terkunci) {
        Object.assign(soalSesi, dataBaru, { id });
        if (sesiIndeks === sesi.i) soalAktifBerubah = true;
      }
      DefaultSoal.asli[id] = kanon(dataBaru);
      cacheBerubah = true;
    });
    if (cacheBerubah) {
      DefaultSoal.simpanCache();
      if (soalAktifBerubah) renderSoal();
      if (document.body.dataset.hal === 'bank' && $('kartu-form').hidden) renderSemuaBank();
    }
  } catch (err) {
    console.warn('Pemeriksaan pembaruan soal gagal:', err);
  }
}
setInterval(pantauPerubahanSoalAktif, 15000);

function hasilRinci(soal, jawab, poin, mode) {
  const n = soal.length;
  const kosong = soal.filter((s, k) => jawab[k] === null || jawab[k] === undefined).length;
  const benar = soal.filter((s, k) => jawabBenar(s, jawab[k])).length;
  const parsial = soal.filter((s, k) => skorJawaban(s, jawab[k]) > 0 && skorJawaban(s, jawab[k]) < 1).length;
  const salah = Math.max(0, n - benar - parsial - kosong);
  const p = Math.round((poin / n) * 100);
  const C = 2 * Math.PI * 52;
  $('hasil-ring').innerHTML = `<svg viewBox="0 0 128 128" aria-hidden="true"><circle class="dasar" cx="64" cy="64" r="52"/><circle class="isi ${p >= 75 ? 't' : p >= 50 ? 's' : 'r'}" cx="64" cy="64" r="52" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - p / 100)).toFixed(1)}"/></svg><b>${p}%</b>`;
  $('hasil-ket').textContent = `${mode === 'tryout' ? 'Ngebut' : 'Santai'} · ${n} soal`;
  const w = (v) => `${(v / n) * 100}%`;
  const mp = {};
  soal.forEach((s, k) => { const m = s.mataPelajaran; mp[m] = mp[m] || { n: 0, b: 0 }; mp[m].n++; mp[m].b = tambahSkor(mp[m].b, skorJawaban(s, jawab[k])); });
  const baris = Object.entries(mp).map(([m, x]) => { const q = Math.round((x.b / x.n) * 100); return `<div class="hbar"><span class="nm">${esc(namaMapel(m))}</span><div class="tr"><div class="fl ${q < 50 ? 'lv-rendah' : q < 75 ? 'lv-sedang' : 'lv-tinggi'}" style="width:${Math.max(2, q)}%"></div></div><span class="nilai">${q}% <span class="muted">· ${angkaSkor(x.b)}/${x.n}</span></span></div>`; }).join('');
  $('hasil-rinci').innerHTML = `<p class="label" style="margin-top:0">Komposisi jawaban</p>
    <div class="komposisi" role="img" aria-label="${benar} benar, ${parsial} parsial, ${salah} salah, ${kosong} kosong"><span class="seg-benar" style="width:${w(benar)}"></span><span class="seg-parsial" style="width:${w(parsial)}"></span><span class="seg-salah" style="width:${w(salah)}"></span><span class="seg-kosong" style="width:${w(kosong)}"></span></div>
    <div class="legenda besar"><span><i class="seg-benar"></i>Benar ${benar}</span><span>Parsial ${parsial}</span><span><i class="seg-salah"></i>Salah ${salah}</span><span><i class="seg-kosong"></i>Kosong ${kosong}</span></div>
    <p class="label">Akurasi per mata pelajaran</p>${baris}`;
}
function selesai() {
  if (!sesi || !sesi.aktif) return;
  $('modal-ex').hidden = true;
  filterReview = 'semua';
  clearInterval(sesi.timer);
  sesi.aktif = false;
  hapusSesiAktif();
  const { mode, soal, jawab, kunci } = sesi;
  const paketTryoutPreview = !!sesi.paketTryoutId;
  const durasi = Math.min(Math.round((Date.now() - sesi.mulai) / 1000), paketTryoutPreview ? Number(sesi.durasiMaks) || sesi.sisaAwal || soal.length * DETIK_PER_SOAL : soal.length * DETIK_PER_SOAL);
  if (mode === 'latihan') jawab.forEach((j, k) => { if (!kunci[k]) jawab[k] = null; });
  if (mode === 'tryout' && !paketTryoutPreview) soal.forEach((s, k) => {
    const skor = skorJawaban(s, jawab[k]);
    Penyimpanan.catat(s, skor);
    Riwayat.catat(s, jawab[k], skor);
    if (jawab[k] !== null) PilihanStat.catat(s, jawab[k]);
  });
  const poin = soal.reduce((total, s, k) => total + skorJawaban(s, jawab[k]), 0);
  const benar = soal.filter((s, k) => jawabBenar(s, jawab[k])).length;
  if (!paketTryoutPreview) catatSesi(mode, soal, jawab, durasi, poin);
  $('skor').textContent = `${angkaSkor(poin)} / ${soal.length}`;
  $('persen').textContent = `Nilai ${Math.round((poin / soal.length) * 100)}%`;
  $('waktu').textContent = mode === 'tryout' ? `Waktu pengerjaan: ${format(durasi)}` : '';
  hasilRinci(soal, jawab, poin, mode);
  renderLaporan();
  tampil('hasil');
}

// ---------- Laporan perkembangan (dibandingkan statistik sebelum sesi) ----------
function badgeUbah(delta) {
  if (delta === null) return '<span class="delta baru">Baru</span>';
  if (delta > 0) return `<span class="delta naik">&#9650; +${delta} poin</span>`;
  if (delta < 0) return `<span class="delta turun">&#9660; ${delta} poin</span>`;
  return '<span class="delta tetap">Tetap</span>';
}
function renderLaporan() {
  const el = $('laporan-kemajuan');
  const awal = sesi.statAwal || Penyimpanan.kosong();
  const kini = Penyimpanan.ambil();
  const tambah = kini.total - awal.total;
  if (tambah <= 0) {
    el.innerHTML = '<h2>Laporan perkembangan</h2><p class="muted">Belum ada jawaban yang tercatat di sesi ini, jadi belum ada perkembangan yang bisa dibandingkan.</p>';
    return;
  }
  const persen = (x) => (x && x.total ? Math.round((x.benar / x.total) * 100) : null);
  // Hanya item yang bertambah datanya di sesi ini
  const kumpul = (kunci, label) => Object.keys(kini[kunci]).map((n) => {
    const a = awal[kunci][n] || { total: 0, benar: 0 }, b = kini[kunci][n];
    if (b.total - a.total <= 0) return null;
    const pAwal = persen(a), pKini = persen(b);
    return { nama: label(n), dTotal: b.total - a.total, dBenar: b.benar - a.benar, pAwal, pKini, delta: pAwal === null ? null : pKini - pAwal };
  }).filter(Boolean).sort((x, y) => (y.delta ?? -999) - (x.delta ?? -999));
  const baris = (it) => `<div class="lap-baris">
      <div class="stat-judul"><span>${esc(it.nama)}</span><span>${angkaSkor(it.dBenar)} dari ${it.dTotal} poin di sesi ini</span></div>
      <div class="progress"><div class="progress-bar" style="width:${it.pKini}%;background:${warnaLevel(it.pKini)}"></div></div>
      <div class="lap-ubah"><span>${it.pAwal === null ? `Data pertama: ${it.pKini}%` : `${it.pAwal}% &rarr; ${it.pKini}%`}</span>${badgeUbah(it.delta)}</div>
    </div>`;
  const topik = kumpul('topik', (n) => n);
  const mapel = kumpul('mapel', namaMapel);
  const pAwalAll = persen(awal), pKiniAll = persen(kini);
  const deltaAll = pAwalAll === null ? null : pKiniAll - pAwalAll;
  const naik = topik.filter((t) => t.delta !== null && t.delta > 0).map((t) => `${esc(t.nama)} (+${t.delta})`);
  const turun = topik.filter((t) => t.delta !== null && t.delta < 0).map((t) => `${esc(t.nama)} (${t.delta})`);
  const baru = topik.filter((t) => t.delta === null).map((t) => esc(t.nama));
  const ringkasan = [
    naik.length ? `<p><strong>Meningkat:</strong> ${naik.join(', ')}.</p>` : '',
    turun.length ? `<p><strong>Menurun:</strong> ${turun.join(', ')}. Baca ulang pembahasannya, lalu coba lagi.</p>` : '',
    baru.length ? `<p><strong>Topik baru dikerjakan:</strong> ${baru.join(', ')}.</p>` : '',
    !naik.length && !turun.length && !baru.length ? '<p>Akurasi di topik yang dikerjakan belum berubah dibanding sebelumnya.</p>' : ''
  ].join('');
  el.innerHTML = `<h2>Laporan perkembangan</h2>
    <p class="muted">Dibandingkan dengan statistik kamu sebelum sesi ini. "Poin" artinya selisih persentase akurasi.</p>
    <div class="lap-ringkas">
      <div><div class="lap-angka">${pKiniAll}%</div><p class="muted">akurasi keseluruhan${pAwalAll !== null ? ` (sebelumnya ${pAwalAll}%)` : ''}</p>${badgeUbah(deltaAll)}</div>
      <div><div class="lap-angka">${kini.total}</div><p class="muted">total soal dikerjakan (+${tambah} di sesi ini)</p></div>
    </div>
    <div class="lap-ringkasan">${ringkasan}</div>
    <p class="label">Per topik</p>${topik.map(baris).join('')}
    <p class="label">Per mata pelajaran</p>${mapel.map(baris).join('')}`;
}

function aksiSoalReviewHTML(s, sumber, nomor) {
  const edit = ADMIN && Object.prototype.hasOwnProperty.call(DefaultSoal.urutan, String(s.id))
    ? `<button type="button" class="btn btn-secondary btn-kecil esl-trigger" data-edit-soal-review="${esc(s.id)}">Edit soal</button>` : '';
  return `<div class="lapor-soal-row aksi-soal-review"><button type="button" class="btn-lapor-icon" data-lapor-soal="${esc(s.id)}" data-sumber-soal="${esc(sumber)}" data-nomor-soal="${nomor}" aria-label="Laporkan soal" title="Laporkan soal"><span aria-hidden="true">!</span></button>${edit}</div>`;
}
function sumberSoalObjek(s) {
  return Object.prototype.hasOwnProperty.call(DefaultSoal.urutan, String(s.id)) ? 'bawaan' : 'personal';
}
function bukaEditorSoalReview(id) {
  if (!ADMIN) return;
  const s = SOAL.find(x => String(x.id) === String(id));
  if (!s || !Object.prototype.hasOwnProperty.call(DefaultSoal.urutan, String(id))) return;
  soalEditorTarget = s;
  bukaEditorSoalLive();
}

// ---------- Review ----------
let filterReview = 'semua'; // 'semua' | 'benar' | 'salah' | 'kosong'
// Isi halaman review sesuai filter yang dipilih (tanpa mengubah posisi scroll)
// Isi halaman review: filter di atas, lalu soal bisa digeser kanan-kiri
function renderReviewIsi() {
  const { soal, jawab } = sesi;
  const status = soal.map((s, k) => (jawab[k] === null ? 'kosong' : jawabBenar(s, jawab[k]) ? 'benar' : skorJawaban(s, jawab[k]) > 0 ? 'parsial' : 'salah'));
  const hitung = { semua: soal.length, benar: 0, parsial: 0, salah: 0, kosong: 0 };
  status.forEach((st) => hitung[st]++);
  const label = { semua: 'Semua', benar: 'Benar', parsial: 'Parsial', salah: 'Salah', kosong: 'Kosong' };
  const chips = Object.keys(label).map((k) =>
    `<label class="chip"><input type="radio" name="filter-review" value="${k}" ${k === filterReview ? 'checked' : ''}><span>${label[k]} (${hitung[k]})</span></label>`).join('');
  const daftar = soal
    .map((s, k) => ({ s, k, st: status[k] }))
    .filter((x) => filterReview === 'semua' || x.st === filterReview);
  const jawabanKamu = (s, j) => (j === null || j === undefined ? 'Tidak dijawab' : adaIsian(s) ? esc(j) : (s.opsi.map((o, x) => (dipilih(s, j, x) ? HURUF[x] : null)).filter(Boolean).join(', ') || '-'));
  const slide = daftar.map(({ s, k, st }) => {
    const [kelasBadge, teksBadge] = st === 'benar' ? ['benar', 'Benar'] : st === 'parsial' ? ['parsial', 'Kurang lengkap'] : st === 'salah' ? ['salah', 'Salah'] : ['kosong', 'Kosong'];
    const opsi = opsiReviewHTML(s, jawab[k]);
    return `<div class="slide-review" data-nomor="${k + 1}">
      <div class="card" style="margin-bottom:0">
        <div class="rev-meta"><span class="badge ${kelasBadge}">${teksBadge}</span><span class="no">Soal ${k + 1}</span><span class="pill-mapel" title="${esc(namaMapel(s.mataPelajaran))}">${esc(s.mataPelajaran)}</span><span class="muted">${esc(s.topik)}</span><span class="badge kosong tk-${esc(s.tingkatKesulitan)}">${esc(s.tingkatKesulitan)}</span></div>
        <div class="rev-body">
          <div><p class="rev-sub">Soal</p><div class="teks-soal">${konten(s.soal, s.gambarSoal, 'Gambar soal', s.grafik)}</div></div>
          <div><p class="rev-sub">Jawaban</p>
            <p class="rev-ket"><span>Jawabanmu: <b>${jawabanKamu(s, jawab[k])}</b></span><span>Jawaban benar: <b>${esc(kunciHuruf(s))}</b></span></p>
            <div class="opsi-list">${opsi}</div></div>
          <div class="feedback rev-pembahasan"><strong>Pembahasan</strong><div>${konten(s.pembahasan, s.gambarPembahasan, 'Gambar pembahasan')}</div></div>
          ${aksiSoalReviewHTML(s, sesi.sumberSoal && sesi.sumberSoal[k] ? sesi.sumberSoal[k] : sumberSoalObjek(s), k + 1)}
        </div>
      </div>
    </div>`;
  }).join('');
  const nomor = `<div class="nomor-rev" id="nav-nomor" aria-label="Loncat ke soal">${daftar.map((x, i) => `<button type="button" class="${x.st}" data-goto="${i}" aria-label="Soal ${x.k + 1}">${x.k + 1}</button>`).join('')}</div>`;
  const kosong = '<p class="muted">Tidak ada soal di kategori ini.</p>';
  $('daftar-review').innerHTML =
    `<div class="card" style="margin-bottom:12px"><p class="label" style="margin-top:0">Tampilkan</p>
      <div class="pilihan">${chips}</div></div>` +
    (daftar.length ? `
      ${nomor}
      <div class="navigasi-review">
        <button class="btn btn-secondary btn-kecil" id="rev-prev" aria-label="Soal sebelumnya">&lsaquo;</button>
        <span class="muted" id="rev-info"></span>
        <button class="btn btn-secondary btn-kecil" id="rev-next" aria-label="Soal berikutnya">&rsaquo;</button>
      </div>
      <div class="track-review" id="track-review">${slide}</div>` : kosong);
  if (daftar.length) {
    const tr = $('track-review');
    tr.addEventListener('scroll', perbaruiInfoReview, { passive: true });
    perbaruiInfoReview();
  }
  rumus($('review'));
}
function perbaruiInfoReview() {
  const tr = $('track-review');
  if (!tr || !tr.children.length) return;
  const idx = Math.min(tr.children.length - 1, Math.max(0, Math.round(tr.scrollLeft / (tr.clientWidth || 1))));
  $('rev-info').textContent = `Nomor ${tr.children[idx].dataset.nomor} · ${idx + 1} dari ${tr.children.length}`;
  document.querySelectorAll('#nav-nomor button').forEach((x, i) => x.classList.toggle('aktif', i === idx));
  $('rev-prev').disabled = idx === 0;
  $('rev-next').disabled = idx === tr.children.length - 1;
}
function geserReview(arah) {
  const tr = $('track-review');
  if (!tr) return;
  tr.scrollBy({ left: arah * tr.clientWidth, behavior: 'smooth' });
}
function renderReview() {
  renderReviewIsi();
  tampil('review');
  perbaruiInfoReview();
}

// ---------- Riwayat sesi: kartu per sesi, dibuka untuk melihat soal, kunci, pembahasan, dan perubahan statistik ----------
const kosongJ = (j) => j === null || j === undefined || (Array.isArray(j) && !j.length);
const skorRiwayat = (r) => Number.isFinite(Number(r.sc)) ? Number(r.sc) : (r.b ? 1 : 0);
function catatSesi(mode, soal, jawab, durasi, benar) {
  if (!AkunApp.sesi()) return;
  if (!soal.some((s, k) => !kosongJ(jawab[k]))) return; // tidak ada satu pun soal dijawab: tidak dicatat
  const item = soal.map((s, k) => ({ id: String(s.id), j: kosongJ(jawab[k]) ? null : jawab[k], b: !!jawabBenar(s, jawab[k]), sc: skorJawaban(s, jawab[k]), m: s.mataPelajaran || '', tp: s.topik || '' }));
  RiwayatSesi.catat({ id: 's' + Date.now(), t: Date.now(), mode, d: durasi, n: soal.length, b: benar, item });
}
// Data try out lama (Riwayat per soal) dijadikan sesi sekali saja: soal yang dicatat berdekatan (< 5 menit) dianggap satu sesi
function migrasiSesiLama() {
  if (!AkunApp.sesi()) return;
  try {
    if (localStorage.getItem('utbk_sesi_dimigrasi')) return;
    localStorage.setItem('utbk_sesi_dimigrasi', '1');
    if (RiwayatSesi.ambil().length) return;
    const lama = Riwayat.ambil().slice().sort((a, b) => a.t - b.t);
    if (!lama.length) return;
    const grup = [];
    lama.forEach((r) => {
      const g = grup[grup.length - 1];
      if (g && r.t - g[g.length - 1].t < 5 * 60 * 1000) g.push(r); else grup.push([r]);
    });
    const sesiLama = grup.map((g) => ({ id: 'l' + g[0].t, t: g[0].t, mode: 'tryout', d: 0, n: g.length, b: bulatSkor(g.reduce((sum, r) => tambahSkor(sum, Number.isFinite(Number(r.sc)) ? Number(r.sc) : (r.b ? 1 : 0)), 0)),
      item: g.map((r) => ({ id: String(r.id), j: kosongJ(r.j) ? null : r.j, b: !!r.b, sc: Number.isFinite(Number(r.sc)) ? Number(r.sc) : (r.b ? 1 : 0), m: r.mapel || '', tp: r.topik || '' })) }));
    RiwayatSesi.simpan(sesiLama.slice(-RiwayatSesi.MAKS));
  } catch (e) {}
}
const BATAS_SESI = 8;
let batasSesi = BATAS_SESI;
let filterSesiMapel = '';
let urutSesi = 'baru';
let rdState = null;
let posisiStat = 0;
const SV = (isi) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${isi}</svg>`;
const IK_RS = {
  jam: SV('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  ok: SV('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'),
  no: SV('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'),
  naik: SV('<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>'),
  turun: SV('<path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/>'),
  urut: SV('<path d="M8 4v16M4 16l4 4 4-4M16 20V4M12 8l4-4 4 4"/>')
};
function deltaHTML(d) {
  if (d === null) return '<span class="rs-delta baru">Baru</span>';
  if (d > 0) return `<span class="rs-delta naik" title="Selisih poin akurasi">+${d}</span>`;
  if (d < 0) return `<span class="rs-delta turun" title="Selisih poin akurasi">${d}</span>`;
  return '<span class="rs-delta tetap">sama</span>';
}
const petaSoal = () => new Map([...SOAL, ...(modeAdmin ? [] : BankSoal.ambil())].map((s) => [String(s.id), s]));
function metaItem(r, peta) {
  const s = peta.get(r.id);
  return { m: r.m || (s && s.mataPelajaran) || '', tp: r.tp || (s && s.topik) || '' };
}
// Statistik satu sesi (boleh dibatasi ke satu mata pelajaran)
function statSesi(e, peta, m) {
  const topik = {}, mapel = {};
  let n = 0, b = 0, k = 0, salah = 0;
  e.item.forEach((r) => {
    const x = metaItem(r, peta);
    if (m && x.m !== m) return;
    n++;
    if (kosongJ(r.j)) k++; else { const skor = skorRiwayat(r); b += skor; if (skor === 0) salah++; }
    [[topik, x.tp], [mapel, x.m]].forEach(([o, nm]) => {
      if (!nm) return;
      o[nm] = o[nm] || { n: 0, b: 0 };
      o[nm].n++; if (!kosongJ(r.j)) o[nm].b = tambahSkor(o[nm].b, skorRiwayat(r));
    });
  });
  return { n, b, k, s: salah, topik, mapel, p: n ? Math.round((b / n) * 100) : 0 };
}
// Tiap sesi dibandingkan dengan sesi sebelumnya (per topik dan per mapel: sesi terakhir yang memuatnya)
function analisisSesi(semua, peta, m) {
  const hasil = [];
  semua.forEach((e) => {
    const st = statSesi(e, peta, m);
    if (!st.n) return;
    const banding = (obj, kunci) => Object.entries(obj).map(([nm, x]) => {
      let p0 = null;
      for (let j = hasil.length - 1; j >= 0; j--) { const y = hasil[j].st[kunci][nm]; if (y) { p0 = Math.round((y.b / y.n) * 100); break; } }
      const p1 = Math.round((x.b / x.n) * 100);
      return { nm, n: x.n, b: x.b, p0, p1, d: p0 === null ? null : p1 - p0 };
    }).sort((a, b) => (b.d ?? -999) - (a.d ?? -999));
    const prev = hasil[hasil.length - 1];
    hasil.push({ e, st, d: prev ? st.p - prev.st.p : null, topik: banding(st.topik, 'topik'), mapel: banding(st.mapel, 'mapel') });
  });
  return hasil; // lama -> baru
}
function urutMapel(a) {
  return Object.entries(a.st.mapel).sort((x, y) => y[1].n - x[1].n || String(x[0]).localeCompare(String(y[0]))).map(([m]) => m);
}
function judulSesi(a, m) {
  const k = urutMapel(a);
  if (m) return namaMapel(m);
  if (!k.length) return 'Sesi';
  if (k.length === 1) return namaMapel(k[0]);
  if (k.length === 2) return k.map(namaMapel).join(' + ');
  return `Campuran (${k.length} mapel)`;
}
const labelHari = (t) => {
  const d = new Date(t), n = new Date();
  const hari = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const sel = Math.round((hari(n) - hari(d)) / 864e5);
  return sel === 0 ? 'Hari ini' : sel === 1 ? 'Kemarin' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};
const jamSesi = (t) => new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
const kelasSkor = (p) => (p >= 75 ? 't' : p >= 50 ? 's' : 'r');
function ringSesi(p, u) {
  const C = 2 * Math.PI * 22;
  return `<span class="sx-ring ${kelasSkor(p)}" style="--u:${u}px"><svg viewBox="0 0 52 52" aria-hidden="true"><circle class="d" cx="26" cy="26" r="22"/><circle class="i" cx="26" cy="26" r="22" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - p / 100)).toFixed(1)}" transform="rotate(-90 26 26)"/></svg><b>${p}<small>%</small></b></span>`;
}
// Item sesi (dibatasi satu mapel bila difilter) beserta statusnya
function daftarItem(e, peta, m) {
  return e.item.map((r, i) => ({ r, i, x: metaItem(r, peta) }))
    .filter((o) => !m || o.x.m === m)
    .map((o) => ({ ...o, s0: kosongJ(o.r.j) ? 'kosong' : skorRiwayat(o.r) === 1 ? 'benar' : skorRiwayat(o.r) > 0 ? 'parsial' : 'salah' }));
}
function tagMapel(a, maks) {
  const k = urutMapel(a);
  return k.slice(0, maks).map((m) => `<span class="sx-tag">${esc(namaMapel(m))}</span>`).join('') + (k.length > maks ? `<span class="sx-tag">+${k.length - maks}</span>` : '');
}
const IK_PANAH = SV('<path d="M9 6l6 6-6 6"/>');
function daftarSesiHTML() {
  const peta = petaSoal();
  let A = analisisSesi(RiwayatSesi.ambil(), peta, filterSesiMapel);
  if (urutSesi === 'baru') A = A.slice().reverse();
  if (!A.length) return '<p class="muted">Tidak ada sesi untuk mata pelajaran ini.</p>';
  let hariLalu = '';
  const kartu = A.slice(0, batasSesi).map((a) => {
    const { e, st } = a;
    const hari = labelHari(e.t);
    const kepala = hari !== hariLalu ? `<p class="sx-hari">${hari}</p>` : '';
    hariLalu = hari;
    const strip = daftarItem(e, peta, filterSesiMapel).map((o) => `<i class="${o.s0}"></i>`).join('');
    const dur = !filterSesiMapel && e.mode === 'tryout' && e.d ? ' &middot; ' + format(e.d) : '';
    return `${kepala}<button type="button" class="sx-kartu ${kelasSkor(st.p)}" data-sesi="${esc(e.id)}">
      ${ringSesi(st.p, 54)}
      <span class="sx-tengah">
        <span class="sx-atas"><b>${e.mode === 'tryout' ? 'Ngebut' : 'Santai'}</b><span>${jamSesi(e.t)}</span></span>
        <span class="sx-meta">${st.n} soal &middot; ${angkaSkor(st.b)} poin${st.k ? ' &middot; ' + st.k + ' kosong' : ''}${dur}</span>
        <span class="sx-tags">${filterSesiMapel ? `<span class="sx-tag">${esc(namaMapel(filterSesiMapel))}</span>` : tagMapel(a, 2)}</span>
        <span class="sx-strip" aria-hidden="true">${strip}</span>
      </span>
      <span class="sx-kanan">${deltaHTML(a.d)}${IK_PANAH}</span></button>`;
  }).join('');
  const lagi = A.length > batasSesi
    ? `<div class="aksi-kecil"><button class="btn btn-secondary btn-kecil" data-lagi-sesi="1">Tampilkan lebih banyak (${A.length - batasSesi} lagi)</button></div>` : '';
  return kartu + lagi;
}
function riwayatSesiHTML() {
  const semua = RiwayatSesi.ambil();
  if (!semua.length) {
    return '<p class="label">Riwayat sesi</p><p class="muted">Belum ada sesi. Selesaikan satu latihan atau try out, hasilnya muncul di sini per sesi lengkap dengan pembahasannya.</p>';
  }
  const peta = petaSoal();
  const A = analisisSesi(semua, peta, '');
  const rata = A.length ? Math.round(A.reduce((s, x) => s + x.st.p, 0) / A.length) : 0;
  const terbaik = A.length ? Math.max(...A.map((x) => x.st.p)) : 0;
  const mapelAda = [...new Set(semua.flatMap((e) => e.item.map((r) => metaItem(r, peta).m)).filter(Boolean))];
  if (filterSesiMapel && !mapelAda.includes(filterSesiMapel)) filterSesiMapel = '';
  const fil = [['', 'Semua']].concat(mapelAda.map((m) => [m, namaMapel(m)])).map(([v, l]) => `<button type="button" class="sx-f${v === filterSesiMapel ? ' on' : ''}" data-fm="${esc(v)}" title="${esc(v ? namaMapel(v) : 'Semua mata pelajaran')}">${esc(l)}</button>`).join('');
  return `<p class="label">Riwayat sesi</p>
    <div class="sx-ringkas"><div><small>Sesi</small><b>${semua.length}</b></div><div><small>Rata-rata</small><b>${rata}%</b></div><div><small>Terbaik</small><b>${terbaik}%</b></div></div>
    <div class="sx-filter">${fil}<button type="button" class="sx-urut" id="rs-urut">${IK_RS.urut}${urutSesi === 'baru' ? 'Terbaru' : 'Terlama'}</button></div>
    <div id="rs-daftar">${daftarSesiHTML()}</div>`;
}
function bukaDetailSesi(id) {
  posisiStat = window.scrollY;
  rdState = { id, m: filterSesiMapel, filter: 'semua', batas: 12 };
  renderDetailSesi();
  tampil('riwayatdetail');
}
function renderDetailSesi() {
  const peta = petaSoal();
  const A = analisisSesi(RiwayatSesi.ambil(), peta, rdState.m);
  const a = A.find((x) => x.e.id === rdState.id);
  const kembali = '<button type="button" class="btn btn-secondary btn-kecil" data-rd="kembali">&larr; Kembali ke riwayat</button>';
  if (!a) { $('rd-isi').innerHTML = kembali + '<p class="muted" style="margin-top:12px">Sesi tidak ditemukan.</p>'; return; }
  const { e, st } = a;
  const tglPenuh = new Date(e.t).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  // perubahan statistik: chip per topik, dikelompokkan naik / turun / tetap / baru
  const chip = (t, lab) => `<span class="ubah ${t.d === null ? 'baru' : t.d > 0 ? 'naik' : t.d < 0 ? 'turun' : 'tetap'}"><b>${esc(lab(t.nm))}</b><span>${t.p0 === null ? t.p1 + '%' : t.p0 + '&rarr;' + t.p1 + '%'}</span>${t.d === null ? '' : `<i>${t.d > 0 ? '+' : ''}${t.d}</i>`}</span>`;
  const blok = (judul, kls, arr, lab = (x) => x) => (arr.length ? `<div class="ub-grup ${kls}"><p>${judul}</p><div class="ub-chips">${arr.map((t) => chip(t, lab)).join('')}</div></div>` : '');
  const perubahan = blok('Naik', 'naik', a.topik.filter((t) => t.d !== null && t.d > 0))
    + blok('Turun', 'turun', a.topik.filter((t) => t.d !== null && t.d < 0))
    + blok('Tetap', 'tetap', a.topik.filter((t) => t.d === 0))
    + blok('Topik baru', 'baru', a.topik.filter((t) => t.d === null))
    + (a.mapel.length > 1 ? blok('Per mata pelajaran', 'netral', a.mapel, namaMapel) : '');
  const daftar = daftarItem(e, peta, rdState.m);
  const hitung = { semua: daftar.length, benar: 0, parsial: 0, salah: 0, kosong: 0 };
  daftar.forEach((o) => hitung[o.s0]++);
  const label = { semua: 'Semua', benar: 'Benar', parsial: 'Parsial', salah: 'Salah', kosong: 'Kosong' };
  const chips = Object.keys(label).map((k) => `<label class="chip"><input type="radio" name="filter-rd" value="${k}" ${k === rdState.filter ? 'checked' : ''}><span>${label[k]} (${hitung[k]})</span></label>`).join('');
  const petak = daftar.map((o) => `<button type="button" class="petak ${o.s0}" data-no="${o.i}" aria-label="Soal ${o.i + 1}">${o.i + 1}</button>`).join('');
  const tampilDaftar = daftar.filter((o) => rdState.filter === 'semua' || o.s0 === rdState.filter);
  const kartuSoal = tampilDaftar.slice(0, rdState.batas).map((o) => {
    const { r, i, s0 } = o;
    const s = peta.get(r.id);
    const lb = { benar: 'Benar', parsial: 'Kurang lengkap', salah: 'Salah', kosong: 'Kosong' }[s0];
    if (!s) return `<div class="sx ${s0}" id="sx-${i}"><div class="sx-isi" style="padding-top:12px"><span class="sx-no" style="display:inline-flex">${i + 1}</span> <span class="muted">Soal ini sudah dihapus dari bank, jadi pembahasannya tidak tersedia.</span></div></div>`;
    return `<details class="sx ${s0}" id="sx-${i}">
      <summary><span class="sx-no">${i + 1}</span><span class="sx-prev">${esc(previewTeks(s.soal))}</span><span class="badge ${s0}" style="margin:0">${lb}</span></summary>
      <div class="sx-isi">
        <div class="teks-soal" style="margin-top:4px">${konten(s.soal, s.gambarSoal, 'Gambar soal', s.grafik)}</div>
        ${s.topik ? `<span class="pill-topik">${esc(s.topik)}</span>` : ''}
        <p class="rev-sub" style="margin-top:14px">Pilihan jawaban</p>
        <div class="opsi-list">${opsiReviewHTML(s, kosongJ(r.j) ? null : r.j)}</div>
        <p class="rev-ket" style="margin:12px 0"><span>Jawabanmu: <b>${teksJawabanmu(s, r.j)}</b></span><span>Kunci: <b>${esc(kunciHuruf(s))}</b></span></p>
        <div class="feedback rev-pembahasan"><strong>Pembahasan</strong><div>${konten(s.pembahasan, s.gambarPembahasan, 'Gambar pembahasan')}</div></div>
        ${aksiSoalReviewHTML(s, sumberSoalObjek(s), i + 1)}
      </div></details>`;
  }).join('');
  const daftarSoalHorizontal = `<div class="sx-list-horizontal">${kartuSoal || '<p class="muted">Tidak ada soal di kategori ini.</p>'}</div>`;
  const lagi = tampilDaftar.length > rdState.batas
    ? `<div class="aksi-kecil"><button class="btn btn-secondary btn-kecil" data-rd="lagi">Tampilkan lebih banyak (${tampilDaftar.length - rdState.batas} lagi)</button></div>` : '';
  const dur = !rdState.m && e.mode === 'tryout' && e.d ? ' &middot; ' + format(e.d) : '';
  $('rd-isi').innerHTML = `${kembali}
    <div class="card sx-hero ${kelasSkor(st.p)}" style="margin-top:12px">
      <div class="sx-hero-atas">${ringSesi(st.p, 84)}
        <div><span class="sx-mode">${e.mode === 'tryout' ? 'Ngebut' : 'Santai'}</span><h2>${tglPenuh}</h2><p class="muted" style="margin:2px 0 0">${st.n} soal${dur}</p></div></div>
      <div class="sx-tags" style="margin-top:12px">${rdState.m ? `<span class="sx-tag">${esc(namaMapel(rdState.m))}</span>` : tagMapel(a, 6)}</div>
      <div class="sx-lgd"><span><i class="benar"></i><b>${angkaSkor(st.b)}</b> poin</span><span><i class="salah"></i><b>${st.s}</b> salah</span>${st.k ? `<span><i class="kosong"></i><b>${st.k}</b> kosong</span>` : ''}</div>
      <div class="gm-petak">${petak}</div>
    </div>
    <div class="pilihan" style="margin-bottom:12px">${chips}</div>
    ${daftarSoalHorizontal}${lagi}
    <div class="card" style="margin-top:20px">
      <h3 style="margin-top:0">Perubahan statistik</h3>
      <p class="muted" style="margin:0">${a.d === null ? 'Ini sesi pertama, belum ada pembanding.' : `Akurasi ${deltaHTML(a.d)} poin dibanding sesi sebelumnya.`}</p>
      ${perubahan}
    </div>`;
  rumus($('riwayat-detail'));
}

// ---------- Statistik ----------
// ---------- Grafik statistik (dari riwayat pengerjaan asli) ----------
let periodeStat = '30';
function garisHTML(data) {
  const per = {};
  data.forEach((r) => { const k = new Date(r.t).toLocaleDateString('sv-SE'); per[k] = per[k] || { n: 0, b: 0 }; per[k].n++; per[k].b = tambahSkor(per[k].b, skorRiwayat(r)); });
  const hari = Object.keys(per).sort();
  const W = 600, H = 200, L = 36, R = 14, T = 12, B = 26;
  const x = (i) => (hari.length === 1 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (hari.length - 1));
  const y = (v) => +(T + (H - T - B) * (1 - v / 100)).toFixed(1);
  const pts = hari.map((k, i) => { const v = Math.round((per[k].b / per[k].n) * 100); return { k, v, n: per[k].n, X: +x(i).toFixed(1), Y: y(v) }; });
  const tgl = (k) => new Date(k + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  const grid = [0, 50, 100].map((v) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`).join('');
  const garis = pts.length > 1 ? `<polyline class="garis" points="${pts.map((q) => q.X + ',' + q.Y).join(' ')}"/>` : '';
  const titik = pts.map((q) => `<circle class="titik" cx="${q.X}" cy="${q.Y}" r="4"><title>${tgl(q.k)}: ${q.v}% (${q.n} soal)</title></circle>`).join('');
  const sumbu = `<text x="${pts[0].X}" y="${H - 6}" text-anchor="${pts.length > 1 ? 'start' : 'middle'}">${tgl(pts[0].k)}</text>` +
    (pts.length > 1 ? `<text x="${pts[pts.length - 1].X}" y="${H - 6}" text-anchor="end">${tgl(pts[pts.length - 1].k)}</text>` : '');
  return `<svg class="grafik-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik akurasi harian">${grid}${garis}${titik}${sumbu}</svg>` +
    (pts.length === 1 ? '<p class="muted" style="margin:6px 0 0">Latihan di minimal 2 hari berbeda diperlukan untuk melihat tren.</p>' : '');
}
function grafikStatHTML() {
  const batas = periodeStat === 'all' ? 0 : Date.now() - Number(periodeStat) * 864e5;
  const data = Riwayat.ambil().filter((r) => r.t >= batas);
  const chip = (v, l) => `<label class="chip"><input type="radio" name="periode-stat" value="${v}" ${periodeStat === v ? 'checked' : ''}><span>${l}</span></label>`;
  const kepala = `<div class="grafik-kepala"><p class="label" style="margin:0">Perkembangan belajar</p><div class="pilihan seg-r" role="radiogroup" aria-label="Periode">${chip('7', '7 hari')}${chip('30', '30 hari')}${chip('all', 'Semua')}</div></div>`;
  if (!data.length) return kepala + '<div class="state-kosong"><strong>Belum ada data pada periode ini</strong><p class="muted">Kerjakan soal untuk melihat grafik perkembanganmu.</p></div>';
  const kel = (kunci) => {
    const o = {};
    data.forEach((r) => { const k = r[kunci]; if (!k) return; o[k] = o[k] || { n: 0, b: 0 }; o[k].n++; o[k].b = tambahSkor(o[k].b, skorRiwayat(r)); });
    return o;
  };
  const pct = (x) => Math.round((x.b / x.n) * 100);
  const topik = Object.entries(kel('topik')).map(([nm, x]) => ({ nm, ...x, p: pct(x) })).sort((a, b) => a.p - b.p || b.n - a.n).slice(0, 8);
  const bar = topik.map((t) => `<div class="hbar"><span class="nm" title="${esc(t.nm)}">${esc(t.nm)}</span><div class="tr"><div class="fl ${t.p < 50 ? 'lv-rendah' : t.p < 75 ? 'lv-sedang' : 'lv-tinggi'}" style="width:${Math.max(2, t.p)}%"></div></div><span class="nilai">${t.p}% <span class="muted">· ${t.n}</span></span></div>`).join('');
  const mp = kel('mapel');
  const banding = ['PK', 'PM'].map((m) => {
    const x = mp[m];
    return `<div><span class="muted">${esc(namaMapel(m))}</span><div class="pct">${x ? pct(x) + '%' : '-'}</div><div class="tr"><div class="fl" style="width:${x ? pct(x) : 0}%"></div></div><span class="muted">${x ? x.n + ' soal' : 'Belum dikerjakan'}</span></div>`;
  }).join('');
  return kepala + `<div class="grafik-grid">
    <div class="grafik-kartu lebar"><h3>Akurasi harian</h3>${garisHTML(data)}</div>
    <div class="grafik-kartu"><h3>Akurasi per topik (terlemah dulu)</h3>${bar}<div class="legenda"><span><i class="lv-rendah"></i>&lt; 50%</span><span><i class="lv-sedang"></i>50-74%</span><span><i class="lv-tinggi"></i>&ge; 75%</span></div></div>
    <div class="grafik-kartu"><h3>Perbandingan Pengetahuan Kuantitatif dan Penalaran Matematika</h3><div class="bandingan">${banding}</div></div>
  </div><p class="muted" style="margin:10px 0 0">Grafik dihitung dari riwayat pengerjaan terbaru (maksimal 600 soal tersimpan).</p>`;
}
// Warna solid untuk bar statistik sesuai level nilai (tanpa gradasi)
function warnaLevel(p) { return p < 50 ? 'var(--salah)' : p < 75 ? 'var(--warning)' : 'var(--benar)'; }

// ---------- Kemampuan per subtopik ----------
let filterKem = 'semua', batasKem = 12;
const LABEL_KEM = { perlu: 'Perlu penguatan', sedang: 'Berkembang', data: 'Belum cukup data', dikuasai: 'Dikuasai' };
function kemampuanSubHTML() {
  const M = window._mt && window._mt();
  if (!M) return '';
  M.reset();
  const semua = [];
  Object.keys(M.idx).forEach((id) => {
    const n = M.idx[id];
    if (!n || n.type !== 'sub') return;
    const u = M.ukur(n);
    if (u.soal) semua.push({ n, u });
  });
  const dicoba = semua.filter((x) => x.u.n > 0).map((x) => {
    x.k = x.u.status === 'sedang' && x.u.n < M.K.MIN_PERLU ? 'data' : x.u.status;
    return x;
  });
  const belum = semua.length - dicoba.length;
  const urut = { perlu: 0, sedang: 1, data: 2, dikuasai: 3 };
  dicoba.sort((a, b) => urut[a.k] - urut[b.k] || a.u.acc - b.u.acc || b.u.n - a.u.n || a.n.nama.localeCompare(b.n.nama));
  const hitung = { semua: dicoba.length, perlu: 0, sedang: 0, data: 0, dikuasai: 0 };
  dicoba.forEach((x) => { hitung[x.k]++; });
  let judul = '<p class="label">Kemampuan per subtopik</p>';
  if (!dicoba.length) {
    return judul + `<p class="muted">Belum ada data subtopik. Kerjakan soal yang sudah ditandai ke subtopik, nanti akurasi dan statusnya muncul di sini.</p>`
      + `<div class="kem-foot">${belum ? `<span>${belum} subtopik punya soal tapi belum dikerjakan.</span>` : ''}<button type="button" class="btn btn-secondary btn-kecil" data-kem-materi>Jelajahi materi</button></div>`;
  }
  if (filterKem !== 'semua' && !hitung[filterKem]) filterKem = 'semua';
  const chips = [['semua', 'Semua'], ['perlu', 'Perlu penguatan'], ['sedang', 'Berkembang'], ['dikuasai', 'Dikuasai'], ['data', 'Belum cukup data']]
    .filter(([k]) => k === 'semua' || hitung[k])
    .map(([k, l]) => `<button type="button" class="kem-chip" data-kem-filter="${k}" aria-pressed="${filterKem === k}">${l} <b>${hitung[k]}</b></button>`).join('');
  const terpilih = dicoba.filter((x) => filterKem === 'semua' || x.k === filterKem);
  const lihat = terpilih.slice(0, batasKem);
  const baris = lihat.map(({ n, u, k }) => `<tr>
      <td><span class="kem-nama">${esc(n.nama)}</span><small>${esc((n.r ? n.r.nama : '') + (n.t ? ' › ' + n.t.nama : ''))}</small></td>
      <td><span class="kem-pct">${u.acc}%</span><div class="kem-bar" aria-hidden="true"><i class="st-${k}" style="width:${Math.max(2, u.acc)}%"></i></div><small>${u.b} dari ${u.n} percobaan</small></td>
      <td><span class="mt-badge st-${k}">${LABEL_KEM[k]}</span></td>
      <td class="kem-aksi"><button type="button" class="btn btn-secondary btn-kecil kem-latih-btn" data-kem-latih="${esc(n.id)}" aria-label="Latih ${esc(n.nama)}" title="Latih ${esc(n.nama)}"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"/><path d="M14 3v5h5M8 12h5M8 16h3"/><path d="m16 8 3-3 2 2-3 3-4 1z"/></svg></button></td>
    </tr>`).join('');
  const K = M.K;
  return judul + `<p class="muted" style="margin:0">Akurasi dihitung dari semua percobaanmu di subtopik tersebut. Urutan teratas adalah yang paling perlu diperkuat.</p>
    <div class="kem-ringkas">${chips}</div>
    <div class="kem-wrap"><table class="kem-tabel"><thead><tr><th>Subtopik</th><th>Akurasi</th><th>Status</th><th></th></tr></thead><tbody>${baris}</tbody></table></div>
    <div class="kem-foot">${terpilih.length > lihat.length ? `<button type="button" class="btn btn-secondary btn-kecil" data-kem-lagi>Tampilkan semua (${terpilih.length})</button>` : ''}
      ${belum ? `<span>${belum} subtopik lain belum dikerjakan.</span><button type="button" class="tp-link" data-kem-materi>Jelajahi materi</button>` : ''}</div>
    <p class="muted" style="font-size:.78rem;margin:8px 0 0">Dikuasai: akurasi ${K.AKU_KUASAI}% atau lebih dengan minimal ${K.MIN_KUASAI} percobaan di beberapa soal berbeda. Perlu penguatan: akurasi di bawah ${K.AKU_PERLU}% dengan minimal ${K.MIN_PERLU} percobaan. Di antaranya Berkembang. Kurang dari ${K.MIN_PERLU} percobaan belum cukup data.</p>`;
}
$('isi-statistik').addEventListener('click', (e) => {
  const f = e.target.closest('[data-kem-filter]'), l = e.target.closest('[data-kem-latih]');
  const g = e.target.closest('[data-kem-lagi]'), m = e.target.closest('[data-kem-materi]');
  if (!f && !l && !g && !m) return;
  if (l) { const M = window._mt && window._mt(); if (M) M.mulai(l.dataset.kemLatih); return; }
  if (m) { const b = $('btn-materi'); if (b) b.click(); return; }
  if (f) { filterKem = f.dataset.kemFilter; batasKem = 12; } else batasKem = 1e6;
  $('kemampuan-sub').innerHTML = kemampuanSubHTML();
});

function renderStatistik() {
  const d = Penyimpanan.ambil();
  const baris = (nama, x) => {
    const p = x.total ? Math.round((x.benar / x.total) * 100) : 0;
    return `<div class="stat-baris"><div class="stat-judul"><span>${esc(nama)}</span><span>${angkaSkor(x.benar)} dari ${x.total} poin (${p}%)</span></div>
      <div class="progress"><div class="progress-bar" style="width:${p}%;background:${warnaLevel(p)}"></div></div></div>`;
  };
  // Tampilkan semua mapel/topik yang ada di bank soal, termasuk yang belum pernah dikerjakan
  const semuaSoal = [...SOAL, ...(modeAdmin ? [] : BankSoal.ambil())];
  const lengkap = (obj, kunci) => {
    const hasil = { ...obj };
    semuaSoal.forEach((s) => { if (s[kunci] && !hasil[s[kunci]]) hasil[s[kunci]] = { total: 0, benar: 0 }; });
    // yang sudah dikerjakan di atas, yang belum di bawah
    return Object.fromEntries(Object.entries(hasil).sort((a, b) => (b[1].total > 0) - (a[1].total > 0)));
  };
  const baris2 = (nama, x) => x.total
    ? baris(nama, x)
    : `<div class="stat-baris"><div class="stat-judul"><span>${esc(nama)}</span><span class="muted">Belum dikerjakan</span></div>
      <div class="progress"><div class="progress-bar" style="width:0%"></div></div></div>`;
  const daftar = (obj, lab = (n) => n) => Object.keys(obj).length
    ? Object.entries(obj).map(([n, x]) => baris2(lab(n), x)).join('')
    : '<p class="muted">Belum ada data. Kerjakan soal dulu ya.</p>';
  // Topik yang sudah dikerjakan bisa dibuka untuk melihat riwayat dan pembahasannya
  batasRiwayat = {}; batasSesi = BATAS_SESI;
  migrasiSesiLama();
  // Susun topik di bawah mata pelajarannya (topik ikut mapel yang paling banyak memuatnya di bank soal)
  const pivotMapel = () => {
    const topikLengkap = lengkap(d.topik, 'topik');
    const mapelObj = lengkap(d.mapel, 'mataPelajaran');
    const hit = {};
    semuaSoal.forEach((s) => {
      if (!s.topik) return;
      hit[s.topik] = hit[s.topik] || {};
      hit[s.topik][s.mataPelajaran] = (hit[s.topik][s.mataPelajaran] || 0) + 1;
    });
    const mapelTopik = {};
    Object.entries(hit).forEach(([tp, m]) => { mapelTopik[tp] = Object.entries(m).sort((a, b) => b[1] - a[1])[0][0]; });
    // soal yang sudah dihapus: pakai mapel yang tercatat di riwayat
    Riwayat.ambil().forEach((r) => { if (r.topik && r.mapel && !mapelTopik[r.topik]) mapelTopik[r.topik] = r.mapel; });
    Object.values(mapelTopik).forEach((m) => { if (!mapelObj[m]) mapelObj[m] = { total: 0, benar: 0 }; });
    const bagian = (nama, x, topikObj) => {
      const isi = Object.keys(topikObj).length ? daftarTopik(topikObj) : '<p class="muted">Belum ada topik di mata pelajaran ini.</p>';
      return `<details class="mapel-pivot"><summary>${baris2(nama, x)}</summary><div class="isi-mapel">${isi}</div></details>`;
    };
    let html = Object.entries(mapelObj).map(([m, x]) => bagian(namaMapel(m), x,
      Object.fromEntries(Object.entries(topikLengkap).filter(([tp]) => mapelTopik[tp] === m)))).join('');
    // topik yang punya statistik tapi mapelnya tidak diketahui
    const sisa = Object.fromEntries(Object.entries(topikLengkap).filter(([tp]) => !mapelTopik[tp]));
    if (Object.keys(sisa).length) {
      const tot = Object.values(sisa).reduce((a, x) => ({ total: a.total + x.total, benar: tambahSkor(a.benar, x.benar) }), { total: 0, benar: 0 });
      html += bagian('Lainnya', tot, sisa);
    }
    return html || '<p class="muted">Belum ada data. Kerjakan soal dulu ya.</p>';
  };
  const daftarTopik = (obj) => Object.keys(obj).length
    ? Object.entries(obj).map(([n, x]) => x.total
      ? `<details class="riwayat-topik" data-topik="${esc(n)}"><summary>${baris(n, x)}</summary><div class="isi-riwayat"></div></details>`
      : baris2(n, x)).join('')
    : '<p class="muted">Belum ada data. Kerjakan soal dulu ya.</p>';
  $('isi-statistik').innerHTML =
    `<div class="ringkasan-bank">${[['Soal dikerjakan', d.total, ''], ['Poin diperoleh', angkaSkor(d.benar), 'benar'], ['Poin belum diperoleh', angkaSkor(d.total - d.benar), 'salah'], ['Akurasi', (d.total ? Math.round((d.benar / d.total) * 100) : 0) + '%', '']].map(([a, v, w]) => `<div class="stat-tile"><span>${a}</span><strong${w ? ` style="color:var(--${w})"` : ''}>${v}</strong></div>`).join('')}</div>` +
    `<div id="kemampuan-sub" style="margin-bottom:14px">${kemampuanSubHTML()}</div>` +
    `<div id="riwayat-sesi">${riwayatSesiHTML()}</div>` +
    `<div id="grafik-stat">${grafikStatHTML()}</div>` +
    `<p class="label">Per mata pelajaran</p><p class="muted" style="margin-bottom:10px">Ketuk mata pelajaran untuk melihat topiknya, lalu ketuk topik untuk melihat riwayat soal beserta pembahasannya.</p>${pivotMapel()}`;
  tampil('statistik');
  rumus($('isi-statistik'));
}

$('isi-statistik').addEventListener('change', (e) => {
  if (e.target.name === 'periode-stat') { periodeStat = e.target.value; $('grafik-stat').innerHTML = grafikStatHTML(); }
});


// Riwayat sesi: buka pembahasan, urutan, filter mapel, dan tombol "lebih banyak"
$('isi-statistik').addEventListener('click', (e) => {
  const kt = e.target.closest('.sx-kartu');
  if (kt) { bukaDetailSesi(kt.dataset.sesi); return; }
  const fm = e.target.closest('[data-fm]');
  if (fm) { filterSesiMapel = fm.dataset.fm; batasSesi = BATAS_SESI; $('riwayat-sesi').innerHTML = riwayatSesiHTML(); return; }
  if (e.target.closest('#rs-urut')) { urutSesi = urutSesi === 'baru' ? 'lama' : 'baru'; $('riwayat-sesi').innerHTML = riwayatSesiHTML(); return; }
  if (e.target.closest('button[data-lagi-sesi]')) { batasSesi += BATAS_SESI; $('rs-daftar').innerHTML = daftarSesiHTML(); return; }
});
$('riwayat-detail').addEventListener('click', (e) => {
  const lapor = e.target.closest('[data-lapor-soal]');
  if (lapor) { const s = petaSoal().get(String(lapor.dataset.laporSoal)); if (s) bukaModalLaporanSoal(s, lapor.dataset.sumberSoal, Number(lapor.dataset.nomorSoal)); return; }
  const edit = e.target.closest('[data-edit-soal-review]');
  if (edit) { bukaEditorSoalReview(edit.dataset.editSoalReview); return; }
  const pt = e.target.closest('.petak');
  if (pt) {
    let el = document.getElementById('sx-' + pt.dataset.no);
    if (!el) { rdState.filter = 'semua'; rdState.batas = 1e9; renderDetailSesi(); el = document.getElementById('sx-' + pt.dataset.no); }
    if (el) { el.open = true; el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    return;
  }
  const t = e.target.closest('[data-rd]');
  if (!t) return;
  if (t.dataset.rd === 'kembali') { tampil('statistik'); window.scrollTo(0, posisiStat); }
  else if (t.dataset.rd === 'lagi') { rdState.batas += 12; renderDetailSesi(); }
});
$('riwayat-detail').addEventListener('change', (e) => {
  if (e.target.name !== 'filter-rd') return;
  rdState.filter = e.target.value; rdState.batas = 12; renderDetailSesi();
});

// ---------- Riwayat pengerjaan per topik ----------
const BATAS_RIWAYAT = 15;
let batasRiwayat = {};
function riwayatTopikHTML(topik, batas) {
  const peta = new Map([...SOAL, ...(modeAdmin ? [] : BankSoal.ambil())].map((s) => [String(s.id), s]));
  const semua = Riwayat.ambil().filter((r) => r.topik === topik).reverse(); // terbaru dulu
  if (!semua.length) {
    return '<p class="muted">Riwayat topik ini belum tercatat. Riwayat mulai dicatat sejak fitur ini aktif, jadi kerjakan soal lagi untuk mengisinya.</p>';
  }
  const kosongJ = (j) => j === null || j === undefined || (Array.isArray(j) && !j.length);
  const poin = semua.reduce((sum, r) => sum + skorRiwayat(r), 0);
  const label = { benar: 'Benar', parsial: 'Kurang lengkap', salah: 'Salah', kosong: 'Kosong' };
  const items = semua.slice(0, batas).map((r) => {
    const st = kosongJ(r.j) ? 'kosong' : skorRiwayat(r) === 1 ? 'benar' : skorRiwayat(r) > 0 ? 'parsial' : 'salah';
    const tglPendek = new Date(r.t).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    const tglPenuh = new Date(r.t).toLocaleString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const s = peta.get(r.id);
    if (!s) {
      return `<div class="kartu-soal" style="padding:10px 12px;display:flex;gap:8px;align-items:center">
        <span class="badge ${st}">${label[st]}</span><span class="muted">${tglPendek} &middot; soal ini sudah dihapus dari bank</span></div>`;
    }
    const opsi = opsiReviewHTML(s, kosongJ(r.j) ? null : r.j);
    const jawabanmu = teksJawabanmu(s, r.j);
    return `<details class="kartu-soal">
      <summary><span class="badge ${st}">${label[st]}</span>
        <span class="pratinjau-soal">${esc(previewTeks(s.soal))}</span>
        <span class="muted" style="flex-shrink:0;font-size:.8rem">${tglPendek}</span></summary>
      <div class="isi-kartu">
        <p class="muted" style="margin-top:8px">${tglPenuh} &middot; Jawaban Anda: <strong>${jawabanmu}</strong> &middot; Kunci: <strong>${kunciHuruf(s)}</strong></p>
        <div class="teks-soal">${konten(s.soal, s.gambarSoal, 'Gambar soal', s.grafik)}</div>
        <div class="opsi-list">${opsi}</div>
        <div class="feedback"><strong>Pembahasan</strong><div>${konten(s.pembahasan, s.gambarPembahasan, 'Gambar pembahasan')}</div></div>
      </div>
    </details>`;
  }).join('');
  const lagi = semua.length > batas
    ? `<div class="aksi-kecil"><button class="btn btn-secondary btn-kecil" data-lagi="${esc(topik)}">Tampilkan lebih banyak (${semua.length - batas} lagi)</button></div>` : '';
  return `<p class="muted">${semua.length} pengerjaan &middot; ${angkaSkor(poin)} poin &middot; terbaru di atas</p>${items}${lagi}`;
}
function isiRiwayat(d) {
  const topik = d.dataset.topik;
  const isi = d.querySelector('.isi-riwayat');
  isi.innerHTML = riwayatTopikHTML(topik, batasRiwayat[topik] || BATAS_RIWAYAT);
  isi.dataset.terisi = '1';
  rumus(isi);
}
// Riwayat diisi saat topik dibuka (bukan semuanya sekaligus, supaya halaman tetap ringan)
$('isi-statistik').addEventListener('toggle', (e) => {
  const d = e.target;
  if (!d.matches || !d.matches('details.riwayat-topik') || !d.open) return;
  if (!d.querySelector('.isi-riwayat').dataset.terisi) isiRiwayat(d);
}, true);
$('isi-statistik').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-lagi]');
  if (!b) return;
  const topik = b.dataset.lagi;
  batasRiwayat[topik] = (batasRiwayat[topik] || BATAS_RIWAYAT) + BATAS_RIWAYAT;
  isiRiwayat(b.closest('details.riwayat-topik'));
});

// ---------- Ikon (SVG) ----------
function ikon(isi) {
  return `<svg class="ikon" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${isi}</svg>`;
}
const IKON = {
  kiri: ikon('<path d="M2 4h14M2 8h9M2 12h14M2 16h9"/>'),
  tengah: ikon('<path d="M2 4h14M4.5 8h9M2 12h14M4.5 16h9"/>'),
  kanan: ikon('<path d="M2 4h14M7 8h9M2 12h14M7 16h9"/>'),
  gambar: ikon('<rect x="2" y="3" width="14" height="12" rx="2"/><circle cx="6.5" cy="7" r="1.5"/><path d="M2.5 13.5l4-4 3 3 2-2 4.5 4.5"/>'),
  wrapKiri: ikon('<rect x="2" y="4" width="6" height="6" rx="1"/><path d="M10 4h6M10 7h6M10 10h6M2 13h14"/>'),
  wrapKanan: ikon('<rect x="10" y="4" width="6" height="6" rx="1"/><path d="M2 4h6M2 7h6M2 10h6M2 13h14"/>'),
  tengahGambar: ikon('<path d="M2 3h14M2 15h14"/><rect x="5.5" y="6" width="7" height="6" rx="1"/>'),
  sebaris: ikon('<path d="M2 7h14M2 11h14"/><rect x="6.5" y="6" width="5" height="6" rx="1" fill="currentColor"/>'),
  tabel: ikon('<rect x="2" y="3" width="14" height="12" rx="1.5"/><path d="M2 7.5h14M2 11h14M7 3v12M12 3v12"/>'),
  rumus: ikon('<text x="1.5" y="13" font-size="11" font-style="italic" fill="currentColor" stroke="none">fx</text>'),
  hapus: ikon('<path d="M3 5h12M7 5V3h4v2M5 5l1 11h6l1-11"/>'),
  daftarTitik: ikon('<circle cx="3" cy="5" r="1.2" fill="currentColor"/><circle cx="3" cy="9" r="1.2" fill="currentColor"/><circle cx="3" cy="13" r="1.2" fill="currentColor"/><path d="M7 5h9M7 9h9M7 13h9"/>'),
  daftarStrip: ikon('<path d="M1.5 5h3M1.5 9h3M1.5 13h3M7 5h9M7 9h9M7 13h9"/>'),
  daftarAngka: ikon('<text x="0.5" y="6.5" font-size="5.5" fill="currentColor" stroke="none">1.</text><text x="0.5" y="10.5" font-size="5.5" fill="currentColor" stroke="none">2.</text><text x="0.5" y="14.5" font-size="5.5" fill="currentColor" stroke="none">3.</text><path d="M8 5h8M8 9h8M8 13h8"/>'),
  daftarHuruf: ikon('<text x="0.5" y="6.5" font-size="5.5" fill="currentColor" stroke="none">a.</text><text x="0.5" y="10.5" font-size="5.5" fill="currentColor" stroke="none">b.</text><text x="0.5" y="14.5" font-size="5.5" fill="currentColor" stroke="none">c.</text><path d="M8 5h8M8 9h8M8 13h8"/>')
};
// Ikon ukuran: kotak dengan bagian terisi sesuai persentase
function ikonUkuran(p) {
  const w = 14 * p / 100;
  return ikon(`<rect x="2" y="4" width="14" height="10" rx="1.5"/><rect x="2" y="4" width="${w}" height="10" rx="1.5" fill="currentColor" stroke="none"/>`);
}

// ---------- Editor ala Word ----------
const TOMBOL_EDITOR = [
  { cmd: 'undo', label: '&#8630;', judul: 'Urungkan (Ctrl+Z)' },
  { cmd: 'redo', label: '&#8631;', judul: 'Ulangi (Ctrl+Y)' },
  { sep: true },
  { cmd: 'bold', label: '<b>B</b>', judul: 'Tebal (Ctrl+B)' },
  { cmd: 'italic', label: '<i>I</i>', judul: 'Miring (Ctrl+I)' },
  { cmd: 'underline', label: '<u>U</u>', judul: 'Garis bawah (Ctrl+U)' },
  { cmd: 'strikeThrough', label: '<s>S</s>', judul: 'Coret' },
  { sep: true },
  { cmd: 'subscript', label: 'x<sub>2</sub>', judul: 'Subskrip' },
  { cmd: 'superscript', label: 'x<sup>2</sup>', judul: 'Superskrip' },
  { sep: true },
  { list: 'disc', ikon: IKON.daftarTitik, judul: 'Daftar dengan titik' },
  { list: 'dash', ikon: IKON.daftarStrip, judul: 'Daftar dengan strip (-)' },
  { list: 'decimal', ikon: IKON.daftarAngka, judul: 'Daftar dengan angka (1, 2, 3)' },
  { list: 'lower-alpha', ikon: IKON.daftarHuruf, judul: 'Daftar dengan huruf (a, b, c)' },
  { sep: true },
  { cmd: 'justifyLeft', ikon: IKON.kiri, judul: 'Rata kiri' },
  { cmd: 'justifyCenter', ikon: IKON.tengah, judul: 'Rata tengah' },
  { cmd: 'justifyRight', ikon: IKON.kanan, judul: 'Rata kanan' },
  { sep: true },
  { cmd: 'formatBlock', val: 'H3', label: 'Judul', judul: 'Judul' },
  { cmd: 'fontSize', val: '2', label: 'A-', judul: 'Teks kecil' },
  { cmd: 'fontSize', val: '3', label: 'A', judul: 'Teks normal' },
  { cmd: 'fontSize', val: '5', label: 'A+', judul: 'Teks besar' },
  { cmd: 'removeFormat', label: 'Hapus format', judul: 'Hapus semua format' },
  { sep: true },
  { aksi: 'rumus', ikon: IKON.rumus, judul: 'Jadikan rumus (diapit tanda $)' },
  { sep: true },
  { aksi: 'tabel', ikon: IKON.tabel, judul: 'Sisipkan tabel' },
  { aksi: 'gambar', ikon: IKON.gambar, judul: 'Sisipkan gambar di posisi kursor' }
];
// Toolbar ringkas untuk pilihan jawaban: format dasar dan gambar saja
const TOMBOL_OPSI = TOMBOL_EDITOR.filter((t) =>
  ['bold', 'italic', 'underline', 'subscript', 'superscript'].includes(t.cmd) || t.aksi === 'gambar' || t.aksi === 'rumus');
const LIST_STYLE = { disc: 'disc', dash: '"– "', decimal: 'decimal', 'lower-alpha': 'lower-alpha' };

// Peta id wadah editor untuk setiap bagian soal
const EDITOR_IDS = {
  soal: 'ed-soal', pembahasan: 'ed-pembahasan',
  opsi0: 'ed-opsi0', opsi1: 'ed-opsi1', opsi2: 'ed-opsi2', opsi3: 'ed-opsi3', opsi4: 'ed-opsi4'
};
function getArea(key) { return $(EDITOR_IDS[key]).querySelector('.editor-area'); }
function semuaArea() { return Object.keys(EDITOR_IDS).map(getArea); }

function barGambarHTML() {
  const tombolPos = [
    ['kiri', IKON.wrapKiri, 'Kiri, teks melingkar'],
    ['tengah', IKON.tengahGambar, 'Tengah'],
    ['kanan', IKON.wrapKanan, 'Kanan, teks melingkar'],
    ['sebaris', IKON.sebaris, 'Sebaris dengan teks']
  ].map(([p, ic, j]) => `<button type="button" class="ikon-btn" data-pos="${p}" title="${j}" aria-label="${j}">${ic}</button>`).join('');
  const tombolUkuran = [25, 50, 75, 100].map((p) =>
    `<button type="button" class="ikon-btn" data-lebar="${p}" title="Lebar ${p}%" aria-label="Lebar ${p}%">${ikonUkuran(p)}</button>`).join('');
  return `<div class="bar-gambar" hidden>${tombolPos}<span class="sep"></span>${tombolUkuran}<span class="sep"></span>
    <button type="button" class="ikon-btn bahaya" data-aksi="hapus-gambar" title="Hapus gambar" aria-label="Hapus gambar">${IKON.hapus}</button></div>`;
}

// kecil = true untuk pilihan jawaban (toolbar ringkas, area lebih pendek)
const BAR_TABEL = `<div class="bar-tabel" hidden><span class="judul-bar">Tabel:</span>
  <button type="button" data-t="baris+">+ Baris</button><button type="button" data-t="kolom+">+ Kolom</button>
  <button type="button" data-t="baris-">− Baris</button><button type="button" data-t="kolom-">− Kolom</button>
  <button type="button" class="bahaya" data-t="hapus">Hapus tabel</button></div>`;
function sel2cell(area) {
  const s = window.getSelection();
  if (!s.rangeCount) return null;
  let n = s.anchorNode;
  if (n && n.nodeType === 3) n = n.parentNode;
  const c = n && n.closest ? n.closest('td,th') : null;
  return c && area.contains(c) ? c : null;
}
function isiSel(c) { c.innerHTML = '<br>'; }
function fokusSel(c) {
  const rg = document.createRange(); rg.selectNodeContents(c); rg.collapse(true);
  const s = window.getSelection(); s.removeAllRanges(); s.addRange(rg);
}
function aksiTabel(area, aksi) {
  const c = sel2cell(area);
  if (!c) return;
  const tr = c.parentNode, tbl = c.closest('table'), idx = c.cellIndex;
  if (aksi === 'hapus') { tbl.remove(); return; }
  if (aksi === 'baris+') {
    const baru = document.createElement('tr');
    for (let i = 0; i < tr.cells.length; i++) { const d = document.createElement('td'); isiSel(d); baru.appendChild(d); }
    if (tr.parentNode.tagName === 'THEAD') {
      let tb = tbl.tBodies[0];
      if (!tb) { tb = document.createElement('tbody'); tbl.appendChild(tb); }
      tb.insertBefore(baru, tb.firstChild);
    } else tr.after(baru);
    fokusSel(baru.cells[Math.min(idx, baru.cells.length - 1)]);
  } else if (aksi === 'baris-') {
    const tujuan = tr.nextElementSibling || tr.previousElementSibling;
    tr.remove();
    if (!tbl.rows.length) tbl.remove(); else if (tujuan) fokusSel(tujuan.cells[Math.min(idx, tujuan.cells.length - 1)]);
  } else if (aksi === 'kolom+') {
    [...tbl.rows].forEach((row) => {
      const d = document.createElement(row.cells[idx] && row.cells[idx].tagName === 'TH' ? 'th' : 'td');
      isiSel(d);
      row.cells[idx] ? row.cells[idx].after(d) : row.appendChild(d);
    });
    fokusSel(tr.cells[idx + 1]);
  } else if (aksi === 'kolom-') {
    if (tr.cells.length <= 1) { tbl.remove(); return; }
    [...tbl.rows].forEach((row) => row.cells[idx] && row.cells[idx].remove());
    fokusSel(tr.cells[Math.min(idx, tr.cells.length - 1)]);
  }
}
function sisipTabel(area, baris, kolom) {
  const sel = (tag) => `<${tag}><br></${tag}>`;
  const kepala = '<thead><tr>' + sel('th').repeat(kolom) + '</tr></thead>';
  const badan = '<tbody>' + ('<tr>' + sel('td').repeat(kolom) + '</tr>').repeat(Math.max(baris - 1, 1)) + '</tbody>';
  area.focus();
  document.execCommand('insertHTML', false, `<table data-baru="1">${kepala}${badan}</table><p><br></p>`);
  const tb = area.querySelector('table[data-baru]');
  if (tb) { tb.removeAttribute('data-baru'); fokusSel(tb.rows[0].cells[0]); }
}
function pemilihTabel(wadah, area, tombol) {
  const lama = wadah.querySelector('.pemilih-tabel');
  if (lama) { lama.remove(); return; }
  const R = 6, K = 8;
  const el = document.createElement('div');
  el.className = 'pemilih-tabel';
  el.innerHTML = '<div class="kisi">' + Array.from({ length: R * K }, (_, i) => `<i data-r="${Math.floor(i / K) + 1}" data-k="${(i % K) + 1}"></i>`).join('') + '</div><div class="info">Pilih ukuran tabel</div>';
  el.style.top = (tombol.offsetTop + tombol.offsetHeight + 6) + 'px';
  el.style.left = '8px';
  el.addEventListener('mousedown', (e) => e.preventDefault());
  const sorot = (r, k) => {
    el.querySelectorAll('i').forEach((c) => c.classList.toggle('on', +c.dataset.r <= r && +c.dataset.k <= k));
    el.querySelector('.info').textContent = r ? `${r} baris × ${k} kolom` : 'Pilih ukuran tabel';
  };
  el.addEventListener('mouseover', (e) => { const c = e.target.closest('i'); if (c) sorot(+c.dataset.r, +c.dataset.k); });
  el.addEventListener('click', (e) => {
    const c = e.target.closest('i');
    if (!c) return;
    el.remove();
    sisipTabel(area, +c.dataset.r, +c.dataset.k);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
  wadah.appendChild(el);
  const tutup = (e) => { if (!el.contains(e.target) && !tombol.contains(e.target)) { el.remove(); document.removeEventListener('mousedown', tutup); } };
  setTimeout(() => document.addEventListener('mousedown', tutup), 0);
}
function buatEditor(id, placeholder, kecil) {
  const wadah = $(id);
  wadah.classList.add('editor');
  const daftarTombol = kecil ? TOMBOL_OPSI : TOMBOL_EDITOR;
  wadah.innerHTML = `<div class="editor-toolbar">${daftarTombol.map((t) => {
    if (t.sep) return '<span class="sep"></span>';
    const isi = t.ikon || t.label;
    const data = t.list ? `data-list="${t.list}"` : `data-cmd="${t.cmd || ''}" data-val="${t.val || ''}" data-aksi="${t.aksi || ''}"`;
    return `<button type="button" ${data} title="${t.judul}" aria-label="${t.judul}">${isi}</button>`;
  }).join('')}</div>${kecil ? '' : BAR_TABEL}<div class="editor-area${kecil ? ' kecil' : ''}" contenteditable="true" data-placeholder="${placeholder}"></div>${barGambarHTML()}`;

  const area = wadah.querySelector('.editor-area');
  const toolbar = wadah.querySelector('.editor-toolbar');
  const bar = wadah.querySelector('.bar-gambar');
  const barT = wadah.querySelector('.bar-tabel');
  if (barT) {
    const segarkanBarT = () => { barT.hidden = !(document.activeElement === area && sel2cell(area)); };
    ['keyup', 'click', 'focus', 'input'].forEach((ev) => area.addEventListener(ev, segarkanBarT));
    document.addEventListener('selectionchange', () => { if (document.activeElement === area) segarkanBarT(); });
    barT.addEventListener('mousedown', (e) => e.preventDefault());
    barT.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-t]');
      if (!b) return;
      area.focus();
      aksiTabel(area, b.dataset.t);
      segarkanBarT();
      area.dispatchEvent(new Event('input', { bubbles: true }));
    });
    area.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const c = sel2cell(area);
      if (!c) return;
      e.preventDefault();
      const semua = [...c.closest('table').querySelectorAll('th,td')];
      const i = semua.indexOf(c) + (e.shiftKey ? -1 : 1);
      if (i >= semua.length) { aksiTabel(area, 'baris+'); return; }
      if (i >= 0) fokusSel(semua[i]);
    });
  }
  // Agar klik tombol tidak mencuri fokus/posisi kursor dari editor
  toolbar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); });
  toolbar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    editorAktif = area;
    if (b.dataset.aksi === 'rumus') {
      area.focus();
      sisipRumus();
      area.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    if (b.dataset.aksi === 'gambar') { $('file-gambar').click(); return; }
    if (b.dataset.aksi === 'tabel') return pemilihTabel(wadah, area, b);
    area.focus();
    if (b.dataset.list) {
      terapkanDaftar(b.dataset.list, area);
      area.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    document.execCommand(b.dataset.cmd, false, b.dataset.val || null);
    area.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Klik gambar di dalam editor untuk memilih dan mengatur posisinya
  area.addEventListener('click', (e) => {
    if (e.target.tagName === 'IMG') pilihGambar(e.target, bar);
    else pilihGambar(null);
  });
  area.addEventListener('focus', () => { editorAktif = area; });
  // Tombol pengatur gambar
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !gambarTerpilih) return;
    if (b.dataset.aksi === 'hapus-gambar') {
      gambarTerpilih.remove();
      pilihGambar(null);
    } else if (b.dataset.lebar) {
      gambarTerpilih.style.width = b.dataset.lebar + '%';
    } else if (b.dataset.pos) {
      aturPosisi(gambarTerpilih, b.dataset.pos);
    }
    perbaruiTandaBar(bar);
  });
}

// Membuat daftar dengan jenis penanda tertentu (titik, strip, angka, huruf)
function terapkanDaftar(jenis, area) {
  const ordered = ['decimal', 'lower-alpha'].includes(jenis);
  document.execCommand(ordered ? 'insertOrderedList' : 'insertUnorderedList', false, null);
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const n = sel.anchorNode;
  const el = (n.nodeType === 1 ? n : n.parentNode).closest('ol,ul');
  if (el && area.contains(el)) el.style.listStyleType = LIST_STYLE[jenis];
}

// Tandai tombol posisi & ukuran yang sedang dipakai gambar
function perbaruiTandaBar(bar) {
  if (!gambarTerpilih) return;
  const pos = gambarTerpilih.dataset.pos || '';
  bar.querySelectorAll('[data-pos]').forEach((b) => b.classList.toggle('aktif', b.dataset.pos === pos));
  bar.querySelectorAll('[data-lebar]').forEach((b) => b.classList.toggle('aktif', b.dataset.lebar === String(parseInt(gambarTerpilih.style.width) || 60)));
}

// Atur gaya gambar sesuai posisi yang dipilih, lebarnya tetap
function aturPosisi(img, pos) {
  const lebar = img.style.width || '60%';
  img.removeAttribute('style');
  img.style.width = lebar;
  img.dataset.pos = pos;
  const gaya = {
    tengah: { display: 'block', float: 'none', margin: '8px auto' },
    kiri: { display: 'block', float: 'left', margin: '4px 16px 8px 0' },
    kanan: { display: 'block', float: 'right', margin: '4px 0 8px 16px' },
    sebaris: { display: 'inline-block', float: 'none', margin: '0 4px', verticalAlign: 'middle' }
  }[pos];
  Object.entries(gaya).forEach(([k, v]) => (img.style[k] = v));
}
function pilihGambar(img, bar) {
  if (gambarTerpilih) gambarTerpilih.classList.remove('terpilih');
  if (barTerpilih) barTerpilih.hidden = true;
  gambarTerpilih = img;
  barTerpilih = img ? bar : null;
  if (img) {
    img.classList.add('terpilih');
    bar.hidden = false;
    perbaruiTandaBar(bar);
  }
}
// Sisipkan gambar di posisi kursor terakhir di editor
function sisipkanGambar(src) {
  const area = editorAktif || getArea('soal');
  area.focus();
  const img = document.createElement('img');
  img.src = src;
  img.alt = 'Gambar';
  img.style.width = '60%';
  aturPosisi(img, 'tengah');
  let r;
  if (rentangTersimpan && area.contains(rentangTersimpan.commonAncestorContainer)) {
    r = rentangTersimpan.cloneRange();
  } else {
    r = document.createRange();
    r.selectNodeContents(area);
    r.collapse(false);
  }
  r.deleteContents();
  r.insertNode(img);
  const setelah = document.createRange();
  setelah.setStartAfter(img);
  setelah.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(setelah);
  rentangTersimpan = setelah.cloneRange();
}
// Simpan posisi kursor setiap kali berubah di dalam editor
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const n = sel.anchorNode;
  const area = semuaArea().find((a) => a.contains(n));
  if (area) { rentangTersimpan = sel.getRangeAt(0).cloneRange(); editorAktif = area; }
});
// Klik di luar editor: lepas pilihan gambar
document.addEventListener('click', (e) => {
  if (!e.target.closest('.editor')) pilihGambar(null);
});

// Bungkus teks yang diblok dengan tanda $ (rumus), atau sisipkan $$ kosong jika tidak ada yang diblok
function sisipRumus() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const teks = sel.toString();
  if (teks) {
    document.execCommand('insertText', false, '$' + teks + '$');
  } else {
    document.execCommand('insertText', false, '$$');
    sel.modify('move', 'backward', 'character');
  }
}
// Cek apakah masih ada perintah LaTeX (seperti \text atau \frac) yang tidak diapit tanda $
function adaRumusTanpaTanda(teks) {
  const bersih = teks
    .replace(/\$\$[\s\S]*?\$\$/g, '')
    .replace(/\$[^$]*\$/g, '')
    .replace(/\\\([\s\S]*?\\\)/g, '')
    .replace(/\\\[[\s\S]*?\\\]/g, '');
  return /\\[a-zA-Z]+/.test(bersih);
}
function kosongEditor(area) {
  return !area.textContent.trim() && !area.querySelector('img');
}

// ---------- Folder ----------
function namaFolder(id) {
  if (!id) return 'Belum dikelompokkan';
  const f = BankFolder.ambil().find((x) => x.id === id);
  return f ? f.nama : 'Belum dikelompokkan';
}
// Susun soal per grup: setiap folder (urut dibuat), lalu "Belum dikelompokkan"
// Hanya grup yang dipilih di filter yang diambil
let filterPetaAktif = false;
// Soal yang belum punya padanan di taksonomi (perlu dipetakan oleh admin)
function perluDipetakan(s) { return !topikTaxById(s.topikId) && !cariTopikTax(s.mataPelajaran, s.topik); }
function grupSoal() {
  const semua = BankSoal.ambil();
  const folders = BankFolder.ambil();
  let grup = [...folders.map((f) => ({ id: f.id, nama: f.nama })), { id: null, nama: 'Belum dikelompokkan' }];
  if (filterAktif === 'none') grup = grup.filter((g) => g.id === null);
  else if (filterAktif !== 'semua') grup = grup.filter((g) => g.id === filterAktif);
  return grup.map((g) => ({ ...g, items: semua.filter((s) => (s.folderId || null) === g.id && (!filterPetaAktif || perluDipetakan(s))) }));
}
function renderChipFolder() {
  const folders = BankFolder.ambil();
  if (filterAktif !== 'semua' && filterAktif !== 'none' && !folders.some((f) => f.id === filterAktif)) filterAktif = 'semua';
  const chips = [['semua', 'Semua'], ['none', 'Belum dikelompokkan'], ...folders.map((f) => [f.id, f.nama])];
  $('chip-folder').innerHTML = chips.map(([v, t]) =>
    `<label class="chip"><input type="radio" name="f-filter" value="${esc(v)}" ${v === filterAktif ? 'checked' : ''}><span>${esc(t)}</span></label>`).join('');
  $('aksi-folder').hidden = !folders.some((f) => f.id === filterAktif);
}
function renderOpsiFolder(terpilih) {
  $('f-folder').innerHTML = '<option value="">Belum dikelompokkan</option>' +
    BankFolder.ambil().map((f) => `<option value="${esc(f.id)}">${esc(f.nama)}</option>`).join('');
  $('f-folder').value = terpilih || '';
}
function pesanFolder(teks, err) {
  const p = $('pesan-folder');
  p.textContent = teks;
  p.className = 'pesan ' + (err ? 'err' : 'ok');
}
function tambahFolder() {
  const nama = $('folder-baru').value.trim();
  if (!nama) return pesanFolder('Nama folder belum diisi.', true);
  const list = BankFolder.ambil();
  list.push({ id: 'f' + Date.now(), nama });
  if (!BankFolder.simpan(list)) return pesanFolder('Penyimpanan browser penuh.', true);
  $('folder-baru').value = '';
  pesanFolder(`Folder "${nama}" dibuat.`, false);
  renderSemuaBank();
}
function ubahNamaFolder() {
  const list = BankFolder.ambil();
  const f = list.find((x) => x.id === filterAktif);
  if (!f) return;
  const baru = prompt('Nama baru untuk folder ini:', f.nama);
  if (baru === null) return;
  const t = baru.trim();
  if (!t) return pesanFolder('Nama folder tidak boleh kosong.', true);
  f.nama = t.slice(0, 40);
  BankFolder.simpan(list);
  pesanFolder('Nama folder diubah.', false);
  renderSemuaBank();
}
function hapusFolder() {
  if (!confirm('Hapus folder ini? Soal di dalamnya akan dipindah ke "Belum dikelompokkan".')) return;
  BankFolder.simpan(BankFolder.ambil().filter((f) => f.id !== filterAktif));
  BankSoal.simpan(BankSoal.ambil().map((s) => (s.folderId === filterAktif ? { ...s, folderId: null } : s)));
  filterAktif = 'semua';
  pesanFolder('Folder dihapus.', false);
  renderSemuaBank();
}
// Pindahkan satu soal ke folder lain
function pindahkanSoal(id, folderId) {
  const daftar = BankSoal.ambil();
  const s = daftar.find((x) => x.id === id);
  if (!s) return;
  s.folderId = folderId || null;
  BankSoal.simpan(daftar);
  renderSemuaBank();
}

// ---------- Bank soal ----------

async function muatLaporanAdmin() {
  if (!ADMIN) return;

  const wadah = $('daftar-laporan-admin');
  const ringkasan = $('ringkasan-laporan-admin');

  wadah.innerHTML = '<p class="muted">Memuat laporan...</p>';

  try {
    const laporan = await rest(
      'laporan_soal?select=id,user_id,question_id,question_title,question_source,category,description,status,admin_reply,created_at,replied_at&order=created_at.desc&limit=100'
    );

  const laporanAktif = laporan.filter(x => x.status !== 'selesai');
const jumlah = laporanAktif.length;
ringkasan.innerHTML = `
  <div class="card">
    <strong>${jumlah}</strong>
    <span>Total laporan</span>
  </div>
`;
    if (!jumlah) {
      wadah.innerHTML = '<p class="muted">Belum ada laporan soal.</p>';
      return;
    }

    const kategori = {
      soal_salah: 'Soal salah',
      opsi_tidak_sesuai: 'Opsi tidak sesuai',
      kunci_jawaban_salah: 'Kunci jawaban salah',
      pembahasan_salah: 'Pembahasan salah',
      gambar_bermasalah: 'Gambar bermasalah',
      lainnya: 'Lainnya'
    };

   const status = {
  baru: 'Baru',
  selesai: 'Selesai'
};
    wadah.innerHTML = laporanAktif.map(x => {
      const tanggal = new Date(x.created_at).toLocaleString('id-ID', {
        dateStyle: 'medium',
        timeStyle: 'short'
      });

     return `
  <article class="laporan-item">
    <div class="laporan-item-head">
      <strong>${esc(x.question_title || 'Soal tanpa judul')}</strong>
      <span class="laporan-status">
        ${esc(status[x.status] || x.status)}
      </span>
    </div>

    <p class="muted">
      ID laporan: ${esc(x.id)} · ID soal: ${esc(x.question_id)}
    </p>

    <p><strong>Sumber soal:</strong>
      ${x.question_source === 'bawaan' ? 'Soal bawaan' :
        x.question_source === 'personal' ? 'Soal personal pengguna' :
        'Belum tercatat (laporan lama)'}
    </p>

    <p><strong>Kategori:</strong>
      ${esc(kategori[x.category] || x.category)}
    </p>

    <p><strong>Keterangan pengguna:</strong></p>
    <p>${esc(x.description || 'Tidak ada keterangan tambahan.')}</p>

    <small class="muted">Dikirim: ${esc(tanggal)}</small>

    ${x.question_source === 'bawaan' ? `
      <div class="laporan-aksi-soal">
        <button type="button" class="btn btn-secondary btn-kecil" data-preview-laporan="${esc(x.question_id)}">Pratinjau soal</button>
        <button type="button" class="btn btn-primary btn-kecil" data-edit-laporan="${esc(x.question_id)}">Edit soal</button>
      </div>
    ` : '<p class="muted laporan-preview-info">Pratinjau otomatis tersedia untuk soal bawaan.</p>'}
  </article>
`;
    }).join('');
wadah.querySelectorAll('[data-preview-laporan]').forEach((btn) => {
  btn.addEventListener('click', () => bukaPratinjauSoalDariLaporan(btn.dataset.previewLaporan));
});
wadah.querySelectorAll('[data-edit-laporan]').forEach((btn) => {
  btn.addEventListener('click', () => {
    bukaEditorSoalDariLaporan(btn.dataset.editLaporan);
  });
});
  } catch (err) {
    console.error('Gagal memuat laporan:', err);
    wadah.innerHTML = `
      <p class="muted">
        Gagal memuat laporan. Periksa koneksi atau izin akses admin.
      </p>
      <button class="btn btn-secondary" id="btn-ulangi-muat-laporan">
        Coba lagi
      </button>
    `;

    $('btn-ulangi-muat-laporan')?.addEventListener('click', muatLaporanAdmin);
  }
}

function tampilkanPanelAdmin() {
  $('kartu-admin').hidden = !ADMIN;
  $('nav-laporan-admin').hidden = !ADMIN;
  if (!ADMIN) $('sw-admin').checked = false;
}
function terapkanModeAdmin() {
  filterAktif = 'semua';
  resetForm();
  renderSemuaBank();
  buatDatalist();
}
async function keluarModeAdmin() {
  if (!modeAdmin) { tampilkanPanelAdmin(); return; }
  modeAdmin = false;
  $('sw-admin').checked = false;
  tampilkanPanelAdmin();
  terapkanModeAdmin();
  await DefaultSoal.antrean;
  segarkanSoalBawaan(true);
}
async function bukaKonfirmasiMuatAdmin() {
  const dialog = $('modal-admin-muat');
  const input = $('admin-jumlah-soal');
  const info = $('admin-soal-tersedia');
  const tombolMuat = $('btn-konfirmasi-admin-muat');
  const status = $('admin-muat-status');
  dialog.showModal();
  input.disabled = true;
  tombolMuat.disabled = true;
  info.textContent = 'Memeriksa jumlah soal terbaru...';
  status.textContent = '';
  status.className = 'pesan';
  try {
    const total = await DefaultSoal.hitung();
    input.max = String(total);
    input.min = String(total > 0 ? 1 : 0);
    input.value = String(Math.min(total, 100));
    input.disabled = false;
    tombolMuat.disabled = false;
    info.textContent = total.toLocaleString('id-ID') + ' soal tersedia. Pilih jumlah soal terbaru yang ingin ditampilkan.';
    input.focus();
    input.select();
  } catch (err) {
    info.textContent = 'Jumlah soal tidak dapat diperiksa.';
    status.textContent = err.message;
    status.className = 'pesan err';
  }
}
$('sw-admin').addEventListener('change', async (e) => {
  if (e.target.checked) {
    e.target.checked = false;
    bukaKonfirmasiMuatAdmin();
  } else {
    await keluarModeAdmin();
    statusAdmin('', false);
  }
});
$('btn-batal-admin-muat').addEventListener('click', () => $('modal-admin-muat').close());
$('modal-admin-muat').addEventListener('click', (e) => {
  if (e.target === $('modal-admin-muat')) $('modal-admin-muat').close();
});
$('modal-admin-muat').addEventListener('close', () => $('sw-admin').focus());
$('btn-konfirmasi-admin-muat').addEventListener('click', async () => {
  const input = $('admin-jumlah-soal');
  const jumlah = Number(input.value);
  const total = Number(input.max);
  const status = $('admin-muat-status');
  const minimum = total > 0 ? 1 : 0;
  if (input.value.trim() === '' || !Number.isInteger(jumlah) || jumlah < minimum || jumlah > total) {
    status.textContent = 'Masukkan jumlah antara ' + minimum.toLocaleString('id-ID') + ' dan ' + total.toLocaleString('id-ID') + '.';
    status.className = 'pesan err';
    input.focus();
    return;
  }
  const tombol = $('btn-konfirmasi-admin-muat');
  tombol.disabled = true;
  input.disabled = true;
  status.textContent = 'Memuat ' + jumlah.toLocaleString('id-ID') + ' soal terbaru...';
  status.className = 'pesan';
  try {
    await DefaultSoal.muatTerbaru(jumlah);
    modeAdmin = true;
    $('sw-admin').checked = true;
    terapkanModeAdmin();
    $('modal-admin-muat').close();
    statusAdmin('Mode admin aktif. ' + SOAL.length.toLocaleString('id-ID') + ' soal terbaru ditampilkan; perubahan tetap tersimpan ke server.', false);
  } catch (err) {
    status.textContent = 'Gagal memuat soal: ' + err.message;
    status.className = 'pesan err';
    tombol.disabled = false;
    input.disabled = false;
  }
});
$('btn-muat-ulang-bawaan').addEventListener('click', async () => {
  try {
    await DefaultSoal.antrean;
    if (modeAdmin && DefaultSoal.muatTerbatas) await DefaultSoal.muatTerbaru(DefaultSoal.jumlahMuatTerbatas);
    else await DefaultSoal.muat();
    buatDatalist(); renderSemuaBank(); renderPilihSumber();
    statusAdmin('Soal bawaan dimuat ulang dari server.', false);
  } catch (err) { statusAdmin('Gagal memuat ulang: ' + err.message, true); }
});
function validasiSoal(daftar) {
  const hasil = [];
  const teksDari = (h) => { const d = document.createElement('div'); d.innerHTML = h || ''; return d; };
  const kosong = (h) => { const d = teksDari(h); return !d.textContent.trim() && !d.querySelector('img,table'); };
  const norm = (h) => { const d = teksDari(h); return d.querySelector('img') ? 'img:' + h : d.textContent.replace(/\s+/g, ' ').trim().toLowerCase(); };
  const idPernah = new Map(), soalPernah = new Map();
  daftar.forEach((s, n) => {
    const err = [], per = [];
    const id = String(s.id);
    if (idPernah.has(id)) err.push('ID kembar dengan soal no. ' + (idPernah.get(id) + 1)); else idPernah.set(id, n);
    if (!['PK', 'PM'].includes(s.mataPelajaran)) err.push('Mata pelajaran harus Pengetahuan Kuantitatif atau Penalaran Matematika (sekarang: ' + namaMapel(s.mataPelajaran) + ')');
    if (!['mudah', 'sedang', 'sulit'].includes(s.tingkatKesulitan)) err.push('Tingkat kesulitan tidak valid (' + s.tingkatKesulitan + ')');
    if (!String(s.topik || '').trim()) err.push('Topik kosong');
    if (kosong(s.soal)) err.push('Teks soal kosong');
    if (kosong(s.pembahasan)) err.push('Pembahasan kosong');
    if (s.grafik && window.NalarineGraph) {
      const errorGrafik = window.NalarineGraph.validate(s.grafik);
      if (errorGrafik) err.push('Konfigurasi grafik tidak valid: ' + errorGrafik);
    }
    const tipe = tipeSoal(s);
    if (tipe === 'isian') {
      if (!Number.isInteger(s.jawaban) || s.jawaban < 0) err.push('Kunci isian harus bilangan cacah (sekarang: ' + s.jawaban + ')');
      if (s.opsi && s.opsi.length) per.push('Soal isian tidak perlu pilihan');
    } else {
      const minOpsi = tipe === 'kompleks' ? 4 : 5;
      if (!Array.isArray(s.opsi) || s.opsi.length < minOpsi || s.opsi.length > 5) err.push((tipe === 'kompleks' ? 'Pilihan kompleks harus 4 atau 5' : 'Pilihan harus tepat 5') + ' (sekarang: ' + (s.opsi ? s.opsi.length : 0) + ')');
      else {
        const lihat = new Map();
        s.opsi.forEach((o, k) => {
          if (kosong(o)) err.push('Pilihan ' + HURUF[k] + ' kosong');
          else {
            const kunci = norm(o);
            if (lihat.has(kunci)) err.push('Pilihan ' + HURUF[k] + ' sama dengan pilihan ' + HURUF[lihat.get(kunci)]); else lihat.set(kunci, k);
            if (adaRumusTanpaTanda(teksDari(o).textContent)) per.push('Pilihan ' + HURUF[k] + ' punya rumus tanpa tanda $');
            if ((teksDari(o).textContent.match(/\$/g) || []).length % 2) per.push('Pilihan ' + HURUF[k] + ' punya jumlah tanda $ ganjil');
          }
        });
      }
      if (tipe === 'kompleks') {
        if (!s.jawaban.length) err.push('Kunci kompleks kosong');
        if (s.jawaban.some((k) => !Number.isInteger(k) || k < 0 || k > 4)) err.push('Kunci di luar A-E');
        if (new Set(s.jawaban).size !== s.jawaban.length) err.push('Kunci kompleks ada yang dobel');
      } else if (!Number.isInteger(s.jawaban) || s.jawaban < 0 || s.jawaban > 4) err.push('Kunci di luar A-E (sekarang: ' + s.jawaban + ')');
    }
    [['soal', s.soal], ['pembahasan', s.pembahasan]].forEach(([nm, h]) => {
      const tk = teksDari(h).textContent;
      if (adaRumusTanpaTanda(tk)) per.push('Teks ' + nm + ' punya rumus tanpa tanda $');
      if ((tk.match(/\$/g) || []).length % 2) per.push('Teks ' + nm + ' punya jumlah tanda $ ganjil');
    });
    // Soal grafik dapat memiliki redaksi sama tetapi data visual berbeda.
    // Karena itu, duplikasi dinilai dari teks + konfigurasi grafik, bukan teks saja.
    const kS = norm(s.soal) + (s.grafik ? '|grafik:' + JSON.stringify(s.grafik) : '');
    if (kS && soalPernah.has(kS)) per.push('Teks dan data soal sama dengan soal no. ' + (soalPernah.get(kS) + 1)); else if (kS) soalPernah.set(kS, n);
    if (err.length || per.length) hasil.push({ n, s, err, per });
  });
  return hasil;
}
function jalankanValidasi() {
  const daftar = SOAL;
  const hasil = validasiSoal(daftar);
  const kotak = $('hasil-validasi');
  const nErr = hasil.filter((h) => h.err.length).length;
  let html = hasil.length
    ? `<p class="vl-ringkas">${daftar.length} soal diperiksa: ${nErr} bermasalah, ${hasil.length - nErr} hanya peringatan.</p>`
    : `<p class="vl-ringkas" style="color:var(--benar)">${daftar.length} soal diperiksa: tidak ada masalah.</p>`;
  hasil.forEach(({ n, s, err, per }) => {
    const ringkas = esc((teksDari2(s.soal)).slice(0, 70));
    html += `<div class="vl-item${err.length ? '' : ' peringatan'}"><b>No. ${n + 1} (id ${esc(String(s.id))}, ${esc(String(s.mataPelajaran))} · ${esc(String(s.topik))})</b><span class="muted">${ringkas}</span><ul>`
      + err.map((e) => `<li>${esc(e)}</li>`).join('') + per.map((e) => `<li>${esc(e)} (peringatan)</li>`).join('') + '</ul>'
      + (modeAdmin ? `<button class="btn btn-secondary btn-kecil" data-edit="${esc(String(s.id))}">Edit soal ini</button>` : '') + '</div>';
  });
  if (hasil.length && !modeAdmin) html += '<p class="muted" style="margin-top:8px">Aktifkan "Kelola soal bawaan" di atas untuk membuka tombol Edit.</p>';
  kotak.innerHTML = html;
}
function teksDari2(h) { const d = document.createElement('div'); d.innerHTML = h || ''; return d.textContent.replace(/\s+/g, ' ').trim(); }
$('btn-validasi').addEventListener('click', jalankanValidasi);
$('hasil-validasi').addEventListener('click', (e) => {
  const b = e.target.closest('[data-edit]');
  if (b) mulaiEdit(b.dataset.edit);
});
function renderEditorStat() {
  const d = Penyimpanan.ambil();
  const baris = (grup, nama, v, tetap) => `<div class="es-baris" data-grup="${grup}">`
    + (tetap ? `<span>${esc(nama)}</span>` : `<input class="nm" value="${esc(nama)}" placeholder="Nama topik" aria-label="Nama topik">`)
    + `<input class="tt" type="number" min="0" step="1" value="${v.total || 0}" aria-label="Total">`
    + `<input class="bn" type="number" min="0" step="1" value="${v.benar || 0}" aria-label="Benar">`
    + (tetap ? '<span></span>' : '<button type="button" class="x" title="Hapus">✕</button>') + '</div>';
  const mapel = { PK: { total: 0, benar: 0 }, PM: { total: 0, benar: 0 }, ...d.mapel };
  $('editor-stat').innerHTML = '<div class="es-baris kepala"><span></span><span>Total</span><span>Benar</span><span></span></div>'
    + baris('all', 'Keseluruhan', d, true)
    + '<div class="es-judul">Per mata pelajaran</div>'
    + Object.entries(mapel).map(([k, v]) => baris('mapel', namaMapel(k), v, true)).join('')
    + '<div class="es-judul">Per topik</div><div id="stat-topik">'
    + Object.entries(d.topik || {}).map(([k, v]) => baris('topik', k, v, false)).join('') + '</div>';
}
function bacaEditorStat() {
  const hasil = { total: 0, benar: 0, mapel: {}, topik: {} };
  const ambil = (el) => ({ total: Number(el.querySelector('.tt').value), benar: Number(el.querySelector('.bn').value) });
  for (const el of document.querySelectorAll('#editor-stat .es-baris[data-grup]')) {
    const v = ambil(el);
    if (![v.total, v.benar].every((x) => Number.isInteger(x) && x >= 0)) return { error: 'Semua angka harus bilangan bulat 0 atau lebih.' };
    if (v.benar > v.total) return { error: 'Jumlah benar tidak boleh melebihi total.' };
    const g = el.dataset.grup;
    if (g === 'all') { hasil.total = v.total; hasil.benar = v.benar; continue; }
    const nama = g === 'mapel' ? el.querySelector('span').textContent : el.querySelector('.nm').value.trim();
    if (!nama) { if (v.total || v.benar) return { error: 'Ada topik yang belum diberi nama.' }; continue; }
    if (g === 'topik' && hasil.topik[nama]) return { error: 'Nama topik kembar: ' + nama };
    hasil[g][nama] = v;
  }
  return hasil;
}
function pesanStat(teks, err) { const p = $('pesan-stat'); p.textContent = teks; p.className = 'pesan ' + (err ? 'err' : 'ok'); }
$('alat-stat').addEventListener('toggle', () => { if ($('alat-stat').open) renderEditorStat(); });
$('btn-tambah-topik').addEventListener('click', () => {
  if (!$('stat-topik')) renderEditorStat();
  $('stat-topik').insertAdjacentHTML('beforeend', '<div class="es-baris" data-grup="topik"><input class="nm" placeholder="Nama topik" aria-label="Nama topik"><input class="tt" type="number" min="0" step="1" value="0" aria-label="Total"><input class="bn" type="number" min="0" step="1" value="0" aria-label="Benar"><button type="button" class="x" title="Hapus">✕</button></div>');
  $('stat-topik').lastElementChild.querySelector('.nm').focus();
});
$('editor-stat').addEventListener('click', (e) => { const x = e.target.closest('.x'); if (x) x.closest('.es-baris').remove(); });
$('btn-simpan-stat').addEventListener('click', async () => {
  const h = bacaEditorStat();
  if (h.error) return pesanStat(h.error, true);
  Penyimpanan.simpan(h);
  renderEditorStat(); renderBeranda();
  pesanStat('Statistik disimpan.', false);
  try { await sinkron(); pesanStat('Statistik disimpan dan disinkronkan ke akun.', false); }
  catch (err) { pesanStat('Tersimpan di perangkat ini, tapi gagal sinkron ke akun: ' + err.message, true); }
});
$('btn-nol-stat').addEventListener('click', async () => {
  if (!confirm('Kosongkan semua statistik akunmu?')) return;
  Penyimpanan.simpan(Penyimpanan.kosong());
  renderEditorStat(); renderBeranda();
  try { await sinkron(); pesanStat('Statistik dikosongkan.', false); } catch (err) { pesanStat('Dikosongkan di perangkat ini, gagal sinkron: ' + err.message, true); }
});
function pesanForm(teks, err) {
  const p = $('pesan-form');
  p.textContent = teks;
  p.className = 'pesan ' + (err ? 'err' : 'ok');
}
function pesanBank(teks, err) {
  const p = $('pesan-bank');
  p.textContent = teks;
  p.className = 'pesan ' + (err ? 'err' : 'ok');
}
function buatDatalist() {
  if (!$('daftar-topik')) return;
  const topik = [...new Set([...SOAL, ...BankSoal.ambil()].map((s) => s.topik))];
  $('daftar-topik').innerHTML = topik.map((t) => `<option value="${esc(t)}">`).join('');
}
// Baca isi form; kembalikan objek soal atau pesan error
// Tampilkan bagian form sesuai tipe soal
function ubahTipeForm() {
  const tipe = nilai('f-tipe');
  $('blok-opsi').hidden = tipe === 'isian';
  $('kunci-pg').hidden = tipe !== 'pg';
  $('kunci-kompleks').hidden = tipe !== 'kompleks';
  $('kunci-isian').hidden = tipe !== 'isian';
  $('label-kunci').textContent = tipe === 'kompleks' ? 'Kunci jawaban (centang semua yang benar)'
    : tipe === 'isian' ? 'Kunci jawaban (bilangan cacah)' : 'Kunci jawaban';
}
$('pilih-tipe').addEventListener('change', ubahTipeForm);
document.querySelectorAll('input[name="f-mapel"]').forEach((i) => i.addEventListener('change', () => { renderCascade({}); toggleMetaPM(); }));
$('f-rumpun').addEventListener('change', () => { renderTopikForm($('f-rumpun').value, ''); renderSubForm(''); });
$('f-topiktax').addEventListener('change', () => renderSubForm(''));
$('f-sub').addEventListener('change', () => tampilCakupan(topikTaxById($('f-topiktax').value)));
$('f-isian').addEventListener('input', (e) => { e.target.value = e.target.value.replace(/\D/g, ''); });
function bacaForm() {
  const tipe = nilai('f-tipe');
  const tpPilih = topikTaxById($('f-topiktax').value);
  if (!$('f-rumpun').value || !tpPilih) return { error: 'Pilih rumpun dan topik materi dulu.' };
  if (tpPilih.mapel !== namaMapelTaksonomi(nilai('f-mapel'))) return { error: 'Topik tidak sesuai dengan mata pelajaran yang dipilih.' };
  if (tpPilih.topik.sub.length && !$('f-sub').value) return { error: 'Pilih subtopik untuk topik ini.' };
  const topik = tpPilih.topik.nama;
  const meta = bacaMeta();
  if (meta.error) return { error: meta.error };
  if (kosongEditor(getArea('soal'))) return { error: 'Teks soal belum diisi.' };
  if (window.NalarineGraph) {
    const errorGrafik = window.NalarineGraph.validateEditor();
    if (errorGrafik) return { error: 'Grafik: ' + errorGrafik };
  }
  if (adaRumusTanpaTanda(getArea('soal').textContent)) return { error: 'Teks soal punya rumus tanpa tanda $. Blok rumusnya lalu klik ikon fx.' };
  for (let k = 0; tipe !== 'isian' && k < 5; k++) {
    if (kosongEditor(getArea('opsi' + k))) return { error: `Pilihan ${HURUF[k]} belum diisi (teks atau gambar).` };
    if (adaRumusTanpaTanda(getArea('opsi' + k).textContent)) return { error: `Pilihan ${HURUF[k]} punya rumus tanpa tanda $. Blok rumusnya lalu klik ikon fx.` };
  }
  if (kosongEditor(getArea('pembahasan'))) return { error: 'Pembahasan belum diisi.' };
  if (adaRumusTanpaTanda(getArea('pembahasan').textContent)) return { error: 'Pembahasan punya rumus tanpa tanda $. Blok rumusnya lalu klik ikon fx.' };
  let jawaban;
  if (tipe === 'isian') {
    const v = $('f-isian').value.trim();
    if (!/^\d{1,12}$/.test(v)) return { error: 'Kunci jawaban harus bilangan cacah: angka 0, 1, 2, dan seterusnya, tanpa koma atau tanda minus.' };
    jawaban = Number(v);
  } else if (tipe === 'kompleks') {
    jawaban = [...document.querySelectorAll('input[name="f-jawaban-ganda"]:checked')].map((c) => Number(c.value)).sort();
    if (!jawaban.length) return { error: 'Centang minimal satu kunci jawaban.' };
  } else {
    jawaban = Number(nilai('f-jawaban'));
  }
  return {
    tipe,
    mataPelajaran: nilai('f-mapel'),
    topik,
    topikId: tpPilih.topik.id,
    rumpunId: tpPilih.rumpun.id,
    ...($('f-sub').value ? { subtopikId: $('f-sub').value } : {}),
    ...meta.data,
    tingkatKesulitan: nilai('f-level'),
    folderId: $('f-folder').value || null,
    soal: sanitize(getArea('soal').innerHTML),
    opsi: tipe === 'isian' ? [] : [0, 1, 2, 3, 4].map((k) => sanitize(getArea('opsi' + k).innerHTML)),
    jawaban,
    pembahasan: sanitize(getArea('pembahasan').innerHTML),
    ...(window.NalarineGraph && window.NalarineGraph.getEditorValue()
      ? { grafik: window.NalarineGraph.getEditorValue() } : {})
  };
}
function resetForm() {
  if ($('kotak-pratinjau')) { $('kotak-pratinjau').hidden = true; $('btn-pratinjau').textContent = 'Pratinjau'; }
  renderCascade({});
  resetMeta();
  semuaArea().forEach((a) => (a.innerHTML = ''));
  if (window.NalarineGraph) window.NalarineGraph.setEditorValue(null);
  pilihGambar(null);
  document.querySelector('input[name="f-mapel"][value="PK"]').checked = true;
  document.querySelector('input[name="f-level"][value="sedang"]').checked = true;
  document.querySelector('input[name="f-jawaban"][value="0"]').checked = true;
  document.querySelector('input[name="f-tipe"][value="pg"]').checked = true;
  document.querySelectorAll('input[name="f-jawaban-ganda"]').forEach((c) => (c.checked = false));
  $('f-isian').value = '';
  ubahTipeForm();
  // Soal baru otomatis masuk folder yang sedang dibuka
  const folderAktif = BankFolder.ambil().some((f) => f.id === filterAktif) ? filterAktif : '';
  renderOpsiFolder(folderAktif);
  editId = null;
  $('judul-form').textContent = modeAdmin ? 'Tambah soal bawaan baru' : 'Tambah soal baru';
  $('btn-simpan-soal').textContent = 'Simpan soal';
  $('btn-batal-edit').hidden = false;
}
function isiForm(s) {
  document.querySelector(`input[name="f-mapel"][value="${s.mataPelajaran}"]`).checked = true;
  const tpAwal = topikTaxById(s.topikId) || cariTopikTax(s.mataPelajaran, s.topik);
  renderCascade(tpAwal ? { rumpun: tpAwal.rumpun.id, topik: tpAwal.topik.id, sub: s.subtopikId || subDari(s) } : {});
  isiMeta(s);
  if (!tpAwal) pesanForm('Topik lama "' + s.topik + '" belum punya padanan di taksonomi. Pilih rumpun dan topik yang sesuai.', true);
  document.querySelector(`input[name="f-level"][value="${s.tingkatKesulitan}"]`).checked = true;
  const tipe = tipeSoal(s);
  document.querySelector(`input[name="f-tipe"][value="${tipe}"]`).checked = true;
  document.querySelectorAll('input[name="f-jawaban-ganda"]').forEach((c) => (c.checked = tipe === 'kompleks' && s.jawaban.includes(Number(c.value))));
  $('f-isian').value = tipe === 'isian' ? String(s.jawaban) : '';
  document.querySelector(`input[name="f-jawaban"][value="${tipe === 'pg' ? s.jawaban : 0}"]`).checked = true;
  ubahTipeForm();
  renderOpsiFolder(s.folderId || '');
  // Gambar dari format lama ikut dimasukkan ke editor agar bisa diatur posisinya
  const gambarLama = (g) => (g ? `<p><img src="${g}" alt="Gambar" style="display:block;margin:8px auto;width:60%"></p>` : '');
  getArea('soal').innerHTML = sanitize(s.soal) + gambarLama(s.gambarSoal);
  getArea('pembahasan').innerHTML = sanitize(s.pembahasan) + gambarLama(s.gambarPembahasan);
  [0, 1, 2, 3, 4].forEach((k) => (getArea('opsi' + k).innerHTML = s.opsi[k] ? sanitize(s.opsi[k]) : ''));
  if (window.NalarineGraph) window.NalarineGraph.setEditorValue(s.grafik || null);
  pilihGambar(null);
}
function simpanSoal() {
  const hasil = bacaForm();
  if (hasil.error) return pesanForm(hasil.error, true);
  const daftar = BankSoal.ambil();
  let pesan;
  if (editId) {
    const idx = daftar.findIndex((x) => x.id === editId);
    if (idx >= 0) daftar[idx] = { id: editId, ...hasil };
    PilihanStat.hapusSoal(editId);
    pesan = 'Soal berhasil diperbarui.';
  } else {
    daftar.push({ id: (modeAdmin ? 'd' : 'c') + Date.now() + Math.floor(Math.random() * 1000), ...hasil });
    pesan = 'Soal berhasil disimpan ke bank.';
  }
  if (!BankSoal.simpan(daftar)) {
    return pesanForm('Penyimpanan browser penuh. Coba gambar yang lebih kecil atau hapus soal lama.', true);
  }
  resetForm();
  tutupForm();
  if ($('hasil-validasi').innerHTML) jalankanValidasi();
  pesanForm(pesan, false);
  pesanBank(pesan, false);
  renderSemuaBank();
  buatDatalist();
}
function bukaForm() {
  renderCascade({ rumpun: $('f-rumpun').value, topik: $('f-topiktax').value, sub: $('f-sub').value });
  const k = $('kartu-form');
  k.hidden = false;
  k.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function tutupForm() { $('kartu-form').hidden = true; }
function mulaiEdit(id) {
  const s = BankSoal.ambil().find((x) => x.id === id);
  if (!s) return;
  isiForm(s);
  editId = id;
  $('judul-form').textContent = modeAdmin ? 'Edit soal bawaan' : 'Edit soal';
  $('btn-simpan-soal').textContent = 'Simpan perubahan';
  $('btn-batal-edit').hidden = false;
  pesanForm('', false);
  bukaForm();
}
function hapusSoal(id) {
  if (!confirm(modeAdmin ? 'Hapus soal bawaan ini untuk SEMUA pengguna?' : 'Hapus soal ini dari bank?')) return;
  BankSoal.simpan(BankSoal.ambil().filter((x) => x.id !== id));
  if (editId === id) { resetForm(); tutupForm(); }
  renderSemuaBank();
  buatDatalist();
  pesanBank('Soal dihapus.', false);
}
function optionsPindah(terpilih) {
  return '<option value="">Belum dikelompokkan</option>' +
    BankFolder.ambil().map((f) => `<option value="${esc(f.id)}" ${f.id === terpilih ? 'selected' : ''}>${esc(f.nama)}</option>`).join('');
}
function itemSoalHTML(s, nomor) {
  const buka = bukaSoal.has(s.id) ? ' open' : '';
  return `<details class="kartu-soal" data-kunci="soal:${esc(s.id)}"${buka}>
    <summary><span class="badge kosong tk-${esc(s.tingkatKesulitan)}">${esc(namaMapel(s.mataPelajaran))} · ${esc(s.topik)} · ${esc(s.tingkatKesulitan)}</span>${namaSub(subDari(s)) ? `<span class="sub-tag">${esc(namaSub(subDari(s)))}</span>` : ''}
      <span class="pratinjau-soal">${nomor}. ${esc(previewTeks(s.soal))}</span></summary>
    <div class="isi-kartu">
      <div class="teks-soal">${konten(s.soal, s.gambarSoal, 'Gambar soal', s.grafik)}</div>
      <p class="muted" style="margin-bottom:8px">${{ pg: 'Pilihan ganda', kompleks: 'PG kompleks (centang semua yang benar)', isian: 'Isian bilangan cacah' }[tipeSoal(s)]}</p>
      <div class="opsi-list">${opsiReviewHTML(s)}</div>
      <div class="feedback"><strong>Pembahasan</strong><div>${konten(s.pembahasan, s.gambarPembahasan, 'Gambar pembahasan')}</div></div>
      <div class="aksi-kecil">
        ${modeAdmin ? '' : `<label class="muted">Pindah ke</label>
        <select class="input kecil" data-pindah="${esc(s.id)}">${optionsPindah(s.folderId || '')}</select>`}
        <label class="muted">Subtopik</label>
        <select class="input kecil" data-subset="${esc(s.id)}" aria-label="Subtopik soal">${optionsSub(s.mataPelajaran, subDari(s), { depan: '<option value="">Tanpa subtopik</option>', topik: namaTopikResmi(s) })}</select>
        <button class="btn btn-secondary btn-kecil" data-aksi="pratinjau" data-id="${esc(s.id)}">Pratinjau</button>
        <button class="btn btn-secondary btn-kecil" data-aksi="edit" data-id="${esc(s.id)}">Edit</button>
        <button class="btn btn-bahaya btn-kecil" data-aksi="hapus" data-id="${esc(s.id)}">Hapus</button>
      </div>
    </div>
  </details>`;
}
// Potongan teks soal untuk pratinjau di kartu (tanpa format)
function previewTeks(html) {
  const d = document.createElement('div');
  d.innerHTML = sanitize(html);
  const t = (d.textContent || '').replace(/\s+/g, ' ').trim();
  if (t.length <= 90) return t || '(soal berisi gambar)';
  let potong = t.slice(0, 90);
  if ((potong.match(/\$/g) || []).length % 2 === 1) potong = potong.slice(0, potong.lastIndexOf('$'));
  return potong.trim() + '...';
}
// Ingat folder dan kartu yang sedang dibuka, supaya tidak tertutup saat daftar dimuat ulang
const bukaFolder = new Set();
const bukaSoal = new Set();
function folderHTML(g, terbuka) {
  const key = g.id || 'none';
  const buka = (bukaFolder.has(key) || terbuka) ? ' open' : '';
  const isi = g.items.length
    ? g.items.map((s, n) => itemSoalHTML(s, n + 1)).join('')
    : '<p class="muted">Belum ada soal di folder ini.</p>';
  return `<details class="wadah-folder" data-kunci="folder:${esc(key)}"${buka}>
    <summary><span class="nama-folder">${esc(g.nama)}</span><span class="muted">${g.items.length} soal</span></summary>
    <div class="isi-folder">${g.items.length ? `<div class="aksi-kecil"><button class="btn btn-secondary btn-kecil" data-aksi="pratinjau-folder" data-folder="${esc(key)}">Pratinjau semua soal di sini (${g.items.length})</button></div>` : ''}${isi}</div>
  </details>`;
}
// Pencarian dan filter tampilan bank (tidak memengaruhi isi PDF per folder)
const FB = { q: '', mapel: '', sulit: '', sub: '' };
const filterBankAktif = () => !!(FB.q || FB.mapel || FB.sulit || FB.sub);
// Subtopik: pilihan diambil dari taksonomi Jelajahi Materi (satu sumber data)
// ---------- Klasifikasi akademik (Subtes > Rumpun > Topik > Subtopik) ----------
function topikTaxById(id) {
  if (!id || typeof TAKSONOMI === 'undefined') return null;
  for (const k of Object.keys(TAKSONOMI)) for (const r of TAKSONOMI[k].rumpun) for (const tp of r.topik) {
    if (tp.id === id) return { mapel: k, rumpun: r, topik: tp };
  }
  return null;
}
// Kode mapel pada soal/form berbeda dari nama kunci pada objek TAKSONOMI.
function namaMapelTaksonomi(mapel) {
  return ({ PK: 'Pengetahuan Kuantitatif', PM: 'Penalaran Matematika' })[mapel] || mapel;
}
// Cari topik dari nama resmi atau nama lama. Hanya dipakai kalau hasilnya pasti satu.
function cariTopikTax(mapel, nama) {
  if (!nama || typeof TAKSONOMI === 'undefined') return null;
  const n = String(nama).trim().toLowerCase();
  const kunciMapel = namaMapelTaksonomi(mapel);
  const hasil = [];
  Object.keys(TAKSONOMI).filter((k) => !mapel || k === kunciMapel).forEach((k) => TAKSONOMI[k].rumpun.forEach((r) => r.topik.forEach((tp) => {
    if (tp.nama.toLowerCase() === n || (tp.legacy || []).some((x) => x.toLowerCase() === n)) hasil.push({ mapel: k, rumpun: r, topik: tp });
  })));
  return hasil.length === 1 ? hasil[0] : null;
}
// Nama topik resmi untuk satu soal. Dipakai di menu, filter, dan statistik supaya nama lama tidak terpisah.
function namaTopikResmi(s) {
  const byId = topikTaxById(s.topikId) || topikTaxById(s.subtopikId); // subtopikId yang berisi ID topik tetap dikenali
  if (byId) return byId.topik.nama;
  const m = cariTopikTax(s.mataPelajaran, s.topik);
  return m ? m.topik.nama : (s.topik || '');
}
function renderRumpunForm(terpilih) {
  const k = namaMapelTaksonomi(nilai('f-mapel'));
  const rumpun = (typeof TAKSONOMI !== 'undefined' && TAKSONOMI[k] && Array.isArray(TAKSONOMI[k].rumpun)) ? TAKSONOMI[k].rumpun : [];
  $('f-rumpun').innerHTML = '<option value="">— pilih rumpun —</option>' +
    rumpun.map((r) => `<option value="${esc(r.id)}"${r.id === terpilih ? ' selected' : ''}>${esc(r.nama)}</option>`).join('');
}
function renderTopikForm(rumpunId, terpilih) {
  const k = namaMapelTaksonomi(nilai('f-mapel'));
  const rumpun = typeof TAKSONOMI !== 'undefined' && TAKSONOMI[k] && Array.isArray(TAKSONOMI[k].rumpun) ? TAKSONOMI[k].rumpun : [];
  const r = rumpun.find((x) => x.id === rumpunId);
  $('f-topiktax').innerHTML = '<option value="">— pilih topik —</option>' +
    (r ? r.topik.map((tp) => `<option value="${esc(tp.id)}"${tp.id === terpilih ? ' selected' : ''}>${esc(tp.nama)}</option>`).join('') : '');
  $('f-topiktax').disabled = !r;
}
function renderSubForm(terpilih) {
  const tp = topikTaxById($('f-topiktax').value);
  const subs = tp ? tp.topik.sub : [];
  $('f-sub').innerHTML = '<option value="">— tanpa subtopik —</option>' +
    subs.map((sb) => `<option value="${esc(sb.id)}"${sb.id === terpilih ? ' selected' : ''}>${esc(sb.nama)}</option>`).join('');
  $('f-sub').disabled = !subs.length;
  tampilCakupan(tp);
}
function renderCascade(p) {
  renderRumpunForm(p.rumpun || '');
  renderTopikForm(p.rumpun || '', p.topik || '');
  renderSubForm(p.sub || '');
}
renderCascade({}); // isi dropdown Rumpun/Topik/Subtopik sejak halaman dimuat
// Deskripsi cakupan: topik punya deskripsi di taksonomi; subtopik belum punya, jadi ditandai jelas
function tampilCakupan(tp) {
  const kot = $('kotak-cakupan');
  if (!tp) { kot.hidden = true; kot.innerHTML = ''; return; }
  const sb = tp.topik.sub.find((x) => x.id === $('f-sub').value);
  kot.hidden = false;
  const jalur = [tp.mapel, tp.rumpun.nama, tp.topik.nama].concat(sb ? [sb.nama] : []).map(esc).join(' &rsaquo; ');
  kot.innerHTML = `<p class="jalur-materi">${jalur}</p><p class="label" style="margin-top:0">Cakupan kompetensi</p>
    <p>${esc(tp.topik.desk || 'Deskripsi topik belum tersedia.')}</p>
    ${sb ? `<p class="muted">${esc(sb.desk || 'Deskripsi subtopik belum tersedia.')}</p>` : ''}`;
}
function toggleMetaPM() { $('blok-pm').hidden = nilai('f-mapel') !== 'PM'; }
function resetMeta() {
  $('f-sumber').value = '';
  $('f-tahun').value = '';
  $('f-tag').value = '';
  document.querySelector('input[name="f-status"][value="terbit"]').checked = true;
  $('f-dimensi').value = '';
  $('f-konteks').value = '';
  $('blok-pm').hidden = true; // form selalu kembali ke PK
}
function isiMeta(s) {
  $('f-sumber').value = s.sumber || '';
  $('f-tahun').value = s.tahun || '';
  $('f-tag').value = (s.tag || []).join(', ');
  document.querySelector(`input[name="f-status"][value="${s.status === 'draf' ? 'draf' : 'terbit'}"]`).checked = true;
  $('f-dimensi').value = s.dimensi || '';
  $('f-konteks').value = s.konteks || '';
  toggleMetaPM();
}
// Metadata dan klasifikasi Penalaran Matematika yang wajib diisi
function bacaMeta() {
  const mapel = nilai('f-mapel');
  const tahunRaw = $('f-tahun').value.trim();
  if (tahunRaw && !/^\d{4}$/.test(tahunRaw)) return { error: 'Tahun harus 4 digit, misalnya 2024.' };
  const data = {
    sumber: $('f-sumber').value.trim(),
    tahun: tahunRaw ? Number(tahunRaw) : null,
    tag: $('f-tag').value.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean),
    status: nilai('f-status')
  };
  if (mapel === 'PM') {
    if (!$('f-dimensi').value) return { error: 'Dimensi Penalaran Matematika wajib dipilih.' };
    if (!$('f-konteks').value) return { error: 'Konteks wajib dipilih untuk Penalaran Matematika.' };
    data.dimensi = $('f-dimensi').value;
    data.konteks = $('f-konteks').value;
  }
  return { data };
}
function subDari(s) { return s.subtopikId || (s.subtopikIds && s.subtopikIds[0]) || ''; }
function namaSub(id) {
  if (!id || typeof TAKSONOMI === 'undefined') return '';
  for (const k of Object.keys(TAKSONOMI)) for (const r of TAKSONOMI[k].rumpun) for (const tp of r.topik) {
    const sb = tp.sub.find((x) => x.id === id);
    if (sb) return sb.nama;
  }
  return '';
}
function optionsSub(mapel, terpilih, opsi) {
  if (typeof TAKSONOMI === 'undefined') return '';
  const semua = BankSoal.ambil();
  const hit = (id) => semua.filter((s) => (s.subtopikId === id || (s.subtopikIds || []).includes(id))).length;
  let h = opsi.depan;
  Object.keys(TAKSONOMI).filter((k) => !mapel || k === namaMapelTaksonomi(mapel)).forEach((k) => {
    TAKSONOMI[k].rumpun.forEach((r) => r.topik.forEach((tp) => {
      if (!tp.sub.length || (opsi.topik && tp.nama !== opsi.topik)) return;
      h += `<optgroup label="${esc((mapel ? '' : k + ' · ') + r.nama + ' › ' + tp.nama)}">` + tp.sub.map((sb) =>
        `<option value="${esc(sb.id)}"${sb.id === terpilih ? ' selected' : ''}>${esc(sb.nama)}${opsi.hitung ? ' (' + hit(sb.id) + ')' : ''}</option>`).join('') + '</optgroup>';
    }));
  });
  return h;
}
function renderFilterSub() {
  const semua = BankSoal.ambil(), kini = FB.sub;
  const tanpa = semua.filter((s) => !subDari(s)).length;
  $('filter-sub').innerHTML = optionsSub(FB.mapel, kini, { depan: `<option value="">Semua subtopik</option><option value="__none"${kini === '__none' ? ' selected' : ''}>Tanpa subtopik (${tanpa})</option>`, hitung: true });
  if (kini && $('filter-sub').value !== kini) { FB.sub = ''; $('filter-sub').value = ''; }
}
function teksCari(s) {
  const d = document.createElement('div');
  d.innerHTML = sanitize(s.soal);
  return `${d.textContent} ${s.topik} ${namaSub(subDari(s))} ${namaMapel(s.mataPelajaran)} ${s.mataPelajaran}`.toLowerCase();
}
function lolosFilterBank(s) {
  if (FB.mapel && s.mataPelajaran !== FB.mapel) return false;
  if (FB.sulit && s.tingkatKesulitan !== FB.sulit) return false;
  if (FB.sub === '__none' ? !!subDari(s) : (FB.sub && s.subtopikId !== FB.sub && !(s.subtopikIds || []).includes(FB.sub))) return false;
  return !FB.q || teksCari(s).includes(FB.q);
}
function ringkasanBank(semua, tampil) {
  const n = (m) => semua.filter((s) => s.mataPelajaran === m).length;
  const t = (a, b, c) => `<div class="stat-tile"><span>${a}</span><strong>${b}</strong>${c ? `<small>${c}</small>` : ''}</div>`;
  $('ringkasan-bank').innerHTML = t('Total soal', semua.length) + t('Pengetahuan Kuantitatif', n('PK')) + t('Penalaran Matematika', n('PM')) + t('Ditampilkan', tampil);
}
function renderDaftarCustom() {
  const semua = BankSoal.ambil();
  renderFilterSub();
  $('judul-bank').innerHTML = (modeAdmin ? 'Soal bawaan - semua pengguna' : 'Bank soal saya') + ' (<span id="jumlah-custom">' + semua.length + '</span>)';
  const f = filterBankAktif();
  let html = '', tampil = 0;
  if (!semua.length) {
    html = '<div class="state-kosong"><strong>Bank soal masih kosong</strong><p class="muted">Tambahkan soal pertama lewat tombol "+ Tambah soal" di atas.</p></div>';
  } else {
    grupSoal().forEach((g) => {
      const gf = f ? { ...g, items: g.items.filter(lolosFilterBank) } : g;
      if (!gf.items.length && (f || filterAktif === 'semua')) return;
      tampil += gf.items.length;
      html += folderHTML(gf, filterAktif !== 'semua' || f);
    });
    if (!html) html = '<div class="state-kosong"><strong>Tidak ada soal yang cocok</strong><p class="muted">Coba ubah kata kunci atau filter.</p></div>';
  }
  $('daftar-custom').innerHTML = html;
  ringkasanBank(semua, tampil);
  $('label-cetak').textContent = filterAktif === 'semua' ? 'semua soal'
    : filterAktif === 'none' ? 'soal yang belum dikelompokkan'
    : `folder "${namaFolder(filterAktif)}"`;
  rumus($('daftar-custom'));
}
// Catat saat folder atau kartu dibuka/ditutup
$('daftar-custom').addEventListener('toggle', (e) => {
  const d = e.target;
  const k = d.dataset && d.dataset.kunci;
  if (!k) return;
  const id = k.slice(k.indexOf(':') + 1);
  const set = k.startsWith('folder:') ? bukaFolder : bukaSoal;
  if (d.open) set.add(id); else set.delete(id);
}, true);
let tundaCari;
$('cari-soal').addEventListener('input', (e) => { clearTimeout(tundaCari); tundaCari = setTimeout(() => { FB.q = e.target.value.trim().toLowerCase(); renderDaftarCustom(); }, 150); });
$('filter-mapel').addEventListener('change', (e) => { FB.mapel = e.target.value; renderFilterSub(); renderDaftarCustom(); });
$('filter-sulit').addEventListener('change', (e) => { FB.sulit = e.target.value; renderDaftarCustom(); });
$('filter-sub').addEventListener('change', (e) => { FB.sub = e.target.value; renderDaftarCustom(); });
$('btn-ke-form').addEventListener('click', () => {
  if (editId !== null) resetForm();
  pesanForm('', false);
  bukaForm();
  setTimeout(() => { const f = $('kartu-form').querySelector('textarea, input[type=text]'); if (f) f.focus({ preventScroll: true }); }, 250);
});
// Muat ulang seluruh tampilan bank (folder, pilihan form, daftar soal, dan sumber di menu latihan)
function renderSemuaBank() {
  const chipPeta = $('chip-peta');
  if (chipPeta) {
    chipPeta.hidden = !modeAdmin;
    $('jml-perlu-peta').textContent = BankSoal.ambil().filter(perluDipetakan).length;
  }
  // Soal bawaan tidak memakai folder, jadi bagian folder disembunyikan di mode admin
  ['f-folder', 'chip-folder', 'folder-baru', 'btn-tambah-folder', 'pesan-folder'].forEach((id) => {
    const el = $(id);
    if (!el) return;
    const blok = id === 'folder-baru' || id === 'btn-tambah-folder' ? el.closest('.baris-opsi') : el;
    blok.style.display = modeAdmin ? 'none' : '';
  });
  document.querySelectorAll('#bank .label').forEach((l) => {
    if (/folder/i.test(l.textContent)) l.style.display = modeAdmin ? 'none' : '';
  });
  renderChipFolder();
  renderOpsiFolder($('f-folder').value || '');
  renderDaftarCustom();
  renderPilihSumber();
}

// Unduh PDF: halaman cetak dibuka di tab baru, lalu dialog cetak muncul otomatis
function cetakPDF() {
  const grup = grupSoal().filter((g) => g.items.length);
  if (!grup.length) return pesanBank('Belum ada soal di folder ini untuk diunduh.', true);
  const sertakanKunci = $('cetak-kunci').checked;
  const semua = grup.flatMap((g) => g.items);
  const judul = filterAktif === 'semua' ? 'Latihan Soal UTBK'
    : filterAktif === 'none' ? 'Latihan Soal UTBK (Belum dikelompokkan)'
    : `Latihan Soal UTBK: ${namaFolder(filterAktif)}`;

  let nomor = 0;
  const soalHTML = grup.map((g) => `
    ${filterAktif === 'semua' ? `<h3>${esc(g.nama)}</h3>` : ''}
    ${g.items.map((s) => { nomor++; return `
    <div class="soal-cetak">
      <p><strong>${nomor}.</strong> <span class="muted">(${esc(namaMapel(s.mataPelajaran))}, ${esc(s.topik)}, ${esc(s.tingkatKesulitan)})</span></p>
      <div>${konten(s.soal, s.gambarSoal, 'Gambar soal', s.grafik)}</div>
      <div style="margin-top:6px">${adaIsian(s)
        ? '<p style="margin-top:10px">Jawaban (bilangan cacah): ____________________</p>'
        : (adaGanda(s) ? '<p class="muted">Pilih semua jawaban yang benar.</p>' : '') +
          s.opsi.map((o, k) => `<div class="opsi-cetak">${adaGanda(s) ? '&#9744; ' : ''}<strong>${HURUF[k]}.</strong> ${sanitize(o)}</div>`).join('')}</div>
    </div>`; }).join('')}`).join('');

  let nomorKunci = 0;
  const kunciHTML = sertakanKunci ? `
    <div style="page-break-before:always"></div>
    <h2>Kunci Jawaban dan Pembahasan</h2>
    ${semua.map((s) => { nomorKunci++; return `
      <div class="soal-cetak">
        <p><strong>${nomorKunci}.</strong> Jawaban: <strong>${kunciHuruf(s)}</strong></p>
        <div>${konten(s.pembahasan, s.gambarPembahasan, 'Gambar pembahasan')}</div>
      </div>`; }).join('')}` : '';

  // Dokumen cetak lengkap dengan MathJax, supaya rumus ikut tercetak
  const dokumen = `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><title>${esc(judul)}</title>
<style>
  body{font-family:"Times New Roman",serif;color:#000;background:#fff;margin:24px;line-height:1.6;font-size:12pt}
  h2{font-size:16pt;margin:10px 0}
  h3{font-size:13pt;margin:16px 0 6px}
  .muted{color:#555;font-size:10pt}
  .soal-cetak{page-break-inside:avoid;margin-bottom:18px;padding-bottom:12px;border-bottom:1px dashed #bbb}
  .opsi-cetak{margin:2px 0}
  img{max-width:100%;height:auto}
  table{border-collapse:collapse;margin:6px 0}
  th,td{border:1px solid #888;padding:3px 10px;text-align:center}
  .konten::after{content:"";display:block;clear:both}
  .konten p{margin-bottom:6px}
  .konten ul,.konten ol{padding-left:28px}
  @page{margin:18mm}
</style>
<script>window.MathJax={tex:{inlineMath:[['$','$'],['\\\\(','\\\\)']],displayMath:[['$$','$$'],['\\\\[','\\\\]']]}};<\/script>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.8/dist/chart.umd.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/mathjs@15.2.0/lib/browser/math.js"><\/script>
<script src="${location.origin}/js/graph-builder.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/mathjax@3.2.2/es5/tex-svg.js" async><\/script>
</head><body>
<h2>${esc(judul)}</h2>
<p class="muted">${semua.length} soal</p>
${soalHTML}
${kunciHTML}
<script>
window.addEventListener('load', function () {
  if (window.NalarineGraph) window.NalarineGraph.renderAll(document);
  var p = (window.MathJax && MathJax.startup && MathJax.startup.promise) ? MathJax.startup.promise : Promise.resolve();
  p.then(function () { setTimeout(function () { window.print(); }, 700); }, function () { window.print(); });
});
<\/script>
</body></html>`;

  // Buka tab baru langsung dari klik (agar tidak diblokir pop-up)
  const w = window.open('', '_blank');
  if (w) {
    w.document.open();
    w.document.write(dokumen);
    w.document.close();
    pesanBank('Halaman cetak dibuka di tab baru. Pilih "Simpan sebagai PDF" di dialog cetak.', false);
  } else {
    // Jika tab baru diblokir, unduh file HTML-nya
    const blob = new Blob([dokumen], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'soal-utbk.html';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    pesanBank('Tab baru diblokir browser. File soal-utbk.html sudah diunduh: buka file itu, lalu cetak sebagai PDF.', true);
  }
}

function renderBank() {
  buatDatalist();
  renderSemuaBank();
  tampil('bank');
}

// ---------- Event ----------
$('pilih-sumber').addEventListener('change', buatTopik);
$('pilih-mapel').addEventListener('change', buatTopik);
$('pilih-topik').addEventListener('change', hitungSoal);
$('pilih-level').addEventListener('change', hitungSoal);
$('pilih-jumlah').addEventListener('change', hitungSoal);
$('btn-mulai').addEventListener('click', mulai);

// Soal isian: simpan angka yang diketik (hanya digit)
$('opsi-list').addEventListener('input', (e) => {
  if (!sesi || !e.target.matches('.isian-input')) return;
  const v = e.target.value.replace(/\D/g, '');
  if (v !== e.target.value) e.target.value = v;
  sesi.jawab[sesi.i] = v === '' ? null : Number(v);
  simpanSesiAktif();
  if (sesi.mode === 'latihan' && !sesi.kunci[sesi.i]) $('btn-aksi').disabled = sesi.jawab[sesi.i] === null;
});
$('opsi-list').addEventListener('change', (e) => {
  if (!sesi || sesi.mode !== 'tryout' || !e.target.matches('.isian-input')) return;
  // Mode Ngebut hanya memperbarui jumlah soal terjawab; jangan evaluasi atau warnai status benar/salah.
  $('ex-status').textContent = `${sesi.jawab.filter((j) => j !== null && j !== undefined).length}/${sesi.soal.length} terjawab`;
});
$('opsi-list').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.matches('.isian-input') && !$('btn-aksi').disabled) $('btn-aksi').click();
});
$('opsi-list').addEventListener('click', (e) => {
  const b = e.target.closest('.opsi');
  if (!b || sesi.kunci[sesi.i]) return;
  const s = sesi.soal[sesi.i], k = Number(b.dataset.k);
  if (adaGanda(s)) {
    const cur = Array.isArray(sesi.jawab[sesi.i]) ? [...sesi.jawab[sesi.i]] : [];
    const baru = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k].sort();
    sesi.jawab[sesi.i] = baru.length ? baru : null;
  } else {
    sesi.jawab[sesi.i] = k;
  }

  // Perbarui status pilihan saja. Jangan render ulang seluruh soal karena
  // grafik/MathJax ikut dibuat ulang dan dapat menggeser posisi scroll.
  $('opsi-list').querySelectorAll('.opsi').forEach((opsi) => {
    const indeks = Number(opsi.dataset.k);
    const terpilih = dipilih(s, sesi.jawab[sesi.i], indeks);
    opsi.classList.toggle('terpilih', terpilih);
    opsi.setAttribute('aria-checked', String(terpilih));
  });
  simpanSesiAktif();
  if (sesi.mode === 'latihan') {
    $('btn-aksi').disabled = sesi.jawab[sesi.i] === null;
  } else {
    // Di Mode Ngebut, navigasi tidak diberi warna berdasarkan benar/salah.
    $('ex-status').textContent = `${sesi.jawab.filter((j) => j !== null && j !== undefined).length}/${sesi.soal.length} terjawab`;
  }
});
$('btn-aksi').addEventListener('click', () => {
  const { mode, i, soal, kunci, jawab } = sesi;
  if (mode === 'latihan' && !kunci[i]) {
    kunci[i] = true;
    Penyimpanan.catat(soal[i], skorJawaban(soal[i], jawab[i]));
    Riwayat.catat(soal[i], jawab[i], skorJawaban(soal[i], jawab[i]));
    PilihanStat.catat(soal[i], jawab[i]);
    renderSoal();
  } else if (i === soal.length - 1) {
    akhiriDenganKonfirmasi();
  } else {
    sesi.i++;
    renderSoal();
  }
});
$('btn-prev').addEventListener('click', () => { sesi.i--; renderSoal(); });

// ---------- Mode ujian: UI, panel soal, konfirmasi keluar ----------
function renderUjianUI() {
  const { soal, jawab, kunci, i, mode } = sesi, n = soal.length;
  document.body.dataset.mode = mode;
  $('timer').classList.toggle('sembunyi', PengaturanApp.ambil().tampilTimer === false);
  $('ex-mode').textContent = sesi.paketTryoutId ? 'TRYOUT' : mode === 'tryout' ? 'MODE NGEBUT' : 'MODE SANTAI';
  $('ex-prog').textContent = `SOAL ${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}`;
  $('ex-pct').textContent = Math.round(((i + 1) / n) * 100) + '%';
  $('ex-pos').textContent = `${i + 1} / ${n}`;
  const sudah = (k) => (mode === 'latihan' ? kunci[k] : jawab[k] !== null && jawab[k] !== undefined);
  const statusNavigasi = (k) => {
    // Mode Ngebut hanya menandai progres; tidak pernah mengungkap benar atau salah.
    if (mode === 'tryout') return sudah(k) ? 'status-terjawab' : '';
    // Kebenaran hanya ditampilkan setelah tombol "Jawab" dikonfirmasi di mode Latihan.
    if (!kunci[k]) return '';
    const skor = skorJawaban(soal[k], jawab[k]);
    return skor === 1 ? 'status-benar' : skor > 0 ? 'status-parsial' : 'status-salah';
  };
  const gayaStatusNavigasi = (status) => {
    if (status === 'status-terjawab') return 'background:var(--primary);border:2px solid var(--primary);color:#fff;';
    if (status === 'status-benar') return 'background:#ecfdf3;border:2px solid #16a34a;color:#15803d;';
    if (status === 'status-salah') return 'background:#fff1f2;border:2px solid #e11d48;color:#be123c;';
    if (status === 'status-parsial') return 'background:#fff7d6;border:2px solid #b7791f;color:#8a5a00;';
    return '';
  };
  $('ex-status').textContent = `${soal.filter((s, k) => sudah(k)).length}/${n} terjawab`;
  $('ex-nav').innerHTML = soal.map((s, k) => {
    const status = statusNavigasi(k);
    const labelStatus = status === 'status-terjawab' ? 'sudah dijawab' : status === 'status-benar' ? 'benar' : status === 'status-parsial' ? 'parsial' : status === 'status-salah' ? 'salah' : 'kosong';
    return `<button type="button" data-k="${k}" class="${[k === i ? 'aktif' : '', status].filter(Boolean).join(' ')}" style="${gayaStatusNavigasi(status)}" aria-label="Soal ${k + 1}, ${labelStatus}"${k === i ? ' aria-current="true"' : ''}${mode === 'latihan' && k > i && !kunci[k - 1] ? ' disabled' : ''}>${k + 1}</button>`;
  }).join('');
  document.querySelectorAll('#opsi-list .opsi').forEach((o) => {
    o.tabIndex = mode === 'latihan' && kunci[i] ? -1 : 0; o.setAttribute('role', adaGanda(soal[i]) ? 'checkbox' : 'radio');
    o.setAttribute('aria-checked', String(o.classList.contains('terpilih')));
    if (mode === 'latihan' && kunci[i] && !o.classList.contains('benar') && !o.classList.contains('salah')) o.classList.add('nonaktif');
  });
  const inp = $('inp-isian'); if (inp) { inp.setAttribute('pattern', '[0-9]*'); inp.setAttribute('enterkeyhint', 'done'); }
}
$('ex-nav').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-k]');
  if (!b || b.disabled || !sesi || !sesi.aktif) return;
  sesi.i = Number(b.dataset.k); renderSoal(); window.scrollTo(0, 0);
});
$('opsi-list').addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.opsi')) { e.preventDefault(); e.target.click(); const k = e.target.dataset.k, n = document.querySelector(`#opsi-list .opsi[data-k="${k}"]`); if (n) n.focus(); }
});
function konfirmUjian(judul, teks, aksi) {
  $('mx-judul').textContent = judul; $('mx-teks').textContent = teks;
  const w = $('mx-aksi'); w.innerHTML = '';
  aksi.forEach((a) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (a.kelas || 'btn-secondary'); b.textContent = a.label; b.onclick = () => { $('modal-ex').hidden = true; if (a.fn) a.fn(); }; w.appendChild(b); });
  $('modal-ex').hidden = false; w.firstChild.focus();
}
function batalSesi() {
  if (sesi) { clearInterval(sesi.timer); sesi.timer = null; sesi.aktif = false; }
  hapusSesiAktif();
  tampil('menu');
}
function akhiriDenganKonfirmasi() {
  if (sesi.mode === 'tryout' && PengaturanApp.ambil().konfirmAkhiri !== false) {
    const k = sesi.jawab.filter((j) => j === null || j === undefined).length;
    if (k) return konfirmUjian('Akhiri Mode Ngebut?', `Masih ada ${k} soal yang belum dijawab. Soal kosong tidak dihitung benar.`, [{ label: 'Kembali mengerjakan', kelas: 'btn-primary' }, { label: 'Akhiri sekarang', fn: selesai }]);
  }
  selesai();
}
$('btn-keluar-ujian').addEventListener('click', () => {
  if (!sesi || !sesi.aktif) return tampil('menu');
  if (sesi.mode === 'tryout' && PengaturanApp.ambil().konfirmAkhiri === false) return selesai();
  if (sesi.mode === 'tryout') konfirmUjian('Mau keluar ya?', 'Sesi sedang berjalan dan waktu tetap berjalan. Jika keluar tanpa menyelesaikan, jawaban sesi ini tidak disimpan ke statistik. Kamu juga bisa mengakhiri sekarang dan melihat hasil.', [{ label: 'Lanjut deh', kelas: 'btn-primary' }, { label: 'Akhiri aja, liat hasilnya', fn: selesai }, { label: 'Keluar, jangan disimpan', kelas: 'btn-bahaya', fn: batalSesi }]);
  else konfirmUjian('Kok? Yaudah aku bantu buat keluar deh', 'Soal yang udah kamu jawab tetap tercatat di statistik kok. Tapi kalo soal yang belum dijawab gabakal dihitung.', [{ label: 'Lanjut aja', kelas: 'btn-primary' }, { label: 'Pokoknya mau keluar', kelas: 'btn-bahaya', fn: batalSesi }]);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('modal-ex').hidden = true; });
// Anti-salin: teks soal dan pilihan tidak bisa diblok, disalin, atau diseret saat mengerjakan/mereview
(function () {
  const di = (e) => e.target.closest && e.target.closest('#kuis, #review') && !e.target.closest('input, textarea');
  ['copy', 'cut', 'contextmenu', 'dragstart', 'selectstart'].forEach((ev) =>
    document.addEventListener(ev, (e) => { if (di(e)) e.preventDefault(); }));
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && ['c', 'x', 'a', 'u', 's', 'p'].includes(e.key.toLowerCase()) && !e.target.closest('input, textarea') && !$('kuis').hidden) e.preventDefault();
  });
})();
window.addEventListener('beforeunload', (e) => { if (sesi && sesi.aktif && sesi.mode === 'tryout') { e.preventDefault(); e.returnValue = ''; } });
$('btn-review').addEventListener('click', renderReview);
$('btn-kembali-hasil').addEventListener('click', () => tampil('hasil'));
$('btn-menu').addEventListener('click', () => tampil('menu'));
$('btn-riwayat-sesi').addEventListener('click', () => {
  renderStatistik();
  const el = $('riwayat-sesi');
  const k = el && el.querySelector('details.sesi-kartu');
  if (k) k.open = true;
  if (el) el.scrollIntoView({ block: 'start' });
});
// Bank soal
$('btn-simpan-soal').addEventListener('click', simpanSoal);
// ---------- Pratinjau soal buatan sendiri (tampilan seperti saat latihan) ----------
function dataPratinjau() {
  const tipe = nilai('f-tipe'), baca = (k) => sanitize(getArea(k).innerHTML);
  let jawaban;
  if (tipe === 'isian') jawaban = $('f-isian').value.trim();
  else if (tipe === 'kompleks') jawaban = [...document.querySelectorAll('input[name="f-jawaban-ganda"]:checked')].map((c) => Number(c.value)).sort();
  else jawaban = Number(nilai('f-jawaban'));
  return { tipe, jawaban, soal: baca('soal'), pembahasan: baca('pembahasan'),
    opsi: tipe === 'isian' ? [] : [0, 1, 2, 3, 4].map((k) => baca('opsi' + k)),
    grafik: window.NalarineGraph ? window.NalarineGraph.getEditorValue() : null,
    mapel: nilai('f-mapel'), topik: (topikTaxById($('f-topiktax').value) || { topik: { nama: '' } }).topik.nama, level: nilai('f-level') };
}
let kunciEditor = false;
function renderPratinjau() {
  const kotak = $('kotak-pratinjau');
  if (kosongEditor(getArea('soal'))) {
    kotak.hidden = true;
    $('btn-pratinjau').textContent = 'Pratinjau';
    $('pesan-form').textContent = 'Tulis teks soal dulu untuk melihat pratinjau.';
    $('pesan-form').className = 'pesan err';
    return;
  }
  $('pesan-form').textContent = '';
  const s = dataPratinjau(), isian = s.tipe === 'isian';
  const nama = { pg: 'pilihan ganda', kompleks: 'centang semua yang benar', isian: 'isian bilangan cacah' }[s.tipe];
  const kunci = isian ? esc(s.jawaban || '(belum diisi)') : kunciHuruf(s);
  const badan = isian
    ? '<div class="isian"><input class="input isian-input" disabled placeholder="Contoh: 24"></div>'
    : `<div class="opsi-list">${s.opsi.map((o, k) => `<div class="opsi${kunciEditor && kunciOpsi(s, k) ? ' benar' : ''}">${s.tipe === 'kompleks' ? '<span class="cek"></span>' : ''}<span class="huruf">${HURUF[k]}</span>${isiOpsi(o)}</div>`).join('')}</div>`;
  const cek = bacaForm();
  kotak.innerHTML = `<div class="pratinjau-judul"><strong>Pratinjau</strong><span class="muted">Tampilan siswa: kunci dan pembahasan disembunyikan.</span></div>
    <p class="muted">${namaMapel(s.mapel)}, ${esc(s.topik || 'topik belum diisi')}, ${s.level}, ${nama}</p>
    <div class="teks-soal">${konten(s.soal, null, 'Gambar soal', s.grafik)}</div>${badan}
    ${kunciEditor ? `<div class="feedback"><strong>Kunci jawaban: ${kunci}</strong><div>${konten(s.pembahasan)}</div></div>` : ''}
    <div style="margin-top:12px"><button class="btn btn-secondary btn-kecil" type="button" id="btn-pv-kunci">${kunciEditor ? 'Sembunyikan kunci' : 'Tampilkan kunci dan pembahasan'}</button></div>
    ${cek.error ? `<p class="muted" style="margin-top:10px">Sebelum disimpan: ${esc(cek.error)}</p>` : ''}`;
  kotak.hidden = false;
  $('btn-pratinjau').textContent = 'Sembunyikan pratinjau';
  rumus(kotak);
}
$('kotak-pratinjau').addEventListener('click', (e) => {
  if (e.target.closest('#btn-pv-kunci')) { kunciEditor = !kunciEditor; renderPratinjau(); }
});
$('btn-pratinjau').addEventListener('click', () => {
  if (!$('kotak-pratinjau').hidden) { $('kotak-pratinjau').hidden = true; $('btn-pratinjau').textContent = 'Pratinjau'; return; }
  kunciEditor = false;
  renderPratinjau();
  if (!$('kotak-pratinjau').hidden) $('kotak-pratinjau').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
// Selama pratinjau terbuka, ikut diperbarui saat soal diketik atau kunci diganti
let timerPratinjau = null;
['input', 'change'].forEach((ev) => $('bank').addEventListener(ev, (e) => {
  if ($('kotak-pratinjau').hidden || $('kotak-pratinjau').contains(e.target)) return;
  clearTimeout(timerPratinjau);
  timerPratinjau = setTimeout(() => { if (!$('kotak-pratinjau').hidden) renderPratinjau(); }, 500);
}));

// ---------- Pratinjau tampilan siswa untuk soal tersimpan (kunci disembunyikan) ----------
const pv = { daftar: [], i: 0, pilih: [], kunci: false };
function bukaPratinjau(daftar, judul) {
  if (!daftar.length) return pesanBank('Belum ada soal untuk dipratinjau.', true);
  Object.assign(pv, { daftar, i: 0, pilih: daftar.map(() => null), kunci: false });
  $('pv-judul').textContent = judul;
  $('overlay-pv').hidden = false;
  document.body.style.overflow = 'hidden';
  renderPv();
}
function tutupPratinjau() { $('overlay-pv').hidden = true; document.body.style.overflow = ''; }
function renderPv() {
  const s = pv.daftar[pv.i], n = pv.daftar.length, p = pv.pilih[pv.i];
  $('pv-bar').style.width = ((pv.i + 1) / n) * 100 + '%';
  $('pv-info').textContent = `Soal ${pv.i + 1} dari ${n} (${namaMapel(s.mataPelajaran)}, ${s.topik})${adaGanda(s) ? ', centang semua yang benar' : adaIsian(s) ? ', isian bilangan cacah' : ''}`;
  $('pv-soal').innerHTML = konten(s.soal, s.gambarSoal, 'Gambar soal', s.grafik);
  $('pv-opsi').innerHTML = adaIsian(s)
    ? `<div class="isian"><input id="pv-isian" aria-label="Jawaban Anda (bilangan cacah)" class="input isian-input" type="text" inputmode="numeric" autocomplete="off" maxlength="12" placeholder="Contoh: 24" value="${p === null ? '' : esc(p)}"></div>`
    : s.opsi.map((o, k) => {
      const dipil = adaGanda(s) ? Array.isArray(p) && p.includes(k) : p === k;
      const kelas = pv.kunci && kunciOpsi(s, k) ? ' benar' : dipil ? ' terpilih' : '';
      return `<div class="opsi${kelas}" data-k="${k}">${adaGanda(s) ? '<span class="cek"></span>' : ''}<span class="huruf">${HURUF[k]}</span>${isiOpsi(o)}</div>`;
    }).join('');
  const fb = $('pv-fb');
  fb.hidden = !pv.kunci;
  if (pv.kunci) fb.innerHTML = `<strong>Kunci jawaban: ${kunciHuruf(s)}</strong><div>${konten(s.pembahasan, s.gambarPembahasan, 'Gambar pembahasan')}</div>`;
  $('pv-kunci').textContent = pv.kunci ? 'Sembunyikan kunci' : 'Tampilkan kunci dan pembahasan';
  $('pv-prev').disabled = pv.i === 0;
  $('pv-next').textContent = pv.i === n - 1 ? 'Selesai' : 'Lanjut';
  rumus($('overlay-pv'));
}
$('pv-tutup').addEventListener('click', tutupPratinjau);
$('overlay-pv').addEventListener('click', (e) => { if (e.target === $('overlay-pv')) tutupPratinjau(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('overlay-pv').hidden) tutupPratinjau(); });
$('pv-prev').addEventListener('click', () => { if (pv.i > 0) { pv.i--; pv.kunci = false; renderPv(); } });
$('pv-next').addEventListener('click', () => {
  if (pv.i >= pv.daftar.length - 1) return tutupPratinjau();
  pv.i++; pv.kunci = false; renderPv();
});
$('pv-kunci').addEventListener('click', () => { pv.kunci = !pv.kunci; renderPv(); });
$('pv-opsi').addEventListener('click', (e) => {
  const b = e.target.closest('.opsi');
  if (!b) return;
  const s = pv.daftar[pv.i], k = Number(b.dataset.k);
  if (adaGanda(s)) {
    const cur = Array.isArray(pv.pilih[pv.i]) ? pv.pilih[pv.i] : [];
    const baru = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k].sort();
    pv.pilih[pv.i] = baru.length ? baru : null;
  } else pv.pilih[pv.i] = k;
  renderPv();
});
$('pv-opsi').addEventListener('input', (e) => {
  if (!e.target.matches('.isian-input')) return;
  const v = e.target.value.replace(/\D/g, '');
  if (v !== e.target.value) e.target.value = v;
  pv.pilih[pv.i] = v === '' ? null : Number(v);
});
$('btn-pratinjau-semua').addEventListener('click', () => {
  bukaPratinjau(grupSoal().flatMap((g) => g.items), 'Pratinjau: ' + $('label-cetak').textContent);
});
$('btn-batal-edit').addEventListener('click', () => { resetForm(); pesanForm('', false); tutupForm(); });
$('daftar-custom').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-aksi]');
  if (!b) return;
  const a = b.dataset.aksi;
  if (a === 'edit') mulaiEdit(b.dataset.id);
  else if (a === 'hapus') hapusSoal(b.dataset.id);
  else if (a === 'pratinjau') { const x = BankSoal.ambil().find((q) => q.id === b.dataset.id); if (x) bukaPratinjau([x], 'Pratinjau soal'); }
  else if (a === 'pratinjau-folder') { const g = grupSoal().find((q) => (q.id || 'none') === b.dataset.folder); if (g) bukaPratinjau(g.items.filter(lolosFilterBank), 'Pratinjau: ' + g.nama); }
});
$('daftar-custom').addEventListener('change', (e) => {
  const ss = e.target.closest('select[data-subset]');
  if (ss) {
    const d = BankSoal.ambil(), it = d.find((x) => x.id === ss.dataset.subset);
    if (it) { if (ss.value) it.subtopikId = ss.value; else delete it.subtopikId; delete it.subtopikIds; BankSoal.simpan(d); renderSemuaBank(); }
    return;
  }
  const sel = e.target.closest('select[data-pindah]');
  if (sel) pindahkanSoal(sel.dataset.pindah, sel.value);
});
$('f-perlu-peta').addEventListener('change', (e) => { filterPetaAktif = e.target.checked; renderSemuaBank(); });
$('chip-folder').addEventListener('change', (e) => {
  filterAktif = e.target.value;
  pesanFolder('', false);
  renderSemuaBank();
});
$('btn-tambah-folder').addEventListener('click', tambahFolder);
$('folder-baru').addEventListener('keydown', (e) => { if (e.key === 'Enter') tambahFolder(); });
$('btn-ubah-folder')?.addEventListener('click', ubahNamaFolder);
$('btn-hapus-folder').addEventListener('click', hapusFolder);
$('btn-cetak').addEventListener('click', cetakPDF);

// Gambar yang dipilih dari tombol gambar di toolbar
$('file-gambar').addEventListener('change', (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // Perkecil agar hemat penyimpanan browser
      const skala = Math.min(1, 800 / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * skala);
      c.height = Math.round(img.height * skala);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      sisipkanGambar(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => pesanForm('Gambar tidak bisa dibaca. Coba file lain.', true);
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

document.querySelectorAll('.nav-link').forEach((a) => a.addEventListener('click', (e) => {
  e.preventDefault();
  if (sesi && sesi.aktif && a.classList.contains('keluar-kuis') && !confirm('Keluar dari sesi latihan sekarang?')) return;
  if (sesi && sesi.aktif) {
    clearInterval(sesi.timer);
    sesi.aktif = false;
  }
  if (a.dataset.hal === 'statistik') renderStatistik();
  else if (a.dataset.hal === 'bank') renderBank();
  else if (a.dataset.hal === 'pengaturan') { renderPengaturan(); tampil('pengaturan'); }
  else if (a.dataset.hal === 'setup') tampil('setup');
  else if (a.dataset.hal === 'tryout') tampil('tryout');
  else if (a.dataset.hal === 'koleksi') { renderKoleksiSoal(); tampil('koleksi'); }
 else if (a.dataset.hal === 'rekomendasi') { renderRekomendasi(); tampil('rekomendasi'); }
else if (a.dataset.hal === 'profil') { renderProfil(!ProfilApp.ambil()); tampil('profil'); }
else if (a.dataset.hal === 'laporan-admin' && ADMIN) {
  tampil('laporan-admin');
  muatLaporanAdmin();
}
else tampil('menu');
}));

buatEditor('ed-soal', 'Tulis teks soal di sini...', false);
buatEditor('ed-pembahasan', 'Tulis pembahasan di sini...', false);
if (window.NalarineGraph) window.NalarineGraph.initEditor($('ng-graph-editor'));
['A', 'B', 'C', 'D', 'E'].forEach((h, k) => buatEditor('ed-opsi' + k, `Tulis pilihan ${h} (teks atau gambar)...`, true));
// ---------- Beranda: hitung mundur, ringkasan, dan topik yang perlu diperkuat ----------
var JADWAL_UTBK_BAWAAN=[{tahun:2026,mulai:'2026-04-21',selesai:'2026-04-30',status:'resmi'},{tahun:2027,mulai:'2027-04-21',selesai:'2027-04-30',status:'perkiraan'}];
var jadwalUtbk=JADWAL_UTBK_BAWAAN.slice();
function isoLokal(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function bersihJadwal(a){
  if(!Array.isArray(a))return [];
  var re=/^\d{4}-\d{2}-\d{2}$/;
  return a.filter(function(x){return x&&re.test(x.mulai)&&re.test(x.selesai)&&x.selesai>=x.mulai&&!isNaN(new Date(x.mulai+'T00:00:00'));})
    .map(function(x){return {tahun:+x.tahun||+x.mulai.slice(0,4),mulai:x.mulai,selesai:x.selesai,status:x.status==='resmi'?'resmi':'perkiraan'};})
    .sort(function(a,b){return a.mulai<b.mulai?-1:1;});
}
function muatJadwalUtbk(){
  try{
    fetch('jadwal-utbk.json?v='+Math.floor(Date.now()/3600000),{cache:'no-cache'})
      .then(function(r){return r.ok?r.json():null;})
      .then(function(j){
        var a=bersihJadwal(j&&j.jadwal?j.jadwal:j);
        if(!a.length)return;
        jadwalUtbk=a;
        var m=document.getElementById('menu');
        if(m&&!m.hidden&&typeof renderBeranda==='function')renderBeranda();
      }).catch(function(){});
  }catch(e){}
}
function jadwalBerikutnya(){
  var a=bersihJadwal(jadwalUtbk);if(!a.length)a=bersihJadwal(JADWAL_UTBK_BAWAAN);
  var hariIni=isoLokal(new Date());
  for(var i=0;i<a.length;i++)if(a[i].selesai>=hariIni)return a[i];
  // jadwal terakhir sudah lewat: perkirakan tahun berikutnya dari pola terakhir
  var j=a[a.length-1],t=j.tahun,mulai=j.mulai,selesai=j.selesai;
  for(var k=0;k<20;k++){
    t++;mulai=(+mulai.slice(0,4)+1)+mulai.slice(4);selesai=(+selesai.slice(0,4)+1)+selesai.slice(4);
    if(selesai>=hariIni)return {tahun:t,mulai:mulai,selesai:selesai,status:'perkiraan'};
  }
  return j;
}
function rentangTgl(a,b){
  var x=new Date(a+'T00:00:00'),y=new Date(b+'T00:00:00');
  if(a===b)return formatTgl(a);
  var bln=function(d){return d.toLocaleDateString('id-ID',{month:'long'});};
  if(x.getMonth()===y.getMonth()&&x.getFullYear()===y.getFullYear())return x.getDate()+'–'+y.getDate()+' '+bln(y)+' '+y.getFullYear();
  return formatTgl(a)+' – '+formatTgl(b);
}
function ketJadwal(j){return 'UTBK-SNBT '+j.tahun+' · '+rentangTgl(j.mulai,j.selesai)+(j.status==='resmi'?'':' (perkiraan)');}
muatJadwalUtbk();
function hariKeUjian(iso) {
  const hariIni = new Date();
  hariIni.setHours(0, 0, 0, 0);
  const t = new Date(iso + 'T00:00:00');
  return Math.round((t - hariIni) / 86400000);
}
function salamWaktu(h) { return h < 4 ? 'Selamat malam' : h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam'; }
function renderHeader() {
  const p = ProfilApp.ambil(), now = new Date();
  const nama = p && p.nama ? String(p.nama).trim().split(/\s+/)[0] : '';
  $('salam').textContent = nama ? `${salamWaktu(now.getHours())}, ${nama}!` : `${salamWaktu(now.getHours())}!`;
  $('salam-sub').textContent = nama ? 'Siap meningkatkan kemampuan hari ini?' : 'Lengkapi profilmu agar belajar terasa lebih personal.';
  $('tgl-hari').textContent = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  $('dash-avatar').innerHTML = avatarIsi(p ? p.nama : '?');
}
var grafikState = { p: '7', m: 'jumlah' };
function kunciTgl(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dataGrafik() {
  const r = Riwayat.ambil().filter((x) => x && Number.isFinite(x.t));
  const per = {};
  r.forEach((x) => { const k = kunciTgl(new Date(x.t)); const o = per[k] || (per[k] = { n: 0, b: 0 }); o.n++; o.b = tambahSkor(o.b, skorRiwayat(x)); });
  const hariIni = new Date(); hariIni.setHours(0, 0, 0, 0);
  let awal = new Date(hariIni);
  if (grafikState.p === 'semua') { if (r.length) { awal = new Date(Math.min(...r.map((x) => x.t))); awal.setHours(0, 0, 0, 0); } }
  else awal.setDate(awal.getDate() - (Number(grafikState.p) - 1));
  const pts = [];
  for (const d = new Date(awal); d <= hariIni; d.setDate(d.getDate() + 1)) {
    const o = per[kunciTgl(d)] || { n: 0, b: 0 };
    pts.push({ d: new Date(d), n: o.n, b: o.b, acc: o.n ? Math.round((o.b / o.n) * 100) : null });
  }
  return { pts, total: r.length };
}
function gambarGrafik() {
  const el = $('grafik'); if (!el) return;
  const { pts, total } = dataGrafik();
  if (!total) {
    el.innerHTML = `<div class="gr-kosong"><svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg><b>Belum ada riwayat belajar.</b><p class="muted">Mulai latihan pertamamu dan perkembanganmu akan muncul di sini.</p><button type="button" class="btn btn-primary" data-qa="latihan">Mulai Latihan</button></div>`;
    return;
  }
  const m = grafikState.m, val = (p) => (m === 'jumlah' ? p.n : p.acc);
  const ada = pts.filter((p) => val(p) !== null && (m === 'akurasi' || p.n > 0));
  if (!ada.length) { el.innerHTML = '<div class="gr-kosong"><b>Belum ada pengerjaan di periode ini.</b><p class="muted">Pilih periode yang lebih panjang atau mulai latihan.</p></div>'; return; }
  const W = Math.max(260, el.clientWidth || 320), H = 220, pl = 34, pr = 10, pt = 14, pb = 28;
  const ymax = m === 'akurasi' ? 100 : Math.max(4, Math.ceil(Math.max(...pts.map((p) => p.n)) * 1.15));
  const X = (i) => pl + (pts.length === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (pts.length - 1));
  const Y = (v) => pt + (H - pt - pb) * (1 - v / ymax);
  const idx = pts.map((p, i) => i).filter((i) => (m === 'akurasi' ? pts[i].acc !== null : true));
  let path = '';
  idx.forEach((i, k) => { const x = X(i), y = Y(val(pts[i])); if (!k) path = `M${x} ${y}`; else { const px = X(idx[k - 1]), py = Y(val(pts[idx[k - 1]])), mx = (px + x) / 2; path += ` C${mx} ${py} ${mx} ${y} ${x} ${y}`; } });
  const base = H - pb;
  const area = idx.length > 1 ? `${path} L${X(idx[idx.length - 1])} ${base} L${X(idx[0])} ${base} Z` : '';
  let grid = '';
  for (let g = 0; g <= 4; g++) { const v = (ymax * g) / 4, y = Y(v); grid += `<line x1="${pl}" x2="${W - pr}" y1="${y}" y2="${y}" stroke="var(--border)" stroke-width="1"/><text x="${pl - 6}" y="${y + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)">${Math.round(v)}${m === 'akurasi' ? '%' : ''}</text>`; }
  const langkah = Math.ceil(pts.length / Math.max(2, Math.floor((W - pl - pr) / 62)));
  let lbl = '';
  pts.forEach((p, i) => { if (i % langkah === 0) lbl += `<text x="${X(i)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${p.d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}</text>`; });
  const dots = pts.length <= 45 ? idx.map((i) => `<circle cx="${X(i)}" cy="${Y(val(pts[i]))}" r="3.5" fill="var(--card)" stroke="var(--primary)" stroke-width="2"/>`).join('') : '';
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Grafik ${m === 'jumlah' ? 'soal dikerjakan' : 'akurasi'} per hari">${grid}${area ? `<path d="${area}" fill="var(--primary)" fill-opacity=".12"/>` : ''}<path d="${path}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}${lbl}<circle id="gr-hov" r="5" fill="var(--primary)" stroke="#fff" stroke-width="2" display="none"/></svg><div class="gr-tip" id="gr-tip" hidden></div>`;
  const svg = el.querySelector('svg'), tip = $('gr-tip'), hov = $('gr-hov');
  const tunjuk = (ev) => {
    const rc = svg.getBoundingClientRect(), x = ((ev.clientX - rc.left) / rc.width) * W;
    let b = 0, jb = 1e9; pts.forEach((p, i) => { const j = Math.abs(X(i) - x); if (j < jb) { jb = j; b = i; } });
    const p = pts[b], tgl = p.d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
    tip.innerHTML = `<b>${tgl}</b><br>${p.n ? `${p.n} soal · ${p.acc}% akurat (${angkaSkor(p.b)} benar)` : 'Tidak ada pengerjaan'}`;
    tip.hidden = false;
    const v = val(p);
    if (v !== null) { hov.setAttribute('cx', X(b)); hov.setAttribute('cy', Y(v)); hov.removeAttribute('display'); } else hov.setAttribute('display', 'none');
    const px = (X(b) / W) * rc.width;
    tip.style.left = Math.min(Math.max(px, 70), rc.width - 70) + 'px';
  };
  svg.addEventListener('pointermove', tunjuk); svg.addEventListener('pointerdown', tunjuk);
  svg.addEventListener('pointerleave', () => { tip.hidden = true; hov.setAttribute('display', 'none'); });
}
function mulaiMode(mode) {
  tampil('setup');
  document.querySelectorAll('input[name="mode"]').forEach((i) => (i.checked = i.value === mode));
  syncBlokWaktu(); ringkasSesi();
}
function renderBeranda() {
  const p = ProfilApp.ambil();
  const d = Penyimpanan.ambil();
  renderHeader();
  const kh = $('kartu-hitung');
  kh.classList.add('hero');
  const jd = jadwalBerikutnya();
  const hari = hariKeUjian(jd.mulai);
  if (hari > 0) kh.innerHTML = `<div><p class="hero-lbl">MENUJU UTBK</p><div class="hero-hari">${hari} hari</div><p class="hero-tgl">${esc(ketJadwal(jd))}</p></div>`;
  else kh.innerHTML = `<div><p class="hero-lbl">MENUJU UTBK</p><h2>UTBK sedang berlangsung. Semangat!</h2><p class="hero-tgl">${esc(ketJadwal(jd))}</p></div>`;

  const ik = (path) => `<span class="sum-ik"><svg viewBox="0 0 24 24">${path}</svg></span>`;
  const kartu = (path, angka, label) => `<button type="button" class="sum-card" aria-label="${label}: ${angka}. Buka statistik lengkap">${ik(path)}<b>${angka}</b><span>${label}</span></button>`;
  $('kartu-ringkasan').innerHTML =
    kartu('<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>', d.total, 'Soal dikerjakan') +
    kartu('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>', d.total ? Math.round((d.benar / d.total) * 100) + '%' : '–', 'Akurasi') +
    kartu('<path d="M5 12l5 5L20 7"/>', angkaSkor(d.benar), 'Jawaban benar');

  gambarGrafik();
  renderBerita();

  const topikTerdaftar = (nama) => Object.keys(TAKSONOMI).some((mapel) => !!cariTopikTax(mapel, nama));
  const topik = Object.entries(d.topik).filter(([nama, x]) => x.total >= 3 && topikTerdaftar(nama))
    .map(([nama, x]) => ({ nama, total: x.total, pct: Math.round((x.benar / x.total) * 100) }))
    .sort((a, b) => a.pct - b.pct || b.total - a.total);
  const kp = $('kartu-perkuat');
  if (!topik.length) {
    kp.innerHTML = '<h2>Perlu diperkuat</h2><p class="muted">Kerjakan minimal 3 soal di satu topik, nanti topik yang paling perlu diperkuat muncul di sini.</p>';
    return;
  }
  const lemah = topik[0];
  const rr = Riwayat.ambil().slice().reverse().find((x) => x && x.topik === lemah.nama);
  const mapel = rr && rr.mapel ? namaMapel(rr.mapel) : '';
  const pr = lemah.pct < 50 ? ['tinggi', 'Prioritas tinggi'] : lemah.pct < 75 ? ['sedang', 'Prioritas sedang'] : ['baik', 'Cukup baik'];
  kp.innerHTML = `<h2>Perlu diperkuat</h2>
    <p style="margin:0 0 2px"><strong>${esc(lemah.nama)}</strong> <span class="prio ${pr[0]}">${pr[1]}</span></p>
    <div class="rek-baris muted">${mapel ? `<span>${esc(mapel)}</span>` : ''}<span>${lemah.pct}% akurat</span><span>${lemah.total} soal dikerjakan</span></div>
    <div class="progress"><div class="progress-bar" style="width:${lemah.pct}%"></div></div>
    ${(() => { const rc = rincianSubTopik(lemah.nama, rr && rr.mapel); const f = rc && rc.subs.find((x) => x.k === 'perlu' || x.k === 'sedang'); return f ? `<p class="rek-catatan" style="margin:8px 0 0">Fokus subtopik: <b>${esc(f.n.nama)}</b> (${f.u.acc}%)</p>` : ''; })()}
    <button type="button" class="btn btn-primary btn-kecil" data-latihan="${esc(lemah.nama)}" style="margin-top:8px">Latihan 5 Soal</button>
    <p class="muted" style="margin:10px 0 0">Klik kartu ini untuk rekomendasi lengkap &rsaquo;</p>`;
}
$('grafik').addEventListener('click', (e) => { if (e.target.closest('[data-qa="latihan"]')) mulaiMode('latihan'); });
$('gr-periode').addEventListener('click', (e) => { const b = e.target.closest('button[data-p]'); if (!b) return; grafikState.p = b.dataset.p; document.querySelectorAll('#gr-periode button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); gambarGrafik(); });
$('gr-metrik').addEventListener('click', (e) => { const b = e.target.closest('button[data-m]'); if (!b) return; grafikState.m = b.dataset.m; document.querySelectorAll('#gr-metrik button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); gambarGrafik(); });
$('mulai-belajar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-qa]'); if (!b) return;
  if (b.dataset.qa === 'bank') tampil('bank');
  else if (b.dataset.qa === 'tryout') tampil('tryout');
  else mulaiMode('latihan');
});
$('btn-kembali-tryout')?.addEventListener('click', () => tampil('setup'));
$('dash-avatar').addEventListener('click', () => { renderProfil(!ProfilApp.ambil()); tampil('profil'); });
var _rsz = null;
window.addEventListener('resize', () => { clearTimeout(_rsz); _rsz = setTimeout(() => { if (!$('menu').hidden) gambarGrafik(); }, 150); });
$('kartu-ringkasan').addEventListener('click', () => renderStatistik());
$('kartu-hitung').addEventListener('click', () => {
  openCountdown();
});
$('btn-tutup-hitung').addEventListener('click', closeCountdown);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCountdown(); });
$('btn-kembali-rek').addEventListener('click', () => tampil('menu'));
$('isi-rekomendasi').addEventListener('click', (e) => {
  const sb = e.target.closest('button[data-rek-sub]');
  if (sb) return latihanSubtopik(sb.dataset.rekSub);
  const b = e.target.closest('button[data-latihan]');
  if (b) latihanTopik(b.dataset.latihan);
});

// Mulai latihan 5 soal dari satu topik, langsung tanpa membuka halaman atur latihan
function latihanTopik(nama) {
  const setRadio = (nm, v) => { const el = document.querySelector(`input[name="${nm}"][value="${v}"]`); if (el) el.checked = true; };
  setRadio('sumber', 'semua');
  setRadio('mapel', 'semua');
  setRadio('mode', 'latihan');
  setRadio('jumlah', '5');
  document.querySelectorAll('#pilih-level input').forEach((i) => (i.checked = true));
  buatTopik();
  document.querySelectorAll('#pilih-topik input[data-tp]').forEach((i) => (i.checked = i.value === nama));
  hitungSoal();
  if (soalTerfilter().length) { window._tanpaRekam = true; mulai(); }
  else tampil('setup');
}
$('kartu-perkuat').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-latihan]');
  if (b) return latihanTopik(b.dataset.latihan);
  renderRekomendasi();
  tampil('rekomendasi');
});

// ---------- Berita UTBK (dari /api/berita di Vercel), dengan cache ----------
function fmtTglBerita(s) {
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
var _berita = { t: 0, data: null, p: null, gagal: 0 };
var BERITA_TTL = 15 * 60 * 1000;
var _beritaRefreshMulai = 0;
function jedaAnimasiRefresh() { const sisa = 700 - (Date.now() - _beritaRefreshMulai); return sisa > 0 ? new Promise((resolve) => setTimeout(resolve, sisa)) : Promise.resolve(); }
try { const c = JSON.parse(sessionStorage.getItem('neon_berita')); if (c && Array.isArray(c.data)) { _berita.t = c.t; _berita.data = c.data; } } catch (e) {}
function tampilBerita(basi) {
  const el = $('kartu-berita');
  el.innerHTML = `<div class="berita-aksi"><h2 style="margin:0">Berita Pendidikan Terbaru</h2><button type="button" class="berita-refresh" data-berita="muat" aria-label="Perbarui berita" title="Perbarui berita"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9a7 7 0 0 1 11.7-2L20 12M4 12l2.7 5a7 7 0 0 0 11.7-2"/></svg></button></div>
    ${basi ? '<p class="muted">Gagal memperbarui, menampilkan berita tersimpan.</p>' : ''}
    <ul class="daftar-berita">${_berita.data.slice(0, 5).map((b) => `<li><a href="${esc(b.link)}" target="_blank" rel="noopener">${esc(b.judul)}</a>
      <div class="muted">${esc(b.sumber || '')}${b.tanggal ? ' · ' + esc(fmtTglBerita(b.tanggal)) : ''}</div></li>`).join('')}</ul>
    <p class="muted" style="margin:10px 0 0;font-size:.82rem">Berita dari media, bukan pengumuman resmi. Info resmi ada di <a href="https://portal.snpmb.id" target="_blank" rel="noopener">portal SNPMB</a>.</p>`;
}
const BERITA_API_CADANGAN = 'https://id.nalarine.workers.dev/api/berita';
async function ambilBeritaDariServer() {
  const endpoint = [];
  if (location.protocol === 'http:' || location.protocol === 'https:') endpoint.push('/api/berita');
  endpoint.push(BERITA_API_CADANGAN);
  let errorTerakhir;
  for (const url of [...new Set(endpoint)]) {
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!Array.isArray(data) || !data.length) throw new Error('Data berita tidak valid');
      return data;
    } catch (e) {
      errorTerakhir = e;
    }
  }
  throw errorTerakhir || new Error('Server berita tidak dapat dijangkau');
}
function renderBerita(paksa) {
  const el = $('kartu-berita');
  if (_berita.p) return _berita.p;
  if (!paksa && _berita.data && Date.now() - _berita.t < BERITA_TTL) { tampilBerita(); return Promise.resolve(); }
  if (!paksa && !_berita.data && Date.now() - _berita.gagal < 60000) { el.innerHTML = '<h2>Berita Pendidikan Terbaru</h2><p class="muted">Berita belum bisa dimuat.</p><button type="button" class="btn btn-secondary btn-kecil" data-berita="muat">Coba lagi</button>'; return Promise.resolve(); }
  if (!_berita.data) el.innerHTML = '<h2>Berita Pendidikan Terbaru</h2><p class="muted">Memuat berita...</p>';
  _berita.p = ambilBeritaDariServer()
    .then(async (data) => {
      if (_beritaRefreshMulai) await jedaAnimasiRefresh();
      _berita.data = data; _berita.t = Date.now(); _berita.gagal = 0;
      try { sessionStorage.setItem('neon_berita', JSON.stringify({ t: _berita.t, data })); } catch (e) {}
      tampilBerita();
    })
    .catch(async () => {
      if (_beritaRefreshMulai) await jedaAnimasiRefresh();
      _berita.gagal = Date.now();
      if (_berita.data) tampilBerita(true);
      else el.innerHTML = '<h2>Berita Pendidikan Terbaru</h2><p class="muted">Berita belum bisa dimuat dari server. Periksa koneksi internet, lalu coba lagi.</p><button type="button" class="btn btn-secondary btn-kecil" data-berita="muat">Coba lagi</button>';
    })
    .finally(() => { _berita.p = null; });
  return _berita.p;
}
$('kartu-berita').addEventListener('click', (e) => { const btn = e.target.closest('[data-berita="muat"]'); if (btn) { e.stopPropagation(); _beritaRefreshMulai = Date.now(); btn.classList.add('is-loading'); btn.setAttribute('aria-busy', 'true'); renderBerita(true); } });

// ---------- Hitung mundur (overlay animasi) ----------
let timerHitung = null;
function setAngka(id, v) {
  const el = $(id);
  const t = String(v).padStart(2, '0');
  if (el.textContent !== t) {
    el.textContent = t;
    el.classList.remove('tick');
    void el.offsetWidth; // memulai ulang animasi
    el.classList.add('tick');
  }
}
function updateCountdown(iso) {
  const target = new Date(iso + 'T00:00:00');
  const diff = target - new Date();
  const pesan = $('cd-pesan');
  if (diff <= 0) {
    ['cd-d', 'cd-h', 'cd-m', 'cd-s'].forEach((id) => setAngka(id, 0));
    pesan.textContent = 'UTBK sedang berlangsung. Semangat!';
    return;
  }
  const d = Math.floor(diff / 86400000);
  const hh = Math.floor((diff % 86400000) / 3600000);
  const mm = Math.floor((diff % 3600000) / 60000);
  const ss = Math.floor((diff % 60000) / 1000);
  setAngka('cd-d', d);
  setAngka('cd-h', hh);
  setAngka('cd-m', mm);
  setAngka('cd-s', ss);
  pesan.textContent = 'Setiap hari latihan berarti. Terus semangat!' + (jadwalBerikutnya().status === 'resmi' ? '' : ' Jadwal resmi dari SNPMB belum diumumkan, tanggal ini masih perkiraan.');
}
function openCountdown() {
  const jd = jadwalBerikutnya();
  $('cd-tgl').textContent = ketJadwal(jd);
  $('overlay-hitung').hidden = false;
  updateCountdown(jd.mulai);
  clearInterval(timerHitung);
  timerHitung = setInterval(() => updateCountdown(jadwalBerikutnya().mulai), 1000);
}
function closeCountdown() {
  clearInterval(timerHitung);
  timerHitung = null;
  $('overlay-hitung').hidden = true;
}

// ---------- Rincian subtopik untuk satu topik (dipakai kartu rekomendasi dan beranda) ----------
var LABEL_REK_SUB = { perlu: 'Perlu penguatan', sedang: 'Berkembang', data: 'Belum cukup data', dikuasai: 'Dikuasai', belum: 'Belum dikerjakan', kosong: 'Belum ada soal' };
function rincianSubTopik(nama, mapel) {
  const M = window._mt && window._mt();
  if (!M) return null;
  M.reset();
  const node = Object.keys(M.idx).map((k) => M.idx[k]).find((n) => n.type === 'topik' && n.nama === nama && (!mapel || n.s === mapel));
  if (!node || !node.t.sub.length) return null;
  const urut = { perlu: 0, sedang: 1, data: 2, belum: 3, kosong: 4, dikuasai: 5 };
  const subs = node.t.sub.map((sb) => {
    const n = M.idx[sb.id], u = M.ukur(n);
    const k = !u.soal ? 'kosong' : !u.n ? 'belum' : (u.status === 'sedang' && u.n < M.K.MIN_PERLU) ? 'data' : u.status;
    return { n, u, k };
  }).sort((a, b) => urut[a.k] - urut[b.k] || (a.u.acc ?? 101) - (b.u.acc ?? 101) || a.n.nama.localeCompare(b.n.nama));
  return { node, subs, tercatat: subs.reduce((t, x) => t + x.u.n, 0), K: M.K };
}
function fokusSubHTML(rc) {
  const lemah = rc.subs.find((x) => x.k === 'perlu') || rc.subs.find((x) => x.k === 'sedang') || rc.subs.find((x) => x.k === 'data');
  if (lemah) {
    const kal = lemah.k === 'perlu' ? 'Paling perlu diperkuat' : lemah.k === 'sedang' ? 'Perlu latihan lagi' : 'Mulai terlihat, tapi datanya masih sedikit';
    return `<p class="rek-fokus st-${lemah.k === 'data' ? 'belum' : lemah.k}"><b>${kal}:</b> ${esc(lemah.n.nama)}. Akurasi ${lemah.u.acc}% (${lemah.u.b} dari ${lemah.u.n} percobaan).</p>`;
  }
  if (rc.subs.some((x) => x.k === 'dikuasai') && !rc.subs.some((x) => x.k === 'belum')) return '<p class="rek-fokus st-dikuasai">Semua subtopik yang punya soal sudah dikuasai.</p>';
  const baru = rc.subs.find((x) => x.k === 'belum');
  if (baru) return `<p class="rek-fokus">Belum ada data subtopik. Mulai dari <b>${esc(baru.n.nama)}</b>.</p>`;
  return '';
}
function subTopikRekHTML(r) {
  const rc = rincianSubTopik(r.nama, r.mapel);
  if (!rc) return '';
  const adaData = rc.subs.some((x) => x.u.n > 0);
  const baris = rc.subs.map(({ n, u, k }) => `<li class="rek-sub">
      <div class="rek-sub-top"><span class="rek-sub-nama">${esc(n.nama)}</span><span class="mt-badge st-${k}">${LABEL_REK_SUB[k]}</span></div>
      ${u.n ? `<div class="rek-sub-bar"><div class="kem-bar" aria-hidden="true"><i class="st-${k}" style="width:${Math.max(2, u.acc)}%"></i></div><strong>${u.acc}%</strong></div>` : ''}
      <div class="rek-sub-meta"><span>${u.soal ? (u.n ? `${u.b} dari ${u.n} percobaan · ${u.uniq} dari ${u.soal} soal berbeda` : `${u.soal} soal tersedia`) : 'Belum ada soal yang ditandai ke subtopik ini'}</span>${u.soal ? `<button type="button" class="btn btn-secondary btn-kecil" data-rek-sub="${esc(n.id)}" aria-label="Latihan ${esc(n.nama)}">Latih</button>` : ''}</div>
    </li>`).join('');
  const lepas = r.total - rc.tercatat;
  return fokusSubHTML(rc) + `<details class="rek-subs"><summary>Rincian ${rc.subs.length} subtopik</summary><ul class="rek-sublist">${baris}</ul>`
    + (lepas > 0 && r.total ? `<p class="rek-catatan">${lepas} dari ${r.total} soal dikerjakan belum terhubung ke subtopik (soalnya belum ditandai subtopik, atau riwayatnya sudah lama).</p>` : '') + '</details>';
}
// Latihan langsung untuk satu subtopik: hanya soal yang ditandai subtopik itu
function latihanSubtopik(id) {
  const M = window._mt && window._mt();
  if (!M) return;
  M.mulai(id);
  const setRadio = (nm, v) => { const el = document.querySelector(`input[name="${nm}"][value="${v}"]`); if (el) el.checked = true; };
  setRadio('mode', 'latihan'); setRadio('jumlah', '5');
  document.querySelectorAll('#pilih-level input').forEach((i) => (i.checked = true));
  window._subAktif = id;
  hitungSoal();
  if (soalTerfilter().length) { window._tanpaRekam = true; mulai(); }
  window._subAktif = null;
  const si = $('sub-info'); if (si) si.hidden = true;
}
// ---------- Rekomendasi belajar (dari statistik) ----------
function renderRekomendasi() {
  const d = Penyimpanan.ambil();
  const semua = [...new Set([...SOAL, ...BankSoal.ambil()])];
  const mapelDari = {};
  semua.forEach((s) => { if (!mapelDari[namaTopikResmi(s)]) mapelDari[namaTopikResmi(s)] = s.mataPelajaran; });
  const daftar = [...new Set(semua.map(namaTopikResmi))].map((nama) => {
    const x = d.topik[nama] || { total: 0, benar: 0 };
    const pct = x.total ? Math.round((x.benar / x.total) * 100) : null;
    let kat, judul, saran, urut;
    if (x.total === 0) {
      kat = 'belum'; judul = 'Belum pernah dilatih'; urut = 2;
      saran = 'Mulai dengan 5 soal untuk mengetahui kemampuanmu di topik ini.';
    } else if (x.total < 3) {
      kat = 'sedikit'; judul = 'Data masih sedikit'; urut = 3;
      saran = 'Kerjakan beberapa soal lagi supaya hasilnya lebih akurat.';
    } else if (pct < 60) {
      kat = 'tinggi'; judul = 'Prioritas tinggi'; urut = 0;
      saran = 'Baca pembahasan soal yang salah, lalu latihan 5 soal lagi.';
    } else if (pct < 80) {
      kat = 'sedang'; judul = 'Perlu latihan'; urut = 1;
      saran = 'Sudah cukup baik. Latihan lagi supaya nilainya stabil.';
    } else {
      kat = 'baik'; judul = 'Sudah baik'; urut = 4;
      saran = 'Pertahankan dengan latihan ringan secara berkala.';
    }
    return { nama, mapel: mapelDari[nama] || '', total: x.total, pct, kat, judul, saran, urut };
  }).sort((a, b) => a.urut - b.urut || (a.pct ?? 0) - (b.pct ?? 0));

  const jml = (...k) => daftar.filter((r) => k.includes(r.kat)).length;
  const tile = (t, v, w) => `<div class="stat-tile"><span>${t}</span><strong${w ? ` style="color:var(--${w})"` : ''}>${v}</strong></div>`;
  const kartu = (r) => `<div class="kartu-rek kat-${r.kat}">
      <div class="baris-rek"><span class="badge-rek">${esc(r.judul)}</span><span class="pill-mapel" title="${esc(namaMapel(r.mapel))}">${esc(r.mapel || '-')}</span></div>
      <h3>${esc(r.nama)}</h3>
      ${r.total ? `<div class="rek-akurasi"><div class="progress"><div class="progress-bar" style="width:${r.pct}%;background:${warnaLevel(r.pct)}"></div></div><strong>${r.pct}%</strong></div><p class="muted" style="margin:0 0 8px">${r.total} soal dikerjakan</p>` : '<p class="muted" style="margin:6px 0 8px">Belum ada latihan</p>'}
      ${subTopikRekHTML(r)}
      <p class="rek-saran">${esc(r.saran)}</p>
      <button class="btn btn-primary btn-kecil" data-latihan="${esc(r.nama)}">Latihan 5 soal</button>
    </div>`;
  $('isi-rekomendasi').innerHTML =
    `<div class="ringkasan-bank" style="margin-top:16px">${tile('Prioritas tinggi', jml('tinggi'), 'salah')}${tile('Perlu latihan', jml('sedang'), 'warning')}${tile('Data kurang', jml('belum', 'sedikit'))}${tile('Sudah baik', jml('baik'), 'benar')}</div>` +
    (daftar.length ? `<div class="rek-grid">${daftar.map(kartu).join('')}</div>` : '<div class="state-kosong"><strong>Belum ada topik</strong><p class="muted">Tambahkan soal ke bank atau tunggu soal bawaan dimuat.</p></div>');
}

// ---------- Profil publik (#/u/username) ----------
async function tampilPublik(u) {
  tampil('publik');
  const el = $('isi-publik');
  el.innerHTML = '<p class="muted">Memuat profil...</p>';
  try {
    const p = await rest('rpc/profil_publik', { method: 'POST', body: { p_username: u } });
    if (!p) {
      el.innerHTML = '<h2>Profil tidak ditemukan</h2><p class="muted">Profil ini tidak ada atau masih privat.</p>';
      return;
    }
    let statistikHTML = '';
    const s = p.statistik;
    if (s && s.total) {
      const akurasi = Math.round((s.benar / s.total) * 100);
      const topik = Object.entries(s.topik || {}).filter(([, x]) => x.total).sort((a, b) => b[1].benar / b[1].total - a[1].benar / a[1].total || b[1].total - a[1].total);
      const tile = (t, v) => `<div class="stat-tile"><span>${t}</span><strong>${v}</strong></div>`;
      statistikHTML = `<div class="ringkasan-bank" style="grid-template-columns:repeat(3,minmax(0,1fr));margin:18px 0">${tile('Soal dikerjakan', s.total)}${tile('Akurasi', akurasi + '%')}${tile('Topik dilatih', topik.length)}</div>
        <p class="label" style="margin-top:0">Kemampuan per topik</p>
        ${topik.slice(0, 10).map(([nama, x]) => { const pct = Math.round((x.benar / x.total) * 100); return `<div class="hbar"><span class="nm" title="${esc(nama)}">${esc(nama)}</span><div class="tr"><div class="fl ${pct < 50 ? 'lv-rendah' : pct < 75 ? 'lv-sedang' : 'lv-tinggi'}" style="width:${Math.max(2, pct)}%"></div></div><span class="nilai">${pct}% <span class="muted">· ${x.total}</span></span></div>`; }).join('')}`;
    } else if (s) {
      statistikHTML = '<div class="state-kosong" style="margin-top:18px"><strong>Belum ada data latihan</strong></div>';
    }
    el.innerHTML = `<div class="pub-hero"><div class="avatar">${esc(p.nama.charAt(0).toUpperCase())}</div>
        <div style="min-width:0"><h2 style="margin:0;color:#fff">${esc(p.nama)}</h2><p style="margin:0;opacity:.8">@${esc(p.username)}</p></div></div>
      ${p.deskripsi ? `<p style="margin:16px 0 0">${esc(p.deskripsi)}</p>` : ''}
      ${statistikHTML}`;
  } catch (e) {
    el.innerHTML = '<h2>Profil belum bisa dimuat</h2><p class="muted">Pastikan koneksi internet aktif, lalu coba lagi.</p>';
  }
}
function cekHashPublik() {
  const m = location.hash.match(/^#\/u\/([a-z0-9_]{3,20})$/);
  if (m) tampilPublik(m[1]);
}
$('btn-kembali-publik').addEventListener('click', () => {
  history.replaceState(null, '', location.pathname);
  tampil('menu');
});

// ---------- Pengaturan: latihan default, profil publik, hapus akun ----------
function terapkanDefaultSetup() {
  const p = PengaturanApp.ambil();
  // Setiap masuk kembali ke Atur Latihan, pulihkan konfigurasi default.
  const mode = p.modeDefault || 'latihan';
  const jml = String(p.jumlahDefault || '5');
  const mp = p.mapelDefault || 'semua';
  document.querySelectorAll('input[name="mode"]').forEach((i) => (i.checked = i.value === mode));
  const pilihJumlah = $('pilih-jumlah');
  pilihJumlah.value = ['5', '10', '15', '20', '25', '30', '35', '40', '45', '50', 'semua'].includes(jml) ? jml : '5';
  document.querySelectorAll('input[name="mapel"]').forEach((i) => (i.checked = i.value === mp));
}
$('pengaturan').addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'pubatur-publik' || t.id === 'pubatur-statistik') {
    const prof = ProfilApp.ambil();
    if (!prof) {
      alert('Buat profil dulu di halaman Profil dan akun.');
      t.checked = false;
      return;
    }
    const publik = $('pubatur-publik').checked;
    if (publik && !prof.username) {
      alert('Isi username dulu di halaman profil supaya profil publik bisa dibuka.');
      $('pubatur-publik').checked = false;
      return;
    }
    ProfilApp.simpan({ ...prof, publik, tampilkanStatistik: $('pubatur-statistik').checked });
    if (AkunApp.sesi()) {
      pushProfil().catch((err) => alert('Belum tersimpan ke akun: ' + err.message));
    }
  }
});
$('btn-hapus-buka').addEventListener('click', () => { $('blok-hapus').hidden = false; });
$('hapus-konfirmasi').addEventListener('input', (e) => {
  $('btn-hapus-final').disabled = e.target.value.trim().toUpperCase() !== 'HAPUS';
});
$('btn-hapus-final').addEventListener('click', hapusAkunDanData);
async function hapusAkunDanData() {
  const pesan = $('pesan-hapus');
  const s = AkunApp.sesi();
  $('btn-hapus-final').disabled = true;
  if (s) {
    try {
      await rest('rpc/hapus_akun', { method: 'POST', body: {} });
    } catch (e) {
      $('btn-hapus-final').disabled = false;
      pesan.textContent = 'Akun belum bisa dihapus: ' + e.message + '. Data di perangkat ini belum dihapus.';
      pesan.className = 'pesan err';
      return;
    }
  }
  ['utbk_testing_stats', 'utbk_bank_custom', 'utbk_bank_folder', 'utbk_pilihan_stat', 'utbk_riwayat', 'utbk_riwayat_sesi', 'utbk_sesi_dimigrasi', 'utbk_pemilik',
    'utbk_pengaturan', 'utbk_profil', 'utbk_avatar', 'utbk_sesi'].forEach((k) => localStorage.removeItem(k));
  alert('Akun dan data kamu sudah dihapus.');
  location.href = location.pathname;
}

// ---------- Profil ----------
const PROFIL_STATUS = [
  ['', 'Pilih status'], ['smp', 'SMP'], ['sma10', 'SMA/SMK kelas 10'], ['sma11', 'SMA/SMK kelas 11'],
  ['sma12', 'SMA/SMK kelas 12'], ['lulus', 'Lulusan SMA/SMK (persiapan UTBK)'], ['mahasiswa', 'Mahasiswa'], ['alumni', 'Alumni'], ['lainnya', 'Lainnya']
];
const PROFIL_JURUSAN = [['', 'Belum dipilih'], ['IPA', 'IPA'], ['IPS', 'IPS'], ['Bahasa', 'Bahasa'], ['SMK', 'SMK'], ['Lainnya', 'Lainnya']];
function labelStatus(v) { const o = PROFIL_STATUS.find((x) => x[0] === v); return o ? o[1] : '-'; }
function umurDari(iso) {
  const t = new Date(iso + 'T00:00:00');
  const now = new Date();
  let u = now.getFullYear() - t.getFullYear();
  const m = now.getMonth() - t.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < t.getDate())) u--;
  return u;
}
function formatTgl(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
}
const LOGO_GOOGLE = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';
function akunHTML(sesi) {
  if (sesi) {
    return `<div class="akun-box">
      <p class="muted" style="margin:0">Masuk sebagai <strong>${esc(sesi.email)}</strong>. Data kamu tersimpan di akun dan ikut ke perangkat lain.</p>
      <div class="aksi aksi-kiri"><button class="btn btn-secondary btn-kecil" data-akun="keluar">Keluar</button></div>
    </div>`;
  }
  return `<div class="akun-box">
    <p class="label">Masuk</p>
    <p class="muted">Masuk dengan akun Google supaya data tersimpan dan bisa dipakai di perangkat lain. Tanpa kata sandi.</p>
    <button class="btn-google" data-akun="google">${LOGO_GOOGLE}<span>Lanjutkan dengan Google</span></button>
    <details class="opsi-email">
      <summary>Atau pakai email dan kata sandi</summary>
      <input class="input" type="email" id="ak-email" placeholder="Email">
      <input class="input" type="password" id="ak-pass" placeholder="Kata sandi (minimal 6 karakter)" style="margin-top:8px">
      <div class="aksi aksi-kiri">
        <button class="btn btn-primary btn-kecil" data-akun="masuk">Masuk</button>
        <button class="btn btn-secondary btn-kecil" data-akun="daftar">Daftar</button>
      </div>
    </details>
    <p class="pesan" id="pesan-akun"></p>
  </div>`;
}
$('kartu-profil').addEventListener('click', (e) => {
  const b = e.target.closest('[data-av],[data-av-galeri],[data-av-hapus]');
  if (!b) return;
  if (b.dataset.av) simpanAvatar({ tipe: 'preset', id: b.dataset.av });
  else if (b.dataset.avGaleri) $('pf-foto').click();
  else simpanAvatar(null);
});
function htmlBidangAkademik(p, status) {
  const v = (k) => (p && p[k] ? esc(p[k]) : '');
  const fld = (lab, html, full) => `<div${full ? ' class="full"' : ''}><p class="label">${lab}</p>${html}</div>`;
  if (status === 'mahasiswa' || status === 'alumni') {
    return `
      <div class="full"><p class="label">Perguruan tinggi *</p><input class="input" id="pf-kampus" list="pf-kampus-list" autocomplete="off" placeholder="Ketik nama universitas atau institut..."><datalist id="pf-kampus-list"></datalist><input type="hidden" id="pf-kampus-npsn"></div>
      <div class="full"><p class="label">Program studi *</p><input class="input" id="pf-prodi" list="pf-prodi-list" autocomplete="off" placeholder="Pilih perguruan tinggi terlebih dahulu" disabled><datalist id="pf-prodi-list"></datalist><input type="hidden" id="pf-prodi-id"></div>
      <div><p class="label">Angkatan</p><input class="input" type="number" id="pf-angkatan" min="1950" max="${new Date().getFullYear()}" inputmode="numeric" placeholder="Contoh: 2024" value="${v('angkatan')}"></div>`;
  }
  return `
    ${fld('Sekolah (SMA/SMK)', `<input class="input" id="pf-sekolah" maxlength="80" placeholder="contoh: SMA Negeri 1" value="${v('sekolah')}">`)}
    ${fld('Jurusan sekolah (opsional)', `<select class="input" id="pf-jurusan">${(PROFIL_JURUSAN || []).map(([val, lab]) => `<option value="${val}" ${p && p.jurusan === val ? 'selected' : ''}>${lab}</option>`).join('')}</select>`)}
    ${fld('Target PTN dan prodi (opsional)', `<input class="input" id="pf-target" maxlength="120" placeholder="contoh: UI, Kedokteran" value="${v('target')}">`)}`;
}
$('kartu-profil').addEventListener('change', async (e) => {
  if (e.target.id !== 'pf-foto') return;
  const f = e.target.files[0], pesan = $('pesan-avatar');
  e.target.value = '';
  if (!f) return;
  pesan.className = 'pesan err';
  if (!f.type.startsWith('image/') || f.size > 15 * 1024 * 1024) { pesan.textContent = 'Pilih file gambar (maksimal 15 MB).'; return; }
  try {
    const data = await ubahFotoJadiAvatar(f);
    if (!(await simpanAvatar({ tipe: 'foto', data }))) throw new Error('Penyimpanan browser penuh.');
    pesan.textContent = '';
  } catch (er) { pesan.textContent = er.message; }
});
let DATA_PERGURUAN_TINGGI = null;
let DATA_PROGRAM_STUDI = new Map();
let PETA_KAMPUS = new Map();
let PETA_PRODI = new Map();
let soalPaketTarget = null;
let paketSoalAktif = null;
let daftarSoalPaketAktif = [];
function teksKampus(k) { return k.nama_pt; }
function teksProdi(p) { return `${p.nm_prodi} — ${p.nm_jenj_didik || 'Jenjang tidak diketahui'}`; }
async function muatKampusProfil() {
  if (DATA_PERGURUAN_TINGGI) return DATA_PERGURUAN_TINGGI;
  // Filter jenis perguruan tinggi di server agar perangkat tidak perlu mengunduh
  // seluruh 4.000+ institusi sebelum menampilkan pilihan kampus.
  const kampusIndonesia = await restSemua(
    'perguruan_tinggi?select=npsn,nama_pt,provinsi_pt,nm_bp&nm_bp=in.%28Universitas%2CInstitut%29&order=nama_pt.asc',
    500
  );
  if (!Array.isArray(kampusIndonesia)) {
    throw new Error('Respons daftar perguruan tinggi tidak valid.');
  }
  const namaKampusLuarNegeri = new Set([
    'Deakin University',
    'Georgetown University',
    "King's College London",
    'Lancaster University',
    'Western Sydney University'
  ]);
  const data = kampusIndonesia.filter((k) =>
    k && k.npsn && k.nama_pt &&
    ['Universitas', 'Institut'].includes(String(k.nm_bp || '').trim()) &&
    !namaKampusLuarNegeri.has(String(k.nama_pt).trim())
  );
  PETA_KAMPUS = new Map(data.map((k) => [teksKampus(k), k]));
  DATA_PERGURUAN_TINGGI = data;
  return data;
}
async function muatProdiProfil(npsn) {
  if (DATA_PROGRAM_STUDI.has(npsn)) return DATA_PROGRAM_STUDI.get(npsn);
  const data = await restSemua(`program_studi?select=id,npsn,nm_prodi,nm_jenj_didik&npsn=eq.${encodeURIComponent(npsn)}&order=nm_prodi.asc`);
  DATA_PROGRAM_STUDI.set(npsn, data);
  return data;
}
async function siapkanDropdownAkademik(p) {
  const kampusInput = $('pf-kampus'), kampusList = $('pf-kampus-list');
  if (!kampusInput || !kampusList || !$('pf-prodi') || !$('pf-prodi-list')) return;
  kampusInput.disabled = true; kampusInput.placeholder = 'Memuat daftar perguruan tinggi...';
  try {
    const kampus = await muatKampusProfil();
    kampusList.innerHTML = kampus.map((k) => `<option value="${esc(teksKampus(k))}"></option>`).join('');
    kampusInput.disabled = false; kampusInput.placeholder = 'Ketik nama kampus atau provinsi...';
    if (p && p.perguruanTinggiNpsn) {
      const k = kampus.find((x) => x.npsn === p.perguruanTinggiNpsn);
      if (k) { kampusInput.value = teksKampus(k); $('pf-kampus-npsn').value = k.npsn; await isiPilihanProdi(k.npsn, p.programStudiId); }
    }
  } catch (e) {
    kampusInput.disabled = false; kampusInput.placeholder = 'Daftar kampus gagal dimuat. Coba buka ulang profil.';
    pesanProfil('Daftar perguruan tinggi belum bisa dimuat. Periksa koneksi lalu coba lagi.');
    console.error('Gagal memuat perguruan tinggi:', e);
  }
}
async function isiPilihanProdi(npsn, idTerpilih = '') {
  const input = $('pf-prodi'), list = $('pf-prodi-list'), id = $('pf-prodi-id');
  if (!input || !list || !id) return;
  input.value = ''; id.value = ''; list.innerHTML = ''; input.disabled = true; input.placeholder = 'Memuat program studi...';
  try {
    const data = await muatProdiProfil(npsn);
    PETA_PRODI = new Map(data.map((p) => [teksProdi(p), p]));
    list.innerHTML = data.map((p) => `<option value="${esc(teksProdi(p))}"></option>`).join('');
    input.disabled = false; input.placeholder = data.length ? 'Ketik nama program studi...' : 'Belum ada program studi untuk kampus ini';
    if (idTerpilih) { const p = data.find((x) => String(x.id) === String(idTerpilih)); if (p) { input.value = teksProdi(p); id.value = String(p.id); } }
  } catch (e) {
    input.disabled = false; input.placeholder = 'Gagal memuat program studi. Coba pilih kampus lagi.';
    pesanProfil('Program studi gagal dimuat. Silakan coba pilih kampus kembali.');
    console.error('Gagal memuat program studi:', e);
  }
}
$('kartu-profil').addEventListener('input', (e) => {
  if (e.target.id !== 'pf-prodi') return;
  const prodi = PETA_PRODI.get(e.target.value.trim());
  const id = $('pf-prodi-id');
  if (id) id.value = prodi ? String(prodi.id) : '';
});
$('kartu-profil').addEventListener('change', async (e) => {
  if (e.target.id === 'pf-status') {
    const status = e.target.value;
    const p = ProfilApp.ambil() || {};
    const kategoriKampus = (x) => x === 'mahasiswa' || x === 'alumni';
    const gantiKategori = kategoriKampus(status) !== kategoriKampus(p.statusPendidikan);
    const dataAkademik = gantiKategori
      ? { ...p, sekolah: '', jurusan: '', target: '', perguruanTinggiNpsn: '', programStudiId: '' }
      : p;
    const fields = $('pf-akademik-fields');
    if (fields) fields.innerHTML = htmlBidangAkademik(dataAkademik, status);
    if (status === 'mahasiswa' || status === 'alumni') siapkanDropdownAkademik(dataAkademik);
    return;
  }
  if (e.target.id === 'pf-kampus') {
    const kampus = PETA_KAMPUS.get(e.target.value.trim());
    $('pf-kampus-npsn').value = kampus ? kampus.npsn : '';
    $('pf-prodi').value = ''; $('pf-prodi-id').value = ''; $('pf-prodi-list').innerHTML = '';
    $('pf-prodi').disabled = true; $('pf-prodi').placeholder = kampus ? 'Memuat program studi...' : 'Pilih kampus terlebih dahulu';
    if (kampus) await isiPilihanProdi(kampus.npsn);
  } else if (e.target.id === 'pf-prodi') {
    const prodi = PETA_PRODI.get(e.target.value.trim()); $('pf-prodi-id').value = prodi ? String(prodi.id) : '';
  }
});
function renderProfil(mengedit = false) {
  const p = ProfilApp.ambil();
  const sesi = AkunApp.sesi();
  const kartu = $('kartu-profil');
  const linkPublik = p && p.username ? `${location.origin}${location.pathname}#/u/${p.username}` : '';
  const akun = `<div class="card full"><p class="panel-judul">Akun</p>${akunHTML(sesi)}</div>`;
  if (p && !mengedit) {
    const baris = (a, v) => `<dt>${a}</dt><dd>${v}</dd>`;
    const tgl = p.tanggalLahir ? `${esc(formatTgl(p.tanggalLahir))} (${umurDari(p.tanggalLahir)} tahun)` : '-';
    kartu.innerHTML = `<div class="profil-grid">
      <div class="card"><p class="panel-judul">Identitas</p>
        <div class="profil-hero"><div class="avatar">${avatarIsi(p.nama)}</div>
          <div style="min-width:0"><h2 style="margin:0">${esc(p.nama)}</h2><p class="muted" style="margin:0">${esc(p.username ? '@' + p.username : labelStatus(p.statusPendidikan))}</p></div></div>
        ${p.deskripsi ? `<p style="margin:14px 0 0">${esc(p.deskripsi)}</p>` : ''}
        <div class="chips-info"><span class="badge ${p.publik ? 'benar' : 'kosong'}">${p.publik ? 'Profil publik' : 'Profil privat'}</span>${p.publik && !p.tampilkanStatistik ? '<span class="badge kosong">Statistik disembunyikan</span>' : ''}</div>
        ${p.publik && linkPublik ? `<p class="muted" style="margin:12px 0 0">Link profil: <a href="${linkPublik}" target="_blank" rel="noopener" style="word-break:break-all">${esc(linkPublik)}</a></p>` : ''}
      </div>
      <div class="card"><p class="panel-judul">Informasi akademik</p>
        <dl class="info-profil">${baris('Status', esc(labelStatus(p.statusPendidikan)))}${['mahasiswa', 'alumni'].includes(p.statusPendidikan) ? baris('Perguruan tinggi', esc(p.sekolah || '-')) + baris('Program studi', esc(p.jurusan || '-')) + baris('Angkatan', esc(p.angkatan || '-')) : baris('Sekolah', esc(p.sekolah || '-')) + baris('Jurusan sekolah', esc(p.jurusan || '-')) + baris('Target PTN dan prodi', esc(p.target || '-'))}</dl></div>
      <div class="card full"><p class="panel-judul">Informasi pribadi (hanya terlihat olehmu)</p>
        <dl class="info-profil">${baris('Tanggal lahir', tgl)}${baris('Kota domisili', esc(p.kota || '-'))}</dl></div>
      ${akun}
    </div>
    <div class="profil-aksi"><button class="btn btn-primary" data-profil="ubah">Ubah profil</button><button class="btn btn-secondary" data-profil="kembali">Kembali</button></div>`;
    return;
  }
  const v = (k) => (p && p[k] ? esc(p[k]) : '');
  const hariIni = new Date().toISOString().slice(0, 10);
  const fld = (lab, html, full) => `<div${full ? ' class="full"' : ''}><p class="label">${lab}</p>${html}</div>`;
  const opt = (daftar, kunci) => daftar.map(([val, lab]) => `<option value="${val}" ${p && p[kunci] === val ? 'selected' : ''}>${lab}</option>`).join('');
  kartu.innerHTML = `<h2 style="margin:0 0 4px">${p ? 'Ubah profil' : 'Buat profil'}</h2>
    <p class="muted" style="margin:0 0 16px">Tanda * wajib diisi.</p>
    <div class="profil-grid">
      <div class="card full"><p class="panel-judul">Identitas</p>${pilihanAvatarHTML()}
        <div class="form-grid">
          ${fld('Nama lengkap *', `<input class="input" id="pf-nama" maxlength="50" value="${v('nama')}">`)}
          ${fld('Username (untuk link profil publik)', `<input class="input" id="pf-username" maxlength="20" placeholder="huruf kecil, angka, atau _ (3-20 karakter)" value="${v('username')}">`)}
          ${fld('Deskripsi singkat (opsional, maks 300 karakter)', `<textarea class="input" id="pf-deskripsi" maxlength="300" rows="3" placeholder="contoh: Fokus di PM, target UI">${v('deskripsi')}</textarea>`, true)}
        </div></div>
      <div class="card"><p class="panel-judul">Informasi akademik</p>
        ${fld('Status pendidikan sekarang *', `<select class="input" id="pf-status">${opt(PROFIL_STATUS, 'statusPendidikan')}</select>`)}
        <div class="form-grid full" id="pf-akademik-fields"></div>
      </div>
      <div class="card"><p class="panel-judul">Informasi pribadi dan privasi</p>
        ${fld('Tanggal lahir', `<input class="input" type="date" id="pf-tgl" max="${hariIni}" value="${v('tanggalLahir')}">`)}
        ${fld('Kota domisili (opsional)', `<input class="input" id="pf-kota" maxlength="40" value="${v('kota')}">`)}
        <p class="label">Privasi profil publik</p>
        <label class="chip"><input type="checkbox" id="pf-publik" ${p && p.publik ? 'checked' : ''}><span>Tampilkan profil di link publik</span></label>
        <label class="chip" style="margin-top:6px"><input type="checkbox" id="pf-statistik" ${p && p.tampilkanStatistik ? 'checked' : ''}><span>Tampilkan statistik</span></label>
        <p class="muted" style="margin-top:8px">Tanggal lahir, sekolah, dan kota tidak pernah ditampilkan ke orang lain.</p>
      </div>
      ${akun}
    </div>
    <div class="profil-aksi">
      <button class="btn btn-primary" data-profil="simpan">Simpan profil</button>
      ${p ? '<button class="btn btn-secondary" data-profil="batal">Batal</button>' : ''}
      <button class="btn btn-secondary" data-profil="kembali">Kembali</button>
    </div>
    <p class="pesan" id="pesan-profil"></p>`;
  const statusAkademik = (p && p.statusPendidikan) || 'murid';
  $('pf-akademik-fields').innerHTML = htmlBidangAkademik(p, statusAkademik);
  if (statusAkademik === 'mahasiswa' || statusAkademik === 'alumni') siapkanDropdownAkademik(p);
}
function pesanProfil(teks) {
  const p = $('pesan-profil');
  if (!p) return;
  p.textContent = teks;
  p.className = 'pesan err';
}
function pesanAkun(teks) {
  const p = $('pesan-akun');
  if (p) { p.textContent = teks; p.className = 'pesan err'; }
  else alert(teks);
}
async function simpanFormProfil() {
  const nama = $('pf-nama').value.trim();
  const tgl = $('pf-tgl').value;
  const status = $('pf-status').value;
  const username = $('pf-username').value.trim().toLowerCase();
  const publik = $('pf-publik').checked;
  if (!nama) return pesanProfil('Nama lengkap belum diisi.');
  if (!status) return pesanProfil('Status pendidikan belum dipilih.');
  if (tgl && tgl > new Date().toISOString().slice(0, 10)) return pesanProfil('Tanggal lahir tidak boleh di masa depan.');
  if (username && !/^[a-z0-9_]{3,20}$/.test(username)) return pesanProfil('Username hanya boleh huruf kecil, angka, dan _ (3-20 karakter).');
  if (publik && !username) return pesanProfil('Isi username dulu supaya profil publik bisa dibuka.');
  const lama = ProfilApp.ambil() || {};
  const sesi = AkunApp.sesi();
  if (sesi && username && username !== lama.username) {
    try {
      const tersedia = await rest('rpc/username_tersedia', { method: 'POST', body: { p_username: username } });
      if (!tersedia) return pesanProfil('Username itu sudah dipakai orang lain.');
    } catch (e) {
      return pesanProfil('Tidak bisa mengecek username. Coba lagi sebentar.');
    }
  }
  let sekolah = '', jurusan = '', kampusNpsn = '', prodiId = '', target = '', angkatan = '';
  if (status === 'mahasiswa' || status === 'alumni') {
    const kampusEl = $('pf-kampus'), prodiEl = $('pf-prodi');
    const kampusIdEl = $('pf-kampus-npsn'), prodiIdEl = $('pf-prodi-id'), angkatanEl = $('pf-angkatan');
    if (!kampusEl || !prodiEl || !kampusIdEl || !prodiIdEl || !angkatanEl) {
      return pesanProfil('Formulir akademik belum siap. Ubah status pendidikan, lalu coba lagi.');
    }
    const kampusTeks = kampusEl.value.trim();
    const prodiTeks = prodiEl.value.trim();
    kampusNpsn = kampusIdEl.value;
    const prodiTerpilih = PETA_PRODI.get(prodiTeks);
    prodiId = prodiTerpilih ? String(prodiTerpilih.id) : prodiIdEl.value;
    if (!kampusTeks || !kampusNpsn) return pesanProfil('Pilih perguruan tinggi dari daftar yang tersedia.');
    if (!prodiTeks || !prodiId) return pesanProfil('Pilih program studi dari daftar sesuai perguruan tinggi.');
    sekolah = kampusTeks;
    jurusan = prodiTeks.split(' — ')[0];
    angkatan = angkatanEl.value.trim();
    if (angkatan && (!/^\d{4}$/.test(angkatan) || Number(angkatan) < 1950 || Number(angkatan) > new Date().getFullYear())) return pesanProfil('Angkatan harus berupa tahun yang valid.');
  } else {
    const sekolahEl = $('pf-sekolah'), jurusanEl = $('pf-jurusan'), targetEl = $('pf-target');
    if (!sekolahEl || !jurusanEl || !targetEl) {
      return pesanProfil('Formulir akademik belum siap. Ubah status pendidikan, lalu coba lagi.');
    }
    sekolah = sekolahEl.value.trim();
    jurusan = jurusanEl.value;
    target = targetEl.value.trim();
  }
  ProfilApp.simpan({
    nama, tanggalLahir: tgl, statusPendidikan: status,
    sekolah, jurusan, perguruanTinggiNpsn: kampusNpsn, programStudiId: prodiId,
    target, angkatan, kota: $('pf-kota').value.trim(),
    tanggalUjian: '', username,
    deskripsi: $('pf-deskripsi').value.trim(), publik,
    tampilkanStatistik: $('pf-statistik').checked
  });
  if (sesi) {
    try { await pushProfil(); }
    catch (e) { alert('Profil tersimpan di perangkat ini, tapi belum tersimpan ke akun: ' + e.message); }
  }
  renderProfil(false);
  renderSalam();
}
// Masuk dengan Google lewat Supabase: pengguna diarahkan ke Google, memilih akunnya, lalu kembali ke aplikasi
function masukGoogle() {
  const kembali = location.origin + location.pathname;
  location.href = SB_URL + '/auth/v1/authorize?provider=google&prompt=select_account&redirect_to=' + encodeURIComponent(kembali);
}
// Dipanggil saat aplikasi dibuka: kalau baru kembali dari Google, token ada di bagian # pada alamat
async function tanganiRedirectOAuth() {
  const h = location.hash;
  if (!/access_token=|error_description=/.test(h)) return false;
  const q = new URLSearchParams(h.slice(1));
  history.replaceState(null, '', location.pathname + location.search); // hapus token dari alamat
  if (q.get('error_description')) {
    alert('Masuk dengan Google gagal: ' + q.get('error_description'));
    return false;
  }
  const at = q.get('access_token');
  if (!at) return false;
  try {
    const r = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + at } });
    const u = await r.json().catch(() => ({}));
    if (!r.ok || !u.id) throw new Error(u.msg || u.message || 'Akun tidak terbaca');
    simpanSesiDariRespon({ access_token: at, refresh_token: q.get('refresh_token'), expires_in: Number(q.get('expires_in')) || 3600, user: u }, u.email);
    try { sessionStorage.removeItem('pytago_google_login_pending'); } catch (e) {}
    return true;
  } catch (e) {
    alert('Masuk dengan Google gagal: ' + e.message);
    return false;
  }
}
async function aksiAkun(aksi) {
  if (aksi === 'google') return masukGoogle();
  if (aksi === 'keluar') {
    const s = AkunApp.sesi();
    // kirim dulu perubahan yang belum tersimpan ke akun, supaya tidak hilang saat data lokal dibersihkan
    try { if (s) { await sinkron(); await pushProfil(); } } catch (e) {}
    try { if (s) await authReq('logout', {}, s.access_token); } catch (e) {}
    AkunApp.hapus();
    ADMIN = false;
    bersihkanDataAkunLokal();
    if (window.tutupOnboarding) window.tutupOnboarding();
    keluarModeAdmin();
    renderSemuaBank();
    renderBeranda();
    renderProfil(!ProfilApp.ambil());
    renderSalam();
    tampil('menu');
    if (window.tampilWelcome) window.tampilWelcome();
    return;
  }
  const email = ($('ak-email') ? $('ak-email').value : '').trim();
  const pass = $('ak-pass') ? $('ak-pass').value : '';
  if (!email || !pass) return pesanAkun('Isi email dan kata sandi dulu.');
  try {
    if (aksi === 'masuk') {
      const j = await authReq('token?grant_type=password', { email, password: pass });
      simpanSesiDariRespon(j, email);
    } else {
      const j = await authReq('signup', { email, password: pass });
      if (!j.access_token) return pesanAkun('Akun dibuat. Cek email untuk konfirmasi, lalu masuk.');
      simpanSesiDariRespon(j, email);
    }
    await mulaiSesi();
    renderProfil(false);
    renderSalam();
  } catch (e) {
    let pesan = e.message;
    if (/Invalid login/i.test(pesan)) pesan = 'Email atau kata sandi salah.';
    if (/already registered|already been registered/i.test(pesan)) pesan = 'Email sudah terdaftar. Coba masuk.';
    if (/Password should be at least/i.test(pesan)) pesan = 'Kata sandi minimal 6 karakter.';
    pesanAkun(pesan);
  }
}
function renderSalam() {
  const p = ProfilApp.ambil();
    $('avatar-atur').innerHTML = avatarIsi(p ? p.nama : '?');
  $('avatar-side').innerHTML = avatarIsi(p ? p.nama : '?');
  $('side-nama').textContent = p ? p.nama : 'Profil';
  renderBeranda();
}
// Batas waktu per soal hanya digunakan pada Mode Ngebut
function syncBlokWaktu() {
  const blok = $('blok-waktu');
  if (blok) blok.hidden = nilai('mode') !== 'tryout';
}
document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', syncBlokWaktu));

function renderPengaturan() {
  const p = PengaturanApp.ambil();
  $('pilih-waktu').value = String(p.waktuPerSoal || 60);
  $('pilih-waktu-set').innerHTML = [60, 90, 120, 180].map((o) =>
    `<label class="chip"><input type="radio" name="set-waktu" value="${o}" ${o === p.waktuPerSoal ? 'checked' : ''}><span>${o} detik</span></label>`).join('');
  document.querySelectorAll('input[name="tema"]').forEach((i) => (i.checked = i.value === temaTersimpan()));
  const prof = ProfilApp.ambil() || {};
  $('pubatur-publik').checked = !!prof.publik;
  $('pubatur-statistik').checked = !!prof.tampilkanStatistik;
  document.querySelectorAll('input[name="def-mode"]').forEach((i) => (i.checked = i.value === (p.modeDefault || 'latihan')));
  document.querySelectorAll('input[name="def-jumlah"]').forEach((i) => (i.checked = i.value === String(p.jumlahDefault || '5')));
  $('teks-hapus').textContent = AkunApp.sesi()
    ? 'Profil, statistik, dan bank soal di akun ini akan dihapus permanen, termasuk di perangkat ini. Tindakan ini tidak bisa dibatalkan.'
    : 'Semua data di perangkat ini (profil, statistik, bank soal) akan dihapus. Tindakan ini tidak bisa dibatalkan.';
}
$('kartu-profil').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-profil],button[data-akun]');
  if (!b) return;
  if (b.dataset.akun) return aksiAkun(b.dataset.akun);
  const aksi = b.dataset.profil;
  if (aksi === 'ubah') renderProfil(true);
  else if (aksi === 'batal') renderProfil(false);
  else if (aksi === 'kembali') tampil('menu');
  else if (aksi === 'simpan') simpanFormProfil();
});
$('btn-profil').addEventListener('click', () => {
  renderProfil(!ProfilApp.ambil());
  tampil('profil');
});
$('pilih-waktu').addEventListener('change', (e) => {
  const v = Number(e.target.value);
  PengaturanApp.simpan({ ...PengaturanApp.ambil(), waktuPerSoal: v });
  DETIK_PER_SOAL = v;
  ringkasSesi();
});
$('btn-ke-setup').addEventListener('click', () => tampil('setup'));
$('setup').addEventListener('change', ringkasSesi);
function temaTersimpan() { try { return localStorage.getItem('neon_tema') || 'sistem'; } catch (e) { return 'sistem'; } }
function terapkanTema(t) {
  const m = { terang: 'light', gelap: 'dark' }[t];
  if (m) document.documentElement.dataset.theme = m; else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('neon_tema', t); } catch (e) {}
}
$('pengaturan').addEventListener('change', (e) => {
  const t = e.target;
  if (t.name === 'set-waktu') {
    const v = Number(t.value);
    PengaturanApp.simpan({ ...PengaturanApp.ambil(), waktuPerSoal: v });
    DETIK_PER_SOAL = v;
    renderPengaturan();
  } else if (t.name === 'tema') terapkanTema(t.value);
});
$('btn-kembali-menu').addEventListener('click', () => tampil('menu'));

buatDatalist();
renderSemuaBank();
$('daftar-review').addEventListener('change', (e) => {
  if (e.target.name === 'filter-review') {
    filterReview = e.target.value;
    renderReviewIsi();
  }
});
$('daftar-review').addEventListener('click', (e) => {
  const lapor = e.target.closest('[data-lapor-soal]');
  if (lapor) { const s = sesi && sesi.soal ? sesi.soal.find(x => String(x.id) === lapor.dataset.laporSoal) : null; if (s) bukaModalLaporanSoal(s, lapor.dataset.sumberSoal, Number(lapor.dataset.nomorSoal)); return; }
  const edit = e.target.closest('[data-edit-soal-review]');
  if (edit) { bukaEditorSoalReview(edit.dataset.editSoalReview); return; }
  if (e.target.closest('#rev-prev')) geserReview(-1);
  else if (e.target.closest('#rev-next')) geserReview(1);
  else { const g = e.target.closest('[data-goto]'); const tr = $('track-review'); if (g && tr) tr.scrollTo({ left: Number(g.dataset.goto) * tr.clientWidth, behavior: 'smooth' }); }
});
renderProfil(false);
renderPengaturan();
renderSalam();
segarkanSoalBawaan();
(async () => {
  if (window.obMemuat) window.obMemuat();
  const baruMasuk = await tanganiRedirectOAuth();
  if (AkunApp.sesi()) await mulaiSesi();
  else if (window.adaProgresOnboarding && window.adaProgresOnboarding()) window.mulaiOnboardingPublik();
  else if (window.tutupOnboarding) window.tutupOnboarding();
  // Pulihkan sesi latihan/try out setelah data dan tampilan akun selesai diinisialisasi.
  pulihkanSesiAktif();
  if (baruMasuk) { renderProfil(false); renderSalam(); }
  terapkanAksesTamu();
  if (!AkunApp.sesi() && !document.documentElement.classList.contains('welcome-on')) tampil('setup');
})();
// Welcome page: pintu masuk bagi pengunjung baru
(function(){
  var w=$('welcome');if(!w)return;
  var root=document.documentElement;
  function lain(fn){Array.prototype.forEach.call(document.body.children,function(el){if(el!==w&&el.tagName!=='SCRIPT')fn(el)})}
  if(root.classList.contains('welcome-on')){lain(function(el){el.inert=true})}
  function tutup(){try{localStorage.setItem('Nalarine_welcome_seen','1')}catch(e){}root.classList.remove('welcome-on');lain(function(el){el.inert=false});window.scrollTo(0,0)}
  function keAkun(bukaEmail){
    tutup();renderProfil(!ProfilApp.ambil());tampil('profil');
    setTimeout(function(){var a=document.querySelector('#kartu-profil .akun-box');if(!a)return;var d=a.querySelector('.opsi-email');if(d&&bukaEmail)d.open=true;a.scrollIntoView({behavior:'smooth',block:'center'})},60);
  }
  // Dipanggil setelah keluar akun: kembali ke halaman Welcome
  window.tampilWelcome=function(){try{localStorage.removeItem('Nalarine_welcome_seen')}catch(e){}root.classList.add('welcome-on');lain(function(el){el.inert=true});w.scrollTop=0};
  $('wl-mulai').addEventListener('click',function(){   tutup();   window.mulaiOnboardingPublik(); });
  $('wl-masuk').addEventListener('click',function(){try{sessionStorage.setItem('pytago_google_login_pending','1')}catch(e){}aksiAkun('google')});
  $('wl-lokal').addEventListener('click',function(){tutup();terapkanAksesTamu();tampil('setup')});
  // Kalau ternyata sudah ada sesi (mis. kembali dari login Google), halaman ini tidak perlu tampil
  window.addEventListener('hashchange',function(){if(root.classList.contains('welcome-on')&&AkunApp.sesi())tutup()});
})();
// Onboarding NARO: pengguna yang baru mendaftar berkenalan dulu sebelum masuk ke dashboard.
// 12 pertanyaan, masing-masing di layar tersendiri, lalu satu layar penutup. Memakai sistem profil yang sudah ada
// (ProfilApp, pushProfil, simpanAvatar). Progres disimpan di data_pengguna (kunci "onboarding") lewat mekanisme
// sinkron yang sama, tanpa tabel atau kolom baru. PTN dan program studi digabung ke field profil "target".
(function () {
  const OB = $('onboarding');
  if (!OB) return;
  const KUNCI = 'utbk_onboarding';
  const IMG = {"sapa": "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", "tanya": "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", "baca": "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", "lompat": "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", "jempol": "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", "bendera": "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"};
  const DEF = { nama: '', tanggalLahir: '', statusPendidikan: '', sekolah: '', jurusan: '', target: '', kota: '', tanggalUjian: '', username: '', deskripsi: '', publik: false, tampilkanStatistik: false };
  const TOTAL = 12; // jumlah pertanyaan; indeks tahap 12 adalah layar penutup
  const KUNCI_LOKAL = 'utbk_onboarding_lokal';
  const baca = (k) => { try { return JSON.parse(localStorage.getItem(k)) || null; } catch (e) { return null; } };
  const pecahTarget = (t) => { t = String(t || ''); const i = t.indexOf(','); return i < 0 ? { ptn: t.trim(), prodi: '' } : { ptn: t.slice(0, i).trim(), prodi: t.slice(i + 1).trim() }; };
  let draf = { ptn: '', prodi: '' };
  const gabungTarget = () => [draf.ptn, draf.prodi].map((x) => String(x).trim()).filter(Boolean).join(', ');
  // Progres disimpan di dua tempat: kunci yang ikut tersinkron ke akun (lintas perangkat) dan salinan khusus perangkat ini.
  // Format lama (tanpa v:2) hanya dipakai untuk status "selesai"; posisi tahapnya tidak cocok lagi dengan layar baru.
  const st = {
    ambil() {
      const a = baca(KUNCI), b = baca(KUNCI_LOKAL);
      if (!a && !b) return null;
      const v2 = (o) => !!o && o.v === 2;
      const ref = v2(a) && v2(b) ? ((b.tahap || 0) >= (a.tahap || 0) ? b : a) : v2(b) ? b : v2(a) ? a : null;
      return { selesai: !!((a && a.selesai) || (b && b.selesai)), tahap: ref ? ref.tahap || 0 : 0, ptn: ref ? ref.ptn || '' : '', prodi: ref ? ref.prodi || '' : '' };
    },
    simpan(o) {
      const v = Object.assign({ v: 2, ptn: draf.ptn, prodi: draf.prodi }, o);
      try { localStorage.setItem(KUNCI, JSON.stringify(v)); localStorage.setItem(KUNCI_LOKAL, JSON.stringify(v)); } catch (e) {}
    }
  };
  const statusKuliah = (v) => v === 'mahasiswa' || v === 'alumni';
  const profilLengkap = (p) => !!(p && String(p.nama || '').trim() && p.statusPendidikan);
  // Profil yang seluruh field wajibnya sudah tersimpan adalah sumber kebenaran.
  // Status progres onboarding bisa tertinggal jika sinkronisasi kunci "onboarding" gagal.
  const profilOnboardingLengkap = (p) => !!(
    profilLengkap(p) && String(p.username || '').trim() &&
    String(p.sekolah || '').trim() && String(p.jurusan || '').trim() &&
    (!statusKuliah(p.statusPendidikan) || (String(p.perguruanTinggiNpsn || '').trim() && String(p.programStudiId || '').trim()))
  );
  let tahap = 0, sibuk = false, terbuka = false, memuat = false, jedaMuat = null, timerUser = null;
  const root = document.documentElement;
  const gambar = (k, flip) => `<img${flip ? ' class="flip"' : ''} src="data:image/webp;base64,${IMG[k]}" alt="" height="320">`;
  const ambilProfil = () => Object.assign({}, DEF, ProfilApp.ambil() || {});
  const hariIni = () => new Date().toISOString().slice(0, 10);

  function buka() { terbuka = true; root.classList.add('ob-on'); }
  function tutup() {
    terbuka = false; memuat = false; clearTimeout(jedaMuat);
    root.classList.remove('ob-on'); OB.innerHTML = '';
  }
  // Menjaga fokus keyboard tetap di dalam onboarding selama terbuka
  document.addEventListener('focusin', (e) => {
    if (terbuka && !OB.contains(e.target)) { const f = OB.querySelector('input,select,textarea,button'); if (f) f.focus(); }
  });

  // Satu tahap = satu layar. Pose dasar dari character sheet NARO; kalau poses habis dipakai ulang dengan cermin
  // horizontal dan lencana kecil (aksen) agar tiap layar tetap terlihat berbeda.
  const LANGKAH = [
    { n: 'sapa', flip: 0, aksen: '', gerak: 'goyang' },
    { n: 'tanya', flip: 0, aksen: '', gerak: 'miring' },
    { n: 'jempol', flip: 0, aksen: '', gerak: 'loncat' },
    { n: 'baca', flip: 0, aksen: 'pensil', gerak: 'napas' },
    { n: 'baca', flip: 0, aksen: 'topi', gerak: 'goyang' },
    { n: 'sapa', flip: 1, aksen: 'tanya', gerak: 'goyang' },
    { n: 'tanya', flip: 1, aksen: 'seru', gerak: 'miring' },
    { n: 'bendera', flip: 0, aksen: '', gerak: 'kibar' },
    { n: 'jempol', flip: 1, aksen: 'bintang', gerak: 'loncat' },
    { n: 'lompat', flip: 1, aksen: 'kue', gerak: 'loncat' },
    { n: 'sapa', flip: 0, aksen: 'pin', gerak: 'goyang' },
    { n: 'jempol', flip: 0, aksen: 'gembok', gerak: 'napas' },
    { n: 'lompat', flip: 0, aksen: '', gerak: 'loncat' }
  ];
  const AKSEN = {
    tanya: '<path d="M12.5 12.5a3.7 3.7 0 1 1 5.6 3.2c-1.3.8-2.1 1.5-2.1 3"/><circle cx="16" cy="23.3" r="1.2" fill="#1d3e86"/>',
    seru: '<path d="M16 8.5v9.5"/><circle cx="16" cy="23" r="1.4" fill="#1d3e86"/>',
    pensil: '<path d="M9.5 23l1-4.8 9.6-9.6 3.8 3.8-9.6 9.6z"/><path d="M18 10.8l3.8 3.8"/>',
    topi: '<path d="M5.5 13.2L16 8.5l10.5 4.7L16 18z"/><path d="M10.5 16v4.6c3 2 8 2 11 0V16"/>',
    bintang: '<path d="M16 7.5l2.5 5.4 5.9.7-4.4 4 1.2 5.8L16 20.5l-5.2 2.9 1.2-5.8-4.4-4 5.9-.7z" fill="#fff"/>',
    kue: '<rect x="8" y="17" width="16" height="7" rx="2"/><path d="M16 17v-4.5"/><path d="M16 8.2c1.3 1.4 1.3 2.8 0 3.8-1.3-1-1.3-2.4 0-3.8z" fill="#1d3e86"/>',
    pin: '<path d="M16 25s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12z"/><circle cx="16" cy="13" r="2.6" fill="#1d3e86"/>',
    gembok: '<rect x="9" y="15" width="14" height="10" rx="2"/><path d="M12 15v-3a4 4 0 0 1 8 0v3"/>'
  };
  const aksenSvg = (k) => k ? `<svg class="ob-aksen" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="15" fill="#ffd45e" stroke="#1d3e86" stroke-width="2"/><g fill="none" stroke="#1d3e86" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">${AKSEN[k]}</g></svg>` : '';
  const PTN_SARAN = ['Universitas Indonesia', 'Universitas Gadjah Mada', 'Institut Teknologi Bandung', 'Institut Pertanian Bogor', 'Universitas Airlangga', 'Institut Teknologi Sepuluh Nopember', 'Universitas Padjadjaran', 'Universitas Diponegoro', 'Universitas Brawijaya', 'Universitas Sebelas Maret', 'Universitas Hasanuddin', 'Universitas Sumatera Utara', 'Universitas Negeri Jakarta', 'Universitas Pendidikan Indonesia', 'Universitas Negeri Malang', 'Universitas Negeri Yogyakarta', 'Universitas Negeri Semarang', 'Universitas Andalas', 'Universitas Syiah Kuala', 'Universitas Udayana', 'Universitas Jenderal Soedirman', 'Universitas Sriwijaya', 'Universitas Lampung', 'Universitas Riau', 'Universitas Sam Ratulangi', 'Universitas Mulawarman', 'Universitas Lambung Mangkurat', 'Universitas Jember'];
  const PRODI_SARAN = ['Kedokteran', 'Kedokteran Gigi', 'Farmasi', 'Keperawatan', 'Teknik Informatika', 'Ilmu Komputer', 'Sistem Informasi', 'Teknik Elektro', 'Teknik Mesin', 'Teknik Sipil', 'Teknik Industri', 'Arsitektur', 'Matematika', 'Statistika', 'Fisika', 'Kimia', 'Biologi', 'Manajemen', 'Akuntansi', 'Ilmu Ekonomi', 'Hukum', 'Psikologi', 'Ilmu Komunikasi', 'Hubungan Internasional', 'Sastra Inggris', 'Pendidikan Matematika', 'Agroteknologi', 'Kehutanan'];
  const datalist = (id, arr) => `<datalist id="${id}">${arr.map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>`;
  const bubble = (...baris) => `<div class="ob-bubble" aria-live="polite"><p id="ob-judul">${esc(baris[0])}</p>${baris.slice(1).map((b) => `<p>${esc(b)}</p>`).join('')}</div>`;
  const lab = (id, t, wajib, opsional) => `<label for="${id}">${t}${wajib ? ' <span style="color:var(--ob-err)">*</span>' : ''}${opsional ? ' <em class="ob-opt">opsional</em>' : ''}</label>`;
  const radio = (nama, daftar, nilai) => daftar.filter((o) => o[0]).map(([v, l]) => `<label class="ob-opsi"><input type="radio" name="${nama}" value="${esc(v)}" ${nilai === v ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('');
  const teksIn = (p, id, ph, nilai, maks, extra) => `<div class="ob-f">${lab('ob-in', p, id.wajib, !id.wajib)}<input class="ob-input" id="ob-in" maxlength="${maks}" placeholder="${esc(ph)}" value="${esc(nilai)}" ${extra || ''}></div>`;

  function avatarHTML(p) {
    const a = avatarTersimpan();
    return `<div class="ob-f"><span class="ob-lab">Foto profil</span>
      <div class="ob-av-baris"><div class="ob-av-prev" id="ob-av-prev">${avatarIsi(p.nama)}</div>
      <button type="button" class="ob-btn kecil" data-ob-galeri>Unggah foto</button>
      <button type="button" class="ob-btn kecil" data-ob-inisial>Pakai inisial</button></div>
      <div class="ob-av-grid" role="group" aria-label="Pilihan avatar">${AVATAR_PRESET.map((x) => `<button type="button" class="ob-av${a && a.tipe === 'preset' && a.id === x.id ? ' aktif' : ''}" data-ob-av="${x.id}" aria-label="Avatar ${x.id.slice(1)}">${svgAvatar(x)}</button>`).join('')}</div>
      <input type="file" id="ob-foto" accept="image/*" hidden><small id="ob-pesan-av" role="alert"></small></div>`;
  }

  function isiLangkah(p) {
    switch (tahap) {
      case 0: return { teks: bubble('Hai! Aku NARO. Sebelum mulai belajar, aku ingin mengenalmu lebih dulu. Yuk, kita berkenalan!', 'Siapa nama lengkapmu?'), tombol: 'Lanjut',
        form: teksIn('Nama lengkap', { wajib: true }, 'Masukkan nama lengkapmu', p.nama, 50, 'autocomplete="name" ') };
      case 1: return { teks: bubble('Selanjutnya, kita buat identitas unik untukmu di Nalarine!'), tombol: 'Lanjut',
        form: `<div class="ob-f">${lab('ob-in', 'Username', true, false)}<input class="ob-input" id="ob-in" maxlength="20" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="Contoh: khabib_nurmagomedov" value="${esc(p.username)}"><small class="ob-cekuser" id="ob-cekuser">Username wajib diisi. Gunakan huruf kecil, angka, dan _ (3-20 karakter).</small></div>` };
      case 2: return { teks: bubble('Yuk, pilih foto profil yang paling menggambarkan dirimu!'), tombol: 'Lanjut', form: avatarHTML(p) };
      case 3: return { teks: bubble('Sekarang ceritakan sedikit tentang dirimu. Apa yang sedang kamu perjuangkan?'), tombol: 'Lanjut',
        form: `<div class="ob-f">${lab('ob-in', 'Deskripsi singkat', false, true)}<textarea class="ob-input" id="ob-in" maxlength="300" rows="4" placeholder="Contoh: Sedang mempersiapkan UTBK 2027 dengan fokus pada PKPM.">${esc(p.deskripsi)}</textarea><span class="ob-hit" id="ob-hit">${(p.deskripsi || '').length}/300</span></div>` };
      case 4: return { teks: bubble('Sekarang kamu sedang berada di jenjang pendidikan apa?'), tombol: 'Lanjut',
        form: `<div class="ob-f" role="radiogroup" aria-label="Status pendidikan"><span class="ob-lab">Status pendidikan <span style="color:var(--ob-err)">*</span></span><div class="ob-grid2">${radio('ob-status', PROFIL_STATUS, p.statusPendidikan)}</div></div>` };
      case 5: return { teks: bubble('Di mana kamu sedang menempuh pendidikan?'), tombol: 'Lanjut',
        form: statusKuliah(p.statusPendidikan)
          ? `<div class="ob-f">${lab('ob-kampus', 'Perguruan tinggi', true, false)}<input class="ob-input" id="ob-kampus" maxlength="120" placeholder="Ketik nama universitas atau institut" value="${esc(p.sekolah)}" list="ob-kampus-list" autocomplete="off"><datalist id="ob-kampus-list"></datalist></div>`
          : teksIn('Sekolah', { wajib: true }, 'Contoh: SMA Negeri 1 Sildi', p.sekolah, 80, 'autocomplete="organization" ') };
      case 6: return statusKuliah(p.statusPendidikan)
        ? { teks: bubble('Apa program studi yang sedang kamu tempuh saat ini?'), tombol: 'Lanjut',
            form: `<div class="ob-f">${lab('ob-prodi-kuliah', 'Program studi', true, false)}<input class="ob-input" id="ob-prodi-kuliah" maxlength="120" placeholder="Pilih program studi sesuai kampus" value="${esc(p.jurusan)}" list="ob-prodi-kuliah-list" autocomplete="off"><datalist id="ob-prodi-kuliah-list"></datalist></div>` }
        : { teks: bubble('Apa jurusan atau bidang studimu saat ini?'), tombol: 'Lanjut',
            form: `<div class="ob-f" role="radiogroup" aria-label="Jurusan"><span class="ob-lab">Jurusan <span style="color:var(--ob-err)">*</span></span><div class="ob-grid2">${radio('ob-jur', PROFIL_JURUSAN, p.jurusan)}</div></div>` };
      case 7: return { teks: bubble('Sudah punya kampus impian? Aku penasaran dengan targetmu!'), tombol: 'Lanjut',
        form: `<div class="ob-f">${lab('ob-in', 'Target PTN', true, false)}<input class="ob-input" id="ob-in" maxlength="120" placeholder="Ketik nama universitas atau institut" value="${esc(draf.ptn)}" list="ob-ptn" autocomplete="off"><datalist id="ob-ptn"></datalist></div>` };
      case 8: return { teks: bubble('Kalau begitu, program studi apa yang ingin kamu perjuangkan?'), tombol: 'Lanjut',
        form: (draf.ptn ? `<p class="ob-ctx">Target PTN: ${esc(draf.ptn)}</p>` : '') + `<div class="ob-f">${lab('ob-in', 'Program studi tujuan', true, false)}<input class="ob-input" id="ob-in" maxlength="120" placeholder="Pilih program studi dari daftar" value="${esc(draf.prodi)}" list="ob-prodi" autocomplete="off"><datalist id="ob-prodi"></datalist></div>` };
      case 9: return { teks: bubble('Sekarang, boleh tahu tanggal lahirmu?'), tombol: 'Lanjut',
        form: `<div class="ob-f">${lab('ob-in', 'Tanggal lahir', false, true)}<input class="ob-input" type="date" id="ob-in" max="${hariIni()}" value="${esc(p.tanggalLahir)}"></div><p class="ob-catatan">Tanggal lahir tidak pernah ditampilkan ke orang lain.</p>` };
      case 10: return { teks: bubble('Kamu tinggal di kota mana?'), tombol: 'Lanjut',
        form: teksIn('Kota domisili', { wajib: false }, 'Contoh: Dagestan', p.kota, 40, 'autocomplete="address-level2" ') };
      case 11: return { teks: bubble('Hampir selesai! Sekarang atur informasi mana yang boleh dilihat orang lain.'), tombol: 'Simpan dan selesai',
        form: `<label class="ob-switch"><input type="checkbox" id="ob-publik" ${p.publik ? 'checked' : ''}><span><b>Tampilkan profil di link publik</b><small>Orang lain bisa membuka profilmu lewat link. Hanya nama, username, avatar, dan deskripsi yang tampil.</small></span></label>
        <div class="ob-f" id="ob-wadah-user" ${p.publik && !p.username ? '' : 'hidden'}><label for="ob-username2">Username untuk link publik</label><input class="ob-input" id="ob-username2" maxlength="20" autocapitalize="none" autocomplete="off" placeholder="huruf kecil, angka, atau _ (3-20 karakter)" value="${esc(p.username)}"></div>
        <label class="ob-switch"><input type="checkbox" id="ob-statistik" ${p.tampilkanStatistik ? 'checked' : ''}><span><b>Tampilkan statistik</b><small>Akurasi dan topik latihanmu ikut terlihat, hanya jika profil publik aktif.</small></span></label>
        <p class="ob-catatan">Kedua pengaturan ini bisa kamu ubah kapan saja di halaman Profil.</p>` };
      default: return { teks: bubble('Yeay! Kita sudah kenalan!', 'Profilmu sudah siap. Sekarang saatnya mengasah kemampuan bernalar bersama Nalarine!'), form: '', tombol: 'Mulai Belajar', selesai: true };
    }
  }

  function render(mundur) {
    const p = ambilProfil(), k = isiLangkah(p), L = LANGKAH[tahap] || LANGKAH[12];
    const akhir = tahap >= TOTAL;
    const kuliah = statusKuliah(p.statusPendidikan);
    const jumlahPertanyaan = kuliah ? TOTAL - 2 : TOTAL;
    const tahapTampil = kuliah && tahap >= 7 && !akhir ? tahap - 2 : tahap;
    const nomor = Math.min(tahapTampil + 1, jumlahPertanyaan);
    const label = akhir ? 'Selesai' : `Pertanyaan ${nomor} dari ${jumlahPertanyaan}`;
    OB.innerHTML = `<div class="ob-wrap">
      <header class="ob-atas"><span class="ob-logo">Nalarine</span><span class="ob-langkah">${label}</span></header>
      <div class="ob-bar" role="progressbar" aria-label="Progres onboarding" aria-valuemin="0" aria-valuemax="${jumlahPertanyaan}" aria-valuenow="${akhir ? jumlahPertanyaan : nomor}"><i style="width:${akhir ? 100 : Math.round((nomor / jumlahPertanyaan) * 100)}%"></i></div>
      <main class="ob-panggung"><div class="ob-slide${mundur ? ' mundur' : ''}" data-tahap="${tahap}">
        <div class="ob-naro"><div class="ob-spr"><div class="ob-gerak g-${L.gerak}${L.flip ? ' flip' : ''}" data-pose="${L.n}">${gambar(L.n, L.flip)}${aksenSvg(L.aksen)}</div></div></div>
        ${k.teks}
        <form class="${k.selesai ? 'ob-selesai' : 'ob-kartu'}" id="ob-form" novalidate>
          ${k.form}
          <p class="ob-pesan" id="ob-pesan" role="alert"></p>
          <div class="ob-aksi">${tahap > 0 && !akhir ? '<button type="button" class="ob-btn" data-ob-kembali>Kembali</button>' : ''}<button type="submit" class="ob-btn pri" id="ob-lanjut">${k.tombol}</button></div>
        </form></div></main>
      <footer style="text-align:center"><button type="button" class="ob-keluar" data-ob-keluar>Keluar akun</button></footer></div>`;
    buka();
    OB.scrollTop = 0;
    const f = OB.querySelector('#ob-in,[name="ob-status"]:checked,[name="ob-status"],[name="ob-jur"]:checked,[name="ob-jur"],#ob-publik') || $('ob-lanjut');
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 60);
    if (tahap === 5 && statusKuliah(ambilProfil().statusPendidikan)) {
      muatKampusProfil().then((kampus) => {
        const list = $('ob-kampus-list');
        if (list) list.innerHTML = kampus.map((k) => `<option value="${esc(teksKampus(k))}"></option>`).join('');
      }).catch((e) => { console.error('Gagal memuat kampus onboarding:', e); pesan('Daftar kampus belum bisa dimuat. Periksa koneksi lalu coba lagi.'); });
    }
    if (tahap === 6 && statusKuliah(ambilProfil().statusPendidikan)) {
      (async () => {
        try {
          const kampus = await muatKampusProfil();
          const k = kampus.find((x) => x.npsn === ambilProfil().perguruanTinggiNpsn);
          if (!k) { pesan('Pilih perguruan tinggi terlebih dahulu pada langkah sebelumnya.'); return; }
          const prodi = await muatProdiProfil(k.npsn);
          const list = $('ob-prodi-kuliah-list');
          if (list) list.innerHTML = prodi.map((p) => `<option value="${esc(teksProdi(p))}"></option>`).join('');
        } catch (e) { console.error('Gagal memuat program studi onboarding:', e); pesan('Daftar program studi belum bisa dimuat. Coba kembali sebentar lagi.'); }
      })();
    }
    if (tahap === 7) {
      muatKampusProfil().then((kampus) => {
        const list = $('ob-ptn');
        if (list) list.innerHTML = kampus.map((k) => `<option value="${esc(teksKampus(k))}"></option>`).join('');
      }).catch((e) => { console.error('Gagal memuat daftar PTN onboarding:', e); pesan('Daftar kampus belum bisa dimuat. Periksa koneksi lalu coba lagi.'); });
    }
    if (tahap === 8) {
      (async () => {
        try {
          const kampus = await muatKampusProfil();
          const k = kampus.find((x) => teksKampus(x) === draf.ptn);
          if (!k) { pesan('Pilih kampus dari daftar pada langkah sebelumnya.'); return; }
          const prodi = await muatProdiProfil(k.npsn);
          const list = $('ob-prodi');
          if (list) list.innerHTML = prodi.map((p) => `<option value="${esc(teksProdi(p))}"></option>`).join('');
        } catch (e) { console.error('Gagal memuat daftar program studi onboarding:', e); pesan('Daftar program studi belum bisa dimuat. Coba kembali sebentar lagi.'); }
      })();
    }
  }
  function tampilMemuat() {
    memuat = true; buka();
    OB.innerHTML = `<div class="ob-wrap"><main class="ob-panggung"><div class="ob-slide"><div class="ob-naro"><div class="ob-spr"><div class="ob-gerak g-goyang">${gambar('sapa')}</div></div></div>
      ${bubble('Sebentar ya, aku siapkan akunmu...')}<div class="ob-muat"><span class="ob-spin" aria-hidden="true"></span>Memeriksa akun</div></div></main></div>`;
    clearTimeout(jedaMuat);
    // Pengaman: kalau server lambat, lanjutkan dengan data di perangkat ini supaya aplikasi tidak terkunci
    jedaMuat = setTimeout(() => { if (memuat) window.cekOnboarding(); }, 12000);
  }
  const pesan = (t) => { const e = $('ob-pesan'); if (e) e.textContent = t || ''; };
  const atur = (nomor, mundur) => { tahap = nomor; if (nomor < TOTAL) { st.simpan({ selesai: false, tahap: nomor }); sinkron().catch(() => {}); } render(mundur); };

  // Simpan ke profil yang sudah ada. Nilai kosong tidak menimpa data lama.
  async function simpanProfil(baru) {
    const m = ambilProfil();
    Object.keys(baru).forEach((k) => {
      const v = baru[k];
      if (typeof v === 'boolean' || String(v === undefined ? '' : v).trim() !== '') m[k] = v;
    });
    ProfilApp.simpan(m);
    await pushProfil();
    renderProfil(false); renderSalam();
  }
  async function cekUsername(u) {
    if (!u) { pesan('Username wajib diisi.'); return false; }
    if (!/^[a-z0-9_]{3,20}$/.test(u)) { pesan('Username hanya boleh huruf kecil, angka, dan _ (3-20 karakter).'); return false; }
    if (u === (ambilProfil().username || '')) return true;
    try {
      const ok = await rest('rpc/username_tersedia', { method: 'POST', body: { p_username: u } });
      if (!ok) { pesan('Username itu sudah dipakai orang lain.'); return false; }
    } catch (e) { pesan('Tidak bisa mengecek username. Coba lagi sebentar.'); return false; }
    return true;
  }
  // Pemeriksaan langsung saat mengetik username (tidak memblokir tombol Lanjut)
  function cekLangsung(u) {
    const el = $('ob-cekuser');
    if (!el) return;
    clearTimeout(timerUser);
    const set = (kelas, t) => { el.className = 'ob-cekuser' + (kelas ? ' ' + kelas : ''); el.textContent = t; };
    if (!u) return set('salah', 'Username wajib diisi.');
    if (!/^[a-z0-9_]{3,20}$/.test(u)) return set('salah', 'Hanya huruf kecil, angka, dan _ (3-20 karakter).');
    if (u === (ambilProfil().username || '')) return set('ok', 'Username ini sudah milikmu.');
    set('', 'Memeriksa ketersediaan...');
    timerUser = setTimeout(async () => {
      try {
        const ok = await rest('rpc/username_tersedia', { method: 'POST', body: { p_username: u } });
        const now = $('ob-in'); if (!now || now.value.trim().toLowerCase() !== u) return;
        set(ok ? 'ok' : 'salah', ok ? 'Username tersedia.' : 'Username itu sudah dipakai orang lain.');
      } catch (e) { set('', 'Belum bisa mengecek sekarang.'); }
    }, 450);
  }
  const gagalSimpan = () => pesan('Belum bisa menyimpan ke akunmu. Periksa koneksi, lalu coba lagi.');

  async function selesaiOnboarding() {
    if (!profilLengkap(ambilProfil())) { atur(ambilProfil().nama ? 4 : 0); return; }
    st.simpan({ selesai: true, tahap: TOTAL });
    tahap = TOTAL; render();
    try { await sinkron(); } catch (e) {}
  }
  async function lanjut() {
    if (sibuk) return;
    sibuk = true;
    const tb = $('ob-lanjut'); if (tb) tb.disabled = true;
    pesan('');
    const val = () => ($('ob-in') ? $('ob-in').value.trim() : '');
    try {
      switch (tahap) {
        case 0: { const nama = val(); if (!nama) return pesan('Nama lengkap belum diisi.'); await simpanProfil({ nama }); return atur(1); }
        case 1: { const u = val().toLowerCase(); if (!(await cekUsername(u))) return; await simpanProfil({ username: u }); return atur(2); }
        case 2: return atur(3);
        case 3: await simpanProfil({ deskripsi: val() }); return atur(4);
        case 4: { const s = OB.querySelector('[name="ob-status"]:checked'); if (!s) return pesan('Pilih status pendidikanmu dulu.'); await simpanProfil({ statusPendidikan: s.value }); return atur(5); }
        case 5: {
          if (!statusKuliah(ambilProfil().statusPendidikan) && !val()) return pesan('Nama sekolah wajib diisi.');
          if (statusKuliah(ambilProfil().statusPendidikan)) {
            const namaKampus = $('ob-kampus') ? $('ob-kampus').value.trim() : '';
            const kampus = await muatKampusProfil();
            const k = kampus.find((x) => teksKampus(x) === namaKampus);
            if (!k) return pesan('Pilih perguruan tinggi dari daftar yang tersedia.');
            await simpanProfil({ sekolah: teksKampus(k), perguruanTinggiNpsn: k.npsn, programStudiId: null });
          } else await simpanProfil({ sekolah: val() });
          return atur(6);
        }
        case 6: {
          if (statusKuliah(ambilProfil().statusPendidikan)) {
            const namaProdi = $('ob-prodi-kuliah') ? $('ob-prodi-kuliah').value.trim() : '';
            const data = await muatProdiProfil(ambilProfil().perguruanTinggiNpsn);
            const prodi = data.find((x) => teksProdi(x) === namaProdi);
            if (!prodi) return pesan('Pilih program studi dari daftar sesuai perguruan tinggi.');
            await simpanProfil({ jurusan: prodi.nm_prodi, programStudiId: String(prodi.id) });
          } else {
            const j = OB.querySelector('[name="ob-jur"]:checked');
            if (!j) return pesan('Pilih jurusan terlebih dahulu.');
            await simpanProfil({ jurusan: j.value });
          }
          return atur(statusKuliah(ambilProfil().statusPendidikan) ? 9 : 7);
        }
        case 7: {
          draf.ptn = val();
          const kampus = await muatKampusProfil();
          const terpilih = kampus.find((k) => teksKampus(k) === draf.ptn);
          if (!terpilih) return pesan('Pilih universitas atau institut dari daftar yang tersedia.');
          draf.ptnNpsn = terpilih.npsn; draf.prodi = '';
          await simpanProfil({ target: gabungTarget() }); return atur(8);
        }
        case 8: {
          draf.prodi = val();
          const kampus = await muatKampusProfil();
          const k = kampus.find((x) => teksKampus(x) === draf.ptn);
          if (!k) return pesan('Pilih kampus tujuan terlebih dahulu.');
          const prodi = await muatProdiProfil(k.npsn);
          if (!prodi.some((p) => teksProdi(p) === draf.prodi)) return pesan('Pilih program studi dari daftar sesuai kampus tujuanmu.');
          await simpanProfil({ target: gabungTarget() }); return atur(9);
        }
        case 9: { const t = $('ob-in').value; if (t && t > hariIni()) return pesan('Tanggal lahir tidak boleh di masa depan.'); await simpanProfil({ tanggalLahir: t }); return atur(10); }
        case 10: await simpanProfil({ kota: val() }); return atur(11);
        case 11: {
          const publik = $('ob-publik').checked, stat = $('ob-statistik').checked;
          let u = ambilProfil().username;
          if (publik && !u) {
            u = $('ob-username2').value.trim().toLowerCase();
            if (!u) { $('ob-wadah-user').hidden = false; return pesan('Isi username dulu supaya profil publik bisa dibuka.'); }
            if (!(await cekUsername(u))) return;
          }
          await simpanProfil({ publik, tampilkanStatistik: stat, username: u });
          return await selesaiOnboarding();
        }
        default: // layar penutup: masuk ke dashboard
          tutup(); tampil('menu'); renderBeranda(); renderProfil(false); renderSalam();
      }
    } catch (e) {
      gagalSimpan();
    } finally {
      sibuk = false;
      const t2 = $('ob-lanjut'); if (t2) t2.disabled = false;
    }
  }

  OB.addEventListener('submit', (e) => { e.preventDefault(); lanjut(); });
  OB.addEventListener('click', async (e) => {
    const t = e.target;
    if (t.closest('[data-ob-kembali]')) {
      if (tahap > 0) atur(tahap === 9 && statusKuliah(ambilProfil().statusPendidikan) ? 6 : tahap - 1, true);
      return;
    }
    if (t.closest('[data-ob-keluar]')) { await aksiAkun('keluar'); return; }
    const av = t.closest('[data-ob-av]');
    if (av) { await simpanAvatar({ tipe: 'preset', id: av.dataset.obAv }); segarAvatar(); return; }
    if (t.closest('[data-ob-inisial]')) { await simpanAvatar(null); segarAvatar(); return; }
    if (t.closest('[data-ob-galeri]')) $('ob-foto').click();
  });
  function segarAvatar() {
    const a = avatarTersimpan();
    const pv = $('ob-av-prev'); if (pv) pv.innerHTML = avatarIsi(ambilProfil().nama);
    OB.querySelectorAll('[data-ob-av]').forEach((b) => b.classList.toggle('aktif', !!a && a.tipe === 'preset' && a.id === b.dataset.obAv));
  }
  OB.addEventListener('change', async (e) => {
    if (e.target.id === 'ob-kampus') {
      const kampus = await muatKampusProfil().catch(() => []);
      const k = kampus.find((x) => teksKampus(x) === e.target.value.trim());
      if (k) {
        const p = ambilProfil();
        ProfilApp.simpan({ ...p, sekolah: teksKampus(k), perguruanTinggiNpsn: k.npsn, programStudiId: null });
      }
      return;
    }
    if (e.target.id === 'ob-ptn') {
      const kampus = await muatKampusProfil().catch(() => []);
      const k = kampus.find((x) => teksKampus(x) === e.target.value.trim());
      draf.ptnNpsn = k ? k.npsn : '';
      draf.prodi = '';
      st.simpan({ ptn: e.target.value.trim(), prodi: '' });
      return;
    }
    if (e.target.id === 'ob-publik') { const w = $('ob-wadah-user'); if (w) w.hidden = !(e.target.checked && !ambilProfil().username); return; }
    if (e.target.id !== 'ob-foto') return;
    const f = e.target.files[0], pa = $('ob-pesan-av');
    e.target.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/') || f.size > 15 * 1024 * 1024) { pa.textContent = 'Pilih file gambar (maksimal 15 MB).'; return; }
    try {
      const data = await ubahFotoJadiAvatar(f);
      if (!(await simpanAvatar({ tipe: 'foto', data }))) throw new Error('Penyimpanan browser penuh.');
      pa.textContent = ''; segarAvatar();
    } catch (er) { pa.textContent = er.message; }
  });
  OB.addEventListener('input', (e) => {
    if (e.target.id !== 'ob-in') return;
    if (tahap === 3) $('ob-hit').textContent = e.target.value.length + '/300';
    if (tahap === 1) cekLangsung(e.target.value.trim().toLowerCase());
  });

  // Dipanggil di awal mulaiSesi: tahan tampilan dashboard sampai status onboarding jelas
  window.obMemuat = function () {
    const s = st.ambil();
    if ((AkunApp.sesi() || /access_token=/.test(location.hash)) && !(s && s.selesai)) tampilMemuat();
  };
  // Dipanggil setelah data akun terambil. Menentukan: tampilkan onboarding, atau langsung ke dashboard.
  window.adaProgresOnboarding = function () {
    const s = st.ambil();
    return !!(s && !s.selesai);
  };
  window.mulaiOnboardingPublik = function () {
  let s = st.ambil();
  if (!s || s.selesai) {
    st.simpan({ selesai: false, tahap: 0, ptn: '', prodi: '' });
    s = st.ambil();
  }

  if (s && s.selesai) {
    tahap = TOTAL;
  } else {
    tahap = s && Number.isInteger(s.tahap)
      ? Math.min(Math.max(s.tahap, 0), TOTAL - 1)
      : 0;
  }

  draf = (s && (s.ptn || s.prodi))
    ? { ptn: s.ptn, prodi: s.prodi }
    : pecahTarget(ambilProfil().target);
  if (statusKuliah(ambilProfil().statusPendidikan) && (tahap === 7 || tahap === 8)) tahap = 9;

  render();
};
  window.cekOnboarding = async function () {
    memuat = false; clearTimeout(jedaMuat);
    if (!AkunApp.sesi()) return tutup();
    const s = st.ambil(), p = ProfilApp.ambil();
    // Profil lengkap mengalahkan progres onboarding yang tertinggal/tidak sinkron.
    // Ini mencegah pengguna lama diminta mengisi onboarding lagi setelah login.
    if (s && s.selesai) return tutup();
    if (profilOnboardingLengkap(p)) {
      st.simpan({ selesai: true, tahap: TOTAL, ptn: '', prodi: '' });
      sinkron().catch(() => {});
      return tutup();
    }
    tahap = s && Number.isInteger(s.tahap) ? Math.min(Math.max(s.tahap, 0), TOTAL - 1) : 0;
    // PTN dan program studi: pakai draf progres, kalau belum ada ambil dari field target profil
    draf = (s && (s.ptn || s.prodi)) ? { ptn: s.ptn, prodi: s.prodi } : pecahTarget(ambilProfil().target);
    // data profil sudah terisi (misal progres format lama): jangan mengulang dari nama
    if (tahap === 0 && String(ambilProfil().nama).trim()) tahap = 1;
    if (statusKuliah(ambilProfil().statusPendidikan) && (tahap === 7 || tahap === 8)) tahap = 9;
    render();
  };
  window.tutupOnboarding = tutup;
})();
cekHashPublik();
window.addEventListener('hashchange', cekHashPublik);
setInterval(() => { if (AkunApp.sesi()) sinkron().catch(() => {}); }, 30000);

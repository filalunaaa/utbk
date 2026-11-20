// ===== Pusat Pengaturan: data, tampilan, ekspor, manajemen data =====
var PENG_DEF={peringatanWaktu:true,konfirmAkhiri:true,tampilTimer:true,ukuranTeks:'normal',animasi:'normal',ukuranSoal:'normal',jarakBaris:'normal',lebarSoal:'normal',mapelDefault:'semua',ingatTerakhir:false};
var PENG_OK={ukuranTeks:['kecil','normal','besar'],animasi:['normal','kurang'],ukuranSoal:['kecil','normal','besar'],jarakBaris:['rapat','normal','lega'],lebarSoal:['sempit','normal','lebar'],mapelDefault:['semua','PK','PM']};
var KONTAK_BANTUAN='testingwebutbk@gmail.com';var VERSI_APP='0.9.0-beta';
function toastNeon(msg,err){var t=document.createElement('div');t.className='toast-neon'+(err?' err':'');t.setAttribute('role','status');t.textContent=msg;document.body.appendChild(t);setTimeout(function(){t.remove()},2400)}
function pengaturan(){return Object.assign({},PENG_DEF,PengaturanApp.ambil())}
function simpanPeng(patch){
  var k={};Object.keys(patch).forEach(function(a){var v=patch[a];if(!(a in PENG_DEF))return;if(typeof PENG_DEF[a]==='boolean')v=!!v;else if(PENG_OK[a]&&PENG_OK[a].indexOf(v)<0)return;k[a]=v});
  var baru=Object.assign({},PengaturanApp.ambil(),k);
  try{localStorage.setItem(PengaturanApp.KEY,JSON.stringify(baru));var cek=JSON.parse(localStorage.getItem(PengaturanApp.KEY));
    if(Object.keys(k).some(function(a){return cek[a]!==k[a]}))throw 0;return true}catch(e){return false}}
function terapkanTampilan(){var p=pengaturan(),h=document.documentElement;
  h.dataset.teks=p.ukuranTeks;h.dataset.anim=p.animasi;
  h.style.setProperty('--fs-soal',{kecil:'.95rem',normal:'1.08rem',besar:'1.3rem'}[p.ukuranSoal]);
  h.style.setProperty('--lh-soal',{rapat:'1.5',normal:'1.75',lega:'2.05'}[p.jarakBaris]);
  h.style.setProperty('--w-soal',{sempit:'640px',normal:'780px',lebar:'980px'}[p.lebarSoal])}
function peringatanWaktu30(){toastNeon('Sisa waktu 30 detik');
  try{var C=window.AudioContext||window.webkitAudioContext,c=new C(),o=c.createOscillator(),g=c.createGain();o.frequency.value=660;g.gain.value=.04;o.connect(g);g.connect(c.destination);o.start();o.stop(c.currentTime+.18)}catch(e){}}
function rekamKonfigTerakhir(){if(window._tanpaRekam){window._tanpaRekam=false;return}
  var p=PengaturanApp.ambil();if(!p.ingatTerakhir)return;
  try{localStorage.setItem(PengaturanApp.KEY,JSON.stringify(Object.assign({},p,{konfigTerakhir:{mode:nilai('mode'),jumlah:nilai('jumlah'),mapel:nilai('mapel')}})))}catch(e){}}
function bukaPanel(k){document.querySelectorAll('#pengaturan .set-panel').forEach(function(x){x.hidden=x.dataset.isi!==k});$('set-hub').hidden=!!k;window.scrollTo(0,0);if(k){isiPanelBaru();var m=document.querySelector('#pengaturan [data-isi="'+k+'"] .set-jdl');if(m){m.tabIndex=-1;m.focus({preventScroll:true})}if(k==='tampilan'&&window.MathJax&&MathJax.typesetPromise)try{MathJax.typesetPromise([document.querySelector('.set-pratinjau')])}catch(e){}}}
function statusSinkron(){var s=AkunApp.sesi(),t=+localStorage.getItem('neon_sinkron_ok')||0,g=localStorage.getItem('neon_sinkron_gagal');
  if(!s)return 'Belum masuk akun: data hanya tersimpan di perangkat ini.';
  return 'Akun: '+(s.email||'masuk')+'. '+(g?'Sinkronisasi terakhir gagal ('+new Date(+g).toLocaleString('id-ID')+').':t?'Sinkron terakhir: '+new Date(t).toLocaleString('id-ID')+'.':'Belum ada sinkronisasi yang tercatat di sesi ini.')}
function isiPanelBaru(){var p=pengaturan();
  document.querySelectorAll('#pengaturan [data-set]').forEach(function(el){var v=p[el.dataset.set];if(el.type==='checkbox')el.checked=!!v;else el.checked=el.value===String(v)});
  var pr=ProfilApp.ambil()||{},s=AkunApp.sesi();
  $('set-nama').textContent=pr.nama||'Belum mengisi profil';$('set-user').textContent=pr.username?'@'+pr.username:'Username belum diatur';
  $('set-status').textContent=s?'Akun masuk'+(s.email?' · '+s.email:''):'Mode lokal (belum masuk)';
  $('set-akun-aksi').innerHTML=s?'<button class="btn btn-secondary btn-kecil" data-akun="keluar">Keluar dari akun</button>':'';
  $('set-sinkron').textContent=statusSinkron();
  $('set-versi').textContent=VERSI_APP?'Versi '+VERSI_APP:'Nomor versi belum ditetapkan di proyek';
  $('set-kontak').innerHTML=KONTAK_BANTUAN?'Laporkan masalah ke <a href="mailto:'+KONTAK_BANTUAN+'">'+KONTAK_BANTUAN+'</a>.':'Kontak bantuan belum dikonfigurasi. Isi KONTAK_BANTUAN di kode agar tampil di sini.';
  var kt=document.querySelector('#pengaturan [data-isi="tampilan"] .set-pratinjau');if(kt)kt.dataset.ok=1}
var _rp=renderPengaturan;renderPengaturan=function(){_rp();isiPanelBaru()};
document.querySelector('.nav-link[data-hal="pengaturan"]')&&document.querySelectorAll('.nav-link[data-hal="pengaturan"]').forEach(function(a){a.addEventListener('click',function(){bukaPanel('')})});
$('pengaturan').addEventListener('click',function(e){var b=e.target.closest('[data-panel]');if(b)return bukaPanel(b.dataset.panel);var ak=e.target.closest('[data-akun]');if(ak)aksiAkun(ak.dataset.akun)});
$('pengaturan').addEventListener('change',function(e){var t=e.target;
  if(t.dataset&&t.dataset.set){var o={};o[t.dataset.set]=t.type==='checkbox'?t.checked:t.value;var ok=simpanPeng(o);if(ok){terapkanTampilan();toastNeon('Pengaturan berhasil disimpan.')}else{toastNeon('Gagal menyimpan. Penyimpanan browser mungkin penuh atau diblokir.',true);isiPanelBaru()}}
  else if(t.name==='def-mode'||t.name==='def-jumlah'||t.name==='set-waktu'||t.name==='tema'||t.id==='pubatur-publik'||t.id==='pubatur-statistik')setTimeout(function(){toastNeon('Pengaturan berhasil disimpan.')},60)});
// sinkronisasi: catat hasil nyata
if(typeof sinkron==='function'){var _sk=sinkron;sinkron=async function(){try{var r=await _sk.apply(this,arguments);try{localStorage.setItem('neon_sinkron_ok',Date.now());localStorage.removeItem('neon_sinkron_gagal')}catch(e){}return r}catch(e){try{localStorage.setItem('neon_sinkron_gagal',Date.now())}catch(_){}throw e}}}
$('set-sinkron-btn').addEventListener('click',async function(){var b=this;if(!AkunApp.sesi())return toastNeon('Masuk akun dulu untuk sinkronisasi.',true);b.disabled=true;b.textContent='Menyinkronkan...';
  try{await sinkron();toastNeon('Sinkronisasi berhasil.')}catch(e){toastNeon('Sinkronisasi gagal: '+(e.message||'periksa koneksi'),true)}b.disabled=false;b.textContent='Sinkronkan sekarang';$('set-sinkron').textContent=statusSinkron()});
// ekspor
function sel(v){v=v==null?'':String(v);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'}
function tglLokal(t){var d=new Date(t),z=function(n){return String(n).padStart(2,'0')};return d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate())+' '+z(d.getHours())+':'+z(d.getMinutes())}
function teksJawab(j){return j===null||j===undefined?'':Array.isArray(j)?j.map(function(k){return HURUF[k]}).join('+'):String(j)}
$('set-csv').addEventListener('click',function(){var r=Riwayat.ambil();var m=$('set-ekspor-msg');if(!r.length){m.textContent='Belum ada riwayat untuk diekspor.';return}
  var peta={};try{[].concat(SOAL,BankSoal.ambil()).forEach(function(q){peta[String(q.id)]=q})}catch(e){}
  var kosongJ=function(j){return j===null||j===undefined||(Array.isArray(j)&&!j.length)};
  var kunciTeks=function(q){if(!q)return '';try{return adaIsian(q)?String(q.jawaban):Array.isArray(q.jawaban)?q.jawaban.map(function(k){return HURUF[k]}).join(', '):HURUF[q.jawaban]}catch(e){return ''}};
  var jawabTeks=function(q,j){if(kosongJ(j))return 'Tidak dijawab';if(q){try{return teksJawabanmu(q,j)}catch(e){}}return Array.isArray(j)?j.map(function(k){return HURUF[k]}).join(', '):String(j)};
  var tgl=function(t){var d=new Date(t),z=function(n){return String(n).padStart(2,'0')};return [d.getFullYear()+'-'+z(d.getMonth()+1)+'-'+z(d.getDate()),z(d.getHours())+':'+z(d.getMinutes())]};
  var baris=[['No','Tanggal','Jam','Mata pelajaran','Topik','Hasil','Jawabanmu','Kunci jawaban'].map(sel).join(';')];
  r.slice().sort(function(a,b){return b.t-a.t}).forEach(function(x,n){var q=peta[String(x.id)],w=tgl(x.t);
    baris.push([n+1,w[0],w[1],namaMapel(x.mapel),x.topik,kosongJ(x.j)?'Kosong':x.b?'Benar':'Salah',jawabTeks(q,x.j),kunciTeks(q)].map(sel).join(';'))});
  var u=URL.createObjectURL(new Blob(['﻿'+baris.join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=u;a.download='riwayat-nalarin-'+tglLokal(Date.now()).slice(0,10)+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(u)},1000);
  m.textContent=r.length+' catatan diekspor.';toastNeon('File CSV dibuat.')});
$('set-pdf').addEventListener('click',function(){var d=Penyimpanan.ambil(),r=Riwayat.ambil(),m=$('set-ekspor-msg');if(!d.total&&!r.length){m.textContent='Belum ada data untuk dilaporkan.';return}
  var pr=ProfilApp.ambil()||{},E=esc,pct=function(x){return x.total?Math.round(x.benar/x.total*100)+'%':'–'};
  var tb=function(o,lbl){return '<table><tr><th>'+lbl+'</th><th>Dikerjakan</th><th>Benar</th><th>Akurasi</th></tr>'+Object.keys(o).map(function(k){return '<tr><td>'+E(lbl==='Mapel'?namaMapel(k):k)+'</td><td>'+o[k].total+'</td><td>'+o[k].benar+'</td><td>'+pct(o[k])+'</td></tr>'}).join('')+'</table>'};
  var ar=$('area-cetak')||document.body.appendChild(Object.assign(document.createElement('div'),{id:'area-cetak'}));
  ar.innerHTML='<h1>Laporan Perkembangan nalarin</h1><p>'+E(pr.nama||'')+' · dicetak '+tglLokal(Date.now())+'</p><h2>Ringkasan</h2><p>'+d.total+' soal dikerjakan, '+d.benar+' benar, akurasi '+pct(d)+'.</p><h2>Per mata pelajaran</h2>'+tb(d.mapel,'Mapel')+'<h2>Per topik</h2>'+tb(d.topik,'Topik')+'<h2>30 pengerjaan terakhir</h2><table><tr><th>Tanggal</th><th>Topik</th><th>Status</th></tr>'+r.slice(-30).reverse().map(function(x){return '<tr><td>'+tglLokal(x.t)+'</td><td>'+E(x.topik)+'</td><td>'+(x.j===null||x.j===undefined?'Kosong':x.b?'Benar':'Salah')+'</td></tr>'}).join('')+'</table>';
  document.body.classList.add('mencetak');window.addEventListener('afterprint',function f(){document.body.classList.remove('mencetak');window.removeEventListener('afterprint',f)});
  m.textContent='Pada dialog cetak, pilih "Simpan sebagai PDF".';window.print()});
// reset & hapus lokal (terpisah, masing-masing dengan konfirmasi)
$('set-reset').addEventListener('click',function(){konfirmUjian('Reset statistik?','Yang dihapus: statistik total, akurasi per topik dan mapel, riwayat pengerjaan, riwayat sesi, dan analisis pilihan jawaban. Bank soal, profil, dan pengaturan tidak terpengaruh. Tindakan ini tidak bisa dibatalkan.',[{label:'Batal',kelas:'btn-primary'},{label:'Ya, reset statistik',kelas:'btn-bahaya',fn:function(){Penyimpanan.reset();PilihanStat.reset();Riwayat.reset();RiwayatSesi.reset();toastNeon('Statistik direset.')}}])});
$('set-lokal').addEventListener('click',function(){konfirmUjian('Hapus data lokal?',AkunApp.sesi()?'Data di perangkat ini (statistik, riwayat, bank soal, profil, pengaturan) akan dihapus. Akunmu tetap ada dan datanya dapat terunduh lagi saat sinkronisasi.':'Kamu belum masuk akun, jadi data di perangkat ini (statistik, riwayat, bank soal, profil, pengaturan) akan hilang permanen.',[{label:'Batal',kelas:'btn-primary'},{label:'Hapus data lokal',kelas:'btn-bahaya',fn:function(){['utbk_testing_stats','utbk_bank_custom','utbk_bank_folder','utbk_pilihan_stat','utbk_riwayat','utbk_riwayat_sesi','utbk_sesi_dimigrasi','utbk_profil','utbk_avatar','utbk_pengaturan','neon_sinkron_ok','neon_sinkron_gagal'].forEach(function(k){try{localStorage.removeItem(k)}catch(e){}});location.reload()}}])});
document.getElementById('dash-pengaturan').addEventListener('click',function(){document.querySelector('.side-nav [data-hal="pengaturan"]').click()});

(function(){var box=$('pilih-topik'),wad=$('tp-wadah'),tg=$('tp-toggle'),cari=$('tp-cari');
  function labels(){return [].slice.call(box.querySelectorAll('label.pv-chip'))}
  function ukur(){var luas=wad.classList.contains('luas');wad.classList.remove('pendek');
    var perlu=box.scrollHeight>132;if(!perlu&&!luas)wad.classList.add('pendek');tg.hidden=!perlu&&!luas;
    tg.textContent=luas?'Ringkas daftar topik':'Tampilkan semua topik ('+labels().filter(function(l){return !l.hidden}).length+')';tg.setAttribute('aria-expanded',String(luas))}
  function filter(){var q=cari.value.trim().toLowerCase(),n=0;labels().forEach(function(l){var bl=l.closest('.tp-blok'),ok=!q||(bl?bl.textContent:l.textContent).toLowerCase().indexOf(q)>-1;l.hidden=!ok;if(bl){bl.hidden=!ok;if(q&&ok&&l.textContent.toLowerCase().indexOf(q)<0){bl.classList.add('buka');var si=bl.querySelector('.sb-isi');if(si)si.hidden=false}}if(ok)n++});$('tp-nihil').hidden=n>0||!labels().length;document.querySelectorAll('#pilih-topik .pv-grup').forEach(function(g){g.classList.toggle('buka-cari',!!q&&!!g.querySelector('label:not([hidden])'))});if(q)wad.classList.add('luas');ukur()}
  function hitung(){var a=labels(),c=a.filter(function(l){return l.querySelector('input').checked}).length;$('tp-hitung').textContent=a.length?'· '+c+' dari '+a.length+' dipilih':''}
  function semua(v){labels().forEach(function(l){if(!l.hidden){l.querySelector('input').checked=v;var bl=l.closest('.tp-blok');if(bl){[].forEach.call(bl.querySelectorAll('input[data-sub]'),function(i){i.checked=v});labelSub(bl)}}});hitung();if(typeof hitungSoal==='function')hitungSoal();box.dispatchEvent(new Event('change',{bubbles:true}))}
  $('tp-semua').addEventListener('click',function(){semua(true)});
  $('tp-kosong').addEventListener('click',function(){semua(false)});
  tg.addEventListener('click',function(){wad.classList.toggle('luas');ukur()});
  cari.addEventListener('input',filter);
  box.addEventListener('change',hitung);
  new MutationObserver(function(){cari.value=cari.value;filter();hitung()}).observe(box,{childList:true});
  filter();hitung();
})();
terapkanTampilan();

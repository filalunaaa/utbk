// ===== Jelajahi Materi: taksonomi bertingkat Subtes > Rumpun > Topik > Subtopik =====
// TAKSONOMI dipindahkan ke skrip sebelum skrip utama (dipakai saat inisialisasi)
(function(){
  var mt={s:'PK',q:'',f:'semua',st:'',sel:null,buka:{},sheet:false},idx={},cache={},base=null,lastHasil=[];
  var REL={inti:'Inti',pendukung:'Pendukung',pengayaan:'Pengayaan'};
  var STATUS={belum:'Belum Dipelajari',sedang:'Berkembang',perlu:'Perlu Penguatan',dikuasai:'Dikuasai',kosong:'Belum Ada Soal'};
  // Aturan status (berdasarkan riwayat pengerjaan nyata)
  var MIN_PERLU=3,AKU_PERLU=50,MIN_KUASAI=5,AKU_KUASAI=80,MIN_UNIK=3;
  Object.keys(TAKSONOMI).forEach(function(k){
    idx['s:'+k]={type:'subtes',id:'s:'+k,nama:TAKSONOMI[k].nama,s:k,legacy:[]};
    TAKSONOMI[k].rumpun.forEach(function(r){
      var lr=r.umum.slice(),semuaSub=[];
      r.topik.forEach(function(t){
        var ids=t.sub.map(function(sb){return sb.id});
        t.sub.forEach(function(sb){semuaSub.push(sb.id);idx[sb.id]={type:'sub',id:sb.id,nama:sb.nama,s:k,r:r,t:t,legacy:t.legacy,rel:t.rel}});
        idx[t.id]={type:'topik',id:t.id,nama:t.nama,s:k,r:r,t:t,legacy:t.legacy,rel:t.rel,subIds:ids};
        lr=lr.concat(t.legacy)});
      idx[r.id+'.umum']={type:'umum',id:r.id+'.umum',nama:'Belum diklasifikasikan ke topik',s:k,r:r,legacy:r.umum};
      idx[r.id]={type:'rumpun',id:r.id,nama:r.nama,s:k,r:r,legacy:lr,subIds:semuaSub}})});
  function semuaSoal(){return Array.from(new Set(SOAL.concat(BankSoal.ambil())))}
  function cocokSub(x,id){return x.subtopikId===id||(x.subtopikIds||[]).indexOf(id)>-1}
  function anggota(n,x){
    if(x.mataPelajaran!==n.s)return false;
    if(n.type==='subtes')return true;
    if(n.type==='sub')return cocokSub(x,n.id);
    if(n.type==='topik'&&cocokSub(x,n.id))return true;
    if(n.type==='rumpun'&&String(x.subtopikId||'').indexOf(n.id+'.')===0)return true;
    if(n.legacy.indexOf(x.topik)>-1)return true;
    return !!n.subIds&&n.subIds.some(function(id){return cocokSub(x,id)})}
  function dasar(){if(base)return base;var S=semuaSoal(),by={};S.forEach(function(x){by[x.mataPelajaran+'|'+x.id]=x});return base={S:S,by:by,R:Riwayat.ambil()}}
  // soal = soal unik tersedia; uniq = soal unik yang pernah dikerjakan; n = jumlah percobaan (attempt); b = percobaan benar
  function ukur(n){if(cache[n.id])return cache[n.id];var d=dasar();
    var ms=d.S.filter(function(x){return anggota(n,x)}),ids={},np=0,b=0;
    d.R.forEach(function(e){if(e.mapel!==n.s)return;var x=d.by[e.mapel+'|'+e.id];
      var ok=x?anggota(n,x):(n.type==='subtes'||(n.type!=='sub'&&n.legacy.indexOf(e.topik)>-1));
      if(!ok)return;np++;if(e.b)b++;ids[e.id]=1});
    var uniq=Math.min(Object.keys(ids).length,ms.length),u={soal:ms.length,uniq:uniq,n:np,b:b,acc:np?Math.round(b/np*100):null,cov:ms.length?Math.round(uniq/ms.length*100):0};
    u.status=!u.soal?'kosong':!u.n?'belum':(u.n>=MIN_PERLU&&u.acc<AKU_PERLU)?'perlu':(u.n>=MIN_KUASAI&&u.acc>=AKU_KUASAI&&u.uniq>=Math.min(MIN_UNIK,u.soal))?'dikuasai':'sedang';
    return cache[n.id]=u}
  function alasan(u){var s=u.status;
    if(s==='kosong')return 'Belum ada soal yang terhubung ke materi ini.';
    if(s==='belum')return 'Kamu belum mengerjakan soal di materi ini.';
    if(s==='perlu')return 'Akurasi '+u.acc+'% dari '+u.n+' percobaan, di bawah batas '+AKU_PERLU+'%.';
    if(s==='dikuasai')return 'Akurasi '+u.acc+'% dari '+u.n+' percobaan pada '+u.uniq+' soal berbeda.';
    if(u.n<MIN_KUASAI)return 'Baru '+u.n+' percobaan. Dikuasai setelah minimal '+MIN_KUASAI+' percobaan dengan akurasi '+AKU_KUASAI+'% ke atas.';
    if(u.acc<AKU_KUASAI)return 'Akurasi '+u.acc+'%. Capai '+AKU_KUASAI+'% atau lebih untuk dikuasai.';
    return 'Kerjakan lebih banyak soal yang berbeda (baru '+u.uniq+' dari minimal '+Math.min(MIN_UNIK,u.soal)+').'}
  function topikTampak(r){return r.topik}
  function subDari(n){var o=[];
    if(n.type==='topik')n.t.sub.forEach(function(sb){o.push(idx[sb.id])});
    else if(n.type==='rumpun')topikTampak(n.r).forEach(function(t){t.sub.forEach(function(sb){o.push(idx[sb.id])})});
    else if(n.type==='subtes')TAKSONOMI[n.s].rumpun.forEach(function(r){topikTampak(r).forEach(function(t){t.sub.forEach(function(sb){o.push(idx[sb.id])})})});
    return o}
  function filterAktif(){return mt.f!=='semua'||!!mt.st}
  function lolos(n){var u=ukur(n);return (mt.f==='semua'||u.soal>0)&&(!mt.st||mt.st===u.status)}
  function tampakTopik(r,t){return lolos(idx[t.id])}
  var CH='<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
  function titik(u){return '<span class="mt-dot st-'+u.status+'" role="img" aria-label="Status: '+STATUS[u.status]+'" title="'+STATUS[u.status]+'"></span>'}
  function hitungTeks(u){return u.soal?u.soal+' soal':'0 soal'}
  function baris(n,anak,lbl){var u=ukur(n),a=mt.sel===n.id,b=mt.buka[n.id];
    return '<div class="mt-row'+(a?' aktif':'')+'"><button type="button" class="mt-chev" data-tog="'+n.id+'" aria-expanded="'+(!!b)+'" aria-label="Buka atau tutup '+esc(n.nama)+'"'+(anak?'':' disabled')+'>'+CH+'</button><button type="button" class="mt-nama" data-pilih="'+n.id+'"'+(a?' aria-current="true"':'')+'>'+titik(u)+'<span class="tx">'+esc(lbl||n.nama)+'</span><span class="mt-n'+(u.soal?'':' nol')+'">'+hitungTeks(u)+'</span></button></div>'}
  // ---------- Pencarian ----------
  function norm(s){return String(s||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')}
  function sorot(teks,terms){var low=teks.toLowerCase(),mark=new Array(teks.length+1).join('0').split('');
    terms.forEach(function(t){if(!t)return;var i=low.indexOf(t);while(i>-1){for(var k=i;k<i+t.length;k++)mark[k]='1';i=low.indexOf(t,i+t.length)}});
    var o='',on=false;for(var j=0;j<teks.length;j++){var m=mark[j]==='1';if(m&&!on){o+='<mark>';on=true}if(!m&&on){o+='</mark>';on=false}o+=esc(teks[j])}
    return o+(on?'</mark>':'')}
  function cari(q){var terms=norm(q).split(/\s+/).filter(Boolean),out=[];
    Object.keys(TAKSONOMI).forEach(function(k){var sn=TAKSONOMI[k].nama;
      TAKSONOMI[k].rumpun.forEach(function(r){
        var tp=topikTampak(r);
        function tambah(n,path,desk,tipe){var nama=norm(n.nama),hay=nama+' '+norm(path)+' '+norm(desk),ok=terms.every(function(t){return hay.indexOf(t)>-1});if(!ok)return;
          var skor=terms.every(function(t){return nama.indexOf(t)===0||nama.indexOf(' '+t)>-1})?0:terms.every(function(t){return nama.indexOf(t)>-1})?1:2;
          out.push({n:n,path:path,tipe:tipe,skor:skor*10+({rumpun:0,topik:1,sub:2}[tipe])})}
        tambah(idx[r.id],sn,'','rumpun');
        tp.forEach(function(t){tambah(idx[t.id],sn+' › '+r.nama,t.desk,'topik');
          t.sub.forEach(function(sb){tambah(idx[sb.id],sn+' › '+r.nama+' › '+t.nama,t.desk,'sub')})})})});
    out.sort(function(a,b){return a.skor-b.skor||a.n.nama.localeCompare(b.n.nama)});
    return {terms:terms,hasil:out}}
  function renderNav(){var el=$('mt-nav'),q=mt.q.trim(),T=TAKSONOMI[mt.s];
    if(q){var c=cari(q),sh=c.hasil.slice(0,40);lastHasil=sh;
      el.innerHTML=sh.length?'<div class="mt-info-cari">'+c.hasil.length+' hasil'+(c.hasil.length>sh.length?' (menampilkan '+sh.length+' teratas)':'')+'. Tekan Enter untuk membuka yang pertama.</div>'+sh.map(function(x){var u=ukur(x.n);
        return '<button type="button" class="mt-hasil" data-pilih="'+x.n.id+'">'+titik(u)+'<span><b>'+sorot(x.n.nama,c.terms)+'</b><small>'+esc(x.path)+' · '+hitungTeks(u)+'</small></span><span class="mt-tipe">'+({rumpun:'Rumpun',topik:'Topik',sub:'Subtopik'}[x.tipe])+'</span></button>'}).join(''):'<p class="muted mt-kosong">Tidak ada materi yang cocok dengan &ldquo;'+esc(q)+'&rdquo;.</p>';return}
    lastHasil=[];
    var out='<ul class="mt-tree" role="tree">';
    T.rumpun.forEach(function(r){var tp=r.topik.filter(function(t){return tampakTopik(r,t)}),um=idx[r.id+'.umum'],umOk=r.umum.length&&ukur(um).soal>0&&lolos(um);
      if(!tp.length&&!umOk&&filterAktif())return;
      var rn=idx[r.id],ob=mt.buka[r.id];
      out+='<li class="mt-r" role="treeitem">'+baris(rn,true);
      if(ob){out+='<ul>';tp.forEach(function(t){var tn=idx[t.id],tb=mt.buka[t.id];
          out+='<li class="mt-t" role="treeitem">'+baris(tn,t.sub.length>0);
          if(tb&&t.sub.length){out+='<ul>'+t.sub.map(function(sb){return '<li class="mt-s">'+baris(idx[sb.id],false)+'</li>'}).join('')+'</ul>'}
          out+='</li>'});
        if(umOk||(r.umum.length&&!filterAktif()&&ukur(um).soal>0))out+='<li class="mt-t">'+baris(um,false,'Belum diklasifikasikan')+'</li>';
        out+='</ul>'}
      out+='</li>'});
    el.innerHTML=out+'</ul>'+(out.indexOf('<li')<0?'<p class="muted mt-kosong">Tidak ada materi untuk filter ini.</p>':'')}
  // ---------- Detail kontekstual ----------
  function rantai(n){var a=[idx['s:'+n.s]];if(n.r)a.push(idx[n.r.id]);if(n.type==='sub'||n.type==='topik'){a.push(idx[n.t.id])}if(n.type==='sub'||n.type==='umum')a.push(n);return a}
  function crumbHTML(n){var a=rantai(n);
    return a.map(function(x,i){return i===a.length-1?'<span aria-current="page">'+esc(x.nama)+'</span>':'<button type="button" data-pilih="'+x.id+'">'+esc(x.nama)+'</button>'}).join('<span aria-hidden="true">›</span>')}
  function deskripsi(n){
    if(n.type==='subtes'){var rr=TAKSONOMI[n.s].rumpun.map(function(r){return topikTampak(r).length}).filter(Boolean).length;return 'Ringkasan seluruh materi '+n.nama+': '+rr+' rumpun, '+subDari(n).length+' subtopik.'}
    if(n.type==='rumpun'){var tp=topikTampak(n.r).map(function(t){return t.nama});return tp.length?'Mencakup '+tp.length+' topik: '+tp.slice(0,4).join(', ')+(tp.length>4?' dan '+(tp.length-4)+' lainnya':'')+'.':'Belum ada topik yang tampil di rumpun ini.'}
    if(n.type==='topik')return n.t.desk;
    if(n.type==='sub')return 'Subtopik dari topik “'+n.t.nama+'”. '+n.t.desk;
    return 'Soal dari topik lama yang belum dapat dipetakan ke topik atau subtopik secara meyakinkan. Soal tetap bisa dilatih.'}
  function distribusi(n){var subs=subDari(n);if(!subs.length)return '';
    var c={belum:0,sedang:0,perlu:0,dikuasai:0,kosong:0};subs.forEach(function(s){c[ukur(s).status]++});
    var tot=subs.length;
    if(c.kosong===tot)return '<p class="mt-alasan">Belum ada soal yang ditandai ke subtopik, jadi status subtopik belum tersedia. Status di atas dihitung dari kategori soal yang sudah ada.</p>';
    return '<div class="mt-bagian">Status '+tot+' subtopik</div><div class="mt-dist" role="img" aria-label="Distribusi status subtopik">'+['dikuasai','sedang','perlu','belum'].map(function(k){return c[k]?'<i class="st-'+k+'" style="width:'+(c[k]/tot*100)+'%"></i>':''}).join('')+'</div>'
      +'<div class="mt-legenda">'+['dikuasai','sedang','perlu','belum','kosong'].filter(function(k){return c[k]}).map(function(k){return '<span><span class="mt-dot st-'+k+'"></span>'+STATUS[k]+' '+c[k]+'</span>'}).join('')+'</div>'}
  function anakDari(n){
    if(n.type==='subtes')return TAKSONOMI[n.s].rumpun.filter(function(r){return topikTampak(r).length||ukur(idx[r.id]).soal}).map(function(r){return idx[r.id]});
    if(n.type==='rumpun'){var k=topikTampak(n.r).map(function(t){return idx[t.id]});var um=idx[n.r.id+'.umum'];if(n.r.umum.length&&ukur(um).soal>0)k.push(um);return k}
    if(n.type==='topik')return n.t.sub.map(function(sb){return idx[sb.id]});
    return []}
  // ===== Statistik per materi: ringkasan hasil, grafik perkembangan, dan akurasi per tingkat =====
  mt.gp='30';mt.gm='jumlah';
  function entriNode(n){var d=dasar();return d.R.filter(function(e){if(e.mapel!==n.s||!isFinite(e.t))return false;var x=d.by[e.mapel+'|'+e.id];
      return x?anggota(n,x):(n.type==='subtes'||(n.type!=='sub'&&n.legacy.indexOf(e.topik)>-1))}).map(function(e){var x=d.by[e.mapel+'|'+e.id];return {t:e.t,b:!!e.b,k:e.j===null||e.j===undefined,lv:x&&x.tingkatKesulitan}})}
  function statCard(n){var u=ukur(n),h='<div class="card st-kartu"><b>Statistik</b>';
    if(!u.soal)return h+'<p class="muted" style="margin:6px 0 0">Statistik muncul setelah materi ini punya soal.</p></div>';
    var E=entriNode(n);
    if(!E.length)return h+'<div class="gr-kosong"><svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg><b>Belum ada pengerjaan di materi ini.</b><p class="muted">Kerjakan soalnya dan grafik perkembanganmu akan muncul di sini.</p></div></div>';
    var tot=E.length,bn=E.filter(function(e){return !e.k&&e.b}).length,sl=E.filter(function(e){return !e.k&&!e.b}).length,ko=E.filter(function(e){return e.k}).length,pc=function(v){return Math.round(v/tot*100)};
    h+='<div class="st-bar" role="img" aria-label="Benar '+bn+', salah '+sl+', kosong '+ko+'">'+(bn?'<i class="st-b" style="width:'+(bn/tot*100)+'%"></i>':'')+(sl?'<i class="st-s" style="width:'+(sl/tot*100)+'%"></i>':'')+(ko?'<i class="st-k" style="width:'+(ko/tot*100)+'%"></i>':'')+'</div>'
      +'<div class="st-legend"><span class="lg-b">Benar '+bn+' ('+pc(bn)+'%)</span><span class="lg-s">Salah '+sl+' ('+pc(sl)+'%)</span>'+(ko?'<span class="lg-k">Kosong '+ko+'</span>':'')+'</div>'
      +'<div class="gr-ctrl"><div class="seg" role="group" aria-label="Periode">'+[['7','7 Hari'],['30','30 Hari'],['semua','Semua Waktu']].map(function(p){return '<button type="button" data-sp="'+p[0]+'" aria-pressed="'+(mt.gp===p[0])+'">'+p[1]+'</button>'}).join('')+'</div>'
      +'<div class="seg" role="group" aria-label="Metrik">'+[['jumlah','Percobaan'],['akurasi','Akurasi']].map(function(p){return '<button type="button" data-sm="'+p[0]+'" aria-pressed="'+(mt.gm===p[0])+'">'+p[1]+'</button>'}).join('')+'</div></div>'
      +'<div id="st-grafik" class="grafik"></div>';
    var lv=['mudah','sedang','sulit'].map(function(k){var a=E.filter(function(e){return e.lv===k});if(!a.length)return '';var b=a.filter(function(e){return !e.k&&e.b}).length,ac=Math.round(b/a.length*100);
      return '<div class="st-lv"><span>'+k.charAt(0).toUpperCase()+k.slice(1)+'</span><div class="progress" role="progressbar" aria-valuenow="'+ac+'" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:'+ac+'%"></div></div><b>'+ac+'% <small>('+a.length+')</small></b></div>'}).join('');
    if(lv)h+='<p class="label" style="margin-bottom:4px">Akurasi per tingkat kesulitan</p>'+lv;
    return h+'<p class="mt-info-bawah">Dihitung dari riwayat terbaru (maks. 600 percobaan). Angka dalam kurung adalah jumlah percobaan.</p></div>'}
  function tglKey(d){return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate()}
  function lukisStat(n){var el=$('st-grafik');if(!el||!n)return;var E=entriNode(n);if(!E.length){el.innerHTML='';return}
    var per={};E.forEach(function(e){var k=tglKey(new Date(e.t)),o=per[k]||(per[k]={n:0,b:0});o.n++;if(!e.k&&e.b)o.b++});
    var hi=new Date();hi.setHours(0,0,0,0);var aw=new Date(hi);
    if(mt.gp==='semua'){aw=new Date(Math.min.apply(null,E.map(function(e){return e.t})));aw.setHours(0,0,0,0)}else aw.setDate(aw.getDate()-(Number(mt.gp)-1));
    var pts=[];for(var d=new Date(aw);d<=hi;d.setDate(d.getDate()+1)){var o=per[tglKey(d)]||{n:0,b:0};pts.push({d:new Date(d),n:o.n,b:o.b,acc:o.n?Math.round(o.b/o.n*100):null})}
    var m=mt.gm,val=function(p){return m==='jumlah'?p.n:p.acc},ada=pts.filter(function(p){return m==='akurasi'?p.acc!==null:p.n>0});
    if(!ada.length){el.innerHTML='<p class="muted" style="text-align:center;padding:24px 0">Belum ada pengerjaan di periode ini. Pilih periode yang lebih panjang.</p>';return}
    var W=Math.max(260,el.clientWidth||320),H=200,pl=32,pr=10,pt=12,pb=26,ymax=m==='akurasi'?100:Math.max(4,Math.ceil(Math.max.apply(null,pts.map(function(p){return p.n}))*1.15));
    var X=function(i){return pl+(pts.length===1?(W-pl-pr)/2:i*(W-pl-pr)/(pts.length-1))},Y=function(v){return pt+(H-pt-pb)*(1-v/ymax)};
    var ix=[];pts.forEach(function(p,i){if(m==='akurasi'?p.acc!==null:true)ix.push(i)});
    var path='';ix.forEach(function(i,k){var x=X(i),y=Y(val(pts[i]));if(!k)path='M'+x+' '+y;else{var px=X(ix[k-1]),py=Y(val(pts[ix[k-1]])),mx=(px+x)/2;path+=' C'+mx+' '+py+' '+mx+' '+y+' '+x+' '+y}});
    var base=H-pb,area=ix.length>1?path+' L'+X(ix[ix.length-1])+' '+base+' L'+X(ix[0])+' '+base+' Z':'',grid='';
    for(var g=0;g<=4;g++){var v=ymax*g/4,y=Y(v);grid+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+y+'" y2="'+y+'" stroke="var(--border)"/><text x="'+(pl-6)+'" y="'+(y+4)+'" text-anchor="end" font-size="10.5" fill="var(--muted)">'+Math.round(v)+(m==='akurasi'?'%':'')+'</text>'}
    var st=Math.ceil(pts.length/Math.max(2,Math.floor((W-pl-pr)/62))),lb='';
    pts.forEach(function(p,i){if(i%st===0)lb+='<text x="'+X(i)+'" y="'+(H-8)+'" text-anchor="middle" font-size="10.5" fill="var(--muted)">'+p.d.toLocaleDateString('id-ID',{day:'numeric',month:'short'})+'</text>'});
    var dots=pts.length<=45?ix.map(function(i){return '<circle cx="'+X(i)+'" cy="'+Y(val(pts[i]))+'" r="3.5" fill="var(--card)" stroke="var(--primary)" stroke-width="2"/>'}).join(''):'';
    el.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" height="'+H+'" role="img" aria-label="Grafik '+(m==='jumlah'?'percobaan':'akurasi')+' per hari untuk '+esc(n.nama)+'">'+grid+(area?'<path d="'+area+'" fill="var(--primary)" fill-opacity=".12"/>':'')+'<path d="'+path+'" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>'+dots+lb+'<circle id="st-hov" r="5" fill="var(--primary)" stroke="#fff" stroke-width="2" display="none"/></svg><div class="gr-tip" id="st-tip" hidden></div>';
    var svg=el.querySelector('svg'),tip=$('st-tip'),hov=$('st-hov');
    var tunjuk=function(ev){var rc=svg.getBoundingClientRect(),x=(ev.clientX-rc.left)/rc.width*W,b=0,jb=1e9;pts.forEach(function(p,i){var j=Math.abs(X(i)-x);if(j<jb){jb=j;b=i}});
      var p=pts[b];tip.innerHTML='<b>'+p.d.toLocaleDateString('id-ID',{weekday:'short',day:'numeric',month:'short'})+'</b><br>'+(p.n?p.n+' percobaan · '+p.acc+'% benar':'Tidak ada pengerjaan');tip.hidden=false;
      var v=val(p);if(v!==null){hov.setAttribute('cx',X(b));hov.setAttribute('cy',Y(v));hov.removeAttribute('display')}else hov.setAttribute('display','none');
      tip.style.left=Math.min(Math.max(X(b)/W*rc.width,70),rc.width-70)+'px'};
    svg.addEventListener('pointermove',tunjuk);svg.addEventListener('pointerdown',tunjuk);svg.addEventListener('pointerleave',function(){tip.hidden=true;hov.setAttribute('display','none')})}
  $('mt-detail').addEventListener('click',function(e){var a=e.target.closest('[data-sp]'),b=e.target.closest('[data-sm]');if(!a&&!b)return;
    if(a)mt.gp=a.dataset.sp;if(b)mt.gm=b.dataset.sm;
    document.querySelectorAll('#mt-detail [data-sp]').forEach(function(x){x.setAttribute('aria-pressed',String(x.dataset.sp===mt.gp))});
    document.querySelectorAll('#mt-detail [data-sm]').forEach(function(x){x.setAttribute('aria-pressed',String(x.dataset.sm===mt.gm))});
    lukisStat(idx[mt.sel]||idx['s:'+mt.s])});
  var _rs=null;window.addEventListener('resize',function(){clearTimeout(_rs);_rs=setTimeout(function(){if(!$('materi').hidden)lukisStat(idx[mt.sel]||idx['s:'+mt.s])},150)});
  function renderDetail(){var el=$('mt-detail'),n=idx[mt.sel]||idx['s:'+mt.s],u=ukur(n);
    var nsub=(n.type==='subtes'||n.type==='rumpun'||n.type==='topik')?subDari(n).length:null,ntop=n.type==='rumpun'?topikTampak(n.r).length:n.type==='subtes'?TAKSONOMI[n.s].rumpun.reduce(function(a,r){return a+topikTampak(r).length},0):null;
    var h='<button type="button" class="mt-balik" id="mt-balik">&lsaquo; Kembali ke daftar materi</button><div class="card"><div class="mt-crumb">'+crumbHTML(n)+'</div>'
      +'<h3 class="mt-judul">'+esc(n.nama)+(n.rel?'<span class="mt-rel">'+REL[n.rel]+'</span>':'')+'<span class="mt-badge st-'+u.status+'">'+STATUS[u.status]+'</span></h3>'
      +'<p class="mt-desk">'+esc(deskripsi(n))+'</p>'
      +'<div class="mt-metrik">'+(ntop!==null?'<div><b>'+ntop+'</b><span>Topik</span></div>':'')+(nsub!==null?'<div><b>'+nsub+'</b><span>Subtopik</span></div>':'')
      +'<div><b>'+u.soal+'</b><span>Soal tersedia</span></div><div><b>'+u.uniq+' / '+u.soal+'</b><span>Soal unik dikerjakan</span></div><div><b>'+u.n+'</b><span>Percobaan (termasuk pengulangan)</span></div><div><b>'+(u.n?u.acc+'%':'–')+'</b><span>Akurasi percobaan</span></div></div>'
      +(u.soal?'<div class="mt-prog"><span>Cakupan soal</span><div class="progress" role="progressbar" aria-valuenow="'+u.cov+'" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:'+u.cov+'%"></div></div><b>'+u.cov+'%</b></div>':'')
      +'<p class="mt-alasan"><b>'+STATUS[u.status]+'.</b> '+esc(alasan(u))+'</p>'
      +distribusi(n)
      +(u.soal?'<button type="button" class="btn btn-primary" id="mt-latih">Mulai Latihan</button>':'<button type="button" class="btn btn-primary" disabled>Mulai Latihan</button><p class="muted" style="margin:8px 0 0">'+(n.type==='sub'?'Belum ada soal yang ditandai untuk subtopik ini.':'Belum ada soal yang terhubung ke materi ini.')+'</p>')
      +'<p class="mt-info-bawah">Statistik dihitung dari riwayat terbaru (maks. 600 percobaan). Struktur materi disusun Nalarin, bukan kisi-kisi resmi SNPMB.</p></div>';
    h+=statCard(n);
    var kids=anakDari(n);
    if(kids.length){h+='<div class="card"><b>'+(n.type==='subtes'?'Progres per rumpun':n.type==='rumpun'?'Progres per topik':'Progres per subtopik')+'</b><ul class="mt-daftar">'+kids.map(function(k){var kk=ukur(k);
      return '<li><button type="button" class="mt-anak" data-pilih="'+k.id+'" data-buka="1"><span class="mt-anak-nama">'+esc(k.type==='umum'?'Belum diklasifikasikan':k.nama)+'</span><span class="mt-badge st-'+kk.status+'">'+STATUS[kk.status]+'</span><span class="mt-anak-meta">'+(kk.soal?kk.uniq+'/'+kk.soal+' soal dikerjakan'+(kk.n?' · akurasi '+kk.acc+'% ('+kk.n+' percobaan)':''):'Belum ada soal')+'</span>'+(kk.soal?'<span class="progress"><span class="progress-bar" style="width:'+kk.cov+'%"></span></span>':'')+'</button></li>'}).join('')+'</ul></div>'}
    else if(n.type==='topik')h+='<div class="card"><p class="muted" style="margin:0">Subtopik untuk topik ini belum disusun.</p></div>';
    h+='<div class="card mt-cara"><details><summary>Cara status dihitung</summary><ul><li><b>Belum Dipelajari</b>: ada soal, belum pernah dikerjakan.</li><li><b>Berkembang</b>: sudah dikerjakan dan akurasinya cukup, tetapi belum memenuhi kriteria Dikuasai.</li><li><b>Perlu Penguatan</b>: minimal '+MIN_PERLU+' percobaan dengan akurasi di bawah '+AKU_PERLU+'%.</li><li><b>Dikuasai</b>: minimal '+MIN_KUASAI+' percobaan, akurasi '+AKU_KUASAI+'% ke atas, pada minimal '+MIN_UNIK+' soal berbeda.</li><li>Soal unik dan percobaan dihitung terpisah: mengulang soal yang sama menambah percobaan, bukan soal unik.</li></ul></details></div>';
    el.innerHTML=h;lukisStat(n)}
  var CAK=[['semua','Semua materi'],['soal','Materi dengan soal']],STF=[['belum','Belum dipelajari'],['sedang','Berkembang'],['perlu','Perlu penguatan'],['dikuasai','Dikuasai']];
  function filterUI(){
    var cak=CAK.map(function(f){return '<button type="button" role="radio" aria-checked="'+(mt.f===f[0])+'" aria-pressed="'+(mt.f===f[0])+'" data-cak="'+f[0]+'">'+f[1]+'</button>'}).join('');
    var st=STF.map(function(f){return '<button type="button" class="flt-btn" data-st="'+f[0]+'" aria-pressed="'+(mt.st===f[0])+'"><span class="flt-dot" aria-hidden="true"></span>'+f[1]+'</button>'}).join('');
    var tag='';
    if(mt.f!=='semua')tag+='<span class="flt-tag">'+esc(CAK[1][1])+'<button type="button" data-mt-hapus="cak" aria-label="Hapus filter '+esc(CAK[1][1])+'">&times;</button></span>';
    if(mt.st){var nm=STF.filter(function(f){return f[0]===mt.st})[0][1];tag+='<span class="flt-tag">'+esc(nm)+'<button type="button" data-mt-hapus="st" aria-label="Hapus filter '+esc(nm)+'">&times;</button></span>'}
    $('mt-filter').innerHTML='<div class="flt-grup"><span class="flt-label">Cakupan materi</span><div class="seg" role="radiogroup" aria-label="Cakupan materi">'+cak+'</div></div>'
      +'<div class="flt-grup"><span class="flt-label">Status penguasaan</span><div class="flt-baris" role="group" aria-label="Status penguasaan">'+st+'</div></div>'
      +(tag?'<div class="flt-aktif"><span>Filter aktif:</span>'+tag+'<button type="button" class="flt-reset" data-mt-reset>Reset filter</button></div>':'')}
  function render(){cache={};base=null;$('materi').dataset.sheet=mt.sheet?'1':'0';filterUI();renderNav();renderDetail();
    document.querySelectorAll('#mt-subtes button').forEach(function(b){b.setAttribute('aria-pressed',String(b.dataset.s===mt.s))});
    var a=document.querySelector('#mt-nav .mt-row.aktif');if(a&&a.scrollIntoView)a.scrollIntoView({block:'nearest'})}
  window.renderMateri=render;
  function pilih(id,buka){var n=idx[id];if(!n)return;mt.s=n.s;mt.q='';$('mt-cari').value='';
    if(n.type==='subtes'){mt.sel=null;mt.sheet=false;render();return}
    mt.sel=id;
    [n.r&&n.r.id,n.t&&n.t.id].forEach(function(x){if(x&&(x!==id||buka))mt.buka[x]=true});
    if(n.type==='rumpun'||n.type==='topik')mt.buka[id]=true;mt.sheet=true;render();$('mt-detail').scrollTop=0;if(window.innerWidth<760)window.scrollTo(0,0)}
  $('materi').addEventListener('click',function(e){
    var tg=e.target.closest('[data-tog]');if(tg){mt.buka[tg.dataset.tog]=!mt.buka[tg.dataset.tog];renderNav();return}
    var pl=e.target.closest('[data-pilih]');if(pl){pilih(pl.dataset.pilih,!!pl.dataset.buka);return}
    if(e.target.closest('#mt-balik')){mt.sheet=false;render();return}
    var sb=e.target.closest('#mt-subtes [data-s]');if(sb){mt.s=sb.dataset.s;mt.sel=null;mt.sheet=false;mt.q='';$('mt-cari').value='';render();return}
    if(e.target.closest('#mt-latih'))mulaiMateri(mt.sel||('s:'+mt.s))});
  $('mt-cari').addEventListener('input',function(){mt.q=this.value;renderNav()});
  $('mt-cari').addEventListener('keydown',function(e){
    if(e.key==='Enter'&&lastHasil.length){e.preventDefault();pilih(lastHasil[0].n.id)}
    else if(e.key==='Escape'&&this.value){this.value='';mt.q='';renderNav()}});
  $('mt-filter').addEventListener('click',function(e){
    var c=e.target.closest('[data-cak]'),t=e.target.closest('[data-st]'),h=e.target.closest('[data-mt-hapus]'),r=e.target.closest('[data-mt-reset]'),fok=null;
    if(c){mt.f=c.dataset.cak;fok='[data-cak="'+c.dataset.cak+'"]'}
    else if(t){mt.st=mt.st===t.dataset.st?'':t.dataset.st;fok='[data-st="'+t.dataset.st+'"]'}
    else if(h){if(h.dataset.mtHapus==='cak')mt.f='semua';else mt.st=''}
    else if(r){mt.f='semua';mt.st=''}
    else return;
    render();var el=fok&&$('mt-filter').querySelector(fok);if(el)el.focus()});
  function mulaiMateri(id){var n=idx[id];if(!n)return;
    window._dariMateri=true;tampil('setup');
    document.querySelectorAll('input[name="sumber"]').forEach(function(i){i.checked=i.value==='semua'});
    document.querySelectorAll('input[name="mapel"]').forEach(function(i){i.checked=i.value===n.s});
    buatTopik();
    document.querySelectorAll('#pilih-topik input[data-tp]').forEach(function(i){i.checked=n.type==='subtes'?true:(i.value===n.nama||n.legacy.indexOf(i.value)>-1)});
    document.querySelectorAll('#pilih-topik input[data-sub]').forEach(function(i){i.checked=n.type==='sub'?i.dataset.sub===n.id:true});
    if(n.type==='sub'){var ptp=topikTaxById(n.id.slice(0,n.id.lastIndexOf('.')));
      if(ptp)document.querySelectorAll('#pilih-topik input[data-tp]').forEach(function(i){i.checked=i.value===ptp.topik.nama});
      var cb=document.querySelector('#pilih-topik input[data-sub="'+n.id+'"]'),bl=cb&&cb.closest('.tp-blok');
      if(bl){bl.classList.add('buka');bl.querySelector('.sb-isi').hidden=false}}
    document.querySelectorAll('#pilih-topik .tp-blok').forEach(labelSub);
    window._subAktif=null;
    var si=$('sub-info');si.hidden=!window._subAktif;if(window._subAktif)si.innerHTML='<span>Filter subtopik aktif: <b>'+esc(n.nama)+'</b></span><button type="button" class="tp-link" id="sub-hapus">Hapus filter</button>';
    document.querySelectorAll('#pilih-topik label,#pilih-topik .tp-blok').forEach(function(l){l.hidden=false});
    hitungSoal();ringkasSesi();$('pilih-topik').dispatchEvent(new Event('change',{bubbles:true}))}
  $('sub-info').addEventListener('click',function(e){if(e.target.id==='sub-hapus'){window._subAktif=null;this.hidden=true;hitungSoal();ringkasSesi()}});
  document.querySelectorAll('.nav-link[data-hal="materi"]').forEach(function(a){a.addEventListener('click',function(){mt.sheet=false;render();tampil('materi')})});
  $('btn-materi').addEventListener('click',function(){mt.sheet=false;render();tampil('materi')});
  window._mt=function(){return {idx:idx,ukur:ukur,mt:mt,reset:function(){cache={};base=null},mulai:mulaiMateri,K:{MIN_PERLU:MIN_PERLU,AKU_PERLU:AKU_PERLU,MIN_KUASAI:MIN_KUASAI,AKU_KUASAI:AKU_KUASAI}}};
})();

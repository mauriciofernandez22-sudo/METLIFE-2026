/* =========================================================
   Centro de control · Proyecto MetLife 2026
   Los datos se guardan en Firebase; ver firebase.js
   ========================================================= */
import './styles.css';
import { DATA } from './data.js';
import {
  store, estado, usuario, hayFirebase,
  entrar, salir, alCambiarSesion, vigilar, PROYECTO
} from './firebase.js';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const TIPOS = ['Presencial Hotel','Obligatorio Sence Presencial','Obligatorio Sence Webex','Webinar'];
const PAGOS = ['SENCE','Relatoría','CeCo','Otro'];
const KEYS  = ['metlife2026:talleres','metlife2026:generaciones','metlife2026:oc','metlife2026:costos'];
const CKEY  = 'metlife2026:costos';

/* ---------- utilidades ---------- */
const clp  = n => (n||n===0) ? '$'+Math.round(n).toLocaleString('es-CL') : '—';
const kclp = n => '$'+(n/1e6).toFixed(1).replace('.',',')+'M';
const numf = n => (n||n===0) ? Math.round(n).toLocaleString('es-CL') : '—';
const esc  = s => String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const el   = (t,a={},h='')=>{const e=document.createElementNS('http://www.w3.org/2000/svg',t);
  for(const k in a) e.setAttribute(k,a[k]); if(h) e.textContent=h; return e;};
function niceMax(v){const e=Math.pow(10,Math.floor(Math.log10(v)));
  for(const m of [1,1.25,1.5,2,2.5,3,4,5,6,8,10,12,16,20]){if(m*e>=v*1.02)return m*e;} return v*1.1;}
function halo(t){t.setAttribute('stroke','#fff');t.setAttribute('stroke-width','3.2');
  t.setAttribute('paint-order','stroke');t.setAttribute('stroke-linejoin','round');return t;}
function idxMes(s){const m=String(s||'').trim().toLowerCase();
  for(let i=0;i<12;i++) if(m.startsWith(MESES[i].toLowerCase())) return i; return -1;}
const M26 = i => MESES[i]+' 2026';
let toastT;
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('on');
  clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),1900);}

/* ---------- almacenamiento ---------- */
/* store, sesión y estado viven en firebase.js; aquí solo se usan */
let horaGuardado=null, statusT;
function pintarStatus(){
  const d=document.getElementById('dot'), t=document.getElementById('statusTxt');
  if(!d||!t) return;
  if(!usuario.actual && hayFirebase){ d.classList.add('off'); t.textContent='Sin sesión iniciada'; return; }
  if(estado.modo==='local'){ d.classList.add('off');
    t.textContent = hayFirebase ? 'Sin conexión · guardado en este equipo' : 'Guardado en este navegador';
    return; }
  d.classList.remove('off');
  t.textContent = horaGuardado ? `Guardado a las ${horaGuardado}` : 'Guardado automático activo';
}
function marcarGuardado(ok){
  if(!ok) return;
  horaGuardado = new Date().toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit',hour12:false});
  const t=document.getElementById('statusTxt'); if(!t) return;
  t.textContent='Guardando…'; clearTimeout(statusT); statusT=setTimeout(pintarStatus,500);
}
/* el store de firebase.js no avisa a la interfaz: se envuelve para eso */
const storeBase = store;
const storeUI = {
  get: k => storeBase.get(k),
  set: async (k,v) => { const ok = await storeBase.set(k,v); marcarGuardado(ok); return ok; }
};

async function descargarRespaldo(){
  const datos={}; for(const k of KEYS){ const v=await storeUI.get(k); if(v!=null) datos[k]=v; }
  const blob=new Blob([JSON.stringify({app:'metlife2026',version:2,fecha:new Date().toISOString(),datos},null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download='MetLife_2026_respaldo_'+new Date().toISOString().slice(0,10)+'.json';
  a.click(); URL.revokeObjectURL(a.href); toast('Respaldo descargado');
}
function cargarRespaldo(file){
  const fr=new FileReader();
  fr.onload=async()=>{
    try{
      const j=JSON.parse(fr.result);
      if(!j || j.app!=='metlife2026' || !j.datos) throw new Error('formato');
      for(const k of KEYS) if(j.datos[k]!=null) await storeUI.set(k,j.datos[k]);
      await recargarTodo(); toast('Respaldo restaurado');
    }catch(e){ toast('El archivo no es un respaldo válido'); }
  };
  fr.readAsText(file);
}

/* =========================================================
   ESTADO Y DERIVADOS
   ========================================================= */
let COST=null, TAL=[], GEN=[], OC=[], yrActual=2026;
const base2025 = DATA.base2025;   // {total:[12], pax:[12]} — histórico, solo lectura

function seedCost(){
  const pad=a=>{const b=a.map(v=>+v||0); while(b.length<24)b.push(0); return b;};
  return {
    conc: DATA.conceptos.map(c=>({concepto:c.concepto,pago:c.pago,auto:c.auto||null,vals:pad(c.vals)})),
    activos:{2025:12, 2026:DATA.mesesConDatos2026}
  };
}
/* asesores por mes: se ingresan en Generaciones (headcount único de la generación) */
function paxMes(i){ const g=genMes(i); return g ? (+g.ases||0) : 0; }
/* asistencias por mes: suma de talleres — puede repetir personas entre sesiones */
function asistMes(i){ return TAL.reduce((a,t)=>a+(idxMes(t.mes)===i && t.est==='Realizado' ? (+t.pax||0) : 0),0); }
function tallMes(i){ return TAL.filter(t=>idxMes(t.mes)===i).length; }
/* montos que vienen de Generaciones */
function genMes(i){ return GEN.find(g=>idxMes(g.gen)===i) || null; }
function autoMonto(tipo,i){ const g=genMes(i); if(!g) return 0; return +(tipo==='books'?g.mBooks:g.mKits)||0; }
/* facturación desde OC */
function factMes(i){ return OC.reduce((a,o)=>a+(idxMes(o.mes)===i ? (+o.monto||0) : 0),0); }

function valConc(c,y,i){
  if(y===2026 && c.auto) return autoMonto(c.auto,i);
  return +c.vals[(y===2026?12:0)+i] || 0;
}
function totalMes(y,i){ return COST.conc.reduce((a,c)=>a+valConc(c,y,i),0); }
function nMeses2026(){
  const ultimoTaller = TAL.reduce((mx,t)=>Math.max(mx, idxMes(t.mes)),-1);
  const ultimaGen    = GEN.reduce((mx,g)=>Math.max(mx, (+g.ases>0? idxMes(g.gen):-1)),-1);
  const ultimaOC     = OC.reduce((mx,o)=>Math.max(mx, (+o.monto>0? idxMes(o.mes):-1)),-1);
  return Math.max(COST.activos[2026], ultimoTaller+1, ultimaGen+1, ultimaOC+1, 1);
}
let d2025=[], d2026=[];
function recalc(){
  d2025 = MESES.map((mes,i)=>({mes,anio:2025,total:base2025.total[i],pax:base2025.pax[i],
    fact:(base2025.fact||[])[i]||0}));
  const n=nMeses2026();
  d2026 = MESES.slice(0,n).map((mes,i)=>({mes,anio:2026,total:totalMes(2026,i),pax:paxMes(i),
    asist:asistMes(i),tall:tallMes(i),fact:factMes(i)}));
}


/* talleres SENCE dentro de la matriz de costos */
function senceMes(i){ return COST.conc.reduce((a,c)=>a+(/^Taller SENCE/.test(c.concepto)?valConc(c,2026,i):0),0); }

/* =========================================================
   GRÁFICOS
   ========================================================= */
function chartMensual(){
  const s=document.getElementById('chMens'); s.innerHTML='';
  const W=980,H=330,L=64,R=26,T=18,B=46, pw=W-L-R, ph=H-T-B;
  const max=niceMax(Math.max(1,...d2025.map(m=>m.total),...d2026.map(m=>m.total)));
  const maxPax=Math.max(1,...d2025.map(m=>m.pax),...d2026.map(m=>m.pax))*1.35;
  const step=pw/12, bw=Math.min(15,step*0.26);
  for(let i=0;i<=4;i++){
    const y=T+ph-(ph*i/4);
    s.appendChild(el('line',{x1:L,x2:W-R,y1:y,y2:y,stroke:i?'#eef2f8':'#dde6f2','stroke-width':1}));
    s.appendChild(el('text',{x:L-10,y:y+4,'text-anchor':'end','font-size':10.5,fill:'#8ea4c0'},'$'+(max*i/4/1e6).toFixed(0)+'M'));
  }
  MESES.forEach((m,i)=>{
    const cx=L+step*i+step/2, a=d2025[i], b=d2026[i];
    if(a&&a.total){const h=ph*a.total/max;s.appendChild(el('rect',{x:cx-bw-2,y:T+ph-h,width:bw,height:h,rx:3,fill:'#c3d0e6'}));}
    if(b&&b.total){const h=ph*b.total/max;s.appendChild(el('rect',{x:cx+2,y:T+ph-h,width:bw,height:h,rx:3,fill:'#3964FF'}));
      s.appendChild(halo(el('text',{x:cx+2+bw/2,y:T+ph-h-7,'text-anchor':'middle','font-size':9.5,'font-weight':600,fill:'#3964FF'},kclp(b.total))));}
    s.appendChild(el('text',{x:cx,y:H-24,'text-anchor':'middle','font-size':10.5,fill:'#46587a'},m.slice(0,3)));
  });
  const con=d2026.filter(m=>m.pax>0);
  if(con.length){
    const pts=d2026.map((m,i)=>[L+step*i+step/2, T+ph-(ph*m.pax/maxPax)]);
    s.appendChild(el('polyline',{points:pts.map(p=>p.join(',')).join(' '),fill:'none',stroke:'#00CCCC','stroke-width':2.2,'stroke-linejoin':'round'}));
    pts.forEach((p,i)=>{
      s.appendChild(el('circle',{cx:p[0],cy:p[1],r:3.6,fill:'#fff',stroke:'#00CCCC','stroke-width':2.2}));
      if(d2026[i].pax) s.appendChild(halo(el('text',{x:p[0],y:p[1]-11,'text-anchor':'middle','font-size':9.5,'font-weight':700,fill:'#0a7f88'},d2026[i].pax)));
    });
  }
}
function chartPerCapita(){
  const s=document.getElementById('chPer'); s.innerHTML='';
  const W=620,H=300,L=64,R=20,T=18,B=42, pw=W-L-R, ph=H-T-B;
  const v25=d2025.map(m=>m.pax?m.total/m.pax:0), v26=d2026.map(m=>m.pax?m.total/m.pax:0);
  const max=niceMax(Math.max(1,...v25,...v26)), step=pw/11;
  for(let i=0;i<=4;i++){
    const y=T+ph-(ph*i/4);
    s.appendChild(el('line',{x1:L,x2:W-R,y1:y,y2:y,stroke:i?'#eef2f8':'#dde6f2'}));
    s.appendChild(el('text',{x:L-9,y:y+4,'text-anchor':'end','font-size':10,fill:'#8ea4c0'},'$'+Math.round(max*i/4/1000)+'k'));
  }
  MESES.forEach((m,i)=>s.appendChild(el('text',{x:L+step*i,y:H-22,'text-anchor':'middle','font-size':10,fill:'#46587a'},m.slice(0,3))));
  const line=(vals,color,w,dash)=>{
    const pts=vals.map((v,i)=>[L+step*i, T+ph-(ph*v/max)]).filter((p,i)=>vals[i]>0);
    if(!pts.length) return [];
    const p=el('polyline',{points:pts.map(q=>q.join(',')).join(' '),fill:'none',stroke:color,'stroke-width':w,'stroke-linejoin':'round','stroke-linecap':'round'});
    if(dash)p.setAttribute('stroke-dasharray',dash);
    s.appendChild(p);
    pts.forEach(q=>s.appendChild(el('circle',{cx:q[0],cy:q[1],r:3.2,fill:'#fff',stroke:color,'stroke-width':2})));
    return pts;
  };
  line(v25,'#c3d0e6',2.2,'5 4');
  const p26=line(v26,'#3964FF',2.6);
  if(p26.length){
    const last=p26[p26.length-1], ult=v26.filter(v=>v>0).pop();
    s.appendChild(halo(el('text',{x:last[0]+9,y:last[1]+4,'text-anchor':'start','font-size':11,'font-weight':700,fill:'#3964FF'},clp(ult))));
  }
}
function chartFact(){
  const s=document.getElementById('chFact'); if(!s) return; s.innerHTML='';
  const W=980,H=300,L=66,R=24,T=16,B=44, pw=W-L-R, ph=H-T-B;
  const n=d2026.length;
  const inv=d2026.map(m=>m.total), fac=d2026.map(m=>m.fact);
  const max=niceMax(Math.max(1,...inv,...fac));
  const step=pw/12, bw=Math.min(17,step*0.3);
  for(let i=0;i<=4;i++){
    const y=T+ph-(ph*i/4);
    s.appendChild(el('line',{x1:L,x2:W-R,y1:y,y2:y,stroke:i?'#eef2f8':'#dde6f2'}));
    s.appendChild(el('text',{x:L-10,y:y+4,'text-anchor':'end','font-size':10.5,fill:'#8ea4c0'},'$'+(max*i/4/1e6).toFixed(0)+'M'));
  }
  MESES.forEach((m,i)=>{
    const cx=L+step*i+step/2;
    if(i<n){
      if(fac[i]){const hh=ph*fac[i]/max;s.appendChild(el('rect',{x:cx-bw-2,y:T+ph-hh,width:bw,height:hh,rx:3,fill:'#1FA97A'}));
        s.appendChild(halo(el('text',{x:cx-bw/2-2,y:T+ph-hh-7,'text-anchor':'middle','font-size':9,'font-weight':600,fill:'#0f7a58'},kclp(fac[i]))));}
      if(inv[i]){const hh=ph*inv[i]/max;s.appendChild(el('rect',{x:cx+2,y:T+ph-hh,width:bw,height:hh,rx:3,fill:'#3964FF'}));
        s.appendChild(halo(el('text',{x:cx+2+bw/2,y:T+ph-hh-7,'text-anchor':'middle','font-size':9,'font-weight':600,fill:'#3964FF'},kclp(inv[i]))));}
    }
    s.appendChild(el('text',{x:cx,y:H-22,'text-anchor':'middle','font-size':10.5,fill:i<n?'#46587a':'#b7c5da'},m.slice(0,3)));
  });
}

function chartConceptos(){
  const s=document.getElementById('chConc'); s.innerHTML='';
  const n=d2026.length;
  const tot=COST.conc.map(c=>({n:c.concepto||'(sin nombre)',
      v:[...Array(n)].reduce((a,_,i)=>a+valConc(c,2026,i),0)}))
    .filter(c=>c.v>0).sort((a,b)=>b.v-a.v);
  if(!tot.length){ s.setAttribute('viewBox','0 0 460 60');
    s.appendChild(el('text',{x:12,y:34,'font-size':12,fill:'#8ea4c0'},'Sin montos cargados para 2026.')); return; }
  const sum=tot.reduce((a,b)=>a+b.v,0), max=tot[0].v;
  const W=460,L=132,R=16,T=10, rh=25, bw=W-L-R;
  s.setAttribute('viewBox','0 0 '+W+' '+(T+rh*tot.length+6));
  tot.forEach((c,i)=>{
    const y=T+i*rh;
    s.appendChild(el('text',{x:L-10,y:y+rh/2+3.5,'text-anchor':'end','font-size':10.5,fill:'#46587a'},c.n));
    s.appendChild(el('rect',{x:L,y:y+2,width:bw,height:rh-8,rx:4,fill:'#f3f7fc'}));
    const w=Math.max(2,bw*c.v/max);
    s.appendChild(el('rect',{x:L,y:y+2,width:w,height:rh-8,rx:4,fill:i<3?'#3964FF':(i<6?'#5f83ff':'#a9bdf0')}));
    const inside=w>92;
    s.appendChild(el('text',{x:inside?L+w-8:L+w+8,y:y+rh/2+3.5,'text-anchor':inside?'end':'start',
      'font-size':10,'font-weight':600,fill:inside?'#fff':'#46587a'},kclp(c.v)+' · '+(c.v/sum*100).toFixed(0)+'%'));
  });
}

/* =========================================================
   RESUMEN
   ========================================================= */
function renderResumen(){
  const n=d2026.length;
  const t26=d2026.reduce((a,b)=>a+b.total,0), p26=d2026.reduce((a,b)=>a+b.pax,0);
  const f26=d2026.reduce((a,b)=>a+b.fact,0);
  const conPax=d2026.filter(m=>m.pax>0);
  const invPax=conPax.reduce((a,b)=>a+b.total,0);
  const t25p=d2025.slice(0,n).reduce((a,b)=>a+b.total,0), p25p=d2025.slice(0,n).reduce((a,b)=>a+b.pax,0);
  const base25=d2025.slice(0,n).filter(m=>m.total>0&&m.pax>0);
  const c25=base25.reduce((a,b)=>a+b.total,0), x25=base25.reduce((a,b)=>a+b.pax,0);
  const mes25=d2025.slice(0,n).filter(m=>m.total>0).length;
  const varT=t25p?(t26/t25p-1)*100:0, varP=p25p?(p26/p25p-1)*100:0;

  const pc26=p26?invPax/p26:0, pc25=x25?c25/x25:0, varPC=pc25?(pc26/pc25-1)*100:0;
  const arrow=v=>(v>=0?'▲ ':'▼ ')+Math.abs(v).toFixed(1).replace('.',',')+'%';
  const cls=v=>v>=0?'up':'down';
  const rango = n?`${d2026[0].mes}–${d2026[n-1].mes}`:'—';

  document.getElementById('k1').textContent=clp(t26);
  document.getElementById('k1n').innerHTML=`${rango} · <span class="trend ${cls(varT)}">${arrow(varT)}</span>
    vs. los mismos meses de 2025, con ${mes25} meses de actividad`;
  document.getElementById('k2').textContent=numf(p26);
  document.getElementById('k2n').innerHTML=`<span class="trend ${cls(-varP)}">${arrow(varP)}</span> vs. 2025 ·
    ${conPax.length?(p26/conPax.length).toFixed(0):0} por generación`;
  document.getElementById('k3').textContent=p26?clp(pc26):'—';
  document.getElementById('k3n').innerHTML=pc25
    ? `<span class="trend ${cls(varPC)}">${arrow(varPC)}</span> vs. ${clp(pc25)} en 2025 · ${conPax.length} meses con generación`
    : `${conPax.length} meses con generación`;
  document.getElementById('k5').textContent=f26?clp(f26):'Sin registrar';
  document.getElementById('k5n').textContent=f26?`${(f26/t26*100).toFixed(0)}% de la inversión`:'Carga los montos en Órdenes de compra';
  // cuenta del proyecto: inversión = pago a proveedores + servicios directo XP.
  // Los talleres SENCE se ejecutan y no se facturan, así que van como nota aparte.
  const CU=DATA.cuenta;
  const prov=CU.invProveedores;
  const sen=d2026.reduce((a,m,i)=>a+senceMes(i),0);
  const invTot = prov + CU.invServiciosXP;
  const ingTot = f26 + CU.saldoAnterior;
  const saldo  = ingTot - invTot;
  document.getElementById('k6').textContent=clp(saldo);
  document.getElementById('k6n').innerHTML = saldo>=0
    ? `A favor de MetLife · corte ${CU.corte}`
    : `A favor de XP · corte ${CU.corte}`;
  document.getElementById('k6').parentElement.classList.toggle('hero',false);

  document.getElementById('cuentaSub').textContent =
    `Cierre a ${CU.corte} de 2026. Facturación e inversión del año, más el saldo que venía de 2025.`;
  document.getElementById('cuenta').innerHTML=[
    ['Facturación 2026',clp(f26),'Suma de Órdenes de compra',''],
    ['Saldo que venía de 2025',clp(CU.saldoAnterior),'A favor de MetLife',''],
    ['Total ingresos',clp(ingTot),'Facturación más saldo anterior',''],
    ['Pago a proveedores',clp(prov),'Hotel, imprenta y honorarios','inv'],
    ['Servicios directo XP',clp(CU.invServiciosXP),'Onboarding, XPMetrix, moderación','inv'],
    ['Total inversión',clp(invTot),'Proveedores más servicios XP','inv'],
    ['Saldo',clp(saldo),saldo>=0?'A favor de MetLife':'A favor de XP',saldo>=0?'pos':'neg'],
    ['Talleres SENCE ejecutados',clp(sen),'Dentro de Costos por concepto','']
  ].map(([l,v,r,c])=>`<div class="cu ${c}"><div class="l">${l}</div><div class="v">${v}</div><div class="r">${r}</div></div>`).join('');

  const sxp=CU.serviciosXP, sxpT=sxp.reduce((a,b)=>a+b[1],0);
  document.querySelector('#tblXP tbody').innerHTML = sxp.map(([n,v])=>
    `<tr><td class="ro">${esc(n)}</td><td class="ro num">${clp(v)}</td>
     <td class="ro num muted">${(v/sxpT*100).toFixed(1).replace('.',',')}%</td></tr>`).join('');
  document.querySelector('#tblXP tfoot').innerHTML =
    `<tr><td>Total proyectado 2026</td><td class="num">${clp(sxpT)}</td><td class="num">100%</td></tr>`;

  const top=[...d2026].sort((a,b)=>b.total-a.total)[0];
  document.getElementById('k4').textContent=(top&&top.total)?top.mes:'—';
  document.getElementById('k4n').textContent=(top&&top.total)?`${clp(top.total)} · ${top.pax} asesores`:'';

  // trazabilidad de la inversión
  const av=document.getElementById('avisoRec');
  av.innerHTML = `<b>Dos cortes distintos.</b> «Inversión acumulada» ${clp(t26)} es el detalle operativo de
     Costos por concepto y cuadra con la fila de totales del <em>Costo OB CAA METLIFE 2026</em>.
     La Cuenta del proyecto viene del archivo de cuentas, donde el pago a proveedores suma ${clp(prov)}
     bajo otra agrupación. De la matriz, ${clp(sen)} son talleres SENCE.`;

  const tb=document.querySelector('#tblMes tbody'); tb.innerHTML='';
  d2026.forEach((m,i)=>{
    const prev=d2025[i], v=(prev&&prev.total)?(m.total/prev.total-1)*100:0;
    tb.insertAdjacentHTML('beforeend',
      `<tr><td class="ro"><strong>${m.mes}</strong></td>
       <td class="ro num">${m.total?clp(m.total):'—'}</td>
       <td class="ro num">${m.tall||'—'}</td>
       <td class="ro num">${m.pax||'—'}</td>
       <td class="ro num muted">${m.asist||'—'}</td>
       <td class="ro num">${m.pax&&m.total?clp(m.total/m.pax):'—'}</td>
       <td class="ro num">${m.fact?clp(m.fact):'—'}</td>
       <td class="ro num muted">${prev?clp(prev.total):'—'}</td>
       <td class="ro num">${(prev&&prev.total&&m.total)?`<span class="trend ${cls(v)}">${arrow(v)}</span>`:'—'}</td></tr>`);
  });
  document.querySelector('#tblMes tfoot').innerHTML=
    `<tr><td>Total ${rango}</td><td class="num">${clp(t26)}</td>
     <td class="num">${d2026.reduce((a,b)=>a+b.tall,0)||'—'}</td>
     <td class="num">${p26||'—'}</td>
     <td class="num">${d2026.reduce((a,b)=>a+b.asist,0)||'—'}</td><td class="num">${p26?clp(pc26):'—'}</td>
     <td class="num">${f26?clp(f26):'—'}</td>
     <td class="num">${clp(t25p)}</td>
     <td class="num">${t25p?`<span class="trend ${cls(varT)}">${arrow(varT)}</span>`:'—'}</td></tr>`;
}

/* =========================================================
   TABLA EDITABLE GENÉRICA
   ========================================================= */
function makeTable(cfg){
  const {key, cols, seed, tableId, addBtn, csvBtn, resetBtn, onChange} = cfg;
  let rows=[]; const tbl=document.getElementById(tableId);

  function cell(r,ri,c){
    if(c.t==='calc') return `<td class="ro num auto">${c.val(r,ri)}</td>`;
    const v=r[c.k]??'';
    if(c.t==='select') return `<td><select data-v="${esc(v)}" data-r="${ri}" data-k="${c.k}" aria-label="${esc(c.h)}">`+
      c.opts.map(o=>`<option value="${esc(o)}"${o===v?' selected':''}>${esc(o||'—')}</option>`).join('')+`</select></td>`;
    if(c.t==='num')  return `<td><input class="num" type="number" min="0" step="1" data-r="${ri}" data-k="${c.k}" value="${esc(v)}" placeholder="—" aria-label="${esc(c.h)}"></td>`;
    if(c.t==='date') return `<td><input type="date" data-r="${ri}" data-k="${c.k}" value="${esc(v)}" aria-label="${esc(c.h)}"></td>`;
    return `<td><input type="text" data-r="${ri}" data-k="${c.k}" value="${esc(v)}" placeholder="${esc(c.ph||'—')}" aria-label="${esc(c.h)}"></td>`;
  }
  function paint(){
    tbl.style.minWidth=(cols.reduce((a,c)=>a+(c.w||110),0)+44)+'px';
    tbl.querySelector('thead').innerHTML='<tr>'+cols.map(c=>`<th${c.t==='num'||c.t==='calc'?' class="num"':''}${c.w?` style="width:${c.w}px"`:''}>${esc(c.h)}${c.tag?`<span class="tag">${c.tag}</span>`:''}</th>`).join('')+'<th style="width:44px"></th></tr>';
    tbl.querySelector('tbody').innerHTML = rows.length
      ? rows.map((r,i)=>{
          const g = cfg.groupBy && i>0 && r[cfg.groupBy]!==rows[i-1][cfg.groupBy] ? ' class="grp"' : '';
          return `<tr${g}>`+cols.map(c=>cell(r,i,c)).join('')+`<td><button class="del" data-del="${i}" title="Eliminar fila" aria-label="Eliminar fila">&times;</button></td></tr>`;
        }).join('')
      : `<tr><td class="ro muted" colspan="${cols.length+1}">Todavía no hay filas.</td></tr>`;
    tbl.querySelector('tfoot').innerHTML = cfg.foot ? cfg.foot(rows) : '';
    onChange && onChange(rows);
  }
  tbl.addEventListener('input',e=>{
    const t=e.target; if(!t.dataset.k) return;
    rows[+t.dataset.r][t.dataset.k]= t.type==='number' ? (t.value===''?'':+t.value) : t.value;
    save(); if(cfg.foot) tbl.querySelector('tfoot').innerHTML=cfg.foot(rows);
    onChange && onChange(rows);
    if(cfg.propaga) propagar(cfg.propaga==='full');
  });
  tbl.addEventListener('change',e=>{
    if(e.target.tagName==='SELECT'){ e.target.setAttribute('data-v',e.target.value);
      if(cfg.propaga) propagar(cfg.propaga==='full'); }
  });
  tbl.addEventListener('click',e=>{
    const b=e.target.closest('[data-del]'); if(!b) return;
    rows.splice(+b.dataset.del,1); save(); paint(); toast('Fila eliminada');
    if(cfg.propaga) propagar(true);
  });
  function save(){ storeUI.set(key,rows); }

  document.getElementById(addBtn).addEventListener('click',()=>{
    rows.push(cfg.blank(rows)); save(); paint();
    const i=tbl.querySelectorAll('tbody tr:last-child input,tbody tr:last-child select'); i[0]&&i[0].focus();
  });
  document.getElementById(csvBtn).addEventListener('click',()=>{
    const q=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
    const val=(r,c,i)=>c.t==='calc' ? String(c.raw?c.raw(r,i):c.val(r,i)).replace(/[^\d-]/g,'') : r[c.k];
    const csv=[cols.map(c=>q(c.h)).join(';')].concat(rows.map((r,i)=>cols.map(c=>q(val(r,c,i))).join(';'))).join('\r\n');
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));
    a.download=cfg.file; a.click(); URL.revokeObjectURL(a.href); toast('CSV descargado');
  });
  document.getElementById(resetBtn).addEventListener('click',()=>{
    rows=JSON.parse(JSON.stringify(seed)); save(); paint(); toast('Datos restaurados');
    if(cfg.propaga) propagar(true);
  });

  return {
    get rows(){ return rows; },
    repaint: paint,
    async init(){
      const s=await storeUI.get(key);
      // cfg.seedId marca una carga nueva: si lo guardado es de otra carga, manda el archivo
      const guardado = cfg.seedId ? await storeUI.get(key+':seed') : null;
      const vencido  = cfg.seedId && guardado !== cfg.seedId;
      if(Array.isArray(s)&&s.length&&!vencido){ rows=s; }
      else { rows=JSON.parse(JSON.stringify(seed)); await storeUI.set(key,rows); }
      if(cfg.seedId && vencido) await storeUI.set(key+':seed', cfg.seedId);
      cfg.bind && cfg.bind(rows);
      paint();
    },
    add(list){
      if(cfg.groupBy){
        list.forEach(r=>{ const g=r[cfg.groupBy]; let idx=-1;
          for(let i=rows.length-1;i>=0;i--) if(rows[i][cfg.groupBy]===g){ idx=i; break; }
          idx>=0 ? rows.splice(idx+1,0,r) : rows.push(r); });
      } else rows=rows.concat(list);
      save(); paint();
      if(cfg.propaga) propagar(true);
    }
  };
}

/* propagación entre vistas */
let propT;
function propagar(inmediato){
  clearTimeout(propT);
  propT=setTimeout(()=>{
    recalc(); renderResumen(); chartMensual(); chartPerCapita(); chartConceptos(); chartFact();
    if(!document.getElementById('p-costos').hidden) renderConceptos(yrActual);

  }, inmediato?0:280);
}

/* =========================================================
   TALLERES  (fuente única de asesores)
   ========================================================= */
const talleres = makeTable({
  key:'metlife2026:talleres', tableId:'tblTal', addBtn:'addTal', csvBtn:'csvTal', resetBtn:'resetTal',
  file:'MetLife_2026_Talleres.csv', seed:DATA.talleres, seedId:DATA.seedTalleres, groupBy:'mes', propaga:'soft',
  bind:r=>{TAL=r;},
  cols:[
    {k:'mes',h:'Mes',t:'text',ph:'Agosto 2026',w:126},
    {k:'tipo',h:'Tipo de taller',t:'select',opts:['',...TIPOS],w:250},
    {k:'ini',h:'Inicio',t:'date',w:132},
    {k:'fin',h:'Término',t:'date',w:132},
    {k:'sede',h:'Sede / sala',t:'text',ph:'Sala',w:140},
    {k:'pax',h:'Asistentes',t:'num',w:110},
    {k:'rel',h:'Relator',t:'text',ph:'Nombre',w:150},
    {k:'est',h:'Estatus',t:'select',opts:['Planificado','En curso','Realizado','Cancelado'],w:142},
    {k:'obs',h:'Observaciones',t:'text',ph:'—',w:200}
  ],
  blank:()=>({mes:'',tipo:'',ini:'',fin:'',sede:'',pax:'',rel:'',est:'Planificado',obs:''}),
  foot:rows=>{
    const px=rows.filter(r=>r.est==='Realizado').reduce((a,r)=>a+(+r.pax||0),0);
    const meses=new Set(rows.map(r=>r.mes).filter(Boolean)).size;
    return `<tr><td colspan="5">${rows.length} talleres en ${meses} ${meses===1?'mes':'meses'}</td>
      <td class="num">${px||'—'}</td><td colspan="4">asistencias, no personas únicas</td></tr>`;
  },
  onChange:rows=>{
    TAL=rows;
    const n=t=>rows.filter(r=>r.tipo===t).length;
    const sence=n('Obligatorio Sence Presencial')+n('Obligatorio Sence Webex');
    const real=rows.filter(r=>r.est==='Realizado');
    const px=real.reduce((a,r)=>a+(+r.pax||0),0);
    const pend=rows.filter(r=>r.est==='Planificado'||r.est==='En curso').length;
    const meses=new Set(rows.filter(r=>r.mes).map(r=>r.mes)).size;
    document.getElementById('miniTal').innerHTML=[
      ['Talleres registrados',rows.length,'','filas de la tabla'],
      ['Meses con actividad',meses,'','meses con al menos un taller'],
      ['Por tipo',`${sence}<small> SENCE · ${n('Webinar')} webinar · ${n('Presencial Hotel')} hotel</small>`,'','según la columna Tipo de taller'],
      ['Asistencias registradas',px||'—','','suma por taller · una persona puede asistir a varios'],
      ['Talleres por realizar',pend,'','estatus Planificado o En curso']
    ].map(([l,v,s,r])=>`<div class="m"><div class="l">${l}</div><div class="v">${v} ${s?`<small>${s}</small>`:''}</div><div class="r">${r}</div></div>`).join('');
  }
});

/* =========================================================
   GENERACIONES  (asesores calculados · books y kits son fuente de costo)
   ========================================================= */
const genera = makeTable({
  key:'metlife2026:generaciones', tableId:'tblGen', addBtn:'addGen', csvBtn:'csvGen', resetBtn:'resetGen',
  file:'MetLife_2026_Generaciones.csv', seed:DATA.generaciones, seedId:DATA.seedGeneraciones, propaga:'soft',
  bind:r=>{GEN=r;},
  cols:[
    {k:'gen',h:'Generación',t:'text',ph:'Agosto 2026',w:150},
    {k:'ases',h:'Cantidad de asesores',t:'num',w:158},
    {k:'books',h:'Books solicitados',t:'num',w:132},
    {k:'mBooks',h:'Monto books',t:'num',w:132},
    {k:'fimp',h:'Factura imprenta',t:'select',opts:['Pendiente','Pagado','No aplica'],w:140},
    {k:'kits',h:'KITS solicitados',t:'num',w:132},
    {k:'mKits',h:'Monto kits',t:'num',w:126},
    {k:'cot',h:'Cotización hotel',t:'select',opts:['NO','SI','No aplica'],w:132},
    {k:'fhot',h:'Factura hotel',t:'select',opts:['Pendiente','Pagado','No aplica'],w:132}
  ],
  blank:()=>({gen:'',ases:'',books:'',mBooks:'',fimp:'Pendiente',kits:'',mKits:'',cot:'NO',fhot:'Pendiente'}),
  foot:rows=>{
    const s=k=>rows.reduce((a,r)=>a+(+r[k]||0),0);
    const px=s('ases');
    return `<tr><td>${rows.length} generaciones</td><td class="num">${px||'—'}</td>
      <td class="num">${s('books')||'—'}</td><td class="num">${clp(s('mBooks'))}</td><td></td>
      <td class="num">${s('kits')||'—'}</td><td class="num">${clp(s('mKits'))}</td><td colspan="3"></td></tr>`;
  },
  onChange:rows=>{
    GEN=rows;
    const s=k=>rows.reduce((a,r)=>a+(+r[k]||0),0);
    const pend=rows.filter(r=>r.fimp==='Pendiente').length+rows.filter(r=>r.fhot==='Pendiente').length;
    document.getElementById('miniGen').innerHTML=[
      ['Asesores 2026',s('ases')||'—','','suma de la columna · alimenta el Resumen'],
      ['Books solicitados',s('books')||'—','','suma de la columna'],
      ['Gasto en books',clp(s('mBooks')),'','pasa a Costos por concepto'],
      ['Gasto en kits',clp(s('mKits')),'','pasa a Costos por concepto'],
      ['Facturas pendientes',pend,'','imprenta + hotel'],
      ['Sin cotización de hotel',rows.filter(r=>r.cot==='NO').length,'','columna Cotización hotel']
    ].map(([l,v,s2,r])=>`<div class="m"><div class="l">${l}</div><div class="v">${v}</div><div class="r">${r}</div></div>`).join('');
  }
});

/* =========================================================
   ÓRDENES DE COMPRA
   ========================================================= */
const ordenes = makeTable({
  key:'metlife2026:oc', tableId:'tblOC', addBtn:'addOC', csvBtn:'csvOC', resetBtn:'resetOC',
  file:'MetLife_2026_Ordenes_de_compra.csv', seed:DATA.oc, seedId:DATA.seedOC, groupBy:'mes', propaga:'soft',
  bind:r=>{OC=r;},
  cols:[
    {k:'mes',h:'Mes',t:'text',ph:'Agosto 2026',w:152},
    {k:'det',h:'Detalle',t:'text',ph:'Facturación OTIC',w:230},
    {k:'noc',h:'Número de OC',t:'text',ph:'OC-0000',w:140},
    {k:'ini',h:'Inicio OC',t:'date',w:134},
    {k:'fin',h:'Término OC',t:'date',w:134},
    {k:'dji',h:'Inicio recolección DJS',t:'date',w:164},
    {k:'djf',h:'Término recolección DJS',t:'date',w:174},
    {k:'monto',h:'Monto facturado',t:'num',w:146},
    {k:'est',h:'Estatus OC',t:'select',opts:['','Por emitir','Emitida','En ejecución','Cerrada','Anulada'],w:140}
  ],
  blank:()=>({mes:'',det:'',noc:'',ini:'',fin:'',dji:'',djf:'',monto:'',est:''}),
  foot:rows=>{
    const meses=new Set(rows.map(r=>r.mes).filter(Boolean)).size;
    const tot=rows.reduce((a,r)=>a+(+r.monto||0),0);
    return `<tr><td colspan="7">${rows.length} órdenes en ${meses} ${meses===1?'mes':'meses'} · ${rows.filter(r=>r.noc).length} con número</td>
      <td class="num">${clp(tot)}</td><td colspan="2"></td></tr>`;
  },
  onChange:rows=>{
    OC=rows;
    const tot=rows.reduce((a,r)=>a+(+r.monto||0),0);
    document.getElementById('miniOC').innerHTML=[
      ['Facturado acumulado',clp(tot),'suma de la columna Monto facturado'],
      ['OC con número',rows.filter(r=>r.noc).length,'de '+rows.length+' filas'],
      ['OC cerradas',rows.filter(r=>r.est==='Cerrada').length,'estatus Cerrada'],
      ['Recolección DJS abierta',rows.filter(r=>r.dji&&!r.djf).length,'con inicio y sin término'],
      ['Órdenes sin número',rows.filter(r=>!r.noc).length,'pendientes de emitir o registrar']
    ].map(([l,v,r])=>`<div class="m"><div class="l">${l}</div><div class="v">${v}</div><div class="r">${r}</div></div>`).join('');
  }
});

/* =========================================================
   COSTOS POR CONCEPTO
   ========================================================= */
function renderConceptos(y){
  yrActual=y;
  const off=(y===2026?12:0), n=COST.activos[y], ms=MESES.slice(0,n);
  const tabla=document.getElementById('tblConc');
  tabla.style.minWidth=(186+106+90*n+126+44)+'px';
  tabla.querySelector('thead').innerHTML =
    '<tr><th style="width:186px">Concepto</th><th style="width:106px">Pago</th>'+
    ms.map(m=>`<th class="num" style="width:90px">${m.slice(0,3)}</th>`).join('')+
    '<th class="num" style="width:126px">Total</th><th style="width:44px"></th></tr>';

  let html='';
  COST.conc.forEach((c,ci)=>{
    const auto = y===2026 && c.auto;
    const t=ms.reduce((a,_,i)=>a+valConc(c,y,i),0);
    html += `<tr><td><input type="text" data-c="${ci}" data-f="concepto" value="${esc(c.concepto)}" placeholder="Nuevo concepto" aria-label="Concepto"${auto?' readonly':''}>${auto?'<span class="tag" style="margin-left:0">auto</span>':''}</td>`+
      `<td><select data-c="${ci}" data-f="pago" data-v="${esc(c.pago)}" aria-label="Pago">`+
        PAGOS.map(o=>`<option${o===c.pago?' selected':''}>${o}</option>`).join('')+`</select></td>`+
      ms.map((_,i)=> auto
        ? `<td class="ro num auto" title="Se ingresa en Generaciones">${valConc(c,y,i)?numf(valConc(c,y,i)):'0'}</td>`
        : `<td><input class="num" type="number" min="0" step="1" data-c="${ci}" data-m="${off+i}" value="${c.vals[off+i]||''}" placeholder="0" aria-label="${esc(c.concepto)} ${ms[i]}"></td>`).join('')+
      `<td class="ro num rowtot" data-rt="${ci}">${clp(t)}</td>`+
      `<td>${auto?'':`<button class="del" data-delc="${ci}" title="Eliminar concepto" aria-label="Eliminar concepto">&times;</button>`}</td></tr>`;
  });
  tabla.querySelector('tbody').innerHTML=html;
  pintarTotalesConc();
  document.getElementById('addMesConc').disabled = n>=12;
}
function pintarTotalesConc(){
  const y=yrActual, n=COST.activos[y];
  const col=[...Array(n)].map((_,i)=>COST.conc.reduce((a,c)=>a+valConc(c,y,i),0));
  document.querySelector('#tblConc tfoot').innerHTML =
    `<tr><td>Total ${y}</td><td></td>`+col.map(v=>`<td class="num">${numf(v)}</td>`).join('')+
    `<td class="num">${clp(col.reduce((a,b)=>a+b,0))}</td><td></td></tr>`;
}
function totalFila(ci){
  const y=yrActual, n=COST.activos[y];
  const cel=document.querySelector(`#tblConc [data-rt="${ci}"]`); if(!cel) return;
  cel.textContent=clp([...Array(n)].reduce((a,_,i)=>a+valConc(COST.conc[ci],y,i),0));
}
function guardarCostos(){ storeUI.set(CKEY,COST); propagar(false); }

const tC=document.getElementById('tblConc');
tC.addEventListener('input',e=>{
  const t=e.target;
  if(t.dataset.m!==undefined){ COST.conc[+t.dataset.c].vals[+t.dataset.m]= t.value===''?0:+t.value; totalFila(+t.dataset.c); }
  else if(t.dataset.f==='concepto'){ COST.conc[+t.dataset.c].concepto=t.value; }
  else return;
  pintarTotalesConc(); guardarCostos();
});
tC.addEventListener('change',e=>{
  const t=e.target;
  if(t.dataset.f==='pago'){ COST.conc[+t.dataset.c].pago=t.value; t.setAttribute('data-v',t.value); guardarCostos(); }
});
tC.addEventListener('click',e=>{
  const b=e.target.closest('[data-delc]'); if(!b) return;
  COST.conc.splice(+b.dataset.delc,1); guardarCostos(); renderConceptos(yrActual); toast('Concepto eliminado');
});
document.getElementById('addConc').addEventListener('click',()=>{
  COST.conc.push({concepto:'',pago:'SENCE',auto:null,vals:new Array(24).fill(0)});
  guardarCostos(); renderConceptos(yrActual);
  const i=tC.querySelector('tbody tr:last-child input[data-f="concepto"]'); i&&i.focus();
});
document.getElementById('addMesConc').addEventListener('click',()=>{
  if(COST.activos[yrActual]>=12) return;
  COST.activos[yrActual]++; guardarCostos(); renderConceptos(yrActual);
  toast(MESES[COST.activos[yrActual]-1]+' '+yrActual+' agregado');
});
document.getElementById('resetConc').addEventListener('click',()=>{
  COST=seedCost(); guardarCostos(); renderConceptos(yrActual); toast('Datos restaurados');
});
document.getElementById('csvConc').addEventListener('click',()=>{
  const y=yrActual, n=COST.activos[y], ms=MESES.slice(0,n);
  const q=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
  const lin=[['Concepto','Pago',...ms,'Total'].map(q).join(';')];
  COST.conc.forEach(c=>lin.push([c.concepto,c.pago,...ms.map((_,i)=>valConc(c,y,i)),
    ms.reduce((a,_,i)=>a+valConc(c,y,i),0)].map(q).join(';')));
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob(['\ufeff'+lin.join('\r\n')],{type:'text/csv;charset=utf-8'}));
  a.download='MetLife_'+y+'_Costos_por_concepto.csv'; a.click(); URL.revokeObjectURL(a.href); toast('CSV descargado');
});

/* =========================================================
   BARRAS DE ALTA MASIVA
   ========================================================= */
(function(){
  const ms=document.getElementById('talMes'), ts=document.getElementById('talTipo'), cs=document.getElementById('talCant');
  ms.innerHTML=MESES.map(m=>`<option>${m}</option>`).join('');
  ms.value=MESES[new Date().getMonth()];
  ts.innerHTML='<option value="">Tipo sin definir</option>'+TIPOS.map(t=>`<option>${t}</option>`).join('');
  cs.innerHTML=[1,2,3,4,5,6].map(n=>`<option value="${n}">${n} ${n===1?'taller':'talleres'}</option>`).join('');
  document.getElementById('talAdd').addEventListener('click',()=>{
    const n=+cs.value, nuevos=[];
    for(let i=0;i<n;i++) nuevos.push({mes:ms.value+' 2026',tipo:ts.value,ini:'',fin:'',sede:'',pax:'',rel:'',est:'Planificado',obs:''});
    talleres.add(nuevos); toast(`${n} ${n===1?'taller agregado':'talleres agregados'}`);
  });
})();
(function(){
  const ms=document.getElementById('ocMes'), cs=document.getElementById('ocCant');
  ms.innerHTML='<option value="*">Todos los meses</option>'+MESES.map(m=>`<option>${m}</option>`).join('');
  ms.value=MESES[new Date().getMonth()];
  cs.innerHTML=[1,2,3,4,5,6].map(n=>`<option value="${n}">${n} ${n===1?'orden':'órdenes'}</option>`).join('');
  document.getElementById('ocAdd').addEventListener('click',()=>{
    const anio=document.getElementById('ocAnio').value, n=+cs.value;
    const lista=(ms.value==='*'?MESES:[ms.value]), nuevas=[];
    lista.forEach(m=>{ for(let i=0;i<n;i++) nuevas.push({mes:`${m} ${anio}`,det:'',noc:'',ini:'',fin:'',dji:'',djf:'',monto:'',est:''}); });
    ordenes.add(nuevas);
    toast(`${nuevas.length} ${nuevas.length===1?'orden agregada':'órdenes agregadas'}`);
  });
})();


/* =========================================================
   RESUMEN EJECUTIVO · UNA PÁGINA
   ========================================================= */
function construirOnePage(){
  const CU=DATA.cuenta, n=d2026.length;
  const t26=d2026.reduce((a,b)=>a+b.total,0);
  const prov=CU.invProveedores;
  const sen=d2026.reduce((a,m,i)=>a+senceMes(i),0);
  const f26=d2026.reduce((a,b)=>a+b.fact,0);
  const p26=d2026.reduce((a,b)=>a+b.pax,0);
  const conPax=d2026.filter(m=>m.pax>0);
  const pc26=p26?conPax.reduce((a,b)=>a+b.total,0)/p26:0;
  const mes25=d2025.slice(0,n).filter(m=>m.total>0).length;
  const invTot=prov+CU.invServiciosXP, ingTot=f26+CU.saldoAnterior, saldo=ingTot-invTot;
  const margen=ingTot?saldo/ingTot*100:0;
  const t25p=d2025.slice(0,n).reduce((a,b)=>a+b.total,0);
  const varT=t25p?(t26/t25p-1)*100:0;
  const rango=n?`${d2026[0].mes} a ${d2026[n-1].mes} de 2026`:'2026';
  const hoy=new Date().toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'});
  const pct=v=>v.toFixed(1).replace('.',',')+'%';
  const hotelC=COST.conc.find(c=>/Almuerzo/.test(c.concepto));
  const hotelV=hotelC?[...Array(n)].reduce((a,_,i)=>a+valConc(hotelC,2026,i),0):0;
  const hotelPct=t26?hotelV/t26*100:0;
  const fl=(l,v)=>`<div class="ln"><span>${l}</span><b>${clp(v)}</b></div>`;

  // conceptos principales
  const cs=COST.conc.map(c=>({n:c.concepto,
      v:[...Array(n)].reduce((a,_,i)=>a+valConc(c,2026,i),0)}))
    .filter(c=>c.v>0).sort((a,b)=>b.v-a.v);
  const csT=cs.reduce((a,b)=>a+b.v,0);

  document.getElementById('onePage').innerHTML=`
  <div class="ophead">
    <span class="xl" role="img" aria-label="XP"></span>
    <span class="sep"></span>${DATA.mlogo||''}
    <div>
      <h1>Proyecto MetLife 2026</h1>
      <p>Onboarding CAA · resumen ejecutivo del programa</p>
    </div>
    <div class="corte"><b>${rango}</b>Emitido el ${hoy}</div>
  </div>

  <div class="opk">
    <div class="c hi"><div class="l">Facturación del año</div><div class="v">${clp(f26)}</div>
      <div class="n">OTIC más costo empresa</div></div>
    <div class="c"><div class="l">Inversión total</div><div class="v">${clp(invTot)}</div>
      <div class="n">Proveedores y servicios XP</div></div>
    <div class="c gr"><div class="l">Saldo del proyecto</div><div class="v">${clp(saldo)}</div>
      <div class="n">${saldo>=0?'A favor de MetLife':'A favor de XP'} · ${pct(Math.abs(margen))} de los ingresos</div></div>
    <div class="c"><div class="l">Costo por asesor</div><div class="v">${clp(pc26)}</div>
      <div class="n">${p26} asesores en ${conPax.length} meses</div></div>
  </div>

  <div class="blk">
    <h2>Cuenta del proyecto</h2>
    <div class="opflow">
      <div class="s">
        <h3>Ingresos</h3>
        ${fl('Facturación 2026',f26)}
        ${fl('Saldo que venía de 2025',CU.saldoAnterior)}
        <div class="ln tt"><span>Total ingresos</span><b>${clp(ingTot)}</b></div>
      </div>
      <div class="s inv">
        <h3>Inversión</h3>
        ${fl('Pago a proveedores',prov)}
        ${fl('Servicios directo XP',CU.invServiciosXP)}
        <div class="ln tt"><span>Total inversión</span><b>${clp(invTot)}</b></div>
      </div>
      <div class="s sal">
        <h3>Resultado</h3>
        ${fl('Talleres SENCE entregados',sen)}
        <div class="ln"><span>Dentro de Costos por concepto</span><b>&nbsp;</b></div>
        <div class="ln tt"><span>Saldo</span><b>${clp(saldo)}</b></div>
      </div>
    </div>
  </div>

  <div class="blk opcols">
    <div>
      <h2>Detalle mensual · ejecutado en proveedores y talleres</h2>
      <div class="tb"><table>
        <thead><tr><th>Mes</th><th class="num">Facturado</th><th class="num">Ejecutado</th>
          <th class="num">Asesores</th><th class="num">Costo/asesor</th></tr></thead>
        <tbody>${d2026.map(m=>`<tr><td>${m.mes}</td><td class="num">${m.fact?clp(m.fact):'—'}</td>
          <td class="num">${m.total?clp(m.total):'—'}</td><td class="num">${m.pax||'—'}</td>
          <td class="num">${m.pax?clp(m.total/m.pax):'—'}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${clp(f26)}</td><td class="num">${clp(t26)}</td>
          <td class="num">${p26}</td><td class="num">${clp(pc26)}</td></tr></tfoot>
      </table></div>
    </div>
    <div>
      <h2>Composición del costo ejecutado</h2>
      <div class="tb"><table>
        <thead><tr><th>Concepto</th><th class="num">Monto</th><th class="num">%</th></tr></thead>
        <tbody>${cs.map(c=>`<tr><td>${esc(c.n)}</td><td class="num">${clp(c.v)}</td>
          <td class="num">${(c.v/csT*100).toFixed(1).replace('.',',')}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${clp(csT)}</td><td class="num">100,0</td></tr></tfoot>
      </table></div>
    </div>
  </div>

  <div class="blk">
    <h2>Facturación contra inversión, mes a mes</h2>
    <svg class="opch" id="opChart" viewBox="0 0 900 190" role="img"
      aria-label="Facturación contra inversión mes a mes"></svg>
  </div>

  <div class="blk">
    <h2>Lectura del periodo</h2>
    <div class="tb"><table><tbody>
      <tr><td style="width:34%"><b>Resultado</b></td><td>El proyecto cierra con ${clp(saldo)}
        ${saldo>=0?'a favor de MetLife':'a favor de XP'}, equivalente al ${pct(Math.abs(margen))} de los ingresos del periodo.</td></tr>
      <tr><td><b>Inversión ejecutada</b></td><td>${clp(t26)} en proveedores y talleres,
        ${varT>=0?'un alza':'una baja'} de ${pct(Math.abs(varT))} frente a los mismos meses de 2025, periodo
        que tuvo ${mes25} meses de actividad porque el programa partió en abril. El almuerzo concentra
        ${pct(hotelPct)} del gasto del periodo.</td></tr>
      <tr><td><b>Costo por asesor</b></td><td>${clp(pc26)} por asesor formado, sobre ${p26} asesores
        en ${conPax.length} meses con generación registrada.</td></tr>
      <tr><td><b>Servicios no facturados</b></td><td>${clp(sen)} en talleres SENCE entregados durante el
        periodo que no se facturan al cliente.</td></tr>
    </tbody></table></div>
  </div>

  <div class="opnote">
    <span>Fuente: Detalle de Cliente MetLife 2025-2026 FINAL · montos netos, sin IVA</span>
    <span>Proyecto MetLife 2026 · Equipo XP</span>
  </div>`;
}

function opGrafico(){
  const s=document.getElementById('opChart'); if(!s) return; s.innerHTML='';
  const W=900,H=190,L=56,R=10,T=12,B=26, pw=W-L-R, ph=H-T-B, n=d2026.length;
  const inv=d2026.map(m=>m.total), fac=d2026.map(m=>m.fact);
  const max=niceMax(Math.max(1,...inv,...fac));
  const step=pw/n, bw=Math.min(16,step*0.3);
  for(let i=0;i<=3;i++){
    const y=T+ph-(ph*i/3);
    s.appendChild(el('line',{x1:L,x2:W-R,y1:y,y2:y,stroke:i?'#eef2f8':'#cfdaea'}));
    s.appendChild(el('text',{x:L-8,y:y+3,'text-anchor':'end','font-size':9,fill:'#8ea4c0'},'$'+(max*i/3/1e6).toFixed(0)+'M'));
  }
  d2026.forEach((m,i)=>{
    const cx=L+step*i+step/2;
    if(m.fact){const hh=ph*m.fact/max;s.appendChild(el('rect',{x:cx-bw-1.5,y:T+ph-hh,width:bw,height:hh,rx:2,fill:'#1FA97A'}));
      s.appendChild(el('text',{x:cx-bw/2-1.5,y:T+ph-hh-4,'text-anchor':'middle','font-size':8,'font-weight':600,fill:'#0f7a58'},kclp(m.fact)));}
    if(m.total){const hh=ph*m.total/max;s.appendChild(el('rect',{x:cx+1.5,y:T+ph-hh,width:bw,height:hh,rx:2,fill:'#3964FF'}));
      s.appendChild(el('text',{x:cx+1.5+bw/2,y:T+ph-hh-4,'text-anchor':'middle','font-size':8,'font-weight':600,fill:'#3964FF'},kclp(m.total)));}
    s.appendChild(el('text',{x:cx,y:H-10,'text-anchor':'middle','font-size':9,fill:'#46587a'},m.mes.slice(0,3)));
  });
  s.appendChild(el('rect',{x:L,y:T-6,width:8,height:8,rx:2,fill:'#1FA97A'}));
  s.appendChild(el('text',{x:L+12,y:T+1,'font-size':8.5,fill:'#46587a'},'Facturado'));
  s.appendChild(el('rect',{x:L+74,y:T-6,width:8,height:8,rx:2,fill:'#3964FF'}));
  s.appendChild(el('text',{x:L+86,y:T+1,'font-size':8.5,fill:'#46587a'},'Inversión ejecutada'));
}

function abrirOnePage(){
  construirOnePage(); opGrafico();
  document.getElementById('opWrap').classList.add('on');
  document.body.style.overflow='hidden';
  document.getElementById('opClose').focus();
}
function cerrarOnePage(){
  document.getElementById('opWrap').classList.remove('on');
  document.body.style.overflow='';
}
document.getElementById('verOnePage').addEventListener('click',abrirOnePage);
document.getElementById('pdfOnePage').addEventListener('click',()=>{ abrirOnePage(); setTimeout(()=>window.print(),220); });
document.getElementById('opPrint').addEventListener('click',()=>window.print());
document.getElementById('opClose').addEventListener('click',cerrarOnePage);
document.getElementById('opWrap').addEventListener('click',e=>{ if(e.target.id==='opWrap') cerrarOnePage(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') cerrarOnePage(); });



/* =========================================================
   SESIÓN
   ========================================================= */
function montarSesion(){
  if(!hayFirebase) return;
  const caja=document.createElement('div');
  caja.id='sesionBox'; caja.className='status';
  caja.style.cssText='cursor:pointer;gap:8px';
  caja.innerHTML='<span id="sesionTxt">Iniciar sesión</span>';
  caja.addEventListener('click', async ()=>{
    try{ usuario.actual ? await salir() : await entrar(); }
    catch(e){ toast('No se pudo iniciar sesión: '+(e.code||e.message)); }
  });
  document.querySelector('.top .wrap').appendChild(caja);

  const velo=document.createElement('div');
  velo.id='veloSesion';
  velo.innerHTML=`<div class="tarjeta">
     <h2>Centro de control · MetLife 2026</h2>
     <p>Este panel guarda los datos del proyecto en Firebase. Inicia sesión con tu cuenta
        de XP para verlos y editarlos.</p>
     <button class="btn pri" id="entrarBtn">Entrar con Google</button>
     <p class="err" id="errSesion"></p>
   </div>`;
  document.body.appendChild(velo);
  document.getElementById('entrarBtn').addEventListener('click', async ()=>{
    const e=document.getElementById('errSesion'); e.textContent='';
    try{ await entrar(); }catch(err){ e.textContent='No se pudo iniciar sesión: '+(err.code||err.message); }
  });
}

function pintarSesion(u, aviso){
  const velo=document.getElementById('veloSesion');
  const txt=document.getElementById('sesionTxt');
  if(velo) velo.classList.toggle('on', !u);
  if(txt)  txt.textContent = u ? (u.email||'Sesión iniciada') : 'Iniciar sesión';
  const e=document.getElementById('errSesion');
  if(e && aviso) e.textContent=aviso;
}

let avisoT=null;
function avisarCambioRemoto(quien){
  if(document.getElementById('avisoRemoto')) return;
  const a=document.createElement('div');
  a.id='avisoRemoto'; a.className='avisoRemoto';
  a.innerHTML=`<span>${esc(quien)} guardó cambios en este proyecto.</span>
    <button class="btn pri" id="recargarBtn">Actualizar</button>
    <button class="btn gh" id="cerrarAviso">Después</button>`;
  document.body.appendChild(a);
  requestAnimationFrame(()=>a.classList.add('on'));
  document.getElementById('recargarBtn').onclick=()=>location.reload();
  document.getElementById('cerrarAviso').onclick=()=>{ a.remove(); clearTimeout(avisoT); };
  clearTimeout(avisoT); avisoT=setTimeout(()=>a.remove(), 30000);
}

/* =========================================================
   NAVEGACIÓN E INICIO
   ========================================================= */
const tabs=[...document.querySelectorAll('.tab')];
tabs.forEach(t=>t.addEventListener('click',()=>{
  tabs.forEach(x=>{ const on=x===t; x.setAttribute('aria-selected',on);
    document.getElementById(x.getAttribute('aria-controls')).hidden=!on; });
  if(t.id==='t-costos') renderConceptos(yrActual);

  window.scrollTo({top:0,behavior:'smooth'});
}));
tabs.forEach((t,i)=>t.addEventListener('keydown',e=>{
  if(e.key==='ArrowRight'||e.key==='ArrowLeft'){ e.preventDefault();
    const n=tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length]; n.focus(); n.click(); }
}));
document.querySelectorAll('[data-yr]').forEach(b=>b.addEventListener('click',()=>{
  document.querySelectorAll('[data-yr]').forEach(x=>x.classList.toggle('pri',x===b));
  renderConceptos(+b.dataset.yr);
}));

async function recargarTodo(){
  const g=await storeUI.get(CKEY);
  const seedGuardado = DATA.seedCostos ? await storeUI.get(CKEY+':seed') : null;
  const costoVencido = DATA.seedCostos && seedGuardado !== DATA.seedCostos;
  if(g && Array.isArray(g.conc) && g.activos && !costoVencido){ COST=g; }
  else { COST=seedCost(); await storeUI.set(CKEY,COST);
         if(DATA.seedCostos) await storeUI.set(CKEY+':seed', DATA.seedCostos); }
  await talleres.init(); await genera.init(); await ordenes.init();
  recalc();
  renderResumen(); chartMensual(); chartPerCapita(); chartConceptos(); chartFact();
  renderConceptos(yrActual);
}
function pintarMotor(){
  const t=document.getElementById('motorTxt'); if(!t) return;
  if(!hayFirebase){ t.textContent='Firebase no está configurado: los cambios se guardan solo en este navegador.'; return; }
  if(!usuario.actual){ t.textContent='Inicia sesión para ver y guardar los datos del proyecto.'; return; }
  t.textContent = estado.modo==='nube'
    ? `Conectado como ${usuario.actual.email}. Los cambios se guardan para todo el equipo.`
    : `Sin conexión con Firebase. Los cambios quedan en este equipo y se envían al volver.`;
}

let dejarDeVigilar = null;
async function boot(){
  pintarStatus(); pintarMotor();
  document.getElementById('bkDown').addEventListener('click',descargarRespaldo);
  document.getElementById('bkUp').addEventListener('click',()=>document.getElementById('bkFile').click());
  document.getElementById('bkFile').addEventListener('change',e=>{
    const f=e.target.files[0]; if(f) cargarRespaldo(f); e.target.value='';
  });
  montarSesion();

  if(!hayFirebase){ await recargarTodo(); return; }

  alCambiarSesion(async (u, aviso) => {
    pintarSesion(u, aviso);
    pintarStatus(); pintarMotor();
    if(!u){ if(dejarDeVigilar){ dejarDeVigilar(); dejarDeVigilar=null; } return; }
    await recargarTodo();
    pintarStatus(); pintarMotor();
    dejarDeVigilar = vigilar(KEYS, quien => avisarCambioRemoto(quien));
  });
}
boot();
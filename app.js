const cfg = window.APP_CONFIG, sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (n, d = 0) => Number(n || 0).toLocaleString('en-PH', {minimumFractionDigits: d, maximumFractionDigits: d || 2});
const money = n => '₱' + num(n, 2);
const clean = s => s.replace(/[%,()*]/g, ' ');
const PS = 10; let me = {role_id: 2}, C = {}, S = {};
const isAdmin = () => me.role_id === 1;
const FM = new bootstrap.Modal('#fm'), DM = new bootstrap.Modal('#dm');

// ---------- lookups (dropdowns show the label, the database stores the ID) ----------
const lk = (t, id, d) => ({t, id, lbl: r => r[d]});
const L = {
  cat: lk('ref_crop_category','category_id','category_description'),
  season: lk('ref_season','season_id','season_description'),
  irr: lk('ref_irrigation_type','irrigation_type_id','irrigation_type_description'),
  soil: lk('ref_soil_type','soil_type_id','soil_type_description'),
  stat: lk('ref_planting_status','status_id','status_description'),
  grade: lk('ref_quality_grade','grade_id','grade_description'),
  rem: lk('ref_harvest_remark','remark_id','remark_description'),
  city: lk('ref_city_municipality','municipality_id','municipality_name'),
  farmer: {t:'farmer', id:'farmer_id', lbl: r => r.first_name + ' ' + r.last_name},
  farm: {t:'farm', id:'farm_id', lbl: r => r.farm_name},
  crop: {t:'crop', id:'crop_id', lbl: r => r.crop_name + (r.variety ? ' (' + r.variety + ')' : '')},
  planting: {t:'v_planting_details', id:'planting_id', lbl: r => `#${r.planting_id} ${r.crop_name} - ${r.farm_name}`}
};
const opts = async o => C[o.t] ??= (await sb.from(o.t).select('*').order(o.id).limit(1000)).data || [];

// ---------- module definitions: cols = [heading, field or function, sort column] ----------
const today = () => new Date().toISOString().slice(0, 10);
const M = {
  farmers: {title:'Farmers', name:'Farmer', t:'farmer', src:'v_farmer_details', pk:'farmer_id', o:'last_name', asc:true,
    cols:[['Name','farmer_name','last_name'], ['Contact','contact_number','contact_number'], ['Address','address','municipality_name'], ['Registered','date_registered','date_registered']],
    f:[{k:'first_name',l:'First name',req:1},{k:'last_name',l:'Last name',req:1},{k:'contact_number',l:'Contact number',t:'tel',req:1},{k:'municipality_id',l:'Address (city / municipality)',req:1,o:L.city},{k:'date_registered',l:'Date registered',t:'date',req:1,def:today}],
    search:['first_name','last_name','contact_number','address'], filt:[{k:'municipality_id',l:'Addresses',o:L.city}],
    chk: (v,e) => { if (v.date_registered && v.date_registered > today()) e.push('Date registered cannot be in the future.'); }},
  farms: {title:'Farms', name:'Farm', t:'farm', src:'v_farm_details', pk:'farm_id', o:'farm_name', asc:true,
    cols:[['Farm','farm_name','farm_name'], ['Farmer','farmer_name','farmer_name'], ['Location','location','municipality_id'], ['Area (ha)', r => num(r.area_hectares,2), 'area_hectares'], ['Soil','soil_type','soil_type'], ['Irrigation','irrigation_type','irrigation_type']],
    f:[{k:'farmer_id',l:'Farmer',req:1,o:L.farmer},{k:'farm_name',l:'Farm name',req:1},{k:'municipality_id',l:'Location (city / municipality)',req:1,o:L.city},{k:'area_hectares',l:'Area (hectares)',t:'number',req:1,min:0.01,max:999999.99},{k:'soil_type_id',l:'Soil type',req:1,o:L.soil},{k:'irrigation_type_id',l:'Irrigation type',req:1,o:L.irr}],
    search:['farm_name','farmer_name','location'], filt:[{k:'irrigation_type_id',l:'Irrigation types',o:L.irr},{k:'soil_type_id',l:'Soil types',o:L.soil}]},
  crops: {title:'Crops', name:'Crop', t:'crop', src:'v_crop_details', pk:'crop_id', o:'crop_name', asc:true, admin:1,
    cols:[['Crop','crop_name','crop_name'], ['Variety','variety','variety'], ['Category','crop_category','category_id'], ['Growing period (days)','growing_period_days','growing_period_days'], ['Recommended season','recommended_season','season_id']],
    f:[{k:'crop_name',l:'Crop name',req:1},{k:'variety',l:'Variety'},{k:'category_id',l:'Category',req:1,o:L.cat},{k:'growing_period_days',l:'Growing period (days)',t:'number',req:1,min:1,max:1500,step:1},{k:'season_id',l:'Recommended season',req:1,o:L.season}],
    search:['crop_name','variety'], filt:[{k:'category_id',l:'Categories',o:L.cat},{k:'season_id',l:'Seasons',o:L.season}]},
  plantings: {title:'Planting records', name:'Planting', t:'planting', src:'v_planting_details', pk:'planting_id', o:'planting_date', asc:false,
    cols:[['Farm','farm_name','farm_name'], ['Crop', r => r.crop_name + (r.variety ? ' (' + r.variety + ')' : ''), 'crop_name'], ['Planted','planting_date','planting_date'], ['Expected harvest','expected_harvest_date','expected_harvest_date'], ['Area (ha)', r => num(r.area_planted,2), 'area_planted'], ['Seed qty', r => num(r.seed_quantity,2), 'seed_quantity'], ['Status','status','status_id']],
    f:[{k:'farm_id',l:'Farm',req:1,o:L.farm},{k:'crop_id',l:'Crop',req:1,o:L.crop},{k:'planting_date',l:'Planting date',t:'date',req:1},{k:'area_planted',l:'Area planted (hectares)',t:'number',req:1,min:0.01,max:999999.99},{k:'seed_quantity',l:'Seed quantity',t:'number',min:0,max:999999.99},{k:'expected_harvest_date',l:'Expected harvest date',t:'date',req:1},{k:'status_id',l:'Status',req:1,o:L.stat}],
    search:['farm_name','crop_name','variety','farmer_name'], filt:[{k:'status_id',l:'Statuses',o:L.stat}],
    chk: async (v,e) => {
      if (v.planting_date && v.expected_harvest_date && v.expected_harvest_date < v.planting_date) e.push('Expected harvest date cannot be earlier than the planting date.');
      const f = (await opts(L.farm)).find(x => x.farm_id == v.farm_id);
      if (f && v.area_planted > f.area_hectares) e.push(`Area planted cannot exceed the farm area (${f.area_hectares} ha).`);
    }},
  harvests: {title:'Harvest records', name:'Harvest', t:'harvest', src:'v_harvest_details', pk:'harvest_id', o:'harvest_date', asc:false,
    cols:[['Date','harvest_date','harvest_date'], ['Farm','farm_name','farm_name'], ['Crop','crop_name','crop_name'], ['Qty (kg)', r => num(r.quantity_kg,2), 'quantity_kg'], ['Price/kg', r => money(r.selling_price_per_kg), 'selling_price_per_kg'], ['Est. value', r => money(r.estimated_value), 'estimated_value'], ['Grade','quality_grade','quality_grade_id'], ['Remarks','remarks','remark_id']],
    f:[{k:'planting_id',l:'Planting record',req:1,o:L.planting},{k:'harvest_date',l:'Harvest date',t:'date',req:1},{k:'quantity_kg',l:'Quantity (kg)',t:'number',req:1,min:0.01,max:99999999.99},{k:'selling_price_per_kg',l:'Selling price per kg (₱)',t:'number',req:1,min:0,max:99999999.99},{k:'quality_grade_id',l:'Quality grade',req:1,o:L.grade},{k:'remark_id',l:'Remarks',req:1,o:L.rem}],
    search:['farm_name','crop_name','variety','farmer_name'], filt:[{k:'quality_grade_id',l:'Quality grades',o:L.grade},{k:'remark_id',l:'Remarks',o:L.rem}],
    chk: async (v,e) => {
      const p = (await opts(L.planting)).find(x => x.planting_id == v.planting_id);
      if (p && v.harvest_date && v.harvest_date < p.planting_date) e.push(`Harvest date cannot be earlier than the planting date (${p.planting_date}).`);
    }}
};

// ---------- messages ----------
function flash(t, type = 'success') {
  const d = document.createElement('div'); d.className = `alert alert-${type} alert-dismissible`;
  d.innerHTML = esc(t) + '<button class="btn-close" data-bs-dismiss="alert"></button>';
  $('#msg').prepend(d); setTimeout(() => d.remove(), 5000);
}
function errMsg(e, op) {
  console.error(e); const m = e.message || '';
  if (e.code === '23503') return op === 'delete' ? 'This record is still used by other records. Remove or reassign them first.' : 'The selected related record no longer exists.';
  if (e.code === '23505') return 'A record with the same unique value already exists.';
  if (e.code === '23514') return /violates check constraint/.test(m) ? 'A value is outside the allowed range.' : m;
  if (e.code === '42501' || /row-level security/.test(m)) return 'Your role is not allowed to do this.';
  return 'Something went wrong. Please try again.';
}

// ---------- data tables ----------
async function list(k) {
  const m = M[k], s = S[k] ??= {q:'', f:{}, o:m.o, a:m.asc, p:1};
  const fl = await Promise.all(m.filt.map(async f => f.o
    ? `<select class="form-select" data-f="${f.k}"><option value="">All ${f.l.toLowerCase()}</option>${(await opts(f.o)).map(r => `<option value="${r[f.o.id]}"${s.f[f.k] == r[f.o.id] ? ' selected' : ''}>${esc(f.o.lbl(r))}</option>`).join('')}</select>`
    : `<input class="form-control" placeholder="${f.l}" data-f="${f.k}" value="${esc(s.f[f.k] || '')}">`));
  const can = !m.admin || isAdmin();
  $('#view').innerHTML = `
    <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3"><h1 class="h3 m-0">${m.title}</h1>${can ? `<button class="btn btn-primary" data-a="add">Add ${m.name.toLowerCase()}</button>` : ''}</div>
    <div class="row g-2 mb-3"><div class="col-12 col-md"><input id="q" class="form-control" placeholder="Search ${m.title.toLowerCase()}" value="${esc(s.q)}"></div>${fl.map(x => `<div class="col-6 col-md-3">${x}</div>`).join('')}</div>
    <div class="table-responsive"><table class="table table-hover align-middle"><thead><tr>${m.cols.map(c => `<th data-s="${c[2]}">${c[0]}${s.o === c[2] ? (s.a ? ' ▲' : ' ▼') : ''}</th>`).join('')}<th></th></tr></thead><tbody id="tb"></tbody></table></div>
    <div id="pg" class="d-flex justify-content-between align-items-center"></div>`;
  let t; $('#q').oninput = e => { clearTimeout(t); t = setTimeout(() => { s.q = e.target.value.trim(); s.p = 1; load(k); }, 300); };
  document.querySelectorAll('[data-f]').forEach(el => el.oninput = () => { s.f[el.dataset.f] = el.value.trim(); s.p = 1; load(k); });
  load(k);
}
async function load(k) {
  const m = M[k], s = S[k];
  let q = sb.from(m.src).select(m.sel || '*', {count:'exact'});
  if (s.q) q = q.or(m.search.map(c => `${c}.ilike.%${clean(s.q)}%`).join(','));
  for (const [c, v] of Object.entries(s.f)) if (v) q = m.filt.find(f => f.k === c).o ? q.eq(c, v) : q.ilike(c, `%${clean(v)}%`);
  const {data, count, error} = await q.order(s.o, {ascending:s.a}).range((s.p-1)*PS, s.p*PS-1);
  if (error) { console.error(error); return $('#tb').innerHTML = '<tr><td colspan="9" class="text-danger">Records could not be loaded. Refresh the page and try again.</td></tr>'; }
  const can = !m.admin || isAdmin();
  $('#tb').innerHTML = data.length ? data.map(r => `<tr>${m.cols.map(c => `<td>${cellHtml(c, r)}</td>`).join('')}
    <td class="text-nowrap text-end"><button class="btn btn-sm btn-outline-secondary" data-a="view" data-id="${r[m.pk]}">View</button>
    ${can ? `<button class="btn btn-sm btn-outline-primary" data-a="edit" data-id="${r[m.pk]}">Edit</button>` : ''}
    ${isAdmin() ? `<button class="btn btn-sm btn-outline-danger" data-a="del" data-id="${r[m.pk]}">Delete</button>` : ''}</td></tr>`).join('')
    : `<tr><td colspan="9" class="text-muted py-4">No records match. Clear the search or filters, or add a new record.</td></tr>`;
  const pages = Math.max(1, Math.ceil(count / PS));
  $('#pg').innerHTML = `<small class="text-muted">${count ? `Showing ${(s.p-1)*PS+1}-${Math.min(s.p*PS, count)} of ${count}` : '0 records'}</small>
    <div class="btn-group"><button class="btn btn-outline-secondary" data-p="${s.p-1}" ${s.p <= 1 ? 'disabled' : ''}>Previous</button><button class="btn btn-outline-secondary" disabled>Page ${s.p} of ${pages}</button><button class="btn btn-outline-secondary" data-p="${s.p+1}" ${s.p >= pages ? 'disabled' : ''}>Next</button></div>`;
}

// ---------- add / edit / view form ----------
async function openForm(k, mode, id) {
  const m = M[k]; let row = {};
  if (id) { const r = await sb.from(m.t).select('*').eq(m.pk, id).single(); if (r.error) return flash('The record could not be opened.', 'danger'); row = r.data; }
  const dis = mode === 'view' ? 'disabled' : '';
  const fs = await Promise.all(m.f.map(async f => {
    const inp = f.o
      ? `<select class="form-select" name="${f.k}" ${dis}><option value="">Select...</option>${(await opts(f.o)).map(r => `<option value="${r[f.o.id]}"${row[f.k] == r[f.o.id] ? ' selected' : ''}>${esc(f.o.lbl(r))}</option>`).join('')}</select>`
      : `<input class="form-control" name="${f.k}" type="${f.t || 'text'}" ${f.min != null ? `min="${f.min}"` : ''} ${f.max != null ? `max="${f.max}"` : ''} ${f.t === 'number' ? `step="${f.step || 'any'}"` : ''} value="${esc(row[f.k] ?? (mode === 'add' && f.def ? f.def() : ''))}" ${dis}>`;
    return `<div class="col-md-6"><label class="form-label">${f.l}${f.req && !dis ? ' *' : ''}</label>${inp}</div>`;
  }));
  $('#ft').textContent = {add:'Add', edit:'Edit', view:'View'}[mode] + ' ' + m.name.toLowerCase();
  $('#fb').innerHTML = `<form id="ff" novalidate class="row g-3">${fs.join('')}</form><div id="fe"></div>`;
  $('#fa').textContent = id ? `Created ${new Date(row.created_at).toLocaleString()} | Updated ${new Date(row.updated_at).toLocaleString()}` : '';
  $('#fs').classList.toggle('d-none', mode === 'view');
  $('#fs').onclick = () => save(k, id); $('#ff').onsubmit = e => { e.preventDefault(); save(k, id); };
  FM.show();
}
async function save(k, id) {
  const m = M[k], f = $('#ff'), v = {}, er = [];
  for (const d of m.f) {
    let x = f.elements[d.k].value.trim();
    if (!x) { if (d.req) er.push(`${d.l} is required.`); v[d.k] = null; continue; }
    if (d.t === 'number' || d.o) {
      const n = Number(x);
      if (Number.isNaN(n) || (d.min != null && n < d.min) || (d.max != null && n > d.max)) er.push(`${d.l} must be a number${d.min != null ? ' from ' + d.min : ''}${d.max != null ? ' to ' + d.max : ''}.`);
      x = n;
    } else if (d.t === 'date' && (isNaN(new Date(x)) || x > '2100-12-31')) er.push(`${d.l} must be a valid date.`);
    else if (d.t === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)) er.push('Email must be a valid address.');
    else if (d.t === 'tel' && !/^[0-9+() -]{7,20}$/.test(x)) er.push('Contact number may contain only digits, spaces, + ( ) and -.');
    v[d.k] = x;
  }
  if (!er.length && m.chk) await m.chk(v, er);
  const box = (t, c = 'danger') => $('#fe').innerHTML = `<div class="alert alert-${c} mt-3 mb-0">${t}</div>`;
  if (er.length) return box(`<ul class="mb-0">${er.map(e => `<li>${esc(e)}</li>`).join('')}</ul>`);
  const {error} = await (id ? sb.from(m.t).update(v).eq(m.pk, id) : sb.from(m.t).insert(v));
  if (error) return box(esc(errMsg(error, 'save')));
  FM.hide(); C = {}; flash(`${m.name} ${id ? 'updated' : 'added'}.`); list(k);
}
function del(k, id) {
  $('#dt').textContent = `Delete this ${M[k].name.toLowerCase()} record? This cannot be undone.`;
  $('#dok').onclick = async () => {
    const {error} = await sb.from(M[k].t).delete().eq(M[k].pk, id);
    DM.hide(); if (error) return flash(errMsg(error, 'delete'), 'danger');
    C = {}; flash(`${M[k].name} deleted.`); load(k);
  };
  DM.show();
}

// ---------- dashboard ----------
async function dash() {
  const [s, b, rp, rh] = await Promise.all([
    sb.from('v_dashboard_summary').select('*').single(), sb.from('v_planting_by_status').select('*'),
    sb.from('v_planting_details').select('*').order('planting_date', {ascending:false}).limit(5),
    sb.from('v_harvest_details').select('*').order('harvest_date', {ascending:false}).limit(5)]);
  if (s.error) { console.error(s.error); return $('#view').innerHTML = '<div class="alert alert-danger">The dashboard could not be loaded. Refresh the page and try again.</div>'; }
  const d = s.data, col = ['#8aa6c1','#2f6b3f','#d9a73a','#c4553f','#7a6a99'], tot = b.data.reduce((a, x) => a + x.total, 0);
  const card = (l, n, h) => `<div class="col-6 col-md-4 col-xl"><a class="stat" href="#${h}">${ICON[h] || ''}<b>${num(n)}</b>${l}</a></div>`;
  const tbl = (rows, cs) => `<div class="table-responsive"><table class="table table-sm mb-0"><tbody>${rows.map(r => `<tr>${cs.map(c => `<td>${esc(c(r))}</td>`).join('')}</tr>`).join('') || '<tr><td class="text-muted">No records yet.</td></tr>'}</tbody></table></div>`;
  $('#view').innerHTML = `<h1 class="h3 mb-3">Dashboard</h1>
    ${hero()}
    <div class="row g-3 mb-4">${card('Farmers', d.total_farmers, 'farmers')}${card('Farms', d.total_farms, 'farms')}${card('Crops', d.total_crops, 'crops')}${card('Planting records', d.total_plantings, 'plantings')}${card('Harvest records', d.total_harvests, 'harvests')}</div>
    <div class="row g-3 mb-4"><div class="col-md-7"><div class="panel h-100"><h2 class="h6">Plantings by status</h2>
      <div class="seg mb-2">${b.data.map((x, i) => x.total ? `<div data-sid="${x.status_id}" data-i="${i}" role="button" tabindex="0" title="${esc(x.status)}: ${x.total} (click for details)" style="flex:${x.total};background:${col[i]}"></div>` : '').join('')}</div>
      <div class="d-flex flex-wrap gap-3">${b.data.map((x, i) => `<span class="lg" data-sid="${x.status_id}" data-i="${i}" role="button" tabindex="0"><i class="dot" style="background:${col[i]}"></i>${esc(x.status)}: <b>${x.total}</b></span>`).join('')}</div>
      <small class="text-muted">${tot} planting records in total &middot; click a status to see its records</small></div></div>
      <div class="col-md-5"><div class="panel h-100"><h2 class="h6">Harvest totals</h2><b class="fs-3 d-block">${num(d.total_harvested_kg, 2)} kg</b><span>Estimated value ${money(d.total_estimated_value)}</span></div></div></div>
    <div class="row g-3"><div class="col-lg-6"><div class="panel"><h2 class="h6">Recent planting records</h2>${tbl(rp.data, [r => r.planting_date, r => r.crop_name, r => r.farm_name, r => r.status])}</div></div>
      <div class="col-lg-6"><div class="panel"><h2 class="h6">Recent harvest records</h2>${tbl(rh.data, [r => r.harvest_date, r => r.crop_name, r => num(r.quantity_kg, 2) + ' kg', r => r.quality_grade])}</div></div></div>`;
  bindStatus(b.data, col, tot);
  countUp();
}

// ---------- status details (click the bar or its legend on the dashboard) ----------
function bindStatus(rows, col, tot) {
  document.querySelectorAll('[data-sid]').forEach(el => {
    const go = () => openStatus(rows[+el.dataset.i], col[+el.dataset.i], tot);
    el.onclick = go;
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
}
async function openStatus(st, color, tot) {
  const el = $('#sm'); if (!el || !st) return;
  const {data, error} = await sb.from('v_planting_details').select('*').eq('status_id', st.status_id).order('planting_date', {ascending: false}).limit(1000);
  if (error) { console.error(error); return flash('The details could not be loaded. Please try again.', 'danger'); }
  const area = data.reduce((t, r) => t + Number(r.area_planted || 0), 0), pct = tot ? Math.round(st.total * 100 / tot) : 0;
  const box = (n, l) => `<div class="col-4"><div class="mini"><b>${n}</b>${l}</div></div>`;
  $('#st').innerHTML = `<i class="dot" style="background:${color}"></i>${esc(st.status)} plantings`;
  $('#sb').innerHTML = `<div class="row g-2 mb-3">${box(num(st.total), 'Planting records')}${box(pct + '%', 'Of all plantings')}${box(num(area, 2) + ' ha', 'Total area planted')}</div>`
    + (data.length
      ? `<div class="table-responsive"><table class="table table-sm align-middle mb-1"><thead><tr><th>Farm</th><th>Crop</th><th>Planted</th><th>Expected harvest</th><th class="text-end">Area (ha)</th></tr></thead><tbody>${data.slice(0, 10).map(r => `<tr><td>${esc(r.farm_name)}</td><td>${esc(r.crop_name)}${r.variety ? ' <small class="text-muted">(' + esc(r.variety) + ')</small>' : ''}</td><td>${esc(r.planting_date)}</td><td>${esc(r.expected_harvest_date)}</td><td class="text-end">${num(r.area_planted, 2)}</td></tr>`).join('')}</tbody></table></div><small class="text-muted">${data.length > 10 ? `Showing the latest 10 of ${data.length}.` : `Showing all ${data.length}.`}</small>`
      : `<p class="text-muted mb-0">No plantings have the status "${esc(st.status)}" yet.</p>`);
  $('#sgo').classList.toggle('d-none', !data.length);
  $('#sgo').onclick = () => { S.plantings = {q: '', f: {status_id: String(st.status_id)}, o: M.plantings.o, a: M.plantings.asc, p: 1}; bootstrap.Modal.getOrCreateInstance(el).hide(); location.hash = '#plantings'; };
  bootstrap.Modal.getOrCreateInstance(el).show();
}

// ---------- reports ----------
const R = {
  farmers: {l:'Farmers and their farms', v:'v_farmers_farms', o:'farmer_name', cols:[['Farmer','farmer_name'], ['Farmer address','farmer_address'], ['Farm','farm_name'], ['Farm city','farm_city'], ['Area (ha)', r => r.area_hectares && num(r.area_hectares, 2)], ['Irrigation','irrigation_type']]},
  crops: {l:'Crops planted per farm', v:'v_crops_per_farm', o:'farm_name', d:'last_planting_date', cols:[['Farm','farm_name'], ['Crop','crop_name'], ['Variety','variety'], ['Plantings','planting_count'], ['Area planted (ha)', r => num(r.total_area_planted, 2)], ['Last planted','last_planting_date']]},
  status: {l:'Planting records by status', v:'v_planting_details', o:'status_id', d:'planting_date', cols:[['Status','status'], ['Farm','farm_name'], ['Crop','crop_name'], ['Planted','planting_date'], ['Expected harvest','expected_harvest_date'], ['Area (ha)', r => num(r.area_planted, 2)]]},
  harvest: {l:'Harvest records', v:'v_harvest_details', o:'harvest_date', d:'harvest_date', cols:[['Date','harvest_date'], ['Farm','farm_name'], ['Crop','crop_name'], ['Qty (kg)', r => num(r.quantity_kg, 2)], ['Price/kg', r => money(r.selling_price_per_kg)], ['Grade','quality_grade'], ['Remarks','remarks']]},
  qty: {l:'Total harvested quantity', v:'v_harvest_details', o:'crop_name', d:'harvest_date', g:1, cols:[['Crop','k'], ['Harvests','n'], ['Total harvested (kg)', r => num(r.q, 2)]]},
  val: {l:'Estimated harvest value', v:'v_harvest_details', o:'crop_name', d:'harvest_date', g:1, cols:[['Crop','k'], ['Total (kg)', r => num(r.q, 2)], ['Estimated value', r => money(r.v)]]}
};
async function reports() {
  const s = S.rp ??= {k:'farmers', a:'', b:''};
  $('#view').innerHTML = `<h1 class="h3 mb-3">Reports</h1><div class="row g-2 mb-3 align-items-end">
    <div class="col-12 col-md-4"><label class="form-label">Report</label><select id="rk" class="form-select">${Object.entries(R).map(([k, r]) => `<option value="${k}"${s.k === k ? ' selected' : ''}>${r.l}</option>`).join('')}</select></div>
    <div class="col-6 col-md-2"><label class="form-label">From</label><input id="ra" type="date" class="form-control" value="${s.a}"></div>
    <div class="col-6 col-md-2"><label class="form-label">To</label><input id="rb" type="date" class="form-control" value="${s.b}"></div>
    <div class="col-auto"><button class="btn btn-outline-secondary" onclick="print()">Print</button></div>
    <div class="col-auto"><button id="rx" type="button" class="btn btn-outline-primary d-none">Export CSV</button></div></div><div id="rr"></div>`;
  ['rk','ra','rb'].forEach(i => $('#' + i).onchange = () => { s.k = $('#rk').value; s.a = $('#ra').value; s.b = $('#rb').value; run(); });
  phpServer().then(ok => { if (ok && $('#rx')) { $('#rx').classList.remove('d-none'); $('#rx').onclick = exportCsv; } });
  run();
}
// ---------- optional PHP features (only shown when the app runs on a PHP server) ----------
let phpCheck;
const phpServer = () => phpCheck ??= fetch('api/ping.php', {cache: 'no-store'}).then(r => r.ok ? r.json() : null).then(j => !!j && j.ok === true).catch(() => false);
async function exportCsv() {
  const s = S.rp, btn = $('#rx');
  btn.disabled = true;
  try {
    const {data: {session}} = await sb.auth.getSession();
    const res = await fetch('api/export.php', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-User-Token': session?.access_token || ''}, body: JSON.stringify({report: s.k, from: s.a, to: s.b})});
    if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Export failed.'); }
    const url = URL.createObjectURL(await res.blob()), link = document.createElement('a');
    link.href = url; link.download = `ais-${s.k}-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
    flash('CSV file downloaded.');
  } catch (e) { flash(e.message || 'Export failed.', 'danger'); }
  btn.disabled = false;
}
async function run() {
  const s = S.rp, r = R[s.k];
  if (s.a && s.b && s.a > s.b) return $('#rr').innerHTML = '<div class="alert alert-warning">The From date must not be after the To date.</div>';
  let q = sb.from(r.v).select('*');
  if (r.d) { if (s.a) q = q.gte(r.d, s.a); if (s.b) q = q.lte(r.d, s.b); }
  const {data, error} = await q.order(r.o).limit(1000);
  if (error) { console.error(error); return $('#rr').innerHTML = '<div class="alert alert-danger">The report could not be generated. Try again.</div>'; }
  let rows = data;
  if (r.g) {
    const g = {}; data.forEach(x => { const o = g[x.crop_name] ??= {k:x.crop_name, n:0, q:0, v:0}; o.n++; o.q += +x.quantity_kg; o.v += +x.estimated_value; });
    rows = Object.values(g); rows.push(rows.reduce((t, x) => ({k:'Total', n:t.n + x.n, q:t.q + x.q, v:t.v + x.v}), {k:'Total', n:0, q:0, v:0}));
  }
  $('#rr').innerHTML = `<div class="table-responsive"><table class="table table-striped"><thead><tr>${r.cols.map(c => `<th>${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((x, i) => `<tr${r.g && i === rows.length - 1 ? ' class="fw-bold"' : ''}>${r.cols.map(c => `<td>${cellHtml(c, x)}</td>`).join('')}</tr>`).join('') : `<tr><td class="text-muted" colspan="9">No records found for these dates.</td></tr>`}</tbody></table></div>
    <small class="text-muted">${r.g ? Math.max(rows.length - 1, 0) + ' crops' : rows.length + ' rows'}</small>`;
}

// ---------- auth + routing ----------
const show = id => ['login','app'].forEach(x => $('#' + x).classList.toggle('d-none', x !== id));
function route() {
  const k = location.hash.slice(1) || 'dashboard';
  document.querySelectorAll('[data-r]').forEach(a => a.classList.toggle('active', a.dataset.r === k));
  const nv = $('#nv'); if (nv.classList.contains('show')) bootstrap.Collapse.getOrCreateInstance(nv).hide(); // close the phone menu after a tap
  $('#msg').innerHTML = ''; (k === 'reports' ? reports : k === 'profile' ? profile : M[k] ? () => list(k) : dash)();
}
async function enter(u) {
  let {data, error} = await sb.from('profiles').select('full_name,role_id,avatar_path').eq('id', u.id).single();
  if (error) ({data} = await sb.from('profiles').select('full_name,role_id').eq('id', u.id).single());
  me = {id: u.id, email: u.email, name: data?.full_name || u.email, role_id: data?.role_id || 2, path: data?.avatar_path || null};
  paintWho(); show('app'); route();
}

// ---------- profile photo (optional), name, dark mode ----------
const initials = n => (String(n).trim().split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('') || '?').toUpperCase();
async function paintAv(el) {
  el.textContent = initials(me.name);
  if (!me.path) return;
  const {data} = await sb.storage.from('avatars').createSignedUrl(me.path, 3600);
  if (data?.signedUrl) el.innerHTML = `<img alt="" src="${esc(data.signedUrl)}">`;
}
function paintWho() {
  if (!$('#wn') || !$('#av')) return;
  $('#wn').textContent = `${me.name} (${isAdmin() ? 'Administrator' : 'Staff'})`;
  paintAv($('#av'));
}
function profile() {
  $('#view').innerHTML = `<h1 class="h3 mb-3">My profile</h1>
    <div class="panel" style="max-width:36rem">
      <div class="d-flex align-items-center gap-3 mb-4"><span id="pav" class="av av-lg"></span>
        <div><div class="fw-bold fs-5" id="pn"></div><div class="text-muted">${esc(me.email)}</div>
        <span class="badge text-bg-success">${isAdmin() ? 'Administrator' : 'Staff'}</span> <span id="pvtag" class="badge text-bg-warning d-none">Preview, not saved yet</span></div></div>
      <div id="pe"></div>
      <h2 class="h6">Profile photo <small class="text-muted fw-normal">(optional)</small></h2>
      <p class="small text-muted">Without a photo, your initials are shown. JPG, PNG or WebP. After choosing a file you can move, zoom and rotate it, and see a live preview before saving.</p>
      <input id="pf" type="file" accept="image/jpeg,image/png,image/webp" class="form-control mb-2">
      <div id="crop" class="crop d-none"><div class="crop-main">
        <div class="crop-stage"><canvas id="cv" width="520" height="520" tabindex="0" aria-label="Photo editor. Drag to move the photo, or use the arrow keys."></canvas><div class="crop-ring"></div></div>
        <div class="crop-side">
          <div class="small text-muted mb-2">Live preview (not saved yet)</div>
          <div class="d-flex align-items-center gap-2 mb-3"><canvas id="pv2" class="pvc" width="64" height="64"></canvas><span class="small text-muted">as it will look in the top bar</span></div>
          <label class="form-label small mb-1" for="zoom">Zoom</label>
          <input id="zoom" type="range" class="form-range" min="1" max="4" step="0.01" value="1">
          <div class="d-flex flex-wrap gap-2"><button id="rot" type="button" class="btn btn-outline-secondary btn-sm">Rotate</button><button id="rst" type="button" class="btn btn-outline-secondary btn-sm">Reset</button><button id="cn" type="button" class="btn btn-outline-danger btn-sm">Discard</button></div>
          <p class="small text-muted mt-2 mb-0">Drag the photo to move it. Use the slider or the mouse wheel to zoom. Nothing is saved until you press Save photo.</p>
        </div></div></div>
      <div class="d-flex gap-2 mb-4"><button id="pu" type="button" class="btn btn-primary btn-sm">Save photo</button>
        <button id="pr" type="button" class="btn btn-outline-danger btn-sm" ${me.path ? '' : 'disabled'}>Remove photo</button></div>
      <h2 class="h6">Display name</h2>
      <div class="d-flex gap-2"><input id="pname" class="form-control" maxlength="60" value="${esc(me.name)}">
        <button id="ps" type="button" class="btn btn-primary text-nowrap">Save name</button></div>
    </div>`;
  $('#pn').textContent = me.name; paintAv($('#pav'));
  const note = (t, c = 'danger') => $('#pe').innerHTML = `<div class="alert alert-${c}">${esc(t)}</div>`;
  const refresh = () => { paintWho(); paintAv($('#pav')); $('#pn').textContent = me.name; $('#pr').disabled = !me.path; };
  const save = async fields => { const {error} = await sb.from('profiles').update(fields).eq('id', me.id); if (error) throw error; };
  const why = e => {
    const m = String(e?.message || e);
    console.error(e);
    if (/bucket not found/i.test(m)) return 'Photo storage is not set up yet. Run 03_profile_and_photo.sql in Supabase, then try again.';
    if (/row-level security|unauthori[sz]ed|policy|permission|not allowed/i.test(m)) return 'Your account is not allowed to store a photo yet. Run 03_profile_and_photo.sql in Supabase, then try again.';
    if (/avatar_path|column|schema cache/i.test(m)) return 'The profile photo column is missing. Run 03_profile_and_photo.sql in Supabase, then try again.';
    if (/mime|exceed|too large|size/i.test(m)) return 'The storage rules rejected that image. Try a smaller or different image.';
    if (/decode|bitmap|source image|could not be (read|decoded)/i.test(m)) return 'That image could not be read. Try a JPG or PNG.';
    return 'The change could not be saved. Please try again.';
  };
  // ----- photo cropper: choose, move, zoom, rotate and preview BEFORE saving -----
  const V = 260; let cr = null, drag = null; // cr = the photo being edited: {src, w, h, base, z, x, y}
  const cv = $('#cv'), pv = $('#pv2');
  const clamp = () => { const s = cr.base * cr.z; cr.x = Math.min(0, Math.max(V - cr.w * s, cr.x)); cr.y = Math.min(0, Math.max(V - cr.h * s, cr.y)); };
  const drawTo = (c, size, clear = true) => { const x = c.getContext('2d'), k = size / V, s = cr.base * cr.z; if (clear) x.clearRect(0, 0, size, size); x.drawImage(cr.src, cr.x * k, cr.y * k, cr.w * s * k, cr.h * s * k); };
  const preview = () => { if (!cr) return; drawTo(cv, cv.width); drawTo(pv, pv.width); const big = $('#pvbig'); if (big) drawTo(big, big.width); };
  const startCrop = src => {
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, base = V / Math.min(w, h);
    cr = {src, w, h, base, z: 1, x: (V - w * base) / 2, y: (V - h * base) / 2};
    $('#zoom').value = 1; preview();
  };
  const setZoom = z => { const s0 = cr.base * cr.z, cx = (V / 2 - cr.x) / s0, cy = (V / 2 - cr.y) / s0; cr.z = z; const s1 = cr.base * z; cr.x = V / 2 - cx * s1; cr.y = V / 2 - cy * s1; clamp(); preview(); };
  const stopCrop = () => { cr = null; $('#crop').classList.add('d-none'); $('#pvtag').classList.add('d-none'); $('#pf').value = ''; paintAv($('#pav')); };
  const loadImg = async f => {
    try { return await createImageBitmap(f); }
    catch (e) { return await new Promise((ok, no) => { const i = new Image(), u = URL.createObjectURL(f); i.onload = () => { URL.revokeObjectURL(u); ok(i); }; i.onerror = () => no(new Error('could not be read')); i.src = u; }); }
  };
  const shrink = src => { // keep the editor quick, even for very large phone photos
    const w = src.naturalWidth || src.width, h = src.naturalHeight || src.height, k = 1600 / Math.max(w, h);
    if (k >= 1) return src;
    const c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(src, 0, 0, c.width, c.height); return c;
  };
  $('#pf').onchange = async () => {
    const f = $('#pf').files[0]; if (!f) return stopCrop();
    if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { $('#pf').value = ''; return note('Please choose a JPG, PNG or WebP image.'); }
    if (f.size > 8 * 1024 * 1024) { $('#pf').value = ''; return note('That image is too large. Please choose one under 8 MB.'); }
    try {
      const src = shrink(await loadImg(f));
      $('#pe').innerHTML = ''; $('#crop').classList.remove('d-none'); $('#pvtag').classList.remove('d-none');
      $('#pav').innerHTML = '<canvas id="pvbig" width="168" height="168"></canvas>'; // the big avatar above shows the preview too
      startCrop(src);
    } catch (e) { $('#pf').value = ''; note(why(e)); }
  };
  cv.onpointerdown = e => { if (!cr) return; drag = {x: e.clientX, y: e.clientY}; if (cv.setPointerCapture) cv.setPointerCapture(e.pointerId); };
  cv.onpointermove = e => { if (!drag || !cr) return; const f = V / (cv.clientWidth || V); cr.x += (e.clientX - drag.x) * f; cr.y += (e.clientY - drag.y) * f; drag = {x: e.clientX, y: e.clientY}; clamp(); preview(); };
  cv.onpointerup = cv.onpointercancel = () => { drag = null; };
  cv.onwheel = e => { if (!cr) return; e.preventDefault(); const z = Math.min(4, Math.max(1, cr.z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))); $('#zoom').value = z; setZoom(z); };
  cv.onkeydown = e => { const d = {ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10]}[e.key]; if (d && cr) { e.preventDefault(); cr.x += d[0]; cr.y += d[1]; clamp(); preview(); } };
  $('#zoom').oninput = e => { if (cr) setZoom(+e.target.value); };
  $('#rot').onclick = () => { if (!cr) return; const c = document.createElement('canvas'); c.width = cr.h; c.height = cr.w; const x = c.getContext('2d'); x.translate(c.width, 0); x.rotate(Math.PI / 2); x.drawImage(cr.src, 0, 0); startCrop(c); };
  $('#rst').onclick = () => { if (cr) startCrop(cr.src); };
  $('#cn').onclick = stopCrop;
  $('#pu').onclick = async () => {
    if (!cr) return note('Choose a photo first. You can also leave it empty and keep your initials.', 'info');
    try {
      const out = document.createElement('canvas'); out.width = out.height = 256;
      const x = out.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256); drawTo(out, 256, false);
      const blob = await new Promise(r => out.toBlob(r, 'image/jpeg', 0.88));
      if (!blob) throw new Error('could not be read');
      const path = `${me.id}/avatar.jpg`, up = await sb.storage.from('avatars').upload(path, blob, {upsert: true, contentType: 'image/jpeg'});
      if (up.error) throw up.error;
      await save({avatar_path: path});
      me.path = path; stopCrop(); refresh(); note('Photo saved.', 'success');
    } catch (e) { note(why(e)); }
  };
  $('#pr').onclick = async () => {
    if (!me.path) return;
    try { await sb.storage.from('avatars').remove([me.path]); await save({avatar_path: null}); me.path = null; refresh(); note('Photo removed. Your initials are shown instead.', 'success'); }
    catch (e) { note(why(e)); }
  };
  $('#ps').onclick = async () => {
    const n = $('#pname').value.trim();
    if (!n) return note('Display name cannot be empty.');
    try { await save({full_name: n}); me.name = n; refresh(); note('Name saved.', 'success'); }
    catch (e) { note(why(e)); }
  };
}
const root = document.documentElement;
const SUN = '<svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg>';
const MOON = '<svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9.5" fill="currentColor"/><circle cx="8.8" cy="9.2" r="1.9" fill="#000" opacity=".16"/><circle cx="15.2" cy="13.6" r="2.3" fill="#000" opacity=".14"/><circle cx="9.6" cy="16" r="1.2" fill="#000" opacity=".14"/></svg>';
function theme(t, keep) { // the icon shows the CURRENT mode: sun = light, full moon = dark
  root.setAttribute('data-bs-theme', t);
  const b = $('#theme');
  if (b) { b.innerHTML = t === 'dark' ? MOON : SUN; const l = t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'; b.title = l; b.setAttribute('aria-label', l); }
  if (keep) try { localStorage.setItem('theme', t); } catch (e) {}
}
if ($('#theme')) $('#theme').onclick = () => theme(root.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark', true);
theme(root.getAttribute('data-bs-theme') || 'light');
// ---------- extra life: scene, icons, chips, count-up ----------
const wheat = (x, c) => `<g class="wheat ${c}"><path d="M${x} 176V148" stroke="#d9a73a" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="${x}" cy="143" rx="4" ry="8" fill="#d9a73a"/><ellipse cx="${x - 5}" cy="151" rx="3" ry="6" fill="#d9a73a" transform="rotate(-25 ${x - 5} 151)"/><ellipse cx="${x + 5}" cy="151" rx="3" ry="6" fill="#d9a73a" transform="rotate(25 ${x + 5} 151)"/></g>`;
const tree = x => `<rect x="${x - 2}" y="112" width="4" height="18" fill="#6b4a2b"/><circle cx="${x}" cy="106" r="13" fill="#245532"/><circle cx="${x - 7}" cy="113" r="9" fill="#2c6a3d"/><circle cx="${x + 7}" cy="113" r="9" fill="#2c6a3d"/>`;
const cloud = (x, y, s, c) => `<g class="cloud ${c}" fill="#fff" opacity=".85"><ellipse cx="${x}" cy="${y}" rx="${34 * s}" ry="${11 * s}"/><ellipse cx="${x + 26 * s}" cy="${y - 9 * s}" rx="${22 * s}" ry="${10 * s}"/><ellipse cx="${x - 22 * s}" cy="${y - 6 * s}" rx="${20 * s}" ry="${9 * s}"/></g>`;
const bird = (x, y, c) => `<g transform="translate(${x} ${y})"><g class="bird ${c}"><path d="M0 0q6-7 12 0q6-7 12 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g></g>`;
const rays = Array.from({length: 12}, (_, k) => { const t = k * Math.PI / 6; return `<path d="M${(820 + Math.cos(t) * 40).toFixed(1)} ${(62 + Math.sin(t) * 40).toFixed(1)}L${(820 + Math.cos(t) * 53).toFixed(1)} ${(62 + Math.sin(t) * 53).toFixed(1)}"/>`; }).join('');
let wx = ''; // weather state of the scenes: '' (clear) | 'gloom' (about to rain) | 'gloom raining'
const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const stars = Array.from({length: 72}, () => `<circle cx="${(rnd() * 1600).toFixed(0)}" cy="${(rnd() * 175 - 90).toFixed(0)}" r="${(1 + rnd() * 1.4).toFixed(1)}" fill="#fff" style="animation-delay:-${(rnd() * 3).toFixed(1)}s"/>`).join('');
const drops = Array.from({length: 96}, () => `<path class="drop" d="M${(rnd() * 1700).toFixed(0)} ${(rnd() * 240 - 90).toFixed(0)}l-6 16" stroke="#d6ebff" stroke-width="1.6" stroke-linecap="round" fill="none" style="animation-duration:${(0.7 + rnd() * 0.5).toFixed(2)}s;animation-delay:-${(rnd() * 1.2).toFixed(2)}s"/>`).join('');
const flies = Array.from({length: 9}, (_, k) => `<circle class="firefly" cx="${620 + k * 105}" cy="${150 + (k % 3) * 11}" r="2.2" fill="#f5e27a" style="animation-delay:-${(k * .7).toFixed(1)}s"/>`).join('');
const bolt = (x, y, k, s) => `<g transform="translate(${x} ${y}) scale(${s})"><path class="bolt ${k}" d="M0 0L-12 36L-1 36L-16 82L12 30L1 30L10 0Z" fill="#fff7c2"/></g>`;
const SCENE = '<svg viewBox="0 0 1600 190" preserveAspectRatio="xMidYMax slice" aria-hidden="true">'
  + `<g class="stars">${stars}</g>`
  + `<g class="nightobj"><circle cx="820" cy="62" r="42" fill="#ece8d0" opacity=".12"/><g class="moon"><circle cx="820" cy="62" r="27" fill="#ece8d0"/><circle cx="811" cy="54" r="5" fill="#9aa0a8" opacity=".35"/><circle cx="830" cy="70" r="6.5" fill="#9aa0a8" opacity=".3"/><circle cx="813" cy="73" r="3.2" fill="#9aa0a8" opacity=".3"/></g></g>`
  + `<g class="dayobj"><g class="rays" stroke="#d9a73a" stroke-width="4" stroke-linecap="round">${rays}</g><circle class="sun" cx="820" cy="62" r="28" fill="#d9a73a"/></g>`
  + cloud(600, 48, 1.1, 'c1') + cloud(990, 92, .8, 'c2') + cloud(1400, 44, 1, 'c3') + bird(300, 34, 'b1') + bird(380, 58, 'b2') + bird(150, 70, 'b3')
  + bolt(618, 54, 'k1', 1) + bolt(990, 100, 'k2', .7)
  + '<g class="ground">'
  + '<path d="M0 125Q200 85 420 118T840 108T1260 120T1600 110V190H0Z" fill="#3f7d50"/>'
  + tree(760) + tree(805) + tree(880) + tree(1300) + tree(1350)
  + '<path d="M0 150Q260 118 520 145T1040 138T1600 148V190H0Z" fill="#2c6a3d"/>'
  + '<rect x="1000" y="112" width="48" height="30" fill="#b3412e"/><path d="M996 112L1024 90L1052 112Z" fill="#8f2f1f"/><rect x="1015" y="124" width="18" height="18" fill="#f2e8d5"/><path d="M1015 124L1033 142M1033 124L1015 142" stroke="#b3412e" stroke-width="2"/>'
  + '<rect x="1058" y="102" width="16" height="40" fill="#cfd8cc"/><path d="M1058 102a8 8 0 0 1 16 0z" fill="#9fb0a2"/>'
  + [1150, 1180, 1210, 1240, 1270].map(x => `<rect x="${x}" y="132" width="3" height="16" fill="#d9c9a3"/>`).join('') + '<rect x="1150" y="137" width="123" height="2" fill="#d9c9a3"/><rect x="1150" y="143" width="123" height="2" fill="#d9c9a3"/>'
  + '<path d="M0 168Q400 152 800 166T1600 164V190H0Z" fill="#1f4d2c"/>'
  + '<path d="M0 174Q400 160 800 172T1600 170M0 181Q400 168 800 178T1600 176M0 187Q400 176 800 184T1600 182" fill="none" stroke="#2f6b3f" stroke-width="3" opacity=".8"/>'
  + Array.from({length: 17}, (_, k) => wheat(580 + k * 60, 'w' + (k % 4 + 1))).join('')
  + '</g>'
  + flies + `<g class="rain">${drops}</g>`
  + '<rect class="flash" x="-5000" y="-5000" width="10000" height="10000" fill="#fff"/></svg>';
const TIPS = ['Record each harvest on the day it happens so totals stay accurate.', 'Update a planting to Harvested once its harvest is recorded.', 'Check the Reports page for harvest value by crop.', 'Keep farm areas current so planting area checks stay correct.', 'Use the filters on any list to find records in seconds.', 'Choose a quality grade for every harvest to keep reports meaningful.'];
const ico = d => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  farmers: ico('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>'),
  farms: ico('<path d="M3 11l9-7 9 7v10H3z"/><path d="M9 21v-6h6v6"/>'),
  crops: ico('<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15"/><path d="M5 19l8-8"/>'),
  plantings: ico('<path d="M12 21V11"/><path d="M12 11C12 7 9 5 5 5c0 4 3 6 7 6z"/><path d="M12 14c0-3 2-5 6-5 0 3-2 5-6 5z"/>'),
  harvests: ico('<path d="M3 10h18l-2 10H5z"/><path d="M8 10l3-6M16 10l-3-6"/>')
};
const hero = () => {
  const h = new Date().getHours(), hi = h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const who = String(me.name || '').split(/[\s@]/)[0] || 'there';
  const day = new Date().toLocaleDateString('en-PH', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'});
  return `<div class="hero mb-4 ${wx}">${SCENE}<div class="hero-text"><div class="hero-hi">${hi}, ${esc(who)}</div><div class="hero-sub">${day}</div><div class="hero-tip">Tip: ${TIPS[new Date().getDate() % TIPS.length]}</div></div></div>`;
};
const CHIPS = ['Status', 'Grade'];
function cellHtml(c, r) {
  const v = typeof c[1] === 'function' ? c[1](r) : r[c[1]];
  return CHIPS.includes(c[0]) && v ? `<span class="chip chip-${String(v).toLowerCase().replace(/[^a-z0-9]+/g, '-')}">${esc(v)}</span>` : esc(v);
}
function countUp() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.querySelectorAll('.stat b').forEach(el => {
    const to = Number(el.textContent.replace(/,/g, '')), t0 = performance.now();
    if (!to) return;
    const step = t => { const p = Math.min((t - t0) / 800, 1); el.textContent = num(Math.round(to * (1 - Math.pow(1 - p, 3)))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
if ($('#lscene')) $('#lscene').innerHTML = SCENE.replace('viewBox="0 0 1600 190"', 'viewBox="440 -90 800 280"');
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) { // 10 s clear (sun/moon sinks at 8.5 s), 5 s of rain, repeat; thunder on every second rain
  let rains = 0;
  const set = c => { wx = c; document.querySelectorAll('.hero').forEach(el => { ['gloom', 'raining', 'thunder'].forEach(k => el.classList.toggle(k, c.includes(k))); }); };
  const cycle = () => { setTimeout(() => set('gloom'), 8500); setTimeout(() => set('gloom raining' + (++rains % 2 === 0 ? ' thunder' : '')), 10000); setTimeout(() => { set(''); cycle(); }, 15000); };
  cycle();
}
let wasDark = false; // reports always print on a light page
window.onbeforeprint = () => { wasDark = root.getAttribute('data-bs-theme') === 'dark'; if (wasDark) root.setAttribute('data-bs-theme', 'light'); };
window.onafterprint = () => { if (wasDark) root.setAttribute('data-bs-theme', 'dark'); };
// ---------- sign in: say what really went wrong ----------
const notConnected = !cfg || !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || /YOUR-PROJECT-ID|YOUR-ANON/.test(JSON.stringify(cfg));
const NOT_REGISTERED = 'We could not find an account with that email. Please check the spelling. If you think this is a mistake, contact your administrator.';
async function badCredentialsMsg(email) { // right email + wrong password, or no such account?
  try { const {data, error} = await sb.rpc('account_exists', {p_email: email}); if (!error && data === false) return NOT_REGISTERED; }
  catch (e) { console.error(e); }
  return 'Incorrect email or password.'; // also used if 04_account_check.sql has not been run
}
const loginMsg = (t, c = 'danger') => $('#le').innerHTML = `<div class="alert alert-${c}">${esc(t)}</div>`;
function whyLoginFailed(err) {
  console.error(err);
  const m = String(err?.message || ''), code = err?.code || '', st = err?.status;
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(m)) return 'This account\'s email has not been confirmed yet. Ask your administrator to confirm it.';
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(m)) return 'Incorrect email or password.';
  if (st === 401 || st === 403 || /invalid api key|apikey/i.test(m)) return 'The Supabase key in config.js was rejected. Check that you pasted the publishable key correctly.';
  if (!st || st === 0 || st >= 500 || /failed to fetch|network|timeout/i.test(m)) return 'Could not reach the database. Check your internet connection and that the Supabase project is not paused.';
  return 'Sign in failed. Please try again.';
}
if (notConnected) loginMsg('This copy is not connected to Supabase yet. Open config.js and paste your Project URL and publishable key, then refresh.', 'warning');
$('#lf').onsubmit = async e => {
  e.preventDefault();
  if (notConnected) return loginMsg('This copy is not connected to Supabase yet. Open config.js and paste your Project URL and publishable key, then refresh.', 'warning');
  $('#le').innerHTML = '';
  try {
    const email = $('#em').value.trim(), {data, error} = await sb.auth.signInWithPassword({email, password: $('#pw').value});
    if (error) return loginMsg(error.code === 'invalid_credentials' || /invalid login credentials/i.test(error.message || '') ? await badCredentialsMsg(email) : whyLoginFailed(error));
    $('#pw').value = ''; setPw(false);
    enter(data.user).catch(err => { console.error(err); show('login'); loginMsg('You signed in, but the page could not load. Refresh with Ctrl+F5 and try again.'); });
  } catch (err) { loginMsg(whyLoginFailed(err)); }
};
// ---------- show / hide password (eye icon) ----------
const EYE_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_SHUT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10c2.2 3.4 5.4 5 9 5s6.8-1.6 9-5"/><path d="M5.2 14.2l-1.9 2.1M9.6 16.1l-.8 2.7M14.4 16.1l.8 2.7M18.8 14.2l1.9 2.1"/></svg>';
function setPw(show) { // show = true: letters visible, eye open. show = false: hidden, eye shut.
  const i = $('#pw'), b = $('#pwt'); if (!i || !b) return;
  i.type = show ? 'text' : 'password';
  b.innerHTML = show ? EYE_OPEN : EYE_SHUT; b.setAttribute('aria-pressed', show); b.title = show ? 'Hide password' : 'Show password'; b.setAttribute('aria-label', b.title);
}
if ($('#pwt')) { $('#pwt').onclick = () => { const i = $('#pw'), n = i.type === 'password'; setPw(n); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }; setPw(false); }
$('#out').onclick = async () => { await sb.auth.signOut(); C = {}; S = {}; me = {role_id: 2}; location.hash = ''; show('login'); setPw(false); };
window.onhashchange = () => !$('#app').classList.contains('d-none') && route();
$('#view').onclick = e => {
  const b = e.target.closest('[data-a],[data-p],[data-s]'); if (!b) return;
  const k = location.hash.slice(1), s = S[k];
  if (b.dataset.a === 'add') openForm(k, 'add');
  else if (b.dataset.a === 'del') del(k, b.dataset.id);
  else if (b.dataset.a) openForm(k, b.dataset.a, b.dataset.id);
  else if (b.dataset.p) { s.p = +b.dataset.p; load(k); }
  else if (b.dataset.s) { s.a = s.o === b.dataset.s ? !s.a : true; s.o = b.dataset.s; s.p = 1; list(k); }
};
sb.auth.getSession().then(({data}) => data.session ? enter(data.session.user) : show('login'));

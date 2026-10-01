// Dipakai oleh index.html (viewer) dan edit.html (admin).
// Fitur edit hanya aktif kalau scripts/editor.js dimuat (window.Editor ada).
const DATA_URL = "data.json";
let db = { people: {}, pivot: null, seq: 0, trail: [] };
let notice = null; // { text, buttons: [{label, fn}] }

const P = (id) => db.people[id];
const $ = (id) => document.getElementById(id);

// migrasi data lama + pastikan hubungan pasangan selalu dua arah & statusnya sama
function normalize() {
  let max = -1;
  Object.values(db.people).forEach((p) => {
    if (typeof p.order !== "number") p.order = ++max;
    else max = Math.max(max, p.order);
    if (p.adopted) {
      p.foster = true; // migrasi: "anak angkat" -> "anak asuh"
      delete p.adopted;
    }
    if (!Array.isArray(p.spouses)) {
      p.spouses = [];
      if (p.spouse) p.spouses.push({ id: p.spouse, status: "married" });
      if (Array.isArray(p.exSpouses))
        p.exSpouses.forEach((id) => p.spouses.push({ id, status: "divorced" }));
    }
  });
  if (typeof db.seq !== "number") db.seq = max + 1;
  const all = Object.values(db.people);
  all.forEach((p) => {
    p.spouses = p.spouses.filter((s) => P(s.id));
  });
  all.forEach((p) =>
    p.spouses.slice().forEach((s) => {
      const q = P(s.id),
        r = q.spouses.find((x) => x.id === p.id);
      if (!r) q.spouses.push({ id: p.id, status: s.status });
      else if (r.status !== s.status) r.status = s.status = "divorced";
    }),
  );
  if (!Array.isArray(db.trail)) db.trail = [];
}

// normalisasi objek data tanpa mengganggu db yang sedang aktif
function norm(d) {
  const tmp = db;
  db = d;
  normalize();
  db = tmp;
  return d;
}

// ---------- Muat data ----------
async function fetchData() {
  try {
    // ?t= dan no-store supaya tidak kena cache GitHub Pages
    const r = await fetch(DATA_URL + "?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.people ? norm(d) : null;
  } catch (e) {
    return null;
  }
}

// Cadangan untuk debug lewat file:// (fetch diblok): pilih data.json manual
function pickJson(cb) {
  const i = document.createElement("input");
  i.type = "file";
  i.accept = ".json,application/json";
  i.onchange = () => {
    const f = i.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d.people) throw 0;
        cb(norm(d));
      } catch (e) {
        alert("File tidak valid.");
      }
    };
    r.readAsText(f);
  };
  i.click();
}

// ---------- Posisi terakhir (pivot) ----------
// Disimpan terpisah dari draf editor, jadi viewer juga ingat posisinya saat refresh.
const NAV_KEY = "silsilah_nav";
function saveNav() {
  try {
    localStorage.setItem(
      NAV_KEY,
      JSON.stringify({ pivot: db.pivot, trail: db.trail }),
    );
  } catch (e) {}
}
// panggil setelah db terisi dan sebelum render() pertama
function applyNav() {
  try {
    const n = JSON.parse(localStorage.getItem(NAV_KEY));
    if (n && P(n.pivot)) {
      db.pivot = n.pivot;
      db.trail = Array.isArray(n.trail) ? n.trail : [];
    }
  } catch (e) {}
}

function setNotice(n) {
  notice = n;
}
function drawBanner() {
  const bn = $("banner");
  bn.hidden = !notice;
  bn.replaceChildren();
  if (!notice) return;
  bn.append(notice.text);
  notice.buttons.forEach((b) => {
    bn.append(el("br"));
    const x = el("button", "", b.label);
    x.onclick = b.fn;
    bn.append(x);
  });
}

// hanya editor yang menyimpan draf ke localStorage
function save() {
  if (window.Editor) window.Editor.persist();
}

// ---------- Tampilan ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function years(p) {
  return p.born || p.died
    ? (p.born || "?") + (p.died ? " – " + p.died : "")
    : "";
}

// list: saudara sekandung yang tampil bersama (untuk tombol geser urutan). kid: anak dari pivot (breadcrumb ikut pivot/sisi kiri)
function personCard(p, pivot, cls, tag, list, kid) {
  const E = window.Editor;
  const w = el("div", "cw" + (E ? "" : " ro") + (cls ? " " + cls : ""));
  const b = el(
    pivot && !E ? "div" : "button",
    "card " +
      p.g +
      (pivot ? " pivot" : "") +
      (p.foster ? " foster" : "") +
      (cls ? " " + cls : ""),
  );
  b.append(el("b", "", p.name));
  if (years(p)) b.append(el("small", "", years(p)));
  if (tag) b.append(el("small", "", tag));
  if (p.foster) b.append(el("small", "fl", "")); //Ket anak asuh
  if (p.note) b.append(el("small", "", p.note));
  if (pivot) {
    if (E) {
      b.onclick = () => E.openForm({ mode: "edit", id: p.id });
      b.title = "Klik untuk edit";
    }
  } else {
    b.onclick = () => go(p.id, kid);
    b.title = "Buka keluarga " + p.name;
  }
  w.append(b);
  if (E) {
    const acts = el("div", "acts");
    const ed = el("button", "", "✎");
    ed.title = "Edit " + p.name;
    ed.setAttribute("aria-label", "Edit " + p.name);
    ed.onclick = () => E.openForm({ mode: "edit", id: p.id });
    if (list && list.length > 1) {
      const i = list.indexOf(p);
      const up = el("button", "", "▲"),
        dn = el("button", "", "▼");
      up.title = "Lebih tua (naikkan urutan)";
      dn.title = "Lebih muda (turunkan urutan)";
      up.disabled = i <= 0;
      dn.disabled = i >= list.length - 1;
      up.onclick = () => E.move(list, i, -1);
      dn.onclick = () => E.move(list, i, 1);
      acts.append(up, ed, dn);
    } else acts.append(ed);
    w.append(acts);
  }
  return w;
}

function defChain(id) {
  const c = [],
    seen = new Set();
  let p = P(id);
  while (p && !seen.has(p.id)) {
    seen.add(p.id);
    c.unshift(p.id);
    p = P(p.father) || P(p.mother);
  }
  return c;
}
// Jejak navigasi: klik anak = ikut jalur pivot saat ini (sisi kiri), bukan otomatis ayah.
function go(id, kid) {
  let t = Array.isArray(db.trail) ? db.trail : [];
  const valid = t.length && t[t.length - 1] === db.pivot;
  if (kid && valid && !t.includes(id)) t = [...t, id];
  else {
    const i = t.indexOf(id);
    t = valid && i >= 0 ? t.slice(0, i + 1) : defChain(id);
  }
  db.trail = t;
  db.pivot = id;
  save();
  render();
  window.scrollTo(0, 0);
}

function familyGroups(piv) {
  const spouses = (piv.spouses || [])
    .map((s) => ({ ...s, p: P(s.id) }))
    .filter((s) => s.p);
  const people = Object.values(db.people);
  const groups = spouses.map((s) => {
    const partner = s.p;
    const together = people
      .filter(
        (k) =>
          (k.father === piv.id || k.mother === piv.id) &&
          (k.father === partner.id || k.mother === partner.id),
      )
      .sort((a, b) => a.order - b.order);
    const stepkids = people
      .filter(
        (k) =>
          (k.father === partner.id || k.mother === partner.id) &&
          k.father !== piv.id &&
          k.mother !== piv.id,
      )
      .sort((a, b) => a.order - b.order);
    return { status: s.status, partner, together, stepkids };
  });
  const partnerIds = new Set(spouses.map((s) => s.id));
  const solo = people
    .filter((k) => {
      if (!(k.father === piv.id || k.mother === piv.id)) return false;
      const other = k.father === piv.id ? k.mother : k.father;
      return !other || !partnerIds.has(other);
    })
    .sort((a, b) => a.order - b.order);
  return { groups, solo };
}

function kidCol(kids, extraCls, extraTag, addFn, kid) {
  const col = el("div", "col");
  kids.forEach((k) =>
    col.append(personCard(k, false, extraCls, extraTag, kids, kid)),
  );
  if (addFn) {
    const add = el("button", "card ghost", "+ Tambah anak");
    add.onclick = addFn;
    col.append(add);
  }
  return col;
}

function render() {
  const E = window.Editor;
  drawBanner();
  const all = Object.values(db.people).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const pick = $("pick");
  pick.replaceChildren(new Option("Lompat ke…", ""));
  all.forEach((p) => pick.add(new Option(p.name, p.id)));

  const crumbs = $("crumbs"),
    main = $("main");
  crumbs.replaceChildren();
  main.replaceChildren();
  const piv = P(db.pivot);

  if (!piv) {
    crumbs.textContent = "/";
    const e = el("div", "empty");
    if (E) {
      e.append(
        el(
          "p",
          "",
          "Belum ada data. Mulai dari orang paling atas yang kamu ketahui, misalnya kakek.",
        ),
      );
      const b = el("button", "primary", "Tambah orang pertama");
      b.onclick = () => E.openForm({ mode: "new", rel: "root" });
      e.append(b);
    } else e.append(el("p", "", "Belum ada data untuk ditampilkan."));
    main.append(e);
    return;
  }

  let t = (db.trail || []).filter((x) => P(x));
  if (t[t.length - 1] !== piv.id) t = defChain(piv.id);
  db.trail = t;
  saveNav();
  // trail tetap utuh (supaya "naik" bisa terus sampai atas),
  // tapi yang ditampilkan cuma 3 terakhir: 2 di atas + orang sekarang
  const chain = t.map(P);
  const shown = chain.slice(-3);
  crumbs.append(el("span", "sep", chain.length > shown.length ? "… /" : "/"));
  shown.forEach((p, i) => {
    if (i === shown.length - 1) {
      const c = el("span", "cur crumb", p.name);
      c.title = p.name;
      crumbs.append(c);
    } else {
      const b = el("button", "crumb", p.name);
      b.title = p.name;
      b.onclick = () => go(p.id);
      crumbs.append(b, el("span", "sep", "/"));
    }
  });
  if (chain.length > 1) {
    const up = el("button", "up", ".. naik");
    up.onclick = () => go(chain[chain.length - 2].id);
    crumbs.append(up);
  }

  const f = P(piv.father),
    m = P(piv.mother);
  const pr = el("div", "parents", "Orang tua: ");
  [f, m]
    .filter(Boolean)
    .sort((a, b) => a.order - b.order)
    .forEach((p, i) => {
      if (i) pr.append(" & ");
      const b = el("button", "", p.name);
      b.onclick = () => go(p.id);
      pr.append(b);
    });
  if (E && (!f || !m)) {
    const b = el(
      "button",
      "",
      "+ tambah " + (!f && !m ? "orang tua" : !f ? "ayah" : "ibu"),
    );
    b.onclick = () =>
      E.openForm({
        mode: "new",
        rel: "parent",
        ref: piv.id,
        g: !f ? "L" : "P",
      });
    pr.append(b);
  }
  main.append(pr);

  main.append(el("div", "lbl", "Pasangan & Anak"));
  const { groups, solo } = familyGroups(piv);

  groups.forEach((g) => {
    const fam = el("div", "fam"),
      couple = el("div", "couple");
    couple.append(personCard(piv, true));
    const married = g.status === "married";
    couple.append(
      el("span", "heart", married ? "💚" : "💔"),
      personCard(
        g.partner,
        false,
        married ? null : "step",
        married ? null : "", //Ket cerai
      ),
    );
    if (E) {
      const bd = el("button", "", married ? "Cerai" : "Rujuk");
      bd.onclick = () =>
        E.setStatus(piv, g.partner.id, married ? "divorced" : "married");
      couple.append(bd);
    }
    fam.append(couple);

    if (E || g.together.length) {
      fam.append(
        el(
          "div",
          "sub",
          "Anak bersama " + g.partner.name + " (" + g.together.length + ")",
        ),
      );
      fam.append(
        kidCol(
          g.together,
          null,
          null,
          E
            ? () =>
                E.openForm({
                  mode: "new",
                  rel: "child",
                  ref: piv.id,
                  partner: g.partner.id,
                })
            : null,
          true,
        ),
      );
    }
    if (g.stepkids.length) {
      fam.append(
        el(
          "div",
          "sub",
          "Anak " +
            g.partner.name +
            " dari sebelumnya (" +
            g.stepkids.length +
            ")",
        ),
      );
      fam.append(kidCol(g.stepkids, "step", "", null, false)); //Ket anak tiri
    }
    main.append(fam);
  });

  if (E) {
    const addSp = el("button", "card ghost", "+ Tambah pasangan");
    addSp.onclick = () =>
      E.openForm({
        mode: "new",
        rel: "spouse",
        ref: piv.id,
        g: piv.g === "L" ? "P" : "L",
      });
    main.append(addSp);
  }

  if (E ? solo.length || !groups.length : solo.length) {
    main.append(
      el(
        "div",
        "sub",
        "Anak lainnya / tanpa pasangan tercatat (" +
          solo.length +
          ")" +
          (E ? " — klik ✎ lalu isi Ayah/Ibu untuk memindahkan" : ""),
      ),
    );
    main.append(
      kidCol(
        solo,
        null,
        null,
        E ? () => E.openForm({ mode: "new", rel: "child", ref: piv.id }) : null,
        true,
      ),
    );
  }
  if (!E && !groups.length && !solo.length)
    main.append(el("p", "sub", "Tidak ada pasangan atau anak tercatat."));
}

$("pick").onchange = (e) => {
  if (e.target.value) go(e.target.value);
};

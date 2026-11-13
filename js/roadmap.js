// N°98 Maps: roadmap / takenlijst in de werkbank (knop ☑ in de kop).
// Opgeslagen in Supabase (tabel roadmap_items, alleen voor ingelogde accounts),
// dus op elk apparaat dezelfde lijst. Afvinken, toevoegen en verwijderen.
(() => {
  function ready(fn) { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); }
  ready(() => {
    const btn = document.getElementById('roadmapBtn');
    const dlg = document.getElementById('roadmapDialog');
    if (!btn || !dlg) return;
    const list = document.getElementById('roadmapList');
    const count = document.getElementById('roadmapCount');
    const status = document.getElementById('roadmapStatus');
    const form = document.getElementById('roadmapAddForm');
    const input = document.getElementById('roadmapAddInput');
    let items = [];
    const sb = () => window.n98sb;

    function render() {
      // open taken eerst, afgevinkte onderaan; binnen elke groep op volgorde
      const sorted = items.slice().sort((a, b) => (a.done - b.done) || (a.position - b.position));
      list.innerHTML = '';
      sorted.forEach((it) => {
        const li = document.createElement('li');
        li.className = it.done ? 'done' : '';
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = it.done;
        cb.addEventListener('change', () => toggle(it, cb.checked));
        const t = document.createElement('span');
        t.className = 'roadmap-title'; t.textContent = it.title;
        label.append(cb, t);
        const del = document.createElement('button');
        del.type = 'button'; del.className = 'roadmap-del'; del.textContent = '✕';
        del.title = 'Verwijderen'; del.setAttribute('aria-label', 'Verwijder ' + it.title);
        del.addEventListener('click', () => remove(it));
        li.append(label, del);
        list.append(li);
      });
      const done = items.filter((i) => i.done).length;
      count.textContent = items.length ? done + ' van ' + items.length + ' afgerond' : '';
    }
    async function load() {
      status.textContent = 'Laden…';
      const { data, error } = await sb().from('roadmap_items').select('*').order('position');
      if (error) { status.textContent = 'Kon de lijst niet laden: ' + error.message; return; }
      items = data || []; status.textContent = ''; render();
    }
    async function toggle(it, done) {
      it.done = done; render();
      const { error } = await sb().from('roadmap_items').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', it.id);
      if (error) { status.textContent = 'Opslaan mislukt: ' + error.message; it.done = !done; render(); }
    }
    async function remove(it) {
      if (!window.confirm('Taak verwijderen?\n\n' + it.title)) return;
      const { error } = await sb().from('roadmap_items').delete().eq('id', it.id);
      if (error) { status.textContent = 'Verwijderen mislukt: ' + error.message; return; }
      items = items.filter((x) => x.id !== it.id); render();
    }
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = input.value.trim();
      if (!title) return;
      const position = items.reduce((m, i) => Math.max(m, i.position), 0) + 1;
      const { data, error } = await sb().from('roadmap_items').insert({ title, position }).select().single();
      if (error) { status.textContent = 'Toevoegen mislukt: ' + error.message; return; }
      items.push(data); input.value = ''; render();
    });
    btn.addEventListener('click', () => { dlg.showModal(); load(); });
    document.getElementById('roadmapClose').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  });
})();

// Schakelt tussen de twee hoofdweergaven: Playground (alle generatieve
// algoritmes) en Locatie (kaart-kunst). Losstaand van beide, zodat main.js
// en location.js niets van elkaar hoeven te weten.
(() => {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(() => {
    const tabs = { playground: document.getElementById('viewTabPlayground'), location: document.getElementById('viewTabLocation') };
    const views = { playground: document.getElementById('playgroundView'), location: document.getElementById('locationView') };

    function selectView(name) {
      Object.keys(views).forEach(key => {
        views[key].hidden = key !== name;
        tabs[key].classList.toggle('active', key === name);
      });
      if (name === 'location' && window.LocationApp) window.LocationApp.onShow();
    }

    tabs.playground.addEventListener('click', () => selectView('playground'));
    tabs.location.addEventListener('click', () => selectView('location'));
  });
})();

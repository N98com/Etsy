// Schakelt tussen de twee hoofdweergaven: Playground (alle generatieve
// algoritmes) en Locatie (kaart-kunst). Losstaand van beide, zodat main.js
// en location.js niets van elkaar hoeven te weten.
(() => {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(() => {
    const tabs = {
      playground: document.getElementById('viewTabPlayground'),
      location: document.getElementById('viewTabLocation'),
      mockups: document.getElementById('viewTabMockups'),
    };
    const views = {
      playground: document.getElementById('playgroundView'),
      location: document.getElementById('locationView'),
      mockups: document.getElementById('mockupsView'),
    };

    function selectView(name) {
      Object.keys(views).forEach(key => {
        views[key].hidden = key !== name;
        tabs[key].classList.toggle('active', key === name);
      });
      if (name === 'location' && window.LocationApp) window.LocationApp.onShow();
      if (name === 'mockups' && window.MockupsApp) window.MockupsApp.onShow();
    }

    Object.keys(tabs).forEach(key => tabs[key].addEventListener('click', () => selectView(key)));
  });
})();

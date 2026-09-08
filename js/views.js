// Switches between the main views: Playground (all generative algorithms),
// Location (map art) and Map Test (the live pannable/zoomable map editor).
// Independent of all three, so main.js/location.js/mapTest.js don't need to
// know about each other.
(() => {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(() => {
    const tabs = {
      playground: document.getElementById('viewTabPlayground'),
      location: document.getElementById('viewTabLocation'),
      mapTest: document.getElementById('viewTabMapTest'),
    };
    const views = {
      playground: document.getElementById('playgroundView'),
      location: document.getElementById('locationView'),
      mapTest: document.getElementById('mapTestView'),
    };

    function selectView(name) {
      Object.keys(views).forEach(key => {
        views[key].hidden = key !== name;
        tabs[key].classList.toggle('active', key === name);
      });
      if (name === 'location' && window.LocationApp) window.LocationApp.onShow();
      if (name === 'mapTest' && window.MapTestApp) window.MapTestApp.onShow();
    }

    Object.keys(tabs).forEach(key => tabs[key].addEventListener('click', () => selectView(key)));

    // Location is the default/main tab (see index.html: its view starts
    // unhidden and its tab starts "active") — but the map itself is only
    // initialized on selectView's onShow hook, which otherwise only fires on
    // a click. Run it once at startup too, so the map isn't left blank
    // until the user clicks away and back.
    selectView('location');
  });
})();

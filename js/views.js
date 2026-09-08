// Switches between the two main views: Playground (all generative
// algorithms) and Location (map art). Independent of both, so main.js
// and location.js don't need to know about each other.
(() => {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(() => {
    const tabs = {
      playground: document.getElementById('viewTabPlayground'),
      location: document.getElementById('viewTabLocation'),
    };
    const views = {
      playground: document.getElementById('playgroundView'),
      location: document.getElementById('locationView'),
    };

    function selectView(name) {
      Object.keys(views).forEach(key => {
        views[key].hidden = key !== name;
        tabs[key].classList.toggle('active', key === name);
      });
      if (name === 'location' && window.LocationApp) window.LocationApp.onShow();
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

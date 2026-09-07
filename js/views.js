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
  });
})();

// Supabase Auth-gate: verbergt de werkbank tot er succesvol is ingelogd.
// De anon-key is bedoeld om publiek in frontend-code te staan (net als bij
// elke Supabase-app) — de echte toegangscontrole gebeurt server-side via
// Supabase Auth, niet door deze key geheim te houden.
(() => {
  const SUPABASE_URL = 'https://tzhzyprycgpnhxkmexkh.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6aHp5cHJ5Y2dwbmh4a21leGtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg0NjU4MzEsImV4cCI6MjEwNDA0MTgzMX0.mSwdD5jAq87upgzMMvCmaf194yClDkStuNNlGe0Vm6E';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    document.addEventListener('DOMContentLoaded', () => {
      const gate = document.getElementById('loginGate');
      if (gate) {
        gate.hidden = false;
        gate.innerHTML = '<p class="hint">Kon de inlogmodule niet laden. Controleer je internetverbinding en herlaad de pagina.</p>';
      }
    });
    return;
  }

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(() => {
    const loginGate = document.getElementById('loginGate');
    const appRoot = document.getElementById('appRoot');
    const loginForm = document.getElementById('loginForm');
    const loginEmail = document.getElementById('loginEmail');
    const loginPassword = document.getElementById('loginPassword');
    const loginError = document.getElementById('loginError');
    const loginSubmitBtn = document.getElementById('loginSubmitBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    function showApp() {
      loginGate.hidden = true;
      appRoot.hidden = false;
    }
    function showGate() {
      appRoot.hidden = true;
      loginGate.hidden = false;
    }

    loginForm.addEventListener('submit', async e => {
      e.preventDefault();
      loginError.textContent = '';
      loginSubmitBtn.disabled = true;
      loginSubmitBtn.textContent = 'Bezig…';
      const { error } = await sb.auth.signInWithPassword({
        email: loginEmail.value.trim(),
        password: loginPassword.value,
      });
      loginSubmitBtn.disabled = false;
      loginSubmitBtn.textContent = 'Inloggen';
      if (error) {
        loginError.textContent = error.message === 'Invalid login credentials'
          ? 'Onjuiste combinatie van e-mail en wachtwoord.'
          : `Inloggen mislukt: ${error.message}`;
        return;
      }
      loginPassword.value = '';
    });

    logoutBtn.addEventListener('click', () => sb.auth.signOut());

    sb.auth.onAuthStateChange((_event, session) => {
      if (session) showApp(); else showGate();
    });

    sb.auth.getSession().then(({ data }) => {
      if (data && data.session) showApp(); else showGate();
    });
  });
})();

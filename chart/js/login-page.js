;(function() {
  'use strict';

  function setMessage(text, type) {
    var el = document.getElementById('login-message');
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('is-error', 'is-success');
    if (type === 'error') el.classList.add('is-error');
    if (type === 'success') el.classList.add('is-success');
  }

  function getNextTarget() {
    var params = new URLSearchParams(window.location.search);
    return window.AuthClient.sanitizeNext(params.get('next'));
  }

  function updateNextLabel(nextTarget) {
    var el = document.getElementById('login-next-target');
    if (!el) return;
    el.textContent = 'Destination après connexion : ' + nextTarget;
  }

  async function bootstrap() {
    var form = document.getElementById('login-form');
    var submit = document.getElementById('login-submit');
    var userInput = document.getElementById('login-username');
    var passwordInput = document.getElementById('login-password');
    if (!form || !submit || !userInput || !passwordInput) return;

    var nextTarget = getNextTarget();
    updateNextLabel(nextTarget);

    try {
      var current = await window.AuthClient.status();
      if (current.ok && current.data && current.data.authenticated) {
        window.location.replace(nextTarget);
        return;
      }
    } catch (err) {
      console.warn('[LoginPage] Vérification session impossible', err);
    }

    form.addEventListener('submit', async function(event) {
      event.preventDefault();
      var username = userInput.value.trim();
      var password = passwordInput.value;

      if (!username || !password) {
        setMessage('Identifiant et mot de passe requis.', 'error');
        return;
      }

      submit.disabled = true;
      setMessage('Connexion en cours…');

      try {
        var result = await window.AuthClient.login({
          username: username,
          password: password
        });

        if (!result.ok || !result.data || !result.data.authenticated) {
          if (result.status === 503) {
            setMessage("Connexion indisponible. Vérifiez les variables Netlify: AUTH_SESSION_SECRET, DASHBOARD_LOGIN_USER, DASHBOARD_LOGIN_PASSWORD_HASH.", 'error');
          } else if (result.status === 401) {
            setMessage('Connexion refusée. Vérifiez vos identifiants.', 'error');
          } else if (result.status === 403) {
            setMessage("Connexion bloquée par la protection d'origine de la requête.", 'error');
          } else {
            setMessage('Connexion impossible pour le moment.', 'error');
          }
          passwordInput.value = '';
          passwordInput.focus();
          return;
        }

        setMessage('Connexion réussie. Redirection…', 'success');
        window.location.replace(nextTarget);
      } catch (err) {
        console.error('[LoginPage] Erreur de connexion', err);
        setMessage('Service de connexion indisponible.', 'error');
      } finally {
        submit.disabled = false;
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
})();

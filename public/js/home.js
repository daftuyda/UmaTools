// Homepage: show the latest changelog summary above the tool list.
(function () {
  'use strict';

  var news = document.getElementById('home-news');
  if (!news || !window.UmaChangelog) return;

  var version = document.getElementById('home-news-version');
  var summary = document.getElementById('home-news-summary');
  var data = null;

  function render() {
    if (!data) return;
    version.textContent = data.version;
    summary.textContent = window.UmaChangelog.localized(data.summary);
    news.hidden = !summary.textContent;
  }

  window.UmaChangelog.load()
    .then(function (result) {
      data = result;
      render();
    })
    .catch(function () {});

  document.getElementById('home-news-open').addEventListener('click', function () {
    window.UmaChangelog.open();
  });
  window.addEventListener('i18n:changed', render);
})();

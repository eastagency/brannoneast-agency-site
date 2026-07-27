// Mobile hamburger nav
document.addEventListener('DOMContentLoaded', function () {
  var navInner = document.querySelector('.nav-inner');
  var navLinks = document.querySelector('.nav-links');
  if (!navInner || !navLinks) return;
  var btn = document.createElement('button');
  btn.className = 'nav-hamburger';
  btn.setAttribute('aria-label', 'Open navigation');
  btn.innerHTML = '<span></span><span></span><span></span>';
  navInner.appendChild(btn);
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var isOpen = navLinks.classList.toggle('nav-open');
    btn.classList.toggle('is-open', isOpen);
    btn.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  });
  document.addEventListener('click', function (e) {
    if (!navInner.contains(e.target)) {
      navLinks.classList.remove('nav-open');
      btn.classList.remove('is-open');
    }
  });
  // Close on nav link click (mobile)
  navLinks.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', function () {
      navLinks.classList.remove('nav-open');
      btn.classList.remove('is-open');
    });
  });
});

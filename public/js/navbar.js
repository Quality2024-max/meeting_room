// Mobile menu toggle for partials/navbar.ejs
(() => {
    const btn = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');
    if(!btn || !links) return;
    btn.addEventListener('click', () => {
        const open = links.classList.toggle('open');
        btn.setAttribute('aria-exanded', String(open));
    });
})();
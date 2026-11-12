// Consolidated site script: smooth scroll, typing effect, reveal, back-to-top, ripple, form validation
(() => {
  'use strict';

  // Mobile navigation
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinksContainer = document.querySelector('.nav-links');
  if (menuToggle && navLinksContainer) {
    menuToggle.addEventListener('click', () => {
      const isOpen = navLinksContainer.classList.toggle('is-open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
      menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation menu' : 'Open navigation menu');
      menuToggle.querySelector('i').className = isOpen ? 'bi bi-x-lg' : 'bi bi-list';
    });

    navLinksContainer.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        navLinksContainer.classList.remove('is-open');
        menuToggle.setAttribute('aria-expanded', 'false');
        menuToggle.setAttribute('aria-label', 'Open navigation menu');
        menuToggle.querySelector('i').className = 'bi bi-list';
      });
    });
  }

  // Smooth scrolling for nav links
  document.querySelectorAll('nav a[href^="#"]').forEach(link => {
    link.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (!href || href === '#') return;
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) {
        document.querySelectorAll('.nav-links a').forEach(l => l.classList.remove('active'));
        this.classList.add('active');
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Typing effect for the hero span
  const heroSpan = document.querySelector('.hero h2 span') || document.querySelector('.hero span');
  const heroProfileImage = document.querySelector('.hero-profile-image');
  if (heroSpan) {
    const fullText = heroSpan.dataset.text ? heroSpan.dataset.text : heroSpan.textContent.trim();
    heroSpan.textContent = '';
    let idx = 0;
    const speed = 70;
    const typer = () => {
      if (idx < fullText.length) {
        heroSpan.textContent += fullText.charAt(idx);
        idx++;
        setTimeout(typer, speed);
      } else if (heroProfileImage) {
        heroProfileImage.classList.add('is-visible');
      }
    };
    typer();
  } else if (heroProfileImage) {
    heroProfileImage.classList.add('is-visible');
  }

  // Scroll reveal
  const revealElements = document.querySelectorAll('.about, .skill-box, .project-card, .section-title');
  const revealOnScroll = () => {
    revealElements.forEach(el => {
      const windowHeight = window.innerHeight;
      const elementTop = el.getBoundingClientRect().top;
      const elementVisible = 120;
      if (elementTop < windowHeight - elementVisible) el.classList.add('show');
    });
  };
  window.addEventListener('scroll', revealOnScroll);
  revealOnScroll();

  // Back to top
  const backToTop = document.querySelector('.back-to-top');
  const toggleBackToTop = () => { if (!backToTop) return; backToTop.classList.toggle('active', window.scrollY > 300); };
  window.addEventListener('scroll', toggleBackToTop);
  if (backToTop) backToTop.addEventListener('click', e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); });

  const contactForm = document.querySelector('#contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', async event => {
      event.preventDefault();
      const status = document.querySelector('#contactStatus');
      const button = contactForm.querySelector('button[type="submit"]');
      button.disabled = true;
      status.textContent = 'Sending...';
      try {
        const response = await fetch('/api/contact', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(Object.fromEntries(new FormData(contactForm))) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to send your message.');
        status.textContent = data.message;
        contactForm.reset();
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
  }

  // Active nav on scroll
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-links a');
  const updateActiveLink = () => {
    let current = '';
    sections.forEach(section => {
      const top = section.getBoundingClientRect().top;
      if (top <= 80) current = section.id;
    });
    navLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href').slice(1) === current));
  };
  window.addEventListener('scroll', updateActiveLink);
  updateActiveLink();

  // Ripple for buttons
  const buttons = document.querySelectorAll('.btn, .btn-get-started, .form-btn');
  buttons.forEach(btn => {
    btn.addEventListener('mouseenter', () => btn.style.transform = 'translateY(-3px) scale(1.02)');
    btn.addEventListener('mouseleave', () => btn.style.transform = 'translateY(0) scale(1)');
    btn.addEventListener('click', function(e) {
      // Only add ripple for non-form submissions
      if (this.type === 'submit') return;
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      this.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove());
    });
  });

  // Profile hover
  const profileImg = document.querySelector('.profile-section img');
  if (profileImg) {
    profileImg.addEventListener('mouseenter', function() { this.style.transform = 'scale(1.08) rotate(-3deg)'; this.style.boxShadow = '0 12px 35px rgba(56, 189, 248, 0.4)'; });
    profileImg.addEventListener('mouseleave', function() { this.style.transform = 'scale(1) rotate(0deg)'; this.style.boxShadow = '0 8px 25px rgba(56, 189, 248, 0.2)'; });
  }

  // Inject small helper styles for reveal and ripple
  const css = `
    .show { animation: fadeInUp 0.6s ease-out forwards; }
    @keyframes fadeInUp { from { opacity: 0; transform: translateY(30px);} to { opacity: 1; transform: translateY(0);} }
    .ripple { position: absolute; border-radius: 50%; background: rgba(255,255,255,0.6); transform: scale(0); animation: rippleEffect 0.6s ease-out; pointer-events: none; z-index: 2; }
    @keyframes rippleEffect { to { transform: scale(4); opacity: 0; } }
  `;
  const styleTag = document.createElement('style'); styleTag.innerHTML = css; document.head.appendChild(styleTag);

})();



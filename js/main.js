/* ========================================================
   SUDS AWAY PRO WASH — Main JavaScript
   ======================================================== */

(function () {
  'use strict';

  // ---- Footer year ----
  const yearEl = document.getElementById('footer-year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // ---- Scroll reveal (Intersection Observer) ----
  const revealEls = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    revealEls.forEach((el) => revealObserver.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('visible'));
  }

  // ---- Header scroll state ----
  const header = document.getElementById('site-header');
  let lastScroll = 0;
  function onScroll() {
    const y = window.scrollY;
    if (y > 60) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
    lastScroll = y;
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- Mobile navigation ----
  const hamburger = document.getElementById('hamburger');
  const mainNav = document.getElementById('main-nav');

  hamburger.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('open');
    hamburger.classList.toggle('active');
    hamburger.setAttribute('aria-expanded', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Close mobile nav on link click
  mainNav.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', () => {
      mainNav.classList.remove('open');
      hamburger.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  // ---- Smooth scroll for anchor links ----
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // ---- Animated counters ----
  const statItems = document.querySelectorAll('.stat-item');
  let statsCounted = false;

  function animateCounter(el) {
    const target = parseInt(el.dataset.count, 10);
    const suffix = el.dataset.suffix || '';
    const numEl = el.querySelector('.stat-number');
    const duration = 2000;
    const start = performance.now();

    function tick(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(target * eased);
      numEl.textContent = current + suffix;
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);
  }

  if ('IntersectionObserver' in window) {
    const statsObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !statsCounted) {
            statsCounted = true;
            statItems.forEach((item) => animateCounter(item));
            statsObserver.disconnect();
          }
        });
      },
      { threshold: 0.5 }
    );
    const statsSection = document.getElementById('stats');
    if (statsSection) statsObserver.observe(statsSection);
  }

  // ---- Testimonial carousel (dynamic from content.json) ----
  const track = document.getElementById('testimonials-track');
  const dotsContainer = document.getElementById('carousel-dots');
  const prevBtn = document.querySelector('.carousel-prev');
  const nextBtn = document.querySelector('.carousel-next');
  let cards = [];
  let dots = [];
  let currentSlide = 0;
  let autoplayTimer;
  let slidesVisible = 1;

  const starSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.27 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';

  function escapeText(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function renderTestimonials(testimonials) {
    if (!track || !dotsContainer) return;

    // Build cards
    track.innerHTML = testimonials.map(t => {
      const rating = t.rating || 5;
      const starsHtml = Array.from({length: rating}, () => starSvg).join('');
      return `<article class="testimonial-card" aria-label="Review from ${escapeText(t.name)}">
        <div class="testimonial-stars" aria-label="${rating} out of 5 stars">${starsHtml}</div>
        <blockquote class="testimonial-text">&ldquo;${escapeText(t.text)}&rdquo;</blockquote>
        <footer class="testimonial-author">
          <span class="testimonial-name">${escapeText(t.name)}</span>
          <span class="testimonial-service">${escapeText(t.service)}</span>
        </footer>
      </article>`;
    }).join('');

    // Build dots
    dotsContainer.innerHTML = testimonials.map((_, i) =>
      `<button class="carousel-dot${i === 0 ? ' active' : ''}" role="tab" aria-selected="${i === 0}" aria-label="Slide ${i + 1}"></button>`
    ).join('');

    // Re-query elements
    cards = track.querySelectorAll('.testimonial-card');
    dots = dotsContainer.querySelectorAll('.carousel-dot');

    // Init carousel
    if (cards.length) {
      currentSlide = 0;
      updateSlidesVisible();
      goToSlide(0);
      dots.forEach((dot, i) => {
        dot.addEventListener('click', () => { goToSlide(i); startAutoplay(); });
      });
      startAutoplay();
    }
  }

  function updateSlidesVisible() {
    if (window.innerWidth >= 1024) slidesVisible = 3;
    else if (window.innerWidth >= 768) slidesVisible = 2;
    else slidesVisible = 1;
  }

  function goToSlide(index) {
    if (!cards.length) return;
    const maxSlide = Math.max(0, cards.length - slidesVisible);
    currentSlide = Math.max(0, Math.min(index, maxSlide));

    const gap = 24;
    const cardWidth = cards[0].offsetWidth + (slidesVisible > 1 ? gap : 0);
    track.style.transform = `translateX(-${currentSlide * cardWidth}px)`;

    dots.forEach((dot, i) => {
      dot.classList.toggle('active', i === currentSlide);
      dot.setAttribute('aria-selected', i === currentSlide);
    });
  }

  function nextSlide() {
    const maxSlide = Math.max(0, cards.length - slidesVisible);
    goToSlide(currentSlide >= maxSlide ? 0 : currentSlide + 1);
  }

  function prevSlide() {
    const maxSlide = Math.max(0, cards.length - slidesVisible);
    goToSlide(currentSlide <= 0 ? maxSlide : currentSlide - 1);
  }

  function startAutoplay() {
    stopAutoplay();
    autoplayTimer = setInterval(nextSlide, 5000);
  }

  function stopAutoplay() {
    clearInterval(autoplayTimer);
  }

  if (prevBtn) prevBtn.addEventListener('click', () => { prevSlide(); startAutoplay(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { nextSlide(); startAutoplay(); });

  window.addEventListener('resize', () => {
    updateSlidesVisible();
    goToSlide(currentSlide);
  });

  // Pause on hover/focus
  if (track) {
    const carouselRegion = track.closest('.testimonials-carousel');
    if (carouselRegion) {
      carouselRegion.addEventListener('mouseenter', stopAutoplay);
      carouselRegion.addEventListener('mouseleave', startAutoplay);
      carouselRegion.addEventListener('focusin', stopAutoplay);
      carouselRegion.addEventListener('focusout', startAutoplay);
    }
  }

  // Fetch content.json and render testimonials
  fetch('data/content.json')
    .then(r => r.json())
    .then(data => {
      if (data.testimonials && data.testimonials.length) {
        renderTestimonials(data.testimonials);
      }
    })
    .catch(err => console.warn('Could not load testimonials:', err));

  // ---- FAQ accordion ----
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach((item) => {
    const btn = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');

    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');

      // Close all others
      faqItems.forEach((other) => {
        if (other !== item) {
          other.classList.remove('open');
          other.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
        }
      });

      item.classList.toggle('open', !isOpen);
      btn.setAttribute('aria-expanded', !isOpen);
    });
  });

  // ---- Contact form handling ----
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (e) => {
      e.preventDefault();

      // Basic validation
      const name = contactForm.querySelector('#form-name');
      const phone = contactForm.querySelector('#form-phone');

      if (!name.value.trim() || !phone.value.trim()) {
        if (!name.value.trim()) name.focus();
        else phone.focus();
        return;
      }

      // Show success state
      contactForm.innerHTML = `
        <div class="success-icon" aria-hidden="true">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>
        </div>
        <h3 class="success-heading">Thank You!</h3>
        <p class="success-text">We've received your request and will get back to you within a few hours. In the meantime, feel free to call us at <a href="tel:+15551234567" style="color:var(--orange);font-weight:600">(555) 123-4567</a>.</p>
      `;
      contactForm.classList.add('success');
    });
  }

  // ---- Parallax-like hero background ----
  const heroBg = document.querySelector('.hero-bg-img');
  if (heroBg && window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const scrolled = window.scrollY;
          if (scrolled < window.innerHeight) {
            heroBg.style.transform = `scale(1.05) translateY(${scrolled * 0.15}px)`;
          }
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
  }
})();

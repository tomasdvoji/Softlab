/* Softlab · interactions
   GSAP + ScrollTrigger (scroll choreography), Lenis (smooth scroll).
   Everything gated by prefers-reduced-motion. */

(function () {
  "use strict";

  document.documentElement.classList.add("js");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";

  /* ─── Smooth scroll (Lenis) ─── */
  if (!reduceMotion && typeof window.Lenis !== "undefined" && hasGsap) {
    var lenis = new window.Lenis({ anchors: { offset: -84 } });
    lenis.on("scroll", window.ScrollTrigger.update);
    window.gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    window.gsap.ticker.lagSmoothing(0);
  }

  /* ─── Nav: paper background after scroll ─── */
  var nav = document.getElementById("nav");
  var onScroll = function () {
    nav.classList.toggle("scrolled", window.scrollY > 24);
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true }); // ponytail: one classList toggle, no rAF choreography needed

  /* ─── Skip link: focus must land in main even when Lenis intercepts ─── */
  var mainEl = document.getElementById("obsah");
  document.querySelector(".skip-link").addEventListener("click", function () {
    mainEl.focus({ preventScroll: true });
  });

  /* ─── Mobile menu ─── */
  var burger = document.getElementById("navBurger");
  var menu = document.getElementById("mobileMenu");
  var footerEl = document.querySelector("footer");
  var setMenu = function (open) {
    burger.setAttribute("aria-expanded", String(open));
    burger.setAttribute("aria-label", open ? "Zavřít menu" : "Otevřít menu");
    menu.hidden = !open;
    document.body.style.overflow = open ? "hidden" : "";
    mainEl.inert = open;
    footerEl.inert = open;
  };
  setMenu(false);
  burger.addEventListener("click", function () {
    var open = burger.getAttribute("aria-expanded") !== "true";
    setMenu(open);
    if (open) menu.querySelector("a").focus();
  });
  menu.querySelectorAll("a").forEach(function (a) {
    a.addEventListener("click", function () { setMenu(false); });
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !menu.hidden) {
      setMenu(false);
      burger.focus();
    }
  });
  window.matchMedia("(min-width: 901px)").addEventListener("change", function (e) {
    if (e.matches && !menu.hidden) setMenu(false); // burger mizí nad 900px, menu nesmí zůstat viset
  });

  /* ─── Scroll reveals (IntersectionObserver, CSS does the animating) ─── */
  (function reveals() {
    var items = document.querySelectorAll("[data-reveal]");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("revealed"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    items.forEach(function (el) { io.observe(el); });
  })();

  /* ─── GSAP choreography ─── */
  if (hasGsap && !reduceMotion) {
    var gsap = window.gsap;
    gsap.registerPlugin(window.ScrollTrigger);

    /* Hero: masked line reveal */
    gsap.from(".hero-title .line-inner", {
      yPercent: 115,
      duration: 1.1,
      stagger: 0.1,
      ease: "power4.out",
      delay: 0.15
    });
    gsap.from(".hero-foot", { y: 24, opacity: 0, duration: 0.9, ease: "power3.out", delay: 0.7 });

    /* Projects: vertical scroll → horizontal pan (desktop only) */
    var mm = gsap.matchMedia();
    mm.add("(min-width: 1024px)", function () {
      var track = document.getElementById("workTrack");
      var pin = document.querySelector(".work-pin");
      if (!track || !pin) return;
      var distance = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };
      gsap.to(track, {
        x: function () { return -distance(); },
        ease: "none",
        scrollTrigger: {
          trigger: pin,
          start: "top top",
          end: function () { return "+=" + distance(); },
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true
        }
      });
    });

    /* Manifesto: word-by-word scrub */
    var manifesto = document.getElementById("manifestoText");
    if (manifesto) {
      var words = manifesto.textContent.trim().split(/\s+/);
      manifesto.innerHTML = words
        .map(function (word) { return '<span class="word">' + word + "</span>"; })
        .join(" ");
      gsap.fromTo(
        manifesto.querySelectorAll(".word"),
        { opacity: 0.12 },
        {
          opacity: 1,
          stagger: 0.06,
          ease: "none",
          scrollTrigger: {
            trigger: manifesto,
            start: "top 78%",
            end: "bottom 45%",
            scrub: true
          }
        }
      );
    }
  }

  /* ─── Footer year ─── */
  document.getElementById("year").textContent = String(new Date().getFullYear());
})();

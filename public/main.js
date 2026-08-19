/* Softlab · interactions
   GSAP + ScrollTrigger (scroll choreography), Lenis (smooth scroll),
   generativní SVG vizuály + live blueprint hřiště.
   Everything gated by prefers-reduced-motion. */

(function () {
  "use strict";

  document.documentElement.classList.add("js");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var hasGsap = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";

  /* ─── Smooth scroll (Lenis) ─── */
  var lenis;
  if (!reduceMotion && typeof window.Lenis !== "undefined" && hasGsap) {
    lenis = new window.Lenis({ anchors: { offset: -84 } });
    lenis.on("scroll", window.ScrollTrigger.update);
    window.gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    window.gsap.ticker.lagSmoothing(0);
  }

  /* ─── Preloader: curtain nahoru, pak hero ─── */
  var loader = document.getElementById("loader");
  if (loader) {
    if (hasGsap && !reduceMotion) {
      window.gsap.timeline()
        .from(".loader-word", { yPercent: 115, duration: 0.7, ease: "power4.out", delay: 0.1 })
        .to(loader, {
          yPercent: -100,
          duration: 0.7,
          ease: "power4.inOut",
          delay: 0.35,
          onComplete: function () { loader.classList.add("done"); }
        });
    } else {
      loader.classList.add("done");
    }
    // pojistka: skryté karty prohlížeče nedostávají rAF, timeline by zamrzla
    setTimeout(function () { loader.classList.add("done"); }, 3000);
  }

  /* ─── Generativní vizuály (deterministické, ink + modrá) ─── */
  var ART = (function () {
    var W = 1100, H = 734;
    var INK = "var(--ink)", ACC = "var(--accent)";

    function prng(seed) {
      var s = seed >>> 0;
      return function () {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    }

    function open() { return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'; }

    /* trasy: ortogonální rozvozové linky, jedna zvýrazněná */
    function routes(r) {
      var s = open();
      for (var i = 0; i < 6; i++) {
        var accent = i === 2;
        var x = 60 + r() * 120;
        var y = 90 + i * 105 + r() * 40;
        var d = "M" + x + " " + y;
        var px = x, py = y;
        var steps = 3 + Math.floor(r() * 3);
        s += '<circle cx="' + px + '" cy="' + py + '" r="9" fill="' + (accent ? ACC : "none") + '" stroke="' + INK + '" stroke-width="3"/>';
        for (var j = 0; j < steps; j++) {
          px += 120 + r() * 220;
          d += " H" + px;
          var ny = 70 + r() * (H - 140);
          if (j < steps - 1) { d += " V" + ny; py = ny; }
          if (j < steps - 1) s += '<rect x="' + (px - 7) + '" y="' + (py - 7) + '" width="14" height="14" fill="' + INK + '"/>';
        }
        s += '<path d="' + d + '" fill="none" stroke="' + (accent ? ACC : INK) + '" stroke-width="' + (accent ? 5 : 2.5) + '"/>';
        s += '<circle cx="' + px + '" cy="' + py + '" r="9" fill="' + (accent ? ACC : INK) + '"/>';
      }
      return s + "</svg>";
    }

    /* díly: mřížka strojních komponent */
    function parts(r) {
      var s = open();
      var cols = 9, rows = 6, cw = W / cols, ch = H / rows;
      for (var i = 0; i < cols; i++) {
        for (var j = 0; j < rows; j++) {
          if (r() < 0.16) continue;
          var cx = i * cw + cw / 2, cy = j * ch + ch / 2;
          var kind = Math.floor(r() * 4);
          var accent = r() < 0.07;
          var st = 'fill="none" stroke="' + (accent ? ACC : INK) + '" stroke-width="' + (accent ? 4 : 2.5) + '"';
          if (kind === 0) s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (14 + r() * 18) + '" ' + st + "/>";
          else if (kind === 1) { var w2 = 20 + r() * 30, h2 = 14 + r() * 26; s += '<rect x="' + (cx - w2 / 2) + '" y="' + (cy - h2 / 2) + '" width="' + w2 + '" height="' + h2 + '" ' + st + "/>"; }
          else if (kind === 2) { var l = 12 + r() * 14; s += '<path d="M' + (cx - l) + " " + cy + " H" + (cx + l) + " M" + cx + " " + (cy - l) + " V" + (cy + l) + '" ' + st + "/>"; }
          else s += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (5 + r() * 5) + '" fill="' + (accent ? ACC : INK) + '"/>';
        }
      }
      return s + "</svg>";
    }

    /* dokument: odstavce smlouvy, jeden klauzulový blok modrý */
    function paragraphs(r) {
      var s = open();
      var x = 130, colW = 660, y = 90, lh = 34;
      var para = 0;
      while (y < H - 90) {
        var lines = 2 + Math.floor(r() * 4);
        var accent = para === 2;
        for (var i = 0; i < lines && y < H - 90; i++) {
          var last = i === lines - 1;
          var w2 = last ? colW * (0.35 + r() * 0.4) : colW * (0.86 + r() * 0.14);
          var ix = i === 0 ? x + 44 : x;
          s += '<rect x="' + ix + '" y="' + y + '" width="' + Math.min(w2, colW - (ix - x)) + '" height="16" fill="' + (accent ? ACC : INK) + '"/>';
          y += lh;
        }
        y += 26;
        para++;
      }
      s += '<rect x="880" y="90" width="90" height="16" fill="' + INK + '"/>';
      s += '<rect x="880" y="124" width="60" height="16" fill="' + INK + '"/>';
      s += '<rect x="880" y="620" width="120" height="3" fill="' + INK + '"/>';
      return s + "</svg>";
    }

    /* sklad: skládané palety na základní lince */
    function stacks(r) {
      var s = open();
      var base = H - 110;
      var x = 70;
      while (x < W - 180) {
        var bw = 110 + r() * 60;
        var count = 1 + Math.floor(r() * 5);
        var y = base;
        for (var i = 0; i < count; i++) {
          var bh = 36 + r() * 26;
          y -= bh + 6;
          var accent = r() < 0.06;
          s += '<rect x="' + (x + (r() * 16 - 8)) + '" y="' + y + '" width="' + bw + '" height="' + bh + '" fill="' + (accent ? ACC : "none") + '" stroke="' + (accent ? ACC : INK) + '" stroke-width="2.5"/>';
        }
        x += bw + 40 + r() * 60;
      }
      s += '<rect x="40" y="' + base + '" width="' + (W - 80) + '" height="4" fill="' + INK + '"/>';
      return s + "</svg>";
    }

    return { prng: prng, kinds: { routes: routes, parts: parts, paragraphs: paragraphs, stacks: stacks } };
  })();

  document.querySelectorAll("[data-art]").forEach(function (el) {
    var fn = ART.kinds[el.getAttribute("data-art")];
    var seed = parseInt(el.getAttribute("data-seed"), 10) || 7;
    if (fn) el.innerHTML = fn(ART.prng(seed));
  });

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

    /* Hero: masked line reveal (po preloaderu) */
    gsap.from(".hero-title .line-inner", {
      yPercent: 135, /* mask má padding, menší posun by nechal vykouknout proužek */
      duration: 1.1,
      stagger: 0.1,
      ease: "power4.out",
      delay: 1.1
    });
    gsap.from(".hero-foot", { y: 24, opacity: 0, duration: 0.9, ease: "power3.out", delay: 1.6 });

    /* Velocity pás: rychlost scrollu žene marquee a naklání ho */
    var vTrack = document.getElementById("velocityTrack");
    if (vTrack) {
      var vGroup = vTrack.querySelector(".velocity-group");
      var pos = 0, skew = 0;
      gsap.ticker.add(function (time, dt) {
        var gw = vGroup.offsetWidth;
        if (!gw) return;
        var v = lenis ? (lenis.velocity || 0) : 0;
        var speed = 90 + Math.min(Math.abs(v) * 5, 700);
        pos = (pos - speed * (dt / 1000)) % gw;
        var target = Math.max(-10, Math.min(10, v * 0.35));
        skew += (target - skew) * 0.08;
        vTrack.style.transform = "translateX(" + pos + "px) skewX(" + skew + "deg)";
      });
    }

    /* Služby: předchozí karta se při překrytí zmenší a ztlumí */
    var mm = gsap.matchMedia();
    mm.add("(min-width: 1024px)", function () {
      var cards = gsap.utils.toArray(".stack-card");
      cards.forEach(function (card, i) {
        if (i === cards.length - 1) return;
        gsap.to(card, {
          scale: 0.94,
          opacity: 0.45,
          ease: "none",
          scrollTrigger: {
            trigger: cards[i + 1],
            start: "top bottom",
            end: "top " + (68 + 24) + "px",
            scrub: true
          }
        });
      });

      /* Projects: vertical scroll → horizontal pan */
      var track = document.getElementById("workTrack");
      var pin = document.querySelector(".work-pin");
      if (track && pin) {
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
      }
    });

    /* Statement: word-by-word scrub (bílá slova na inku) */
    var statement = document.getElementById("statementText");
    if (statement) {
      var words = statement.textContent.trim().split(/\s+/);
      statement.innerHTML = words
        .map(function (word) { return '<span class="word">' + word + "</span>"; })
        .join(" ");
      gsap.fromTo(
        statement.querySelectorAll(".word"),
        { opacity: 0.14 },
        {
          opacity: 1,
          stagger: 0.06,
          ease: "none",
          scrollTrigger: {
            trigger: statement,
            start: "top 70%",
            end: "bottom 55%",
            scrub: true
          }
        }
      );
    }

    /* Postup: sticky čítač 01-04 podle aktivního kroku */
    var countEl = document.getElementById("processCount");
    var steps = gsap.utils.toArray(".process-step");
    if (countEl && steps.length) {
      steps.forEach(function (step, i) {
        window.ScrollTrigger.create({
          trigger: step,
          start: "top 55%",
          end: "bottom 55%",
          onToggle: function (self) {
            if (!self.isActive) return;
            steps.forEach(function (s) { s.classList.remove("active"); });
            step.classList.add("active");
            var txt = "0" + (i + 1);
            if (countEl.textContent !== txt) {
              countEl.textContent = txt;
              gsap.fromTo(countEl, { yPercent: 14, opacity: 0.2 }, { yPercent: 0, opacity: 1, duration: 0.35, ease: "power2.out" });
            }
          }
        });
      });
      steps[0].classList.add("active");
    }
  }

  /* ─── Footer year ─── */
  document.getElementById("year").textContent = String(new Date().getFullYear());
})();

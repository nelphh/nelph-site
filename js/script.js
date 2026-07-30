(() => {
  const rows = [...document.querySelectorAll(".portfolio-row")];
  const grid = document.querySelector(".portfolio-grid");
  const pairs = rows.flatMap((row) =>
    [...row.querySelectorAll(".portfolio-item")].map((item) => ({ row, item }))
  );

  // Whatever's marked active in the markup is the starting tile — hovering
  // another one takes over, and stays put once the cursor moves away.
  const defaultRow = document.querySelector(".portfolio-row.is-active-row") || rows[0];
  const defaultItem = document.querySelector(".portfolio-item.is-active-item") || pairs[0]?.item;

  let activeRow = defaultRow;
  let activeItem = defaultItem;

  // The active tile is forced to a 1:1 square by pinning its flex-basis (in
  // px) to its row's target height. flex-grow itself is transitioned in CSS,
  // so reading it (or the row's live height) back mid-transition gives an
  // animated in-between value, not the destination — that caused a visible
  // dip before the row caught up. These constants mirror the CSS values
  // directly so the target can be predicted from the very first frame.
  const ACTIVE_ROW_GROW = 2.2; // .portfolio-row.is-active-row's flex-grow
  const BASE_ROW_GROW = 1; // .portfolio-row's base flex-grow

  const computeTargetRowHeight = () => {
    const gridRect = grid.getBoundingClientRect();
    const rowGap = parseFloat(getComputedStyle(grid).rowGap) || 0;
    const availableHeight = gridRect.height - rowGap * (rows.length - 1);
    const totalGrow = ACTIVE_ROW_GROW + (rows.length - 1) * BASE_ROW_GROW;
    return (availableHeight * ACTIVE_ROW_GROW) / totalGrow;
  };

  const squareActiveItem = (item) => {
    item.style.flexBasis = `${computeTargetRowHeight()}px`;
  };

  // Below the hover breakpoint the gallery switches to a single stacked
  // column sized by CSS aspect-ratio (see the mobile media query) rather
  // than the flex-basis trick below — setting flexBasis there would stomp
  // that mechanism via an inline style, so it's skipped in that layout.
  const isMobileLayout = window.matchMedia("(max-width: 640px)").matches;

  const setActive = (row, item) => {
    if (item === activeItem) return;
    if (activeRow) activeRow.classList.remove("is-active-row");
    if (activeItem) {
      activeItem.classList.remove("is-active-item");
      activeItem.setAttribute("aria-expanded", "false");
      activeItem.style.flexBasis = "";
    }
    row.classList.add("is-active-row");
    item.classList.add("is-active-item");
    item.setAttribute("aria-expanded", "true");
    if (!isMobileLayout) squareActiveItem(item);
    activeRow = row;
    activeItem = item;
  };

  const revertToDefault = () => setActive(defaultRow, defaultItem);

  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  // A short debounce before committing a hover switch — while a tile is
  // resizing under the cursor, the boundary can sweep across it and fire
  // mouseenter on a neighbor with no real mouse movement. Requiring the
  // cursor to settle briefly avoids the resulting flicker/oscillation.
  let hoverTimer = null;

  pairs.forEach(({ row, item }) => {
    if (canHover) {
      item.addEventListener("mouseenter", () => {
        clearTimeout(hoverTimer);
        hoverTimer = setTimeout(() => setActive(row, item), 90);
      });
      item.addEventListener("mouseleave", () => {
        clearTimeout(hoverTimer);
      });
      item.addEventListener("focus", () => setActive(row, item));
    } else {
      item.addEventListener("click", () => setActive(row, item));
    }

    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setActive(row, item);
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") revertToDefault();
  });

  document.addEventListener("click", (e) => {
    if (!grid.contains(e.target)) revertToDefault();
  });

  // Only re-squares on actual viewport/grid resize, not our own row-height
  // transition — using the live contentRect here (instead of the same
  // target-based math as above) would re-introduce the dip, since it fires
  // on every frame of that transition with the row's still-animating height.
  const rowResizeObserver = new ResizeObserver(() => {
    if (activeItem && !isMobileLayout) squareActiveItem(activeItem);
  });
  rowResizeObserver.observe(grid);

  // ---------- Mobile: fully paginated gallery ----------
  // Native scroll + CSS scroll-snap (even with scroll-snap-stop) still let a
  // hard flick skip several tiles, or a barely-there movement trigger a
  // change — snap can only correct where a gesture the browser already ran
  // ends up, not how far it's allowed to travel. So on mobile, scrolling
  // over the gallery is captured entirely: each deliberate swipe advances
  // exactly one tile, and the resulting scroll position is predicted and
  // applied directly rather than left to scrollIntoView.
  if (isMobileLayout) {
    const tileList = pairs;
    const getCurrentIndex = () => {
      const index = tileList.findIndex(({ item }) => item === activeItem);
      return index === -1 ? 0 : index;
    };

    // Matches .portfolio-item's collapsed aspect-ratio in the mobile media
    // query — used to predict a tile's collapsed height without waiting for
    // its transition to finish.
    const COLLAPSED_ASPECT_RATIO = 2.4;

    // A tile that hasn't scrolled into view yet still sits under the
    // load/scroll-reveal transform (translateY(28px), see .reveal in
    // style.css) until its own IntersectionObserver fires. That transform
    // shows up in getBoundingClientRect() without affecting layout, which
    // was throwing off the position math below by exactly 28px whenever a
    // tile got paginated to before it had naturally scrolled into view.
    // Snap it to its revealed state instantly (no fade) before measuring.
    const forceReveal = (el) => {
      if (!el || el.classList.contains("is-visible")) return;
      const prevTransition = el.style.transition;
      el.style.transition = "none";
      el.classList.add("is-visible");
      void el.offsetHeight;
      el.style.transition = prevTransition;
    };

    // Marks a scroll as one *we* triggered via goToIndex, so the global
    // safety net below (which watches for scrolls landing mid-gallery from
    // anywhere) doesn't mistake our own corrective scroll for a rogue one.
    let isOwnScroll = false;
    let ownScrollTimer = null;
    const markOwnScroll = () => {
      isOwnScroll = true;
      clearTimeout(ownScrollTimer);
      ownScrollTimer = setTimeout(() => {
        isOwnScroll = false;
      }, 700);
    };

    const goToIndex = (index) => {
      if (index < 0 || index >= tileList.length) return;
      const currentIndex = getCurrentIndex();
      const { row, item } = tileList[index];
      forceReveal(item);

      // Calling scrollIntoView() right after setActive() reads the tile's
      // position *before* its expand transition has actually run — it's
      // still at its collapsed height at that instant — so it scrolled to
      // fit the small version, and the tile then grew past the viewport as
      // it expanded. Instead, predict where its top edge will end up once
      // everything has settled, and scroll there directly so the expand
      // and the scroll land in the same place together.
      const itemRect = item.getBoundingClientRect();
      let targetTopFinal = itemRect.top;

      // Only matters moving forward: the tile collapsing back down is the
      // one currently active, which sits *above* the target, so its
      // shrinking pulls the target upward by however much it shrinks.
      // Moving backward, the tile collapsing is *below* the target, which
      // doesn't move the target's own top edge at all.
      if (index > currentIndex && activeItem) {
        const prevRect = activeItem.getBoundingClientRect();
        const prevCollapsedHeight = prevRect.width / COLLAPSED_ASPECT_RATIO;
        targetTopFinal -= prevRect.height - prevCollapsedHeight;
      }

      // The tile's width stays fixed at 100% throughout, so its expanded
      // (square) height equals its current width — use that to land the
      // tile centered in the viewport rather than pinned to the top.
      const finalHeight = itemRect.width;
      const desiredTop = (window.innerHeight - finalHeight) / 2;

      const targetScrollY = window.scrollY + targetTopFinal - desiredTop;

      setActive(row, item);
      markOwnScroll();
      window.scrollTo({ top: targetScrollY, behavior: "smooth" });
    };

    // How far (px) a touch has to travel before it's treated as a real
    // swipe rather than incidental jitter — below this, nothing happens.
    const SWIPE_THRESHOLD = 40;
    // How far (px) before we've even decided which direction the gesture
    // is going, and therefore whether to capture it at all. Keeping this
    // small means we only "give" a few pixels before locking the page.
    const DIRECTION_LOCK = 10;

    let touchStartY = null;
    let directionDecided = false;
    let capturing = false;

    grid.addEventListener(
      "touchstart",
      (e) => {
        touchStartY = e.touches[0].clientY;
        directionDecided = false;
        capturing = false;
      },
      { passive: true }
    );

    grid.addEventListener(
      "touchmove",
      (e) => {
        if (touchStartY === null) return;
        const deltaY = touchStartY - e.touches[0].clientY;

        if (!directionDecided) {
          if (Math.abs(deltaY) < DIRECTION_LOCK) return;
          directionDecided = true;
          const wantsForward = deltaY > 0;
          const index = getCurrentIndex();
          const atBoundary = wantsForward ? index >= tileList.length - 1 : index <= 0;
          // At an edge, release the gesture to native scroll so it flows
          // into the header above or the About section below as normal.
          capturing = !atBoundary;
        }

        if (capturing) e.preventDefault();
      },
      { passive: false }
    );

    grid.addEventListener("touchend", (e) => {
      if (touchStartY === null) return;
      const deltaY = touchStartY - e.changedTouches[0].clientY;
      touchStartY = null;
      if (!capturing) return;
      if (Math.abs(deltaY) < SWIPE_THRESHOLD) return;
      goToIndex(getCurrentIndex() + (deltaY > 0 ? 1 : -1));
    });

    // Trackpad/mouse wheel fallback (e.g. a narrow desktop window). Wheel
    // events arrive as a rapid stream of small deltas during one gesture,
    // so they're accumulated and treated as a single step once they settle.
    let wheelAccum = 0;
    let wheelTimer = null;

    grid.addEventListener(
      "wheel",
      (e) => {
        const wantsForward = e.deltaY > 0;
        const index = getCurrentIndex();
        const atBoundary = wantsForward ? index >= tileList.length - 1 : index <= 0;
        if (atBoundary) return;

        e.preventDefault();
        wheelAccum += e.deltaY;
        clearTimeout(wheelTimer);
        wheelTimer = setTimeout(() => {
          if (Math.abs(wheelAccum) > SWIPE_THRESHOLD) {
            goToIndex(getCurrentIndex() + (wheelAccum > 0 ? 1 : -1));
          }
          wheelAccum = 0;
        }, 60);
      },
      { passive: false }
    );

    // Global safety net: a swipe that starts outside the grid (touch events
    // stay bound to whatever element they started on, so the handlers above
    // never see a gesture that began elsewhere) or a fast flick whose
    // momentum keeps carrying the page after the finger lifts can otherwise
    // sail straight through — or past — the gallery in one motion, skipping
    // the one-tile-at-a-time pagination entirely. Watch scroll position
    // directly instead: on every scroll tick, check which tile (if any) is
    // centered in the viewport, and if it's drifted away from the tracked
    // active tile, snap-correct — capped to one step, same as a deliberate
    // swipe, so a rogue jump of several tiles gets pulled back to just one.
    // Calling scrollTo mid-flight also cancels the browser's own momentum,
    // so this doubles as a hard brake on any runaway scroll through here.
    const tileIndexAtViewportCenter = () => {
      const centerY = window.innerHeight / 2;
      for (let i = 0; i < tileList.length; i++) {
        const r = tileList[i].item.getBoundingClientRect();
        if (r.top <= centerY && r.bottom >= centerY) return i;
      }
      return null;
    };

    window.addEventListener(
      "scroll",
      () => {
        if (isOwnScroll) return;
        const gridRect = grid.getBoundingClientRect();
        if (gridRect.bottom <= 0 || gridRect.top >= window.innerHeight) return;

        const centeredIndex = tileIndexAtViewportCenter();
        if (centeredIndex === null) return;

        const currentIndex = getCurrentIndex();
        const diff = centeredIndex - currentIndex;
        if (diff === 0) return;

        goToIndex(currentIndex + Math.sign(diff));
      },
      { passive: true }
    );
  }

  // ---------- Theme toggle (the skull in the hero mark) ----------
  // Light/dark logo and hero-mark swapping is handled entirely by CSS off the
  // [data-theme] attribute — this only needs to flip the attribute and remember the choice.
  const toggleBtn = document.getElementById("theme-toggle");

  const applyTheme = (isDark) => {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
    toggleBtn?.setAttribute("aria-checked", String(isDark));
  };

  applyTheme(document.documentElement.getAttribute("data-theme") === "dark");

  toggleBtn?.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") !== "dark";
    applyTheme(isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  });

  // ---------- Contact form (submits to Formspree) ----------
  const contactForm = document.querySelector(".contact-form");
  const contactStatus = contactForm?.querySelector(".contact-status");
  const contactSubmit = contactForm?.querySelector(".contact-submit");

  contactForm?.addEventListener("submit", (e) => {
    e.preventDefault();

    contactSubmit.disabled = true;
    contactStatus.textContent = "Sending…";
    contactStatus.classList.remove("is-success");

    fetch(contactForm.action, {
      method: "POST",
      body: new FormData(contactForm),
      headers: { Accept: "application/json" },
    })
      .then((response) => {
        if (response.ok) {
          contactStatus.textContent = "Thanks — I'll be in touch soon.";
          contactStatus.classList.add("is-success");
          contactForm.reset();
        } else {
          contactStatus.textContent = "Something went wrong — please try again or email me directly.";
        }
      })
      .catch(() => {
        contactStatus.textContent = "Something went wrong — please try again or email me directly.";
      })
      .finally(() => {
        contactSubmit.disabled = false;
      });
  });

  // ---------- Hero mark shies away from the cursor ----------
  const heroMarkWrap = document.querySelector(".hero-mark-wrap");
  const heroSection = document.querySelector(".hero");

  if (heroMarkWrap && heroSection && canHover) {
    const maxOffset = 14;
    const falloffRadius = 260;

    heroSection.addEventListener("mousemove", (e) => {
      const rect = heroMarkWrap.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const strength = Math.min(dist, falloffRadius) / falloffRadius;
      const offsetX = -(dx / dist) * maxOffset * strength;
      const offsetY = -(dy / dist) * maxOffset * strength;
      heroMarkWrap.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
    });

    heroSection.addEventListener("mouseleave", () => {
      heroMarkWrap.style.transform = "translate(0, 0)";
    });
  }

  // ---------- Load-in & scroll reveal animations ----------
  const revealEls = [...document.querySelectorAll("[data-reveal]")];

  if (revealEls.length) {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      revealEls.forEach((el) => el.classList.add("is-visible"));
    } else {
      const groupCounters = {};
      revealEls.forEach((el) => {
        const group = el.dataset.revealGroup || el.dataset.reveal;
        const index = groupCounters[group] || 0;
        groupCounters[group] = index + 1;
        el.style.transitionDelay = `${index * 90}ms`;
      });

      const loadEls = revealEls.filter((el) => el.dataset.reveal === "load");
      const scrollEls = revealEls.filter((el) => el.dataset.reveal === "scroll");

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          loadEls.forEach((el) => el.classList.add("is-visible"));
        });
      });

      const revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-visible");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
      );

      scrollEls.forEach((el) => revealObserver.observe(el));
    }
  }

  // ---------- Portfolio image carousels (prev/next arrows on expanded tiles) ----------
  document.querySelectorAll(".portfolio-carousel").forEach((item) => {
    const images = [...item.querySelectorAll(".portfolio-carousel-img")];
    if (images.length < 2) return;

    let current = Math.max(0, images.findIndex((img) => img.classList.contains("is-visible")));

    const show = (nextIndex) => {
      images[current].classList.remove("is-visible");
      current = (nextIndex + images.length) % images.length;
      images[current].classList.add("is-visible");
    };

    item.querySelector(".portfolio-nav-prev")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      show(current - 1);
    });

    item.querySelector(".portfolio-nav-next")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      show(current + 1);
    });
  });
})();

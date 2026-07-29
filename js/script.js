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

  // ---------- Mobile: scroll-driven active tile ----------
  // On the stacked single-column layout there's no hover to drive the
  // expand/collapse, so instead whichever tile currently sits in a band
  // near the top of the viewport becomes active — the classic "scrollspy"
  // pattern. Debounced like the hover switch above: a tile expanding or
  // collapsing changes the page's height, which can otherwise cause a
  // neighbor to flicker in and out of the trigger band as things resettle.
  if (isMobileLayout) {
    let scrollTimer = null;

    const scrollSpyObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const pair = pairs.find(({ item }) => item === entry.target);
          if (!pair) return;
          clearTimeout(scrollTimer);
          scrollTimer = setTimeout(() => setActive(pair.row, pair.item), 100);
        });
      },
      { rootMargin: "0px 0px -70% 0px", threshold: 0 }
    );

    pairs.forEach(({ item }) => scrollSpyObserver.observe(item));
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

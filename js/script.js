(() => {
  const rows = [...document.querySelectorAll(".portfolio-row")];
  const grid = document.querySelector(".portfolio-grid");
  const pairs = rows.flatMap((row) =>
    [...row.querySelectorAll(".portfolio-item")].map((item) => ({ row, item }))
  );

  // Whatever's marked active in the markup is the "resting" tile — hover/focus
  // temporarily activates another, and leaving the grid returns to this one.
  const defaultRow = document.querySelector(".portfolio-row.is-active-row") || rows[0];
  const defaultItem = document.querySelector(".portfolio-item.is-active-item") || pairs[0]?.item;

  let activeRow = defaultRow;
  let activeItem = defaultItem;

  const setActive = (row, item) => {
    if (item === activeItem) return;
    if (activeRow) activeRow.classList.remove("is-active-row");
    if (activeItem) {
      activeItem.classList.remove("is-active-item");
      activeItem.setAttribute("aria-expanded", "false");
    }
    row.classList.add("is-active-row");
    item.classList.add("is-active-item");
    item.setAttribute("aria-expanded", "true");
    activeRow = row;
    activeItem = item;
  };

  const revertToDefault = () => setActive(defaultRow, defaultItem);

  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  pairs.forEach(({ row, item }) => {
    if (canHover) {
      item.addEventListener("mouseenter", () => setActive(row, item));
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

  if (canHover) {
    grid.addEventListener("mouseleave", revertToDefault);
    grid.addEventListener("focusout", (e) => {
      if (!grid.contains(e.relatedTarget)) revertToDefault();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") revertToDefault();
  });

  document.addEventListener("click", (e) => {
    if (!grid.contains(e.target)) revertToDefault();
  });

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

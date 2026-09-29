/* ARCWII Student Practice Lab — shared helpers for planner pages.
   No backend: everything autosaves to this browser's localStorage,
   and Download PDF is the submission. */

const Lab = (() => {
  const ROSTER_PREFIX = "arcwii-lab-roster::";

  function $(sel, root = document) { return root.querySelector(sel); }
  function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  }

  function slugify(text) {
    return (text || "student")
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "student";
  }

  // ---------- student info bar ----------
  // On a shared classroom computer, the next student must never see the previous
  // student's name/project pre-filled. So these fields start blank on every load,
  // and only once a name is typed do we look up that student's own remembered
  // project text (keyed by their name) — a different name never sees it.
  function wireStudentBar(onIdentified) {
    const nameEl = $("#studentName");
    const projectEl = $("#studentProject");
    if (!nameEl || !projectEl) return;

    nameEl.value = "";
    projectEl.value = "";
    let currentSlug = null;

    function loadRoster(slug) {
      try { return JSON.parse(localStorage.getItem(ROSTER_PREFIX + slug) || "null"); } catch (e) { return null; }
    }
    function saveRoster(slug, data) {
      try { localStorage.setItem(ROSTER_PREFIX + slug, JSON.stringify(data)); } catch (e) {}
    }

    const handleNameSettled = debounce(() => {
      const name = nameEl.value.trim();
      if (!name) {
        currentSlug = null;
        projectEl.value = "";
        if (onIdentified) onIdentified(null);
        return;
      }
      const slug = slugify(name);
      if (slug !== currentSlug) {
        currentSlug = slug;
        const roster = loadRoster(slug);
        if (roster && roster.project) projectEl.value = roster.project;
        if (onIdentified) onIdentified(slug);
      }
      saveRoster(slug, { name, project: projectEl.value });
    }, 500);

    const handleProjectInput = debounce(() => {
      if (currentSlug) saveRoster(currentSlug, { name: nameEl.value.trim(), project: projectEl.value });
    }, 400);

    nameEl.addEventListener("input", handleNameSettled);
    projectEl.addEventListener("input", handleProjectInput);
  }

  // Reads live from the form, not storage — always reflects whoever is currently typed in.
  function getStudentInfo() {
    const nameEl = $("#studentName");
    const projectEl = $("#studentProject");
    return {
      name: nameEl ? nameEl.value.trim() : "",
      project: projectEl ? projectEl.value.trim() : ""
    };
  }

  // ---------- image upload widgets ----------
  // Wires a container with: <input type="file">, a preview <img>, a remove <button>,
  // and a hidden holder element (data-field, data-type="image") that stores the data URL.
  function wireImageUpload(root) {
    $all("[data-image-widget]", root).forEach((widget) => {
      const fileInput = $("input[type=file]", widget);
      const preview = $("img", widget);
      const removeBtn = $("[data-remove-image]", widget);
      const holder = $("[data-type=image]", widget);
      const wrap = $(".image-upload", widget) || widget;

      function setImage(dataUrl) {
        holder.dataset.value = dataUrl || "";
        if (dataUrl) {
          preview.src = dataUrl;
          preview.style.display = "";
          removeBtn.style.display = "";
          wrap.classList.add("has-image");
        } else {
          preview.removeAttribute("src");
          preview.style.display = "none";
          removeBtn.style.display = "none";
          wrap.classList.remove("has-image");
        }
        widget.dispatchEvent(new CustomEvent("lab:change", { bubbles: true }));
      }

      fileInput.addEventListener("change", () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
          alert("Please choose an image file (JPG, PNG, etc.).");
          fileInput.value = "";
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => setImage(e.target.result);
        reader.readAsDataURL(file);
      });

      removeBtn.addEventListener("click", () => {
        fileInput.value = "";
        setImage("");
      });

      widget._setImage = setImage;
      setImage(holder.dataset.value || "");
    });
  }

  // ---------- generic serialize / restore for anything marked data-field ----------
  function serialize(root) {
    const data = {};
    $all("[data-field]", root).forEach((el) => {
      const key = el.dataset.field;
      if (el.dataset.type === "image") {
        data[key] = el.dataset.value || "";
      } else {
        data[key] = el.value;
      }
    });
    return data;
  }

  function restore(root, data) {
    if (!data) return;
    $all("[data-field]", root).forEach((el) => {
      const key = el.dataset.field;
      if (!(key in data)) return;
      if (el.dataset.type === "image") {
        const widget = el.closest("[data-image-widget]");
        if (widget && widget._setImage) widget._setImage(data[key] || "");
        else el.dataset.value = data[key] || "";
      } else {
        el.value = data[key] || "";
      }
    });
  }

  // ---------- autosave to localStorage, isolated per student ----------
  // Nothing is stored or loaded under storageKeyBase alone — every read/write is
  // keyed by storageKeyBase + the current student's name, so two students sharing
  // the same browser never see or overwrite each other's work. Call loadForSlug(null)
  // (or just leave it unset) until a name is known; wireStudentBar's onIdentified
  // callback is the normal way to drive this.
  function initAutosave(root, storageKeyBase) {
    const statusEl = $("#saveStatus");
    let activeKey = null;

    function markSaved(message) {
      if (!statusEl) return;
      statusEl.textContent = message || ("Saved · " + new Date().toLocaleTimeString());
      statusEl.classList.add("ok");
      statusEl.classList.remove("pulse");
      void statusEl.offsetWidth;
      statusEl.classList.add("pulse");
    }

    function setIdleStatus(message) {
      if (!statusEl) return;
      statusEl.textContent = message;
      statusEl.classList.remove("ok", "pulse");
    }

    function blankForm() {
      $all("[data-field]", root).forEach((el) => {
        if (el.dataset.type === "image") {
          const widget = el.closest("[data-image-widget]");
          if (widget && widget._setImage) widget._setImage("");
        } else {
          el.value = "";
        }
      });
    }

    function loadForSlug(slug) {
      blankForm();
      if (!slug) {
        activeKey = null;
        setIdleStatus("Enter your name above to start saving your work");
        return;
      }
      activeKey = `${storageKeyBase}::${slug}`;
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(activeKey) || "null"); } catch (e) {}
      if (saved) {
        restore(root, saved);
        markSaved("Welcome back — your saved work is loaded");
      } else {
        setIdleStatus("Not saved yet");
      }
    }

    const doSave = debounce(() => {
      if (!activeKey) return;
      localStorage.setItem(activeKey, JSON.stringify(serialize(root)));
      markSaved();
    }, 400);

    function clear() {
      if (!confirm("Clear every answer and image on this page? This cannot be undone.")) return;
      if (activeKey) localStorage.removeItem(activeKey);
      blankForm();
      setIdleStatus(activeKey ? "Not saved yet" : "Enter your name above to start saving your work");
    }

    setIdleStatus("Enter your name above to start saving your work");
    root.addEventListener("input", doSave);
    root.addEventListener("lab:change", doSave);
    return { save: doSave, markSaved, loadForSlug, clear };
  }

  // ---------- PDF export ----------
  // Builds a plain, print-friendly copy of the form (values as text, images kept)
  // inside #print-root, then rasterizes it to a paginated PDF.
  function buildPrintable(root, titleHtml) {
    const printRoot = $("#print-root");
    printRoot.innerHTML = "";

    const header = document.createElement("div");
    header.style.marginBottom = "18px";
    const info = getStudentInfo();
    header.innerHTML = `
      <div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#4a5568;">ARCWII Student Practice Lab</div>
      <h1 style="margin:2px 0 8px;font-size:20px;">${titleHtml}</h1>
      <div style="font-size:13px;color:#1c2530;">
        <strong>Student:</strong> ${escapeHtml(info.name || "—")} &nbsp;&nbsp;
        <strong>Campaign / project:</strong> ${escapeHtml(info.project || "—")} &nbsp;&nbsp;
        <strong>Exported:</strong> ${new Date().toLocaleString()}
      </div>`;
    printRoot.appendChild(header);

    const clone = root.cloneNode(true);
    $all("[data-noprint]", clone).forEach((el) => el.remove());

    const liveFields = $all("[data-field]", root);
    const cloneFields = $all("[data-field]", clone);
    liveFields.forEach((liveEl, i) => {
      const cloneEl = cloneFields[i];
      if (!cloneEl) return;
      if (liveEl.dataset.type === "image") {
        const widget = cloneEl.closest("[data-image-widget]");
        if (widget) {
          const img = $("img", widget);
          const controls = $(".image-upload-controls", widget);
          if (controls) controls.remove();
          if (img) {
            if (liveEl.dataset.value) {
              img.src = liveEl.dataset.value;
              img.style.display = "";
              img.style.maxWidth = "260px";
              img.style.maxHeight = "260px";
            } else {
              const div = document.createElement("div");
              div.className = "print-value empty";
              div.textContent = "(no image uploaded)";
              img.replaceWith(div);
            }
          }
        }
      } else {
        const div = document.createElement("div");
        const val = (liveEl.value || "").trim();
        div.className = "print-value" + (val ? "" : " empty");
        div.textContent = val || "(no response)";
        cloneEl.replaceWith(div);
      }
    });

    printRoot.appendChild(clone);

    const footer = document.createElement("div");
    footer.style.cssText = "margin-top:20px;font-size:10px;color:#8b96a3;";
    footer.textContent = "Prepared in the ARCWII Student Practice Lab — for course submission use.";
    printRoot.appendChild(footer);

    return printRoot;
  }

  function escapeHtml(str) {
    return (str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  async function exportPdf(root, toolSlug, titleHtml, button) {
    const info = getStudentInfo();
    const printRoot = buildPrintable(root, titleHtml);

    // Render on-screen (not thousands of px off-screen — many browsers skip painting
    // content that far outside the viewport, which is what produced blank PDFs) but
    // hidden from the student behind an opaque overlay.
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:#16324f;color:#fff;" +
      "display:flex;align-items:center;justify-content:center;" +
      "font:600 15px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;z-index:2147483000;";
    overlay.textContent = "Preparing your PDF…";
    document.body.appendChild(overlay);

    printRoot.style.cssText =
      "display:block;position:absolute;top:0;left:0;width:720px;background:#fff;" +
      "padding:24px;z-index:2147482999;";
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const originalLabel = button ? button.textContent : null;
    if (button) { button.disabled = true; button.textContent = "Preparing PDF…"; }

    try {
      const canvas = await html2canvas(printRoot, {
        scale: 2, backgroundColor: "#ffffff", useCORS: true
      });

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ unit: "pt", format: "letter" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 36;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2;

      const scale = contentWidth / canvas.width;
      const sliceHeightPx = Math.max(1, Math.floor(contentHeight / scale));

      let renderedPx = 0;
      let firstPage = true;
      while (renderedPx < canvas.height) {
        const sliceHeight = Math.min(sliceHeightPx, canvas.height - renderedPx);
        const pageCanvas = document.createElement("canvas");
        pageCanvas.width = canvas.width;
        pageCanvas.height = sliceHeight;
        const ctx = pageCanvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
        ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

        if (!firstPage) doc.addPage();
        doc.addImage(pageCanvas.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, contentWidth, sliceHeight * scale);
        renderedPx += sliceHeight;
        firstPage = false;
      }

      doc.save(`${slugify(info.name)}-${toolSlug}.pdf`);
    } catch (err) {
      console.error(err);
      alert("The PDF could not be created. Please try again.");
    } finally {
      overlay.remove();
      printRoot.style.display = "none";
      printRoot.removeAttribute("style");
      document.body.style.overflow = prevBodyOverflow;
      if (button) { button.disabled = false; button.textContent = originalLabel; }
    }
  }

  // ---------- frame show/hide (carousel planner) ----------
  function initFrameControls(root, opts) {
    const frames = $all("[data-frame]", root);
    const countKey = opts.countStorageKey;
    let visible = opts.defaultCount;
    try {
      const savedCount = parseInt(localStorage.getItem(countKey), 10);
      if (savedCount >= opts.min && savedCount <= opts.max) visible = savedCount;
    } catch (e) {}

    function applyVisibility() {
      frames.forEach((f, i) => {
        f.style.display = i < visible ? "" : "none";
      });
      localStorage.setItem(countKey, String(visible));
      const addBtn = $("#addFrame", root);
      const removeBtn = $("#removeFrame", root);
      if (addBtn) addBtn.disabled = visible >= opts.max;
      if (removeBtn) removeBtn.disabled = visible <= opts.min;
      const label = $("#frameCount", root);
      if (label) label.textContent = `${visible} of ${opts.max} ${opts.unit || "frames"} shown`;
    }

    const addBtn = $("#addFrame", root);
    const removeBtn = $("#removeFrame", root);
    if (addBtn) addBtn.addEventListener("click", () => { if (visible < opts.max) visible++; applyVisibility(); });
    if (removeBtn) removeBtn.addEventListener("click", () => { if (visible > opts.min) visible--; applyVisibility(); });

    applyVisibility();
  }

  return {
    $, $all, wireStudentBar, wireImageUpload, initAutosave,
    exportPdf, initFrameControls
  };
})();

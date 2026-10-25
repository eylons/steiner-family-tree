const SVG_NS = "http://www.w3.org/2000/svg";
const BASE_ZOOM = 0.7;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.8;

const viewport = document.querySelector("#tree-viewport");
const svg = document.querySelector("#family-tree");
const status = document.querySelector("#tree-status");
const searchInput = document.querySelector("#person-search");
const searchResults = document.querySelector("#search-results");
const zoomLabel = document.querySelector("#zoom-label");
const personCard = document.querySelector("#person-card");
const personName = document.querySelector("#person-name");
const personSource = document.querySelector("#person-source");

let chartData;
let zoom = BASE_ZOOM;
let selectedPersonId = null;
let matchingIds = new Set();
let dragStart = null;
let dragMoved = false;

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, String(value));
  }
  return element;
}

function setZoom(value, focusX, focusY) {
  if (!chartData) return;
  const previous = zoom;
  zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
  const ratio = zoom / previous;
  const oldLeft = viewport.scrollLeft;
  const oldTop = viewport.scrollTop;
  svg.style.width = `${chartData.width * zoom}px`;
  svg.style.height = `${chartData.height * zoom}px`;
  zoomLabel.textContent = `${Math.round(zoom * 100)}%`;

  if (focusX !== undefined && focusY !== undefined) {
    requestAnimationFrame(() => {
      viewport.scrollLeft = focusX * ratio - (focusX - oldLeft);
      viewport.scrollTop = focusY * ratio - (focusY - oldTop);
    });
  }
}

function drawChart(data) {
  chartData = data;
  document.querySelector("#people-summary").textContent =
    `${data.people.length} names transcribed from the family’s full-tree spreadsheet`;
  svg.setAttribute("viewBox", `0 0 ${data.width} ${data.height}`);
  svg.setAttribute("width", data.width);
  svg.setAttribute("height", data.height);

  const background = svgElement("rect", {
    x: 0,
    y: 0,
    width: data.width,
    height: data.height,
    fill: "#fbfaf6",
  });
  svg.append(background);

  const lineGroup = svgElement("g", {
    "aria-hidden": "true",
    stroke: "#8b806d",
    "stroke-linecap": "square",
  });
  for (const line of data.lines) {
    lineGroup.append(svgElement("line", {
      x1: line.x1,
      y1: line.y1,
      x2: line.x2,
      y2: line.y2,
      "stroke-width": line.width,
    }));
  }
  svg.append(lineGroup);

  const labelGroup = svgElement("g", {
    "aria-hidden": "true",
    fill: "#676557",
    "font-family": "Georgia, 'Times New Roman', serif",
    "font-size": 15,
  });
  for (const label of data.labels) {
    const text = svgElement("text", {
      x: label.x,
      y: label.y,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
    });
    text.textContent = label.text;
    labelGroup.append(text);
  }
  svg.append(labelGroup);

  const peopleGroup = svgElement("g", {
    "font-family": "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    "font-size": 14,
  });
  for (const person of data.people) {
    const nameWidth = Math.max(8, person.width - 12);
    const group = svgElement("g", {
      class: "tree-person",
      "data-person-id": person.id,
      tabindex: "0",
      role: "button",
      "aria-label": `Select ${person.name}`,
    });
    const hitArea = svgElement("rect", {
      x: person.x - 5,
      y: person.y - 14,
      width: Math.max(person.width + 10, 44),
      height: 35,
      rx: 3,
      class: "person-hit-area",
    });
    group.append(hitArea);

    const first = svgElement("text", {
      x: person.x + person.width / 2,
      y: person.y - 2,
      "text-anchor": "middle",
      class: "person-first-name",
      "data-max-width": nameWidth,
    });
    first.textContent = person.first_name;
    group.append(first);

    if (person.last_name) {
      const last = svgElement("text", {
        x: person.x + person.width / 2,
        y: person.y + 14,
        "text-anchor": "middle",
        class: "person-last-name",
        "data-max-width": nameWidth,
      });
      last.textContent = person.last_name;
      group.append(last);
    }

    group.addEventListener("click", () => {
      if (!dragMoved) selectPerson(person.id, true);
    });
    group.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectPerson(person.id, true);
      }
    });
    peopleGroup.append(group);
  }
  svg.append(peopleGroup);
  for (const name of peopleGroup.querySelectorAll(".person-first-name, .person-last-name")) {
    const maxWidth = Number(name.dataset.maxWidth);
    const measuredWidth = name.getComputedTextLength();
    if (measuredWidth > 0 && measuredWidth > maxWidth) {
      name.setAttribute("textLength", String(maxWidth));
      name.setAttribute("lengthAdjust", "spacingAndGlyphs");
    }
  }
  status.hidden = true;
  setZoom(BASE_ZOOM);
  updatePersonStyles();
}

function updatePersonStyles() {
  for (const element of svg.querySelectorAll(".tree-person")) {
    const id = element.dataset.personId;
    element.classList.toggle("is-selected", id === selectedPersonId);
    element.classList.toggle("is-match", matchingIds.has(id));
    element.classList.toggle("is-dimmed", matchingIds.size > 0 && !matchingIds.has(id));
  }
}

function selectPerson(id, center) {
  const person = chartData.people.find((candidate) => candidate.id === id);
  if (!person) return;
  selectedPersonId = person.id;
  personName.textContent = person.name;
  personSource.textContent = `Original chart · row ${person.row}, column ${person.column}`;
  personCard.hidden = false;
  searchResults.hidden = true;
  updatePersonStyles();

  if (center) {
    const x = (person.x + person.width / 2) * zoom;
    const y = person.y * zoom;
    viewport.scrollTo({
      left: Math.max(0, x - viewport.clientWidth / 2),
      top: Math.max(0, y - viewport.clientHeight / 2),
      behavior: "smooth",
    });
  }
}

function renderResults(query) {
  const term = query.trim().toLocaleLowerCase();
  if (!term) {
    searchResults.hidden = true;
    searchResults.replaceChildren();
    matchingIds = new Set();
    updatePersonStyles();
    return;
  }

  const matches = chartData.people
    .filter((person) => person.name.toLocaleLowerCase().includes(term))
    .slice(0, 30);
  matchingIds = new Set(matches.map((person) => person.id));
  updatePersonStyles();
  searchResults.replaceChildren();
  searchResults.hidden = false;

  if (matches.length === 0) {
    const empty = document.createElement("div");
    empty.className = "no-results";
    empty.textContent = "No names found. Try another spelling.";
    searchResults.append(empty);
    return;
  }

  for (const person of matches) {
    const button = document.createElement("button");
    button.className = "search-result";
    button.type = "button";
    button.setAttribute("role", "option");
    const name = document.createElement("span");
    name.className = "search-result-name";
    name.textContent = person.name;
    const source = document.createElement("span");
    source.className = "search-result-meta";
    source.textContent = `row ${person.row}`;
    button.append(name, source);
    button.addEventListener("click", () => {
      searchInput.value = person.name;
      selectPerson(person.id, true);
    });
    searchResults.append(button);
  }
}

function openPhotograph(button) {
  const dialog = document.querySelector("#photo-dialog");
  const image = document.querySelector("#dialog-image");
  const caption = document.querySelector("#dialog-caption");
  image.src = button.dataset.photo;
  image.alt = button.dataset.alt;
  caption.textContent = button.dataset.alt;
  dialog.showModal();
}

document.querySelector("#zoom-in").addEventListener("click", () => setZoom(zoom + 0.15));
document.querySelector("#zoom-out").addEventListener("click", () => setZoom(zoom - 0.15));
document.querySelector("#fit-chart").addEventListener("click", () => {
  setZoom(BASE_ZOOM);
  viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" });
});
document.querySelector("#close-person").addEventListener("click", () => {
  selectedPersonId = null;
  personCard.hidden = true;
  updatePersonStyles();
});
searchInput.addEventListener("input", () => renderResults(searchInput.value));
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    searchResults.hidden = true;
    return;
  }
  if (event.key === "Enter") {
    const first = searchResults.querySelector(".search-result");
    if (first) first.click();
  }
});
searchInput.addEventListener("focus", () => {
  if (searchInput.value.trim()) renderResults(searchInput.value);
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-wrap")) searchResults.hidden = true;
});
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
});
viewport.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  dragStart = {
    x: event.clientX,
    y: event.clientY,
    left: viewport.scrollLeft,
    top: viewport.scrollTop,
  };
  dragMoved = false;
  viewport.classList.add("is-dragging");
});
viewport.addEventListener("pointermove", (event) => {
  if (!dragStart) return;
  const deltaX = event.clientX - dragStart.x;
  const deltaY = event.clientY - dragStart.y;
  if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) dragMoved = true;
  if (dragMoved) {
    viewport.scrollLeft = dragStart.left - deltaX;
    viewport.scrollTop = dragStart.top - deltaY;
  }
});
function finishDragging() {
  dragStart = null;
  viewport.classList.remove("is-dragging");
  if (dragMoved) setTimeout(() => { dragMoved = false; }, 80);
}
viewport.addEventListener("pointerup", finishDragging);
viewport.addEventListener("pointercancel", finishDragging);
for (const button of document.querySelectorAll(".photo-card, .panorama-image-button")) {
  button.addEventListener("click", () => openPhotograph(button));
}
document.querySelector("#dialog-close").addEventListener("click", () => {
  document.querySelector("#photo-dialog").close();
});

fetch("data/tree.json")
  .then((response) => {
    if (!response.ok) throw new Error(`Could not load family chart data (${response.status}).`);
    return response.json();
  })
  .then(drawChart)
  .catch((error) => {
    status.textContent = "The family chart could not be loaded. Please refresh the page.";
    console.error(error);
  });

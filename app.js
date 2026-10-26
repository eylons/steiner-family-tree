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
const personPhotoGrid = document.querySelector("#person-photo-grid");
const personDetails = document.querySelector("#person-details");
const personFacts = document.querySelector("#person-facts");
const personRelated = document.querySelector("#person-related");
const relatedTreeNotice = document.querySelector("#related-tree-notice");
const relatedTreeButton = document.querySelector("#open-related-tree");
const treeViewSelect = document.querySelector("#tree-view-select");
const relatedTreeDescription = document.querySelector("#related-tree-description");

let chartData;
let mainTreeData;
let moreSteinerTreeData;
let steinerListTreeData;
let feiginTreeData;
let mainPhotosByPerson = {};
let photosByPerson = {};
let profilesByPerson = {};
let activeTreeId = "steiner";
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

function initialZoom(data) {
  if (!data.initial_zoom) return BASE_ZOOM;
  const fitZoom = (viewport.clientWidth - 24) / data.width;
  return Math.min(data.initial_zoom, Math.max(MIN_ZOOM, fitZoom));
}

function drawChart(data, photos) {
  const mobileLayout = data.mobile_layout && viewport.clientWidth <= 640
    ? data.mobile_layout
    : null;
  const layoutData = mobileLayout
    ? {
      ...data,
      ...mobileLayout,
      people: data.people.map((person) => ({
        ...person,
        ...mobileLayout.people[person.id],
      })),
    }
    : data;
  const title = svgElement("title", { id: "tree-title" });
  title.textContent = layoutData.title || "The Steiner family tree";
  const description = svgElement("desc", { id: "tree-description" });
  description.textContent = layoutData.description
    || "An interactive family chart. Select a name to see its family details.";
  svg.replaceChildren(title, description);
  chartData = layoutData;
  photosByPerson = photos;
  document.querySelector("#people-summary").textContent =
    layoutData.summary || `${layoutData.people.length} names transcribed from the family’s full-tree spreadsheet`;
  svg.classList.toggle("is-compact-tree", layoutData.compact_chart === true);
  svg.setAttribute("viewBox", `0 0 ${layoutData.width} ${layoutData.height}`);
  svg.setAttribute("width", layoutData.width);
  svg.setAttribute("height", layoutData.height);

  const background = svgElement("rect", {
    x: 0,
    y: 0,
    width: layoutData.width,
    height: layoutData.height,
    fill: "#fbfaf6",
  });
  svg.append(background);

  const lineGroup = svgElement("g", {
    "aria-hidden": "true",
    stroke: "#8b806d",
    "stroke-linecap": "square",
  });
  for (const line of layoutData.lines) {
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
  for (const label of layoutData.labels) {
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
  const showPersonCards = layoutData.person_cards === true;
  for (const person of layoutData.people) {
    const nameWidth = Math.max(8, person.width - (showPersonCards ? 18 : 12));
    const group = svgElement("g", {
      class: showPersonCards ? "tree-person has-person-card" : "tree-person",
      "data-person-id": person.id,
      tabindex: "0",
      role: "button",
      "aria-label": `Select ${person.name}`,
    });
    const hitArea = svgElement("rect", {
      x: person.x - (showPersonCards ? 10 : 5),
      y: person.y - (showPersonCards ? 27 : 14),
      width: Math.max(person.width + (showPersonCards ? 20 : 10), 44),
      height: showPersonCards
        ? (person.last_name ? 64 : 42)
        : 35,
      rx: showPersonCards ? 5 : 3,
      class: "person-hit-area",
    });
    group.append(hitArea);

    const first = svgElement("text", {
      x: person.x + person.width / 2,
      y: person.y + person.font_size * 0.39,
      "text-anchor": "middle",
      class: "person-first-name",
      "data-max-width": nameWidth,
      "font-size": person.font_size,
    });
    first.textContent = person.first_name;
    group.append(first);

    if (person.last_name) {
      const last = svgElement("text", {
        x: person.x + person.width / 2,
        y: person.last_name_y + person.font_size * 0.39,
        "text-anchor": "middle",
        class: "person-last-name",
        "data-max-width": nameWidth,
        "font-size": person.font_size,
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
  setZoom(initialZoom(layoutData));
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

function selectPerson(id, center, scrollToCard = true) {
  const person = chartData.people.find((candidate) => candidate.id === id);
  if (!person) return;
  selectedPersonId = person.id;
  personName.textContent = person.name;
  personSource.textContent = person.source_label
    || `Original chart · row ${person.row}, column ${person.column}`;
  personCard.hidden = false;
  renderPersonDetails(person);
  renderPersonPhotos(person.id);
  if (scrollToCard) personCard.scrollIntoView({ behavior: "smooth", block: "start" });
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

function renderPersonDetails(person) {
  const profile = profilesByPerson[person.id] || {};
  personFacts.replaceChildren();
  for (const fact of profile.facts || []) {
    const term = document.createElement("dt");
    term.textContent = fact.label;
    const details = document.createElement("dd");
    const value = document.createElement("span");
    value.textContent = fact.value;
    const source = document.createElement("cite");
    source.textContent = fact.location
      ? `${fact.source}, ${fact.location}`
      : `${fact.source}, page ${fact.page}`;
    details.append(value, source);
    personFacts.append(term, details);
  }
  personDetails.hidden = personFacts.childElementCount === 0;
  personRelated.hidden = profile.related_tree !== "feigin";
  relatedTreeButton.textContent = activeTreeId === "feigin"
    ? "Back to the Steiner chart"
    : "Explore the Feigin branch";
}

function renderPersonPhotos(id) {
  const photos = photosByPerson[id] || [];
  personPhotoGrid.replaceChildren();

  if (photos.length === 0) {
    const empty = document.createElement("p");
    empty.className = "person-photo-empty";
    empty.textContent = "No photos matched this name in the family gallery.";
    personPhotoGrid.append(empty);
    return;
  }

  for (const photo of photos) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "person-photo";
    button.dataset.photo = photo.src;
    button.dataset.alt = photo.filename;
    button.setAttribute("aria-label", `Open photo: ${photo.filename}`);

    const image = document.createElement("img");
    image.src = photo.thumbnail;
    image.alt = "";
    image.loading = "lazy";

    const caption = document.createElement("span");
    caption.textContent = photo.filename;
    button.append(image, caption);
    button.addEventListener("click", () => openPhotograph(button));
    personPhotoGrid.append(button);
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
    source.textContent = person.row
      ? `row ${person.row}`
      : (person.source_label || "Family branch").split(" · ")[0];
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
  setZoom(initialZoom(chartData));
  viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" });
});
document.querySelector("#close-person").addEventListener("click", () => {
  selectedPersonId = null;
  personCard.hidden = true;
  updatePersonStyles();
});
function showTreeView(treeId, selectedId = null) {
  activeTreeId = treeId;
  treeViewSelect.value = treeId;
  searchInput.value = "";
  matchingIds.clear();
  searchResults.hidden = true;
  const viewData = {
    steiner: mainTreeData,
    "more-steiner": moreSteinerTreeData,
    "steiner-list": steinerListTreeData,
    feigin: feiginTreeData,
  }[treeId];
  const photos = treeId === "steiner" || treeId === "feigin" ? mainPhotosByPerson : {};
  drawChart(viewData, photos);
  viewport.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  const hasRelatedView = treeId !== "steiner";
  relatedTreeNotice.hidden = !hasRelatedView;
  relatedTreeDescription.textContent = treeId === "feigin"
    ? "Viewing the Feigin branch connected through Yael."
    : treeId === "more-steiner"
      ? "Viewing the additional chart as a separate source; identities are not merged automatically."
      : "Viewing the numbered source list as a separate branch; abbreviated names are not merged automatically.";
  personCard.hidden = true;
  selectedPersonId = null;
  if (selectedId && viewData.people.some((person) => person.id === selectedId)) {
    selectPerson(selectedId, false, false);
  }
  if (treeId === "feigin") {
    document.querySelector("#tree").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

relatedTreeButton.addEventListener("click", () => {
  if (activeTreeId === "feigin") showTreeView("steiner", "50-9");
  else showTreeView("feigin", "50-9");
});
treeViewSelect.addEventListener("change", () => {
  const selectedId = chartData.people.some((person) => person.id === selectedPersonId)
    ? selectedPersonId
    : null;
  showTreeView(treeViewSelect.value, selectedId);
});
document.querySelector("#return-to-steiner-tree").addEventListener("click", () => {
  showTreeView("steiner", "50-9");
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

Promise.all([
  fetch("data/tree.json?v=names-fit-3"),
  fetch("data/more-steiners-tree.json"),
  fetch("data/steiner-list-tree.json"),
  fetch("data/person-photos.json", { cache: "no-cache" }),
  fetch("data/person-profiles.json?v=sourced-profiles-1"),
  fetch("data/feigin-branch.json"),
])
  .then(async ([treeResponse, moreSteinerResponse, steinerListResponse, photosResponse, profilesResponse, feiginResponse]) => {
    if (!treeResponse.ok) throw new Error(`Could not load family chart data (${treeResponse.status}).`);
    if (!moreSteinerResponse.ok) throw new Error(`Could not load the additional Steiner chart (${moreSteinerResponse.status}).`);
    if (!steinerListResponse.ok) throw new Error(`Could not load the numbered Steiner list (${steinerListResponse.status}).`);
    if (!photosResponse.ok) throw new Error(`Could not load matched family photos (${photosResponse.status}).`);
    if (!profilesResponse.ok) throw new Error(`Could not load sourced family details (${profilesResponse.status}).`);
    if (!feiginResponse.ok) throw new Error(`Could not load the Feigin family branch (${feiginResponse.status}).`);
    const [tree, moreSteinerTree, steinerListTree, photoData, profileData, feiginTree] = await Promise.all([
      treeResponse.json(),
      moreSteinerResponse.json(),
      steinerListResponse.json(),
      photosResponse.json(),
      profilesResponse.json(),
      feiginResponse.json(),
    ]);
    mainTreeData = tree;
    moreSteinerTreeData = moreSteinerTree;
    steinerListTreeData = steinerListTree;
    feiginTreeData = feiginTree;
    profilesByPerson = profileData.profiles;
    mainPhotosByPerson = photoData.photos;
    drawChart(tree, photoData.photos);
  })
  .catch((error) => {
    status.textContent = "The family chart or matched photos could not be loaded. Please refresh the page.";
    console.error(error);
  });

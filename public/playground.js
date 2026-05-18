class UserError extends Error {}

// # Polyline encoding

function encodePolyline(coords, precision) {
  let lastLat = 0;
  let lastLng = 0;
  const factor = Math.pow(10, precision || 5);
  let result = "";
  for (const [lng, lat] of coords) {
    const ilat = Math.round(lat * factor);
    const ilng = Math.round(lng * factor);
    result += encodeSigned(ilat - lastLat);
    result += encodeSigned(ilng - lastLng);
    lastLat = ilat;
    lastLng = ilng;
  }
  return result;
}

function encodeSigned(value) {
  let sgnNum = value << 1;
  if (value < 0) sgnNum = ~sgnNum;
  return encodeUnsigned(sgnNum);
}

function encodeUnsigned(value) {
  let encoded = "";
  while (value >= 0x20) {
    encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }
  encoded += String.fromCharCode(value + 63);
  return encoded;
}

function geojsonToCommands(geojson, precision) {
  if (!geojson) return [];

  if (Array.isArray(geojson) && Array.isArray(geojson[0])) {
    const encoded = encodePolyline(geojson, precision);
    const prefix = precision !== 5 ? `${precision}:` : "";
    return [`line:${prefix}${encodeURIComponent(encoded)}`];
  }

  if (!geojson.type) return [];

  if (geojson.type === "Point") {
    const [lng, lat] = geojson.coordinates;
    const factor = Math.pow(10, precision);
    const rLng = Math.round(lng * factor) / factor;
    const rLat = Math.round(lat * factor) / factor;
    return [`point:${rLng}:${rLat}`];
  }

  if (geojson.type === "LineString") {
    const encoded = encodePolyline(geojson.coordinates, precision);
    const prefix = precision !== 5 ? `${precision}:` : "";
    return [`line:${prefix}${encodeURIComponent(encoded)}`];
  }

  if (geojson.type === "MultiLineString") {
    return (geojson.coordinates ?? []).map((coords) => {
      const encoded = encodePolyline(coords, precision);
      const prefix = precision !== 5 ? `${precision}:` : "";
      return `line:${prefix}${encodeURIComponent(encoded)}`;
    });
  }

  if (geojson.type === "Feature")
    return geojsonToCommands(geojson.geometry, precision);

  if (geojson.type === "FeatureCollection") {
    return geojson.features.flatMap((f) => geojsonToCommands(f, precision));
  }

  return [];
}

// # Schema
// cmdMap keys are "type/arity" e.g. "line/1", "line/2", plus synthetic "line (geojson)"

let schema = null;
let cmdMap = new Map();

function cmdArity(cmd) {
  const restArg = cmd.args.find((a) => a.rest);
  return restArg ? "rest" : String(cmd.args.length);
}

function cmdKey(cmd) {
  return `${cmd.type}/${cmdArity(cmd)}`;
}

async function loadSchema() {
  const res = await fetch("/schema.json");
  schema = await res.json();
  for (const cmd of schema.commands) {
    cmdMap.set(cmdKey(cmd), cmd);
  }
  // synthetic frontend-only entry for the GeoJSON line editor
  cmdMap.set("line (geojson)", {
    type: "line",
    category: "feature",
    alt: [],
    args: [],
    _geojson: true,
  });
}

// # Default arg value for a command arg
// Priority: arg.default -> cmd.example[argIndex] -> 0 / ""

function defaultArgValue(cmd, argIndex) {
  const arg = cmd.args[argIndex];
  if (!arg) return "";

  if (cmd.example && cmd.example[argIndex] !== undefined) {
    return cmd.example[argIndex];
  }

  if (arg.default !== undefined) return arg.default;

  if (arg.schema.type === "number") return 0;
  if (arg.schema.type === "enum") return arg.schema.values[0] ?? "";
  return "";
}

function defaultArgsForKey(key) {
  if (key === "line (geojson)")
    return { _geojson: "", precision: 5, tolerance: "" };
  const cmd = cmdMap.get(key);
  if (!cmd) return {};
  const args = {};
  cmd.args.forEach((arg, i) => {
    const val = defaultArgValue(cmd, i);
    // rest args: default is array, example[i] may be array
    if (arg.rest) {
      args[arg.name] = Array.isArray(val) ? val.join(" ") : String(val ?? "");
    } else {
      args[arg.name] = val ?? "";
    }
  });
  return args;
}

// # State

const DEFAULT_GEOJSON_LINE =
  '{"type":"Feature","properties":{},"geometry":{"type":"LineString","coordinates":[[-3.7433,57.13575],[-3.74283,57.13553],[-3.74238,57.13515],[-3.74218,57.13479],[-3.74214,57.13463],[-3.74203,57.13453],[-3.74203,57.1344],[-3.74189,57.13432],[-3.74184,57.1342],[-3.74155,57.134],[-3.74143,57.13376],[-3.74131,57.13372],[-3.74097,57.13334],[-3.74001,57.13264],[-3.73827,57.13165],[-3.737,57.13088],[-3.73603,57.13047],[-3.73539,57.13033],[-3.73382,57.12941],[-3.73305,57.1286],[-3.73259,57.1279],[-3.73208,57.12762],[-3.73205,57.12749],[-3.73002,57.12632],[-3.72977,57.126],[-3.72914,57.12586],[-3.72776,57.125]]}}';

function defaultState() {
  return {
    source: "osm",
    pagesMode: false,
    commands: [
      { cmdKey: "size/2", args: { width: 600, height: 300 } },
      { cmdKey: "color/1", args: { value: "#0000ff" } },
      { cmdKey: "width/1", args: { value: 10 } },
      { cmdKey: "borderColor/1", args: { value: "#ffffff" } },
      { cmdKey: "borderWidth/1", args: { value: 6 } },
      { cmdKey: "labelColor/1", args: { value: "#000000" } },
      { cmdKey: "labelSize/1", args: { value: 16 } },
      { cmdKey: "labelHaloColor/1", args: { value: "#ffffff" } },
      { cmdKey: "labelHaloWidth/1", args: { value: 2 } },
      {
        cmdKey: "line (geojson)",
        args: { _geojson: DEFAULT_GEOJSON_LINE, precision: 5, tolerance: "" },
      },
      { cmdKey: "label/1", args: { value: "Midpoint" } },
      { cmdKey: "point/2", args: { lng: -3.73539, lat: 57.13033 } },
    ],
  };
}

let state = defaultState();

// # URL serialization

function serializeCommand(cmd) {
  if (cmd.cmdKey === "line (geojson)") {
    const { _geojson, precision, tolerance } = cmd.args;
    const raw = (_geojson ?? "").trim();
    if (!raw) throw new UserError("Line command: GeoJSON cannot be empty.");
    let geojson;
    try {
      geojson = JSON.parse(raw);
    } catch {
      throw new UserError("Line command: GeoJSON must be valid JSON.");
    }
    const tol = parseFloat(tolerance);
    if (Number.isFinite(tol) && tol > 0) {
      geojson = turf.simplify(geojson, {
        tolerance: Math.pow(10, -tol),
        highQuality: false,
      });
    }
    return geojsonToCommands(geojson, precision ?? 5);
  }

  const cmdSchema = cmdMap.get(cmd.cmdKey);
  if (!cmdSchema) return [];

  const parts = [cmdSchema.type];
  for (const argDef of cmdSchema.args) {
    if (argDef.rest) {
      const raw = String(cmd.args[argDef.name] ?? "").trim();
      if (raw) {
        for (const part of raw.split(/\s+/)) {
          parts.push(encodeURIComponent(part));
        }
      }
    } else {
      const val = cmd.args[argDef.name];
      if (val === undefined || val === "") {
        if (cmdSchema.args.length === 0) break;
        throw new UserError(
          `Command "${cmdSchema.type}": missing argument "${argDef.name}".`,
        );
      }
      parts.push(encodeURIComponent(String(val)));
    }
  }
  return [parts.join(":")];
}

function buildMapUrl() {
  const source = (state.source ?? "").trim();
  if (!source) throw new UserError("Source key is required.");

  const segments = [`map:${source}`];
  for (const cmd of state.commands) {
    segments.push(...serializeCommand(cmd));
  }

  const path = `/${segments.join("/")}`;
  return state.pagesMode ? `/pages${path}` : path;
}

// # Hash persistence

function saveToHash() {
  history.replaceState(null, "", "#" + JSON.stringify(state));
}

function loadFromHash() {
  const hash = location.hash.slice(1);
  if (!hash) return false;
  try {
    const parsed = JSON.parse(decodeURIComponent(hash));
    if (
      parsed &&
      Array.isArray(parsed.commands) &&
      parsed.commands.length > 0
    ) {
      state = parsed;
      document.getElementById("source").value = state.source ?? "osm";
      document.getElementById("pages-mode").checked = state.pagesMode ?? false;
      return true;
    }
  } catch {
    // fall through to default
  }
  return false;
}

// # DOM rendering

function categoryClass(category) {
  return `cat-${category}`;
}

function renderArgField(argDef, value, onChange) {
  const group = document.createElement("div");
  group.className = "arg-group" + (argDef.rest ? " arg-rest" : "");

  const label = document.createElement("label");
  label.textContent = argDef.name;
  group.appendChild(label);

  let input;
  if (argDef.rest) {
    input = document.createElement("input");
    input.type = "text";
    input.value = value ?? "";
    input.placeholder = "space-separated values";
  } else if (argDef.schema.type === "enum") {
    input = document.createElement("select");
    for (const opt of argDef.schema.values) {
      const o = document.createElement("option");
      o.value = opt;
      o.textContent = opt;
      if (String(value) === opt) o.selected = true;
      input.appendChild(o);
    }
  } else if (argDef.schema.type === "number") {
    input = document.createElement("input");
    input.type = "number";
    input.value = value ?? "";
    input.step = "any";
  } else {
    input = document.createElement("input");
    input.type = "text";
    input.value = value ?? "";
  }

  input.addEventListener("input", () => onChange(input.value));
  group.appendChild(input);
  return group;
}

function renderLineGeojsonRow(cmd, index) {
  const row = document.createElement("div");
  row.className = "cmd-row cat-feature";
  row.dataset.index = index;

  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.textContent = "⠿";
  row.appendChild(handle);

  const badge = document.createElement("span");
  badge.className = "cmd-type-badge";
  const badgeLink = document.createElement("a");
  badgeLink.href = `/reference.html#line/1`;
  badgeLink.target = "_blank";
  badgeLink.rel = "noopener noreferrer";
  badgeLink.textContent = "line (geojson)";
  badge.appendChild(badgeLink);
  const badgeCat = document.createElement("span");
  badgeCat.className = "cmd-category";
  badgeCat.textContent = "feature";
  badge.appendChild(badgeCat);
  row.appendChild(badge);

  const argsDiv = document.createElement("div");
  argsDiv.className = "cmd-args geo-controls";

  // GeoJSON textarea
  const geoGroup = document.createElement("div");
  geoGroup.className = "arg-group";
  const geoLabel = document.createElement("label");
  geoLabel.textContent = "GeoJSON";
  geoGroup.appendChild(geoLabel);

  const textarea = document.createElement("textarea");
  textarea.spellcheck = false;
  textarea.value = cmd.args._geojson ?? "";
  textarea.placeholder =
    '{"type":"Feature","geometry":{"type":"LineString","coordinates":[...]}}';
  textarea.addEventListener("input", () => {
    state.commands[index].args._geojson = textarea.value;
    onStateChange();
  });

  const geojsonioLink = document.createElement("a");
  geojsonioLink.textContent = "geojson.io";
  geojsonioLink.target = "_blank";
  geojsonioLink.rel = "noopener noreferrer";
  geojsonioLink.style.fontSize = "11px";
  geojsonioLink.style.color = "var(--muted)";
  geojsonioLink.style.marginTop = "2px";
  updateGeojsonioLink(geojsonioLink, textarea.value);
  textarea.addEventListener("input", () =>
    updateGeojsonioLink(geojsonioLink, textarea.value),
  );

  geoGroup.appendChild(textarea);
  geoGroup.appendChild(geojsonioLink);
  argsDiv.appendChild(geoGroup);

  // precision
  const precGroup = document.createElement("div");
  precGroup.className = "arg-group";
  const precLabel = document.createElement("label");
  precLabel.textContent = "Precision";
  precGroup.appendChild(precLabel);
  const precInput = document.createElement("input");
  precInput.type = "number";
  precInput.min = "1";
  precInput.max = "8";
  precInput.step = "1";
  precInput.value = cmd.args.precision ?? 5;
  precInput.addEventListener("input", () => {
    state.commands[index].args.precision = parseInt(precInput.value, 10) || 5;
    onStateChange();
  });
  precGroup.appendChild(precInput);
  argsDiv.appendChild(precGroup);

  // simplify
  const simpGroup = document.createElement("div");
  simpGroup.className = "arg-group";
  const simpLabel = document.createElement("label");
  simpLabel.textContent = "Simplify";
  simpGroup.appendChild(simpLabel);
  const simpInput = document.createElement("input");
  simpInput.type = "number";
  simpInput.min = "0";
  simpInput.step = "1";
  simpInput.placeholder = "off";
  simpInput.value = cmd.args.tolerance ?? "";
  simpInput.addEventListener("input", () => {
    state.commands[index].args.tolerance = simpInput.value;
    onStateChange();
  });
  simpGroup.appendChild(simpInput);
  argsDiv.appendChild(simpGroup);

  row.appendChild(argsDiv);
  row.appendChild(makeRemoveButton(index));
  setupDrag(row, index);
  return row;
}

function updateGeojsonioLink(link, raw) {
  const trimmed = (raw ?? "").trim();
  link.href = trimmed
    ? "http://geojson.io/#data=data:application/json," +
      encodeURIComponent(trimmed)
    : "http://geojson.io/";
}

function renderCmdRow(cmd, index) {
  if (cmd.cmdKey === "line (geojson)") return renderLineGeojsonRow(cmd, index);

  const cmdSchema = cmdMap.get(cmd.cmdKey);
  const category = cmdSchema?.category ?? "feature";
  const typeName = cmdSchema?.type ?? cmd.cmdKey;

  const row = document.createElement("div");
  row.className = `cmd-row ${categoryClass(category)}`;
  row.dataset.index = index;

  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.textContent = "⠿";
  row.appendChild(handle);

  const badge = document.createElement("span");
  badge.className = "cmd-type-badge";
  const badgeLink = document.createElement("a");
  badgeLink.href = `/reference.html#${cmd.cmdKey}`;
  badgeLink.target = "_blank";
  badgeLink.rel = "noopener noreferrer";
  badgeLink.textContent = cmd.cmdKey;
  badge.appendChild(badgeLink);
  const badgeCat = document.createElement("span");
  badgeCat.className = "cmd-category";
  badgeCat.textContent = category;
  badge.appendChild(badgeCat);
  row.appendChild(badge);

  const argsDiv = document.createElement("div");
  argsDiv.className = "cmd-args";

  if (cmdSchema && cmdSchema.args.length > 0) {
    for (const argDef of cmdSchema.args) {
      const field = renderArgField(argDef, cmd.args[argDef.name], (val) => {
        state.commands[index].args[argDef.name] = val;
        onStateChange();
      });
      argsDiv.appendChild(field);
    }
  }

  row.appendChild(argsDiv);
  row.appendChild(makeRemoveButton(index));
  setupDrag(row, index);
  return row;
}

function makeRemoveButton(index) {
  const btn = document.createElement("button");
  btn.className = "secondary small cmd-remove";
  btn.type = "button";
  btn.textContent = "Remove";
  btn.addEventListener("click", () => {
    state.commands.splice(index, 1);
    onStateChange();
    renderCommandList();
  });
  return btn;
}

function renderCommandList() {
  const list = document.getElementById("command-list");
  list.innerHTML = "";
  state.commands.forEach((cmd, i) => {
    list.appendChild(renderCmdRow(cmd, i));
  });
}

// # Drag-to-reorder

let dragSrcIndex = null;

function setupDrag(row, index) {
  row.draggable = true;
  row.addEventListener("dragstart", (e) => {
    dragSrcIndex = index;
    e.dataTransfer.effectAllowed = "move";
    row.style.opacity = "0.5";
  });
  row.addEventListener("dragend", () => {
    row.style.opacity = "";
  });
  row.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });
  row.addEventListener("drop", (e) => {
    e.preventDefault();
    if (dragSrcIndex === null || dragSrcIndex === index) return;
    const moved = state.commands.splice(dragSrcIndex, 1)[0];
    state.commands.splice(index, 0, moved);
    dragSrcIndex = null;
    onStateChange();
    renderCommandList();
  });
}

// # Add command controls

function buildAddSection(schema) {
  const section = document.getElementById("add-section");
  section.innerHTML = "";

  const categories = [
    { key: "style", label: "Style" },
    { key: "global", label: "Global" },
    { key: "feature-modifier", label: "Modifier" },
    { key: "feature", label: "Feature" },
  ];

  for (const { key, label } of categories) {
    // build option list: one entry per cmdMap key in this category
    const opts = [];
    for (const [k, cmd] of cmdMap) {
      if (cmd.category === key) {
        opts.push({ key: k, label: k });
      }
    }
    // sort: geojson entry first among line variants, otherwise alphabetical
    opts.sort((a, b) => {
      if (a.key === "line (geojson)") return -1;
      if (b.key === "line (geojson)") return 1;
      return a.label.localeCompare(b.label);
    });
    if (opts.length === 0) continue;

    if (opts.length === 1) {
      const btn = document.createElement("button");
      btn.className = "secondary small";
      btn.type = "button";
      btn.textContent = `+ ${label}: ${opts[0].label}`;
      btn.addEventListener("click", () => addCommand(opts[0].key));
      section.appendChild(btn);
    } else {
      const wrap = document.createElement("div");
      wrap.className = "add-select-wrap";

      const sel = document.createElement("select");
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = `+ ${label}…`;
      placeholder.disabled = true;
      placeholder.selected = true;
      sel.appendChild(placeholder);
      for (const opt of opts) {
        const o = document.createElement("option");
        o.value = opt.key;
        o.textContent = opt.label;
        sel.appendChild(o);
      }
      sel.addEventListener("change", () => {
        if (sel.value) {
          addCommand(sel.value);
          sel.selectedIndex = 0;
        }
      });
      wrap.appendChild(sel);
      section.appendChild(wrap);
    }
  }
}

function addCommand(key) {
  state.commands.push({ cmdKey: key, args: defaultArgsForKey(key) });
  onStateChange();
  renderCommandList();
  // scroll new row into view
  const list = document.getElementById("command-list");
  list.lastElementChild?.scrollIntoView({
    behavior: "smooth",
    block: "nearest",
  });
}

// # URL display

function updateUrlBox() {
  const urlBox = document.getElementById("url");
  const errorBox = document.getElementById("error");
  try {
    const path = buildMapUrl();
    const url = new URL(path, location.origin);
    urlBox.textContent = url.toString();
    errorBox.textContent = "";
  } catch (e) {
    if (e instanceof UserError) {
      urlBox.textContent = "";
      errorBox.textContent = e.message;
    } else {
      throw e;
    }
  }
}

// # State change handler

function onStateChange() {
  updateUrlBox();
  saveToHash();
  document.getElementById("preview-panel").classList.add("dirty");
}

// # Preview / pages / map (ported from index.html)

const objectUrls = [];
let mapPages = [];
let activeTab = "image";

function resetPreview() {
  document.getElementById("preview-grid").innerHTML = "";
  for (const u of objectUrls) URL.revokeObjectURL(u);
  objectUrls.length = 0;
  mapPages = [];
  clearMapOverlay();
}

const PAGES_PREVIEW_LIMIT = 10;

async function resolvePages(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new UserError(
      `${response.status} ${response.statusText}${body.error ? ": " + body.error : ""}`,
    );
  }
  return (await response.json()).pages;
}

async function fetchMapImage(src, page = null) {
  const response = await fetch(src);
  if (!response.ok) {
    const errorMessage = response.headers.get("X-Map-Error");
    const detail = errorMessage ? `: ${errorMessage}` : "";
    throw new UserError(`${response.status} ${response.statusText}${detail}`);
  }
  const blob = await response.blob();
  const attribution = response.headers.get("X-Map-Attribution");
  const boundsHeader = response.headers.get("X-Map-Bounds");

  const objectUrl = URL.createObjectURL(blob);
  objectUrls.push(objectUrl);

  const [minLat, minLng, maxLat, maxLng] = boundsHeader.split(",").map(Number);
  const bounds = { minLat, minLng, maxLat, maxLng };

  const img = document.createElement("img");
  img.alt = "";
  const div = document.createElement("div");
  img.onload = () => {
    const w = img.naturalWidth / 2 + "px";
    img.style.width = w;
    img.style.height = img.naturalHeight / 2 + "px";
    div.style.width = w;
  };
  img.addEventListener("dragstart", (e) => {
    e.dataTransfer.setDragImage(img, 0, 0);
  });
  img.src = objectUrl;
  div.appendChild(img);

  const pageCoord = page ? `(${page.col},${page.row})` : null;
  if (pageCoord || attribution) {
    const footer = document.createElement("div");
    footer.className = "tile-footer";
    if (pageCoord) {
      const coordEl = document.createElement("span");
      coordEl.textContent = pageCoord;
      coordEl.className = "tile-coord";
      footer.appendChild(coordEl);
    }
    if (attribution) {
      const attrEl = document.createElement("span");
      attrEl.innerHTML = attribution;
      attrEl.className = "tile-attribution";
      footer.appendChild(attrEl);
    }
    div.appendChild(footer);
  }
  return { div, objectUrl, bounds, attribution, page };
}

function makePlaceholderTile(tile) {
  const placeholder = document.createElement("div");
  placeholder.className = "page-placeholder";
  placeholder.style.width = tile.size.width + "px";
  placeholder.style.height = tile.size.height + "px";
  const label = document.createElement("span");
  label.className = "page-placeholder-label";
  label.innerHTML = `(${tile.col},${tile.row})<br>Not rendered (preview limit)`;
  placeholder.appendChild(label);
  const div = document.createElement("div");
  div.appendChild(placeholder);
  return div;
}

async function loadPreview() {
  const previewGrid = document.getElementById("preview-grid");
  const errorBox = document.getElementById("error");
  const previewPanel = document.getElementById("preview-panel");
  try {
    const url = buildMapUrl();
    errorBox.textContent = "";
    resetPreview();

    if (state.pagesMode) {
      const pages = await resolvePages(url);
      const visible = pages.slice(0, PAGES_PREVIEW_LIMIT);
      const hidden = pages.slice(PAGES_PREVIEW_LIMIT);
      const fetched = await Promise.all(
        visible.map((t) => fetchMapImage(t.url, t)),
      );
      for (const { div } of fetched) previewGrid.appendChild(div);
      for (const tile of hidden)
        previewGrid.appendChild(makePlaceholderTile(tile));
      previewPanel.classList.remove("dirty");
      mapPages = [
        ...fetched.map((r) => ({ ...r.page, fetched: r })),
        ...hidden,
      ];
    } else {
      const result = await fetchMapImage(url, null);
      previewGrid.appendChild(result.div);
      previewPanel.classList.remove("dirty");
      mapPages = [{ fetched: result }];
    }

    if (activeTab === "map") syncMap();
  } catch (e) {
    if (e instanceof UserError) {
      errorBox.textContent = e.message;
    } else {
      throw e;
    }
  }
}

// # Leaflet map

let leafletMap = null;
let mapOverlay = null;

function clearMapOverlay() {
  if (mapOverlay) {
    mapOverlay.remove();
    mapOverlay = null;
  }
}

function syncMap() {
  if (mapPages.length === 0) return;
  const mapContainer = document.getElementById("map-container");
  const mapAttribution = document.getElementById("map-attribution");

  if (!leafletMap) {
    leafletMap = L.map(mapContainer);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(leafletMap);
  }

  clearMapOverlay();
  mapAttribution.innerHTML = mapPages[0]?.fetched?.attribution ?? "";

  const group = L.layerGroup();
  for (const entry of mapPages) {
    const bounds = entry.fetched?.bounds ?? entry.bounds;
    const leafletBounds = [
      [bounds.minLat, bounds.minLng],
      [bounds.maxLat, bounds.maxLng],
    ];
    if (entry.fetched) {
      L.imageOverlay(entry.fetched.objectUrl, leafletBounds, {
        opacity: 0.6,
      }).addTo(group);
    }
    if (entry.col !== undefined) {
      const centerLat = (bounds.minLat + bounds.maxLat) / 2;
      const centerLng = (bounds.minLng + bounds.maxLng) / 2;
      L.marker([centerLat, centerLng], {
        icon: L.divIcon({
          className: "",
          html: `<span class="map-page-label">(${entry.col},${entry.row})</span>`,
          iconAnchor: [0, 0],
        }),
        interactive: false,
      }).addTo(group);
    }
  }
  group.addTo(leafletMap);
  mapOverlay = group;

  const allBounds = mapPages.map((entry) => {
    const b = entry.fetched?.bounds ?? entry.bounds;
    return [
      [b.minLat, b.minLng],
      [b.maxLat, b.maxLng],
    ];
  });
  setTimeout(() => {
    leafletMap.invalidateSize();
    leafletMap.fitBounds(allBounds.flat());
  }, 0);
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".preview-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document
    .getElementById("tab-image")
    .classList.toggle("active", tab === "image");
  document.getElementById("tab-map").classList.toggle("active", tab === "map");
  if (tab === "map") syncMap();
}

// # Event wiring

document
  .getElementById("preview-btn")
  .addEventListener("click", () => loadPreview());

document.getElementById("reset-btn").addEventListener("click", () => {
  location.href = location.pathname;
});

document.getElementById("source").addEventListener("input", (e) => {
  state.source = e.target.value.trim();
  onStateChange();
});

document.getElementById("pages-mode").addEventListener("change", (e) => {
  state.pagesMode = e.target.checked;
  onStateChange();
});

document.querySelectorAll(".preview-tab").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

// # Init

loadSchema().then(() => {
  const restored = loadFromHash();
  if (!restored) state = defaultState();

  // sync source input from state if not already set by loadFromHash
  // (loadFromHash sets the DOM directly, so just ensure pagesMode checkbox reflects state)
  document.getElementById("pages-mode").checked = state.pagesMode;

  buildAddSection(schema);
  renderCommandList();
  updateUrlBox();
});

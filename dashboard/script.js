const categories = ["Electronics", "Fashion", "Food", "Furniture", "Health"];
const regions = ["North America", "Europe", "Asia", "South America", "Africa"];
const segments = ["New", "Returning", "VIP"];
const products = {
  Electronics: ["Laptop", "Phone", "Monitor", "Headphones", "Camera"],
  Fashion: ["Jacket", "Sneakers", "Watch", "Backpack", "Shirt"],
  Food: ["Coffee", "Organic Box", "Snacks", "Protein Pack", "Tea"],
  Furniture: ["Desk", "Chair", "Bookshelf", "Sofa", "Cabinet"],
  Health: ["Supplements", "Tracker", "Yoga Kit", "Skincare", "First Aid"]
};
const customers = ["Avery Stone", "Maya Reed", "Noah Brooks", "Iris Wells", "Liam Ford", "Emma Chen", "Lucas Shah", "Sofia Diaz", "Oliver King", "Nora Patel", "Ethan Gray", "Mila Ross"];
const palette = ["#1f7a8c", "#e76f51", "#2a9d8f", "#f4a261", "#6d5dfc"];
const segmentPalette = ["#44b3c7", "#f1bd5b", "#5fce91"];

const state = {
  allSales: [],
  filteredSales: [],
  charts: {},
  filters: JSON.parse(localStorage.getItem("sales-dashboard-filters") || "{}"),
  page: 1,
  pageSize: 12,
  sort: { key: "date", direction: "desc" },
  search: "",
  liveTimer: null
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  applySavedTheme();
  state.allSales = generateSalesData(1250);
  initializeDefaults();
  bindEvents();
  drawCharts();
  applyFilters();
  startLiveSimulation();
  setTimeout(() => document.querySelectorAll(".skeleton").forEach(el => el.classList.remove("skeleton")), 900);
});

function cacheElements() {
  [
    "liveToggle", "themeToggle", "exportPdf", "exportCharts", "rangeButtons", "startDate", "endDate",
    "regionFilter", "categoryFilter", "resetFilters", "categorySort", "tableSearch", "exportCsv",
    "ordersBody", "tableSummary", "prevPage", "nextPage", "pageInfo", "notificationsList"
  ].forEach(id => els[id] = document.getElementById(id));

  ["kpiRevenue", "kpiOrders", "kpiCustomers", "kpiAov", "kpiGrowth", "trendRevenue", "trendOrders", "trendCustomers", "trendAov", "trendGrowth"]
    .forEach(id => els[id] = document.getElementById(id));
}

function initializeDefaults() {
  const maxDate = maxSalesDate();
  const start = new Date(maxDate);
  start.setMonth(start.getMonth() - 1);
  const defaults = {
    range: "monthly",
    startDate: toDateInput(start),
    endDate: toDateInput(maxDate),
    region: "all",
    category: "all"
  };
  state.filters = { ...defaults, ...state.filters };
  els.startDate.value = state.filters.startDate;
  els.endDate.value = state.filters.endDate;
  els.regionFilter.value = state.filters.region;
  els.categoryFilter.value = state.filters.category;
  setActiveRange(state.filters.range);
}

function bindEvents() {
  els.rangeButtons.addEventListener("click", event => {
    if (!event.target.matches("button")) return;
    const range = event.target.dataset.range;
    state.filters.range = range;
    setActiveRange(range);
    if (range !== "custom") setRangeDates(range);
    saveFilters();
    applyFilters();
  });

  [els.startDate, els.endDate].forEach(input => input.addEventListener("change", () => {
    state.filters.range = "custom";
    state.filters.startDate = els.startDate.value;
    state.filters.endDate = els.endDate.value;
    setActiveRange("custom");
    saveFilters();
    applyFilters();
  }));

  [els.regionFilter, els.categoryFilter, els.categorySort].forEach(input => input.addEventListener("change", () => {
    state.filters.region = els.regionFilter.value;
    state.filters.category = els.categoryFilter.value;
    saveFilters();
    applyFilters();
  }));

  els.resetFilters.addEventListener("click", () => {
    localStorage.removeItem("sales-dashboard-filters");
    state.filters = {};
    initializeDefaults();
    applyFilters();
  });

  els.tableSearch.addEventListener("input", debounce(event => {
    state.search = event.target.value.trim().toLowerCase();
    state.page = 1;
    renderTable();
  }, 180));

  document.querySelectorAll("th[data-sort]").forEach(th => th.addEventListener("click", () => {
    const key = th.dataset.sort;
    state.sort.direction = state.sort.key === key && state.sort.direction === "asc" ? "desc" : "asc";
    state.sort.key = key;
    renderTable();
  }));

  els.prevPage.addEventListener("click", () => { state.page = Math.max(1, state.page - 1); renderTable(); });
  els.nextPage.addEventListener("click", () => { state.page += 1; renderTable(); });
  els.exportCsv.addEventListener("click", exportCsv);
  els.exportPdf.addEventListener("click", exportPdf);
  els.exportCharts.addEventListener("click", exportChartImages);
  els.themeToggle.addEventListener("click", toggleTheme);
  els.liveToggle.addEventListener("change", () => els.liveToggle.checked ? startLiveSimulation() : stopLiveSimulation());

  document.querySelectorAll("[data-reset-chart]").forEach(button => button.addEventListener("click", () => {
    const chart = state.charts[button.dataset.resetChart];
    if (chart && chart.resetZoom) chart.resetZoom();
  }));
}

function generateSalesData(count) {
  const data = [];
  const now = new Date();
  const start = new Date(now);
  start.setFullYear(now.getFullYear() - 2);

  for (let i = 1; i <= count; i++) {
    data.push(createSale(i, randomDate(start, now)));
  }
  return data.sort((a, b) => a.date - b.date);
}

function createSale(id, date = new Date()) {
  const category = pick(categories);
  const product = pick(products[category]);
  const region = pick(regions);
  const segment = weightedPick([{ v: "New", w: 38 }, { v: "Returning", w: 46 }, { v: "VIP", w: 16 }]);
  const base = { Electronics: 850, Fashion: 180, Food: 75, Furniture: 540, Health: 130 }[category];
  const multiplier = { "North America": 1.22, Europe: 1.08, Asia: 1.0, "South America": 0.82, Africa: 0.72 }[region];
  const revenue = round(base * multiplier * random(0.55, 2.45));
  const margin = { Electronics: 0.22, Fashion: 0.38, Food: 0.31, Furniture: 0.27, Health: 0.34 }[category] + random(-0.08, 0.09);
  const profit = round(revenue * Math.max(0.08, margin));
  return {
    orderId: `SO-${String(id).padStart(6, "0")}`,
    customer: pick(customers),
    product,
    category,
    region,
    segment,
    revenue,
    cost: round(revenue - profit),
    profit,
    date
  };
}

function applyFilters() {
  const start = new Date(`${els.startDate.value}T00:00:00`);
  const end = new Date(`${els.endDate.value}T23:59:59`);
  state.filters.startDate = els.startDate.value;
  state.filters.endDate = els.endDate.value;

  state.filteredSales = state.allSales.filter(sale => {
    return sale.date >= start &&
      sale.date <= end &&
      (state.filters.region === "all" || sale.region === state.filters.region) &&
      (state.filters.category === "all" || sale.category === state.filters.category);
  });

  state.page = 1;
  saveFilters();
  updateKpis(start, end);
  updateCharts();
  renderTable();
  renderNotifications();
}

function updateKpis(start, end) {
  const current = summarize(state.filteredSales);
  const duration = end - start;
  const prevEnd = new Date(start.getTime() - 1);
  const prevStart = new Date(prevEnd.getTime() - duration);
  const previous = summarize(state.allSales.filter(sale => {
    return sale.date >= prevStart &&
      sale.date <= prevEnd &&
      (state.filters.region === "all" || sale.region === state.filters.region) &&
      (state.filters.category === "all" || sale.category === state.filters.category);
  }));

  animateValue(els.kpiRevenue, current.revenue, currency);
  animateValue(els.kpiOrders, current.orders, value => Math.round(value).toLocaleString());
  animateValue(els.kpiCustomers, current.customers, value => Math.round(value).toLocaleString());
  animateValue(els.kpiAov, current.aov, currency);
  animateValue(els.kpiGrowth, percentChange(current.revenue, previous.revenue), value => `${value.toFixed(1)}%`);

  setTrend(els.trendRevenue, percentChange(current.revenue, previous.revenue), "vs previous period");
  setTrend(els.trendOrders, percentChange(current.orders, previous.orders), "vs previous period");
  setTrend(els.trendCustomers, percentChange(current.customers, previous.customers), "vs previous period");
  setTrend(els.trendAov, percentChange(current.aov, previous.aov), "vs previous period");
  setTrend(els.trendGrowth, percentChange(current.profit, previous.profit), "profit growth");
}

function summarize(rows) {
  const revenue = rows.reduce((sum, row) => sum + row.revenue, 0);
  const profit = rows.reduce((sum, row) => sum + row.profit, 0);
  return {
    revenue,
    profit,
    orders: rows.length,
    customers: new Set(rows.map(row => row.customer)).size,
    aov: rows.length ? revenue / rows.length : 0
  };
}

function drawCharts() {
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.color = getCss("--muted");
  Chart.defaults.borderColor = getCss("--line");

  state.charts.revenueChart = new Chart(document.getElementById("revenueChart"), {
    type: "line",
    data: { labels: [], datasets: [{ label: "Revenue", data: [], borderColor: palette[0], backgroundColor: "rgba(31,122,140,0.15)", tension: 0.42, fill: true, pointRadius: 3 }] },
    options: timeSeriesOptions(currency)
  });

  state.charts.categoryChart = new Chart(document.getElementById("categoryChart"), {
    type: "bar",
    data: { labels: [], datasets: [{ label: "Revenue", data: [], backgroundColor: palette, borderRadius: 6 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 550 },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => currency(ctx.parsed.y) } } },
      scales: { y: { beginAtZero: true, ticks: { callback: currency } } },
      onClick: (_, elements) => {
        if (!elements.length) return;
        const label = state.charts.categoryChart.data.labels[elements[0].index];
        els.categoryFilter.value = label;
        state.filters.category = label;
        applyFilters();
      }
    }
  });

  state.charts.marketShareChart = new Chart(document.getElementById("marketShareChart"), {
    type: "pie",
    data: { labels: [], datasets: [{ data: [], backgroundColor: palette, borderWidth: 2 }] },
    options: pieOptions()
  });

  state.charts.segmentChart = new Chart(document.getElementById("segmentChart"), {
    type: "doughnut",
    data: { labels: [], datasets: [{ data: [], backgroundColor: segmentPalette, borderWidth: 2 }] },
    options: pieOptions()
  });

  state.charts.profitChart = new Chart(document.getElementById("profitChart"), {
    type: "line",
    data: {
      labels: [],
      datasets: [
        { label: "Revenue", data: [], borderColor: palette[0], backgroundColor: "rgba(31,122,140,0.10)", tension: 0.38, fill: true },
        { label: "Cost", data: [], borderColor: palette[1], backgroundColor: "rgba(231,111,81,0.10)", tension: 0.38, fill: true },
        { label: "Profit", data: [], borderColor: palette[2], backgroundColor: "rgba(42,157,143,0.18)", tension: 0.38, fill: true }
      ]
    },
    options: timeSeriesOptions(currency)
  });
}

function updateCharts() {
  updateChartTheme();
  const grouped = groupByDate(state.filteredSales);
  updateChart(state.charts.revenueChart, grouped.labels, [[...grouped.revenue]]);

  const categoryRows = categories.map(category => ({
    label: category,
    value: sum(state.filteredSales.filter(row => row.category === category), "revenue")
  }));
  const sortedCategories = sortCategoryRows(categoryRows);
  state.charts.categoryChart.data.labels = sortedCategories.map(row => row.label);
  state.charts.categoryChart.data.datasets[0].data = sortedCategories.map(row => row.value);
  state.charts.categoryChart.update();

  state.charts.marketShareChart.data.labels = sortedCategories.map(row => row.label);
  state.charts.marketShareChart.data.datasets[0].data = sortedCategories.map(row => row.value);
  state.charts.marketShareChart.update();

  const segmentRows = segments.map(label => ({ label, value: state.filteredSales.filter(row => row.segment === label).length }));
  state.charts.segmentChart.data.labels = segmentRows.map(row => row.label);
  state.charts.segmentChart.data.datasets[0].data = segmentRows.map(row => row.value);
  state.charts.segmentChart.update();

  updateChart(state.charts.profitChart, grouped.labels, [grouped.revenue, grouped.cost, grouped.profit]);
}

function updateChart(chart, labels, datasets) {
  chart.data.labels = labels;
  datasets.forEach((data, index) => chart.data.datasets[index].data = data);
  chart.update();
}

function groupByDate(rows) {
  const buckets = new Map();
  rows.forEach(row => {
    const key = bucketKey(row.date);
    if (!buckets.has(key)) buckets.set(key, { revenue: 0, cost: 0, profit: 0 });
    const bucket = buckets.get(key);
    bucket.revenue += row.revenue;
    bucket.cost += row.cost;
    bucket.profit += row.profit;
  });
  const labels = [...buckets.keys()].sort();
  return {
    labels,
    revenue: labels.map(label => round(buckets.get(label).revenue)),
    cost: labels.map(label => round(buckets.get(label).cost)),
    profit: labels.map(label => round(buckets.get(label).profit))
  };
}

function bucketKey(date) {
  if (state.filters.range === "yearly") return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  if (state.filters.range === "daily") return `${String(date.getHours()).padStart(2, "0")}:00`;
  return toDateInput(date);
}

function renderTable() {
  const searched = state.filteredSales.filter(row => {
    if (!state.search) return true;
    return Object.values({ ...row, date: formatDate(row.date) }).some(value => String(value).toLowerCase().includes(state.search));
  });
  const sorted = [...searched].sort((a, b) => compareRows(a, b, state.sort.key) * (state.sort.direction === "asc" ? 1 : -1));
  const totalPages = Math.max(1, Math.ceil(sorted.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  const start = (state.page - 1) * state.pageSize;
  const rows = sorted.slice(start, start + state.pageSize);

  els.ordersBody.innerHTML = rows.map(row => `
    <tr>
      <td>${row.orderId}</td>
      <td>${row.customer}</td>
      <td>${row.product}</td>
      <td>${row.category}</td>
      <td>${row.region}</td>
      <td>${currency(row.revenue)}</td>
      <td>${currency(row.profit)}</td>
      <td>${formatDate(row.date)}</td>
    </tr>
  `).join("");
  els.tableSummary.textContent = `${searched.length.toLocaleString()} matching records`;
  els.pageInfo.textContent = `Page ${state.page} of ${totalPages}`;
  els.prevPage.disabled = state.page === 1;
  els.nextPage.disabled = state.page === totalPages;
}

function renderNotifications() {
  const summary = summarize(state.filteredSales);
  const categoryTotals = categories.map(category => ({ category, revenue: sum(state.filteredSales.filter(row => row.category === category), "revenue") }));
  const low = categoryTotals.reduce((min, row) => row.revenue < min.revenue ? row : min, categoryTotals[0]);
  const high = categoryTotals.reduce((max, row) => row.revenue > max.revenue ? row : max, categoryTotals[0]);
  const margin = summary.revenue ? summary.profit / summary.revenue : 0;
  const alerts = [
    { type: "success", title: "Revenue milestone", text: `${currency(summary.revenue)} generated in the selected period.` },
    { type: margin < 0.22 ? "danger" : "success", title: "Profit margin", text: `${(margin * 100).toFixed(1)}% blended margin across filtered sales.` },
    { type: "warning", title: "Low-performing category", text: `${low.category} trails with ${currency(low.revenue)} in revenue.` },
    { type: "success", title: "Top category", text: `${high.category} leads with ${currency(high.revenue)} in revenue.` }
  ];

  els.notificationsList.innerHTML = alerts.map(alert => `
    <div class="alert ${alert.type}">
      <strong>${alert.title}</strong>
      <small>${alert.text}</small>
    </div>
  `).join("");
}

function startLiveSimulation() {
  stopLiveSimulation();
  state.liveTimer = setInterval(() => {
    const maxId = state.allSales.length + 1;
    const sale = createSale(maxId, new Date());
    state.allSales.push(sale);
    const endDate = new Date(`${els.endDate.value}T23:59:59`);
    if (Date.now() > endDate.getTime()) {
      els.endDate.value = toDateInput(new Date());
      state.filters.endDate = els.endDate.value;
    }
    applyFilters();
  }, 6500);
}

function stopLiveSimulation() {
  if (state.liveTimer) clearInterval(state.liveTimer);
  state.liveTimer = null;
}

function setRangeDates(range) {
  const end = maxSalesDate();
  const start = new Date(end);
  if (range === "daily") start.setDate(end.getDate());
  if (range === "weekly") start.setDate(end.getDate() - 7);
  if (range === "monthly") start.setMonth(end.getMonth() - 1);
  if (range === "yearly") start.setFullYear(end.getFullYear() - 1);
  els.startDate.value = toDateInput(start);
  els.endDate.value = toDateInput(end);
  state.filters.startDate = els.startDate.value;
  state.filters.endDate = els.endDate.value;
}

function setActiveRange(range) {
  els.rangeButtons.querySelectorAll("button").forEach(button => button.classList.toggle("active", button.dataset.range === range));
}

function timeSeriesOptions(formatter) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    animation: { duration: 550 },
    plugins: {
      legend: { labels: { usePointStyle: true }, onClick: Chart.defaults.plugins.legend.onClick },
      tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${formatter(ctx.parsed.y)}` } },
      zoom: {
        pan: { enabled: true, mode: "x" },
        zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: "x" }
      }
    },
    scales: {
      x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
      y: { beginAtZero: true, ticks: { callback: formatter } }
    }
  };
}

function pieOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: { animateRotate: true, duration: 550 },
    plugins: {
      legend: { position: "bottom", labels: { usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: ctx => {
            const total = ctx.dataset.data.reduce((sumValue, value) => sumValue + value, 0);
            const pct = total ? (ctx.parsed / total) * 100 : 0;
            return `${ctx.label}: ${pct.toFixed(1)}%`;
          }
        }
      }
    }
  };
}

function exportCsv() {
  const rows = [["Order ID", "Customer", "Product", "Category", "Region", "Revenue", "Profit", "Date"],
    ...state.filteredSales.map(row => [row.orderId, row.customer, row.product, row.category, row.region, row.revenue, row.profit, formatDate(row.date)])];
  download("sales-orders.csv", rows.map(row => row.map(csvEscape).join(",")).join("\n"), "text/csv");
}

async function exportPdf() {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("landscape", "pt", "a4");
  const canvas = await html2canvas(document.querySelector(".app-shell"), { scale: 1.4, backgroundColor: getCss("--bg") });
  const img = canvas.toDataURL("image/png");
  const width = pdf.internal.pageSize.getWidth();
  const height = canvas.height * width / canvas.width;
  pdf.addImage(img, "PNG", 0, 0, width, Math.min(height, pdf.internal.pageSize.getHeight()));
  pdf.save("sales-dashboard-report.pdf");
}

function exportChartImages() {
  Object.entries(state.charts).forEach(([name, chart]) => {
    const link = document.createElement("a");
    link.download = `${name}.png`;
    link.href = chart.toBase64Image("image/png", 1);
    link.click();
  });
}

function toggleTheme() {
  document.body.classList.toggle("dark");
  localStorage.setItem("sales-dashboard-theme", document.body.classList.contains("dark") ? "dark" : "light");
  updateChartTheme();
  Object.values(state.charts).forEach(chart => chart.update());
}

function applySavedTheme() {
  if (localStorage.getItem("sales-dashboard-theme") === "dark") document.body.classList.add("dark");
}

function updateChartTheme() {
  Chart.defaults.color = getCss("--muted");
  Chart.defaults.borderColor = getCss("--line");
  Object.values(state.charts).forEach(chart => {
    chart.options.scales && Object.values(chart.options.scales).forEach(scale => {
      scale.grid = { color: getCss("--line") };
      scale.ticks = { ...scale.ticks, color: getCss("--muted") };
    });
    if (chart.options.plugins?.legend?.labels) chart.options.plugins.legend.labels.color = getCss("--muted");
  });
}

function sortCategoryRows(rows) {
  const mode = els.categorySort.value;
  return [...rows].sort((a, b) => {
    if (mode === "alpha") return a.label.localeCompare(b.label);
    return (a.value - b.value) * (mode === "asc" ? 1 : -1);
  });
}

function compareRows(a, b, key) {
  const av = key === "date" ? a.date.getTime() : a[key];
  const bv = key === "date" ? b.date.getTime() : b[key];
  return typeof av === "number" ? av - bv : String(av).localeCompare(String(bv));
}

function animateValue(element, target, formatter) {
  const start = Number(element.dataset.value || 0);
  const duration = 650;
  const started = performance.now();
  element.dataset.value = target;
  requestAnimationFrame(function tick(now) {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = formatter(start + (target - start) * eased);
    if (progress < 1) requestAnimationFrame(tick);
  });
}

function setTrend(element, value, label) {
  const direction = value >= 0 ? "up" : "down";
  element.className = direction;
  element.textContent = `${direction === "up" ? "▲" : "▼"} ${Math.abs(value).toFixed(1)}% ${label}`;
}

function saveFilters() {
  localStorage.setItem("sales-dashboard-filters", JSON.stringify(state.filters));
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + row[key], 0);
}

function percentChange(current, previous) {
  if (!previous) return current ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function maxSalesDate() {
  return state.allSales.reduce((max, row) => row.date > max ? row.date : max, new Date(0));
}

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function weightedPick(items) {
  const total = items.reduce((sumValue, item) => sumValue + item.w, 0);
  let point = Math.random() * total;
  for (const item of items) {
    point -= item.w;
    if (point <= 0) return item.v;
  }
  return items[0].v;
}

function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function random(min, max) {
  return min + Math.random() * (max - min);
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function currency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", { year: "numeric", month: "short", day: "2-digit" }).format(date);
}

function toDateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function csvEscape(value) {
  const text = String(value).replaceAll('"', '""');
  return /[",\n]/.test(text) ? `"${text}"` : text;
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function getCss(name) {
  return getComputedStyle(document.body).getPropertyValue(name).trim();
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

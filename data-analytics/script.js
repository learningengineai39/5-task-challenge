// script.js

const AppState = {
    rawData: [],
    cleanedData: [],
    filteredData: [],
    headers: [],
    columnTypes: {},
    charts: [],
    dashboard: [],
    reports: [],

    // Non-persistent runtime state
    currentPage: 1,
    rowsPerPage: 50,
    sortCol: null,
    sortAsc: true,
    theme: localStorage.getItem('nexus_theme') || 'dark',
    globalSearch: '',
    chartsInstances: {}
};

const Utils = {
    debounce: (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(null, args), delay);
        };
    },
    
    showToast: (msg, type = 'success', icon = 'check_circle') => {
        if(type === 'error') icon = 'error';
        if(type === 'warning') icon = 'warning';
        
        const container = document.getElementById('notification-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span class="material-icons-round">${icon}</span> <span>${msg}</span>`;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('hide');
            setTimeout(() => toast.remove(), 400);
        }, 4000);
    },

    inferType: (values) => {
        let hasNumber = false;
        let hasDate = false;
        let hasString = false;
        let hasBoolean = false;

        for (let val of values) {
            if (val === null || val === undefined || val === '') continue;
            
            if (typeof val === 'boolean' || String(val).toLowerCase() === 'true' || String(val).toLowerCase() === 'false') {
                hasBoolean = true;
            } else if (!isNaN(Number(val))) {
                hasNumber = true;
            } else if (!isNaN(Date.parse(val)) && String(val).length > 5) {
                hasDate = true;
            } else {
                hasString = true;
            }
        }

        if (hasString) return 'string';
        if (hasDate && !hasNumber) return 'date';
        if (hasBoolean && !hasNumber && !hasString) return 'boolean';
        if (hasNumber) return 'number';
        return 'string';
    },

    postCleanUpdate: () => {
        Utils.analyzeSchema();
        Utils.applyGlobalFilter();
        const statsCol = document.getElementById('select-stats-col').value;
        if (statsCol && document.getElementById('view-statistics').classList.contains('active')) {
            Stats.compute(statsCol);
        }
        if (document.getElementById('view-charts').classList.contains('active') && AppState.chartsInstances['main']) {
            Viz.renderChart('main-chart-canvas', 'main');
        }
        console.log("State updated");
    },

    analyzeSchema: () => {
        if (!AppState.cleanedData.length) return;
        AppState.headers = Object.keys(AppState.cleanedData[0]);
        AppState.columnTypes = {};
        
        AppState.headers.forEach(header => {
            const sampleValues = AppState.cleanedData.slice(0, 1000).map(row => row[header]);
            AppState.columnTypes[header] = Utils.inferType(sampleValues);
        });
    },

    getNumericColumns: () => AppState.headers.filter(h => AppState.columnTypes[h] === 'number'),
    getCategoricalColumns: () => AppState.headers.filter(h => AppState.columnTypes[h] === 'string' || AppState.columnTypes[h] === 'boolean' || AppState.columnTypes[h] === 'date'),

    applyGlobalFilter: () => {
        if (!AppState.globalSearch) {
            AppState.filteredData = [...AppState.cleanedData];
        } else {
            const term = AppState.globalSearch.toLowerCase();
            AppState.filteredData = AppState.cleanedData.filter(row => {
                return Object.values(row).some(val => String(val).toLowerCase().includes(term));
            });
        }
        AppState.currentPage = 1;
        Grid.render();
        UI.updateMetrics();
    },

    formatNumber: (num) => {
        if(isNaN(num) || num === null) return '--';
        return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
    },

    validateDataset: () => {
        if (!AppState.filteredData || AppState.filteredData.length === 0) {
            Utils.showToast("Dataset has no rows to render.", "error");
            return false;
        }
        if (!AppState.headers || AppState.headers.length === 0) {
            Utils.showToast("Dataset is missing valid headers.", "error");
            return false;
        }
        return true;
    }
};

const UI = {
    init: () => {
        document.documentElement.setAttribute('data-theme', AppState.theme);
        document.getElementById('theme-icon').textContent = AppState.theme === 'dark' ? 'light_mode' : 'dark_mode';
        
        document.getElementById('theme-toggle').addEventListener('click', () => {
            AppState.theme = AppState.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', AppState.theme);
            document.getElementById('theme-icon').textContent = AppState.theme === 'dark' ? 'light_mode' : 'dark_mode';
            localStorage.setItem('nexus_theme', AppState.theme);
            if(AppState.filteredData.length) Viz.renderMainChart();
        });

        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                if(item.classList.contains('disabled')) return;
                
                navItems.forEach(n => n.classList.remove('active'));
                item.classList.add('active');
                
                const viewId = item.getAttribute('data-view');
                document.querySelectorAll('.view').forEach(v => {
                    v.classList.remove('active');
                    v.classList.add('hidden');
                });
                
                const activeView = document.getElementById(`view-${viewId}`);
                if (activeView) {
                    activeView.classList.remove('hidden');
                    void activeView.offsetWidth; 
                    activeView.classList.add('active');
                }

                if(viewId === 'grid') Grid.render();
                if(viewId === 'charts') Viz.populateSelects();
                if(viewId === 'forecast') Forecast.populateSelects();
                if(viewId === 'statistics') Stats.populateSelects();
                if(viewId === 'cleaning') Cleaning.populateSelects();
            });
        });

        document.getElementById('global-search').addEventListener('input', Utils.debounce((e) => {
            AppState.globalSearch = e.target.value;
            Utils.applyGlobalFilter();
        }, 300));
        
        document.getElementById('btn-clear-global-filter').addEventListener('click', () => {
            document.getElementById('global-search').value = '';
            AppState.globalSearch = '';
            Utils.applyGlobalFilter();
        });
        
        document.getElementById('btn-proceed-grid').addEventListener('click', () => {
            document.querySelector('[data-view="grid"]').click();
        });
        
        document.getElementById('btn-reset-data').addEventListener('click', () => {
            if(confirm("Are you sure you want to reset and upload new data?")) location.reload();
        });

        // Report Management
        document.getElementById('btn-save-report').addEventListener('click', () => {
            AppState.reports = [{
                date: new Date().toISOString(),
                data: AppState.cleanedData,
                dashboard: AppState.dashboard
            }];
            localStorage.setItem('nexus_saved_report', JSON.stringify(AppState.reports));
            Utils.showToast("Report saved to local storage.");
        });

        document.getElementById('btn-load-report').addEventListener('click', () => {
            try {
                const rep = JSON.parse(localStorage.getItem('nexus_saved_report'));
                if(rep && rep.length > 0) {
                    AppState.cleanedData = rep[0].data;
                    AppState.dashboard = rep[0].dashboard || [];
                    Utils.analyzeSchema();
                    Utils.applyGlobalFilter();
                    UI.enableApp();
                    Dash.restoreLayout();
                    document.querySelector('[data-view="grid"]').click();
                    Utils.showToast("Report loaded successfully.");
                } else {
                    Utils.showToast("No saved reports found.", "warning");
                }
            } catch(e) {
                Utils.showToast("Failed to load report.", "error");
            }
        });
    },

    enableApp: () => {
        document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('disabled'));
        document.getElementById('global-filters').style.display = 'flex';
    },

    updateMetrics: () => {
        document.getElementById('summary-rows').textContent = AppState.filteredData.length.toLocaleString();
        document.getElementById('summary-cols').textContent = AppState.headers.length;
        
        const tagsContainer = document.getElementById('schema-tags');
        tagsContainer.innerHTML = '';
        AppState.headers.forEach(h => {
            const t = AppState.columnTypes[h];
            tagsContainer.innerHTML += `<span class="tag type-${t}">${h}: ${t}</span>`;
        });
    }
};

const Ingestion = {
    init: () => {
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        
        document.getElementById('btn-browse').addEventListener('click', () => fileInput.click());
        
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('dragover');
            if (e.dataTransfer.files.length) Ingestion.handleFile(e.dataTransfer.files[0]);
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length) Ingestion.handleFile(e.target.files[0]);
        });
    },

    handleFile: (file) => {
        if(!file || file.size === 0) {
            Utils.showToast("File is empty or invalid.", "error");
            return;
        }

        const ext = file.name.split('.').pop().toLowerCase();
        document.getElementById('summary-size').textContent = `${(file.size / 1024).toFixed(2)} KB`;

        console.log(`[Upload] File upload initiated: ${file.name}`);

        if (ext === 'csv') {
            Papa.parse(file, {
                header: true, dynamicTyping: true, skipEmptyLines: true,
                complete: (results) => {
                    console.log("Upload successful");
                    console.log("Data parsed");
                    Ingestion.processParsedData(results.data);
                    Utils.showToast(`Successfully loaded ${file.name}`);
                },
                error: (err) => Utils.showToast(`Error parsing CSV: ${err.message}`, 'error')
            });
        } else if (ext === 'xlsx' || ext === 'xls') {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheet = workbook.SheetNames[0];
                    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);
                    console.log("Upload successful");
                    console.log("Data parsed");
                    Ingestion.processParsedData(jsonData);
                    Utils.showToast(`Successfully loaded ${file.name}`);
                } catch(err) {
                    Utils.showToast(`Error parsing XLSX: ${err.message}`, 'error');
                }
            };
            reader.readAsArrayBuffer(file);
        } else if (ext === 'json') {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const jsonData = JSON.parse(e.target.result);
                    if(Array.isArray(jsonData)) {
                        console.log("Upload successful");
                        console.log("Data parsed");
                        Ingestion.processParsedData(jsonData);
                        Utils.showToast(`Successfully loaded ${file.name}`);
                    } else {
                        Utils.showToast('JSON must be an array of objects.', 'error');
                    }
                } catch(err) {
                    Utils.showToast(`Error parsing JSON: ${err.message}`, 'error');
                }
            };
            reader.readAsText(file);
        } else {
            Utils.showToast('Unsupported file format.', 'error');
        }
    },

    processParsedData: (dataArray) => {
        if (!dataArray || dataArray.length === 0) {
            Utils.showToast('Dataset is empty after parsing.', 'error');
            return;
        }
        
        let allKeys = new Set();
        dataArray.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
        const headers = Array.from(allKeys);
        
        const standardized = dataArray.map(row => {
            const newRow = {};
            headers.forEach(h => newRow[h] = row[h] !== undefined ? row[h] : null);
            return newRow;
        });

        AppState.rawData = JSON.parse(JSON.stringify(standardized));
        AppState.cleanedData = [...standardized];
        console.log("State updated");
        
        Utils.analyzeSchema();
        Utils.applyGlobalFilter();
        
        document.getElementById('drop-zone').classList.add('hidden');
        document.getElementById('dataset-summary').classList.remove('hidden');
        UI.enableApp();

        // Ensure table renders immediately in background
        Grid.render();
    }
};

const Grid = {
    init: () => {
        document.getElementById('btn-prev-page').addEventListener('click', () => {
            if (AppState.currentPage > 1) { AppState.currentPage--; Grid.render(); }
        });
        document.getElementById('btn-next-page').addEventListener('click', () => {
            const maxPage = Math.ceil(AppState.filteredData.length / AppState.rowsPerPage);
            if (AppState.currentPage < maxPage) { AppState.currentPage++; Grid.render(); }
        });
        
        document.getElementById('main-table-head').addEventListener('click', (e) => {
            const th = e.target.closest('th');
            if(!th) return;
            const col = th.dataset.col;
            if(col) Grid.handleSort(col);
        });

        document.getElementById('main-table-body').addEventListener('dblclick', (e) => {
            const td = e.target.closest('td');
            if(!td || !td.classList.contains('editable')) return;
            
            const col = td.dataset.col;
            const rowIdx = parseInt(td.dataset.row);
            const originalVal = td.textContent;
            
            td.innerHTML = `<input type="text" class="input-glass p-0 m-0 w-full text-sm" value="${originalVal}" style="height:24px; border:none; background:transparent;">`;
            const input = td.querySelector('input');
            input.focus();
            
            const finishEdit = () => {
                const newVal = input.value;
                td.textContent = newVal;
                
                let parsedVal = newVal;
                if(AppState.columnTypes[col] === 'number' && newVal.trim() !== '') {
                    parsedVal = Number(newVal);
                    if(isNaN(parsedVal)) parsedVal = newVal; 
                }
                
                AppState.filteredData[rowIdx][col] = parsedVal;
                
                const originalObj = AppState.filteredData[rowIdx];
                const mainIdx = AppState.cleanedData.findIndex(r => r === originalObj);
                if(mainIdx > -1) AppState.cleanedData[mainIdx][col] = parsedVal;
                
                Utils.showToast(`Updated value in column ${col}`);
            };
            
            input.addEventListener('blur', finishEdit);
            input.addEventListener('keydown', (ke) => {
                if(ke.key === 'Enter') finishEdit();
                if(ke.key === 'Escape') { td.textContent = originalVal; }
            });
        });

        document.getElementById('grid-search').addEventListener('input', Utils.debounce((e) => {
            const term = e.target.value.toLowerCase();
            if(!term) {
                Utils.applyGlobalFilter();
            } else {
                const sourceData = AppState.globalSearch ? AppState.filteredData : AppState.cleanedData;
                AppState.filteredData = sourceData.filter(row => {
                    return Object.values(row).some(val => String(val).toLowerCase().includes(term));
                });
                AppState.currentPage = 1;
                Grid.render();
            }
        }, 300));
        
        document.getElementById('btn-add-row').addEventListener('click', () => {
            const newRow = {};
            AppState.headers.forEach(h => newRow[h] = null);
            AppState.cleanedData.unshift(newRow);
            Utils.applyGlobalFilter();
            Utils.showToast('New empty row added to the top.');
        });
        document.getElementById('btn-delete-row').addEventListener('click', () => {
            if(AppState.cleanedData.length > 0) {
                AppState.cleanedData.shift();
                Utils.applyGlobalFilter();
                Utils.showToast('Top row deleted.');
            } else {
                Utils.showToast('No rows to delete.', 'warning');
            }
        });
    },

    handleSort: (col) => {
        if (AppState.sortCol === col) {
            AppState.sortAsc = !AppState.sortAsc;
        } else {
            AppState.sortCol = col;
            AppState.sortAsc = true;
        }

        const type = AppState.columnTypes[col];
        
        AppState.filteredData.sort((a, b) => {
            let valA = a[col], valB = b[col];
            if (valA === null || valA === undefined) valA = '';
            if (valB === null || valB === undefined) valB = '';

            if (type === 'number') {
                return AppState.sortAsc ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
            } else if (type === 'date') {
                return AppState.sortAsc ? new Date(valA) - new Date(valB) : new Date(valB) - new Date(valA);
            } else {
                valA = String(valA).toLowerCase();
                valB = String(valB).toLowerCase();
                if (valA < valB) return AppState.sortAsc ? -1 : 1;
                if (valA > valB) return AppState.sortAsc ? 1 : -1;
                return 0;
            }
        });
        Grid.render();
    },

    render: () => {
        if(!Utils.validateDataset()) return;

        const thead = document.getElementById('main-table-head');
        const tbody = document.getElementById('main-table-body');
        
        let headHTML = '<tr>';
        AppState.headers.forEach(h => {
            const isSorted = AppState.sortCol === h;
            const icon = isSorted ? (AppState.sortAsc ? 'arrow_upward' : 'arrow_downward') : 'swap_vert';
            const activeClass = isSorted ? 'active' : '';
            headHTML += `<th data-col="${h}">${h} <span class="material-icons-round sort-icon ${activeClass}">${icon}</span></th>`;
        });
        headHTML += '</tr>';
        thead.innerHTML = headHTML;

        tbody.innerHTML = '';
        const start = (AppState.currentPage - 1) * AppState.rowsPerPage;
        const end = start + AppState.rowsPerPage;
        const pageData = AppState.filteredData.slice(start, end);

        pageData.forEach((row, i) => {
            const globalIndex = start + i;
            const tr = document.createElement('tr');
            AppState.headers.forEach(h => {
                const td = document.createElement('td');
                td.className = 'editable';
                td.dataset.col = h;
                td.dataset.row = globalIndex;
                let val = row[h];
                
                if (val === null || val === undefined) val = '';
                if(AppState.columnTypes[h] === 'date' && val) {
                    try { val = new Date(val).toLocaleDateString(); } catch(e){}
                }
                if(AppState.columnTypes[h] === 'number' && val !== '') {
                    val = Utils.formatNumber(Number(val));
                }
                
                td.textContent = val;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });

        const total = AppState.filteredData.length;
        const totalPages = Math.ceil(total / AppState.rowsPerPage) || 1;
        document.getElementById('grid-start-idx').textContent = total === 0 ? 0 : start + 1;
        document.getElementById('grid-end-idx').textContent = Math.min(end, total);
        document.getElementById('grid-total-idx').textContent = total;
        document.getElementById('grid-current-page').textContent = AppState.currentPage;
        document.getElementById('grid-total-pages').textContent = totalPages;
        
        document.getElementById('btn-prev-page').disabled = AppState.currentPage === 1;
        document.getElementById('btn-next-page').disabled = AppState.currentPage === totalPages;
        console.log("Table rendered");
    }
};

const Cleaning = {
    init: () => {
        let history = [];
        const saveState = () => {
            if(history.length >= 5) history.shift();
            history.push(JSON.parse(JSON.stringify(AppState.cleanedData)));
            document.getElementById('btn-undo-clean').disabled = false;
        };

        document.getElementById('btn-undo-clean').addEventListener('click', () => {
            if(history.length > 0) {
                AppState.cleanedData = history.pop();
                Utils.analyzeSchema();
                Utils.applyGlobalFilter();
                Utils.showToast('Last action undone.', 'success', 'undo');
                if(history.length === 0) document.getElementById('btn-undo-clean').disabled = true;
            }
        });

        document.getElementById('select-missing-action').addEventListener('change', (e) => {
            const customInput = document.getElementById('input-missing-custom');
            if(e.target.value === 'custom') customInput.classList.remove('hidden');
            else customInput.classList.add('hidden');
        });

        document.getElementById('btn-clean-dup-all').addEventListener('click', () => {
            saveState();
            const seen = new Set();
            const before = AppState.cleanedData.length;
            AppState.cleanedData = AppState.cleanedData.filter(row => {
                const str = JSON.stringify(row);
                if(seen.has(str)) return false;
                seen.add(str);
                return true;
            });
            Utils.postCleanUpdate();
            Utils.showToast(`Removed ${before - AppState.cleanedData.length} duplicate rows.`);
        });

        document.getElementById('btn-clean-dup-col').addEventListener('click', () => {
            const col = document.getElementById('select-dup-col').value;
            if(!col) return;
            saveState();
            const seen = new Set();
            const before = AppState.cleanedData.length;
            AppState.cleanedData = AppState.cleanedData.filter(row => {
                const val = row[col];
                if(seen.has(val)) return false;
                seen.add(val);
                return true;
            });
            Utils.postCleanUpdate();
            Utils.showToast(`Removed ${before - AppState.cleanedData.length} duplicates based on ${col}.`);
        });

        document.getElementById('btn-clean-missing').addEventListener('click', () => {
            const col = document.getElementById('select-missing-col').value;
            const action = document.getElementById('select-missing-action').value;
            if(!col) return;
            saveState();
            
            let count = 0;
            if (action === 'remove') {
                const before = AppState.cleanedData.length;
                AppState.cleanedData = AppState.cleanedData.filter(row => row[col] !== null && row[col] !== undefined && row[col] !== '');
                Utils.showToast(`Removed ${before - AppState.cleanedData.length} rows missing ${col}.`);
            } else {
                let fillVal = null;
                if(action === 'custom') fillVal = document.getElementById('input-missing-custom').value;
                else {
                    const vals = AppState.cleanedData.map(r => r[col]).filter(v => v !== null && v !== '' && !isNaN(Number(v))).map(Number);
                    if(vals.length === 0) { Utils.showToast('No numeric data to calculate.', 'error'); return; }
                    if(action === 'mean') fillVal = vals.reduce((a,b)=>a+b,0) / vals.length;
                    else {
                        vals.sort((a,b)=>a-b);
                        const mid = Math.floor(vals.length/2);
                        fillVal = vals.length % 2 !== 0 ? vals[mid] : (vals[mid-1] + vals[mid])/2;
                    }
                }
                
                AppState.cleanedData.forEach(row => {
                    if(row[col] === null || row[col] === undefined || row[col] === '') {
                        row[col] = (AppState.columnTypes[col] === 'number' || action==='mean' || action==='median') ? Number(fillVal) : fillVal;
                        count++;
                    }
                });
                Utils.showToast(`Filled ${count} missing values in ${col}.`);
            }
            Utils.postCleanUpdate();
        });

        document.getElementById('btn-clean-format').addEventListener('click', () => {
            const col = document.getElementById('select-format-col').value;
            const action = document.getElementById('select-format-action').value;
            if(!col) return;
            saveState();
            
            let count = 0;
            AppState.cleanedData.forEach(row => {
                let val = row[col];
                if(val === null || val === undefined) return;
                
                if(action === 'trim' && typeof val === 'string') { row[col] = val.trim(); count++; }
                else if(action === 'lower' && typeof val === 'string') { row[col] = val.toLowerCase(); count++; }
                else if(action === 'upper' && typeof val === 'string') { row[col] = val.toUpperCase(); count++; }
                else if(action === 'special' && typeof val === 'string') { row[col] = val.replace(/[^a-zA-Z0-9 ]/g, ""); count++; }
                else if(action === 'to_num') { 
                    const n = Number(val);
                    if(!isNaN(n)) { row[col] = n; count++; }
                }
                else if(action === 'to_str') { row[col] = String(val); count++; }
            });
            
            Utils.postCleanUpdate();
            Utils.showToast(`Applied formatting to ${count} cells in ${col}.`);
        });

        document.getElementById('btn-clean-norm').addEventListener('click', () => {
            const col = document.getElementById('select-norm-col').value;
            const method = document.getElementById('select-norm-method').value;
            if(!col) return;
            
            const vals = AppState.cleanedData.map(r => r[col]).filter(v => v !== null && v !== '' && !isNaN(Number(v))).map(Number);
            if(vals.length === 0) { Utils.showToast('Column has no numeric data.', 'error'); return; }
            
            saveState();
            
            if (method === 'minmax') {
                const min = Math.min(...vals);
                const max = Math.max(...vals);
                if(max - min === 0) return Utils.showToast('Max equals min, cannot normalize.', 'error');
                AppState.cleanedData.forEach(row => {
                    if(row[col] !== null && row[col] !== '' && !isNaN(Number(row[col]))) {
                        row[col] = (Number(row[col]) - min) / (max - min);
                    }
                });
            } else if (method === 'zscore') {
                const mean = vals.reduce((a,b)=>a+b,0) / vals.length;
                const variance = vals.reduce((a,b)=>a + Math.pow(b - mean, 2), 0) / vals.length;
                const stdDev = Math.sqrt(variance);
                if(stdDev === 0) return Utils.showToast('Standard deviation is 0.', 'error');
                
                AppState.cleanedData.forEach(row => {
                    if(row[col] !== null && row[col] !== '' && !isNaN(Number(row[col]))) {
                        row[col] = (Number(row[col]) - mean) / stdDev;
                    }
                });
            }
            Utils.postCleanUpdate();
            Utils.showToast(`Normalized column ${col} using ${method}.`);
        });
    },
    
    populateSelects: () => {
        const h = AppState.headers.map(col => `<option value="${col}">${col}</option>`).join('');
        const n = Utils.getNumericColumns().map(col => `<option value="${col}">${col}</option>`).join('');
        document.getElementById('select-dup-col').innerHTML = h;
        document.getElementById('select-missing-col').innerHTML = h;
        document.getElementById('select-format-col').innerHTML = h;
        document.getElementById('select-norm-col').innerHTML = n;
    }
};

const Stats = {
    init: () => {
        document.getElementById('btn-calc-stats').addEventListener('click', () => {
            const col = document.getElementById('select-stats-col').value;
            if(col) Stats.compute(col);
        });
        document.getElementById('btn-generate-insights').addEventListener('click', () => {
            const col = document.getElementById('select-stats-col').value;
            if(col) Stats.compute(col); // Compute will trigger insights
        });
    },

    populateSelects: () => {
        const numCols = Utils.getNumericColumns();
        const select = document.getElementById('select-stats-col');
        select.innerHTML = '<option value="">-- Select Feature --</option>' + numCols.map(col => `<option value="${col}">${col}</option>`).join('');
        if(numCols.length > 0) {
            select.value = numCols[0];
            Stats.compute(numCols[0]);
        }
    },

    compute: (col) => {
        if(!col) return;
        if(!Utils.validateDataset()) return;

        const vals = AppState.filteredData.map(r => r[col]).filter(v => v !== null && v !== '' && !isNaN(Number(v))).map(Number);
        const n = vals.length;
        if(n === 0) { Utils.showToast('No valid numeric data found for this column.', 'error'); return; }
        
        vals.sort((a,b)=>a-b);
        const sum = vals.reduce((a,b)=>a+b,0);
        const mean = sum / n;
        const mid = Math.floor(n/2);
        const median = n % 2 !== 0 ? vals[mid] : (vals[mid-1] + vals[mid])/2;
        
        const freq = {};
        let maxFreq = 0, mode = vals[0];
        vals.forEach(v => {
            freq[v] = (freq[v] || 0) + 1;
            if(freq[v] > maxFreq) { maxFreq = freq[v]; mode = v; }
        });
        
        const min = vals[0], max = vals[n-1], range = max - min;
        const variance = vals.reduce((a,b)=>a + Math.pow(b - mean, 2), 0) / n;
        const stdDev = Math.sqrt(variance);
        const q1 = vals[Math.floor(n * 0.25)], q3 = vals[Math.floor(n * 0.75)], iqr = q3 - q1;

        document.getElementById('stats-central').innerHTML = `
            <div class="metric-row"><span class="text-secondary">Mean (Average)</span><span class="font-bold">${Utils.formatNumber(mean)}</span></div>
            <div class="metric-row"><span class="text-secondary">Median</span><span class="font-bold">${Utils.formatNumber(median)}</span></div>
            <div class="metric-row"><span class="text-secondary">Mode</span><span class="font-bold">${Utils.formatNumber(mode)} <small class="opacity-50">(${maxFreq}x)</small></span></div>
        `;
        document.getElementById('stats-spread').innerHTML = `
            <div class="metric-row"><span class="text-secondary">Variance</span><span class="font-bold">${Utils.formatNumber(variance)}</span></div>
            <div class="metric-row"><span class="text-secondary">Standard Deviation</span><span class="font-bold">${Utils.formatNumber(stdDev)}</span></div>
            <div class="metric-row"><span class="text-secondary">Range</span><span class="font-bold">${Utils.formatNumber(range)}</span></div>
            <div class="metric-row"><span class="text-secondary">IQR</span><span class="font-bold">${Utils.formatNumber(iqr)}</span></div>
        `;
        document.getElementById('stats-dist').innerHTML = `
            <div class="metric-row"><span class="text-secondary">Minimum</span><span class="font-bold">${Utils.formatNumber(min)}</span></div>
            <div class="metric-row"><span class="text-secondary">Maximum</span><span class="font-bold">${Utils.formatNumber(max)}</span></div>
            <div class="metric-row"><span class="text-secondary">Sum Total</span><span class="font-bold">${Utils.formatNumber(sum)}</span></div>
            <div class="metric-row"><span class="text-secondary">Valid Count</span><span class="font-bold">${n.toLocaleString()} records</span></div>
        `;
        
        const cv = (stdDev / mean) * 100;
        let insights = [];
        if(cv > 50) insights.push(`High variance detected. The values in <strong>${col}</strong> fluctuate significantly (CV: ${cv.toFixed(1)}%), indicating instability or extreme outliers.`);
        else insights.push(`Consistent data. The feature <strong>${col}</strong> shows low relative variance, indicating a stable trend.`);
        if(mean > median * 1.2) insights.push(`Positive skew distribution. The mean is pulled up by high-value outliers (Max: ${Utils.formatNumber(max)}).`);
        if(mean < median * 0.8) insights.push(`Negative skew distribution. The mean is pulled down by low-value anomalies.`);
        if(range === 0) insights.push(`Constant feature. All values are identical. This feature provides no predictive variance.`);

        document.getElementById('ai-insights-list').innerHTML = insights.map(i => `<li>${i}</li>`).join('');
        console.log("Stats rendered");
    }
};

const Viz = {
    init: () => {
        document.getElementById('btn-render-chart').addEventListener('click', () => Viz.renderChart('main-chart-canvas', 'main'));
        document.getElementById('btn-save-chart').addEventListener('click', () => {
            if(!AppState.chartsInstances['main']) return Utils.showToast('Please render a chart first.', 'warning');
            const base64 = document.getElementById('main-chart-canvas').toDataURL('image/png');
            const title = `${document.getElementById('chart-type').value.toUpperCase()} - ${document.getElementById('chart-y').value} by ${document.getElementById('chart-x').value}`;
            Dash.addWidget('chart', { image: base64, title });
        });
        document.getElementById('btn-compare-charts').addEventListener('click', () => {
            if(!AppState.chartsInstances['main']) return Utils.showToast('Please render a primary chart first.', 'warning');
            const container = document.querySelector('.builder-canvas');
            let compareCanvas = document.getElementById('compare-chart-canvas');
            if(!compareCanvas) {
                compareCanvas = document.createElement('canvas');
                compareCanvas.id = 'compare-chart-canvas';
                compareCanvas.style.marginTop = '20px';
                container.appendChild(compareCanvas);
                container.style.flexDirection = 'column';
            }
            Viz.renderChart('compare-chart-canvas', 'compare');
            Utils.showToast('Comparison chart rendered below.');
        });
        
        Chart.defaults.color = AppState.theme === 'dark' ? '#94a3b8' : '#64748b';
        Chart.defaults.font.family = 'Inter';
    },

    populateSelects: () => {
        const all = AppState.headers.map(col => `<option value="${col}">${col}</option>`).join('');
        const num = Utils.getNumericColumns().map(col => `<option value="${col}">${col}</option>`).join('');
        const cat = Utils.getCategoricalColumns().map(col => `<option value="${col}">${col}</option>`).join('');
        
        document.getElementById('chart-x').innerHTML = (cat || all);
        document.getElementById('chart-y').innerHTML = (num || all);
    },

    renderChart: (canvasId, instanceId) => {
        if(!Utils.validateDataset()) return;

        const type = document.getElementById('chart-type').value;
        const xCol = document.getElementById('chart-x').value;
        const yCol = document.getElementById('chart-y').value;
        const agg = document.getElementById('chart-agg').value;
        const color = document.getElementById('chart-color').value;
        
        if(!xCol || !yCol) return;

        document.getElementById('chart-empty-state').classList.add('hidden');
        const canvas = document.getElementById(canvasId);
        const ctx = canvas.getContext('2d');
        
        if (AppState.chartsInstances[instanceId]) AppState.chartsInstances[instanceId].destroy();

        const isScatter = type === 'scatter';
        let labels = [], dataPoints = [];
        
        if(isScatter) {
            AppState.filteredData.forEach(row => {
                if(row[xCol] !== null && row[yCol] !== null) {
                    dataPoints.push({ x: Number(row[xCol]), y: Number(row[yCol]) });
                }
            });
        } else {
            const map = {};
            AppState.filteredData.forEach(row => {
                let key = row[xCol];
                if(key === null || key === undefined) key = 'Unknown';
                if(AppState.columnTypes[xCol] === 'date') { try{ key = new Date(key).toLocaleDateString(); }catch(e){} }
                
                const val = Number(row[yCol]) || 0;
                if(!map[key]) map[key] = { sum: 0, count: 0, vals: [] };
                map[key].sum += val;
                map[key].count += 1;
            });
            
            labels = Object.keys(map).sort();
            if(labels.length > 50 && type !== 'line') {
                labels = labels.slice(0, 50);
                Utils.showToast('Limited chart to 50 categories for performance.', 'warning');
            }
            
            dataPoints = labels.map(l => {
                if(agg === 'avg') return map[l].sum / map[l].count;
                if(agg === 'count') return map[l].count;
                return map[l].sum;
            });
        }

        const hexToRgb = (hex, alpha) => {
            const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        const bgColors = dataPoints.map((_, i) => (type === 'pie' || type === 'doughnut') ? `hsl(${(i * 360) / dataPoints.length}, 70%, 50%)` : hexToRgb(color, 0.6));
        const borderColors = type === 'pie' || type === 'doughnut' ? '#fff' : color;

        const config = {
            type: type === 'area' ? 'line' : type,
            data: {
                labels: isScatter ? undefined : labels,
                datasets: [{
                    label: `${agg.toUpperCase()} of ${yCol}`,
                    data: dataPoints,
                    backgroundColor: bgColors,
                    borderColor: borderColors,
                    borderWidth: 1,
                    fill: type === 'area' || type === 'radar',
                    tension: 0.3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top' }, tooltip: { mode: 'index', intersect: false } }
            }
        };

        AppState.chartsInstances[instanceId] = new Chart(ctx, config);
        console.log("Chart rendered");
    }
};

const Correlation = {
    init: () => {
        document.getElementById('btn-gen-correlation').addEventListener('click', Correlation.render);
    },
    
    render: () => {
        if(!Utils.validateDataset()) return;

        const numCols = Utils.getNumericColumns();
        if(numCols.length < 2) {
            document.getElementById('corr-empty-state').classList.remove('hidden');
            document.getElementById('d3-heatmap-container').innerHTML = '';
            Utils.showToast("Need at least 2 numeric features.", "error");
            return;
        }
        document.getElementById('corr-empty-state').classList.add('hidden');
        
        const matrix = [];
        const data = AppState.filteredData;
        const pearson = (xCol, yCol) => {
            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0, n = 0;
            data.forEach(row => {
                const x = Number(row[xCol]), y = Number(row[yCol]);
                if(!isNaN(x) && !isNaN(y)) {
                    sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x; sumY2 += y * y; n++;
                }
            });
            if(n === 0) return 0;
            const num = (n * sumXY) - (sumX * sumY);
            const den = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
            return den === 0 ? 0 : num / den;
        };

        const flattened = [];
        const insights = [];

        numCols.forEach((c1, i) => {
            matrix[i] = [];
            numCols.forEach((c2, j) => {
                const r = pearson(c1, c2);
                matrix[i][j] = r;
                flattened.push({x: c1, y: c2, value: r});
                if(i < j && Math.abs(r) > 0.7) insights.push({c1, c2, r});
            });
        });
        
        insights.sort((a,b) => Math.abs(b.r) - Math.abs(a.r));
        const insightsList = document.getElementById('corr-insights-list');
        if(insights.length === 0) insightsList.innerHTML = '<p class="text-secondary">No strong correlations found (r > 0.7).</p>';
        else {
            insightsList.innerHTML = insights.map(item => {
                const strength = item.r > 0 ? 'Positive' : 'Negative';
                const color = item.r > 0 ? 'text-success' : 'text-danger';
                return `<div class="p-4 glass-panel" style="border-radius: 8px;">
                    <div class="flex-between"><span class="font-bold">${item.c1} & ${item.c2}</span> <span class="${color} font-bold">${item.r.toFixed(2)}</span></div>
                    <div class="text-sm text-secondary mt-1">Strong ${strength} Relationship</div>
                </div>`;
            }).join('');
        }

        const container = document.getElementById('d3-heatmap-container');
        container.innerHTML = '';
        
        let tooltip = d3.select("body").select(".d3-tooltip");
        if(tooltip.empty()) tooltip = d3.select("body").append("div").attr("class", "d3-tooltip");

        const margin = {top: 80, right: 25, bottom: 80, left: 100},
              width = Math.max(500, numCols.length * 60) - margin.left - margin.right,
              height = Math.max(500, numCols.length * 60) - margin.top - margin.bottom;

        const svg = d3.select("#d3-heatmap-container").append("svg")
            .attr("width", width + margin.left + margin.right)
            .attr("height", height + margin.top + margin.bottom)
            .append("g").attr("transform", `translate(${margin.left},${margin.top})`);

        const x = d3.scaleBand().range([0, width]).domain(numCols).padding(0.05);
        svg.append("g").attr("transform", `translate(0, -10)`).call(d3.axisTop(x).tickSize(0)).select(".domain").remove();
        svg.selectAll("text").attr("transform", "rotate(-45)").style("text-anchor", "start").style("font-family", "Inter");

        const y = d3.scaleBand().range([height, 0]).domain(numCols.reverse()).padding(0.05);
        svg.append("g").call(d3.axisLeft(y).tickSize(0)).select(".domain").remove();

        const myColor = d3.scaleSequential().interpolator(d3.interpolateRdBu).domain([1, -1]);

        svg.selectAll()
            .data(flattened, d => d.x+':'+d.y)
            .join("rect")
            .attr("x", d => x(d.x)).attr("y", d => y(d.y)).attr("rx", 4).attr("ry", 4)
            .attr("width", x.bandwidth()).attr("height", y.bandwidth())
            .style("fill", d => myColor(d.value)).style("stroke-width", 0).style("stroke", "none").style("opacity", 0.9)
            .on("mouseover", function(event, d) {
                tooltip.style("opacity", 1).html(`${d.x} & ${d.y}<br>r = ${d.value.toFixed(3)}`)
                    .style("left", (event.pageX + 15) + "px").style("top", (event.pageY - 28) + "px");
                d3.select(this).style("stroke", "black").style("stroke-width", 2).style("opacity", 1);
            })
            .on("mouseleave", function() {
                tooltip.style("opacity", 0);
                d3.select(this).style("stroke", "none").style("opacity", 0.9);
            });
            
        if(x.bandwidth() > 40) {
            svg.selectAll().data(flattened).join("text").text(d => d.value.toFixed(2))
                .attr("x", d => x(d.x) + x.bandwidth()/2).attr("y", d => y(d.y) + y.bandwidth()/2 + 4)
                .style("text-anchor", "middle").style("fill", d => Math.abs(d.value) > 0.5 ? "white" : "black")
                .style("font-size", "12px").style("font-family", "Inter").style("pointer-events", "none");
        }
        console.log(`[Correlation] Heatmap generated successfully.`);
    }
};

const Forecast = {
    init: () => {
        document.getElementById('btn-run-forecast').addEventListener('click', Forecast.run);
        document.getElementById('btn-save-forecast').addEventListener('click', () => {
            if(!AppState.chartsInstances['forecast']) return Utils.showToast('Please generate a forecast first.', 'warning');
            const base64 = document.getElementById('forecast-chart-canvas').toDataURL('image/png');
            Dash.addWidget('chart', { image: base64, title: 'Forecast Analysis' });
        });
    },

    populateSelects: () => {
        const all = AppState.headers.map(col => `<option value="${col}">${col}</option>`).join('');
        const num = Utils.getNumericColumns().map(col => `<option value="${col}">${col}</option>`).join('');
        document.getElementById('forecast-x').innerHTML = all;
        document.getElementById('forecast-y').innerHTML = num;
    },

    run: () => {
        if(!Utils.validateDataset()) return;

        const xCol = document.getElementById('forecast-x').value;
        const yCol = document.getElementById('forecast-y').value;
        const model = document.getElementById('forecast-model').value;
        const windowSize = parseInt(document.getElementById('forecast-window').value);
        
        if(!xCol || !yCol) return;
        
        let seqData = AppState.filteredData.map(r => ({ x: r[xCol], y: Number(r[yCol]) })).filter(d => !isNaN(d.y));
        if(AppState.columnTypes[xCol] === 'date') seqData.sort((a,b) => new Date(a.x) - new Date(b.x));
        else if (AppState.columnTypes[xCol] === 'number') seqData.sort((a,b) => Number(a.x) - Number(b.x));
        
        if(seqData.length < 5) return Utils.showToast('Not enough data points for forecasting.', 'error');

        const yVals = seqData.map(d => d.y);
        const labels = seqData.map((d, i) => d.x ? String(d.x) : `T${i}`);
        
        let forecastPoints = Array(yVals.length).fill(null);
        let futureLabels = [], futureVals = [];

        if (model === 'linear') {
            const n = yVals.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            for(let i=0; i<n; i++) { sumX += i; sumY += yVals[i]; sumXY += i * yVals[i]; sumX2 += i * i; }
            const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
            const intercept = (sumY - slope * sumX) / n;
            
            forecastPoints[n-1] = yVals[n-1];
            for(let i=1; i<=windowSize; i++) {
                futureLabels.push(`FC+${i}`);
                futureVals.push(intercept + slope * (n - 1 + i));
            }
            
            const regLine = yVals.map((_, i) => intercept + slope * i);
            Forecast.renderChart(labels.concat(futureLabels), yVals.concat(Array(windowSize).fill(null)), 
                                 regLine.concat(Array(windowSize).fill(null)),
                                 forecastPoints.concat(futureVals), 'Linear Regression Fit');

        } else if (model === 'sma') {
            const smaPeriod = Math.min(5, yVals.length);
            const histSMA = yVals.map((_, idx) => {
                if(idx < smaPeriod - 1) return null;
                const slice = yVals.slice(idx - smaPeriod + 1, idx + 1);
                return slice.reduce((a,b)=>a+b,0) / smaPeriod;
            });
            
            const lastTrend = histSMA[histSMA.length-1] - histSMA[histSMA.length-2];
            let currentVal = histSMA[histSMA.length-1];
            forecastPoints[yVals.length-1] = yVals[yVals.length-1];
            
            for(let i=1; i<=windowSize; i++) {
                futureLabels.push(`FC+${i}`);
                currentVal += lastTrend;
                futureVals.push(currentVal);
            }
            
            Forecast.renderChart(labels.concat(futureLabels), yVals.concat(Array(windowSize).fill(null)), 
                                 histSMA.concat(Array(windowSize).fill(null)),
                                 forecastPoints.concat(futureVals), 'SMA (5-period)');
        }
    },

    renderChart: (labels, actual, modelLine, forecastLine, modelName) => {
        document.getElementById('forecast-empty-state').classList.add('hidden');
        const canvas = document.getElementById('forecast-chart-canvas');
        const ctx = canvas.getContext('2d');
        
        if (AppState.chartsInstances['forecast']) AppState.chartsInstances['forecast'].destroy();

        AppState.chartsInstances['forecast'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'Historical Data', data: actual, borderColor: '#64748b', borderWidth: 2, fill: false, tension: 0.1 },
                    { label: modelName, data: modelLine, borderColor: 'rgba(99, 102, 241, 0.4)', borderWidth: 2, borderDash: [5, 5], pointRadius: 0, fill: false, tension: 0.3 },
                    { label: 'Forecast Extrapolation', data: forecastLine, borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.1)', borderWidth: 3, fill: true, tension: 0.1 }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'top' } } }
        });
        console.log(`[Forecast] Generated forecast chart successfully.`);
    }
};

const Dash = {
    init: () => {
        const container = document.getElementById('sortable-dashboard');
        new Sortable(container, { animation: 150, ghostClass: 'sortable-ghost', handle: '.dash-widget' });

        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.btn-delete-widget');
            if (btn) {
                e.stopPropagation();
                const el = btn.closest('.dash-widget');
                if (el) {
                    el.remove();
                    Dash.checkEmpty();
                }
            }
        });

        document.getElementById('btn-save-dash').addEventListener('click', Dash.saveLayout);
        document.getElementById('btn-restore-dash').addEventListener('click', Dash.restoreLayout);
        document.getElementById('btn-clear-dash').addEventListener('click', () => {
            if(confirm("Clear all dashboard widgets?")) {
                container.innerHTML = '';
                AppState.dashboard = [];
                localStorage.removeItem('nexus_dashboard');
                Dash.checkEmpty();
            }
        });
        document.getElementById('btn-add-widget-dash').addEventListener('click', () => {
            const title = prompt("Enter metric title:");
            const value = prompt("Enter metric value:");
            if(title && value) Dash.addWidget('metric', { title, value, label: title });
        });

        Dash.restoreLayout();
    },

    restoreLayout: () => {
        const saved = JSON.parse(localStorage.getItem('nexus_dashboard'));
        if(saved) AppState.dashboard = saved;
        const container = document.getElementById('sortable-dashboard');
        container.innerHTML = '';
        if(AppState.dashboard.length > 0) {
            AppState.dashboard.forEach(w => Dash.renderWidgetHTML(w));
        }
        Dash.checkEmpty();
    },

    checkEmpty: () => {
        const container = document.getElementById('sortable-dashboard');
        const empty = document.getElementById('dash-empty-state');
        if(container.children.length > 0) empty.classList.add('hidden');
        else empty.classList.remove('hidden');
    },

    addWidget: (type, data) => {
        const widget = { id: 'w_' + Date.now(), type, data };
        AppState.dashboard.push(widget);
        Dash.renderWidgetHTML(widget);
        Dash.checkEmpty();
        Utils.showToast('Widget added to dashboard');
    },

    renderWidgetHTML: (w) => {
        const container = document.getElementById('sortable-dashboard');
        const el = document.createElement('div');
        el.className = 'dash-widget';
        el.id = w.id;
        
        let contentHTML = '';
        if(w.type === 'chart') contentHTML = `<img src="${w.data.image}" style="max-width:100%; max-height:100%; object-fit:contain;">`;
        else if(w.type === 'metric') contentHTML = `<div class="widget-metric-content"><div class="widget-metric-value">${w.data.value}</div><div class="widget-metric-label">${w.data.label}</div></div>`;

        el.innerHTML = `<div class="widget-header"><div class="widget-title"><span class="material-icons-round text-primary" style="font-size:18px;">${w.type==='chart'?'insert_chart':'score'}</span> ${w.data.title || 'Widget'}</div><div class="widget-actions"><button class="icon-btn btn-delete-widget"><span class="material-icons-round">close</span></button></div></div><div class="widget-content">${contentHTML}</div>`;
        
        container.appendChild(el);
    },

    saveLayout: () => {
        const container = document.getElementById('sortable-dashboard');
        const newOrder = [];
        container.querySelectorAll('.dash-widget').forEach(el => {
            const match = AppState.dashboard.find(w => w.id === el.id);
            if(match) newOrder.push(match);
        });
        AppState.dashboard = newOrder;
        localStorage.setItem('nexus_dashboard', JSON.stringify(AppState.dashboard));
        Utils.showToast('Dashboard layout saved successfully.');
    }
};

const Export = {
    init: () => {
        document.getElementById('btn-export-csv').addEventListener('click', Export.csv);
        document.getElementById('btn-export-xlsx').addEventListener('click', Export.xlsx);
        document.getElementById('btn-export-json').addEventListener('click', Export.json);
        document.getElementById('btn-export-pdf').addEventListener('click', Export.pdf);
        document.getElementById('btn-export-png').addEventListener('click', Export.png);
    },

    csv: () => {
        if(!AppState.filteredData.length) return Utils.showToast('No data to export', 'error');
        const csv = Papa.unparse(AppState.filteredData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url; link.download = "nexus_export.csv";
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        console.log("Export complete");
    },

    xlsx: () => {
        if(!AppState.filteredData.length) return Utils.showToast('No data to export', 'error');
        const ws = XLSX.utils.json_to_sheet(AppState.filteredData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Analytics Data");
        XLSX.writeFile(wb, "nexus_export.xlsx");
        console.log("Export complete");
    },

    json: () => {
        if(!AppState.filteredData.length) return Utils.showToast('No data to export', 'error');
        const blob = new Blob([JSON.stringify(AppState.filteredData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url; link.download = "nexus_export.json";
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
        console.log("Export complete");
    },
    
    png: async () => {
        if(!AppState.filteredData.length) return Utils.showToast('No data', 'error');
        try {
            const canvas = await html2canvas(document.getElementById('views-wrapper'), { useCORS: true });
            const link = document.createElement('a');
            link.download = 'nexus_snapshot.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
            console.log("Export complete");
        } catch(e) {
            Utils.showToast('PNG capture failed', 'error');
        }
    },

    pdf: async () => {
        if(!AppState.filteredData.length) return Utils.showToast('No data to export', 'error');
        Utils.showToast('Generating Executive PDF Report... Please wait.', 'success', 'hourglass_empty');
        
        document.getElementById('pdf-date').textContent = new Date().toLocaleString();
        document.getElementById('pdf-rows').textContent = AppState.filteredData.length.toLocaleString();
        document.getElementById('pdf-cols').textContent = AppState.headers.length;
        
        document.getElementById('pdf-insights').innerHTML = document.getElementById('ai-insights-list').innerHTML;
        
        const container = document.getElementById('pdf-charts-container');
        container.innerHTML = '';
        
        document.querySelectorAll('.dash-widget').forEach(w => {
            const clone = w.cloneNode(true);
            clone.style.border = '1px solid #e2e8f0'; clone.style.marginBottom = '20px'; clone.style.color = 'black'; clone.style.background = '#f8fafc';
            clone.querySelector('.widget-actions').remove();
            container.appendChild(clone);
        });
        
        if(container.innerHTML === '') container.innerHTML = '<p>No dashboard visuals configured.</p>';

        const element = document.getElementById('pdf-report-content');
        element.style.left = '0'; element.style.zIndex = '-1000';
        
        try {
            const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
            element.style.left = '-9999px';
            
            const imgData = canvas.toDataURL('image/png');
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save('nexus_executive_report.pdf');
            Utils.showToast('PDF Report generated successfully!');
            console.log("Export complete");
            
        } catch(e) {
            element.style.left = '-9999px';
            Utils.showToast(`PDF generation failed: ${e.message}`, 'error');
        }
    }
};

document.addEventListener("DOMContentLoaded", () => {
    UI.init();
    Ingestion.init();
    Grid.init();
    Cleaning.init();
    Stats.init();
    Viz.init();
    Correlation.init();
    Forecast.init();
    Dash.init();
    Export.init();
    console.log("[Init] Nexus Analytics Platform initialized.");
});

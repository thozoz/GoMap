import { useState, useEffect, useRef } from 'react';
import { StartScan, StartScanList, CancelScan, ScanNetwork } from '../wailsjs/go/main/App';
import { EventsOn, EventsOff } from '../wailsjs/runtime/runtime';

function App() {
    // -- Mode --
    const [mode, setMode] = useState('port'); // 'port' | 'network'

    // -- Theme state --
    const [theme, setTheme] = useState(localStorage.getItem('gomap-theme') || 'default');

    // -- Port Scan state --
    const [host, setHost] = useState('127.0.0.1');
    const [startPort, setStartPort] = useState(1);
    const [endPort, setEndPort] = useState(1024);
    const [timeoutMs, setTimeoutMs] = useState(500);
    const [workers, setWorkers] = useState(100);
    const [results, setResults] = useState([]);
    const [filter, setFilter] = useState('ALL');

    // -- Network Scan state --
    const [cidr, setCidr] = useState('192.168.1.0/24');
    const [netWorkers, setNetWorkers] = useState(50);
    const [netTimeout, setNetTimeout] = useState(500);
    const [hostResults, setHostResults] = useState([]);

    // -- Shared state --
    const [isScanning, setIsScanning] = useState(false);
    const [status, setStatus] = useState('Ready');
    const [progress, setProgress] = useState({ Scanned: 0, Total: 0, Speed: 0 });

    const bufferRef = useRef([]);
    const scanIdRef = useRef(0);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('gomap-theme', theme);
    }, [theme]);

    useEffect(() => {
        const flushInterval = setInterval(() => {
            if (bufferRef.current.length === 0) return;
            const toFlush = bufferRef.current;
            bufferRef.current = [];
            setResults(prev => [...prev, ...toFlush]);
        }, 300);

        EventsOn('port_result', (result) => {
            bufferRef.current.push(result);
        });

        EventsOn('port_banner', ({ Port, Banner }) => {
            bufferRef.current = bufferRef.current.map(r =>
                r.Port === Port ? { ...r, Banner } : r
            );
            setResults(prev => prev.map(r =>
                r.Port === Port ? { ...r, Banner } : r
            ));
        });

        EventsOn('scan_done', (statusStr) => {
            if (bufferRef.current.length > 0) {
                const toFlush = bufferRef.current;
                bufferRef.current = [];
                setResults(prev => [...prev, ...toFlush]);
            }
            setIsScanning(false);
            setStatus(statusStr === 'cancelled' ? 'Scan cancelled' : 'Scan complete');
        });

        EventsOn('scan_progress', (p) => {
            setProgress(p);
        });

        EventsOn('host_result', (h) => {
            setHostResults(prev => [...prev, h]);
        });

        EventsOn('network_scan_done', (statusStr) => {
            setIsScanning(false);
            setStatus(statusStr === 'cancelled' ? 'Scan cancelled' : 'Network scan complete');
        });

        return () => {
            clearInterval(flushInterval);
            EventsOff('port_result', 'port_banner', 'scan_done', 'scan_progress',
                'host_result', 'network_scan_done');
        };
    }, []);

    const resetPortState = () => {
        scanIdRef.current += 1;
        bufferRef.current = [];
        setResults([]);
        setProgress({ Scanned: 0, Total: 0, Speed: 0 });
        setIsScanning(true);
        setFilter('ALL');
    };

    const handleScan = () => {
        resetPortState();
        setStatus('Scanning...');
        StartScan(host, parseInt(startPort), parseInt(endPort), parseInt(timeoutMs), parseInt(workers))
            .catch(err => { setIsScanning(false); setStatus(`Error: ${err.message || err}`); });
    };

    const handleCommonPorts = () => {
        resetPortState();
        setStatus('Scanning common ports...');
        const commonPorts = [
            20, 21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 161, 162,
            389, 443, 445, 465, 500, 512, 513, 514, 587, 636, 873, 902, 993,
            995, 1080, 1099, 1194, 1433, 1434, 1701, 1723, 2049, 2181, 2375,
            2376, 2379, 2380, 3000, 3100, 3268, 3269, 3306, 3389, 4000, 4242,
            4500, 4848, 4899, 5000, 5353, 5355, 5432, 5671, 5672, 5900, 5901,
            5984, 6379, 6432, 6443, 7000, 7474, 8000, 8008, 8080, 8081, 8161,
            8443, 8500, 8600, 8888, 9000, 9090, 9092, 9200, 9300, 9418, 10250,
            10255, 15672, 25565, 27017, 27018, 61616,
        ];
        StartScanList(host, commonPorts, parseInt(timeoutMs), parseInt(workers))
            .catch(err => { setIsScanning(false); setStatus(`Error: ${err.message || err}`); });
    };

    const handleCancel = () => { CancelScan(); setStatus('Cancelling...'); };
    const handleClear = () => { setResults([]); setHostResults([]); setStatus('Ready'); setProgress({ Scanned: 0, Total: 0, Speed: 0 }); };

    const handleNetworkScan = () => {
        setHostResults([]);
        setIsScanning(true);
        setStatus(`Scanning ${cidr}...`);
        ScanNetwork(cidr, parseInt(netTimeout), parseInt(netWorkers))
            .catch(err => { setIsScanning(false); setStatus(`Error: ${err.message || err}`); });
    };

    const loadHostForPortScan = (ip) => {
        if (isScanning) return;
        setHost(ip);
        setMode('port');
    };

    const filteredResults = results.filter(r => {
        if (filter === 'OPEN') return r.Status === 'OPEN';
        if (filter === 'FILTERED') return r.Status === 'FILTERED';
        return true;
    });
    const openCount = results.filter(r => r.Status === 'OPEN').length;
    const progressPct = progress.Total > 0 ? Math.round((progress.Scanned / progress.Total) * 100) : 0;

    const inputCls = "bg-input border border-border rounded px-3 py-2 text-textMain text-sm focus:outline-none focus:border-btnPrimary disabled:opacity-50 transition-colors";

    return (
        <div className="min-h-screen bg-base text-textMain p-6 font-sans transition-colors duration-300">
            <div className="max-w-5xl mx-auto relative">

                {/* Theme Selector */}
                <div className="absolute top-0 right-0">
                    <select
                        value={theme}
                        onChange={(e) => setTheme(e.target.value)}
                        className="bg-input border border-border rounded px-2 py-1 text-textMain text-xs focus:outline-none focus:border-btnPrimary transition-colors cursor-pointer">
                        <option value="default">Default Theme</option>
                        <option value="dark">Dark Theme</option>
                        <option value="light">Light Theme</option>
                    </select>
                </div>

                {/* Header */}
                <header className="mb-6 text-center pt-2">
                    <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-accent to-btnSuccess mb-3">
                        GoMap
                    </h1>
                    {/* Mode toggle */}
                    <div className="inline-flex bg-panel border border-borderPanel rounded-lg p-1 gap-1 shadow-sm">
                        <button onClick={() => setMode('port')} disabled={isScanning}
                            className={`px-5 py-1.5 rounded text-sm font-semibold transition-colors disabled:opacity-50 ${mode === 'port' ? 'bg-btnPrimary text-white' : 'text-textMuted hover:text-textMain'}`}>
                            Port Scan
                        </button>
                        <button onClick={() => setMode('network')} disabled={isScanning}
                            className={`px-5 py-1.5 rounded text-sm font-semibold transition-colors disabled:opacity-50 ${mode === 'network' ? 'bg-btnSecondary text-white' : 'text-textMuted hover:text-textMain'}`}>
                            Network Scan
                        </button>
                    </div>
                </header>

                {/* ── PORT SCAN CONTROLS ── */}
                {mode === 'port' && (
                    <div className="bg-panel p-6 rounded-xl shadow-lg mb-6 border border-borderPanel transition-colors duration-300">
                        <div className="grid grid-cols-5 gap-4 mb-6">
                            {[
                                { label: 'Host', value: host, set: setHost, type: 'text' },
                                { label: 'Start Port', value: startPort, set: setStartPort, type: 'number' },
                                { label: 'End Port', value: endPort, set: setEndPort, type: 'number' },
                                { label: 'Timeout (ms)', value: timeoutMs, set: setTimeoutMs, type: 'number' },
                                { label: 'Workers', value: workers, set: setWorkers, type: 'number' },
                            ].map(({ label, value, set, type }) => (
                                <div key={label} className="flex flex-col">
                                    <label className="text-xs text-textMuted mb-1">{label}</label>
                                    <input type={type} value={value} onChange={e => set(e.target.value)}
                                        disabled={isScanning} className={inputCls} />
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-3 justify-center">
                            <button onClick={handleScan} disabled={isScanning}
                                className="bg-btnPrimary hover:bg-btnPrimaryHover disabled:opacity-40 text-white font-semibold py-2 px-6 rounded transition-colors cursor-pointer disabled:cursor-not-allowed">
                                {isScanning ? 'Scanning...' : 'Scan Range'}
                            </button>
                            <button onClick={handleCommonPorts} disabled={isScanning}
                                className="bg-btnSuccess hover:bg-btnSuccessHover disabled:opacity-40 text-white font-semibold py-2 px-6 rounded transition-colors cursor-pointer disabled:cursor-not-allowed">
                                Common Ports
                            </button>
                            <button onClick={handleCancel} disabled={!isScanning}
                                className="bg-btnDanger hover:bg-btnDangerHover disabled:opacity-40 text-white font-semibold py-2 px-6 rounded transition-colors cursor-pointer disabled:cursor-not-allowed">
                                Cancel
                            </button>
                            <button onClick={handleClear} disabled={isScanning || results.length === 0}
                                className="bg-btnNeutral hover:bg-btnNeutralHover disabled:opacity-40 text-white font-semibold py-2 px-6 rounded transition-colors cursor-pointer disabled:cursor-not-allowed">
                                Clear
                            </button>
                        </div>
                    </div>
                )}

                {/* ── NETWORK SCAN CONTROLS ── */}
                {mode === 'network' && (
                    <div className="bg-panel p-6 rounded-xl shadow-lg mb-6 border border-borderPanel transition-colors duration-300">
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            {[
                                { label: 'CIDR Range', value: cidr, set: setCidr, type: 'text' },
                                { label: 'Timeout (ms)', value: netTimeout, set: setNetTimeout, type: 'number' },
                                { label: 'Workers', value: netWorkers, set: setNetWorkers, type: 'number' },
                            ].map(({ label, value, set, type }) => (
                                <div key={label} className="flex flex-col">
                                    <label className="text-xs text-textMuted mb-1">{label}</label>
                                    <input type={type} value={value} onChange={e => set(e.target.value)}
                                        disabled={isScanning} className={inputCls} />
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-3 justify-center">
                            <button onClick={handleNetworkScan} disabled={isScanning}
                                className="bg-btnSecondary hover:bg-btnSecondaryHover disabled:opacity-40 text-white font-semibold py-2 px-8 rounded transition-colors cursor-pointer disabled:cursor-not-allowed">
                                {isScanning ? 'Scanning network...' : 'Scan Network'}
                            </button>
                            <button onClick={handleCancel} disabled={!isScanning}
                                className="bg-btnDanger hover:bg-btnDangerHover disabled:opacity-40 text-white font-semibold py-2 px-6 rounded transition-colors cursor-pointer disabled:cursor-not-allowed">
                                Cancel
                            </button>
                            <button onClick={handleClear} disabled={isScanning || hostResults.length === 0}
                                className="bg-btnNeutral hover:bg-btnNeutralHover disabled:opacity-40 text-white font-semibold py-2 px-6 rounded transition-colors cursor-pointer disabled:cursor-not-allowed">
                                Clear
                            </button>
                        </div>
                    </div>
                )}

                {/* ── PORT SCAN RESULTS ── */}
                {mode === 'port' && (
                    <div className="bg-panel rounded-xl shadow-lg border border-borderPanel overflow-hidden transition-colors duration-300">
                        <div className="p-4 border-b border-borderPanel flex justify-between items-center">
                            <span className="text-textMuted font-semibold">Results</span>
                            <div className="flex bg-base rounded-lg p-1 gap-1 border border-borderPanel">
                                {['ALL', 'OPEN', 'FILTERED'].map(f => (
                                    <button key={f} onClick={() => setFilter(f)}
                                        className={`px-3 py-1 text-xs rounded transition-colors ${filter === f
                                            ? f === 'ALL' ? 'bg-btnPrimary text-white'
                                                : f === 'OPEN' ? 'bg-btnSuccess text-white'
                                                    : 'bg-btnSecondary text-white'
                                            : 'text-textMuted hover:text-textMain'
                                            }`}>
                                        {f === 'ALL' ? 'Show all' : `Only ${f}`}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="max-h-96 overflow-y-auto">
                            <table className="w-full text-left">
                                <thead className="bg-header sticky top-0 z-10 transition-colors">
                                    <tr>
                                        {['Port', 'Status', 'Service', 'Banner'].map(h => (
                                            <th key={h} className="p-3 text-textMuted font-semibold text-sm border-b border-border">{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredResults.length === 0 ? (
                                        <tr>
                                            <td colSpan="4" className="p-8 text-center text-textMuted/70">
                                                {isScanning ? 'Scanning in progress...'
                                                    : results.length > 0 ? 'No results match the filter.'
                                                        : 'No results yet. Start a scan to find open ports.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredResults.slice(0, 1000).map((r, i) => (
                                            <tr key={`${r.Port}-${i}`}
                                                className={`border-b border-borderPanel hover:bg-hover/30 transition-colors ${r.Status === 'OPEN' ? 'bg-btnSuccess/10' :
                                                    r.Status === 'FILTERED' ? 'bg-btnSecondary/10' : ''
                                                    }`}>
                                                <td className="p-3 font-mono text-sm text-textMain">{r.Port}</td>
                                                <td className="p-3">
                                                    <span className={`px-2 py-0.5 rounded text-xs font-bold border ${r.Status === 'OPEN'
                                                        ? 'bg-btnSuccess/20 text-btnSuccess border-btnSuccess/30'
                                                        : r.Status === 'FILTERED'
                                                            ? 'bg-btnSecondary/20 text-btnSecondary border-btnSecondary/30'
                                                            : 'bg-btnNeutral/20 text-textMuted border-btnNeutral/30'
                                                        }`}>
                                                        {r.Status}
                                                    </span>
                                                </td>
                                                <td className="p-3 text-textMuted text-sm">{r.Service || '-'}</td>
                                                <td className="p-3 font-mono text-xs text-textMuted/70 truncate max-w-xs" title={r.Banner}>
                                                    {r.Banner || '-'}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                    {filteredResults.length > 1000 && (
                                        <tr>
                                            <td colSpan="4" className="p-3 text-center text-btnSecondary text-sm">
                                                Showing 1000 of {filteredResults.length} — use filters to narrow down
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-borderPanel h-0.5 w-full">
                            <div className="bg-accent h-0.5 transition-all duration-300" style={{ width: `${progressPct}%` }} />
                        </div>

                        <div className="bg-base px-4 py-2.5 text-xs text-textMuted border-t border-borderPanel flex justify-between items-center transition-colors">
                            <div className="flex items-center gap-2">
                                {isScanning && <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />}
                                <span>{status}</span>
                                {isScanning && progress.Total > 0 && (
                                    <span className="text-textMuted/70">
                                        — {progress.Scanned}/{progress.Total} ports · {progress.Speed.toFixed(0)} p/s · {progressPct}%
                                    </span>
                                )}
                            </div>
                            <span>Total: {results.length} · Open: {openCount}</span>
                        </div>
                    </div>
                )}

                {/* ── NETWORK SCAN RESULTS ── */}
                {mode === 'network' && (
                    <div className="bg-panel rounded-xl shadow-lg border border-borderPanel overflow-hidden transition-colors duration-300">
                        <div className="p-4 border-b border-borderPanel flex justify-between items-center">
                            <span className="text-textMuted font-semibold">Live Hosts</span>
                            <span className="text-xs text-textMuted/70">Click a row to scan that host's ports</span>
                        </div>

                        <div className="max-h-96 overflow-y-auto">
                            <table className="w-full text-left">
                                <thead className="bg-header sticky top-0 z-10 transition-colors">
                                    <tr>
                                        <th className="p-3 text-textMuted font-semibold text-sm border-b border-border">IP Address</th>
                                        <th className="p-3 text-textMuted font-semibold text-sm border-b border-border">Hostname</th>
                                        <th className="p-3 text-textMuted font-semibold text-sm border-b border-border">Detected Via</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {hostResults.length === 0 ? (
                                        <tr>
                                            <td colSpan="3" className="p-8 text-center text-textMuted/70">
                                                {isScanning ? 'Scanning network...' : 'No live hosts found yet. Start a network scan.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        [...hostResults].sort((a, b) => {
                                            if (a.Hostname && !b.Hostname) return -1;
                                            if (!a.Hostname && b.Hostname) return 1;
                                            const ipA = a.IP.split('.').map(Number);
                                            const ipB = b.IP.split('.').map(Number);
                                            for (let i = 0; i < 4; i++) {
                                                if (ipA[i] !== ipB[i]) return ipA[i] - ipB[i];
                                            }
                                            return 0;
                                        }).map((h, i) => (
                                            <tr key={`${h.IP}-${i}`}
                                                onClick={() => loadHostForPortScan(h.IP)}
                                                className={`border-b border-borderPanel transition-colors bg-btnSecondary/10 ${isScanning
                                                    ? 'cursor-not-allowed opacity-80'
                                                    : 'hover:bg-btnSecondary/30 cursor-pointer'
                                                    }`}>
                                                <td className="p-3 font-mono text-sm text-textMain">{h.IP}</td>
                                                <td className="p-3 text-sm text-textMuted font-mono">
                                                    {h.Hostname || <span className="text-textMuted/50">—</span>}
                                                </td>
                                                <td className="p-3">
                                                    <span className="px-2 py-0.5 rounded text-xs font-bold border bg-btnSecondary/20 text-btnSecondary border-btnSecondary/30">
                                                        port {h.OpenPort}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="bg-borderPanel h-0.5 w-full">
                            <div className="bg-btnSecondary h-0.5 transition-all duration-300" style={{ width: `${progressPct}%` }} />
                        </div>

                        <div className="bg-base px-4 py-2.5 text-xs text-textMuted border-t border-borderPanel flex justify-between items-center transition-colors">
                            <div className="flex items-center gap-2">
                                {isScanning && <span className="w-1.5 h-1.5 rounded-full bg-btnSecondary animate-pulse" />}
                                <span>{status}</span>
                                {isScanning && progress.Total > 0 && (
                                    <span className="text-textMuted/70">
                                        — {progress.Scanned}/{progress.Total} IPs · {progress.Speed.toFixed(0)} IP/s · {progressPct}%
                                    </span>
                                )}
                            </div>
                            <span>Live hosts found: {hostResults.length}</span>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}

export default App;
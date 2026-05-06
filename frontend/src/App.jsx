import { useState, useEffect, useRef } from 'react';
import { StartScan, StartScanList, CancelScan } from '../wailsjs/go/main/App';
import { EventsOn, EventsOff } from '../wailsjs/runtime/runtime';

function App() {
    const [host, setHost] = useState('127.0.0.1');
    const [startPort, setStartPort] = useState(1);
    const [endPort, setEndPort] = useState(1024);
    const [timeoutMs, setTimeoutMs] = useState(500);
    const [workers, setWorkers] = useState(100);
    const [results, setResults] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [status, setStatus] = useState('Ready');
    const [filter, setFilter] = useState('ALL');
    const [progress, setProgress] = useState({ Scanned: 0, Total: 0, Speed: 0 });

    // Buffer for batching rapid port_result events
    const bufferRef = useRef([]);

    // Register all listeners ONCE on mount, never again
    useEffect(() => {
        // Flush buffer to state every 300ms
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
            // Update in buffer if still there
            bufferRef.current = bufferRef.current.map(r =>
                r.Port === Port ? { ...r, Banner } : r
            );
            // Update in committed state
            setResults(prev => prev.map(r =>
                r.Port === Port ? { ...r, Banner } : r
            ));
        });

        EventsOn('scan_done', (statusStr) => {
            // Flush remaining buffer
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

        return () => {
            clearInterval(flushInterval);
            EventsOff('port_result');
            EventsOff('port_banner');
            EventsOff('scan_done');
            EventsOff('scan_progress');
        };
    }, []); // empty deps — runs once, stays alive

    const resetState = () => {
        bufferRef.current = [];
        setResults([]);
        setProgress({ Scanned: 0, Total: 0, Speed: 0 });
        setIsScanning(true);
    };

    const handleScan = () => {
        resetState();
        setStatus('Scanning...');
        StartScan(
            host,
            parseInt(startPort),
            parseInt(endPort),
            parseInt(timeoutMs),
            parseInt(workers)
        ).catch((err) => {
            setIsScanning(false);
            setStatus(`Error: ${err.message || err}`);
        });
    };

    const handleCommonPorts = () => {
        resetState();
        setStatus('Scanning common ports...');
        const commonPorts = [
            20, 21, 22, 23, 25, 53, 80, 110, 111, 135, 139, 143, 161, 162,
            389, 443, 445, 465, 500, 512, 513, 514, 587, 636, 873, 902, 993,
            995, 1080, 1099, 1194, 1433, 1434, 1701, 1723, 2049, 2053, 2083,
            2096, 2181, 2375, 2376, 2379, 2380, 3000, 3100, 3268, 3269, 3306,
            3389, 4000, 4242, 4500, 4848, 4899, 5000, 5353, 5355, 5432, 5671,
            5672, 5900, 5901, 5984, 6379, 6432, 6443, 7000, 7474, 8000, 8008,
            8080, 8081, 8161, 8443, 8500, 8600, 8888, 9000, 9090, 9092, 9200,
            9300, 9418, 10250, 10255, 15672, 25565, 27017, 27018, 61616,
        ];
        StartScanList(host, commonPorts, parseInt(timeoutMs), parseInt(workers))
            .catch((err) => {
                setIsScanning(false);
                setStatus(`Error: ${err.message || err}`);
            });
    };

    const handleCancel = () => {
        CancelScan();
        setStatus('Cancelling...');
    };

    const handleClear = () => {
        setResults([]);
        setStatus('Ready');
        setProgress({ Scanned: 0, Total: 0, Speed: 0 });
    };

    const filteredResults = results.filter(r => {
        if (filter === 'OPEN') return r.Status === 'OPEN';
        if (filter === 'FILTERED') return r.Status === 'FILTERED';
        return true;
    });

    const openCount = results.filter(r => r.Status === 'OPEN').length;
    const progressPct = progress.Total > 0
        ? Math.round((progress.Scanned / progress.Total) * 100)
        : 0;

    return (
        <div className="min-h-screen bg-gray-900 text-white p-6 font-sans">
            <div className="max-w-5xl mx-auto">

                {/* Header */}
                <header className="mb-8">
                    <h1 className="text-4xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                        GoMap
                    </h1>
                </header>

                {/* Controls */}
                <div className="bg-gray-800 p-6 rounded-xl shadow-lg mb-6 border border-gray-700">
                    <div className="grid grid-cols-5 gap-4 mb-6">
                        {[
                            { label: 'Host', value: host, set: setHost, type: 'text' },
                            { label: 'Start Port', value: startPort, set: setStartPort, type: 'number' },
                            { label: 'End Port', value: endPort, set: setEndPort, type: 'number' },
                            { label: 'Timeout (ms)', value: timeoutMs, set: setTimeoutMs, type: 'number' },
                            { label: 'Workers', value: workers, set: setWorkers, type: 'number' },
                        ].map(({ label, value, set, type }) => (
                            <div key={label} className="flex flex-col">
                                <label className="text-xs text-gray-400 mb-1">{label}</label>
                                <input
                                    type={type}
                                    value={value}
                                    onChange={e => set(e.target.value)}
                                    disabled={isScanning}
                                    className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-50 transition-colors"
                                />
                            </div>
                        ))}
                    </div>

                    <div className="flex gap-3 justify-center">
                        <button onClick={handleScan} disabled={isScanning}
                            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-semibold py-2 px-6 rounded transition-colors cursor-pointer disabled:cursor-not-allowed">
                            {isScanning ? 'Scanning...' : 'Scan Range'}
                        </button>
                        <button onClick={handleCommonPorts} disabled={isScanning}
                            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-semibold py-2 px-6 rounded transition-colors cursor-pointer disabled:cursor-not-allowed">
                            Common Ports
                        </button>
                        <button onClick={handleCancel} disabled={!isScanning}
                            className="bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold py-2 px-6 rounded transition-colors cursor-pointer disabled:cursor-not-allowed">
                            Cancel
                        </button>
                        <button onClick={handleClear} disabled={isScanning || results.length === 0}
                            className="bg-gray-600 hover:bg-gray-500 disabled:opacity-40 text-white font-semibold py-2 px-6 rounded transition-colors cursor-pointer disabled:cursor-not-allowed">
                            Clear
                        </button>
                    </div>
                </div>

                {/* Results */}
                <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">

                    {/* Results header */}
                    <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                        <span className="text-gray-300 font-semibold">Results</span>
                        <div className="flex bg-gray-900 rounded-lg p-1 gap-1 border border-gray-700">
                            {['ALL', 'OPEN', 'FILTERED'].map(f => (
                                <button key={f} onClick={() => setFilter(f)}
                                    className={`px-3 py-1 text-xs rounded transition-colors ${
                                        filter === f
                                            ? f === 'ALL' ? 'bg-blue-600 text-white'
                                                : f === 'OPEN' ? 'bg-emerald-600 text-white'
                                                : 'bg-yellow-600 text-white'
                                            : 'text-gray-400 hover:text-white'
                                    }`}>
                                    {f === 'ALL' ? 'Show all' : `Only ${f}`}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Table */}
                    <div className="max-h-96 overflow-y-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-700 sticky top-0">
                                <tr>
                                    {['Port', 'Status', 'Service', 'Banner'].map(h => (
                                        <th key={h} className="p-3 text-gray-300 font-semibold text-sm border-b border-gray-600">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredResults.length === 0 ? (
                                    <tr>
                                        <td colSpan="4" className="p-8 text-center text-gray-500">
                                            {isScanning ? 'Scanning in progress...' :
                                             results.length > 0 ? 'No results match the filter.' :
                                             'No results yet. Start a scan to find open ports.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredResults.slice(0, 1000).map((r, i) => (
                                        <tr key={`${r.Port}-${i}`}
                                            className={`border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors ${
                                                r.Status === 'OPEN' ? 'bg-emerald-900/20' :
                                                r.Status === 'FILTERED' ? 'bg-yellow-900/10' : ''
                                            }`}>
                                            <td className="p-3 font-mono text-sm text-gray-200">{r.Port}</td>
                                            <td className="p-3">
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold border ${
                                                    r.Status === 'OPEN'
                                                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                                        : r.Status === 'FILTERED'
                                                        ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                                                        : 'bg-gray-500/20 text-gray-400 border-gray-500/30'
                                                }`}>
                                                    {r.Status}
                                                </span>
                                            </td>
                                            <td className="p-3 text-gray-300 text-sm">{r.Service || '-'}</td>
                                            <td className="p-3 font-mono text-xs text-gray-400 truncate max-w-xs" title={r.Banner}>
                                                {r.Banner || '-'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                                {filteredResults.length > 1000 && (
                                    <tr>
                                        <td colSpan="4" className="p-3 text-center text-yellow-500 text-sm">
                                            Showing 1000 of {filteredResults.length} — use filters to narrow down
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {/* Progress bar */}
                    <div className="bg-gray-700 h-0.5 w-full">
                        <div className="bg-blue-500 h-0.5 transition-all duration-300"
                            style={{ width: `${progressPct}%` }} />
                    </div>

                    {/* Status bar */}
                    <div className="bg-gray-900 px-4 py-2.5 text-xs text-gray-400 border-t border-gray-700 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            {isScanning && (
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            )}
                            <span>{status}</span>
                            {isScanning && progress.Total > 0 && (
                                <span className="text-gray-500">
                                    — {progress.Scanned}/{progress.Total} ports · {progress.Speed.toFixed(0)} p/s · {progressPct}%
                                </span>
                            )}
                        </div>
                        <span>Total: {results.length} · Open: {openCount}</span>
                    </div>
                </div>

            </div>
        </div>
    );
}

export default App;
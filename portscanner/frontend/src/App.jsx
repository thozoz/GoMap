import {useState, useEffect} from 'react';
import { StartScan, CancelScan } from '../wailsjs/go/main/App';
import { EventsOn } from '../wailsjs/runtime/runtime';

function App() {
    const [host, setHost] = useState('127.0.0.1');
    const [startPort, setStartPort] = useState(1);
    const [endPort, setEndPort] = useState(1024);
    const [timeoutMs, setTimeoutMs] = useState(500);
    const [workers, setWorkers] = useState(100);
    const [results, setResults] = useState([]);
    const [isScanning, setIsScanning] = useState(false);
    const [status, setStatus] = useState('');

    useEffect(() => {
        const unsubscribePortResult = EventsOn("port_result", (result) => {
            setResults(prev => [...prev, result]);
        });
        const unsubscribeScanDone = EventsOn("scan_done", () => {
            setIsScanning(false);
            setStatus("Scan complete");
        });

        return () => {
            if (typeof unsubscribePortResult === 'function') unsubscribePortResult();
            if (typeof unsubscribeScanDone === 'function') unsubscribeScanDone();
        };
    }, []);

    const handleScan = () => {
        setResults([]);
        setIsScanning(true);
        setStatus(`Scanning...`);
        StartScan(host, parseInt(startPort), parseInt(endPort), parseInt(timeoutMs), parseInt(workers))
            .then((res) => {
                if (res === "done") {
                    setIsScanning(false);
                    setStatus("Scan complete");
                }
            })
            .catch((err) => {
                console.error(err);
                setIsScanning(false);
                setStatus("Scan error");
            });
    };

    const handleCancel = () => {
        CancelScan();
        setIsScanning(false);
        setStatus("Scan cancelled");
    };

    const openPortsCount = results.filter(r => r.Status === 'OPEN').length;

    return (
        <div className="min-h-screen bg-gray-900 text-white p-6 font-sans">
            <div className="max-w-5xl mx-auto">
                <header className="mb-8">
                    <h1 className="text-4xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
                        GoMap
                    </h1>
                </header>

                <div className="bg-gray-800 p-6 rounded-xl shadow-lg mb-8 border border-gray-700">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                        <div className="flex flex-col">
                            <label className="text-sm text-gray-400 mb-1">Host</label>
                            <input 
                                type="text" 
                                value={host} 
                                onChange={e => setHost(e.target.value)} 
                                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm text-gray-400 mb-1">Start Port</label>
                            <input 
                                type="number" 
                                value={startPort} 
                                onChange={e => setStartPort(e.target.value)} 
                                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm text-gray-400 mb-1">End Port</label>
                            <input 
                                type="number" 
                                value={endPort} 
                                onChange={e => setEndPort(e.target.value)} 
                                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm text-gray-400 mb-1">Timeout (ms)</label>
                            <input 
                                type="number" 
                                value={timeoutMs} 
                                onChange={e => setTimeoutMs(e.target.value)} 
                                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                        <div className="flex flex-col">
                            <label className="text-sm text-gray-400 mb-1">Workers</label>
                            <input 
                                type="number" 
                                value={workers} 
                                onChange={e => setWorkers(e.target.value)} 
                                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 text-white focus:outline-none focus:border-blue-500 transition-colors"
                            />
                        </div>
                    </div>
                    
                    <div className="mt-6 flex gap-4 justify-center">
                        <button 
                            onClick={handleScan} 
                            disabled={isScanning}
                            className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 disabled:text-gray-400 text-white font-semibold py-2 px-8 rounded shadow-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                            {isScanning ? 'Scanning...' : 'Scan'}
                        </button>
                        <button 
                            onClick={handleCancel} 
                            disabled={!isScanning}
                            className="bg-red-600 hover:bg-red-500 disabled:bg-red-800 disabled:text-gray-400 text-white font-semibold py-2 px-8 rounded shadow-lg transition-colors cursor-pointer disabled:cursor-not-allowed"
                        >
                            Cancel
                        </button>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
                    <div className="max-h-[400px] overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-700 sticky top-0">
                                <tr>
                                    <th className="p-3 text-gray-300 font-semibold border-b border-gray-600">Port</th>
                                    <th className="p-3 text-gray-300 font-semibold border-b border-gray-600">Status</th>
                                    <th className="p-3 text-gray-300 font-semibold border-b border-gray-600">Banner</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((result, idx) => (
                                    <tr 
                                        key={idx} 
                                        className={`border-b border-gray-700 hover:bg-gray-700/50 transition-colors ${
                                            result.Status === 'OPEN' ? 'bg-emerald-900/20' : 
                                            result.Status === 'FILTERED' ? 'bg-yellow-900/20' : ''
                                        }`}
                                    >
                                        <td className="p-3 font-mono text-gray-300">{result.Port}</td>
                                        <td className="p-3">
                                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                                                result.Status === 'OPEN' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 
                                                result.Status === 'FILTERED' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' : ''
                                            }`}>
                                                {result.Status}
                                            </span>
                                        </td>
                                        <td className="p-3 font-mono text-sm text-gray-400 truncate max-w-xs" title={result.Banner}>
                                            {result.Banner || '-'}
                                        </td>
                                    </tr>
                                ))}
                                {results.length === 0 && !isScanning && (
                                    <tr>
                                        <td colSpan="3" className="p-8 text-center text-gray-500">
                                            No results yet. Start a scan to find open ports.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    <div className="bg-gray-900 p-3 text-sm text-gray-400 border-t border-gray-700 flex justify-between items-center">
                        <div>
                            {isScanning ? (
                                <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                                    {status} {openPortsCount > 0 && `- ${openPortsCount} open ports found`}
                                </span>
                            ) : (
                                <span>{status || 'Ready'}</span>
                            )}
                        </div>
                        <div>
                            Total Found: {results.length}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;

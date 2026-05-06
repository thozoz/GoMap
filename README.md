# GoMap

A TCP port scanner and network host discovery tool with a native desktop GUI, built with Go and React.

<!-- Add your screenshot here -->
![GoMap](screenshot.png)

---

## Features

- **Port range scanning** — scan any TCP port range with configurable concurrency and connection timeout
- **Common ports preset** — one-click scan of ~100 well-known ports covering web, database, mail, VPN, DevOps, and remote access services
- **Service identification** — maps 100+ port numbers to their service names (SSH, HTTP, MySQL, Redis, Kubernetes, Docker, etc.)
- **Banner grabbing** — reads the server's welcome message on open ports within 500ms, without blocking the scan
- **Network host discovery** — scan an entire subnet via CIDR notation (e.g. `192.168.1.0/24`) to find live hosts on your network
- **Click-to-scan** — click any discovered host in network scan results to immediately port-scan it
- **Real-time feedback** — results stream in as ports are found, with a live progress bar and scan speed indicator
- **Result filtering** — toggle between All, OPEN, and FILTERED views without re-running the scan
- **Cancel support** — stop any scan cleanly at any point

---

## Requirements

| Dependency | Minimum Version |
|---|---|
| Go | 1.21+ |
| Wails CLI | v2 |
| Node.js | 18+ |

**Wails CLI:**

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

**Linux dependencies (Debian/Ubuntu):**

```bash
sudo apt install gcc libgtk-3-dev libwebkit2gtk-4.1-dev
```

**Linux dependencies (Arch):**

```bash
sudo pacman -S gcc gtk3 webkit2gtk-4.1
```

---

## Getting Started

Clone and run in development mode:

```bash
git clone https://github.com/yourusername/GoMap.git
cd GoMap
wails dev -tags webkit2_41
```

The application window opens automatically. A Vite dev server also starts at `http://localhost:5174` for browser-based development with hot module replacement.

To build a standalone binary:

```bash
wails build -tags webkit2_41
```

The output binary is located at `build/bin/portscanner`.

---

## Usage

### Port Scan

1. Enter a target host — IP address or hostname
2. Set the port range, connection timeout, and worker count
3. Click **Scan Range** for a full range scan, or **Common Ports** for the preset list
4. Use the filter buttons to show only OPEN or FILTERED ports
5. **Cancel** stops the scan; **Clear** resets the results table

### Network Scan

1. Switch to the **Network Scan** tab
2. Enter a CIDR range (e.g. `192.168.1.0/24`)
3. Click **Scan Network** — live hosts appear as they respond
4. Click any row to load that IP into port scan mode and switch tabs automatically

---

## Architecture

GoMap is built on [Wails v2](https://wails.io). Wails embeds a WebKit WebView into a native OS window and binds Go functions directly to the JavaScript runtime. There is no HTTP server, no REST API, and no polling — all communication between the backend and frontend happens over the Wails IPC bridge.

### Backend

The scanner uses a goroutine worker pool. Workers pull targets from a shared channel and dial with `net.DialTimeout`. On a successful connection, a `port_result` event is emitted immediately — before any banner read attempt. Banner reads use a separate 500ms deadline so they never block port discovery. Progress is reported via a ticker goroutine every 200ms. Both `StartScan` and `ScanNetwork` use context cancellation through a shared `cancelFunc` protected by a mutex.

### Frontend

The React frontend registers Wails event listeners once on mount. Incoming port results are buffered in a `useRef` array and flushed to React state every 300ms, which prevents DOM thrashing during high-throughput scans. The table renderer caps at 1,000 rows to keep the UI responsive when scanning large ranges.

---

## License

MIT — see [LICENSE](LICENSE)

package main

import (
	"context"
	"fmt"
	"net"
	"sync"
	"sync/atomic"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx        context.Context
	cancelFunc context.CancelFunc
	mu         sync.Mutex
}

var knownServices = map[int]string{
	20:   "FTP-DATA",
	21:   "FTP",
	22:   "SSH",
	23:   "TELNET",
	25:   "SMTP",
	53:   "DNS",
	80:   "HTTP",
	110:  "POP3",
	111:  "RPCBind",
	135:  "MSRPC",
	139:  "NetBIOS",
	143:  "IMAP",
	443:  "HTTPS",
	445:  "SMB",
	993:  "IMAPS",
	995:  "POP3S",
	1723: "PPTP",
	3306: "MySQL",
	3389: "RDP",
	5432: "PostgreSQL",
	5900: "VNC",
	6379: "Redis",
	8080: "HTTP-Proxy",
	8443: "HTTPS-Alt",
}

func getService(port int) string {
	if svc, ok := knownServices[port]; ok {
		return svc
	}
	return "Unknown"
}

type PortResult struct {
	Port    int    `json:"Port"`
	Status  string `json:"Status"`
	Service string `json:"Service"`
	Banner  string `json:"Banner"`
}

type ScanProgress struct {
	Scanned int     `json:"Scanned"`
	Total   int     `json:"Total"`
	Speed   float64 `json:"Speed"`
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// StartScan initiates a port scan
func (a *App) StartScan(host string, startPort int, endPort int, timeoutMs int, workers int) string {
	scanCtx, cancel := context.WithCancel(a.ctx)
	a.mu.Lock()
	a.cancelFunc = cancel
	a.mu.Unlock()

	ports := make(chan int, workers)
	var wg sync.WaitGroup

	totalPorts := endPort - startPort + 1
	var scannedCount atomic.Int32

	// Progress updater
	go func() {
		startTime := time.Now()
		ticker := time.NewTicker(200 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-scanCtx.Done():
				return
			case <-ticker.C:
				scanned := int(scannedCount.Load())
				elapsed := time.Since(startTime).Seconds()
				var speed float64
				if elapsed > 0 {
					speed = float64(scanned) / elapsed
				}
				runtime.EventsEmit(a.ctx, "scan_progress", ScanProgress{
					Scanned: scanned,
					Total:   totalPorts,
					Speed:   speed,
				})
				if scanned >= totalPorts {
					return
				}
			}
		}
	}()

	// Start workers
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for port := range ports {
				select {
				case <-scanCtx.Done():
					return // Scan cancelled, exit worker
				default:
				}

				func() {
					defer scannedCount.Add(1)

					target := fmt.Sprintf("%s:%d", host, port)
					timeout := time.Duration(timeoutMs) * time.Millisecond

					conn, err := net.DialTimeout("tcp", target, timeout)
					if err != nil {
						// Check if it's a timeout error
						if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
							runtime.EventsEmit(a.ctx, "port_result", PortResult{
								Port:    port,
								Status:  "FILTERED",
								Service: getService(port),
								Banner:  "",
							})
						}
						// If connection refused, it's CLOSED, we just skip (don't emit)
						return
					}
					defer conn.Close()

					// Connection successful, it's OPEN
					conn.SetReadDeadline(time.Now().Add(timeout))
					buffer := make([]byte, 1024)
					n, _ := conn.Read(buffer) // Ignore read error, banner might just be empty

					banner := string(buffer[:n])

					runtime.EventsEmit(a.ctx, "port_result", PortResult{
						Port:    port,
						Status:  "OPEN",
						Service: getService(port),
						Banner:  banner,
					})
				}()
			}
		}()
	}

	// Send ports to workers
SendLoop:
	for port := startPort; port <= endPort; port++ {
		select {
		case <-scanCtx.Done():
			break SendLoop
		case ports <- port:
		}
	}
	close(ports)
	wg.Wait()
	
	if scanCtx.Err() != nil {
		runtime.EventsEmit(a.ctx, "scan_done", "cancelled")
		return "cancelled"
	} else {
		runtime.EventsEmit(a.ctx, "scan_done", "complete")
		return "done"
	}
}

// StartScanList initiates a port scan on a specific list of ports
func (a *App) StartScanList(host string, portsList []int, timeoutMs int, workers int) string {
	scanCtx, cancel := context.WithCancel(a.ctx)
	a.mu.Lock()
	a.cancelFunc = cancel
	a.mu.Unlock()

	ports := make(chan int, workers)
	var wg sync.WaitGroup

	totalPorts := len(portsList)
	var scannedCount atomic.Int32

	// Progress updater
	go func() {
		startTime := time.Now()
		ticker := time.NewTicker(200 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-scanCtx.Done():
				return
			case <-ticker.C:
				scanned := int(scannedCount.Load())
				elapsed := time.Since(startTime).Seconds()
				var speed float64
				if elapsed > 0 {
					speed = float64(scanned) / elapsed
				}
				runtime.EventsEmit(a.ctx, "scan_progress", ScanProgress{
					Scanned: scanned,
					Total:   totalPorts,
					Speed:   speed,
				})
				if scanned >= totalPorts {
					return
				}
			}
		}
	}()

	// Start workers
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for port := range ports {
				select {
				case <-scanCtx.Done():
					return // Scan cancelled, exit worker
				default:
				}

				func() {
					defer scannedCount.Add(1)

					target := fmt.Sprintf("%s:%d", host, port)
					timeout := time.Duration(timeoutMs) * time.Millisecond

					conn, err := net.DialTimeout("tcp", target, timeout)
					if err != nil {
						// Check if it's a timeout error
						if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
							runtime.EventsEmit(a.ctx, "port_result", PortResult{
								Port:    port,
								Status:  "FILTERED",
								Service: getService(port),
								Banner:  "",
							})
						}
						// If connection refused, it's CLOSED, we just skip (don't emit)
						return
					}
					defer conn.Close()

					// Connection successful, it's OPEN
					conn.SetReadDeadline(time.Now().Add(timeout))
					buffer := make([]byte, 1024)
					n, _ := conn.Read(buffer) // Ignore read error, banner might just be empty

					banner := string(buffer[:n])

					runtime.EventsEmit(a.ctx, "port_result", PortResult{
						Port:    port,
						Status:  "OPEN",
						Service: getService(port),
						Banner:  banner,
					})
				}()
			}
		}()
	}

	// Send ports to workers
SendLoop:
	for _, port := range portsList {
		select {
		case <-scanCtx.Done():
			break SendLoop
		case ports <- port:
		}
	}
	close(ports)
	wg.Wait()
	
	if scanCtx.Err() != nil {
		runtime.EventsEmit(a.ctx, "scan_done", "cancelled")
		return "cancelled"
	} else {
		runtime.EventsEmit(a.ctx, "scan_done", "complete")
		return "done"
	}
}

// CancelScan cancels the ongoing scan
func (a *App) CancelScan() {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.cancelFunc != nil {
		a.cancelFunc()
		a.cancelFunc = nil
	}
}

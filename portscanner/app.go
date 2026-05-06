package main

import (
	"context"
	"fmt"
	"net"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx        context.Context
	cancelFunc context.CancelFunc
}

type PortResult struct {
	Port   int    `json:"Port"`
	Status string `json:"Status"`
	Banner string `json:"Banner"`
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
	a.cancelFunc = cancel

	ports := make(chan int, workers)
	var wg sync.WaitGroup

	// Start workers
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for port := range ports {
				select {
				case <-scanCtx.Done():
					return // Scan cancelled
				default:
				}

				target := fmt.Sprintf("%s:%d", host, port)
				timeout := time.Duration(timeoutMs) * time.Millisecond

				conn, err := net.DialTimeout("tcp", target, timeout)
				if err != nil {
					// Check if it's a timeout error
					if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
						runtime.EventsEmit(a.ctx, "port_result", PortResult{
							Port:   port,
							Status: "FILTERED",
							Banner: "",
						})
					}
					// If connection refused, it's CLOSED, we just skip (don't emit)
					continue
				}

				// Connection successful, it's OPEN
				conn.SetReadDeadline(time.Now().Add(timeout))
				buffer := make([]byte, 1024)
				n, _ := conn.Read(buffer) // Ignore read error, banner might just be empty
				conn.Close()

				banner := string(buffer[:n])

				runtime.EventsEmit(a.ctx, "port_result", PortResult{
					Port:   port,
					Status: "OPEN",
					Banner: banner,
				})
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
	runtime.EventsEmit(a.ctx, "scan_done")

	return "done"
}

// StartScanList initiates a port scan on a specific list of ports
func (a *App) StartScanList(host string, portsList []int, timeoutMs int, workers int) string {
	scanCtx, cancel := context.WithCancel(a.ctx)
	a.cancelFunc = cancel

	ports := make(chan int, workers)
	var wg sync.WaitGroup

	// Start workers
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for port := range ports {
				select {
				case <-scanCtx.Done():
					return // Scan cancelled
				default:
				}

				target := fmt.Sprintf("%s:%d", host, port)
				timeout := time.Duration(timeoutMs) * time.Millisecond

				conn, err := net.DialTimeout("tcp", target, timeout)
				if err != nil {
					// Check if it's a timeout error
					if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
						runtime.EventsEmit(a.ctx, "port_result", PortResult{
							Port:   port,
							Status: "FILTERED",
							Banner: "",
						})
					}
					// If connection refused, it's CLOSED, we just skip (don't emit)
					continue
				}

				// Connection successful, it's OPEN
				conn.SetReadDeadline(time.Now().Add(timeout))
				buffer := make([]byte, 1024)
				n, _ := conn.Read(buffer) // Ignore read error, banner might just be empty
				conn.Close()

				banner := string(buffer[:n])

				runtime.EventsEmit(a.ctx, "port_result", PortResult{
					Port:   port,
					Status: "OPEN",
					Banner: banner,
				})
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
	runtime.EventsEmit(a.ctx, "scan_done")

	return "done"
}

// CancelScan cancels the ongoing scan
func (a *App) CancelScan() {
	if a.cancelFunc != nil {
		a.cancelFunc()
	}
}

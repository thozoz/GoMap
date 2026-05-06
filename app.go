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
	// FTP
	20:    "FTP-DATA",
	21:    "FTP",
	// Remote Access
	22:    "SSH",
	23:    "TELNET",
	3389:  "RDP",
	5900:  "VNC",
	5901:  "VNC-1",
	4899:  "Radmin",
	// Mail
	25:    "SMTP",
	110:   "POP3",
	143:   "IMAP",
	465:   "SMTPS",
	587:   "SMTP-Submission",
	993:   "IMAPS",
	995:   "POP3S",
	// Web
	80:    "HTTP",
	443:   "HTTPS",
	8080:  "HTTP-Proxy",
	8443:  "HTTPS-Alt",
	8000:  "HTTP-Alt",
	8008:  "HTTP-Alt",
	8081:  "HTTP-Alt",
	8888:  "HTTP-Alt",
	9000:  "HTTP-Alt",
	3000:  "HTTP-Dev",
	4000:  "HTTP-Dev",
	5000:  "HTTP-Dev",
	7000:  "HTTP-Dev",
	// DNS
	53:    "DNS",
	5353:  "mDNS",
	5355:  "LLMNR",
	// Databases
	1433:  "MSSQL",
	1434:  "MSSQL-Browser",
	3306:  "MySQL",
	5432:  "PostgreSQL",
	6379:  "Redis",
	27017: "MongoDB",
	27018: "MongoDB-Shard",
	5984:  "CouchDB",
	9200:  "Elasticsearch",
	9300:  "Elasticsearch-Cluster",
	7474:  "Neo4j",
	6432:  "PgBouncer",
	// Windows Networking
	135:   "MSRPC",
	137:   "NetBIOS-NS",
	138:   "NetBIOS-DGM",
	139:   "NetBIOS-SSN",
	445:   "SMB",
	593:   "HTTP-RPC",
	// LDAP / Directory
	389:   "LDAP",
	636:   "LDAPS",
	3268:  "GlobalCatalog",
	3269:  "GlobalCatalogSSL",
	// VPN / Tunneling
	1194:  "OpenVPN",
	1723:  "PPTP",
	500:   "IKE-VPN",
	4500:  "IPSec-NAT",
	1701:  "L2TP",
	// Messaging / Queues
	5672:  "AMQP",
	5671:  "AMQPS",
	15672: "RabbitMQ-Mgmt",
	9092:  "Kafka",
	61616: "ActiveMQ",
	// Monitoring
	161:   "SNMP",
	162:   "SNMP-Trap",
	2003:  "Graphite",
	4242:  "OpenTSDB",
	9090:  "Prometheus",
	3100:  "Grafana-Loki",
	// Other Services
	111:   "RPCBind",
	512:   "RExec",
	513:   "RLogin",
	514:   "RSyslog",
	873:   "Rsync",
	902:   "VMware",
	1080:  "SOCKS",
	1099:  "Java-RMI",
	2049:  "NFS",
	2181:  "ZooKeeper",
	2375:  "Docker",
	2376:  "Docker-TLS",
	2379:  "etcd",
	2380:  "etcd-peer",
	4848:  "GlassFish",
	6443:  "Kubernetes-API",
	8161:  "ActiveMQ-Web",
	8500:  "Consul",
	8600:  "Consul-DNS",
	9418:  "Git",
	10250: "Kubelet",
	10255: "Kubelet-RO",
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

type BannerResult struct {
	Port   int    `json:"Port"`
	Banner string `json:"Banner"`
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
func (a *App) StartScan(host string, startPort int, endPort int, timeoutMs int, workers int) (string, error) {
	// Pre-check host resolution
	if net.ParseIP(host) == nil {
		_, err := net.LookupHost(host)
		if err != nil {
			return "", fmt.Errorf("failed to resolve host: %v", err)
		}
	}

	scanCtx, cancel := context.WithCancel(a.ctx)
	defer cancel()
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
					runtime.EventsEmit(a.ctx, "port_result", PortResult{
						Port:    port,
						Status:  "OPEN",
						Service: getService(port),
						Banner:  "",
					})

					// Attempt to read banner non-blocking
					conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
					buffer := make([]byte, 1024)
					n, err := conn.Read(buffer)
					if err == nil && n > 0 {
						runtime.EventsEmit(a.ctx, "port_banner", BannerResult{
							Port:   port,
							Banner: string(buffer[:n]),
						})
					}
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
		return "cancelled", nil
	} else {
		runtime.EventsEmit(a.ctx, "scan_done", "complete")
		return "done", nil
	}
}

// StartScanList initiates a port scan on a specific list of ports
func (a *App) StartScanList(host string, portsList []int, timeoutMs int, workers int) (string, error) {
	// Pre-check host resolution
	if net.ParseIP(host) == nil {
		_, err := net.LookupHost(host)
		if err != nil {
			return "", fmt.Errorf("failed to resolve host: %v", err)
		}
	}

	scanCtx, cancel := context.WithCancel(a.ctx)
	defer cancel()
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
					runtime.EventsEmit(a.ctx, "port_result", PortResult{
						Port:    port,
						Status:  "OPEN",
						Service: getService(port),
						Banner:  "",
					})

					// Attempt to read banner non-blocking
					conn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
					buffer := make([]byte, 1024)
					n, err := conn.Read(buffer)
					if err == nil && n > 0 {
						runtime.EventsEmit(a.ctx, "port_banner", BannerResult{
							Port:   port,
							Banner: string(buffer[:n]),
						})
					}
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
		return "cancelled", nil
	} else {
		runtime.EventsEmit(a.ctx, "scan_done", "complete")
		return "done", nil
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

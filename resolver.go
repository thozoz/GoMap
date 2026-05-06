package main

import (
	"context"
	"crypto/tls"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/miekg/dns"
)

const resolveTimeout = 2 * time.Second

// resolveHostname runs all methods concurrently, returns the first result.
func resolveHostname(ctx context.Context, ip string) string {
	tctx, cancel := context.WithTimeout(ctx, resolveTimeout)
	defer cancel()

	resultCh := make(chan string, 7)
	launch := func(fn func(context.Context, string) string) {
		go func() {
			if name := fn(tctx, ip); name != "" {
				// Avoid returning raw Android randomized IDs or generic UPnP names if possible
				// We still return them if they're the only thing we got, but we yield briefly
				nameLower := strings.ToLower(name)
				isNumeric := len(name) > 15 && strings.TrimFunc(name, func(r rune) bool {
					return r >= '0' && r <= '9'
				}) == ""
				isGeneric := nameLower == "upnp igd" || nameLower == "internetgatewaydevice" || nameLower == "gateway" || nameLower == "router"

				if isNumeric || isGeneric {
					time.Sleep(500 * time.Millisecond) 
				}
				select {
				case resultCh <- name:
				default:
				}
			}
		}()
	}

	launch(dnsReverseLookup)
	launch(mdnsUnicastLookup)
	launch(mdnsUnicastBrowseLookup) // browse ALL .local names via unicast
	launch(llmnrLookup)
	launch(netbiosLookup)
	launch(tlsScrape)
	launch(ssdpScrape)

	select {
	case name := <-resultCh:
		return name
	case <-tctx.Done():
		return ""
	}
}

// ── DNS PTR ───────────────────────────────────────────────────────────────────

func dnsReverseLookup(ctx context.Context, ip string) string {
	names, err := net.DefaultResolver.LookupAddr(ctx, ip)
	if err != nil || len(names) == 0 {
		return ""
	}
	return strings.TrimSuffix(names[0], ".")
}

// ── UPnP SSDP Scraping ────────────────────────────────────────────────────────

// ssdpScrape sends an SSDP M-SEARCH to the target. If it replies with a Location
// XML URL (common for TVs, Chromecasts, printers, routers), we fetch it and
// extract the <friendlyName>.
func ssdpScrape(ctx context.Context, ip string) string {
	conn, err := net.DialTimeout("udp", ip+":1900", resolveTimeout/2)
	if err != nil {
		return ""
	}
	defer conn.Close()

	if deadline, ok := ctx.Deadline(); ok {
		conn.SetDeadline(deadline)
	}

	req := "M-SEARCH * HTTP/1.1\r\nHost: 239.255.255.250:1900\r\nMan: \"ssdp:discover\"\r\nMX: 1\r\nST: ssdp:all\r\n\r\n"
	if _, err := conn.Write([]byte(req)); err != nil {
		return ""
	}

	buf := make([]byte, 1024)
	n, err := conn.Read(buf)
	if err != nil {
		return ""
	}

	resp := string(buf[:n])
	var location string
	for _, line := range strings.Split(resp, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(strings.ToUpper(line), "LOCATION:") {
			location = strings.TrimSpace(line[9:])
			break
		}
	}

	if location == "" {
		return ""
	}

	httpReq, err := http.NewRequestWithContext(ctx, "GET", location, nil)
	if err != nil {
		return ""
	}

	client := &http.Client{}
	httpResp, err := client.Do(httpReq)
	if err != nil {
		return ""
	}
	defer httpResp.Body.Close()

	bodyBytes, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return ""
	}
	body := string(bodyBytes)

	start := strings.Index(body, "<friendlyName>")
	end := strings.Index(body, "</friendlyName>")
	if start != -1 && end != -1 && end > start+14 {
		return body[start+14 : end]
	}

	return ""
}

// ── TLS Scraping ──────────────────────────────────────────────────────────────

// tlsScrape attempts to connect to common HTTPS ports and extract the hostname
// from the server's SSL/TLS certificate (Common Name or SAN). This is highly
// effective for routers, hypervisors (Proxmox), and IoT hubs.
func tlsScrape(ctx context.Context, ip string) string {
	ports := []string{"443", "8443", "8006"}
	
	resultCh := make(chan string, len(ports))
	
	for _, port := range ports {
		go func(p string) {
			conf := &tls.Config{InsecureSkipVerify: true}
			dialer := &net.Dialer{Timeout: resolveTimeout / 2}
			conn, err := tls.DialWithDialer(dialer, "tcp", net.JoinHostPort(ip, p), conf)
			if err != nil {
				return
			}
			defer conn.Close()
			
			certs := conn.ConnectionState().PeerCertificates
			if len(certs) > 0 {
				cert := certs[0]
				// Prefer Subject Alternate Names (DNSNames)
				for _, name := range cert.DNSNames {
					if name != "" && name != ip && name != "localhost" {
						resultCh <- name
						return
					}
				}
				// Fallback to Common Name
				cn := cert.Subject.CommonName
				if cn != "" && cn != ip && cn != "localhost" {
					resultCh <- cn
					return
				}
			}
		}(port)
	}

	for i := 0; i < len(ports); i++ {
		select {
		case name := <-resultCh:
			return strings.TrimSuffix(name, ".")
		case <-ctx.Done():
			return ""
		}
	}
	return ""
}

// ── mDNS unicast PTR ──────────────────────────────────────────────────────────

// mdnsUnicastLookup queries the target's port 5353 directly for its PTR record.
// QU bit is set to enforce a unicast response back to our ephemeral port.
func mdnsUnicastLookup(ctx context.Context, ip string) string {
	arpa, err := dns.ReverseAddr(ip)
	if err != nil {
		return ""
	}
	m := new(dns.Msg)
	m.SetQuestion(arpa, dns.TypePTR)
	m.RecursionDesired = false
	if len(m.Question) > 0 {
		m.Question[0].Qclass |= 0x8000 // QU bit
	}

	return unicastDNSQuery(ctx, ip, ip+":5353", m)
}

// ── mDNS unicast Browse (ANY) ─────────────────────────────────────────────────

// mdnsUnicastBrowseLookup sends a local. ANY query directly to the target.
// Many phones/tablets don't register reverse PTRs, but will reply to this
// with their A records.
func mdnsUnicastBrowseLookup(ctx context.Context, ip string) string {
	m := new(dns.Msg)
	m.SetQuestion("local.", dns.TypeANY)
	m.RecursionDesired = false
	if len(m.Question) > 0 {
		m.Question[0].Qclass |= 0x8000 // QU bit
	}

	c := &dns.Client{
		Net:          "udp",
		DialTimeout:  resolveTimeout / 2,
		ReadTimeout:  resolveTimeout / 2,
		WriteTimeout: resolveTimeout / 2,
	}
	resp, _, err := c.ExchangeContext(ctx, m, ip+":5353")
	if err != nil || resp == nil {
		return ""
	}

	all := append(resp.Answer, resp.Extra...)
	for _, rr := range all {
		if a, ok := rr.(*dns.A); ok && a.A.String() == ip {
			return strings.TrimSuffix(a.Hdr.Name, ".")
		}
	}
	return ""
}

// ── LLMNR unicast PTR ─────────────────────────────────────────────────────────

// llmnrLookup queries the target's port 5355 directly for its PTR record.
// Works for Windows machines and Linux with systemd-resolved.
func llmnrLookup(ctx context.Context, ip string) string {
	arpa, err := dns.ReverseAddr(ip)
	if err != nil {
		return ""
	}
	m := new(dns.Msg)
	m.SetQuestion(arpa, dns.TypePTR)
	m.RecursionDesired = false

	return unicastDNSQuery(ctx, ip, ip+":5355", m)
}

// ── Shared Unicast DNS Helper ─────────────────────────────────────────────────

func unicastDNSQuery(ctx context.Context, ip, addr string, m *dns.Msg) string {
	perCall := resolveTimeout / 2
	c := &dns.Client{
		Net:          "udp",
		DialTimeout:  perCall,
		ReadTimeout:  perCall,
		WriteTimeout: perCall,
	}
	resp, _, err := c.ExchangeContext(ctx, m, addr)
	if err != nil || resp == nil {
		return ""
	}
	for _, ans := range resp.Answer {
		if ptr, ok := ans.(*dns.PTR); ok {
			return strings.TrimSuffix(ptr.Ptr, ".")
		}
	}
	return ""
}

// ── NetBIOS Node Status ───────────────────────────────────────────────────────

func netbiosLookup(ctx context.Context, ip string) string {
	conn, err := net.DialTimeout("udp", ip+":137", resolveTimeout/2)
	if err != nil {
		return ""
	}
	defer conn.Close()
	if deadline, ok := ctx.Deadline(); ok {
		conn.SetDeadline(deadline)
	}
	if _, err = conn.Write(nbnsStatusRequest()); err != nil {
		return ""
	}
	buf := make([]byte, 1024)
	n, err := conn.Read(buf)
	if err != nil || n < 12 {
		return ""
	}
	return parseNBNSResponse(buf[:n])
}

func nbnsStatusRequest() []byte {
	return []byte{
		0xA2, 0x48, 0x00, 0x00, 0x00, 0x01,
		0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
		0x20,
		0x43, 0x4B,
		0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
		0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
		0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
		0x41, 0x41, 0x41, 0x41, 0x41, 0x41,
		0x00, 0x00, 0x21, 0x00, 0x01,
	}
}

func parseNBNSResponse(buf []byte) string {
	if len(buf) < 12 {
		return ""
	}
	qdcount := int(buf[4])<<8 | int(buf[5])
	ancount := int(buf[6])<<8 | int(buf[7])
	if ancount == 0 {
		return ""
	}
	offset := 12
	if qdcount > 0 {
		offset += 38
	}
	if offset >= len(buf) {
		return ""
	}
	switch {
	case buf[offset] == 0xC0:
		offset += 2
	case buf[offset] == 0x20:
		offset += 34
	default:
		return ""
	}
	offset += 10
	if offset >= len(buf) {
		return ""
	}
	numNames := int(buf[offset])
	offset++
	if numNames == 0 || offset+numNames*18 > len(buf) {
		return ""
	}
	for i := 0; i < numNames; i++ {
		base := offset + i*18
		name := strings.TrimRight(string(buf[base:base+15]), " ")
		suffix := buf[base+15]
		flags := uint16(buf[base+16])<<8 | uint16(buf[base+17])
		if suffix == 0x00 && flags&0x8000 == 0 && name != "" {
			return name
		}
	}
	return ""
}

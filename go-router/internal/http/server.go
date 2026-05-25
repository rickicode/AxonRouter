package http

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"axonrouter/go-router/internal/config"
)

func NewServer(cfg config.Config) *http.Server {
	upstreamURL, err := url.Parse(cfg.UpstreamBaseURL)
	if err != nil {
		panic(fmt.Sprintf("invalid upstream base url %q: %v", cfg.UpstreamBaseURL, err))
	}

	proxy := httputil.NewSingleHostReverseProxy(upstreamURL)
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = upstreamURL.Host
		req.URL.Scheme = upstreamURL.Scheme
		req.URL.Host = upstreamURL.Host
		req.URL.Path = joinURLPath(upstreamURL.Path, req.URL.Path)
		req.URL.RawPath = req.URL.Path
		if req.Header.Get("x-forwarded-host") == "" && req.Host != "" {
			req.Header.Set("x-forwarded-host", req.Host)
		}
		req.Header.Set("x-axonrouter-go-router", "1")
	}
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("go-router upstream proxy error: %v", err)
		http.Error(w, fmt.Sprintf("upstream AxonRouter request failed: %v", err), http.StatusBadGateway)
	}
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Set("x-axonrouter-go-router", "1")
		return nil
	}
	proxy.Transport = &http.Transport{
		Proxy:                 http.ProxyFromEnvironment,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
	proxy.FlushInterval = 100 * time.Millisecond

	mux := http.NewServeMux()
	mux.HandleFunc("/health", handleHealth(cfg, upstreamURL, proxy.Transport))
	mux.Handle("/v1/models", proxy)
	mux.Handle("/v1/chat/completions", proxy)
	mux.Handle("/v1/responses", proxy)
	mux.Handle("/v1/messages", proxy)
	return &http.Server{
		Addr:              cfg.Addr(),
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
}

func handleHealth(cfg config.Config, upstreamURL *url.URL, transport http.RoundTripper) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		status := "ok"
		upstreamStatus := "ok"
		upstreamCode := http.StatusOK
		upstreamMessage := "reachable"

		healthURL := *upstreamURL
		healthURL.Path = joinURLPath(upstreamURL.Path, "/health")
		req, err := http.NewRequestWithContext(r.Context(), http.MethodGet, healthURL.String(), nil)
		if err != nil {
			status = "degraded"
			upstreamStatus = "error"
			upstreamCode = http.StatusBadGateway
			upstreamMessage = err.Error()
		} else {
			resp, probeErr := transport.RoundTrip(req)
			if probeErr != nil {
				status = "degraded"
				upstreamStatus = "error"
				upstreamCode = http.StatusBadGateway
				upstreamMessage = probeErr.Error()
			} else {
				upstreamCode = resp.StatusCode
				if resp.StatusCode < 200 || resp.StatusCode >= 300 {
					status = "degraded"
					upstreamStatus = "error"
					upstreamMessage = resp.Status
				}
				_, _ = io.Copy(io.Discard, resp.Body)
				_ = resp.Body.Close()
			}
		}

		writeJSON(w, map[string]any{
			"status":            status,
			"service":           "axonrouter-go-router",
			"listen_addr":       cfg.Addr(),
			"upstream_base_url": cfg.UpstreamBaseURL,
			"upstream": map[string]any{
				"status":  upstreamStatus,
				"code":    upstreamCode,
				"message": upstreamMessage,
			},
		})
	}
}

func joinURLPath(basePath, requestPath string) string {
	basePath = strings.TrimRight(basePath, "/")
	requestPath = "/" + strings.TrimLeft(requestPath, "/")
	if basePath == "" || basePath == "/" {
		return requestPath
	}
	return basePath + requestPath
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("content-type", "application/json")
	if err := json.NewEncoder(w).Encode(value); err != nil {
		http.Error(w, "failed to encode response", http.StatusInternalServerError)
	}
}

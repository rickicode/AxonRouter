package config

import (
	"flag"
	"fmt"
)

const defaultAppBaseURL = "http://127.0.0.1:12711"

type Config struct {
	Host            string
	Port            int
	UpstreamBaseURL string
}

// RegisterFlags registers config flags and returns a function that builds
// the Config. Call flag.Parse() before invoking the returned function.
func RegisterFlags() func() Config {
	host := flag.String("host", "127.0.0.1", "listen host")
	port := flag.Int("port", 12778, "listen port (1-65535)")
	upstreamBaseURL := flag.String("upstream-base-url", defaultAppBaseURL, "base URL of the main AxonRouter app server")
	return func() Config {
		if *port < 1 || *port > 65535 {
			panic(fmt.Sprintf("invalid port %d: must be between 1 and 65535", *port))
		}
		if *upstreamBaseURL == "" {
			panic("upstream-base-url must not be empty")
		}
		return Config{Host: *host, Port: *port, UpstreamBaseURL: *upstreamBaseURL}
	}
}

func (c Config) Addr() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

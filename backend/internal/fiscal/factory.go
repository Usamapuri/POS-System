package fiscal

import (
	"net/http"
	"strings"
	"time"
)

// NewFiscalizerForAuto returns mock or live strategy for background order sync.
func NewFiscalizerForAuto(cfg LoadedTaxConfig) Fiscalizer {
	if cfg.UseMockForAutoFiscalize() {
		return MockStrategy{}
	}
	return newLiveStrategy(cfg)
}

// NewFiscalizerForTestConnection always uses the requested authority with live HTTP (3s), not mock.
func NewFiscalizerForTestConnection(authority string, cfg LoadedTaxConfig) Fiscalizer {
	switch strings.ToUpper(strings.TrimSpace(authority)) {
	case AuthorityFBR:
		return &FBRStrategy{
			Token:  cfg.APIKeyPlain,
			POSID:  strings.TrimSpace(cfg.PosID),
			NTN:    strings.TrimSpace(cfg.NTN),
			STRN:   strings.TrimSpace(cfg.STRN),
			Client: client3s(),
		}
	case AuthorityPRA:
		pntn := strings.TrimSpace(cfg.PNTN)
		if pntn == "" {
			pntn = strings.TrimSpace(cfg.NTN)
		}
		proxy := strings.TrimSpace(cfg.SFDProxyURL)
		if proxy == "" {
			proxy = "http://localhost:16701"
		}
		return &PRAStrategy{
			ProxyBaseURL: proxy,
			TerminalID:   strings.TrimSpace(cfg.PosID),
			PNTN:         pntn,
			AccessCode:   cfg.APIKeyPlain,
			Client:       client3s(),
		}
	default:
		return MockStrategy{}
	}
}

func newLiveStrategy(cfg LoadedTaxConfig) Fiscalizer {
	c := client3s()
	switch strings.ToUpper(strings.TrimSpace(cfg.Authority)) {
	case AuthorityFBR:
		return &FBRStrategy{
			Token:  cfg.APIKeyPlain,
			POSID:  strings.TrimSpace(cfg.PosID),
			NTN:    strings.TrimSpace(cfg.NTN),
			STRN:   strings.TrimSpace(cfg.STRN),
			Client: c,
		}
	case AuthorityPRA:
		pntn := strings.TrimSpace(cfg.PNTN)
		if pntn == "" {
			pntn = strings.TrimSpace(cfg.NTN)
		}
		proxy := strings.TrimSpace(cfg.SFDProxyURL)
		if proxy == "" {
			proxy = "http://localhost:16701"
		}
		return &PRAStrategy{
			ProxyBaseURL: proxy,
			TerminalID:   strings.TrimSpace(cfg.PosID),
			PNTN:         pntn,
			AccessCode:   cfg.APIKeyPlain,
			Client:       c,
		}
	default:
		return MockStrategy{}
	}
}

func client3s() *http.Client {
	return &http.Client{Timeout: 3 * time.Second}
}

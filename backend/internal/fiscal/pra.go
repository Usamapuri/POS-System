package fiscal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// PRAStrategy posts to a local SFD HTTP proxy.
type PRAStrategy struct {
	ProxyBaseURL string
	TerminalID   string
	PNTN         string
	AccessCode   string
	Client       *http.Client
}

type praPostBody struct {
	TerminalID string  `json:"TerminalID"`
	PNTN       string  `json:"PNTN,omitempty"`
	BillAmt    float64 `json:"BillAmt"`
	TaxAmt     float64 `json:"TaxAmt"`
	USIN       string  `json:"USIN,omitempty"`
	BuyerName  string  `json:"BuyerName,omitempty"`
	OccurredAt string  `json:"DateTime,omitempty"`
}

func (s *PRAStrategy) Fiscalize(ctx context.Context, in FiscalOrderInput) (FiscalResult, error) {
	base := strings.TrimSuffix(strings.TrimSpace(s.ProxyBaseURL), "/")
	if base == "" {
		base = "http://localhost:16701"
		if b := os.Getenv("PRA_SFD_PROXY_URL"); b != "" {
			base = strings.TrimSuffix(strings.TrimSpace(b), "/")
		}
	}
	url := base + "/fiscal/sale"
	body := praPostBody{
		TerminalID: s.TerminalID,
		PNTN:       s.PNTN,
		BillAmt:    in.TotalAmount,
		TaxAmt:     in.TaxAmount,
		USIN:       in.USIN,
		BuyerName:  in.BuyerName,
		OccurredAt: in.OccurredAt.Format(time.RFC3339),
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return FiscalResult{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	if s.AccessCode != "" {
		req.Header.Set("Authorization", "Bearer "+s.AccessCode)
		req.Header.Set("X-Access-Code", s.AccessCode)
	}
	client := s.Client
	if client == nil {
		client = http.DefaultClient
	}
	resp, err := client.Do(req)
	if err != nil {
		return FiscalResult{}, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	irn, qr := parsePRAResponse(respBody)
	if resp.StatusCode >= 400 {
		return FiscalResult{
			Status:       StatusPending,
			Authority:    AuthorityPRA,
			ErrorMessage: fmt.Sprintf("http %d: %s", resp.StatusCode, string(respBody)),
			RawResponse:  string(respBody),
		}, nil
	}
	if irn == "" {
		irn = extractStringField(respBody, "IRN", "InvoiceRef", "RefNo", "InvoiceNo")
	}
	if qr == "" {
		qr = extractStringField(respBody, "QR", "QRCode", "QRData")
	}
	st := StatusSynced
	if irn == "" {
		st = StatusPending
	}
	return FiscalResult{
		Status:       st,
		IRN:          irn,
		QrCodeValue:  qr,
		Authority:    AuthorityPRA,
		RawResponse:  string(respBody),
		ErrorMessage: "",
	}, nil
}

func parsePRAResponse(b []byte) (irn, qr string) {
	var m map[string]interface{}
	if err := json.Unmarshal(b, &m); err != nil {
		return "", ""
	}
	irn = stringField(m, "IRN", "InvoiceNo", "RefNo")
	qr = stringField(m, "QR", "QRCode", "qr_code_value")
	return irn, qr
}

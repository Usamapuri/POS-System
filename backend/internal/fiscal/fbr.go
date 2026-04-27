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

const defaultFBRPostDataURL = "https://esp.fbr.gov.pk:8244/FBR/v1/api/Live/PostData"

// FBRStrategy posts to FBR Digital Invoicing API (shape may need alignment with latest FBR spec).
type FBRStrategy struct {
	Token   string
	POSID   string
	NTN     string
	STRN    string
	BaseURL string
	Client  *http.Client
}

type fbrPostBody struct {
	InvoiceNumber   string       `json:"InvoiceNumber"`
	POSID           string       `json:"POSID"`
	USIN            string       `json:"USIN"`
	DateTime        string       `json:"DateTime"`
	BuyerName       string       `json:"BuyerName"`
	TotalBillAmount float64      `json:"TotalBillAmount"`
	TotalTaxAmount  float64      `json:"TotalTaxAmount"`
	Items           []fbrItemRow `json:"Items"`
}

type fbrItemRow struct {
	ProductName    string  `json:"ProductName"`
	PCTCode        string  `json:"PCTCode"`
	Quantity       int     `json:"Quantity"`
	ValueBeforeTax float64 `json:"ValueBeforeTax"`
	SalesTaxAmount float64 `json:"SalesTaxAmount"`
}

func (s *FBRStrategy) Fiscalize(ctx context.Context, in FiscalOrderInput) (FiscalResult, error) {
	base := strings.TrimSpace(s.BaseURL)
	if base == "" {
		base = os.Getenv("FBR_POST_DATA_URL")
	}
	if base == "" {
		base = defaultFBRPostDataURL
	}
	items := make([]fbrItemRow, 0, len(in.Items))
	for _, it := range in.Items {
		items = append(items, fbrItemRow{
			ProductName:    it.Name,
			PCTCode:        it.PctCode,
			Quantity:       it.Quantity,
			ValueBeforeTax: it.ValueBeforeTax,
			SalesTaxAmount: it.AllocatedTax,
		})
	}
	if len(items) == 0 {
		items = append(items, fbrItemRow{
			ProductName:    "Sale",
			PCTCode:        "9801.7000",
			Quantity:       1,
			ValueBeforeTax: in.Subtotal - in.DiscountAmount,
			SalesTaxAmount: in.TaxAmount,
		})
	}
	body := fbrPostBody{
		InvoiceNumber:   in.OrderNumber,
		POSID:           s.POSID,
		USIN:            in.USIN,
		DateTime:        in.OccurredAt.Format(time.RFC3339),
		BuyerName:       in.BuyerName,
		TotalBillAmount: in.TotalAmount,
		TotalTaxAmount:  in.TaxAmount,
		Items:           items,
	}
	raw, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base, bytes.NewReader(raw))
	if err != nil {
		return FiscalResult{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	if s.Token != "" {
		req.Header.Set("Authorization", "Bearer "+strings.TrimSpace(s.Token))
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
	irn, qr := parseFBRResponse(respBody)
	if resp.StatusCode >= 400 {
		return FiscalResult{
			Status:       StatusPending,
			Authority:    AuthorityFBR,
			ErrorMessage: fmt.Sprintf("http %d: %s", resp.StatusCode, string(respBody)),
			RawResponse:  string(respBody),
		}, nil
	}
	if irn == "" {
		irn = extractStringField(respBody, "InvoiceNumber", "RefNo", "USIN")
	}
	if qr == "" {
		qr = extractStringField(respBody, "QRCode", "QR", "QrData")
	}
	st := StatusSynced
	if irn == "" {
		st = StatusPending
	}
	return FiscalResult{
		Status:       st,
		IRN:          irn,
		QrCodeValue:  qr,
		Authority:    AuthorityFBR,
		RawResponse:  string(respBody),
		ErrorMessage: "",
	}, nil
}

func parseFBRResponse(b []byte) (irn, qr string) {
	var m map[string]interface{}
	if err := json.Unmarshal(b, &m); err != nil {
		return "", ""
	}
	irn = stringField(m, "InvoiceRefNo", "IRN", "RefNo", "InvoiceNumber")
	qr = stringField(m, "QRCode", "QRCodeData", "QrData")
	return irn, qr
}

func stringField(m map[string]interface{}, keys ...string) string {
	for _, k := range keys {
		if v, ok := m[k]; ok && v != nil {
			switch t := v.(type) {
			case string:
				return t
			case float64:
				return fmt.Sprintf("%.0f", t)
			default:
				return fmt.Sprint(t)
			}
		}
	}
	return ""
}

func extractStringField(raw []byte, keys ...string) string {
	var m map[string]interface{}
	if json.Unmarshal(raw, &m) != nil {
		return ""
	}
	for _, k := range keys {
		if s := stringField(m, k); s != "" {
			return s
		}
	}
	return ""
}
